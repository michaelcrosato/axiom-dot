import {createState,createConnectedState,createRegionalState,createOrganicRegionalState,parseSave,serializeSave,type State} from './world.ts';
export interface SaveStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;readonly length?:number;key?(index:number):string|null}
export const ACTIVE_WORLD_KEY='axiom-active-world';
export const LEGACY_SAVE_KEY='axiom-save-v1';
export function saveKey(s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return s.regional?.version===1?`axiom-save-region1-${s.seed}${s.townLayout?'-layout3':''}`:`axiom-save-valley${s.generation}-${s.seed}`;}
export function sameWorld(a:Pick<State,'generation'|'seed'|'regional'|'townLayout'>,b:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return a.generation===b.generation&&a.seed===b.seed&&a.regional?.version===b.regional?.version&&a.townLayout?.manifestHash===b.townLayout?.manifestHash;}
export function loadSlot(storage:SaveStorage,key:string):State|null {
 if(key!==LEGACY_SAVE_KEY&&!/^axiom-save-(?:valley[12]|region1)-\d{1,10}(?:-layout3)?$/.test(key))return null;
 if(key!==LEGACY_SAVE_KEY){const epoch=readSessionEpoch(storage,key);if(epoch)return validSlotText(epoch.current,key)??validSlotText(epoch.backup,key);}
 for(const candidate of [key,key===LEGACY_SAVE_KEY?'axiom-save-backup-v1':`${key}-backup`]){const s=parseSave(storage.getItem(candidate)??'');if(s&&(saveKey(s)===key||key===LEGACY_SAVE_KEY&&s.generation===1)){if(key===LEGACY_SAVE_KEY){const epoch=readSessionEpoch(storage,saveKey(s));if(epoch)return validSlotText(epoch.current,saveKey(s))??validSlotText(epoch.backup,saveKey(s));}return s;}}return null;
}
/** Resolve an original legacy alias without selecting a different seed. */
export function loadSavedWorld(storage:SaveStorage,identity:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):State|null {const current=loadSlot(storage,saveKey(identity));if(current)return current;const legacy=identity.generation===1?loadSlot(storage,LEGACY_SAVE_KEY):null;return legacy&&sameWorld(legacy,identity)?legacy:null;}
/** Read-only startup. Old saves are never upgraded into a different foundation. */
export function loadSession(storage:SaveStorage):State {
 const selected=storage.getItem(ACTIVE_WORLD_KEY);if(selected){const state=loadSlot(storage,selected);if(state)return state;}
 const legacy=loadSlot(storage,LEGACY_SAVE_KEY);if(legacy)return loadSlot(storage,saveKey(legacy))??legacy;
 return loadSlot(storage,'axiom-save-valley2-73129')??savedWorlds(storage)[0]?.state??loadSlot(storage,'axiom-save-region1-73129')??createOrganicRegionalState(73129);
}
export function storeSession(storage:SaveStorage,state:State,activate=false,expectedRevision?:number){
 const key=saveKey(state),epoch=readSessionEpoch(storage,key);
 assertSessionRevision(epoch?.epoch??0,expectedRevision);
 const serialized=serializeSave(state);
 assertPreUpgradeCheckpoint(storage,state);
 preservePreProceduralSave(storage,state);
 preservePreTownLifeSave(storage,state);
 preservePreRegionalFoodSave(storage,state);
 preservePreRegionalTradeSave(storage,state);
 preservePreRegionalSupplySave(storage,state);
 preservePreContactSave(storage,state);
 preservePreWaterRequestsSave(storage,state);
 preservePreCommonsTradeSave(storage,state);
 preservePreEditedEquipmentSave(storage,state);
 preservePreUpgradeSave(storage,state);
 // Check again after checkpoint staging in case another tab committed a reset.
 if(expectedRevision!==undefined)assertSessionRevision(sessionResetRevision(storage,state),expectedRevision);
 if(epoch){const backup=validSlotText(epoch.current,key)?epoch.current:epoch.backup;storage.setItem(sessionEpochKey(state),JSON.stringify({...epoch,current:serialized,backup}));if(activate&&storage.getItem(ACTIVE_WORLD_KEY)!==key)storage.setItem(ACTIVE_WORLD_KEY,key);return;}
 const backup=`${key}-backup`,old=storage.getItem(key),parsed=old?parseSave(old):null;
 const prior=parsed&&saveKey(parsed)===key?old!:storage.getItem(backup)??serialized;
 storage.setItem(backup,prior);storage.setItem(key,serialized);if(activate)storage.setItem(ACTIVE_WORLD_KEY,key);
}
/** A seed with prior progress is resumed rather than overwritten. */
export function selectSeed(storage:SaveStorage,seed:number):State {const next=createConnectedState(seed);return loadSlot(storage,saveKey(next))??next;}
/** Regional seeds occupy their own slots even when a connected valley uses the same seed. */
export function selectRegionalSeed(storage:SaveStorage,seed:number):State {const next=createOrganicRegionalState(seed);return loadSlot(storage,`axiom-save-region1-${seed}`)??loadSlot(storage,saveKey(next))??next;}
export function savedWorlds(storage:SaveStorage){
 const result=new Map<string,{key:string;state:State}>(),keys=new Set([LEGACY_SAVE_KEY]);
 for(let i=0;i<(storage.length??0);i++){const key=storage.key?.(i);if(key&&/^axiom-save-(?:valley[12]|region1)-\d{1,10}(?:-layout3)?(?:-backup|-session-v1)?$/.test(key))keys.add(key.replace(/(?:-backup|-session-v1)$/,''));}
 for(const key of keys){const state=loadSlot(storage,key);if(state)result.set(saveKey(state),{key,state});}
 return [...result.values()].sort((a,b)=>a.state.generation-b.state.generation||a.state.seed-b.state.seed||Number(!!a.state.regional)-Number(!!b.state.regional));
}

/** Immutable pre-pack checkpoint. Later rolling autosave backups never overwrite it. */
export function preUpgradeKey(s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return `${saveKey(s)}-before-overnight-2026-10-01`;}
function hasOvernightPacks(s:State){return !!(s.encounters||s.economy||s.caveWater||s.ecology||s.caveSupply||s.causal?.commonsTrade||s.causal?.waterRequests||s.equipment?.active?.version===2);}
function compatibleBeforeUpgrade(raw:string|null,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):raw is string {if(!raw)return false;const parsed=parseSave(raw);return !!parsed&&sameWorld(parsed,s)&&!hasOvernightPacks(parsed);}
function rollbackCheckpointError(message:string):never {const error=new Error(message);error.name='RollbackCheckpointError';throw error;}
function assertPreUpgradeCheckpoint(storage:SaveStorage,s:State){if(!hasOvernightPacks(s))return;const raw=storage.getItem(preUpgradeKey(s));if(raw!==null&&!compatibleBeforeUpgrade(raw,s))rollbackCheckpointError('Pre-overnight rollback checkpoint is invalid');}
export function preUpgradeSave(storage:SaveStorage,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):string|null {const raw=storage.getItem(preUpgradeKey(s));return compatibleBeforeUpgrade(raw,s)?raw:null;}
function preservePreUpgradeSave(storage:SaveStorage,s:State){
 if(!hasOvernightPacks(s)||storage.getItem(preUpgradeKey(s))!==null)return;
 const candidates=saveCandidates(storage,s);
 for(const raw of candidates)if(compatibleBeforeUpgrade(raw,s)){storage.setItem(preUpgradeKey(s),raw);return;}
}
/** Read-only exact-byte recovery export; never silently serialize an upgraded in-memory world. */
export function storedSaveText(storage:SaveStorage,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):string|null {
 for(const raw of saveCandidates(storage,s)){if(!raw)continue;const parsed=parseSave(raw);if(parsed&&sameWorld(parsed,s))return raw;}
 return null;
}

/** Immutable last compatible raw save before the first persisted custom equipment ref. */
export function preEditedEquipmentKey(s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return `${saveKey(s)}-before-edited-equipment-v2`;}
function compatibleBeforeEditedEquipment(raw:string|null,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):raw is string {
 if(!raw)return false;const parsed=parseSave(raw);return !!parsed&&sameWorld(parsed,s)&&parsed.equipment?.active?.version!==2;
}
/** Return original bytes for direct Blob export; never reserialize or fabricate a downgraded world. */
export function preEditedEquipmentSave(storage:SaveStorage,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):string|null {
 const raw=storage.getItem(preEditedEquipmentKey(s));return compatibleBeforeEditedEquipment(raw,s)?raw:null;
}
function preservePreEditedEquipmentSave(storage:SaveStorage,s:State){
 if(s.equipment?.active?.version!==2)return;
 const key=preEditedEquipmentKey(s),existing=storage.getItem(key);
 if(existing!==null){if(!compatibleBeforeEditedEquipment(existing,s))rollbackCheckpointError('Edited-equipment rollback checkpoint is invalid');return;}
 const candidates=saveCandidates(storage,s);
 for(const raw of candidates)if(compatibleBeforeEditedEquipment(raw,s)){storage.setItem(key,raw);return;}
}

/** Last compatible raw world before household trade receipts were introduced. */
export function preCommonsTradeKey(s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return `${saveKey(s)}-before-commons-trade-v1`;}
function compatibleBeforeCommonsTrade(raw:string|null,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):raw is string {
 if(!raw)return false;const parsed=parseSave(raw);return !!parsed&&sameWorld(parsed,s)&&!Object.hasOwn(parsed.causal??{},'commonsTrade');
}
export function preCommonsTradeSave(storage:SaveStorage,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):string|null {
 const raw=storage.getItem(preCommonsTradeKey(s));return compatibleBeforeCommonsTrade(raw,s)?raw:null;
}
function preservePreCommonsTradeSave(storage:SaveStorage,s:State){
 if(!s.causal?.commonsTrade)return;
 const key=preCommonsTradeKey(s),existing=storage.getItem(key);
 if(existing!==null){if(!compatibleBeforeCommonsTrade(existing,s))rollbackCheckpointError('Household-barter rollback checkpoint is invalid');return;}
 for(const raw of saveCandidates(storage,s,false))if(compatibleBeforeCommonsTrade(raw,s)){storage.setItem(key,raw);return;}
}

/** Preserve the last raw world before recurring requests extend the renown ledger. */
export function preWaterRequestsKey(s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return `${saveKey(s)}-before-water-requests-v1`;}
function compatibleBeforeWaterRequests(raw:string|null,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):raw is string {
 if(!raw)return false;const parsed=parseSave(raw);return !!parsed&&sameWorld(parsed,s)&&!Object.hasOwn(parsed.causal??{},'waterRequests');
}
export function preWaterRequestsSave(storage:SaveStorage,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):string|null {
 const raw=storage.getItem(preWaterRequestsKey(s));return compatibleBeforeWaterRequests(raw,s)?raw:null;
}
function preservePreWaterRequestsSave(storage:SaveStorage,s:State){
 if(!s.causal?.waterRequests)return;
 const key=preWaterRequestsKey(s),existing=storage.getItem(key);
 if(existing!==null){if(!compatibleBeforeWaterRequests(existing,s))rollbackCheckpointError('Recurring-request rollback checkpoint is invalid');return;}
 for(const raw of saveCandidates(storage,s,false))if(compatibleBeforeWaterRequests(raw,s)){storage.setItem(key,raw);return;}
}

/** Exact pre-contact bytes are retained once, independently of rolling autosaves. */
export function preContactKey(s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return `${saveKey(s)}-before-player-contact-v1`;}
export function preContactSave(storage:SaveStorage,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):string|null {
 const raw=storage.getItem(preContactKey(s));if(!raw)return null;const parsed=parseSave(raw);return parsed&&sameWorld(parsed,s)&&!parsed.traversal?raw:null;
}
function preservePreContactSave(storage:SaveStorage,s:State){
 if(!s.traversal)return;const key=preContactKey(s),existing=storage.getItem(key);
 if(existing!==null){if(!preContactSave(storage,s))rollbackCheckpointError('Player-contact rollback checkpoint is invalid');return;}
 for(const raw of saveCandidates(storage,s,false)){if(!raw)continue;const old=parseSave(raw);if(old&&sameWorld(old,s)&&!old.traversal){storage.setItem(key,raw);return;}}
}

/** The first regional-supply upgrade preserves exact earlier bytes, never a
 * synthesized downgrade. A failed checkpoint write stops the outgoing save. */
export function preRegionalSupplyKey(s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return `${saveKey(s)}-before-regional-supply-v1`;}
export function preRegionalSupplySave(storage:SaveStorage,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):string|null {
 const raw=storage.getItem(preRegionalSupplyKey(s));if(!raw)return null;
 const parsed=parseSave(raw);return parsed&&sameWorld(parsed,s)&&!!parsed.regional&&!Object.hasOwn(parsed,'frontierSupply')?raw:null;
}
function preservePreRegionalSupplySave(storage:SaveStorage,s:State){
 if(!s.frontierSupply)return;const key=preRegionalSupplyKey(s),existing=storage.getItem(key);
 if(existing!==null){if(!preRegionalSupplySave(storage,s))rollbackCheckpointError('Regional settlement rollback checkpoint is invalid');return;}
 for(const raw of saveCandidates(storage,s,false)){if(!raw)continue;const old=parseSave(raw);if(old&&sameWorld(old,s)&&old.regional&&!Object.hasOwn(old,'frontierSupply')){storage.setItem(key,raw);return;}}
}

/** Preserve the exact last pre-freight save once, including completed V31 collectors.
 * No downgrade is synthesized and failure leaves the outgoing save uncommitted. */
export function preRegionalTradeKey(s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return `${saveKey(s)}-before-regional-trade-v1`;}
export function preRegionalTradeSave(storage:SaveStorage,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):string|null {
 const raw=storage.getItem(preRegionalTradeKey(s));if(!raw)return null;
 const parsed=parseSave(raw);return parsed&&sameWorld(parsed,s)&&!!parsed.regional&&!Object.hasOwn(parsed,'frontierTrade')?raw:null;
}
function preservePreRegionalTradeSave(storage:SaveStorage,s:State){
 if(!s.frontierTrade)return;const key=preRegionalTradeKey(s),existing=storage.getItem(key);
 if(existing!==null){if(!preRegionalTradeSave(storage,s))rollbackCheckpointError('Regional freight rollback checkpoint is invalid');return;}
 for(const raw of saveCandidates(storage,s,false)){if(!raw)continue;const old=parseSave(raw);if(old&&sameWorld(old,s)&&old.regional&&!Object.hasOwn(old,'frontierTrade')){storage.setItem(key,raw);return;}}
}

/** Preserve the exact pre-food campaign bytes once. Existing collector, freight,
 * garden and player progress are never synthesized from an upgraded state. */
export function preRegionalFoodKey(s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return `${saveKey(s)}-before-regional-food-v1`;}
export function preRegionalFoodSave(storage:SaveStorage,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):string|null {
 const raw=storage.getItem(preRegionalFoodKey(s));if(!raw)return null;
 const parsed=parseSave(raw);return parsed&&sameWorld(parsed,s)&&!!parsed.regional&&!Object.hasOwn(parsed,'frontierFood')?raw:null;
}
function preservePreRegionalFoodSave(storage:SaveStorage,s:State){
 if(!s.frontierFood)return;const key=preRegionalFoodKey(s),existing=storage.getItem(key);
 if(existing!==null){if(!preRegionalFoodSave(storage,s))rollbackCheckpointError('Regional food rollback checkpoint is invalid');return;}
 for(const raw of saveCandidates(storage,s,false)){if(!raw)continue;const old=parseSave(raw);if(old&&sameWorld(old,s)&&old.regional&&!Object.hasOwn(old,'frontierFood')){storage.setItem(key,raw);return;}}
}

/** A restart commits one atomic record. Original slot bytes and every checkpoint remain intact. */
interface SessionEpoch {version:1;epoch:number;current:string;backup:string;recoveryKey:string}
type WorldIdentity=Pick<State,'generation'|'seed'|'regional'|'townLayout'>;
export function sessionEpochKey(s:WorldIdentity){return `${saveKey(s)}-session-v1`;}
/** Capture at document boot; ordinary saves must retain this revision until reload. */
export function sessionResetRevision(storage:SaveStorage,s:WorldIdentity):number {return readSessionEpoch(storage,saveKey(s))?.epoch??0;}
function assertSessionRevision(actual:number,expected:number|undefined){if(expected!==undefined&&expected!==actual){const error=new Error('This tab belongs to an older local session. Reload before saving.');error.name='StaleSessionError';throw error;}}
function validSlotText(raw:string,key:string):State|null {const state=parseSave(raw);return state&&saveKey(state)===key?state:null;}
function resetError(message:string):never {const error=new Error(message);error.name='SessionResetError';throw error;}
function readSessionEpoch(storage:SaveStorage,key:string):SessionEpoch|null {
 const raw=storage.getItem(`${key}-session-v1`);if(raw===null)return null;
 let value:unknown;try{value=JSON.parse(raw);}catch{resetError('The recoverable session record is invalid. Export your stored save before continuing.');}
 if(!value||typeof value!=='object')resetError('The recoverable session record is invalid');
 const epoch=value as SessionEpoch;
 if(epoch.version!==1||!Number.isSafeInteger(epoch.epoch)||epoch.epoch<1||typeof epoch.current!=='string'||typeof epoch.backup!=='string'||typeof epoch.recoveryKey!=='string'||!epoch.recoveryKey.startsWith(`${key}-before-`)||!/^(reset|restore)-([1-9]\d*)$/.test(epoch.recoveryKey.slice(`${key}-before-`.length))||!(validSlotText(epoch.current,key)||validSlotText(epoch.backup,key)))resetError('The recoverable session record is invalid');
 return epoch;
}
function saveCandidates(storage:SaveStorage,s:WorldIdentity,legacy=true):(string|null)[]{
 const epoch=readSessionEpoch(storage,saveKey(s));
 if(epoch)return [epoch.current,epoch.backup];
 return [storage.getItem(saveKey(s)),storage.getItem(saveKey(s)+'-backup'),...(legacy&&s.generation===1?[storage.getItem(LEGACY_SAVE_KEY),storage.getItem('axiom-save-backup-v1')]:[])];
}
/** Original pre-restart checkpoint, protected across autosaves, recovery and later restarts. No writes. */
export function preResetSave(storage:SaveStorage,s:WorldIdentity):string|null {
 const epoch=readSessionEpoch(storage,saveKey(s));if(!epoch)return null;
 const raw=storage.getItem(epoch.recoveryKey);return raw&&validSlotText(raw,saveKey(s))?raw:null;
}
export type SessionResetKind='restart'|'restore';
export interface SessionResetResult {state:State;committed:boolean}
/**
 * Prepare only after entering the solo confirmation UI. Preparation is read-only;
 * Cancel must discard this operation without calling commit. Keep the operation
 * for that confirmation so repeated clicks cannot reset twice. On success block
 * old-epoch autosaves, retire workers/input/async results, and reload the document:
 * same-world restoreWorld cannot rebuild all boot-time procedural/runtime state.
 * Optional checkpointKey selects one exact archive returned by sessionRecoverySaves;
 * selection is read-only and never changes the original protected recovery.
 */
export function createSessionResetOperation(storage:SaveStorage,current:State,kind:SessionResetKind='restart',checkpointKey?:string):{commit():SessionResetResult} {
 if(kind!=='restart'&&kind!=='restore')resetError('Unknown session operation');
 if(checkpointKey!==undefined&&(kind!=='restore'||!checkpointKey.startsWith(`${saveKey(current)}-before-`)||!/^(reset|restore)-([1-9]\d*)$/.test(checkpointKey.slice(`${saveKey(current)}-before-`.length))))resetError('Invalid recovery checkpoint selection');
 const key=saveKey(current),snapshot=serializeSave(current),epochRaw=storage.getItem(sessionEpochKey(current)),previous=readSessionEpoch(storage,key),selected=storage.getItem(ACTIVE_WORLD_KEY);
 if(!sameWorld(loadSession(storage),current))resetError('The selected local world changed. Reload before restarting.');
 const stored=storedSaveText(storage,current),before=stored&&serializeSave(parseSave(stored)!)===snapshot?stored:snapshot;
 const recoveryKey=kind==='restore'?checkpointKey??previous?.recoveryKey:undefined;
 const recoveryRaw=recoveryKey?storage.getItem(recoveryKey):null;
 const recovered=recoveryRaw&&validSlotText(recoveryRaw,key)?recoveryRaw:null;
 if(kind==='restore'&&!recovered)resetError('No valid pre-restart checkpoint exists for this world');
 const next=kind==='restore'?parseSave(recovered!)!:current.regional?.version===1?(current.townLayout?createOrganicRegionalState(current.seed):createRegionalState(current.seed)):current.generation===1?createState(current.seed):createConnectedState(current.seed);
 const serialized=kind==='restore'?recovered!:serializeSave(next);
 let committed=false;
 return {commit(){
  if(committed)return {state:parseSave(serialized)!,committed:false};
  // A newer reset, autosave or world selection invalidates an old confirmation.
  if(storage.getItem(sessionEpochKey(current))!==epochRaw||storage.getItem(ACTIVE_WORLD_KEY)!==selected||storedSaveText(storage,current)!==stored||!sameWorld(loadSession(storage),current)||serializeSave(current)!==snapshot||recoveryKey!==undefined&&storage.getItem(recoveryKey)!==recovered)resetError('The local session changed. Open a new confirmation and try again.');
  let epoch=(previous?.epoch??0)+1,checkpoint='';
  for(let attempts=0;attempts<1000;attempts++,epoch++){
   if(!Number.isSafeInteger(epoch))resetError('Session checkpoint limit reached');
   checkpoint=`${key}-before-${kind==='restart'?'reset':'restore'}-${epoch}`;
   const existing=storage.getItem(checkpoint);if(existing===null||existing===before)break;
   checkpoint='';
  }
  if(!checkpoint)resetError('Could not allocate a protected session checkpoint');
  if(storage.getItem(checkpoint)===null)storage.setItem(checkpoint,before);
  // This single atomic write is the commit point; no active pointer or source
  // save is overwritten. Failed staging/commit can leave only a safe checkpoint.
  const record:SessionEpoch={version:1,epoch,current:serialized,backup:before,recoveryKey:previous?previous.recoveryKey:kind==='restart'?checkpoint:recoveryKey!};
  storage.setItem(sessionEpochKey(current),JSON.stringify(record));
  committed=true;return {state:parseSave(serialized)!,committed:true};
 }};
}
/** Convenience APIs for callers that already guard each user confirmation exactly once. */
export function restartSession(storage:SaveStorage,current:State):State {return createSessionResetOperation(storage,current,'restart').commit().state;}
export function restoreResetSession(storage:SaveStorage,current:State,checkpointKey?:string):State {return createSessionResetOperation(storage,current,'restore',checkpointKey).commit().state;}

export interface SessionRecoverySave {key:string;raw:string;kind:SessionResetKind;epoch:number}
/** Exact portable exports of every retained run, newest first. No mutation or migrations. */
export function sessionRecoverySaves(storage:SaveStorage,s:WorldIdentity):SessionRecoverySave[]{
 const prefix=`${saveKey(s)}-before-`,keys=new Set<string>();
 for(let i=0;i<(storage.length??0);i++){const key=storage.key?.(i);if(key?.startsWith(prefix))keys.add(key);}
 // Also works for a minimal storage adapter without key enumeration, and remains
 // usable for rescue exports when the current epoch payload itself is corrupt.
 try{const raw=storage.getItem(sessionEpochKey(s)),epoch=raw?JSON.parse(raw):null;if(typeof epoch?.recoveryKey==='string'&&epoch.recoveryKey.startsWith(prefix))keys.add(epoch.recoveryKey);}catch{}
 const result:SessionRecoverySave[]=[];
 for(const key of keys){const match=/^(reset|restore)-([1-9]\d*)$/.exec(key.slice(prefix.length));if(!match)continue;const epoch=Number(match[2]);if(!Number.isSafeInteger(epoch))continue;const raw=storage.getItem(key);if(raw&&validSlotText(raw,saveKey(s)))result.push({key,raw,kind:match[1]==='reset'?'restart':'restore',epoch});}
 return result.sort((a,b)=>b.epoch-a.epoch||a.key.localeCompare(b.key));
}

/** Exact pre-autonomy checkpoint; historical saves never simulate elapsed history on upgrade. */
export function preTownLifeKey(s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return `${saveKey(s)}-before-town-life-v1`;}
export function preTownLifeSave(storage:SaveStorage,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):string|null {
 const raw=storage.getItem(preTownLifeKey(s));if(!raw)return null;const parsed=parseSave(raw);return parsed&&sameWorld(parsed,s)&&!Object.hasOwn(parsed,'townLife')?raw:null;
}
function preservePreTownLifeSave(storage:SaveStorage,s:State){
 if(!s.townLife)return;const key=preTownLifeKey(s),existing=storage.getItem(key);
 if(existing!==null){if(!preTownLifeSave(storage,s))rollbackCheckpointError('Town-life rollback checkpoint is invalid');return;}
 for(const raw of saveCandidates(storage,s,false)){if(!raw)continue;const old=parseSave(raw);if(old&&sameWorld(old,s)&&!Object.hasOwn(old,'townLife')){storage.setItem(key,raw);return;}}
}

/** Exact pre-addition bytes, retained once before procedural request/restoration packs. */
export function preProceduralKey(s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>){return `${saveKey(s)}-before-procedural-v1`;}
export function preProceduralSave(storage:SaveStorage,s:Pick<State,'generation'|'seed'|'regional'|'townLayout'>):string|null {const raw=storage.getItem(preProceduralKey(s));if(!raw)return null;const old=parseSave(raw);return old&&sameWorld(old,s)&&!Object.hasOwn(old,'townDirector')&&!Object.hasOwn(old,'restoration')?raw:null;}
function preservePreProceduralSave(storage:SaveStorage,s:State){
 if(!Object.hasOwn(s,'townDirector')&&!Object.hasOwn(s,'restoration'))return;const key=preProceduralKey(s),existing=storage.getItem(key);
 if(existing!==null){if(!preProceduralSave(storage,s))rollbackCheckpointError('Procedural rollback checkpoint is invalid');return;}
 for(const raw of saveCandidates(storage,s,false)){if(!raw)continue;const old=parseSave(raw);if(old&&sameWorld(old,s)&&!Object.hasOwn(old,'townDirector')&&!Object.hasOwn(old,'restoration')){storage.setItem(key,raw);return;}}
}
