"""Inspect notebook requirements in the selected interpreter, without running research code."""
import ast
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tempfile

from .projects import manifest_hash


def requirements(files, entry):
    modules, symbols, pending, visited = set(), set(), [entry], set()

    def local(module):
        path = module.replace('.', '/')
        candidates = [path + '.py', path + '/__init__.py']
        found = next((name for name in candidates if name in files), None)
        if found:
            pending.append(found)
            for parent in PurePosixPath(found).parents:
                init = str(parent / '__init__.py')
                if init in files:
                    pending.append(init)
        return found

    while pending:
        name = pending.pop()
        if name in visited:
            continue
        visited.add(name)
        tree = ast.parse(files[name], filename=name)
        package = name.split('/')[:-1]
        aliases = {}

        class Imports(ast.NodeVisitor):
            def visit_Try(self, node):
                # Guarded imports can have fallbacks. Python decides at runtime.
                for statement in node.orelse + node.finalbody:
                    self.visit(statement)

            def visit_If(self, node):
                if isinstance(node.test, (ast.Name, ast.Attribute)) and (
                    getattr(node.test, 'id', None) == 'TYPE_CHECKING' or
                    getattr(node.test, 'attr', None) == 'TYPE_CHECKING'):
                    for statement in node.orelse:
                        self.visit(statement)
                else:
                    self.generic_visit(node)

            def visit_Import(self, node):
                for item in node.names:
                    if not local(item.name):
                        modules.add(item.name)
                        if item.name.startswith('flagquantum'):
                            aliases[item.asname or item.name.split('.')[0]] = item.name if item.asname else 'flagquantum'

            def visit_ImportFrom(self, node):
                prefix = package[:len(package) - node.level + 1] if node.level else []
                module = '.'.join(prefix + ([node.module] if node.module else []))
                is_local = bool(local(module))
                for item in node.names:
                    child = module + '.' + item.name
                    if local(child) or is_local or node.level:
                        continue
                    modules.add(module)
                    if module.startswith('flagquantum') and item.name != '*':
                        symbols.add((module, item.name))
                        if child == 'flagquantum.synth':
                            aliases[item.asname or item.name] = child

        Imports().visit(tree)
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id in aliases:
                symbols.add((aliases[node.value.id], node.attr))
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr == 'run_module' and node.args
                    and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)):
                local(node.args[0].value)
    return {'modules': sorted(modules), 'symbols': sorted(symbols), 'source_files': sorted(visited)}


PROBE = '''
import importlib, importlib.util, json, sys
required = REQUIREMENTS
missing, incompatible = [], []
modules = {}
for name in sorted(set(required['modules']) | {'flagquantum', 'torch'}):
    if name.split('.')[0] in sys.stdlib_module_names:
        continue
    try:
        modules[name] = importlib.import_module(name)
    except Exception as error:
        item = {'name': name, 'detail': str(error)[:300]}
        if name.startswith('flagquantum'):
            incompatible.append(item)
        else:
            missing.append(item)
for module, name in required['symbols'] + [('flagquantum', 'run'), ('flagquantum', 'save'), ('flagquantum', 'load')]:
    if module not in modules:
        try:
            modules[module] = importlib.import_module(module)
        except Exception:
            if not any(item['name'] == module for item in incompatible):
                incompatible.append({'name': module, 'detail': 'SDK module is unavailable.'})
            continue
    if not hasattr(modules[module], name):
        try:
            importlib.import_module(module + '.' + name)
        except Exception:
            incompatible.append({'name': module + '.' + name, 'detail': 'Required SDK API is unavailable.'})
fq = modules.get('flagquantum')
facts = runtime_manifest(fq, imports=[name.split('.')[0] for name in required['modules']])
print(json.dumps({'missing_dependencies': missing, 'incompatible_sdk': incompatible, 'runtime': facts}))
'''


def selection(runs):
    environments = getattr(runs.quantum, 'environments', None)
    if environments:
        with environments.lock:
            return environments.snapshot(), environments.revision
    return runs.settings, 0


def check_environment(runs, files, entry):
    required = requirements(files, entry)
    selected, revision = selection(runs)
    report = {'schema': 'flagqai.notebook-environment.v1', 'source_hash': manifest_hash(files),
              'requirements': required, 'environment_revision': revision,
              'transport': selected.compute_transport, 'timeout_seconds': 90,
              'research_executed': False, 'installation_performed': False,
              'notes': ['Static import/API checks do not verify scientific results, dynamic imports, memory use or completion within 90 seconds.']}
    if not runs.preflight_lock.acquire(blocking=False):
        raise ValueError('An environment check is already running. Try again when it finishes.')
    try:
        facts = Path(__file__).with_name('runtime_facts.py').read_text()
        probe = facts + '\nREQUIREMENTS = ' + repr(required) + '\n' + PROBE
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
            result = subprocess.run(runs.command(probe, settings=selected),
                stdin=subprocess.DEVNULL, stdout=output, stderr=errors, timeout=30,
                env={**os.environ, 'OMP_NUM_THREADS': '2', 'MKL_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2'})
            output.seek(0)
            raw = output.read(128 * 1024 + 1)
            if result.returncode or len(raw) > 128 * 1024:
                raise ValueError('The selected interpreter could not complete the notebook environment check.')
            observed = json.loads(raw.decode().strip().splitlines()[-1])
            report.update(observed)
        if selection(runs) != (selected, revision):
            raise ValueError('Compute environment changed during the check. Check the selected environment again.')
        report['status'] = ('sdk_incompatible' if report['incompatible_sdk'] else
                            'missing_dependencies' if report['missing_dependencies'] else 'ready')
    except (OSError, subprocess.TimeoutExpired, UnicodeError, IndexError, ValueError) as error:
        report.update(status='unavailable', error=str(error)[:500])
    finally:
        runs.preflight_lock.release()
    report['preparation'] = preparation(report)
    return report, selected


def preparation(report):
    missing = {item['name'].split('.')[0] for item in report.get('missing_dependencies', [])}
    known = sorted(missing & {'numpy', 'scipy', 'matplotlib', 'torch', 'pyscf'})
    lines = ['# Run manually in a new environment on the selected compute host.',
             'python3 -m venv .venv-notebook',
             '.venv-notebook/bin/python -m pip install /path/to/verified/flagquantum.whl']
    if known:
        lines.append('.venv-notebook/bin/python -m pip install ' + ' '.join(known))
    lines.extend(['.venv-notebook/bin/python -m pip check',
                  '# Select this interpreter in Compute environment, then check this notebook again.',
                  '# Windows: use .venv-notebook\\Scripts\\python.exe.'])
    return {'commands': '\n'.join(lines),
            'guidance': 'Use a verified SDK build providing the listed APIs. Version labels alone do not prove compatibility. Review workflow dependencies before installing; these commands are guidance, not a historical lockfile.',
            'unmapped_imports': sorted(missing - set(known))}
