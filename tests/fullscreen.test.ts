import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
function harness(supported=true){
 const button={disabled:false,textContent:'',attributes:{} as Record<string,string>,setAttribute(k:string,v:string){this.attributes[k]=v;}},status={textContent:''},listeners=new Map<string,()=>void>();let clears=0,resizes=0,entries=0,exits=0,reject=false,options:unknown;
 const doc={fullscreenElement:null as object|null,fullscreenEnabled:supported,documentElement:{requestFullscreen:async(o:unknown)=>{entries++;options=o;if(reject)throw new Error('Blocked');doc.fullscreenElement={};listeners.get('fullscreenchange')?.();}},exitFullscreen:async()=>{exits++;doc.fullscreenElement=null;listeners.get('fullscreenchange')?.();},getElementById:(id:string)=>id==='fullscreen-toggle'?button:id==='fullscreen-status'?status:null,addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn)};
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),source=main.slice(main.indexOf('let fullscreenPending=false'),main.indexOf('function renderWorldsPanel()'));
 const code=stripTypeScriptTypes(source,{mode:'strip'});
 const api=new Function('document','clearInput','resize',code+'\nreturn {toggleFullscreen,updateFullscreenUI};')(doc,()=>clears++,()=>resizes++);
 return {api,doc,button,status,listeners,setReject:(v:boolean)=>reject=v,counts:()=>({clears,resizes,entries,exits,options})};
}
test('fullscreen feature detection, gesture entry, repeated tap guard and exit track actual browser state',async()=>{
 const h=harness();h.api.updateFullscreenUI();assert.equal(h.button.disabled,false);const entering=h.api.toggleFullscreen();await h.api.toggleFullscreen();await entering;
 assert.equal(h.counts().entries,1);assert.deepEqual(h.counts().options,{navigationUI:'hide'});assert.equal(h.button.textContent,'Exit fullscreen');assert.equal(h.button.attributes['aria-pressed'],'true');assert.equal(h.counts().clears,1);
 await h.api.toggleFullscreen();assert.equal(h.counts().exits,1);assert.equal(h.button.textContent,'Enter fullscreen');assert.equal(h.button.disabled,false);
 const unsupported=harness(false);unsupported.api.updateFullscreenUI();assert.equal(unsupported.button.disabled,true);assert.match(unsupported.status.textContent,/unavailable/);
});
test('fullscreen rejection releases pending state and external exit clears controls without reentry',async()=>{
 const h=harness();h.setReject(true);await h.api.toggleFullscreen();assert.equal(h.button.disabled,false);assert.match(h.status.textContent,/could not change/);
 h.setReject(false);await h.api.toggleFullscreen();h.doc.fullscreenElement=null;h.listeners.get('fullscreenchange')!();assert.equal(h.button.textContent,'Enter fullscreen');assert.equal(h.counts().entries,2);assert.ok(h.counts().resizes>=2);
 h.listeners.get('fullscreenerror')!();assert.match(h.status.textContent,/not allowed/);assert.equal(h.button.disabled,false);
});
