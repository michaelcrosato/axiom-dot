import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,commitRegionalFood,createRegionalState,enableRegionalSupply,enableRegionalTrade,enableRegionalFood,validateSave,serializeSave,parseSave,type State} from '../src/world.ts';
import {regionalFoodPlan} from '../src/regional-food.ts';
import {createRegionalTrade,advanceRegionalTrade,regionalTradePlan,regionalTradeCommandPosition,type RegionalTradeCommand} from '../src/regional-trade.ts';
import {oldFoodCampaign,readyFoodCampaign,foodCommand} from './helpers/regional-food-campaign.ts';
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));

test('solo accepted food actions require physical ground and preserve every original water and freight ledger',{timeout:120_000},()=>{
 const source=readyFoodCampaign(),command=foodCommand(source);for(const authority of [{grounded:false},{feetY:NaN},{feetY:regionalFoodPlan(source.seed).farms[0]!.interactionPosition.y+10}])assert.equal(commitRegionalFood(source,command.command,authority),source);
 const next=commitRegionalFood(source,command.command,{grounded:true,feetY:regionalFoodPlan(source.seed).farms[0]!.interactionPosition.y});assert.notEqual(next,source);assert.equal(next.frontierFood!.farms[0]!.starterGranted,4);assert.equal(next.frontierFood!.farms[0]!.store,4);assert.equal(next.frontierFood!.farms[0]!.harvested,0);assert.equal(commitRegionalFood(next,command.command),next);for(const key of ['frontierSupply','frontierTrade','ecology','inventory','wilderness'] as const)assert.equal(next[key],source[key]);assert(validateSave(next));
});
test('near and streamed-away food share bounded active elapsed time and parse reload provides no offline catchup',{timeout:120_000},()=>{
 let near=readyFoodCampaign();near=applyAction(near,foodCommand(near));let far=applyAction(parseSave(serializeSave(near))!,{type:'move',x:-1300,z:1300});for(let i=0;i<120;i++){near=applyAction(near,{type:'tick',dt:.125});far=applyAction(far,{type:'tick',dt:.125});}assert.deepEqual(near.frontierFood,far.frontierFood);assert.deepEqual(near.frontierSupply,far.frontierSupply);assert.equal(near.frontierFood!.ticks,60);
 const raw=serializeSave(far),restored=parseSave(raw)!;assert.equal(serializeSave(restored),raw);assert.deepEqual(restored.frontierFood,far.frontierFood);for(const dt of [NaN,Infinity,-1,0])assert.equal(applyAction(far,{type:'tick',dt}),far);
 const bounded=applyAction(far,{type:'tick',dt:3600});assert.equal(bounded.frontierFood!.ticks-far.frontierFood!.ticks,4);assert.equal(bounded.frontierSupply!.ticks-far.frontierSupply!.ticks,4);assert(validateSave(bounded));const dead={...far,player:{...far.player,hp:0}};assert.equal(applyAction(dead,{type:'tick',dt:1}),dead);
});
test('rollout from a fractional existing supply clock preserves its exact baseline and accepts every later fractional frame',{timeout:120_000},()=>{
 const old=applyAction(oldFoodCampaign(),{type:'tick',dt:.13});assert.equal(old.frontierSupply!.remainder,.13);let state=enableRegionalFood(old);assert.equal(state.frontierFood!.ticks,0);assert.equal(state.frontierFood!.remainder,0);assert.equal(state.frontierFood!.supplyStartTick,old.frontierSupply!.ticks);assert.equal(state.frontierFood!.supplyStartRemainder,old.frontierSupply!.remainder);
 for(const dt of [.07,.07,.04,.09,.13,.23,.99,.01]){state=applyAction(state,{type:'tick',dt});assert(validateSave(state),`fraction ${dt}`);state=parseSave(serializeSave(state))!;assert(state);}assert(state.frontierFood!.ticks>0);
});
test('an already saturated collector clock never grants food historic overflow or invalidates ongoing accepted time',()=>{
 const old=enableRegionalTrade(enableRegionalSupply(createRegionalState(42))),supply=clone(old.frontierSupply!);supply.ticks=1_000_000_000;for(const outpost of supply.outposts)for(const resident of outpost.residents){resident.thirst=100;resident.thirstOverflow=60+supply.ticks*.03-100;}
 const saturated=parseSave(JSON.stringify({...old,frontierSupply:supply}))!;assert(saturated);let state=enableRegionalFood(saturated);assert.equal(state.frontierFood!.ticks,0);assert.equal(state.frontierFood!.supplyStartTick,supply.ticks);for(let i=0;i<6;i++){state=applyAction(state,{type:'tick',dt:1});assert(validateSave(state));}assert.equal(state.frontierSupply!.ticks,supply.ticks);assert(state.frontierFood!.ticks>0);assert(state.frontierFood!.farms.every(f=>f.waterCaptured===0&&f.sourceSpilled===0));
});
test('certified food cannot be substituted onto a separately valid collector history from the same seed',{timeout:120_000},()=>{
 const good=readyFoodCampaign(),idle=enableRegionalTrade(enableRegionalSupply(createRegionalState(good.seed))),supply=clone(idle.frontierSupply!);supply.ticks=good.frontierSupply!.ticks;supply.remainder=good.frontierSupply!.remainder;for(const outpost of supply.outposts)for(const resident of outpost.residents){const thirst=Math.round((60+supply.ticks*.03)*1e6)/1e6;resident.thirst=Math.min(100,thirst);resident.thirstOverflow=Math.max(0,Math.round((thirst-100)*1e6)/1e6);}
 const alternate={...good,frontierSupply:supply};delete alternate.frontierFood;const certifiedAlternate=parseSave(JSON.stringify(alternate))!;assert(certifiedAlternate,'alternative history itself is valid');const substituted={...certifiedAlternate,frontierFood:good.frontierFood};assert.equal(validateSave(substituted),false);assert.equal(parseSave(JSON.stringify(substituted)),null);assert.throws(()=>serializeSave(substituted));assert.doesNotThrow(()=>applyAction(substituted,{type:'tick',dt:1}));
});

test('a completed store proof cannot authorize food against a separately valid still-building current store',{timeout:120_000},()=>{
 let state={...oldFoodCampaign(),frontierTrade:createRegionalTrade(73129)};const plan=regionalTradePlan(state.seed);
 const perform=(type:RegionalTradeCommand['type'],targetId:string)=>{const command={type,targetId,expectedRevision:state.frontierTrade.revision},p=regionalTradeCommandPosition(state.seed,command)!;state={...state,player:{...state.player,x:p.x,z:p.z}};state=applyAction(state,{type:'regional-trade',command}) as typeof state;};
 perform('start-source',plan.sources[0]!.id);perform('clear-route',plan.routes[0]!.id);for(let i=0;i<2000&&state.frontierTrade.routes[0]!.destinationStock<4;i++)state={...state,frontierTrade:advanceRegionalTrade(state.frontierTrade,1)};assert.equal(state.frontierTrade.routes[0]!.destinationStock,4);perform('build-store',plan.projects[0]!.id);const building=state.frontierTrade;assert.equal(building.routes[0]!.builtAt,null);
 for(let i=0;i<30&&state.frontierTrade.routes[0]!.builtAt===null;i++)state={...state,frontierTrade:advanceRegionalTrade(state.frontierTrade,1)};assert.notEqual(state.frontierTrade.routes[0]!.builtAt,null);assert(validateSave({...state,frontierTrade:building}));
 let food=enableRegionalFood(state),p=regionalFoodPlan(state.seed).farms[0]!.interactionPosition;food={...food,player:{...food.player,x:p.x,z:p.z}};food=applyAction(food,foodCommand(food));assert.equal(food.frontierFood!.revision,1);assert(validateSave(food));const substituted={...food,frontierTrade:building};assert.equal(validateSave(substituted),false);assert.equal(parseSave(JSON.stringify(substituted)),null);assert.throws(()=>serializeSave(substituted));
});
