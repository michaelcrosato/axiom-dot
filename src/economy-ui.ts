import {applyEconomyCommand,economyView,ECONOMY_RULES,type EconomyCommand,type EconomyState} from './economy.ts';
import type {CausalContext,CausalState} from './causal.ts';

export interface EconomyPanelSnapshot {seed:number;economy:EconomyState;causal:CausalState;context:CausalContext}
export interface EconomyPanelOptions {
 state:()=>EconomyPanelSnapshot;
 act:(command:EconomyCommand)=>void;
 close:()=>void;
 selectedWorkplaceId?:string;
}
function element<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function button(label:string,run:()=>void){const b=element('button',label);b.type='button';b.onclick=run;return b;}
/** Snapshot-only DOM adapter. Time, stock, manufacturing and rewards live in reducers. */
export function mountEconomyPanel(panel:HTMLElement,options:EconomyPanelOptions){
 const snapshot=options.state(),{economy,causal,context,seed}=snapshot,view=economyView(economy,seed);
 panel.replaceChildren();const close=button('×',options.close);close.className='close';close.setAttribute('aria-label','Close workshop exchange');
 panel.append(close,element('span','Craft · exchange · maintenance','eyebrow'),element('h2','Workshop exchange'),element('p',`${context.inventory.scrap} scrap · ${view.kits} / ${ECONOMY_RULES.playerCapacity} repair kits · ${view.renown} craft renown`,'machine-status'));
 panel.append(element('p','Commission a kit for 2 scrap at an assigned workshop. Its caretaker needs 12 seconds of actual water-supported work, then you can collect the finished kit. Close this panel to let the world run.','frontier-notice'));
 const action=(label:string,command:EconomyCommand)=>{
  const b=button(label,()=>{options.act(command);mountEconomyPanel(panel,options);});b.className='frontier-action';b.disabled=applyEconomyCommand(economy,causal,context,command).state===economy;return b;
 };
 const active=view.incidents.find(i=>i.resolvedAt===null);
 if(active){const section=element('section',undefined,'frontier-source');section.setAttribute('aria-label','Active natural-wear request');section.append(element('h3','PRODUCTION PRESS NEEDS CARE'),element('p',`${active.name}: natural wear has paused manufacturing. One carried kit is reserved for this repair.`),action('Restore press · 1 kit · earn 2 renown',{type:'repair-press',incidentId:active.id}),element('p','Visit this workshop’s work point to repair. There is no deadline, and the same incident cannot pay twice.','frontier-small'));panel.append(section);}
 const section=element('section',undefined,'frontier-section');section.setAttribute('aria-label','Workshop manufacturing');
 for(const w of view.workshops){const live=causal.workplaces.find(p=>p.id===w.id)!,card=element('details',undefined,'frontier-workplace');card.dataset.workplaceId=w.id;card.open=options.selectedWorkplaceId===w.id||view.workshops.length===1;
  card.append(element('summary',`${w.jammed?'◇ Press needs repair':live.operational?'● Ready for orders':'◇ Workshop needs repair'} · ${w.name}`));
  card.append(element('p',`${w.queued} / ${ECONOMY_RULES.queueCapacity} queued · ${w.stock} / ${ECONOMY_RULES.stockCapacity} ready · ${w.progress.toFixed(1)} / ${ECONOMY_RULES.recipeSeconds} work seconds`,'machine-status'));
  const meter=element('meter');meter.min=0;meter.max=ECONOMY_RULES.recipeSeconds;meter.value=w.progress;meter.setAttribute('aria-label',`${w.name} kit work progress`);card.append(meter);
  const row=element('div',undefined,'row');row.append(action('Commission kit · 2 scrap',{type:'commission-kit',workplaceId:w.id}),action('Collect finished kit',{type:'collect-kit',workplaceId:w.id}),action('Recycle kit · recover 1 scrap',{type:'recycle-kit',workplaceId:w.id}));card.append(row);
  card.append(element('p',!live.operational?'Restore the workshop through the Living frontier board first.':w.jammed?'This press needs its reserved kit before manufacturing can resume.':'Approach the workshop’s work point to trade. The caretaker needs water, a safe route and time at work. Spare rooms cannot manufacture.','frontier-small'));section.append(card);
 }
 panel.append(section);
 const history=element('section',undefined,'frontier-section');history.setAttribute('aria-label','Committed workshop history');history.append(element('h3','RECORDED WORKSHOP HISTORY'));
 if(!view.history.length)history.append(element('p','No workshop transactions yet.'));
 else {const list=element('ol');for(const record of view.history.slice(-12).reverse())list.append(element('li',`${record.at.toFixed(1)}s · ${record.text}`));history.append(list);}
 for(const town of view.settlements){const fact=element('p',`${town.name} · ${town.motif}. ${town.description}`,'frontier-small');fact.dataset.settlementId=town.id;history.append(fact);}panel.append(history);
 const policy=element('details',undefined,'frontier-explainer');policy.append(element('summary','Costs, limits and natural wear'),element('p',`Kits are made only from your commissioned scrap. Recycling returns 1 of the original 2 scrap; repairs consume the whole kit. Output is capped at ${ECONOMY_RULES.stockCapacity} kits per press and carried goods at ${ECONOMY_RULES.playerCapacity}. Idle, jammed or full presses cannot bank work.`),element('p',`Natural wear requires real caretaker service and an available carried kit, with at least ${ECONOMY_RULES.incidentRest} seconds of rest after each repair. This frontier records at most ${ECONOMY_RULES.maxIncidents} such incidents and ${ECONOMY_RULES.maxCommissions} commissions. The last reserved repair kit cannot be recycled. Time pauses in menus/background; there is no offline production.`));panel.append(policy);
}
