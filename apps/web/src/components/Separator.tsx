import type { PointerEvent } from "react";

export function Separator({
  label,
  value,
  onChange,
  orientation = "vertical",
  reverse = false,
  min = 100,
  max = 600,
  initial = 280,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  orientation?: "vertical" | "horizontal";
  reverse?: boolean;
  min?: number;
  max?: number;
  initial?: number;
}) {
  const horizontal = orientation === "horizontal";
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const element = event.currentTarget;
    const start = horizontal ? event.clientY : event.clientX;
    const origin = value;
    element.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) =>
      onChange(
        origin +
          ((horizontal ? e.clientY : e.clientX) - start) * (reverse ? -1 : 1),
      );
    const stop = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", stop);
      element.removeEventListener("pointercancel", stop);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      className={"fq-separator " + (horizontal ? "horizontal" : "vertical")}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={drag}
      onDoubleClick={() => onChange(initial)}
      onKeyDown={(e) => {
        const increase = horizontal ? "ArrowDown" : "ArrowRight",
          decrease = horizontal ? "ArrowUp" : "ArrowLeft";
        if (e.key === increase || e.key === decrease) {
          e.preventDefault();
          onChange(
            value +
              (e.key === increase ? 1 : -1) *
                (reverse ? -1 : 1) *
                (e.shiftKey ? 40 : 12),
          );
        }
      }}
    >
      <span />
    </div>
  );
}
