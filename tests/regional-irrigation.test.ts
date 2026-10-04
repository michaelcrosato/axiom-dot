import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applyAction,commitRegionalFood,enableRegionalFood,enableEcology,worldObjects,worldEndpoints,validateSave,serializeSave,parseSave,type State} from '../src/world.ts';
import {regionalFoodPlan,regionalFoodInteractions,regionalFoodConservation,regionalFoodCost,regionalFoodSummary,validRegionalFood,validRegionalFoodCommand,REGIONAL_FOOD_IRRIGATION_LITRES} from '../src/regional-food.ts';
import {regionalSupplyWeather} from '../src/regional-supply.ts';
import {ecologyPlan,ECOLOGY_RULES} from '../src/ecology.ts';
import {COMMONS_TRADE_RULES} from '../src/commons-trade.ts';
import {createRegionalFoodLabCampaign} from '../src/regional-food-lab.ts';
import {foodCommand,atFoodCommand} from './helpers/regional-food-campaign.ts';
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
let dryBytes:string|undefined;
function dry(version:1|2=2){dryBytes??=serializeSave(createRegionalFoodLabCampaign(73129,true,2,1));return atFoodCommand(enableRegionalFood(parseSave(dryBytes)!,version));}
function collect(s:State,count=1){for(const o of worldObjects(s).filter(o=>o.kind==='water'&&!s.collected.includes(o.id)).slice(0,count)){s=applyAction(s,{type:'move',x:o.x,z:o.z});const before=s;s=applyAction(s,{type:'collect',id:o.id});assert.equal(s.inventory.water,before.inventory.water+1);}return atFoodCommand(s);}
function started(s=collect(dry())){return applyAction(s,foodCommand(s));}
function irrigate(s:State){return applyAction(s,foodCommand(s,'irrigate-farm'));}
function check(s:State){assert(validateSave(s));const bytes=serializeSave(s),loaded=parseSave(bytes)!;assert(loaded);assert.equal(serializeSave(loaded),bytes);assert(regionalFoodConservation(s.frontierFood!).every(r=>r.balanced));return loaded;}

test('earned emergency canister makes exactly two dry crops, eight carried portions and real harvested meals without changing collector weather or water history',{timeout:120_000},()=>{
 let control=started(),treated=irrigate(control);assert.equal(REGIONAL_FOOD_IRRIGATION_LITRES,4);assert.equal(ECOLOGY_RULES.canisterWater,4);assert.equal(COMMONS_TRADE_RULES.canisterLitres,4);
 assert.equal(treated.inventory.water,0);assert.equal(control.inventory.water,1);assert.equal(treated.frontierFood!.farms[0]!.water,4);assert.equal(treated.frontierFood!.farms[0]!.waterIrrigated,4);assert.equal(treated.frontierFood!.farms[0]!.waterCaptured,0);assert.deepEqual(treated.frontierSupply,control.frontierSupply);assert.deepEqual(treated.frontierTrade,control.frontierTrade);
 const p=regionalFoodPlan(treated.seed).farms[0]!,phases=new Set<string>();assert.equal(regionalSupplyWeather(treated.frontierSupply!,p.siteId).phase,'dry');
 for(let tick=1;tick<=1600;tick++){control=applyAction(control,{type:'tick',dt:.25});treated=applyAction(treated,{type:'tick',dt:.25});phases.add(treated.frontierFood!.farms[0]!.activity);assert.deepEqual(treated.frontierSupply,control.frontierSupply);assert.deepEqual(regionalSupplyWeather(treated.frontierSupply!,p.siteId),regionalSupplyWeather(control.frontierSupply!,p.siteId));assert.equal(treated.frontierFood!.farms[0]!.sourceSpilled,control.frontierFood!.farms[0]!.sourceSpilled);if(tick%200===0)treated=check(treated);}
 const f=treated.frontierFood!.farms[0]!,untreated=control.frontierFood!.farms[0]!;assert.equal(f.harvests,2);assert.equal(f.harvested,8);assert.equal(f.waterUsed,4);assert.equal(f.water,0);assert.equal(f.waterCaptured,0);assert.equal(f.waterLost,0);assert.equal(f.delivered,8);assert(f.meals>4,'meals exceed the four separately counted starter portions');assert.equal(untreated.harvested,0);assert.equal(untreated.crop,'empty');assert.equal(untreated.waterUsed,0);assert(['loading','outbound','unloading','eating','returning'].every(p=>phases.has(p)));assert.equal(regionalFoodCost(treated.frontierFood).water,1);check(control);check(treated);
});

test('missing canister, unstarted farm, stale revision, remote/airborne pose and one-use exhaustion reject atomically',{timeout:120_000},()=>{
 const unstarted=collect(dry()),without=started(dry()),source=started();assert.equal(irrigate(unstarted),unstarted);assert.equal(irrigate(without),without);assert.equal(source.inventory.water,1);
 const command=foodCommand(source,'irrigate-farm').command,p=regionalFoodPlan(source.seed).farms[0]!.interactionPosition;
 assert.equal(commitRegionalFood(source,{...command,expectedRevision:0}),source);assert.equal(commitRegionalFood(source,command,{grounded:false,feetY:p.y}),source);assert.equal(commitRegionalFood(source,command,{grounded:true,feetY:p.y+1}),source);const remote=applyAction(source,{type:'move',x:p.x+10,z:p.z});assert.equal(commitRegionalFood(remote,command),remote);
 const once=irrigate(source);assert.notEqual(once,source);assert.equal(commitRegionalFood(once,command),once);const reearned=collect(once);assert.equal(irrigate(reearned),reearned);const job=regionalFoodInteractions(source.seed,reearned.frontierFood,reearned).find(j=>j.kind==='irrigate-farm'&&j.farmId===pId(source))!;assert.equal(job.enabled,false);assert.match(job.reason,/one emergency canister is already used/);assert.equal(regionalFoodSummary(reearned.frontierFood!,source.seed,pId(source))!.waterIrrigated,4);check(reearned);
});
function pId(s:State){return regionalFoodPlan(s.seed).farms[0]!.id;}

test('all four litres must fit; naturally rain-full cistern rejects without debit or lost emergency water',{timeout:120_000},()=>{
 let s=started();for(let t=0;t<1200&&s.frontierFood!.farms[0]!.water<=2;t++)s=applyAction(s,{type:'tick',dt:1});assert(s.frontierFood!.farms[0]!.water>2);const before=serializeSave(s),next=irrigate(s);assert.equal(next,s);assert.equal(serializeSave(next),before);assert.equal(s.inventory.water,1);assert.equal(s.frontierFood!.farms[0]!.waterIrrigated,0);const job=regionalFoodInteractions(s.seed,s.frontierFood,s).find(j=>j.kind==='irrigate-farm'&&j.farmId===pId(s))!;assert.match(job.reason,/all 4 L/);check(s);
});

test('v1 keeps exact schema and byte identity; new v2 explicitly bounds three one-time transfers and eighteen total receipts',{timeout:120_000},()=>{
 const legacy=collect(dry(1)),bytes=serializeSave(legacy);assert.equal(enableRegionalFood(legacy),legacy);assert.equal(serializeSave(parseSave(bytes)!),bytes);assert(legacy.frontierFood!.farms.every(f=>!Object.hasOwn(f,'waterIrrigated')));assert(!regionalFoodInteractions(legacy.seed,legacy.frontierFood,legacy).some(a=>a.kind==='irrigate-farm'));const old=started(legacy);assert.equal(irrigate(old),old);
 assert.equal(dry().frontierFood!.version,2);assert(validRegionalFoodCommand({type:'irrigate-farm',targetId:pId(old),expectedRevision:17}));assert(!validRegionalFoodCommand({type:'irrigate-farm',targetId:pId(old),expectedRevision:19}));
 let s=collect(dry(),3);for(let i=0;i<3;i++){s=atFoodCommand(s,'start-farm',i);s=applyAction(s,foodCommand(s,'start-farm',i));s=applyAction(s,foodCommand(s,'irrigate-farm',i));}assert.equal(s.inventory.water,0);assert.equal(s.frontierFood!.revision,6);assert.equal(regionalFoodCost(s.frontierFood).water,3);assert(s.frontierFood!.farms.every(f=>f.waterIrrigated===4));check(s);
 for(let second=0;second<1800&&s.frontierFood!.revision<18;second++){for(let i=0;i<3;i++){const job=regionalFoodInteractions(s.seed,s.frontierFood,s).find(j=>j.kind==='tend-crop'&&j.farmId===regionalFoodPlan(s.seed).farms[i]!.id&&j.enabled);if(job){s=atFoodCommand(s,'tend-crop',i);s=applyAction(s,foodCommand(s,'tend-crop',i));}}s=applyAction(s,{type:'tick',dt:1});}
 assert.equal(s.frontierFood!.revision,18);assert.equal(s.frontierFood!.receipts.length,18);assert(s.frontierFood!.farms.every(f=>f.tended===4));assert.equal(regionalFoodCost(s.frontierFood).water,3);check(s);
 for(const target of [legacy,s]){const bad=clone(target);bad.frontierFood!.version=target.frontierFood!.version===1?2:1;assert.equal(validateSave(bad),false);}const extra=clone(legacy);extra.frontierFood!.farms[0]!.waterIrrigated=0;assert.equal(validateSave(extra),false);
});

test('inventory, receipt and imported-litres forgeries cannot mint or double-spend water, including exact replay-cache boundaries',{timeout:120_000},()=>{
 const initial=started(),s=irrigate(initial);check(initial);check(s);const mutations:((s:State)=>void)[]=[x=>x.inventory.water++,x=>x.collected.splice(x.collected.indexOf(worldObjects(x).find(o=>o.kind==='water')!.id),1),x=>x.frontierFood!.farms[0]!.water++,x=>x.frontierFood!.farms[0]!.waterIrrigated=8,x=>delete x.frontierFood!.farms[0]!.waterIrrigated,x=>x.frontierFood!.farms[0]!.waterCaptured=4,x=>{const r=clone(x.frontierFood!.receipts.at(-1)!);r.revision++;x.frontierFood!.receipts.push(r);x.frontierFood!.revision++;},x=>{x.frontierFood!.receipts.at(-1)!.type='tend-crop';}];
 for(const mutate of mutations){const bad=clone(s);mutate(bad);assert.equal(validateSave(bad),false);assert.equal(parseSave(JSON.stringify(bad)),null);assert.throws(()=>serializeSave(bad));}
 const noDebit={...s,inventory:initial.inventory};assert.equal(validateSave(noDebit),false);assert(validRegionalFood(s.frontierFood,s));assert.equal(regionalFoodCost(s.frontierFood).water,1);check(s);
});

test('ordinary fractional-time cold replay, save reload and frame partition preserve the atomic transfer and downstream meals',{timeout:120_000},()=>{
 let s=started();s=applyAction(s,{type:'tick',dt:.13});s=irrigate(s);assert.equal(s.frontierFood!.receipts.at(-1)!.remainder,.13);let split=check(s),whole=s;for(let i=0;i<120;i++){whole=applyAction(whole,{type:'tick',dt:1});for(let n=0;n<10;n++)split=applyAction(split,{type:'tick',dt:.1});}assert.deepEqual(split.frontierFood,whole.frontierFood);assert.deepEqual(split.frontierSupply,whole.frontierSupply);s=check(whole);
 const dir=mkdtempSync(join(tmpdir(),'axiom-irrigation-cold-'));try{const file=join(dir,'save.json');writeFileSync(file,serializeSave(s));const world=new URL('../src/world.ts',import.meta.url).href;const text=execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',`import {readFileSync} from 'node:fs';import {parseSave,serializeSave} from ${JSON.stringify(world)};const raw=readFileSync(process.argv[1],'utf8'),s=parseSave(raw);if(!s||serializeSave(s)!==raw)throw Error('Cold replay differs');const bad=JSON.parse(raw);bad.inventory.water++;if(parseSave(JSON.stringify(bad)))throw Error('Invented canister accepted');console.log(JSON.stringify({version:s.frontierFood.version,water:s.inventory.water,litres:s.frontierFood.farms[0].waterIrrigated,harvested:s.frontierFood.farms[0].harvested}));`,file],{encoding:'utf8'});assert.equal(JSON.parse(text).litres,4);}finally{rmSync(dir,{recursive:true,force:true});}
});

test('ecology and Mossbank still compete for the same finite earned canisters with strict global spending conservation',{timeout:120_000},()=>{
 let s=enableEcology(collect(dry(),3));const garden=ecologyPlan(s.seed).plots[0]!;s=applyAction(s,{type:'move',x:garden.position.x,z:garden.position.z});s=applyAction(s,{type:'ecology',command:{type:'water',plotId:garden.id,expectedRevision:s.ecology!.revision}});assert.equal(s.inventory.water,2);assert.equal(s.ecology!.canistersSpent,1);s=atFoodCommand(s);s=started(s);s=irrigate(s);assert.equal(s.inventory.water,1);check(s);const end=worldEndpoints(s).settlement;s=applyAction(s,{type:'move',x:end.x,z:end.z});assert.equal(applyAction(s,{type:'deliver-water'}),s);
 let moss=collect(dry(),3);moss=applyAction(moss,{type:'move',x:end.x,z:end.z});moss=applyAction(moss,{type:'deliver-water'});assert.equal(moss.waterRestored,true);assert.equal(moss.inventory.water,0);moss=started(atFoodCommand(moss));assert.equal(irrigate(moss),moss);check(moss);const fraud={...s,inventory:{...s.inventory,water:3}};assert.equal(validateSave(fraud),false);
});
