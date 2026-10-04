import type {StartupDiagnostics} from './startup';
/** Pinned Three 0.186 integration. Observe its real fallback, preserving its backend ownership. */
export interface BootRenderer {
 backend:{isWebGPUBackend?:boolean;isWebGLBackend?:boolean;init(renderer:any):Promise<unknown>|void;dispose?:()=>Promise<unknown>|void};
 init():Promise<unknown>; dispose():Promise<unknown>|void; setAnimationLoop(callback:null):Promise<unknown>|unknown;
 onDeviceLost:(info:{api:'WebGL'|'WebGPU';message:string;reason:string|null;originalEvent:unknown})=>void;
}
export async function initializeStartupRenderer<T extends BootRenderer>(renderer:T,startup:StartupDiagnostics,forcedWebGL:boolean):Promise<T>{
 const primary=renderer.backend,api=forcedWebGL?'WebGL2':'WebGPU';
 const original=primary.init.bind(primary);
 // This pinned private hook prevents a canceled primary attempt from starting a fallback.
 const fallbackOwner=renderer as T&{_getFallback?:((error:unknown)=>BootRenderer['backend'])|null};
 const fallback=fallbackOwner._getFallback;
 if(fallback)fallbackOwner._getFallback=error=>{startup.assertAlive();return fallback(error);};
 primary.init=async owner=>{startup.assertAlive();startup.attempt(api,'attempted',forcedWebGL?'Explicit backend=webgl selection':'Three 0.186 primary backend');try{if(!forcedWebGL&&startup.test==='webgpu-fallback')throw Error('Simulated WebGPU rejection for fallback test');const result=await original(owner);return result;}catch(error){startup.attempt(api,'failed',error);if(!forcedWebGL&&!startup.failed)startup.attempt('WebGL2','attempted','Three fallback after the WebGPU failure above');throw error;}};
 // Three owns the fallback canvas/context. A timed-out init cannot be canceled by Promise.race.
 let settled=false,initialized=false,disposed=false;
 const dispose=()=>{if(!settled||disposed)return;disposed=true;if(initialized){try{void Promise.resolve(renderer.setAnimationLoop(null)).catch(()=>{});}catch{}try{void Promise.resolve(renderer.dispose()).catch(()=>startup.note('Renderer cleanup incomplete; reload required'));}catch{startup.note('Renderer cleanup incomplete; reload required');}}else{try{void Promise.resolve(renderer.backend.dispose?.()).catch(()=>{});}catch{}}};
 startup.cleanup(dispose);
 const lose=renderer.onDeviceLost.bind(renderer);
 renderer.onDeviceLost=info=>{lose(info);startup.fail('Graphics device / context lost',Error(`${info.api}: ${info.reason??'unspecified'} · ${info.message}`));};
 const init=renderer.init().then(()=>{settled=true;initialized=true;if(startup.failed){dispose();throw Error('Renderer completed after startup stopped');}const chosen=renderer.backend.isWebGPUBackend?'WebGPU':renderer.backend.isWebGLBackend?'WebGL2':'Unknown backend';if(chosen==='Unknown backend')throw Error('Renderer returned an unrecognized backend');startup.attempt(chosen,'selected',chosen!==api?'Fallback initialized successfully':'Backend initialized successfully');return renderer;},error=>{settled=true;startup.attempt(renderer.backend===primary?api:'WebGL2','initialization failed',error);dispose();throw error;});
 // Handle late completion explicitly even if the outer stage times out or navigation cancels.
 void init.catch(()=>{});
 return init;
}
