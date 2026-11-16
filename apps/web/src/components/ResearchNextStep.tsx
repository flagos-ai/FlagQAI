import type { PythonRun } from "../api/python-runs";
import { useRef } from "react";
import { savedResearchGuidance } from "../state/research-guidance";

export function ResearchNextStep({ run }: { run: PythonRun }) {
  const introduction = useRef<HTMLParagraphElement>(null);
  const guide = savedResearchGuidance(run);
  if (!guide) return null;
  return (
    <details
      className="fq-research-next-step"
      key={run.id}
      onToggle={(event) => {
        const details = event.currentTarget;
        if (!details.open) return;
        requestAnimationFrame(() => {
          const target = introduction.current;
          const pane = details.closest<HTMLElement>(".fq-python-console");
          if (!details.isConnected || !details.open || !target || !pane) return;
          const overflow =
            target.getBoundingClientRect().bottom -
            pane.getBoundingClientRect().bottom;
          if (overflow > 0) pane.scrollTop += overflow + 8;
        });
      }}
    >
      <summary>Next experiment · {guide.title}</summary>
      <p ref={introduction}>{guide.question}</p>
      <dl>
        <div>
          <dt>Change</dt>
          <dd>{guide.change}</dd>
        </div>
        <div>
          <dt>Observe</dt>
          <dd>{guide.observe}</dd>
        </div>
        <div>
          <dt>Check</dt>
          <dd>{guide.check}</dd>
        </div>
      </dl>
      <p className="fq-muted">{guide.limit}</p>
      <p className="fq-muted">
        To compare, open a saved result in Jobs, select both experiments and
        choose Compare 2 / 2.
      </p>
      <small>Based on the saved source · Run {run.id.slice(0, 8)}</small>
    </details>
  );
}
