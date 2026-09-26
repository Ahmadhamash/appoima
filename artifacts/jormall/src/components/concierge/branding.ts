export type CenterBrand={name:string;logoDataUrl:string|null;colors:string[]};
export const safeLogo=(value:unknown):value is string=>typeof value==='string'&&value.length<250000&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value);
export function logoPalette(image:HTMLImageElement):string[]{
 try{const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;const ctx=canvas.getContext('2d');if(!ctx)return [];ctx.drawImage(image,0,0,48,48);const pixels=ctx.getImageData(0,0,48,48).data,counts=new Map<string,number>();for(let i=0;i<pixels.length;i+=4){const r=pixels[i]!,g=pixels[i+1]!,b=pixels[i+2]!;if(pixels[i+3]!<160||Math.max(r,g,b)-Math.min(r,g,b)<25||Math.max(r,g,b)>245&&Math.min(r,g,b)>220)continue;const hex='#'+[r,g,b].map(v=>(Math.round(v/24)*24>255?255:Math.round(v/24)*24).toString(16).padStart(2,'0')).join('');counts.set(hex,(counts.get(hex)??0)+1);}const chosen:string[]=[];for(const [hex] of [...counts].sort((a,b)=>b[1]-a[1])){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));if(chosen.every(other=>[1,3,5].reduce((sum,i,j)=>sum+(parseInt(other.slice(i,i+2),16)-rgb[j]!)**2,0)>7000))chosen.push(hex);if(chosen.length===3)break;}return chosen;}catch{return [];}
}
function hsl(hex:string){const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(r!,g!,b!),min=Math.min(r!,g!,b!),d=max-min,l=(max+min)/2;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===r?((g!-b!)/d)%6:max===g?(b!-r!)/d+2:(r!-g!)/d+4;h=(h*60+360)%360;}return `${h.toFixed(1)} ${(s*100).toFixed(1)}% ${(l*100).toFixed(1)}%`;}
export class BrandPreview {
 private original=new Map<string,string>();private signature='';
 apply(brand:CenterBrand|null){const signature=JSON.stringify(brand);if(signature===this.signature)return;this.signature=signature;const root=document.documentElement;for(const [key,value] of this.original){if(value)root.style.setProperty(key,value);else root.style.removeProperty(key);}this.original.clear();
  const color=brand?.colors.find(value=>/^#[\da-f]{6}$/i.test(value));if(color){const value=hsl(color),linear=[1,3,5].map(i=>{const v=parseInt(color.slice(i,i+2),16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}),foreground=.2126*linear[0]!+.7152*linear[1]!+.0722*linear[2]!>.179?'0 0% 0%':'0 0% 100%';for(const [key,next] of Object.entries({'--primary':value,'--ring':value,'--sidebar-primary':value,'--primary-foreground':foreground,'--sidebar-primary-foreground':foreground})){this.original.set(key,root.style.getPropertyValue(key));root.style.setProperty(key,next);}}
  window.dispatchEvent(new CustomEvent('jormall:center-brand',{detail:brand?{...brand,logoDataUrl:safeLogo(brand.logoDataUrl)?brand.logoDataUrl:null}:null}));
 }
 dispose(){this.apply(null);}
}
