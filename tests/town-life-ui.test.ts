import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountTownLifePanel,townLifeActionOptions,townLifeResidentHTML,townLifeJournalHTML,type TownLifePanelContext} from '../src/town-life-ui.ts';
import {mountTownLifeLab,parseTownLifeLabPreset,TOWN_LIFE_LAB_TIME_LIMIT} from '../src/town-life-lab.ts';
import {createTownLifeScenario,applyTownLifeCommand,townLifeFacilities,TOWN_LIFE_DEFAULTS,TOWN_LIFE_TUNING_REGISTRY,TOWN_LIFE_NEEDS} from '../src/town-life.ts';

/** Non-rendering DOM contract only. This fake makes no layout/browser claims. */
class Element{
 inner='';nodes=new Map<string,Element>();dataNodes:Element[]=[];value='';textContent='';disabled=false;checked=false;dataset:Record<string,string>={};
 onclick?:()=>void;onchange?:()=>void;oninput?:()=>void;
 get innerHTML(){return this.inner;}
 set innerHTML(value:string){this.inner=value;this.nodes.clear();this.dataNodes=[];for(const match of value.matchAll(/<([a-z]+)\b([^>]*)>/g)){const attrs=match[2]!,id=/id="([^"]+)"/.exec(attrs)?.[1],data=[...attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)];if(!id&&!data.length&&!/class="close"/.test(attrs))continue;const el=new Element();el.value=/value="([^"]*)"/.exec(attrs)?.[1]??'';el.disabled=/\bdisabled\b/.test(attrs);el.checked=/\bchecked\b/.test(attrs);for(const d of data)el.dataset[d[1]!.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase())]=d[2]!;if(data.length)this.dataNodes.push(el);if(id)this.nodes.set('#'+id,el);if(/class="close"/.test(attrs))this.nodes.set('.close',el);}}
 querySelector(selector:string):Element|null{return this.nodes.get(selector)??[...this.nodes.values()].map(n=>n.querySelector(selector)).find(Boolean)??null;}
 querySelectorAll(selector:string):Element[]{const key=/\[data-([a-z-]+)\]/.exec(selector)?.[1]?.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase());return [...this.dataNodes.filter(n=>key&&Object.hasOwn(n.dataset,key)),...[...this.nodes.values()].flatMap(n=>n.querySelectorAll(selector))];}
 getContext(){return null;}
}
function withTimers(fn:(timers:Map<number,()=>void>)=>void){const oldSet=globalThis.setInterval,oldClear=globalThis.clearInterval;let id=0;const timers=new Map<number,()=>void>();globalThis.setInterval=((f:()=>void)=>{timers.set(++id,f);return id;}) as unknown as typeof setInterval;globalThis.clearInterval=((n:number)=>timers.delete(n)) as unknown as typeof clearInterval;try{fn(timers);}finally{globalThis.setInterval=oldSet;globalThis.clearInterval=oldClear;}}
function lab(){const panel=new Element(),dispose=mountTownLifeLab(panel as unknown as HTMLElement,{seed:73129,source:'ui-test-source',close(){},visit(){}}),q=(id:string)=>panel.querySelector('#life-lab-'+id)!,inspect=()=>JSON.parse(q('inspect').textContent);return {panel,dispose,q,inspect};}
function context():TownLifePanelContext{const life=createTownLifeScenario(73129,'balanced'),well=townLifeFacilities(life.seed).find(f=>f.kind==='well')!;return {seed:life.seed,zone:'valley',regional:{version:1},player:{x:well.x,z:well.z,hp:100},inventory:{scrap:12,core:0,water:6},townLife:life};}

test('player inspector includes real needs, all 100 identities, queues, journal and finite costs',()=>withTimers(timers=>{
 const state=context(),panel=new Element(),commands:unknown[]=[],dispose=mountTownLifePanel(panel as unknown as HTMLElement,{state:()=>state,act:c=>commands.push(c),visit(){},close(){},ready:()=>true});
 const q=(id:string)=>panel.querySelector('#life-'+id)!;
 assert.equal((/id="life-person">([\s\S]*?)<\/select>/.exec(panel.innerHTML)?.[1]?.match(/<option/g)??[]).length,100);
 q('person').value='99';q('person').onchange!();assert.match(q('person-detail').innerHTML,/out of 100/);assert.match(q('person-detail').innerHTML,/action time remaining/);assert.match(q('person-detail').innerHTML,/Personal goal/);assert.match(q('person-detail').innerHTML,/Traits & relationships/);
 for(const key of TOWN_LIFE_NEEDS)assert.match(q('person-detail').innerHTML,new RegExp('life-need-'+key));
 assert.match(q('facilities').innerHTML,/reserved \/ traveling/);assert.match(q('shared').innerHTML,/separate from your inventory/);assert.match(q('journal').innerHTML,/Disposable scenario/);
 const action=q('actions').querySelectorAll('[data-life-action]')[0]!;assert.equal(action.disabled,false);action.onclick!();action.onclick!();assert.equal(commands.length,1,'same retained button cannot double-send');assert.match(q('status').textContent,/requested/);
 q('refresh').onclick!();assert.equal(q('actions').querySelectorAll('[data-life-action]')[0]!.disabled,false,'explicit refresh recovers rejected pending request');
 dispose();assert.equal(timers.size,0);action.onclick!();assert.equal(commands.length,1);
}));

test('player command eligibility uses actual authority displacement and revision-checked inventory',()=>withTimers(()=>{
 let state=context();const resident=state.townLife!.residents[0]!,far={x:resident.x+10,z:resident.z};state={...state,player:{...state.player,...far}};
 const raw=townLifeActionOptions(state.townLife!,state,0,'well').find(o=>o.command.kind==='encourage-resident')!;assert.equal(raw.available,false);
 const corrected=townLifeActionOptions(state.townLife!,state,0,'well',command=>command.kind==='encourage-resident'?far:undefined).find(o=>o.command.kind==='encourage-resident')!;assert.equal(corrected.available,true);assert.deepEqual(corrected.target,far);
 const result=applyTownLifeCommand(state.townLife!,state,corrected.command,far);assert(result);assert.equal(result.life.revision,state.townLife!.revision+1);assert.deepEqual(result.inventory,state.inventory);
 const c=context(),option=townLifeActionOptions(c.townLife!,c,0,'well')[0]!,paid=applyTownLifeCommand(c.townLife!,c,option.command);assert(paid);assert.equal(paid.inventory.water,5);assert.equal(paid.life.resources.water,c.townLife!.resources.water+12);
}));

test('town life text escapes external-like content and never invents journal outcomes',()=>{
 const life=structuredClone(createTownLifeScenario(73129,'balanced'));life.residents[0]!.reason='<img src=x onerror=bad>';life.events=[{tick:4,residentId:null,kind:'aid',text:'<script>bad</script>'}];
 assert.match(townLifeResidentHTML(life,0),/&lt;img/);assert.doesNotMatch(townLifeResidentHTML(life,0),/<img/);assert.match(townLifeJournalHTML(life),/2\.0 s/);assert.match(townLifeJournalHTML(life),/&lt;script&gt;/);life.events=[];assert.match(townLifeJournalHTML(life),/No recorded town events/);
});

test('lab stages every actual tuning field, discards, applies and resets all 100 residents safely',()=>withTimers(()=>{
 const h=lab(),initial=h.inspect();assert.equal(initial.seed,73129);assert.equal(initial.elapsed,0);
 for(const field of TOWN_LIFE_TUNING_REGISTRY)h.q('number-'+field.key).value=String(field.min);
 assert.deepEqual(h.inspect().applied.tuning,TOWN_LIFE_DEFAULTS);h.q('apply').onclick!();for(const field of TOWN_LIFE_TUNING_REGISTRY)assert.equal(h.inspect().applied.tuning[field.key],field.min);
 h.q('person').value='99';h.q('person').onchange!();assert.match(h.inspect().selectedResident,/:099$/);
 h.q('seed').value='42';h.q('seed').onchange!();h.q('scenario').value='overwork';h.q('reset-draft').onclick!();assert.equal(h.inspect().seed,42);assert.match(h.inspect().selectedResident,/42:099$/);assert.equal(h.inspect().applied.scenario,'overwork');assert.equal(h.inspect().resident.needs.energy,27);
 h.q('number-needRate').value='2';h.q('discard').onclick!();assert.equal(h.q('number-needRate').value,String(TOWN_LIFE_TUNING_REGISTRY.find(f=>f.key==='needRate')!.min));
 h.q('defaults').onclick!();assert.equal(h.inspect().seed,42,'defaults only stage');assert.equal(h.q('seed').value,'73129');h.q('reset-draft').onclick!();assert.equal(h.inspect().seed,73129);assert.deepEqual(h.inspect().applied.tuning,TOWN_LIFE_DEFAULTS);h.dispose();
}));

test('lab applies bounded starting needs only on reset and rejects malformed values without replacing model',()=>withTimers(()=>{
 const h=lab();h.q('start-enabled').checked=true;h.q('start-person').value='99';for(const key of TOWN_LIFE_NEEDS)h.q('start-'+key).value='12';
 h.q('apply').onclick!();assert.equal(h.inspect().applied.starting,null);h.q('reset-draft').onclick!();assert.match(h.inspect().selectedResident,/:099$/);assert.equal(h.inspect().resident.needs.hygiene,12);
 const before=h.inspect();h.q('start-energy').value='Infinity';h.q('reset-draft').onclick!();assert.deepEqual(h.inspect(),before);assert.match(h.q('status').textContent,/values from/);
 h.q('start-default').onclick!();h.q('reset-draft').onclick!();assert.equal(h.inspect().applied.starting,null);assert.notEqual(h.inspect().resident.needs.hygiene,12);
 h.q('number-walkSpeed').value='';h.q('apply').onclick!();assert.match(h.q('status').textContent,/Fill in/);h.dispose();
}));

test('lab repeats shortage reset, applies real interventions, enforces cooldown and stops timers on close',()=>withTimers(timers=>{
 const h=lab();h.q('scenario').value='lean-stores';h.q('reset-draft').onclick!();const original=h.inspect();
 const donate=()=>h.q('actions').querySelectorAll('[data-life-lab-action]')[0]!;assert.equal(donate().disabled,false);donate().onclick!();assert.equal(h.inspect().inventory.water,5);assert.equal(h.inspect().resources.water,24);assert.equal(donate().disabled,true);
 donate().onclick!();assert.equal(h.inspect().inventory.water,5,'kernel rejects repeat during cooldown');
 h.q('step').onclick!();assert.equal(h.inspect().elapsed,10);assert(h.inspect().tick>0);h.q('reset').onclick!();assert.deepEqual(h.inspect(),original);
 h.q('play').onclick!();assert.equal(timers.size,1);const tick=[...timers.values()][0]!;tick();assert.equal(h.inspect().elapsed,.25);h.q('play').onclick!();assert.equal(timers.size,0);
 h.q('play').onclick!();h.panel.querySelector('.close')!.onclick!();assert.equal(timers.size,0);const after=h.q('inspect').textContent;tick();h.q('step').onclick!();assert.equal(h.q('inspect').textContent,after,'stale timer and handlers cannot mutate a disposed panel');
}));

test('lab run/step settings and hard time limit are bounded and never silently seek campaign time',()=>withTimers(timers=>{
 const h=lab();for(const input of ['0','61','1.5','Infinity','']){h.q('step-seconds').value=input;h.q('step').onclick!();assert.equal(h.inspect().elapsed,0);}
 h.q('speed').value='9';h.q('play').onclick!();assert.equal(timers.size,0);h.q('step-seconds').value='60';for(let i=0;i<TOWN_LIFE_LAB_TIME_LIMIT/60;i++)h.q('step').onclick!();assert.equal(h.inspect().elapsed,1200);h.q('step').onclick!();assert.equal(h.inspect().elapsed,1200);assert.match(h.q('status').textContent,/bound/);h.q('speed').value='1';h.q('play').onclick!();assert.equal(timers.size,0);h.q('report').onclick!();const report=JSON.parse(h.q('json').value);assert.equal(report.actions.length,20);assert(report.actions.every((a:{seconds:number})=>a.seconds<=60),'each recorded advance fits the real kernel delta bound');h.dispose();
}));

test('versioned lab preset round-trip stages safely and reports actual settings with bounded action evidence',()=>withTimers(()=>{
 const h=lab();h.q('preset').onclick!();const raw=h.q('json').value,parsed=parseTownLifeLabPreset(raw);assert.equal(parsed.source,'ui-test-source');assert.equal(parsed.starting,null);
 const imported={...parsed,seed:42,scenario:'social-strain',source:'imported-source',tuning:{...parsed.tuning,desireWeight:0}};h.q('json').value=JSON.stringify(imported);h.q('import').onclick!();assert.equal(h.inspect().seed,73129);assert.equal(h.q('seed').value,'42');h.q('reset-draft').onclick!();assert.equal(h.inspect().seed,42);assert.equal(h.inspect().applied.tuning.desireWeight,0);
 h.q('step').onclick!();h.q('number-needRate').value='2';h.q('report').onclick!();const evidence=JSON.parse(h.q('json').value);assert.equal(evidence.actual.tuning.needRate,1);assert.equal(evidence.intended.tuning.needRate,2);assert.equal(evidence.report.residents.length,100);assert.equal(evidence.actions[0].kind,'advance');assert.equal(evidence.actions[0].seconds,10);assert.equal(evidence.source,'ui-test-source');assert(!Object.keys(evidence).some(k=>['campaign','roomId','token'].includes(k)));
 h.q('import').onclick!();assert.match(h.q('status').textContent,/Unsupported|24 KB/);h.dispose();
}));

test('strict preset allowlist rejects unknown fields, wrong versions, non-finite values, scripts and oversize data',()=>{
 const good={kind:'axiom-town-life-preset',version:1,scope:'disposable-model',build:'test',source:'source',seed:73129,scenario:'balanced',tuning:{...TOWN_LIFE_DEFAULTS},starting:null};
 for(const bad of [{...good,script:'run'},{...good,version:2},{...good,seed:-1},{...good,scenario:'unknown'},{...good,tuning:{...good.tuning,needRate:null}},{...good,tuning:{...good.tuning,extra:1}},{...good,starting:{residentIndex:100,needs:Object.fromEntries(TOWN_LIFE_NEEDS.map(k=>[k,50]))}},{...good,source:'<script>'}])assert.throws(()=>parseTownLifeLabPreset(JSON.stringify(bad)));
 assert.throws(()=>parseTownLifeLabPreset(' '.repeat(24001)));assert.deepEqual(parseTownLifeLabPreset(JSON.stringify(good)),good);
});

test('all new controls are explicit non-submit buttons and lab has no campaign persistence dependency',()=>{
 for(const filename of ['town-life-ui.ts','town-life-lab.ts']){const source=readFileSync(new URL('../src/'+filename,import.meta.url),'utf8');assert.equal((source.match(/<button(?! type="button")/g)??[]).length,0);}
 const source=readFileSync(new URL('../src/town-life-lab.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/from ['"].*(?:world|save|storage|coop)\.ts/);assert.doesNotMatch(source,/localStorage|sessionStorage|setTimeout|FileReader/);assert.match(source,/if\(!alive\)return/);
});

test('late clipboard success cannot overwrite reset or closed-panel status',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let resolve:()=>void=()=>{};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:()=>new Promise<void>(done=>{resolve=done;})}}});
 try{const h=lab();h.q('preset').onclick!();h.q('copy').onclick!();h.q('reset').onclick!();const resetMessage=h.q('status').textContent;resolve();await Promise.resolve();assert.equal(h.q('status').textContent,resetMessage);h.q('copy').onclick!();h.dispose();const closedMessage=h.q('status').textContent;resolve();await Promise.resolve();assert.equal(h.q('status').textContent,closedMessage);}finally{if(original)Object.defineProperty(globalThis,'navigator',original);else Reflect.deleteProperty(globalThis,'navigator');}
});

test('evidence action count stays bounded and every registry high value is a real applied setting',()=>withTimers(()=>{
 const h=lab();for(const field of TOWN_LIFE_TUNING_REGISTRY){h.q('number-'+field.key).value=String(field.max);h.q('number-'+field.key).oninput!();assert.equal(h.q(field.key).value,String(field.max));}h.q('apply').onclick!();for(const field of TOWN_LIFE_TUNING_REGISTRY)assert.equal(h.inspect().applied.tuning[field.key],field.max);
 h.q('step-seconds').value='1';h.q('step').onclick!();assert.equal(h.inspect().elapsed,1);
 for(let i=0;i<130;i++)h.q('apply').onclick!();h.q('report').onclick!();const report=JSON.parse(h.q('json').value);assert.equal(report.actions.length,128);assert.equal(report.actionsTruncated,true);assert(report.actions.every((a:{kind:string})=>a.kind==='tuning'));h.dispose();
}));
