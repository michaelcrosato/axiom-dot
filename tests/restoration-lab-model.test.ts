import assert from 'node:assert/strict';
import {test} from 'node:test';
import {advanceRestoration,applyRestorationCommand,restorationBalances,restorationPlayerCost,validRestoration,type RestorationCommand} from '../src/restoration.ts';
import {compileRestorationBody,type RestorationOrgan} from '../src/restoration-body.ts';
import {validHabitatSiteDescriptors,RESTORATION_TUNING_REGISTRY} from '../src/restoration-plan.ts';
import {RESTORATION_LAB_DEFAULT_PRESET,RESTORATION_LAB_MAX_ACTIONS,RESTORATION_LAB_MAX_PRESET_BYTES,RESTORATION_LAB_MAX_SECONDS,RESTORATION_LAB_SCENARIOS,RESTORATION_LAB_SITES,applyRestorationLabCommand,createRestorationLab,createRestorationLabEvidence,moveRestorationLabActor,parseRestorationLabPreset,serializeRestorationLabPreset,stepRestorationLab,updateRestorationLabTuning,validRestorationLabPreset,type RestorationLab,type RestorationLabPreset} from '../src/restoration-lab-model.ts';

const zero={waterMl:0,contaminant:0,energy:0,smoke:0,scent:0,organic:0,filter:0};
const structuralZero={scrap:0,core:0,water:0};
function balanced(lab:RestorationLab){assert.deepEqual(restorationBalances(lab.context.restoration,lab.plan),zero);assert.deepEqual(lab.evidence.balances,zero);assert.deepEqual(lab.evidence.structuralBalances,structuralZero);assert(validRestoration(JSON.parse(JSON.stringify(lab.context.restoration)),lab.plan));}
function command(lab:RestorationLab,input:Record<string,unknown>):RestorationLab{return applyRestorationLabCommand(lab,{...input,expectedRevision:lab.context.restoration.revision} as RestorationCommand);}
function prepare(organ:RestorationOrgan='filter',scenario:RestorationLabPreset['scenario']='balanced'):RestorationLab {
 let lab=createRestorationLab({...RESTORATION_LAB_DEFAULT_PRESET,scenario,recipe:{...RESTORATION_LAB_DEFAULT_PRESET.recipe,organ},ability:{...RESTORATION_LAB_DEFAULT_PRESET.ability,organ}});const targetId=lab.plan.sites[0]!.id;
 lab=command(lab,{kind:'refit',targetId,recipe:lab.appliedPreset.recipe,ability:lab.appliedPreset.ability});assert(lab.actions.at(-1)!.accepted,lab.lastMessage);
 lab=command(lab,{kind:'service',targetId});assert(lab.actions.at(-1)!.accepted,lab.lastMessage);
 lab=command(lab,{kind:'deploy',targetId});assert(lab.actions.at(-1)!.accepted,lab.lastMessage);return lab;
}

test('standalone descriptors define exactly three independent connected three-cell sites near origin',()=>{
 assert(validHabitatSiteDescriptors(RESTORATION_LAB_SITES));assert.equal(RESTORATION_LAB_SITES.length,3);const ids=new Set<string>();
 for(const site of RESTORATION_LAB_SITES){assert.equal(site.cells.length,3);assert.equal(site.edges.length,2);for(const cell of site.cells){assert(!ids.has(cell.id));ids.add(cell.id);assert(Math.hypot(cell.x,cell.z)<12);}for(const edge of site.edges){assert(site.cells.some(c=>c.id===edge.a));assert(site.cells.some(c=>c.id===edge.b));}}
 assert(Object.isFrozen(RESTORATION_LAB_SITES[0]!.edges[0]!.path[0]));
});
test('create is deterministic, independently disposable, immutable and funded only by finite declared stock',()=>{
 const a=createRestorationLab(),b=createRestorationLab();assert.deepEqual(a,b);assert.notEqual(a.context,b.context);assert.equal(a.context.restoration.machine,null);assert.equal(a.context.restoration.tick,0);assert.equal(a.context.zone,'valley');assert.deepEqual(a.context.inventory,{scrap:16,core:1,water:0});assert(Object.isFrozen(a.context.player));assert(Object.isFrozen(a.evidence.intended.tuning));
 const dock=a.plan.sites[0]!.cells[0]!;assert.equal(Math.hypot(a.context.player.x-dock.x,a.context.player.z-dock.z),2.5);assert(a.context.restoration.sites.every(s=>s.activatedAtTick===null));
 const changed=stepRestorationLab(a,2);assert.equal(a.elapsed,0);assert.equal(b.elapsed,0);assert.notDeepEqual(changed.context.restoration,a.context.restoration);assert.deepEqual(changed.context.restoration.sites,a.context.restoration.sites,'dormant sites remain pristine while model time advances');balanced(changed);
});
test('every setup scenario initializes explicit finite stock without changing seeded habitat reserves',()=>{
 const baseline=createRestorationLab();for(const scenario of RESTORATION_LAB_SCENARIOS){const lab=createRestorationLab({...RESTORATION_LAB_DEFAULT_PRESET,scenario:scenario.id});assert.deepEqual(lab.context.inventory,scenario.inventory);assert.equal(lab.context.player.hp,scenario.hp);assert.deepEqual(lab.context.restoration,baseline.context.restoration);balanced(lab);}
 assert.notEqual(createRestorationLab({...RESTORATION_LAB_DEFAULT_PRESET,seed:7}).plan.id,baseline.plan.id);
});
test('all field evolution is exactly authoritative quarter-second advanceRestoration',()=>{
 const original=prepare('pump');let direct=original.context.restoration;for(let i=0;i<37;i++)direct=advanceRestoration(direct,original.plan,.25,original.context,original.appliedPreset.tuning);
 const advanced=stepRestorationLab(original,9.25);assert.deepEqual(advanced.context.restoration,direct);assert.equal(advanced.elapsed,9.25);assert.equal(original.elapsed,0);balanced(advanced);
});
test('fractional active-time partitions match full ticks and never invent wall-clock progress',()=>{
 const base=createRestorationLab();let a=base,b=base;for(let i=0;i<120;i++)a=stepRestorationLab(a,1/60);for(let i=0;i<20;i++){b=stepRestorationLab(b,.03);b=stepRestorationLab(b,.07);}const c=stepRestorationLab(base,2);assert.deepEqual(a.context.restoration,c.context.restoration);assert.deepEqual(b.context.restoration,c.context.restoration);assert.equal(a.actions.length,1);assert.equal(a.actions[0]!.advancedTicks,8);assert.equal(a.actions[0]!.atSeconds,0);assert.equal(a.actions[0]!.tick,0);balanced(a);
});
test('elapsed time is bounded at 1200 seconds including a fractional final remainder',()=>{
 const lab=stepRestorationLab(stepRestorationLab(createRestorationLab(),.13),5000);assert.equal(lab.elapsed,RESTORATION_LAB_MAX_SECONDS);assert.equal(lab.context.restoration.tick,4800);assert.equal(lab.context.restoration.remainder,0);assert.equal(stepRestorationLab(lab,1),lab);balanced(lab);
});
test('nonfinite, nonpositive and effectively zero deltas cannot change the experiment',()=>{
 const lab=createRestorationLab();for(const seconds of [0,-1,Infinity,-Infinity,NaN,1e-12])assert.equal(stepRestorationLab(lab,seconds),lab);
});
test('refit calls the real command, pays structural cost and does not create working contents',()=>{
 const original=createRestorationLab(),targetId=original.plan.sites[0]!.id,c:RestorationCommand={kind:'refit',targetId,expectedRevision:0,recipe:original.appliedPreset.recipe,ability:original.appliedPreset.ability};
 const expected=applyRestorationCommand(original.context.restoration,original.plan,original.context,c),lab=applyRestorationLabCommand(original,c);assert.deepEqual(lab.context.restoration,expected.state);assert.deepEqual(lab.context.inventory,expected.inventory);assert.equal(lab.context.restoration.sites[0]!.activatedAtTick,0);assert(lab.context.restoration.sites.slice(1).every(s=>s.activatedAtTick===null));assert.equal(lab.context.restoration.machine!.charge,0);assert.equal(lab.context.restoration.machine!.filter,0);assert.equal(lab.context.restoration.machine!.scentCharge,0);assert.equal(lab.context.restoration.machine!.tank.waterMl,0);assert.equal(lab.context.inventory.scrap+restorationPlayerCost(lab.context.restoration).scrap,16);balanced(lab);
});
test('service transfers finite dock supplies and repeat service never refills or duplicates them',()=>{
 let lab=createRestorationLab();const targetId=lab.plan.sites[0]!.id;lab=command(lab,{kind:'refit',targetId,recipe:lab.appliedPreset.recipe,ability:lab.appliedPreset.ability});const before=lab.context.restoration.sites[0]!;lab=command(lab,{kind:'service',targetId});const machine=lab.context.restoration.machine!,after=lab.context.restoration.sites[0]!;assert.equal(before.chargeReserve-after.chargeReserve,machine.charge);assert.equal(before.filterReserve-after.filterReserve,machine.filter);assert.equal(before.scentReserve-after.scentReserve,machine.scentCharge);assert.equal(machine.charge,100);const once=lab;lab=command(lab,{kind:'service',targetId});assert.equal(lab.actions.at(-1)!.accepted,false);assert.equal(lab.context.restoration,once.context.restoration);balanced(lab);
 const dock=lab.plan.sites[0]!.cells[0]!,deploy={kind:'deploy' as const,targetId,expectedRevision:lab.context.restoration.revision},overlap=applyRestorationCommand(lab.context.restoration,lab.plan,{...lab.context,player:{x:dock.x,z:dock.z,hp:lab.context.player.hp}},deploy);assert.equal(overlap.state,lab.context.restoration);assert.match(overlap.message,/footprint/);const deployed=applyRestorationLabCommand(lab,deploy);assert.equal(deployed.context.restoration.machine!.status,'idle','safe beside-dock fixture passes the unchanged real deployment gate');balanced(deployed);
});
test('filter captures real contaminant and spends finite cartridge mass through runtime utility phases',()=>{
 let lab=prepare('filter');const id=lab.plan.sites[0]!.dockCellId;lab=command(lab,{kind:'start',sourceId:id,targetId:id});lab=stepRestorationLab(lab,5);assert(lab.context.restoration.machine!.waste>0);assert.equal(lab.context.restoration.machine!.waste,lab.context.restoration.sinks.filter);assert(lab.context.restoration.machine!.charge<100);balanced(lab);
});
test('pump, vent and beacon produce actual finite runtime effects rather than display-only predictions',()=>{
 for(const organ of ['pump','vent','beacon'] as const){let lab=prepare(organ);const id=lab.plan.sites[0]!.dockCellId;lab=command(lab,{kind:'start',sourceId:id,targetId:organ==='pump'?'tank':id});assert(lab.actions.at(-1)!.accepted,lab.lastMessage);const original=lab;lab=stepRestorationLab(lab,8);assert(lab.context.restoration.machine!.charge<100);if(organ==='pump')assert(lab.context.restoration.machine!.tank.waterMl>0);if(organ==='vent')assert(lab.context.restoration.sinks.heat>stepRestorationLab(command(original,{kind:'stop',targetId:lab.plan.sites[0]!.id}),8).context.restoration.sinks.heat);if(organ==='beacon'){assert(lab.context.restoration.machine!.scentCharge<200);assert(lab.context.restoration.sinks.scent>0);}balanced(lab);}
});
test('stale commands, remote commands and unaffordable refits stay rejected and are recorded honestly',()=>{
 let lab=createRestorationLab({...RESTORATION_LAB_DEFAULT_PRESET,scenario:'lean-stock'});const site=lab.plan.sites[0]!,recipe={...lab.appliedPreset.recipe,support:'sturdy' as const,shell:'alloy' as const};const before=lab.context.restoration;
 lab=command(lab,{kind:'refit',targetId:site.id,recipe,ability:lab.appliedPreset.ability});assert.equal(lab.actions.at(-1)!.accepted,false);assert.equal(lab.context.restoration,before);
 lab=applyRestorationLabCommand(lab,{kind:'refit',targetId:site.id,recipe:lab.appliedPreset.recipe,ability:lab.appliedPreset.ability,expectedRevision:500});assert.equal(lab.actions.at(-1)!.accepted,false);assert.equal(lab.context.restoration,before);
 lab=moveRestorationLabActor(lab,lab.plan.sites[2]!.id);lab=command(lab,{kind:'refit',targetId:site.id,recipe:lab.appliedPreset.recipe,ability:lab.appliedPreset.ability});assert.equal(lab.actions.at(-1)!.accepted,false);assert.match(lab.lastMessage,/3.5 m/);assert.equal(lab.context.restoration,before);balanced(lab);
});
test('relocation is explicit numerical-only actor movement, preserving machine and habitat state',()=>{
 let lab=prepare();const before=lab.context.restoration,inventory=lab.context.inventory;lab=moveRestorationLabActor(lab,lab.plan.sites[2]!.id);assert.equal(lab.context.restoration,before);assert.equal(lab.context.inventory,inventory);assert.equal(lab.actions.at(-1)!.kind,'relocate');assert.match(lab.lastMessage,/Numerical model-only actor relocation/);lab=moveRestorationLabActor(lab,'machine');assert.equal(lab.context.player.x,lab.plan.sites[0]!.x);assert.equal(lab.context.restoration,before);const bad=moveRestorationLabActor(lab,'unknown');assert.equal(bad.actions.at(-1)!.accepted,false);assert.deepEqual(bad.context,lab.context);balanced(bad);
});
test('tuning uses the real registry and preserves stocks, state, current action and elapsed time',()=>{
 let lab=prepare();const id=lab.plan.sites[0]!.dockCellId;lab=command(lab,{kind:'start',sourceId:id,targetId:id});lab=stepRestorationLab(lab,.5);const before=lab;
 for(const definition of RESTORATION_TUNING_REGISTRY){lab=updateRestorationLabTuning(lab,{...lab.appliedPreset.tuning,[definition.key]:definition.max});assert.equal(lab.context.restoration,before.context.restoration);assert.equal(lab.elapsed,before.elapsed);assert.equal(lab.context.inventory,before.context.inventory);assert.equal(lab.appliedPreset.tuning[definition.key],definition.max);}balanced(lab);
 const base=prepare('pump'),slow=stepRestorationLab(updateRestorationLabTuning(base,{...base.appliedPreset.tuning,waterConductance:1}),.25),fast=stepRestorationLab(updateRestorationLabTuning(base,{...base.appliedPreset.tuning,waterConductance:60}),.25);assert.notEqual(slow.context.restoration.sites[0]!.cells[0]!.waterMl,fast.context.restoration.sites[0]!.cells[0]!.waterMl);
});
test('registered tuning rejects extra keys, fractional values and bounds without changing state',()=>{
 const lab=createRestorationLab();for(const definition of RESTORATION_TUNING_REGISTRY)for(const value of [definition.min-1,definition.max+1,definition.default+.5,NaN])assert.throws(()=>updateRestorationLabTuning(lab,{...lab.appliedPreset.tuning,[definition.key]:value}));assert.throws(()=>updateRestorationLabTuning(lab,{...lab.appliedPreset.tuning,invented:5} as never));assert.equal(lab.elapsed,0);
});
test('safe provenance, recipe, ability, seed, scenario and tuning survive canonical preset round trip',()=>{
 const preset={...RESTORATION_LAB_DEFAULT_PRESET,build:'Axiom 2026.10/build:37',source:'source/restoration-runtime.ts',seed:0xffffffff,scenario:'damaged-suit' as const};const raw=serializeRestorationLabPreset(preset),parsed=parseRestorationLabPreset(raw);assert.deepEqual(parsed,preset);assert.equal(serializeRestorationLabPreset(parsed),raw);assert(Object.isFrozen(parsed.recipe));assert(raw.length<RESTORATION_LAB_MAX_PRESET_BYTES);assert.equal(createRestorationLab(parsed,{build:preset.build,source:preset.source}).evidence.build,preset.build);
});
test('preset parsing stages configuration and never applies or imports restoration or inventory state',()=>{
 const lab=prepare(),before=JSON.stringify(lab),staged=parseRestorationLabPreset(serializeRestorationLabPreset({...lab.appliedPreset,seed:88}));assert.equal(staged.seed,88);assert.equal(JSON.stringify(lab),before);for(const key of ['campaign','roomId','credentials','context','restoration','inventory','player','actions','elapsed'])assert.throws(()=>parseRestorationLabPreset(JSON.stringify({...lab.appliedPreset,[key]:{invented:true}})));
});
test('strict preset allowlist rejects nested unknown fields, mismatched organs, foreign scope and invalid seeds',()=>{
 const good=RESTORATION_LAB_DEFAULT_PRESET;const bad=[{...good,version:2},{...good,scope:'campaign'},{...good,kind:'save'},{...good,scenario:'unlimited'},{...good,seed:-1},{...good,seed:1.5},{...good,seed:0x100000000},{...good,recipe:{...good.recipe,extra:true}},{...good,ability:{...good.ability,organ:'beacon'}},{...good,tuning:{...good.tuning,roomId:'room'}},{...good,source:'https://x/?token=secret'},{...good,build:'x'.repeat(161)}];for(const value of bad){assert(!validRestorationLabPreset(value));assert.throws(()=>parseRestorationLabPreset(JSON.stringify(value)));}
 assert.throws(()=>parseRestorationLabPreset('{"__proto__":{"polluted":true}}'));assert.equal(({} as {polluted?:boolean}).polluted,undefined);
});
test('preset parser rejects duplicate keys including nested escaped duplicate names',()=>{
 const raw=serializeRestorationLabPreset(RESTORATION_LAB_DEFAULT_PRESET);assert.throws(()=>parseRestorationLabPreset(raw.replace('"version": 1','"version": 1, "version": 1')),/Duplicate/);assert.throws(()=>parseRestorationLabPreset(raw.replace('"strength": 1','"strength": 1, "\\u0073trength": 1')),/Duplicate/);
});
test('preset parser enforces UTF-8 24 KB before parsing and rejects malformed JSON',()=>{
 assert.throws(()=>parseRestorationLabPreset(' '.repeat(RESTORATION_LAB_MAX_PRESET_BYTES+1)),/24 KB/);assert.throws(()=>parseRestorationLabPreset('界'.repeat(9000)),/24 KB/);assert.throws(()=>parseRestorationLabPreset('{broken}'),/JSON/);assert.throws(()=>parseRestorationLabPreset(null as never));
});
test('preset validator rejects accessors without invoking them',()=>{
 let calls=0;const value={...RESTORATION_LAB_DEFAULT_PRESET};Object.defineProperty(value,'seed',{enumerable:true,get(){calls++;return 8;}});assert(!validRestorationLabPreset(value));assert.equal(calls,0);
});
test('evidence separates staged intent from actual machine, tuning, funds and habitat state',()=>{
 const lab=prepare('filter'),intended={...lab.appliedPreset,recipe:{...lab.appliedPreset.recipe,organ:'beacon' as const},ability:{...lab.appliedPreset.ability,organ:'beacon' as const},tuning:{...lab.appliedPreset.tuning,waterConductance:60}},before=JSON.stringify(lab),evidence=createRestorationLabEvidence(lab,intended);
 assert.equal(evidence.intended.recipe.organ,'beacon');assert.equal(evidence.actual.restoration.machine!.recipe.organ,'filter');assert.equal(evidence.intended.tuning.waterConductance,60);assert.equal(lab.appliedPreset.tuning.waterConductance,20);assert.equal(evidence.actual.preset.tuning.waterConductance,20);assert.deepEqual(evidence.intended.materialCost,compileRestorationBody(intended.recipe).cost);assert.deepEqual(evidence.balances,zero);assert.deepEqual(evidence.structuralBalances,structuralZero);assert.equal(JSON.stringify(lab),before);assert.deepEqual(JSON.parse(JSON.stringify(evidence)),evidence);assert(!JSON.stringify(evidence).includes('roomId'));
});
test('journal retains only 128 entries and exposes the number omitted rather than hiding truncation',()=>{
 let lab=createRestorationLab();for(let i=0;i<140;i++)lab=moveRestorationLabActor(lab,lab.plan.sites[i%3]!.id);assert.equal(lab.actions.length,RESTORATION_LAB_MAX_ACTIONS);assert.equal(lab.actionCount,140);assert.equal(lab.droppedActions,12);assert.equal(lab.actions[0]!.sequence,13);assert.equal(lab.actions.at(-1)!.sequence,140);assert.equal(lab.evidence.droppedActions,12);balanced(lab);
});
test('command-only treatment restores habitat and damaged-suit repair consumes real recovered biomass',()=>{
 let lab=stepRestorationLab(prepare('filter','damaged-suit'),30);const site=lab.plan.sites[0]!;
 for(let round=0;round<2;round++)for(const cell of site.cells){lab=moveRestorationLabActor(lab,'machine');lab=command(lab,{kind:'start',sourceId:cell.id,targetId:cell.id});assert(lab.actions.at(-1)!.accepted,lab.lastMessage);lab=stepRestorationLab(lab,15);balanced(lab);}
 lab=stepRestorationLab(lab,300);assert.notEqual(lab.context.restoration.sites[0]!.completedAtTick,null);const before=lab.context.restoration.sites[0]!.cells.reduce((n,c)=>n+c.biomass,0);lab=moveRestorationLabActor(lab,site.id);lab=command(lab,{kind:'repair',targetId:site.id});assert(lab.actions.at(-1)!.accepted,lab.lastMessage);assert(lab.context.player.hp>40);assert(lab.context.restoration.sites[0]!.repairUsed>0);assert.equal(before-lab.context.restoration.sites[0]!.cells.reduce((n,c)=>n+c.biomass,0),lab.context.restoration.sites[0]!.repairUsed);balanced(lab);
});

test('imported provenance remains on the applied preset and cannot masquerade as current runtime provenance',()=>{
 const imported={...RESTORATION_LAB_DEFAULT_PRESET,build:'older-build',source:'older-source'},lab=createRestorationLab(imported,{build:'current-build',source:'current-source'}),evidence=createRestorationLabEvidence(lab);
 assert.equal(evidence.build,'current-build');assert.equal(evidence.source,'current-source');assert.equal(evidence.actual.preset.build,'older-build');assert.equal(evidence.intended.preset.source,'older-source');assert.throws(()=>createRestorationLab(imported,{build:'bad?token',source:'safe'}));
});
