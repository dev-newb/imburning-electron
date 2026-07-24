'use strict';

function normalizeBounds(bounds, fallback) {
  const source = bounds || {};
  const base = fallback || {};
  const numberOr = (value, fallbackValue) => Number.isFinite(value) ? value : fallbackValue;
  return {
    x: numberOr(source.x, base.x),
    y: numberOr(source.y, base.y),
    width: numberOr(source.width, base.width),
    height: numberOr(source.height, base.height)
  };
}

function intersects(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function clampBoundsToDisplays(bounds, displays, {
  fallbackWidth = 560,
  fallbackHeight = 400,
  minWidth = 200,
  minHeight = 180,
  minVisibleWidth = 80,
  minVisibleHeight = 32
} = {}) {
  const workAreas = (displays || [])
    .map((display) => display && (display.workArea || display.bounds))
    .filter((area) => area && [area.x, area.y, area.width, area.height].every(Number.isFinite));

  if (!workAreas.length) {
    return normalizeBounds(bounds, { x: 0, y: 0, width: fallbackWidth, height: fallbackHeight });
  }

  const primary = workAreas[0];
  const normalized = normalizeBounds(bounds, {
    x: Math.round(primary.x + (primary.width - fallbackWidth) / 2),
    y: Math.round(primary.y + (primary.height - fallbackHeight) / 2),
    width: fallbackWidth,
    height: fallbackHeight
  });
  normalized.width = Math.min(Math.max(normalized.width, minWidth), primary.width);
  normalized.height = Math.min(Math.max(normalized.height, minHeight), primary.height);

  const visibleArea = (rect, area) => {
    const left = Math.max(rect.x, area.x);
    const top = Math.max(rect.y, area.y);
    const right = Math.min(rect.x + rect.width, area.x + area.width);
    const bottom = Math.min(rect.y + rect.height, area.y + area.height);
    return { width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };

  let target = workAreas.find((area) => {
    if (!intersects(normalized, area)) return false;
    const visible = visibleArea(normalized, area);
    return visible.width >= Math.min(minVisibleWidth, normalized.width)
      && visible.height >= Math.min(minVisibleHeight, normalized.height);
  });

  if (!target) {
    target = primary;
    normalized.x = Math.round(target.x + (target.width - normalized.width) / 2);
    normalized.y = Math.round(target.y + (target.height - normalized.height) / 2);
  }

  normalized.width = Math.min(Math.max(normalized.width, minWidth), target.width);
  normalized.height = Math.min(Math.max(normalized.height, minHeight), target.height);
  normalized.x = Math.min(Math.max(normalized.x, target.x), target.x + target.width - normalized.width);
  normalized.y = Math.min(Math.max(normalized.y, target.y), target.y + target.height - normalized.height);
  return normalized;
}

module.exports = { normalizeBounds, intersects, clampBoundsToDisplays };
