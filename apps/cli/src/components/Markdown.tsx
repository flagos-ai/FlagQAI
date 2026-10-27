import React from 'react'
import { marked, type Token, type Tokens } from 'marked'
import { Box, Text, useTheme } from '../ui.js'
import { configureMarked, formatToken, stripPromptXMLTags } from '../terminal-utils/markdown.js'
import { getCliHighlightPromise, type CliHighlight } from '../terminal-utils/cliHighlight.js'
import { isMermaidLang } from '../terminal-utils/mermaid.js'
import { isMathBlockToken, isMathToken } from '../terminal-utils/math.js'
import { getMathRendering, subscribeMathRendering } from '../tuiDisplayPrefs.js'
import { MarkdownTable } from './MarkdownTable.js'
import { CodeBlockFrame } from './CodeBlockFrame.js'
import { MermaidDiagram } from './MermaidDiagram.js'
import { InlineMathParagraph } from './InlineMathParagraph.js'
import { MathBlock } from './MathBlock.js'

type Props = {
  children: string
  dimColor?: boolean
  cacheTokens?: boolean
  inlineMathImages?: boolean
}

configureMarked()

/** Blocks with their own layout must not be concatenated into the prose run. */
export function isStandaloneToken(token: Token): boolean {
  return token.type === 'code' || token.type === 'table' || isMathBlockToken(token)
}

function containsInlineMath(token: Tokens.Paragraph): boolean {
  const visit = (candidate: Token): boolean => {
    if (isMathToken(candidate)) return true
    const nested = 'tokens' in candidate ? candidate.tokens : undefined
    return Array.isArray(nested) && nested.some(visit)
  }
  return token.tokens?.some(visit) ?? false
}

function useHighlighter(): CliHighlight | null {
  const [highlighter, setHighlighter] = React.useState<CliHighlight | null>(null)
  React.useEffect(() => {
    let mounted = true
    void getCliHighlightPromise().then(value => {
      if (mounted) setHighlighter(value)
    })
    return () => { mounted = false }
  }, [])
  return highlighter
}

function MarkdownView({ children, dimColor = false, cacheTokens = true, inlineMathImages = true }: Props): React.ReactNode {
  // Context changes must repaint formatter-produced link colors even when the
  // Markdown source string is unchanged.
  useTheme()
  const highlighter = useHighlighter()
  const mathRendering = React.useSyncExternalStore(subscribeMathRendering, getMathRendering, getMathRendering)
  const source = stripPromptXMLTags(children.trim())
  const cachedTokens = React.useMemo(() => cacheTokens ? marked.lexer(source) : null, [source, cacheTokens])
  const tokens = cachedTokens ?? marked.lexer(source)
  const nodes: React.ReactNode[] = []
  let prose = ''
  let previousCode = false
  let spaceAfterCode = false

  const addProse = (): void => {
    if (prose.trim()) {
      nodes.push(<Text key={nodes.length} dimColor={dimColor}>{prose.trim()}</Text>)
      previousCode = false
    }
    prose = ''
  }

  for (const token of tokens) {
    if (isStandaloneToken(token)) {
      const extraGap = previousCode && spaceAfterCode && !prose.trim() ? 1 : 0
      addProse()
      let block: React.ReactNode
      if (token.type === 'code') {
        const code = token as Tokens.Code
        block = isMermaidLang(code.lang)
          ? <MermaidDiagram token={code} highlight={highlighter} dimColor={dimColor} />
          : <CodeBlockFrame token={code} highlight={highlighter} dimColor={dimColor} />
      } else if (token.type === 'table') {
        block = <MarkdownTable token={token as Tokens.Table} highlight={highlighter} />
      } else if (isMathBlockToken(token)) {
        block = <MathBlock token={token} dimColor={dimColor} />
      } else {
        continue
      }
      nodes.push(extraGap > 0
        ? <Box key={nodes.length} flexDirection="column" width="100%" marginTop={extraGap}>{block}</Box>
        : <React.Fragment key={nodes.length}>{block}</React.Fragment>)
      previousCode = token.type === 'code'
      spaceAfterCode = false
      continue
    }

    if (token.type === 'paragraph' && inlineMathImages && mathRendering === 'image' && containsInlineMath(token as Tokens.Paragraph)) {
      addProse()
      nodes.push(<InlineMathParagraph key={nodes.length} token={token as Tokens.Paragraph} highlight={highlighter} />)
      previousCode = false
      spaceAfterCode = false
      continue
    }
    if (token.type === 'space' && previousCode && !prose.trim()) spaceAfterCode = true
    prose += formatToken(token, 0, null, null, highlighter)
  }
  addProse()

  return <Box flexDirection="column" gap={1}>{nodes}</Box>
}

export const Markdown = React.memo(MarkdownView)
