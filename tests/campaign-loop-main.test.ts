import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {mainFunction} from './helpers/main-source.ts';
import {createRegionalState,enableStartingTown,enableRestoration,worldRestorationPlan,worldTownSupplySources,serializeSave} from '../src/world.ts';
import {campaignGuidanceMapTarget,campaignGuidanceMarkerId} from '../src/campaign-guidance-map.ts';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
test('nearby restoration interaction selects the actual dock or deployed machine site while retaining the personal goal',()=>{
 const sites=worldRestorationPlan(73129).sites,state={seed:73129,restoration:{machine:{siteId:sites[2]!.id}}};let object={kind:'restoration-control',id:sites[1]!.id},selection={goalId:'care',siteId:sites[0]!.id,sourceId:'remembered-cache'};const opened:string[]=[],messages:string[]=[];
 const deps={state,transitioning:false,panel:{hidden:true},activeConversation:null,contactRequestId:null,contactUI:()=>null,labActive:false,nearest:()=>object,openPanel:(id:string)=>opened.push(id),toast:(s:string)=>messages.push(s),worldRestorationPlan,getCampaignGuidanceSelection:()=>selection,setCampaignGuidanceSelection:(s:typeof selection)=>{selection=s;}};
 const interact=new Function(...Object.keys(deps),stripTypeScriptTypes(mainFunction(main,'interact'))+';return interact;')(...Object.values(deps));
 interact();assert.equal(selection.siteId,sites[1]!.id);assert.equal(selection.goalId,'care');assert.equal(selection.sourceId,'remembered-cache');assert.deepEqual(opened,['restoration']);
 object={kind:'restoration-control',id:'restoration-machine'};interact();assert.equal(selection.siteId,sites[2]!.id);assert.equal(opened.length,2);
 state.restoration.machine.siteId='expired-site';interact();assert.equal(opened.length,2);assert.equal(selection.siteId,sites[2]!.id);assert.match(messages.at(-1)!,/no longer available/);
});
test('actual board map dispatch resolves selected sources and both delivery stations without tracking, payment or travel',()=>{
 const state=enableRestoration(enableStartingTown(createRegionalState(73129))),before=serializeSave(state),sources=worldTownSupplySources(state),sites=worldRestorationPlan(state.seed).sites,mapped:any[]=[],messages:string[]=[];
 const deps={state,campaignGuidanceReady:()=>true,campaignGuidanceOptions:()=>({}),campaignGuidanceMapTarget,campaignGuidanceMarkerId,mapCampaignGuidanceTarget:(t:unknown)=>mapped.push(t),toast:(s:string)=>messages.push(s)};
 const map=new Function(...Object.keys(deps),stripTypeScriptTypes(mainFunction(main,'mapCampaignLoopDestination'))+';return mapCampaignLoopDestination;')(...Object.values(deps));
 map('supply',sources[2]!.id);map('supply','workshop');map('care',sites[2]!.id);map('care','apothecary');assert.deepEqual(mapped.map(t=>t.selectionId),[sources[2]!.id,'workshop',sites[2]!.id,'apothecary']);assert.deepEqual(mapped.map(t=>t.panel),['town-supply','town-supply','restoration-care','restoration-care']);assert.equal(serializeSave(state),before);
 state.collected.push(sources[2]!.id);map('supply',sources[2]!.id);map('care','not-a-habitat');assert.equal(mapped.length,4);assert.equal(messages.length,2);
 assert.ok(main.includes("map:targetId=>mapCampaignLoopDestination('supply',targetId)"));assert.ok(main.includes("map:targetId=>mapCampaignLoopDestination('care',targetId)"));
});
test('existing nearby town service keeps its normal inspector and reachable supply entry',()=>{
 const opened:string[]=[],buttons:any[]=[],deps={state:{regional:true},panel:{append:(v:unknown)=>buttons.push(v)},document:{createElement:()=>({textContent:'',onclick:null})},openPanel:(s:string)=>opened.push(s)};
 new Function(...Object.keys(deps),stripTypeScriptTypes(mainFunction(main,'appendTownSupplyEntry'))+';appendTownSupplyEntry();')(...Object.values(deps));assert.equal(buttons.length,2);buttons[1].onclick();assert.deepEqual(opened,['town-supply']);assert.ok(main.includes("if(type==='town-life')"));assert.ok(main.includes('appendTownSupplyEntry();return;'));
});
