import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountTownDirectorPanel,type TownDirectorPanelContext} from '../src/town-director-ui.ts';
import {mountTownDirectorLab} from '../src/town-director-lab.ts';
import {applyTownDirectorCommand,createTownDirectorScenario,TOWN_DIRECTOR_DEFAULTS,TOWN_DIRECTOR_TUNING_REGISTRY,townDirectorInteractionPosition,type TownDirectorCommand} from '../src/town-director.ts';

/** Deliberately non-rendering DOM contract. No layout, device or browser claim. */
class Element{
 inner='';nodes=new Map<string,Element>();dataNodes:Element[]=[];value='';textContent='';disabled=false;dataset:Record<string,string>={};onclick?:()=>void;onchange?:()=>void;oninput?:()=>void;
 get innerHTML(){return this.inner;}
 set innerHTML(value:string){this.inner=value;this.nodes.clear();this.dataNodes=[];for(const match of value.matchAll(/<([a-z]+)\b([^>]*)>/g)){const attrs=match[2]!,id=/id="([^"]+)"/.exec(attrs)?.[1],data=[...attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)];if(!id&&!data.length&&!/class="close"/.test(attrs))continue;const e=new Element();e.value=/value="([^"]*)"/.exec(attrs)?.[1]??'';e.disabled=/\bdisabled\b/.test(attrs);for(const d of data)e.dataset[d[1]!.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase())]=d[2]!;if(data.length)this.dataNodes.push(e);if(id)this.nodes.set('#'+id,e);if(/class="close"/.test(attrs))this.nodes.set('.close',e);}}
 querySelector(selector:string):Element|null{return this.nodes.get(selector)??[...this.nodes.values()].map(n=>n.querySelector(selector)).find(Boolean)??null;}
 querySelectorAll(selector:string):Element[]{const key=/\[data-([a-z-]+)\]/.exec(selector)?.[1]?.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase());return [...this.dataNodes.filter(n=>key&&Object.hasOwn(n.dataset,key)),...[...this.nodes.values()].flatMap(n=>n.querySelectorAll(selector))];}
 getAttribute(name:string){return name.startsWith('data-')?this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase())]??null:null;}
 replaceChildren(){this.innerHTML='';}
}
function withTimers(fn:(timers:Map<number,()=>void>)=>void){const oldSet=globalThis.setInterval,oldClear=globalThis.clearInterval;let id=0;const timers=new Map<number,()=>void>();globalThis.setInterval=((f:()=>void)=>{timers.set(++id,f);return id;}) as unknown as typeof setInterval;globalThis.clearInterval=((n:number)=>timers.delete(n)) as unknown as typeof clearInterval;try{fn(timers);}finally{globalThis.setInterval=oldSet;globalThis.clearInterval=oldClear;}}
function context():TownDirectorPanelContext{const {life,director}=createTownDirectorScenario(7,'lean-stores'),point=townDirectorInteractionPosition(director,director.episodes[0]!.id)!;return {seed:7,zone:'valley',player:{...point,hp:100},townLife:life,townDirector:director};}
function lab(){const panel=new Element(),dispose=mountTownDirectorLab(panel as unknown as HTMLElement,{seed:7,source:'director-ui-test',close(){}}),q=(id:string)=>panel.querySelector('#director-lab-'+id)!,inspect=()=>JSON.parse(q('state').textContent);return {panel,dispose,q,inspect};}

test('live board sends only explicit revision-checked requests and locks repeated pending clicks',()=>withTimers(timers=>{
 let state=context();const panel=new Element(),sent:TownDirectorCommand[]=[],helped:string[]=[];const dispose=mountTownDirectorPanel(panel as unknown as HTMLElement,{state:()=>state,act:c=>sent.push(c),help:e=>helped.push(e.id),visit(){},close(){},ready:()=>true});
 const q=(id:string)=>panel.querySelector('#director-'+id)!,accept=panel.querySelectorAll('[data-director-accept]')[0]!;assert.equal(accept.disabled,false);accept.onclick!();accept.onclick!();assert.equal(sent.length,1);assert.deepEqual(Object.keys(sent[0]!).sort(),['episodeId','expectedLifeRevision','expectedRevision','kind']);
 for(const tick of timers.values())tick();assert.ok(panel.querySelectorAll('[data-director-accept]').every(b=>b.disabled),'unchanged pending request stays locked');
 const next=applyTownDirectorCommand(state.townDirector!,state.townLife!,{seed:state.seed,zone:state.zone,player:state.player},sent[0]!)!;state={...state,townDirector:next};for(const tick of timers.values())tick();assert.match(q('summary').textContent,/2 active requests/);assert.match(q('status').textContent,/authoritative/);
 const help=panel.querySelectorAll('[data-director-help]')[0]!;help.onclick!();assert.equal(helped.length,1);assert.equal(sent.length,1,'inspection itself sends no authority command');dispose();assert.equal(timers.size,0);accept.onclick!();help.onclick!();assert.equal(sent.length,1);assert.equal(helped.length,1);
}));

test('rejected online pending can refresh, stale world and disposed visit callbacks cannot act',()=>withTimers(timers=>{
 let state=context(),visits=0,closes=0;const panel=new Element(),sent:TownDirectorCommand[]=[];mountTownDirectorPanel(panel as unknown as HTMLElement,{state:()=>state,act:c=>sent.push(c),help(){},visit(){visits++;},close(){closes++;},ready:()=>true});
 const refresh=panel.querySelector('#director-refresh')!,visit=panel.querySelector('#director-visit')!,close=panel.querySelector('.close')!,first=panel.querySelectorAll('[data-director-accept]')[0]!;first.onclick!();refresh.onclick!();assert.equal(panel.querySelectorAll('[data-director-accept]')[0]!.disabled,false);state={...state,seed:8};first.onclick!();assert.equal(sent.length,1);for(const tick of timers.values())tick();assert.equal(panel.querySelector('#director-current')!.innerHTML,'');
 close.onclick!();close.onclick!();visit.onclick!();assert.equal(closes,1);assert.equal(visits,0);assert.equal(timers.size,0);
}));

test('lab draft/apply/reset/repeat are isolated, retain applied timing and use actual inventory costs',()=>{
 const h=lab(),initial=h.inspect();assert.equal(initial.director.episodes.length,0);
 h.q('scenario').value='lean-stores';h.q('maxActive').value='1';h.q('apply').onclick!();assert.equal(h.inspect().director.episodes.length,0);assert.equal(h.inspect().director.tuning.maxActive,1);h.q('reset').onclick!();assert.equal(h.inspect().director.episodes.length,1);assert.equal(h.inspect().resources.materials,4);
 const accept=h.q('episodes').querySelectorAll('[data-director-lab-accept]')[0]!;accept.onclick!();assert.equal(h.inspect().director.episodes[0].status,'accepted');accept.onclick!();assert.equal(h.inspect().director.episodes[0].status,'accepted');
 const supplies=()=>h.q('actions').querySelectorAll('[data-director-lab-help]')[1]!;supplies().onclick!();assert.equal(h.inspect().inventory.scrap,18);assert.equal(h.inspect().resources.materials,16);assert.equal(h.inspect().director.episodes[0].status,'completed');supplies().onclick!();assert.equal(h.inspect().inventory.scrap,18,'real cooldown rejects repeats');
 h.q('restSeconds').value='300';h.q('discard').onclick!();assert.equal(h.q('restSeconds').value,'90');h.q('repeat').onclick!();assert.equal(h.inspect().resources.materials,4);assert.equal(h.inspect().inventory.scrap,20);assert.equal(h.inspect().director.episodes[0].status,'offered');
 h.q('defaults').onclick!();assert.equal(h.inspect().director.tuning.maxActive,1,'defaults are staged only');h.q('apply').onclick!();assert.deepEqual(h.inspect().director.tuning,TOWN_DIRECTOR_DEFAULTS);
 const prior=h.q('state').textContent;h.dispose();h.q('step').onclick!();h.q('reset').onclick!();supplies().onclick!();assert.equal(h.q('state').textContent,prior);
});

test('strict imported preset stages for explicit reset, invalid fields and blanks cannot replace model',()=>{
 const h=lab(),before=h.q('state').textContent;h.q('preset').onclick!();const preset=JSON.parse(h.q('json').value);h.q('json').value=JSON.stringify({...preset,seed:42,scenario:'social-strain',tuning:{restSeconds:30,deadlineSeconds:360,maxActive:2}});h.q('import').onclick!();assert.equal(h.q('state').textContent,before);assert.equal(h.q('seed').value,'42');h.q('reset').onclick!();assert.equal(h.inspect().director.seed,42);assert.equal(h.inspect().director.episodes.length,2);
 const snapshot=h.q('state').textContent;for(const value of [{...preset,script:'run'},{...preset,version:2},{...preset,tuning:{...preset.tuning,maxActive:99}}]){h.q('json').value=JSON.stringify(value);h.q('import').onclick!();assert.equal(h.q('state').textContent,snapshot);assert.match(h.q('status').textContent,/Unsupported/);}
 h.q('seed').value='';h.q('reset').onclick!();assert.equal(h.q('state').textContent,snapshot,'blank seed must not silently become seed zero');h.dispose();
});

test('evidence distinguishes intended/applied setup and bounds actions without campaign writes',()=>{
 const h=lab();for(const f of TOWN_DIRECTOR_TUNING_REGISTRY)h.q(f.key).value=String(f.max);h.q('apply').onclick!();for(let i=0;i<130;i++)h.q('apply').onclick!();h.q('restSeconds').value='30';h.q('evidence').onclick!();const report=JSON.parse(h.q('json').value);assert.equal(report.mode,'disposable-model');assert.equal(report.source,'director-ui-test');assert.equal(report.applied.tuning.restSeconds,300);assert.equal(report.intended.tuning.restSeconds,30);assert.equal(report.actions.length,128);assert.equal(report.actionsTruncated,true);assert.ok(!Object.keys(report).some(k=>['campaign','roomId','token'].includes(k)));h.dispose();
 const labSource=readFileSync(new URL('../src/town-director-lab.ts',import.meta.url),'utf8');assert.doesNotMatch(labSource,/from ['"].*(?:world|save|storage|coop)\.ts/);assert.doesNotMatch(labSource,/localStorage|sessionStorage|setTimeout|FileReader/);
 for(const file of ['town-director-ui.ts','town-director-lab.ts']){const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');for(const tag of source.matchAll(/<button\b[^>]*>/g))assert.match(tag[0],/type="button"/,file+' has implicit submit button');}
});

test('late clipboard results cannot overwrite reset or closed-panel status',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let resolve:()=>void=()=>{};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:()=>new Promise<void>(done=>{resolve=done;})}}});
 try{const h=lab();h.q('preset').onclick!();h.q('copy').onclick!();h.q('reset').onclick!();const message=h.q('status').textContent;resolve();await Promise.resolve();assert.equal(h.q('status').textContent,message);h.q('copy').onclick!();h.dispose();const closed=h.q('status').textContent;resolve();await Promise.resolve();assert.equal(h.q('status').textContent,closed);}finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else Reflect.deleteProperty(globalThis,'navigator');}
});
