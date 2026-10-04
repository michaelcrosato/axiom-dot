/** Small typed contract for the inline diagnostic shell. No rendering dependency. */
export interface StartupDiagnostics {
 readonly build:{version:string;source:string;built:string}; readonly test:string;
 readonly signal:AbortSignal; readonly playing:boolean; readonly initialized:boolean; readonly failed:boolean;
 begin(id:string,label:string,timeoutMs?:number,optional?:boolean):void;
 detail(id:string,text:string,done?:number,total?:number):void;
 end(id:string,text?:string,status?:'done'|'degraded'):void;
 run<T>(id:string,label:string,job:()=>Promise<T>|T,timeoutMs?:number,optional?:boolean):Promise<T|undefined>;
 fail(category:string,error:unknown,location?:string):void;
 attempt(name:string,status:string,detail?:unknown):void;
 setOverlayHandler(fn:()=>void):void; cleanup(fn:()=>void):void; assertAlive():void; report():string; show():void; ready():void; note(text:string):void; safe(value:unknown,limit?:number):string;
}
declare global { interface Window { axiomStartup:StartupDiagnostics } }
export const STARTUP_TESTS=Object.freeze([
 {id:'none',label:'Normal startup',effect:'Normal renderer selection and critical preload'},
 {id:'module-fail',label:'Module import failure',effect:'Simulated error before the game module is imported'},
 {id:'renderer-fail',label:'Renderer unavailable',effect:'Simulated required renderer failure; gameplay never starts'},
 {id:'webgpu-fallback',label:'WebGPU → real WebGL2 fallback',effect:'Simulated WebGPU rejection; attempts the actual WebGL2 backend'},
 {id:'slow-shaders',label:'Slow shader stage (+5 seconds)',effect:'One bounded wait before the actual compilation call'},
 {id:'optional-font-fail',label:'Optional font failure',effect:'Uses system font; critical startup continues'},
 {id:'timeout',label:'Module deadline (2 seconds)',effect:'Simulated non-completing stage; full reload required'},
] as const);
export async function prepareOptionalFonts(startup:StartupDiagnostics):Promise<void>{
 await startup.run('fonts','Optional interface fonts',async()=>{
  if(startup.test==='optional-font-fail')throw Error('Simulated optional font failure; system font retained');
  const link=document.createElement('link');link.rel='stylesheet';link.dataset.startupOptional='true';
  link.href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap';
  try{await new Promise<void>((resolve,reject)=>{let finished=false;const abort=()=>finish(Error('Font preparation cancelled'));const timer=setTimeout(()=>finish(Error('Optional font deadline; system font retained')),1800);const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);startup.signal.removeEventListener('abort',abort);link.onload=null;link.onerror=null;error?reject(error):resolve();};startup.signal.addEventListener('abort',abort,{once:true});link.onload=()=>{void Promise.all([document.fonts.load('500 16px "DM Sans"'),document.fonts.load('500 16px "Space Grotesk"')]).then(families=>{const done=families.filter(f=>f.length>0).length;startup.detail('fonts','Optional font families reported loaded by the browser',done,2);finish(done===2?undefined:Error('Optional font faces unavailable; system font retained'));},()=>finish(Error('Optional fonts unavailable')));};link.onerror=()=>finish(Error('Optional font stylesheet unavailable'));startup.detail('fonts','Requesting two optional interface font families; system font is already usable',0,2);document.head.append(link);});}
  catch(error){link.remove();throw error;}
 },2000,true);
}
