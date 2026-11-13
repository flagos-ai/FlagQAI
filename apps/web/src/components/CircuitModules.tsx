import type { Instruction } from "../contracts/quantum-workspace";
import type { SceneItem } from "../state/circuit-scene";
import type { CircuitSelection } from "./CircuitCanvas";
import { GateSymbol } from "./CircuitSymbols";
const palette = ["#55b8ff", "#67c8c3", "#b6a0df", "#a6c4df"];
export function CircuitModules({
  item,
  level = 0,
  gates,
  wireY,
  bus,
  toggle,
  onSelect,
  selection,
}: {
  item: SceneItem;
  level?: number;
  gates: Instruction[];
  wireY: (wire: number) => number;
  bus: boolean;
  toggle: (id: string) => void;
  onSelect: (selection: CircuitSelection) => void;
  selection?: CircuitSelection | null;
}) {
  if (item.gate !== undefined)
    return (
      <GateSymbol
        gate={gates[item.gate]}
        index={item.gate}
        x={item.x + item.width / 2}
        width={item.width}
        y={wireY}
        bus={bus}
        onSelect={() =>
          onSelect({ gate: gates[item.gate!], index: item.gate! })
        }
        selected={
          !!selection &&
          "gate" in selection &&
          selection.gate === gates[item.gate]
        }
      />
    );
  const node = item.node!,
    color = palette[Math.max(0, level - 1) % palette.length];
  // Anonymous gate ranges use a compact summary with a wire connector rather
  // than a solid box spanning every participating qubit.
  const rangeWires =
    item.collapsed && node.kind === "sequence" ? node.wires.map(wireY) : null;
  if (rangeWires) {
    const height = Math.max(104, 70 + item.labelLines.length * 18);
    item = { ...item, y: item.y + (item.height - height) / 2, height };
  }
  const select = () => onSelect({ module: node }),
    change = () => toggle(node.id);
  const keyboard = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };
  return (
    <g data-circuit-module={node.id}>
      {rangeWires && rangeWires.length > 0 && (
        <g
          aria-hidden="true"
          pointerEvents="none"
          stroke={color}
          strokeOpacity={0.5}
        >
          <path
            d={`M${item.x + item.width / 2} ${Math.min(...rangeWires)}V${Math.max(...rangeWires)}`}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          {rangeWires.map((y, index) => (
            <circle
              key={index}
              cx={item.x + item.width / 2}
              cy={y}
              r={3}
              fill="#232323"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      )}
      {node.id !== "__root__" && (
        <>
          {item.collapsed && (
            <rect
              x={item.x}
              y={item.y}
              width={item.width}
              height={item.height}
              rx={5}
              fill="#232323"
            />
          )}
          <rect
            data-module-frame={node.id}
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
            rx={5}
            fill={color}
            fillOpacity={item.collapsed ? 0.09 : 0.015}
            stroke={color}
            strokeOpacity={
              selection &&
              "module" in selection &&
              selection.module.id === node.id
                ? 1
                : 0.45
            }
            strokeWidth={
              selection &&
              "module" in selection &&
              selection.module.id === node.id
                ? 2
                : 1
            }
            vectorEffect="non-scaling-stroke"
            onDoubleClick={change}
          />
          <title>
            {node.label} · {node.gate_count} gates
          </title>
          {!item.collapsed && (
            <rect
              x={item.x + 1}
              y={item.y + 1}
              width={item.width - 2}
              height={31}
              rx={4}
              fill="#232323"
            />
          )}
          <g
            role="button"
            tabIndex={0}
            aria-label={`${item.collapsed ? "Expand" : "Collapse"} ${node.label}`}
            onClick={change}
            onKeyDown={(e) => keyboard(e, change)}
          >
            <rect
              x={item.x + 6}
              y={item.y + 6}
              width={19}
              height={18}
              rx={3}
              fill={color}
            />
            <path
              d={`M${item.x + 11} ${item.y + 15}h9${item.collapsed ? `M${item.x + 15.5} ${item.y + 10.5}v9` : ""}`}
              fill="none"
              stroke="#14202e"
              strokeWidth={1.6}
            />
          </g>
          <g
            role="button"
            tabIndex={0}
            aria-label={"Select " + node.label}
            aria-pressed={
              !!selection &&
              "module" in selection &&
              selection.module.id === node.id
            }
            onClick={select}
            onKeyDown={(e) => keyboard(e, select)}
            data-module-label={node.id}
          >
            {item.collapsed ? (
              <>
                {item.labelLines.map((line, index) => (
                  <text
                    key={index}
                    x={item.x + item.width / 2}
                    y={
                      item.y +
                      36 +
                      (item.height - 70 - item.labelLines.length * 18) / 2 +
                      index * 18 +
                      13
                    }
                    textAnchor="middle"
                    fill={color}
                    fontSize={12}
                  >
                    {line}
                  </text>
                ))}
                <text
                  x={item.x + item.width / 2}
                  y={item.y + item.height - 13}
                  textAnchor="middle"
                  fill={color}
                  opacity={0.8}
                  fontSize={10}
                >
                  {node.gate_count} gates ·{" "}
                  {node.children.length
                    ? node.children.length +
                      (node.kind === "sequence" ? " ranges" : " modules")
                    : node.wires.length + " qubits"}
                </text>
              </>
            ) : (
              <text x={item.x + 33} y={item.y + 19} fill={color} fontSize={11}>
                {node.label} · {node.gate_count} gates
              </text>
            )}
          </g>
        </>
      )}
      {item.children.map((child, index) => (
        <CircuitModules
          key={child.node?.id ?? "gate" + index}
          item={child}
          level={level + 1}
          gates={gates}
          wireY={wireY}
          bus={bus}
          toggle={toggle}
          onSelect={onSelect}
          selection={selection}
        />
      ))}
    </g>
  );
}
