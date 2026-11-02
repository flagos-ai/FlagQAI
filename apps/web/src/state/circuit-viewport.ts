export function fitCircuitZoom(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
) {
  return Math.max(
    10,
    Math.min(
      180,
      Math.floor(
        90 * Math.min(availableWidth / width, availableHeight / height),
      ),
    ),
  );
}

/** Keep the same SVG point at the center; the browser clamps content edges. */
export function circuitZoomScroll(
  view: {
    left: number;
    top: number;
    width: number;
    height: number;
    paddingLeft: number;
    paddingTop: number;
  },
  from: number,
  to: number,
) {
  const ratio = to / from;
  return {
    left: Math.max(
      0,
      view.paddingLeft +
        (view.left + view.width / 2 - view.paddingLeft) * ratio -
        view.width / 2,
    ),
    top: Math.max(
      0,
      view.paddingTop +
        (view.top + view.height / 2 - view.paddingTop) * ratio -
        view.height / 2,
    ),
  };
}
