import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectBoundary, parseBoundaryImports } from './inventory-ink-boundary.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixture = resolve(root, 'src/fixture.tsx');
const inkTarget = resolve(root, 'src/ink/hooks/use-input.ts');
const uiTarget = resolve(root, 'src/ui.ts');
const source = `
  import {
    default as useInput,
    type InputProps,
  } from './ink/hooks/use-input.js';
  import type { Key } from './ink/hooks/use-input.js';
  export { default as externalInput } from './ink/hooks/use-input.js';
  import * as ui from './ui.js';
  import './ui.js';
  import { unrelated } from './not-the-boundary.js';
`;
const edges = parseBoundaryImports(fixture, source, (_file, specifier) =>
  specifier.includes('/ink/') ? inkTarget : specifier === './ui.js' ? uiTarget : null);
assert.equal(edges.length, 5);
assert.deepEqual(edges.map(edge => [edge.boundary, edge.kind, edge.typeOnly, edge.names]), [
  ['direct', 'import', false, ['InputProps', 'default']],
  ['direct', 'import', true, ['Key']],
  ['direct', 'reexport', false, ['default']],
  ['facade', 'import', false, ['*']],
  ['facade', 'import', false, ['*']],
]);

const current = collectBoundary();
assert(current.some(edge => edge.from === 'src/ui.ts' && edge.to === 'src/ink/root.ts' && edge.names.includes('default')));
assert(current.some(edge => edge.from === 'src/hooks/useBlink.ts' && edge.to === 'src/ink/components/ClockContext.tsx'));
assert(current.some(edge => edge.from === 'src/screens/Chat.tsx' && edge.to === 'src/ui.ts'));
console.log('Ink boundary AST inventory: passed');
