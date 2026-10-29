export type CopyRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
const overlaps = (a: CopyRect, b: CopyRect) =>
  a.left < b.right + 3 &&
  a.right > b.left - 3 &&
  a.top < b.bottom + 3 &&
  a.bottom > b.top - 3;
// The action is fixed-positioned, never a spacer in the equation's layout.
export function mathCopyPosition(
  anchor: CopyRect,
  viewport: CopyRect,
  obstacles: CopyRect[],
) {
  const width = 26,
    height = 24,
    gap = 5;
  const candidates = [
    {
      left: anchor.right + gap,
      top: (anchor.top + anchor.bottom - height) / 2,
    },
    { left: anchor.right - width, top: anchor.top - height - gap },
    { left: anchor.right - width, top: anchor.bottom + gap },
    {
      left: anchor.left - width - gap,
      top: (anchor.top + anchor.bottom - height) / 2,
    },
  ];
  const safe = (point: { left: number; top: number }) => {
    const box = {
      ...point,
      right: point.left + width,
      bottom: point.top + height,
    };
    return (
      box.left >= viewport.left &&
      box.top >= viewport.top &&
      box.right <= viewport.right &&
      box.bottom <= viewport.bottom &&
      !obstacles.some((other) => overlaps(box, other))
    );
  };
  for (const candidate of candidates) if (safe(candidate)) return candidate;
  // Dense tables and viewport edges can leave no adjacent space. Use the nearest
  // free area in the transcript, rather than covering this or another formula.
  const free = [];
  for (let top = viewport.top; top + height <= viewport.bottom; top += 8)
    for (let left = viewport.left; left + width <= viewport.right; left += 8)
      if (safe({ left, top })) free.push({ left, top });
  return (
    free.sort(
      (a, b) =>
        Math.hypot(a.left - anchor.right, a.top - anchor.top) -
        Math.hypot(b.left - anchor.right, b.top - anchor.top),
    )[0] ?? null
  );
}
