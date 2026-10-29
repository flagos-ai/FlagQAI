"""Real SDK archive import, persistence and HTTP boundaries; no execution on import."""
from dataclasses import replace
import importlib.util
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.client import HTTPConnection
import json

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from test_bridge import ScriptedCPU
from workspace_server.config import WorkspaceSettings
from workspace_server.experiments import ExperimentImports, MAX_UPLOAD_BYTES
from workspace_server.http import create_server
from workspace_server.job_store import SQLiteJobStore
from workspace_server.service import QuantumWorkspaceService

try:
    import flagquantum as fq
    HAS_FQX = callable(getattr(fq, 'save', None))
except ImportError:
    HAS_FQX = False


@unittest.skipUnless(HAS_FQX, 'Requires the merged FlagQuantum save/load SDK')
class ExperimentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.settings = WorkspaceSettings(self.root, self.root / 'jobs.sqlite3', port=0,
                                          agent_cwd=self.root, experiment_python=sys.executable)
        self.imports = ExperimentImports(self.settings)
        self.program = fq.compile(fq.Circuit(2).h(0).cx(0, 1))
        self.result = fq.run(self.program, outputs=fq.counts(),
                             options=fq.ExecutionOptions(device='cpu', backend='pytorch', shots=128, seed=42))
        path = self.root / 'bell.fqx'
        fq.save(path, self.program, result=self.result)
        self.content = path.read_bytes()
        store = SQLiteJobStore(self.settings.database_path)
        store.initialize()
        self.compute = ScriptedCPU()
        self.service = QuantumWorkspaceService(store, self.compute)

    def tearDown(self):
        self.service.close()
        self.temp.cleanup()

    def test_real_sdk_results_survive_import_reopen_and_download(self):
        record = self.imports.import_file(self.content, 'Bell pair.fqx')
        self.assertEqual(record['job']['result']['counts'], self.result.counts[0])
        self.assertEqual(record['program']['experiment']['execution_plan']['identity'], self.result.plan.identity)
        self.assertEqual(record['job']['result']['seed'], 42)
        self.assertEqual(record['program']['compiled']['measurement_qubits'], [0, 1])
        self.assertEqual(record['job']['result']['transport'], 'archive')
        self.assertIsNone(record['job']['result']['elapsed_seconds'])
        self.assertEqual(record['program']['experiment']['measurements'][0]['qubits'], [0, 1])
        reopened = ExperimentImports(self.settings)
        self.assertEqual(reopened.records()[0], record)
        self.assertEqual(reopened.file(record['id']).read_bytes(), self.content)
        self.assertEqual(self.compute.calls, [])

    def test_program_only_import_never_invents_a_result(self):
        path = self.root / 'program.fqx'
        fq.save(path, self.program)
        record = self.imports.import_file(path.read_bytes(), 'program.fqx')
        self.assertNotIn('job', record)
        self.assertEqual(record['program']['compiled']['measurement_qubits'], [])
        self.assertFalse(record['program']['experiment']['has_result'])
        self.assertEqual(record['program']['experiment']['measurements'], [])

    def test_loader_and_projection_do_not_compile_run_or_sample(self):
        import torch
        spec = importlib.util.spec_from_file_location('fqx_projection', Path(__file__).parents[1] / 'local/workspace_server/experiment_worker.py')
        worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(worker)
        with patch.object(fq, 'compile', side_effect=AssertionError('must not compile')), \
             patch.object(fq, 'run', side_effect=AssertionError('must not run')), \
             patch.object(torch, 'multinomial', side_effect=AssertionError('must not sample')):
            projected = worker.project(self.root / 'bell.fqx')
        self.assertEqual(projected['experiment']['measurements'][0]['batches'][0][0]['count'],
                         self.result.counts[0]['00'])

    def test_multiple_measurements_batches_and_partial_qubit_order_are_preserved(self):
        from flagquantum.runtime.result import MeasurementResult
        import torch
        partial = MeasurementResult(kind='counts', qubits=(1,), shots=3,
                                    value=[{'0': 1, '1': 2}, {'0': 3}])
        numeric = MeasurementResult(kind='expectation', qubits=(1, 0), value=torch.tensor([.5, -.5]))
        result = replace(self.result, measurements=(partial, numeric))
        path = self.root / 'batch.fqx'
        fq.save(path, self.program, result=result)
        info = self.imports.import_file(path.read_bytes(), 'batch.fqx')['program']['experiment']
        self.assertEqual(info['measurements'][0]['qubits'], [1])
        self.assertEqual(info['measurements'][0]['batches'][1], [{'state': '0', 'key_type': 'string', 'count': 3}])
        self.assertEqual(info['measurements'][1]['qubits'], [1, 0])
        self.assertEqual(info['measurements'][1]['value']['values'], [.5, -.5])

    def test_rotation_parameters_remain_numeric_in_the_circuit_preview(self):
        import torch
        path = self.root / 'rotation.fqx'
        fq.save(path, fq.Circuit(1).rx(0, torch.tensor(.5)))
        record = self.imports.import_file(path.read_bytes(), 'rotation.fqx')
        angle = record['program']['compiled']['instructions'][0]['params']['theta']
        self.assertIsInstance(angle, (int, float))
        self.assertAlmostEqual(angle, .5)

    def test_state_only_results_do_not_invent_counts_and_preview_truncation_is_explicit(self):
        import torch
        result = replace(self.result, measurements=(), state=torch.arange(2048, dtype=torch.float64))
        path = self.root / 'state.fqx'
        fq.save(path, self.program, result=result)
        record = self.imports.import_file(path.read_bytes(), 'state.fqx')
        self.assertEqual(record['job']['result']['counts'], {})
        self.assertEqual(record['job']['result']['shots'], 0)
        preview = record['program']['experiment']['state']
        self.assertEqual(preview['shape'], [2048])
        self.assertTrue(preview['truncated'])
        self.assertEqual(len(preview['values']), 1024)
        self.assertEqual(self.imports.file(record['id']).read_bytes(), path.read_bytes())

    def test_invalid_archive_leaves_no_persisted_record_or_file(self):
        for data, name in [(b'not an archive', 'bad.fqx'), (self.content, 'bad.py'),
                           (b'x' * (MAX_UPLOAD_BYTES + 1), 'large.fqx')]:
            with self.assertRaises(ValueError):
                self.imports.import_file(data, name)
        self.assertEqual(self.imports.records(), [])
        self.assertEqual(list(self.imports.root.iterdir()), [])

    def test_same_origin_http_import_and_refresh_do_not_submit_jobs(self):
        server = create_server(self.settings, self.service)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        def request(method, path, body=None, origin=None, content_type='application/octet-stream'):
            connection = HTTPConnection('127.0.0.1', server.server_port, timeout=30)
            headers = {'Content-Type': content_type}
            if origin: headers['Origin'] = origin
            connection.request(method, path, body, headers)
            response = connection.getresponse()
            data = response.read()
            connection.close()
            return response.status, data
        try:
            status, _ = request('POST', '/api/experiments?name=bell.fqx', self.content, 'https://foreign.example')
            self.assertEqual(status, 403)
            self.assertEqual(request('POST', '/api/experiments', self.content, content_type='application/json')[0], 415)
            status, data = request('POST', '/api/experiments?name=bell.fqx', self.content)
            self.assertEqual(status, 201, data)
            record = json.loads(data)
            self.assertEqual(json.loads(request('GET', '/api/experiments')[1])[0], record)
            self.assertEqual(json.loads(request('GET', '/api/experiments/' + record['id'])[1]), record)
            self.assertEqual(json.loads(request('GET', '/api/jobs')[1])[0]['experiment']['id'], record['id'])
            self.assertEqual(request('GET', '/api/experiments/' + record['id'] + '/file')[1], self.content)
            self.assertEqual(request('GET', '/api/experiments/fqx-' + '0'*32 + '/file')[0], 404)
            self.assertEqual(self.compute.calls, [])
        finally:
            server.shutdown()
            server.server_close()
