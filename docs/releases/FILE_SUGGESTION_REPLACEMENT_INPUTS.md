# File suggestion ranking replacement inputs

The terminal composer uses file candidates supplied by the Harness-backed
channel. Its observable contract includes path-like query detection, fuzzy
subsequence scoring, stable directory/path tie breaks, bounded top-K results,
and retaining selection by candidate ID after a refresh. The public candidate
type and call sites, the existing file-suggestion tests, and black-box output
from the previous compiled runtime were used to specify this replacement. Its
implementation body was not used as a template.

The new ranker retains only the best K matches in a heap before sorting that
visible set. For a workspace scan of N paths, this changes the ordering phase
from a full N-item sort to bounded O(N log K) selection. Focused tests and
installed-package acceptance cover matching, ordering and composer behavior.

This removes one exact historical same-path source blob from the independent
Ink compiler graph. It does not establish rights for the remaining CLI source
or private Git history and does not authorize publication.
