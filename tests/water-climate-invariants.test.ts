import test from 'node:test';
import assert from 'node:assert/strict';
import {PADS,LINKS,flow,migrateLegacyMachine,validMachine,capacity,build,machineCosts,type Waterworks} from '../src/waterworks.ts';
import {advanceSettlement,emptySettlement,validSettlement} from '../src/settlement.ts';
import {habitatFieldTotals,stepHabitatFields,validHabitatFields,type HabitatFields} from '../src/habitat-fields.ts';
import {advanceRestoration,applyRestorationCommand,createRestoration,restorationBalances,restorationCommandPosition,restorationMachinePosition,restorationPlan,restorationPlayerCost,validRestoration,type RestorationCommand} from '../src/restoration.ts';
import {restorationScenarioDescriptors} from '../src/restoration-scenarios.ts';

// Cross-system audit checks for the water/climate/habitat group. They exercise the
// real reducers with frame partitions, randomized graphs and save round trips.
const lcg=(seed:number)=>()=>{seed=(Math.imul(seed,1103515245)+12345)>>>0;return seed/4294967296;};

function sampleMachine():Waterworks{const m=migrateLegacyMachine({parts:PADS.map(p=>p.id),links:[...LINKS],stored:0,extracted:0,delivered:0,drained:0});assert.ok(m);return m;}

test('waterworks and Mossbank reserve outcomes do not depend on frame partition',()=>{
 const outcomes=[1/144,1/60,1/30,.25,.5,1].map(dt=>{
  let w=sampleMachine(),s=emptySettlement();const frames=Math.round(90/dt);
  for(let i=0;i<frames;i++){const next=flow(w,dt);s=advanceSettlement(s,next.delivered-w.delivered,dt);w=next;}
  assert.ok(validMachine(w)&&validSettlement(s,w));
  assert.ok(w.stored>=0&&w.stored<=capacity(w));
  return {w,s};
 });
 const [first]=outcomes;
 for(const o of outcomes){
  for(const key of ['stored','extracted','delivered'] as const)assert.ok(Math.abs(o.w[key]-first!.w[key])<1e-9,`${key} ${o.w[key]} vs ${first!.w[key]}`);
  for(const key of ['reserve','consumed','spilled','served'] as const)assert.ok(Math.abs(o.s[key]-first!.s[key])<1e-9,`${key} ${o.s[key]} vs ${first!.s[key]}`);
 }
 // 90 s at 2 L/s in, 1 L/s out: reservoir fills to its 20 L capacity after 20 s, then passes 1 L/s.
 assert.ok(Math.abs(first!.w.delivered-90)<1e-9&&Math.abs(first!.w.stored-20)<1e-9&&Math.abs(first!.w.extracted-110)<1e-9);
});

test('random waterworks construction never creates materials, litres or overfilled storage',()=>{
 const rnd=lcg(17),pick=<T,>(a:readonly T[])=>a[Math.floor(rnd()*a.length)]!;
 for(let run=0;run<12;run++){
  let w=sampleMachine(),inv={scrap:6,core:0,water:0};const total={scrap:inv.scrap+machineCosts(w).scrap,core:inv.core+machineCosts(w).core};
  for(let i=0;i<60;i++){
   if(rnd()<.5){w=flow(w,pick([1/60,.25,1]));continue;}
   const target=pick(w.parts);const kind=pick(['dismantle','rotate','place'] as const);
   const command=kind==='place'?{type:'place' as const,kind:pick(['pipe','reservoir','tee','outlet'] as const),x:pick([-20,-17,-14,-11,-8]),z:pick([6,9,12]),rotation:pick([0,1,2,3] as const)}:target?kind==='rotate'?{type:'rotate' as const,id:target.id,rotation:pick([0,1,2,3] as const)}:{type:'dismantle' as const,id:target.id}:null;
   if(!command)continue;
   const result=build(w,inv,command,{x:-12,z:15},'valley');w=result.machine;inv=result.inventory;
   const cost=machineCosts(w);
   assert.ok(validMachine(w));
   assert.equal(inv.scrap+cost.scrap,total.scrap);assert.equal(inv.core+cost.core,total.core);
   assert.ok(w.stored>=0&&w.stored<=capacity(w)+1e-12);
   assert.ok(Math.abs(w.extracted-w.delivered-w.drained-w.stored)<1e-9);
  }
 }
});

test('randomized habitat field graphs conserve every integer field without negatives or overfill',()=>{
 const rnd=lcg(99),int=(n:number)=>Math.floor(rnd()*n);
 for(let run=0;run<400;run++){
  const count=1+int(18),capacity=1+int(3000);
  let cells:HabitatFields[]=Array.from({length:count},()=>({waterMl:int(capacity+1),contaminant:int(400),heat:int(5000),smoke:int(300),scent:int(900)}));
  const edges:{a:number;b:number}[]=[],seen=new Set<string>();
  for(let k=0;k<Math.min(40,count*3)&&count>1;k++){const a=int(count),b=int(count);const key=[Math.min(a,b),Math.max(a,b)].join(':');if(a===b||seen.has(key))continue;seen.add(key);edges.push(rnd()<.5?{a,b}:{a:b,b:a});}
  const options={waterConductance:1+int(200),airConductance:1+int(60),cellCapacityMl:capacity};
  const before=habitatFieldTotals(cells);
  for(let step=0;step<20;step++){
   const result=stepHabitatFields(cells,edges,options);cells=result.cells;
   assert.ok(cells.every(validHabitatFields));
   assert.ok(cells.every(c=>c.waterMl<=capacity));
   for(const t of result.waterTransfers)assert.ok(t.amount>0&&t.amount<=options.waterConductance&&t.contaminant>=0);
  }
  assert.deepEqual(habitatFieldTotals(cells),before);
 }
});

test('randomized restoration commands keep exact ledgers, paid stock and save round-trip validity',()=>{
 const plan=restorationPlan(7,restorationScenarioDescriptors()),rnd=lcg(23),pick=<T,>(a:readonly T[])=>a[Math.floor(rnd()*a.length)]!;
 const organs=['pump','filter','vent','beacon'] as const;let accepted=0;
 for(let run=0;run<6;run++){
  let s=createRestoration(plan),inventory={scrap:30,core:4,water:0},hp=60;
  for(let i=0;i<160;i++){
   if(rnd()<.45){const at=restorationMachinePosition(s,plan);s=advanceRestoration(s,plan,pick([1/60,.25,.33,1]),{player:{x:at?.x??0,z:at?.z??0,hp}});}
   else{
    const kind=pick(['refit','deploy','recall','stop','service','repair','start'] as const),site=pick(plan.sites),organ=pick(organs);
    const machineSite=plan.sites.find(p=>p.id===s.machine?.siteId)??site,ids=[...machineSite.cells.map(c=>c.id),'tank'],source=pick(ids);
    const command=(kind==='refit'?{kind,targetId:site.id,expectedRevision:s.revision,recipe:{version:1,seed:7,support:pick(['nimble','sturdy']),shell:pick(['reed','alloy']),organ},ability:{version:1,organ,strength:pick([1,2,3]),tempo:pick(['careful','steady','brisk'])}}
     :kind==='start'?{kind,targetId:rnd()<.5?source:pick(ids),sourceId:source,expectedRevision:s.revision}
     :{kind,targetId:(kind==='recall'||kind==='stop')&&s.machine?.siteId?s.machine.siteId:site.id,expectedRevision:s.revision}) as RestorationCommand;
    const at=restorationCommandPosition(s,plan,command)??site;
    const result=applyRestorationCommand(s,plan,{seed:7,zone:'valley',player:{x:at.x+1.2,z:at.z+1.2,hp},inventory},command);
    if(result.state!==s)accepted++;s=result.state;inventory=result.inventory;hp=result.hp;
   }
   if(i%20===0)s=JSON.parse(JSON.stringify(s));
   assert.ok(validRestoration(JSON.parse(JSON.stringify(s)),plan));
   assert.deepEqual(restorationBalances(s,plan),{waterMl:0,contaminant:0,energy:0,smoke:0,scent:0,organic:0,filter:0});
   const cost=restorationPlayerCost(s);assert.equal(inventory.scrap+cost.scrap,30);assert.equal(inventory.core+cost.core,4);
   assert.ok(hp>0&&hp<=100);
  }
 }
 assert.ok(accepted>50,`only ${accepted} commands accepted`);
});
