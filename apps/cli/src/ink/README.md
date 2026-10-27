# Embedded terminal renderer provenance

This renderer entered FlagQAI through the MIT-licensed FlagQAI v0.14.0 source
import. Its core has file-level overlap with the official Ink source; see the
[pinned comparison](../../../../docs/releases/INK_SOURCE_COMPARISON.md) for
examples and limits. All 122 tracked renderer source files are byte-identical
to the pinned FlagQAI import; 93 have no same-path file in official Ink v5.2.1.
This establishes their immediate import path, not their earlier authorship or
the exact historical Ink fork revision. The [extension inventory](../../../../docs/releases/INK_EXTENSION_LINEAGE.md)
records the reproducible comparison.

Retain the FlagQAI import notice in `apps/cli/UPSTREAM.md` and Vadym Demedes's
Ink MIT copyright and license in `apps/cli/THIRD_PARTY_LICENSES` when modifying
or redistributing this code. Do not treat the official v5.2.1 comparison tag as
an assertion that every file here was copied from that release.
