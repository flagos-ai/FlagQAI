"""Index real FlagQuantum calls in pinned companion sources without executing them."""
import ast
import json
from pathlib import Path


def analyze(source):
    tree = ast.parse(source)
    aliases = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for name in node.names:
                if name.name == 'flagquantum' or name.name.startswith('flagquantum.'):
                    aliases[name.asname or name.name.split('.')[0]] = name.name if name.asname else 'flagquantum'
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
            if node.module == 'flagquantum' or node.module.startswith('flagquantum.'):
                for name in node.names:
                    if name.name != '*':
                        aliases[name.asname or name.name] = node.module + '.' + name.name

    def resolve(node):
        if isinstance(node, ast.Name):
            return aliases.get(node.id)
        if isinstance(node, ast.Attribute):
            parent = resolve(node.value)
            return parent + '.' + node.attr if parent else None
        return None

    calls = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            api = resolve(node.func)
            if api:
                calls.append({'api': api, 'line': node.lineno})
    return sorted(calls, key=lambda call: call['line'])


def generate(directory):
    catalog = json.loads((directory / 'catalog.json').read_text())
    entries = {}
    for item in catalog['entries']:
        bundle = json.loads((directory / (item['id'] + '.json')).read_text())
        entries[item['id']] = {
            'bundleSha256': item['bundleSha256'],
            'files': {path: analyze(source) for path, source in bundle['files'].items()
                      if path.startswith('examples/') and not path.endswith('/__init__.py')},
        }
    (directory / 'implementation-index.json').write_text(json.dumps({
        'revision': catalog['revision'], 'entries': entries,
    }, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    import sys
    generate(Path(sys.argv[1]))
