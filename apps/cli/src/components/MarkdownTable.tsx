import React, { useContext } from 'react'
import type { Token, Tokens } from 'marked'
import { Ansi } from '../ink/Ansi.js'
import { TerminalSizeContext } from '../ink/components/TerminalSizeContext.js'
import { stringWidth } from '../ink/stringWidth.js'
import wrapText from '../ink/wrap-text.js'
import { Box } from '../ui.js'
import type { CliHighlight } from '../terminal-utils/cliHighlight.js'
import { formatToken } from '../terminal-utils/markdown.js'

type Props = {
  token: Tokens.Table
  highlight: CliHighlight | null
  forceWidth?: number
}

type Cell = Tokens.Table['header'][number]

function cellText(cell: Cell | undefined, highlight: CliHighlight | null): string {
  if (!cell) return ''
  return cell.tokens?.length
    ? cell.tokens.map(token => formatToken(token as Token, 0, null, null, highlight)).join('')
    : cell.text
}

function pad(value: string, width: number, align: 'left' | 'center' | 'right' | null): string {
  const remaining = Math.max(0, width - stringWidth(value))
  const left = align === 'right' ? remaining : align === 'center' ? Math.floor(remaining / 2) : 0
  return ' '.repeat(left) + value + ' '.repeat(remaining - left)
}

function border(widths: number[], left: string, middle: string, right: string): string {
  return left + widths.map(width => '─'.repeat(width + 2)).join(middle) + right
}

function tableLines(headers: string[], rows: string[][], widths: number[], align: Tokens.Table['align']): string[] {
  const lines = [border(widths, '┌', '┬', '┐')]
  const renderRow = (cells: string[], isHeader: boolean): void => {
    const wrapped = widths.map((width, index) => wrapText(cells[index] ?? '', width, 'wrap').split('\n'))
    const height = Math.max(1, ...wrapped.map(cell => cell.length))
    for (let row = 0; row < height; row++) {
      lines.push('│' + widths.map((width, index) =>
        ` ${pad(wrapped[index]?.[row] ?? '', width, isHeader ? 'left' : align[index] ?? null)} `).join('│') + '│')
    }
  }
  renderRow(headers, true)
  if (rows.length > 0) lines.push(border(widths, '├', '┼', '┤'))
  rows.forEach((row, index) => {
    renderRow(row, false)
    if (index < rows.length - 1) lines.push(border(widths, '├', '┼', '┤'))
  })
  lines.push(border(widths, '└', '┴', '┘'))
  return lines
}

function detailLines(headers: string[], rows: string[][], width: number): string[] {
  if (rows.length === 0) return headers.flatMap(header => wrapText(header, width, 'wrap').split('\n'))
  const lines: string[] = []
  for (const [rowIndex, row] of rows.entries()) {
    if (rowIndex > 0) lines.push('')
    for (let index = 0; index < headers.length; index++) {
      const label = headers[index] || `Column ${index + 1}`
      const prefix = `${label}: `
      if (stringWidth(prefix) >= width) {
        lines.push(...wrapText(label, width, 'wrap').split('\n'))
        lines.push(...wrapText(row[index] ?? '', width, 'wrap').split('\n'))
        continue
      }
      const parts = wrapText(row[index] ?? '', width - stringWidth(prefix), 'wrap').split('\n')
      lines.push(prefix + (parts.shift() ?? ''))
      lines.push(...parts)
    }
  }
  return lines
}

/** Render a markdown table with ANSI-aware cells and a narrow-terminal fallback. */
export function MarkdownTable({ token, highlight, forceWidth }: Props): React.ReactNode {
  const size = useContext(TerminalSizeContext)
  const available = Math.max(1, (forceWidth ?? size?.columns ?? 80) - (forceWidth ? 0 : 4))
  const headers = token.header.map(cell => cellText(cell, highlight))
  if (headers.length === 0) return null
  const rows = token.rows.map(row => headers.map((_, index) => cellText(row[index], highlight)))
  const widths = headers.map((header, index) => rows.reduce(
    (width, row) => Math.max(width, stringWidth(row[index] ?? '')),
    Math.max(1, stringWidth(header)),
  ))
  const desired = widths.reduce((sum, width) => sum + width + 3, 1)
  const lines = desired <= available
    ? tableLines(headers, rows, widths, token.align)
    : detailLines(headers, rows, available)
  return <Box flexDirection="column">{lines.map((line, index) =>
    <Ansi key={index}>{line || ' '}</Ansi>)}</Box>
}
