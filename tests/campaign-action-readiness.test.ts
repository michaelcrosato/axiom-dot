import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMPAIGN_ACTION_READINESS_ENGINE,campaignControlBlockReason,campaignTargetBlockReason,type CampaignControlReadiness,type CampaignTargetReadiness} from '../src/campaign-action-readiness.ts';
const ready:CampaignControlReadiness={reloading:false,loadFailed:false,lab:false,connecting:false,online:false,canAct:true,closed:false,paused:false,hostOnly:false,host:true,valley:true,alive:true,physicsReady:true,transitioning:false,staffBusy:false,contactBusy:false,crouched:false,grounded:true,onTerrain:true};
const target:CampaignTargetReadiness={available:true,near:true,level:true,confirmed:true,clear:true,label:'Second Life Salvage'};
const cases:readonly {patch:Partial<CampaignControlReadiness>;reason:RegExp}[]=[
 {patch:{loadFailed:true},reason:/saved world could not be loaded.*Reopen/},
 {patch:{reloading:true},reason:/world is reloading.*Wait/},
 {patch:{lab:true},reason:/Return to your campaign/},
 {patch:{connecting:true},reason:/Connecting.*Wait/},
 {patch:{online:true,canAct:false,closed:true},reason:/room is closed.*Return to solo/},
 {patch:{online:true,canAct:false,paused:true},reason:/shared world is paused.*host/},
 {patch:{online:true,canAct:false},reason:/Connection interrupted.*retrying/},
 {patch:{online:true,hostOnly:true,host:false},reason:/Only the host.*Ask the host/},
 {patch:{valley:false},reason:/Return to the valley/},
 {patch:{alive:false},reason:/Recover your suit/},
 {patch:{physicsReady:false},reason:/Terrain is still preparing.*transition/},
 {patch:{transitioning:true},reason:/Terrain is still preparing.*transition/},
 {patch:{staffBusy:true},reason:/Lower your staff.*recovery/},
 {patch:{contactBusy:true},reason:/Release the crate or ledge/},
 {patch:{crouched:true},reason:/Stand upright/},
 {patch:{grounded:false},reason:/Stand on the ground/},
 {patch:{onTerrain:false},reason:/Stand on the ground/},
];
test('campaign readiness explains each recoverable control block and returns ready after the actual condition clears',()=>{
 assert.equal(campaignControlBlockReason(ready),null);
 for(const c of cases){const input=Object.freeze({...ready,...c.patch}),before=JSON.stringify(input);assert.match(campaignControlBlockReason(input)!,c.reason);assert.equal(CAMPAIGN_ACTION_READINESS_ENGINE.control(input),campaignControlBlockReason(input));assert.equal(JSON.stringify(input),before);assert.equal(campaignControlBlockReason({...input,...ready}),null);}
 assert.equal(new Set(cases.map(c=>campaignControlBlockReason({...ready,...c.patch}))).size,15,'Only terrain/transition and grounded/onTerrain intentionally share explanations');
});
test('control reason priority favors loading and authority before physical recovery without mutating inputs',()=>{
 const blocked={...ready,loadFailed:true,reloading:true,lab:true,connecting:true,online:true,canAct:false,closed:true,paused:true,hostOnly:true,host:false,valley:false,alive:false,physicsReady:false,transitioning:true,staffBusy:true,contactBusy:true,crouched:true,grounded:false,onTerrain:false};
 const recover:readonly [Partial<CampaignControlReadiness>,RegExp][]=[
  [{},/saved world/],[{loadFailed:false},/reloading/],[{reloading:false},/Return to your campaign/],[{lab:false},/Connecting/],[{connecting:false},/room is closed/],[{closed:false},/world is paused/],[{paused:false},/Connection interrupted/],[{canAct:true},/Only the host/],[{host:true},/Return to the valley/],[{valley:true},/Recover your suit/],[{alive:true},/Terrain/],[{physicsReady:true},/Terrain/],[{transitioning:false},/Lower your staff/],[{staffBusy:false},/Release/],[{contactBusy:false},/Stand upright/],[{crouched:false},/Stand on the ground/],[{grounded:true},/Stand on the ground/],
 ];
 for(const [patch,expected] of recover){Object.assign(blocked,patch);const immutable=Object.freeze({...blocked});assert.match(campaignControlBlockReason(immutable)!,expected);}blocked.onTerrain=true;assert.equal(campaignControlBlockReason(blocked),null);
});
test('offline and nonhost inspection controls ignore irrelevant room flags but never bypass live authority',()=>{
 assert.equal(campaignControlBlockReason({...ready,canAct:false,closed:true,paused:true,hostOnly:true,host:false}),null,'Offline controls do not depend on a dormant room');
 assert.equal(campaignControlBlockReason({...ready,online:true,hostOnly:false,host:false}),null,'A non-host-only control is available to an authorized peer');
 assert.match(campaignControlBlockReason({...ready,online:true,canAct:false,hostOnly:false,host:false})!,/Connection interrupted/);
 assert(Object.isFrozen(CAMPAIGN_ACTION_READINESS_ENGINE));assert.equal(CAMPAIGN_ACTION_READINESS_ENGINE.kind,'axiom-campaign-action-readiness');
});
test('target gates distinguish stale selection distance elevation acknowledgement and occlusion in recoverable order',()=>{
 const blocked={...target,available:false,near:false,level:false,confirmed:false,clear:false};
 for(const [patch,expected] of [[{},/no longer available/],[{available:true},/Walk to Second Life Salvage.*3.5 metres/],[{near:true},/Stand on the ground beside Second Life Salvage/],[{level:true},/Terrain at Second Life Salvage.*collision confirmation/],[{confirmed:true},/solid obstacle.*Walk around/]] as const){Object.assign(blocked,patch);const input=Object.freeze({...blocked}),before=JSON.stringify(input);assert.match(campaignTargetBlockReason(input)!,expected);assert.equal(CAMPAIGN_ACTION_READINESS_ENGINE.target(input),campaignTargetBlockReason(input));assert.equal(JSON.stringify(input),before);}
 blocked.clear=true;assert.equal(campaignTargetBlockReason(blocked),null);assert.match(campaignTargetBlockReason({...target,near:false,label:'Northern habitat dock'})!,/Northern habitat dock/);
});
