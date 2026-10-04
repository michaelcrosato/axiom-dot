import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegionalState,createConnectedState,enableStartingTown,applyAction,parseSave,serializeSave,validateSave,type State} from '../src/world.ts';
import {createTownLifeScenario,townLifeFacilities} from '../src/town-life.ts';
import {createTownDirector,townDirectorInteractionPosition,type TownDirectorCommand} from '../src/town-director.ts';
import {startingTown} from '../src/starting-town.ts';
import {storeSession,saveKey,preProceduralKey,preProceduralSave,type SaveStorage} from '../src/session.ts';
import {action} from '../server/coop-validation.ts';
import {createRoom,syncRoom,advanceRoom} from '../server/coop-authority.ts';
const seed=73129;
function fixture(){let s=createRegionalState(seed);s={...s,player:{...s.player,...startingTown(seed).shops[0]!.entry}};s=applyAction(s,{type:'town-purchase',command:{offerId:'arrival-kit',expectedRevision:0}});const townLife=createTownLifeScenario(seed,'lean-stores');s={...s,townLife,townDirector:createTownDirector(townLife)};const e=s.townDirector!.episodes.find(e=>e.kind==='material-shortage')!,p=townDirectorInteractionPosition(s.townDirector!,e.id)!;return {s:{...s,player:{...s.player,...p}},episode:e};}
function accept(s:State,id:string):TownDirectorCommand{return {kind:'accept',episodeId:id,expectedRevision:s.townDirector!.revision,expectedLifeRevision:s.townLife!.revision};}
test('director world upgrade preserves life, ordinary progress and exact pre-pack save bytes',()=>{
 const base=enableStartingTown(createRegionalState(seed));const {townDirector:_,...old}=base;const bytes=serializeSave(old),data=new Map<string,string>(),api:SaveStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}};
 storeSession(api,old,true);const next=enableStartingTown(old);assert.equal(next.townLife,old.townLife);assert.deepEqual(next.inventory,old.inventory);assert.equal(enableStartingTown(next),next);assert.equal(enableStartingTown(createConnectedState(seed)).townDirector,undefined);storeSession(api,next);assert.equal(data.get(preProceduralKey(old)),bytes);assert.equal(preProceduralSave(api,old),bytes);assert.deepEqual(parseSave(serializeSave(next)),next);
 data.set(preProceduralKey(old),'broken');const slot=data.get(saveKey(old));assert.throws(()=>storeSession(api,next),/Procedural rollback/);assert.equal(data.get(saveKey(old)),slot);
});
test('accepted material request uses real local spending and records exactly one completed outcome',()=>{
 const {s,episode}=fixture(),c=accept(s,episode.id),accepted=applyAction(s,{type:'town-director',command:c});assert.notEqual(accepted,s);assert.deepEqual(accepted.inventory,s.inventory);assert.equal(accepted.townLife,s.townLife);assert.equal(applyAction(accepted,{type:'town-director',command:c}),accepted);
 const next=applyAction(accepted,{type:'town-life',command:{kind:'donate-supplies',targetId:'workshop',expectedRevision:accepted.townLife!.revision}});assert.equal(next.inventory.scrap,s.inventory.scrap-2);assert.equal(next.townLife!.resources.materials,16);assert.equal(next.townDirector!.episodes.find(e=>e.id===episode.id)!.status,'completed');assert(validateSave(next));assert.deepEqual(parseSave(serializeSave(next)),next);
 assert(!validateSave({...next,inventory:{...next.inventory,scrap:next.inventory.scrap+1}}));assert.equal(next.causal!.renown,s.causal!.renown,'director mints no renown');
});
test('director world validation rejects missing life, forged tuning, state and command fields',()=>{
 const {s,episode}=fixture(),command=accept(s,episode.id);assert.deepEqual(action({type:'town-director',command}),{type:'town-director',command});assert.equal(action({type:'town-director',command:{...command,reward:2}}),null);assert.equal(action({type:'town-director',command,player:{x:0,z:0}}),null);
 const {townLife:_,...without}=s;assert(!validateSave(without));assert(!validateSave({...s,townDirector:{...s.townDirector,tuning:{...s.townDirector!.tuning,maxActive:1}}}));assert(!validateSave({...s,townDirector:{...s.townDirector,extra:1}}));assert.equal(applyAction({...s,zone:'cave'},{type:'town-director',command}).townDirector,s.townDirector);
});
test('coarse authoritative polls and half-second town boundaries produce the same director facts',()=>{
 let one=fixture().s,split=one;for(let n=0;n<90;n++){one=applyAction(one,{type:'tick',dt:1});split=applyAction(applyAction(split,{type:'tick',dt:.5}),{type:'tick',dt:.5});}assert.deepEqual(one.townLife,split.townLife);assert.deepEqual(one.townDirector,split.townDirector);assert(validateSave(one));
 const dead={...one,player:{...one.player,hp:0}};assert.equal(applyAction(dead,{type:'tick',dt:.5}),dead);
});
test('co-op owns shared request acceptance and contribution without duplicate packets or offline progress',()=>{
 const {s,episode}=fixture(),room=createRoom('director-host','Host',s,1000),host=room.players[0]!,command=accept(room.world,episode.id);
 const input={seq:1,sessionId:host.sessionId,actions:[{type:'town-director' as const,command}]};syncRoom(room,'director-host',input,1000);const accepted=JSON.stringify(room.world.townDirector);syncRoom(room,'director-host',input,1000);assert.equal(JSON.stringify(room.world.townDirector),accepted);
 syncRoom(room,'director-host',{seq:2,sessionId:host.sessionId,actions:[{type:'town-life',command:{kind:'donate-supplies',targetId:'workshop',expectedRevision:room.world.townLife!.revision}}]},1000);assert.equal(room.world.townDirector!.episodes.find(e=>e.id===episode.id)!.status,'completed');assert.equal(room.world.townLife!.playerSpent.scrap,2);assert(validateSave(room.world));const before=JSON.stringify(room.world.townDirector);advanceRoom(room,100000);assert.equal(JSON.stringify(room.world.townDirector),before);
});
