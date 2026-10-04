import {applyRestorationCommand,restorationBalances,restorationCommandPosition,restorationMachinePosition,RESTORATION_RULES,type RestorationState,type RestorationContext,type RestorationCommand,type RestorationPlan} from './restoration.ts';
import {compileRestorationBody,DEFAULT_RESTORATION_RECIPE,RESTORATION_PARTS,type RestorationBodyRecipe} from './restoration-body.ts';
import {compileUtilityAbility,DEFAULT_UTILITY_RECIPE,type UtilityRecipeInput} from './utility-ability.ts';

export const escapeRestorationText=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const esc=escapeRestorationText;
const num=(n:number)=>Number.isFinite(n)?n.toFixed(1):'unavailable';
const point=(p:{x:number;z:number})=>`x ${num(p.x)}, z ${num(p.z)}`;
export interface RestorationPanelContext extends RestorationContext {restoration?:RestorationState}
export interface RestorationDraft {recipe:RestorationBodyRecipe;ability:UtilityRecipeInput}
export interface RestorationActionOption {command:RestorationCommand;label:string;effect:string;gate:string;available:boolean;position:{x:number;y:number;z:number}|null}

/** Pure previews use the same kernel as the authority; previews are never committed. */
export function restorationActionOptions(context:RestorationPanelContext,plan:RestorationPlan,siteId:string,draft:RestorationDraft,sourceId:string,targetId:string):RestorationActionOption[]{
 const state=context.restoration;if(!state)return [];
 const body=compileRestorationBody(draft.recipe),old=state.machine?compileRestorationBody(state.machine.recipe).cost:{scrap:0,core:0};
 const commands:Array<{command:RestorationCommand;label:string;effect:string}>=[
  {command:{kind:'refit',targetId:siteId,expectedRevision:state.revision,recipe:{...draft.recipe},ability:{...draft.ability}},label:'Apply refit',effect:`Structural cost ${body.cost.scrap} scrap + ${body.cost.core} core; recover ${old.scrap} scrap + ${old.core} core from the current body. Net inventory change: ${old.scrap-body.cost.scrap} scrap, ${old.core-body.cost.core} core. Requires a packed machine beside this dock. Contents are preserved; no recharge.`},
  {command:{kind:'service',targetId:siteId,expectedRevision:state.revision},label:'Service at dock',effect:'Transfer only the finite dock charge, filter and scent reserves that fit. Move captured contaminant into available sealed-waste storage. Requires a packed machine.'},
  {command:{kind:'deploy',targetId:siteId,expectedRevision:state.revision},label:'Deploy',effect:'Stand beside, not on, dock to deploy. Keep all explorers outside the full body footprint while within 3.5 m of the dock. The packed machine then walks the actual habitat route; deploying does not fill storage.'},
  {command:{kind:'start',sourceId,targetId,expectedRevision:state.revision},label:'Start utility',effect:'Use the installed organ and utility recipe. Walk to the source before preparation; effects consume real stored charge and supplies. Pump requires adjacent cells or the onboard tank; other organs act on one cell.'},
  {command:{kind:'stop',targetId:siteId,expectedRevision:state.revision},label:'Stop utility',effect:'Interrupt the current order. Committed energy, transferred water and captured waste remain accounted for.'},
  {command:{kind:'recall',targetId:siteId,expectedRevision:state.revision},label:'Recall to dock',effect:'Walk back along the certified route and pack only on arrival. An empty-charge machine needs the explorer within 3.5 m for manual recovery; blocked paths remain blocked.'},
  {command:{kind:'repair',targetId:siteId,expectedRevision:state.revision},label:'Repair suit',effect:'Only after habitat restoration: consume recoverable biomass above two units per cell, restoring two HP per unit, at most 20 HP per action.'},
 ];
 return commands.map(option=>{
  const result=applyRestorationCommand(state,plan,context,option.command),position=restorationCommandPosition(state,plan,option.command),available=result.state!==state;
  const distance=position?Math.hypot(context.player.x-position.x,context.player.z-position.z):null;
  return {...option,available,position,gate:available?`Eligible now. Kernel preview: ${result.message} This preview changes nothing; authority will recheck before committing.`:`${result.message}${distance!==null?` Control ${num(distance)} m away at ${point(position!)}.`:''}`};
 });
}

export function restorationRecipeEditorHTML(prefix:string){
 return `<div class="restoration-editor"><label for="${prefix}-support">Four leg supports</label><select id="${prefix}-support">${RESTORATION_PARTS.support.map(v=>`<option value="${v}">${v}</option>`).join('')}</select><label for="${prefix}-shell">Shell</label><select id="${prefix}-shell">${RESTORATION_PARTS.shell.map(v=>`<option value="${v}">${v}</option>`).join('')}</select><label for="${prefix}-organ">Utility organ</label><select id="${prefix}-organ">${RESTORATION_PARTS.organ.map(v=>`<option value="${v}">${v}</option>`).join('')}</select><label for="${prefix}-strength">Utility strength tier</label><select id="${prefix}-strength"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select><label for="${prefix}-tempo">Utility tempo</label><select id="${prefix}-tempo"><option value="careful">careful</option><option value="steady">steady</option><option value="brisk">brisk</option></select></div>`;
}
export function writeRestorationRecipeEditor(panel:HTMLElement,prefix:string,draft:RestorationDraft){
 for(const key of ['support','shell','organ'] as const)panel.querySelector<HTMLSelectElement>(`#${prefix}-${key}`)!.value=draft.recipe[key];
 for(const key of ['strength','tempo'] as const)panel.querySelector<HTMLSelectElement>(`#${prefix}-${key}`)!.value=String(draft.ability[key]);
}
export function readRestorationRecipeEditor(panel:HTMLElement,prefix:string,seed:number):RestorationDraft{
 const val=(key:string)=>panel.querySelector<HTMLSelectElement>(`#${prefix}-${key}`)!.value;
 const recipe={version:1 as const,seed,support:val('support') as RestorationBodyRecipe['support'],shell:val('shell') as RestorationBodyRecipe['shell'],organ:val('organ') as RestorationBodyRecipe['organ']};
 const ability={version:1 as const,organ:recipe.organ,strength:Number(val('strength')) as UtilityRecipeInput['strength'],tempo:val('tempo') as UtilityRecipeInput['tempo']};
 compileRestorationBody(recipe);compileUtilityAbility(ability);return {recipe,ability};
}
export function restorationRecipeSummaryHTML(draft:RestorationDraft){
 const body=compileRestorationBody(draft.recipe),utility=compileUtilityAbility(draft.ability),s=body.stats;
 return `<p>Compiled quadruped: four ${esc(draft.recipe.support)} legs · ${esc(draft.recipe.shell)} shell · ${esc(draft.recipe.organ)} organ · seed ${draft.recipe.seed}<br>Structural cost: <strong>${body.cost.scrap} scrap + ${body.cost.core} core</strong>. Recipe hash ${esc(body.ref.recipeHash)}.<br>Travel ${num(s.maxSpeed)} m/s · reach ${num(s.reach)} m · sensor ${num(s.sensorRange)} m · work speed ${num(s.workSpeed)} · heat tolerance ${s.heatTolerance}.<br>Capacities: ${s.tankCapacityMl} ml water · ${s.chargeCapacity} charge · ${s.filtrationCapacity} filter / captured waste. Capacity creates no contents.</p><p>Compiled ${esc(utility.delivery)} utility: up to ${utility.strengthUnits} ${esc(utility.strengthUnit)} per pulse; ${utility.energyCost} charge per pulse${utility.filtrationCost?`; at most ${utility.filtrationCost} filtration units, limited by contaminant and available cartridge`:''}.<br>Preparation ${Math.ceil(utility.prepTicks/s.workSpeed)*.25} s · active ${utility.activeTicks*.25} s · recovery ${utility.recoveryTicks*.25} s · cooldown ${utility.cooldownTicks*.25} s. Preparation is adjusted by the support's real work speed.</p>`;
}
export function restorationSitesHTML(state:RestorationState,plan:RestorationPlan){
 return plan.sites.map((p,i)=>{const site=state.sites[i]!;return `<article class="restoration-card"><h3>${esc(p.label)}</h3><p>Dock ${point(p.cells.find(c=>c.id===p.dockCellId)!)} · ${site.activatedAtTick===null?'Dormant · pristine until a successful local refit, service or deploy':site.completedAtTick===null?`Activated at ${num(site.activatedAtTick*.25)} s · restoring: ${site.stableTicks}/${RESTORATION_RULES.completionTicks} stable ticks`:`Restored at ${num(site.completedAtTick*.25)} s`}<br>Finite dock stock: ${site.chargeReserve} charge · ${site.filterReserve} filter · ${site.scentReserve} scent · sealed waste ${site.sealedWaste}/${p.wasteCapacity}.<br>Pollinator: ${esc(site.pollinator.cellId)} → ${esc(site.pollinator.targetId)} · ${site.pollinatorVisits} cell arrivals.</p><div class="restoration-cells">${site.cells.map((c,j)=>`<section><h4>${esc(c.id)} · ${point(p.cells[j]!)}</h4><p>Water ${c.waterMl} ml · contaminant ${c.contaminant} units<br>Heat ${c.heat} · smoke ${c.smoke} · scent ${c.scent}<br>Nutrients ${c.nutrient} · biomass ${c.biomass} · health ${c.health}/100</p></section>`).join('')}</div><p>Certified neighbors: ${p.edges.map(e=>`${esc(e.a)} ↔ ${esc(e.b)}`).join(' · ')}</p></article>`;}).join('');
}
export function restorationMachineHTML(state:RestorationState,plan:RestorationPlan){
 const m=state.machine;if(!m)return '<p>No automaton configured. Choose a recipe and apply a structural refit beside a dock with real stock.</p>';
 const at=restorationMachinePosition(state,plan),body=compileRestorationBody(m.recipe),cell=state.sites.find(s=>s.id===m.siteId)?.cells.find(c=>c.id===m.motion?.cellId),warnings:string[]=[];if(m.heat>body.stats.heatTolerance||cell&&cell.heat>body.stats.heatTolerance*12)warnings.push('This position is too hot for the current shell. Let it cool, or recall and refit an alloy shell. Start the order again when ready.');if(m.charge===0)warnings.push('Charge is empty. Recall and stay beside the rig to tow it back along the route, then service it at a dock.');
 return `<p><strong>${esc(m.status)}</strong> · ${esc(m.recipe.support)} / ${esc(m.recipe.shell)} / ${esc(m.recipe.organ)} · strength ${m.ability.strength} / ${esc(m.ability.tempo)}<br>${at?`Actual position: ${point(at)} · ${esc(m.motion!.cellId)} → ${esc(m.motion!.targetId)}`:'Packed; no deployed position'}${m.blocked?' · blocked or awaiting nearby manual recovery':''}<br>Charge ${m.charge} · filter ${m.filter} · captured waste ${m.waste} · scent cartridge ${m.scentCharge} · heat ${m.heat}<br>Tank ${m.tank.waterMl} ml / ${m.tank.contaminant} contaminant units<br>Utility ${esc(m.utility.phase)} · ${m.utility.remainingTicks} ticks left · order ${m.order?`${esc(m.order.sourceId)} → ${esc(m.order.targetId)}`:'none'}</p>${warnings.map(message=>`<p class="restoration-gate">${esc(message)}</p>`).join('')}`;
}

/** The panel never owns simulation state or writes saves. Live selections survive polling. */
export function mountRestorationPanel(panel:HTMLElement,options:{state:()=>RestorationPanelContext;plan:RestorationPlan;act:(command:RestorationCommand)=>void;close:()=>void;ready:()=>boolean;map?:()=>void;mode?:'campaign'|'practice'}):()=>void{
 const initial=options.state(),plan=options.plan,seed=initial.seed;
 let alive=true,locked=false,pendingRevision:number|null=null,generation=0;
 let siteId=initial.restoration?.machine?.siteId??plan.sites[0]!.id;
 let draft:RestorationDraft=initial.restoration?.machine?{recipe:{...initial.restoration.machine.recipe},ability:{...initial.restoration.machine.ability}}:{recipe:{...DEFAULT_RESTORATION_RECIPE,seed},ability:{...DEFAULT_UTILITY_RECIPE}};
 let sourceId='',targetId='';
 panel.innerHTML=`<div class="restoration-ui"><button type="button" class="close" aria-label="Close restoration">×</button><span class="eyebrow">${options.mode==='practice'?'Isolated playable practice':'Habitat restoration'}</span><h2>Restore the habitats</h2><p>${options.mode==='practice'?'These controls operate only the isolated practice state. Return to campaign to leave.':'Authoritative habitat state. Solo menus pause simulation; close this panel to let the automaton walk and work. Online time continues.'} Use one configurable quadruped to move water, capture contamination, vent heat and smoke, and attract a real moving pollinator.</p><p>Restoration needs every cell at ≥${RESTORATION_RULES.healthyWaterMl} ml water, ≤${RESTORATION_RULES.healthyContaminant} contaminant, ≤${RESTORATION_RULES.healthyHeat} heat, ≤${RESTORATION_RULES.healthySmoke} smoke and ≥${RESTORATION_RULES.completionHealth} health for ${RESTORATION_RULES.completionTicks*.25} seconds. Growth consumes water and nutrients; nothing refills offscreen. Dormant sites stay pristine until their first successful local refit, service or deploy. Stand beside, not on, dock to deploy.</p><div class="row"><button type="button" id="restoration-map" ${options.map?'':'disabled'}>Open map</button><button type="button" id="restoration-refresh">Recheck request</button></div><p id="restoration-clock"></p><p id="restoration-inventory"></p><label for="restoration-site">Habitat controls</label><select id="restoration-site">${plan.sites.map(s=>`<option value="${esc(s.id)}">${esc(s.label)} · ${point(s)}</option>`).join('')}</select><h3>Installed automaton</h3><div id="restoration-machine"></div><h3>Staged refit</h3>${restorationRecipeEditorHTML('restoration-recipe')}<div class="row"><button type="button" id="restoration-defaults">Stage defaults</button><button type="button" id="restoration-cancel">Cancel recipe edits</button></div><p>Recipe edits take effect only through Apply refit, while packed beside the selected dock. Source/target orders use the installed recipe.</p><div id="restoration-recipe-summary"></div><label for="restoration-source">Utility source / work cell</label><select id="restoration-source"></select><label for="restoration-target">Utility target</label><select id="restoration-target"></select><p id="restoration-status" role="status">Choose a dock and inspect exact action gates below.</p><div id="restoration-actions"></div><div id="restoration-sites"></div><details><summary>Conservation and recent authoritative events</summary><pre id="restoration-evidence"></pre></details></div>`;
 const q=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#restoration-'+id)!;
 const status=(text:string)=>{if(alive)q('status').textContent=text;};
 const dispose=()=>{if(!alive)return;alive=false;generation++;clearInterval(timer);};
 function resetSelection(){const site=plan.sites.find(s=>s.id===siteId)!;sourceId=site.cells[0]!.id;targetId=(options.state().restoration?.machine?.recipe.organ??draft.recipe.organ)==='pump'?site.cells[1]!.id:sourceId;const html=site.cells.map(c=>`<option value="${esc(c.id)}">${esc(c.id)} · ${point(c)}</option>`).join('')+'<option value="tank">Onboard tank</option>';q('source').innerHTML=html;q('target').innerHTML=html;q<HTMLSelectElement>('source').value=sourceId;q<HTMLSelectElement>('target').value=targetId;}
 function refresh(){
  if(!alive)return;const context=options.state(),state=context.restoration;
  if(context.seed!==seed||state&&state.planId!==plan.id){q('actions').innerHTML='';status('World or habitat plan changed. Close and reopen restoration controls.');return;}
  if(!state){q('actions').innerHTML='';status('Restoration state is unavailable.');return;}
  if(pendingRevision!==null&&state.revision!==pendingRevision){pendingRevision=null;status('Authoritative revision changed. Inspect the current stores and event record for the result.');}
  q('clock').textContent=`Seed ${seed} · model ${num(state.tick*.25)} s · revision ${state.revision} · ${point(context.player)} · HP ${context.player.hp}`;
  q('inventory').textContent=`Your actual inventory: ${context.inventory.scrap} scrap · ${context.inventory.core} core · ${context.inventory.water} water canisters. Refit exchanges structural parts only.`;
  q('machine').innerHTML=restorationMachineHTML(state,plan);q('sites').innerHTML=restorationSitesHTML(state,plan);q('recipe-summary').innerHTML=restorationRecipeSummaryHTML(draft);
  const choices=restorationActionOptions(context,plan,siteId,draft,sourceId,targetId),stamp=++generation,revision=state.revision,ready=options.ready();
  q('actions').innerHTML=choices.map((a,i)=>`<section class="restoration-action"><button type="button" data-restoration-action="${i}" ${a.available&&ready&&!locked&&pendingRevision===null?'':'disabled'}>${esc(a.label)}</button><p>${esc(a.effect)}<br>${a.position?`Control at ${point(a.position)}.<br>`:''}${esc(!ready?'World controls are not ready.':pendingRevision!==null?'Request pending at the authority. Recheck only if no response arrived.':locked?'Please wait for the next live state check.':a.gate)}</p></section>`).join('');
  for(const button of q('actions').querySelectorAll<HTMLButtonElement>('[data-restoration-action]'))button.onclick=()=>{
   if(!alive||locked||pendingRevision!==null||!options.ready()||stamp!==generation)return;
   const current=options.state();if(current.seed!==seed||current.restoration?.revision!==revision||current.restoration.planId!==plan.id){refresh();return;}
   const action=restorationActionOptions(current,plan,siteId,draft,sourceId,targetId)[Number(button.dataset.restorationAction)];if(!action?.available)return;
   locked=true;pendingRevision=revision;status(`${action.label} requested. Waiting for the authoritative result.`);
   try{options.act(action.command);}catch{pendingRevision=null;status('The request could not be sent. Recheck before trying again.');}
   refresh();
  };
  q('evidence').textContent=JSON.stringify({balances:restorationBalances(state,plan),records:state.records},null,2);
 }
 panel.querySelector<HTMLButtonElement>('.close')!.onclick=()=>{if(!alive)return;dispose();options.close();};
 q<HTMLButtonElement>('map').onclick=()=>{if(alive&&options.map){dispose();options.map();}};
 q<HTMLSelectElement>('site').value=siteId;q<HTMLSelectElement>('site').onchange=()=>{if(!alive)return;const id=q<HTMLSelectElement>('site').value;if(!plan.sites.some(s=>s.id===id))return;siteId=id;resetSelection();refresh();};
 for(const name of ['source','target'] as const)q<HTMLSelectElement>(name).onchange=()=>{if(!alive)return;sourceId=q<HTMLSelectElement>('source').value;targetId=q<HTMLSelectElement>('target').value;if((options.state().restoration?.machine?.recipe.organ??draft.recipe.organ)!=='pump'){if(name==='source')targetId=sourceId;else sourceId=targetId;q<HTMLSelectElement>('source').value=sourceId;q<HTMLSelectElement>('target').value=targetId;}refresh();};
 for(const key of ['support','shell','organ','strength','tempo'])q<HTMLSelectElement>('recipe-'+key).onchange=()=>{if(!alive)return;try{draft=readRestorationRecipeEditor(panel,'restoration-recipe',draft.recipe.seed);status('Recipe edits staged. Apply refit exchanges structural stock at the dock.');refresh();}catch{status('Choose only registered recipe parts and utility values.');}};
 q<HTMLButtonElement>('defaults').onclick=()=>{if(!alive)return;draft={recipe:{...DEFAULT_RESTORATION_RECIPE,seed},ability:{...DEFAULT_UTILITY_RECIPE}};writeRestorationRecipeEditor(panel,'restoration-recipe',draft);status('Default recipe staged; the installed body is unchanged.');refresh();};
 q<HTMLButtonElement>('cancel').onclick=()=>{if(!alive)return;const m=options.state().restoration?.machine;draft=m?{recipe:{...m.recipe},ability:{...m.ability}}:{recipe:{...DEFAULT_RESTORATION_RECIPE,seed},ability:{...DEFAULT_UTILITY_RECIPE}};writeRestorationRecipeEditor(panel,'restoration-recipe',draft);status('Recipe edits discarded.');refresh();};
 q<HTMLButtonElement>('refresh').onclick=()=>{if(!alive)return;pendingRevision=null;locked=false;status('Live eligibility rechecked. Only authoritative state confirms a committed action.');refresh();};
 resetSelection();writeRestorationRecipeEditor(panel,'restoration-recipe',draft);
 const timer=setInterval(()=>{if(!alive)return;locked=false;refresh();},500);refresh();return dispose;
}
