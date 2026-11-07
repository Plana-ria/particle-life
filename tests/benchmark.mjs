// Reproducible convergence comparison. Run with: node tests/benchmark.mjs
import { ParticleLife } from '../shared/engine.js';

const base = {
  count: 1000, seed: 1532096564, levels: 4,
  force: 0.34, repel: 0.63, damping: 0.965, maxSpeed: 7,
  interactionRadius: 76, rgbMutationEnabled: true,
  forceNormalization: 'none'
};
const cases = [
  ['baseline', {}],
  ['sqrt_normalization', {forceNormalization: 'sqrt'}],
  ['strong_repulsion', {repel: 1.5}],
  ['sqrt_and_strong_repulsion', {forceNormalization: 'sqrt', repel: 1.5}],
  ['no_rgb_mutation', {rgbMutationEnabled: false}]
];

function snapshot(p) {
  const s = p.stats();
  let dense = 0;
  for (let i = 0; i < p.n; i++) {
    if (p.neighborCounts[i] > 100) dense++;
  }
  const occupied = new Set();
  const cell = 50;
  for (let i = 0; i < p.n; i++) {
    const x = Math.floor(p.x[i] / cell);
    const y = Math.floor(p.y[i] / cell);
    occupied.add(y * Math.ceil(p.width / cell) + x);
  }
  const possible = Math.ceil(p.width / cell) * Math.ceil(p.height / cell);
  return {
    steps: s.steps,
    colors: s.colors,
    meanNeighbors: Number(s.meanNeighbors.toFixed(1)),
    maxNeighbors: s.maxNeighbors,
    denseFraction: Number((dense / p.n).toFixed(3)),
    occupiedCellFraction: Number((occupied.size / possible).toFixed(3)),
    meanEnergy: Number(s.meanKineticEnergy.toFixed(2)),
    capPct: Number(s.speedCapPercentage.toFixed(1)),
    rgbChanges: s.mutations,
    rgbChangesPerSimSecond: s.steps ? Number((s.mutations / s.steps * 60).toFixed(1)) : 0
  };
}
console.log('BENCHMARK_PARAMETERS '+JSON.stringify({...base,width:1500,height:900,totalSteps:1200,sampleSteps:[300,600,1200]}));
for (const [name, overrides] of cases) {
  const model = new ParticleLife(1500, 900, 'collision', {...base,...overrides});
  const results = [];
  let prevMutations = 0;
  for (let step = 1; step <= 1200; step++) {
    model.step();
    if (step === 300 || step === 600 || step === 1200) {
      const snap = snapshot(model);
      snap.mutationRateSincePreviousSample = Number(((model.mutations - prevMutations) / (step - (results.length ? results[results.length-1].steps : 0)) * 60).toFixed(1));
      prevMutations = model.mutations;
      results.push(snap);
    }
  }
  console.log('BENCHMARK_RESULT '+JSON.stringify({name,overrides,results}));
}
