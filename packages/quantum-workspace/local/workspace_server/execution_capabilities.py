"""Fixed SDK-side probes. Never contact a QPU, scheduler or model provider."""

def execution_capabilities(fq):
    try:
        from flagquantum.runtime.backend_registry import capability_summary
        capabilities = dict(capability_summary('pytorch', refresh=True))
    except (ImportError, AttributeError, TypeError):
        # An older SDK can still prove CPU methods, but cannot prove accelerators.
        capabilities = {}
    candidates = [('cpu', 'CPU')]
    for accelerator in capabilities.get('accelerators', ())[:8]:
        if not accelerator.get('available'):
            continue
        kind = accelerator.get('device_type') or accelerator['kind']
        device = kind + ':' + str(accelerator['index'])
        candidates.append((device, accelerator.get('name') or device))
    methods = [('statevector', 'Statevector · SV'), ('mps', 'Matrix product state · MPS'),
               ('tensor_network', 'Tensor network · TN'), ('density_matrix', 'Density matrix'),
               ('stabilizer', 'Stabilizer')]
    devices = []
    for device, label in dict(candidates).items():
        rows = []
        for method, name in methods:
            row = {'id':method, 'label':name, 'available':False}
            try:
                result = fq.run(fq.Circuit(2).h(0).cx(0, 1), outputs=fq.counts(),
                    options=fq.ExecutionOptions(mode=method, backend='pytorch', device=device,
                        shots=8, seed=42, precision='complex64', allow_backend_fallback=False))
                runtime = dict(result.runtime)
                if runtime.get('mode') != method:
                    raise RuntimeError('SDK did not confirm the requested simulation method.')
                if device != 'cpu' and runtime.get('device') != device:
                    raise RuntimeError('SDK did not confirm execution on this accelerator; the Web cannot enable it yet.')
                if runtime.get('device') not in (None, device):
                    raise RuntimeError('SDK reported a different compute device.')
                if sum(result.counts[0].values()) != 8:
                    raise RuntimeError('SDK did not return the requested number of shots.')
                row.update(available=True, runtime=runtime)
            except Exception as error:
                row['reason'] = str(error)[:500]
            rows.append(row)
        devices.append({'id':device, 'label':label, 'methods':rows})
    try:
        from flagquantum.compute import list_platform_status
        platforms = {row['device_type']:row for row in list_platform_status()}
    except (ImportError, AttributeError):
        platforms = {}
    families = []
    for family, label in (('cpu', 'CPU'), ('cuda', 'GPU · CUDA'), ('flagos', 'AI accelerators · FlagOS / Torch-FL (including compatible domestic chips)')):
        detected = [row for row in devices if row['id'].split(':')[0] == family]
        platform = platforms.get(family, {})
        if detected:
            status = 'detected'
            reason = 'Use the individual device and method probe results.'
        elif platform.get('optional_dependency') and not platform.get('installed'):
            status = 'dependency_missing'
            reason = 'Install a compatible ' + str(platform['optional_dependency']) + ' runtime in the selected environment, then check capabilities.'
        elif platform.get('installed') and platform.get('activated') is False:
            status = 'not_activated'
            reason = 'The SDK provider is installed but not activated. Activate it on the compute machine, then check again.'
        else:
            status = 'not_detected'
            reason = 'No device was detected in this environment. Choose a compute machine with this device and its compatible runtime.'
        families.append({'id':family, 'label':label, 'status':status, 'reason':reason})
    # Inspect adapter files only: never construct provider clients or read credentials.
    from pathlib import Path
    sdk_root = Path(fq.__file__).parent if getattr(fq, '__file__', None) else None
    providers = []
    for identifier, label, module in (
            ('quafu', 'QUAFU', 'quafu'),
            ('braket', 'Amazon Braket', 'braket'),
            ('azure', 'Azure Quantum', 'azure'),
            ('http', 'Custom quantum service · HTTP', 'http')):
        present = bool(sdk_root and (sdk_root / 'remote' / 'qpu' / (module + '.py')).is_file())
        providers.append({'id':identifier, 'label':label,
            'adapter_status':'module_present' if present else 'not_found',
            'connection_status':'not_connected', 'devices':[]})
    return {'schema':'flagqai.execution-capabilities.v1', 'sdk_version':fq.__version__,
        'backend':'pytorch', 'devices':devices, 'precisions':['complex64'],
        'registry':capabilities, 'device_families':families,
        'hardware':{'available':False, 'providers':providers, 'reason':'QPU submission is not connected to this Web executor. No hardware discovery or paid submission was made.'},
        'scales':[{'id':'single_device', 'label':'Single node · single device', 'available':True},
                  {'id':'multi_device', 'label':'Single node · multiple devices', 'available':False, 'reason':'A multi-device launcher is not connected to this Web executor.'},
                  {'id':'multi_node', 'label':'Multiple nodes', 'available':False, 'reason':'A cluster launcher and allocation are required; an SDK distributed flag alone does not establish multi-node execution.'}],
        'other_workflows':[{'id':'pauli_propagation', 'label':'Pauli propagation', 'reason':'Requires an observable/expectation workflow; not a counts simulation method.'},
                           {'id':'dynamics', 'label':'Dynamics', 'reason':'Requires a Hamiltonian, time grid and solver workflow.'}]}
