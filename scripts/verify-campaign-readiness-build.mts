import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {CAMPAIGN_ACTION_READINESS_ENGINE,type CampaignControlReadiness,type CampaignTargetReadiness} from '../src/campaign-action-readiness.ts';
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'dist/client/assets'),digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const modules=await Promise.all(readdirSync(assets).filter(file=>/^campaign-action-readiness-.*\.js$/.test(file)).map(async file=>({file,module:await import(pathToFileURL(resolve(assets,file)).href),sha256:digest(readFileSync(resolve(assets,file),'utf8'))})));
const matches=modules.flatMap(asset=>Object.values(asset.module).filter((value:any)=>value?.kind==='axiom-campaign-action-readiness').map(value=>({...asset,value:value as typeof CAMPAIGN_ACTION_READINESS_ENGINE})));
assert.equal(matches.length,1,'exactly one actual emitted campaign readiness engine');const {file,sha256,value:engine}=matches[0]!;assert(Object.isFrozen(engine));assert.equal(typeof engine.control,'function');assert.equal(typeof engine.target,'function');
const ready:CampaignControlReadiness={reloading:false,loadFailed:false,lab:false,connecting:false,online:false,canAct:true,closed:false,paused:false,hostOnly:false,host:true,valley:true,alive:true,physicsReady:true,transitioning:false,staffBusy:false,contactBusy:false,crouched:false,grounded:true,onTerrain:true};
const target:CampaignTargetReadiness={available:true,near:true,level:true,confirmed:true,clear:true,label:'Second Life Salvage'};
const keys=Object.keys(ready) as (keyof CampaignControlReadiness)[],targetKeys=['available','near','level','confirmed','clear'] as const;assert.equal(keys.length,19,'all current boolean inputs must be inventoried');
const controlHash=createHash('sha256'),targetHash=createHash('sha256'),controlCounts=new Map<string,number>(),targetCounts=new Map<string,number>();let controlCases=0,targetCases=0;
// Exhaustive boolean truth tables cover every single edge, pairwise ordering and
// correlated/inconsistent combination; these are presentation flags, not state validators.
for(let mask=0;mask<2**keys.length;mask++){
 const input={} as CampaignControlReadiness;for(let bit=0;bit<keys.length;bit++)input[keys[bit]!]=Boolean(mask&(2**bit));Object.freeze(input);
 const expected=CAMPAIGN_ACTION_READINESS_ENGINE.control(input),actual=engine.control(input);assert.equal(actual,expected,`control flags ${mask}`);assert(actual===null||typeof actual==='string'&&actual.length>0);for(let bit=0;bit<keys.length;bit++)assert.equal(input[keys[bit]!],Boolean(mask&(2**bit)),'read-only flags');
 const key=actual??'<ready>';controlCounts.set(key,(controlCounts.get(key)??0)+1);controlHash.update(JSON.stringify([mask,actual])+'\n');controlCases++;
}
for(const label of ['Second Life Salvage','North habitat dock','Greenlight care station','Northwest workshop board','山の生息地'])for(let mask=0;mask<2**targetKeys.length;mask++){
 const input={label} as CampaignTargetReadiness;for(let bit=0;bit<targetKeys.length;bit++)input[targetKeys[bit]!]=Boolean(mask&(2**bit));Object.freeze(input);
 const expected=CAMPAIGN_ACTION_READINESS_ENGINE.target(input),actual=engine.target(input);assert.equal(actual,expected,`target flags ${label}/${mask}`);assert.equal(input.label,label);for(let bit=0;bit<targetKeys.length;bit++)assert.equal(input[targetKeys[bit]!],Boolean(mask&(2**bit)),'read-only target flags');
 const key=actual??'<ready>';targetCounts.set(key,(targetCounts.get(key)??0)+1);targetHash.update(JSON.stringify([label,mask,actual])+'\n');targetCases++;
}
// Independent behavioral assertions supplement parity: matching two engines is
// insufficient if both were to lose the recovery explanation or priority.
assert.equal(engine.control(Object.freeze({...ready})),null);assert.equal(engine.target(Object.freeze({...target})),null);
assert.match(engine.control({...ready,loadFailed:true,reloading:true,lab:true})!,/saved world could not be loaded.*Reopen/);
assert.match(engine.control({...ready,online:true,canAct:false,closed:true,paused:true,hostOnly:true,host:false,crouched:true})!,/room is closed.*Return to solo/);
assert.match(engine.control({...ready,online:true,hostOnly:true,host:false,crouched:true})!,/Only the host/);
assert.match(engine.control({...ready,staffBusy:true,contactBusy:true,crouched:true})!,/Lower your staff/);
assert.equal(engine.control({...ready,online:false,canAct:false,closed:true,paused:true,hostOnly:true,host:false}),null);
assert.match(engine.target({...target,available:false,near:false,level:false,confirmed:false,clear:false})!,/no longer available/);
assert.match(engine.target({...target,near:false,level:false,confirmed:false,clear:false})!,/Walk to Second Life Salvage.*3.5 metres/);
assert.match(engine.target({...target,confirmed:false,clear:false})!,/collision confirmation/);
assert.match(engine.target({...target,clear:false})!,/solid obstacle.*Walk around/);
assert.equal(controlCases,524288);assert.equal(targetCases,160);assert.equal(controlCounts.size,16,'fifteen distinct blocked reasons plus ready');assert(controlCounts.has('<ready>'));assert(targetCounts.has('<ready>'));
const sourceFiles=['src/campaign-action-readiness.ts','src/main.ts','src/town-supply-ui.ts','src/workshop-construction-ui.ts','src/restoration-care-ui.ts','src/restoration-ui.ts','vite.client.config.ts','tests/campaign-action-readiness.test.ts','scripts/verify-campaign-readiness-build.mts'];
const report={kind:'axiom-campaign-readiness-emitted-verification',version:1,verifiedAt:new Date().toISOString(),scope:'Actual production readiness engine export. Exhaustive source/emitted boolean parity, explicit reason priority and recovery assertions, immutable presentation inputs. No gameplay mutation, browser, GPU, device, collision execution or full main startup claim.',engine:{file,sha256,kind:engine.kind},sourceHashes:Object.fromEntries(sourceFiles.map(name=>[name,digest(readFileSync(resolve(root,name),'utf8'))])),control:{booleanInputs:keys,cases:controlCases,sha256:controlHash.digest('hex'),reasons:Object.fromEntries(controlCounts)},target:{booleanInputs:targetKeys,labels:5,cases:targetCases,sha256:targetHash.digest('hex'),reasons:Object.fromEntries(targetCounts)}};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
