import assert from 'node:assert/strict'
import React from 'react'
import Link from '../src/ink/components/Link.js'
import Text from '../src/ink/components/Text.js'
import { renderToScreen } from '../src/ink/render-to-screen.js'
import { cellAt } from '../src/ink/screen.js'

const enabled = process.argv[2] === 'enabled'
const target = 'https://example.com'
function output(element: React.ReactElement) {
  const result = renderToScreen(element, 32)
  const cells = Array.from({ length: 32 }, (_, col) => cellAt(result.screen, col, 0))
  return {
    height: result.height,
    label: cells.map(cell => cell?.char ?? ' ').join('').trimEnd(),
    links: cells.filter(cell => cell?.char !== ' ').map(cell => cell?.hyperlink),
  }
}

for (const [element, expected] of [
  [<Link url={target}>Visit</Link>, 'Visit'],
  [<Link url={target} fallback="Offline">Visit</Link>, enabled ? 'Visit' : 'Offline'],
  [<Link url={target}><Text color="ansi:red">Styled</Text></Link>, 'Styled'],
  [<Link url={target} />, target],
] as const) {
  const actual = output(element)
  assert.equal(actual.height, 1)
  assert.equal(actual.label, expected)
  assert.ok(actual.links.every(link => link === (enabled ? target : undefined)),
    `OSC 8 should ${enabled ? 'cover' : 'not cover'} every visible character`)
}
console.log(`link contract passed (${enabled ? 'OSC 8' : 'plain-text fallback'})`)
