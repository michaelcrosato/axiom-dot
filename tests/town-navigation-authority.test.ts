import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceTownLife,createTownLife,createTownLifeOpening,immutableTownLife,townLifeFacilities,townLifePose,validTownLife,TOWN_LIFE_DEFAULTS,TOWN_LIFE_NEEDS,type TownLifeState} from '../src/town-life.ts';
import {advanceTownNavigation,townLifeTaskPoint,townLifeTaskStages,townNavigationClear,townNavigationDetour} from '../src/town-navigation.ts';
import {startingTown,TOWN_CENTER} from '../src/starting-town.ts';
const copy=<T>(v:T):T=>structuredClone(v);
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
function paidCook(remaining=20){
 const s=copy(createTownLife(73129)),f=townLifeFacilities(s.seed).find(f=>f.id==='cookshop')!,r=s.residents[0]!;
 for(const q of s.residents){q.needs.energy=1;if(q.index===0)for(const k of TOWN_LIFE_NEEDS)q.needs[k]=100;}
 Object.assign(r,{status:'acting',action:'cook',facilityId:f.id,slot:0,x:f.x-1.48,z:f.z,remaining,batch:1.5,committed:Math.min(4,remaining)});
 s.facilities.find(q=>q.id===f.id)!.occupants=[0];s.resources.harvest-=6;s.resources.water-=1.2;s.ledger.consumed.harvest=6;s.ledger.consumed.water=1.2;
 assert(validTownLife(s,s.seed));return s;
}

test('all generated work and partner-change places have swept wall clearance and open neighboring aisles',()=>{
 const plan=startingTown(73129);
 for(const f of townLifeFacilities(73129))for(let slot=0;slot<f.capacity;slot++)for(const a of f.actions){
  const points=Array.from({length:townLifeTaskStages(a)},(_,stage)=>townLifeTaskPoint(f,slot,a,stage));
  for(const p of points)assert(townNavigationClear(plan,p,p),`${f.id}/${slot}/${a}`);
  for(let j=1;j<points.length;j++)assert(townNavigationClear(plan,points[j-1]!,points[j]!));
  if(slot+1<f.capacity&&slot%(f.kind==='square'?6:4)!==(f.kind==='square'?5:3))for(const b of f.actions)for(let stage=0;stage<townLifeTaskStages(b);stage++)for(const p of points)assert(distance(p,townLifeTaskPoint(f,slot+1,b,stage))>=1.28-1e-6,`body-width aisle ${f.id}/${slot}`);
 }
});

test('fresh openings start with 100 physically separated identities and current purposeful work routes',()=>{
 for(const seed of [0,7,42,73129,0xffffffff]){const s=createTownLifeOpening(seed);assert(validTownLife(s,seed));assert.equal(s.navigation!.resolved,true);assert.equal(s.residents.length,100);assert.equal(new Set(s.residents.map(r=>r.id)).size,100);for(let i=0;i<100;i++){assert.equal(townLifePose(s,i).authoritativeMotion,1);for(let j=i+1;j<100;j++)assert(distance(s.residents[i]!,s.residents[j]!)>=.6-1e-7);}}
});

test('legacy parse is exact, and paid migration preserves the batch, consumed inputs and remaining work',()=>{
 const legacy=JSON.parse(readFileSync(new URL('./fixtures/town-motion-v11/150.json',import.meta.url),'utf8')) as TownLifeState;
 const snapshot=immutableTownLife(legacy,legacy.seed);assert.deepEqual(snapshot,legacy);assert.equal(snapshot.navigation,undefined);assert.deepEqual(advanceTownLife(snapshot,0),legacy);
 const s=paidCook(),r=s.residents[0]!,next=advanceTownLife(s,.5),n=next.residents[0]!;
 assert.equal(n.remaining,r.remaining);assert.equal(n.batch,1.5);assert.equal(n.completed,r.completed);assert.deepEqual(next.ledger.consumed,s.ledger.consumed);assert(distance(r,n)<=1.1+1e-7);assert(n.distance>0);assert(validTownLife(next,s.seed));
 let run=next;for(let tick=0;tick<100&&run.residents[0]!.completed===0;tick++)run=advanceTownLife(run,.5);
 assert.equal(run.residents[0]!.completed,1);assert.equal(run.ledger.produced.pantry,9);assert(run.residents[0]!.distance>3);assert(validTownLife(run,s.seed));
});

test('newly overlapping authenticated actor prevents paid work before contact resolution',()=>{
 const s=paidCook(.25),r=s.residents[0]!,next=advanceTownLife(s,.5,TOWN_LIFE_DEFAULTS,[{id:'explorer',x:r.x,z:r.z,feetY:6}]);
 assert.equal(next.residents[0]!.completed,0);assert.equal(next.residents[0]!.remaining,.25);assert.equal(next.ledger.produced.pantry,0);assert.equal(next.residents[0]!.batch,1.5);assert(distance(next.residents[0]!,r)<=1.1+1e-7);assert(validTownLife(next,s.seed));
 const clear=advanceTownLife(s,.5);assert.equal(clear.residents[0]!.completed,1);assert.equal(clear.ledger.produced.pantry,9);
});

test('bounded detour finds a real path around a dense standing row without body overlap',()=>{
 const plan=startingTown(7),bodies=[{x:TOWN_CENTER.x-2,z:TOWN_CENTER.z+10,facing:0},...[-.74,0,.74].map(z=>({x:TOWN_CENTER.x,z:TOWN_CENTER.z+10+z,facing:0}))],goal={x:TOWN_CENTER.x+2,z:TOWN_CENTER.z+10};
 let detour=townNavigationDetour(plan,bodies[0]!,goal,bodies,0);assert(detour);let total=0;
 for(let tick=0;tick<240&&distance(bodies[0]!,goal)>1e-5;tick++){
  if(detour&&distance(bodies[0]!,detour)<.05)detour=null;
  if(!detour)detour=townNavigationDetour(plan,bodies[0]!,goal,bodies,0);
  const before={...bodies[0]!},result=advanceTownNavigation(plan,bodies,[detour??goal,null,null,null],[1.8,0,0,0],.05,tick);
  total+=result.travel[0]!;assert(distance(before,bodies[0]!)<=.09+1e-7);assert(townNavigationClear(plan,before,bodies[0]!));for(let i=1;i<bodies.length;i++)assert(distance(bodies[0]!,bodies[i]!)>=.64-1e-6);
 }
 assert(distance(bodies[0]!,goal)<1e-5);assert(total>4);
});

test('navigation save boundary rejects malformed phase, trace, clearance and actor context',()=>{
 const s=advanceTownLife(createTownLifeOpening(73129),.5),moving=s.residents.find(r=>r.status==='traveling')!.index;
 const mutate=(fn:(s:TownLifeState)=>void)=>{const m=copy(s);fn(m);assert.equal(validTownLife(m,m.seed),false);};
 mutate(m=>{m.navigation!.residents[moving]!.stage=-1;});
 mutate(m=>{m.navigation!.residents[moving]!.trace=[m.residents[moving]!.x,m.residents[moving]!.z,1,m.residents[moving]!.x,m.residents[moving]!.z,10];});
 mutate(m=>{m.navigation!.residents[moving]!.trace=[m.residents[moving]!.x+5,m.residents[moving]!.z,0,m.residents[moving]!.x,m.residents[moving]!.z,10];});
 mutate(m=>{m.navigation!.residents[moving]!.trace=[];m.residents[moving]!.speed=1;});
 mutate(m=>{m.navigation!.residents[moving]!.detour={x:Infinity,z:0};});
 for(const actors of [[{x:NaN,z:0}],Array.from({length:9},()=>({x:0,z:0})),[{x:0,z:0,feetY:Infinity}]])assert.throws(()=>advanceTownLife(s,.5,TOWN_LIFE_DEFAULTS,actors));
 const actors=[{id:'b',x:TOWN_CENTER.x+10,z:TOWN_CENTER.z+10},{id:'a',x:TOWN_CENTER.x-10,z:TOWN_CENTER.z+10}];assert.deepEqual(advanceTownLife(s,.5,TOWN_LIFE_DEFAULTS,actors),advanceTownLife(s,.5,TOWN_LIFE_DEFAULTS,actors.slice().reverse()));
});

test('retained crowded saves leave released old slots and keep genuine traveler progress',()=>{
 for(const file of ['150','175']){let s=JSON.parse(readFileSync(new URL(`./fixtures/town-motion-v11/${file}.json`,import.meta.url),'utf8')) as TownLifeState;const stationary=Array(100).fill(0) as number[];let peak=0;
  for(let step=0;step<240;step++){const old=s;s=advanceTownLife(s,.5);for(const r of s.residents){const i=r.index;stationary[i]=r.status==='traveling'&&distance(r,old.residents[i]!)<.025?stationary[i]!+.5:0;peak=Math.max(peak,stationary[i]!);}if(step%20===0)assert(validTownLife(s,s.seed));}
  assert(peak<5,`${file}: longest continuously stationary traveler ${peak}s`);assert(s.residents.every(r=>r.completed>0));assert(validTownLife(s,s.seed));
 }
});

test('neighboring household task envelopes preserve body clearance and individual approach aisles',()=>{
 for(const seed of [0,7,42,73129]){
  const homes=townLifeFacilities(seed).filter(f=>f.kind==='home'),points=homes.flatMap(f=>Array.from({length:f.capacity},(_,slot)=>f.actions.flatMap(action=>Array.from({length:townLifeTaskStages(action)},(_,stage)=>({facility:f.id,slot,...townLifeTaskPoint(f,slot,action,stage)})))).flat());
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){const a=points[i]!,b=points[j]!;if(a.facility===b.facility&&a.slot===b.slot)continue;const gap=distance(a,b);assert(gap>=(a.facility===b.facility?1.28:.64)-1e-7,`${seed} ${a.facility}/${a.slot} to ${b.facility}/${b.slot}: ${gap}`);}
 }
});
