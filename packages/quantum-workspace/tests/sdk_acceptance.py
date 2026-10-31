"""Required real-SDK lane: missing SDKs or skipped tests are failures."""
import argparse
import json
from pathlib import Path
import sys
import unittest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    import flagquantum as fq
    import torch
    if fq.__version__ != '0.4.0' or torch.__version__.split('+')[0] != '2.13.0':
        raise RuntimeError('Acceptance requires FlagQuantum 0.4.0 and PyTorch 2.13.0.')
    if not all(callable(getattr(fq, name, None)) for name in ('save', 'load', 'run')):
        raise RuntimeError('Real SDK save/load/run support is required.')
    print('Required SDK: %s; PyTorch %s; Python %s' % (fq.__file__, torch.__version__, sys.version), flush=True)
    suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    report = {'python': sys.version, 'sdk_version': fq.__version__, 'sdk_path': fq.__file__,
              'torch_version': torch.__version__, 'tests': result.testsRun,
              'skipped': [{'test': str(test), 'reason': reason} for test, reason in result.skipped],
              'failures': len(result.failures), 'errors': len(result.errors)}
    path = Path(args.report)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2))
    if not result.wasSuccessful() or result.skipped or result.testsRun == 0:
        raise SystemExit('Required SDK acceptance failed, skipped tests, or collected no tests.')


if __name__ == '__main__':
    main()
