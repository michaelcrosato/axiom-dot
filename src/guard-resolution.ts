/** Shared solo/online reaction to an unblocked sentry contact. */
export const SENTRY_HIT_STUN_SECONDS=.22;
import {interruptGuard,resolveGuardContact,stepGuard,type GuardContext,type GuardEvent,type GuardState} from './guard.ts';
import type {EncounterEvent,EnemyState} from './encounters.ts';
/** Shared solo/server adapter: client block or damage claims never enter this API. */
export function resolveGuardDamage(guard:GuardState,context:GuardContext,event:Extract<EncounterEvent,{type:'damage'}>,enemy:EnemyState|undefined):{guard:GuardState;damage:number;blocked:boolean;events:GuardEvent[]}{
 if(!enemy||enemy.id!==event.enemyId||enemy.attackId!==event.attackId||enemy.phase!=='strike'&&enemy.phase!=='recover'){const interrupted=interruptGuard(guard,context.player.hp-event.damage<=0?'dead':'damage');return {guard:interrupted.state,damage:event.damage,blocked:false,events:interrupted.events};}
 const result=resolveGuardContact(guard,context,{enemyId:enemy.id,attackId:enemy.attackId,source:enemy,damage:event.damage});
 if(result.blocked)return {guard:result.state,damage:0,blocked:true,events:result.events};
 const interrupted=interruptGuard(result.state,context.player.hp-event.damage<=0?'dead':'damage');
 return {guard:interrupted.state,damage:event.damage,blocked:false,events:[...result.events,...interrupted.events]};
}

import {advanceEncounters} from './encounters.ts';
import {worldHeight} from './generation.ts';
import type {State} from './world.ts';
/** Solo production boundary, always one 60Hz physics snapshot, sharing server interception. */
export function stepGuardedWorldEncounters(s:State,guard:GuardState,context:GuardContext):{state:State;guard:GuardState;events:EncounterEvent[];guardEvents:GuardEvent[]}{
 const c={...context,player:{...context.player,x:s.player.x,z:s.player.z,hp:s.player.hp}},tick=stepGuard(guard,1/60,c);guard=tick.state;
 if(!s.encounters||s.player.hp<=0||!c.playing)return {state:s,guard,events:[],guardEvents:tick.events};
 const result=advanceEncounters(s.encounters,1/60,{zone:s.zone,players:[{...s.player,y:c.player.y,id:'solo'}],obstacles:c.obstacles,height:(x,z)=>worldHeight(s,x,z),defeated:s.defeated});
 let hp=s.player.hp;const events:EncounterEvent[]=[],guardEvents=[...tick.events];
 for(const event of result.events){
  if(event.type!=='damage'||event.playerId!=='solo'){events.push(event);continue;}
  const hit=resolveGuardDamage(guard,{...c,player:{...c.player,hp}},event,result.state.enemies.find(e=>e.id===event.enemyId));guard=hit.guard;guardEvents.push(...hit.events);hp=Math.max(0,hp-hit.damage);if(!hit.blocked)events.push(event);
 }
 return {state:{...s,encounters:result.state,player:{...s.player,hp},revision:s.revision+1},guard,events,guardEvents};
}
