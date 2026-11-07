// Long-horizon reproducible comparison. No dependency on the browser.
// node tests/long-benchmark.mjs
import { ParticleLife } from '../shared/engine.js';

const width = 1500, height = 900;
const steps = 10000;
const sampleAt = new Set([1200, 3000, 6000, 10000]);
const seeds = [1532096564, 42];
const common = {
  count: 1000, levels: 4, force: .34, repel: .63,
  damping: .965, maxSpeed: 7, interactionRadius: 76,
  collisionRadius: 9, threshold: .9, rgbMutationEnabled: true
};
const cases = [
  ['baseline_physics', { forceNormalization: 'none', repulsionProfile: 'linear' }],
  ['improved_physics', { forceNormalization: 'sqrt', repulsionProfile: 'steep' }]
];
function snapshot(p) {
  const s = p.stats(), counts = p.neighborCounts;
  let dense = 0;
  for (let i = 0; i < counts.length; i++) if (counts[i] > 100) dense++;
  const cells = new Set(), cellSize = 50;
  const cols = Math.ceil(p.width / cellSize), rows = Math.ceil(p.height / cellSize);
  for (let i = 0; i < p.n; i++) {
    cells.add(Math.floor(p.x[i] / cellSize) + Math.floor(p.y[i] / cellSize) * cols);
  }
  return {
    step: s.steps, colors: s.colors,
    avgNeighbors: +s.meanNeighbors.toFixed(2), maxNeighbors: s.maxNeighbors,
    densePct: +(100 * dense / p.n).toFixed(2),
    occupiedPct: +(100 * cells.size / (cols * rows)).toFixed(2),
    avgEnergy: +s.meanKineticEnergy.toFixed(3),
    speedCapPct: +s.speedCapPercentage.toFixed(2),
    rgbMutations: s.mutations, collisions: s.collisions
  };
}
console.log('LONG_PARAMETERS ' + JSON.stringify({width,height,steps,seeds,common,cases,sampleAt:[...sampleAt]}));
for (const seed of seeds) {
  for (const [name, physics] of cases) {
    const p = new ParticleLife(width,height,'collision',{...common,...physics,seed});
    const result = [];
    let lastMutations = 0, lastStep = 0;
    for (let n = 1; n <= steps; n++) {
      p.step();
      if (sampleAt.has(n)) {
        const row = snapshot(p);
        row.mutationsPerSimSecond = +((p.mutations - lastMutations) / (n - lastStep) * 60).toFixed(2);
        lastMutations = p.mutations;
        lastStep = n;
        result.push(row);
      }
    }
    console.log('LONG_RESULT ' + JSON.stringify({seed,name,physics,results:result}));
  }
}
