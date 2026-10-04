import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createConnectedState,parseSave,serializeSave,validateSave} from '../src/world.ts';
import {saveKey,storeSession,preContactKey,preContactSave} from '../src/session.ts';
import {traversalBodies,traversalPlan,traversalFromBodies,validTraversal} from '../src/traversal-world.ts';
import {playerContactContext} from '../src/contact-context.ts';import {emptyPlayerContact} from '../src/player-contact.ts';
import {worldValley} from '../src/generation.ts';import {valleySurfaceHeight} from '../src/valley.ts';
class Store{data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}}
test('optional prop state preserves old progress and roundtrips independently of all resource ledgers',()=>{
 const old=createConnectedState(73129),before=serializeSave(old),body=traversalBodies(old)[0]!;body.x+=.3;
 const next={...old,traversal:traversalFromBodies([body],old)!};assert.ok(validateSave(next));const parsed=parseSave(serializeSave(next))!;assert.deepEqual(parsed,next);
 const {traversal,...rest}=next;assert.equal(JSON.stringify(rest),before);assert.equal(parseSave(before)!.traversal,undefined);assert.ok(validTraversal(traversal,old));
 for(const bad of [{...traversal,version:2},{...traversal,crate:{...traversal.crate,x:Infinity}},{...traversal,crate:{...traversal.crate,z:80}}])assert.equal(validateSave({...old,traversal:bad}),false);
 assert.equal(traversalFromBodies([{...body,id:'unowned'}],old),null);assert.equal(traversalFromBodies([{...body,hy:2}],old),null);
});
test('first persisted contact state keeps immutable exact pre-change save bytes through later saves',()=>{
 const storage=new Store(),old=createConnectedState(73129),raw=serializeSave(old);storage.setItem(saveKey(old),raw);
 const body=traversalBodies(old)[0]!,next={...old,traversal:traversalFromBodies([body],old)!};storeSession(storage,next);assert.equal(preContactSave(storage,next),raw);
 body.x-=.3;storeSession(storage,{...next,traversal:traversalFromBodies([body],old)!});assert.equal(preContactSave(storage,next),raw);
 storage.setItem(preContactKey(old),'bad');const prior=storage.getItem(saveKey(old));assert.throws(()=>storeSession(storage,next),/rollback checkpoint/);assert.equal(storage.getItem(saveKey(old)),prior);
});
test('camp contact props stay beside the construction grid and on the existing leveled pad across seeds',()=>{
 for(const seed of [0,1,2,42,73129,4294967295]){const s=createConnectedState(seed),p=traversalPlan(s),v=worldValley(seed);assert.ok(p.ledge.x+p.ledge.hx<v.endpoints.buildOrigin.x-21.5);assert.ok(p.crate.z-p.crate.hz>v.endpoints.buildOrigin.z+13.5);
  for(const b of [p.crate,p.ledge])for(const dx of [-b.hx,b.hx])for(const dz of [-b.hz,b.hz]){const h=valleySurfaceHeight(v,b.x+dx,b.z+dz);assert.ok(Math.abs(h-(b.y-b.hy-(b===p.crate?.02:0)))<.04,`seed ${seed} prop support ${h}`);}
 }
});
test('context actions occupy existing slot and never offer online grip or distant crate hands',()=>{
 const contact=emptyPlayerContact(),body={id:'box',x:0,y:.65,z:0,hx:.56,hy:.65,hz:.56};assert.equal(playerContactContext(contact,[body],{x:0,y:0,z:-1},true,true)?.label,'Grip crate');assert.equal(playerContactContext(contact,[body],{x:0,y:0,z:-3},true,true),null);assert.equal(playerContactContext(contact,[body],{x:0,y:0,z:-1},true,false),null);
 assert.equal(playerContactContext({...contact,mode:'hang'},[],{x:0,y:1,z:0},false,true)?.label,'Let go');
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');assert.match(main,/function contactEnabled\(\)\{return !coop.active&&!coopPending&&!labActive;/);assert.match(main,/online:coop.active\|\|coopPending/);assert.match(main,/sendPhysics\(\{type:'contact-grab',requestId:contactRequestId\}\)/);assert.match(main,/state=\{\.\.\.state,traversal\}/);assert.match(main,/if\(contactBusy\(\)\|\|!physicsReady/);
});

test('backward pulling reverses supported local foot travel while keeping facing and total distance',async()=>{
 const {idleAnimation,stepAnimation,contactAnimationPhase,footContact,strideFor}=await import('../src/locomotion.ts');
 const previous={...idleAnimation(),speed:1,phase:.3},distance=.001;
 const next=stepAnimation(previous,0,-1,true,false,false,.001,distance),pull=contactAnimationPhase(previous,next,'pull',distance);
 const before=footContact(previous.phase,Math.min(.4,strideFor(1,0)),.1),after=footContact(pull.phase,Math.min(.4,strideFor(1,0)),.1);
 assert.equal(before.planted,true);assert.equal(after.planted,true);assert.ok(Math.abs(after.z-before.z-distance)<1e-9,'local foot advances to cancel backward body travel');assert.equal(pull.travel,next.travel);assert.equal(pull.speed,next.speed);
 assert.ok(contactAnimationPhase(previous,next,'push',distance).phase>previous.phase,'pushing advances the shorter contact gait');assert.ok(contactAnimationPhase({...previous,phase:0},next,'pull',distance).phase>.9,'backward wrap stays normalized');
});
