# Quadratic potential on an integer grid

The Synthesis example compiles `V(x,y) = x*x + y*y` on two nonnegative
integer grids. Each Python run checks the full named output distribution
against its classical reference, then saves the executable circuit and result
in FQX. The example uses dimensionless units. Grid width changes the coordinate
domain. The potential register covers the arithmetic part of the model.

| Grid | Verified grid outputs | Qubits | Gates | Depth |
| --- | ---: | ---: | ---: | ---: |
| 2 × 2 | 4 | 7 | 19 | 15 |
| 4 × 4 | 16 | 21 | 152 | 105 |

These measurements come from the local CPU SDK at the [pinned FlagQuantum
source revision](https://github.com/flagos-ai/FlagQuantum/tree/b3fa4a78935777bb8e3853752192e9cd47972b2f).
Both runs used a probability tolerance of `1e-10`. Other builds and compiler
settings may produce different resources.

The browser acceptance uses the existing Synthesis, Model, Quantum and Jobs
pages. The example opens a copy and leaves the earlier editor draft available.
After explicit execution, Synthesis shows resources from the saved FQX bound
to the completed source snapshot. The two saved circuits can be compared in
Jobs. The older CI SDK is exercised separately to verify rejection before any
research code runs. The local browser test invokes no models.
