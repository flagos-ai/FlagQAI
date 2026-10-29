import { useEffect, useRef } from "react";
export function Modal({
  children,
  onClose,
  className,
  label,
  labelledBy,
  initialFocus,
}: {
  children: React.ReactNode;
  onClose: () => void;
  className: string;
  label?: string;
  labelledBy?: string;
  initialFocus?: React.RefObject<HTMLInputElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    outsidePress = useRef(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      element = dialog.current!;
    element.showModal();
    initialFocus?.current?.focus();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const outside = (element: HTMLDialogElement, x: number, y: number) => {
    const rect = element.getBoundingClientRect();
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
  };
  return (
    <dialog
      ref={dialog}
      className={className}
      aria-label={label}
      aria-labelledby={labelledBy}
      onPointerDown={(event) => {
        outsidePress.current =
          event.target === event.currentTarget &&
          outside(event.currentTarget, event.clientX, event.clientY);
      }}
      onPointerCancel={() => {
        outsidePress.current = false;
      }}
      onClick={(event) => {
        if (
          outsidePress.current &&
          event.target === event.currentTarget &&
          outside(event.currentTarget, event.clientX, event.clientY)
        )
          onClose();
        outsidePress.current = false;
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
    >
      {children}
    </dialog>
  );
}
