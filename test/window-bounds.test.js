'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { intersects, clampBoundsToDisplays } = require('../src/window-bounds');

const displays = [
  { workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  { workArea: { x: 1920, y: 0, width: 1280, height: 1024 } }
];

test('intersects detects overlapping rectangles', () => {
  assert.equal(intersects({ x: 10, y: 10, width: 50, height: 50 }, { x: 0, y: 0, width: 20, height: 20 }), true);
  assert.equal(intersects({ x: 30, y: 30, width: 10, height: 10 }, { x: 0, y: 0, width: 20, height: 20 }), false);
});

test('valid secondary-display bounds are preserved', () => {
  assert.deepEqual(
    clampBoundsToDisplays({ x: 2100, y: 100, width: 660, height: 400 }, displays),
    { x: 2100, y: 100, width: 660, height: 400 }
  );
});

test('offscreen bounds recover to the primary display', () => {
  const result = clampBoundsToDisplays({ x: 5000, y: 4000, width: 660, height: 400 }, displays);
  assert.deepEqual(result, { x: 630, y: 320, width: 660, height: 400 });
});

test('oversized bounds are constrained to the work area', () => {
  const result = clampBoundsToDisplays({ x: 0, y: 0, width: 3000, height: 2000 }, [displays[0]]);
  assert.deepEqual(result, { x: 0, y: 0, width: 1920, height: 1040 });
});
