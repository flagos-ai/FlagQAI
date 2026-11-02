import { useEffect, useId, useRef, useState } from "react";
import { UIIcon } from "./UIIcon";
export function ExportMenu({
  hasCounts,
  onJSON,
  onCSV,
}: {
  hasCounts: boolean;
  onJSON: () => void;
  onCSV: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    panel.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="fq-job-export"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          event.preventDefault();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label="Export results"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <UIIcon name="download" size={14} />
        Export
      </button>
      {open && (
        <div id={id} role="group" aria-label="Export formats" ref={panel}>
          <small className="fq-export-note">
            JSON: complete saved job. CSV: current measurement and batch. Search
            and pagination do not limit exports.
          </small>
          <button
            onClick={() => {
              onJSON();
              close();
            }}
          >
            JSON
          </button>
          <button
            disabled={!hasCounts}
            title={
              hasCounts
                ? "Export all recorded states"
                : "CSV needs a measurement with recorded counts"
            }
            onClick={() => {
              onCSV();
              close();
            }}
          >
            CSV · selected measurement
          </button>
          {!hasCounts && (
            <small className="fq-export-note">
              CSV needs a measurement with recorded counts. Use JSON for the
              complete saved result.
            </small>
          )}
        </div>
      )}
    </div>
  );
}
