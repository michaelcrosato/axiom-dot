import {DEFAULT_WORKSHOP_DRAFT,WORKSHOP_AUTHORING_FIELDS,WORKSHOP_PRESET_MAX_BYTES,compileWorkshopDraft,validateWorkshopDraft,importWorkshopPreset,exportWorkshopPreset,workshopAuthoringReport,type WorkshopDraft,type WorkshopAuthoringResult} from './workshop-authoring.ts';
export interface WorkshopAuthoringOptions {
 seed:number;onClose:()=>void;
 generate?:(parameters:WorkshopDraft,signal:AbortSignal)=>Promise<WorkshopAuthoringResult>;
 download?:(name:string,text:string)=>void;
}
const abort=()=>new DOMException('Preview canceled','AbortError');
async function generate(parameters:WorkshopDraft,signal:AbortSignal){await Promise.resolve();if(signal.aborted)throw abort();return compileWorkshopDraft(parameters);}
function download(name:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));try{const a=document.createElement('a');a.href=url;a.download=name;a.click();}finally{URL.revokeObjectURL(url);}}
/** Mounts an independent panel. No State, storage, world-generation, or room API is imported. */
export function mountWorkshopAuthoring(panel:HTMLElement,options:WorkshopAuthoringOptions){
 const defaults=validateWorkshopDraft({...DEFAULT_WORKSHOP_DRAFT,seed:options.seed});
 panel.innerHTML=`<button id="wa-close" class="close" aria-label="Close workshop authoring">×</button><span class="eyebrow">AXIOM · disposable recipe editor v1</span><h2>Workshop authoring</h2><p>Dimensions change real solids in this preview only. One main hall and 1–3 rear rooms. No campaign placement, foundation change, terrain editing or world save.</p><form id="wa-form">${WORKSHOP_AUTHORING_FIELDS.map(f=>`<label for="wa-${f.key}">${f.label} (${f.unit})</label><input id="wa-${f.key}" type="number" min="${f.min}" max="${f.max}" step="${f.step}" required><small>${f.effect} Apply to regenerate.</small>`).join('')}<div class="row"><button type="submit">Apply & regenerate</button><button id="wa-discard" type="button">Discard edits</button><button id="wa-defaults" type="button">Stage defaults</button><button id="wa-reset" type="button">Reset applied preview</button></div></form><p id="wa-status" role="status" aria-live="polite"></p><p id="wa-applied"></p><canvas id="wa-plan" width="560" height="380" aria-label="Top-down real workshop solids, door gaps, checked routes and exposed work and entry ports"></canvas><p>Plan view: pale walls, outlined roof, green checked routes, gold work and entry ports. It is a geometry preview, not rendered-device certification.</p><pre id="wa-summary"></pre><details><summary>Constraints, costs, connections and version report</summary><pre id="wa-report"></pre></details><details><summary>Expanded data-only recipe</summary><pre id="wa-recipe"></pre></details><label for="wa-text">Portable preset / report text fallback (4 KB maximum for preset imports)</label><textarea id="wa-text" rows="8" spellcheck="false"></textarea><div class="row"><button id="wa-import-text" type="button">Stage preset text</button><button id="wa-export" type="button">Export applied preset</button><button id="wa-evidence" type="button">Export applied report</button></div><label for="wa-file">Stage preset from file</label><input id="wa-file" type="file" accept="application/json,.json">`;
 const get=<T extends HTMLElement>(id:string)=>panel.querySelector<T>(`#${id}`)!;
 const canvas=get<HTMLCanvasElement>('wa-plan'),status=get('wa-status'),text=get<HTMLTextAreaElement>('wa-text');
 const fields=Object.fromEntries(WORKSHOP_AUTHORING_FIELDS.map(f=>[f.key,get<HTMLInputElement>(`wa-${f.key}`)])) as Record<keyof WorkshopDraft,HTMLInputElement>;
 let disposed=false,ticket=0,controller:AbortController|undefined,applied:WorkshopAuthoringResult|undefined;
 const current=()=>!disposed&&panel.querySelector('#wa-plan')===canvas;
 function cancel(){ticket++;controller?.abort();controller=undefined;}
 function fill(draft:WorkshopDraft){for(const f of WORKSHOP_AUTHORING_FIELDS)fields[f.key].value=String(draft[f.key]);}
 function read(){return validateWorkshopDraft(Object.fromEntries(WORKSHOP_AUTHORING_FIELDS.map(f=>[f.key,fields[f.key].value.trim()?Number(fields[f.key].value):NaN])));}
 function staged(){if(!current())return;cancel();status.textContent='Edits staged. Apply & regenerate to replace the visible applied preview.';}
 function draw(result:WorkshopAuthoringResult){const c=canvas.getContext('2d');if(!c)return;const w=result.workshop,p=w.plan,scale=32,X=(x:number)=>280+x*scale,Z=(z:number)=>180+z*scale;c.clearRect(0,0,560,380);c.fillStyle='#153b35';c.fillRect(0,0,560,380);
  for(const s of [...p.shapes].sort((a,b)=>a.center.y-b.center.y)){const x=X(s.center.x-s.half.x),z=Z(s.center.z-s.half.z),dx=s.half.x*2*scale,dz=s.half.z*2*scale;c.strokeStyle='#a7bcaa';if(s.center.y-s.half.y>=2.5){c.strokeRect(x,z,dx,dz);continue;}c.fillStyle=s.center.y+s.half.y<.1?'#426256':s.material.includes('timber')?'#b39b75':'#b6c6b4';c.fillRect(x,z,dx,dz);}
  c.strokeStyle='#74e8bd';c.lineWidth=2;for(const route of result.routes){c.beginPath();route.points.forEach((q,i)=>i?c.lineTo(X(q.x),Z(q.z)):c.moveTo(X(q.x),Z(q.z)));c.stroke();}for(const e of p.exposed){c.fillStyle='#f4ce8a';c.beginPath();c.arc(X(e.port.position.x),Z(e.port.position.z),4,0,Math.PI*2);c.fill();}c.fillStyle='#d9e8d7';c.font='12px sans-serif';c.fillText('N ↑ · 1 m = 32 px',12,22);
 }
 function render(result:WorkshopAuthoringResult){const p=result.workshop.plan;get('wa-applied').textContent=`Applied: seed ${result.parameters.seed}; ${result.parameters.rearRooms} rear rooms; ${result.parameters.width} × ${result.parameters.depth} m; hall ${result.parameters.hallDepth} m; door ${result.parameters.doorwayWidth} m.`;
  get('wa-summary').textContent=`VALID PLAN · ${p.nodes.length}/${result.recipe.limits.nodes} nodes · ${p.shapes.length} shapes · ${p.operations}/${result.recipe.limits.operations} operations\n${p.connections.length} actual connections · ${p.constraints.length} passed constraints\nCost: ${Object.entries(p.costs).map(([k,v])=>`${v} ${k}`).join(' · ')}\nIsolated owner ${p.owner}; recipe ${p.recipe.id}@${p.recipe.version}.`;
  get('wa-report').textContent=JSON.stringify(workshopAuthoringReport(result),null,2);get('wa-recipe').textContent=JSON.stringify(result.recipe,null,2);draw(result);
 }
 async function apply(input?:WorkshopDraft){if(!current())return;cancel();const request=ticket;let draft:WorkshopDraft;try{draft=input??read();}catch(error){status.textContent=error instanceof Error?error.message:'Invalid parameters';return;}controller=new AbortController();status.textContent='Compiling the bounded isolated preview…';
  try{const result=await (options.generate??generate)(draft,controller.signal);if(!current()||request!==ticket)return;
   // Injected asynchronous compilation must match the exact requested parameters.
   if(JSON.stringify(validateWorkshopDraft(result.parameters))!==JSON.stringify(validateWorkshopDraft(draft))||!result.workshop.plan.valid)throw new Error('Mismatched or invalid preview result');
   applied=result;fill(draft);render(result);status.textContent='Applied. Real compiler and standing-route checks passed; campaign unchanged.';
  }catch(error){if(!current()||request!==ticket||(error instanceof Error&&error.name==='AbortError'))return;status.textContent=error instanceof Error?error.message:'Could not compile preview';}
 }
 function stagePreset(value:string){const draft=importWorkshopPreset(value);cancel();fill(draft);status.textContent='Preset staged. Apply & regenerate to preview it.';}
 function exportData(report:boolean){if(!current())return;if(!applied){status.textContent='Apply a valid preview first.';return;}const value=report?JSON.stringify(workshopAuthoringReport(applied),null,2):exportWorkshopPreset(applied.parameters),name=report?'axiom-workshop-report-v1.json':'axiom-workshop-preset-v1.json';text.value=value;try{(options.download??download)(name,value);status.textContent='Export prepared. The same applied data is in the text fallback.';}catch{status.textContent='Download unavailable. Copy the applied data from the text fallback.';}}
 function dispose(){if(disposed)return;disposed=true;cancel();}
 function close(){if(!current())return;dispose();options.onClose();}
 fill(defaults);for(const f of WORKSHOP_AUTHORING_FIELDS)fields[f.key].oninput=staged;
 get<HTMLFormElement>('wa-form').onsubmit=e=>{e.preventDefault();void apply();};get('wa-close').onclick=close;
 get('wa-discard').onclick=()=>{if(!current())return;cancel();fill(applied?.parameters??defaults);status.textContent='Unapplied edits discarded.';};
 get('wa-defaults').onclick=()=>{if(!current())return;cancel();fill(defaults);status.textContent='Defaults staged. Apply & regenerate to preview them.';};
 get('wa-reset').onclick=()=>{if(!current())return;const value=applied?.parameters??defaults;fill(value);void apply(value);};
 get('wa-import-text').onclick=()=>{if(!current())return;try{stagePreset(text.value);}catch(error){status.textContent=error instanceof Error?error.message:'Invalid preset';}};
 text.oninput=()=>{if(current())cancel();};
 get<HTMLInputElement>('wa-file').onchange=async()=>{if(!current())return;cancel();const request=ticket,file=get<HTMLInputElement>('wa-file').files?.[0];if(!file)return;try{if(file.size>WORKSHOP_PRESET_MAX_BYTES)throw new Error('Preset exceeds 4 KB');const value=await file.text();if(!current()||request!==ticket)return;stagePreset(value);}catch(error){if(current()&&request===ticket)status.textContent=error instanceof Error?error.message:'Could not read preset';}};
 get('wa-export').onclick=()=>exportData(false);get('wa-evidence').onclick=()=>exportData(true);void apply(defaults);
 return {dispose,getApplied:()=>applied,apply};
}
