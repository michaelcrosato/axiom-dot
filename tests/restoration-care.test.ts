import test from 'node:test';
import assert from 'node:assert/strict';
import {createTownLife,receiveTownHabitatCare,validTownLife} from '../src/town-life.ts';
import {createRestoration,restorationPlan,validRestoration,restorationBalances,exportRestorationCare,restorationCareHarvestable,immutableRestoration} from '../src/restoration.ts';
import {restorationScenarioDescriptors} from '../src/restoration-scenarios.ts';
import {applyRestorationCare,validRestorationCare,validRestorationCareCommand,immutableRestorationCare,restorationCarePosition,restorationCareBlockReason,type RestorationCareCommand} from '../src/restoration-care.ts';
const plan=restorationPlan(73129,restorationScenarioDescriptors());
const context=(command:RestorationCareCommand)=>({seed:plan.seed,zone:'valley',player:{...restorationCarePosition(plan,command)!,hp:80}});
const collect=(revision=0):RestorationCareCommand=>({kind:'collect',targetId:plan.sites[0]!.id,expectedRevision:revision});
const deliver=(revision:number):RestorationCareCommand=>({kind:'deliver',targetId:'apothecary',expectedRevision:revision});
test('habitat care cannot collect unearned restoration, invent targets or supply command-side cargo',()=>{
 const restoration=createRestoration(plan),life=createTownLife(plan.seed),command=collect();assert.equal(exportRestorationCare(restoration,plan,command.targetId),null);assert.equal(restorationCareHarvestable(restoration,command.targetId),0);assert.equal(applyRestorationCare(undefined,restoration,plan,life,context(command),command),null);
 for(const bad of [{...command,amount:100},{...command,carried:5},{...command,kind:'refund'},{...command,expectedRevision:NaN},{...command,targetId:''}])assert(!validRestorationCareCommand(bad));
 assert.equal(restorationCarePosition(plan,{kind:'deliver',targetId:'workshop'}),null);assert.equal(restorationCarePosition(plan,{kind:'collect',targetId:'unknown'}),null);
 assert(validRestoration(restoration,plan));assert.equal(Object.hasOwn(restoration.sites[0]!,'careExported'),false);
});
test('habitat care strictly links exported source, cargo, deliveries and consumed care history',()=>{
 const restoration=createRestoration(plan),life=createTownLife(plan.seed),empty={version:1,revision:0,carried:0,delivered:0,deliveries:0};assert(validRestorationCare(empty,restoration,life));
 for(const bad of [{...empty,carried:5},{...empty,delivered:5},{...empty,deliveries:1},{...empty,revision:1},{...empty,carried:NaN},{...empty,stock:0},{...empty,version:2}])assert(!validRestorationCare(bad,restoration,life));
 const gifted=receiveTownHabitatCare(life,5)!;assert(validTownLife(gifted,life.seed));assert(!validRestorationCare(empty,restoration,gifted));assert.equal(applyRestorationCare(undefined,restoration,plan,gifted,context(collect()),collect()),null);
 assert.deepEqual(immutableRestorationCare(empty,restoration,life),empty);assert.throws(()=>immutableRestorationCare({...empty,carried:5},restoration,life));
 const accessor={...empty};let read=false;Object.defineProperty(accessor,'carried',{get(){read=true;return 0;},enumerable:true});assert(!validRestorationCare(accessor,restoration,life));assert(!read);
});
test('restoration rejects forged biomass exports, fake organic sinks and invalid export records',()=>{
 const pristine=createRestoration(plan);
 for(const mutate of [(s:any)=>s.sites[0].careExported=5,(s:any)=>s.sites[0].careExported=-5,(s:any)=>s.sites[0].careExported=NaN,(s:any)=>s.sites[0].careExported=1,(s:any)=>s.records.push({kind:'export-care',tick:0,targetId:s.sites[0].id,amount:5}),(s:any)=>{s.sinks.organic+=5;s.sites[0].careExported=5;}]){const bad=structuredClone(pristine);mutate(bad);assert(!validRestoration(bad,plan));assert.throws(()=>immutableRestoration(bad,plan));}
 assert.equal(restorationBalances(pristine,plan).organic,0);
});
test('habitat care gates nonfinite, remote, dead and wrong-height player contexts',()=>{
 const restoration=createRestoration(plan),life=createTownLife(plan.seed),command=collect(),ctx=context(command);
 for(const patch of [{x:NaN},{z:Infinity},{hp:0},{hp:101},{x:ctx.player.x+4},{feetY:99},{y:NaN}]){const reason=restorationCareBlockReason(undefined,restoration,plan,life,{...ctx,player:{...ctx.player,...patch}},command);assert.match(reason!,/Reach/);}
 assert.match(restorationCareBlockReason(undefined,restoration,plan,life,{...ctx,zone:'cave'},command)!,/Reach/);
 assert.equal(applyRestorationCare(undefined,restoration,plan,life,context(deliver(0)),deliver(0)),null);
});

test('earned restoration exports actual biomass with retained reserves and delivers conserved resident care once',async()=>{
 const {earnRestorationCareHabitat}=await import('../src/restoration-care-scenarios.ts');
 const earned=earnRestorationCareHabitat(plan),restoration=earned.restoration,life=createTownLife(plan.seed),command=collect(),beforeBiomass=restoration.sites[0]!.cells.reduce((n,c)=>n+c.biomass,0);
 assert(restoration.sites[0]!.completedAtTick!==null);assert(restorationCareHarvestable(restoration,command.targetId)>=10);assert(earned.preparationActions.length>0);const first=applyRestorationCare(undefined,restoration,plan,life,context(command),command)!;assert(first);assert.equal(first.care.carried,5);assert.equal(first.restoration.sites[0]!.careExported,5);assert.equal(first.restoration.sinks.organic,restoration.sinks.organic);assert.equal(first.restoration.sites[0]!.cells.reduce((n,c)=>n+c.biomass,0),beforeBiomass-5);assert(first.restoration.sites[0]!.cells.every(c=>c.biomass>=2));assert.equal(restorationBalances(first.restoration,plan).organic,0);assert(validRestoration(JSON.parse(JSON.stringify(first.restoration)),plan));assert(validRestorationCare(first.care,first.restoration,first.life));assert.equal(applyRestorationCare(first.care,first.restoration,plan,first.life,context(command),command),null);
 const second=applyRestorationCare(first.care,first.restoration,plan,first.life,context(collect(1)),collect(1))!;assert.equal(second.care.carried,10);assert.equal(applyRestorationCare(second.care,second.restoration,plan,second.life,context(collect(2)),collect(2)),null);
 const received=applyRestorationCare(second.care,second.restoration,plan,second.life,context(deliver(2)),deliver(2))!;assert(received);assert.deepEqual(received.care,{version:1,revision:3,carried:0,delivered:10,deliveries:1});assert.deepEqual(received.life.habitatCare,{received:10,stock:10,used:0});assert(validRestorationCare(received.care,received.restoration,received.life));assert.deepEqual(immutableRestorationCare(JSON.parse(JSON.stringify(received.care)),received.restoration,received.life),received.care);assert(validTownLife(received.life,plan.seed));assert.equal(applyRestorationCare(received.care,received.restoration,plan,received.life,context(deliver(2)),deliver(2)),null);
 assert.deepEqual(received.life.resources,life.resources);assert.deepEqual(received.life.playerSpent,life.playerSpent);assert.deepEqual(received.life.residents.map(r=>r.id),life.residents.map(r=>r.id));
});

test('restored care collection remains blocked by current unhealthy cells and cannot breach resident stock capacity',async()=>{
 const {earnRestorationCareHabitat}=await import('../src/restoration-care-scenarios.ts');const earned=earnRestorationCareHabitat(plan);let restoration=earned.restoration,life=createTownLife(plan.seed);let care:import('../src/restoration-care.ts').RestorationCareState|undefined;
 const unhealthy=structuredClone(restoration);unhealthy.sites[0]!.cells[0]!.health=69;unhealthy.sites[0]!.stableTicks=0;assert(validRestoration(unhealthy,plan));assert.equal(exportRestorationCare(unhealthy,plan,collect().targetId),null);
 for(let round=0;round<2;round++){for(let n=0;n<2;n++){const command=collect(care?.revision??0),out=applyRestorationCare(care,restoration,plan,life,context(command),command)!;assert(out);({care,restoration,life}=out);}const command=deliver(care!.revision),out=applyRestorationCare(care,restoration,plan,life,context(command),command)!;assert(out);({care,restoration,life}=out);}
 assert.equal(life.habitatCare!.stock,20);const command=collect(care!.revision),out=applyRestorationCare(care,restoration,plan,life,context(command),command)!;assert(out);({care,restoration,life}=out);const blocked=deliver(care.revision);assert.equal(applyRestorationCare(care,restoration,plan,life,context(blocked),blocked),null);assert.equal(care.carried,5);assert.equal(restorationBalances(restoration,plan).organic,0);
 for(const bad of [{...care,deliveries:0},{...care,delivered:15},{...care,carried:0},{...care,revision:care.revision+1}])assert(!validRestorationCare(bad,restoration,life));
 const forged=structuredClone(restoration),site=forged.sites[0]!,from=site.cells.find(c=>c.biomass>2)!;const move=from.biomass-1;from.biomass=1;site.cells.find(c=>c!==from)!.biomass+=move;assert(!validRestoration(forged,plan));
});
