import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceTownLife,applyTownLifeCommand,createTownLife,createTownLifeScenario,immutableTownLife,townLifeCommandPosition,validTownLife,type TownLifeState,type TownLifeCommand} from '../src/town-life.ts';
import {advanceTownDirector,applyTownDirectorCommand,createTownDirector,createTownDirectorScenario,exportTownDirectorPreset,immutableTownDirector,importTownDirectorPreset,noteTownDirectorContribution,reconcileTownDirector,townDirectorCandidates,townDirectorInteractionPosition,TOWN_DIRECTOR_DEFAULTS,TOWN_DIRECTOR_ENGINE,TOWN_DIRECTOR_EPISODE_LIMIT,TOWN_DIRECTOR_SCENARIOS,TOWN_DIRECTOR_TUNING_REGISTRY,validTownDirector,validTownDirectorCommand,validTownDirectorPreset,validTownDirectorTuning,type TownDirectorState,type TownDirectorPreset,type TownEpisodeKind} from '../src/town-director.ts';
const clone=<T>(v:T):T=>structuredClone(v);
const status=(s:TownDirectorState,id:string)=>s.episodes.find(e=>e.id===id)!;
function episode(s:TownDirectorState,kind:TownEpisodeKind){const e=s.episodes.find(e=>e.kind===kind&&['offered','accepted'].includes(e.status));assert.ok(e,`missing ${kind}`);return e;}
function decision(d:TownDirectorState,life:TownLifeState,id:string,kind:'accept'|'decline'='accept'){
 const p=townDirectorInteractionPosition(d,id)!;return applyTownDirectorCommand(d,life,{seed:life.seed,zone:'valley',player:{...p,hp:100}},{kind,episodeId:id,expectedRevision:d.revision,expectedLifeRevision:life.revision});
}
function command(life:TownLifeState,kind:TownLifeCommand['kind'],targetId:string){
 const c={kind,targetId,expectedRevision:life.revision},p=townLifeCommandPosition(life,c)!;
 const result=applyTownLifeCommand(life,{seed:life.seed,zone:'valley',player:{...p,hp:100},inventory:{water:100,scrap:100,core:0}},c);assert.ok(result);return {life:result.life,command:c,inventory:result.inventory};
}
function run(d:TownDirectorState,l:TownLifeState,seconds:number){for(let i=0;i<seconds/.5;i++){l=advanceTownLife(l,.5);d=advanceTownDirector(d,l,.5);}return {director:d,life:l};}
function frozenRun(d:TownDirectorState,l:TownLifeState,seconds:number){while(seconds>0){const dt=Math.min(seconds,60);d=advanceTownDirector(d,l,dt);seconds-=dt;}return d;}
function ledger(l:TownLifeState){for(const k of ['pantry','water','materials','harvest']as const)assert.ok(Math.abs(l.ledger.initial[k]+l.ledger.produced[k]+l.ledger.donated[k]-l.ledger.consumed[k]-l.ledger.overflow[k]-l.resources[k])<1e-4);}

test('actual needs create seeded bounded offers with stable identities and immutable causal evidence',()=>{
 for(const seed of [0,7,4294967295])for(const scenario of TOWN_DIRECTOR_SCENARIOS){
  const {life,director}=createTownDirectorScenario(seed,scenario.id);assert.ok(validTownDirector(director,life));assert.deepEqual(director,createTownDirector(life));assert.ok(director.episodes.length<=2);assert.ok(Object.isFrozen(director.episodes));
  for(const e of director.episodes){assert.ok(Object.isFrozen(e.evidence));assert.equal(e.evidence.lifeRevision,life.revision);assert.equal(e.evidence.tick,life.tick);assert.ok(e.remainingSteps<=720);assert.ok(e.evidence.estimatedActions<=4);}
 }
 assert.equal(createTownDirector(createTownLife(7)).episodes.length,0);
 const {life,director}=createTownDirectorScenario(7,'lean-stores');assert.deepEqual(director.episodes.map(e=>e.kind).sort(),['material-shortage','water-shortage']);
 const reordered=Object.fromEntries(Object.entries(clone(life)).reverse()) as unknown as TownLifeState;assert.deepEqual(townDirectorCandidates(reordered),townDirectorCandidates(life));
 assert.equal(TOWN_DIRECTOR_ENGINE.kind,'axiom-town-director');assert.equal(TOWN_DIRECTOR_ENGINE.command,applyTownDirectorCommand);
});

test('accept and cancel enforce authoritative revision, exact command keys, public range and current need',()=>{
 const {life,director}=createTownDirectorScenario(9,'lean-stores'),e=episode(director,'water-shortage'),p=townDirectorInteractionPosition(director,e.id)!;
 const c={kind:'accept' as const,episodeId:e.id,expectedRevision:director.revision,expectedLifeRevision:life.revision},ctx={seed:life.seed,zone:'valley',player:{...p,hp:100}};
 for(const bad of [{...c,expectedRevision:0},{...c,expectedLifeRevision:1},{...c,extra:true},{...c,episodeId:'town-request-25'}])assert.equal(applyTownDirectorCommand(director,life,ctx,bad),null);
 for(const bad of [{...ctx,zone:'cave'},{...ctx,seed:10},{...ctx,player:{...p,hp:0}},{...ctx,player:{x:p.x+3.51,z:p.z,hp:100}},{...ctx,player:{x:NaN,z:p.z,hp:100}}])assert.equal(applyTownDirectorCommand(director,life,bad,c),null);
 const accepted=decision(director,life,e.id)!;assert.equal(status(accepted,e.id).status,'accepted');assert.equal(status(accepted,e.id).accepted?.lifeRevision,0);assert.equal(decision(accepted,life,e.id),null);assert.equal(applyTownDirectorCommand(accepted,life,ctx,c),null);
 const canceled=decision(accepted,life,e.id,'decline')!;assert.equal(status(canceled,e.id).status,'declined');assert.equal(decision(canceled,life,e.id,'decline'),null);assert.ok(validTownDirector(canceled,life));assert.deepEqual(director,createTownDirector(life));
 const future=command(life,'donate-supplies','workshop');assert.equal(applyTownDirectorCommand(director,future.life,ctx,c),null);
});

test('an actual postacceptance targeted contribution crossing the goal completes without any reward',()=>{
 const {life,director}=createTownDirectorScenario(22,'lean-stores'),e=episode(director,'material-shortage'),accepted=decision(director,life,e.id)!;
 const beforeLife=JSON.stringify(life),beforeDirector=JSON.stringify(accepted),result=command(life,'donate-supplies','workshop');
 const done=noteTownDirectorContribution(accepted,life,result.life,result.command),record=status(done,e.id);assert.equal(record.status,'completed');assert.equal(record.outcome?.reason,'helped');assert.equal(record.contribution?.count,1);assert.deepEqual(record.contribution?.command,result.command);assert.equal(record.outcome?.value,16);assert.ok(validTownDirector(done,result.life));
 assert.equal(JSON.stringify(life),beforeLife);assert.equal(JSON.stringify(accepted),beforeDirector);assert.deepEqual(result.inventory,{scrap:98,core:0,water:100});assert.deepEqual(result.life.playerSpent,{scrap:2,core:0,water:0});ledger(result.life);
 assert.equal(noteTownDirectorContribution(done,life,result.life,result.command),done);assert.equal(status(reconcileTownDirector(done,result.life),e.id).status,'completed');assert.deepEqual(Object.keys(done).sort(),['accumulator','episodes','observedLifeRevision','phaseSteps','restSteps','revision','seed','tuning','version']);
});

test('preacceptance aid, unrelated targets, replayed or fabricated command transitions never give credit',()=>{
 const {life,director}=createTownDirectorScenario(13,'lean-stores'),e=episode(director,'material-shortage'),result=command(life,'donate-supplies','workshop');
 const notAccepted=noteTownDirectorContribution(director,life,result.life,result.command);assert.equal(status(notAccepted,e.id).status,'world-resolved');assert.equal(status(notAccepted,e.id).contribution,null);
 const accepted=decision(director,life,e.id)!,other=command(life,'donate-water','well'),observed=noteTownDirectorContribution(accepted,life,other.life,other.command);assert.equal(status(observed,e.id).status,'accepted');assert.equal(status(observed,e.id).contribution,null);assert.ok(validTownDirector(observed,other.life));
 assert.equal(noteTownDirectorContribution(accepted,life,result.life,{...result.command,targetId:'square'}),accepted);
 const fabricated=clone(result.life);fabricated.resources.water+=1;fabricated.ledger.initial.water+=1;assert.ok(validTownLife(fabricated,life.seed));assert.equal(noteTownDirectorContribution(accepted,life,fabricated,result.command),accepted);
 const withTime=advanceTownLife(result.life,.5);assert.equal(noteTownDirectorContribution(accepted,life,withTime,result.command),accepted);
 const afterReconcile=reconcileTownDirector(accepted,result.life);assert.equal(status(afterReconcile,e.id).status,'world-resolved');assert.equal(noteTownDirectorContribution(afterReconcile,life,result.life,result.command),afterReconcile);
});

test('NPC-only recovery resolves actual targets with no player credit or synthetic resources',()=>{
 const {life,director}=createTownDirectorScenario(3,'lean-stores');let d=director;for(const e of director.episodes)d=decision(d,life,e.id)!;
 const before=JSON.stringify(life),result=run(d,life,120);assert.ok(result.director.episodes.slice(0,2).every(e=>e.status==='world-resolved'));assert.ok(result.director.episodes.slice(0,2).every(e=>e.contribution===null&&e.outcome?.reason==='recovered'));assert.ok(validTownDirector(result.director,result.life));assert.equal(result.life.revision,0);assert.equal(result.life.playerSpent.scrap,0);assert.equal(result.life.playerSpent.water,0);assert.equal(JSON.stringify(life),before);ledger(result.life);
 assert.deepEqual(result.life,run(createTownDirector(life),life,120).life);
});

test('partial real help remains factual but later natural recovery does not become player completion',()=>{
 const {life,director}=createTownDirectorScenario(5,'lean-stores'),e=episode(director,'water-shortage'),accepted=decision(director,life,e.id)!,donation=command(life,'donate-water','well');
 const helped=noteTownDirectorContribution(accepted,life,donation.life,donation.command);assert.equal(status(helped,e.id).status,'accepted');assert.equal(status(helped,e.id).contribution?.afterValue,24);
 const next=run(helped,donation.life,90),record=status(next.director,e.id);assert.equal(record.status,'world-resolved');assert.equal(record.outcome?.reason,'recovered');assert.equal(record.contribution?.count,1);assert.ok(validTownDirector(next.director,next.life));
});

test('exact resident identity and public-service targets determine contribution credit',()=>{
 const scenario=createTownDirectorScenario(31,'social-strain'),e=scenario.director.episodes[0]!,d=decision(scenario.director,scenario.life,e.id)!;
 const unrelated=scenario.life.residents.find(r=>r.id!==e.targetId)!,a=command(scenario.life,'encourage-resident',unrelated.id),afterOther=noteTownDirectorContribution(d,scenario.life,a.life,a.command);
 assert.equal(status(afterOther,e.id).contribution,null);
 const b=command(a.life,'encourage-resident',e.targetId),afterTarget=noteTownDirectorContribution(afterOther,a.life,b.life,b.command);assert.equal(status(afterTarget,e.id).contribution?.command.targetId,e.targetId);assert.ok(validTownDirector(afterTarget,b.life));
 const service=createTownDirectorScenario(9,'service-outage'),f=episode(service.director,'service-wear'),accepted=decision(service.director,service.life,f.id)!,repair=command(service.life,'repair-service',f.targetId),partial=noteTownDirectorContribution(accepted,service.life,repair.life,repair.command);assert.equal(status(partial,f.id).status,'accepted');assert.equal(status(partial,f.id).contribution?.afterValue,45);assert.ok(validTownDirector(partial,repair.life));
});

test('deadlines, rest, repetition and 24-episode lifetime are finite; declined requests do not revive',()=>{
 const {life,director}=createTownDirectorScenario(4,'lean-stores'),first=director.episodes[0]!;
 const almost=frozenRun(director,life,239.5);assert.equal(status(almost,first.id).status,'offered');const expired=advanceTownDirector(almost,life,.5);assert.equal(status(expired,first.id).status,'expired');assert.equal(expired.restSteps,180);assert.ok(validTownDirector(expired,life));
 let d=createTownDirectorScenario(18,'social-strain',{...TOWN_DIRECTOR_DEFAULTS,restSeconds:30}).director,l=createTownLifeScenario(18,'social-strain');
 while(d.episodes.length<TOWN_DIRECTOR_EPISODE_LIMIT){for(const e of d.episodes.filter(e=>e.status==='offered'))d=decision(d,l,e.id,'decline')!;d=frozenRun(d,l,30);assert.ok(validTownDirector(d,l));}
 for(const e of d.episodes.filter(e=>e.status==='offered'))d=decision(d,l,e.id,'decline')!;const snapshot=JSON.stringify(d.episodes);d=frozenRun(d,l,600);assert.equal(d.episodes.length,24);assert.equal(JSON.stringify(d.episodes),snapshot);assert.ok(JSON.stringify(d).length<48000);assert.ok(validTownDirector(d,l));
 let repeat=director;for(let i=0;i<5;i++){for(const e of repeat.episodes.filter(e=>e.status==='offered'))repeat=decision(repeat,life,e.id,'decline')!;repeat=frozenRun(repeat,life,90);}assert.equal(repeat.episodes.length,4);for(const kind of ['water-shortage','material-shortage'])assert.equal(repeat.episodes.filter(e=>e.kind===kind).length,2);
});

test('strict validators reject unknown fields, prototypes, sparse arrays, accessors and false history',()=>{
 const {life,director}=createTownDirectorScenario(12,'lean-stores'),bads:unknown[]=[];
 const edit=(f:(s:any)=>void)=>{const v=clone(director);f(v);bads.push(v);};
 edit(s=>s.extra=1);edit(s=>s.version=2);edit(s=>s.seed=99);edit(s=>s.revision++);edit(s=>s.phaseSteps=60);edit(s=>s.restSteps=601);edit(s=>s.accumulator=Infinity);edit(s=>s.episodes[0].remainingSteps=NaN);edit(s=>s.episodes[0].issuerId=s.episodes[1].issuerId);edit(s=>s.episodes[0].targetId='home-0');edit(s=>s.episodes[0].evidence.value=42);edit(s=>s.episodes[0].evidence.estimatedActions=4);edit(s=>s.episodes[0].status='completed');edit(s=>s.episodes[0].accepted={lifeRevision:1,tick:0,value:4,aux:0});edit(s=>s.tuning.maxActive=3);edit(s=>s.episodes.reverse());edit(s=>delete s.episodes[0]);edit(s=>s.episodes[Symbol('x')]=1);edit(s=>Object.setPrototypeOf(s.episodes[0],{x:1}));
 let accesses=0;edit(s=>Object.defineProperty(s.episodes[0].evidence,'value',{get(){accesses++;throw Error('accessor ran');}}));edit(s=>Object.defineProperty(s,'tuning',{get(){accesses++;throw Error('accessor ran');}}));
 for(const [index,bad] of bads.entries()){assert.equal(validTownDirector(bad,life),false,`bad variant ${index}`);assert.throws(()=>immutableTownDirector(bad,life));}assert.equal(accesses,0);
 const plain=clone(director),sealed=immutableTownDirector(plain,life);plain.episodes[0]!.remainingSteps=0;assert.notEqual(sealed.episodes[0]!.remainingSteps,0);assert.ok(Object.isFrozen(sealed.episodes[0]!.evidence));
 assert.equal(validTownDirectorCommand({kind:'accept',episodeId:'town-request-1',expectedRevision:1,expectedLifeRevision:0,player:{}}),false);
 for(const dt of [-1,60.01,NaN,Infinity])assert.throws(()=>advanceTownDirector(director,life,dt));
});

test('low/default/high tuning has real consumers, latches deadlines and does not rewrite accepted requests',()=>{
 const life=createTownLifeScenario(7,'social-strain');
 for(const f of TOWN_DIRECTOR_TUNING_REGISTRY)assert.ok(f.description&&f.unit&&f.timing);
 const low={restSeconds:30,deadlineSeconds:120,maxActive:1},high={restSeconds:300,deadlineSeconds:360,maxActive:2};
 const base=createTownDirector(life),a=createTownDirector(life,low),b=createTownDirector(life,high);assert.equal(a.episodes.length,1);assert.equal(base.episodes.length,2);assert.equal(b.episodes.length,2);assert.equal(a.episodes[0]!.deadlineSteps,240);assert.equal(base.episodes[0]!.deadlineSteps,480);assert.equal(b.episodes[0]!.deadlineSteps,720);
 let lower=b;for(const e of b.episodes)lower=decision(lower,life,e.id)!;lower=advanceTownDirector(lower,life,0,low);assert.equal(lower.episodes.filter(e=>e.status==='accepted').length,2);assert.equal(lower.episodes[0]!.deadlineSteps,720);
 for(const [t,seconds]of [[low,30],[TOWN_DIRECTOR_DEFAULTS,90],[high,300]]as const){let d=createTownDirector(life,t);for(const e of d.episodes)d=decision(d,life,e.id,'decline')!;const n=d.episodes.length;d=frozenRun(d,life,seconds-.5);assert.equal(d.episodes.length,n);d=advanceTownDirector(d,life,.5);assert.ok(d.episodes.length>n);}
 const severe=clone(life);for(const r of severe.residents){r.stress=100;r.needs.connection=0;}assert.equal(townDirectorCandidates(severe,low).length,0);assert.ok(townDirectorCandidates(severe,high).length>0);
 assert.equal(validTownDirectorTuning({...low,restSeconds:30.5}),false);assert.equal(validTownDirectorTuning({...low,unused:1}),false);
});

test('bounded presets, scenario reset, reload and deterministic replay preserve the exact outcomes',()=>{
 const preset:TownDirectorPreset={kind:'axiom-town-director-preset',version:1,seed:28,scenario:'lean-stores',tuning:{...TOWN_DIRECTOR_DEFAULTS}};
 assert.deepEqual(importTownDirectorPreset(exportTownDirectorPreset(preset)),preset);assert.ok(Object.isFrozen(importTownDirectorPreset(exportTownDirectorPreset(preset)).tuning));assert.equal(validTownDirectorPreset({...preset,extra:1}),false);
 for(const text of ['x','null',' '.repeat(4097),JSON.stringify({...preset,version:2}),JSON.stringify({...preset,scenario:'invented'})])assert.throws(()=>importTownDirectorPreset(text));
 const original=createTownDirectorScenario(28,'lean-stores'),e=episode(original.director,'material-shortage'),accepted=decision(original.director,original.life,e.id)!;
 const restoredLife=immutableTownLife(JSON.parse(JSON.stringify(original.life)),28),restored=immutableTownDirector(JSON.parse(JSON.stringify(accepted)),restoredLife);
 const a=command(original.life,'donate-supplies','workshop'),b=command(restoredLife,'donate-supplies','workshop'),da=noteTownDirectorContribution(accepted,original.life,a.life,a.command),db=noteTownDirectorContribution(restored,restoredLife,b.life,b.command);assert.deepEqual(da,db);assert.deepEqual(run(da,a.life,120),run(db,b.life,120));
 const segments=createTownDirector(original.life);let quarter=segments;for(let i=0;i<120;i++)quarter=advanceTownDirector(quarter,original.life,.25);assert.deepEqual(quarter,advanceTownDirector(segments,original.life,30));
 const copy=immutableTownDirector(JSON.parse(JSON.stringify(quarter)),original.life);assert.deepEqual(advanceTownDirector(copy,original.life,0),quarter);assert.deepEqual(createTownDirectorScenario(28,'lean-stores'),original);
});


test('resident encouragement and a second genuine repair can directly satisfy their exact predicates',()=>{
 const base=createTownLife(31),life=createTownLifeScenario(31,'balanced',{residentIndex:0,needs:{...base.residents[0]!.needs,connection:24}}),director=createTownDirector(life),e=episode(director,'resident-support'),accepted=decision(director,life,e.id)!,help=command(life,'encourage-resident',e.targetId),done=noteTownDirectorContribution(accepted,life,help.life,help.command);
 assert.equal(status(done,e.id).status,'completed');assert.equal(status(done,e.id).outcome?.value,34);assert.ok((status(done,e.id).outcome?.aux??100)<=60);assert.ok(validTownDirector(done,help.life));
 const scenario=createTownDirectorScenario(9,'service-outage'),f=episode(scenario.director,'service-wear'),d=decision(scenario.director,scenario.life,f.id)!,first=command(scenario.life,'repair-service',f.targetId),partial=noteTownDirectorContribution(d,scenario.life,first.life,first.command),waiting=run(partial,first.life,20);
 assert.equal(status(waiting.director,f.id).status,'accepted');const second=command(waiting.life,'repair-service',f.targetId),restored=noteTownDirectorContribution(waiting.director,waiting.life,second.life,second.command);assert.equal(status(restored,f.id).status,'completed');assert.equal(status(restored,f.id).contribution?.count,2);assert.equal(status(restored,f.id).outcome?.aux,0);assert.ok(validTownDirector(restored,second.life));ledger(second.life);
});


test('older town snapshots cannot rewrite already recorded causal chronology even at unchanged player revision',()=>{
 const initial=createTownDirectorScenario(7,'lean-stores'),later=run(initial.director,initial.life,1),e=episode(later.director,'material-shortage'),accepted=decision(later.director,later.life,e.id)!;
 assert.equal(later.life.revision,initial.life.revision);assert.ok(status(accepted,e.id).accepted!.tick>initial.life.tick);assert.equal(decision(accepted,initial.life,e.id,'decline'),null);assert.throws(()=>reconcileTownDirector(accepted,initial.life));assert.throws(()=>immutableTownDirector(accepted,initial.life));
 const oldCommand=command(initial.life,'donate-supplies','workshop');assert.equal(noteTownDirectorContribution(accepted,initial.life,oldCommand.life,oldCommand.command),accepted);
});
