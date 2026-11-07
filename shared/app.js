import { ParticleLife, DEFAULTS } from './engine.js';

const canvas = document.getElementById('world');
const context = canvas.getContext('2d', { alpha: false });
const variant = document.body.dataset.variant === 'classic' ? 'classic' : 'collision';
const status = document.getElementById('status');
const $ = id => document.getElementById(id);
const options = { ...DEFAULTS, changeMode: document.body.dataset.changeMode || 'swap' };
let sim, paused = false, lastTime = 0, accumulator = 0, lastStats = 0, frames = 0, fps = 0;
for (const item of document.querySelectorAll('[data-collision-only]')) {
  if (variant === 'classic') item.style.display = 'none';
}
function size() {
  const box = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(box.width)), height = Math.max(1, Math.round(box.height));
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (sim) sim.resize(width, height, true);
  else sim = new ParticleLife(width, height, variant, options);
  sim.draw(context);
}
const format = (key, value) => {
  if (key === 'damping') return Number(value).toFixed(3);
  if (key === 'force' || key === 'threshold') return Number(value).toFixed(2);
  if (key === 'count') return Number(value).toLocaleString('ja-JP');
  return String(value);
};
function readOptions() {
  for (const node of document.querySelectorAll('[data-option]')) {
    const key = node.dataset.option;
    options[key] = node.type === 'checkbox' ? node.checked : Number(node.value);
    const label = document.querySelector('[data-value="' + key + '"]');
    if (label) label.textContent = format(key, options[key]);
  }
}
for (const node of document.querySelectorAll('[data-option]')) {
  if (node.type === 'checkbox') node.checked = Boolean(options[node.dataset.option]);
  else node.value = String(options[node.dataset.option]);
  node.addEventListener('input', () => {
    const prevCount = options.count, prevLevels = options.levels;
    readOptions();
    Object.assign(sim.options, options);
    if (prevCount !== options.count || prevLevels !== options.levels) {
      sim.reset(options);
      accumulator = 0;
    }
  });
}
readOptions();
function setPaused(value) {
  paused = value;
  $('toggle').textContent = paused ? '▶ 再開' : '❚❚ 一時停止';
  status.textContent = paused ? 'PAUSED' : 'LIVE SIMULATION';
}
$('toggle').addEventListener('click', () => setPaused(!paused));
$('reset').addEventListener('click', () => { sim.reset(options); accumulator = 0; });
$('randomize').addEventListener('click', () => {
  options.seed = Math.floor(Math.random() * 2147483647);
  $('seed').value = String(options.seed);
  sim.reset(options); accumulator = 0;
});
$('seed').addEventListener('change', () => {
  const number = Number($('seed').value);
  options.seed = Number.isFinite(number) ? Math.trunc(number) : 42;
  $('seed').value = String(options.seed);
  sim.reset(options); accumulator = 0;
});
$('seed').value = String(options.seed);
function stir(event) {
  const rect = canvas.getBoundingClientRect();
  sim.stir(event.clientX - rect.left, event.clientY - rect.top);
}
canvas.addEventListener('pointerdown', event => {
  canvas.setPointerCapture(event.pointerId);
  stir(event);
});
canvas.addEventListener('pointermove', event => { if (event.buttons & 1) stir(event); });
document.addEventListener('keydown', event => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); setPaused(!paused); }
  if (event.code === 'KeyR') sim.reset(options);
});
function updateStats() {
  const s = sim.stats();
  $('stat-colors').textContent = String(s.colors);
  $('stat-events').textContent = s.mutations.toLocaleString('ja-JP');
  $('stat-speed').textContent = s.averageSpeed.toFixed(2);
  $('stat-fps').textContent = String(Math.round(fps));
  $('stat-events-label').textContent = variant === 'classic' ? '色の変化回数' : 'RGB変化回数';
  $('stat-fps').title = 'ブラウザ描画フレーム/秒';
}
function tick(now) {
  if (!lastTime) lastTime = now;
  const dt = Math.min((now - lastTime) / 1000, .05);
  lastTime = now; frames++;
  if (!paused) {
    accumulator = Math.min(.12, accumulator + dt);
    let iterations = 0;
    while (accumulator >= 1 / 60 && iterations < 5) {
      sim.step(1);
      accumulator -= 1 / 60;
      iterations++;
    }
    if (iterations === 5) accumulator = 0;
    sim.draw(context);
  }
  if (now - lastStats >= 450) {
    fps = frames * 1000 / Math.max(now - lastStats, 1);
    frames = 0; lastStats = now;
    updateStats();
  }
  requestAnimationFrame(tick);
}
size();
window.addEventListener('resize', size);
requestAnimationFrame(tick);
