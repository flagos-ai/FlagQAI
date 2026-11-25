"""Resolve pinned example imports shared by scripts and notebook cells."""
import ast


def imported_modules(source, package=()):
    """Include from-import aliases: a package attribute can be a sibling module."""
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            prefix = list(package[:len(package) - node.level + 1]) if node.level else []
            module = '.'.join(prefix + ([node.module] if node.module else []))
            yield module
            yield from (module + '.' + alias.name for alias in node.names if alias.name != '*')


def module_file(root, module):
    if not module.startswith('examples.'):
        return None
    path = root.joinpath(*module.split('.'))
    for candidate in (path.with_suffix('.py'), path / '__init__.py'):
        if candidate.is_file():
            return candidate
    return None


def closure(root, entry, cell_sources=()):
    files, imports, pending = {}, set(), [entry]

    def collect(source, package=()):
        for module in imported_modules(source, package):
            if module.startswith('examples.'):
                candidate = module_file(root, module)
                if candidate is not None:
                    pending.append(candidate)
            elif module:
                imports.add(module.split('.')[0])

    sources = iter(cell_sources)
    while True:
        if not pending:
            source = next(sources, None)
            if source is None:
                break
            # IPython owns magics and shell escapes; analyze ordinary Python imports.
            source = '\n'.join('pass' if line.lstrip().startswith(('%', '!', '?')) else line
                               for line in source.splitlines())
            try:
                collect(source)
            except SyntaxError:
                continue
            if not pending:
                continue
        path = pending.pop()
        name = path.relative_to(root).as_posix()
        if name in files:
            continue
        source = path.read_text()
        files[name] = source
        for parent in path.relative_to(root).parents:
            if str(parent) == '.':
                continue
            init = root / parent / '__init__.py'
            if init.is_file() and init != path and init.relative_to(root).as_posix() not in files:
                pending.append(init)
            elif not init.is_file():
                files.setdefault((parent / '__init__.py').as_posix(), '')
        collect(source, path.relative_to(root).parts[:-1])
    return files, sorted(imports - {'examples'})
