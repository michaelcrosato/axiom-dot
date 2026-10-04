import {hashSeed} from './procedural.ts';
import {townResidentAddress,TOWN_HOUSE_COUNT} from './town-residents.ts';
/** Additive regional town. Legacy valley plans, residents and quest IDs are untouched. */
export const TOWN_VERSION=1 as const;
/** Layout revision is independent of the unchanged v1 finite trade/save ledger. */
export const TOWN_LAYOUT_VERSION=2 as const;
export const TOWN_BOUNDS=Object.freeze({halfWidth:60,halfDepth:62});
export const TOWN_HOME_ROAD_OFFSETS=Object.freeze([-24,24,-44,44] as const);
export const TOWN_CENTER=Object.freeze({x:-176,y:6,z:-144});
export const TOWN_SPAWN=Object.freeze({x:TOWN_CENTER.x,y:6,z:TOWN_CENTER.z+8});
export const TOWN_NAME='Hearthmere';
export const TOWN_SHOP_NAMES=['Trail & Tin Supplies','Ember Smithy','Second Life Salvage','The Copper Kettle','Lantern House Inn','Greenlight Apothecary','Wayfarer Outfitter'] as const;
export interface TownBox{id:string;center:{x:number;y:number;z:number};half:{x:number;y:number;z:number};material:string;solid:boolean}
export interface TownBuilding{id:string;name:string;entry:{x:number;z:number};center:{x:number;z:number};shopIndex?:number;homeIndex?:number;boxes:TownBox[]}
export interface TownPlan{version:1;layoutVersion:typeof TOWN_LAYOUT_VERSION;seed:number;id:string;center:typeof TOWN_CENTER;spawn:typeof TOWN_SPAWN;shops:TownBuilding[];homes:TownBuilding[];boxes:TownBox[]}
const plans=new Map<number,TownPlan>();
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function townReserved(x:number,z:number,margin=0){return Math.abs(x-TOWN_CENTER.x)<TOWN_BOUNDS.halfWidth+margin&&Math.abs(z-TOWN_CENTER.z)<TOWN_BOUNDS.halfDepth+margin;}
export function townTerrainHeight(x:number,z:number,original:number){const d=Math.max(Math.abs(x-TOWN_CENTER.x)-TOWN_BOUNDS.halfWidth,Math.abs(z-TOWN_CENTER.z)-TOWN_BOUNDS.halfDepth,0);if(d>=20)return original;const t=Math.min(1,d/20),blend=t*t*(3-2*t);return Math.fround(6+(original-6)*blend);}
export function startingTown(seed:number):TownPlan{
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw RangeError('Invalid town seed');const known=plans.get(seed);if(known)return known;
 const id=`town:1:${seed}`,shops:TownBuilding[]=[],homes:TownBuilding[]=[],boxes:TownBox[]=[];
 const building=(key:string,name:string,x:number,z:number,front:number,shopIndex?:number,homeIndex?:number)=>{
  const width=shopIndex===undefined?5.6:9,depth=shopIndex===undefined?6:8,height=shopIndex===4?4.4:3.2,entry={x,z:z+front*(depth/2+3)},b:TownBuilding={id:`${id}/${key}`,name,center:{x,z},entry,boxes:[],...(shopIndex===undefined?{}:{shopIndex}),...(homeIndex===undefined?{}:{homeIndex})};
  const box=(part:string,dx:number,dy:number,dz:number,hx:number,hy:number,hz:number,material:string,solid=true)=>{const v={id:`${b.id}/structure/${part}`,center:{x:x+dx,y:6+dy,z:z+dz},half:{x:hx,y:hy,z:hz},material,solid};b.boxes.push(v);boxes.push(v);};
  box('back',0,height/2,-front*depth/2,width/2,height/2,.18,'town-stone');
  box('west',-width/2,height/2,0,.18,height/2,depth/2,'town-timber');box('east',width/2,height/2,0,.18,height/2,depth/2,'town-timber');
  box('roof',0,height+.15,0,width/2+.45,.22,depth/2+.4,`town-roof-${shopIndex??homeIndex!%3}`);
  // A 2.2 m open doorway. No invisible front wall or interior teleport.
  for(const side of [-1,1])box('front-'+side,side*(width/4+.55),height/2,front*depth/2,(width-2.2)/4,height/2,.18,'town-stone');
  box('lintel',0,height-.35,front*depth/2,1.1,.35,.18,'town-timber');
  if(shopIndex!==undefined){box('counter',0,.45,-front*(depth/2-1.2),width*.32,.45,.55,'town-timber');box('sign',width/2-.4,2.35,front*(depth/2+.3),1,.3,.08,'town-marker',false);}
  return b;
 };
 for(let i=0;i<7;i++)shops.push(building(`shop/${i}`,TOWN_SHOP_NAMES[i]!,TOWN_CENTER.x-36+i*12,TOWN_CENTER.z-7,1,i));
 const xs=[-40,-32,-24,-16,-8,8,16,24,32,40];
 // Preserve the original twenty building IDs, entrances and geometry exactly.
 for(const distance of [30,50])for(const side of [-1,1])for(const dx of xs){const i=homes.length;homes.push(building(`home/${i}`,townResidentAddress(i),TOWN_CENTER.x+dx,TOWN_CENTER.z+side*distance,-side,undefined,i));}
 if(homes.length!==TOWN_HOUSE_COUNT)throw new Error('Town housing contract mismatch');
 // Plinth, trough and lamps are outside the collision-free square and lane centerlines.
 for(const dx of [-53,53])for(const dz of [-16,16])boxes.push({id:`${id}/lamp/${dx}/${dz}`,center:{x:TOWN_CENTER.x+dx,y:7.7,z:TOWN_CENTER.z+dz},half:{x:.16,y:1.7,z:.16},material:'town-marker',solid:true});
 const plan=freeze({version:1 as const,layoutVersion:TOWN_LAYOUT_VERSION,seed,id,center:TOWN_CENTER,spawn:TOWN_SPAWN,shops,homes,boxes});if(plans.size>=4)plans.delete(plans.keys().next().value!);plans.set(seed,plan);return plan;
}
export function townChunkBoxes(seed:number,cx:number,cz:number){return startingTown(seed).boxes.filter(b=>Math.floor(b.center.x/64)===cx&&Math.floor(b.center.z/64)===cz);}
export function safeTownPosition(seed:number,p:{x:number;z:number}){const blocked=startingTown(seed).boxes.some(b=>b.solid&&b.center.y-b.half.y<8.2&&b.center.y+b.half.y>6.05&&Math.abs(p.x-b.center.x)<b.half.x+.4&&Math.abs(p.z-b.center.z)<b.half.z+.4);return blocked?{x:TOWN_SPAWN.x,z:TOWN_SPAWN.z}:{...p};}
export type TownResource='scrap'|'core'|'water';
export interface TownOffer{id:string;shopIndex:number;label:string;cost:Record<TownResource,number>;gain:Record<TownResource,number>;heal:number;stock:number}
const amount=(scrap=0,core=0,water=0)=>({scrap,core,water});
export const TOWN_OFFERS:readonly TownOffer[]=freeze([
 {id:'arrival-kit',shopIndex:0,label:'New arrival kit · once per world',cost:amount(),gain:amount(3,0,1),heal:0,stock:1},
 {id:'water-canister',shopIndex:0,label:'Sealed water canister',cost:amount(1),gain:amount(0,0,1),heal:0,stock:12},
 {id:'power-core',shopIndex:1,label:'Reconditioned power core',cost:amount(3),gain:amount(0,1),heal:0,stock:4},
 {id:'salvage-bundle',shopIndex:2,label:'Two machine scrap',cost:amount(0,1),gain:amount(2),heal:0,stock:8},
 {id:'hot-meal',shopIndex:3,label:'Hot meal · restore 20 suit HP',cost:amount(0,0,1),gain:amount(),heal:20,stock:12},
 {id:'rest',shopIndex:4,label:'Rest and repairs · restore 40 suit HP',cost:amount(2),gain:amount(),heal:40,stock:8},
 {id:'treatment',shopIndex:5,label:'Full treatment · restore suit to 100 HP',cost:amount(0,1),gain:amount(),heal:100,stock:4},
]);
export const TOWN_LEDGER_HASH=hashSeed(JSON.stringify(TOWN_OFFERS)).toString(16);
export interface TownReceipt{offerId:string;hpBefore:number;hpAfter:number}
export interface TownState{version:1;manifestHash:string;revision:number;receipts:TownReceipt[]}
export interface TownCommand{offerId:string;expectedRevision:number}
export const createTownState=():TownState=>freeze({version:1,manifestHash:TOWN_LEDGER_HASH,revision:0,receipts:[]});
const keys=(v:unknown,names:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!,'value'));
export function validTownCommand(v:unknown):v is TownCommand{return keys(v,['offerId','expectedRevision'])&&TOWN_OFFERS.some(o=>o.id===v.offerId)&&Number.isSafeInteger(v.expectedRevision)&&(v.expectedRevision as number)>=0&&(v.expectedRevision as number)<49;}
export function validTownState(v:unknown):v is TownState{
 if(!keys(v,['version','manifestHash','revision','receipts'])||v.version!==1||v.manifestHash!==TOWN_LEDGER_HASH||!Array.isArray(v.receipts)||v.receipts.length>49||v.revision!==v.receipts.length)return false;
 const array=v.receipts;if(Object.getPrototypeOf(array)!==Array.prototype||Reflect.ownKeys(array).length!==array.length+1)return false;for(let n=0;n<array.length;n++){const descriptor=Object.getOwnPropertyDescriptor(array,String(n));if(!descriptor||!Object.hasOwn(descriptor,'value'))return false;}
 const count=new Map<string,number>();
 for(const r of v.receipts){if(!keys(r,['offerId','hpBefore','hpAfter']))return false;const o=TOWN_OFFERS.find(o=>o.id===r.offerId);if(!o||typeof r.hpBefore!=='number'||!Number.isFinite(r.hpBefore)||r.hpBefore<=0||r.hpBefore>100||r.hpAfter!==Math.min(100,r.hpBefore+o.heal)||o.heal>0&&r.hpBefore>=100)return false;const n=(count.get(o.id)??0)+1;if(n>o.stock)return false;count.set(o.id,n);}return true;
}
export function townBalance(town?:TownState){const spent=amount(),exported=amount();for(const r of town?.receipts??[]){const o=TOWN_OFFERS.find(o=>o.id===r.offerId)!;if(!o)continue;for(const k of ['scrap','core','water'] as const){spent[k]+=o.cost[k];exported[k]+=o.gain[k];}}return {spent,exported,net:{scrap:spent.scrap-exported.scrap,core:spent.core-exported.core,water:spent.water-exported.water}};}
export function townStock(town:TownState,offerId:string){const o=TOWN_OFFERS.find(o=>o.id===offerId);return o?o.stock-town.receipts.filter(r=>r.offerId===offerId).length:0;}
/** Stocked service counters remain usable during the keeper’s home/social routine. */
export function purchaseTown(town:TownState,context:{seed:number;zone:string;player:{x:number;z:number;hp:number};inventory:Record<TownResource,number>},command:TownCommand){
 if(!validTownCommand(command)||!validTownState(town)||command.expectedRevision!==town.revision||context.zone!=='valley'||context.player.hp<=0)return null;
 const o=TOWN_OFFERS.find(o=>o.id===command.offerId)!,entry=startingTown(context.seed).shops[o.shopIndex]!.entry;
 if(Math.hypot(context.player.x-entry.x,context.player.z-entry.z)>3.5||townStock(town,o.id)<=0||o.heal>0&&context.player.hp>=100||(['scrap','core','water'] as const).some(k=>!Number.isSafeInteger(context.inventory[k])||context.inventory[k]<o.cost[k]))return null;
 const inventory={...context.inventory};for(const k of ['scrap','core','water'] as const)inventory[k]+=o.gain[k]-o.cost[k];const hp=Math.min(100,context.player.hp+o.heal);
 return {town:freeze({...town,revision:town.revision+1,receipts:[...town.receipts,{offerId:o.id,hpBefore:context.player.hp,hpAfter:hp}]}),inventory,hp,message:`${TOWN_SHOP_NAMES[o.shopIndex]}: ${o.label}. Receipt ${town.revision+1}; ${townStock(town,o.id)-1} remaining.`};
}
