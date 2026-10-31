import { UIIcon } from "./UIIcon";
export function CloseButton({
  label,
  onClick,
  className = "",
  title = "Close (Esc)",
}: {
  label: string;
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={"fq-icon-close " + className}
      onClick={onClick}
      aria-label={label}
      title={title}
    >
      <UIIcon name="close" size={16} />
    </button>
  );
}
