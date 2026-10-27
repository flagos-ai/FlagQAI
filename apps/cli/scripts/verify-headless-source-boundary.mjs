#!/usr/bin/env node
// Static, source-local import boundary for the headless Harness service.
// This is neither a bundle inventory nor a source-rights determination.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const sourceRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src'))
const repositoryRoot = realpathSync(resolve(sourceRoot, '../../..'))
const packagesRoot = resolve(repositoryRoot, 'packages')
const entry = resolve(sourceRoot, 'dsh-adapter/server-host.ts')
const forbidden = /^(?:ink|components|screens)\//u
const externalDynamicImports = new Map([
  ['dsh-adapter/sharp.ts', 'pathToFileURL(path).href'],
  ['dsh-adapter/oauth/pi-ai.ts', 'adapterCatalogUrl()'],
])

function localModule(from, specifier) {
  const compiledPackage = specifier.match(/^\.\.\/\.\.\/flagqai-platform\/(.+)$/u)
  const base = compiledPackage && from.startsWith(sourceRoot + sep)
    ? resolve(packagesRoot, compiledPackage[1]) : resolve(dirname(from), specifier)
  const candidates = [base, base.replace(/\.js$/u, '.ts'), base.replace(/\.js$/u, '.tsx'),
    resolve(base, 'index.ts'), resolve(base, 'index.tsx'), resolve(base, 'index.mjs')]
  const found = candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile())
  assert.ok(found, `${relative(repositoryRoot, from)} cannot resolve ${specifier}`)
  const file = realpathSync(found)
  const name = relative(sourceRoot, file).split(sep).join('/')
  if (name.startsWith('../')) {
    const shared = relative(repositoryRoot, file).split(sep).join('/')
    assert.ok(shared.startsWith('packages/'), `unexpected import outside CLI source: ${shared}`)
    return file
  }
  assert.ok(!forbidden.test(name) && name !== 'ui.ts',
    `headless Harness service imports TUI presentation source: ${name}`)
  return file
}

function runtimeImports(file) {
  const text = readFileSync(file, 'utf8')
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const imports = []
  const constants = new Map()
  const collectConstants = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
        (node.parent.flags & ts.NodeFlags.Const) !== 0 &&
        node.initializer && ts.isStringLiteral(node.initializer)) {
      const previous = constants.get(node.name.text)
      assert.ok(previous === undefined || previous === node.initializer.text,
        `${relative(repositoryRoot, file)} has ambiguous dynamic import path ${node.name.text}`)
      constants.set(node.name.text, node.initializer.text)
    }
    ts.forEachChild(node, collectConstants)
  }
  collectConstants(tree)
  for (const statement of tree.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ||
      !statement.moduleSpecifier || statement.importClause?.isTypeOnly ||
      statement.exportClause?.isTypeOnly) continue
    assert.ok(ts.isStringLiteral(statement.moduleSpecifier), `${file}: nonliteral source import`)
    imports.push(statement.moduleSpecifier.text)
  }
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      assert.equal(node.arguments.length, 1, `${relative(repositoryRoot, file)} has unsupported dynamic import`)
      const argument = node.arguments[0]
      if (ts.isStringLiteral(argument)) imports.push(argument.text)
      else if (ts.isIdentifier(argument) && constants.has(argument.text)) imports.push(constants.get(argument.text))
      else {
        const expression = argument.getText(tree)
        assert.equal(expression, externalDynamicImports.get(relative(sourceRoot, file).split(sep).join('/')),
          `${relative(repositoryRoot, file)} has unreviewed dynamic import: ${expression}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return imports
}

const pending = [entry]
const visited = new Set()
while (pending.length) {
  const file = pending.pop()
  if (visited.has(file)) continue
  visited.add(file)
  for (const specifier of runtimeImports(file)) {
    if (specifier.startsWith('.')) {
      const next = localModule(file, specifier)
      if (next) pending.push(next)
    }
  }
}
const cliCount = [...visited].filter(file => file.startsWith(sourceRoot + sep)).length
const packageCount = visited.size - cliCount
console.log(`PASS headless Harness source import boundary (${cliCount} CLI modules, ${packageCount} workspace package modules, no TUI presentation modules)`)
