# Domain task cards

All cards are planned. Numerical values below define test inputs or analytic
references; they are not measurements from the workbench. Use double precision
for deterministic references and save package versions, units and conventions.
Freeze any necessary adaptation before comparing the two lanes.

## QI-01 Quantum information

**Question.** Two preparations have the same Z-basis counts. Are their information
properties the same, and what evidence distinguishes them?

**Inputs.** Compare the Bell state density matrix for
`(|00> + |11>)/sqrt(2)` with the classical mixture
`0.5|00><00| + 0.5|11><11|`. Variant B uses
`(|01> + |10>)/sqrt(2)` and its corresponding mixture. Fix subsystem ordering,
the partial-transpose subsystem and logarithm base 2.

**Reference lane.** NumPy or an existing local quantum-information library for
matrices, partial traces, correlators and eigenvalues; ordinary notebook output
and saved files. Record any symbolic tool used, with no paid model calls.

**Web sequence.** Inspect the starting preparations, run their calculations,
inspect counts together with a state-sensitive diagnostic, save both versions,
change the preparation, compare and reopen the earlier result. Check whether
the workbench can actually expose the required matrices or derived quantities.
If only Python console output carries them, record that distinction explicitly.

**Scientific acceptance.** Density matrices are Hermitian, positive within
`1e-10` numerical tolerance and have trace 1. For variant A, both Z distributions
are `(0.5, 0, 0, 0.5)` and both one-qubit marginals are `I/2`. The joint purities
are 1 and 0.5; XX expectations are 1 and 0. With negativity defined as
`(||rho^(T_B)||_1 - 1)/2`, the values are 0.5 and 0. Require agreement within
`1e-10` for exact matrix calculations. Finite-shot estimates need a separate
statistical tolerance fixed before sampling.

**Experience success.** The reviewer can explain why counts alone are insufficient,
locate the corresponding code and distinguish exact calculations from samples.
Both the mixture and pure-state evidence remain identifiable after recovery.
Do not claim mixed-state SDK support merely because a script constructs a matrix.

**Likely friction to inspect.** A circuit-first UI may hide density operators,
mathematical assumptions or observables essential to the question. This is a
hypothesis to test, not an existing observation.

## QC-01 Quantum computing

**Question.** Does a changed QAOA parameter search improve a saved Max-Cut result
under a fixed execution budget?

**Inputs.** Four vertices with edges `(0,1),(1,2),(2,3),(3,0)` and respective
weights `1,2,1,2`. Define the objective as the sum of weights of cut edges;
enumerating all 16 bitstrings gives optimum 6. Variant B interchanges weights
to `2,1,2,1`, retaining the graph size and objective definition. Freeze the SDK
Hamiltonian sign convention, parameter domain, evaluation count, shots and seeds.

**Reference lane.** Local editor/notebook and the same available SDK, with exact
classical enumeration and ordinary result files. Compare two equal-budget search
strategies, such as a uniform grid and a preregistered local refinement. Do not
quietly allocate more circuit evaluations to the refinement.

**Web sequence.** Save a baseline, inspect its actual circuit and objective,
review a candidate change, run it, compare expected cut and sampled statistics,
then reproduce the selected version from its saved source and settings.

**Scientific acceptance.** The objective matches direct enumeration; distributions
normalize within `1e-10` for exact probabilities. Any exact expected cut is between
0 and 6 within numerical tolerance. Sampling totals match shots and uncertainty
is distinguished from a true improvement. Lower performance is an acceptable
experimental outcome when reported correctly; it is not an automatic product
failure. Global optimization or quantum advantage is not claimed.

**Experience success.** The reviewer can identify which code, parameter search,
compute budget and result belong together, compare candidates without overwriting
the baseline, and reproduce the adopted or rejected version. A different graph
must never silently enter the same comparison.

**Likely friction to inspect.** Telling a completed program from a verified
optimization improvement, and understanding the meaning of compiled resources.

## QEC-01 Quantum error correction

**Question.** Under a specified bit-flip model, when does a three-bit repetition
code reduce logical bit errors, and what does the experiment omit?

**Inputs.** One ideal encoding/correction cycle, independent X errors on three
bits with probability `p`, and majority-vote decoding. Start at `p=0.05`; variant B
uses `p=0.10`. Encoding, decoding and measurement are ideal. Phase errors,
correlated errors, noisy syndrome extraction and repeated rounds are excluded.

**Reference lane.** Enumerate the eight error patterns with NumPy or pure Python;
optionally sample them with a fixed seed. An existing local stabilizer simulator
may be an additional lane, but is not required for this bounded reference.
Label the pattern calculation as a classical model of the specified error
process, not a full general quantum-error-correction simulation.

**Web sequence.** Run the same model, compare unencoded and logical error rates,
inspect the decoder assumptions, change p, retain the baseline and recover both
the noise settings and results. Evaluate whether current outputs can represent
rates and uncertainties without pretending a statevector plot is sufficient.

**Scientific acceptance.** Exact logical bit-error probability is
`3*p^2*(1-p) + p^3`; it is `0.00725` at p=0.05 and `0.028` at p=0.10.
Exact enumeration agrees within `1e-12`; the unencoded rate is p. If sampling is
used, save shots, observed errors and a prespecified 95% Wilson interval. Record
coverage and deviation without retuning seeds or silently rerunning until PASS.
These cases cannot establish a surface-code threshold or fault tolerance.

**Experience success.** The reviewer can distinguish physical from logical rates,
find the complete noise/decoder specification, assess uncertainty and reproduce
the same exact result or the same seeded sample. Missing noise/decoder support
is a capability gap, not a reason to label unrelated execution as successful.

**Likely friction to inspect.** Noise-model and decoder provenance may matter more
than a gate diagram; external simulator integration may dominate the workflow.

## QD-01 Quantum dynamics

**Question.** How does a Trotter step change numerical error and computational
cost for a small spin-system evolution?

**Inputs.** `H = J*Z0*Z1 + h*(X0 + X1)`, `J=1`, `h=0.7`, initial state `|00>`,
and hbar=1. Use times from 0 to 5 in increments of 0.1. Compare first-order
Trotter steps 0.1 and 0.05 using a fixed documented factor order. Variant B uses
h=0.9 with the same dimensions, grid and observables.

**Reference lane.** Local Hermitian eigendecomposition for exact evolution and
ordinary Python/notebook analysis of the two approximations. Save arrays and
plot Z0 expectation against time; optionally include one-qubit entropy in bits.

**Web sequence.** Run and inspect exact and approximate trajectories, compare
errors on a shared grid, change the step, save the chosen version and reopen the
previous trajectory. Record whether arrays and time curves are represented
natively or require console/external plotting workarounds.

**Scientific acceptance.** Exact evolution preserves norm within `1e-10`, the t=0
state agrees with the input and Z0 expectations stay within [-1,1] up to numerical
tolerance. Save `max_t(1 - |<psi_exact(t)|psi_approx(t)>|^2)` and the maximum Z0
error for each step, along with gate/evaluation cost. A target Z0 error of `1e-2`
may be used as a preregistered task budget; report an honest miss if neither
approximation meets it. Do not require monotonic improvement at every time point.

**Experience success.** The reviewer can tell an entire trajectory from a final
state, compare the same observable and time grid, connect accuracy with cost,
and recover exact parameters and arrays. A correct final histogram alone does
not complete the task.

**Likely friction to inspect.** Trajectory plots, observables and solver settings
may expose the limits of a circuit/measurement-centered result page.

## QCH-01 Quantum chemistry

**Question.** For one fixed molecular Hamiltonian, how do two variational settings
compare with a consistent exact electronic-structure reference?

**Inputs.** H2, bond length 0.735 angstrom, STO-3G, neutral singlet, two electrons,
and four spin orbitals before any explicitly recorded reduction. Variant B uses
0.90 angstrom. Save geometry, orbital ordering, active-space choices, mapping,
electron/spin conventions, nuclear repulsion and energy units. Compare two
preregistered ansatz/optimizer settings with equal objective-evaluation budgets.

**Reference lane.** An available local chemistry stack for integrals and FCI,
plus the existing local quantum SDK or independently checked Hamiltonian matrix.
Possible packages are PySCF and a compatible mapping library; availability must
be checked rather than assumed. If none is installed, mark this computation
environment-blocked instead of substituting a hard-coded textbook energy.

**Web sequence.** Inspect inputs and Hamiltonian provenance, execute two settings,
compare their energy error and cost, retain a nonconverged attempt, then reload
the exact geometry/configuration and reproduce the selected result.

**Scientific acceptance.** Matrix/Hamiltonian and FCI references agree within
`1e-8` hartree when they use the same integrals, constants and sector. Normalized
variational energies do not fall below the corresponding exact ground energy
beyond `1e-7` numerical tolerance. Record the actual error to the same reference;
an optional preregistered target is `1e-3` hartree. Target misses remain valid
research outcomes. Do not compare different constant offsets, basis sets or
geometries as if only the optimizer changed.

**Experience success.** The reviewer can trace a displayed energy to molecular
inputs, Hamiltonian, trial state, optimizer and saved code. Electronic-only versus
total energies are distinguishable; results and failed attempts are recoverable.
The presence of a working Python interpreter is not sufficient acceptance.

**Likely friction to inspect.** Chemical input conventions, environment setup and
specialized artifacts may require capabilities the current workbench has not yet
demonstrated. Record the gap without adding a molecule editor in this review.
