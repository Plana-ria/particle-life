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

test('nonlinear RGB interaction is bounded and directed', () => {
  const p = new ParticleLife(300, 200, 'collision', { count: 2, levels: 4 });
  p.r.set([0, 3]); p.g.set([0, 3]); p.b.set([0, 3]);
  const ab = p.affinity(0, 1), ba = p.affinity(1, 0);
  assert.ok(Math.abs(ab) <= 1 && Math.abs(ba) <= 1);
  assert.notEqual(ab, ba, 'directed RGB interactions should differ');
});
test('white and black are not both mutually self-attracting', () => {
  const p = new ParticleLife(300, 200, 'collision', { count: 2, levels: 4 });
  p.r.set([0, 3]); p.g.set([0, 3]); p.b.set([0, 3]);
  const blackSelf = p.affinity(0, 0);
  const whiteSelf = p.affinity(1, 1);
  assert.ok(blackSelf < 0 || whiteSelf < 0);
});
test('nonlinear affinities include positive and negative responses for every RGB level count', () => {
  for (const levels of [3, 4, 8, 16]) {
    const p = new ParticleLife(300, 200, 'collision', { count: 2, levels });
    const samples = [];
    for (let r = 0; r < levels; r++) {
      p.r[0] = r; p.g[0] = (r + 1) % levels; p.b[0] = (r + 2) % levels;
      for (let g = 0; g < levels; g++) {
        p.r[1] = (g + 1) % levels; p.g[1] = g; p.b[1] = (g + 2) % levels;
        samples.push(p.affinity(0, 1));
      }
    }
    assert.ok(samples.some(x => x > .1), 'no attractive pair: ' + levels);
    assert.ok(samples.some(x => x < -.1), 'no repulsive pair: ' + levels);
  }
});

test('RGB mutation can be disabled while maintaining collisions', () => {
  const p = pair(0);
  p.options.rgbMutationEnabled = false;
  for (let k = 0; k < 3; k++) p.step();
  assert.equal(p.collisions, 1);
  assert.equal(p.mutations, 0);
});
test('density normalization changes acceleration without changing RGB or initial geometry', () => {
  const configs = ['none', 'sqrt', 'mean'];
  const systems = configs.map(forceNormalization => new ParticleLife(220, 140, 'collision', {
    count: 4, seed: 7, force: 0.8, damping: 1, repel: 0.6,
    interactionRadius: 90, forceNormalization, rgbMutationEnabled: false
  }));
  for (const p of systems) {
    p.x.set([45, 60, 75, 88]); p.y.set([60, 68, 60, 65]);
    p.vx.fill(0); p.vy.fill(0);
    p.step();
    assert.ok(p.neighborCounts.every(n => n === 3));
  }
  for (const i of [1,2]) assert.deepEqual([...systems[0].r], [...systems[i].r]);
  const magnitude = p => Math.hypot(p.vx[0], p.vy[0]);
  assert.ok(magnitude(systems[0]) > magnitude(systems[1]));
  assert.ok(magnitude(systems[1]) > magnitude(systems[2]));
});
test('diagnostics report kinetic energy, neighbors and speed cap', () => {
  const p = new ParticleLife(200, 200, 'collision', {count:2, maxSpeed:5, interactionRadius:50});
  p.x.set([10, 30]); p.y.set([10, 10]); p.vx.set([5, 0]); p.vy.fill(0);
  p.neighborCounts.set([1, 1]);
  const s=p.stats();
  assert.ok(Math.abs(s.meanKineticEnergy-6.25)<1e-6);
  assert.equal(s.meanNeighbors,1);
  assert.equal(s.maxNeighbors,1);
  assert.equal(s.speedCapPercentage,50);
});

test('RGB defaults to density normalization and hardened repulsion; classic keeps original physics', () => {
  const rgb = new ParticleLife(200, 200, 'collision', {count: 3});
  const classic = new ParticleLife(200, 200, 'classic', {count: 3});
  assert.equal(rgb.options.forceNormalization, 'sqrt');
  assert.equal(rgb.options.repulsionProfile, 'steep');
  assert.equal(classic.options.forceNormalization, 'none');
  assert.equal(classic.options.repulsionProfile, 'linear');
});
test('hardening produces stronger near-contact repulsion than linear at identical settings', () => {
  const make = profile => new ParticleLife(300, 300, 'collision', {
    count:2, force:0, repel:0.63, damping:1, maxSpeed:100,
    forceNormalization:'none', repulsionProfile:profile,
    interactionRadius:80, collisionRadius:5
  });
  const linear=make('linear'), steep=make('steep');
  for (const p of [linear,steep]) {
    p.x.set([80,87]); p.y.set([90,90]);p.vx.fill(0);p.vy.fill(0);
    p.step();
  }
  assert.ok(Math.abs(steep.vx[0]) > Math.abs(linear.vx[0]));
});
test('swept collision catches high-speed pass through the entire interaction zone', () => {
  const p = new ParticleLife(300,200,'collision',{
    count:2,force:0,repel:0,damping:1,maxSpeed:100,
    interactionRadius:80, collisionRadius:9, threshold:0,
    forceNormalization:'none',repulsionProfile:'linear'
  });
  p.x.set([90, 120]);p.y.set([100,100]);
  p.vx.set([20,-20]);p.vy.fill(0);
  p.r.set([0,3]);p.g.set([0,3]);p.b.set([0,3]);
  p.step();
  assert.equal(p.collisions,1);
  assert.equal(p.mutations,1);
});
test('tangential near miss has no collision and zero mutation', () => {
  const p = new ParticleLife(300,200,'collision',{
    count:2,force:0,repel:0,damping:1,maxSpeed:100,
    interactionRadius:80, collisionRadius:9, threshold:0,
    forceNormalization:'none'
  });
  p.x.set([90,120]);p.y.set([100,111]);
  p.vx.set([20,-20]);p.vy.fill(0);
  p.step();
  assert.equal(p.collisions,0);
  assert.equal(p.mutations,0);
});
