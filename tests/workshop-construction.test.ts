import test from 'node:test';
import assert from 'node:assert/strict';
import {createTownLife,validTownLife,advanceTownLifeWithWorkshopWork} from '../src/town-life.ts';
import {DEFAULT_WORKSHOP_DRAFT,compileWorkshopDraft} from '../src/workshop-authoring.ts';
import {WORKSHOP_BOARD,WORKSHOP_PARCEL,workshopConstructionQuote,workshopParcelClear,workshopConstructionBoxes,applyWorkshopConstruction,advanceWorkshopConstruction,validWorkshopConstruction,validWorkshopConstructionCommand,immutableWorkshopConstruction,workshopConstructionBlockReason,type WorkshopConstructionCommand} from '../src/workshop-construction.ts';
const setup=()=>{const life=createTownLife(73129),context={seed:life.seed,zone:'valley',player:{...WORKSHOP_BOARD,hp:50}},command:WorkshopConstructionCommand={kind:'build',expectedRevision:0,parcelId:WORKSHOP_PARCEL.id,parameters:DEFAULT_WORKSHOP_DRAFT,workerId:life.residents[0]!.id};return {life,context,command};};
test('campaign workshop pays finite town materials once, preserves identities and rejects retry or refund payload',()=>{
 const {life,context,command}=setup(),before=JSON.stringify(life),result=applyWorkshopConstruction(undefined,life,context,command)!;assert(result);assert.equal(JSON.stringify(life),before);
 assert.equal(result.life.resources.materials,life.resources.materials-workshopConstructionQuote(DEFAULT_WORKSHOP_DRAFT).materials);assert.equal(result.life.ledger.consumed.materials,31);assert(validTownLife(result.life,life.seed));assert(validWorkshopConstruction(result.construction,life.seed));
 assert.deepEqual(result.life.residents.map(r=>[r.id,r.homeIndex,r.householdId,r.needs]),life.residents.map(r=>[r.id,r.homeIndex,r.householdId,r.needs]));
 assert.equal(applyWorkshopConstruction(result.construction,result.life,context,command),null);assert(!validWorkshopConstructionCommand({...command,refund:true}));assert(!validWorkshopConstructionCommand({kind:'demolish',expectedRevision:1}));
 const poor=structuredClone(life);poor.resources.materials=0;poor.ledger.initial.materials=0;assert.equal(applyWorkshopConstruction(undefined,poor,context,command),null);
});
test('campaign workshop progress consumes only achieved prefabrication receipt and survives immutable save roundtrip',()=>{
 const {life,context,command}=setup(),result=applyWorkshopConstruction(undefined,life,context,command)!;let current=result.life,construction=result.construction,seconds=0;
 assert.equal(advanceWorkshopConstruction(construction,0),construction);
 for(let n=0;n<900&&construction.status!=='complete';n++){const next=advanceTownLifeWithWorkshopWork(current,.5,construction.workerId);seconds+=next.workSeconds;current=next.life;construction=advanceWorkshopConstruction(construction,next.workSeconds);assert(validWorkshopConstruction(construction,life.seed));}
 assert.equal(construction.status,'complete');assert(seconds>=construction.workRequired);assert.equal(construction.work,72);assert.deepEqual(immutableWorkshopConstruction(JSON.parse(JSON.stringify(construction)),life.seed),construction);assert.equal(current.residents.length,100);
 assert.throws(()=>advanceWorkshopConstruction(construction,Infinity));assert.throws(()=>advanceWorkshopConstruction(construction,-1));
 for(const forged of [{work:73},{status:'complete',work:0},{materialsPaid:0},{repairs:1},{workerId:'absent'},{revision:0},{parameters:{...DEFAULT_WORKSHOP_DRAFT,width:99}}])assert(!validWorkshopConstruction({...construction,...forged},life.seed));
});
test('completed workshop provides bounded paid repair with revision retry and finite stock protection',()=>{
 const {life,context,command}=setup(),result=applyWorkshopConstruction(undefined,life,context,command)!,complete=advanceWorkshopConstruction(result.construction,result.construction.workRequired),repair:WorkshopConstructionCommand={kind:'repair',expectedRevision:1};
 assert.equal(applyWorkshopConstruction(result.construction,result.life,context,repair),null);
 const fixed=applyWorkshopConstruction(complete,result.life,context,repair)!;assert(fixed);assert.equal(fixed.hp,75);assert.equal(fixed.life.resources.materials,result.life.resources.materials-4);assert.equal(fixed.construction.materialsPaid,35);assert(validTownLife(fixed.life,life.seed));assert(validWorkshopConstruction(fixed.construction,life.seed));assert.equal(applyWorkshopConstruction(fixed.construction,fixed.life,context,repair),null);
 assert.equal(applyWorkshopConstruction(complete,result.life,{...context,player:{...context.player,hp:100}},repair),null);
});
test('all bounded workshop plans retain approved flat foundations and identical persistent collider boxes',()=>{
 for(const rearRooms of [1,2,3])for(const width of [8.4,9.6])for(const depth of [7,8.2])for(const hallDepth of [3.1,3.7])for(const doorwayWidth of [1.4,1.8]){
 const parameters={...DEFAULT_WORKSHOP_DRAFT,rearRooms,width,depth,hallDepth,doorwayWidth},boxes=workshopConstructionBoxes({parameters}),plan=compileWorkshopDraft(parameters).workshop.plan;
 assert(workshopParcelClear(73129,parameters));assert.equal(boxes.length,plan.shapes.length);for(let n=0;n<boxes.length;n++){assert.deepEqual(boxes[n]!.half,plan.shapes[n]!.half);assert.equal(boxes[n]!.center.y,plan.shapes[n]!.center.y+6);assert.equal(boxes[n]!.solid,plan.shapes[n]!.solid);}
 }
});
test('campaign workshop rejects unsafe positions, unknown workers, and bodies inside future walls',()=>{
 const {life,context,command}=setup();for(const x of [NaN,Infinity,WORKSHOP_BOARD.x+4])assert.equal(applyWorkshopConstruction(undefined,life,{...context,player:{...context.player,x}},command),null);
 for(const feetY of [NaN,Infinity,8])assert.equal(applyWorkshopConstruction(undefined,life,{...context,player:{...context.player,feetY}},command),null);
 assert.equal(applyWorkshopConstruction(undefined,life,context,{...command,workerId:'unknown'}),null);
 const wall=workshopConstructionBoxes({parameters:DEFAULT_WORKSHOP_DRAFT}).find(b=>b.solid&&b.center.y-b.half.y<6.05&&b.center.y+b.half.y>6.05)!;
 assert(workshopConstructionBlockReason(undefined,life,{...context,actors:[{x:wall.center.x,z:wall.center.z,y:6}]},command));
});
