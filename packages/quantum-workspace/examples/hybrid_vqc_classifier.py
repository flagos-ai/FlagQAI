"""Train a quantum layer with Adam on four two-bit classification examples.

The label is -1 for 00 and +1 otherwise. This is a small supervised learning
demonstration, not a Deutsch-Jozsa oracle algorithm or a quantum advantage claim.
The same data and initialization are used for the no-entangler ablation.
"""
from dataclasses import replace
import json
import time

import flagquantum as fq
import torch

N_QUBITS = 4
LAYERS = 4
STEPS = 180
SEED = 7
INPUTS = torch.tensor([[0., 0.], [0., 1.], [1., 0.], [1., 1.]])
LABELS = torch.tensor([-1., 1., 1., 1.])


def circuit_builder(parameters, inputs, *, entangle=True):
    theta = parameters["theta"]
    circuit = fq.Circuit(N_QUBITS, bsz=inputs.shape[0] if inputs.ndim > 1 else 1)
    # Fixed gate topology: encode sample values in angles, never Python branches.
    circuit.ry(1, theta=torch.pi * inputs[..., 0])
    circuit.ry(2, theta=torch.pi * inputs[..., 1])
    for layer in range(LAYERS):
        for wire in range(N_QUBITS):
            circuit.ry(wire, theta=theta[layer, wire])
        if entangle:  # A fixed configuration flag, independent of Tensor data.
            for wire in range(N_QUBITS):
                circuit.cx(wire, (wire + 1) % N_QUBITS)
    return circuit


def objective(value):
    return (value.reshape(-1) - LABELS).square().mean()


def make_model(entangle, initial):
    model = fq.Module(
        lambda parameters, inputs: circuit_builder(parameters, inputs, entangle=entangle),
        parameters={"theta": (LAYERS, N_QUBITS)},
        init={"theta": initial.clone()},
        policy=fq.RuntimePolicy(observable="z", observable_qubits=(0,)),
        seed=SEED,
    )
    return model


def preflight(model):
    before_parameters = [p.detach().clone() for p in model.parameters()]
    before = model(INPUTS)
    assert before.numel() == len(INPUTS), "One output is required per sample"
    assert torch.isfinite(before).all()
    assert not torch.allclose(before, model(torch.zeros_like(INPUTS))), "Inputs must affect the output"
    loss = objective(before)
    assert torch.isfinite(loss)
    loss.backward()
    gradients = [p.grad for p in model.parameters()]
    assert all(g is not None and torch.isfinite(g).all() for g in gradients)
    assert any(float(g.norm()) > 1e-8 for g in gradients), "Training must have a nonzero gradient"
    torch.optim.Adam(model.parameters(), lr=0.08).step()
    assert any(not torch.equal(old, p.detach()) for old, p in zip(before_parameters, model.parameters()))
    return {"forward": True, "input_dependent": True, "finite_nonzero_gradient": True,
            "optimizer_update": True, "initial_loss": float(loss.detach()), "steps": 1}


def train_variant(entangle, initial):
    model = make_model(entangle, initial)
    before = model(INPUTS)
    initial_loss = float(objective(before).detach())
    objective(before).backward()
    gradient = model.named_parameter_groups["theta"].grad
    assert gradient is not None and torch.isfinite(gradient).all()
    assert float(gradient.norm()) > 1e-8, "Training must have a nonzero gradient"
    model.zero_grad(set_to_none=True)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.08)
    started = time.perf_counter()
    training = fq.train(model, optimizer=optimizer, objective=objective,
                        inputs=INPUTS, steps=STEPS)
    with torch.no_grad():
        scores = model(INPUTS).reshape(-1)
        loss = float(objective(scores))
    theta = model.named_parameter_groups["theta"].detach().clone()
    assert training.completed_steps == STEPS
    assert loss < initial_loss
    assert not torch.equal(theta, initial)
    report = {
        "initial_loss": initial_loss, "final_loss": loss,
        "accuracy": float(((scores > 0) == (LABELS > 0)).float().mean()),
        "scores": scores.tolist(), "steps": training.completed_steps,
        "seconds": time.perf_counter() - started,
        "gradient_checked": True, "parameters_changed": True,
    }
    return theta, scores, report


def main(*, preflight_only=False):
    torch.manual_seed(SEED)
    initial = 0.3 * torch.randn(LAYERS, N_QUBITS)
    checked = preflight(make_model(True, initial))
    if preflight_only:
        print(json.dumps({"schema": "flagqai.hybrid-preflight.v1", **checked}))
        return checked
    theta, scores, trained = train_variant(True, initial)
    _, _, control = train_variant(False, initial)
    majority_accuracy = float((LABELS > 0).float().mean())
    assert trained["accuracy"] > majority_accuracy
    # A no-entangler ablation is not a bound on all classical/product models.
    report = {
        "schema": "flagqai.hybrid-training.v1",
        "task": "two-bit zero-versus-nonzero supervised classification",
        "seed": SEED, "qubits": N_QUBITS, "layers": LAYERS,
        "inputs": INPUTS.tolist(), "labels": LABELS.tolist(),
        "preflight": checked, "trained": trained, "no_entangler": control,
        "majority_accuracy": majority_accuracy,
        "quantum_advantage_claim": False, "sampling_checks": [],
    }
    for index, inputs in enumerate(INPUTS):
        circuit = circuit_builder({"theta": theta}, inputs)
        result = fq.run(circuit, outputs=fq.counts(qubits=(0,)),
                        options=fq.ExecutionOptions(shots=4096, seed=SEED + index))
        counts = result.counts[0]
        measured = sum((1 if bits == "0" else -1) * count
                       for bits, count in counts.items()) / sum(counts.values())
        error = abs(measured - float(scores[index]))
        assert error < 0.08, "Sampled readout must agree with the trained model"
        report["sampling_checks"].append({"sample": index,
            "expected": float(scores[index]), "measured": measured,
            "absolute_error": error, "shots": 4096, "seed": SEED + index})
        if index == 0:
            saved = result
    recorded = replace(saved, metrics={**saved.metrics, "flagqai_hybrid_training": report})
    fq.save("hybrid-vqc-trained.fqx", recorded.plan, result=recorded)
    archived = fq.load("hybrid-vqc-trained.fqx")
    assert archived.result.metrics["flagqai_hybrid_training"] == report
    replay = fq.run(archived.program,
                    options=fq.ExecutionOptions(shots=4096, seed=SEED))
    assert replay.counts == saved.counts
    print(json.dumps(report, indent=2))
    print("Training, ablation, all four sampled readouts and saved-circuit replay passed.")
    return report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preflight", action="store_true", help="Check one optimizer step without full training or saving artifacts")
    main(preflight_only=parser.parse_args().preflight)
