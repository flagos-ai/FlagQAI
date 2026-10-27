#!/usr/bin/env node
// Inventory import contracts without reading or reproducing implementation bodies.
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(cliRoot, 'src');
const inkRoot = join(sourceRoot, 'ink');
const uiFacade = join(sourceRoot, 'ui.ts');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (entry.isFile() && sourceExtensions.has(extname(path))) yield path;
  }
}

function localTarget(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const target = resolve(dirname(from), specifier);
  const stem = sourceExtensions.has(extname(target)) ? target.slice(0, -extname(target).length) : target;
  for (const path of [target, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].map(ext => stem + ext), ...['index.ts', 'index.tsx', 'index.js'].map(name => join(target, name))]) {
    try {
      if (statSync(path).isFile()) return path;
    } catch { /* Candidate does not exist. */ }
  }
  return null;
}

function importedNames(clause) {
  if (!clause) return ['*'];
  const names = [];
  if (clause.name) names.push('default');
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) names.push('*');
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) names.push(element.propertyName?.text ?? element.name.text);
  }
  return names.length ? names : ['side-effect'];
}

export function parseBoundaryImports(file, source, resolveImport = localTarget) {
  const edges = [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  for (const statement of tree.statements) {
    const isImport = ts.isImportDeclaration(statement);
    const isExport = ts.isExportDeclaration(statement);
    if (!isImport && !isExport) continue;
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier)) continue;
    const target = resolveImport(file, specifier.text);
    if (!target || !(target === uiFacade || target.startsWith(inkRoot + sep))) continue;
    const names = isImport
      ? importedNames(statement.importClause)
      : statement.exportClause && ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements.map(element => element.propertyName?.text ?? element.name.text)
        : ['*'];
    const elements = isImport && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
      ? statement.importClause.namedBindings.elements
      : isExport && statement.exportClause && ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements
        : [];
    edges.push({
      from: relative(cliRoot, file).split(sep).join('/'),
      to: relative(cliRoot, target).split(sep).join('/'),
      boundary: target === uiFacade ? 'facade' : 'direct',
      kind: isImport ? 'import' : 'reexport',
      typeOnly: Boolean(isImport ? statement.importClause?.isTypeOnly : statement.isTypeOnly)
        || (elements.length > 0 && elements.every(element => element.isTypeOnly)),
      names: names.sort(),
    });
  }
  return edges;
}

export function collectBoundary(files = sourceFiles(sourceRoot)) {
  const edges = [];
  for (const file of files) {
    if (file.startsWith(inkRoot + sep)) continue;
    edges.push(...parseBoundaryImports(file, readFileSync(file, 'utf8')));
  }
  return edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const edges = collectBoundary();
  const direct = edges.filter(edge => edge.boundary === 'direct');
  const facade = edges.filter(edge => edge.boundary === 'facade');
  const files = new Set(direct.map(edge => edge.from));
  const modules = new Set(direct.map(edge => edge.to));
  const names = new Map();
  for (const edge of direct) {
    for (const name of edge.names) {
      const key = `${edge.to} :: ${name}`;
      names.set(key, (names.get(key) ?? 0) + 1);
    }
  }
  const output = { direct: { files: files.size, modules: modules.size, edges: direct.length }, facade: { files: new Set(facade.map(edge => edge.from)).size, edges: facade.length }, symbols: [...names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ...output, edges }, null, 2));
  else {
    console.log(`${files.size} direct consumer files, ${modules.size} ink modules, ${direct.length} static import/reexport edges`);
    console.log(`${output.facade.files} facade consumer files, ${facade.length} static import/reexport edges`);
    for (const [name, count] of output.symbols) console.log(`${String(count).padStart(3)}  ${name}`);
  }
}
