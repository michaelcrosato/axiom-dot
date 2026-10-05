import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectedState,applyAction,causalContext,worldObjects,worldEndpoints,type State} from '../src/world.ts';
import {causalPlan,advanceCausal,validCausal,CAUSAL_STEP} from '../src/causal.ts';

const move=(s:State,p:{x:number;z:number})=>applyAction(s,{type:'move',...p});
function suppliedValley(seed:number):State {
 let s=createConnectedState(seed);
 for(const o of worldObjects(s))if(['scrap','core','water'].includes(o.kind)){s=move(s,o);s=applyAction(s,{type:'collect',id:o.id});}
 s=move(s,causalPlan(seed).source.position);s=applyAction(s,{type:'causal',command:{type:'repair-source'}});
 return move(s,worldEndpoints(s).spawn);
}

// Regression: rest used to end the instant fatigue fell to the 70 threshold, so the
// commute pushed a caretaker straight back over it. After ~20 minutes the caretaker
// spent >80% of its time walking between home and work and service fell to ~1.5%.
test('a tired caretaker rests fully and keeps sustaining workshop service over a long run',()=>{
 const seed=1,s=suppliedValley(seed),ctx=causalContext(s),plan=causalPlan(seed);
 const caretaker=plan.agents.find(a=>a.role==='caretaker'&&a.homeId===plan.settlements[0]!.id)!;
 let c=s.causal!;const steps=(seconds:number)=>Math.round(seconds/CAUSAL_STEP);
 for(let i=0;i<steps(1200);i++)c=advanceCausal(c,ctx,CAUSAL_STEP);
 const before=c.workplaces.find(w=>w.id===caretaker.workplaceId)!.service;let walking=0,peak=0;
 for(let i=0;i<steps(1200);i++){c=advanceCausal(c,ctx,CAUSAL_STEP);const a=c.agents.find(a=>a.id===caretaker.id)!;if(a.status.startsWith('Walking'))walking++;peak=Math.max(peak,a.fatigue);}
 const gained=c.workplaces.find(w=>w.id===caretaker.workplaceId)!.service-before;
 assert.ok(gained>600,`late workshop service ${gained.toFixed(1)} should stay near the early rate`);
 assert.ok(walking<steps(1200)*.25,`caretaker walked ${(walking*CAUSAL_STEP).toFixed(0)} of 1200 s`);
 assert.ok(peak<=75);
 assert.ok(validCausal(JSON.parse(JSON.stringify(c)),ctx));
});
