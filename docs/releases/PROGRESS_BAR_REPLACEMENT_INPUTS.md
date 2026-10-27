# Progress bar presentation replacement input record

This is a bounded presentation-component candidate for source-rights issue #93.
It does not settle ownership of the surrounding design system, renderer, or
private Git history, and it is not a strict clean-room claim: maintainers have
had access to the imported implementation during this project.

The replacement was written from the public component contract in the current
repository: the `ratio`, `width`, `fillColor`, and `emptyColor` prop declarations;
the `JobCard.tsx` call site; and the observable terminal-cell assertions in
`verify-progress-bar.tsx`. The old component implementation body was not used
as a replacement reference. The glyphs are Unicode block elements and the
React/`ThemedText` composition uses the existing application API.

The expected behavior is a fixed-width, one-row bar. Its ratio is bounded to
zero through one, a complete cell is `█`, a partial cell uses eighth-cell
resolution, and unfilled columns are spaces. Filled and empty columns retain
separate theme colors. Invalid or nonpositive widths produce no row. The
replacement remains a component on the existing renderer boundary; it does
not migrate the renderer to official Ink.

Validation for this batch comprises the progress-bar terminal-cell regression,
the `JobCard` rendering regression, the complete CLI preflight, staged package
verification, and isolated installed-package startup. The source-rights gate
remains open for the rest of batch 4 and all other affected families.

On the candidate branch, the progress-bar and `JobCard` rendering checks
passed, followed by all 173 CLI preflight gates and the staged package surface
check (2,910 files and 32 entry targets). A clean installed-package first run
on macOS arm64 with Node 26.8.2 passed `setup` and `doctor` in an isolated HOME
without host credentials or a model request. Its tarball SHA-256 was
`e25f87164b45209bbce3a78855a4ed828a7f82282e525b21d173d74ff8ec9251`.
The first preflight attempt ran inside a restricted local socket sandbox and
four otherwise unrelated listener-based gates failed with `EPERM` on
`127.0.0.1`; the same full suite passed when local test listeners were allowed.
