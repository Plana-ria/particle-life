// WebGPU-only Classic engine. Particle states remain on GPU.
const MATRIX = [
 .46,-.72,.57,-.30,.66,-.15,.65,.40,-.60,.54,-.20,.50,
 -.30,.68,.45,-.63,.55,.34,.57,-.36,.55,.38,-.63,.45,
 -.62,.50,-.26,.55,.42,.58,.45,.53,-.57,-.34,.62,.48
];
const WGSL_MATRIX = MATRIX.map(x=>x.toFixed(3)).join(',');
const COMPUTE = `
struct Particle { pos:vec2f, vel:vec2f, kind:u32, p0:u32, p1:u32, p2:u32 }
struct Uniforms {
  world:vec4f, physics:vec4f, info:vec4u,
  view:vec4f, canvas:vec4f, stir:vec4f
}
@group(0) @binding(0) var<uniform> U:Uniforms;
@group(0) @binding(1) var<storage,read> input:array<Particle>;
@group(0) @binding(2) var<storage,read_write> output:array<Particle>;
@group(0) @binding(3) var<storage,read_write> heads:array<atomic<i32>>;
@group(0) @binding(4) var<storage,read_write> links:array<i32>;
const A = array<f32,36>(__MATRIX__);
fn cellIndex(pos:vec2f)->u32 {
  let cx=min(u32(pos.x/U.world.x*f32(U.info.y)),U.info.y-1u);
  let cy=min(u32(pos.y/U.world.y*f32(U.info.z)),U.info.z-1u);
  return cx+cy*U.info.y;
}
fn periodic(p:vec2f)->vec2f {
  return p-round(p/U.world.xy)*U.world.xy;
}
@compute @workgroup_size(256)
fn clearGrid(@builtin(global_invocation_id) gid:vec3u){
  if(gid.x<U.info.y*U.info.z){atomicStore(&heads[gid.x],-1);}
}
@compute @workgroup_size(256)
fn buildGrid(@builtin(global_invocation_id) gid:vec3u){
  let id=gid.x;
  if(id>=U.info.x){return;}
  let cell=cellIndex(input[id].pos);
  links[id]=atomicExchange(&heads[cell],i32(id));
}
@compute @workgroup_size(256)
fn integrate(@builtin(global_invocation_id) gid:vec3u){
  let i=gid.x;
  if(i>=U.info.x){return;}
  var particle=input[i];
  let cell=cellIndex(particle.pos);
  let cx=i32(cell%U.info.y);
  let cy=i32(cell/U.info.y);
  let cols=i32(U.info.y);
  let rows=i32(U.info.z);
  let radius2=U.world.z*U.world.z;
  var acceleration=vec2f(0.0);
  for(var oy:i32=-1;oy<=1;oy=oy+1){
    for(var ox:i32=-1;ox<=1;ox=ox+1){
      let nx=(cx+ox+cols)%cols;
      let ny=(cy+oy+rows)%rows;
      var j=atomicLoad(&heads[u32(nx+ny*cols)]);
      while(j>=0){
        if(u32(j)!=i){
          let other=input[u32(j)];
          let displacement=periodic(other.pos-particle.pos);
          let r2=dot(displacement,displacement);
          if(r2<radius2 && r2>0.0001){
            let r=sqrt(r2);
            var strength=0.0;
            if(r<U.world.w){
              strength=-U.physics.y*(1.0-r/U.world.w);
            }else{
              let q=clamp((r-U.world.w)/(U.world.z-U.world.w),0.0,1.0);
              strength=U.physics.x*A[particle.kind*6u+other.kind]*sin(3.14159265*q);
            }
            acceleration+=(displacement/r)*strength;
          }
        }
        j=links[u32(j)];
      }
    }
  }
  if(U.stir.w>0.0){
    let v=periodic(particle.pos-U.stir.xy);
    let r=length(v);
    if(r<U.stir.z && r>0.001){
      particle.vel+=(v/r)*U.stir.w*(1.0-r/U.stir.z);
    }
  }
  var velocity=(particle.vel+acceleration)*U.physics.z;
  let speed=length(velocity);
  if(speed>U.physics.w){velocity*=U.physics.w/speed;}
  particle.vel=velocity;
  let moved=particle.pos+velocity;
  particle.pos=moved-floor(moved/U.world.xy)*U.world.xy;
  output[i]=particle;
}
`;
const RENDER = `
struct Particle { pos:vec2f, vel:vec2f, kind:u32, p0:u32, p1:u32, p2:u32 }
struct Uniforms {
  world:vec4f, physics:vec4f, info:vec4u,
  view:vec4f, canvas:vec4f, stir:vec4f
}
@group(0) @binding(0) var<uniform> U:Uniforms;
@group(0) @binding(1) var<storage,read> particles:array<Particle>;
const COLORS=array<vec3f,6>(
  vec3f(1.0,.416,.471),vec3f(.341,.769,.988),vec3f(.557,.898,.545),
  vec3f(1.0,.824,.478),vec3f(.773,.631,1.0),vec3f(.388,.882,.816)
);
const QUAD=array<vec2f,6>(
  vec2f(-1.0,-1.0),vec2f(1.0,-1.0),vec2f(-1.0,1.0),
  vec2f(-1.0,1.0),vec2f(1.0,-1.0),vec2f(1.0,1.0)
);
struct Varyings {
  @builtin(position) clip:vec4f,
  @location(0) color:vec3f,
  @location(1) local:vec2f
}
@vertex fn vertex(@builtin(vertex_index) vertexId:u32,@builtin(instance_index) index:u32)->Varyings{
  let particle=particles[index];
  let corner=QUAD[vertexId];
  let pixel=particle.pos*U.view.x+U.view.yz+corner*U.canvas.z*max(.35,U.view.x);
  var out:Varyings;
  out.clip=vec4f(pixel.x/U.canvas.x*2.0-1.0,1.0-pixel.y/U.canvas.y*2.0,0.0,1.0);
  out.color=COLORS[particle.kind];
  out.local=corner;
  return out;
}
@fragment fn fragment(i:Varyings)->@location(0) vec4f {
  if(dot(i.local,i.local)>1.0){discard;}
  return vec4f(i.color,1.0);
}
@vertex fn fadeVertex(@builtin(vertex_index) id:u32)->@builtin(position) vec4f{
  let p=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  return vec4f(p[id],0.0,1.0);
}
@fragment fn fadeFragment()->@location(0) vec4f {
  return vec4f(.024,.039,.086,.22);
}
`;
const makeRng=seed=>{
  let a=seed>>>0;
  return ()=>{
    a=(a+0x6D2B79F5)>>>0;
    let t=Math.imul(a^a>>>15,1|a);
    t^=t+Math.imul(t^t>>>7,61|t);
    return ((t^t>>>14)>>>0)/4294967296;
  };
};
export function classicWorldSize(width,height,count){
  const scale=Math.sqrt(count/1000);
  return {width:Math.max(1,width*scale),height:Math.max(1,height*scale)};
}
export function createClassicInitialData(count,width,height,seed){
  const data=new ArrayBuffer(count*32);
  const f=new Float32Array(data),u=new Uint32Array(data);
  const random=makeRng(seed);
  for(let i=0;i<count;i++){
    const k=i*8;
    f[k]=random()*width;f[k+1]=random()*height;
    f[k+2]=(random()-.5)*1.6;f[k+3]=(random()-.5)*1.6;
    u[k+4]=Math.floor(random()*6);
    random();random();random(); // matches the Classic CPU initializer
  }
  return data;
}
export class ClassicGPU {
  static async create(canvas,options,world){
    if(!navigator.gpu)throw Error('この環境はWebGPUに対応していません。');
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter)throw Error('WebGPUアダプターを取得できません。');
    const device=await adapter.requestDevice();
    const gpu=new ClassicGPU(canvas,device);
    await gpu.init(options,world);
    return gpu;
  }
  constructor(canvas,device){
    this.canvas=canvas;this.device=device;
    this.context=canvas.getContext('webgpu');
    if(!this.context)throw Error('WebGPU描画コンテキストを作成できません。');
    this.format=navigator.gpu.getPreferredCanvasFormat();
    device.lost.then(info=>{
      this.lost=true;
      if(this.onLost)this.onLost('GPUデバイスが失われました: '+info.message);
    });
  }
  async init(options,world){
    this.world=world;this.count=options.count;this.steps=0;
    this.parity=0;this.inFlight=false;this.lost=false;this.needsClear=true;
    // Cells are at least as large as the interaction radius. 3x3 cells suffice.
    this.cols=Math.max(3,Math.floor(world.width/options.interactionRadius));
    this.rows=Math.max(3,Math.floor(world.height/options.interactionRadius));
    const d=this.device;
    const storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST;
    this.states=[0,1].map(()=>d.createBuffer({size:this.count*32,usage:storage}));
    this.heads=d.createBuffer({size:this.cols*this.rows*4,usage:GPUBufferUsage.STORAGE});
    this.links=d.createBuffer({size:this.count*4,usage:GPUBufferUsage.STORAGE});
    this.uniform=d.createBuffer({size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    d.queue.writeBuffer(this.states[0],0,createClassicInitialData(this.count,world.width,world.height,options.seed));
    const compute=d.createShaderModule({code:COMPUTE.replace('__MATRIX__',WGSL_MATRIX)});
    const render=d.createShaderModule({code:RENDER});
    for(const module of [compute,render]){
      if(module.getCompilationInfo){
        const info=await module.getCompilationInfo();
        const errors=info.messages.filter(x=>x.type==='error');
        if(errors.length)throw Error('WGSL shader: '+errors.map(x=>x.message).join('; '));
      }
    }
    const layout=d.createBindGroupLayout({entries:[
      {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
      {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
      {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
      {binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}}
    ]});
    const pipelineLayout=d.createPipelineLayout({bindGroupLayouts:[layout]});
    this.compute=['clearGrid','buildGrid','integrate'].map(entryPoint=>
      d.createComputePipeline({layout:pipelineLayout,compute:{module:compute,entryPoint}}));
    this.computeGroups=this.states.map((buffer,i)=>d.createBindGroup({layout,entries:[
      {binding:0,resource:{buffer:this.uniform}},
      {binding:1,resource:{buffer}},
      {binding:2,resource:{buffer:this.states[1-i]}},
      {binding:3,resource:{buffer:this.heads}},
      {binding:4,resource:{buffer:this.links}}
    ]}));
    const renderLayout=d.createBindGroupLayout({entries:[
      {binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'uniform'}},
      {binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}}
    ]});
    this.renderGroups=this.states.map(buffer=>d.createBindGroup({layout:renderLayout,entries:[
      {binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer}}
    ]}));
    this.drawPipeline=d.createRenderPipeline({
      layout:d.createPipelineLayout({bindGroupLayouts:[renderLayout]}),
      vertex:{module:render,entryPoint:'vertex'},
      fragment:{module:render,entryPoint:'fragment',targets:[{format:this.format}]},
      primitive:{topology:'triangle-list'}
    });
    this.fadePipeline=d.createRenderPipeline({
      layout:'auto',vertex:{module:render,entryPoint:'fadeVertex'},
      fragment:{module:render,entryPoint:'fadeFragment',targets:[{
        format:this.format,
        blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},
               alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}
      }]},
      primitive:{topology:'triangle-list'}
    });
  }
  resize(width,height,dpr){
    this.canvas.width=Math.max(1,Math.round(width*dpr));
    this.canvas.height=Math.max(1,Math.round(height*dpr));
    this.context.configure({device:this.device,format:this.format,alphaMode:'opaque'});
    this.needsClear=true;
  }
  writeUniform(camera,options,impulse){
    const buffer=new ArrayBuffer(96);
    const f=new Float32Array(buffer),u=new Uint32Array(buffer);
    const radius=options.interactionRadius;
    const near=Math.min(radius*.35,Math.max(9*1.15,11));
    f.set([this.world.width,this.world.height,radius,near],0);
    f.set([options.force,options.repel,options.damping,options.maxSpeed],4);
    u.set([this.count,this.cols,this.rows,0],8);
    f.set([camera.scale,camera.x,camera.y,0],12);
    f.set([camera.width,camera.height,2.15,options.trails?1:0],16);
    f.set(impulse??[0,0,120,0],20);
    this.device.queue.writeBuffer(this.uniform,0,buffer);
  }
  frame(camera,options,integrate=true,impulse=null){
    if(this.lost||this.inFlight)return false;
    this.inFlight=true;
    this.writeUniform(camera,options,impulse);
    const d=this.device,enc=d.createCommandEncoder();
    if(integrate){
      for(let i=0;i<3;i++){
        const pass=enc.beginComputePass();
        pass.setPipeline(this.compute[i]);
        pass.setBindGroup(0,this.computeGroups[this.parity]);
        pass.dispatchWorkgroups(Math.ceil((i===0?this.cols*this.rows:this.count)/256));
        pass.end();
      }
      this.parity=1-this.parity;
      this.steps++;
    }
    const trail=options.trails&&!this.needsClear;
    const pass=enc.beginRenderPass({colorAttachments:[{
      view:this.context.getCurrentTexture().createView(),
      clearValue:{r:.024,g:.039,b:.086,a:1},
      loadOp:trail?'load':'clear',storeOp:'store'
    }]});
    if(trail){pass.setPipeline(this.fadePipeline);pass.draw(3);}
    pass.setPipeline(this.drawPipeline);
    pass.setBindGroup(0,this.renderGroups[this.parity]);
    pass.draw(6,this.count);
    pass.end();
    d.queue.submit([enc.finish()]);
    this.needsClear=false;
    d.queue.onSubmittedWorkDone().then(()=>{this.inFlight=false;},err=>{
      this.inFlight=false;this.lost=true;
      if(this.onLost)this.onLost(String(err));
    });
    return true;
  }
  dispose(){
    this.lost=true;
    for(const buffer of [...this.states,this.heads,this.links,this.uniform])buffer.destroy();
    this.context.unconfigure();
  }
}
