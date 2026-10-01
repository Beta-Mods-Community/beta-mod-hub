type Bounds = { left: number; top: number; right: number; bottom: number };

export function helpPosition(anchor: Bounds, panel: { width: number; height: number }, viewport: { width: number; height: number }) {
  const margin = 12;
  const gap = 8;
  const below = viewport.height - anchor.bottom - gap - margin;
  const above = anchor.top - gap - margin;
  const desiredTop = panel.height <= below || below >= above
    ? anchor.bottom + gap
    : anchor.top - panel.height - gap;
  return {
    left: Math.max(margin, Math.min(anchor.left, viewport.width - panel.width - margin)),
    top: Math.max(margin, Math.min(desiredTop, viewport.height - panel.height - margin)),
  };
}
