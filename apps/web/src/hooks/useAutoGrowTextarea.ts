import { useLayoutEffect, type RefObject } from "react";

function resize(node: HTMLTextAreaElement) {
  const style = getComputedStyle(node);
  const minimum = parseFloat(style.minHeight) || 70;
  const maximum = Math.max(minimum, parseFloat(style.maxHeight) || 180);
  // Reset before measuring so deleting text and sending also shrink the composer.
  node.style.height = "auto";
  node.style.overflowY = "hidden";
  const height = node.scrollHeight;
  node.style.height = Math.min(maximum, Math.max(minimum, height)) + "px";
  node.style.overflowY = height > maximum ? "auto" : "hidden";
}
export function useAutoGrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  useLayoutEffect(() => {
    if (ref.current) resize(ref.current);
  }, [ref, value]);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let width = node.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = node.getBoundingClientRect().width;
      if (nextWidth !== width) {
        width = nextWidth;
        resize(node);
      }
    });
    const viewportChanged = () => resize(node);
    observer.observe(node);
    window.addEventListener("resize", viewportChanged);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", viewportChanged);
    };
  }, [ref]);
}
