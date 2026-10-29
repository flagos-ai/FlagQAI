# Imported CLI test fixture lineage

The CLI repository tracks 12 paths under `apps/cli/scripts/fixtures/`: DSH
protocol transcripts and their expected outputs. Every current file has the
**same path and Git blob ID** in the pinned
[dsh-TUI import](https://github.com/ccch1mneyyy/dsh-TUI/commit/c2eee95218d1decfce138f7d31ef7099cc391d00)
and in the original private FlagQAI extraction commit
`02a4d24e0dda0e9b8b28b7a1a1a826538538ee8f`. This establishes byte-for-byte
continuity into the independent CLI; it does not establish who produced the
original recorded model traces or grant additional redistribution rights.
The dsh-TUI MIT import notice remains in `apps/cli/LICENSE` and
`apps/cli/UPSTREAM.md`.

The inventory covered **86** paths until the deferred agent backends were
removed: that change deleted the 53 `claude/` and 21 `codex/` transcripts along
with the backend source they exercised, leaving the 12 `dsh/` files. The four
pinned source identifiers below are unchanged, because they describe where
these files came from rather than how many of them remain.

`fixture-source-blobs.json` pins the 12 blob IDs and both source commits.
The offline CI check compares the **working files**, the tracked file set,
and a basic email/API-token pattern screen against that inventory:

```sh
node docs/releases/verify-fixture-lineage.mjs
```

For an independent source comparison, fetch the complete recursive Git Trees
responses at the fixed commits, verify their root tree IDs are
`62741b9b8b9dfab1dfb0ca28f065af140119613e` and
`502aadaaa8a7a927b5d575a6760a4f825785588c` via the corresponding Git
commit endpoints, then run:

```sh
gh api 'repos/ccch1mneyyy/dsh-TUI/git/trees/c2eee95218d1decfce138f7d31ef7099cc391d00?recursive=1' > /tmp/flagqai-dsh-fixtures.json
gh api 'repos/FlagQuantum/FlagQAI/git/trees/02a4d24e0dda0e9b8b28b7a1a1a826538538ee8f?recursive=1' > /tmp/flagqai-extraction-fixtures.json
node docs/releases/verify-fixture-lineage.mjs --upstream /tmp/flagqai-dsh-fixtures.json --extraction /tmp/flagqai-extraction-fixtures.json
```

Both saved responses used for this review reported `truncated: false`.
The basic screen found no email address or long `sk-`/Bearer-shaped token
in these files; fixture home paths are generic `/home/...` placeholders.
That screen is not a full privacy audit. The fixtures are source-only and are
not included in the staged npm package. If a fixture changes intentionally,
review the new content and origin before updating the pinned inventory.
