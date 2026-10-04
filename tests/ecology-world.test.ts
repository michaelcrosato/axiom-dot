import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createState,createConnectedState,enableEcology,enableEconomy,applyAction,worldObjects,worldEndpoints,activeObjects,dungeonSpawn,validateSave,serializeSave,parseSave,type State} from '../src/world.ts';
import {ecologyPlan,ecologyStage,ecologyWaterBalance,type EcologyCommand} from '../src/ecology.ts';
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
type Input=EcologyCommand extends infer C?C extends EcologyCommand?Omit<C,'expectedRevision'>:never:never;
function act(s:State,c:Input){return applyAction(s,{type:'ecology',command:{...c,expectedRevision:s.ecology!.revision} as EcologyCommand});}
function supplied(seed=73129){let s=enableEcology(enableEconomy(createConnectedState(seed)));for(const o of worldObjects(s)){if(['water','scrap','core'].includes(o.kind)){s=applyAction(s,{type:'move',x:o.x,z:o.z});s=applyAction(s,{type:'collect',id:o.id});}if(o.kind==='enemy'){s=applyAction(s,{type:'move',x:o.x,z:o.z});s=applyAction(s,{type:'attack',id:o.id});}}s=applyAction(s,{type:'move',...worldEndpoints(s).entrance});s=applyAction(s,{type:'enter'});for(const o of activeObjects(s))if(['water','scrap','core'].includes(o.kind)){s=applyAction(s,{type:'move',x:o.x,z:o.z});s=applyAction(s,{type:'collect',id:o.id});}s=applyAction(s,{type:'move',...dungeonSpawn(s)});s=applyAction(s,{type:'exit'});return s;}
function bed(s:State){return ecologyPlan(s.seed).plots[0]!;}
function near(s:State){return applyAction(s,{type:'move',...bed(s).position});}
function grown(s:State){let n=0;while(ecologyStage(s.ecology!.plots[0]!.crop)!=='ripe'&&n++<3600)s=applyAction(s,{type:'tick',dt:.25});assert.ok(n<3600);return s;}
function crop(s:State){s=near(s);s=act(s,{type:'plant',plotId:bed(s).id,species:bed(s).habitat==='sunny'?'sunleaf':'reedmoss'});return grown(s);}
function saved(s:State){assert.equal(validateSave(s),true);const p=parseSave(serializeSave(s));assert.ok(p);assert.deepEqual(p.ecology,s.ecology);assert.equal(ecologyWaterBalance(s.ecology!),0);return p;}

test('garden water is paid from actual canonical caches and survives both founding restoration payment paths',()=>{
 for(const seed of [0,1,73129,0xffffffff])for(const payment of ['repair','deliver'] as const){let s=supplied(seed);const total=s.inventory.water;s=near(s);s=act(s,{type:'water',plotId:bed(s).id});assert.equal(s.inventory.water,total-1);assert.equal(s.ecology!.water.irrigation,4000);s=saved(s);const target=payment==='repair'?worldEndpoints(s).pump:worldEndpoints(s).settlement;s=applyAction(s,{type:'move',...target});s=applyAction(s,{type:payment});assert.equal(s.waterRestored,true);s=saved(s);const forged=clone(s);forged.inventory.water++;assert.equal(validateSave(forged),false);}
});

test('one and three whole integrated ecology loops atomically spend, grow, harvest, craft and repair',()=>{
 for(const count of [1,3]){let s=supplied();s={...s,player:{...s.player,hp:37.25}};for(let i=0;i<count;i++){s=crop(s);s=act(s,{type:'harvest',plotId:bed(s).id});s=act(s,{type:'craft-gel'});const rev=s.ecology!.revision,hp=s.player.hp;s=act(s,{type:'use-gel'});assert.equal(s.player.hp,hp+20);assert.equal(applyAction(s,{type:'ecology',command:{type:'use-gel',expectedRevision:rev}}),s);s=saved(s);}assert.equal(s.ecology!.harvested,count);assert.equal(s.ecology!.used,count);assert.equal(s.ecology!.restoredHP,count*20);assert.equal(s.player.hp,37.25+20*count);}
});

test('partial suit repair underground consumes exactly one gel and cannot resurrect or overfill',()=>{
 let s=crop(supplied());s=act(s,{type:'harvest',plotId:bed(s).id});s=act(s,{type:'craft-gel'});const full=s;assert.equal(act(full,{type:'use-gel'}),full);s=applyAction(s,{type:'move',...worldEndpoints(s).entrance});s=applyAction(s,{type:'enter-cave'});s={...s,player:{...s.player,hp:98.75}};s=act(s,{type:'use-gel'});assert.equal(s.player.hp,100);assert.equal(s.ecology!.restoredHP,1.25);saved(s);const dead={...s,player:{...s.player,hp:0}};assert.equal(act(dead,{type:'use-gel'}),dead);
});

test('ordinary time advances ecology across zones, freezes when dead, and rejects invalid elapsed time',()=>{
 let s=supplied();s=applyAction(s,{type:'move',...worldEndpoints(s).entrance});s=applyAction(s,{type:'enter-cave'});const t=s.ecology!.tick;s=applyAction(s,{type:'tick',dt:1});assert.equal(s.ecology!.tick,t+4);saved(s);const dead={...s,player:{...s.player,hp:0}};assert.equal(applyAction(dead,{type:'tick',dt:1}),dead);for(const dt of [NaN,Infinity,-1,0])assert.equal(applyAction(s,{type:'tick',dt}),s);
 const before=s.ecology!.tick;s=applyAction(s,{type:'tick',dt:100_000});assert.equal(s.ecology!.tick,before+4,'bounded active catch-up, not offline farming');saved(s);
});

test('legacy optional migration starts once at zero, never erases malformed present state or changes foundations',()=>{
 const legacy=createState(17);assert.equal(enableEcology(legacy),legacy);const original=createConnectedState(73129),bytes=serializeSave(original),loaded=parseSave(bytes)!;assert.equal(loaded.ecology,undefined);const enabled=enableEcology(loaded);assert.equal(enabled.ecology!.tick,0);assert.equal(enabled.ecology!.seeds,12);assert.deepEqual(enabled.generationManifest,original.generationManifest);assert.deepEqual(worldObjects(enabled),worldObjects(original));assert.equal(enableEcology(enabled),enabled);saved(enabled);
 for(const value of [null,{},false,{...enabled.ecology,seeds:13}]){const malformed={...enabled,ecology:value} as unknown as State;assert.equal(enableEcology(malformed),malformed);assert.equal(validateSave(malformed),false);assert.equal(parseSave(JSON.stringify(malformed)),null);}
 const old={...legacy,ecology:enabled.ecology};assert.equal(validateSave(old),false);
});

test('command revision is independent of simulation and forbids duplicate shared material outcomes',()=>{
 let s=near(supplied());const c:EcologyCommand={type:'water',plotId:bed(s).id,expectedRevision:s.ecology!.revision};s=applyAction(s,{type:'tick',dt:.25});const before=s.inventory.water;s=applyAction(s,{type:'ecology',command:c});assert.equal(s.inventory.water,before-1);s=applyAction(s,{type:'tick',dt:.25});assert.equal(applyAction(s,{type:'ecology',command:c}),s);saved(s);
});

test('game adapter exposes real garden interactions, snapshot rendering, map and save checkpoint hooks',()=>{
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');for(const piece of ['createEcologyView(state.seed)',"kind:'garden'","openPanel('ecology')",'gardenView?.sync(state.ecology)',"type:'ecology',command",'lastSavedEcology=state.ecology',"panel.dataset.type==='ecology'",'getEcologySnapshot'])assert.ok(main.includes(piece),piece);assert.ok(main.includes('continuesInMenus:coop.active'));
});
