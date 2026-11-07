// Shared deterministic Particle Life physics. No dependencies; browser ES modules.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const wrap = (n, limit) => ((n % limit) + limit) % limit;
const delta = (n, limit) => n > limit / 2 ? n - limit : n < -limit / 2 ? n + limit : n;
const palette = ['#ff6a78', '#57c4fc', '#8ee58b', '#ffd27a', '#c5a1ff', '#63e1d0'];
const MATRIX = [
  [ .46, -.72,  .57, -.30,  .66, -.15 ],
  [ .65,  .40, -.60,  .54, -.20,  .50 ],
  [-.30,  .68,  .45, -.63,  .55,  .34 ],
  [ .57, -.36,  .55,  .38, -.63,  .45 ],
  [-.62,  .50, -.26,  .55,  .42,  .58 ],
  [ .45,  .53, -.57, -.34,  .62,  .48 ]
];
// Fixed non-linear RGB interaction: cyclic channel coupling and periodic phases.
// Avoid the previous bilinear RGB rule that favored black/white self-attraction.
// The fixed function is unchanged across time; only individual RGB values mutate.
function createRgbInteraction(levels) {
  const phase = 2 * Math.PI / levels;
  const pairs = Array.from({ length: 3 }, () => new Float32Array(levels * levels));
  const triple = new Float32Array(levels * levels * levels);
  for (let a = 0; a < levels; a++) {
    for (let b = 0; b < levels; b++) {
      const idx = a * levels + b;
      pairs[0][idx] = .43 * Math.sin(phase * (a + 2 * b) + .31);
      pairs[1][idx] = .39 * Math.sin(phase * (a + 2 * b) + 1.71);
      pairs[2][idx] = .41 * Math.sin(phase * (a + 2 * b) + 2.83);
      for (let c = 0; c < levels; c++) {
        triple[(a * levels + b) * levels + c] =
          .30 * Math.cos(phase * (a + b + c) + .97);
      }
    }
  }
  return { pairs, triple, levels };
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const DEFAULTS = Object.freeze({
  count: 1000, levels: 4, seed: 42, interactionRadius: 76,
  collisionRadius: 9, threshold: 0.9, force: 0.18,
  damping: 0.965, repel: 0.63, maxSpeed: 7,
  changeMode: 'swap', trails: false, glow: true,
  rgbMutationEnabled: true, forceNormalization: 'none'
});

export class ParticleLife {
  constructor(width, height, variant = 'collision', settings = {}) {
    this.variant = variant;
    this.options = { ...DEFAULTS, ...settings };
    this.resize(width, height, false);
    this.reset();
  }
  resize(w, h, preserve = true) {
    w = Math.max(1, w); h = Math.max(1, h);
    if (preserve && this.x) {
      for (let i = 0; i < this.x.length; i++) {
        this.x[i] = this.x[i] / this.width * w;
        this.y[i] = this.y[i] / this.height * h;
      }
    }
    this.width = w; this.height = h;
  }
  reset(settings = {}) {
    Object.assign(this.options, settings);
    const c = this.options;
    this.n = c.count;
    this.x = new Float32Array(this.n);
    this.y = new Float32Array(this.n);
    this.vx = new Float32Array(this.n);
    this.vy = new Float32Array(this.n);
    this.ax = new Float32Array(this.n);
    this.ay = new Float32Array(this.n);
    this.r = new Uint8Array(this.n);
    this.g = new Uint8Array(this.n);
    this.b = new Uint8Array(this.n);
    this.species = new Uint8Array(this.n);
    this.contacts = new Set();
    this.collisions = 0;
    this.mutations = 0;
    this.frame = 0;
    this.neighborCounts = new Uint16Array(this.n);
    const random = rng(c.seed);
    for (let i = 0; i < this.n; i++) {
      this.x[i] = random() * this.width;
      this.y[i] = random() * this.height;
      this.vx[i] = (random() - .5) * 1.6;
      this.vy[i] = (random() - .5) * 1.6;
      this.species[i] = Math.floor(random() * palette.length);
      this.r[i] = Math.floor(random() * c.levels);
      this.g[i] = Math.floor(random() * c.levels);
      this.b[i] = Math.floor(random() * c.levels);
    }
    this.colorCache = new Map();
    this.rgbInteraction = createRgbInteraction(c.levels);
  }
  color(i) {
    if (this.variant === 'classic') return palette[this.species[i]];
    const key = this.r[i] * 65536 + this.g[i] * 256 + this.b[i];
    let color = this.colorCache.get(key);
    if (!color) {
      const scale = 255 / (this.options.levels - 1);
      color = 'rgb(' + Math.round(this.r[i] * scale) + ',' +
        Math.round(this.g[i] * scale) + ',' + Math.round(this.b[i] * scale) + ')';
      this.colorCache.set(key, color);
    }
    return color;
  }
  affinity(i, j) {
    if (this.variant === 'classic') return MATRIX[this.species[i]][this.species[j]];
    // Periodic, non-symmetric RGB mixing (non-linear even before tanh).
    // The lookup tables depend on the fixed RGB quantization, not on time.
    const { levels: n, pairs, triple } = this.rgbInteraction;
    const z = pairs[0][this.r[i] * n + this.g[j]]
      + pairs[1][this.g[i] * n + this.b[j]]
      + pairs[2][this.b[i] * n + this.r[j]]
      + triple[(this.r[i] * n + this.g[i]) * n + this.b[j]];
    return Math.tanh(1.15 * z);
  }
  makeGrid() {
    const radius = this.options.interactionRadius;
    // Cell width >= interaction radius; one ring of neighbors is sufficient.
    const cols = Math.max(1, Math.floor(this.width / radius));
    const rows = Math.max(1, Math.floor(this.height / radius));
    const grid = new Map();
    for (let i = 0; i < this.n; i++) {
      const cx = Math.min(cols - 1, Math.floor(this.x[i] * cols / this.width));
      const cy = Math.min(rows - 1, Math.floor(this.y[i] * rows / this.height));
      const key = cx + cy * cols;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    return { grid, cols, rows };
  }
  // Iterate each unordered neighboring pair exactly once, including tiny wrapped grids.
  forPairs(callback) {
    const { grid, cols, rows } = this.makeGrid();
    for (let i = 0; i < this.n; i++) {
      const cx = Math.min(cols - 1, Math.floor(this.x[i] * cols / this.width));
      const cy = Math.min(rows - 1, Math.floor(this.y[i] * rows / this.height));
      const seen = new Set();
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const key = wrap(cx + ox, cols) + wrap(cy + oy, rows) * cols;
          if (seen.has(key)) continue;
          seen.add(key);
          const neighbors = grid.get(key);
          if (!neighbors) continue;
          for (const j of neighbors) if (j > i) callback(i, j);
        }
      }
    }
  }
  swapComponent(i, j) {
    const a = this.r[i] * 65536 + this.g[i] * 256 + this.b[i];
    const b = this.r[j] * 65536 + this.g[j] * 256 + this.b[j];
    // Symmetric in the pair's order and deterministic for the same two RGBs.
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const hash = (Math.imul(lo ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(hi ^ 0xc2b2ae35, 0x27d4eb2f)) >>> 0;
    const channels = ['r', 'g', 'b'];
    for (let offset = 0; offset < 3; offset++) {
      const ch = channels[(hash % 3 + offset) % 3];
      if (this[ch][i] === this[ch][j]) continue;
      const tmp = this[ch][i];
      this[ch][i] = this[ch][j];
      this[ch][j] = tmp;
      return true;
    }
    return false;
  }
  // Optional conservative transfer: a channel gains 1, the other loses 1.
  transferComponent(i, j) {
    const a = this.r[i] * 65536 + this.g[i] * 256 + this.b[i];
    const b = this.r[j] * 65536 + this.g[j] * 256 + this.b[j];
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const hash = (Math.imul(lo ^ 0x517cc1b7, 0x9e3779b1) ^ Math.imul(hi ^ 0x2c1b3c6d, 0x85ebca77)) >>> 0;
    const channels = ['r', 'g', 'b'];
    const max = this.options.levels - 1;
    // Direction is fixed by the pair's RGB ordering, not by time or particle ID.
    const direction = a <= b ? (hash & 1 ? 1 : -1) : (hash & 1 ? -1 : 1);
    for (let offset = 0; offset < 3; offset++) {
      const ch = channels[(hash % 3 + offset) % 3], x = this[ch][i], y = this[ch][j];
      if (x + direction < 0 || x + direction > max || y - direction < 0 || y - direction > max) continue;
      this[ch][i] = x + direction; this[ch][j] = y - direction;
      return true;
    }
    return false;
  }
  mutate(i, j) {
    const mode = this.options.changeMode;
    if (mode === 'transfer') return this.transferComponent(i, j);
    if (mode === 'hybrid') {
      const hash = (this.r[i] + this.g[i] * 3 + this.b[i] * 7 + this.r[j] + this.g[j] * 3 + this.b[j] * 7);
      return hash % 2 ? this.transferComponent(i, j) : this.swapComponent(i, j);
    }
    return this.swapComponent(i, j);
  }
  step(h = 1) {
    h = Math.max(.01, Math.min(h, 2));
    const { force, damping, repel, maxSpeed, interactionRadius: radius, collisionRadius: hit, threshold } = this.options;
    const minDist = Math.min(radius * .35, Math.max(hit * 1.15, 11));
    const oldX = this.x.slice(), oldY = this.y.slice();
    this.ax.fill(0); this.ay.fill(0);
    this.neighborCounts.fill(0);
    this.forPairs((i, j) => {
      const dx = delta(this.x[j] - this.x[i], this.width);
      const dy = delta(this.y[j] - this.y[i], this.height);
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius || d2 < .0001) return;
      this.neighborCounts[i]++;
      this.neighborCounts[j]++;
      const d = Math.sqrt(d2), ux = dx / d, uy = dy / d;
      const repelForce = -repel * (1 - d / minDist);
      const kernel = Math.sin(Math.PI * clamp((d - minDist) / (radius - minDist), 0, 1));
      const fi = d < minDist ? repelForce : force * this.affinity(i, j) * kernel;
      const fj = d < minDist ? repelForce : force * this.affinity(j, i) * kernel;
      this.ax[i] += ux * fi; this.ay[i] += uy * fi;
      this.ax[j] -= ux * fj; this.ay[j] -= uy * fj;
    });
    // Optional density-normalized force: keep the unnormalized baseline
    // available for direct comparisons with the same initial seed.
    const normalize = this.options.forceNormalization;
    if (normalize === 'sqrt' || normalize === 'mean') {
      for (let i = 0; i < this.n; i++) {
        const count = Math.max(1, this.neighborCounts[i]);
        const divisor = normalize === 'sqrt' ? Math.sqrt(count) : count;
        this.ax[i] /= divisor;
        this.ay[i] /= divisor;
      }
    }
    const fade = Math.pow(damping, h);
    for (let i = 0; i < this.n; i++) {
      let vx = (this.vx[i] + this.ax[i] * h) * fade;
      let vy = (this.vy[i] + this.ay[i] * h) * fade;
      const speed = Math.hypot(vx, vy);
      if (speed > maxSpeed) { vx *= maxSpeed / speed; vy *= maxSpeed / speed; }
      this.vx[i] = vx; this.vy[i] = vy;
      this.x[i] = wrap(this.x[i] + vx * h, this.width);
      this.y[i] = wrap(this.y[i] + vy * h, this.height);
    }
    if (this.variant === 'collision') {
      const nextContacts = new Set(), rearm = hit * 1.55;
      this.forPairs((i, j) => {
        const dx = delta(this.x[j] - this.x[i], this.width);
        const dy = delta(this.y[j] - this.y[i], this.height);
        const d2 = dx * dx + dy * dy;
        if (d2 >= rearm * rearm) return;
        const key = i * this.n + j;
        const touching = d2 <= hit * hit;
        if (touching) {
          if (!this.contacts.has(key)) {
            const oldDx = delta(oldX[j] - oldX[i], this.width);
            const oldDy = delta(oldY[j] - oldY[i], this.height);
            const previousDistance = Math.hypot(oldDx, oldDy);
            const approach = Math.max(0, (previousDistance - Math.sqrt(d2)) / h);
            if (previousDistance > hit && approach > 0) {
              this.collisions++;
              // Equal masses: reduced-mass energy = approach^2 / 4.
              const energy = approach * approach / 4;
              if (this.options.rgbMutationEnabled && energy >= threshold && this.mutate(i, j)) this.mutations++;
            }
          }
          nextContacts.add(key);
        } else if (this.contacts.has(key)) {
          // Do not re-trigger on tiny oscillations around the collision boundary.
          nextContacts.add(key);
        }
      });
      this.contacts = nextContacts;
    }
    this.frame++;
  }
  stir(x, y) {
    const influence = 120, strength = 5.5;
    for (let i = 0; i < this.n; i++) {
      const dx = delta(this.x[i] - x, this.width), dy = delta(this.y[i] - y, this.height);
      const d = Math.hypot(dx, dy);
      if (d > influence) continue;
      const factor = strength * (1 - d / influence);
      const angle = d < 1 ? i * 2.4 : Math.atan2(dy, dx);
      this.vx[i] += Math.cos(angle) * factor;
      this.vy[i] += Math.sin(angle) * factor;
    }
  }
  stats() {
    let sumSpeed = 0, kineticEnergy = 0, capped = 0;
    let sumNeighbors = 0, maxNeighbors = 0;
    const maxSpeed = this.options.maxSpeed;
    let colors = new Set();
    for (let i = 0; i < this.n; i++) {
      const speedSquared = this.vx[i] ** 2 + this.vy[i] ** 2;
      sumSpeed += Math.sqrt(speedSquared);
      kineticEnergy += speedSquared / 2;
      if (speedSquared >= (maxSpeed - 1e-3) ** 2) capped++;
      const neighbors = this.neighborCounts[i];
      sumNeighbors += neighbors;
      if (neighbors > maxNeighbors) maxNeighbors = neighbors;
      colors.add(this.variant === 'classic'
        ? this.species[i]
        : this.r[i] * 65536 + this.g[i] * 256 + this.b[i]);
    }
    return {
      colors: colors.size, collisions: this.collisions, mutations: this.mutations,
      averageSpeed: sumSpeed / this.n,
      meanKineticEnergy: kineticEnergy / this.n,
      meanNeighbors: sumNeighbors / this.n,
      maxNeighbors, speedCapPercentage: 100 * capped / this.n,
      steps: this.frame
    };
  }
  draw(ctx, { background = true } = {}) {
    const { width: w, height: h } = this;
    if (background) {
      ctx.fillStyle = this.options.trails ? 'rgba(6, 10, 22, 0.22)' : '#060a16';
      ctx.fillRect(0, 0, w, h);
    }
    const max = this.options.levels - 1, glow = this.options.glow;
    for (let i = 0; i < this.n; i++) {
      const color = this.color(i);
      ctx.fillStyle = color;
      const special = this.variant === 'collision' && glow &&
        ((this.r[i] === this.g[i] && this.g[i] === this.b[i]) ||
          ((this.r[i] === 0 || this.g[i] === 0 || this.b[i] === 0) &&
            (this.r[i] === max || this.g[i] === max || this.b[i] === max)));
      if (special) {
        ctx.globalAlpha = .24;
        ctx.beginPath(); ctx.arc(this.x[i], this.y[i], 5.8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.arc(this.x[i], this.y[i], 2.15, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
