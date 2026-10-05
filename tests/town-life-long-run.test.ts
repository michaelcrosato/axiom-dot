import test from 'node:test';
import assert from 'node:assert/strict';
import {createTownLifeScenario,advanceTownLife,validTownLife,TOWN_LIFE_NEEDS,type TownLifeState} from '../src/town-life.ts';

const OUTPUT={garden:['field','harvest',8],'draw-water':['aquifer','water',12],craft:['salvage','materials',4]} as const;

// Regression: the source gate ignored units already promised to occupied workers,
// whose extraction happens at completion. In lean stores dozens of gardeners started
// on one small field; a third of the garden labor finished with partial output.
test('scarce sources never admit more production than they can actually yield',()=>{
 let s:TownLifeState=createTownLifeScenario(5,'lean-stores');
 const shortfalls:string[]=[];let finishes=0;
 for(let i=0;i<1800;i++){
  const before=s;s=advanceTownLife(s,.5);
  for(const [action,[source,resource,unit]] of Object.entries(OUTPUT)){
   const done=s.residents.filter(r=>r.lastAction===action&&r.completed>before.residents[r.index]!.completed);
   if(!done.length)continue;finishes+=done.length;
   const expected=done.reduce((n,r)=>n+unit*before.residents[r.index]!.batch,0),extracted=s.sourceLedger.extracted[source]-before.sourceLedger.extracted[source];
   if(extracted<expected-1e-6)shortfalls.push(`${action}@${s.tick}: ${extracted.toFixed(2)}/${expected} ${resource}`);
  }
  for(const r of s.residents)for(const k of TOWN_LIFE_NEEDS)assert.ok(Number.isFinite(r.needs[k])&&r.needs[k]>=0&&r.needs[k]<=100);
 }
 assert.ok(finishes>50,`expected real production, saw ${finishes}`);
 assert.deepEqual(shortfalls.slice(0,5),[]);
 assert.ok(validTownLife(structuredClone(s),5));
});
