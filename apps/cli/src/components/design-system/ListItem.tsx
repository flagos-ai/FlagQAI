import React, { type ReactNode } from 'react'
import type { ClickEvent } from '../../ink/events/click-event.js'
import { useDeclaredCursor } from '../../ink/hooks/use-declared-cursor.js'
import Box from './ThemedBox.js'
import Text from './ThemedText.js'

export type ListItemProps = {
  isFocused: boolean
  isSelected?: boolean
  children: ReactNode
  description?: string
  showScrollDown?: boolean
  showScrollUp?: boolean
  styled?: boolean
  disabled?: boolean
  declareCursor?: boolean
  onClick?: (event: ClickEvent) => void
}

/** Keep each selectable item at its declared one- or two-row height. */
function oneLine(node: ReactNode): ReactNode {
  if (typeof node === 'string') return node.replace(/\s*\r?\n\s*/gu, ' ')
  if (Array.isArray(node)) return React.Children.map(node, oneLine)
  if (React.isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    return React.cloneElement(node, undefined, oneLine(node.props.children))
  }
  return node
}

/** Do not nest a new Text around a caller's Text: that would mask its color. */
function labelParts(node: ReactNode, color: 'inactive' | 'suggestion' | 'success' | undefined): ReactNode {
  if (typeof node === 'string' || typeof node === 'number') {
    return <Text color={color} wrap="truncate-end">{oneLine(node)}</Text>
  }
  if (Array.isArray(node)) return React.Children.map(node, child => labelParts(child, color))
  if (React.isValidElement<{ children?: ReactNode; color?: string }>(node)) {
    if (node.type === React.Fragment) return <>{labelParts(node.props.children, color)}</>
    return React.cloneElement(node,
      node.type === Text && node.props.color === undefined ? { color } : undefined,
      oneLine(node.props.children))
  }
  return node
}

export function ListItem({
  isFocused, isSelected = false, children, description,
  showScrollDown = false, showScrollUp = false, styled = true,
  disabled = false, declareCursor = true, onClick,
}: ListItemProps): React.ReactNode {
  const [hovered, setHovered] = React.useState(false)
  const cursor = useDeclaredCursor({ line: 0, column: 0, active: isFocused && declareCursor && !disabled })
  const marker = disabled ? ' ' : isFocused ? '❯' : showScrollDown ? '↓' : showScrollUp ? '↑' : ' '
  const textColor = !styled ? undefined : disabled ? 'inactive' : isSelected ? 'success' : isFocused ? 'suggestion' : undefined
  const markerColor = disabled ? undefined : isSelected ? 'success' : isFocused ? 'suggestion' : undefined

  return (
    <Box
      ref={cursor}
      flexDirection="column"
      backgroundColor={onClick !== undefined && hovered ? 'toolCardBackgroundDim' : undefined}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onClick === undefined ? undefined : () => setHovered(true)}
      onMouseLeave={onClick === undefined ? undefined : () => setHovered(false)}
    >
      <Box flexDirection="row" minWidth={0}>
        <Text color={markerColor}>{marker} </Text>
        {labelParts(children, textColor)}
        {isSelected && !disabled && <Text color={styled ? 'success' : undefined}> ✓</Text>}
      </Box>
      {description !== undefined && (
        <Text color="inactive" wrap="truncate-end">  {oneLine(description)}</Text>
      )}
    </Box>
  )
}
