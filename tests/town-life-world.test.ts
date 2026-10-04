import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRegionalState,createConnectedState,enableStartingTown,applyAction,commitTownLife,parseSave,serializeSave,validateSave,type State} from '../src/world.ts';
import {createTownLife,advanceTownLife,townLifeFacilities,validTownLife,townLifeCommandPosition,type TownLifeCommand} from '../src/town-life.ts';
import {startingTown} from '../src/starting-town.ts';
import {storeSession,saveKey,preTownLifeKey,preTownLifeSave,type SaveStorage} from '../src/session.ts';
import {townLifePoses,townLifeInteractionTarget} from '../src/town-life-runtime.ts';
import {TownCrowd} from '../src/town-crowd.ts';
import {townLifeDialogue,townLifeSituation} from '../src/town-life-dialogue.ts';
import {CONVERSATION_ENGINE} from '../src/npc-conversation.ts';
import {townResidents} from '../src/town-residents.ts';
import {createTownLifeView} from '../src/town-life-view.ts';
import {action} from '../server/coop-validation.ts';
import {createRoom,syncRoom,advanceRoom,snapshot} from '../server/coop-authority.ts';
const seed=73129;
function stocked(){let s=createRegionalState(seed);s={...s,player:{...s.player,...startingTown(seed).shops[0]!.entry}};s=applyAction(s,{type:'town-purchase',command:{offerId:'arrival-kit',expectedRevision:0}});return enableStartingTown(s);}
function donation(s:State):TownLifeCommand{return {kind:'donate-water',targetId:'well',expectedRevision:s.townLife!.revision};}
const atWell=(s:State):State=>{const f=townLifeFacilities(s.seed).find(f=>f.id==='well')!;return {...s,player:{x:f.x,z:f.z,hp:s.player.hp}};};
function storage(){const data=new Map<string,string>();const api:SaveStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},get length(){return data.size;},key:i=>[...data.keys()][i]??null};return {data,api};}

test('town life upgrade is additive, starts now and preserves exact earlier save bytes',()=>{
 const old=createRegionalState(seed),bytes=serializeSave(old),{api,data}=storage();storeSession(api,old,true);
 const upgraded=enableStartingTown(old);assert.equal(upgraded.town,old.town);assert.equal(upgraded.player,old.player);assert.equal(upgraded.causal,old.causal);assert.equal(upgraded.townLife!.tick,0);assert.equal(enableStartingTown(upgraded),upgraded);assert.equal(enableStartingTown(createConnectedState(seed)).townLife,undefined);
 assert.deepEqual(parseSave(bytes),old);assert.deepEqual(parseSave(serializeSave(upgraded)),upgraded);storeSession(api,upgraded);assert.equal(data.get(preTownLifeKey(old)),bytes);assert.equal(preTownLifeSave(api,old),bytes);const again=applyAction(upgraded,{type:'tick',dt:.5});storeSession(api,again);assert.equal(preTownLifeSave(api,old),bytes);
});
test('town life failed rollback preservation refuses save without corrupting ordinary slot',()=>{
 const {api,data}=storage(),old=createRegionalState(seed);storeSession(api,old);const before=data.get(saveKey(old));data.set(preTownLifeKey(old),'invalid earlier checkpoint');assert.throws(()=>storeSession(api,enableStartingTown(old)),/Town-life rollback/);assert.equal(data.get(saveKey(old)),before);
});
test('town contributions are finite exact campaign spending and survive save reload',()=>{
 const before=atWell(stocked()),command=donation(before),next=applyAction(before,{type:'town-life',command});assert.notEqual(next,before);assert.equal(next.inventory.water,before.inventory.water-1);assert.equal(next.townLife!.playerSpent.water,1);assert.equal(next.townLife!.revision,1);assert(validateSave(next));assert.deepEqual(parseSave(serializeSave(next)),next);
 assert.equal(applyAction(next,{type:'town-life',command}),next);assert.equal(applyAction(next,{type:'town-life',command:donation(next)}),next);assert(!validateSave({...next,inventory:{...next.inventory,water:next.inventory.water+1}}));
});
test('town life rejects malformed save identity and intervention fields without silent resets',()=>{
 const s=stocked(),life=s.townLife!;for(const value of [null,{},undefined,{...life,seed:seed+1},{...life,extra:true},{...life,residents:[...life.residents].reverse()}])assert(!validateSave({...s,townLife:value}));
 const valid={type:'town-life',command:donation(s)};assert.deepEqual(action(valid),valid);for(const bad of [{...valid,position:{x:0,z:0}},{type:'town-life',command:{...valid.command,authorityPosition:{x:0,z:0}}},{type:'town-life',command:{...valid.command,expectedRevision:NaN}},{type:'town-life',command:{...valid.command,kind:'reset-town'}}])assert.equal(action(bad),null);
});
test('town needs advance only through accepted active-play ticks and projection caches residents',()=>{
 const s=stocked(),before=JSON.stringify(s.townLife),small=applyAction(s,{type:'tick',dt:1/60});assert.equal(small.townLife!.residents,s.townLife!.residents);assert.equal(townLifePoses(small.townLife),townLifePoses(s.townLife));assert.equal(applyAction(s,{type:'tick',dt:NaN}),s);assert.equal(applyAction({...s,player:{...s.player,hp:0}},{type:'tick',dt:.5}).townLife,s.townLife);
 const next=applyAction(s,{type:'tick',dt:.5});assert.notEqual(next.townLife!.residents,s.townLife!.residents);assert.equal(next.townLife!.tick,s.townLife!.tick+1);assert.equal(next.townLife!.revision,s.townLife!.revision);assert.equal(JSON.stringify(s.townLife),before);assert(validTownLife(next.townLife,seed));
});
test('town resident intervention uses exact actor-adjusted collision target without touching route state',()=>{
 const life=createTownLife(seed),r=life.residents[0]!,command:TownLifeCommand={kind:'encourage-resident',targetId:r.id,expectedRevision:0},actors=[{id:'solo',x:r.x,z:r.z,feetY:6}],before=JSON.stringify(life),expected=new TownCrowd(seed).sample(0,100,1,actors,townLifePoses(life))[0]!,target=townLifeInteractionTarget(life,command,actors)!;
 assert.deepEqual(target,{x:expected.x,z:expected.z});assert.equal(JSON.stringify(life),before);assert.deepEqual(townLifeInteractionTarget(life,{kind:'donate-water',targetId:'well',expectedRevision:0},actors),townLifeCommandPosition(life,{kind:'donate-water',targetId:'well',expectedRevision:0}));
 const s={...enableStartingTown(createRegionalState(seed)),townLife:life,player:{x:target.x,z:target.z,hp:100}};const changed=commitTownLife(s,command,actors);assert.notEqual(changed,s);assert.deepEqual(changed.inventory,s.inventory);assert.equal(changed.townLife!.residents[0]!.x,r.x);assert.equal(changed.townLife!.residents[0]!.z,r.z);assert.equal(commitTownLife(changed,{...command,expectedRevision:changed.townLife!.revision},actors),changed);
});
test('town co-op accepts intervention snapshot revision across autonomous tick and replays exactly once',()=>{
 const world=atWell(stocked()),room=createRoom('host','Host',world,1000),host=room.players[0]!,command=donation(room.world),input={seq:1,sessionId:host.sessionId,actions:[{type:'town-life' as const,command}]};
 syncRoom(room,'host',input,1500);assert.equal(room.world.townLife!.revision,1);assert.equal(room.world.townLife!.playerSpent.water,1);assert(room.world.townLife!.tick>0);const bytes=JSON.stringify(room.world.townLife);syncRoom(room,'host',input,1500);assert.equal(JSON.stringify(room.world.townLife),bytes);assert.deepEqual(snapshot(room,'host',1500).world.townLife,room.world.townLife);
 const tick=room.world.townLife!.tick;advanceRoom(room,100000);assert.equal(room.world.townLife!.tick,tick);assert(validateSave(room.world));
});
test('live conversation motives replace timetable assumptions but retain every original subject and identity',()=>{
 const life=createTownLife(seed),context=townLifeDialogue(life,0),roster=townResidents(seed),profile=CONVERSATION_ENGINE.townProfile(roster[0]!,roster),live={seed,elapsed:440,life:context};let state=CONVERSATION_ENGINE.open(profile,live,CONVERSATION_ENGINE.createMemory(seed));const greeting=CONVERSATION_ENGINE.view(profile,live,state.session,state.memory);assert(greeting.line.includes(context.present));assert.equal(greeting.choices.length,8);
 for(const [topic,text] of [['day',context.present],['town',context.town],['hopes',context.desire]] as const){state={...state,session:CONVERSATION_ENGINE.back(state.session)};state=CONVERSATION_ENGINE.choose(profile,live,state.session,state.memory,'topic:'+topic);assert(CONVERSATION_ENGINE.view(profile,live,state.session,state.memory).line.includes(text));}assert(roster[0]!.backstory.includes(profile.history.replace(/^I /,'').replace(/\.$/,'')));assert.equal(profile.id,roster[0]!.id);const shortage=structuredClone(life);shortage.resources.materials=0;assert.match(townLifeSituation(shortage).detail,/Contribute scrap/);shortage.facilities[40]!.condition=0;assert.match(townLifeSituation(shortage).title,/service needs help/);assert.equal(life.resources.materials,120);
});
test('life service geometry follows exact model facilities, confirmed chunks and availability with bounded resources',()=>{
 const life=createTownLife(seed),view=createTownLifeView(seed);assert.equal(view.facilities.length,48);assert.equal(view.root.children.length,2);view.update(life,()=>false,true);assert.equal(view.stats.visibleFacilities,0);assert.equal(view.stats.instances,0);view.update(life,()=>true,true);assert.equal(view.stats.visibleFacilities,48);assert(view.stats.instances<=140);view.update(life,()=>true,false);assert.equal(view.root.visible,false);view.dispose();
});
test('life UI routes retain solo-only disposable gate, physics authority, cleanup and immersive help choices',()=>{
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');assert.match(main,/\['dev','worlds','restart','recover','town-lab','conversation-lab','town-life-lab'\]/);assert.match(main,/townLifeView\?\.dispose\(\)/);assert.match(main,/townLifePoses\(state\.townLife\)/);assert.match(main,/town-life:encourage/);assert.match(main,/town-life:inspect/);assert.match(main,/if\(action.type==='town-life'\).*clearPulsePath/);assert.match(main,/commitTownLife\(state,action.command,townActors\(\)\)/);assert.match(main,/townLifeDialogue\(state.townLife,lifeIndex\)/);assert.match(main,/town-life-service/);assert.match(main,/state.townLife!==lastSavedTownLife/);assert.match(main,/syncFrontierVisuals\(coop.active\?\(document.hidden\|\|!windowActive\|\|coop.snapshot\?\.paused\|\|coop.snapshot\?\.closed\?0:townFrameSeconds\(rawFrameMs\)\):blocked\?0:townFrameSeconds\(rawFrameMs\)\)/);
});
