import type {Action, State} from './world.ts';
import type {ComboState} from './combat.ts';
import type {GuardState} from './guard.ts';

/** The co-op protocol never accepts a replacement world, a damage value, or a tick.
 * Regional freight and food actions carry only a target and expected ledger
 * revision; production, shipments, water, meals, footprints and the shared clock
 * remain server-owned. No actor identity comes from a command payload. */
export const COOP_PROTOCOL = 1;
export const COOP_POLL_MS = 250;
export const COOP_MAX_PLAYERS = 4;
export type CoopAction = Exclude<Action, {type:'move'} | {type:'tick'} | {type:'attack'}>
  | {type:'attack-press'} | {type:'attack-cancel'} | {type:'jump-press';intentId:string}
  | {type:'guard-press';intentId:string} | {type:'guard-cancel'};
export interface CoopMove {x:number;z:number;y:number;facing:number;grounded:boolean;crouched:boolean}
export interface CoopMotion {feetY:number;vy:number;grounded:boolean;crouched:boolean;jumpId:number;landingId:number;jumpQueued:boolean;lastJumpIntent:string|null;jumpStatus:'launched'|'queued'|'rejected'|null}
export interface CoopPeer {
  id:string;name:string;slot:number;host:boolean;connected:boolean;
  zone:State['zone'];player:State['player'];pose:CoopMove;motion:CoopMotion;combo:ComboState;guard:GuardState;
}
export interface CoopSnapshot {
  protocol:1;roomId:string;code:string;name:string;selfId:string;hostId:string;sessionId:string;
  revision:number;ack:number;serverTime:number;hostConnected:boolean;paused:boolean;
  closed:boolean;inviteExpiresAt:number;world:State;peers:CoopPeer[];
  enemyHP:Record<string,number>;combo:ComboState;guard:GuardState;motion:CoopMotion;
  notices:string[];
}
export interface CoopSync {seq:number;sessionId:string;actions:CoopAction[];move?:CoopMove}
export interface CoopSavedRoom {id:string;name:string;seed:number;updatedAt:number;closed:boolean;players:number}
export interface CoopAvailability {available:boolean;authenticated:boolean;protocol:1;transport:'http-polling';pollMs:number;maximumPlayers:4;message:string}
export type CoopConnection = 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'paused';
