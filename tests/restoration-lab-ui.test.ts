import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountRestorationLab,parseRestorationLabPreset,RESTORATION_LAB_MAX_SECONDS} from '../src/restoration-lab.ts';
import {RESTORATION_DEFAULTS,RESTORATION_TUNING_REGISTRY} from '../src/restoration-plan.ts';

/** Non-rendering DOM contract only; no layout, touch or browser certification. */
class Element{
 inner='';nodes=new Map<string,Element>();dataNodes:Element[]=[];value='';textContent='';disabled=false;dataset:Record<string,string>={};
 onclick?:()=>void;onchange?:()=>void;oninput?:()=>void;
 get innerHTML(){return this.inner;}
 set innerHTML(value:string){this.inner=value;this.nodes.clear();this.dataNodes=[];for(const match of value.matchAll(/<([a-z]+)\b([^>]*)>/g)){const attrs=match[2]!,id=/id="([^"]+)"/.exec(attrs)?.[1],data=[...attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)];if(!id&&!data.length&&!/class="close"/.test(attrs))continue;const el=new Element();el.value=/value="([^"]*)"/.exec(attrs)?.[1]??'';el.disabled=/\bdisabled\b/.test(attrs);for(const d of data)el.dataset[d[1]!.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase())]=d[2]!;if(data.length)this.dataNodes.push(el);if(id)this.nodes.set('#'+id,el);if(/class="close"/.test(attrs))this.nodes.set('.close',el);}}
 querySelector(selector:string):Element|null{return this.nodes.get(selector)??[...this.nodes.values()].map(n=>n.querySelector(selector)).find(Boolean)??null;}
 querySelectorAll(selector:string):Element[]{const key=/\[data-([a-z-]+)\]/.exec(selector)?.[1]?.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase());return [...this.dataNodes.filter(n=>key&&Object.hasOwn(n.dataset,key)),...[...this.nodes.values()].flatMap(n=>n.querySelectorAll(selector))];}
}

function setup(){const panel=new Element();let closed=0;const dispose=mountRestorationLab(panel as unknown as HTMLElement,{seed:73129,source:'ui-test-source',build:'ui-test-build',close(){closed++;}}),q=(id:string)=>panel.querySelector('#restoration-lab-'+id)!,inspect=()=>JSON.parse(q('inspect').textContent),actions=()=>q('actions').querySelectorAll('[data-restoration-lab-action]');return{panel,dispose,q,inspect,actions,closed:()=>closed};}

test('model is labeled separately from playable practice and starts with finite stocks and no machine',()=>{
 const h=setup(),e=h.inspect();assert.match(h.panel.innerHTML,/numerical experiment/);assert.match(h.panel.innerHTML,/separate playable practice/);assert.equal(e.actual.restoration.machine,null);assert.equal(e.actual.inventory.scrap,16);assert.equal(e.elapsed,0);assert.equal(e.source,'ui-test-source');assert.equal(e.build,'ui-test-build');assert.equal(e.actual.restoration.sites.length,3);assert.match(h.q('sites').innerHTML,/Dormant/);assert.match(h.panel.innerHTML,/Stand beside, not on, dock to deploy/);assert.equal(e.actual.player.z,-5.5);h.dispose();
});
test('staged low/default/high tuning and section reset affect only explicit apply',()=>{
 const h=setup();h.q('low').onclick!();assert.deepEqual(h.inspect().actual.preset.tuning,RESTORATION_DEFAULTS);h.q('apply').onclick!();for(const r of RESTORATION_TUNING_REGISTRY)assert.equal(h.inspect().actual.preset.tuning[r.key],r.min);
 h.q('high').onclick!();h.q('discard').onclick!();for(const r of RESTORATION_TUNING_REGISTRY)assert.equal(h.q('number-'+r.key).value,String(r.min));
 const one=h.panel.querySelectorAll('[data-restoration-default]')[0]!;one.onclick!();assert.equal(h.q('number-waterConductance').value,'20');assert.equal(h.inspect().actual.preset.tuning.waterConductance,1);
 h.q('tuning-defaults').onclick!();h.q('apply').onclick!();assert.deepEqual(h.inspect().actual.preset.tuning,RESTORATION_DEFAULTS);h.dispose();
});
test('seed/setup/reset and recipe are staged; actual kernel refit/service/deploy and repeated handler are safe',()=>{
 const h=setup();h.q('seed').value='42';h.q('scenario').value='damaged-suit';h.q('recipe-organ').value='filter';h.q('recipe-organ').onchange!();assert.equal(h.inspect().seed,73129);h.q('reset-draft').onclick!();assert.equal(h.inspect().seed,42);assert.equal(h.inspect().actual.player.hp,40);assert.equal(h.inspect().actual.restoration.machine,null);
 const refit=h.actions()[0]!;refit.onclick!();const after=h.inspect();assert.equal(after.actual.restoration.machine.recipe.organ,'filter');refit.onclick!();assert.deepEqual(h.inspect(),after,'retained stale refit cannot repeat');
 h.actions()[1]!.onclick!();assert.equal(h.inspect().actual.restoration.machine.charge,100);h.actions()[2]!.onclick!();assert.equal(h.inspect().actual.restoration.machine.status,'idle');
 h.q('reset').onclick!();assert.equal(h.inspect().actual.restoration.machine,null);assert.equal(h.inspect().actual.inventory.scrap,16);assert.equal(h.inspect().elapsed,0);h.dispose();
});
test('reset starts from applied inputs, defaults remain staged, and no normal state is accepted',()=>{
 const h=setup();h.q('seed').value='42';h.q('reset-draft').onclick!();h.q('defaults').onclick!();assert.equal(h.inspect().seed,42);assert.equal(h.q('seed').value,'73129');h.q('reset').onclick!();assert.equal(h.inspect().seed,42);assert.equal(h.q('seed').value,'42');
 h.q('number-waterConductance').value='Infinity';const before=h.inspect();h.q('apply').onclick!();assert.deepEqual(h.inspect(),before);assert.match(h.q('status').textContent,/Unsupported/);h.q('number-waterConductance').value='';h.q('apply').onclick!();assert.match(h.q('status').textContent,/Fill in/);h.dispose();
});
test('manual step honors quarter-second and total bound; close makes retained handlers inert',()=>{
 const h=setup();for(const bad of ['0','61','NaN','Infinity','0.3','']){h.q('step-seconds').value=bad;h.q('step').onclick!();assert.equal(h.inspect().elapsed,0);}
 h.q('step-seconds').value='60';for(let i=0;i<RESTORATION_LAB_MAX_SECONDS/60;i++)h.q('step').onclick!();assert.equal(h.inspect().elapsed,1200);h.q('step').onclick!();assert.equal(h.inspect().elapsed,1200);assert.match(h.q('status').textContent,/bound/);
 const after=h.q('inspect').textContent;h.panel.querySelector('.close')!.onclick!();h.panel.querySelector('.close')!.onclick!();h.q('reset').onclick!();h.q('step').onclick!();assert.equal(h.closed(),1);assert.equal(h.q('inspect').textContent,after);h.dispose();
});
test('source/target controls remain stable while step and relocation use real numerical authority',()=>{
 const h=setup(),source=h.q('source'),target=h.q('target');target.value='tank';target.onchange!();h.q('step').onclick!();assert.equal(h.q('source'),source);assert.equal(h.q('target'),target);assert.equal(target.value,'tank');h.q('site').value='lab-east';h.q('site').onchange!();h.q('at-dock').onclick!();assert.equal(h.inspect().actual.player.x,6);assert.equal(h.inspect().actions.at(-1).kind,'relocate');h.dispose();
});
test('preset import only stages; actual provenance and intended import remain distinct in evidence',()=>{
 const h=setup();h.q('preset').onclick!();const p=parseRestorationLabPreset(h.q('json').value);h.q('json').value=JSON.stringify({...p,seed:99,source:'external-preset',build:'external-build',tuning:{...p.tuning,waterConductance:60}});h.q('import').onclick!();assert.equal(h.inspect().seed,73129);assert.equal(h.q('seed').value,'99');h.q('report').onclick!();let e=JSON.parse(h.q('json').value);assert.equal(e.source,'ui-test-source');assert.equal(e.actual.preset.tuning.waterConductance,20);assert.equal(e.intended.preset.source,'external-preset');assert.equal(e.intended.preset.seed,99);
 h.q('reset-draft').onclick!();h.q('report').onclick!();e=JSON.parse(h.q('json').value);assert.equal(e.source,'ui-test-source');assert.equal(e.actual.preset.source,'external-preset');assert.equal(e.actual.preset.seed,99);assert.equal(e.actions.length,0);h.q('import').onclick!();assert.match(h.q('status').textContent,/Unsupported/);h.dispose();
});
test('strict imports reject unknown keys, wrong versions and invalid bodies without mutation',()=>{
 const h=setup();h.q('preset').onclick!();const good=JSON.parse(h.q('json').value),before=h.inspect();for(const bad of [{...good,version:2},{...good,roomId:'secret'},{...good,source:'<script>'},{...good,recipe:{...good.recipe,support:'flying'}},{...good,tuning:{...good.tuning,airConductance:0}}]){h.q('json').value=JSON.stringify(bad);h.q('import').onclick!();assert.deepEqual(h.inspect(),before);assert.match(h.q('status').textContent,/Unsupported/);}h.q('json').value=' '.repeat(25000);h.q('import').onclick!();assert.match(h.q('status').textContent,/24 KB/);h.dispose();
});
test('late clipboard settlements cannot replace reset, edited text or disposed-panel status',async()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'navigator');let resolve:()=>void=()=>{};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:()=>new Promise<void>(done=>resolve=done)}}});
 try{const h=setup();h.q('preset').onclick!();h.q('copy').onclick!();h.q('reset').onclick!();const reset=h.q('status').textContent;resolve();await Promise.resolve();assert.equal(h.q('status').textContent,reset);h.q('copy').onclick!();h.q('json').value='edited';h.q('json').oninput!();const edited=h.q('status').textContent;resolve();await Promise.resolve();assert.equal(h.q('status').textContent,edited);h.q('copy').onclick!();h.dispose();const closed=h.q('status').textContent;resolve();await Promise.resolve();assert.equal(h.q('status').textContent,closed);}finally{if(old)Object.defineProperty(globalThis,'navigator',old);else Reflect.deleteProperty(globalThis,'navigator');}
});
test('shared gate supplies no model controls and no source has persistence or background simulation timers',()=>{
 const p=new Element();let closed=0;const dispose=mountRestorationLab(p as unknown as HTMLElement,{seed:73129,shared:true,close(){closed++;}});assert.match(p.innerHTML,/Solo-only/);assert.equal(p.querySelector('#restoration-lab-step'),null);p.querySelector('.close')!.onclick!();assert.equal(closed,1);dispose();
 const source=readFileSync(new URL('../src/restoration-lab.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/localStorage|sessionStorage|setInterval|setTimeout|FileReader|from ['"].*(?:world|save|coop)\.ts/);assert.equal((source.match(/<button(?! type="button")/g)??[]).length,0);
});
