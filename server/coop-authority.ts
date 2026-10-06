import {restorationCarePosition} from '../src/restoration-care.ts';
import {workshopConstructionBoxes,workshopConstructionPosition} from '../src/workshop-construction.ts';
import {restorationBodyObstacle} from '../src/restoration-collision.ts';
import {restorationCommandPosition,restorationMachinePosition} from '../src/restoration.ts';
import {enableRestoration,worldRestorationPlan} from '../src/world.ts';
import {townDirectorInteractionPosition} from '../src/town-director.ts';
import {townLifePoses,townLifeInteractionTarget} from '../src/town-life-runtime.ts';
import {TownCrowd,slideTownCrowd,townClock} from '../src/town-crowd.ts';
import {regionalTownCleared,legacyRegionalHeight} from '../src/regional-world.ts';
import {TOWN_OFFERS,TOWN_LAYOUT_VERSION,TOWN_CENTER,TOWN_BOUNDS,startingTown,safeTownPosition} from '../src/starting-town.ts';
import {enableStartingTown,commitTownLife,commitRestorationCare} from '../src/world.ts';
import {regionalFoodCommandPosition} from '../src/regional-food.ts';
import {regionalTradeObstacles,regionalTradeConstructionBoxes,regionalTradeCommandPosition} from '../src/regional-trade.ts';
import {regionalSupplyObstacles,regionalSupplyConstructionBoxes,regionalSupplyPlan} from '../src/regional-supply.ts';
import {traversalBodies} from '../src/traversal-world.ts';
import {regionalCenterBound} from '../src/regional-bounds.ts';
import {resolveWildernessStrikes} from '../src/wilderness-combat.ts';
import {wildernessObstaclesNear} from '../src/wilderness.ts';
import {applyAction,commitWildernessGather,commitRegionalFood,machineWorldObstacles,worldBound,worldEndpoints,enableEncounters,enableEconomy,enableEcology,enableCaveSupply,enableCommonsTrade,enableWaterRequests,enableRegionalSupply,enableRegionalTrade,enableRegionalFood,encounterObjects,commitEncounterHit,type State} from '../src/world.ts';
import {COOP_VERTICAL,createVertical,validVertical,publicMotion,requestJump,setCrouch,stepVertical,moveVertical,supportBelow,type VerticalState,type MotionGeometry} from './coop-vertical.ts';
import {actorPathClear,COOP_BODY} from './coop-movement.ts';
import {advanceEncounters} from '../src/encounters.ts';
import {naturalCave} from '../src/natural-cave.ts';
import {caveFloodObstacles,safeCavePosition} from '../src/cave-water.ts';
import {worldDungeon,worldHeight,worldValley,worldWorkshop} from '../src/generation.ts';
import {clearPulsePath,cancelCombo,retireComboCommitment,createComboState,requestComboAttack,stepCombo,type ComboSnapshot,type ComboState,type CombatObstacle} from '../src/combat.ts';
import {createGuardState,validGuardState,guardBusy,requestGuard,stepGuard,interruptGuard,type GuardState,type GuardContext,type GuardInterruptReason} from '../src/guard.ts';
import {resolveGuardDamage,SENTRY_HIT_STUN_SECONDS} from '../src/guard-resolution.ts';
import {equipmentCombat} from '../src/equipment-combat.ts';
import {equipmentFor,canSwapEquipment} from '../src/equipment.ts';
import type {CoopMove,CoopSnapshot,CoopSync} from '../src/coop-protocol.ts';

export const HOST_TIMEOUT_MS=8000;
export const PLAYER_TIMEOUT_MS=8000;
export const REJOIN_GRACE_MS=60000;
export const INVITE_LIFETIME_MS=24*60*60*1000;
export interface RoomPlayer {
  id:string;userId:string;sessionId:string;name:string;slot:number;active:boolean;lastSeen:number;lastMove:number;
  seq:number;wildernessCollisionVersion?:1;townCollisionVersion?:1|2;zone:State['zone'];player:State['player'];pose:CoopMove;combo:ComboState;motion?:VerticalState;guard?:GuardState;
}
export interface CoopRoom {
  schema:1;id:string;ownerId:string;hostId:string;code:string;name:string;
  revision:number;createdAt:number;updatedAt:number;lastTick:number;inviteExpiresAt:number;
  closed:boolean;world:State;players:RoomPlayer[];enemyHP:Record<string,number>;
}
export class CoopError extends Error {status:number;code:string;constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}}
export function inviteCode(){
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // 16 symbols × 5 bits = 80 bits. No room names or sequential IDs are exposed.
  return Array.from(bytes,v=>alphabet[v&31]).join('');
}
/** A later committed transaction is the time floor for every subsequent transition. */
export function roomTime(room:CoopRoom,now:number){return Math.max(now,room.createdAt,room.updatedAt,room.lastTick,...room.players.flatMap(p=>[p.lastSeen,p.lastMove]));}
export function hostConnected(room:CoopRoom,now:number){now=roomTime(room,now);const host=room.players.find(p=>p.id===room.hostId);return !!host?.active&&now-host.lastSeen<=HOST_TIMEOUT_MS&&!room.closed;}
export function playerWorld(room:CoopRoom,player:RoomPlayer):State{return {...room.world,zone:player.zone,player:{...player.player}};}
/** The terrain still spans ±worldBound. Only regional capsule centers reserve
 * their radius plus skin inside that plane; old worlds keep their exact limits. */
function playerCenterBound(world:State){const bound=worldBound(world);return world.regional&&world.zone==='valley'?regionalCenterBound(bound):bound;}
function boundedRegionalPosition(world:State,point:State['player']):State['player']{
 if(!world.regional||world.zone!=='valley')return point;
 const terrainBound=worldBound(world),bound=playerCenterBound(world);
 if(![point.x,point.z].every(Number.isFinite)||Math.abs(point.x)>terrainBound||Math.abs(point.z)>terrainBound)throw new CoopError(409,'invalid_regional_pose','The saved regional player position is outside the world');
 const x=Math.max(-bound,Math.min(bound,point.x)),z=Math.max(-bound,Math.min(bound,point.z));
 return x===point.x&&z===point.z?point:{...point,x,z};
}
export function playerMotion(room:CoopRoom,p:RoomPlayer):VerticalState{
 // This runs before every accepted motion/snapshot, even for actors that already
 // completed the older wilderness migration. Stored poses may legally predate
 // the new capsule margin while remaining inside the unchanged terrain extent.
 const position=boundedRegionalPosition(playerWorld(room,p),p.player),moved=position!==p.player;
 if(moved){p.player=position;delete p.wildernessCollisionVersion;}
 if(!validVertical(p.motion)){delete p.wildernessCollisionVersion;const s=playerWorld(room,p);p.motion=createVertical(worldHeight(s,p.player.x,p.player.z));setCrouch(p.motion,p.player.x,p.player.z,false,motionGeometry(s));}
 else if(moved&&p.motion.grounded){const g=motionGeometry(playerWorld(room,p));p.motion.feetY=supportBelow(p.player.x,p.player.z,p.motion.feetY+.35,g);}
 // A real jump/fall keeps its accepted elevation, velocity, clocks and counters.
 recoverWildernessOverlap(room,p);
 if(moved){projectMotion(p,p.motion!);if(p.id===room.hostId)room.world={...room.world,zone:p.zone,player:{...p.player}};}
 return p.motion!;
}
/** One-time lazy room upgrade for actors saved inside former decoration. Client poses never choose the recovery. */
function recoverWildernessOverlap(room:CoopRoom,p:RoomPlayer){
  if(room.world.regional&&p.zone==='valley'&&p.townCollisionVersion!==TOWN_LAYOUT_VERSION){
    const old=p.player,safe=safeTownPosition(room.world.seed,old);p.player={...old,...safe};
    if((p.motion!.grounded&&regionalTownCleared(room.world.seed,old.x,old.z)&&Math.abs(p.motion!.feetY-legacyRegionalHeight(room.world.seed,old.x,old.z))<.5)||safe.x!==old.x||safe.z!==old.z)p.motion={...p.motion!,feetY:worldHeight(playerWorld(room,p),safe.x,safe.z),vy:0,grounded:true};
    delete p.wildernessCollisionVersion;p.townCollisionVersion=TOWN_LAYOUT_VERSION;projectMotion(p,p.motion!);
  }
  if(p.wildernessCollisionVersion===1)return;
  const s=playerWorld(room,p),m=p.motion!;
  if(p.zone!=='valley'){p.wildernessCollisionVersion=1;return;}
  const start={x:p.player.x,y:m.feetY,z:p.player.z};
  const restoredSolids=[...wildernessObstaclesNear(s,s.player.x,s.player.z,s.wilderness),...(s.regional&&s.frontierSupply?regionalSupplyObstacles(s.seed,s.frontierSupply):[]),...(s.regional&&s.frontierTrade?regionalTradeObstacles(s.seed,s.frontierTrade):[])];
  if(actorPathClear(start,start,restoredSolids,m.crouched)){p.wildernessCollisionVersion=1;return;}
  const g=motionGeometry(s),bound=s.regional&&s.zone==='valley'?playerCenterBound(s):worldBound(s)-COOP_BODY.radius;
  if(!m.crouched&&actorPathClear(start,start,g.obstacles,true)){m.crouched=true;p.wildernessCollisionVersion=1;projectMotion(p,m);return;}
  // Match the local worker's deterministic .25m rings / 32 headings / 12m bound.
  for(let radius=.25;radius<=12;radius+=.25)for(let i=0;i<32;i++){
    const angle=i*Math.PI/16,x=start.x+Math.cos(angle)*radius,z=start.z+Math.sin(angle)*radius;
    if(Math.abs(x)>=bound||Math.abs(z)>=bound)continue;
    const feet={x,y:g.height(x,z),z};
    if(!actorPathClear(feet,feet,g.obstacles,m.crouched))continue;
    p.player={...p.player,x,z};p.motion={...m,feetY:feet.y,vy:0,grounded:true,coyote:COOP_VERTICAL.coyoteTime,buffer:0,jumpStatus:m.jumpStatus==='queued'?'rejected':m.jumpStatus};
    p.wildernessCollisionVersion=1;projectMotion(p,p.motion);return;
  }
  throw new CoopError(409,'spawn_blocked','No clear ground was found beside the saved wilderness solid');
}
function projectMotion(p:RoomPlayer,m:VerticalState){p.pose={...p.pose,x:p.player.x,z:p.player.z,y:m.feetY,grounded:m.grounded,crouched:m.crouched};}
function resetMotion(room:CoopRoom,p:RoomPlayer){
  const old=playerMotion(room,p);p.motion={...createVertical(worldHeight(playerWorld(room,p),p.player.x,p.player.z)),jumpId:old.jumpId,landingId:old.landingId,lastJumpIntent:old.lastJumpIntent,jumpStatus:old.jumpStatus==='queued'?'rejected':old.jumpStatus};
  // Zone exits, recall and other trusted placements can intersect a pinned old-world decoration.
  // Recheck the destination even when this actor already passed the one-time room migration.
  delete p.wildernessCollisionVersion;recoverWildernessOverlap(room,p);projectMotion(p,p.motion);
}
export function playerGuard(p:RoomPlayer):GuardState{
  if(p.guard===undefined)p.guard=createGuardState();
  if(!validGuardState(p.guard))throw new Error('Invalid stored guard state');
  return p.guard;
}
/** Retire a stale/session-replaced weapon without refunding any personal commitment. */
export function interruptEquipmentCommitment(p:RoomPlayer,reason:GuardInterruptReason='session'){
 p.combo=retireComboCommitment(p.combo);
 p.guard=interruptGuard(playerGuard(p),reason).state;
}
function retireAbsentEquipment(room:CoopRoom,now:number){for(const p of room.players)if(!p.active||now-p.lastSeen>PLAYER_TIMEOUT_MS)interruptEquipmentCommitment(p);}
/** The host's session is the room clock lease. Losing/replacing it clears every active field immediately. */
export function interruptRoomGuards(room:CoopRoom){for(const p of room.players)p.guard=interruptGuard(playerGuard(p),'pause').state;}
export function guardContext(room:CoopRoom,p:RoomPlayer,obstacles?:readonly CombatObstacle[]):GuardContext{
  const m=playerMotion(room,p);return {player:{...p.player,y:m.feetY,facing:p.pose.facing,grounded:m.grounded,crouched:m.crouched},playing:true,obstacles:obstacles??roomObstacles(playerWorld(room,p))};
}
export function makePlayer(userId:string,name:string,slot:number,world:State,now:number):RoomPlayer{
  const p={...boundedRegionalPosition(world,world.player)},y=worldHeight(world,p.x,p.z);
  return {id:crypto.randomUUID(),userId,sessionId:crypto.randomUUID(),name,slot,active:true,lastSeen:now,lastMove:now,seq:0,zone:world.zone,player:p,pose:{x:p.x,z:p.z,y,facing:0,grounded:true,crouched:false},motion:createVertical(y),combo:createComboState(),guard:createGuardState()};
}
export function createRoom(userId:string,name:string,world:State,now:number):CoopRoom{
  world=enableRegionalFood(enableRegionalTrade(enableRegionalSupply(enableWaterRequests(enableCommonsTrade(enableCaveSupply(enableEcology(enableEconomy(enableEncounters(world)))))))));world=enableRestoration(enableStartingTown(world));
  const player=makePlayer(userId,name,0,world,now);
  const room:CoopRoom={schema:1,id:crypto.randomUUID(),ownerId:userId,hostId:player.id,code:inviteCode(),name:`${name}'s frontier`,revision:0,createdAt:now,updatedAt:now,lastTick:now,inviteExpiresAt:now+INVITE_LIFETIME_MS,closed:false,world,players:[player],enemyHP:{}};
  playerMotion(room,player);keepHostWorld(room);return room;
}
export function member(room:CoopRoom,userId:string){const p=room.players.find(p=>p.userId===userId);if(!p)throw new CoopError(404,'room_not_found','This co-op room is not available to this account');return p;}
function keepHostWorld(room:CoopRoom){
  if(room.world.caveWater)for(const p of room.players)if(p.zone==='cave'){
    const safe=safeCavePosition(room.world.caveWater,p.player);
    if(safe.x!==p.player.x||safe.z!==p.player.z){p.player={...p.player,...safe};resetMotion(room,p);}
  }
  const host=room.players.find(p=>p.id===room.hostId)!;room.world={...room.world,player:{...host.player},zone:host.zone};
}
export function joinRoom(room:CoopRoom,userId:string,name:string,now:number){
  now=roomTime(room,now);
  if(room.closed||room.inviteExpiresAt<=now)throw new CoopError(410,'invite_expired','This invitation has expired. Ask the host to reopen the saved room');
  // Upgrade absent optional data at resume/join, without resetting existing finite goods.
  room.world=enableRegionalFood(enableRegionalTrade(enableRegionalSupply(enableWaterRequests(enableCommonsTrade(enableCaveSupply(enableEcology(room.world)))))));room.world=enableRestoration(enableStartingTown(room.world));
  let player=room.players.find(p=>p.userId===userId);
  if(!player){
    // Keep the host slot permanently. Other disconnected slots are reserved for one minute.
    room.players=room.players.filter(p=>p.id===room.hostId||p.active&&now-p.lastSeen<=REJOIN_GRACE_MS);
    if(room.players.length>=4)throw new CoopError(409,'room_full','This room already has four players. Disconnected slots are held for one minute');
    const slot=[0,1,2,3].find(n=>!room.players.some(p=>p.slot===n))!;
    const host=room.players.find(p=>p.id===room.hostId)!,hostMotion=playerMotion(room,host);
    player=makePlayer(userId,name,slot,playerWorld(room,host),now);
    const g=motionGeometry(playerWorld(room,host)),m=player.motion!;m.feetY=supportBelow(player.player.x,player.player.z,hostMotion.feetY,g);setCrouch(m,player.player.x,player.player.z,false,g);projectMotion(player,m);room.players.push(player);
  }else{player.name=name;player.sessionId=crypto.randomUUID();player.active=true;player.lastSeen=now;player.lastMove=now;}
  interruptEquipmentCommitment(player);retireAbsentEquipment(room,now);
  // Rejoining is a trusted placement too: old accepted motion may predate the current solid catalog.
  delete player.wildernessCollisionVersion;
  const motion=playerMotion(room,player);motion.buffer=0;if(motion.jumpStatus==='queued')motion.jumpStatus='rejected';projectMotion(player,motion);
  if(player.id===room.hostId){interruptRoomGuards(room);room.lastTick=now;}
  return player;
}
export function roomObstacles(world:State):CombatObstacle[]{
  if(world.zone==='cave')return [...naturalCave(world.seed).walls,...(world.caveWater?caveFloodObstacles(world.caveWater):[])];
  if(world.zone==='dungeon')return worldDungeon(world).walls;
  const plan=world.generation===2?worldValley(world.seed):null;
  const shapes=plan?[...plan.bridges,...plan.foundations,...plan.infrastructure,...plan.buildings.flatMap(b=>b.plan.shapes)]:worldWorkshop(world.seed).plan.shapes;
  const rig=world.restoration?restorationBodyObstacle(world.restoration,worldRestorationPlan(world.seed)):null;
  const extras:CombatObstacle[]=[...(rig?[rig]:[]),...wildernessObstaclesNear(world,world.player.x,world.player.z,world.wilderness)];
  // Legacy huts are authored structures, separate from the generated wilderness.
  if(!plan)for(const [x,z]of [[-20,-7],[-12,-8],[-23,1],[17,-19],[24,-19],[25,-11]])extras.push({x:x!,z:z!,hx:1.9,hz:1.7,hy:2});
  const pump=worldEndpoints(world).pump;extras.push({x:pump.x,z:pump.z,y:worldHeight(world,pump.x,pump.z)+1.5,hx:1,hz:1,hy:1.5});
  const obstacles=[...shapes.filter(s=>s.solid).map(s=>({x:s.center.x,y:s.center.y,z:s.center.z,hx:s.half.x,hy:s.half.y,hz:s.half.z})),...extras,...machineWorldObstacles(world),...workshopConstructionBoxes(world.workshopConstruction).filter(b=>b.solid).map(b=>({x:b.center.x,y:b.center.y,z:b.center.z,hx:b.half.x,hy:b.half.y,hz:b.half.z})),...(world.regional&&world.frontierSupply?regionalSupplyObstacles(world.seed,world.frontierSupply):[]),...(world.regional&&world.frontierTrade?regionalTradeObstacles(world.seed,world.frontierTrade):[])];
  // The region never enters the authority as one scene. This neighborhood covers
  // accepted movement (at most 9.6m), local staff sight and spawn recovery rings.
  return world.regional?obstacles.filter(o=>Math.abs(o.x-world.player.x)<=o.hx+128&&Math.abs(o.z-world.player.z)<=o.hz+128):obstacles;
}
/** A build reserves its final solid envelope immediately. Retain absent peers too:
 * their durable position must still be safe when they resume their session. */
function regionalConstructionClear(room:CoopRoom,targetId:string,trade=false):boolean {
  const solids=(trade?regionalTradeConstructionBoxes(room.world.seed,targetId):regionalSupplyConstructionBoxes(room.world.seed,targetId)).filter(box=>box.solid).map(box=>({x:box.center.x,y:box.center.y,z:box.center.z,hx:box.half.x,hy:box.half.y,hz:box.half.z}));
  for(const peer of room.players)if(peer.zone==='valley'){
    const motion=playerMotion(room,peer),feet={x:peer.player.x,y:motion.feetY,z:peer.player.z};
    if(!actorPathClear(feet,feet,solids,motion.crouched))return false;
  }
  // Co-op does not grant prop movement authority, but an imported/saved survey
  // crate remains real state and may occupy a remote construction footprint.
  for(const body of traversalBodies(room.world))for(const solid of solids){
    if(Math.abs(body.x-solid.x)<body.hx+solid.hx-1e-5&&Math.abs(body.y-solid.y)<body.hy+solid.hy-1e-5&&Math.abs(body.z-solid.z)<body.hz+solid.hz-1e-5)return false;
  }
  return true;
}
export function combatSnapshot(room:CoopRoom,p:RoomPlayer,obstacles?:readonly CombatObstacle[]):ComboSnapshot{
  const s=playerWorld(room,p),m=playerMotion(room,p),canHit=m.grounded&&!m.crouched;
  return {player:{...p.player,y:m.feetY,facing:p.pose.facing},targets:encounterObjects(s).filter(o=>o.kind==='enemy').map(o=>({...o,alive:canHit&&!s.defeated.includes(o.id)})),obstacles:obstacles??roomObstacles(s)};
}
function motionGeometry(s:State):MotionGeometry{return {obstacles:roomObstacles(s),height:(x,z)=>worldHeight(s,x,z)};}
/** Server time advances the shared world once, regardless of how many clients poll. */
export function advanceRoom(room:CoopRoom,now:number){
  now=roomTime(room,now);
  const wasLive=hostConnected(room,now),dt=wasLive?Math.max(0,Math.min(1,(now-room.lastTick)/1000)):0;
  // An old active room may first receive an action at zero elapsed time.
  room.world=enableRegionalFood(enableRegionalTrade(enableRegionalSupply(enableWaterRequests(enableCommonsTrade(enableCaveSupply(enableEcology(room.world)))))));room.world=enableRestoration(enableStartingTown(room.world));
  room.lastTick=now;retireAbsentEquipment(room,now);if(!wasLive)interruptRoomGuards(room);if(!dt)return;
  room.world=enableEconomy(enableEncounters(room.world));
  const host=room.players.find(p=>p.id===room.hostId)!;
  const present=room.players.filter(p=>p.active&&now-p.lastSeen<=PLAYER_TIMEOUT_MS);
  for(const p of room.players)if(!present.includes(p))p.guard=interruptGuard(playerGuard(p),'session').state;
  const clockPlayer=present.find(p=>p.zone==='valley'&&p.player.hp>0)??host;
  const machinePoint=room.world.restoration?restorationMachinePosition(room.world.restoration,worldRestorationPlan(room.world.seed)):null;
  const towOperator=machinePoint?present.filter(p=>p.zone==='valley'&&p.player.hp>0&&playerMotion(room,p).grounded&&!playerMotion(room,p).crouched&&Math.abs(playerMotion(room,p).feetY-machinePoint.y)<.45&&clearPulsePath({...p.player,y:playerMotion(room,p).feetY},machinePoint,roomObstacles(playerWorld(room,p)).filter(o=>(o as {featureId?:string}).featureId!=='restoration-automaton'))).sort((a,b)=>Math.hypot(a.player.x-machinePoint.x,a.player.z-machinePoint.z)-Math.hypot(b.player.x-machinePoint.x,b.player.z-machinePoint.z)||a.id.localeCompare(b.id))[0]:undefined;
  const next=applyAction(playerWorld(room,clockPlayer),{type:'tick',dt},present.filter(p=>p.zone==='valley'&&p.player.hp>0).map(p=>({x:p.player.x,y:playerMotion(room,p).feetY,z:p.player.z})),towOperator?.player??{x:0,z:0,hp:0});room.world=next;clockPlayer.player={...next.player};
  for(const p of present)playerMotion(room,p);
  // Each actor owns their own local neighborhood. Sharing the first geometry in a
  // zone incorrectly drops collisions for distant friends in the same region.
  const playerGeometries=new Map(present.map(p=>[p.id,motionGeometry(playerWorld(room,p))]));
  const geometries=new Map<State['zone'],MotionGeometry>();
  for(const p of present){const g=playerGeometries.get(p.id)!,previous=geometries.get(p.zone);geometries.set(p.zone,previous?{...g,obstacles:[...previous.obstacles,...g.obstacles]}:g);}
  // Existing sentries stay in the core and keep their authored sight blockers even
  // when every player travels away. No regional enemies or economy are invented.
  if(room.world.regional&&geometries.has('valley')){const g=geometries.get('valley')!,core={...room.world,zone:'valley' as const,player:{...room.world.player,x:0,z:0}};geometries.set('valley',{...g,obstacles:[...g.obstacles,...roomObstacles(core)]});}
  const bodies=new Map(present.map(p=>{const g=playerGeometries.get(p.id)!;return [p.id,{...g,obstacles:g.obstacles.filter(o=>Math.abs(p.player.x-o.x)<=o.hx+COOP_BODY.radius&&Math.abs(p.player.z-o.z)<=o.hz+COOP_BODY.radius)}] as const;}));
  const pending=room.world.encounters!.remainder+dt,steps=Math.min(61,Math.floor((pending+1e-9)/COOP_VERTICAL.step)),remainder=Math.max(0,pending-steps*COOP_VERTICAL.step);
  room.world={...room.world,encounters:{...room.world.encounters!,remainder:0}};
  const tuning=equipmentCombat(equipmentFor(room.world.equipment?.active??undefined));
  for(let step=0;step<steps;step++){
    for(const p of present){const m=playerMotion(room,p);if(p.player.hp<=0){if(!m.grounded||m.vy!==0||m.buffer>0)resetMotion(room,p);}else stepVertical(m,p.player.x,p.player.z,bodies.get(p.id)!);projectMotion(p,playerMotion(room,p));p.guard=stepGuard(playerGuard(p),COOP_VERTICAL.step,guardContext(room,p,playerGeometries.get(p.id)!.obstacles)).state;}
    const beforeEncounters=room.world.encounters!;let encounters=beforeEncounters;
    for(const [zone,g]of geometries){
      const players=present.filter(p=>p.zone===zone);
      const result=advanceEncounters(beforeEncounters,COOP_VERTICAL.step,{zone,players:players.map(p=>({id:p.id,...p.player,y:playerMotion(room,p).feetY})),obstacles:g.obstacles,height:g.height,defeated:room.world.defeated});
      encounters={...result.state,enemies:encounters.enemies.map(e=>e.zone===zone?result.state.enemies.find(n=>n.id===e.id)!:e)};
      for(const event of result.events)if(event.type==='damage'){const victim=players.find(p=>p.id===event.playerId);if(victim){const hit=resolveGuardDamage(playerGuard(victim),guardContext(room,victim,g.obstacles),event,result.state.enemies.find(e=>e.id===event.enemyId));victim.guard=hit.guard;victim.player={...victim.player,hp:Math.max(0,victim.player.hp-hit.damage)};if(hit.damage>0)victim.combo=cancelCombo(victim.combo,'stun',tuning,SENTRY_HIT_STUN_SECONDS).state;if(victim.player.hp<=0)resetMotion(room,victim);}}
    }
    room.world={...room.world,encounters};
    for(const p of present){
      const m=playerMotion(room,p);if((!m.grounded||m.crouched)&&p.combo.phase!=='idle')p.combo=cancelCombo(p.combo,'dodge',tuning).state;
      const result=stepCombo(p.combo,COOP_VERTICAL.step,combatSnapshot(room,p,playerGeometries.get(p.id)!.obstacles),tuning);p.combo=result.state;
      if(p.zone==='valley'&&p.player.hp>0&&m.grounded&&!m.crouched)p.combo=resolveWildernessStrikes(p.combo,playerWorld(room,p),{...p.player,y:m.feetY},playerGeometries.get(p.id)!.obstacles).state;
      for(const event of result.events){if(event.type!=='hit'||room.world.defeated.includes(event.targetId))continue;
        const next=commitEncounterHit(playerWorld(room,p),event.targetId,event.damage);room.world=next;p.player={...next.player};
      }
    }
  }
  room.world={...room.world,encounters:{...room.world.encounters!,remainder}};
  room.enemyHP=Object.fromEntries(room.world.encounters!.enemies.map(e=>[e.id,e.hp]));
  keepHostWorld(room);
}
const townCrowds=new Map<number,TownCrowd>();
function townCrowdFor(seed:number){let crowd=townCrowds.get(seed);if(!crowd){crowd=new TownCrowd(seed);townCrowds.set(seed,crowd);while(townCrowds.size>4)townCrowds.delete(townCrowds.keys().next().value!);}return crowd;}
function movePlayer(room:CoopRoom,p:RoomPlayer,move:CoopMove,now:number){
  const m=playerMotion(room,p),s=playerWorld(room,p),bound=playerCenterBound(s),elapsed=Math.max(0,Math.min(.8,(now-p.lastMove)/1000));
  // No per-packet distance allowance: flooding requests must not manufacture movement time.
  const distance=Math.hypot(move.x-p.player.x,move.z-p.player.z),limit=12*elapsed;
  const scale=distance>limit?limit/distance:1;
  let next={x:Math.max(-bound,Math.min(bound,p.player.x+(move.x-p.player.x)*scale)),z:Math.max(-bound,Math.min(bound,p.player.z+(move.z-p.player.z)*scale))};
  const g=motionGeometry(s);setCrouch(m,p.player.x,p.player.z,move.crouched,g);
  if(s.regional&&s.zone==='valley'&&Math.max(p.player.x,next.x)>TOWN_CENTER.x-TOWN_BOUNDS.halfWidth+2&&Math.min(p.player.x,next.x)<TOWN_CENTER.x+TOWN_BOUNDS.halfWidth-2&&Math.max(p.player.z,next.z)>TOWN_CENTER.z-TOWN_BOUNDS.halfDepth+6&&Math.min(p.player.z,next.z)<TOWN_CENTER.z+TOWN_BOUNDS.halfDepth-6){const actors=room.players.filter(a=>a.active&&a.zone==='valley'&&now-a.lastSeen<=PLAYER_TIMEOUT_MS).map(a=>({id:a.id,x:a.player.x,z:a.player.z,feetY:playerMotion(room,a).feetY}));const crowd=townCrowdFor(s.seed).sample(townClock(s.causal),100,1,actors,townLifePoses(s.townLife));next=slideTownCrowd(p.player,next,crowd,m.feetY,COOP_BODY.radius);}
  if(p.player.hp>0&&moveVertical(m,p.player,next,g))p.player={...p.player,...next};
  setCrouch(m,p.player.x,p.player.z,move.crouched,g);p.pose.facing=move.facing;projectMotion(p,m);p.lastMove=now;
}
export function syncRoom(room:CoopRoom,userId:string,input:CoopSync,now:number):string[]{
  now=roomTime(room,now);
  const p=member(room,userId);
  if(input.sessionId!==p.sessionId)throw new CoopError(409,'session_replaced','This player rejoined from another tab or device. Rejoin here to take control');
  if(room.closed)throw new CoopError(410,'room_closed','The host has closed this room. The co-op save is retained');
  if(!p.active)throw new CoopError(409,'rejoin_required','Rejoin this room before sending actions');
  if(input.seq<=p.seq)return []; // Exactly-once operations even when a successful response was lost.
  if(input.seq!==p.seq+1)throw new CoopError(409,'sequence_gap','The room needs to reconnect before continuing');
  playerMotion(room,p);
  const live=hostConnected(room,now);
  advanceRoom(room,now);
  p.lastSeen=now;p.seq=input.seq;
  if(p.id===room.hostId&&!live)room.lastTick=now;
  const notices:string[]=[];
  if(!hostConnected(room,now)){for(const command of input.actions)if(command.type==='guard-press'){const rejected=requestGuard(playerGuard(p),p.combo,{...guardContext(room,p),playing:false},command.intentId);p.guard=rejected.state;}else if(command.type==='jump-press'){const m=playerMotion(room,p);m.lastJumpIntent=command.intentId;m.jumpStatus='rejected';m.buffer=0;}if(input.actions.length)notices.push('The host is away. World actions are paused until they return');return notices;}
  if(input.move){movePlayer(room,p,input.move,now);if(playerMotion(room,p).crouched)p.guard=interruptGuard(playerGuard(p),'crouch').state;}
  for(const command of input.actions){
    const s=playerWorld(room,p),tuning=equipmentCombat(equipmentFor(s.equipment?.active??undefined));
    if(command.type==='guard-press'){
      const result=requestGuard(playerGuard(p),p.combo,guardContext(room,p),command.intentId,undefined,tuning);p.guard=result.state;p.combo=result.combo;
      const rejected=result.events.find(e=>e.type==='rejected');if(rejected?.type==='rejected')notices.push(`Guard ${rejected.reason}`);continue;
    }
    if(command.type==='guard-cancel'){p.guard=interruptGuard(playerGuard(p),'menu').state;continue;}
    if(command.type==='jump-press'){
      p.guard=interruptGuard(playerGuard(p),'jump').state;
      const m=playerMotion(room,p);if(m.lastJumpIntent===command.intentId)continue;
      if(p.player.hp<=0){resetMotion(room,p);const dead=playerMotion(room,p);dead.lastJumpIntent=command.intentId;dead.jumpStatus='rejected';dead.buffer=0;notices.push('Recall to camp before jumping');}
      else{requestJump(m,command.intentId);p.combo=cancelCombo(p.combo,'dodge',tuning).state;projectMotion(p,m);}continue;
    }
    if(command.type==='attack-press'){
      const result=requestComboAttack(p.combo,combatSnapshot(room,p),tuning);p.combo=result.state;
      const rejected=result.events.find(e=>e.type==='rejected');if(rejected?.type==='rejected')notices.push(`Attack ${rejected.reason.replaceAll('-',' ')}`);
      continue;
    }
    if(command.type==='attack-cancel'){p.combo=cancelCombo(p.combo,'dodge',tuning).state;continue;}
    // A refit changes the shared expedition equipment. Only the host can spend the shared kit budget on it.
    if(command.type==='refit-equipment'||command.type==='assemble-equipment'){
      if(p.id!==room.hostId){notices.push('The host manages the expedition staff assembly');continue;}
      // Absent actors were retired before actions: no old-geometry hit or buffered chain can resume.
      if(room.players.some(q=>q.active&&now-q.lastSeen<=PLAYER_TIMEOUT_MS&&(!canSwapEquipment(q.combo)||guardBusy(playerGuard(q))))){notices.push('Wait for every expedition staff / guard commitment to finish before refitting');continue;}
    }
    if(command.type==='restoration-care'){
      const m=playerMotion(room,p),target=restorationCarePosition(worldRestorationPlan(s.seed),command.command);
      if(p.id!==room.hostId){notices.push('The host transports the shared habitat care satchel');continue;}
      if(!m.grounded||m.crouched||p.combo.phase!=='idle'||guardBusy(playerGuard(p))||!target||Math.abs(m.feetY-worldHeight(s,p.player.x,p.player.z))>.45||!clearPulsePath({...p.player,y:m.feetY},target,roomObstacles(s).filter(o=>(o as {featureId?:string}).featureId!=='restoration-automaton'))){notices.push('Reach the habitat dock or apothecary on clear ground with your staff lowered');continue;}
    }
    if(command.type==='workshop-construction'){
      const m=playerMotion(room,p),target=workshopConstructionPosition();
      if(p.id!==room.hostId){notices.push('The host manages the shared workshop and its materials');continue;}
      if(!m.grounded||m.crouched||p.combo.phase!=='idle'||guardBusy(playerGuard(p))||Math.abs(m.feetY-worldHeight(s,p.player.x,p.player.z))>.45||!clearPulsePath({...p.player,y:m.feetY},target,roomObstacles(s))){notices.push('Reach the west workshop board on clear ground with your staff lowered');continue;}
      if(command.command.kind==='build'){
        const solids=workshopConstructionBoxes({parameters:command.command.parameters}).filter(b=>b.solid).map(b=>({x:b.center.x,y:b.center.y,z:b.center.z,hx:b.half.x,hy:b.half.y,hz:b.half.z}));
        if(room.players.some(peer=>peer.zone==='valley'&&!actorPathClear({x:peer.player.x,y:playerMotion(room,peer).feetY,z:peer.player.z},{x:peer.player.x,y:playerMotion(room,peer).feetY,z:peer.player.z},solids,playerMotion(room,peer).crouched))){notices.push('Move every explorer clear of the future workshop solids');continue;}
      }
    }
    if(command.type==='restoration'){const m=playerMotion(room,p),target=s.restoration?restorationCommandPosition(s.restoration,worldRestorationPlan(s.seed),command.command):null;if(command.command.kind==='refit'&&p.id!==room.hostId){notices.push('The host manages shared automaton structural parts');continue;}if(!m.grounded||m.crouched||p.combo.phase!=='idle'||guardBusy(playerGuard(p))||!target||Math.abs(m.feetY-worldHeight(s,p.player.x,p.player.z))>.45||!clearPulsePath({...p.player,y:m.feetY},target,roomObstacles(s).filter(o=>(o as {featureId?:string}).featureId!=='restoration-automaton'))){notices.push('Reach the restoration control on clear ground with your staff lowered');continue;}}
    if(command.type==='gather-wilderness'){const m=playerMotion(room,p);if(!m.grounded||m.crouched||p.combo.phase!=='idle'||guardBusy(playerGuard(p))){notices.push('Stand still with your staff lowered to gather');continue;}}
    if(command.type==='town-purchase'||command.type==='visit-town'||command.type==='town-life'||command.type==='town-director'){
      const m=playerMotion(room,p);if(!m.grounded||m.crouched||p.combo.phase!=='idle'||guardBusy(playerGuard(p))||Math.abs(m.feetY-worldHeight(s,p.player.x,p.player.z))>.45){notices.push('Stand on the ground with your staff lowered to use town services');continue;}
      if(command.type==='town-director'){const target=s.townDirector?townDirectorInteractionPosition(s.townDirector,command.command.episodeId):undefined;if(!target||!clearPulsePath({...p.player,y:m.feetY},{...target,y:6},roomObstacles(s))){notices.push('Reach the request service by a clear path');continue;}}
      if(command.type==='town-life'){const target=s.townLife?townLifeInteractionTarget(s.townLife,command.command,room.players.filter(a=>a.active&&a.zone==='valley'&&now-a.lastSeen<=PLAYER_TIMEOUT_MS).map(a=>({id:a.id,x:a.player.x,z:a.player.z,feetY:playerMotion(room,a).feetY}))):undefined;if(!target||!clearPulsePath({...p.player,y:m.feetY},{...target,y:6},roomObstacles(s))){notices.push('Reach this resident or town service by a clear path');continue;}}
      if(command.type==='town-purchase'){const offer=TOWN_OFFERS.find(o=>o.id===command.command.offerId),target=offer?startingTown(s.seed).shops[offer.shopIndex]!.entry:undefined;if(!target||!clearPulsePath({...p.player,y:m.feetY},{...target,y:6},roomObstacles(s))){notices.push('Reach the shop counter by a clear path');continue;}}
    }
    if(command.type==='regional-food'){
      const m=playerMotion(room,p);
      if(!m.grounded||m.crouched||p.combo.phase!=='idle'||guardBusy(playerGuard(p))||Math.abs(m.feetY-worldHeight(s,p.player.x,p.player.z))>.45){notices.push('Stand on the ground with your staff lowered to help the farm');continue;}
      const target=s.regional?regionalFoodCommandPosition(s.seed,command.command):undefined;
      if(!target||!clearPulsePath({...p.player,y:m.feetY},target,roomObstacles(s))){notices.push('Reach the farm work board by a clear path');continue;}
    }
    if(command.type==='regional-trade'){
      const m=playerMotion(room,p);
      if(!m.grounded||m.crouched||p.combo.phase!=='idle'||guardBusy(playerGuard(p))||Math.abs(m.feetY-worldHeight(s,p.player.x,p.player.z))>.45){notices.push('Stand on the ground with your staff lowered to help the freight route');continue;}
      const target=s.regional?regionalTradeCommandPosition(s.seed,command.command):undefined;
      if(!target||!clearPulsePath({...p.player,y:m.feetY},target,roomObstacles(s))){notices.push('Reach the freight work board by a clear path');continue;}
    }
    if(command.type==='regional-supply'){
      const m=playerMotion(room,p);
      if(!m.grounded||m.crouched||p.combo.phase!=='idle'||guardBusy(playerGuard(p))||Math.abs(m.feetY-worldHeight(s,p.player.x,p.player.z))>.45){notices.push('Stand on the ground with your staff lowered to help this outpost');continue;}
      const outpost=s.regional?regionalSupplyPlan(s.seed).outposts.find(o=>o.id===command.command.outpostId):undefined;
      if(!outpost||!clearPulsePath({...p.player,y:m.feetY},outpost.deliveryPosition,roomObstacles(s))){notices.push('Reach the outpost supply board by a clear path');continue;}
    }
    const next=command.type==='restoration-care'?commitRestorationCare(s,command.command,playerMotion(room,p).feetY):command.type==='town-life'?commitTownLife(s,command.command,room.players.filter(a=>a.active&&a.zone==='valley'&&now-a.lastSeen<=PLAYER_TIMEOUT_MS).map(a=>({id:a.id,x:a.player.x,z:a.player.z,feetY:playerMotion(room,a).feetY}))):command.type==='regional-food'?commitRegionalFood(s,command.command,{feetY:playerMotion(room,p).feetY,grounded:playerMotion(room,p).grounded}):command.type==='gather-wilderness'?commitWildernessGather(s,command.id,{feetY:playerMotion(room,p).feetY,grounded:playerMotion(room,p).grounded,obstacles:roomObstacles(s)}):applyAction(s,command,room.players.filter(a=>a.active&&a.zone==='valley'&&now-a.lastSeen<=PLAYER_TIMEOUT_MS).map(a=>({x:a.player.x,y:playerMotion(room,a).feetY,z:a.player.z})));if(next===s){notices.push('That action is no longer available at your position');continue;}
    if(command.type==='regional-trade'&&(command.command.type==='start-source'||command.command.type==='build-store')&&!regionalConstructionClear(room,command.command.targetId,true)){notices.push('Move every explorer and the survey crate clear of the construction footprint');continue;}
    if(command.type==='regional-supply'&&command.command.type==='build'&&!regionalConstructionClear(room,command.command.outpostId)){notices.push('Move every explorer and the survey crate clear of the construction footprint');continue;}
    room.world=next;p.player={...next.player};p.zone=next.zone;
    if(command.type==='enter'||command.type==='enter-cave'||command.type==='exit'||command.type==='respawn'||command.type==='visit-town'){
      resetMotion(room,p);
      interruptEquipmentCommitment(p,'zone');p.lastMove=now;
    }
  }
  keepHostWorld(room);return notices.slice(-8);
}
export function snapshot(room:CoopRoom,userId:string,now:number,notices:string[]=[]):CoopSnapshot{
  now=roomTime(room,now);
  const p=member(room,userId),live=hostConnected(room,now);
  for(const q of room.players)projectMotion(q,playerMotion(room,q));
  return {protocol:1,roomId:room.id,code:room.code,name:room.name,selfId:p.id,hostId:room.hostId,sessionId:p.sessionId,revision:room.revision,ack:p.seq,serverTime:now,hostConnected:live,paused:!live,closed:room.closed,inviteExpiresAt:room.inviteExpiresAt,world:playerWorld(room,p),enemyHP:room.enemyHP,combo:p.combo,guard:playerGuard(p),motion:publicMotion(playerMotion(room,p)),notices,
    peers:room.players.map(q=>({id:q.id,name:q.name,slot:q.slot,host:q.id===room.hostId,connected:q.active&&now-q.lastSeen<=PLAYER_TIMEOUT_MS,zone:q.zone,player:q.player,pose:q.pose,motion:publicMotion(playerMotion(room,q)),combo:q.combo,guard:playerGuard(q)}))};
}
