"""Non-executable OpenQASM annotations for source navigation and register decoding."""
import re

def source_metadata(source,instructions,n_qubits):
    registers=[];groups={};statements=[];group='ungrouped';buffer='';start_line=1
    for line_number,line in enumerate(source.splitlines(),1):
        match=re.fullmatch(r'\s*//\s*@register\s+([A-Za-z][A-Za-z0-9_]{0,31})\s+([0-9 ]+)\s*',line)
        if match:
            wires=[int(i) for i in match[2].split()]
            if not wires or len(set(wires))!=len(wires) or any(w>=n_qubits for w in wires):raise ValueError('Invalid register annotation.')
            if any(r['name']==match[1] for r in registers):raise ValueError('Duplicate register annotation.')
            if any(set(wires)&set(r['wires']) for r in registers):raise ValueError('Register annotations must not overlap.')
            registers.append({'name':match[1],'wires':wires,'bit_significance':'little_endian'})
            if len(registers)>16:raise ValueError('Too many register annotations.')
        match=re.fullmatch(r'\s*//\s*@module\s+([A-Za-z][A-Za-z0-9_]*(?:/[A-Za-z][A-Za-z0-9_]*){0,7})\s*\|\s*(.{1,100})',line)
        if match:
            group=match[1]
            if len(group)>256:raise ValueError('Module path is too long.')
            label=match[2].strip()
            if group in groups and groups[group]!=label:raise ValueError('A module path cannot have conflicting labels.')
            groups[group]=label
        code=line.split('//',1)[0]
        for char in code+' ':
            if not buffer.strip():start_line=line_number
            buffer+=char
            if char==';':
                statement=buffer.strip();buffer=''
                op=re.match(r'([A-Za-z][A-Za-z0-9_]*)',statement)
                if op and op[1].lower() not in {'openqasm','include','qreg','creg','measure','qubit','bit'}:
                    statements.append({'name':op[1].lower(),'line':start_line,'group':group})
    mapped=len(statements)==len(instructions) and all(a['name']==b['name'].lower() for a,b in zip(statements,instructions))
    logical=[{**i,'line':statements[k]['line'] if mapped else None,'group':statements[k]['group'] if mapped else 'ungrouped'} for k,i in enumerate(instructions)]
    return registers,groups,logical

def decode_counts(counts,registers,n_qubits):
    rows=[]
    for bits,count in sorted(counts.items()):
        if len(bits)!=n_qubits or set(bits)-{'0','1'}:raise ValueError('Unexpected simulator bit ordering/width.')
        values={r['name']:sum(int(bits[w])*(1<<i) for i,w in enumerate(r['wires'])) for r in registers}
        rows.append({'state':bits,'count':int(count),'values':values})
    return rows


def build_hierarchy(instructions,groups):
    from collections import Counter
    root={'id':'__root__','label':'Program','children':[],'gate_indices':[]}
    nodes={'__root__':root}
    for index,gate in enumerate(instructions):
        path=gate.get('group') or 'ungrouped'
        parts=path.split('/')
        parent=root
        for depth in range(len(parts)):
            node_id='/'.join(parts[:depth+1])
            if node_id not in nodes:
                node={'id':node_id,'label':groups.get(node_id,parts[depth].replace('_',' ')),'children':[],'gate_indices':[]}
                nodes[node_id]=node;parent['children'].append(node)
            parent=nodes[node_id];parent['gate_indices'].append(index)
        root['gate_indices'].append(index)
    for node in nodes.values():
        ids=node['gate_indices']
        if ids and ids!=list(range(ids[0],ids[-1]+1)):
            raise ValueError('Module '+node['id']+' must occupy a contiguous source interval.')
        gates=[instructions[i] for i in ids]
        wires=sorted({w for g in gates for w in g['wires']})
        depths={w:0 for w in wires}
        for gate in gates:
            level=max((depths[w] for w in gate['wires']),default=0)+1
            for wire in gate['wires']:depths[wire]=level
        lines=[g['line'] for g in gates if g.get('line')]
        node.update(wires=wires,gate_count=len(ids),gate_counts=dict(Counter(g['name'] for g in gates)),depth=max(depths.values(),default=0),source_start=min(lines) if lines else None,source_end=max(lines) if lines else None)
    return root
