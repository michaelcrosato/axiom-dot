import {townLifeSummary,townLifeFacilities,type TownLifeState} from './town-life.ts';
import {townResidents} from './town-residents.ts';
import type {ConversationLifeContext} from './npc-conversation.ts';
/** Original authored phrasing grounded in current authoritative motives and public conditions. */
export function townLifeDialogue(life:TownLifeState,index:number):ConversationLifeContext {
 const summary=townLifeSummary(life,index),r=life.residents[index]!,roster=townResidents(life.seed);
 const lowest=[...summary.needs].sort((a,b)=>a.value-b.value)[0]!;
 const strained=lowest.value<25;
 const urgency=lowest.key==='nourishment'?'something to eat':lowest.key==='energy'?'a proper rest':lowest.key==='hygiene'?'a wash':lowest.key==='comfort'?'some quiet comfort':lowest.key==='connection'?'some company':'time for something meaningful';
 const shortages=[life.resources.pantry<12?'prepared meals':null,life.resources.water<12?'stored water':null,life.resources.materials<6?'repair materials':null].filter(Boolean);
 const closed=life.facilities.filter(f=>f.closedFor>0||f.condition<15).map(f=>townLifeFacilities(life.seed).find(p=>p.id===f.id)?.label??'a service');
 const relation=[...r.relationships].sort((a,b)=>Math.abs(b.affinity)-Math.abs(a.affinity)||a.residentId.localeCompare(b.residentId))[0];
 const other=relation?roster.find(person=>person.id===relation.residentId)?.name:undefined;
 const social=relation&&other?relation.affinity>=25?`I have been getting along with ${other}. Having someone familiar nearby makes company more appealing.`:relation.affinity<=-15?`Things have been tense with ${other}. I may choose quieter company until we have had some space.`:`I know ${other}, but relationships take more than one pleasant conversation.`:'I would like to get to know more of the neighbors. We each make time for company differently.';
 const help=shortages.length?`We could use ${shortages.join(' and ')}. The town-life board shows which service needs help and what a contribution costs.`:closed.length?`${closed[0]} needs attention. You can help at the service, if you have repair supplies.`:'You could arrange a gathering in the square, encourage someone nearby, or help keep the stores supplied. The town-life board explains the costs.';
 return {
  present:`I am ${summary.activity.toLowerCase()}. ${strained?`Honestly, I could really use ${urgency}.`:`I am feeling ${summary.mood.toLowerCase()} just now.`}`,
  reason:`${summary.reason} ${r.status==='queued'?'I am waiting for a free place; getting here does not mean I can use it immediately.':r.status==='traveling'?'I still need to get there before I can begin.':`My next choice will depend on how I feel when I finish.`}`,
  mood:r.stress>=50?`I have been feeling stretched. If ${urgency} has to wait much longer, I will put less urgent plans aside.`:`I can give things time, but I still need ${urgency} as well as useful work.`,
  desire:`At the moment I want to ${summary.desire.split(' · ')[0]!.replace(/^./,c=>c.toLowerCase()).replace(/\.$/,'')}.`,
  social,
  town:shortages.length?`The town is running short of ${shortages.join(' and ')}. That can change where I go and which work I choose.`:closed.length?`${closed[0]} is unavailable, so we need to use alternatives or put some work into repairs.`:'There are meals and water in the shared stores. It takes tending the garden, drawing water, cooking and repairs to keep things that way.',
  help,
 };
}

/** A concise, current town situation for the in-world quest area. No synthetic missions or rewards. */
export function townLifeSituation(life:TownLifeState):{title:string;detail:string;residentId:string|null}{
 const facilities=townLifeFacilities(life.seed),closed=life.facilities.find((f,i)=>facilities[i]!.kind!=='home'&&(f.closedFor>0||f.condition<15));
 if(closed)return {title:'Hearthmere · a service needs help',detail:`${facilities.find(f=>f.id===closed.id)!.label} is unavailable. Residents are seeking alternatives; bring repair materials to the service if you can help.`,residentId:null};
 if(life.resources.pantry<20)return {title:'Hearthmere · meals are running low',detail:'Residents need harvested produce and water to cook. Check Town life for the missing supply or an interrupted service.',residentId:null};
 if(life.resources.water<20)return {title:'Hearthmere · water is running low',detail:'Drawing water takes time and a free station. A canister contribution at the water station can help the shared store.',residentId:null};
 if(life.resources.materials<6)return {title:'Hearthmere · repair supplies are scarce',detail:'Care and maintenance compete for materials. Contribute scrap at the workshop, or watch residents reclaim the available salvage.',residentId:null};
 const urgent=life.residents.find(r=>Math.min(r.needs.nourishment,r.needs.energy,r.needs.hygiene)<22);
 if(urgent)return {title:'Hearthmere · someone needs a break',detail:`${townResidents(life.seed)[urgent.index]!.name} has a low essential need. Inspect their actual choice, destination and available services.`,residentId:urgent.id};
 const lonely=life.residents.filter(r=>r.needs.connection<25).length;
 if(lonely>=20)return {title:'Hearthmere · neighbors need company',detail:`${lonely} residents are short on company. A gathering at the square can draw people together; nearby encouragement can also help.`,residentId:null};
 return {title:'Hearthmere · everyday lives unfolding',detail:'Residents balance needs, work, company and personal ambitions. Ask about their day, inspect Town life or lend a hand at a service.',residentId:null};
}
