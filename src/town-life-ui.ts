import {townResidents} from './town-residents.ts';
import {TOWN_CENTER,TOWN_BOUNDS,type TownResource} from './starting-town.ts';
import {applyTownLifeCommand,townLifeCommandCost,townLifeCommandPosition,townLifeFacilities,townLifeSummary,TOWN_LIFE_STEP,TOWN_LIFE_DEFAULTS,TOWN_LIFE_SERVICE_THRESHOLD,TOWN_LIFE_REPAIR_THRESHOLD,type TownLifeTuning,type TownLifeState,type TownLifeCommand,type TownLifeNeed} from './town-life.ts';

export const escapeTownLifeText=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const esc=escapeTownLifeText;
export const TOWN_LIFE_NEED_LABELS:Readonly<Record<TownLifeNeed,string>>=Object.freeze({nourishment:'Nourishment',energy:'Energy',hygiene:'Hygiene',comfort:'Comfort',connection:'Connection',fulfillment:'Fulfillment'});
export const TOWN_LIFE_NEED_KEYS=Object.freeze(Object.keys(TOWN_LIFE_NEED_LABELS) as TownLifeNeed[]);
const number=(n:number)=>Number.isFinite(n)?n.toFixed(1):'Unavailable';
const seconds=(n:number)=>`${number(Math.max(0,n))} s`;
const point=(p:{x:number;z:number})=>`x ${number(p.x)}, z ${number(p.z)}`;
const time=(life:TownLifeState)=>seconds(life.tick*TOWN_LIFE_STEP);

export interface TownLifePanelContext {
 seed:number;zone:string;regional?:boolean|{version:1};player:{x:number;z:number;hp:number};
 inventory:Record<TownResource,number>;townLife?:TownLifeState;
}
export interface TownLifeActionOption {command:TownLifeCommand;label:string;cost:string;effect:string;target:{x:number;z:number};targetLabel:string;gate:string;available:boolean}

/** Labels explain the finite material exchange; the pure command kernel owns eligibility. */
export function townLifeActionOptions(life:TownLifeState,context:TownLifePanelContext,index:number,facilityId:string,targetPosition?:(command:TownLifeCommand)=>{x:number;z:number}|undefined):TownLifeActionOption[]{
 const facilities=townLifeFacilities(life.seed),resident=life.residents[index],roster=townResidents(life.seed);
 const well=facilities.find(f=>f.kind==='well'),workshop=facilities.find(f=>f.kind==='workshop'),square=facilities.find(f=>f.kind==='square');
 const selected=facilities.find(f=>f.id===facilityId&&f.kind!=='home')??well;
 const result:TownLifeActionOption[]=[];
 const add=(kind:TownLifeCommand['kind'],targetId:string,target:{x:number;z:number},targetLabel:string,label:string,cost:string,effect:string,cooldown:number)=>{
  const command={kind,targetId,expectedRevision:life.revision};target=targetPosition?.(command)??townLifeCommandPosition(life,command)??target;
  const distance=Math.hypot(context.player.x-target.x,context.player.z-target.z),near=context.zone==='valley'&&context.regional!==false&&context.player.hp>0&&distance<=3.5;
  const available=near&&applyTownLifeCommand(life,context,command,target)!==null;
  const gate=!near?`Walk within 3.5 m of ${targetLabel}; ${number(distance)} m away.`:cooldown>0?`Available again in ${seconds(cooldown)}.`:available?'In reach. The model will recheck the cost and target when used.':'Currently unavailable: check your materials and this service’s condition, storage or cooldown.';
  const priced=townLifeCommandCost(kind),actualCost=Object.entries(priced).filter(([,v])=>v>0).map(([key,v])=>`${v} ${key}`).join(' + ');
  result.push({command,label,cost:actualCost||cost,effect,target,targetLabel,available,gate});
 };
 if(well)add('donate-water',well.id,well,well.label,'Contribute water','1 water canister','Adds 12 water to the shared town store. Consumes your canister.',life.cooldowns.donate);
 if(workshop)add('donate-supplies',workshop.id,workshop,workshop.label,'Contribute supplies','2 scrap','Adds 12 shared repair-material portions. Consumes your scrap; no food is created.',life.cooldowns.donate);
 if(selected)add('repair-service',selected.id,selected,selected.label,'Repair selected service','2 scrap',`Restores 40 service condition and reopens a station. Requires condition ${TOWN_LIFE_REPAIR_THRESHOLD} or below.`,life.cooldowns.repair);
 if(square)add('host-gathering',square.id,square,square.label,'Host a gathering','2 scrap + 1 water canister','Creates a 60-second gathering. Residents must choose, travel and take part to benefit.',life.cooldowns.gather);
 if(resident)add('encourage-resident',resident.id,resident,roster[index]?.name??resident.id,'Encourage selected resident','No materials · 60 s resident cooldown','A brief nearby encouragement changes the resident’s real state. No player rewards.',resident.encouragementCooldown);
 return result;
}

export function townLifeResidentHTML(life:TownLifeState,index:number,tuning:Readonly<TownLifeTuning>=TOWN_LIFE_DEFAULTS):string{
 const resident=life.residents[index],profile=townResidents(life.seed)[index];if(!resident||!profile)return '<p>Resident unavailable. Choose an existing resident.</p>';
 const summary=townLifeSummary(life,index),facility=townLifeFacilities(life.seed).find(f=>f.id===resident.facilityId),service=life.facilities.find(f=>f.id===resident.facilityId);
 const queued=service?.queue.indexOf(index)??-1;
 const home=townLifeFacilities(life.seed).find(f=>f.homeIndex===profile.homeIndex),homeState=life.facilities.find(f=>f.id===home?.id);
 const serviceInfo=facility&&service?`Service: ${service.occupants.length} acting + ${service.reservations.length} reserved / ${facility.capacity} places; ${service.queue.length} queued. Condition ${number(service.condition)}/100; ${service.closedFor>0?'closed for '+seconds(service.closedFor):service.condition<TOWN_LIFE_SERVICE_THRESHOLD?'unavailable below '+TOWN_LIFE_SERVICE_THRESHOLD+' condition':'open'}.`:'';
 const homeInfo=home&&homeState?`Home station: ${esc(home.label)} · ${point(home)} · ${home.capacity} places, ${homeState.occupants.length} acting, ${homeState.reservations.length} reserved, ${homeState.queue.length} queued.`:'';
 let remainingDistance=0,prior={x:resident.x,z:resident.z};for(const next of resident.path.slice(resident.pathIndex)){remainingDistance+=Math.hypot(next.x-prior.x,next.z-prior.z);prior=next;}
 const travel=resident.status==='traveling'?`${number(remainingDistance)} m of routed travel remaining${resident.speed>0?` · about ${seconds(remainingDistance/resident.speed)} at current speed`:' · moving when the simulation resumes'}`:'';
 const relationships=resident.relationships.map(rel=>{const other=townResidents(life.seed).find(r=>r.id===rel.residentId);return `<li>${esc(other?.name??rel.residentId)} · affinity ${number(rel.affinity)} · ${number(rel.shared)} shared moments</li>`;}).join('');
 return `<article class="life-card"><h3>${esc(profile.name)} · ${esc(profile.role)}</h3><p>${esc(profile.address)} · ${esc(profile.personality)} · enjoys ${esc(profile.interest)}<br>Position: ${point(resident)} · mood: <strong>${esc(resident.mood)}</strong> · stress ${number(resident.stress)}/100</p><div class="life-grid">${TOWN_LIFE_NEED_KEYS.map(key=>`<div class="life-need" data-low="${resident.needs[key]<30}"><div class="life-need-label"><label for="life-need-${key}">${TOWN_LIFE_NEED_LABELS[key]}</label><strong>${number(resident.needs[key])} / 100</strong></div><meter id="life-need-${key}" min="0" max="100" low="30" high="70" optimum="100" value="${resident.needs[key]}" aria-label="${TOWN_LIFE_NEED_LABELS[key]} ${number(resident.needs[key])} out of 100"></meter></div>`).join('')}</div><p>Higher needs are better. These are simulated values, not schedule labels.</p><h4>What they are doing</h4><p><strong>${esc(summary.activity)}</strong> · ${esc(resident.status)}<br>${esc(resident.reason)}<br>Destination: ${esc(facility?.label??'No reserved destination')}${facility?` · ${point(facility)}`:''}<br>${travel?esc(travel)+'<br>':''}${resident.status==='queued'?`Queue position ${queued>=0?queued+1:'awaiting assignment'} · ${seconds(resident.waited)} waited<br>`:''}Commitment remaining: ${seconds(resident.committed/tuning.actionSpeed)} · action time remaining: ${seconds(resident.remaining/tuning.actionSpeed)}<br>${serviceInfo}<br>${homeInfo}</p><h4>Personal goal</h4><p>${esc(summary.desire)}</p><details><summary>Traits & relationships</summary><p>Affinity ranges from −100 to 100; shared moments count completed encounters.</p><p>Need priorities: ${TOWN_LIFE_NEED_KEYS.map(k=>`${TOWN_LIFE_NEED_LABELS[k]} ${number(resident.traits[k])}`).join(' · ')}</p><p>${esc(profile.backstory)}</p><ul>${profile.relationships.map(r=>`<li>${esc(townResidents(life.seed).find(p=>p.id===r.residentId)?.name??r.residentId)} · ${esc(r.kind)}</li>`).join('')}${relationships||'<li>No simulated social ties recorded yet.</li>'}</ul></details><details><summary>Decision evidence</summary><ul>${summary.diagnostics.map(d=>`<li>${esc(d)}</li>`).join('')}</ul><p>${resident.completed} actions completed · ${resident.interruptions} interruptions · unmet-need time ${seconds(resident.unmetSeconds)}</p></details></article>`;
}

export function townLifeFacilitiesHTML(life:TownLifeState,selectedId:string):string{
 const facilities=townLifeFacilities(life.seed),shown=facilities.filter(f=>f.kind!=='home'||f.id===selectedId);
 return shown.map(f=>{const state=life.facilities.find(s=>s.id===f.id),occupied=state?.occupants.length??0,reserved=state?.reservations.length??0,closed=state?.closedFor??0;return `<article class="life-card"><h4>${esc(f.label)}${f.id===selectedId?' · SELECTED':''}</h4><p>${point(f)} · ${esc(f.kind)} · ${f.capacity} service places<br>Condition ${number(state?.condition??0)}/100 · ${closed>0?`closed for ${seconds(closed)}`:(state?.condition??0)<TOWN_LIFE_SERVICE_THRESHOLD?'Out of service':'Open · activities still require supplies'}<br>${occupied} acting · ${reserved} reserved / traveling · ${state?.queue.length??0} queued · ${closed>0||(state?.condition??0)<TOWN_LIFE_SERVICE_THRESHOLD?0:Math.max(0,f.capacity-occupied-reserved)} places available<br>Supports: ${f.actions.map(a=>esc(a.replaceAll('-',' '))).join(', ')}</p></article>`;}).join('');
}

export function townLifeSharedHTML(life:TownLifeState):string{
 return `<p>Pantry: <strong>${number(life.resources.pantry)}</strong> portions · Water: <strong>${number(life.resources.water)}</strong> units · Materials: <strong>${number(life.resources.materials)}</strong> units · Harvest: <strong>${number(life.resources.harvest)}</strong> units</p><p>Remaining source reserves: field ${number(life.sources.field)} · aquifer ${number(life.sources.aquifer)} · salvage ${number(life.sources.salvage)}. Town resources are separate from your inventory.</p>${life.gathering>0?`<p>Gathering active: ${seconds(life.gathering)} remaining.</p>`:''}`;
}

/** A schematic of authoritative X/Z values, never a movement or teleport control. */
export function drawTownLifeMap(canvas:HTMLCanvasElement,life:TownLifeState,index:number,facilityId:string,player?:{x:number;z:number}){
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const width=canvas.width,height=canvas.height,pad=22,scale=Math.min((width-pad*2)/(TOWN_BOUNDS.halfWidth*2),(height-pad*2)/(TOWN_BOUNDS.halfDepth*2));
 const xy=(p:{x:number;z:number})=>({x:width/2+(p.x-TOWN_CENTER.x)*scale,y:height/2+(p.z-TOWN_CENTER.z)*scale});
 ctx.fillStyle='#0b211e';ctx.fillRect(0,0,width,height);ctx.strokeStyle='#456b5944';ctx.lineWidth=10;ctx.beginPath();
 for(const z of [-44,-24,0,24,44]){const a=xy({x:TOWN_CENTER.x-55,z:TOWN_CENTER.z+z}),b=xy({x:TOWN_CENTER.x+55,z:TOWN_CENTER.z+z});ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}ctx.stroke();
 for(const f of townLifeFacilities(life.seed)){const p=xy(f),selected=f.id===facilityId,state=life.facilities.find(s=>s.id===f.id);ctx.fillStyle=(state?.closedFor??0)>0||(state?.condition??0)<TOWN_LIFE_SERVICE_THRESHOLD?'#c1786c':f.kind==='home'?'#527262':'#d0b775';ctx.fillRect(p.x-4,p.y-4,8,8);if(selected){ctx.strokeStyle='#fff1af';ctx.lineWidth=2;ctx.strokeRect(p.x-7,p.y-7,14,14);}if(f.kind!=='home'){ctx.fillStyle='#e5e7d4';ctx.font='10px sans-serif';ctx.fillText(f.label.slice(0,20),p.x+6,p.y-6);}}
 for(const r of life.residents){const p=xy(r);ctx.fillStyle=r.index===index?'#ffe4a0':r.mood==='distressed'?'#e89d84':'#a9cbbb';ctx.beginPath();ctx.arc(p.x,p.y,r.index===index?4.5:1.8,0,Math.PI*2);ctx.fill();if(r.index===index){ctx.strokeStyle='#fff3c2';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.stroke();}}
 if(player){const p=xy(player);ctx.fillStyle='#ffffff';ctx.beginPath();ctx.moveTo(p.x,p.y-5);ctx.lineTo(p.x+5,p.y+4);ctx.lineTo(p.x-5,p.y+4);ctx.closePath();ctx.fill();}
 ctx.fillStyle='#d7ddc8';ctx.font='12px sans-serif';ctx.fillText('N ↑  ·  schematic, no teleport',10,16);
}

/** Read-only inspection plus real explicitly requested, revision-checked player commands. */
export function mountTownLifePanel(panel:HTMLElement,options:{state:()=>TownLifePanelContext;act:(command:TownLifeCommand)=>void;visit:()=>void;close:()=>void;ready:()=>boolean;selectedResident?:string;selectedFacility?:string;requests?:()=>void;target?:(command:TownLifeCommand)=>{x:number;z:number}|undefined}){
 const initial=options.state(),seed=initial.seed,roster=townResidents(seed),facilities=townLifeFacilities(seed),publicFacilities=facilities.filter(f=>f.kind!=='home');
 let alive=true,selected=roster.findIndex(r=>r.id===options.selectedResident),selectedFacility=publicFacilities.find(f=>f.id===options.selectedFacility)?.id??publicFacilities[0]?.id??'',pendingRevision:number|null=null,locked=false;
 if(selected<0)selected=0;
 panel.innerHTML=`<div class="town-life"><button type="button" class="close" aria-label="Close town life">×</button><span class="eyebrow">Hearthmere · living town</span><h2>Life around you</h2><p>Inspect all 100 residents’ actual needs, choices and shared services. In solo play this menu pauses the world; close it to let people travel, wait and act. Online time continues.</p><div class="row"><button type="button" id="life-visit">Visit town square</button><button type="button" id="life-refresh">Refresh action status</button>${options.requests?'<button type="button" id="life-requests">Town requests & history</button>':''}</div><p>Visit reaches the normal town entrance. Walk from there to a resident or the service coordinates below.</p><label for="life-person">Resident · all 100 people</label><select id="life-person">${roster.map((r,i)=>`<option value="${i}">${esc(r.name)} · ${esc(r.role)}</option>`).join('')}</select><p id="life-clock"></p><canvas id="life-map" width="560" height="430" aria-label="Town schematic with resident and service positions"></canvas><p class="life-legend">Gold ring: selected resident · outlined square: selected service · white triangle: you · red: distressed resident or closed service. Exact positions are listed below.</p><div id="life-person-detail"></div><h3>Shared stores</h3><div id="life-shared"></div><h3>Help the town</h3><p id="life-inventory"></p><label for="life-service">Service to inspect or repair</label><select id="life-service">${publicFacilities.map(f=>`<option value="${esc(f.id)}">${esc(f.label)} · ${point(f)}</option>`).join('')}</select><p id="life-status" class="life-status" role="status">Actions use your real inventory. Eligibility is rechecked when you act.</p><div id="life-actions"></div><details><summary>Service capacity, queues & locations</summary><div id="life-facilities"></div></details><details><summary>Town event journal</summary><div id="life-journal"></div></details><details><summary>Resource conservation evidence</summary><pre id="life-ledger"></pre></details></div>`;
 const q=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
 const status=(message:string)=>{if(alive)q('life-status').textContent=message;};
 const dispose=()=>{if(!alive)return;alive=false;clearInterval(timer);};
 panel.querySelector<HTMLButtonElement>('.close')!.onclick=()=>{dispose();options.close();};
 const requests=panel.querySelector<HTMLButtonElement>('#life-requests');if(requests)requests.onclick=()=>{if(alive&&options.requests){dispose();options.requests();}};
 q<HTMLButtonElement>('life-visit').onclick=()=>{if(alive){dispose();options.visit();}};
 q<HTMLSelectElement>('life-person').value=String(selected);q<HTMLSelectElement>('life-service').value=selectedFacility;
 function refresh(){
  if(!alive)return;const context=options.state(),life=context.townLife;
  if(context.seed!==seed){q('life-actions').innerHTML='';status('World changed. Close and reopen town life for the current world.');return;}
  if(!life){q('life-actions').innerHTML='';q('life-person-detail').textContent='Town life is available in regional worlds. Visit the town to begin.';return;}
  if(pendingRevision!==null&&life.revision!==pendingRevision){pendingRevision=null;status('Town state updated. Current inventory and the event journal show the result.');}
  q('life-clock').textContent=`Town model time ${time(life)} · revision ${life.revision}`;
  q('life-person-detail').innerHTML=townLifeResidentHTML(life,selected);q('life-shared').innerHTML=townLifeSharedHTML(life);
  q('life-inventory').textContent=`Your inventory: ${context.inventory.scrap} scrap · ${context.inventory.core} cores · ${context.inventory.water} water canisters. Contributions are consumed, with no player rewards.`;
  const choices=townLifeActionOptions(life,context,selected,selectedFacility,options.target),ready=options.ready()&&!locked&&pendingRevision===null;
  q('life-actions').innerHTML=choices.map((a,i)=>`<div class="life-action"><button type="button" data-life-action="${i}" ${a.available&&ready?'':'disabled'}>${esc(a.label)} · ${esc(a.cost)}</button><small>${esc(a.effect)}<br>At ${esc(a.targetLabel)} · ${point(a.target)}<br>${esc(!options.ready()?'Wait until world controls are ready.':pendingRevision!==null?'Request sent. Waiting for the town state; Refresh can recheck a rejected request.':a.gate)}</small></div>`).join('');
  for(const button of q('life-actions').querySelectorAll<HTMLButtonElement>('[data-life-action]'))button.onclick=()=>{
   if(!alive||locked||pendingRevision!==null||!options.ready())return;
   const now=options.state();if(now.seed!==seed||!now.townLife)return;
   const action=townLifeActionOptions(now.townLife,now,selected,selectedFacility,options.target)[Number(button.dataset.lifeAction)];if(!action?.available)return;
   locked=true;pendingRevision=now.townLife.revision;status(`${action.label} requested. Waiting for the authoritative town result.`);
   try{options.act(action.command);}catch{pendingRevision=null;status('The action could not be sent. Refresh and try again.');}
   refresh();
  };
  q('life-facilities').innerHTML=townLifeFacilitiesHTML(life,selectedFacility);q('life-ledger').textContent=JSON.stringify({resources:life.resources,sources:life.sources,ledger:life.ledger,sourceLedger:life.sourceLedger,contributions:life.contributions,playerSpent:life.playerSpent},null,2);
  q('life-journal').innerHTML=townLifeJournalHTML(life);
  drawTownLifeMap(q<HTMLCanvasElement>('life-map'),life,selected,selectedFacility,context.zone==='valley'?context.player:undefined);
 }
 q<HTMLSelectElement>('life-person').onchange=()=>{if(!alive)return;const index=Number(q<HTMLSelectElement>('life-person').value);if(Number.isInteger(index)&&roster[index]){selected=index;refresh();}};
 q<HTMLSelectElement>('life-service').onchange=()=>{if(!alive)return;const id=q<HTMLSelectElement>('life-service').value;if(publicFacilities.some(f=>f.id===id)){selectedFacility=id;refresh();}};
 q<HTMLButtonElement>('life-refresh').onclick=()=>{if(!alive)return;locked=false;pendingRevision=null;refresh();status('Current eligibility refreshed. Unavailable actions have not spent anything.');};
 const timer=setInterval(()=>{locked=false;refresh();},500);refresh();return dispose;
}

/** The model supplies the journal; never invent success entries in the UI. */
export function townLifeJournalHTML(life:TownLifeState):string{
 // Event formatting is intentionally text-only; the model owns the bounded data.
 const journal=life.events;
 if(!journal.length)return '<p>No recorded town events yet. Let the simulation run or take a supported action.</p>';
 return `<ol class="life-journal">${journal.slice(-32).reverse().map(entry=>`<li>${seconds(entry.tick*TOWN_LIFE_STEP)} · ${esc(entry.kind)} · ${esc(entry.text)}</li>`).join('')}</ol><small>Most recent ${Math.min(32,journal.length)} bounded model events, newest first.</small>`;
}
