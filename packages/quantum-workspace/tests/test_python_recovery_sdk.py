"""Real SDK save/load recovery after a transient preview outage; no model calls."""
import hashlib
import unittest
from unittest.mock import patch
from test_python_runs import PythonRunCase
from test_experiments import HAS_FQX
from workspace_server.python_runs import PythonRuns


@unittest.skipUnless(HAS_FQX, 'Requires FlagQuantum save/load')
class SDKRecoveryTests(PythonRunCase):
    def test_real_multi_file_recovery_survives_service_reopen_without_reexecution(self):
        source = '''import flagquantum as fq
from pathlib import Path
circuit = fq.Circuit(2).h(0).cx(0, 1)
result = fq.run(circuit, outputs=fq.counts(), options=fq.ExecutionOptions(shots=128, seed=42))
print(result.counts)
for folder in ("first", "second"):
    Path(folder).mkdir()
    fq.save(folder + "/bell.fqx", result.plan, result=result)
Path("invalid.fqx").write_bytes(b"invalid archive")
'''
        with patch.object(self.runs.experiments, 'import_file', side_effect=OSError('Temporary preview outage')):
            run = self.wait(self.runs.submit({'source': source})['id'])
        self.assertEqual(run['status'], 'completed', run)
        self.assertEqual(run['collection_status'], 'failed')
        self.assertEqual(len(run['collection_errors']), 3)
        before = {key: run[key] for key in ('id', 'source', 'source_hash', 'status', 'logs', 'exit_code', 'finished_at')}
        self.runs.close()
        self.runs = PythonRuns(self.settings, self.quantum)
        with patch.object(self.runs, 'command', side_effect=AssertionError('must not execute')):
            recovered = self.runs.recollect(run['id'])
        self.assertEqual(recovered['collection_status'], 'partial', recovered)
        self.assertEqual(len(recovered['experiments']), 2)
        self.assertEqual(len({item['id'] for item in recovered['experiments']}), 2)
        self.assertEqual({item['filename'] for item in recovered['experiments']}, {'first/bell.fqx', 'second/bell.fqx'})
        self.assertEqual(recovered['collection_errors'][0]['filename'], 'invalid.fqx')
        for key, value in before.items(): self.assertEqual(recovered[key], value, key)
        for reference in recovered['experiments']:
            record = self.runs.experiments.get(reference['id'])
            self.assertEqual(record['program']['origin']['run_id'], run['id'])
            self.assertEqual(record['program']['origin']['source'], source)
            self.assertEqual(sum(record['job']['result']['counts'].values()), 128)
            self.assertEqual(hashlib.sha256(self.runs.experiments.file(reference['id']).read_bytes()).hexdigest(), reference['sha256'])
        self.assertEqual(len(self.runs.store.list()), 1)
        again = self.runs.recollect(run['id'])
        self.assertEqual(again['experiments'], recovered['experiments'])
