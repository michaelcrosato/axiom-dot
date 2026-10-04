import {LAB_TUNING_VERSION,TUNING_FIELDS,DEFAULT_TUNING,validateLabTuning,resetTuningGroup,type LabTuning,type TuningKey} from './tuning.ts';
export const DEVELOPER_BUILD='experimental-dev-controls-2';
export const LAB_PRESET_LIMIT=24_000;
export const LAB_PRESET_KEY='axiom-lab-preset-v2';
export const LAB_SCENARIOS=['run-brake','turn','jump','ceiling','slide-crawl','combo','whiff','occlusion','interrupt','live-sentry'] as const;
export type LabScenario=typeof LAB_SCENARIOS[number];
export interface LabPreset {kind:'axiom-lab-preset';version:2;tuningVersion:2;scope:'sandbox-only';build:string;sourceRevision:string;seed:number;scenario:LabScenario;tuning:LabTuning}
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const string=(x:unknown,max:number)=>typeof x==='string'&&x.length>0&&x.length<=max&&!/[\u0000-\u001f<>]/.test(x);
export function createLabPreset(seed:number,scenario:string,tuning:LabTuning,sourceRevision:string):LabPreset{return parseLabPreset(JSON.stringify({kind:'axiom-lab-preset',version:2,tuningVersion:LAB_TUNING_VERSION,scope:'sandbox-only',build:DEVELOPER_BUILD,sourceRevision,seed,scenario,tuning}));}
/** No credentials, room IDs, scripts, campaign bytes or arbitrary imported properties. */
export function parseLabPreset(raw:string):LabPreset{
 if(typeof raw!=='string'||raw.length>LAB_PRESET_LIMIT||new TextEncoder().encode(raw).byteLength>LAB_PRESET_LIMIT)throw Error('Preset exceeds the 24 KB limit');
 let v:unknown;try{v=JSON.parse(raw);}catch{throw Error('Paste an AXIOM lab preset JSON file');}
 const keys=['kind','version','tuningVersion','scope','build','sourceRevision','seed','scenario','tuning'];
 if(!record(v)||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k))||v.kind!=='axiom-lab-preset'||v.version!==2||v.tuningVersion!==2||v.scope!=='sandbox-only'||!string(v.build,80)||!string(v.sourceRevision,160)||!Number.isInteger(v.seed)||(v.seed as number)<0||(v.seed as number)>0xffffffff||!LAB_SCENARIOS.includes(v.scenario as LabScenario))throw Error('Unsupported preset version, fields, seed or scenario');
 return {kind:'axiom-lab-preset',version:2,tuningVersion:2,scope:'sandbox-only',build:v.build as string,sourceRevision:v.sourceRevision as string,seed:v.seed as number,scenario:v.scenario as LabScenario,tuning:validateLabTuning(v.tuning)};
}
export const LAB_QUICK_PRESETS={
 baseline:{label:'Release baseline',scenario:'combo',tuning:{...DEFAULT_TUNING}},
 gentler:{label:'Gentler sentry · half damage',scenario:'live-sentry',tuning:{...DEFAULT_TUNING,enemyDamage:.5}},
 harder:{label:'Harder sentry · double damage',scenario:'live-sentry',tuning:{...DEFAULT_TUNING,enemyDamage:2}},
 light:{label:'Lower gravity · jump test',scenario:'jump',tuning:{...DEFAULT_TUNING,gravity:12}},
} satisfies Record<string,{label:string;scenario:LabScenario;tuning:LabTuning}>;
export function developerNavigationHTML(){return `<nav class="lab-nav" aria-label="Developer lab sections">${[['practice','Practice'],['tuning','Tune'],['systems','World systems'],['inspect','Inspect'],['reports','Reports']].map(([key,label])=>`<button type="button" data-lab-tab="${key}" aria-pressed="${key==='practice'}">${label}</button>`).join('')}</nav>`;}
const lastPage=new WeakMap<HTMLElement,string>();
export function bindDeveloperNavigation(panel:HTMLElement){
 const select=(page:string)=>{lastPage.set(panel,page);for(const section of panel.querySelectorAll<HTMLElement>('[data-lab-page]'))section.hidden=section.dataset.labPage!==page;for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-lab-tab]'))button.setAttribute('aria-pressed',String(button.dataset.labTab===page));};
 for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-lab-tab]'))button.onclick=()=>select(button.dataset.labTab!);
 select(lastPage.get(panel)??'practice');
}
export function tuningControlsHTML(tuning:LabTuning){return [...new Set(Object.values(TUNING_FIELDS).map(v=>v.group))].map(group=>`<details class="lab-tuning" open><summary>${group}</summary><button type="button" data-tuning-reset="${group}" class="lab-small-button">Reset ${group.toLowerCase()} draft</button>${Object.entries(TUNING_FIELDS).filter(([,v])=>v.group===group).map(([key,d])=>`<div class="lab-control" data-tuning-row="${key}"><label for="lab-${key}">${d.label} <span class="lab-unit">${d.unit}</span></label><div class="lab-control-inputs"><input id="lab-${key}" data-tuning="${key}" type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${tuning[key as TuningKey]}" aria-describedby="lab-help-${key}"><input data-tuning-number="${key}" type="number" aria-label="${d.label} numeric value" min="${d.min}" max="${d.max}" step="${d.step}" value="${tuning[key as TuningKey]}"></div><output id="lab-value-${key}">${tuning[key as TuningKey].toFixed(2)} ${d.unit}</output><p id="lab-help-${key}">${d.description} <span class="lab-effect">${d.effect==='reset'?'Next sentry reset':'Apply while paused'} · default ${d.default} ${d.unit}</span></p></div>`).join('')}</details>`).join('');}
export {TUNING_FIELDS,validateLabTuning,resetTuningGroup};

// Selection is metadata, separate from the currently running course and worker state.
const appliedScenarios=new WeakMap<LabTuning,LabScenario>();
export function rememberLabScenario(tuning:LabTuning,scenario:string){if(!LAB_SCENARIOS.includes(scenario as LabScenario))throw Error('Unknown lab scenario');appliedScenarios.set(tuning,scenario as LabScenario);}
export function labTuningScenario(tuning:LabTuning,fallback:string):LabScenario{return appliedScenarios.get(tuning)??fallback as LabScenario;}
