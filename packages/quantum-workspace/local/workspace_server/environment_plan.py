"""Preparation guidance from observed facts; never install or guess PyPI names."""
import ast
import re


def source_imports(source):
    modules = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import): modules.update(n.name.split('.')[0] for n in node.names)
        if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module: modules.add(node.module.split('.')[0])
    return sorted(modules)


def pinned(value):
    return isinstance(value, str) and bool(re.fullmatch(r'[0-9][A-Za-z0-9.!+_-]{0,80}', value))


def environment_plan(run, producer_versions, current):
    archived = run.get('runtime', {}).get('environment_manifest')
    recorded_packages = (archived or {}).get('packages', {})
    current_packages = current.get('packages', {})
    versions = producer_versions
    dependencies = []
    for name in sorted(set(recorded_packages) | {'torch', 'flagquantum'}):
        expected = recorded_packages.get(name)
        if name == 'flagquantum': expected = (archived or {}).get('sdk_version') or (versions[0] if len(versions) == 1 else None)
        actual = current.get('sdk_version') if name == 'flagquantum' else current_packages.get(name)
        dependencies.append({'name': name, 'recorded': expected, 'current': actual,
                             'state': 'missing' if actual is None else 'unrecorded' if expected is None else 'match' if expected == actual else 'different'})
    imports = source_imports(run['source'])
    stdlib = set(current.get('stdlib_modules', []))
    available = current.get('module_distributions', {})
    unresolved = [name for name in imports if name not in stdlib and name not in available and name not in ('flagquantum', 'torch', 'flagquantum_web')]
    blockers = []
    if not current.get('sdk_version') or not current.get('save_load_supported'): blockers.append('FlagQuantum with fq.save/fq.load support is missing from the configured interpreter.')
    if not current.get('pytorch') or 'torch' in current.get('import_errors', []): blockers.append('PyTorch is missing or cannot be imported by the configured interpreter.')
    if unresolved: blockers.append('Referenced imports need inspection: ' + ', '.join(unresolved) + '. Optional imports may not be required; no package names were guessed.')
    notes = ['A version inventory is not a hash-locked or cross-platform environment. Verify installation artifacts and platform compatibility before reuse.']
    if archived:
        for key, label in [('python', 'Python version'), ('system', 'Operating system'), ('machine', 'CPU architecture'), ('sdk_code_sha256', 'SDK code fingerprint')]:
            if archived.get(key) and current.get(key) and archived[key] != current[key]: notes.append(label + ' differs from the recorded runtime.')
    if archived is None: notes.append('The original run did not record a dependency inventory or SDK source revision. Current versions are candidates, not recovered historical requirements.')
    if (archived or {}).get('packages_truncated') or current.get('packages_truncated'): notes.append('A dependency inventory was truncated; this is not a complete lockfile.')
    if current.get('sdk_distribution_version') and current.get('sdk_distribution_version') != current.get('sdk_version'): notes.append('SDK module version differs from its installed distribution metadata. Reinstall a verified SDK wheel into a fresh environment before relying on the package inventory.')
    if current.get('sdk_editable'): notes.append('The SDK is installed in editable mode; its code can depend on a mutable checkout. Use a verified non-editable wheel for portable acceptance.')
    if current.get('pythonpath_present'): notes.append('PYTHONPATH is set. This runtime may depend on a checkout; use an installed SDK without PYTHONPATH for portable acceptance.')
    if current.get('user_site_enabled'): notes.append('User site-packages are enabled; a fresh virtual environment avoids hidden user dependencies.')
    if not (archived or {}).get('sdk_revision'): notes.append('Original SDK source revision is unrecorded; a version label alone does not identify exact code.')
    python = '.venv-reproduce/bin/python'
    lines = ['# POSIX example: inspect and run manually in a new directory.', '# No command is executed by the Web interface.', 'python3 -m venv .venv-reproduce']
    safe_versions = [version for version in versions if pinned(version)]
    if safe_versions: lines.append('# Required SDK module version(s): ' + ', '.join(safe_versions))
    py = (archived or {}).get('python') or run.get('runtime', {}).get('python')
    if isinstance(py, str) and re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', py): lines.insert(2, '# First select Python ' + str(py)[:40] + '; the generic python3 command does not select its patch version.')
    torch = recorded_packages.get('torch') or current.get('pytorch')
    if pinned(torch):
        if 'torch' not in recorded_packages: lines.append('# PyTorch pin below is the inspected candidate, not a recorded original dependency.')
        lines.append(python + " -m pip install 'torch==" + torch + "'")
    else: lines.append('# Obtain and pin the required PyTorch version before proceeding.')
    identity = archived or {}
    revision = identity.get('sdk_revision')
    if identity.get('sdk_repository') == 'https://github.com/flagos-ai/FlagQuantum.git' and re.fullmatch(r'[a-f0-9]{40}', str(revision)):
        lines.append(python + " -m pip install 'git+https://github.com/flagos-ai/FlagQuantum.git@" + revision + "'")
    else:
        wheel_hash = identity.get('sdk_wheel_sha256')
        if re.fullmatch(r'[a-f0-9]{64}', str(wheel_hash)): lines.append('# Archived SDK wheel SHA-256 (verify the original build; other platforms need separate build provenance): ' + wheel_hash)
        lines.extend(['# Obtain a verified FlagQuantum wheel for your OS, architecture and required SDK version.', '# Replace this placeholder with that wheel; do not assume a public index has the same build.', python + ' -m pip install /path/to/verified/flagquantum.whl'])
    for dep in dependencies:
        if dep['name'] not in ('flagquantum', 'torch', 'pip', 'setuptools', 'wheel') and pinned(dep['recorded']) and re.fullmatch(r'[a-zA-Z0-9._-]{1,100}', dep['name']):
            lines.append(python + " -m pip install '" + dep['name'] + '==' + dep['recorded'] + "'")
    lines.extend([python + ' -m pip check', '# Configure the local service to use this interpreter, then check the environment again.', '# Windows: use .venv-reproduce\\Scripts\\python.exe instead.'])
    return {'schema': 'flagqai.environment-preparation.v1', 'archived': archived, 'current': current,
            'dependencies': dependencies, 'referenced_imports': imports, 'unresolved_imports': unresolved,
            'blockers': blockers, 'notes': notes, 'commands': '\n'.join(lines),
            'installation_performed': False, 'complete_historical_lock': False}
