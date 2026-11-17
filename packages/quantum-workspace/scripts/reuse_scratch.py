"""Reuse scratch slots in a bounded KMX circuit after unconditional reset."""
import argparse
import heapq
import json
from pathlib import Path
import re

LIMIT = 2 * 1024 * 1024
WORD = re.compile(r'[^ \t\r\n#]+')
QUBIT = re.compile(r'q([0-9]+)')
BIT = re.compile(r'b[0-9]+')
REGISTER = re.compile(r'r[0-9]+')
ANGLE = re.compile(r'[+-]?[0-9]+\.[0-9]+')
EXTRA_OPERAND = {'HMR': BIT, 'Z_POW': ANGLE}
QUBIT_ARITY = {
    'X': 1, 'Z': 1, 'CX': 2, 'CZ': 2, 'CCX': 3, 'CCZ': 3,
    'CSWAP': 3, 'SWAP': 2, 'R': 1, 'HMR': 1, 'Z_POW': 1, 'NEG': 0,
    'PUSH_CONDITION': 0, 'POP_CONDITION': 0,
}


def interface_qubits(instructions):
    pins = set()
    for tokens in instructions:
        if not tokens or tokens[0].group() != 'APPEND_TO_REGISTER':
            continue
        words = [token.group() for token in tokens]
        if (len(words) != 3 or not REGISTER.fullmatch(words[2]) or
                not (QUBIT.fullmatch(words[1]) or BIT.fullmatch(words[1]))):
            raise ValueError('Invalid APPEND_TO_REGISTER instruction.')
        if words[1].startswith('q'):
            pins.add(int(words[1][1:]))
    if not pins:
        raise ValueError('Explicit quantum interface registers are required.')
    return pins


def gate_operands(tokens, op):
    if op not in QUBIT_ARITY:
        raise ValueError('Unsupported instruction: ' + op)
    arity = QUBIT_ARITY[op]
    qubits = tokens[1:1 + arity]
    if len(qubits) != arity or any(not QUBIT.fullmatch(token.group()) for token in qubits):
        raise ValueError('Invalid quantum operands for ' + op)
    rest = [token.group() for token in tokens[1 + arity:]]
    extra = EXTRA_OPERAND.get(op)
    if extra is not None:
        if not rest or not extra.fullmatch(rest[0]):
            raise ValueError('Missing or invalid operand for ' + op)
        rest = rest[1:]
    conditional = len(rest) == 2 and rest[0] == 'if' and BIT.fullmatch(rest[1]) is not None
    if ((rest and not conditional) or
            (op == 'PUSH_CONDITION' and not conditional) or
            (op == 'POP_CONDITION' and conditional)):
        raise ValueError('Invalid condition for ' + op)
    return qubits, conditional


def transform(source):
    if len(source.encode('utf-8')) > LIMIT:
        raise ValueError('Source exceeds 2 MiB.')
    lines = source.splitlines(keepends=True)
    instructions = [list(WORD.finditer(line.partition('#')[0])) for line in lines]
    pins = interface_qubits(instructions)
    active = {q: q for q in pins}
    free, output, events = [], [], []
    next_wire = max(pins) + 1
    depth = 0
    original = set(pins)
    for line_number, (line, tokens) in enumerate(zip(lines, instructions), start=1):
        if not tokens or tokens[0].group() in ('APPEND_TO_REGISTER', 'REGISTER', 'INFO_TAG'):
            output.append(line)
            continue
        op = tokens[0].group()
        operands, conditional = gate_operands(tokens, op)
        wires = [int(token.group()[1:]) for token in operands]
        original.update(wires)
        for wire in wires:
            if wire in active:
                continue
            if free:
                active[wire] = heapq.heappop(free)
            else:
                active[wire] = next_wire
                next_wire += 1
        # Replace only the quantum operands. Keep quoted metadata, comments,
        # angles, conditions and all classical registers as written.
        for operand, wire in reversed(list(zip(operands, wires))):
            if active[wire] != wire:
                line = line[:operand.start()] + f'q{active[wire]}' + line[operand.end():]
        output.append(line)

        if op == 'PUSH_CONDITION':
            depth += 1
        elif op == 'POP_CONDITION':
            depth -= 1
            if depth < 0:
                raise ValueError('Unbalanced condition stack.')
        elif op in ('R', 'HMR') and depth == 0 and not conditional and wires[0] not in pins:
            # These KMX instructions reset the target to zero. A conditional
            # reset cannot release a slot on paths where the reset is skipped.
            wire = wires[0]
            physical = active.pop(wire)
            heapq.heappush(free, physical)
            events.append({'line': line_number, 'logical': wire, 'slot': physical, 'reset': op})
    if depth:
        raise ValueError('Unbalanced condition stack.')
    return ''.join(output), {
        'schema': 'flagqai.scratch-reuse.v1',
        'pinned_interface': sorted(pins),
        'original_qubits': max(original) + 1,
        'candidate_qubits': next_wire,
        'released_resets': len(events),
        'release_events': events,
        'gate_order_and_angles_unchanged': True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    with args.source.open('rb') as source:
        raw = source.read(LIMIT + 1)
    if len(raw) > LIMIT:
        raise ValueError('Source exceeds 2 MiB.')
    candidate, report = transform(raw.decode('utf-8'))
    if args.output.resolve() == args.report.resolve():
        raise ValueError('Use distinct paths for the candidate and report.')
    created = []
    try:
        for path, content in ((args.output, candidate), (args.report, json.dumps(report, indent=2) + '\n')):
            with path.open('x', encoding='utf-8', newline='') as stream:
                created.append(path)
                stream.write(content)
    except OSError:
        for path in created:
            path.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    main()
