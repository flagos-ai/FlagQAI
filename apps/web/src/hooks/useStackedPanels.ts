import { useEffect, useState } from "react";
export function useStackedPanels() {
  const [stacked, setStacked] = useState(() => window.innerWidth <= 1150);
  useEffect(() => {
    const media = window.matchMedia("(max-width:1150px)"),
      changed = () => setStacked(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  return stacked;
}
