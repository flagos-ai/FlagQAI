# Experiment visualization and recorded results

This layer presents recorded SDK experiments. It does not introduce an execution
engine or change native Agent ownership.

Circuit Fit accounts for both dimensions and follows viewport or hierarchy size
changes until manual zoom. Manual zoom preserves the viewport center. Gate,
measurement and module selection remain visibly identified; hierarchy changes
clear stale selection. Read-only Python and OpenQASM snapshots include line
numbers and exact-source copying without replacing the editor draft.

Gate reference supports keyboard search, category-preserving clearing and
IME-safe Escape handling. Example outputs remain explicitly precomputed. Closing
an example result restores its trigger, while clipboard feedback belongs only
to the source that initiated the write.

Jobs and experiment comparison paginate all observed states without renormalizing
a filtered subset. Sorting, searching or paging resets the corresponding table
scroll; changing display units preserves it. CSV exports contain all recorded
counts for the selected measurement and batch, regardless of visible filters.
Decoded legacy rows are never reused for an unrelated archived measurement.
Zero or non-count outputs cannot offer a misleading counts CSV; complete job
JSON remains available.

The product acceptance contract adds parameterized Bell source/circuit/result
continuity and circuit viewport journeys. These use actual CPU SDK execution;
scripted Agent output is separate from live-model capability evidence. Passing
these checks does not establish arbitrary circuit scale or production readiness.
