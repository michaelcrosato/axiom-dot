import {causalPlan,type CausalCommand} from './causal';
import type {State} from './world';
import {supplyWorking} from './waterworks';

interface FrontierBoardOptions {
 close:()=>void;
 command:(command:CausalCommand)=>void;
 canRun:(command:CausalCommand)=>boolean;
 commissions:()=>void;
 journal:()=>void;
 barter?:()=>void;
 waterRequests?:()=>void;
 continuesInMenus?:boolean;
 selectedSettlementId?:string;
 selectedWorkplaceId?:string;
 selectedAgentId?:string;
}

const number=(value:number)=>Number.isFinite(value)?value.toFixed(1):'—';
const human=(value:string)=>value.replaceAll('-',' ').replaceAll('_',' ');
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string):HTMLElementTagNameMap[K]{
 const element=document.createElement(tag);
 if(text!==undefined)element.textContent=text;
 if(className)element.className=className;
 return element;
}
function button(text:string,action:()=>void,className?:string){const element=node('button',text,className);element.type='button';element.onclick=action;return element;}
function definition(parent:HTMLElement,label:string,value:string){const row=node('div',undefined,'frontier-fact');row.append(node('dt',label),node('dd',value));parent.append(row);}
function costLabel(cost:unknown){
 if(typeof cost==='number')return `${cost} scrap`;
 if(cost&&typeof cost==='object')return Object.entries(cost).filter(([,amount])=>typeof amount==='number'&&amount>0).map(([resource,amount])=>`${amount} ${human(resource)}`).join(' + ')||'no materials';
 return 'materials shown by the work request';
}

/** Pure view of the persisted causal snapshot. Commands go through the world reducer.
 * No timers, pathfinding, reserve changes or agent simulation run in this panel. */
export function mountFrontierBoard(panel:HTMLElement,state:State,options:FrontierBoardOptions){
 const c=state.causal;
 panel.replaceChildren();
 const close=button('×',options.close,'close');close.setAttribute('aria-label','Close living frontier');
 panel.append(close,node('span','People · needs · consequences','eyebrow'),node('h2','Living frontier'));
 if(!c){panel.append(node('p','This original valley keeps its authored Mossbank commissions. Living agents belong to connected worlds.'),button('Mossbank commissions',options.commissions));return;}
 const plan=causalPlan(state.seed);
 const townName=(id:string)=>plan.settlements.find(town=>town.id===id)?.name??human(id);
 const personName=(id:string)=>plan.agents.find(agent=>agent.id===id)?.name??townName(id);
 const placeName=(id:string)=>plan.nodes.find(place=>place.id===id)?.name??plan.workplaces.find(place=>place.id===id||place.nodeId===id)?.name??plan.settlements.find(town=>town.id===id||town.nodeId===id)?.name??human(id);
 const routeLabel=(route:readonly string[])=>route.length?route.map(placeName).join(' → '):'No active route';
 const nav=node('div',undefined,'row frontier-nav');nav.append(button('Journal & map',options.journal),button('Mossbank commissions',options.commissions));if(options.barter&&c.commonsTrade)nav.append(button('Household barter',options.barter));if(options.waterRequests&&c.waterRequests)nav.append(button('Recurring water relief',options.waterRequests));panel.append(nav);
 panel.append(node('p',`${c.agents.length} residents · ${c.renown} frontier renown · ${state.inventory.water} canisters · ${state.inventory.scrap} scrap`,'machine-status'));
 const notice=node('p','Inspect from anywhere. Accept and claim at the issuing settlement’s gold flag. Deliver there, or approach a workshop’s repair beacon. Time pauses while this board is open.','frontier-notice');
 if(state.zone!=='valley')notice.textContent='Residents keep their routines while you explore the vault. Inspect them here; return to the valley to act. Opening this board pauses world time.';
 if(options.continuesInMenus)notice.textContent='The shared online world keeps moving while this board is open. Inspect from anywhere; visit the issuing gold flag or workshop beacon to act. Offers and resources may change with other explorers and residents.';
 panel.append(notice);
 const jumps=node('div',undefined,'row frontier-jumps');panel.append(jumps);
 const townSection=node('section',undefined,'frontier-section');townSection.setAttribute('aria-label','Settlement needs');townSection.append(node('h3','SETTLEMENTS & WORKSHOPS'));
 for(const town of plan.settlements){
  const live=c.settlements.find(item=>item.id===town.id);if(!live)continue;
  const card=node('section',undefined,'frontier-town');card.dataset.settlementId=town.id;
  const title=node('h4',town.name);if(options.selectedSettlementId===town.id)title.append(node('span',' · here','frontier-here'));
  const reserve=node('p',`${number(live.reserve)} / ${number(town.capacity)} L reserve`,'frontier-reserve');
  const meter=node('meter');meter.min=0;meter.max=town.capacity;meter.value=live.reserve;meter.setAttribute('aria-label',`${town.name} water reserve`);
  card.append(title,reserve,meter,node('p',`${number(live.delivered)} L delivered · ${number(live.consumed)} L consumed`,'frontier-small'));
  const deliver:CausalCommand={type:'deliver-water',settlementId:town.id};const deliverButton=button('Deliver 1 canister · 4 L',()=>options.command(deliver),'frontier-action');deliverButton.disabled=!options.canRun(deliver);
  card.append(deliverButton);
  if(deliverButton.disabled)card.append(node('p',state.inventory.water<1?'Gather a water canister, then visit this town’s gold flag.':'Deliver at this town’s gold flag when at least 4 L of reserve space is free.','frontier-small'));
  const workplaces=node('div',undefined,'frontier-workplaces');
  for(const place of plan.workplaces.filter(item=>item.settlementId===town.id)){
   const workplace=c.workplaces.find(item=>item.id===place.id);if(!workplace)continue;
   const assigned=plan.agents.filter(agent=>agent.workplaceId===place.id);
   const detail=node('details',undefined,'frontier-workplace');detail.open=options.selectedWorkplaceId===place.id;detail.dataset.workplaceId=place.id;
   detail.append(node('summary',`${workplace.operational?'● Operational':assigned.length?'◇ Needs repair':'◇ Optional repair'} · ${place.name}`));
   const stats=node('dl',undefined,'frontier-facts');definition(stats,'Resident',assigned.length?assigned.map(agent=>`${agent.name} · ${human(agent.role)}`).join(', '):'Spare workshop · no caretaker assigned');definition(stats,'Service',`${number(workplace.service)} seconds`);definition(stats,'Repair cost',costLabel(place.repairCost));definition(stats,'Repair point',`${place.position.x.toFixed(1)}, ${place.position.z.toFixed(1)} · inside the hall`);detail.append(stats);
   const repair:CausalCommand={type:'repair-workplace',workplaceId:place.id};const repairButton=button(workplace.operational?'Workshop operational':`Repair · ${costLabel(place.repairCost)}`,()=>options.command(repair),'frontier-action');repairButton.disabled=workplace.operational||!options.canRun(repair);detail.append(repairButton);
   if(!workplace.operational)detail.append(node('p',assigned.length?`Use Interact at the amber beacon inside this hall to repair. ${assigned.map(agent=>agent.name).join(' and ')} can then work here when personal needs and route access allow.`:'Optional repair at the amber beacon inside this hall. This spare workshop has no caretaker assigned.','frontier-small'));
   workplaces.append(detail);
  }
  card.append(workplaces);townSection.append(card);
 }
 panel.append(townSection);
 const source=node('section',undefined,'frontier-source');source.append(node('h3','WATERWORKS LOADING POINT'));
 const modularWorking=supplyWorking(state.waterworks);
 const sourceMode=c.sourceRepaired?(modularWorking?'Repaired intake + modular overflow':'Repaired intake'):modularWorking?'Modular overflow route operating':state.caveSupply?.connected?'Cave outfall diversion':'No active water source';
 const depotStatus=c.depot>0?`${number(c.depot)} L ready for carriers`:c.sourceRepaired?'Depot empty · awaiting intake refill':modularWorking?'Depot empty · awaiting Mossbank reserve overflow':'Depot empty';
 source.append(node('p',`${sourceMode}${state.caveSupply?.connected&&(c.sourceRepaired||modularWorking)?' · Cave outfall diversion connected':''} · ${depotStatus}`,'machine-status'));
 source.append(node('p','Repair this loading point or the original river pump to restore the source. A connected modular outlet can also send real Mossbank reserve overflow here. Carriers need available water and a safe route; an empty intake alone supplies no carried water.','frontier-small'));
 if(state.caveSupply?.connected)source.append(node('p',`${number(c.caveReceipts?.received??0)} L received from actual cave outflow; ${number(c.caveReceipts?.households.reduce((n,s)=>n+s.litres,0)??0)} L delivered to households. The dry-bank connection meters at most 0.5 L/s and discards excess.`,'frontier-small'));
 const sourceCommand:CausalCommand={type:'repair-source'};const sourceButton=button(c.sourceRepaired?'Source repaired':'Repair source · 3 scrap + 1 core',()=>options.command(sourceCommand),'frontier-action');sourceButton.disabled=c.sourceRepaired||!options.canRun(sourceCommand);source.append(sourceButton,node('p',`Loading point: ${plan.source.position.x.toFixed(1)}, ${plan.source.position.z.toFixed(1)}. Approach its beacon and use Interact to repair.`,'frontier-small'));panel.append(source);
 const jobs=node('section',undefined,'frontier-section');jobs.setAttribute('aria-label','Generated jobs');jobs.append(node('h3','WORK GENERATED BY LOCAL NEEDS'));
 jobs.append(node('p','These requests follow actual shortages, broken workplaces and blocked routes. The same water need can be met by carrying canisters or restoring supply so residents can haul it. Accept before helping: rewards require your contribution. Requests solved by residents or the world resolve without a player reward.','frontier-small'));
 if(!c.jobs.length)jobs.append(node('p','No requests right now. Close this board to let people continue their routines.'));
 for(const job of c.jobs){
  const card=node('article',undefined,'frontier-job');card.dataset.jobId=job.id;
  const heading=node('div',undefined,'frontier-job-heading');heading.append(node('h4',job.title),node('span',human(job.status),'frontier-status'));card.append(heading,node('p',job.cause,'frontier-cause'));if(job.failureReason)card.append(node('p',`Blocked: ${job.failureReason}`,'frontier-cause'));
  const facts=node('dl',undefined,'frontier-facts');definition(facts,'Requested by',personName(job.issuerId));definition(facts,'Town',townName(job.settlementId));definition(facts,'Target',placeName(job.targetId));definition(facts,'Completion',job.completion);definition(facts,'Reward',job.status==='resolved'?'No player reward · resolved by residents or the world':`${job.reward} frontier renown${job.status==='claimed'?' · already received':''}`);card.append(facts);
  const details=node('details');details.append(node('summary','Conditions, actions & route'));
  const conditions=node('dl',undefined,'frontier-facts');definition(conditions,'Needs',job.preconditions.length?job.preconditions.join(' · '):'No extra preconditions');definition(conditions,'Possible actions',job.capabilities.length?job.capabilities.map(human).join(' · '):'See completion condition');definition(conditions,'Route',routeLabel(job.route));definition(conditions,'Reward ledger',job.status==='claimed'?`${job.reward} renown paid · 0 reserved`:job.status==='resolved'?'Reservation released · no renown paid':`${job.reservedReward} renown reserved · 0 paid`);definition(conditions,'Created',`${number(job.createdAt)} s of world time · no timed expiry`);details.append(conditions);card.append(details);
  const accept:CausalCommand={type:'accept',id:job.id},claim:CausalCommand={type:'claim',id:job.id};const canAccept=options.canRun(accept),canClaim=options.canRun(claim);
  const command=job.status==='offered'?accept:claim;
  const label=job.status==='claimed'?'Reward received':job.status==='resolved'?'Resolved without a claim':job.status==='offered'?'Accept request':job.status==='completed'?'Claim reward':job.status==='blocked'?'Request blocked':'Request in progress';
  const action=button(label,()=>options.command(command),'frontier-action');action.disabled=job.status==='offered'?!canAccept:!canClaim;card.append(action);
  if((job.status==='offered'&&!canAccept)||(job.status==='completed'&&!canClaim))card.append(node('p','Visit the issuing settlement’s gold flag to accept or claim.','frontier-small'));
  jobs.append(card);
 }
 panel.append(jobs);
 const residents=node('section',undefined,'frontier-section');residents.setAttribute('aria-label','Resident inspections');residents.append(node('h3','PEOPLE OF THE REACH'));
 residents.append(node('p','Gold caretakers · blue carriers · clay builders. Tap a name to inspect the resident’s current need, task and actual route.','frontier-small'));
 for(const identity of plan.agents){
  const agent=c.agents.find(item=>item.id===identity.id);if(!agent)continue;
  const detail=node('details',undefined,`frontier-person frontier-role-${identity.role}`);detail.dataset.agentId=agent.id;detail.open=options.selectedAgentId===agent.id;
  detail.append(node('summary',`${identity.name} · ${human(identity.role)} · ${human(agent.status)}`));
  const facts=node('dl',undefined,'frontier-facts');definition(facts,'Home',townName(identity.homeId));definition(facts,'Status',human(agent.status));definition(facts,'Task',agent.task?`${human(agent.task.kind)} · ${placeName(agent.task.targetId)}`:'No current task');definition(facts,'Thirst',`${number(agent.thirst)} / 100`);definition(facts,'Fatigue',`${number(agent.fatigue)} / 100`);definition(facts,'Carrying',`${number(agent.cargo)} L water`);definition(facts,'Position',`${number(agent.position.x)}, ${number(agent.position.z)}`);definition(facts,'Actual route',routeLabel(agent.route));detail.append(facts);residents.append(detail);
 }
 panel.append(residents);
 const jumpTo=(section:HTMLElement)=>{section.tabIndex=-1;section.focus({preventScroll:true});section.scrollIntoView({block:'start'});};
 jumps.append(button('Needs',()=>jumpTo(townSection)),button('Requests',()=>jumpTo(jobs)),button('People',()=>jumpTo(residents)));
 const explanation=node('details',undefined,'frontier-explainer');explanation.append(node('summary','How to help the frontier'),node('p','Water: hand-deliver canisters for immediate relief, repair the original river pump, or use actual reserve overflow from a connected modular outlet. A carrier still needs an available source and a safe route to bring water home. Disperse the sentry named by a blocked-route request, then close the board and watch the carrier resume. Repair an assigned workshop’s amber beacon so its caretaker can work again; builders can also repair assigned workshops using community materials. Spare workshops have no caretaker assigned and are optional repairs.'),node('p','Residents follow the valley’s proven paths. Their needs, cargo, work and job results are saved. Movement is a bounded kinematic simulation on those paths; residents do not have individual Rapier bodies. Residents continue while you explore the vault. Solo menus and inactive tabs pause world time; online menus do not pause the host-authoritative room.','frontier-small'));panel.append(explanation);
}
