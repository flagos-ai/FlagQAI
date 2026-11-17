# KMX scratch slot reuse

The local pass takes a KMX source circuit and writes a candidate plus an
allocation report. Use new output paths for each run.

```sh
python3 packages/quantum-workspace/scripts/reuse_scratch.py \
  baseline.kmx candidate.kmx --report allocation.json
```

The pass pins all qubits declared in interface registers. An unconditional
`R` or `HMR` can return a scratch slot to the free pool. A reset with an
inline condition or inside a condition stack keeps its slot allocated.
The pass changes only quantum operands and keeps the instruction order,
angles, classical operands, comments, and metadata.

The parser accepts the bounded instruction set used by the InvSqrt example.
It rejects unsupported operations and unbalanced condition stacks.
The report lists every released slot and the width before and after allocation.
Use the target verifier to evaluate the generated candidate.

## Reference result

The archived inverse-square-root example used the saved 35-rotation variant as
its baseline. The candidate reduced circuit width from 260 to 259 qubits.
Both binaries passed 200,540,928 shots with the archived local verifier and
default salt. The Toffoli count remained 7,735 and the rotation count remained
35. Recorded resource cost fell from 2,073,415.6784 to 2,065,441.0027.
