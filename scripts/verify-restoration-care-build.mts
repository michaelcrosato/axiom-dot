import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {RESTORATION_ENGINE,RESTORATION_DEFAULTS} from '../src/restoration.ts';
import {RESTORATION_CARE_ENGINE,type RestorationCareState} from '../src/restoration-care.ts';
import {TOWN_LIFE_ENGINE} from '../src/town-life.ts';
import {createRestorationCareScenario} from '../src/restoration-care-scenarios.ts';
import {validateSave,parseSave,serializeSave,worldRestorationPlan} from '../src/world.ts';
import {handleCoop} from '../server/coop-api.ts';
import {earnedCareWorld,careCommand,atCare} from '../tests/helpers/restoration-care.ts';
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'dist/client/assets'),files=readdirSync(assets),digest=(v:unknown)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
// Only known model chunks are imported: no DOM main module or synthetic bundle.
const modules=await Promise.all(files.filter(f=>/^(restoration(?:-engine|-care|-care-engine)?|town-life|town-director|workshop-construction-engine)-.*\.js$/.test(f)).map(async file=>({file,module:await import(pathToFileURL(resolve(assets,file)).href),sha256:digest(readFileSync(resolve(assets,file),'utf8'))})));
function surface<T>(kind:string):{file:string;value:T;sha256:string}{const found=modules.flatMap(m=>Object.values(m.module).filter((v:any)=>v?.kind===kind).map(value=>({file:m.file,value:value as T,sha256:m.sha256})));assert.equal(found.length,1,`exactly one actual emitted ${kind} engine`);return found[0]!;}
const restorationAsset=surface<typeof RESTORATION_ENGINE>('axiom-restoration'),careAsset=surface<typeof RESTORATION_CARE_ENGINE>('axiom-restoration-care'),townAsset=surface<typeof TOWN_LIFE_ENGINE>('axiom-town-life');
const restorationEngine=restorationAsset.value,careEngine=careAsset.value,townEngine=townAsset.value,modelCases:any[]=[];
for(const seed of [0,73129,0xffffffff]){
 const scenario=createRestorationCareScenario(seed,'delivered'),plan=scenario.plan;
 let source=RESTORATION_ENGINE.create(plan),built=restorationEngine.create(plan),sourceLife=TOWN_LIFE_ENGINE.scenario(seed,'overwork'),builtLife=townEngine.scenario(seed,'overwork'),sourceCare:RestorationCareState|undefined,builtCare:RestorationCareState|undefined,inventory={...scenario.initialInventory},builtInventory={...inventory},player={x:plan.sites[0]!.x,z:plan.sites[0]!.z-2.5,hp:70},ticks=0;
 assert.deepEqual(built,source);assert.deepEqual(builtLife,sourceLife);
 for(const step of scenario.preparationActions as any[]){
  if(step.kind==='command'){
   player={...step.player};const a=RESTORATION_ENGINE.command(source,plan,{seed,zone:'valley',player,inventory},step.command),b=restorationEngine.command(built,plan,{seed,zone:'valley',player,inventory:builtInventory},step.command);assert.deepEqual(b,a);assert.notEqual(a.state,source);source=a.state;built=b.state;inventory=a.inventory;builtInventory=b.inventory;
  }else if(step.kind==='advance'){
   assert.equal(step.followRig,true);for(let i=0;i<step.ticks;i++){
    const point=RESTORATION_ENGINE.machinePosition(source,plan),other=restorationEngine.machinePosition(built,plan);assert.deepEqual(other,point);if(point)player={...player,x:point.x,z:point.z-2.5};
    source=RESTORATION_ENGINE.advance(source,plan,.25,{player},RESTORATION_DEFAULTS);built=restorationEngine.advance(built,plan,.25,{player},RESTORATION_DEFAULTS);assert.deepEqual(built,source);ticks++;
   }
  }else if(step.kind==='care-command'){
   player={...step.player};const context={seed,zone:'valley',player},a=RESTORATION_CARE_ENGINE.apply(sourceCare,source,plan,sourceLife,context,step.command),b=careEngine.apply(builtCare,built,plan,builtLife,context,step.command);assert(a);assert.deepEqual(b,a);sourceCare=a.care;builtCare=b!.care;source=a.restoration;built=b!.restoration;sourceLife=a.life;builtLife=b!.life;assert.equal(careEngine.apply(builtCare,built,plan,builtLife,context,step.command),null,'exact command retry cannot duplicate cargo or doses');
  }else assert.fail(`unknown preparation action ${step.kind}`);
  assert.deepEqual(restorationEngine.balances(built,plan),RESTORATION_ENGINE.balances(source,plan));assert(Object.values(restorationEngine.balances(built,plan)).every(n=>n===0));assert(restorationEngine.validate(built,plan));
 }
 assert.deepEqual(source,scenario.restoration);assert.deepEqual(sourceLife,scenario.life);assert.deepEqual(sourceCare,scenario.care);assert.deepEqual(builtInventory,scenario.inventory);assert.equal(ticks,scenario.preparationTicks);assert(source.sites[0]!.completedAtTick!==null);assert.equal(sourceCare!.delivered,5);assert.equal(sourceLife.habitatCare!.stock,5);assert(careEngine.validate(builtCare,built,builtLife));assert.deepEqual(careEngine.immutable(JSON.parse(JSON.stringify(builtCare)),built,builtLife),builtCare);
 let control=structuredClone(sourceLife);delete control.habitatCare;let witnessed:any=null,townSteps=0;
 for(;townSteps<480&&!witnessed;townSteps++){
  const before=sourceLife,plainBefore=control;sourceLife=TOWN_LIFE_ENGINE.advance(sourceLife,.5);builtLife=townEngine.advance(builtLife,.5);control=TOWN_LIFE_ENGINE.advance(control,.5);assert.deepEqual(builtLife,sourceLife);assert(townEngine.validate(builtLife,seed));assert(careEngine.validate(builtCare,built,builtLife));
  for(const r of before.residents){const after=sourceLife.residents[r.index]!,plain=control.residents[r.index]!;if(!r.habitatCare||after.remaining>=r.remaining||after.completed!==r.completed)continue;
   assert.deepEqual(r.needs,plainBefore.residents[r.index]!.needs,'before first botanical work the untreated control has the same needs');assert.equal(after.remaining,plain.remaining,'botanical care cannot speed action time');
   const elapsed=r.remaining-after.remaining;for(const [key,total] of [['energy',45],['hygiene',35],['comfort',74]] as const){const extra=after.needs[key]-plain.needs[key];assert(extra>=-1e-7);assert(extra<=total/24*elapsed*.5+1e-7);}
   assert(after.needs.energy>plain.needs.energy||after.needs.hygiene>plain.needs.hygiene||after.needs.comfort>plain.needs.comfort);witnessed={residentId:r.id,elapsed,needs:after.needs,untreatedNeeds:plain.needs};break;
  }
 }
 assert(witnessed,'earned delivered stock must benefit an actually arrived resident');assert(sourceLife.habitatCare!.used>=1);assert.equal(sourceLife.habitatCare!.received,sourceLife.habitatCare!.stock+sourceLife.habitatCare!.used);
 const reloaded=JSON.parse(JSON.stringify(builtLife));assert.deepEqual(townEngine.advance(reloaded,2),TOWN_LIFE_ENGINE.advance(sourceLife,2));
 for(const edit of [(v:any)=>v.carried+=5,(v:any)=>v.delivered+=5,(v:any)=>v.revision++]){const invalid=structuredClone(builtCare);edit(invalid);assert.equal(careEngine.validate(invalid,built,builtLife),false);assert.equal(RESTORATION_CARE_ENGINE.validate(invalid,source,sourceLife),false);}
 const forged=structuredClone(built);forged.sites[0]!.cells[0]!.biomass++;assert.equal(restorationEngine.validate(forged,plan),false);assert.equal(RESTORATION_ENGINE.validate(forged,plan),false);
 modelCases.push({seed,preparationTicks:ticks,preparationActions:scenario.preparationActions.length,completedAtTick:source.sites[0]!.completedAtTick,care:sourceCare,clinic:sourceLife.habitatCare,townSteps,witnessed,sha256:digest({source,sourceCare,sourceLife,inventory})});console.error(`restoration care emitted earned replay and treatment seed ${seed} passed`);
}
const builtServer=(await import(pathToFileURL(resolve(root,'dist/server/index.js')).href)).default;
async function serverCase(emitted:boolean){const db=new DatabaseSync(':memory:');for(const file of readdirSync(resolve(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(resolve(root,'drizzle',file),'utf8'));const DB={prepare(sql:string){let values:any[]=[];return {bind(...next:any[]){values=next;return this;},async first(){return db.prepare(sql).get(...values)??null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){const result=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}};}};}};let now=1900000000000;const originalNow=Date.now;Date.now=()=>now;
 async function request(path:string,body:unknown,expected=200,user='restoration-care-host',preview=true){const req=new Request('https://fixture.invalid/api/coop'+path,{method:'POST',headers:{Origin:'https://fixture.invalid','oai-authenticated-user-id':user,'Content-Type':'application/json'},body:JSON.stringify(body)}),response=emitted?await builtServer.fetch(req,preview?{AXIOM_PREVIEW_DB:DB}:{DB}):await handleCoop(req,preview?{DB}:{},now);assert.equal(response?.status,expected,await response?.clone().text());return await response!.json() as any;}
 try{
  // Disposable care-pressure fixture; restoration completion and every payment
  // are earned by the shared helper, while residents keep the real town engine.
  const ready={...earnedCareWorld(),townLife:TOWN_LIFE_ENGINE.scenario(73129,'overwork')};assert(validateSave(ready));
  await request('/rooms',{name:'Binding check',world:ready},503,'restoration-care-host',false);
  let current=await request('/rooms',{name:'Earned habitat collect',world:ready},201);const id=current.roomId,sessionId=current.sessionId,command=careCommand(current.world,'collect');
  const guest=await request('/join',{name:'Care guest',code:current.code},200,'restoration-care-guest'),guestAttempt=await request(`/rooms/${id}/sync`,{seq:1,sessionId:guest.sessionId,actions:[{type:'restoration-care',command}]},200,'restoration-care-guest');assert.equal(guestAttempt.world.restorationCare,undefined,'guest cannot transfer shared biomass');
  const packet={seq:1,sessionId,actions:[{type:'restoration-care',command}]};current=await request(`/rooms/${id}/sync`,packet);assert.equal(current.world.restorationCare.carried,5);assert.deepEqual((await request(`/rooms/${id}/sync`,packet)).world,current.world);assert(validateSave(current.world));
  const carried=atCare(current.world,'deliver');assert.deepEqual(parseSave(serializeSave(carried)),carried);const imported=await request('/rooms',{name:'Carried bundle import',world:carried},201),delivery={seq:1,sessionId:imported.sessionId,actions:[{type:'restoration-care',command:careCommand(imported.world,'deliver')}]};
  current=await request(`/rooms/${imported.roomId}/sync`,delivery);assert.equal(current.world.restorationCare.carried,0);assert.equal(current.world.townLife.habitatCare.stock,5);assert.deepEqual((await request(`/rooms/${imported.roomId}/sync`,delivery)).world,current.world);assert(validateSave(current.world));
  let seq=1;for(let poll=0;poll<240&&current.world.townLife.habitatCare.used===0;poll++){now+=1000;const packet={seq:++seq,sessionId:imported.sessionId,actions:[]};current=await request(`/rooms/${imported.roomId}/sync`,packet);if(current.world.townLife.habitatCare.used>0)assert.deepEqual((await request(`/rooms/${imported.roomId}/sync`,packet)).world,current.world);}
  assert(current.world.townLife.habitatCare.used>0,'actual emitted HTTP clock spends care only through town arrival');assert(validateSave(current.world));
  for(const edit of [(v:any)=>v.restorationCare.delivered+=5,(v:any)=>v.townLife.habitatCare.stock++,(v:any)=>v.restoration.sites[0].careExported+=5,(v:any)=>v.inventory.scrap++]){const bad=structuredClone(current.world);edit(bad);await request('/rooms',{name:'Forged care import',world:bad},400);}
  await request(`/rooms/${imported.roomId}/sync`,{seq:seq+1,sessionId:imported.sessionId,actions:[{type:'restoration-care',command:{kind:'deliver',targetId:'apothecary',expectedRevision:2},carried:5}]},400);
  const plan=worldRestorationPlan(current.world.seed);assert(Object.values(RESTORATION_ENGINE.balances(current.world.restoration,plan)).every(n=>n===0));
  return {care:current.world.restorationCare,clinic:current.world.townLife.habitatCare,exported:RESTORATION_CARE_ENGINE.exported(current.world.restoration),inventory:current.world.inventory,restorationSha256:digest(current.world.restoration),lifeSha256:digest(current.world.townLife),forgedImportsRejected:4,guestRejected:true,exactRetries:true,paidImport:true,previewOnlyBinding:true};
 }finally{Date.now=originalNow;db.close();}}
const sourceServer=await serverCase(false),emittedServer=await serverCase(true);assert.deepEqual(emittedServer,sourceServer);console.error('restoration care emitted HTTP/SQLite collect, delivery and achieved clinic consumption passed');
const sourceFiles=['src/restoration.ts','src/restoration-care.ts','src/restoration-care-scenarios.ts','src/restoration-care-lab.ts','src/restoration-care-ui.ts','src/town-life.ts','src/world.ts','src/main.ts','tests/helpers/restoration-care.ts','server/coop-api.ts','server/coop-authority.ts','server/coop-validation.ts','server/index.ts'];
const report={kind:'axiom-restoration-care-emitted-verification',version:1,verifiedAt:new Date().toISOString(),scope:'Actual emitted restoration, care bridge and town engines, earned habitat preparation replay, conserved delivery and achieved care, source/emitted HTTP with disposable SQLite. No browser/GPU/device or live-player claim.',sourceHashes:Object.fromEntries(sourceFiles.map(file=>[file,digest(readFileSync(resolve(root,file),'utf8'))])),engines:[restorationAsset,careAsset,townAsset].map(({file,sha256,value})=>({kind:value.kind,file,sha256})),modelCases,server:{assetSha256:digest(readFileSync(resolve(root,'dist/server/index.js'),'utf8')),sha256:digest(emittedServer),...emittedServer}};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
