import {causalPlan} from './causal.ts';
import {waterRequestView,WATER_REQUEST_RULES,type WaterRequestCommand,type WaterRequestEpisode} from './water-requests.ts';
import type {State} from './world.ts';
export interface WaterRequestsSectionOptions {command:(command:WaterRequestCommand)=>void;canRun:(command:WaterRequestCommand)=>boolean;continuesInMenus?:boolean}
const number=(n:number)=>n.toFixed(2).replace(/\.00$/,'');
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string):HTMLElementTagNameMap[K]{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;}
function deadline(e:WaterRequestEpisode,elapsed:number){
 if(e.status==='completed')return `Claim before ${number(e.claimBy!)} s · ${number(Math.max(0,e.claimBy!-elapsed))} active seconds remain`;
 if(e.status==='offered'||e.status==='accepted')return `Relieve before ${number(e.expiresAt)} s · ${number(Math.max(0,e.expiresAt-elapsed))} active seconds remain`;
 return e.failureReason??(e.status==='claimed'?'Reward claimed once':'Resolved without fresh accepted player delivery');
}
/** World State snapshot only: no timers, local expiry, stock mutations or simulation. */
export function mountWaterRequestsSection(container:HTMLElement,state:State,options:WaterRequestsSectionOptions):void {
 const prior=container.querySelector<HTMLDetailsElement>('details[data-water-request-history]'),historyOpen=prior?.open??false;
 const focused=document.activeElement instanceof HTMLElement&&container.contains(document.activeElement)?document.activeElement.dataset.waterRequestFocus:undefined;
 container.replaceChildren();container.append(node('h3','RECURRING WATER RELIEF'));
 const c=state.causal;
 if(!c?.waterRequests){container.append(node('p','Recurring requests are not enabled in this world. Founding requests remain unchanged.','frontier-small'));return;}
 const p=causalPlan(state.seed),view=waterRequestView(c,state.seed),name=(id:string)=>p.settlements.find(h=>h.id===id)!.name;
 container.append(node('p',`Requests follow real relief at ${WATER_REQUEST_RULES.relief} L, then resident consumption of at least ${WATER_REQUEST_RULES.consumption} L and a reserve below ${WATER_REQUEST_RULES.shortage} L. Accept before making a new canister delivery or commons exchange; restore the reserve to ${WATER_REQUEST_RULES.completion} L. Residents and cave supply can resolve the need without a player reward.`,'frontier-small'));
 container.append(node('p',`Deadlines use the committed world clock: ${number(c.elapsed)} s. Completion and claims must happen strictly before their deadlines. ${options.continuesInMenus?'Online room time continues through menus while the host keeps the expedition active. Guest backgrounding does not pause the shared room.':'Solo menus and background time pause this clock.'}`,'frontier-notice'));
 for(const home of view.households){container.append(node('p',`${home.name}: ${number(home.reserve)} L · ${home.availableReward} of the original ${home.rewardBudget} renown remains uncommitted · ${home.episodeCount} / ${WATER_REQUEST_RULES.maxPerHome} episodes recorded${home.availableReward<WATER_REQUEST_RULES.reward?' · Further requests wait for a full 4-renown reservation':''}`,'frontier-small'));}
 const active=view.episodes.filter(e=>['offered','accepted','completed'].includes(e.status));
 if(!active.length)container.append(node('p','No active recurring water requests. A fresh relief-to-shortage cycle and a full reward reservation are required.','frontier-small'));
 for(const e of active){
  const card=node('article',undefined,'frontier-job');card.dataset.waterRequestId=e.id;card.append(node('h4',`${name(e.settlementId)} · Water relief ${e.episode}`),node('p',`${e.status} · requested by ${p.agents.find(a=>a.id===e.issuerId)!.name}`,'frontier-status'));
  card.append(node('p',`At ${number(e.relief.at)} s the reserve held ${number(e.relief.water.reserve)} L. Residents then consumed ${number(e.need.water.consumed-e.relief.water.consumed)} L; at ${number(e.createdAt)} s only ${number(e.need.water.reserve)} L remained.`,'frontier-cause'));
  card.append(node('p',deadline(e,c.elapsed),'machine-status'),node('p',`Completion deadline: ${number(e.expiresAt)} s${e.claimBy===null?'':` · Claim deadline: ${number(e.claimBy)} s`} · ${e.reservedReward} renown reserved from the original issuer budget`,'frontier-small'));
  if(e.acceptance)card.append(node('p',`Accepted at ${number(e.acceptedAt!)} s; ${number(Math.max(0,(e.outcome?.water.playerDelivered??c.settlements.find(h=>h.id===e.settlementId)!.playerDelivered)-e.acceptance.water.playerDelivered))} L of fresh player delivery recorded since acceptance.`,'frontier-small'));
  if(e.status==='offered'||e.status==='completed'){
   const command:WaterRequestCommand={type:e.status==='offered'?'accept':'claim',id:e.id,expectedRevision:view.revision},button=node('button',command.type==='accept'?'Accept water relief':'Claim 4 renown','frontier-action');button.type='button';button.dataset.waterRequestFocus=`${e.id}/${command.type}`;button.disabled=!options.canRun(command);button.onclick=()=>{if(options.canRun(command))options.command(command);};card.append(button);
   if(button.disabled)card.append(node('p','Visit the issuing settlement flag while this request is still available.','frontier-small'));
  }
  container.append(card);
 }
 const history=node('details');history.dataset.waterRequestHistory='true';history.open=historyOpen;const summary=node('summary',`Request history · ${view.episodes.filter(e=>!['offered','accepted','completed'].includes(e.status)).length} finished`);summary.dataset.waterRequestFocus='water-request-history';history.append(summary);
 for(const e of view.episodes.filter(e=>!['offered','accepted','completed'].includes(e.status))){const line=node('p',`${name(e.settlementId)} · Relief ${e.episode} · ${e.status}: ${deadline(e,c.elapsed)}. Opened ${number(e.createdAt)} s; completion deadline ${number(e.expiresAt)} s${e.claimBy===null?'':`; claim deadline ${number(e.claimBy)} s`}. ${e.status==='claimed'?'4 renown paid once':'0 renown paid; reservation released'}.`,'frontier-small');line.dataset.waterRequestHistoryId=e.id;history.append(line);}
 if(!view.episodes.some(e=>!['offered','accepted','completed'].includes(e.status)))history.append(node('p','No finished recurring episodes yet.','frontier-small'));
 container.append(history);
 if(focused)Array.from(container.querySelectorAll<HTMLElement>('[data-water-request-focus]')).find(e=>e.dataset.waterRequestFocus===focused)?.focus();
}
