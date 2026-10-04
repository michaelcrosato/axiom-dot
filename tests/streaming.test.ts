import {test} from 'node:test';import assert from 'node:assert/strict';
import {CellStreamer,ownerOf,borderId,semanticId} from '../src/streaming.ts';
import {generateObjects,createState,createConnectedState,applyAction,serializeSave,parseSave,commitWildernessGather,wildernessGatherContext,worldObjects} from '../src/world.ts';
import {wildernessFeatures,wildernessFeatureRemaining} from '../src/wilderness.ts';
import {canGatherWilderness} from '../src/wilderness-state.ts';
test('ownership is half-open across zero and negative coordinates; shared borders canonical',()=>{
 assert.equal(ownerOf({x:-.01,z:0}),'-1:0');assert.equal(ownerOf({x:0,z:0}),'0:0');assert.equal(ownerOf({x:16,z:16}),'1:1');
 for(let x=-3;x<3;x++)for(let z=-3;z<3;z++){assert.equal(borderId(x,z,'east'),borderId(x+1,z,'west'));assert.equal(borderId(x,z,'south'),borderId(x,z+1,'north'));}
});
test('deterministic semantic identity and residency independent of traversal order',()=>{
 const s=createState(73129),objects=generateObjects(s.seed),a=new CellStreamer(objects),b=new CellStreamer([...objects].reverse());
 a.update(-40,-40,s,1);a.update(40,40,s,1);b.update(40,40,s,1);
 assert.deepEqual([...a.active.keys()].sort(),[...b.active.keys()].sort());
 assert.equal(semanticId(s.seed,'scrap-1'),'world:1:73129/entity:scrap-1');assert.notEqual(semanticId(1,'scrap-1'),semanticId(2,'scrap-1'));
});
test('eviction releases resident records; reload projects durable tombstones with durable saves',()=>{
 let s=createState(73129);const objects=generateObjects(s.seed),stream=new CellStreamer(objects);const o=objects.find(o=>o.id==='scrap-1')!;
 let d=stream.update(o.x,o.z,s,0);const first=d.loaded.find(c=>c.key===ownerOf(o))!;
 s=applyAction(s,{type:'move',x:o.x,z:o.z});s=applyAction(s,{type:'collect',id:o.id});
 d=stream.update(o.x,o.z,s,0);assert.ok(d.changed.some(c=>c.key===first.key&&c.revision>first.revision));
 d=stream.update(47,-47,s,0);assert.ok(d.unloaded.some(c=>c.key===first.key));assert.equal(stream.active.has(first.key),false);
 s=parseSave(serializeSave(s))!;d=stream.update(o.x,o.z,s,0);const restored=d.loaded.find(c=>c.key===first.key)!;assert.ok(restored.revision>first.revision);assert.ok(restored.content.includes('["scrap-1",true,false,false,false]'));assert.equal(s.schemaVersion,6);
});
test('hysteresis avoids thrashing at a shared border; unchanged content has no revision churn',()=>{const s=createState();const c=new CellStreamer(generateObjects(s.seed),[{x:0,z:0},{x:16,z:0}]);c.update(15.99,0,s,0);assert.equal(c.update(16.01,0,s,0).unloaded.length,0);assert.equal(c.update(16.02,0,s,0).changed.length,0);});

test('wilderness depletion changes only its owner revision and survives eviction and reload without respawn',()=>{
 for(let state of [createState(73129),createConnectedState(73129)]){
  const features=wildernessFeatures(state),feature=features.find(feature=>{
   if(!feature.removable)return false;
   const near={...state,player:{...state.player,x:feature.x+1,z:feature.z}};
   return canGatherWilderness(wildernessGatherContext(near),feature.id);
  })!;
  assert.ok(feature);
  state={...state,player:{...state.player,x:feature.x+1,z:feature.z}};
  const objects=[...worldObjects(state),...features.map(feature=>({id:feature.id,kind:'rock' as const,x:feature.x,z:feature.z,label:feature.kind}))],stream=new CellStreamer(objects),key=ownerOf(feature);
  const first=stream.update(state.player.x,state.player.z,state,1).loaded.find(cell=>cell.key===key)!;assert.ok(first);
  const beforeInventory={...state.inventory};state=commitWildernessGather(state,feature.id);
  assert.equal(state.wilderness!.stone,1);assert.deepEqual(state.inventory,beforeInventory);
  const changed=stream.update(state.player.x,state.player.z,state,1);
  assert.deepEqual(changed.changed.map(cell=>cell.key),[key]);
  const depleted=changed.changed[0]!;assert.ok(depleted.revision>first.revision);
  assert.deepEqual(JSON.parse(depleted.content).find((tuple:unknown[])=>tuple[0]===feature.id),[feature.id,false,false,true,false]);
  assert.equal(stream.update(state.player.x,state.player.z,state,1).changed.length,0);
  assert.ok(stream.update(1000,1000,state,0).unloaded.some(cell=>cell.key===key));
  const restored=parseSave(serializeSave(state))!;assert.ok(restored);
  const again=stream.update(restored.player.x,restored.player.z,restored,1).loaded.find(cell=>cell.key===key)!;
  assert.deepEqual(JSON.parse(again.content),JSON.parse(depleted.content));
  assert.ok(again.revision>depleted.revision);assert.equal(wildernessFeatureRemaining(feature,restored.wilderness),false);
  assert.equal(commitWildernessGather(restored,feature.id),restored);
 }
});
