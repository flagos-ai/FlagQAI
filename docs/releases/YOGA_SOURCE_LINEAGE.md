# Historical TypeScript Yoga port lineage

Before the official Yoga replacement, the CLI used two TypeScript source files
under `apps/cli/src/native-ts/yoga-layout/`. The historical implementation describes itself as
a simplified port of [Meta Yoga](https://github.com/facebook/yoga), exposing
the `yoga-layout/load` API subset used by the terminal renderer. The CLI
retains the Yoga MIT notice in `apps/cli/THIRD_PARTY_LICENSES` and the
dsh-TUI MIT import notice in `apps/cli/LICENSE`.

The current tree replaces those files with the published `yoga-layout@3.2.1`
dependency and a FlagQAI adapter under `apps/cli/src/ink/layout/yoga.ts`.
The removal reduces the current source surface; it does not resolve the
rights or provenance of the remaining imported renderer, composer, or Chat
code. See [replacement inputs and validation](YOGA_REPLACEMENT_INPUTS.md).

The earliest commit returned by the public dsh-TUI path histories for **both**
files is [dsh-TUI `809591d` (5 August 2026)](https://github.com/ccch1mneyyy/dsh-TUI/commit/809591d40e477082daec8926453b4264b84130c3).
Its `index.ts` blob is `49b9602becdcf2d2f5e2d3278e937e172f9c398b`
(83,377 bytes), and `enums.ts` is
`8cbb6ecff2c85fcda9a729553119e4ec561fc9f2` (2,823 bytes). That is
the first **observable repository version**, not proof of when the port was
written or which upstream Yoga revision it used.

At the pinned [dsh-TUI import commit `c2eee95`](https://github.com/ccch1mneyyy/dsh-TUI/commit/c2eee95218d1decfce138f7d31ef7099cc391d00),
the `index.ts` blob is `1793cbec7e264839a4952d5dd71ec3c0af096c2b`
(99,561 bytes) and `enums.ts` is
`07d86eba64f94f4b8b765cdc5809456d37775a8d` (4,486 bytes). At the
pre-replacement source revision, CLI `index.ts` was byte-identical to that
imported blob. The then-current `enums.ts` differed only by a later
explanatory header comment added in
FlagQAI-CLI `fdb8382`;
its enum values were not changed by that commit.

The dsh-TUI file history returned five commits for `index.ts` and two for
`enums.ts` up to the pinned import. The original `index.ts` header already
calls the implementation a simplified TypeScript port and links Meta Yoga.
This supports a documented upstream relationship, while the exact historical
Yoga revision and the original authorship of each algorithm remain unproven.
The separate [v3.2.1 enum comparison](SOURCE_PROVENANCE_AUDIT.md) establishes
the current enum values as a compatibility reference, not the port's origin.

To reproduce the path history and blob checks without cloning upstream:

```sh
gh api 'repos/ccch1mneyyy/dsh-TUI/commits?path=src/native-ts/yoga-layout/index.ts&per_page=100'
gh api 'repos/ccch1mneyyy/dsh-TUI/commits?path=src/native-ts/yoga-layout/enums.ts&per_page=100'
gh api 'repos/ccch1mneyyy/dsh-TUI/git/trees/809591d40e477082daec8926453b4264b84130c3?recursive=1'
gh api 'repos/ccch1mneyyy/dsh-TUI/git/trees/c2eee95218d1decfce138f7d31ef7099cc391d00?recursive=1'
git rev-parse 5951c5cdf2528e8548dae3c33a06e789f63f3aeb:apps/cli/src/native-ts/yoga-layout/index.ts
git rev-parse 5951c5cdf2528e8548dae3c33a06e789f63f3aeb:apps/cli/src/native-ts/yoga-layout/enums.ts
```

These history-bearing-checkout commands reproduce the former blobs. This
record does not clear the source tree for public release.
