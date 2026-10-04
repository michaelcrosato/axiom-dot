import {createConversationMemory,validConversationMemory} from './npc-conversation.ts';
export const CONVERSATION_STORAGE_KEY='axiom-conversations-v1';
export const CONVERSATION_WORLD_LIMIT=4;
export const CONVERSATION_STORAGE_LIMIT=262144;
export type DialogueMemory=ReturnType<typeof createConversationMemory>;
interface MemoryEnvelope {version:1;worlds:{seed:number;memory:DialogueMemory}[]}
export function conversationEnvelope(raw:string|null):MemoryEnvelope{
 const empty:MemoryEnvelope={version:1,worlds:[]};if(!raw||raw.length>CONVERSATION_STORAGE_LIMIT)return empty;
 try{const value=JSON.parse(raw);if(!value||Object.keys(value).sort().join(',')!=='version,worlds'||value.version!==1||!Array.isArray(value.worlds)||value.worlds.length>CONVERSATION_WORLD_LIMIT)return empty;
  const seen=new Set<number>();for(const world of value.worlds){if(!world||Object.keys(world).sort().join(',')!=='memory,seed'||!Number.isInteger(world.seed)||world.seed<0||world.seed>0xffffffff||seen.has(world.seed))return empty;seen.add(world.seed);if(!validConversationMemory(world.memory,world.seed))return empty;}return value;
 }catch{return empty;}
}
export function readConversationMemory(storage:Pick<Storage,'getItem'>,seed:number):DialogueMemory{
 try{return conversationEnvelope(storage.getItem(CONVERSATION_STORAGE_KEY)).worlds.find(w=>w.seed===seed)?.memory??createConversationMemory(seed);}catch{return createConversationMemory(seed);}
}
export function storeConversationMemory(storage:Pick<Storage,'getItem'|'setItem'>,seed:number,memory:DialogueMemory):boolean{
 try{if(!validConversationMemory(memory,seed))return false;const envelope=conversationEnvelope(storage.getItem(CONVERSATION_STORAGE_KEY));envelope.worlds=envelope.worlds.filter(w=>w.seed!==seed).slice(-(CONVERSATION_WORLD_LIMIT-1));envelope.worlds.push({seed,memory});const raw=JSON.stringify(envelope);if(raw.length>CONVERSATION_STORAGE_LIMIT)return false;storage.setItem(CONVERSATION_STORAGE_KEY,raw);return true;}catch{return false;}
}
export interface ConversationPresence {seed:number;zone:string;hp:number;ready:boolean;online:boolean;canAct:boolean;position:{x:number;y:number;z:number};npc?:{x:number;y:number;z:number}|undefined}
export function conversationInterruption(start:{seed:number;zone:string;hp:number},now:ConversationPresence):string|null{
 if(now.seed!==start.seed||now.zone!==start.zone)return 'The journey moved on.';
 if(!now.ready||now.online&&!now.canAct)return 'The conversation was interrupted.';
 if(now.hp<start.hp)return 'Danger interrupts the conversation.';
 if(!now.npc||!Object.values(now.npc).every(Number.isFinite))return 'Your paths part for now.';
 if(Math.hypot(now.position.x-now.npc.x,now.position.z-now.npc.z,now.position.y-now.npc.y)>8)return 'Your paths part for now.';
 return null;
}
/** Pure pose-only framing: no mutation of camera preferences or world coordinates. */
export function conversationFraming(player:{x:number;y:number;z:number},npc:{x:number;y:number;z:number},zoom:number,blend:number,orbit=0,portrait=false){
 const t=Math.max(0,Math.min(1,Number.isFinite(blend)?blend:0));
 const distance=zoom+(Math.min(zoom,14)-zoom)*t,offset=distance*(portrait?.52:.30)*t;
 return {x:player.x+(npc.x-player.x)*.5*t+Math.sin(orbit)*offset,y:player.y+1+(npc.y-player.y)*.5*t,z:player.z+(npc.z-player.z)*.5*t+Math.cos(orbit)*offset,distance};
}
