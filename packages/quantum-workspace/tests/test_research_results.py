"""Scientific projections, provenance rejection and portable version bindings."""
import copy
from hashlib import sha256
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from workspace_server.research_results import build_result, attach_result
from workspace_server.research_packages import validate_run
from workspace_server.config import WorkspaceSettings
from workspace_server.experiments import ExperimentImports
from workspace_server.research_packages import ResearchPackages, read_package
from workspace_server.reproduction import comparable

try:
    import flagquantum as fq
    HAS_SDK = callable(getattr(fq, 'save', None))
except ImportError:
    HAS_SDK = False


def program():
    source = 'EDGES = [(0, 1, 2)]\n'
    code = sha256(source.encode()).hexdigest()
    return {'origin': {'source': source, 'source_hash': code, 'run_id': 'run-1'},
            'compiled': {'qubits': 2, 'depth': 2, 'instructions': [
                {'name': 'h', 'wires': [0], 'params': {}}, {'name': 'rz', 'wires': [1], 'params': {'theta': .25}},
                {'name': 'cx', 'wires': [0, 1], 'params': {}}]},
            'experiment': {'sha256': 'a'*64, 'program_hash': 'program-1', 'has_result': True,
                'python_run': {'id': 'run-1', 'source_hash': code, 'execution_status': 'completed', 'elapsed_seconds': 2},
                'execution_plan': {'resolved_options': {'seed': 42, 'shots': 100}},
                'measurements': [
                    {'kind': 'probabilities', 'qubits': [0, 1], 'value': {'values': [.1, .4, .4, .1], 'shape': [1, 4]}},
                    {'kind': 'counts', 'qubits': [0, 1], 'shots': 100, 'batches': [[{'state': k, 'count': v, 'key_type': 'string'} for k,v in [('00',10),('01',40),('10',40),('11',10)]]]}]}}


class ResearchResultsTest(unittest.TestCase):
    def test_archive_derived_metrics_units_parameters_and_resources(self):
        p = program(); r = build_result(p)
        metrics = {m['key']: m for m in r['metrics']}
        self.assertAlmostEqual(metrics['expected_cut']['value'], 1.6)
        self.assertEqual(metrics['expected_cut']['unit'], 'cut weight')
        self.assertEqual(metrics['sampled_optimum_rate']['method'], 'sampled')
        self.assertEqual(r['problem']['classical_optimum'], 2)
        self.assertEqual(r['parameters']['rotations'][0]['unit'], 'rad')
        self.assertEqual(r['parameters']['rotations'][0]['values'], {'theta': .25})
        self.assertEqual(r['parameters']['execution']['seed'], 42)
        self.assertEqual(next(x for x in r['resources'] if x['key']=='run_seconds')['scope'], 'whole Python run')
        self.assertEqual(r, build_result(copy.deepcopy(p)))

    def test_mismatched_source_run_order_truncation_and_nonfinite_values_rejected(self):
        for change in [lambda p:p['origin'].update(source='EDGES=[(0,1)]'),
                       lambda p:p['experiment']['python_run'].update(id='other'),
                       lambda p:p['experiment']['measurements'][0].update(qubits=[1,0]),
                       lambda p:p['experiment']['measurements'][0]['value'].update(truncated=True),
                       lambda p:p['experiment']['measurements'][0]['value'].update(values=[float('nan'),0,0,1]),
                       lambda p:p['experiment']['measurements'][1].update(shots=99)]:
            p=program();change(p);self.assertIsNone(build_result(p))

    def test_multi_graph_selection_is_not_guessed_and_source_is_never_evaluated(self):
        for source in ['EDGES = make_graph()\n', 'EDGES=[(0,1)]\nEDGES=[(1,2)]\n',
                       'EDGES=[(0,1)]\nfor variant, edges in variants:\n    pass\n',
                       'EDGES = __import__("os").system("false")\n']:
            p=program();code=sha256(source.encode()).hexdigest();p['origin'].update(source=source,source_hash=code);p['experiment']['python_run']['source_hash']=code
            self.assertIsNone(build_result(p))

    def test_projection_removes_stale_evidence_and_keeps_failed_state(self):
        r={'program':program(),'job':{}};attach_result(r)
        before=r['program']['experiment']['research_result']
        r['program']['experiment']['python_run']['execution_status']='failed';attach_result(r)
        self.assertEqual(r['program']['experiment']['research_result']['execution_status'],'failed')
        self.assertNotEqual(before['sha256'],r['program']['experiment']['research_result']['sha256'])
        r['program']['origin']['source_hash']='wrong';attach_result(r)
        self.assertNotIn('research_result',r['program']['experiment'])

    def test_portable_result_refuses_changed_code_or_artifact_binding(self):
        p=program();r=build_result(p);identity='fqx-'+'a'*32
        run={'id':'run-1','source':p['origin']['source'],'source_hash':p['origin']['source_hash'],'status':'completed','collection_status':'completed',
             'experiments':[{'id':identity,'sha256':'a'*64,'filename':'qaoa.fqx'}],'research_results':{identity:r}}
        validate_run(run)
        for key in ['source_sha256','archive_sha256','run_id']:
            bad=copy.deepcopy(run);bad['research_results'][identity]['binding'][key]='changed'
            with self.assertRaises(ValueError):validate_run(bad)


@unittest.skipUnless(HAS_SDK, 'Requires the real FlagQuantum save/load SDK')
class ResearchResultSDKTest(unittest.TestCase):
    def test_qaoa_metrics_survive_reopen_independent_import_reexport_and_comparison(self):
        source = '''import flagquantum as fq
EDGES = [(0, 1, 2)]
BETA = 0.4
def experiment():
    circuit = fq.Circuit(2).h(0).h(1).cx(0, 1).rz(1, 0.7).cx(0, 1).rx(0, BETA).rx(1, BETA)
    return fq.run(circuit, outputs=[fq.probabilities(), fq.counts()], options=fq.ExecutionOptions(device='cpu', backend='pytorch', shots=128, seed=42))
'''
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            settings = WorkspaceSettings(root, root / 'jobs.sqlite3', experiment_python=sys.executable)
            imports = ExperimentImports(settings)
            namespace = {}
            exec(source, namespace)
            result = namespace['experiment']()
            archive = root / 'qaoa.fqx'
            fq.save(archive, result.plan, result=result)
            run = {'id': 'qaoa-run', 'name': 'QAOA', 'source': source, 'source_hash': sha256(source.encode()).hexdigest(),
                   'status': 'completed', 'execution_status': 'completed', 'collection_status': 'completed',
                   'environment': {'transport': 'local'}, 'elapsed_seconds': 2, 'logs': []}
            record = imports.import_file(archive.read_bytes(), 'qaoa.fqx', python_run=run)
            report = record['program']['experiment']['research_result']
            probability = result.measurements[0].value.reshape(-1).tolist()
            self.assertAlmostEqual(next(m['value'] for m in report['metrics'] if m['key'] == 'expected_cut'), 2 * (probability[1] + probability[2]))
            run['experiments'] = [{'id': record['id'], 'filename': 'qaoa.fqx', 'sha256': sha256(archive.read_bytes()).hexdigest(), 'has_result': True}]
            research = {'schema': 'flagqai.research-record.v1', 'root_run': run['id'], 'root_source_sha256': run['source_hash'],
                        'goal': 'Compare saved QAOA results', 'runs': [{'id': run['id']}], 'turns': [], 'notices': [], 'adopted': None}
            runs = SimpleNamespace(get=lambda identity: run if identity == run['id'] else None,
                                   submit=Mock(side_effect=AssertionError('Import must not submit computation')))
            packages = ResearchPackages(settings, imports, runs)
            raw = packages.export({'research': research})
            _, exported_runs, _ = read_package(raw)
            self.assertEqual(exported_runs[run['id']]['research_results'][record['id']], report)
            # Simulate a legacy record that needs a deterministic metadata backfill.
            record['program']['experiment'].pop('research_result')
            imports.store.put(record)
            restored = ExperimentImports(settings).get(record['id'])
            self.assertEqual(restored['program']['experiment']['research_result'], report)
            self.assertEqual(archive.read_bytes(), imports.file(record['id']).read_bytes())
            isolated = root / 'independent'
            independent_settings = WorkspaceSettings(isolated, isolated / 'jobs.sqlite3', experiment_python=sys.executable)
            independent_imports = ExperimentImports(independent_settings)
            independent = ResearchPackages(independent_settings, independent_imports, runs)
            imported = independent.import_package(raw, 'qaoa.zip')
            canonical = imported['experiments'][record['id']]
            self.assertEqual(canonical['program']['experiment']['research_result'], report)
            self.assertEqual(comparable(restored), comparable(canonical))
            self.assertIn('research', comparable(canonical))
            local = independent_imports.get(imported['local_ids'][record['id']])
            self.assertEqual(local['program']['experiment']['research_result'], report)
            _, reexported_runs, _ = read_package(independent.export({'package_id': imported['id']}))
            self.assertEqual(reexported_runs[run['id']]['research_results'][record['id']], report)
            runs.submit.assert_not_called()
