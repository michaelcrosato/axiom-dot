import {compileEquipment,equipmentFor,EQUIPMENT_MANIFEST,type EquipmentPlan,type EquipmentRef} from './equipment.ts';
import {equipmentCombat} from './equipment-combat.ts';
import {createComboState,requestComboAttack,stepCombo,comboBufferOpen,type ComboEvent,type ComboSnapshot} from './combat.ts';
/** Disposable deterministic model evidence. This is not device/frame or Rapier measurement. */
export function measureEquipment(plan:EquipmentPlan|null){
 const tuning=equipmentCombat(plan),cases=[{id:'near',distance:2.5,wall:false},{id:'reach-edge',distance:3.15,wall:false},{id:'beyond',distance:3.6,wall:false},{id:'solid-wall',distance:2.5,wall:true}];
 const runs=cases.flatMap(c=>Array.from({length:3},(_,repeat)=>{
  let state=createComboState(tuning);const events:ComboEvent[]=[];const snapshot:ComboSnapshot={player:{x:0,y:0,z:0,facing:0,hp:100},targets:[{id:'comparison-dummy',x:0,y:0,z:c.distance}],obstacles:c.wall?[{x:0,y:1,z:1.2,hx:2,hy:2,hz:.15}]:[]};
  for(let tick=0;tick<360;tick++){if(state.attackId<3&&(state.phase==='idle'||comboBufferOpen(state,tuning))){const r=requestComboAttack(state,snapshot,tuning,'auto');state=r.state;events.push(...r.events);}const r=stepCombo(state,1/60,snapshot,tuning);state=r.state;events.push(...r.events);}
  const hits=events.filter((e):e is Extract<ComboEvent,{type:'hit'}>=>e.type==='hit');
  return {caseId:c.id,repeat:repeat+1,conditions:{...snapshot,steps:360,hz:60,targetHP:'unlimited measurement target'},hits:hits.map(h=>({stage:h.stage,at:h.at,damage:h.damage,attackId:h.attackId})),damage:hits.reduce((sum,h)=>sum+h.damage,0),whiffs:events.filter(e=>e.type==='whiff').length,stages:events.filter(e=>e.type==='stage').map(e=>e.stage),endState:state};
 }));
 const identical=cases.every(c=>{const a=runs.filter(r=>r.caseId===c.id).map(({repeat,...r})=>JSON.stringify(r));return a.every(r=>r===a[0]);});
 return {equipment:plan?{...plan.ref,name:plan.name,spec:plan.spec,stats:plan.stats,cost:plan.cost}:{version:0,seed:null,recipeHash:'survey-staff-v12',name:'Survey staff'},tuning,runs,checks:{identicalRepeats:identical,noWallHits:runs.filter(r=>r.caseId==='solid-wall').every(r=>r.hits.length===0),noBeyondHits:runs.filter(r=>r.caseId==='beyond').every(r=>r.hits.length===0),exactlyOnce:runs.every(r=>new Set(r.hits.map(h=>h.attackId)).size===r.hits.length)}};
}
export function compareEquipment(seedA:number,seedB:number){return {version:1,manifest:EQUIPMENT_MANIFEST,kind:'deterministic-combat-model',description:'Two compiled builds. Identical stationary snapshots, three repeats each, fixed 60 Hz, four distances/obstruction cases. No campaign writes and no device performance claim.',a:measureEquipment(compileEquipment(seedA)),b:measureEquipment(compileEquipment(seedB))};}

/** Custom comparisons re-resolve both identities; a client cannot supply derived combat claims. */
export function compareEquipmentRefs(a:EquipmentRef,b:EquipmentRef){return {version:2,manifest:EQUIPMENT_MANIFEST,kind:'deterministic-combat-model',description:'Two edited compiler recipes. Identical stationary snapshots, three repeats each, fixed 60 Hz, four distance/obstruction cases. No campaign writes and no device performance claim.',a:measureEquipment(equipmentFor(a)),b:measureEquipment(equipmentFor(b))};}
