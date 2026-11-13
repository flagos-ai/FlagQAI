"""Only compiler attribution establishes semantic groups; never infer from gates."""
from pathlib import Path
from types import SimpleNamespace
from dataclasses import replace
from hashlib import sha256
import json
import os
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
from workspace_server.synthesis_projection import project_synthesis

try:
    import flagquantum as fq
    HAS_SDK = callable(getattr(fq, 'save', None))
except ImportError:
    HAS_SDK = False


class SynthesisProjectionTests(unittest.TestCase):
    def project(self, origins, manifest=None, routing=None):
        nodes = [{'id': 'mul/compute', 'label': 'Compute', 'operation': 'qint.multiply', 'action': 'compute'},
                 {'id': 'add/compute', 'label': 'Compute', 'operation': 'qint.add', 'action': 'compute'}]
        metadata = {'flagquantum.synthesis': manifest or {'schema': 'flagquantum.synthesis-source.v1', 'nodes': nodes, 'registers': {'x': [0]}}}
        if routing is not None: metadata['routing'] = routing
        ir = SimpleNamespace(metadata=metadata, n_wires=2, instructions=[SimpleNamespace(metadata={'flagquantum.synthesis.origins': keys}) for keys in origins])
        instructions = [{'name': 'cx', 'wires': [0, 1], 'params': {}} for _ in origins]
        return project_synthesis(ir, instructions)

    def test_noncontiguous_and_combined_origins_preserve_exact_gate_order(self):
        projected = self.project([['mul/compute'], ['add/compute'], ['mul/compute'], ['mul/compute', 'add/compute']])
        children = projected['hierarchy']['children']
        self.assertEqual([node['gate_indices'] for node in children], [[0], [1], [2], [3]])
        self.assertEqual([node['label'] for node in children], ['Multiply · Compute', 'Add · Compute', 'Multiply · Compute', 'Combined: Multiply · Compute + Add · Compute'])
        self.assertEqual(projected['logical_instructions'][3]['source_ids'], ['mul/compute', 'add/compute'])
        self.assertEqual(projected['instructions'][3]['source_ids'], ['mul/compute', 'add/compute'])

    def test_unmapped_and_removed_operations_are_not_fabricated(self):
        projected = self.project([[], ['mul/compute']])
        self.assertEqual(projected['hierarchy']['children'][0]['label'], 'Unmapped operations')
        self.assertNotIn('Add', ' '.join(n['label'] for n in projected['hierarchy']['children']))
        self.assertEqual(self.project([[]]), {})
        self.assertEqual(self.project([['unknown']]), {})

    def test_registers_follow_the_recorded_final_layout(self):
        self.assertEqual(self.project([['mul/compute']], routing={'final_logical_to_physical': [1, 0]})['registers'], [{'name': 'x', 'wires': [1]}])
        self.assertEqual(self.project([['mul/compute']], routing={'final_logical_to_physical': [[1], 0]})['registers'], [])
        for routing in ({'topology': 'line'}, {'final_logical_to_physical': [0, 0]}, 'unknown'):
            self.assertEqual(self.project([['mul/compute']], routing=routing)['registers'], [])

    def test_mismatched_gate_projection_cannot_drop_instructions(self):
        ir = SimpleNamespace(metadata={}, instructions=[SimpleNamespace(metadata={})])
        self.assertEqual(project_synthesis(ir, []), {})

    def test_malformed_metadata_cannot_create_semantic_labels(self):
        for nodes in [[{'id': 'x', 'operation': []}], [{'id': 'x'}, {'id': 'x'}], [{'id': 'x', 'line': -1}]]:
            self.assertEqual(self.project([['x']], {'schema': 'flagquantum.synthesis-source.v1', 'nodes': nodes}), {})


@unittest.skipUnless(HAS_SDK, 'Requires the merged FlagQuantum save/load SDK')
class SynthesisProjectionIntegrationTests(unittest.TestCase):
    def test_real_archive_and_explicit_publisher_share_attribution_without_running(self):
        # This is a declared attribution fixture, not a claim that H/CX implement
        # multiplication. Real compiler output is a separate local acceptance.
        manifest = {'schema': 'flagquantum.synthesis-source.v1', 'entry': 'fixture',
                    'nodes': [{'id': 'prepare', 'label': 'Prepare'}, {'id': 'entangle', 'label': 'Entangle'}],
                    'registers': {'input': [0], 'output': [1]}}
        plan = fq.compile(fq.Circuit(2).h(0).cx(0, 1))
        ir = replace(plan, metadata={**plan.metadata, 'flagquantum.synthesis': manifest},
                     instructions=tuple(replace(gate, metadata={**gate.metadata, 'flagquantum.synthesis.origins': [origin]})
                                        for gate, origin in zip(plan.instructions, ['prepare', 'entangle'])))
        server = Path(__file__).resolve().parents[1] / 'local/workspace_server'
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'fixture.fqx'
            published = Path(directory) / 'published.json'
            fq.save(archive, ir)
            before = sha256(archive.read_bytes()).hexdigest()
            worker = runpy.run_path(str(server / 'experiment_worker.py'))
            helper = (server / 'synthesis_projection.py').read_text() + '\n' + (server / 'python_publish.py').read_text()
            namespace = {}
            exec(compile(helper, '<trusted-test-publisher>', 'exec'), namespace)
            with patch.object(fq, 'run', side_effect=AssertionError('Projection must never execute a circuit')):
                imported = worker['project'](str(archive))
                with patch.dict(os.environ, {'FQ_WEB_ARTIFACT': str(published)}):
                    namespace['publish'](ir, name='Attribution fixture')
            self.assertEqual(sha256(archive.read_bytes()).hexdigest(), before)
            from_file = imported['compiled']
            explicit = json.loads(published.read_text())['compiled']
            self.assertEqual(from_file['hierarchy'], explicit['hierarchy'])
            self.assertEqual(from_file['synthesis_sources'], manifest['nodes'])
            self.assertEqual([node['label'] for node in from_file['hierarchy']['children']], ['Prepare', 'Entangle'])
            self.assertEqual([g['source_ids'] for g in from_file['instructions']], [['prepare'], ['entangle']])
            self.assertEqual(from_file['registers'], [{'name': 'input', 'wires': [0]}, {'name': 'output', 'wires': [1]}])
