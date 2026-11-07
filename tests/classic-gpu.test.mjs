import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldCamera } from '../shared/classic-camera.js';
import { classicWorldSize,createClassicInitialData } from '../shared/classic-gpu.js';
test('70k world scales area, not local interaction density',()=>{
  const base=classicWorldSize(900,600,1000);
  const large=classicWorldSize(900,600,70000);
  assert.ok(Math.abs(large.width*large.height/(base.width*base.height)-70)<1e-8);
});
test('GPU layout initialization is seed deterministic',()=>{
  const x=new Uint8Array(createClassicInitialData(10,800,600,21));
  const y=new Uint8Array(createClassicInitialData(10,800,600,21));
  assert.deepEqual(x,y);
  const types=new Uint32Array(x.buffer);
  for(let i=0;i<10;i++)assert.ok(types[i*8+4]<6);
});
test('zoom anchor and pan bounds work for large worlds',()=>{
  const c=new WorldCamera(1000,600,8000,4800);
  const anchor=c.toWorld(312,223);
  c.zoomBy(4,312,223);
  const now=c.toWorld(312,223);
  assert.ok(Math.abs(now.x-anchor.x)<1e-8);
  assert.ok(Math.abs(now.y-anchor.y)<1e-8);
  c.pan(100000,100000);
  assert.equal(c.x,0);
  assert.equal(c.y,0);
  c.pan(-100000,-100000);
  assert.ok(c.x<0&&c.y<0);
});
test('fit 100% and resize maintain world dimensions',()=>{
  const c=new WorldCamera(900,600,9000,6000);
  assert.equal(c.zoom,1);
  const before=[c.worldWidth,c.worldHeight];
  c.resize(1200,800);
  assert.deepEqual([c.worldWidth,c.worldHeight],before);
  c.zoomBy(3);
  c.reset();
  assert.equal(c.zoom,1);
});
