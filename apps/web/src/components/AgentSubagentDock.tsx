import { useEffect, useRef, useState } from "react";
import { childRunning, type ChildActivity } from "../state/agent-progress";
import { AgentProgress } from "./AgentProgress";

export function AgentSubagentDock({
  children,
  sessionId,
}: {
  children: ChildActivity[];
  sessionId?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const count = children.filter(childRunning).length;
  const label = count
    ? `${count} subagent${count === 1 ? "" : "s"} running`
    : "No subagents running";
  useEffect(() => {
    setOpen(false);
  }, [sessionId, children.length === 0]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="fq-agent-subagent-dock" ref={root}>
      <button
        ref={button}
        className={"fq-subagent-indicator " + (count ? "active" : "idle")}
        aria-label={label}
        title={label + (children.length ? " · View details" : "")}
        aria-expanded={open}
        aria-controls={open ? "fq-subagent-dock-details" : undefined}
        disabled={!children.length}
        onClick={() => setOpen(!open)}
      >
        <span className="fq-subagent-status-dot" aria-hidden="true" />
        {count > 0 && <span aria-hidden="true">{count}</span>}
      </button>
      {open && children.length > 0 && (
        <div
          className="fq-subagent-dock-details"
          id="fq-subagent-dock-details"
          role="region"
          aria-label="Running subagent details"
        >
          <AgentProgress children={children} sessionId={sessionId} />
        </div>
      )}
    </div>
  );
}
