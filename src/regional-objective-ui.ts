import type {RegionalObjective} from './regional-objective.ts';

export interface RegionalObjectiveElements {title:HTMLElement;copy:HTMLElement;progress:HTMLElement;actions:HTMLElement;inspect:HTMLButtonElement;map:HTMLButtonElement}
export interface RegionalObjectiveUIOptions {player:{x:number;z:number};ready:boolean;online:boolean;inspect:(target:RegionalObjective['inspect'])=>void;map:()=>void}
/** Text-only projection. Inspection opens existing read-only panels; local E/X
 * commands, collision acknowledgments and the online authority stay unchanged. */
export function renderRegionalObjective(elements:RegionalObjectiveElements,objective:RegionalObjective|null,options:RegionalObjectiveUIOptions):void {
 const {actions,inspect,map}=elements;
 actions.hidden=!objective;inspect.disabled=map.disabled=!objective||!options.ready;
 inspect.onclick=null;map.onclick=null;
 if(!objective)return;
 elements.title.textContent=objective.title;
 elements.copy.textContent=objective.copy+(objective.status==='waiting'?(options.online?' Work follows the online world.':' Close solo menus to let work continue.'):'');
 const distance=Math.round(Math.hypot(objective.position.x-options.player.x,objective.position.z-options.player.z));
 elements.progress.textContent=`${objective.status.toUpperCase()} · ${objective.progress} · ${distance} m TO ${objective.stage==='meal'?'PANTRY':'WORK POINT'}`;
 inspect.textContent=objective.inspect.label;inspect.setAttribute('aria-label',`${objective.inspect.label}: ${objective.title}`);map.setAttribute('aria-label','Show regional work points on map');
 const inspectClick=()=>{if(inspect.onclick===inspectClick&&!inspect.disabled)options.inspect(objective.inspect);};
 const mapClick=()=>{if(map.onclick===mapClick&&!map.disabled)options.map();};
 inspect.onclick=inspectClick;map.onclick=mapClick;
}
