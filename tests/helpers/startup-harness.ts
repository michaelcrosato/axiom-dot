import {readFileSync} from 'node:fs';import vm from 'node:vm';
export function startupHarness(search='',shell=readFileSync(new URL('../../src/startup-shell.js',import.meta.url),'utf8')){
 let now=0,next=0,reloads=0;const timers=new Map<number,{at:number;fn:()=>void;interval:number}>(),listeners=new Map<string,((event:any)=>void)[]>();
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 class Element {id:string;tagName='DIV';hidden=false;inert=false;textContent='';value='';open=false;disabled=false;focused=false;selected=false;dataset:Record<string,string>={};onclick:any=null;href='';src='';rel='';download='';constructor(id=''){this.id=id;}focus(){this.focused=true;}select(){this.selected=true;}contains(target:any){return target===this||target?.id?.startsWith('startup-');}click(){}remove(){} }
 const nodes=new Map<string,Element>();for(const m of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const e=new Element(m[3]);e.tagName=m[1]!.toUpperCase();e.hidden=/\bhidden\b/.test(m[2]!);nodes.set(m[3]!,e);}
 const root=nodes.get('startup')!;
 const document={getElementById:(id:string)=>nodes.get(id)??null,documentElement:{dataset:{} as Record<string,string>},createElement:()=>new Element(),head:{append(){}},fonts:{load:async()=>[]}};
 const location={href:'https://private.example/game'+search,replace(url:string){reloads++;this.href=url;},reload(){reloads++;}};
 const window={document,isSecureContext:true,innerWidth:390,innerHeight:844,devicePixelRatio:3,addEventListener(type:string,fn:(event:any)=>void){listeners.set(type,[...(listeners.get(type)??[]),fn]);}} as any;
 const schedule=(fn:()=>void,delay=0,interval=0)=>{const id=++next;timers.set(id,{at:now+delay,fn,interval});return id;};
 const context={window,document,location,history:{state:null,replaceState(_s:unknown,_t:string,url:string){location.href=new URL(url,location.href).href;}},navigator:{userAgent:'Mozilla/5.0 (iPhone) Version/18.0',gpu:{},maxTouchPoints:5,onLine:true} as any,Worker:function(){},WebAssembly,AbortController,Error,URL,Blob,performance:{now:()=>now},setTimeout:(fn:()=>void,ms:number)=>schedule(fn,ms),clearTimeout:(id:number)=>timers.delete(id),setInterval:(fn:()=>void,ms:number)=>schedule(fn,ms,ms),clearInterval:(id:number)=>timers.delete(id)};
 vm.runInNewContext(shell.replaceAll('__AXIOM_SOURCE__','a'.repeat(40)).replaceAll('__AXIOM_BUILT__','2026-10-03T00:00:00.000Z'),context);
 const advance=(ms:number)=>{const end=now+ms;let guard=0;for(;;){const due=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;if(++guard>10000)throw Error('Timer runaway');const [id,t]=due;now=t.at;if(t.interval)t.at+=t.interval;else timers.delete(id);t.fn();}now=end;};
 return {boot:window.axiomStartup,window,document,nodes,root,context,advance,block(ms:number){now+=ms;},emit(type:string,event:any={}){for(const fn of listeners.get(type)??[])fn(event);},get reloads(){return reloads;},get timerCount(){return timers.size;},get now(){return now;}};
}
export const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
