import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../shared/camera.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, String(a) + ' != ' + String(b));

test('initial view uses original world coordinates', () => {
  const c = new Camera(900, 600);
  assert.deepEqual(c.toWorld(120, 180), { x: 120, y: 180 });
  assert.equal(c.zoom, 1);
});
test('pointer-anchored zoom keeps the focused world point stable', () => {
  const c = new Camera(900, 600);
  const anchor = { x: 350, y: 240 };
  const before = c.toWorld(anchor.x, anchor.y);
  c.zoomTo(2.5, anchor.x, anchor.y);
  const after = c.toWorld(anchor.x, anchor.y);
  close(after.x, before.x); close(after.y, before.y);
});
test('pan is constrained at all world edges', () => {
  const c = new Camera(800, 500);
  c.zoomTo(3);
  c.panBy(10000, 10000);
  assert.equal(c.x, 0); assert.equal(c.y, 0);
  c.panBy(-10000, -10000);
  assert.equal(c.x, -1600); assert.equal(c.y, -1000);
});
test('zoom out centers world and does not allow pointless dragging', () => {
  const c = new Camera(800, 500);
  c.zoomTo(0.5, 0, 0);
  assert.equal(c.x, 200); assert.equal(c.y, 125);
  c.panBy(40, -70);
  assert.equal(c.x, 200); assert.equal(c.y, 125);
});
test('zoom limits apply to wheel and button style zooms', () => {
  const c = new Camera(800, 500);
  c.zoomBy(100000);
  assert.equal(c.zoom, 8);
  c.zoomBy(0.00001);
  assert.equal(c.zoom, 0.5);
});
test('reset restores 100% view after zoom and movement', () => {
  const c = new Camera(800, 500);
  c.zoomTo(3);
  c.panBy(-50, -80);
  c.reset();
  assert.equal(c.zoom, 1);
  assert.deepEqual(c.toWorld(400, 250), { x: 400, y: 250 });
});
test('resize preserves zoom and keeps the view in bounds', () => {
  const c = new Camera(900, 500);
  c.zoomTo(4);
  c.panBy(-900, -700);
  c.resize(500, 300);
  assert.equal(c.zoom, 4);
  assert.ok(c.x >= -1500 && c.x <= 0);
  assert.ok(c.y >= -900 && c.y <= 0);
});
