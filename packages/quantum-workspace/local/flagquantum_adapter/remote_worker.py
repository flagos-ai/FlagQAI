"""Fixed remote driver. User input is parsed as OpenQASM, never Python."""
import json,sys,time,collections
started=time.monotonic()
try:
    import torch
    torch.set_num_threads(2)
    import flagquantum as fq
    request=json.load(sys.stdin)
    source=request['source']
    if not isinstance(source,str) or len(source.encode())>32768:
        raise ValueError('Model must be at most 32 KiB.')
    imported=fq.from_openqasm(source)
    if not 1<=imported.n_qubits<=16 or len(imported.instructions)>2000:
        raise ValueError('Local pilot supports 1–16 qubits and at most 2000 gates.')
    if imported.measurement_qubits and tuple(imported.measurement_qubits)!=tuple(range(imported.n_qubits)):
        raise ValueError('Measure every qubit in order, or omit measurement statements.')
    circuit=imported.to_circuit()
    compiled=fq.compile(circuit)
    def instruction_data(i):
        return {'name':i.name,'wires':list(i.wires),'params':{k:v.tolist() if hasattr(v,'tolist') else v for k,v in i.params.items()}}
    instructions=[instruction_data(i) for i in compiled.instructions]
    registers,groups,logical=source_metadata(source,[instruction_data(i) for i in imported.instructions],imported.n_qubits)
    depths=[0]*compiled.n_wires
    for i in compiled.instructions:
        depth=max((depths[w] for w in i.wires),default=0)+1
        for w in i.wires:depths[w]=depth
    response={'version':fq.__version__,'qubits':compiled.n_wires,'depth':max(depths,default=0),'gate_counts':dict(collections.Counter(i.name for i in compiled.instructions)),'instructions':instructions,'source_format':'OpenQASM','backend':'flagquantum_pytorch_cpu','registers':registers,'groups':groups,'logical_instructions':logical,'source_bit_order':'q0_first','hierarchy':build_hierarchy(logical,groups),'measurement_qubits':list(imported.measurement_qubits)}
    if request.get('operation')=='run':
        shots=request.get('shots',1024);seed=request.get('seed',42)
        if type(shots) is not int or not 1<=shots<=100000:raise ValueError('Shots must be 1–100000.')
        if type(seed) is not int or not 0<=seed<=2147483647:raise ValueError('Seed must be 0–2147483647.')
        result=fq.run(compiled,outputs=fq.counts(),options=fq.ExecutionOptions(shots=shots,seed=seed,device='cpu',backend='pytorch',allow_backend_fallback=False))
        counts=next(m.value[0] for m in result.measurements if m.kind=='counts')
        if sum(counts.values())!=shots:raise RuntimeError('Returned counts do not match requested shots.')
        response.update(counts={k:int(v) for k,v in counts.items()},shots=shots,seed=seed,runtime=result.runtime,decoded=decode_counts(counts,registers,compiled.n_wires))
    response['elapsed_seconds']=round(time.monotonic()-started,3)
    print(json.dumps({'ok':True,'result':response}))
except Exception as error:
    print(json.dumps({'ok':False,'error':str(error)[:2000]}))
    sys.exit(1)
