# Synthesis attribution projection acceptance

Date: 2026-11-13

Depends on `feat/circuit-range-navigation`. Saved FQX imports and explicit
`flagquantum_web.publish` now share a pure projection of the SDK's
`flagquantum.synthesis-source.v1` metadata and per-instruction origins. The viewer
can show source-attributed operations instead of the anonymous range fallback.

The projection preserves contiguous execution intervals. Repeated and combined
origins remain explicit rather than merging noncontiguous gates. Unknown origins,
invalid manifests or mismatched instruction lists produce no semantic hierarchy.
Logical register ports follow a valid recorded final routing permutation; a
routing record without that permutation does not imply an identity layout.

## Verification

- Required backend SDK acceptance: 131 tests passed with FlagQuantum 0.4.0 and
  PyTorch 2.13.0; zero skips, failures or errors.
- Six focused projection tests cover repeated/combined/unmapped origins,
  malformed metadata, instruction mismatch and routing layouts. A real SDK FQX
  fixture verifies archive and explicit-publisher agreement, unchanged archive
  bytes and no `fq.run` calls during projection.
- The portable browser test uses a declared two-operation attribution fixture
  (H/CX named Prepare/Entangle). It verifies the actual Python worker's injected
  publishing helper, restored archive metadata, semantic cards, keyboard selection,
  all-gate order, refresh, unchanged run count and retained editor draft.
- A second local browser pass imports a genuine polynomial archive produced by
  the local `FlagQuantum-synthesis-source-map` SDK checkout: `x*x+y` on two UInt(2)
  inputs with uniform preparation, max_qubits=36. It has 16 qubits and 81 gates,
  with these saved source intervals: Input preparation, Multiply/Compute,
  Add/Compute, Multiply/Compute, Add/Compute, Add/Uncompute, Multiply/Uncompute.
  Exact gate coverage was independently checked. Compilation and archive reading
  do not execute a simulation.
- Web build, typecheck and test formatting passed. Browser screenshots inspected.
- Staged CLI package verification passed: 2,666 files and 32 entry targets. No
  CLI runtime source changed.

The local compiler acceptance tests metadata support from that specific local
SDK checkout; it does not assert that every released SDK supplies source maps.
CI uses the portable declared-metadata fixture so older SDKs still exercise the
projection contract. Unattributed archives retain ordered gate-range navigation.
The existing import limits and executable gates are unchanged.

All browser acceptance uses independent services and temporary research data.
No paid model was called or user drafts, archives or running services changed.
