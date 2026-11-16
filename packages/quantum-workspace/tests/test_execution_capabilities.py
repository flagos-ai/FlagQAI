"""Capability catalog preserves missing platforms without inventing availability."""
import sys
import tempfile
from pathlib import Path
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local'))
from workspace_server.execution_capabilities import execution_capabilities

class CapabilityTests(unittest.TestCase):
    def report(self, accelerators=(), platforms=(), sdk_file=None):
        registry=ModuleType('flagquantum.runtime.backend_registry')
        registry.capability_summary=lambda *args,**kwargs:{'accelerators':accelerators}
        compute=ModuleType('flagquantum.compute')
        compute.list_platform_status=lambda:platforms
        circuit=SimpleNamespace(h=lambda _:circuit,cx=lambda *_:circuit)
        def run(*args,options,**kwargs):
            if options.mode=='stabilizer':raise RuntimeError('Missing optional dependency')
            return SimpleNamespace(runtime={'mode':options.mode,'device':options.device},counts=[{'00':8}])
        fq=SimpleNamespace(__file__=sdk_file,__version__='fixture',Circuit=lambda _:circuit,counts=lambda:None,ExecutionOptions=lambda **kwargs:SimpleNamespace(**kwargs),run=run)
        with patch.dict(sys.modules,{'flagquantum.runtime.backend_registry':registry,'flagquantum.compute':compute}):
            return execution_capabilities(fq)

    def test_qpu_catalog_only_inspects_local_modules_without_loading_providers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            modules = root / 'remote' / 'qpu'
            modules.mkdir(parents=True)
            (modules / 'quafu.py').write_text('raise AssertionError("Provider must not be imported")')
            hardware = self.report(sdk_file=str(root / '__init__.py'))['hardware']
        providers = {row['id']:row for row in hardware['providers']}
        self.assertEqual(set(providers), {'quafu', 'braket', 'azure', 'http'})
        self.assertEqual(providers['quafu']['adapter_status'], 'module_present')
        self.assertEqual(providers['azure']['adapter_status'], 'not_found')
        self.assertFalse(hardware['available'])
        for row in providers.values():
            self.assertEqual(row['devices'], [])
            self.assertEqual(row['connection_status'], 'not_connected')

    def test_missing_gpu_and_runtime_remain_visible_and_unavailable(self):
        report=self.report(platforms=({'device_type':'flagos','optional_dependency':'torch_fl','installed':False,'activated':False},))
        families={row['id']:row for row in report['device_families']}
        self.assertEqual(families['cpu']['status'],'detected')
        self.assertEqual(families['cuda']['status'],'not_detected')
        self.assertEqual(families['flagos']['status'],'dependency_missing')
        self.assertIn('torch_fl',families['flagos']['reason'])
        self.assertEqual([row['id'] for row in report['devices']],['cpu'])
        self.assertFalse(next(row for row in report['devices'][0]['methods'] if row['id']=='stabilizer')['available'])
        self.assertEqual(report['other_workflows'][0]['id'],'pauli_propagation')

    def test_actual_accelerator_names_and_devices_are_preserved(self):
        report=self.report(accelerators=({'kind':'cuda','index':1,'name':'GPU fixture','available':True},{'kind':'flagos','index':0,'name':'Domestic AI fixture','available':True}))
        devices={row['id']:row for row in report['devices']}
        self.assertEqual(devices['cuda:1']['label'],'GPU fixture')
        self.assertEqual(devices['flagos:0']['label'],'Domestic AI fixture')
        self.assertTrue(devices['flagos:0']['methods'][0]['available'])

    def test_inactive_optional_provider_is_not_claimed_as_missing_hardware(self):
        report=self.report(platforms=({'device_type':'flagos','optional_dependency':'torch_fl','installed':True,'activated':False},))
        family=next(row for row in report['device_families'] if row['id']=='flagos')
        self.assertEqual(family['status'],'not_activated')

if __name__=='__main__':unittest.main()
