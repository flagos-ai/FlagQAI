import unittest, subprocess
from unittest.mock import Mock, patch
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local'))
from flagquantum_adapter import SSHCPUAdapter
from quantum_workspace_protocol import CircuitRequest, source_hash
from workspace_server.service import QuantumWorkspaceService, QueueFullError

class BackendTests(unittest.TestCase):
    def test_rejects_qmod_and_invalid_limits(self):
        for data in [{'source':'qfunc main() {}'},{'source':'OPENQASM 2.0;','shots':True},{'source':'OPENQASM 2.0;','shots':100001},{'source':'OPENQASM 2.0;','seed':-1},{'source':'x'*32769}]:
            with self.assertRaises(ValueError): CircuitRequest.parse(data)

    @patch('flagquantum_adapter.ssh_cpu.subprocess.run')
    def test_ssh_failure_is_not_success(self, run):
        run.return_value=subprocess.CompletedProcess([],255,stdout='',stderr='connection refused')
        with self.assertRaisesRegex(RuntimeError,'connection refused'):
            SSHCPUAdapter('test.invalid').execute({'source':'OPENQASM 2.0;'})
        command=run.call_args.args[0]
        self.assertIn('StrictHostKeyChecking=yes', command)
        self.assertIn('ForwardAgent=no', command)
        self.assertIn('ForwardX11=no', command)

    def test_missing_provider_configuration_does_not_start_ssh(self):
        with patch('flagquantum_adapter.ssh_cpu.subprocess.run') as run:
            with self.assertRaisesRegex(RuntimeError, 'Configure FQ_SSH_TARGET'):
                SSHCPUAdapter(None).execute({})
            run.assert_not_called()

    def test_failed_job_is_persisted_and_slot_released(self):
        store,adapter=Mock(),Mock()
        adapter.execute.side_effect=RuntimeError('invalid circuit')
        service=QuantumWorkspaceService(store,adapter)
        service.slots=Mock()
        service._execute({'id':'test-job','status':'queued','request':{}})
        self.assertEqual(store.put.call_args.args[0]['status'],'failed')
        service.slots.release.assert_called_once()
        service.close()

    def test_queue_full_does_not_call_compute(self):
        service=QuantumWorkspaceService(Mock(),Mock())
        service.slots=Mock();service.slots.acquire.return_value=False
        with self.assertRaises(QueueFullError):service.compile({'source':'OPENQASM 2.0;'})
        service.adapter.execute.assert_not_called()
        service.close()

    def test_compile_binds_result_to_source_snapshot(self):
        service=QuantumWorkspaceService(Mock(),Mock())
        service.adapter.execute.return_value={'qubits':2,'instructions':[]}
        source='OPENQASM 2.0; qreg q[2];'
        result=service.compile({'source':source})
        self.assertEqual(result['source_hash'],source_hash(source))
        self.assertEqual(result['protocol_version'],'quantum-workspace.v1')
        service.close()

class MetadataTests(unittest.TestCase):
    def test_real_bit_order_and_little_endian_register_values(self):
        from flagquantum_adapter.model_metadata import decode_counts
        registers=[{'name':'x','wires':[0,1]},{'name':'res','wires':[2,3,4,5]}]
        rows=decode_counts({'100101':17},registers,6)
        self.assertEqual(rows[0]['values'],{'x':1,'res':10})
    def test_source_lines_and_modules(self):
        from flagquantum_adapter.model_metadata import source_metadata
        source='OPENQASM 2.0;\nqreg q[2];\n// @register x 0 1\n// @module prepare | Hadamard\nh q[0];\ncx q[0],q[1];'
        registers,groups,gates=source_metadata(source,[{'name':'h','wires':[0]},{'name':'cx','wires':[0,1]}],2)
        self.assertEqual(gates[0]['line'],5);self.assertEqual(gates[1]['group'],'prepare')
        self.assertEqual(groups['prepare'],'Hadamard');self.assertEqual(registers[0]['wires'],[0,1])
    def test_mismatched_gates_do_not_get_false_source_links(self):
        from flagquantum_adapter.model_metadata import source_metadata
        _,_,gates=source_metadata('x q[0];',[{'name':'h','wires':[0]}],1)
        self.assertIsNone(gates[0]['line']);self.assertEqual(gates[0]['group'],'ungrouped')
    def test_invalid_register_is_rejected(self):
        from flagquantum_adapter.model_metadata import source_metadata
        with self.assertRaises(ValueError):source_metadata('// @register x 0 4',[],2)


class HierarchyTests(unittest.TestCase):
    def test_nested_modules_have_exact_coverage_and_source_ranges(self):
        from flagquantum_adapter.model_metadata import source_metadata,build_hierarchy
        source='OPENQASM 2.0;\nqreg q[3];\n// @module main | Program\n// @module main/prepare/hadamard | Superposition\nh q[0];\n// @module main/compute/entangle | Entangle\ncx q[0],q[1];\ncx q[1],q[2];'
        _,groups,gates=source_metadata(source,[{'name':'h','wires':[0]},{'name':'cx','wires':[0,1]},{'name':'cx','wires':[1,2]}],3)
        root=build_hierarchy(gates,groups);main=root['children'][0]
        self.assertEqual(main['id'],'main');self.assertEqual(main['gate_indices'],[0,1,2])
        self.assertEqual(main['depth'],3);self.assertEqual(main['source_start'],5);self.assertEqual(main['source_end'],8)
        self.assertEqual(main['children'][1]['children'][0]['gate_count'],2)
        self.assertEqual(main['children'][0]['children'][0]['wires'],[0])
    def test_noncontiguous_modules_are_rejected(self):
        from flagquantum_adapter.model_metadata import build_hierarchy
        with self.assertRaisesRegex(ValueError,'contiguous'):
            build_hierarchy([{'name':'x','wires':[0],'group':g} for g in ['a','b','a']],{})
    def test_conflicting_labels_are_rejected(self):
        from flagquantum_adapter.model_metadata import source_metadata
        with self.assertRaisesRegex(ValueError,'conflicting'):
            source_metadata('// @module main/a | First\nx q[0];\n// @module main/a | Different\nx q[0];',[{'name':'x','wires':[0]}]*2,1)

if __name__=='__main__':unittest.main()
