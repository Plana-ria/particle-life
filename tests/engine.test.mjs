import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticleLife } from '../shared/engine.js';

const testOptions = { count: 2, levels: 4, seed: 42, interactionRadius: 50, collisionRadius: 10, threshold: 1, force: 0, repel: 0, damping: 1, maxSpeed: 12 };
function pair(threshold = 1) {
  const p = new ParticleLife(200, 100, 'collision', { ...testOptions, threshold });
  p.x.set([86, 114]); p.y.set([50, 50]);
  p.vx.set([4, -4]); p.vy.fill(0);
  p.r.set([0, 3]); p.g.set([0, 3]); p.b.set([0, 3]);
  return p;
}
test('same RGB combinations always yield same directed affinity', () => {
  const p = new ParticleLife(300, 200, 'collision', { count: 4, seed: 3 });
  p.r.set([1, 1, 2, 2]); p.g.set([0, 0, 3, 3]); p.b.set([2, 2, 1, 1]);
  assert.equal(p.affinity(0, 2), p.affinity(1, 3));
  assert.equal(p.affinity(2, 0), p.affinity(3, 1));
});
test('fixed seed produces deterministic positions and colors', () => {
  const a = new ParticleLife(400, 300, 'collision', { seed: 9, count: 100 });
  const b = new ParticleLife(400, 300, 'collision', { seed: 9, count: 100 });
  assert.deepEqual([...a.x], [...b.x]);
  assert.deepEqual([...a.r], [...b.r]);
});
test('fast incoming collision mutates once and conserves channel multisets', () => {
  const p = pair();
  const before = ['r', 'g', 'b'].map(ch => [...p[ch]].sort());
  for (let k = 0; k < 3; k++) p.step();
  assert.equal(p.collisions, 1);
  assert.equal(p.mutations, 1);
  assert.equal(p.contacts.size, 1);
  for (let k = 0; k < 5; k++) p.step();
  assert.equal(p.mutations, 1);
  for (let k = 0; k < 3; k++) {
    assert.deepEqual([...p[['r', 'g', 'b'][k]]].sort(), before[k]);
  }
});
test('high collision energy threshold prevents mutation', () => {
  const p = pair(1000);
  for (let k = 0; k < 3; k++) p.step();
  assert.equal(p.collisions, 1);
  assert.equal(p.mutations, 0);
});
test('stationary contact never mutates every frame', () => {
  const p = pair(0);
  p.x.set([97, 103]); p.vx.fill(0);
  for (let k = 0; k < 50; k++) p.step();
  assert.equal(p.collisions, 0);
  assert.equal(p.mutations, 0);
});
test('classic rules never change the particle colors', () => {
  const p = new ParticleLife(300, 200, 'classic', { count: 100 });
  const before = [...p.r];
  for (let k = 0; k < 10; k++) p.step();
  assert.deepEqual([...p.r], before);
  assert.equal(p.mutations, 0);
});
