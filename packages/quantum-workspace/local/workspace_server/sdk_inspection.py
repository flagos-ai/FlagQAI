"""Fixed read-only API probe, evaluated only in the selected SDK interpreter."""

PROBE = '''
import importlib, inspect, json
import flagquantum as fq

def describe(value):
    try:
        signature = str(inspect.signature(value))[:1000]
    except (ValueError, TypeError):
        signature = None
    return {"signature": signature, "doc": (inspect.getdoc(value) or "")[:600]}

apis = {}
for name in ("Circuit", "Module", "RuntimePolicy", "train", "ExecutionOptions", "run", "save", "load", "counts", "samples", "probabilities", "statevector"):
    value = getattr(fq, name, None)
    if value is not None:
        apis["fq." + name] = describe(value)
for name in ("h", "x", "cx", "cswap", "swap", "cphase", "rx", "ry", "rz", "plan", "measure", "probabilities", "counts", "sample"):
    value = getattr(fq.Circuit, name, None)
    if value is not None:
        apis["fq.Circuit." + name] = describe(value)
try:
    module = importlib.import_module("flagquantum.algorithms.primitives.qft")
    apis["flagquantum.algorithms.primitives.qft.append_qft"] = describe(module.append_qft)
except (ImportError, AttributeError):
    pass
try:
    synth = importlib.import_module("flagquantum.synth")
except ImportError:
    synth = None
if synth:
    for name in ("synthesize", "UInt", "InputState", "qfunc", "Output", "QNum", "allocate", "hadamard_transform"):
        value = getattr(synth, name, None)
        if value is not None:
            apis["flagquantum.synth." + name] = describe(value)
print(json.dumps({"sdk_version": getattr(fq, "__version__", None), "sdk_path": fq.__file__, "apis": apis}))
'''
