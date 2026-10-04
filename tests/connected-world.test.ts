import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createState,createConnectedState,applyAction,worldObjects,activeObjects,worldEndpoints,machineWorldObstacles,serializeSave,parseSave,validateSave,type State} from '../src/world.ts';
import {worldValley,worldDungeon,buildOrigin,buildPlayer,GENERATION_MANIFEST,CONNECTED_GENERATION_MANIFEST} from '../src/generation.ts';
import {CellStreamer} from '../src/streaming.ts';
import {loadSession,storeSession,loadSavedWorld,saveKey,selectSeed,savedWorlds,sameWorld,ACTIVE_WORLD_KEY,LEGACY_SAVE_KEY} from '../src/session.ts';
class MemoryStorage {data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}get length(){return this.data.size;}key(i:number){return [...this.data.keys()][i]??null;}}
function collectAll(s:State){for(const o of activeObjects(s)){if(!['scrap','core','water'].includes(o.kind))continue;s=applyAction(s,{type:'move',x:o.x,z:o.z});s=applyAction(s,{type:'collect',id:o.id});}return s;}
test('generation 2 consumes the exact immutable plan and pins legacy manifest',()=>{
 assert.equal(GENERATION_MANIFEST.contentHash,'16ba1973');const old=createState(73129),s=createConnectedState(73129),plan=worldValley(s.seed);
 assert.equal(old.generation,1);assert.equal(s.generation,2);assert.equal(s.generationManifest,CONNECTED_GENERATION_MANIFEST);assert.equal(worldObjects(s),plan.objects);assert.equal(activeObjects(s),plan.objects);
 assert.deepEqual({x:s.player.x,z:s.player.z},{x:plan.endpoints.spawn.x,z:plan.endpoints.spawn.z});assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(plan.terrain.vertices));
 assert.equal(validateSave({...s,generationManifest:GENERATION_MANIFEST}),false);assert.equal(validateSave({...old,generationManifest:CONNECTED_GENERATION_MANIFEST}),false);
 assert.equal(parseSave(JSON.stringify({...s,generationManifest:{...s.generationManifest,contentHash:'invalid'}})),null);
});
test('all generated resources validate against plan totals across zones and exact quest payments',()=>{
 for(const seed of [0,1,606,73129,4294967295]){let s=collectAll(createConnectedState(seed));const ep=worldEndpoints(s);s=applyAction(s,{type:'move',...ep.entrance});s=applyAction(s,{type:'enter'});assert.equal(s.zone,'dungeon');s=collectAll(s);
  const totals={scrap:0,core:0,water:0};for(const o of [...worldObjects(s),...worldDungeon(s).objects])if(o.kind==='scrap'||o.kind==='core'||o.kind==='water')totals[o.kind]++;
  assert.deepEqual(s.inventory,totals);assert.ok(validateSave(s));const loaded=parseSave(serializeSave(s))!;assert.deepEqual(loaded.inventory,totals);assert.deepEqual(loaded.collected,s.collected);
  s=applyAction(s,{type:'move',...worldDungeon(s).spawn});s=applyAction(s,{type:'exit'});assert.equal(s.zone,'valley');s=applyAction(s,{type:'move',...ep.pump});s=applyAction(s,{type:'repair'});assert.equal(s.waterRestored,true);assert.ok(validateSave(s));assert.equal(s.inventory.scrap,totals.scrap-3);
 }
});
test('generated waterworks uses local recipe cells with world-space proximity and collider elevation',()=>{
 let s=collectAll(createConnectedState(5)),origin=buildOrigin(s);s=applyAction(s,{type:'move',x:origin.x-12,z:origin.z+3});assert.deepEqual(buildPlayer(s),{x:-12,z:3});
 s=applyAction(s,{type:'build',command:{type:'place',kind:'pump',x:-5,z:6}});assert.equal(s.waterworks.parts.length,1);const part=s.waterworks.parts[0]!;assert.equal(part.x,-5);assert.equal(part.z,6);
 const boxes=machineWorldObstacles(s);assert.ok(boxes.every(o=>o.y===o.hy+origin.y));assert.ok(boxes.some(o=>o.x===origin.x-5&&o.z===origin.z+6));assert.ok(validateSave(s));assert.ok(parseSave(serializeSave(s)));
});
test('separate seed slots and backup recovery never replace the legacy foundation',()=>{
 const storage=new MemoryStorage(),legacy=createState(73129);storage.setItem(LEGACY_SAVE_KEY,serializeSave(legacy));storeSession(storage,legacy,true);const legacyBytes=storage.getItem(LEGACY_SAVE_KEY);assert.equal(loadSession(storage).generation,1);
 let a=createConnectedState(41),o=worldObjects(a).find(o=>o.kind==='scrap')!;a=applyAction(a,{type:'move',x:o.x,z:o.z});a=applyAction(a,{type:'collect',id:o.id});storeSession(storage,a,true);
 const b=selectSeed(storage,42);storeSession(storage,b,true);assert.equal(loadSession(storage).seed,42);assert.equal(storage.getItem(LEGACY_SAVE_KEY),legacyBytes);assert.deepEqual(selectSeed(storage,41).collected,[o.id]);assert.equal(savedWorlds(storage).length,3);assert.equal(sameWorld(legacy,createConnectedState(73129)),false);
 storeSession(storage,a,true);storage.setItem(saveKey(a),'{broken');assert.deepEqual(loadSession(storage).collected,[o.id]);storage.setItem(ACTIVE_WORLD_KEY,'invalid-key');assert.equal(loadSession(storage).generation,1);
});
test('generated tombstones survive cell eviction, save restore and reordered plan loads',()=>{
 let s=createConnectedState(29);const o=worldObjects(s).find(o=>o.kind==='scrap')!,streamer=new CellStreamer(worldObjects(s));streamer.update(o.x,o.z,s);s=applyAction(s,{type:'move',x:o.x,z:o.z});s=applyAction(s,{type:'collect',id:o.id});
 const bytes=serializeSave(s);for(const seed of [5,71,1,0,999])worldValley(seed);s=parseSave(bytes)!;streamer.update(80,80,s,0);const d=streamer.update(o.x,o.z,s,0);assert.ok(d.loaded.some(c=>c.content.includes(`"${o.id}",true`)));assert.equal(applyAction(s,{type:'collect',id:o.id}),s);
});
test('runtime session and geometry adapters consume generated terrain and reset before seed replacement',()=>{
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');assert.match(main,/Float32BufferAttribute\(t.vertices,3\)/);assert.match(main,/g.setIndex\(t.indices\)/);assert.match(main,/terrain:valleyPlan.terrain/);assert.match(main,/machineWorldObstacles\(state\)/);
 const reload=main.slice(main.indexOf('function reloadCommittedSession('),main.indexOf("addEventListener('pageshow',(event:PageTransitionEvent)"));
 assert.match(reload,/sessionReloading=true;clearInput\(\);[\s\S]*?transitioning=true;physicsReady=false;zoneEpoch\+\+/);assert.match(reload,/worker.terminate\(\);renderer\?\.setAnimationLoop\(null\)/);assert.ok(reload.indexOf('worker.terminate()')<reload.lastIndexOf('location.reload()'),'old workers stop before a new foundation loads');
 const switching=main.slice(main.indexOf('function switchSession('),main.indexOf('function reloadCommittedSession('));assert.match(switching,/if\(sameWorld\(state,next\)\)\{closePanel\(\);[\s\S]*?return;\}/);assert.match(switching,/if\(!persist\(false\)\)return;try\{const targetRevision=sessionResetRevision\(localStorage,next\),target=replaceImported\?next:loadSavedWorld\(localStorage,next\)\?\?next;storeSession\(localStorage,target,true,targetRevision\);reloadCommittedSession\(\)/);assert.match(main,/New world \/ choose seed/);assert.match(main,/cameraTarget.y\+=1/);assert.match(main,/g.position.set\(obj.x,obj.y\?\?0,obj.z\)/);
});
test('failed destination writes leave the active saved world intact',()=>{
 const storage=new MemoryStorage(),old=createState(73129);storage.setItem(LEGACY_SAVE_KEY,serializeSave(old));storeSession(storage,old,true);const active=storage.getItem(ACTIVE_WORLD_KEY),oldBytes=storage.getItem(LEGACY_SAVE_KEY),next=createConnectedState(44);
 const throwing={getItem:(k:string)=>storage.getItem(k),setItem:(k:string,v:string)=>{if(k===saveKey(next))throw new Error('Quota exceeded');storage.setItem(k,v);}};
 assert.throws(()=>storeSession(throwing,next,true),/Quota/);assert.equal(storage.getItem(ACTIVE_WORLD_KEY),active);assert.equal(storage.getItem(LEGACY_SAVE_KEY),oldBytes);assert.equal(loadSession(storage).generation,1);
});
test('opening imported legacy seeds isolates them and retains the original v1 key bytes',()=>{
 const storage=new MemoryStorage(),original=createState(73129);storage.setItem(LEGACY_SAVE_KEY,serializeSave(original));const bytes=storage.getItem(LEGACY_SAVE_KEY);const other=createState(5);storeSession(storage,other,true);
 assert.equal(storage.getItem(LEGACY_SAVE_KEY),bytes);assert.equal(loadSession(storage).seed,5);assert.equal(loadSession(storage).generation,1);assert.equal(savedWorlds(storage).length,2);
});
test('missing active pointer recovers existing seeded progress instead of creating an empty overwrite',()=>{
 const storage=new MemoryStorage();let s=collectAll(createConnectedState(73129));storeSession(storage,s);assert.deepEqual(loadSession(storage).collected,s.collected);
 const legacy=createState(73129);storage.setItem(LEGACY_SAVE_KEY,serializeSave(legacy));let advanced=applyAction(legacy,{type:'move',x:-9,z:8});advanced=applyAction(advanced,{type:'collect',id:'scrap-1'});storeSession(storage,advanced);storage.setItem(ACTIVE_WORLD_KEY,'bad-key');assert.deepEqual(loadSession(storage).collected,['scrap-1']);
});
test('load-last-save resolves a matching untouched legacy alias before the first new write',()=>{
 const storage=new MemoryStorage(),legacy=createState(73129);storage.setItem(LEGACY_SAVE_KEY,serializeSave(legacy));const state=loadSession(storage);assert.deepEqual(loadSavedWorld(storage,state),legacy);assert.equal(loadSavedWorld(storage,createState(41)),null);
});
test('proximity threats measure generated support elevation as well as horizontal distance',async()=>{
 const {worldHeight}=await import('../src/generation.ts');let s=createConnectedState(0);const enemy=worldObjects(s).find(o=>o.kind==='enemy')!;let candidate:{x:number;z:number}|undefined;
 for(let angle=0;angle<Math.PI*2;angle+=.05){const p={x:enemy.x+Math.cos(angle)*4.99,z:enemy.z+Math.sin(angle)*4.99};if(Math.hypot(p.x-enemy.x,p.z-enemy.z,worldHeight(s,p.x,p.z)-(enemy.y??0))>5.01){candidate=p;break;}}
 assert.ok(candidate);s=applyAction(s,{type:'move',...candidate});assert.equal(applyAction(s,{type:'tick',dt:1}).player.hp,100);
});
