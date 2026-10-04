import {TOWN_SPAWN} from '../src/starting-town.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createConnectedState,createRegionalState,applyAction,commitWildernessGather,parseSave,serializeSave,validateSave,worldBound,worldObjects,worldEndpoints,wildernessGatherContext,type State} from '../src/world.ts';
import {worldHeight,CONNECTED_GENERATION_MANIFEST} from '../src/generation.ts';
import {REGION_AREA,REGION_BOUND,regionalFeaturesNear,regionalFeatureById,regionalHeight,REGIONAL_MAX_FEATURES} from '../src/regional-world.ts';
import {wildernessFeatures,wildernessFeaturesNear,wildernessFeatureById,wildernessObstaclesNear} from '../src/wilderness.ts';
import {canGatherWilderness,validWildernessState,wildernessResourceLimits} from '../src/wilderness-state.ts';
import {saveKey,sameWorld,loadSession,loadSavedWorld,savedWorlds,storeSession,selectSeed,selectRegionalSeed,ACTIVE_WORLD_KEY} from '../src/session.ts';
import {startupGenerationHints} from '../src/generation-startup.ts';
class Store {data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}get length(){return this.data.size;}key(i:number){return [...this.data.keys()][i]??null;}}
const at=(s:State,x:number,z:number):State=>({...s,player:{...s.player,x,z}});
function resource(s:State,x=900,z=-900,removable=false){
 for(const f of wildernessFeaturesNear(s,x,z).filter(f=>f.harvestable&&(removable?f.removable:f.kind==='tree')))for(let side=0;side<16;side++){
  const near=at(s,f.x+Math.cos(side*Math.PI/8)*1.3,f.z+Math.sin(side*Math.PI/8)*1.3);
  if(canGatherWilderness(wildernessGatherContext(near),f.id))return {feature:f,state:near};
 }
 throw new Error('Missing reachable regional resource fixture');
}

test('regional flavor has a real 10 km² bound but preserves the generation-2 core identity, terrain and economy',()=>{
 const connected=createConnectedState(73129),regional=createRegionalState(73129);
 assert(Math.abs((worldBound(regional)*2)**2-REGION_AREA)<1e-8);assert.equal(worldBound(connected),80);assert.equal(worldBound(createState()),48);
 assert.equal(regional.generation,2);assert.equal(regional.generationManifest,CONNECTED_GENERATION_MANIFEST);assert.deepEqual(regional.player,{x:TOWN_SPAWN.x,z:TOWN_SPAWN.z,hp:100});assert.notDeepEqual(regional.player,connected.player);
 assert.deepEqual(worldObjects(regional),worldObjects(connected));assert.deepEqual(worldEndpoints(regional),worldEndpoints(connected));
 for(const key of ['inventory','collected','defeated','causal','waterworks','settlement','jobs','equipment'] as const)assert.deepEqual(regional[key],connected[key]);
 for(const [x,z]of [[0,0],[70,17],[-79,-61],[30,79]])assert.equal(worldHeight(regional,x!,z!),worldHeight(connected,x!,z!));
 const distant=applyAction(regional,{type:'move',x:1500,z:-1400});assert.equal(distant.player.x,1500);assert.equal(worldHeight(distant,1500,-1400),regionalHeight(distant.seed,1500,-1400));assert(validateSave(distant));
 assert.equal(parseSave(serializeSave(distant))!.player.x,1500);assert.equal(applyAction(regional,{type:'move',x:999999,z:-999999}).player.x,REGION_BOUND);
 assert.notEqual(worldBound({...regional,zone:'dungeon'}),REGION_BOUND);
});

test('new startup chooses regional only when no valid save exists; identical legacy seeds occupy independent slots',()=>{
 const storage=new Store(),fresh=loadSession(storage);assert.deepEqual(fresh.regional,{version:1});assert.equal(storage.length,0);
 const old=createState(73129),valley=createConnectedState(73129);storeSession(storage,old);storeSession(storage,valley);const original=new Map(storage.data);
 assert.equal(loadSession(storage).regional,undefined);
 const region=at(createRegionalState(73129),1000,-1000);storeSession(storage,region,true);
 for(const [key,bytes]of original)assert.equal(storage.getItem(key),bytes);
 assert.equal(saveKey(region),'axiom-save-region1-73129');assert.equal(saveKey(valley),'axiom-save-valley2-73129');assert(!sameWorld(region,valley));assert(sameWorld(region,createRegionalState(73129)));
 assert.equal(savedWorlds(storage).length,3);assert.equal(selectSeed(storage,73129).regional,undefined);assert.equal(selectRegionalSeed(storage,73129).player.x,1000);
 assert.equal(loadSavedWorld(storage,region)?.player.x,1000);assert.deepEqual(loadSession(storage),region);
 storeSession(storage,region,true);storage.setItem(saveKey(region),'broken');assert.deepEqual(loadSession(storage),region,'regional backup stays in the regional slot');
 storage.setItem(ACTIVE_WORLD_KEY,saveKey(valley));assert.equal(loadSession(storage).regional,undefined);
 const backupOnly=new Store();backupOnly.setItem('axiom-save-region1-73129-backup',serializeSave(region));assert.equal(loadSession(backupOnly).player.x,1000);assert.equal(savedWorlds(backupOnly).length,1);
 storage.setItem(saveKey(region),serializeSave(valley));storage.setItem(saveKey(region)+'-backup',serializeSave(valley));assert.equal(loadSavedWorld(storage,region),null,'wrong-flavor payload cannot impersonate a regional slot');
});

test('regional marker and imported world fields are validated strictly without upgrading old foundations',()=>{
 const good=createRegionalState(0);
 for(const marker of [undefined,null,[],{},1,{version:2},{version:1,extra:true},{version:1,[Symbol('hidden')]:true},Object.assign(Object.create({inherited:true}),{version:1})])assert.equal(validateSave({...good,regional:marker}),false);
 assert.equal(validateSave({...createState(0),regional:{version:1}}),false);
 for(const patch of [{player:{x:REGION_BOUND+.001,z:0,hp:100}},{player:{x:0,z:NaN,hp:100}},{inventory:{scrap:100000,core:0,water:0}},{collected:['region:invented']},{generationManifest:{...good.generationManifest,contentHash:'invented'}}])assert.equal(parseSave(JSON.stringify({...good,...patch})),null);
 assert.equal(parseSave(serializeSave(createConnectedState(0)))!.regional,undefined);
});

test('regional startup hint still requests the pinned connected generation, never a replacement manifest',()=>{
 const s=createRegionalState(947),storage=new Store();storeSession(storage,s,true);
 assert.deepEqual(startupGenerationHints(storage),[{generation:2,seed:73129},{generation:2,seed:947}]);
});

test('distant finite resources survive save, chunk-cache eviction, core return and reconnect-style reload',()=>{
 const initial=createRegionalState(73129),near=resource(initial),tree=near.feature;
 let s=commitWildernessGather(near.state,tree.id);assert.equal(s.wilderness?.wood,1);assert.equal(s.wilderness?.stone,0);assert.deepEqual(s.inventory,initial.inventory);
 const rock=resource(s,-1000,800,true);s=commitWildernessGather(rock.state,rock.feature.id);assert.equal(s.wilderness?.stone,1);
 assert.equal(wildernessObstaclesNear(s,rock.feature.x,rock.feature.z,s.wilderness).some(o=>o.featureId===rock.feature.id),false);
 const raw=serializeSave(s);
 for(let i=0;i<160;i++)regionalFeaturesNear(s.seed,-1500+i%40*75,-1400+Math.floor(i/40)*500,0);
 s=parseSave(raw)!;assert(s);assert.equal(commitWildernessGather(s,rock.feature.id),s);
 s=at(s,tree.x-1.3,tree.z);assert.equal(commitWildernessGather(s,tree.id),s);assert(wildernessObstaclesNear(s,tree.x,tree.z,s.wilderness).some(o=>o.featureId===tree.id));
 assert.deepEqual(s.wilderness,{version:1,generation:2,seed:73129,harvested:[tree.id,rock.feature.id],wood:1,stone:1});
 assert.equal(validWildernessState(s.wilderness,createConnectedState(s.seed)),false,'removing the regional marker cannot launder regional resources');
 assert.equal(wildernessFeatures(initial).length,wildernessFeatures(createConnectedState(initial.seed)).length,'the legacy catalog never becomes a full-region list');
});

test('canonical lazy regional source validation rejects cross-seed, nonexistent, duplicate and altered IDs',()=>{
 const near=resource(createRegionalState(73129)),s=commitWildernessGather(near.state,near.feature.id),id=near.feature.id,ledger=s.wilderness!;
 assert.equal(wildernessFeatureById(s,id)?.id,id);assert.equal(regionalFeatureById(s.seed,id)?.id,id);
 const invalid=[id.replace('73129','73130'),id.replace('/feature:','/feature:0'),id.replace(/\/feature:\d+$/,'/feature:44'),id.replace(/\/chunk:-?\d+:-?\d+/,'/chunk:25:0'),id.replace('region:1:','region:2:'),id+'/extra',id+' ',id.replace('/chunk:','/chunk:+'), 'region:1:73129/chunk:0:0/feature:0'];
 for(const bad of invalid){assert.equal(wildernessFeatureById(s,bad),undefined,bad);assert.equal(validateSave({...s,wilderness:{...ledger,harvested:[bad]}}),false,bad);}
 assert.equal(validateSave({...s,wilderness:{...ledger,harvested:[id,id],wood:2}}),false);
 assert.equal(validateSave({...s,wilderness:{...ledger,wood:999999}}),false);
 assert.equal(validateSave({...s,wilderness:{...ledger,stone:1}}),false);
 assert.equal(commitWildernessGather(at(s,0,0),regionalFeaturesNear(s.seed,1200,1200)[0]!.id).wilderness,ledger,'remote request cannot collect a valid distant source');
 const limits=wildernessResourceLimits(s);assert(limits.wood>=1&&limits.wood<=REGIONAL_MAX_FEATURES+1000);assert(limits.stone<=REGIONAL_MAX_FEATURES+1000);
});

test('120 progressively harvested chunks do not replay source generation on live target queries',async t=>{
 const {nearestGatherableWilderness,immutableWildernessState}=await import('../src/wilderness-state.ts');
 const {regionalCacheStats}=await import('../src/regional-world.ts');
 let state=createRegionalState(73129);const sourceChunks=new Set<string>();
 for(let i=0;i<120;i++){
  const found=resource(state,-1400+(i%15)*200,-1400+Math.floor(i/15)*350);
  state=commitWildernessGather(found.state,found.feature.id);sourceChunks.add(found.feature.id.split('/feature:')[0]!);
 }
 assert.equal(state.wilderness?.harvested.length,120);assert.equal(sourceChunks.size,120);assert(sourceChunks.size>regionalCacheStats().maxFeatureChunks);
 state=parseSave(serializeSave(state))!;assert(state);assert(Object.isFrozen(state.wilderness));assert(Object.isFrozen(state.wilderness!.harvested));
 nearestGatherableWilderness(wildernessGatherContext(state));
 const before=regionalCacheStats(),start=performance.now();
 for(let i=0;i<40;i++)nearestGatherableWilderness(wildernessGatherContext(state));
 const elapsed=performance.now()-start,after=regionalCacheStats();
 assert.equal(after.featureCompilations,before.featureCompilations,'unchanged local targeting never regenerates a historical chunk');
 assert(after.featureChunks<=after.maxFeatureChunks);assert(elapsed<1500,`40 local queries took ${elapsed.toFixed(1)}ms`);
 t.diagnostic(`120 source chunks; 40 live queries ${elapsed.toFixed(1)}ms; ${after.featureCompilations-before.featureCompilations} source chunk recompilations`);
 const snapshot=JSON.parse(JSON.stringify(state.wilderness));assert.equal(immutableWildernessState(snapshot,state,state.wilderness),state.wilderness,'unchanged network snapshots reuse a validated immutable ledger');
 assert.throws(()=>state.wilderness!.harvested.push('invented'),TypeError);assert.throws(()=>{state.wilderness!.wood++;},TypeError);
 assert(validWildernessState(snapshot,state));snapshot.wood++;assert.equal(validWildernessState(snapshot,state),false,'mutable caller verdicts cannot be cached');
 assert.throws(()=>immutableWildernessState(snapshot,state,state.wilderness),/Invalid wilderness/);
 const getter=JSON.parse(JSON.stringify(state.wilderness));Object.defineProperty(getter,'wood',{get:()=>120});assert.equal(validWildernessState(getter,state),false);
 const ids=JSON.parse(JSON.stringify(state.wilderness));Object.defineProperty(ids.harvested,'0',{get:()=>state.wilderness!.harvested[0]});assert.equal(validWildernessState(ids,state),false);
});
