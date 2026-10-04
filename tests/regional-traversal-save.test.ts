import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createConnectedState,createRegionalState,applyAction,parseSave,serializeSave,validateSave,worldEndpoints,type State} from '../src/world.ts';
import {worldHeight} from '../src/generation.ts';
import {REGION_BOUND} from '../src/regional-world.ts';
import {regionalBodyCenterBound,REGIONAL_PLAYER_SKIN} from '../src/regional-bounds.ts';
import {traversalBodies,traversalFromBodies,validTraversal,SURVEY_CRATE_HALF,SURVEY_CRATE_ID} from '../src/traversal-world.ts';
import {saveKey,storeSession,loadSavedWorld} from '../src/session.ts';
class Store{data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}}

test('the single regional survey crate saves and reloads beyond 80m independently of player position and resources',()=>{
 const original=createRegionalState(73129),store=new Store(),legacy=createConnectedState(73129);storeSession(store,legacy);const legacyBytes=store.getItem(saveKey(legacy));let state=original;
 for(const [x,z]of [[81,-90],[300,500],[-900,1100],[1400,-1300]]){
  const body={...traversalBodies(state)[0]!,x:x!,z:z!,y:worldHeight(state,x!,z!)+SURVEY_CRATE_HALF.hy+REGIONAL_PLAYER_SKIN},traversal=traversalFromBodies([body],state);
  assert(traversal,`distant worker crate snapshot at ${x}, ${z} remains persistable`);state={...state,traversal};assert(validateSave(state));storeSession(store,state,true);
  const loaded=loadSavedWorld(store,state)!;assert(loaded);assert.deepEqual(loaded.traversal,traversal);assert.deepEqual(traversalBodies(loaded),[body]);assert.equal(traversalBodies(loaded).length,1);assert.equal(traversalBodies(loaded)[0]!.id,SURVEY_CRATE_ID);state=loaded;
 }
 for(const key of ['player','inventory','collected','defeated','waterworks','settlement','jobs','causal','equipment','wilderness'] as const)assert.deepEqual(state[key],original[key]);
 assert.equal(store.getItem(saveKey(legacy)),legacyBytes,'regional prop travel never rewrites the older same-seed valley slot');
});

test('regional crate persistence follows world flavor through cave and dungeon visits',()=>{
 let state=createRegionalState(73129);const body={...traversalBodies(state)[0]!,x:1000,z:-1000,y:worldHeight(state,1000,-1000)+SURVEY_CRATE_HALF.hy+REGIONAL_PLAYER_SKIN};state={...state,traversal:traversalFromBodies([body],state)!};
 const entrance=worldEndpoints(state).entrance;state=applyAction(state,{type:'move',x:entrance.x,z:entrance.z});
 for(const action of [{type:'enter'} as const,{type:'enter-cave'} as const]){
  const underground=applyAction(state,action);assert.notEqual(underground.zone,'valley');assert(validateSave(underground));const loaded=parseSave(serializeSave(underground))!;assert(loaded);assert.deepEqual(loaded.traversal,state.traversal);assert.deepEqual(traversalBodies(loaded),[body]);
  assert(validTraversal(state.traversal,loaded),'crate bounds cannot shrink when only the player zone changes');
 }
});

test('regional crate bounds contain the whole finite box and skin, with strict malformed-state rejection and unchanged legacy limits',()=>{
 const regional=createRegionalState(73129),base=traversalBodies(regional)[0]!,bound=regionalBodyCenterBound(REGION_BOUND,SURVEY_CRATE_HALF.hx);
 for(const x of [-bound,bound])for(const z of [-bound,bound]){
  const body={...base,x,z,y:worldHeight(regional,x,z)+SURVEY_CRATE_HALF.hy},traversal=traversalFromBodies([body],regional);assert(traversal);assert(validateSave({...regional,traversal}));assert(Math.abs(x)+SURVEY_CRATE_HALF.hx+REGIONAL_PLAYER_SKIN<=REGION_BOUND);assert(Math.abs(z)+SURVEY_CRATE_HALF.hz+REGIONAL_PLAYER_SKIN<=REGION_BOUND);
 }
 for(const patch of [{x:bound+.001},{z:-bound-.001},{x:Infinity},{z:NaN},{y:256.001},{y:-256.001},{y:Infinity},{hx:1},{id:'duplicated-prop'}])assert.equal(traversalFromBodies([{...base,...patch}],regional),null);
 assert.equal(traversalFromBodies([base,base],regional),null);assert.equal(traversalFromBodies([{...base,y:250}],regional)?.crate.y,250,'regional height range accommodates its broader finite terrain domain');
 const old=createConnectedState(73129),oldBody=traversalBodies(old)[0]!;
 assert(validTraversal({version:1,crate:{x:79.4,y:100,z:-79.4}},old));assert.equal(traversalFromBodies([{...oldBody,x:79.4001}],old),null);assert.equal(traversalFromBodies([{...oldBody,y:100.001}],old),null);assert.equal(traversalFromBodies([{...oldBody,y:-20.001}],old),null);
 assert.equal(validTraversal({version:1,crate:{x:1000,y:10,z:1000}},old),false);assert.equal(validTraversal({version:1,crate:{x:0,y:0,z:0}},createState()),false);
 assert.equal(validateSave({...old,traversal:{version:1,crate:{x:1000,y:10,z:1000}}}),false);
});
