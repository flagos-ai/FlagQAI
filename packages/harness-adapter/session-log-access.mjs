// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
import { appendFileSync, closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, realpathSync, rmSync, } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

export function createSessionLogAccess({ sessionsRoots, loadUpstreamDecoder }) {
  // FlagQAI owns model-selected as durable route metadata. It is registered
  // alongside legacy types before restore so a continuation made without a new
  // prompt still resumes its selected route; it is never a fabricated request.
  /** Zstd frame magic number, little-endian (0xFD2FB528). */
  const ZSTD_MAGIC = 0xfd2fb528;
  /**
  * Session ids reach path.join() below from picker/channel callers, and
  * deleteSessionLog recursively removes the resolved parent directory — so
  * an id must be a single safe path segment. Real ids are UUIDs or
  * `session-<uuid>`; anything with separators, dots, or shell-y characters
  * is rejected outright (treated as "no such session").
  */
  function isSafeSessionId(sessionId) {
    return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(sessionId);
  }
  /**
  * Canonical session-log generation basename, mirroring upstream
  * dsh-session-format's `CANONICAL_LOG_FILENAME` (that package is not a
  * blessed import, so the rule is re-derived here): version zero keeps the
  * original `session.jsonl`; every later generation carries a lowercase
  * numeric `.vN` component (0.1.5 writes `session.v3.jsonl`). Noncanonical,
  * uppercase, leading-zero, and `.v0` names never identify committed
  * generations. A `.zstd` suffix marks the compressed encoding.
  */
  const GENERATION_LOG_NAME = /^session(?:\.v([1-9][0-9]*))?\.jsonl$/;
  function parseGenerationName(name) {
    const compressed = name.endsWith('.zstd');
    const match = GENERATION_LOG_NAME.exec(compressed ? name.slice(0, -'.zstd'.length) : name);
    if (match === null)
      return undefined;
    return { name, version: match[1] === undefined ? 0 : Number(match[1]), compressed };
  }
  /**
  * Pick the newest committed generation inside one session directory — the
  * backend's `resolveGenerationInDirectory` rule (highest format version
  * wins), with the compressed twin preferred on a tie (the stock default
  * encoding; a mixed-encoding directory is something the backend itself
  * refuses, so either tiebreak is honest for a read-only consumer).
  * @param dir - Absolute session directory (`<root>/<workspace>/<id>`).
  * @param compressedOnly - Restrict to zstd artifacts (the rename/delete
  *   caller's historical contract).
  */
  function selectGenerationLog(dir, compressedOnly) {
    let entries;
    try {
      entries = readdirSync(dir);
    }
    catch {
      return undefined;
    }
    let best;
    for (const name of entries) {
      const candidate = parseGenerationName(name);
      if (candidate === undefined)
        continue;
      if (compressedOnly && !candidate.compressed)
        continue;
      if (best === undefined ||
        candidate.version > best.version ||
        (candidate.version === best.version && candidate.compressed && !best.compressed)) {
        best = candidate;
      }
    }
    return best === undefined ? undefined : { path: join(dir, best.name), compressed: best.compressed };
  }
  /**
  * Locate a session's log by scanning workspace directories for the session
  * id — deliberately NOT replicating the persistence plugin's workspace-key
  * sanitization, so the helpers survive upstream key-scheme changes. Every
  * committed generation is considered; the newest wins (the backend migrates
  * historical artifacts by publishing a `session.vN` sibling and reading only
  * it, so the newest generation is always the authoritative one).
  * @param sessionId - Session id (directory name under each workspace dir).
  * @returns Absolute path of the selected log, or undefined when absent.
  */
  function findSessionLogFile(sessionId) {
    if (!isSafeSessionId(sessionId))
      return undefined;
    for (const root of sessionsRoots()) {
      let workspaces;
      try {
        workspaces = readdirSync(root);
      }
      catch {
        continue;
      }
      for (const ws of workspaces) {
        // Historical contract of this helper: the compressed artifact only
        // (the rename/delete/title-string paths predate plain-encoding logs).
        const selected = selectGenerationLog(join(root, ws, sessionId), true);
        if (selected !== undefined)
          return selected.path;
      }
    }
    return undefined;
  }
  let cachedDecoder;
  function decodeStorageRecord(value) {
    if (cachedDecoder === undefined) {
      cachedDecoder = loadUpstreamDecoder() ?? decodeStorageRecordLocal;
    }
    return cachedDecoder(value);
  }
  /* ------------------------------------------------------------------------- *\
  * Local port of the removed dsh-session chunk-rows decoder (0.1.2-rc.1 and
  * earlier, lib/types/chunk-rows.js). Storage rows are a durable-encoding
  * vocabulary, NOT session events: the packChunks writer folded each run of
  * same-block delta chunks into ONE `text-chunks`/`reasoning-chunks`/
  * `tool-call-chunks` line. Row-tagged values validate and expand (a malformed
  * row throws — it is corrupt storage, and treating it as an event would
  * silently drop a whole run); every other value passes through as a single
  * event, unvalidated.
  \* ------------------------------------------------------------------------- */
  function isRecordValue(value) {
    return typeof value === 'object' && value !== null;
  }
  /** Exact-key check: `value` has every key in `keys` and nothing else. */
  function hasExactKeys(value, keys) {
    return Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
  }
  /** The uniform malformed-row diagnostic. */
  function malformedRow(tag, why) {
    throw new Error(`malformed ${tag} storage row: ${why}`);
  }
  /** Validate the shared run-data fields and the payload/dt arity; returns the member payload. */
  function validateRunData(tag, data, payloadKey) {
    if (typeof data.turn !== 'number' || typeof data.step !== 'number' || typeof data.index !== 'number') {
      malformedRow(tag, 'turn/step/index must be numbers');
    }
    const payload = data[payloadKey];
    if (!Array.isArray(payload) || payload.length === 0 || payload.some(entry => typeof entry !== 'string')) {
      malformedRow(tag, `${payloadKey} must be a non-empty string array`);
    }
    const dt = data.dt;
    if (!Array.isArray(dt) || dt.some(gap => !Number.isSafeInteger(gap))) {
      malformedRow(tag, 'dt must be an array of safe integers');
    }
    if (dt.length !== payload.length - 1) {
      malformedRow(tag, `dt length ${dt.length} does not match ${payload.length} members`);
    }
    return payload;
  }
  /** Validate a row-tagged parsed value's envelope and data, throwing on any malformation. */
  function validateChunkRow(value, tag) {
    if (!hasExactKeys(value, ['type', 'seq0', 'time0', 'data'])) {
      malformedRow(tag, 'envelope must be exactly {type, seq0, time0, data}');
    }
    if (!Number.isSafeInteger(value['seq0']) || value['seq0'] < 0) {
      malformedRow(tag, 'seq0 must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(value['time0'])) {
      malformedRow(tag, 'time0 must be a safe integer');
    }
    const data = value['data'];
    if (!isRecordValue(data))
      malformedRow(tag, 'data must be an object');
    const row = data;
    let payload;
    if (tag === 'tool-call-chunks') {
      const withName = hasExactKeys(row, ['turn', 'step', 'index', 'id', 'name', 'dt', 'args']);
      if (!withName && !hasExactKeys(row, ['turn', 'step', 'index', 'id', 'dt', 'args'])) {
        malformedRow(tag, 'data must be exactly {turn, step, index, id, name?, dt, args}');
      }
      if (typeof row['id'] !== 'string' || (withName && typeof row['name'] !== 'string')) {
        malformedRow(tag, 'id (and name when present) must be strings');
      }
      payload = validateRunData(tag, row, 'args');
    }
    else {
      if (!hasExactKeys(row, ['turn', 'step', 'index', 'dt', 'texts'])) {
        malformedRow(tag, 'data must be exactly {turn, step, index, dt, texts}');
      }
      payload = validateRunData(tag, row, 'texts');
    }
    // Reconstruction bounds. The encoder only packs runs whose member seqs and
    // times are all safe integers, so a running value that leaves safe range is
    // outside any encoder's image: float arithmetic would round it to a
    // different number than exact arithmetic, a silent corruption. Within safe
    // range every step is exact, so the first departure is always caught.
    const seq0 = value['seq0'];
    if (!Number.isSafeInteger(seq0 + payload.length - 1)) {
      malformedRow(tag, 'member seqs must stay safe integers');
    }
    let time = value['time0'];
    for (const gap of row['dt']) {
      time += gap;
      if (!Number.isSafeInteger(time)) {
        malformedRow(tag, 'member times must stay safe integers');
      }
    }
    return { type: tag, seq0, time0: value['time0'], data: row };
  }
  /** Expand a validated row back into its exact original events, in order. */
  function expandChunkRow(row) {
    const members = row.type === 'tool-call-chunks' ? row.data.args : row.data.texts;
    const events = [];
    let time = row.time0;
    for (let k = 0; k < members.length; k++) {
      if (k > 0)
        time += row.data.dt[k - 1];
      let chunk;
      switch (row.type) {
        case 'text-chunks':
          chunk = { type: 'text-delta', index: row.data.index, text: members[k] };
          break;
        case 'reasoning-chunks':
          chunk = { type: 'reasoning-delta', index: row.data.index, text: members[k] };
          break;
        default:
          chunk = {
            type: 'tool-call-delta',
            index: row.data.index,
            id: row.data.id,
            ...(row.data.name !== undefined ? { name: row.data.name } : {}),
            argumentsDelta: members[k],
          };
          break;
      }
      // assistant/chunk is gone from the 0.1.5 SessionEvent union; the events
      // are reconstructed structurally for the legacy-log replay path.
      events.push({
        type: 'assistant/chunk',
        seq: row.seq0 + k,
        time,
        data: { turn: row.data.turn, step: row.data.step, chunk },
      });
    }
    return events;
  }
  /**
  * Structural twin of the removed upstream `decodeStorageRecord`: packed
  * chunk rows expand, everything else passes through as one event.
  */
  function decodeStorageRecordLocal(value) {
    if (!isRecordValue(value))
      return [value];
    const tag = value['type'];
    if (tag !== 'text-chunks' && tag !== 'reasoning-chunks' && tag !== 'tool-call-chunks') {
      return [value];
    }
    return expandChunkRow(validateChunkRow(value, tag));
  }
  /** I/O slice for streamed log reads. */
  const READ_CHUNK = 64 * 1024;
  /**
  * Compressed-size cap for a single zstd frame, checked DURING accumulation
  * (before any decompress attempt): a bare magic prefix followed by inert
  * bytes must bail instead of buffering unboundedly.
  */
  const MAX_FRAME_BYTES = 64 * 1024 * 1024;
  /**
  * Decompressed-size cap for a single frame: a tiny on-disk bomb must be
  * refused, not exploded into memory.
  */
  const MAX_FRAME_TEXT_BYTES = 64 * 1024 * 1024;
  /**
  * Dual-encoding sibling of {@link findSessionLogFile} for the bounded tree
  * reader: also accepts plain `session*.jsonl` artifacts (a
  * `compression:"none"` backend), which the rename/delete/title-string path
  * has no use for. Same multi-root scan, id whitelist, and newest-generation
  * selection; the compressed twin still wins a same-generation tie.
  * @param sessionId - Session id (directory name under each workspace dir).
  * @returns The log path and encoding, or undefined when absent.
  */
  function findSessionLogFileAnyEncoding(sessionId) {
    if (!isSafeSessionId(sessionId))
      return undefined;
    for (const root of sessionsRoots()) {
      let workspaces;
      try {
        workspaces = readdirSync(root);
      }
      catch {
        continue;
      }
      for (const ws of workspaces) {
        const selected = selectGenerationLog(join(root, ws, sessionId), false);
        if (selected !== undefined)
          return selected;
      }
    }
    return undefined;
  }
  /**
  * Yield a file's bytes in READ_CHUNK slices. Each yielded buffer is freshly
  * allocated, so consumers may hold frames/lines across yields.
  * @param fd - Open file descriptor (closed by the caller).
  * @yields Raw byte slices in file order.
  */
  function* fileChunks(fd) {
    for (;;) {
      const buf = Buffer.allocUnsafe(READ_CHUNK);
      const n = readSync(fd, buf, 0, READ_CHUNK, null);
      if (n === 0)
        return;
      yield buf.subarray(0, n);
    }
  }
  /**
  * Iterate the concatenated zstd frames of a log lazily, over byte chunks,
  * walking each frame's RFC 8878 structure instead of scanning for magic
  * bytes: magic (4) → frame header descriptor → window descriptor →
  * dictionary id → frame content size → data blocks (3-byte little-endian
  * header: last-block flag, block type, block size) until the last block →
  * optional 4-byte content checksum. Structure walking wins over a magic
  * scan twice over: a magic sequence inside a COMPRESSED payload no longer
  * mis-splits its frame, and the exact frame end is known — so a crash
  * mid-flush leaves a torn FINAL frame that is dropped like the plain
  * reader's unterminated tail line (uncommitted), keeping every committed
  * frame before it readable. Frame bytes accumulate as SEGMENTS (references
  * into the 64 KiB read chunks) with one concat per completed frame; the
  * MAX_FRAME_BYTES cap is checked on the running length, so it fires while
  * the frame is still being read, not after it is buffered. Throws when no
  * complete frame exists at all (not a zstd log / nothing committed), on
  * structural corruption (a reserved block type, non-magic bytes at a frame
  * boundary), or when one frame grows past MAX_FRAME_BYTES.
  * @param chunks - Raw file bytes, in order.
  * @yields Each frame's original compressed byte span, in log order.
  */
  function* zstdFrames(chunks) {
    const stream = chunks[Symbol.iterator]();
    let current = null;
    let pos = 0;
    const advance = () => {
      const next = stream.next();
      if (next.done === true) {
        current = null;
        return false;
      }
      current = next.value;
      pos = 0;
      return true;
    };
    let segments = [];
    let frameLength = 0;
    const append = (bytes) => {
      if (bytes.length === 0)
        return;
      segments.push(bytes);
      frameLength += bytes.length;
      if (frameLength > MAX_FRAME_BYTES) {
        throw new Error(`zstd frame exceeds the ${MAX_FRAME_BYTES}-byte browse cap`);
      }
    };
    /** Pull exactly n structural bytes (≤ 18, concatenating across chunk
    *  boundaries); fewer only at EOF. The bytes join the current frame. */
    const field = (n) => {
      const parts = [];
      let left = n;
      while (left > 0) {
        if (current === null && !advance())
          break;
        if (current === null || current.length === pos) {
          current = null;
          continue;
        }
        const take = Math.min(current.length - pos, left);
        parts.push(current.subarray(pos, pos + take));
        pos += take;
        left -= take;
      }
      const out = parts.length === 1 ? parts[0] : Buffer.concat(parts);
      append(out);
      return out;
    };
    /** Swallow exactly n payload bytes into the current frame, in per-chunk
    *  pieces (no concat — payloads can be megabytes). Returns the shortfall
    *  at EOF (0 when the payload was fully consumed). */
    const payload = (n) => {
      let left = n;
      while (left > 0) {
        if (current === null && !advance())
          return left;
        if (current === null || current.length === pos) {
          current = null;
          continue;
        }
        const take = Math.min(current.length - pos, left);
        append(current.subarray(pos, pos + take));
        pos += take;
        left -= take;
      }
      return 0;
    };
    // EOF partway through a frame is a torn write: committed frames already
    // yielded stay yielded, the partial frame is dropped. Before the FIRST
    // frame completes it instead means "nothing committed" — the old magic
    // scan threw in that case, and the contract is kept.
    let frames = 0;
    const torn = () => frames > 0;
    for (;;) {
      const magic = field(4);
      if (magic.length < 4) {
        // Clean EOF at a frame boundary, or a 1–3 byte torn tail.
        if (magic.length === 0 && frames === 0)
          throw new Error('no zstd frame found');
        if (!torn())
          throw new Error('no complete zstd frame found');
        return;
      }
      if (magic.readUInt32LE(0) !== ZSTD_MAGIC) {
        throw new Error('non-zstd bytes at a frame boundary');
      }
      const descriptor = field(1);
      if (descriptor.length < 1) {
        if (!torn())
          throw new Error('no complete zstd frame found');
        return;
      }
      const d = descriptor[0];
      const fcsFlag = d >>> 6;
      const singleSegment = (d & 0x20) !== 0;
      const hasChecksum = (d & 0x04) !== 0;
      // Dictionary_ID flag: 0/1/2/3 → 0/1/2/4 bytes.
      const dictIdBytes = (d & 0x03) === 3 ? 4 : d & 0x03;
      // Frame_Content_Size: flag 0 → 1 byte only for single-segment frames;
      // flags 1/2/3 → 2/4/8 bytes.
      const fcsBytes = fcsFlag === 0 ? (singleSegment ? 1 : 0) : fcsFlag === 1 ? 2 : fcsFlag === 2 ? 4 : 8;
      const headerBytes = (singleSegment ? 0 : 1) + dictIdBytes + fcsBytes;
      if (field(headerBytes).length < headerBytes) {
        if (!torn())
          throw new Error('no complete zstd frame found');
        return;
      }
      for (;;) {
        const blockHeader = field(3);
        if (blockHeader.length < 3) {
          if (!torn())
            throw new Error('no complete zstd frame found');
          return;
        }
        const packed = blockHeader[0] | (blockHeader[1] << 8) | (blockHeader[2] << 16);
        const lastBlock = (packed & 1) !== 0;
        const blockType = (packed >>> 1) & 0x03;
        if (blockType === 3)
          throw new Error('reserved zstd block type');
        // RLE blocks carry a single byte; raw/compressed carry Block_Size.
        if (payload(blockType === 1 ? 1 : packed >>> 3) > 0) {
          if (!torn())
            throw new Error('no complete zstd frame found');
          return;
        }
        if (lastBlock)
          break;
      }
      if (hasChecksum && field(4).length < 4) {
        if (!torn())
          throw new Error('no complete zstd frame found');
        return;
      }
      frames += 1;
      yield Buffer.concat(segments);
      segments = [];
      frameLength = 0;
    }
  }
  /**
  * Iterate the lines of a plain-text (compression:"none") log lazily. A
  * streaming UTF-8 decoder keeps multi-byte characters intact across read
  * chunks. An unterminated FINAL line is a torn write (a crash mid-append):
  * the backend's own reader ignores uncommitted records, and so does this
  * one — the tree must never show events persistence.load() would not
  * acknowledge.
  * @param chunks - Raw file bytes, in order.
  * @yields Each non-empty newline-terminated line's text, in log order.
  */
  function* plainLines(chunks) {
    const decoder = new TextDecoder('utf-8');
    let pending = '';
    for (const chunk of chunks) {
      pending += decoder.decode(chunk, { stream: true });
      let idx = pending.indexOf('\n');
      while (idx !== -1) {
        const line = pending.slice(0, idx);
        pending = pending.slice(idx + 1);
        if (line.length > 0)
          yield line;
        idx = pending.indexOf('\n');
      }
    }
    // `pending` here (plus any partial code point in the decoder) is the
    // unterminated torn tail — dropped, not yielded.
  }
  /**
  * Iterate the lines of a decoded zstd frame lazily: lines are located by
  * indexOf as the consumer pulls, so a reader stopping at its event budget
  * never allocates the frame's remaining line strings (a single flush can be
  * many MB of text). A COMPLETE frame must end newline-terminated — the
  * backend flushes whole frames, so an unterminated tail line inside one is
  * corruption (the strict backend rejects it too), never a torn write. The
  * check runs UP FRONT, before the first line is yielded: a budget-limited
  * reader returning early must not skip it and misjudge a corrupt frame as
  * merely truncated.
  * @param text - The frame's full decoded text.
  * @yields Each non-empty line's text, in order. Throws on a torn frame.
  */
  function* frameLines(text) {
    if (text.length > 0 && !text.endsWith('\n')) {
      throw new Error('unterminated record inside a zstd frame');
    }
    let pos = 0;
    for (;;) {
      const nl = text.indexOf('\n', pos);
      if (nl === -1)
        return;
      if (nl > pos)
        yield text.slice(pos, nl);
      pos = nl + 1;
    }
  }
  /**
  * Parse one log's storage records (one JSON value per line) lazily, in log
  * order, from whichever on-disk encoding was located. Decompression and
  * parsing happen per frame/line as the consumer pulls, so stopping early
  * (event budget reached) stops the I/O too — with one honest exception: a
  * zstd FRAME is the atomic unit. The next magic (or EOF) delimits it and the
  * whole frame is decompressed and stringified before its first line exists,
  * so a single giant flush (a big seed write, a batched append) costs its
  * full frame size in time and memory regardless of the budget. The budget
  * bounds ACROSS frames; within one frame it only stops line splitting and
  * JSON parsing early.
  * @param fd - Open file descriptor of the log.
  * @param compressed - Whether the log is zstd-framed (vs plain jsonl text).
  * @yields Each line's JSON.parse result, unvalidated.
  */
  function* logRecords(fd, compressed) {
    if (compressed) {
      for (const frame of zstdFrames(fileChunks(fd))) {
        // maxOutputLength is the REAL resource bound: repetitive chunk deltas
        // compress ~56×, so the compressed-byte cap alone says nothing about
        // the text a frame inflates into. Over the limit zstd throws — the
        // log degrades to unreadable rather than ballooning the TUI's RSS.
        const text = zstdDecompressSync(frame, { maxOutputLength: MAX_FRAME_TEXT_BYTES }).toString('utf8');
        for (const line of frameLines(text)) {
          yield JSON.parse(line);
        }
      }
    }
    else {
      for (const line of plainLines(fileChunks(fd))) {
        yield JSON.parse(line);
      }
    }
  }
  /**
  * Sniff a located artifact's encoding from its first bytes: zstd framing
  * declares itself with the magic number; anything else is plain JSONL text.
  * @param path - Candidate log path (must exist).
  * @returns The path with its detected encoding, or undefined when unreadable.
  */
  function sniffLogFile(path) {
    let fd;
    try {
      fd = openSync(path, 'r');
      const head = Buffer.alloc(4);
      const n = readSync(fd, head, 0, 4, 0);
      return { path, compressed: n === 4 && head.readUInt32LE(0) === ZSTD_MAGIC };
    }
    catch {
      return undefined;
    }
    finally {
      if (fd !== undefined) {
        try {
          closeSync(fd);
        }
        catch {
          // A close failure leaves nothing actionable.
        }
      }
    }
  }
  /**
  * Resolve a `persistence.locate()` hint to a readable log. The hint may name
  * the physical artifact directly or the backend's LOGICAL name for it (the
  * jsonl backend's raw-artifact filename carries no encoding suffix), so the
  * compressed twin is probed as well. Since 0.1.5 the hint names the CURRENT
  * generation (`session.vN.jsonl[.zstd]`) without touching the filesystem —
  * for a session never opened since its format was superseded that file does
  * not exist yet, and the authoritative artifact is an older-generation
  * sibling in the same directory. Encoding is sniffed from content, never
  * inferred from the extension.
  * @param hint - Absolute path from SessionPersistence.locate().
  * @returns The readable log, or undefined when nothing materialized there.
  */
  function resolveLocatedPath(hint) {
    const direct = existsSync(hint) ? sniffLogFile(hint) : undefined;
    if (direct !== undefined)
      return direct;
    const twin = `${hint}.zstd`;
    if (existsSync(twin))
      return { path: twin, compressed: true };
    // Generation fallback: only when the hint itself is a canonical
    // generation name — a foreign backend's logical name must not steer a
    // directory scan. The scan stays inside the backend's own session
    // directory, so locate's authority over root and workspace key is kept.
    const base = hint.slice(hint.lastIndexOf(sep) + 1);
    const withoutSuffix = base.endsWith('.zstd') ? base.slice(0, -'.zstd'.length) : base;
    if (!GENERATION_LOG_NAME.test(withoutSuffix))
      return undefined;
    return selectGenerationLog(dirname(hint), false);
  }
  /**
  * Shared bounded read loop over a located log. See readSessionEventsFromLog
  * for the contract; this is the file-level entry for backend-resolved paths.
  * Returns undefined ONLY when the log vanished between the location scan and
  * the open — every other failure lands in {@link SessionLogRead.failed}.
  */
  function readEvents(file, maxEvents, maxScanned, skipBelowSeq) {
    let fd;
    try {
      fd = openSync(file.path, 'r');
    }
    catch {
      return undefined;
    }
    let scanned = 0;
    let formatVersion;
    const events = [];
    const result = (complete, failed) => ({ events, complete, scanned, formatVersion, ...(failed ? { failed } : {}) });
    try {
      for (const record of logRecords(fd, file.compressed)) {
        if (scanned === 0 && isRecordValue(record) && record['type'] === 'session' && Number.isSafeInteger(record['version'])) {
          formatVersion = record['version'];
        }
        for (const event of decodeStorageRecord(record)) {
          // The SCAN budget bounds the real cost drivers — I/O, decompression,
          // JSON.parse — which are paid for EVERY envelope, collected or not.
          // Without it, a log carrying hundreds of thousands of skipped rows
          // (ignorable-marked activity frames) forces a full parse just
          // to collect a handful of events, blocking the TUI on panel open.
          scanned += 1;
          if (scanned > maxScanned)
            return result(false);
          const envelope = event;
          if (typeof envelope['seq'] !== 'number' || envelope['ignorable'] === true)
            continue;
          // Inherited-prefix skip (session-tree dedup): seqs an ancestor
          // already shows are not collected. They still cost the scan budget
          // (their bytes were read and parsed), but NOT the event budget — a
          // fork of a huge parent is charged only for its OWN events, so two
          // small forks of a 70k-event parent both stay visible. Titles still
          // collect below the cutoff: branch-head labels need them and they
          // never extract into entries.
          if (envelope['seq'] < skipBelowSeq && envelope['type'] !== 'session/title')
            continue;
          // Budget check BEFORE the push: an exact-fit log reports complete,
          // and only a surviving (maxEvents+1)-th event marks truncation.
          if (events.length >= maxEvents)
            return result(false);
          events.push(event);
        }
      }
      return result(true);
    }
    catch {
      // An EXISTING but undecodable log (corruption, over-cap frame, decode
      // bomb): fail closed — never silently empty, never eligible for an
      // unbounded fallback re-read.
      return result(false, true);
    }
    finally {
      try {
        closeSync(fd);
      }
      catch {
        // A close failure leaves nothing actionable — the read already ended.
      }
    }
  }
  /**
  * Default scan budget derived from the event budget: 4× headroom over the
  * collectible events (legitimate logs interleave a modest share of skipped
  * rows — headers, repair-marked ignorable frames), plus a floor so even a
  * tiny `maxEvents` tolerates a noisy prefix. Unbounded reads stay unbounded.
  */
  function defaultMaxScanned(maxEvents) {
    return Number.isFinite(maxEvents) ? maxEvents * 4 + 4096 : Number.POSITIVE_INFINITY;
  }
  /**
  * File-level sibling of {@link readSessionEventsFromLog} for paths resolved
  * by the backend itself (`persistence.locate`) — covers a custom-configured
  * root that none of the stock sessionsRoots() candidates describes.
  * @param path - Absolute artifact path (physical or logical name).
  * @param maxEvents - Stop before collecting more than this many events.
  * @param maxScanned - Stop after INSPECTING this many envelopes, collected
  *   or skipped (default: {@link defaultMaxScanned} of maxEvents).
  * @param skipBelowSeq - Inherited-prefix cutoff (session-tree dedup):
  *   seq'd events below it are skipped without spending the event budget —
  *   they still count against maxScanned. `session/title` events are always
  *   collected (branch-head labels need them; they never become entries).
  * @returns The read outcome, or undefined ONLY when nothing materialized at
  *   the path — an existing-but-undecodable log reports `failed: true`.
  */
  function readSessionEventsFromFile(path, maxEvents = Number.POSITIVE_INFINITY, maxScanned = defaultMaxScanned(maxEvents), skipBelowSeq = 0) {
    const file = resolveLocatedPath(path);
    if (file === undefined)
      return undefined;
    return readEvents(file, maxEvents, maxScanned, skipBelowSeq);
  }
  /**
  * Read a session's events from its persisted log — tolerant, read-only, and
  * cost-bounded. Built for the session tree (buildSessionTree), whose browse
  * must satisfy three constraints the strict backend read cannot:
  *
  *  - READ-ONLY: the strict backend read (`persistence.inspect` on pre-0.1.5
  *    hosts, the validated `handle.read` path since) rejects logs carrying
  *    third-party event types (working-activity's `activity/status`), and
  *    the resume seam's answer (in-process type registration, issue #153)
  *    must not be inverted here: opening a picker never rewrites a history
  *    log. This reader never writes; unknown types are simply passed through
  *    (extractEntries skips what it does not know).
  *  - TOLERANT: envelope-shape or decode anomalies degrade to
  *    `failed: true` (a structure-only tree node) instead of rejecting the
  *    whole log — and a torn FINAL zstd frame (crash mid-flush) is dropped
  *    as uncommitted, keeping the frames before it readable.
  *  - BOUNDED: the file is read in 64 KiB slices and frames decode lazily,
  *    stopping the moment `maxEvents` events have been collected — a
  *    200k-event log costs budget × per-event work, not a whole-file read +
  *    decompress + parse. `complete: false` marks the early stop (the caller
  *    surfaces it as `truncated`). One honest exception: a single zstd FRAME
  *    is the atomic unit (see logRecords) — the budget bounds work ACROSS
  *    frames, never inside one giant flush.
  *
  * Packed rows are expanded with the backend's own `decodeStorageRecord`:
  * the packChunks writer folds each run of same-block delta chunks into ONE
  * `text-chunks`/`reasoning-chunks`/`tool-call-chunks` line (the default —
  * the finding that motivated this reader's third revision), so a line is a
  * storage record, not an event, and seq-less rows must not be dropped as if
  * they were headers. The budget counts EXPANDED events, matching the tree's
  * per-event cost. Malformed packed rows throw inside decodeStorageRecord —
  * corrupt storage degrades to `undefined`, never to silently dropped runs.
  *
  * Torn-tail semantics mirror the backend's own reader: a plain log's
  * unterminated final line (crash mid-append) is uncommitted data and
  * ignored, while an unterminated record INSIDE a complete zstd frame is
  * corruption and fails the read.
  *
  * Envelopes with `ignorable: true` are skipped (the read path's own skip
  * signal) and the seq-less header row is metadata, not an event. Skipped
  * envelopes still count against the SCAN budget (maxScanned): skipping is
  * not free — the I/O, decompress and JSON.parse for them have already been
  * paid — so an ignorable-heavy log cannot bypass the cost bound by keeping
  * its collectible count low. Never throws; returns undefined ONLY when the
  * log is absent — an existing-but-undecodable log returns `failed: true`
  * so the caller degrades to a placeholder instead of escalating to an
  * unbounded strict re-read.
  * @param sessionId - Session whose log should be read.
  * @param maxEvents - Stop before collecting more than this many events
  *   (default: unbounded). 0 collects nothing and reports complete: false
  *   whenever the log holds any collectible event.
  * @param maxScanned - Stop after INSPECTING this many envelopes, collected
  *   or skipped (default: 4× maxEvents + 4096; unbounded when maxEvents is).
  * @param skipBelowSeq - Inherited-prefix cutoff (session-tree dedup):
  *   seq'd events below it are skipped without spending the event budget —
  *   they still count against maxScanned. `session/title` events are always
  *   collected (branch-head labels need them; they never become entries).
  * @returns The read outcome — events, completeness, real scan cost, and a
  *   `failed` marker for safety-cap/corruption bailouts.
  */
  function readSessionEventsFromLog(sessionId, maxEvents = Number.POSITIVE_INFINITY, maxScanned = defaultMaxScanned(maxEvents), skipBelowSeq = 0) {
    const file = findSessionLogFileAnyEncoding(sessionId);
    if (file === undefined)
      return undefined;
    return readEvents(file, maxEvents, maxScanned, skipBelowSeq);
  }
  function seedLengthOfPhysicalHeader(record) {
    if (record === null || typeof record !== 'object' || Array.isArray(record))
      return undefined;
    const rec = record;
    if (rec['type'] !== 'session')
      return undefined;
    const seed = rec['seedLength'];
    if (typeof seed === 'number' && Number.isSafeInteger(seed) && seed >= 0 && !Object.is(seed, -0))
      return seed;
    return undefined;
  }
  /** The header's `isSeeded` flag (V2/V3 headers carry it instead of `seedLength`). */
  function isSeededPhysicalHeader(record) {
    if (record === null || typeof record !== 'object' || Array.isArray(record))
      return false;
    const rec = record;
    return rec['type'] === 'session' && rec['isSeeded'] === true;
  }
  /**
  * The inherited cut recorded by a `session/end-seed` marker: seq of the last
  * marker whose data carries `inherited: true` (the V2/V3 contract — the
  * marker closes the inherited prefix, so its seq IS the prefix length).
  */
  function inheritedMarkerCut(record) {
    if (record === null || typeof record !== 'object' || Array.isArray(record))
      return undefined;
    const rec = record;
    if (rec['type'] !== 'session/end-seed')
      return undefined;
    const data = rec['data'];
    if (data === null || typeof data !== 'object' || data['inherited'] !== true) {
      return undefined;
    }
    const seq = rec['seq'];
    if (typeof seq === 'number' && Number.isSafeInteger(seq) && seq >= 0 && !Object.is(seq, -0))
      return seq;
    return undefined;
  }
  /**
  * Envelope ceiling for the seeded-header marker scan: a fork's marker closes
  * its inherited prefix, but earlier markers can belong to an ancestor. Scan
  * the log to find the last one, bounded so a huge log degrades to "cut unknown"
  * (the tree detaches the parent edge) instead of an unbounded read.
  */
  const INHERITED_CUT_SCAN_LIMIT = 2_000_000;
  /**
  * Read the exact inherited-prefix length from a log. Pre-V2 physical headers
  * carry it as `seedLength` on the first line; V2/V3 headers only have
  * `isSeeded`, and the cut is the seq of the `session/end-seed` marker event
  * stamped with `inherited: true` — scanned for, bounded, only when the
  * header says the session is seeded. Logical list headers never carry the
  * cut on any generation. Never guesses from snapshot length, and an
  * unseeded or marker-less log reports undefined (no cut to report).
  */
  function readPhysicalHeaderSeedLength(path) {
    const file = resolveLocatedPath(path);
    if (file === undefined)
      return undefined;
    let fd;
    try {
      fd = openSync(file.path, 'r');
      let first = true;
      let seeded = false;
      let scanned = 0;
      let inheritedCut;
      for (const record of logRecords(fd, file.compressed)) {
        if (first) {
          first = false;
          const seed = seedLengthOfPhysicalHeader(record);
          if (seed !== undefined)
            return seed;
          if (!isSeededPhysicalHeader(record))
            return undefined;
          seeded = true;
          continue;
        }
        if (!seeded)
          return undefined;
        scanned += 1;
        if (scanned > INHERITED_CUT_SCAN_LIMIT)
          return undefined;
        const cut = inheritedMarkerCut(record);
        if (cut !== undefined)
          inheritedCut = cut;
      }
      return inheritedCut;
    }
    catch {
      return undefined;
    }
    finally {
      if (fd !== undefined) {
        try {
          closeSync(fd);
        }
        catch {
          // A close failure leaves nothing actionable.
        }
      }
    }
  }
  /** Locate a session log by id and read its inherited-prefix cut. */
  function readPhysicalHeaderSeedLengthForSession(sessionId) {
    const file = findSessionLogFileAnyEncoding(sessionId);
    if (file === undefined)
      return undefined;
    return readPhysicalHeaderSeedLength(file.path);
  }
  /**
  * Decode a (possibly multi-frame) zstd jsonl log. Frames are split by magic
  * scan; any frame failing to decode or any line failing to parse throws, so
  * callers abort instead of acting on a log they did not fully understand.
  * @param buf - Raw file bytes.
  * @returns Parsed event envelopes, in log order.
  */
  function decodeEvents(buf) {
    const offsets = [];
    for (let i = 0; i + 4 <= buf.length; i++) {
      if (buf.readUInt32LE(i) === ZSTD_MAGIC)
        offsets.push(i);
    }
    if (offsets.length === 0)
      throw new Error('no zstd frame found');
    return offsets.flatMap((start, i) => {
      const end = i + 1 < offsets.length ? offsets[i + 1] : buf.length;
      const text = zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
      return text
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => {
        const parsed = JSON.parse(line);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('session log line is not an event envelope');
        }
        return parsed;
      });
    });
  }
  /**
  * Read a session's display title from its persisted log, tolerantly.
  *
  * Why not `persistence.load()`: the backend validates every event against
  * KNOWN_SESSION_EVENT_TYPES and throws the WHOLE load when a third-party
  * plugin wrote an unmarked unknown type. A picker label is
  * read-only UI state: decoding frames directly here keeps titles working
  * for logs the strict path refuses, now and for future plugin event types.
  *
  * Title precedence: the LAST `session/title` event wins (a /rename append
  * overrides the first-prompt auto title), falling back to the first user
  * message text. `hasUserMessage` drives the picker's launch-artifact filter.
  * @param sessionId - Session whose log should be read.
  * @returns The title info, or undefined when the log is absent/undecodable.
  */
  function readSessionTitleFromLog(sessionId) {
    try {
      const file = findSessionLogFile(sessionId);
      if (file === undefined)
        return undefined;
      const events = decodeEvents(readFileSync(file));
      let titled;
      let firstUser;
      let hasUserMessage = false;
      for (const event of events) {
        if (event['type'] === 'session/title') {
          const title = event['data']?.['title'];
          if (typeof title === 'string' && title.trim().length > 0)
            titled = title;
        }
        else if (event['type'] === 'user/message') {
          hasUserMessage = true;
          if (firstUser === undefined) {
            firstUser = firstTextOfContent(event['data']?.['content']);
          }
        }
      }
      return { title: titled ?? firstUser, hasUserMessage };
    }
    catch {
      return undefined;
    }
  }
  /**
  * Extract the first text block from a user/message `content` payload.
  * Content is normally a block array; a bare string is accepted defensively.
  * @param content - The event's content field.
  * @returns The trimmed text, or undefined when no text block exists.
  */
  function firstTextOfContent(content) {
    if (typeof content === 'string')
      return content.trim() || undefined;
    if (!Array.isArray(content))
      return undefined;
    for (const block of content) {
      if (block !== null &&
        typeof block === 'object' &&
        block.type === 'text' &&
        typeof block.text === 'string') {
        const text = (block.text).trim();
        if (text.length > 0)
          return text;
      }
    }
    return undefined;
  }
  /**
  * Payload of an explicit user rename — the shape upstream
  * `SessionTitleService.rename()` writes. The strict reader requires BOTH
  * fields on every `session/title` event: `messageSeqs` must be an array, and
  * empty exactly when the user supplied the title (`source.kind === 'user'`).
  * A `{ title }`-only payload makes the whole log unopenable
  * (`title messageSeqs requires an array`, issue #1006). The live `/rename`
  * and this module's offline append share this builder so the two writers
  * cannot drift apart again.
  * @param title - New display title (already trimmed by the caller).
  */
  function userTitleData(title) {
    return { title, messageSeqs: [], source: { kind: 'user' } };
  }
  /**
  * Append a `session/title` event to a persisted session's log — the
  * `/resume` picker rename for a NON-LIVE session (the live one goes through
  * `session.append` in the channel). The backend flushes by appending zstd
  * frames, so the new event lands as one more frame: existing bytes stay
  * untouched (the frame-0 header invariant holds), and `last title wins` in
  * {@link readSessionTitleFromLog} surfaces the new name. The seq continues
  * the log's contiguity contract (seq = event count) by taking maxSeq + 1.
  * The frame is APPEND-ONLY (O_APPEND), matching the backend's own flush
  * discipline: this store is shared with dsh web (#24), and a
  * read-concat-rewrite (tmp + rename) would silently drop a frame another
  * writer lands between our read and replace. A single append never rewrites
  * existing bytes, so concurrent frames all survive; the worst remaining
  * race is a duplicate seq when the maxSeq read above passes another
  * appender — benign next to lost frames, since last-title-wins keeps the
  * rename semantics. Never throws.
  * @param sessionId - Session to rename.
  * @param title - New display title (already trimmed by the caller).
  * @returns 'appended', or 'unavailable' when the log is absent/undecodable.
  */
  function appendSessionTitle(sessionId, title) {
    try {
      const file = findSessionLogFile(sessionId);
      if (file === undefined)
        return 'unavailable';
      const events = decodeEvents(readFileSync(file));
      let maxSeq = -1;
      for (const event of events) {
        const seq = event['seq'];
        if (typeof seq === 'number' && seq > maxSeq)
          maxSeq = seq;
      }
      // Same payload a manual /rename appends ({@link userTitleData}); the
      // strict reader validates the SHAPE of every event, not just the
      // envelope keys the seed validator asks for.
      const event = {
        type: 'session/title',
        seq: maxSeq + 1,
        time: Date.now(),
        data: userTitleData(title),
      };
      const frame = zstdCompressSync(Buffer.from(JSON.stringify(event) + '\n', 'utf8'));
      appendFileSync(file, frame);
      return 'appended';
    }
    catch {
      return 'unavailable';
    }
  }
  /**
  * Delete a persisted session's log directory (`<root>/<workspace>/<id>/`),
  * the `/resume` picker delete. The directory holds only session.jsonl.zstd
  * today; removing it whole keeps future sidecar files from orphaning. The
  * backend's list() materializes entries from these logs, so the session
  * drops out of the picker on the next refresh. Never throws.
  * @param sessionId - Session to delete (must not be the live session).
  * @returns 'deleted', or 'unavailable' when the log is absent.
  */
  function deleteSessionLog(sessionId) {
    try {
      const file = findSessionLogFile(sessionId);
      if (file === undefined)
        return 'unavailable';
      const dir = dirname(file);
      // Containment must hold after resolving symlinks, not just lexically:
      // a symlinked workspace directory (<root>/<ws -> /outside>/<id>) would
      // steer the recursive rm outside the sessions root even with a clean
      // whitelisted id. realpath BOTH sides — the root itself may legitimately
      // live behind a symlink (macOS /tmp -> /private/tmp).
      const realDir = realpathSync(dir);
      const contained = sessionsRoots().some(root => {
        try {
          return realDir.startsWith(realpathSync(root) + sep);
        }
        catch {
          return false;
        }
      });
      if (!contained)
        return 'unavailable';
      rmSync(dir, { recursive: true, force: true });
      return 'deleted';
    }
    catch {
      return 'unavailable';
    }
  }
  return { findSessionLogFile, resolveLocatedPath, defaultMaxScanned, readSessionEventsFromFile, readSessionEventsFromLog, readPhysicalHeaderSeedLength, readPhysicalHeaderSeedLengthForSession, readSessionTitleFromLog, userTitleData, appendSessionTitle, deleteSessionLog };
}
