import type { Instruction } from "../contracts/quantum-workspace";
import { gateFamilies, gateStyle } from "../state/gate-style";
import {
  gateCaption,
  gateParameterLabel,
  labelWidth,
} from "../state/circuit-scene";

function activate(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}
function GateLabel({ name, x, y }: { name: string; x: number; y: number }) {
  const lower = name.toLowerCase();
  const rotation = /^(r)([xyz]{1,2})$/.exec(lower);
  const dagger = /^(s|t|sx)dg$/.exec(lower);
  const label =
    lower === "id" || lower === "i"
      ? "I"
      : lower === "sx"
        ? "√X"
        : dagger
          ? dagger[1] === "sx"
            ? "√X"
            : dagger[1].toUpperCase()
          : name.toUpperCase();
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fill="#17202a"
      fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
      fontSize={14}
      fontWeight={600}
    >
      {rotation ? (
        <>
          {"R"}
          <tspan baselineShift="sub" fontSize={10}>
            {rotation[2]}
          </tspan>
        </>
      ) : (
        label
      )}
      {dagger && (
        <tspan baselineShift="super" fontSize={10}>
          †
        </tspan>
      )}
    </text>
  );
}
function GateFrame({
  x,
  y,
  width,
  color,
}: {
  x: number;
  y: number;
  width: number;
  color: string;
}) {
  return (
    <>
      <rect
        x={x - width / 2}
        y={y - 18}
        width={width}
        height={36}
        rx={5}
        fill={color}
        stroke="#ffffff"
        strokeOpacity={0.22}
        strokeWidth={0.8}
      />
      <path
        d={`M${x - width / 2 + 7} ${y - 16.5}h${width - 14}`}
        stroke="#fff"
        strokeOpacity={0.25}
        strokeWidth={0.8}
      />
    </>
  );
}
export function GateSymbol({
  gate,
  index,
  x,
  width,
  y,
  bus,
  onSelect,
}: {
  gate: Instruction;
  index: number;
  x: number;
  width: number;
  y: (wire: number) => number;
  bus: boolean;
  onSelect: () => void;
}) {
  const style = gateStyle(gate.name),
    color = style.color,
    ys = [...new Set(gate.wires.map(y))],
    name = gate.name.toLowerCase(),
    target = y(gate.wires.at(-1)!);
  const displayName = name.replace(/^(s|t|sx)dg$/, "$1").replace(/^sx$/, "√X");
  const boxWidth = Math.max(36, labelWidth(displayName.toUpperCase(), 12) + 12);
  const controlled = /^(cx|cy|cz|ch|cp|crx|cry|crz|cu1|cu3|ccx|cswap)$/.test(
      name,
    ),
    sharedBus = bus && ys.length < gate.wires.length;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Inspect ${gate.name.toUpperCase()} gate ${index + 1}`}
      onClick={onSelect}
      onKeyDown={(e) => activate(e, onSelect)}
      className="fq-circuit-symbol"
    >
      <title>{`${gate.name.toUpperCase()} · ${style.label} · ${gate.wires.map((w) => "q" + w).join(", ")}${gate.line ? " · source line " + gate.line : ""}${gateCaption(gate) ? " · " + gateCaption(gate) : ""}`}</title>
      <rect
        x={x - width / 2}
        y={Math.min(...ys) - 25}
        width={width}
        height={Math.max(...ys) - Math.min(...ys) + 50}
        fill="transparent"
      />
      {ys.length > 1 && (
        <line
          x1={x}
          x2={x}
          y1={Math.min(...ys)}
          y2={Math.max(...ys)}
          stroke={color}
          strokeWidth={2}
        />
      )}
      {ys.map((yy) => {
        const isControl =
          controlled &&
          !sharedBus &&
          (name === "cz" ||
            (name === "cswap" ? yy === y(gate.wires[0]) : yy !== target));
        const swap =
          (name === "swap" || name === "cswap") && !sharedBus && !isControl;
        const plus = ["cx", "ccx"].includes(name) && !sharedBus && !isControl;
        return (
          <g key={yy}>
            {isControl ? (
              <circle
                cx={x}
                cy={yy}
                r={4.5}
                fill={color}
                stroke={color}
                strokeWidth={1}
              />
            ) : swap ? (
              <path
                d={`M${x - 7} ${yy - 7}l14 14m-14 0 14-14`}
                fill="none"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            ) : plus ? (
              <g
                fill="#232323"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
              >
                <circle cx={x} cy={yy} r={12} />
                <path d={`M${x - 7} ${yy}h14M${x} ${yy - 7}v14`} />
              </g>
            ) : (
              <>
                <GateFrame x={x} y={yy} width={boxWidth} color={color} />
                <GateLabel
                  x={x}
                  y={yy}
                  name={controlled && !sharedBus ? name.slice(1) : name}
                />
              </>
            )}
          </g>
        );
      })}
      {bus && (
        <text
          x={x}
          y={Math.max(...ys) + 34}
          textAnchor="middle"
          fill="#9eb5cf"
          fontSize={10}
        >
          {gate.wires.map((w) => "q" + w).join(", ")}
        </text>
      )}
      {gateCaption(gate) && (
        <text
          x={x}
          y={Math.max(...ys) + (bus ? 52 : 35)}
          textAnchor="middle"
          fill={color}
          fillOpacity={0.85}
          fontSize={10}
        >
          <title>{gateCaption(gate)}</title>
          {gateParameterLabel(gate)}
        </text>
      )}
    </g>
  );
}
export function MeasurementSymbol({
  x,
  y,
  label,
  wires,
  onSelect,
}: {
  x: number;
  y: number;
  label: string;
  wires: number[];
  onSelect: () => void;
}) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={"Measure " + label}
      onClick={onSelect}
      onKeyDown={(e) => activate(e, onSelect)}
      className="fq-circuit-symbol"
    >
      <title>{"Measurement · " + wires.map((w) => "q" + w).join(", ")}</title>
      <GateFrame
        x={x}
        y={y}
        width={36}
        color={gateFamilies.measurement.color}
      />
      <g
        fill="none"
        stroke="#34264c"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={`M${x - 11} ${y + 6}a11 11 0 0 1 22 0M${x} ${y + 6}l7-13`} />
        <path
          d={`M${x - 8} ${y - 1}l2 2M${x} ${y - 5}v3M${x + 8} ${y - 1}l-2 2`}
          strokeWidth={1.1}
          opacity={0.6}
        />
        <circle cx={x} cy={y + 6} r={1.4} fill="#34264c" stroke="none" />
      </g>
      {wires.length > 1 && (
        <text
          x={x}
          y={y + 39}
          textAnchor="middle"
          fill={gateFamilies.measurement.color}
          fontSize={10}
        >
          {wires.length} bits
        </text>
      )}
    </g>
  );
}
