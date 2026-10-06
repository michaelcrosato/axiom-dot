import test from 'node:test';
import assert from 'node:assert/strict';
import {createTownLife,receiveTownHabitatCare,advanceTownLife,townLifeFacilities,validTownLife,immutableTownLife,type TownLifeState} from '../src/town-life.ts';
import {townLifeTaskPoint} from '../src/town-navigation.ts';

function patients(count:number){
 const life=structuredClone(createTownLife(7)),facility=townLifeFacilities(7).find(f=>f.id==='apothecary')!;
 for(const r of life.residents)r.needs.energy=1;
 for(let i=0;i<count;i++){const r=life.residents[i]!,p=townLifeTaskPoint(facility,i,'recover');Object.assign(r,{x:p.x,z:p.z+1,action:'recover',status:'queued',facilityId:'apothecary',reason:'Independent care arrival fixture.'});r.needs={nourishment:90,energy:40,hygiene:40,comfort:30,connection:80,fulfillment:80};}
 life.facilities.find(f=>f.id==='apothecary')!.queue=Array.from({length:count},(_,i)=>i);assert.ok(validTownLife(life,7));
 let state=receiveTownHabitatCare(life,5)!;for(let i=0;i<100&&!state.residents.slice(0,count).every(r=>r.habitatCare);i++)state=advanceTownLife(state,.5);
 assert.ok(state.residents.slice(0,count).every(r=>r.habitatCare));return state;
}

test('independent care review rejects duplicating paid active doses while keeping the aggregate stock balance plausible',()=>{
 const state=patients(2);assert.deepEqual(state.habitatCare,{received:5,stock:3,used:2});assert.ok(validTownLife(state,7));
 const counterfeit=structuredClone(state);counterfeit.habitatCare={received:5,stock:4,used:1};
 assert.equal(validTownLife(counterfeit,7),false);assert.throws(()=>immutableTownLife(counterfeit,7));
});

test('independent care review preserves paid treatment across displacement and reload without remote recovery or a second debit',()=>{
 const arrived=patients(1),displaced=structuredClone(arrived),patient=displaced.residents[0]!;
 patient.z+=3;patient.speed=0;displaced.navigation!.residents[0]!.trace=[];assert.ok(validTownLife(displaced,7));
 const noDose=structuredClone(displaced);delete noDose.residents[0]!.habitatCare;
 const next=advanceTownLife(displaced,.5),control=advanceTownLife(noDose,.5);
 assert.equal(next.residents[0]!.remaining,patient.remaining,'no work away from the actual recovery point');assert.deepEqual(next.residents[0]!.needs,control.residents[0]!.needs,'no botanical gain during the walk back');assert.deepEqual(next.habitatCare,arrived.habitatCare);
 let live:TownLifeState=next,reloaded=immutableTownLife(JSON.parse(JSON.stringify(next)),7),worked=false;
 for(let i=0;i<30;i++){const before=live.residents[0]!.remaining;live=advanceTownLife(live,.5);reloaded=advanceTownLife(reloaded,.5);assert.deepEqual(reloaded,live);assert.equal(live.habitatCare!.used,1);if(live.residents[0]!.remaining<before){worked=true;break;}}
 assert.ok(worked,'patient physically returns and resumes the original paid treatment');assert.equal(live.residents[0]!.habitatCare,true);assert.equal(live.habitatCare!.stock,4);
});
