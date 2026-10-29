import { useMemo, useRef, useState } from "react";
import { circuitHierarchy } from "../../../../packages/quantum-workspace/domain/circuit-tree.mjs";
import type {
  CircuitNode,
  CompiledProgram,
  Instruction,
} from "../contracts/quantum-workspace";

export type CircuitSelection =
  | { module: CircuitNode }
  | { gate: Instruction; index: number }
  | { measurement: number };
import { gateFamilies } from "../state/gate-style";
import { buildCircuitScene } from "../state/circuit-scene";
import { CircuitModules } from "./CircuitModules";
import { MeasurementSymbol } from "./CircuitSymbols";
export function CircuitCanvas({
  compiled,
  zoom,
  onZoom,
  onSelect,
  svgRef,
}: {
  compiled: CompiledProgram;
  zoom: number;
  onZoom: (n: number) => void;
  onSelect: (s: CircuitSelection | null) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const [mode, setMode] = useState<"logical" | "compiled">("logical"),
    [registers, setRegisters] = useState(false),
    [tree, setTree] = useState(false),
    [open, setOpen] = useState(
      () =>
        new Set([
          "__root__",
          "main",
          "main/prepare",
          "ungrouped",
          "ungrouped_0",
        ]),
    );
  const canvas = useRef<HTMLDivElement>(null);
  const c =
    mode === "logical"
      ? compiled
      : {
          ...compiled,
          hierarchy: undefined,
          logical_instructions: compiled.instructions,
          groups: {},
        };
  const root = circuitHierarchy(c) as CircuitNode,
    gates = c.logical_instructions || c.instructions;
  const buses = useMemo(() => {
    const list = (compiled.registers || []).map((r) => ({ ...r })),
      used = new Set(list.flatMap((r) => r.wires));
    for (let i = 0; i < compiled.qubits; i++)
      if (!used.has(i)) list.push({ name: "q" + i, wires: [i] });
    return list;
  }, [compiled]);
  const row = (wire: number) =>
    registers ? buses.findIndex((r) => r.wires.includes(wire)) : wire;
  const scene = buildCircuitScene(
    root,
    gates,
    open,
    row,
    registers ? buses.length : compiled.qubits,
    registers,
  );
  const { layout, wireY: y, baseY, rowGap, height, width } = scene;
  const toggle = (id: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setLevel = (limit: number) => {
    const next = new Set(["__root__"]);
    const visit = (n: CircuitNode, level: number) => {
      if (level < limit) next.add(n.id);
      n.children.forEach((ch) => visit(ch, level + 1));
    };
    visit(root, 0);
    setOpen(next);
    onSelect(null);
  };
  const treeRow = (n: CircuitNode, level: number): React.ReactNode => (
    <div key={n.id}>
      <div className="fq-tree-row" style={{ paddingLeft: level * 12 }}>
        <button
          aria-label={(open.has(n.id) ? "Collapse " : "Expand ") + n.label}
          onClick={() => toggle(n.id)}
        >
          {open.has(n.id) ? "−" : "+"}
        </button>
        <button onClick={() => onSelect({ module: n })}>
          {n.label}
          <small>{n.gate_count} gates</small>
        </button>
      </div>
      {open.has(n.id) && n.children.map((ch) => treeRow(ch, level + 1))}
    </div>
  );
  return (
    <>
      <div className="fq-toolbar">
        <button
          className={mode === "logical" ? "selected" : ""}
          onClick={() => {
            setMode("logical");
            onSelect(null);
          }}
        >
          Logical
        </button>
        <button
          className={mode === "compiled" ? "selected" : ""}
          onClick={() => {
            setMode("compiled");
            onSelect(null);
          }}
        >
          Compiled
        </button>
        <button onClick={() => setTree(!tree)}>☷ Tree</button>
        <div className="push" />
        <button
          aria-label="Zoom out"
          onClick={() => onZoom(Math.max(10, zoom - 10))}
        >
          −
        </button>
        <span>{zoom}%</span>
        <button
          aria-label="Zoom in"
          onClick={() => onZoom(Math.min(180, zoom + 10))}
        >
          ＋
        </button>
        <button
          onClick={() =>
            onZoom(
              Math.max(
                10,
                Math.min(
                  180,
                  Math.floor(
                    (90 * (canvas.current?.clientWidth || 800)) / width,
                  ),
                ),
              ),
            )
          }
        >
          Fit
        </button>
      </div>
      <div className="fq-toolbar detail">
        <small>DETAIL</small>
        <button onClick={() => setLevel(1)}>Overview</button>
        <button onClick={() => setLevel(3)}>Modules</button>
        <button onClick={() => setLevel(100)}>All gates</button>
        <button onClick={() => setLevel(0)}>Collapse all</button>
        <div className="push" />
        <button
          className={!registers ? "selected" : ""}
          onClick={() => setRegisters(false)}
        >
          Qubits
        </button>
        <button
          className={registers ? "selected" : ""}
          onClick={() => setRegisters(true)}
        >
          Registers
        </button>
      </div>
      <div className="fq-circuit-metrics">
        <span>
          {compiled.qubits} qubits · {compiled.depth} compiled depth ·{" "}
          {compiled.instructions.length} compiled gates · FlagQuantum{" "}
          {compiled.version}
        </span>
        <details className="fq-gate-legend">
          <summary>Gate colors</summary>
          <div>
            {Object.values(gateFamilies).map((family) => (
              <span key={family.label}>
                <i style={{ background: family.color }} />
                {family.label}
              </span>
            ))}
          </div>
        </details>
      </div>
      <div className="fq-circuit-workarea">
        {tree && (
          <aside className="fq-circuit-tree">
            {root.children.map((n) => treeRow(n, 0))}
          </aside>
        )}
        <div ref={canvas} className="fq-circuit-canvas">
          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${width} ${height}`}
            width={(width * zoom) / 90}
            height={(height * zoom) / 90}
            role="group"
            aria-label="Interactive hierarchical quantum circuit"
          >
            {Array.from(
              { length: registers ? buses.length : compiled.qubits },
              (_, i) => (
                <g key={i}>
                  <text
                    x={15}
                    y={baseY + 5 + i * rowGap}
                    fill="#b4bfce"
                    fontSize={12}
                  >
                    {registers
                      ? buses[i].name + " / " + buses[i].wires.length
                      : "q" + i}
                  </text>
                  <line
                    x1={85}
                    x2={width - 35}
                    y1={baseY + i * rowGap}
                    y2={baseY + i * rowGap}
                    stroke="#637080"
                    strokeOpacity={0.6}
                  />
                </g>
              ),
            )}
            <CircuitModules
              item={layout}
              gates={gates}
              wireY={y}
              bus={registers}
              toggle={toggle}
              onSelect={onSelect}
            />
            {Array.from(
              { length: registers ? buses.length : compiled.qubits },
              (_, i) =>
                (compiled.measurement_qubits === undefined ||
                  (registers ? buses[i].wires : [i]).some((q) =>
                    compiled.measurement_qubits!.includes(q),
                  )) && (
                  <MeasurementSymbol
                    key={i}
                    x={width - 65}
                    y={baseY + i * rowGap}
                    label={registers ? buses[i].name : "q" + i}
                    wires={registers ? buses[i].wires : [i]}
                    onSelect={() =>
                      onSelect({
                        measurement: registers ? buses[i].wires[0] : i,
                      })
                    }
                  />
                ),
            )}
          </svg>
        </div>
      </div>
    </>
  );
}
