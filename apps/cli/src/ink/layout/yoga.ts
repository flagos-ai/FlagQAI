import Yoga, {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  Overflow,
  PositionType,
  Wrap,
  type Node as YogaNode,
} from 'yoga-layout'
import {
  type LayoutAlign,
  LayoutDisplay,
  type LayoutEdge,
  type LayoutFlexDirection,
  type LayoutGutter,
  type LayoutJustify,
  type LayoutMeasureFunc,
  LayoutMeasureMode,
  type LayoutNode,
  type LayoutOverflow,
  type LayoutPositionType,
  type LayoutWrap,
} from './node.js'

// --
// Edge/Gutter mapping

const EDGE_MAP: Record<LayoutEdge, Edge> = {
  all: Edge.All,
  horizontal: Edge.Horizontal,
  vertical: Edge.Vertical,
  left: Edge.Left,
  right: Edge.Right,
  top: Edge.Top,
  bottom: Edge.Bottom,
  start: Edge.Start,
  end: Edge.End,
}

const GUTTER_MAP: Record<LayoutGutter, Gutter> = {
  all: Gutter.All,
  column: Gutter.Column,
  row: Gutter.Row,
}

// --
// Yoga adapter

/**
 * Yoga-backed implementation of `LayoutNode`.
 *
 * Wraps a yoga-layout node, mapping layout enums to their Yoga counterparts
 * and translating measure-mode values across the adapter boundary. The
 * underlying Yoga instance is synchronous and available at import time.
 */
export class YogaLayoutNode implements LayoutNode {
  /** The underlying Yoga node this adapter wraps. */
  readonly yoga: YogaNode
  private measureFunction?: LayoutMeasureFunc
  private readonly measuredWidths = new Map<number, number>()
  private readonly children: YogaLayoutNode[] = []
  private parent?: YogaLayoutNode
  private layoutRoot: YogaLayoutNode = this
  private lastLayoutWidth?: number

  constructor(yoga: YogaNode) {
    this.yoga = yoga
  }

  // Tree

  insertChild(child: LayoutNode, index: number): void {
    const node = child as YogaLayoutNode
    this.yoga.insertChild(node.yoga, index)
    this.children.splice(index, 0, node)
    node.parent = this
    node.setLayoutRoot(this.layoutRoot)
  }

  removeChild(child: LayoutNode): void {
    const node = child as YogaLayoutNode
    this.yoga.removeChild(node.yoga)
    const index = this.children.indexOf(node)
    if (index >= 0) this.children.splice(index, 1)
    node.parent = undefined
    node.setLayoutRoot(node)
  }

  private setLayoutRoot(root: YogaLayoutNode): void {
    this.layoutRoot = root
    for (const child of this.children) child.setLayoutRoot(root)
  }

  getChildCount(): number {
    return this.yoga.getChildCount()
  }

  getParent(): LayoutNode | null {
    return this.parent ?? null
  }

  // Layout

  calculateLayout(width?: number, _height?: number): void {
    // insertChild/removeChild maintain root ownership; do not walk the tree
    // on every cached layout pass.
    if (this.layoutRoot !== this) this.setLayoutRoot(this)
    this.lastLayoutWidth = width === undefined ? undefined : Math.fround(width)
    this.yoga.calculateLayout(width, undefined, Direction.LTR)
  }

  setMeasureFunc(fn: LayoutMeasureFunc): void {
    this.measureFunction = fn
    this.yoga.setMeasureFunc((w, wMode) => {
      const layoutWidth = this.layoutRoot.lastLayoutWidth
      if (layoutWidth !== undefined) this.measuredWidths.set(layoutWidth, w)
      measuredNodes++
      const mode =
        wMode === MeasureMode.Exactly
          ? LayoutMeasureMode.Exactly
          : wMode === MeasureMode.AtMost
            ? LayoutMeasureMode.AtMost
            : LayoutMeasureMode.Undefined
      return fn(w, mode)
    })
  }

  unsetMeasureFunc(): void {
    this.measureFunction = undefined
    this.measuredWidths.clear()
    this.yoga.unsetMeasureFunc()
  }

  /** Exposes the application-owned text measure function for contract tests. */
  getMeasureFunction(): LayoutMeasureFunc | undefined {
    return this.measureFunction
  }

  markDirty(): void {
    this.yoga.markDirty()
  }

  // Computed layout

  getComputedLeft(): number {
    return this.yoga.getComputedLeft()
  }

  getComputedTop(): number {
    return this.yoga.getComputedTop()
  }

  getComputedWidth(): number {
    return this.yoga.getComputedWidth()
  }

  getComputedMeasureWidth(): number {
    // Yoga rounds painted bounds to whole terminal cells, but its text
    // callback receives the fractional constraint before that rounding.
    // Keep the exact constraint across cached width round trips so wrapping
    // and painting agree at percentage-based widths.
    const rounded = this.yoga.getComputedWidth()
      - this.yoga.getComputedPadding(Edge.Left)
      - this.yoga.getComputedPadding(Edge.Right)
      - this.yoga.getComputedBorder(Edge.Left)
      - this.yoga.getComputedBorder(Edge.Right)
    const layoutWidth = this.layoutRoot.lastLayoutWidth
    const measured = layoutWidth === undefined ? undefined : this.measuredWidths.get(layoutWidth)
    return measured !== undefined && Math.abs(measured - rounded) < 1
      ? measured
      : rounded
  }

  getComputedHeight(): number {
    return this.yoga.getComputedHeight()
  }

  getComputedBorder(edge: LayoutEdge): number {
    return this.yoga.getComputedBorder(EDGE_MAP[edge]!)
  }

  getComputedPadding(edge: LayoutEdge): number {
    return this.yoga.getComputedPadding(EDGE_MAP[edge]!)
  }

  // Style setters

  setWidth(value: number): void {
    this.yoga.setWidth(value)
  }
  setWidthPercent(value: number): void {
    this.yoga.setWidthPercent(value)
  }
  setWidthAuto(): void {
    this.yoga.setWidthAuto()
  }
  setHeight(value: number): void {
    this.yoga.setHeight(value)
  }
  setHeightPercent(value: number): void {
    this.yoga.setHeightPercent(value)
  }
  setHeightAuto(): void {
    this.yoga.setHeightAuto()
  }
  setMinWidth(value: number): void {
    this.yoga.setMinWidth(value)
  }
  setMinWidthPercent(value: number): void {
    this.yoga.setMinWidthPercent(value)
  }
  setMinHeight(value: number): void {
    this.yoga.setMinHeight(value)
  }
  setMinHeightPercent(value: number): void {
    this.yoga.setMinHeightPercent(value)
  }
  setMaxWidth(value: number): void {
    this.yoga.setMaxWidth(value)
  }
  setMaxWidthPercent(value: number): void {
    this.yoga.setMaxWidthPercent(value)
  }
  setMaxHeight(value: number): void {
    this.yoga.setMaxHeight(value)
  }
  setMaxHeightPercent(value: number): void {
    this.yoga.setMaxHeightPercent(value)
  }

  setFlexDirection(dir: LayoutFlexDirection): void {
    const map: Record<LayoutFlexDirection, FlexDirection> = {
      row: FlexDirection.Row,
      'row-reverse': FlexDirection.RowReverse,
      column: FlexDirection.Column,
      'column-reverse': FlexDirection.ColumnReverse,
    }
    this.yoga.setFlexDirection(map[dir]!)
  }

  setFlexGrow(value: number): void {
    this.yoga.setFlexGrow(value)
  }
  setFlexShrink(value: number): void {
    this.yoga.setFlexShrink(value)
  }
  setFlexBasis(value: number): void {
    this.yoga.setFlexBasis(value)
  }
  setFlexBasisPercent(value: number): void {
    this.yoga.setFlexBasisPercent(value)
  }

  setFlexWrap(wrap: LayoutWrap): void {
    const map: Record<LayoutWrap, Wrap> = {
      nowrap: Wrap.NoWrap,
      wrap: Wrap.Wrap,
      'wrap-reverse': Wrap.WrapReverse,
    }
    this.yoga.setFlexWrap(map[wrap]!)
  }

  setAlignItems(align: LayoutAlign): void {
    const map: Record<LayoutAlign, Align> = {
      auto: Align.Auto,
      stretch: Align.Stretch,
      'flex-start': Align.FlexStart,
      center: Align.Center,
      'flex-end': Align.FlexEnd,
    }
    this.yoga.setAlignItems(map[align]!)
  }

  setAlignSelf(align: LayoutAlign): void {
    const map: Record<LayoutAlign, Align> = {
      auto: Align.Auto,
      stretch: Align.Stretch,
      'flex-start': Align.FlexStart,
      center: Align.Center,
      'flex-end': Align.FlexEnd,
    }
    this.yoga.setAlignSelf(map[align]!)
  }

  setJustifyContent(justify: LayoutJustify): void {
    const map: Record<LayoutJustify, Justify> = {
      'flex-start': Justify.FlexStart,
      center: Justify.Center,
      'flex-end': Justify.FlexEnd,
      'space-between': Justify.SpaceBetween,
      'space-around': Justify.SpaceAround,
      'space-evenly': Justify.SpaceEvenly,
    }
    this.yoga.setJustifyContent(map[justify]!)
  }

  setDisplay(display: LayoutDisplay): void {
    this.yoga.setDisplay(display === 'flex' ? Display.Flex : Display.None)
  }

  getDisplay(): LayoutDisplay {
    return this.yoga.getDisplay() === Display.None
      ? LayoutDisplay.None
      : LayoutDisplay.Flex
  }

  setPositionType(type: LayoutPositionType): void {
    this.yoga.setPositionType(
      type === 'absolute' ? PositionType.Absolute : PositionType.Relative,
    )
  }

  setPosition(edge: LayoutEdge, value: number): void {
    this.yoga.setPosition(EDGE_MAP[edge]!, value)
  }

  setPositionPercent(edge: LayoutEdge, value: number): void {
    this.yoga.setPositionPercent(EDGE_MAP[edge]!, value)
  }

  setOverflow(overflow: LayoutOverflow): void {
    const map: Record<LayoutOverflow, Overflow> = {
      visible: Overflow.Visible,
      hidden: Overflow.Hidden,
      scroll: Overflow.Scroll,
    }
    this.yoga.setOverflow(map[overflow]!)
  }

  setMargin(edge: LayoutEdge, value: number): void {
    this.yoga.setMargin(EDGE_MAP[edge]!, value)
  }
  setPadding(edge: LayoutEdge, value: number): void {
    this.yoga.setPadding(EDGE_MAP[edge]!, value)
  }
  setBorder(edge: LayoutEdge, value: number): void {
    this.yoga.setBorder(EDGE_MAP[edge]!, value)
  }
  setGap(gutter: LayoutGutter, value: number): void {
    this.yoga.setGap(GUTTER_MAP[gutter]!, value)
  }

  // Lifecycle

  free(): void {
    this.yoga.free()
  }
  freeRecursive(): void {
    this.yoga.freeRecursive()
  }
}

const layoutConfig = Yoga.Config.create()
// Terminal cells form a one-point grid; keep painted and hit-tested bounds integral.
layoutConfig.setPointScaleFactor(1)

let measuredNodes = 0

/** Number of application measure callbacks made since the previous sample. */
export function takeLayoutMeasureCount(): number {
  const count = measuredNodes
  measuredNodes = 0
  return count
}

// --
// Instance management
//
// The pinned official Yoga module initializes its WASM binding on import.

/**
 * Create a new layout node backed by a fresh Yoga node.
 * @returns a `YogaLayoutNode` with no children, styles, or measure function.
 */
export function createYogaLayoutNode(): LayoutNode {
  return new YogaLayoutNode(Yoga.Node.create(layoutConfig))
}
