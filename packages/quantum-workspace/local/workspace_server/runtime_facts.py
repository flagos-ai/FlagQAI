"""Bounded runtime evidence. No installation, provider request or user-code execution."""

def runtime_manifest(fq=None, imports=()):
    import hashlib
    import importlib.metadata as metadata
    import json
    import os
    from pathlib import Path
    import platform
    import re
    import site
    import sys
    facts = {'schema': 'flagqai.runtime-environment.v1', 'python': platform.python_version(),
             'implementation': platform.python_implementation(), 'system': platform.system(), 'machine': platform.machine(),
             'virtual_environment': sys.prefix != sys.base_prefix, 'user_site_enabled': bool(site.ENABLE_USER_SITE),
             'pythonpath_present': bool(os.environ.get('PYTHONPATH')), 'sdk_version': getattr(fq, '__version__', None),
             'save_load_supported': bool(fq and callable(getattr(fq, 'save', None)) and callable(getattr(fq, 'load', None)))}
    packages = {}
    for dist in metadata.distributions():
        name = dist.metadata.get('Name', '')
        version = dist.version
        if re.fullmatch(r'[A-Za-z0-9._-]{1,100}', name) and re.fullmatch(r'[A-Za-z0-9.+!_-]{1,100}', version): packages[name.lower().replace('_', '-')] = version
    facts['packages'] = dict(sorted(packages.items())[:128])
    facts['packages_truncated'] = len(packages) > 128
    facts['sdk_distribution_version'] = packages.get('flagquantum')
    facts['pytorch'] = packages.get('torch')
    torch = sys.modules.get('torch')
    facts['cuda_available'] = bool(torch and torch.cuda.is_available())
    facts['stdlib_modules'] = sorted(getattr(sys, 'stdlib_module_names', ()))
    facts['module_distributions'] = {name: sorted(set(values))[:8] for name, values in getattr(metadata, 'packages_distributions', lambda: {})().items() if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,100}', name) and (name in sys.modules or name in imports)}
    if fq is not None and getattr(fq, '__file__', None):
        root = Path(fq.__file__).resolve().parent
        digest = hashlib.sha256(); count = size = 0
        for path in sorted(root.rglob('*')):
            if not path.is_file() or path.is_symlink() or path.suffix not in ('.py', '.so', '.pyd', '.dylib'): continue
            size += path.stat().st_size; count += 1
            if count > 4096 or size > 64 * 1024 * 1024: break
            digest.update(path.relative_to(root).as_posix().encode() + b'\0')
            digest.update(hashlib.sha256(path.read_bytes()).digest())
        else:
            facts['sdk_code_sha256'] = digest.hexdigest()
            facts['sdk_code_files'] = count
        facts['sdk_code_scope'] = 'Python and native code files; excludes bytecode, data and distribution metadata'
        try:
            direct = json.loads(metadata.distribution('flagquantum').read_text('direct_url.json') or '{}')
            vcs = direct.get('vcs_info', {}); revision = vcs.get('commit_id')
            if direct.get('url', '').removesuffix('.git').lower() == 'https://github.com/flagos-ai/flagquantum' and vcs.get('vcs') == 'git' and re.fullmatch(r'[a-fA-F0-9]{40}', str(revision)):
                facts['sdk_revision'] = revision.lower()
                facts['sdk_repository'] = 'https://github.com/flagos-ai/FlagQuantum.git'
            archive = direct.get('archive_info', {})
            wheel_hash = archive.get('hashes', {}).get('sha256') or (archive.get('hash', '').removeprefix('sha256=') if archive.get('hash', '').startswith('sha256=') else None)
            if re.fullmatch(r'[a-f0-9]{64}', str(wheel_hash)): facts['sdk_wheel_sha256'] = wheel_hash
            facts['sdk_editable'] = bool(direct.get('dir_info', {}).get('editable'))
        except (metadata.PackageNotFoundError, ValueError, TypeError): pass
    return facts
