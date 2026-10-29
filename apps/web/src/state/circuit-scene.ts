import type { CircuitNode, Instruction } from "../contracts/quantum-workspace";

export type SceneItem = {
  node?: CircuitNode;
  gate?: number;
  collapsed?: boolean;
  children: SceneItem[];
  width: number;
  x: number;
  y: number;
  height: number;
  labelLines: string[];
};
const HEADER = 36,
  PADDING = 18,
  GAP = 26;
// Conservative advance estimates keep geometry deterministic before fonts load.
export function labelWidth(text: string, size = 12) {
  return Array.from(text).reduce(
    (sum, c) =>
      sum +
      (/[MW@#%]/.test(c)
        ? 1
        : /[ilI .,:'|]/.test(c)
          ? 0.38
          : /[^\x00-\x7f]/.test(c)
            ? 1
            : 0.67) *
        size,
    0,
  );
}
export function wrapCircuitLabel(text: string, width = 148) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && labelWidth(line + " " + word) > width) {
      lines.push(line);
      line = "";
    }
    for (const char of word) {
      if (labelWidth(line + char) > width && line) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
    line += " ";
  }
  if (line.trim()) lines.push(line.trim());
  return lines.map((l) => l.trim());
}
export function rawParameter(value: unknown): string {
  return typeof value === "string"
    ? value
    : (JSON.stringify(value) ?? String(value));
}
export function numericParameter(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (
    typeof value === "string" &&
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
  ) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}
export function parameterValue(value: unknown): string {
  const number = numericParameter(value);
  if (number === null) return rawParameter(value);
  if (number === 0) return "0";
  // Recognize common angles without modifying the stored parameter or its phase.
  for (const denominator of [1, 2, 3, 4, 6, 8, 12, 16]) {
    const numerator = Math.round((number * denominator) / Math.PI);
    if (
      numerator &&
      Math.abs(numerator) <= 64 &&
      Math.abs(number - (numerator * Math.PI) / denominator) <= 1e-7
    ) {
      return (
        (numerator < 0 ? "−" : "") +
        (Math.abs(numerator) === 1 ? "" : Math.abs(numerator)) +
        "π" +
        (denominator === 1 ? "" : "/" + denominator)
      );
    }
  }
  return Number(number.toPrecision(4)).toString() + " rad";
}
export function gateCaption(gate: Instruction) {
  return Object.entries(gate.params || {})
    .map(([key, value]) => key + "=" + rawParameter(value))
    .join(" · ");
}
export function gateParameterLabel(gate: Instruction) {
  const values = Object.values(gate.params || {});
  const text = values.map(parameterValue).join(", ");
  if (values.length > 1)
    return labelWidth(text, 10) > 116
      ? values.length + " params"
      : "(" + text + ")";
  if (labelWidth(text, 10) <= 88) return text;
  let shortened = text;
  while (shortened && labelWidth(shortened + "…", 10) > 88)
    shortened = Array.from(shortened).slice(0, -1).join("");
  return shortened + "…";
}
export function buildCircuitScene(
  root: CircuitNode,
  gates: Instruction[],
  open: Set<string>,
  row: (wire: number) => number,
  rowCount: number,
  bus = false,
) {
  function measure(node: CircuitNode): SceneItem {
    if (node.id !== "__root__" && !open.has(node.id)) {
      const labelLines = wrapCircuitLabel(node.label),
        width = 184;
      return {
        node,
        collapsed: true,
        children: [],
        width,
        x: 0,
        y: 0,
        height: 0,
        labelLines,
      };
    }
    const children = node.children.length
      ? node.children.map(measure)
      : node.gate_indices.map((index) => ({
          gate: index,
          children: [],
          width: Math.max(
            80,
            labelWidth(gates[index].name.toUpperCase()) + 28,
            labelWidth(gateParameterLabel(gates[index]), 10) + 24,
            bus
              ? labelWidth(
                  gates[index].wires.map((w) => "q" + w).join(", "),
                  10,
                ) + 24
              : 0,
          ),
          x: 0,
          y: 0,
          height: 0,
          labelLines: [],
        }));
    const padding = node.id === "__root__" ? 0 : PADDING;
    const content =
      children.reduce((sum, c) => sum + c.width, 0) +
      Math.max(0, children.length - 1) * GAP +
      2 * padding;
    return {
      node,
      collapsed: false,
      children,
      width: Math.max(
        node.id === "__root__"
          ? 0
          : labelWidth(node.label + " · " + node.gate_count + " gates", 11) +
              54,
        content,
        104,
      ),
      x: 0,
      y: 0,
      height: 0,
      labelLines: [],
    };
  }
  const layout = measure(root),
    rowGap = bus ? 108 : 68;
  function place(item: SceneItem, x: number) {
    item.x = x;
    let next = x + (item.node?.id === "__root__" ? 0 : PADDING);
    for (const child of item.children) {
      place(child, next);
      next += child.width + GAP;
    }
  }
  place(layout, 120);
  const wireY = (wire: number) => row(wire) * rowGap;
  function bounds(item: SceneItem) {
    if (item.gate !== undefined) {
      const gate = gates[item.gate],
        ys = gate.wires.map(wireY);
      item.y = Math.min(...ys) - 24;
      item.height =
        Math.max(...ys) -
        Math.min(...ys) +
        48 +
        (bus ? 20 : 0) +
        (gateCaption(gate) ? 22 : 0);
      return;
    }
    item.children.forEach(bounds);
    const wires = item.node?.wires?.length ? item.node.wires : [0],
      ys = wires.map(wireY);
    if (item.collapsed) {
      const needed = HEADER + item.labelLines.length * 18 + 34;
      item.height = Math.max(Math.max(...ys) - Math.min(...ys) + 64, needed);
      item.y = (Math.min(...ys) + Math.max(...ys)) / 2 - item.height / 2;
    } else if (item.children.length) {
      // The synthetic root is not rendered, so it needs no title band.
      const virtual = item.node?.id === "__root__";
      item.y =
        Math.min(...item.children.map((c) => c.y)) - (virtual ? 0 : HEADER);
      item.height =
        Math.max(...item.children.map((c) => c.y + c.height)) -
        item.y +
        (virtual ? 0 : PADDING);
    } else {
      item.y = -24;
      item.height = 64;
    }
  }
  bounds(layout);
  const offset = 12 - Math.min(layout.y, -24);
  function shift(item: SceneItem) {
    item.y += offset;
    item.children.forEach(shift);
  }
  shift(layout);
  return {
    layout,
    wireY: (wire: number) => wireY(wire) + offset,
    baseY: offset,
    rowGap,
    width: Math.max(760, layout.x + layout.width + 160),
    height: Math.max(
      360,
      layout.y + layout.height + 48,
      offset + (rowCount - 1) * rowGap + 70,
    ),
  };
}
