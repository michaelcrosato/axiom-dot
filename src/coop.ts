import {immutableRestoration} from './restoration.ts';
import {worldRestorationPlan} from './world.ts';
import {immutableTownDirector} from './town-director.ts';
import {immutableTownLife} from './town-life.ts';
import {immutableWildernessState} from './wilderness-state.ts';
import {validEquipment} from './equipment.ts';
import {validateSave,type State} from './world.ts';
import {immutableRegionalTrade} from './regional-trade.ts';
import {immutableRegionalSupply} from './regional-supply.ts';
import {immutableRegionalFood} from './regional-food.ts';
import {validGuardState} from './guard.ts';
import {COOP_POLL_MS,type CoopAction,type CoopAvailability,type CoopConnection,type CoopMove,type CoopSavedRoom,type CoopSnapshot,type CoopSync} from './coop-protocol.ts';
export * from './coop-protocol.ts';
export class CoopRequestError extends Error {
  status:number;code:string;
  constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}
}
export interface CoopClientOptions {
  onSnapshot:(snapshot:CoopSnapshot)=>void;
  onStatus?:(status:CoopConnection,message:string)=>void;
  onLeave?:()=>void;
  fetch?:typeof fetch;
  baseURL?:string;
}
/** One serial HTTP stream per player: retries reuse the exact sequence and action list. */
export class CoopClient {
  private options:CoopClientOptions;
  private fetcher:typeof fetch;
  private current:CoopSnapshot|null=null;
  private connection:CoopConnection='offline';
  private queue:CoopAction[]=[];
  private latestMove:CoopMove|undefined;
  private pending:CoopSync|null=null;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private generation=0;
  private failures=0;
  private polling=false;
  private suspended=false;
  private jumpIntent:string|null=null;
  private guardIntent:string|null=null;
  private lastPollAt=0;
  constructor(options:CoopClientOptions){this.options=options;this.fetcher=options.fetch??fetch;}
  get snapshot(){return this.current;}
  get status(){return this.connection;}
  get active(){return this.current!==null;}
  /** Local transport status only; acknowledgment never implies model acceptance. */
  hasPendingAction(type:CoopAction['type']):boolean{return this.queue.some(action=>action.type===type)||!!this.pending?.actions.some(action=>action.type===type);}
  get pendingJumpIntent(){return this.jumpIntent;}
  get pendingGuardIntent(){return this.guardIntent;}
  get canAct(){return !this.suspended&&this.connection==='connected'&&!!this.current&&!this.current.paused&&!this.current.closed;}
  /** Background tabs stop heartbeats. A sent operation remains byte-for-byte retryable. */
  setSuspended(hidden:boolean){
    if(this.suspended===hidden)return;this.suspended=hidden;
    if(hidden){
      if(this.timer)clearTimeout(this.timer);this.timer=undefined;
      this.latestMove=undefined;this.queue=[];const jump=this.pending?.actions.slice().reverse().find(a=>a.type==='jump-press');this.jumpIntent=jump?.type==='jump-press'?jump.intentId:null;const guard=this.pending?.actions.slice().reverse().find(a=>a.type==='guard-press');this.guardIntent=guard?.type==='guard-press'?guard.intentId:null;
      if(this.current)this.statusChanged('paused','Connection paused while this tab is away');
    }else if(this.current){this.statusChanged('reconnecting','Reconnecting to the expedition…');this.schedule(0);}
  }
  private statusChanged(status:CoopConnection,message:string){this.connection=status;this.options.onStatus?.(status,message);}
  private async request<T>(path:string,body?:unknown):Promise<T>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await this.fetcher(`${this.options.baseURL??''}/api/coop${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
      const payload=await response.json().catch(()=>null) as {error?:string;message?:string}|null;
      if(!response.ok)throw new CoopRequestError(response.status,payload?.error??'unavailable',payload?.message??'The co-op service is unavailable');
      if(!payload)throw new CoopRequestError(503,'unavailable','The co-op service returned an unreadable response');
      return payload as T;
    }finally{clearTimeout(timeout);}
  }
  availability(){return this.request<CoopAvailability>('/status');}
  async savedRooms(){return (await this.request<{rooms:CoopSavedRoom[]}>('/rooms')).rooms;}
  private accept(snapshot:CoopSnapshot){
    if(snapshot.protocol!==1||!Array.isArray(snapshot.peers)||!snapshot.world||snapshot.world.equipment!==undefined&&!validEquipment(snapshot.world.equipment)||snapshot.guard!==undefined&&!validGuardState(snapshot.guard))throw new CoopRequestError(503,'protocol_mismatch','This room needs a newer game build');
    if(this.current?.roomId===snapshot.roomId&&snapshot.revision<this.current.revision)return;
    if(Object.hasOwn(snapshot.world,'wilderness')){try{snapshot.world={...snapshot.world,wilderness:immutableWildernessState(snapshot.world.wilderness,snapshot.world,this.current?.world.wilderness)};}catch{throw new CoopRequestError(503,'protocol_mismatch','This room returned an invalid resource ledger');}}
    // Certify the complete external dependency graph before accepting any regional
    // overlay. A valid-looking food ledger cannot refer to forged water or stores.
    if(['frontierSupply','frontierTrade','frontierFood','townLayout','town','townLife','townDirector','restoration','workshopConstruction','restorationCare','townSupply'].some(key=>Object.hasOwn(snapshot.world,key))){
      try{
        let world=snapshot.world;
                if(Object.hasOwn(world,'restoration'))world={...world,restoration:immutableRestoration(world.restoration,worldRestorationPlan(world.seed))};
        if(Object.hasOwn(world,'townLife'))world={...world,townLife:immutableTownLife(world.townLife,world.seed)};
        if(Object.hasOwn(world,'townDirector'))world={...world,townDirector:immutableTownDirector(world.townDirector,world.townLife!)};
        if(Object.hasOwn(world,'frontierTrade'))world={...world,frontierTrade:immutableRegionalTrade(world.frontierTrade,world)};
        if(Object.hasOwn(world,'frontierSupply'))world={...world,frontierSupply:immutableRegionalSupply(world.frontierSupply,world)};
        if(Object.hasOwn(world,'frontierFood'))world={...world,frontierFood:immutableRegionalFood(world.frontierFood,world)};
        if(!validateSave(world))throw new Error('Invalid regional world');
        snapshot={...snapshot,world};
      }catch{throw new CoopRequestError(503,'protocol_mismatch','This room returned an invalid regional ledger');}
    }
    this.current=snapshot;this.failures=0;
    if(snapshot.motion?.lastJumpIntent===this.jumpIntent)this.jumpIntent=null;
    if(snapshot.guard?.receipt?.intentId===this.guardIntent)this.guardIntent=null;
    this.statusChanged(this.suspended||snapshot.paused?'paused':'connected',this.suspended?'Connection paused while this tab is away':snapshot.closed?'The room is closed. Its co-op save is retained':snapshot.paused?'Host disconnected · shared world paused':`${snapshot.peers.filter(p=>p.connected).length}/4 online · 4 Hz polling + jump/guard intents`);
    this.options.onSnapshot(snapshot);
  }
  private async enter(path:string,body:unknown){
    if(this.current)throw new CoopRequestError(409,'already_joined','Leave this co-op room before opening another');
    const generation=++this.generation;this.statusChanged('connecting','Connecting to the online room…');
    try{const snapshot=await this.request<CoopSnapshot>(path,body);if(generation!==this.generation)return;
      this.queue=[];this.pending=null;this.latestMove=undefined;this.jumpIntent=null;this.guardIntent=null;this.accept(snapshot);this.schedule(0);
    }catch(error){if(generation===this.generation)this.statusChanged('offline',error instanceof Error?error.message:'Could not connect');throw error;}
  }
  create(input:{name:string;world?:State;seed?:number}){return this.enter('/rooms',input);}
  join(input:{name:string;code:string}){return this.enter('/join',input);}
  resume(id:string,name?:string){return this.enter(`/rooms/${encodeURIComponent(id)}/resume`,name?{name}:{});}
  send(action:CoopAction){if(!this.canAct||this.queue.length>=24||(action.type==='guard-press'||action.type==='guard-cancel')&&!this.current?.guard||action.type==='guard-press'&&this.guardIntent!==null)return false;this.queue.push(structuredClone(action));if(action.type==='jump-press')this.jumpIntent=action.intentId;if(action.type==='guard-press')this.guardIntent=action.intentId;if(action.type==='jump-press'||action.type==='guard-press'||action.type==='guard-cancel'){if(!this.polling)this.schedule(0);}return true;}
  jump(){const intentId=crypto.randomUUID();if(!this.send({type:'jump-press',intentId}))return null;this.jumpIntent=intentId;return intentId;}
  guard(){const intentId=crypto.randomUUID();if(!this.send({type:'guard-press',intentId}))return null;return intentId;}
  move(pose:CoopMove){if(!this.canAct)return false;this.latestMove={...pose};return true;}
  private schedule(delay=COOP_POLL_MS){if(this.timer)clearTimeout(this.timer);this.timer=undefined;const bounded=Math.max(delay,Math.min(125,125-(Date.now()-this.lastPollAt)));if(!this.suspended)this.timer=setTimeout(()=>void this.poll(),bounded);}
  private async poll(){
    if(!this.current||this.polling||this.suspended)return;
    const generation=this.generation,room=this.current;this.polling=true;this.lastPollAt=Date.now();
    try{
      if(!this.pending){this.pending={seq:room.ack+1,sessionId:room.sessionId,actions:this.queue.splice(0,8),...(this.latestMove?{move:this.latestMove}:{})};this.latestMove=undefined;}
      const response=await this.request<CoopSnapshot>(`/rooms/${room.roomId}/sync`,this.pending);
      if(generation!==this.generation)return;
      this.accept(response);
      // Keep the exact operation retryable until its returned world is accepted.
      if(this.current?.roomId===room.roomId&&this.current.ack>=this.pending.seq)this.pending=null;
    }catch(error){
      if(generation!==this.generation)return;
      this.failures++;
      if(error instanceof CoopRequestError&&['session_replaced','rejoin_required','room_closed','room_not_found','sign_in_required','sequence_gap'].includes(error.code)){
        this.statusChanged('paused',error.message);this.polling=false;return;
      }
      this.statusChanged(this.suspended?'paused':'reconnecting',this.suspended?'Connection paused while this tab is away':'Connection interrupted · actions paused · retrying safely');
    }finally{if(generation===this.generation)this.polling=false;}
    if(generation===this.generation&&this.current)this.schedule(this.failures?Math.min(5000,500*2**Math.min(4,this.failures-1)):this.queue.some(a=>a.type==='jump-press'||a.type==='guard-press'||a.type==='guard-cancel')?0:COOP_POLL_MS);
  }
  async leave(closeRoom=false){
    const room=this.current;if(!room)return;
    // Let the server decide ownership. Never clear the last confirmed save on a failed close.
    if(closeRoom)await this.request(`/rooms/${room.roomId}/close`,{sessionId:room.sessionId});
    else await this.request(`/rooms/${room.roomId}/leave`,{sessionId:room.sessionId});
    this.disconnect();
  }
  /** A local disconnect restores solo immediately; server leases expire even if the network is down. */
  disconnect(){
    this.generation++;if(this.timer)clearTimeout(this.timer);this.timer=undefined;
    this.current=null;this.pending=null;this.queue=[];this.latestMove=undefined;this.polling=false;this.jumpIntent=null;this.guardIntent=null;
    this.statusChanged('offline','Solo campaign restored');this.options.onLeave?.();
  }
}
