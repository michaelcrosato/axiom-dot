import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegionalState,enableRegionalSupply,applyAction,parseSave,serializeSave} from '../src/world.ts';
import {regionalSupplyPlan,regionalSupplyOutpostAt,type RegionalSupplyState} from '../src/regional-supply.ts';
import {gatherRegionalSupplyMaterials} from '../src/regional-supply-lab.ts';
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
test('historical collector snapshots match real pre-delivery, pre-build, construction and mature active ticks exactly',()=>{
 let state=enableRegionalSupply(createRegionalState(73129));const p=regionalSupplyPlan(state.seed).outposts[0]!,snapshots=new Map<number,unknown>();state=gatherRegionalSupplyMaterials(state,p.deliveryPosition,p.cost).state;state={...state,player:{...state.player,x:p.deliveryPosition.x,z:p.deliveryPosition.z}};
 for(let tick=0;tick<=1600;tick++){if(tick===5||tick===10)state=applyAction(state,{type:'regional-supply',command:{type:tick===5?'deliver':'build',outpostId:p.id,expectedRevision:state.frontierSupply!.revision}});snapshots.set(tick,clone(state.frontierSupply!.outposts[0]));if(tick<1600)state=applyAction(state,{type:'tick',dt:.25});}
 const before=serializeSave(state),supply=state.frontierSupply!;
 for(const tick of [0,4,5,9,10,11,39,78,200,1599,1600]){const historical=regionalSupplyOutpostAt(supply,p.id,tick);assert.deepEqual(historical,snapshots.get(tick),`tick ${tick}`);assert(Object.isFrozen(historical));assert(Object.isFrozen(historical!.residents));}
 assert.equal(serializeSave(state),before);assert.deepEqual(regionalSupplyOutpostAt(parseSave(before)!.frontierSupply!,p.id,200),snapshots.get(200));
 for(const tick of [-1,.5,NaN,Infinity,1601])assert.equal(regionalSupplyOutpostAt(supply,p.id,tick),undefined);assert.equal(regionalSupplyOutpostAt(supply,'wrong-outpost',0),undefined);
 for(const malformed of [null,{},[],{...clone(supply),ticks:999999999999},{...clone(supply),receipts:[]},{...clone(supply),outposts:[]},{...clone(supply),extra:true}])assert.equal(regionalSupplyOutpostAt(malformed as RegionalSupplyState,p.id,0),undefined);
 let read=0;const accessor=clone(supply);Object.defineProperty(accessor,'seed',{get(){read++;return 73129;},enumerable:true});assert.equal(regionalSupplyOutpostAt(accessor,p.id,0),undefined);assert.equal(read,0);const nested=clone(supply);Object.defineProperty(nested.outposts[0]!,'water',{get(){read++;return 5;},enumerable:true});assert.equal(regionalSupplyOutpostAt(nested,p.id,0),undefined);assert.equal(read,0);
});
