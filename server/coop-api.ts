import {immutableTownSupply} from '../src/town-supply.ts';
import {immutableRestorationCare} from '../src/restoration-care.ts';
import {immutableWorkshopConstruction} from '../src/workshop-construction.ts';
import {immutableRestoration} from '../src/restoration.ts';
import {worldRestorationPlan,worldTownSupplySources} from '../src/world.ts';
import {immutableTownDirector} from '../src/town-director.ts';
import {immutableTownLife} from '../src/town-life.ts';
import {immutableRegionalFood} from '../src/regional-food.ts';
import {immutableRegionalTrade} from '../src/regional-trade.ts';
import {immutableWildernessState} from '../src/wilderness-state.ts';
import {immutableRegionalSupply} from '../src/regional-supply.ts';
import {createConnectedState,parseSave,validateSave,type State} from '../src/world.ts';
import {COOP_POLL_MS,type CoopSavedRoom} from '../src/coop-protocol.ts';
import {CoopStore,type D1Database,type RoomRecord} from './coop-store.ts';
import {CoopError,createRoom,inviteCode,INVITE_LIFETIME_MS,joinRoom,member,interruptRoomGuards,interruptEquipmentCommitment,roomTime,snapshot,syncRoom,type CoopRoom} from './coop-authority.ts';
import {record,name,seed,sync} from './coop-validation.ts';

export interface CoopEnv {DB?:D1Database}
const PREFIX='/api/coop';
const MAX_BODY=196608;
const MAX_WORLD_BODY=12_000_000;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
async function readBody(request:Request,maxBody=MAX_BODY):Promise<unknown>{
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new CoopError(415,'json_required','Use JSON for co-op requests');
  if(Number(request.headers.get('content-length'))>maxBody)throw new CoopError(413,'request_too_large','This co-op request is too large');
  const reader=request.body?.getReader();if(!reader)throw new CoopError(400,'invalid_request','A request body is required');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const result=await reader.read();if(result.done)break;size+=result.value.byteLength;if(size>maxBody){await reader.cancel();throw new CoopError(413,'request_too_large','This co-op request is too large');}chunks.push(result.value);}}
  finally{reader.releaseLock();}
  const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
  let value:unknown;try{value=JSON.parse(new TextDecoder().decode(data));}catch{throw new CoopError(400,'invalid_json','The co-op request is not valid JSON');}
  // Only an explicitly regional world import may use the larger finite-ledger
  // envelope. Ordinary names, commands and legacy saves retain their old cap.
  if(size>MAX_BODY&&(!record(value)||!record(value.world)||!record(value.world.regional)||value.world.regional.version!==1))throw new CoopError(413,'request_too_large','This co-op request is too large');
  return value;
}
const LEDGER_CACHE_LIMIT=4;
// Retain only finite immutable resource ledgers, never rooms, membership, session
// leases, poses or permissions. Decoded storage contents are compared on every
// read before reuse; even a cached room must pass the ordinary authorization path.
const certifiedRoomLedgers=new Map<string,{identity:string;ledger:NonNullable<State['wilderness']>}>();
const ledgerIdentity=(world:State)=>`${world.generation}:${world.seed}:${world.regional?.version??0}`;
function certifyRoomLedger(room:CoopRoom){
 if(!Object.hasOwn(room.world,'wilderness')){certifiedRoomLedgers.delete(room.id);return;}
 const identity=ledgerIdentity(room.world),cached=certifiedRoomLedgers.get(room.id),previous=cached?.identity===identity?cached.ledger:undefined;
 const ledger=immutableWildernessState(room.world.wilderness,room.world,previous);
 room.world={...room.world,wilderness:ledger};
 certifiedRoomLedgers.delete(room.id);certifiedRoomLedgers.set(room.id,{identity,ledger});
 while(certifiedRoomLedgers.size>LEDGER_CACHE_LIMIT)certifiedRoomLedgers.delete(certifiedRoomLedgers.keys().next().value!);
}
/** Numerical diagnostics only: no room IDs, membership or resource contents. */
export function coopLedgerCacheStats(){return {rooms:certifiedRoomLedgers.size,maxRooms:LEDGER_CACHE_LIMIT,harvestedIds:[...certifiedRoomLedgers.values()].reduce((n,item)=>n+item.ledger.harvested.length,0)};}
function decode(row:RoomRecord):CoopRoom{
  const r:unknown=JSON.parse(row.body);
  if(!record(r)||r.schema!==1||r.id!==row.id||r.revision!==row.revision||!record(r.world)||!Array.isArray(r.players)||r.players.length<1||r.players.length>4)throw new Error('Invalid stored co-op room');
  const room=r as unknown as CoopRoom;
  certifyRoomLedger(room);
  // Certify in dependency order. Present malformed data is never laundered by
  // an absent-pack upgrade, resume or CAS retry. Food cannot trust a standalone
  // valid-looking ledger while its external collector/store owners are forged.
  if(['frontierTrade','frontierSupply','frontierFood','town','townLife','townDirector','restoration','workshopConstruction','restorationCare','townSupply'].some(key=>Object.hasOwn(room.world,key))){
    let world=room.world;
    if(Object.hasOwn(world,'workshopConstruction'))world={...world,workshopConstruction:immutableWorkshopConstruction(world.workshopConstruction,world.seed)};
            if(Object.hasOwn(world,'restoration'))world={...world,restoration:immutableRestoration(world.restoration,worldRestorationPlan(world.seed))};
        if(Object.hasOwn(world,'townLife'))world={...world,townLife:immutableTownLife(world.townLife,world.seed)};
    if(Object.hasOwn(world,'townSupply'))world={...world,townSupply:immutableTownSupply(world.townSupply,worldTownSupplySources(world),world.collected,world.townLife!)};
    if(Object.hasOwn(world,'restorationCare'))world={...world,restorationCare:immutableRestorationCare(world.restorationCare,world.restoration!,world.townLife!)};
        if(Object.hasOwn(world,'townDirector'))world={...world,townDirector:immutableTownDirector(world.townDirector,world.townLife!)};
    if(Object.hasOwn(world,'frontierTrade'))world={...world,frontierTrade:immutableRegionalTrade(world.frontierTrade,world)};
    if(Object.hasOwn(world,'frontierSupply'))world={...world,frontierSupply:immutableRegionalSupply(world.frontierSupply,world)};
    if(Object.hasOwn(world,'frontierFood'))world={...world,frontierFood:immutableRegionalFood(world.frontierFood,world)};
    if(!validateSave(world))throw new Error('Invalid stored regional world');
    room.world=world;
  }
  return room;
}
function encode(room:CoopRoom):RoomRecord{return {id:room.id,owner_id:room.ownerId,invite_code:room.code,revision:room.revision,updated_at:room.updatedAt,body:JSON.stringify(room)};}
async function change<T>(store:CoopStore,id:string,clock:()=>number,transform:(room:CoopRoom,now:number)=>T):Promise<{room:CoopRoom;result:T}>{
  for(let attempt=0;attempt<12;attempt++){
    const row=await store.get(id);if(!row)throw new CoopError(404,'room_not_found','This co-op room is not available');
    const room=decode(row),now=roomTime(room,Math.max(clock(),row.updated_at)),result=transform(room,now);
    room.revision++;room.updatedAt=now;
    if(!validateSave(room.world))throw new Error('Co-op authority produced an invalid save');
    if(await store.compareAndSwap(encode(room),row.revision)){certifyRoomLedger(room);return {room,result};}
  }
  throw new CoopError(503,'room_busy','The room is busy. Your request can be safely retried');
}
/** All mutations use platform identity, same-origin JSON, request limits, and D1 CAS. */
export async function handleCoop(request:Request,env:CoopEnv,now?:number):Promise<Response|null>{
  // Read production time inside each CAS attempt; the optional fixed clock is for deterministic tests.
  const clock=()=>now??Date.now();
  const url=new URL(request.url);if(!url.pathname.startsWith(`${PREFIX}/`))return null;
  try{
    const user=request.headers.get('oai-authenticated-user-id');
    if(url.pathname===`${PREFIX}/status`&&request.method==='GET')return json({available:!!env.DB,authenticated:!!user,protocol:1,transport:'http-polling',pollMs:COOP_POLL_MS,maximumPlayers:4,message:!env.DB?'Online co-op needs the hosted room service':!user?'Sign in with ChatGPT to use online co-op':'Online room service ready. Friends must also have access to this Site'});
    if(!user||user.length>256)throw new CoopError(401,'sign_in_required','Sign in with ChatGPT to use online co-op');
    if(!env.DB)throw new CoopError(503,'service_unavailable','The online room service is not available in this build');
    const store=new CoopStore(env.DB);
    if(request.method==='POST'){
      if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')throw new CoopError(403,'origin_rejected','Co-op requests must come from this Site');
      if(!await store.allowRequest(user,clock()))throw new CoopError(429,'rate_limited','Too many co-op requests. Wait a moment and try again');
    }else if(request.method!=='GET')throw new CoopError(405,'method_not_allowed','This method is not supported');
    if(url.pathname===`${PREFIX}/rooms`&&request.method==='GET'){
      const rooms:CoopSavedRoom[]=(await store.owned(user)).map(row=>{const room=decode(row);return {id:room.id,name:room.name,seed:room.world.seed,updatedAt:room.updatedAt,closed:room.closed,players:room.players.length};});return json({rooms});
    }
    if(url.pathname===`${PREFIX}/rooms`&&request.method==='POST'){
      const body=await readBody(request,MAX_WORLD_BODY);if(!record(body)||Object.keys(body).some(k=>!['name','world','seed'].includes(k))||!name(body.name))throw new CoopError(400,'invalid_request','Choose a player name');
      let world=body.world===undefined?(seed(body.seed)?createConnectedState(body.seed):null):parseSave(JSON.stringify(body.world));
      if(!world)throw new CoopError(400,'invalid_world','Choose a valid world to copy into a separate co-op save');
      if(world.player.hp<=0){const spawn=worldEndpointsSafe(world);world={...world,zone:'valley',player:{...spawn,hp:100}};}
      const room=createRoom(user,name(body.name),world,clock());
      if(!await store.create(encode(room)))throw new CoopError(409,'save_limit','This account already has twenty co-op saves. Resume an existing room');
      certifyRoomLedger(room);return json(snapshot(room,user,clock()),201);
    }
    if(url.pathname===`${PREFIX}/join`&&request.method==='POST'){
      const body=await readBody(request);
      if(!record(body)||Object.keys(body).some(k=>!['name','code'].includes(k))||!name(body.name)||typeof body.code!=='string')throw new CoopError(400,'invalid_request','Enter your name and the host’s invite code');
      const code=body.code.toUpperCase().replace(/[\s-]/g,'');if(!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/.test(code))throw new CoopError(404,'invite_not_found','That invite code was not found');
      const row=await store.byCode(code);if(!row)throw new CoopError(404,'invite_not_found','That invite code was not found');
      const changed=await change(store,row.id,clock,(room,time)=>{if(room.code!==code)throw new CoopError(410,'invite_expired','This invitation has expired');joinRoom(room,user,name(body.name),time);});
      return json(snapshot(changed.room,user,clock()));
    }
    const route=new RegExp(`^${PREFIX}/rooms/([a-f0-9-]{36})(?:/(sync|leave|close|resume))?$`).exec(url.pathname);
    if(!route)throw new CoopError(404,'not_found','This co-op route does not exist');
    const id=route[1]!,operation=route[2];
    if(!operation&&request.method==='GET'){
      const row=await store.get(id);if(!row)throw new CoopError(404,'room_not_found','This co-op room is not available');return json(snapshot(decode(row),user,clock()));
    }
    if(request.method!=='POST')throw new CoopError(405,'method_not_allowed','This action needs a POST request');
    const body=await readBody(request);
    if(operation==='sync'){
      const input=sync(body);if(!input)throw new CoopError(400,'invalid_input','The server rejected an invalid co-op input');
      const changed=await change(store,id,clock,(room,time)=>syncRoom(room,user,input,time));return json(snapshot(changed.room,user,clock(),changed.result));
    }
    if(!record(body)||Object.keys(body).some(k=>operation==='resume'?k!=='name':k!=='sessionId')||operation!=='resume'&&(typeof body.sessionId!=='string'||body.sessionId.length>180))throw new CoopError(400,'invalid_request','The room request is invalid');
    const changed=await change(store,id,clock,(room,time)=>{
      const p=member(room,user);
      if((operation==='leave'||operation==='close')&&body.sessionId!==p.sessionId)throw new CoopError(409,'session_replaced','This player rejoined from another tab or device. Rejoin here to take control');
      if(operation==='leave'){p.active=false;p.lastSeen=time;interruptEquipmentCommitment(p);if(p.id===room.hostId){interruptRoomGuards(room);room.lastTick=time;}return;}
      if(operation==='close'){if(room.ownerId!==user)throw new CoopError(403,'host_only','Only the host can manage this co-op save');room.closed=true;p.lastSeen=time;for(const player of room.players){player.active=false;interruptEquipmentCommitment(player);}room.lastTick=time;return;}
      if(operation==='resume'){
        // Existing members can reclaim their own browser lease after bootstrap/reload.
        // Only the owner may reopen a closed/expired saved room or replace its invite.
        if(room.ownerId!==user){joinRoom(room,user,name(body.name)||p.name,time);return;}
        if(room.closed||room.inviteExpiresAt<=time){room.code=inviteCode();room.inviteExpiresAt=time+INVITE_LIFETIME_MS;}
        room.closed=false;joinRoom(room,user,name(body.name)||p.name,time);return;
      }
      throw new CoopError(404,'not_found','This co-op route does not exist');
    });return json(snapshot(changed.room,user,clock()));
  }catch(error){
    if(error instanceof CoopError)return json({error:error.code,message:error.message},error.status);
    // Never expose SQL, user IDs, body data, or server exceptions to another member.
    console.error('AXIOM co-op request failed',error instanceof Error?error.name:'unknown');
    return json({error:'service_unavailable',message:'The room service could not save that request. Your last confirmed progress is retained'},503);
  }
}
import {worldEndpoints} from '../src/world.ts';
function worldEndpointsSafe(world:Parameters<typeof worldEndpoints>[0]){return worldEndpoints(world).spawn;}
