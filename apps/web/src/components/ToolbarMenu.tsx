import { useEffect, useRef, type ReactNode } from "react";
import { UIIcon } from "./UIIcon";

export function ToolbarMenu({
  label,
  trigger,
  children,
  className = "",
  closeOnSelect = false,
}: {
  label: string;
  trigger?: ReactNode;
  children: ReactNode;
  className?: string;
  closeOnSelect?: boolean;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (!menu.current?.contains(event.target as Node))
        menu.current?.removeAttribute("open");
    };
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        menu.current?.open &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        event.stopPropagation();
        const wasOpen = menu.current?.open;
        menu.current?.removeAttribute("open");
        if (wasOpen) menu.current?.querySelector("summary")?.focus();
      }
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape, true);
    };
  }, []);
  return (
    <details ref={menu} className={`fq-toolbar-menu ${className}`}>
      <summary role="button" aria-label={label} title={label}>
        {trigger || <UIIcon name="more" />}
      </summary>
      <div
        className="fq-toolbar-menu-items"
        aria-label={label}
        onClick={(event) => {
          if (closeOnSelect && (event.target as HTMLElement).closest("button"))
            menu.current?.removeAttribute("open");
        }}
      >
        {children}
      </div>
    </details>
  );
}
