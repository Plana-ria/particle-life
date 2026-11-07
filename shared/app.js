import { ParticleLife, DEFAULTS } from './engine.js?v=20261108-zoom-fix-1';
import { Camera } from './camera.js?v=20261108-zoom-fix-1';

const canvas = document.getElementById('world');
const context = canvas.getContext('2d', { alpha: false });
const variant = document.body.dataset.variant === 'classic' ? 'classic' : 'collision';
const status = document.getElementById('status');
const $ = id => document.getElementById(id);
const options = { ...DEFAULTS, changeMode: document.body.dataset.changeMode || 'swap' };
let sim, camera, paused = false, lastTime = 0, accumulator = 0;
let lastStats = 0, frames = 0, fps = 0, dpr = 1;

for (const item of document.querySelectorAll('[data-collision-only]')) {
  if (variant === 'classic') item.style.display = 'none';
}
function render(clear = false) {
  if (!sim || !camera) return;
  context.save();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.fillStyle = (clear || !sim.options.trails) ? '#060a16' : 'rgba(6, 10, 22, 0.22)';
  context.fillRect(0, 0, camera.width, camera.height);
  context.translate(camera.x, camera.y);
  context.scale(camera.zoom, camera.zoom);
  sim.draw(context, { background: false });
  if (camera.zoom !== 1) {
    context.strokeStyle = 'rgba(140, 164, 198, .32)';
    context.lineWidth = 1 / camera.zoom;
    context.strokeRect(0, 0, sim.width, sim.height);
  }
  context.restore();
}
function updateCameraControls() {
  $('zoom-value').textContent = String(Math.round(camera.zoom * 100)) + '%';
  $('zoom-in').disabled = camera.zoom >= camera.maxZoom;
  $('zoom-out').disabled = camera.zoom <= camera.minZoom;
  $('zoom-reset').disabled = camera.zoom === 1 && camera.x === 0 && camera.y === 0;
  canvas.classList.toggle('zoomed', camera.zoom > 1);
}
function size() {
  const box = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  if (sim) sim.resize(width, height, true);
  else sim = new ParticleLife(width, height, variant, options);
  if (camera) camera.resize(width, height);
  else camera = new Camera(width, height);
  updateCameraControls();
  render(true);
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
    const previousCount = options.count, previousLevels = options.levels;
    readOptions();
    Object.assign(sim.options, options);
    if (previousCount !== options.count || previousLevels !== options.levels) {
      sim.reset(options);
      accumulator = 0;
    }
    if (paused) render(true);
  });
}
readOptions();
function setPaused(value) {
  paused = value;
  $('toggle').textContent = paused ? '▶ 再開' : '❚❚ 一時停止';
  status.textContent = paused ? 'PAUSED' : 'LIVE SIMULATION';
}
$('toggle').addEventListener('click', () => setPaused(!paused));
$('reset').addEventListener('click', () => { sim.reset(options); accumulator = 0; if (paused) render(true); });
$('randomize').addEventListener('click', () => {
  options.seed = Math.floor(Math.random() * 2147483647);
  $('seed').value = String(options.seed);
  sim.reset(options); accumulator = 0;
  if (paused) render(true);
});
$('seed').addEventListener('change', () => {
  const number = Number($('seed').value);
  options.seed = Number.isFinite(number) ? Math.trunc(number) : 42;
  $('seed').value = String(options.seed);
  sim.reset(options); accumulator = 0;
  if (paused) render(true);
});
$('seed').value = String(options.seed);

function applyZoom(factor, x = camera.width / 2, y = camera.height / 2) {
  camera.zoomBy(factor, x, y);
  updateCameraControls();
  render(true);
}
$('zoom-in').addEventListener('click', () => applyZoom(1.25));
$('zoom-out').addEventListener('click', () => applyZoom(1 / 1.25));
$('zoom-reset').addEventListener('click', () => {
  camera.reset();
  updateCameraControls();
  render(true);
});

function point(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function stirAt(p) {
  const q = camera.toWorld(p.x, p.y);
  if (q.x >= 0 && q.x <= sim.width && q.y >= 0 && q.y <= sim.height) sim.stir(q.x, q.y);
}
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const p = point(event);
  const units = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? camera.height : 1;
  applyZoom(Math.exp(-event.deltaY * units * .0016), p.x, p.y);
}, { passive: false });
canvas.addEventListener('contextmenu', event => event.preventDefault());

const pointers = new Map();
let pinch = null;
function gesture() {
  const positions = [...pointers.values()];
  if (positions.length !== 2) return null;
  const [a, b] = positions;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
  };
}
canvas.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch' && ![0, 1, 2].includes(event.button)) return;
  event.preventDefault();
  const p = point(event);
  p.mode = (event.pointerType === 'touch' && camera.zoom > 1) ||
    event.button === 1 || event.button === 2 || (event.button === 0 && camera.zoom > 1 && !event.shiftKey)
    ? 'pan' : 'stir';
  pointers.set(event.pointerId, p);
  canvas.setPointerCapture(event.pointerId);
  if (pointers.size === 2) {
    pinch = gesture();
    return;
  }
  if (p.mode === 'stir') stirAt(p);
});
canvas.addEventListener('pointermove', event => {
  const prev = pointers.get(event.pointerId);
  if (!prev) return;
  const current = point(event);
  const dx = current.x - prev.x, dy = current.y - prev.y;
  prev.x = current.x; prev.y = current.y;
  if (pointers.size === 2) {
    const now = gesture();
    if (pinch && now) {
      camera.zoomBy(now.distance / pinch.distance, pinch.x, pinch.y);
      camera.panBy(now.x - pinch.x, now.y - pinch.y);
      updateCameraControls();
      render(true);
    }
    pinch = now;
    return;
  }
  if (prev.mode === 'pan') {
    camera.panBy(dx, dy);
    updateCameraControls();
    render(true);
  } else stirAt(current);
});
function removePointer(event) {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 1) {
    const last = [...pointers.values()][0];
    last.mode = camera.zoom > 1 ? 'pan' : 'stir';
  }
}
canvas.addEventListener('pointerup', removePointer);
canvas.addEventListener('pointercancel', removePointer);
canvas.addEventListener('lostpointercapture', removePointer);
document.addEventListener('keydown', event => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); setPaused(!paused); }
  else if (event.code === 'KeyR') { sim.reset(options); if (paused) render(true); }
  else if (event.code === 'Equal' || event.code === 'NumpadAdd') {
    event.preventDefault(); applyZoom(1.25);
  } else if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
    event.preventDefault(); applyZoom(.8);
  } else if (event.code === 'Digit0' || event.code === 'Numpad0') {
    event.preventDefault(); camera.reset(); updateCameraControls(); render(true);
  }
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
    render();
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
