import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCampaignGuidance,campaignTargetDirection,CAMPAIGN_GOAL_IDS,type CampaignGoalId} from '../src/campaign-guidance.ts';
import {createRegionalState,enableStartingTown,worldTownSupplySources,worldRestorationPlan,applyAction,type State} from '../src/world.ts';
import {WORKSHOP_BOARD,advanceWorkshopConstruction} from '../src/workshop-construction.ts';
import {DEFAULT_WORKSHOP_DRAFT} from '../src/workshop-authoring.ts';
import {assignTownWorkshopWorker} from '../src/town-life.ts';
import {earnedCareWorld,atCare,careCommand} from './helpers/restoration-care.ts';
const base=()=>enableStartingTown(createRegionalState(73129));
const card=(s:State,id:CampaignGoalId,options:Parameters<typeof projectCampaignGuidance>[1]={})=>projectCampaignGuidance(s,options).find(c=>c.id===id)!;
function cargo(carried:number,exhausted=false):State {const s=base(),all=worldTownSupplySources(s).map(o=>o.id),sources=exhausted?all:all.slice(0,carried),unloaded=sources.length-carried;return {...s,collected:sources,inventory:{...s.inventory,scrap:unloaded},townSupply:{version:1,revision:sources.length+unloaded,sources,carried,unloaded,deliveries:0}};}
function building(){let s=base();const worker=s.townLife!.residents.find(r=>assignTownWorkshopWorker(s.townLife!,r.id))!;s={...s,player:{...s.player,...WORKSHOP_BOARD}};const built=applyAction(s,{type:'workshop-construction',command:{kind:'build',expectedRevision:0,parcelId:'hearthmere-west',parameters:DEFAULT_WORKSHOP_DRAFT,workerId:worker.id}});assert(built.workshopConstruction);return built;}
test('guidance selects nearest finite supply source or an explicit available source without changing its inventory',()=>{
 const s=base(),sources=worldTownSupplySources(s),far=sources.at(-1)!,near=sources[0]!,at={...s,player:{...s.player,x:near.x,z:near.z}};
 assert.deepEqual(projectCampaignGuidance(s).map(c=>c.id),CAMPAIGN_GOAL_IDS);assert.equal(card(at,'supply').target!.selectionId,near.id);assert.equal(card(at,'supply',{sourceId:far.id}).target!.selectionId,far.id);assert.match(card(at,'supply').summary,/ordinary pickup/i);
});
test('guidance resolves the finite one-cargo terminal case to unloading and recognizes exhausted empty routes',()=>{
 const one=card(cargo(1,true),'supply');assert.equal(one.status,'actionable');assert.match(one.title,/unload/i);assert.equal(one.target!.selectionId,'workshop');assert.match(one.summary,/no eligible cache/i);
 const empty=card(cargo(0,true),'supply');assert.equal(empty.status,'complete');assert.match(empty.summary,/do not respawn/i);assert.match(empty.summary,/ordinary inventory donations/i);
});
test('guidance directs two cargo to the true donation station and exposes real cooldown and stock blockers',()=>{
 const s=cargo(2),ready=card(s,'supply');assert.equal(ready.status,'actionable');assert.equal(ready.target!.panel,'town-supply');assert.equal(ready.target!.selectionId,'workshop');
 const waiting=card({...s,townLife:{...s.townLife!,cooldowns:{...s.townLife!.cooldowns,donate:8}}},'supply');assert.equal(waiting.status,'waiting');assert.match(waiting.summary,/8.0 seconds/);
 const full=card({...s,townLife:{...s.townLife!,resources:{...s.townLife!.resources,materials:600}}},'supply');assert.equal(full.status,'blocked');assert.match(full.summary,/unload/i);assert.deepEqual(full.target,ready.target);
});
test('guidance distinguishes default recipe shortage, paid achieved construction, and completed repair availability',()=>{
 const s=base(),poor={...s,townLife:{...s.townLife!,resources:{...s.townLife!.resources,materials:0}}};assert.equal(card(poor,'construction').status,'blocked');assert.match(card(poor,'construction').progress,/Default quote 31/);
 const built=building(),underway=card(built,'construction'),worker=built.townLife!.residents.find(r=>r.id===built.workshopConstruction!.workerId)!;assert.equal(underway.status,'waiting');assert(underway.summary.includes(worker.reason));assert.match(underway.summary,/already paid/);assert.match(underway.target!.label,/prefabrication/);
 const complete={...built,workshopConstruction:advanceWorkshopConstruction(built.workshopConstruction!,120)};assert.equal(card(complete,'construction').status,'complete');assert.match(card(complete,'construction').summary,/undamaged/);const hurt={...complete,player:{...complete.player,hp:70}};assert.equal(card(hurt,'construction').status,'actionable');assert.deepEqual(card(hurt,'construction').target,{id:'workshop-board',label:'Northwest workshop board',...WORKSHOP_BOARD,panel:'workshop-construction'});
});
test('restoration guidance keeps selected habitat and current harvestability distinct from historical completion',()=>{
 const s=earnedCareWorld(),plan=worldRestorationPlan(s.seed),site=plan.sites[0]!,other=plan.sites[1]!;assert.equal(card(s,'restoration',{siteId:site.id}).status,'complete');assert.equal(card(s,'restoration',{siteId:other.id}).target!.selectionId,other.id);assert.notEqual(card(s,'restoration',{siteId:other.id}).status,'complete');
 const unhealthy=structuredClone(s);unhealthy.restoration!.sites[0]!.cells[0]!.health=69;unhealthy.restoration!.sites[0]!.stableTicks=0;assert.equal(card(unhealthy,'restoration',{siteId:site.id}).status,'complete');assert.equal(card(unhealthy,'care',{siteId:site.id}).status,'blocked');assert.match(card(unhealthy,'restoration',{siteId:site.id}).summary,/current viable surplus is insufficient/);
});
test('care guidance distinguishes carried biomass, delivered stock, actual committed doses and optional refill',()=>{
 let s=earnedCareWorld();const site=worldRestorationPlan(s.seed).sites[0]!;assert.equal(card(s,'care',{siteId:site.id}).status,'actionable');s=atCare(s,'collect');s=applyAction(s,{type:'restoration-care',command:careCommand(s,'collect')});const carried=card(s,'care');assert.equal(carried.target!.selectionId,'apothecary');assert.match(carried.summary,/5 carried/);
 s=atCare(s,'deliver');s=applyAction(s,{type:'restoration-care',command:careCommand(s,'deliver')});const stocked=card(s,'care');assert.equal(stocked.status,'waiting');assert.match(stocked.title,/delivered/i);assert.match(stocked.progress,/5 delivered/);assert.match(stocked.progress,/0 portions committed/);
 const consumed={...s,townLife:{...s.townLife!,habitatCare:{received:5,stock:0,used:5}}};const done=card(consumed,'care');assert.equal(done.status,'complete');assert.match(done.summary,/not completed healing/);assert.match(done.summary,/optional/);assert.match(done.progress,/5 portions committed on actual care arrival/);
 const full={...s,townLife:{...s.townLife!,habitatCare:{received:20,stock:20,used:0}},restorationCare:{version:1 as const,revision:8,carried:0,delivered:20,deliveries:4}};assert.equal(card(full,'care').status,'waiting');assert.match(card(full,'care').title,/stock is full/);
});
test('guidance compass follows world north plus Z and does not invent a traversable route',()=>{
 const p={x:0,z:0};assert.deepEqual(campaignTargetDirection(p,{x:0,z:10}),{distance:10,bearing:'N'});assert.equal(campaignTargetDirection(p,{x:10,z:0}).bearing,'E');assert.equal(campaignTargetDirection(p,{x:0,z:-10}).bearing,'S');assert.equal(campaignTargetDirection(p,{x:-10,z:0}).bearing,'W');assert.equal(campaignTargetDirection(p,{x:2,z:2}).bearing,'NE');assert.equal(campaignTargetDirection(p,p).bearing,'Here');
});
