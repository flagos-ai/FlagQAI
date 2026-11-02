import { UIIcon } from "./UIIcon";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { fitCircuitZoom, circuitZoomScroll } from "../state/circuit-viewport";
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
  selection,
  svgRef,
}: {
  compiled: CompiledProgram;
  zoom: number;
  onZoom: (n: number) => void;
  onSelect: (s: CircuitSelection | null) => void;
  selection?: CircuitSelection | null;
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
  const [detailLevel, setDetailLevel] = useState<number | null>(null);
  const [fitting, setFitting] = useState(false);
  const zoomCallback = useRef(onZoom);
  zoomCallback.current = onZoom;
  const currentZoom = useRef(zoom);
  currentZoom.current = zoom;
  const canvas = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<{
    zoom: number;
    left: number;
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    const target = pendingScroll.current;
    if (!target || target.zoom !== zoom || !canvas.current) return;
    canvas.current.scrollLeft = target.left;
    canvas.current.scrollTop = target.top;
    pendingScroll.current = null;
  }, [zoom]);
  const changeZoom = (next: number) => {
    const element = canvas.current;
    if (element) {
      const style = getComputedStyle(element);
      const position = circuitZoomScroll(
        {
          left: element.scrollLeft,
          top: element.scrollTop,
          width: element.clientWidth,
          height: element.clientHeight,
          paddingLeft: parseFloat(style.paddingLeft) || 0,
          paddingTop: parseFloat(style.paddingTop) || 0,
        },
        zoom,
        next,
      );
      pendingScroll.current =
        next === zoom ? null : { zoom: next, ...position };
    }
    onZoom(next);
  };
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
  const fit = () => {
    const element = canvas.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    // Measure the space after scrollbars disappear, keeping repeated Fit stable.
    const availableWidth =
      box.width -
      parseFloat(style.borderLeftWidth) -
      parseFloat(style.borderRightWidth) -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const availableHeight =
      box.height -
      parseFloat(style.borderTopWidth) -
      parseFloat(style.borderBottomWidth) -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom);
    if (availableWidth <= 0 || availableHeight <= 0) return;
    element.scrollLeft = 0;
    element.scrollTop = 0;
    pendingScroll.current = null;
    const next = fitCircuitZoom(width, height, availableWidth, availableHeight);
    if (next !== currentZoom.current) {
      currentZoom.current = next;
      zoomCallback.current(next);
    }
  };
  useLayoutEffect(() => {
    if (!fitting || !canvas.current) return;
    fit();
    // Border-box observation ignores scrollbar changes caused by fitting itself.
    const observer = new ResizeObserver(fit);
    observer.observe(canvas.current, { box: "border-box" });
    return () => observer.disconnect();
  }, [fitting, width, height]);
  const toggle = (id: string) => {
    onSelect(null);
    setDetailLevel(null);
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const setLevel = (limit: number) => {
    setDetailLevel(limit);
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
          <UIIcon name={open.has(n.id) ? "minus" : "plus"} size={12} />
        </button>
        <button
          aria-pressed={
            !!selection && "module" in selection && selection.module.id === n.id
          }
          onClick={() => onSelect({ module: n })}
        >
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
          aria-pressed={mode === "logical"}
          className={mode === "logical" ? "selected" : ""}
          onClick={() => {
            setMode("logical");
            setDetailLevel(null);
            onSelect(null);
          }}
        >
          Logical
        </button>
        <button
          aria-pressed={mode === "compiled"}
          className={mode === "compiled" ? "selected" : ""}
          onClick={() => {
            setMode("compiled");
            setDetailLevel(null);
            onSelect(null);
          }}
        >
          Compiled
        </button>
        <button aria-pressed={tree} onClick={() => setTree(!tree)}>
          <UIIcon name="tree" size={14} />
          Tree
        </button>
        <div className="push" />
        <button
          className="fq-control-icon"
          title="Zoom out"
          aria-label="Zoom out"
          disabled={zoom <= 10}
          onClick={() => {
            setFitting(false);
            changeZoom(Math.max(10, zoom - 10));
          }}
        >
          <UIIcon name="minus" />
        </button>
        <span role="status" aria-label="Circuit zoom">
          {zoom}%
        </span>
        <button
          className="fq-control-icon"
          title="Zoom in"
          aria-label="Zoom in"
          disabled={zoom >= 180}
          onClick={() => {
            setFitting(false);
            changeZoom(Math.min(180, zoom + 10));
          }}
        >
          <UIIcon name="plus" />
        </button>
        <button
          title="Fit the circuit and keep it fitted as the canvas changes"
          aria-pressed={fitting}
          onClick={() => {
            setFitting(true);
            fit();
          }}
        >
          Fit
        </button>
      </div>
      <div className="fq-toolbar detail">
        <small>DETAIL</small>
        <button aria-pressed={detailLevel === 1} onClick={() => setLevel(1)}>
          Overview
        </button>
        <button aria-pressed={detailLevel === 3} onClick={() => setLevel(3)}>
          Modules
        </button>
        <button
          aria-pressed={detailLevel === 100}
          onClick={() => setLevel(100)}
        >
          All gates
        </button>
        <button aria-pressed={detailLevel === 0} onClick={() => setLevel(0)}>
          Collapse all
        </button>
        <div className="push" />
        <button
          aria-pressed={!registers}
          className={!registers ? "selected" : ""}
          onClick={() => setRegisters(false)}
        >
          Qubits
        </button>
        <button
          aria-pressed={registers}
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
              selection={selection}
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
                    selected={
                      !!selection &&
                      "measurement" in selection &&
                      (registers ? buses[i].wires : [i]).includes(
                        selection.measurement,
                      )
                    }
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
