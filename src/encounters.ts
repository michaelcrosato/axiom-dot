import {obstacleSegmentIntersects} from './wilderness-geometry.ts';
import type {CombatObstacle} from './combat.ts';
/** Bounded, renderer-independent encounter authority. One fixed step writes all enemies. */
export const ENCOUNTER_VERSION=1 as const;
export type EnemyPhase='idle'|'pursuit'|'prepare'|'strike'|'recover'|'stagger'|'return'|'disabled';
export interface EnemySeed {id:string;x:number;z:number;y?:number;zone:string}
export interface EnemyState {id:string;zone:string;x:number;y:number;z:number;homeX:number;homeY:number;homeZ:number;hp:number;heading:number;phase:EnemyPhase;remaining:number;targetId:string|null;attackId:number;hitIds:string[];distance:number;blocked:number}
export interface Encounters {version:1;step:number;remainder:number;enemies:EnemyState[]}
export interface EncounterPlayer {id:string;x:number;y:number;z:number;hp:number}
export interface EncounterObstacle extends CombatObstacle {}
export interface EncounterContext {zone:string;players:readonly EncounterPlayer[];obstacles:readonly EncounterObstacle[];height:(x:number,z:number)=>number;defeated:readonly string[];damageScale?:number}
export type EncounterEvent={type:'prepare'|'strike'|'recovered'|'stagger'|'defeated';enemyId:string;attackId:number}|{type:'damage';enemyId:string;attackId:number;playerId:string;damage:number};
export const ENEMY_RULES=Object.freeze({radius:1.1,speed:2.3,returnSpeed:1.6,sense:8.5,leash:7.5,reach:2.25,arc:1.4,prepare:.72,strike:.18,recover:1.05,damage:12,stagger:.32,maxHP:100,maxContacts:4});
const EPS=1e-8,STEP=1/60;
export function createEncounters(seeds:readonly EnemySeed[],defeated:readonly string[]=[]):Encounters {
 return {version:1,step:0,remainder:0,enemies:seeds.map(s=>({id:s.id,zone:s.zone,x:s.x,y:s.y??0,z:s.z,homeX:s.x,homeY:s.y??0,homeZ:s.z,hp:defeated.includes(s.id)?0:100,heading:0,phase:defeated.includes(s.id)?'disabled':'idle',remaining:0,targetId:null,attackId:0,hitIds:[],distance:0,blocked:0}))};
}
/** Segment test with an optional horizontal capsule margin. Used for sight AND movement. */
export function encounterClear(from:{x:number;y:number;z:number},to:{x:number;y:number;z:number},obstacles:readonly EncounterObstacle[],margin=0):boolean {
 for(const o of obstacles){if(o.convexPlanes?.length){const lift=margin>0?.75:.7;const planes=margin>0?o.convexPlanes.map(n=>({...n,d:n.d+margin*Math.hypot(n.x,n.z)+.7*Math.abs(n.y)})):o.convexPlanes;if(obstacleSegmentIntersects({...o,y:o.y??o.hy??0,hy:o.hy??10000,convexPlanes:planes},{...from,y:from.y+lift},{...to,y:to.y+lift}))return false;continue;}let lo=0,hi=1;for(const axis of ['x','y','z'] as const){if(axis==='y'&&o.hy===undefined)continue;const half=axis==='x'?o.hx+margin:axis==='z'?o.hz+margin:o.hy!+(margin>0?.7:0),center=axis==='y'?(o.y??o.hy!):o[axis],a=from[axis]+(axis==='y'?(margin>0?.75:.7):0),b=to[axis]+(axis==='y'?(margin>0?.75:.7):0),d=b-a;if(Math.abs(d)<EPS){if(a<center-half||a>center+half){lo=2;break;}}else{const p=(center-half-a)/d,q=(center+half-a)/d;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));}if(lo>hi)break;}if(lo<=hi)return false;}return true;
}
function targetVisible(e:EnemyState,p:EncounterPlayer,c:EncounterContext){return p.hp>0&&Math.hypot(p.x-e.x,p.z-e.z,p.y-e.y)<=ENEMY_RULES.sense&&Math.hypot(p.x-e.homeX,p.z-e.homeZ)<=ENEMY_RULES.leash+2&&encounterClear(e,p,c.obstacles);}
function moveToward(e:EnemyState,x:number,z:number,speed:number,c:EncounterContext):EnemyState {
 const dx=x-e.x,dz=z-e.z,length=Math.hypot(dx,dz);if(length<EPS)return e;const amount=Math.min(speed*STEP,length),nx=e.x+dx/length*amount,nz=e.z+dz/length*amount,ny=c.height(nx,nz);
 if(!Number.isFinite(ny)||Math.abs(ny-e.y)>amount*.9+EPS||Math.hypot(nx-e.homeX,nz-e.homeZ)>ENEMY_RULES.leash||!encounterClear(e,{x:nx,y:ny,z:nz},c.obstacles,ENEMY_RULES.radius))return {...e,blocked:e.blocked+STEP};
 return {...e,x:nx,y:ny,z:nz,heading:Math.atan2(dx,dz),distance:e.distance+amount,blocked:0};
}
function tickEnemy(enemy:EnemyState,c:EncounterContext,events:EncounterEvent[]):EnemyState {
 if(c.defeated.includes(enemy.id)||enemy.hp<=0)return enemy.phase==='disabled'?enemy:{...enemy,hp:0,phase:'disabled',remaining:0,targetId:null};
 if(enemy.zone!==c.zone)return enemy;
 let e={...enemy,hitIds:[...enemy.hitIds]};
 if(e.phase==='stagger'||e.phase==='recover'){e.remaining=Math.max(0,e.remaining-STEP);if(e.remaining<EPS){e.phase='idle';events.push({type:'recovered',enemyId:e.id,attackId:e.attackId});}return e;}
 if(e.phase==='prepare'){e.remaining=Math.max(0,e.remaining-STEP);if(e.remaining<EPS){e.phase='strike';e.remaining=ENEMY_RULES.strike;events.push({type:'strike',enemyId:e.id,attackId:e.attackId});}return e;}
 if(e.phase==='strike'){
  for(const p of c.players){if(e.hitIds.length>=ENEMY_RULES.maxContacts)break;const dx=p.x-e.x,dz=p.z-e.z,r=Math.hypot(dx,dz);if(p.hp<=0||e.hitIds.includes(p.id)||Math.abs(p.y-e.y)>.85||r>ENEMY_RULES.reach||r>EPS&&(dx*Math.sin(e.heading)+dz*Math.cos(e.heading))/r<Math.cos(ENEMY_RULES.arc/2)||!encounterClear(e,p,c.obstacles))continue;e.hitIds.push(p.id);events.push({type:'damage',enemyId:e.id,attackId:e.attackId,playerId:p.id,damage:ENEMY_RULES.damage*(typeof c.damageScale==='number'&&Number.isFinite(c.damageScale)?Math.max(.1,Math.min(3,c.damageScale)):1)});}
  e.remaining=Math.max(0,e.remaining-STEP);if(e.remaining<EPS){e.phase='recover';e.remaining=ENEMY_RULES.recover;}return e;
 }
 const candidates=c.players.filter(p=>targetVisible(e,p,c)).sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z)||a.id.localeCompare(b.id));
 const target=candidates.find(p=>p.id===e.targetId)??candidates[0];
 if(!target||e.blocked>1.2){e.targetId=null;e.phase='return';const homeDistance=Math.hypot(e.x-e.homeX,e.z-e.homeZ);if(homeDistance<.08){e.phase='idle';e.blocked=0;return e;}return moveToward(e,e.homeX,e.homeZ,ENEMY_RULES.returnSpeed,c);}
 e.targetId=target.id;const distance=Math.hypot(target.x-e.x,target.z-e.z);
 if(distance<=ENEMY_RULES.reach-.15&&Math.abs(target.y-e.y)<.85){e.phase='prepare';e.remaining=ENEMY_RULES.prepare;e.heading=Math.atan2(target.x-e.x,target.z-e.z);e.attackId++;e.hitIds=[];events.push({type:'prepare',enemyId:e.id,attackId:e.attackId});return e;}
 e.phase='pursuit';return moveToward(e,target.x,target.z,ENEMY_RULES.speed,c);
}
/** A call accepts at most one second; callers use fixed 60Hz steps, never offline catch-up. */
export function advanceEncounters(state:Encounters,dt:number,context:EncounterContext):{state:Encounters;events:EncounterEvent[]} {
 if(!Number.isFinite(dt)||dt<=0||dt>1||context.players.some(p=>![p.x,p.y,p.z,p.hp].every(Number.isFinite)))return {state,events:[]};
 const count=Math.floor((state.remainder+dt+EPS)/STEP),remainder=Math.max(0,state.remainder+dt-count*STEP),events:EncounterEvent[]=[];let enemies=state.enemies;
 for(let i=0;i<count;i++)enemies=enemies.map(e=>tickEnemy(e,context,events));
 return {state:{...state,step:state.step+count,remainder,enemies},events};
}
/** Called only after the shared staff timeline has accepted a hit. */
export function hitEncounter(state:Encounters,id:string,damage:number):{state:Encounters;events:EncounterEvent[]} {
 const enemy=state.enemies.find(e=>e.id===id);if(!enemy||enemy.hp<=0||!Number.isFinite(damage)||damage<=0||damage>100)return {state,events:[]};
 const hp=Math.max(0,enemy.hp-damage),phase:EnemyPhase=hp===0?'disabled':'stagger',next={...enemy,hp,phase,remaining:hp===0?0:ENEMY_RULES.stagger,targetId:null,hitIds:[]};
 return {state:{...state,enemies:state.enemies.map(e=>e.id===id?next:e)},events:[{type:hp===0?'defeated':'stagger',enemyId:id,attackId:enemy.attackId}]};
}
export function validEncounters(value:unknown,seeds:readonly EnemySeed[],defeated:readonly string[],height?:(zone:string,x:number,z:number)=>number):value is Encounters {
 if(!value||typeof value!=='object')return false;const s=value as Encounters;if(s.version!==1||!Number.isSafeInteger(s.step)||s.step<0||!Number.isFinite(s.remainder)||s.remainder<0||s.remainder>=STEP+EPS||!Array.isArray(s.enemies)||s.enemies.length!==seeds.length)return false;
 const seen=new Set<string>();return s.enemies.every(e=>{if(!e||typeof e!=='object')return false;const seed=seeds.find(o=>o.id===e.id);if(!seed||seen.has(e.id))return false;seen.add(e.id);const phaseMax:Record<EnemyPhase,number>={idle:0,pursuit:0,prepare:ENEMY_RULES.prepare,strike:ENEMY_RULES.strike,recover:ENEMY_RULES.recover,stagger:ENEMY_RULES.stagger,return:0,disabled:0};return e.zone===seed.zone&&e.homeX===seed.x&&e.homeZ===seed.z&&e.homeY===(seed.y??0)&&[e.x,e.y,e.z,e.hp,e.heading,e.remaining,e.distance,e.blocked].every(Number.isFinite)&&Math.hypot(e.x-e.homeX,e.z-e.homeZ)<=ENEMY_RULES.leash+EPS&&Math.abs(e.y-e.homeY)<12&&(!height||Math.abs(e.y-height(e.zone,e.x,e.z))<.00001)&&e.hp>=0&&e.hp<=100&&e.remaining>=0&&e.remaining<=(phaseMax[e.phase]??-1)+EPS&&e.distance>=0&&e.blocked>=0&&Number.isSafeInteger(e.attackId)&&e.attackId>=0&&['idle','pursuit','prepare','strike','recover','stagger','return','disabled'].includes(e.phase)&&((e.hp===0)===(e.phase==='disabled'))&&((e.hp===0)===defeated.includes(e.id))&&(e.targetId===null||typeof e.targetId==='string'&&e.targetId.length<=80)&&Array.isArray(e.hitIds)&&e.hitIds.length<=ENEMY_RULES.maxContacts&&new Set(e.hitIds).size===e.hitIds.length&&e.hitIds.every(id=>typeof id==='string'&&id.length<=80);});
}
