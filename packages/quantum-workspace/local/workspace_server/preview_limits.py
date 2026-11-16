"""Display bounds for recorded circuits, independent of execution limits."""

MAX_PREVIEW_QUBITS = 256
MAX_PREVIEW_GATES = 2000


def validate_preview_size(qubits, gates):
    if type(qubits) is not int or not 1 <= qubits <= MAX_PREVIEW_QUBITS or gates > MAX_PREVIEW_GATES:
        raise ValueError(
            f'Circuit preview supports 1–{MAX_PREVIEW_QUBITS} qubits and at most {MAX_PREVIEW_GATES} gates.'
        )
