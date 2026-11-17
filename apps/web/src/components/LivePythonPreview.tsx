import { useLayoutEffect, useRef } from "react";
import type { AgentCodePreview } from "../state/agent-code-preview";

export function LivePythonPreview({ preview }: { preview: AgentCodePreview }) {
  const output = useRef<HTMLPreElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    if (following.current && output.current)
      output.current.scrollTop = output.current.scrollHeight;
  }, [preview.source]);
  return (
    <section
      className="fq-live-python-preview"
      aria-label="Live Python preview"
    >
      <div className="fq-editor-status">
        <span role="status">Agent writing Python · Read-only</span>
        <strong>{preview.name}</strong>
      </div>
      <pre
        ref={output}
        tabIndex={0}
        aria-label="Python source being written"
        onScroll={(event) => {
          const element = event.currentTarget;
          following.current =
            element.scrollHeight - element.clientHeight - element.scrollTop <
            24;
        }}
      >
        {preview.source}
      </pre>
    </section>
  );
}
