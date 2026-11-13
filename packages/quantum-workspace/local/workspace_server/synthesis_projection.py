"""Project compiler-owned source attribution without inferring gate semantics."""
from collections import Counter
from collections.abc import Mapping


def project_synthesis(ir, instructions):
    if len(ir.instructions) != len(instructions):
        return {}
    manifest = ir.metadata.get('flagquantum.synthesis')
    if not isinstance(manifest, Mapping) or manifest.get('schema') != 'flagquantum.synthesis-source.v1':
        return {}
    nodes = manifest.get('nodes', ())
    if not isinstance(nodes, (list, tuple)) or len(nodes) > 10000:
        return {}
    catalog = {}
    for node in nodes:
        if not isinstance(node, Mapping) or not isinstance(node.get('id'), str) or len(node['id']) > 256:
            return {}
        if node['id'] in catalog:
            return {}
        if any(key in node and (not isinstance(node[key], str) or len(node[key]) > 1000) for key in ('label', 'operation', 'action', 'parent')):
            return {}
        if node.get('line') is not None and (type(node['line']) is not int or node['line'] < 1):
            return {}
        catalog[node['id']] = dict(node)
    origins = []
    for gate in ir.instructions:
        source = gate.metadata.get('flagquantum.synthesis.origins', ())
        if not isinstance(source, (list, tuple)) or any(not isinstance(key, str) or key not in catalog for key in source):
            return {}
        origins.append(tuple(dict.fromkeys(source)))
    if not any(origins):
        return {}
    labels = {'qint.multiply': 'Multiply', 'qint.add': 'Add', 'qint.subtract_mod': 'Subtract modulo', 'qint.return': 'Output'}
    def label(keys):
        if not keys:
            return 'Unmapped operations'
        names = []
        for key in keys:
            node = catalog[key]
            operation = node.get('operation')
            name = labels.get(operation, operation or node.get('label', key))
            if node.get('action'):
                name += ' · ' + node['action'].capitalize()
            names.append(str(name))
        return ('Combined: ' if len(keys) > 1 else '') + ' + '.join(names)
    def stats(node):
        gates = [instructions[index] for index in node['gate_indices']]
        depths = {}
        for gate in gates:
            depth = max((depths.get(w, 0) for w in gate['wires']), default=0) + 1
            for wire in gate['wires']:
                depths[wire] = depth
        return {**node, 'wires': sorted(depths), 'gate_count': len(gates), 'gate_counts': dict(Counter(g['name'] for g in gates)), 'depth': max(depths.values(), default=0)}
    children = []
    previous = None
    for index, keys in enumerate(origins):
        if keys != previous:
            children.append({'id': 'semantic_' + str(index), 'label': label(keys), 'children': [], 'gate_indices': [], 'source_ids': list(keys)})
            previous = keys
        children[-1]['gate_indices'].append(index)
    root = stats({'id': '__root__', 'label': str(manifest.get('entry') or 'Synthesis'), 'kind': 'semantic', 'gate_indices': list(range(len(instructions))), 'children': [stats(child) for child in children]})
    # These are logical ports. Use them as physical wire buses only when the
    # routing record states the final permutation; never assume restored layout.
    routing = ir.metadata.get('routing')
    mapping = (tuple(range(ir.n_wires)) if routing is None else
               routing.get('final_logical_to_physical') if isinstance(routing, Mapping) else None)
    registers = []
    used = set()
    valid_layout = isinstance(mapping, (tuple, list)) and len(mapping) == ir.n_wires and all(type(w) is int for w in mapping) and set(mapping) == set(range(ir.n_wires))
    if valid_layout and isinstance(manifest.get('registers'), Mapping):
        for name, wires in manifest['registers'].items():
            if not isinstance(name, str) or not isinstance(wires, (list, tuple)) or not wires or any(type(w) is not int or not 0 <= w < ir.n_wires or w in used for w in wires) or len(set(wires)) != len(wires):
                registers = []
                break
            used.update(wires)
            registers.append({'name': name, 'wires': [mapping[w] for w in wires]})
    annotated = [{**gate, 'source_ids': list(keys)} for gate, keys in zip(instructions, origins)]
    return {'instructions': annotated, 'hierarchy': root, 'registers': registers, 'synthesis_sources': list(catalog.values()),
            'logical_instructions': annotated}
