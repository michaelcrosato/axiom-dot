import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCoop} from '../server/coop-api.ts';
import {action} from '../server/coop-validation.ts';
import type {CoopRoom} from '../server/coop-authority.ts';
import type {D1Database,D1Statement} from '../server/coop-store.ts';
import {CoopClient} from '../src/coop.ts';
import type {CoopAction,CoopSnapshot} from '../src/coop-protocol.ts';
import {createState,createConnectedState,enableEcology,applyAction,validateSave,serializeSave,parseSave,worldObjects,worldEndpoints,type State} from '../src/world.ts';
import {ecologyPlan,ecologyStage,ecologyWaterBalance,validEcology,type EcologyCommand} from '../src/ecology.ts';

type Player={user:string;s:CoopSnapshot};
type CommandInput=EcologyCommand extends infer C?C extends EcologyCommand?Omit<C,'expectedRevision'>:never:never;
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));

/** Each player crosses a real HTTP socket; every room mutation uses the actual SQLite CAS. */
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
  let now=1_800_000_000_000,origin='',conflicts=0;
  let pause:undefined|{arrived:()=>void;gate:Promise<void>};
  const DB:D1Database={prepare(sql){
    let values:unknown[]=[];
    const statement:D1Statement={bind(...args){values=args;return statement;},
      async first<T>(){return (sqlite.prepare(sql).get(...values as never[])??null) as T|null;},
      async all<T>(){return {results:sqlite.prepare(sql).all(...values as never[]) as T[]};},
      async run(){
        if(sql.startsWith('UPDATE axiom_coop_rooms')&&pause){const pending=pause;pause=undefined;pending.arrived();await pending.gate;}
        const result=sqlite.prepare(sql).run(...values as never[]),changes=Number(result.changes);
        if(sql.startsWith('UPDATE axiom_coop_rooms')&&changes===0)conflicts++;
        return {success:true,meta:{changes}};
      }};return statement;
  }};
  const server=createServer(async(req,res)=>{
    try{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);
      const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
      const body=Buffer.concat(chunks).toString('utf8');
      const result=await handleCoop(new Request(`${origin}${req.url}`,{method:req.method,headers,...(body?{body}:{})}),{DB},now);
      res.writeHead(result?.status??404,Object.fromEntries(result?.headers??[]));res.end(await result?.text());
    }catch(error){res.writeHead(500);res.end(String(error));}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert(address&&typeof address==='object');origin=`http://127.0.0.1:${address.port}`;
  async function raw(user:string,path:string,body?:unknown){
    const response=await fetch(`${origin}/api/coop${path}`,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':user,Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json(),headers:response.headers};
  }
  function holdNextCommit(){
    assert.equal(pause,undefined);let release=()=>{},arrived=()=>{};
    const gate=new Promise<void>(r=>{release=r;}),waiting=new Promise<void>(r=>{arrived=r;});pause={arrived,gate};
    return {release,waiting};
  }
  function stored(id:string):CoopRoom{return JSON.parse(String(sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(id)!.body));}
  // Used only to represent pre-upgrade or corrupted durable records, never gameplay outcomes.
  function replaceStored(room:CoopRoom){sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(room),room.id);}
  return {raw,origin,stored,replaceStored,holdNextCommit,conflicts:()=>conflicts,time:()=>now,advance:(ms:number)=>{now+=ms;},stop:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));sqlite.close();}};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function expedition(f:Fixture,world:State,count=4){
  const created=await f.raw('host','/rooms',{name:'Host',world});assert.equal(created.status,201,JSON.stringify(created.body));
  const players:Player[]=[{user:'host',s:created.body}];
  for(let i=1;i<count;i++){const joined=await f.raw(`guest-${i}`,'/join',{name:`Guest ${i}`,code:created.body.code});assert.equal(joined.status,200,JSON.stringify(joined.body));players.push({user:`guest-${i}`,s:joined.body});}
  return players;
}
async function input(f:Fixture,p:Player,actions:CoopAction[]=[]){
  const result=await f.raw(p.user,`/rooms/${p.s.roomId}/sync`,{seq:p.s.ack+1,sessionId:p.s.sessionId,actions});
  assert.equal(result.status,200,JSON.stringify(result.body));p.s=result.body;return p.s;
}
function command(p:Player,input:CommandInput,revision=p.s.world.ecology!.revision):CoopAction{return {type:'ecology',command:{...input,expectedRevision:revision} as EcologyCommand};}
async function current(f:Fixture,p:Player){const result=await f.raw(p.user,`/rooms/${p.s.roomId}`);assert.equal(result.status,200);p.s=result.body;return p.s;}
function conserved(s:State){
  assert(validateSave(s));assert(validEcology(s.ecology,s.seed));const e=s.ecology!;
  assert.equal(ecologyWaterBalance(e),0);assert.equal(e.seeds+e.plots.filter(p=>p.crop).length+e.harvested,12);
  assert.equal(e.harvested*2,e.biomass+e.crafted*2);assert.equal(e.crafted,e.bioGel+e.used);
  assert.deepEqual(parseSave(serializeSave(s)),s);
}
/** Valid damaged solo saves are legitimate room inputs; all goods are earned by production reducers. */
function garden(water=2,hp=97.25){
  let world=createConnectedState(73129);
  for(const object of worldObjects(world).filter(o=>o.kind==='water').slice(0,water)){
    world=applyAction(world,{type:'move',x:object.x,z:object.z});world=applyAction(world,{type:'collect',id:object.id});
  }
  const plot=ecologyPlan(world.seed).plots[0]!;
  world=applyAction(world,{type:'move',x:plot.position.x,z:plot.position.z});world={...world,player:{...world.player,hp}};
  assert(validateSave(world));assert.equal(world.inventory.water,water);return world;
}
function ripeGarden(){
  let s=enableEcology(garden(0,40));const plot=ecologyPlan(s.seed).plots[0]!;
  s=applyAction(s,{type:'ecology',command:{type:'plant',plotId:plot.id,species:plot.habitat==='sunny'?'sunleaf':'reedmoss',expectedRevision:0}});
  for(let n=0;n<900&&ecologyStage(s.ecology!.plots[0]!.crop)!=='ripe';n++)s=applyAction(s,{type:'tick',dt:1});
  assert.equal(ecologyStage(s.ecology!.plots[0]!.crop),'ripe');conserved(s);return s;
}
function gelGarden(count=2){
  let s=ripeGarden();const plot=ecologyPlan(s.seed).plots[0]!;
  const act=(input:CommandInput)=>{s=applyAction(s,{type:'ecology',command:{...input,expectedRevision:s.ecology!.revision} as EcologyCommand});};
  for(let n=0;n<count;n++){
    if(n){act({type:'plant',plotId:plot.id,species:plot.habitat==='sunny'?'sunleaf':'reedmoss'});for(let t=0;t<900&&ecologyStage(s.ecology!.plots[0]!.crop)!=='ripe';t++)s=applyAction(s,{type:'tick',dt:1});}
    act({type:'harvest',plotId:plot.id});act({type:'craft-gel'});
  }
  assert.equal(s.ecology!.bioGel,count);s={...s,player:{...s.player,hp:97.25}};conserved(s);return s;
}

test('ecology HTTP allowlist accepts exactly five bounded command shapes and rejects authority injection',async()=>{
  const plotId=ecologyPlan(73129).plots[0]!.id;
  const accepted=[{type:'plant',plotId,species:'sunleaf',expectedRevision:0},{type:'plant',plotId,species:'reedmoss',expectedRevision:96},{type:'water',plotId,expectedRevision:0},{type:'harvest',plotId,expectedRevision:0},{type:'craft-gel',expectedRevision:0},{type:'use-gel',expectedRevision:0}];
  for(const c of accepted)assert.deepEqual(action({type:'ecology',command:c}),{type:'ecology',command:c});
  const rejected=[null,[],{},...[-1,.25,97,Number.MAX_SAFE_INTEGER,NaN,Infinity,'0',null,undefined].map(expectedRevision=>({type:'use-gel',expectedRevision})),
    {type:'reset',expectedRevision:0},{type:'plant',plotId,species:'__proto__',expectedRevision:0},{type:'plant',plotId,expectedRevision:0},
    {type:'water',expectedRevision:0},{type:'water',plotId:'',expectedRevision:0},{type:'water',plotId:'x'.repeat(181),expectedRevision:0},{type:'water',plotId:'bad\nplot',expectedRevision:0},
    {type:'water',plotId,expectedRevision:0,amount:4000},{type:'harvest',plotId,expectedRevision:0,biomass:999},
    {type:'craft-gel',expectedRevision:0,plotId},{type:'use-gel',expectedRevision:0,hpEffect:100},{type:'use-gel',expectedRevision:0,playerId:'other'},
    {type:'plant',plotId,species:'sunleaf',expectedRevision:0,growth:30}];
  const f=await fixture();try{
    const [host]=await expedition(f,garden(),1);assert(host);
    for(const c of rejected){assert.equal(action({type:'ecology',command:c}),null);const bad=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[{type:'ecology',command:c}]});assert.equal(bad.status,400);assert.equal(bad.body.error,'invalid_input');}
    for(const extra of [{hp:100},{inventory:{water:999}},{state:{bioGel:999}}])assert.equal(action({type:'ecology',command:accepted[0],...extra}),null);
    await current(f,host);assert.equal(host.s.ack,0);assert.equal(host.s.world.ecology!.revision,0);assert.equal(host.s.world.inventory.water,2);
  }finally{await f.stop();}
});

test('new and resumed generation-2 rooms initialize absent ecology without retroactive rewards or resetting saved progress',async()=>{
  const f=await fixture();try{
    const source=garden(),[host,guest]=await expedition(f,source,2);assert(host&&guest);const initial=copy(host.s.world.ecology!);
    assert.equal(source.ecology,undefined);assert.equal(initial.tick,0);assert.equal(initial.seeds,12);assert.equal(initial.bioGel,0);assert.deepEqual(initial.records,[]);
    const old=f.stored(host.s.roomId);delete old.world.ecology;f.replaceStored(old);f.advance(3600000);
    const resumed=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,200);host.s=resumed.body;
    assert.deepEqual(host.s.world.ecology,initial);assert.deepEqual(host.s.world.inventory,source.inventory);assert.deepEqual(host.s.world.generationManifest,source.generationManifest);
    const plotId=initial.plots[0]!.id;await input(f,host,[command(host,{type:'plant',plotId,species:'sunleaf'})]);
    const progress=copy(host.s.world.ecology);await f.raw(host.user,`/rooms/${host.s.roomId}/leave`,{sessionId:host.s.sessionId});f.advance(9000);
    const again=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(again.status,200);host.s=again.body;assert.deepEqual(host.s.world.ecology,progress);
    const guestResume=await f.raw(guest.user,`/rooms/${guest.s.roomId}/resume`,{});assert.equal(guestResume.status,200);assert.deepEqual(guestResume.body.world.ecology,progress);
    const stored=f.stored(host.s.roomId);assert.deepEqual(stored.world.ecology,progress);conserved(stored.world);
    const [legacy]=await expedition(f,createState(73129),1);assert(legacy);assert.equal(legacy.s.world.ecology,undefined);
    const legacyResume=await f.raw(legacy.user,`/rooms/${legacy.s.roomId}/resume`,{});assert.equal(legacyResume.status,200);assert.equal(legacyResume.body.world.ecology,undefined);
    assert.equal((await f.raw('outsider',`/rooms/${host.s.roomId}`)).status,404);assert.equal((await f.raw(guest.user,'/rooms')).body.rooms.length,0);
  }finally{await f.stop();}
});

test('old active rooms initialize before zero-time actions, while malformed present ecology is never replaced with rewards',async()=>{
  const f=await fixture();try{
    const [host]=await expedition(f,garden(),1);assert(host);const old=f.stored(host.s.roomId);delete old.world.ecology;f.replaceStored(old);
    const plotId=ecologyPlan(73129).plots[0]!.id;await input(f,host,[{type:'ecology',command:{type:'plant',plotId,species:'sunleaf',expectedRevision:0}}]);
    assert.equal(host.s.world.ecology!.tick,0);assert.equal(host.s.world.ecology!.seeds,11);assert.equal(host.s.world.ecology!.revision,1);
    const broken=f.stored(host.s.roomId);(broken.world as unknown as {ecology:unknown}).ecology=null;f.replaceStored(broken);
    const resumed=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,503);assert.deepEqual(f.stored(host.s.roomId),broken);
    const badWorld={...garden(),ecology:null};const created=await f.raw('new-host','/rooms',{name:'Invalid save',world:badWorld});assert.equal(created.status,400);assert.equal(created.body.error,'invalid_world');
  }finally{await f.stop();}
});

test('four HTTP players share finite planting, real water, growth, harvest and crafting; repair affects only its actor',async()=>{
  const f=await fixture();try{
    const source=garden(),before=serializeSave(source),players=await expedition(f,source),host=players[0]!,plot=ecologyPlan(source.seed).plots[0]!;
    const plant={type:'plant',plotId:plot.id,species:plot.habitat==='sunny'?'sunleaf':'reedmoss'} as const;
    await Promise.all(players.map(p=>input(f,p,[command(p,plant,0)])));await current(f,host);
    assert.equal(host.s.world.ecology!.seeds,11);assert.equal(host.s.world.ecology!.revision,1);assert.equal(host.s.world.ecology!.records.filter(r=>r.kind==='planted').length,1);
    f.advance(250);await Promise.all(players.map(p=>input(f,p)));for(const p of players){assert.equal(p.s.world.ecology!.tick,1);assert.equal(p.s.world.ecology!.revision,1);}
    await Promise.all(players.map(p=>input(f,p,[command(p,{type:'water',plotId:plot.id},1)])));await current(f,host);
    assert.equal(host.s.world.inventory.water,1);assert.equal(host.s.world.ecology!.canistersSpent,1);assert.equal(host.s.world.ecology!.water.irrigation,4000);
    f.advance(250);await input(f,host,[command(host,{type:'water',plotId:plot.id},1)]);
    assert.equal(host.s.world.ecology!.revision,2,'weather ticks must not change the accepted-command revision');assert.equal(host.s.world.inventory.water,1);
    await input(f,host,[command(host,{type:'water',plotId:plot.id},2)]);assert.equal(host.s.world.inventory.water,1,'insufficient soil capacity cannot consume a second canister');
    for(let n=0;n<900&&ecologyStage(host.s.world.ecology!.plots[0]!.crop)!=='ripe';n++){
      f.advance(1000);if(n%4===0)await Promise.all(players.map(p=>input(f,p)));else await input(f,host);
    }
    assert.equal(ecologyStage(host.s.world.ecology!.plots[0]!.crop),'ripe');assert.equal(host.s.world.ecology!.revision,2);assert.equal(host.s.world.ecology!.biomass,0);
    await Promise.all(players.map(p=>input(f,p,[command(p,{type:'harvest',plotId:plot.id},2)])));await current(f,host);
    assert.equal(host.s.world.ecology!.biomass,2);assert.equal(host.s.world.ecology!.harvested,1);assert.equal(host.s.world.ecology!.plots[0]!.crop,null);
    await Promise.all(players.map(p=>input(f,p,[command(p,{type:'craft-gel'},3)])));await current(f,host);
    assert.equal(host.s.world.ecology!.biomass,0);assert.equal(host.s.world.ecology!.bioGel,1);assert.equal(host.s.world.ecology!.crafted,1);
    const guest=players[2]!;await input(f,guest,[command(guest,{type:'use-gel'},4)]);assert.equal(guest.s.world.player.hp,100);
    await Promise.all(players.map(p=>current(f,p)));
    for(const p of players){assert.equal(p.s.world.player.hp,p===guest?100:97.25);assert.deepEqual(p.s.world.ecology,guest.s.world.ecology);assert.deepEqual(p.s.world.inventory,guest.s.world.inventory);conserved(p.s.world);}
    assert.equal(guest.s.world.ecology!.restoredHP,2.75);assert.equal(guest.s.world.ecology!.used,1);assert.equal(guest.s.world.ecology!.bioGel,0);
    const stored=f.stored(host.s.roomId);assert.equal(stored.world.player.hp,97.25);assert.equal(stored.players.find(p=>p.id===guest.s.selfId)!.player.hp,100);
    await input(f,players[1]!,[command(players[1]!,{type:'use-gel'},4)]);assert.equal(players[1]!.s.world.player.hp,97.25);assert.equal(players[1]!.s.world.ecology!.used,1);
    assert.equal(serializeSave(source),before,'hosting does not mutate the source solo save');
    const saved=copy(host.s.world.ecology);await f.raw(host.user,`/rooms/${host.s.roomId}/leave`,{sessionId:host.s.sessionId});f.advance(100000);
    await input(f,guest,[command(guest,plant,5)]);assert(guest.s.paused);assert.deepEqual(guest.s.world.ecology,saved);
    const resumed=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,200);host.s=resumed.body;assert.deepEqual(host.s.world.ecology,saved);
    f.advance(250);await input(f,host);assert.equal(host.s.world.ecology!.tick,saved!.tick+1);assert.equal(host.s.world.ecology!.revision,5);
  }finally{await f.stop();}
});

async function conflict(f:Fixture,older:Player,newer:Player,c:CommandInput){
  await current(f,newer);const revision=newer.s.world.ecology!.revision,blocked=f.holdNextCommit(),before=f.conflicts();
  f.advance(100);const old=input(f,older,[command(older,c,revision)]);await blocked.waiting;
  try{f.advance(150);await input(f,newer,[command(newer,c,revision)]);}finally{blocked.release();}
  await old;assert.equal(f.conflicts(),before+1);assert.equal(older.s.serverTime,newer.s.serverTime);assert.deepEqual(older.s.world.ecology,newer.s.world.ecology);return newer.s;
}

test('two real HTTP clients forced through SQLite CAS spend one water canister and never rewind the ecology clock',async()=>{
  const f=await fixture();try{
    const [host,guest]=await expedition(f,garden(),2);assert(host&&guest);const plotId=host.s.world.ecology!.plots[0]!.id;
    await conflict(f,guest,host,{type:'water',plotId});
    assert.equal(host.s.world.inventory.water,1);assert.equal(guest.s.world.inventory.water,1);assert.equal(host.s.world.ecology!.canistersSpent,1);assert.equal(host.s.world.ecology!.water.irrigation,4000);assert.equal(host.s.world.ecology!.tick,1);assert.equal(host.s.world.ecology!.revision,1);
    assert.equal(f.stored(host.s.roomId).lastTick,f.time());conserved(host.s.world);
    const replay=await f.raw(guest.user,`/rooms/${guest.s.roomId}/sync`,{seq:guest.s.ack,sessionId:guest.s.sessionId,actions:[command(guest,{type:'water',plotId},0)]});assert.equal(replay.status,200);assert.deepEqual(replay.body.world.ecology,guest.s.world.ecology);assert.equal(replay.body.world.inventory.water,1);
  }finally{await f.stop();}
});

test('two-client CAS retries recheck shared harvest, crafting and actor HP rather than applying a losing transition',async()=>{
  const f=await fixture();try{
    const [host,guest]=await expedition(f,ripeGarden(),2);assert(host&&guest);const plotId=host.s.world.ecology!.plots[0]!.id;
    await conflict(f,guest,host,{type:'harvest',plotId});assert.equal(host.s.world.ecology!.biomass,2);assert.equal(host.s.world.ecology!.harvested,1);
    await conflict(f,host,guest,{type:'craft-gel'});assert.equal(guest.s.world.ecology!.biomass,0);assert.equal(guest.s.world.ecology!.bioGel,1);assert.equal(guest.s.world.ecology!.crafted,1);
    await conflict(f,guest,host,{type:'use-gel'});assert.equal(host.s.world.player.hp,60);assert.equal(guest.s.world.player.hp,40);
    assert.equal(host.s.world.ecology!.used,1);assert.equal(host.s.world.ecology!.restoredHP,20);assert.equal(host.s.world.ecology!.bioGel,0);
    const stored=f.stored(host.s.roomId);assert.equal(stored.world.player.hp,60);assert.equal(stored.players.find(p=>p.id===guest.s.selfId)!.player.hp,40);conserved(stored.world);
    await input(f,guest,[command(guest,{type:'use-gel'})]);assert.equal(guest.s.world.player.hp,40);assert.equal(guest.s.world.ecology!.used,1);
  }finally{await f.stop();}
});

test('a full-health guest cannot consume the remaining shared gel or repair another player',async()=>{
  const f=await fixture();try{
    const [host,guest]=await expedition(f,gelGarden(),2);assert(host&&guest);const start=guest.s.world.ecology!.revision;
    await input(f,guest,[command(guest,{type:'use-gel'})]);assert.equal(guest.s.world.player.hp,100);assert.equal(guest.s.world.ecology!.bioGel,1);
    await input(f,guest,[command(guest,{type:'use-gel'})]);assert.equal(guest.s.world.ecology!.revision,start+1);assert.equal(guest.s.world.ecology!.bioGel,1);assert.equal(guest.s.world.ecology!.used,1);
    await current(f,host);assert.equal(host.s.world.player.hp,97.25);await input(f,host,[command(host,{type:'use-gel'})]);
    assert.equal(host.s.world.player.hp,100);assert.equal(host.s.world.ecology!.bioGel,0);assert.equal(host.s.world.ecology!.used,2);assert.equal(host.s.world.ecology!.restoredHP,5.5);conserved(host.s.world);
  }finally{await f.stop();}
});

test('authoritative bed reach and valley-only production are enforced while carried gel works underground',async()=>{
  const f=await fixture();try{
    const [host,guest]=await expedition(f,garden(),2);assert(host&&guest);const far=ecologyPlan(73129).plots[1]!;
    assert(Math.hypot(host.s.world.player.x-far.position.x,host.s.world.player.z-far.position.z)>3.5);
    await input(f,guest,[command(guest,{type:'plant',plotId:far.id,species:'sunleaf'})]);assert.equal(guest.s.world.ecology!.seeds,12);assert.equal(guest.s.world.ecology!.revision,0);
    let source=gelGarden(1);source=applyAction(source,{type:'move',...worldEndpoints(source).entrance});source=applyAction(source,{type:'enter-cave'});assert.equal(source.zone,'cave');conserved(source);
    const [underground,other]=await expedition(f,source,2);assert(underground&&other);const before=copy(other.s.world.ecology);
    for(const c of [{type:'plant',plotId:before!.plots[0]!.id,species:'sunleaf'},{type:'water',plotId:before!.plots[0]!.id},{type:'craft-gel'}] as CommandInput[])await input(f,other,[command(other,c)]);
    assert.deepEqual(other.s.world.ecology,before);await input(f,other,[command(other,{type:'use-gel'})]);assert.equal(other.s.world.zone,'cave');assert.equal(other.s.world.player.hp,100);
    await current(f,underground);assert.equal(underground.s.world.player.hp,97.25);assert.equal(underground.s.world.ecology!.used,1);assert.equal(underground.s.world.ecology!.restoredHP,2.75);conserved(underground.s.world);
  }finally{await f.stop();}
});

test('lost successful ecology response is retried byte-for-byte by the browser transport without a second payment',async()=>{
  const f=await fixture();let client:CoopClient|undefined;
  try{
    const requests:string[]=[];let lost=false;const fetcher:typeof fetch=async(url,init)=>{
      const response=await fetch(url,{...init,headers:{...init?.headers,'oai-authenticated-user-id':'host',Origin:f.origin}});
      if(String(url).endsWith('/sync')&&JSON.parse(String(init?.body)).actions.some((a:{type:string})=>a.type==='ecology')){
        requests.push(String(init?.body));if(!lost&&response.ok){lost=true;throw new Error('Response lost after the actual SQLite commit');}
      }
      return response;
    };
    client=new CoopClient({baseURL:f.origin,fetch:fetcher,onSnapshot:()=>{}});await client.create({name:'Host',world:garden(1)});
    const joined=await f.raw('guest','/join',{name:'Guest',code:client.snapshot!.code});assert.equal(joined.status,200);
    const plotId=client.snapshot!.world.ecology!.plots[0]!.id;assert(client.send({type:'ecology',command:{type:'water',plotId,expectedRevision:0}}));
    const deadline=Date.now()+5000;while(client.snapshot?.world.ecology?.canistersSpent!==1&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
    assert(lost);assert.equal(requests.length,2);assert.equal(requests[0],requests[1]);assert(client.canAct);assert.equal(client.snapshot!.world.inventory.water,0);assert.equal(client.snapshot!.world.ecology!.canistersSpent,1);
    const observer=await f.raw('guest',`/rooms/${client.snapshot!.roomId}`);assert.equal(observer.status,200);assert.deepEqual(observer.body.world.ecology,client.snapshot!.world.ecology);assert.equal(observer.body.world.inventory.water,0);conserved(observer.body.world);
  }finally{client?.disconnect();await f.stop();}
});
