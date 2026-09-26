/** Tiny, dependency-free liquid-sphere renderer. No image/video loop and no synthetic audio level. */
const vertex=`attribute vec2 position;varying vec2 uv;void main(){uv=position;gl_Position=vec4(position,0.,1.);}`;
const fragment=`precision highp float;varying vec2 uv;uniform float time;uniform float energy;uniform float activity;
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float f=0.;f+=.52*noise(p);p=p*2.03+7.1;f+=.27*noise(p);p=p*2.01+3.1;f+=.13*noise(p);return f;}
void main(){vec2 p=uv*1.15;float r=length(p);float radius=.90+energy*.025;if(r>radius+.01){gl_FragColor=vec4(0.);return;}float z=sqrt(max(0.,1.-pow(r/radius,2.)));vec3 n=vec3(p/radius,z);float t=time*.16;vec3 q=vec3(n.xy*2.,n.z+t);float field=fbm(q+vec3(fbm(q+vec3(t,0.,1.)),fbm(q-vec3(0.,t,1.)),t));float wave=n.y+(.66+energy*.24)*(field-.45)+.14*sin(n.x*5.+time*.35);vec3 deep=vec3(.025,.18,.66);vec3 azure=vec3(.08,.49,1.);vec3 pearl=vec3(.86,.98,1.);vec3 c=mix(deep,azure,smoothstep(-.9,.12,wave));c=mix(c,pearl,smoothstep(-.07,.29,wave));float light=max(dot(n,normalize(vec3(-.35,.6,1.))),0.);c*=.70+.30*light;float fresnel=pow(1.-z,2.5);c=mix(c,vec3(.68,.92,1.),fresnel*.65);float shine=pow(max(dot(n,normalize(vec3(-.4,.65,1.5))),0.),32.);c+=vec3(.28)*shine;float swirl=sin(field*31.+t*2.)*.019;c+=swirl;float a=1.-smoothstep(radius-.006,radius+.005,r);gl_FragColor=vec4(c,a);}`;
export class LiquidOrb {
 private gl:WebGLRenderingContext|null;private context2d:CanvasRenderingContext2D|null=null;private frame=0;private paused=false;private started=performance.now();private level=0;private active=0;private disposed=false;
 private uniform:{time:WebGLUniformLocation|null;energy:WebGLUniformLocation|null;activity:WebGLUniformLocation|null}|null=null;
 private reduced=matchMedia('(prefers-reduced-motion: reduce)');
 constructor(private canvas:HTMLCanvasElement){
  this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:'low-power'});
  const gl=this.gl;if(!gl){this.fallback();return;}
  try {const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('shader');return s;};
   const program=gl.createProgram()!,v=shader(gl.VERTEX_SHADER,vertex),f=shader(gl.FRAGMENT_SHADER,fragment);gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('shader');gl.useProgram(program);gl.deleteShader(v);gl.deleteShader(f);
   const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   this.uniform={time:gl.getUniformLocation(program,'time'),energy:gl.getUniformLocation(program,'energy'),activity:gl.getUniformLocation(program,'activity')};
   const size=Math.min(640,Math.round(330*Math.min(devicePixelRatio,1.75)));canvas.width=canvas.height=size;gl.viewport(0,0,size,size);this.draw();
   document.addEventListener('visibilitychange',this.visibility);
  }catch{gl.getExtension('WEBGL_lose_context')?.loseContext();this.gl=null;const replacement=canvas.cloneNode() as HTMLCanvasElement;canvas.replaceWith(replacement);this.canvas=replacement;this.fallback();}
 }
 setLevel(value:number){this.level=Math.max(0,Math.min(1,value));}
 setActive(active:boolean){this.active=active?1:0;}
 private visibility=()=>{cancelAnimationFrame(this.frame);if(!document.hidden&&!this.paused)this.draw();};
 pause(){this.paused=true;cancelAnimationFrame(this.frame);}
 resume(){this.paused=false;cancelAnimationFrame(this.frame);this.draw();}
 private fallback(){const size=Math.min(580,Math.round(330*Math.min(devicePixelRatio,1.75)));this.canvas.width=this.canvas.height=size;this.context2d=this.canvas.getContext('2d');if(!this.context2d){this.canvas.classList.add('jc-orb-fallback');return;}document.addEventListener('visibilitychange',this.visibility);this.draw();}
 private draw=()=>{if(this.disposed||this.paused)return;const gl=this.gl,u=this.uniform;if(!gl||!u){if(this.context2d){this.drawFallback();this.frame=requestAnimationFrame(this.draw);}return;}
  const motion=this.reduced.matches;gl.uniform1f(u.time,motion?2:(performance.now()-this.started)/1000);gl.uniform1f(u.energy,motion?0:this.level);gl.uniform1f(u.activity,this.active);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);
  this.canvas.parentElement?.style.setProperty('--voice-level',String(this.level));this.frame=requestAnimationFrame(this.draw);
 };
 private drawFallback(){
  const ctx=this.context2d!,size=this.canvas.width,c=size/2,r=size*.3913,t=this.reduced.matches?2:(performance.now()-this.started)/1000,energy=this.reduced.matches?0:this.level;
  ctx.clearRect(0,0,size,size);ctx.save();ctx.beginPath();ctx.arc(c,c,r*(1+energy*.018),0,Math.PI*2);ctx.clip();
  const base=ctx.createLinearGradient(0,c-r,0,c+r);base.addColorStop(0,'#b2ecff');base.addColorStop(.55,'#2994fc');base.addColorStop(1,'#1457ed');ctx.fillStyle=base;ctx.fillRect(c-r,c-r,2*r,2*r);
  for(let layer=0;layer<3;layer++){
   ctx.beginPath();ctx.moveTo(c-r,c-r);ctx.lineTo(c+r,c-r);
   for(let i=48;i>=0;i--){const x=i/24-1;const wave=Math.sin(x*4.1+t*.36+layer*.7)*.14+Math.sin(x*9.5-t*.43+layer*.8)*.063+Math.sin(x*14+t*.17)*.019;const y=c-r*.29+layer*r*.10+(wave*(1+energy*.35)+Math.cos(x*2.5+t*.11)*.095)*r;ctx.lineTo(c+x*r,y);}
   ctx.closePath();const g=ctx.createLinearGradient(c,c-r,c,c+r*.14);g.addColorStop(0,'#f2ffff');g.addColorStop(1,['#73cfff','#aceaff','#d9faff'][layer]!);ctx.globalAlpha=[.8,.65,.95][layer]!;ctx.fillStyle=g;ctx.fill();
  }
  ctx.globalAlpha=1;const sheen=ctx.createRadialGradient(c-r*.35,c-r*.55,0,c-r*.25,c-r*.45,r*1.4);sheen.addColorStop(0,'#ffffff45');sheen.addColorStop(.65,'#ffffff00');sheen.addColorStop(1,'#001d7217');ctx.fillStyle=sheen;ctx.fillRect(0,0,size,size);ctx.restore();
  ctx.beginPath();ctx.arc(c,c,r,0,Math.PI*2);ctx.strokeStyle='#dbf7ff2b';ctx.lineWidth=size/520;ctx.stroke();this.canvas.parentElement?.style.setProperty('--voice-level',String(energy));
 }
 dispose(){this.disposed=true;cancelAnimationFrame(this.frame);document.removeEventListener('visibilitychange',this.visibility);this.gl?.getExtension('WEBGL_lose_context')?.loseContext();}
}
