// Classic camera maps a large world onto a fixed-size browser viewport.
const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));
export class WorldCamera {
  constructor(width,height,worldWidth,worldHeight){
    this.width=width;this.height=height;
    this.worldWidth=worldWidth;this.worldHeight=worldHeight;
    this.zoom=1;
    this.reframe();
  }
  reframe(){
    this.fit=Math.min(this.width/this.worldWidth,this.height/this.worldHeight);
    this.scale=this.fit*this.zoom;
    this.constrain();
  }
  constrain(){
    const w=this.worldWidth*this.scale,h=this.worldHeight*this.scale;
    this.x=w<=this.width?(this.width-w)/2:clamp(this.x,this.width-w,0);
    this.y=h<=this.height?(this.height-h)/2:clamp(this.y,this.height-h,0);
  }
  resize(w,h){
    const center=this.toWorld(this.width/2,this.height/2);
    this.width=w;this.height=h;this.fit=Math.min(w/this.worldWidth,h/this.worldHeight);
    this.scale=this.fit*this.zoom;
    this.x=w/2-center.x*this.scale;
    this.y=h/2-center.y*this.scale;
    this.constrain();
  }
  toWorld(x,y){return{x:(x-this.x)/this.scale,y:(y-this.y)/this.scale};}
  zoomBy(factor,x=this.width/2,y=this.height/2){
    if(!(factor>0&&Number.isFinite(factor)))return;
    const world=this.toWorld(x,y);
    this.zoom=clamp(this.zoom*factor,.5,64);
    this.scale=this.fit*this.zoom;
    this.x=x-world.x*this.scale;this.y=y-world.y*this.scale;
    this.constrain();
  }
  pan(dx,dy){this.x+=dx;this.y+=dy;this.constrain();}
  reset(){this.zoom=1;this.scale=this.fit;this.x=0;this.y=0;this.constrain();}
}
