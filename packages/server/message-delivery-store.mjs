import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const digest = (value) => createHash("sha256").update(value).digest("hex");

export function messageDeliveryStore(directory, session) {
  const root = join(directory, digest(JSON.stringify([
    session.ref.backendId, session.ref.sessionId, session.cwd,
  ])));
  const recordPath = (id) => join(root, digest(id) + ".json");
  const marker = join(root, "tracked");
  async function read(path) {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    }
  }
  return {
    async initialize() {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await writeFile(marker, "", { mode: 0o600, flush: true });
    },
    async get(id) {
      const record = await read(recordPath(id));
      if (record === undefined) return undefined;
      const entry = JSON.parse(record);
      // A partial admission left by a crash must never look like an absent ID
      // or a definite refusal. Fail closed rather than admit it a second time.
      if (!entry || typeof entry.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(entry.fingerprint)
        || (entry.receipt !== undefined && (!entry.receipt || typeof entry.receipt.accepted !== "boolean"
          || (entry.receipt.reason !== undefined && typeof entry.receipt.reason !== "string")))) {
        throw new Error("Invalid persisted message delivery record");
      }
      return entry;
    },
    async tracksAbsence() {
      return (await read(marker)) !== undefined;
    },
    async admit(id, entry) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      try {
        await writeFile(recordPath(id), JSON.stringify(entry), {
          flag: "wx", mode: 0o600, flush: true,
        });
        return true;
      } catch (error) {
        if (error.code === "EEXIST") return false;
        throw error;
      }
    },
    async settle(id, entry) {
      const temporary = join(root, randomUUID() + ".tmp");
      try {
        await writeFile(temporary, JSON.stringify(entry), {
          flag: "wx", mode: 0o600, flush: true,
        });
        await rename(temporary, recordPath(id));
      } finally {
        await rm(temporary, { force: true });
      }
    },
  };
}
