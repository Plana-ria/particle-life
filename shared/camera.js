// Display-only camera. All coordinates and offsets use CSS pixels.
// Physics remains in unchanged world coordinates regardless of zoom.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Camera {
  constructor(width, height, { minZoom = 0.5, maxZoom = 8 } = {}) {
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.zoom = 1;
    this.x = 0;
    this.y = 0;
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.constrain();
  }

  constrain() {
    this.x = this.zoom <= 1
      ? (this.width * (1 - this.zoom)) / 2
      : clamp(this.x, this.width * (1 - this.zoom), 0);
    this.y = this.zoom <= 1
      ? (this.height * (1 - this.zoom)) / 2
      : clamp(this.y, this.height * (1 - this.zoom), 0);
  }

  toWorld(x, y) {
    return { x: (x - this.x) / this.zoom, y: (y - this.y) / this.zoom };
  }

  zoomTo(value, anchorX = this.width / 2, anchorY = this.height / 2) {
    const next = clamp(value, this.minZoom, this.maxZoom);
    const world = this.toWorld(anchorX, anchorY);
    this.zoom = next;
    this.x = anchorX - world.x * next;
    this.y = anchorY - world.y * next;
    this.constrain();
  }

  zoomBy(factor, anchorX = this.width / 2, anchorY = this.height / 2) {
    if (factor > 0 && Number.isFinite(factor)) this.zoomTo(this.zoom * factor, anchorX, anchorY);
  }

  panBy(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.x += dx;
    this.y += dy;
    this.constrain();
  }

  reset() {
    this.zoom = 1;
    this.x = 0;
    this.y = 0;
  }
}
