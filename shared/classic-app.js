import { ParticleLife,DEFAULTS } from './engine.js?v=classic-fast-1';
import { ClassicGPU,classicWorldSize } from './classic-gpu.js?v=classic-fast-1';
import { WorldCamera } from './classic-camera.js?v=classic-fast-1';

const $=id=>document.getElementById(id);
const options={...DEFAULTS,forceNormalization:'none',repulsionProfile:'linear'};
let canvas=$('world'), backend=null, sim=null, camera=null, ctx=null;
let generation=0, paused=false, last=0, acc=0, fpsFrames=0, simSteps=0;
let statsTime=0, pendingImpulse=null, message='', pointers=new Map(), pinch=null;
const CAP_CPU=3000, MAX_COUNT=70000;
const backendSelector=$('backend');
const status=$('status');

function explain(text,isError=false){
  message=text;
  $('backend-status').textContent=text;
  $('backend-status').classList.toggle('error',isError);
}
function describe(){
  $('stat-count').textContent=options.count.toLocaleString('ja-JP');
  $('stat-backend').textContent=backend==='gpu'?'WebGPU':backend==='cpu'?'CPU':'準備中';
  $('status').textContent=paused?'PAUSED':backend==='gpu'?'GPU ACCELERATED':'CPU SIMULATION';
}
function applyOptions(){
  for(const node of document.querySelectorAll('[data-option]')){
    const key=node.dataset.option;
    options[key]=node.type==='checkbox'?node.checked:Number(node.value);
    const label=document.querySelector('[data-value="'+key+'"]');
    if(label)label.textContent=key==='count'?options[key].toLocaleString('ja-JP'):key==='damping'?options[key].toFixed(3):key==='force'?options[key].toFixed(2):String(options[key]);
  }
}
for(const node of document.querySelectorAll('[data-option]')){
  if(node.type==='checkbox')node.checked=Boolean(options[node.dataset.option]);
  else node.value=String(options[node.dataset.option]);
  node.addEventListener('input',()=>{
    const oldCount=options.count,oldRadius=options.interactionRadius;
    applyOptions();
    if(options.count!==oldCount||options.interactionRadius!==oldRadius){
      void rebuild();
    }else if(sim){Object.assign(sim.options,options);}
    if(paused)draw(false);
  });
}
applyOptions();
$('seed').value=String(options.seed);
backendSelector.value='auto';

function makeCanvas(){
  const old=canvas;
  const replacement=document.createElement('canvas');
  replacement.id='world';
  replacement.setAttribute('aria-label','Classic Particle Life シミュレーション');
  old.replaceWith(replacement);
  canvas=replacement;
  pointers=new Map();pinch=null;ctx=null;
  addPointerHandlers();
}
function dimensions(){
  const box=canvas.getBoundingClientRect();
  return {width:Math.max(1,Math.round(box.width)),
    height:Math.max(1,Math.round(box.height)),dpr:Math.min(window.devicePixelRatio||1,2)};
}
async function rebuild(){
  const token=++generation;
  const wasPaused=paused;
  paused=true;
  if(backend==='gpu'&&sim)sim.dispose();
  sim=null;backend=null;pendingImpulse=null;
  makeCanvas();
  const view=dimensions();
  let mode=backendSelector.value;
  if(mode==='auto')mode=navigator.gpu?'gpu':'cpu';
  if(mode==='cpu'&&options.count>CAP_CPU){
    options.count=CAP_CPU;
    $('count').value=String(CAP_CPU);
    applyOptions();
    explain('WebGPUが利用できないため、CPUの安全上限3,000粒子に制限しました。',true);
  }else{
    explain('計算エンジンを初期化しています…');
  }
  const world=classicWorldSize(view.width,view.height,options.count);
  camera=new WorldCamera(view.width,view.height,world.width,world.height);
  try{
    if(mode==='gpu'){
      const next=await ClassicGPU.create(canvas,options,world);
      if(token!==generation){next.dispose();return;}
      sim=next;backend='gpu';
      next.onLost=error=>{paused=true;explain(error,true);describe();};
      next.resize(view.width,view.height,view.dpr);
      explain('GPUの空間グリッド・力計算・描画を有効化。全体表示から拡大できます。');
    }else{
      sim=new ParticleLife(world.width,world.height,'classic',options);
      backend='cpu';
      ctx=canvas.getContext('2d',{alpha:false});
      canvas.width=Math.round(view.width*view.dpr);
      canvas.height=Math.round(view.height*view.dpr);
      explain('CPU互換モード。3,000粒子まで利用できます。');
    }
  }catch(error){
    if(token!==generation)return;
    if(mode==='gpu'){
      explain('WebGPUを開始できません: '+error.message,true);
      if(options.count<=CAP_CPU&&backendSelector.value==='auto'){
        // A failed WebGPU canvas cannot switch to 2D. Recreate first.
        makeCanvas();
        sim=new ParticleLife(world.width,world.height,'classic',options);
        backend='cpu';ctx=canvas.getContext('2d',{alpha:false});
        canvas.width=Math.round(view.width*view.dpr);
        canvas.height=Math.round(view.height*view.dpr);
        explain('GPU開始に失敗したため、CPUモードに切り替えました。',true);
      }else{
        status.textContent='WebGPU ERROR';
        return;
      }
    }else{explain(String(error),true);return;}
  }
  paused=wasPaused;acc=0;last=0;fpsFrames=0;simSteps=0;statsTime=0;
  updateCameraLabel();
  describe();
  draw(false);
}
function draw(step){
  if(!sim||!camera)return false;
  if(backend==='gpu'){
    const impulse=step?pendingImpulse:null;
    const success=sim.frame(camera,options,step,impulse);
    if(success&&step)pendingImpulse=null;
    return success;
  }
  if(step)sim.step();
  const view=dimensions(),dpr=view.dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=options.trails?'rgba(6,10,22,.22)':'#060a16';
  ctx.fillRect(0,0,camera.width,camera.height);
  ctx.save();
  ctx.translate(camera.x,camera.y);
  ctx.scale(camera.scale,camera.scale);
  sim.draw(ctx,{background:false});
  ctx.restore();
  return true;
}
function updateCameraLabel(){
  if(!camera)return;
  $('zoom-value').textContent=Math.round(camera.zoom*100)+'%';
  $('zoom-in').disabled=camera.zoom>=64;
  $('zoom-out').disabled=camera.zoom<=.5;
  $('zoom-reset').disabled=Math.abs(camera.zoom-1)<1e-6;
  canvas.classList.toggle('zoomed',camera.zoom>1);
}
function zoom(factor,x=camera.width/2,y=camera.height/2){
  if(!camera)return;
  camera.zoomBy(factor,x,y);
  updateCameraLabel();if(paused)draw(false);
}
$('zoom-in').addEventListener('click',()=>zoom(1.25));
$('zoom-out').addEventListener('click',()=>zoom(.8));
$('zoom-reset').addEventListener('click',()=>{
  if(!camera)return;camera.reset();updateCameraLabel();if(paused)draw(false);
});
$('toggle').addEventListener('click',()=>{
  paused=!paused;$('toggle').textContent=paused?'▶ 再開':'❚❚ 一時停止';describe();
});
$('reset').addEventListener('click',()=>void rebuild());
$('randomize').addEventListener('click',()=>{
  options.seed=Math.floor(Math.random()*2147483647);
  $('seed').value=String(options.seed);
  void rebuild();
});
$('seed').addEventListener('change',()=>{
  const seed=Number($('seed').value);
  options.seed=Number.isFinite(seed)?Math.trunc(seed):42;
  $('seed').value=String(options.seed);
  void rebuild();
});
backendSelector.addEventListener('change',()=>void rebuild());
function point(event){
  const rect=canvas.getBoundingClientRect();
  return {x:event.clientX-rect.left,y:event.clientY-rect.top};
}
function impulse(p){
  if(!camera||!sim)return;
  const w=camera.toWorld(p.x,p.y);
  if(w.x<0||w.x>=sim.world?.width&&backend==='gpu')return;
  if(backend==='cpu'){
    sim.stir(w.x,w.y);
  }else{
    pendingImpulse=[w.x,w.y,120,5.5];
  }
}
function gesture(){
  const pts=[...pointers.values()];
  if(pts.length!==2)return null;
  const [a,b]=pts;
  return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,
    distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};
}
function addPointerHandlers(){
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    if(!camera)return;
    const p=point(event);
    const units=event.deltaMode===1?18:event.deltaMode===2?camera.height:1;
    zoom(Math.exp(-event.deltaY*units*.0016),p.x,p.y);
  },{passive:false});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('pointerdown',event=>{
    if(!camera)return;
    if(event.pointerType!=='touch'&&![0,1,2].includes(event.button))return;
    event.preventDefault();
    const p=point(event);
    p.mode=(event.button!==0||(camera.zoom>1&&!event.shiftKey))?'pan':'stir';
    pointers.set(event.pointerId,p);
    canvas.setPointerCapture(event.pointerId);
    if(pointers.size===2){pinch=gesture();return;}
    if(p.mode==='stir')impulse(p);
  });
  canvas.addEventListener('pointermove',event=>{
    const prev=pointers.get(event.pointerId);
    if(!prev||!camera)return;
    const p=point(event),dx=p.x-prev.x,dy=p.y-prev.y;
    prev.x=p.x;prev.y=p.y;
    if(pointers.size===2){
      const now=gesture();
      if(pinch&&now){
        camera.zoomBy(now.distance/pinch.distance,pinch.x,pinch.y);
        camera.pan(now.x-pinch.x,now.y-pinch.y);
        updateCameraLabel();if(paused)draw(false);
      }
      pinch=now;return;
    }
    if(prev.mode==='pan'){camera.pan(dx,dy);updateCameraLabel();if(paused)draw(false);}
    else impulse(p);
  });
  const up=event=>{
    pointers.delete(event.pointerId);
    if(pointers.size<2)pinch=null;
    if(pointers.size===1)[...pointers.values()][0].mode=camera.zoom>1?'pan':'stir';
  };
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,up);
}
document.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if(event.code==='Space'){
    event.preventDefault();$('toggle').click();
  }else if(event.code==='KeyR')void rebuild();
  else if(event.code==='Equal'||event.code==='NumpadAdd'){event.preventDefault();zoom(1.25);}
  else if(event.code==='Minus'||event.code==='NumpadSubtract'){event.preventDefault();zoom(.8);}
  else if(event.code==='Digit0'||event.code==='Numpad0'){
    event.preventDefault();camera?.reset();updateCameraLabel();if(paused)draw(false);
  }
});
window.addEventListener('resize',()=>{
  if(!sim||!camera)return;
  const view=dimensions();
  camera.resize(view.width,view.height);
  if(backend==='gpu')sim.resize(view.width,view.height,view.dpr);
  else{
    canvas.width=Math.round(view.width*view.dpr);
    canvas.height=Math.round(view.height*view.dpr);
  }
  updateCameraLabel();draw(false);
});
function tick(now){
  if(!last)last=now;
  let dt=Math.min(.05,(now-last)/1000);
  last=now;
  acc=Math.min(.05,acc+dt);
  if(sim&&!paused&&acc>=1/60){
    if(draw(true)){simSteps++;fpsFrames++;acc-=1/60;}
    else acc=Math.min(acc,1/60);
  }
  if(now-statsTime>=800){
    const seconds=Math.max(.001,(now-statsTime)/1000);
    $('stat-steps').textContent=(simSteps/seconds).toFixed(0);
    $('stat-fps').textContent=(fpsFrames/seconds).toFixed(0);
    fpsFrames=0;simSteps=0;statsTime=now;
  }
  requestAnimationFrame(tick);
}
void rebuild();
requestAnimationFrame(tick);
