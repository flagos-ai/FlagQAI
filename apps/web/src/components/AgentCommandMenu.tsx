import type { AgentCommand } from "../state/agent-commands";
export const COMMAND_MENU_ID = "fq-agent-command-menu";
export function AgentCommandMenu({
  commands,
  selected,
  onSelect,
  onHover,
  disabledReason,
}: {
  commands: AgentCommand[];
  selected: number;
  onSelect: (command: AgentCommand) => void;
  onHover: (index: number) => void;
  disabledReason?: (command: AgentCommand) => string | undefined;
}) {
  return (
    <div className="fq-command-popover">
      <div className="fq-command-heading">
        Commands <span>↑↓ select · Enter open · Tab complete</span>
      </div>
      <div id={COMMAND_MENU_ID} role="listbox" aria-label="Agent commands">
        {commands.map((command, index) => (
          <button
            key={command.name}
            id={COMMAND_MENU_ID + "-" + command.name}
            type="button"
            role="option"
            aria-selected={index === selected}
            aria-disabled={!!disabledReason?.(command)}
            title={disabledReason?.(command)}
            tabIndex={-1}
            className={index === selected ? "selected" : ""}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => {
              if (!disabledReason?.(command)) onSelect(command);
            }}
          >
            <strong>/{command.name}</strong>
            <span>{command.description}</span>
            <small aria-hidden="true">↵</small>
          </button>
        ))}
        {!commands.length && (
          <p role="status">
            No matching commands. Try /new, /resume, /model or /provider.
          </p>
        )}
      </div>
      <small className="fq-command-footnote">
        Web commands · Esc closes · Shift+Enter adds a line
      </small>
    </div>
  );
}
