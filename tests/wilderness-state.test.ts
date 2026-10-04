import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createConnectedState,applyAction,commitWildernessGather,wildernessGatherContext,serializeSave,parseSave,validateSave,worldBound,type State,type Action} from '../src/world.ts';
import {worldHeight} from '../src/generation.ts';
import {wildernessFeatures,wildernessObstacles,wildernessFeatureRemaining,wildernessFeatureDepleted,nearestWildernessSolidPoint,type WildernessFeature} from '../src/wilderness.ts';
import {createWildernessState,validWildernessState,wildernessResourceLimits,canGatherWilderness,nearestGatherableWilderness,validWildernessGatherAction,WILDERNESS_GATHER_REACH,WILDERNESS_HAND_HEIGHT,type WildernessState} from '../src/wilderness-state.ts';

const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function approach(state:State,predicate:(feature:WildernessFeature)=>boolean){
  for(const feature of wildernessFeatures(state).filter(feature=>feature.harvestable&&predicate(feature)))for(const distance of [1.5,1,2])for(let side=0;side<8;side++){
    const x=feature.x+Math.cos(side*Math.PI/4)*distance,z=feature.z+Math.sin(side*Math.PI/4)*distance;
    if(Math.abs(x)>worldBound(state)||Math.abs(z)>worldBound(state))continue;
    const near={...state,player:{...state.player,x,z}};
    if(canGatherWilderness(wildernessGatherContext(near),feature.id))return {state:near,feature};
  }
  throw new Error('No reachable wilderness fixture');
}
function gather(state:State,predicate:(feature:WildernessFeature)=>boolean){const near=approach(state,predicate);return {...near,next:applyAction(near.state,{type:'gather-wilderness',id:near.feature.id})};}

test('optional absence keeps old schema 6 worlds pristine and both generations can gather',()=>{
  for(const initial of [createState(1),createConnectedState(73129)]){
    assert.equal(Object.hasOwn(initial,'wilderness'),false);
    const loaded=parseSave(serializeSave(initial))!;
    assert.ok(loaded);assert.equal(Object.hasOwn(loaded,'wilderness'),false);
    const {state,feature,next}=gather(loaded,feature=>feature.kind==='tree');
    assert.equal(next.schemaVersion,6);assert.deepEqual(next.generationManifest,state.generationManifest);
    assert.deepEqual(next.wilderness,{version:1,generation:state.generation,seed:state.seed,harvested:[feature.id],wood:1,stone:0});
    assert.deepEqual(next.inventory,state.inventory);assert.deepEqual(next.collected,state.collected);
    assert.equal(next.revision,state.revision+1);assert.equal(validateSave(next),true);
    assert.deepEqual(next.waterworks,state.waterworks);assert.deepEqual(next.equipment,state.equipment);
    assert.equal(state.wilderness,undefined,'transition is immutable');
  }
});

test('trees retain their exact solid and small rocks remove their complete feature atomically',()=>{
  for(const initial of [createState(3),createConnectedState(73129)]){
    const tree=gather(initial,feature=>feature.kind==='tree');
    assert.equal(wildernessFeatureRemaining(tree.feature,tree.next.wilderness),true);
    assert.equal(wildernessFeatureDepleted(tree.feature,tree.next.wilderness),true);
    assert.deepEqual(wildernessObstacles(tree.state),wildernessObstacles(tree.next,tree.next.wilderness));
    const rock=gather(tree.next,feature=>feature.kind==='rock'&&feature.removable);
    assert.equal(rock.next.wilderness!.wood,1);assert.equal(rock.next.wilderness!.stone,1);
    assert.equal(wildernessFeatureRemaining(rock.feature,rock.next.wilderness),false);
    assert.ok(wildernessObstacles(rock.state,rock.state.wilderness).some(solid=>solid.featureId===rock.feature.id));
    assert.ok(wildernessObstacles(rock.next,rock.next.wilderness).every(solid=>solid.featureId!==rock.feature.id));
    assert.equal(validateSave(rock.next),true);
  }
});

test('large outcrops yield once while their geometry and all existing resource ledgers remain unchanged',()=>{
  const {state,feature,next}=gather(createConnectedState(73129),feature=>feature.kind==='rock'&&!feature.removable);
  assert.equal(next.wilderness!.stone,1);assert.equal(next.wilderness!.wood,0);
  assert.deepEqual(wildernessObstacles(next,next.wilderness),wildernessObstacles(state));
  assert.equal(wildernessFeatureRemaining(feature,next.wilderness),true);
  assert.equal(applyAction(next,{type:'gather-wilderness',id:feature.id}),next);
  assert.deepEqual(next.inventory,state.inventory);assert.deepEqual(next.causal,state.causal);
  assert.deepEqual(next.settlement,state.settlement);assert.deepEqual(next.jobs,state.jobs);
});

test('duplicate gather remains a no-op across saves, seed-cache eviction, zones and respawn',()=>{
  const {feature,next}=gather(createConnectedState(73129),feature=>feature.removable);
  const raw=serializeSave(next);
  for(let seed=0;seed<12;seed++)wildernessFeatures({generation:2,seed});
  let loaded=parseSave(raw)!;assert.ok(loaded);assert.deepEqual(loaded.wilderness,next.wilderness);
  assert.equal(commitWildernessGather(loaded,feature.id),loaded);
  const cave={...loaded,zone:'dungeon' as const};assert.equal(commitWildernessGather(cave,feature.id),cave);
  loaded=applyAction({...loaded,player:{...loaded.player,hp:0}},{type:'respawn'});
  assert.deepEqual(loaded.wilderness,next.wilderness);
  const back={...loaded,player:{...next.player}};
  assert.equal(commitWildernessGather(back,feature.id),back);
  assert.equal(wildernessFeatureRemaining(feature,loaded.wilderness),false);
});

test('only a live valley explorer in physical reach may gather, using accepted feet elevation',()=>{
  const {state,feature}=approach(createConnectedState(73129),feature=>feature.kind==='tree');
  assert.notEqual(commitWildernessGather(state,feature.id),state);
  for(const invalid of [
    {...state,zone:'dungeon' as const},
    {...state,zone:'cave' as const},
    {...state,player:{...state.player,hp:0}},
    {...state,player:{...state.player,x:state.player.x+20}},
    {...state,player:{...state.player,x:NaN}},
  ])assert.equal(commitWildernessGather(invalid,feature.id),invalid);
  assert.equal(commitWildernessGather(state,feature.id,{feetY:feature.y+20}),state);
  assert.equal(commitWildernessGather(state,feature.id,{feetY:NaN}),state);
  assert.equal(commitWildernessGather(state,feature.id,{grounded:false}),state);
  assert.equal(commitWildernessGather(state,'missing'),state);
  const foreign=wildernessFeatures({generation:state.generation,seed:state.seed+1})[0]!;
  assert.equal(commitWildernessGather(state,foreign.id),state);
});

test('gather reach measures a solid surface, not its center, and rejects a point beyond the exact reach',()=>{
  const initial=createConnectedState(73129);
  let found=false;
  for(const feature of wildernessFeatures(initial).filter(feature=>feature.kind==='rock'&&feature.harvestable&&(feature.radius??0)>1))for(let side=0;side<8&&!found;side++){
    const distance=(feature.radius??0)+1.8,near={...initial,player:{...initial.player,x:feature.x+Math.cos(side*Math.PI/4)*distance,z:feature.z+Math.sin(side*Math.PI/4)*distance}};
    const context=wildernessGatherContext(near),hand={x:near.player.x,y:context.feetY+WILDERNESS_HAND_HEIGHT,z:near.player.z};
    if(!canGatherWilderness(context,feature.id))continue;
    assert.ok(Math.hypot(hand.x-feature.x,hand.y-feature.y,hand.z-feature.z)>WILDERNESS_GATHER_REACH);
    assert.ok(nearestWildernessSolidPoint(feature,hand).distance<=WILDERNESS_GATHER_REACH);
    found=true;
  }
  assert.ok(found,'large-rock surface can be reached when its center cannot');
  const {state,feature}=approach(createState(1),feature=>feature.kind==='tree');
  const tooFar={...state,player:{...state.player,x:feature.x+.175+WILDERNESS_GATHER_REACH+.001,z:feature.z}};
  assert.equal(canGatherWilderness(wildernessGatherContext(tooFar),feature.id),false);
});

test('solid occluders block both target selection and commit, while overhead geometry does not',()=>{
  const {state,feature}=approach(createConnectedState(73129),feature=>feature.kind==='tree');
  const feetY=worldHeight(state,state.player.x,state.player.z),hand={x:state.player.x,y:feetY+WILDERNESS_HAND_HEIGHT,z:state.player.z},hit=nearestWildernessSolidPoint(feature,hand);
  const wall={x:(hand.x+hit.x)/2,y:(hand.y+hit.y)/2,z:(hand.z+hit.z)/2,hx:.15,hy:.5,hz:.15};
  const blocked=wildernessGatherContext(state,{feetY,obstacles:[wall]});
  assert.equal(canGatherWilderness(blocked,feature.id),false);
  assert.notEqual(nearestGatherableWilderness(blocked)?.id,feature.id);
  assert.equal(commitWildernessGather(state,feature.id,{feetY,obstacles:[wall]}),state);
  assert.equal(canGatherWilderness(wildernessGatherContext(state,{feetY,obstacles:[{...wall,y:wall.y+5}]}),feature.id),true);
  assert.equal(canGatherWilderness(wildernessGatherContext(state,{feetY,obstacles:[{x:wall.x,z:wall.z,hx:wall.hx,hz:wall.hz}]}),feature.id),false,'2D barriers block at all elevations');
});

test('finite ledger equals the exact catalog totals and grants no timer, enemy or machine rewards',()=>{
  for(const identity of [{generation:1 as const,seed:0},{generation:2 as const,seed:0xffffffff}]){
    const sources=wildernessFeatures(identity).filter(feature=>feature.harvestable),limits=wildernessResourceLimits(identity);
    const all:WildernessState={...createWildernessState(identity),harvested:sources.map(feature=>feature.id),...limits};
    assert.equal(all.wood+all.stone,sources.length);assert.ok(sources.length<1000);
    assert.equal(validWildernessState(all,identity),true);
    const initial=identity.generation===1?createState(identity.seed):createConnectedState(identity.seed),state={...initial,wilderness:all};
    assert.equal(validateSave(state),true);assert.deepEqual(applyAction(state,{type:'tick',dt:1}).wilderness,all);
    assert.equal(nearestGatherableWilderness(wildernessGatherContext(state)),undefined);
    assert.deepEqual(state.inventory,{scrap:0,core:0,water:0});
  }
});

test('strict validation rejects malformed packs, wrong generations or seeds and unearned material totals',()=>{
  const {next}=gather(createConnectedState(73129),feature=>feature.kind==='tree'),good=next.wilderness!,id=good.harvested[0]!;
  const invalid:unknown[]=[null,[],{},undefined,{...good,version:2},{...good,generation:1},{...good,seed:3},{...good,extra:0},
    {...good,wood:0},{...good,wood:2},{...good,wood:1.5},{...good,wood:Infinity},{...good,wood:-1},{...good,stone:1},
    {...good,harvested:[id,id]},{...good,harvested:['unknown']},{...good,harvested:[1]},{...good,harvested:null},
    {...good,harvested:[wildernessFeatures({generation:2,seed:3})[0]!.id]},
    {...good,harvested:[wildernessFeatures(next).find(feature=>!feature.harvestable)!.id],wood:0,stone:1},
  ];
  for(const wilderness of invalid){
    assert.equal(validWildernessState(wilderness,next),false);
    assert.equal(validateSave({...next,wilderness}),false);
    const invalidState={...next,wilderness} as State;
    assert.equal(commitWildernessGather(invalidState,id),invalidState,'invalid present packs must not reset');
  }
  assert.equal(validWildernessState({...good,harvested:Array(10000).fill(id)},next),false);
  assert.equal(validWildernessState({...good,[Symbol('hidden')]:true},next),false);
  assert.equal(validWildernessState(Object.assign(Object.create({inherited:true}),good),next),false);
  assert.equal(validWildernessState(Object.defineProperty({...good},'hidden',{value:true}),next),false);
  assert.equal(validWildernessState(good,{generation:1,seed:next.seed}),false);
  assert.equal(validWildernessState(good,{generation:2,seed:next.seed+1}),false);
});

test('action payload is an exact type/id allowlist and cannot smuggle authoritative coordinates',()=>{
  const {state,feature}=approach(createConnectedState(73129),feature=>feature.kind==='tree');
  const good={type:'gather-wilderness',id:feature.id};assert.equal(validWildernessGatherAction(good),true);
  for(const value of [null,[],{type:'gather-wilderness'},{...good,id:4},{...good,y:0},{...good,feetY:0},{...good,wood:5},{...good,id:'x'.repeat(161)}]){
    assert.equal(validWildernessGatherAction(value),false);
    if(value&&typeof value==='object'&&!Array.isArray(value)&&'type'in value)assert.equal(applyAction(state,value as Action),state);
  }
  assert.equal(validWildernessGatherAction({...good,[Symbol('hidden')]:true}),false);
  assert.equal(validWildernessGatherAction(Object.assign(Object.create({inherited:true}),good)),false);
});

test('save serialization round-trip remains strict, immutable and finite after sequential resource types',()=>{
  let state=createConnectedState(3);const before=copy(state);
  for(const kind of ['tree','rock','tree','rock'] as const){const result=gather(state,feature=>feature.kind===kind&&!state.wilderness?.harvested.includes(feature.id));state=result.next;state=parseSave(serializeSave(state))!;assert.ok(state);}
  assert.deepEqual(state.wilderness&&{wood:state.wilderness.wood,stone:state.wilderness.stone},{wood:2,stone:2});
  assert.equal(state.wilderness!.harvested.length,4);assert.deepEqual(createConnectedState(3),before);
  assert.equal(parseSave(JSON.stringify({...state,wilderness:{...state.wilderness,stone:999}})),null);
});

test('bounded target shortlist matches an exhaustive exact-surface search across both foundations',()=>{
  for(const initial of [createState(1),createState(73129),createConnectedState(3),createConnectedState(73129)]){
    const features=wildernessFeatures(initial);
    for(const feature of features.filter(feature=>feature.harvestable).filter((_,index)=>index%23===0))for(const offset of [-2.1,0,2.1]){
      const state={...initial,player:{...initial.player,x:feature.x+offset,z:feature.z+.6}},context=wildernessGatherContext(state),hand={x:state.player.x,y:context.feetY+WILDERNESS_HAND_HEIGHT,z:state.player.z};
      const expected=features.map(feature=>({feature,distance:nearestWildernessSolidPoint(feature,hand).distance}))
        .filter(item=>item.feature.harvestable&&item.distance<=WILDERNESS_GATHER_REACH)
        .sort((a,b)=>a.distance-b.distance||a.feature.id.localeCompare(b.feature.id))
        .find(item=>canGatherWilderness(context,item.feature.id))?.feature;
      assert.equal(nearestGatherableWilderness(context)?.id,expected?.id);
    }
  }
});

test('frozen resource membership is indexed once while mutable and accessor-backed callers never become stale',async()=>{
 const {wildernessHarvested,wildernessMembershipCacheStats}=await import('../src/wilderness.ts');
 const feature=wildernessFeatures(createConnectedState(73129)).find(f=>f.removable)!;
 const frozen=Object.freeze({harvested:Object.freeze(Array.from({length:100_000},(_,i)=>i===99_999?feature.id:`previously-visited-${i}`))}),before=wildernessMembershipCacheStats().builds;
 assert(wildernessFeatureDepleted(feature,frozen));assert.equal(wildernessFeatureRemaining(feature,frozen),false);
 const warmed=wildernessMembershipCacheStats().builds;assert.equal(warmed,before+1);
 for(let i=0;i<1000;i++){assert(wildernessHarvested(frozen,feature.id));assert(!wildernessHarvested(frozen,'never-harvested'));}
 assert.equal(wildernessMembershipCacheStats().builds,warmed,'local checks never rescan the immutable historical ID array');
 const ids=[feature.id],mutable={harvested:ids};assert(wildernessFeatureDepleted(feature,mutable));ids[0]='another-source';assert(!wildernessFeatureDepleted(feature,mutable));ids.push(feature.id);assert(wildernessFeatureDepleted(feature,mutable));ids.length=0;assert(!wildernessFeatureDepleted(feature,mutable));
 const frozenOwner=Object.freeze({harvested:ids});assert(!wildernessFeatureDepleted(feature,frozenOwner));ids.push(feature.id);assert(wildernessFeatureDepleted(feature,frozenOwner));ids.pop();assert(!wildernessFeatureDepleted(feature,frozenOwner),'freezing the owner alone cannot certify a mutable nested array');
 const changing={harvested:frozen.harvested};assert(wildernessFeatureDepleted(feature,changing));changing.harvested=Object.freeze([]);assert(!wildernessFeatureDepleted(feature,changing),'replacing an immutable array changes the cache key');
 let value=feature.id;const accessors:string[]=[];Object.defineProperty(accessors,'0',{get:()=>value,enumerable:true});Object.freeze(accessors);const getterOwner={harvested:accessors};assert(wildernessFeatureDepleted(feature,getterOwner));value='different';assert(!wildernessFeatureDepleted(feature,getterOwner),'frozen accessor arrays are never cached');
});
