import type { CompiledProgram } from "../contracts/quantum-workspace";

export function CircuitSources({
  compiled,
  ids,
}: {
  compiled: CompiledProgram;
  ids?: string[];
}) {
  if (!ids?.length) return null;
  const sources = compiled.synthesis_sources?.filter((source) =>
    ids.includes(source.id),
  );
  if (!sources?.length) return null;
  return (
    <section
      className="fq-circuit-sources"
      aria-label="Compiler source attribution"
    >
      <small className="fq-circuit-source-label">
        {sources.length > 1 ? "Combined compiler sources" : "Compiler source"}
      </small>
      <ul role="list">
        {sources.map((source) => (
          <li key={source.id}>
            {source.operation || source.label || source.id}
            {source.action ? ` · ${source.action}` : ""}
            {source.line ? ` · captured source line ${source.line}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
