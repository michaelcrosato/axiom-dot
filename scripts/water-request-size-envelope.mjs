import {createConnectedState,enableEconomy,enableEcology,enableEncounters,enableWaterRequests,applyAction,worldEndpoints,allWorldObjects} from '../src/world.ts';
import {causalPlan,planRoute} from '../src/causal.ts';
const seed=4294967295,bytes=x=>new TextEncoder().encode(JSON.stringify(x)).length,LONG=0.0000012345678901234567;
let s=enableWaterRequests(enableEconomy(enableEcology(enableEncounters(createConnectedState(seed)))));s=applyAction(s,{type:'move',...worldEndpoints(s).entrance});s=applyAction(s,{type:'enter-cave'});const p=causalPlan(seed),baseBytes=bytes(s);
const req=[3,1,999999999.75,[LONG,LONG,999999996,LONG]];
s.causal.waterRequests.records=Array.from({length:82},()=>structuredClone(req));s.causal.waterRequests.revision=82;
s.economy.records=Array.from({length:144},(_,i)=>({id:`economy:1:${seed}/record/${i+1}`,kind:'manufactured',workplaceId:s.economy.workshops[0].id,at:LONG,service:LONG}));s.economy.incidents=Array.from({length:8},(_,i)=>({id:`economy:1:${seed}/wear/${i+1}`,workplaceId:s.economy.workshops[0].id,cause:'natural-wear',createdAt:LONG,serviceAtCreation:LONG,resolvedAt:LONG}));
s.ecology.records=Array.from({length:132},(_,i)=>({id:`ecology:1:${seed}:event/${i+1}`,kind:'harvested',tick:4000000000000,plotId:s.ecology.plots[0].id,species:'reedmoss',amount:LONG,revision:96}));
s.causal.commonsTrade={version:1,hash:'12345678',planId:`commons-trade:1:${seed}`,startedAt:LONG,revision:4,baseline:{materials:4,agentMaterialsSpent:0,playerWater:20,homes:p.settlements.map(h=>({id:h.id,playerDelivered:20}))},records:Array.from({length:4},(_,i)=>({id:`commons-trade:1:${seed}/exchange/${i+1}`,revision:i+1,at:LONG,settlementId:p.settlements[1].id,water:{playerCanisters:1,householdLitres:4},scrap:{communalDebit:1,playerCredit:1},before:{materials:4,agentMaterialsSpent:4,playerWater:20,reserve:LONG,delivered:LONG,playerDelivered:20,consumed:LONG}}))};
s.causal.caveReceipts={version:1,hash:'12345678',received:LONG,depot:LONG,carriers:p.agents.filter(a=>a.role==='carrier').map(a=>({id:a.id,litres:LONG})),households:p.settlements.map(h=>({id:h.id,litres:LONG})),credits:p.settlements.map(h=>({jobId:`${p.id}/episode/water/${h.nodeId}`,litres:LONG,at:LONG}))};
s.equipment.active={version:2,seed,parts:{grip:'braced',shaft:'ironwood',head:'prism'},recipeHash:'12345678'};
s.collected=allWorldObjects(s).filter(o=>['scrap','core','water'].includes(o.kind)).map(o=>o.id);s.defeated=allWorldObjects(s).filter(o=>o.kind==='enemy').map(o=>o.id);
s.waterworks.parts=Array.from({length:12},(_,i)=>({id:'module-'+String(i+1).padStart(25,'0'),kind:'reservoir',x:12,z:12,rotation:3}));s.waterworks.links=Array.from({length:24},(_,i)=>`${s.waterworks.parts[i%12].id}.branch>${s.waterworks.parts[(i+1)%12].id}.in`);
// Existing production messages are short ASCII prose; this generous fixed allowance
// is well above every actual new request/barter message. Arbitrary edited prose is excluded.
s.events=Array.from({length:20},()=> 'x'.repeat(300));
const routes=p.nodes.flatMap(a=>p.nodes.map(b=>planRoute(p,a.id,b.id,[],false)??[])).sort((a,b)=>b.join(',').length-a.join(',').length)[0];
s.causal.agents=Array.from({length:6},(_,i)=>({...structuredClone(s.causal.agents[i%s.causal.agents.length]),route:routes,status:'Waiting for sufficient deliverable water or a restored supply',task:{kind:'repair',targetId:p.workplaces[0].id}}));
const longest=s.causal.jobs.sort((a,b)=>bytes(b)-bytes(a))[0];s.causal.jobs=Array.from({length:8},()=>structuredClone(longest));
const output={method:'Conservative serialization-only envelope, deliberately not a playable/imported state; all bounded histories maxed simultaneously even though shared finite stock prevents this combination',baseWithAllOptionalPackSkeletons:baseBytes,requestPack:bytes(s.causal.waterRequests),economy:bytes(s.economy),ecology:bytes(s.ecology),commons:bytes(s.causal.commonsTrade),full:bytes(s),numericGrowthAllowance:4096,conservativeTotal:bytes(s)+4096,headroom:100000-bytes(s)-4096};
if(output.conservativeTotal>=95000)throw new Error('Bounded serialization envelope does not preserve the target 5 KB import headroom');
console.log(JSON.stringify(output,null,2));
