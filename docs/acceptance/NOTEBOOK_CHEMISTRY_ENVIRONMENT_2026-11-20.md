# LiH Notebook dependency repair

The LiH Notebook's `model.regenerate()` requires PySCF to recompute molecular
integrals and reference energies. The selected local virtual environment lacked
PySCF. The existing static preflight correctly reported the missing lazy import,
but its preparation guide left `pyscf` unmapped. Preparation now includes the
known PySCF package name; unknown imports remain unmapped. No automatic package
installation or changes to upstream scientific source were introduced.

The local development interpreter was repaired separately: PySCF 2.15.0 and h5py
were installed, and incomplete existing dependency installations were repaired.
The dependency compatibility check passed. These environment operations are not
part of the repository or an automatic application behavior.

Acceptance used the existing LiH workspace source in an independent Python
process with two numerical threads. `model.regenerate()` completed in 5.301 s:

| Method | Energy (Hartree) |
| --- | ---: |
| RHF | -7.85900712731487 |
| MP2 | -7.872481696949935 |
| CISD | -7.880634520720808 |
| CCSD | -7.8806375402178315 |
| FCI | -7.880648979805256 |

The active-space energy was -7.880416053961524 Hartree; the native SDK value was
-7.880416053957045 Hartree. The upstream assertions passed. This validates the
reported molecular-regeneration step, not the entire subsequent VQE workflow.

The live Web preflight then returned `ready`, with no missing dependencies or
incompatible SDK APIs and `research_executed: false`. Eight environment tests and
staged package surface verification passed. The current Notebook kernel, drafts,
saved outputs and failure history were left intact. No paid model calls occurred.
