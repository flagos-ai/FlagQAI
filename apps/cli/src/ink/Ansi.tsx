import React from 'react'
import Link from './components/Link.js'
import Text from './components/Text.js'
import { Parser } from './termio/parser.js'
import type { Color as TerminalColor, NamedColor, TextStyle } from './termio/types.js'
import type { Color as InkColor } from './styles.js'

type Props = {
  children: string
  dimColor?: boolean
}

const brightNames: Partial<Record<NamedColor, string>> = {
  brightBlack: 'blackBright',
  brightRed: 'redBright',
  brightGreen: 'greenBright',
  brightYellow: 'yellowBright',
  brightBlue: 'blueBright',
  brightMagenta: 'magentaBright',
  brightCyan: 'cyanBright',
  brightWhite: 'whiteBright',
}

function inkColor(color: TerminalColor): InkColor | undefined {
  switch (color.type) {
    case 'default': return undefined
    case 'rgb': return `rgb(${color.r},${color.g},${color.b})`
    case 'indexed': return `ansi256(${color.index})`
    case 'named': return `ansi:${brightNames[color.name] ?? color.name}` as InkColor
  }
}

function styledText(value: string, style: TextStyle, forceDim: boolean, key: number): React.ReactNode {
  const dim = forceDim || style.dim
  const weight = dim ? { dim: true } : style.bold ? { bold: true } : {}
  return (
    <Text
      key={key}
      color={inkColor(style.fg)}
      backgroundColor={inkColor(style.bg)}
      {...weight}
      italic={style.italic || undefined}
      underline={style.underline !== 'none' || undefined}
      strikethrough={style.strikethrough || undefined}
      inverse={style.inverse || undefined}
    >
      {value}
    </Text>
  )
}

/** Turn parser text actions into typed renderer leaves; controls never create rows. */
function AnsiText({ children, dimColor = false }: Props): React.JSX.Element | null {
  if (typeof children !== 'string') {
    return dimColor ? <Text dim>{String(children)}</Text> : <Text>{String(children)}</Text>
  }
  if (children === '') return null
  if (!children.includes('\x1b')) return dimColor ? <Text dim>{children}</Text> : <Text>{children}</Text>

  const parser = new Parser()
  const leaves: React.ReactNode[] = []
  let linkUrl: string | undefined
  for (const action of parser.feed(children)) {
    if (action.type === 'link') {
      linkUrl = action.action.type === 'start' ? action.action.url : undefined
      continue
    }
    if (action.type !== 'text' || action.graphemes.length === 0) continue
    const value = action.graphemes.map(grapheme => grapheme.value).join('')
    const node = styledText(value, action.style, dimColor, leaves.length)
    leaves.push(linkUrl
      ? <Link key={leaves.length} url={linkUrl}>{node}</Link>
      : <React.Fragment key={leaves.length}>{node}</React.Fragment>)
  }
  if (leaves.length === 0) return null
  return dimColor ? <Text dim>{leaves}</Text> : <Text>{leaves}</Text>
}

export const Ansi = React.memo(AnsiText)
