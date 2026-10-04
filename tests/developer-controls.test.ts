import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {DEFAULT_TUNING,TUNING_FIELDS,validateLabTuning,resetTuningGroup,sanitizeTuning} from '../src/tuning.ts';
import {createLabPreset,parseLabPreset,tuningControlsHTML,LAB_PRESET_LIMIT,LAB_QUICK_PRESETS,bindDeveloperNavigation} from '../src/developer-tools.ts';
import {createLiveSentryPractice,resumeLiveSentryPractice,stepLiveSentryPractice,requestLiveSentryGuard} from '../src/live-sentry-practice.ts';
import {createLiveSentryTrace,appendLiveSentryTrace,replayLiveSentryTrace,exportLiveSentryTrace} from '../src/live-sentry-trace.ts';
import {createComboState,requestComboAttack,stepCombo,sanitizeComboTuning} from '../src/combat.ts';
import {equipmentCombat} from '../src/equipment-combat.ts';
import {createConnectedState,serializeSave,parseSave} from '../src/world.ts';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const pose={x:8,z:5.5,feetY:0,facing:0,grounded:true,crouched:false,stance:0};

test('every tuning field carries usable bounds, description, units, effect and production consumer',()=>{
 assert.equal(Object.keys(TUNING_FIELDS).length,21);
 const html=tuningControlsHTML(DEFAULT_TUNING);
 for(const [key,d] of Object.entries(TUNING_FIELDS)){
  assert(d.min<=d.default&&d.max>=d.default&&d.step>0);assert(d.description&&d.unit&&d.consumer);assert(['apply','reset'].includes(d.effect));
  assert(html.includes(`data-tuning="${key}"`)&&html.includes(`data-tuning-number="${key}"`)&&html.includes(`lab-help-${key}`));
  const files=['main.ts','physics.worker.ts','locomotion.ts'].map(f=>readFileSync(new URL('../src/'+f,import.meta.url),'utf8')).join('\n');
  assert(new RegExp('\\b(?:labTuning|tuning|t|ct)\\.'+key+'\\b').test(files),`${key} has an actual consumer`);
 }
 assert.equal(TUNING_FIELDS.enemyDamage.effect,'reset');
 assert.equal(validateLabTuning(DEFAULT_TUNING).enemyDamage,1);
});

test('strict versioned presets reject unknown, missing, malicious, nonfinite and oversized content',()=>{
 const p=createLabPreset(73129,'live-sentry',{...DEFAULT_TUNING,enemyDamage:2},'test-build');
 assert.deepEqual(parseLabPreset(JSON.stringify(p)),p);
 for(const change of [{version:1},{tuningVersion:3},{seed:-1},{seed:2**32},{scenario:'execute'},{token:'secret'},{tuning:{...p.tuning,execute:'alert(1)'}},{tuning:{...p.tuning,enemyDamage:4}},{tuning:{...p.tuning,gravity:null}},{sourceRevision:'<script>'},{scope:'campaign'}])assert.throws(()=>parseLabPreset(JSON.stringify({...p,...change})));
 assert.throws(()=>parseLabPreset('{"__proto__":{"polluted":true}}'));assert.equal(({} as any).polluted,undefined);
 const missing:any={...p.tuning};delete missing.enemyDamage;assert.throws(()=>parseLabPreset(JSON.stringify({...p,tuning:missing})));
 assert.throws(()=>parseLabPreset(' '.repeat(LAB_PRESET_LIMIT+1)));
 assert.throws(()=>parseLabPreset('☃'.repeat(LAB_PRESET_LIMIT/2)));
 assert.throws(()=>validateLabTuning({...DEFAULT_TUNING,enemyDamage:Infinity}));
 assert.equal(parseSave(JSON.stringify(p)),null,'a preset cannot be mistaken for a campaign save');
});

test('reset helpers and authored setups are independent, bounded and exactly reversible',()=>{
 const changed={...DEFAULT_TUNING,staffDamage:2,gravity:12},reset=resetTuningGroup(changed,'Combat');
 assert.equal(reset.staffDamage,1);assert.equal(reset.gravity,12);assert.equal(changed.staffDamage,2);
 let all=changed;for(const group of new Set(Object.values(TUNING_FIELDS).map(d=>d.group)))all=resetTuningGroup(all,group);assert.deepEqual(all,DEFAULT_TUNING);
 for(const setup of Object.values(LAB_QUICK_PRESETS))assert.deepEqual(validateLabTuning(setup.tuning),setup.tuning);
 assert.equal(sanitizeTuning({enemyDamage:0}).enemyDamage,.1);
});

test('real sentry contact damage changes outcomes, defaults reset, guard stays authoritative and trace replays',()=>{
 const normal=createConnectedState(73129),bytes=serializeSave(normal);
 for(const [scale,hp] of [[.5,94],[1,88],[2,76]] as const){
  let recording=createLiveSentryTrace({seed:73129,epoch:1,enemyDamageScale:scale});
  recording=appendLiveSentryTrace(recording,{type:'resume',frame:{...pose,epoch:1,step:0}});
  for(let step=1;step<=100;step++)recording=appendLiveSentryTrace(recording,{type:'step',frame:{...pose,epoch:1,step}});
  assert.equal(recording.state.hp,hp);const trace=exportLiveSentryTrace(recording);assert.equal(trace.options.enemyDamageScale,scale);assert.equal(trace.options.tuningVersion,2);assert(replayLiveSentryTrace(trace).matchesPrefixFinal);
 }
 let s=createLiveSentryPractice({seed:73129,epoch:1,enemyDamageScale:2});s=resumeLiveSentryPractice(s,{...pose,epoch:1,step:0}).state;
 for(let step=1;step<=100;step++){if(step===46)s=requestLiveSentryGuard(s,'front').state;s=stepLiveSentryPractice(s,{...pose,epoch:1,step}).state;}
 assert.equal(s.hp,100);assert.equal(s.guard.lastBlock?.id,1);
 assert.equal(createLiveSentryPractice({seed:73129,epoch:2}).enemyDamageScale,1);assert.equal(serializeSave(normal),bytes);
});

test('production combat adapter changes staff damage and stamina costs only in isolated lab',()=>{
 const start=main.indexOf('function combatTuning()'),end=main.indexOf('\n',start),source=stripTypeScriptTypes(main.slice(start,end),{mode:'strip'});
 const tuning=(active:boolean,damage:number,cost:number)=>new Function('equipmentCombat','sanitizeComboTuning','labActive','labTuning','currentEquipment',`${source};return combatTuning();`)(equipmentCombat,sanitizeComboTuning,active,{...DEFAULT_TUNING,staffDamage:damage,staminaCost:cost},()=>null);
 const snap={player:{x:0,y:0,z:0,facing:0,hp:100},targets:[{id:'dummy',x:0,y:0,z:2.5,alive:true}],obstacles:[]};
 for(const [scale,damage,cost] of [[.5,12,7],[1,24,14],[2,48,28]]){
  const t=tuning(true,scale!,scale!);let combo=createComboState(t);combo=requestComboAttack(combo,snap,t).state;assert.equal(combo.stamina,100-cost!);let total=0;
  for(let i=0;i<40;i++){const r=stepCombo(combo,1/60,snap,t);combo=r.state;for(const e of r.events)if(e.type==='hit')total+=e.damage;}
  assert.equal(total,damage);
 }
 assert.deepEqual(tuning(false,2,2),tuning(false,1,1));assert.equal(tuning(true,2,2).attacks[2].damage,96);
});

test('section navigation hides unrelated content and remembers tab during report refresh',()=>{
 const tabs=['practice','tuning','systems','inspect','reports'].map(key=>({dataset:{labTab:key},attrs:{} as Record<string,string>,setAttribute(k:string,v:string){this.attrs[k]=v},onclick:()=>{}}));
 const pages=['practice','tuning','systems','inspect','reports','practice','systems'].map(key=>({dataset:{labPage:key},hidden:false}));
 const root={querySelectorAll:(selector:string)=>selector==='[data-lab-tab]'?tabs:pages} as unknown as HTMLElement;
 bindDeveloperNavigation(root);assert(pages.filter(p=>p.dataset.labPage!=='practice').every(p=>p.hidden));tabs[1]!.onclick();assert.equal(tabs[1]!.attrs['aria-pressed'],'true');assert(pages.filter(p=>p.dataset.labPage!=='tuning').every(p=>p.hidden));bindDeveloperNavigation(root);assert.equal(pages[1]!.hidden,false);
});

test('preview retains isolated storage and maps runnable workbench choices without changing campaign state',()=>{
 assert.match(main,/localStorage=createPreviewStorage/);assert.match(main,/labActive\)return false/);assert.match(main,/enemyDamageScale:labTuning.enemyDamage/);assert.match(main,/coop\.active\|\|coopPending\|\|coop\.status==='connecting'/);
 for(const system of ['settlement','water','trade','food'])assert(main.includes(`&amp;system=${system}`));
 assert(main.includes("$('lab-procedural').onclick=()=>openPanel('workbench')"));assert(main.includes("$('lab-plans').onclick=()=>openPanel('region-plan')"));
 assert(main.includes("file.size>LAB_PRESET_LIMIT"));assert(main.includes("document.getElementById('lab-apply')===applyButton"));assert(main.includes("No account or room tokens are included"));
 const manifest=JSON.parse(readFileSync(new URL('../.openai/hosting.json',import.meta.url),'utf8'));assert.equal(manifest.d1,'AXIOM_PREVIEW_DB');
});

test('historical version-one sentry trace remains replayable without additive tuning metadata',()=>{
 let r=createLiveSentryTrace({seed:73129,epoch:1});r=appendLiveSentryTrace(r,{type:'resume',frame:{...pose,epoch:1,step:0}});
 for(let step=1;step<=100;step++)r=appendLiveSentryTrace(r,{type:'step',frame:{...pose,epoch:1,step}});
 const legacy:any=exportLiveSentryTrace(r);delete legacy.options.enemyDamageScale;delete legacy.options.tuningVersion;delete legacy.initial.enemyDamageScale;delete legacy.prefixFinal.enemyDamageScale;
 assert(replayLiveSentryTrace(legacy).matchesPrefixFinal);assert.equal(replayLiveSentryTrace(legacy).state.hp,88);
});


import {WorkbenchSession,DEFAULT_WORKBENCH_CONFIG,parseWorkbenchReport,validateWorkbenchConfig} from '../src/system-workbench-model.ts';
test('world-system replay imports reject unknown top-level and configuration keys',()=>{
 const report=new WorkbenchSession(DEFAULT_WORKBENCH_CONFIG).report();assert.deepEqual(parseWorkbenchReport(JSON.stringify(report)),report);
 assert.throws(()=>validateWorkbenchConfig({...DEFAULT_WORKBENCH_CONFIG,token:'not-allowed'}));assert.throws(()=>parseWorkbenchReport(JSON.stringify({...report,credentials:'not-allowed'})));
 assert.throws(()=>parseWorkbenchReport(JSON.stringify({...report,config:{...report.config,script:'not-allowed'}})));
});
