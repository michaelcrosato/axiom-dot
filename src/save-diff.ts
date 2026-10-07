import {validTownLayout} from './starting-town.ts';
import {GENERATION_MANIFEST,CONNECTED_GENERATION_MANIFEST,type GenerationManifest} from './generation-manifest.ts';
/** A read-only projection, never a save loader. Free-form events, names, URLs, room/session
 * IDs, credentials and unlisted state fields are neither read nor exported. */
export const SAVE_DIFF_VERSION=1 as const;
export const SAVE_DIFF_MAX_BYTES=262144;
export const SAVE_DIFF_RAW_MAX_BYTES=2097152;
export const SAVE_DIFF_REPORT_MAX_BYTES=1048576;
const NEEDS=['nourishment','energy','hygiene','comfort','connection','fulfillment'] as const;
const RESOURCES=['pantry','water','materials','harvest'] as const;
const ITEMS=['scrap','core','water'] as const;
const JOBS=['commission','reserve','service'] as const;
type Scalar=number|string|boolean|null;
type Data=Scalar|Data[]|{[key:string]:Data};
type Spec={kind:'number';max:number;integer?:boolean}|{kind:'enum';values:readonly Scalar[]}|{kind:'text';pattern:RegExp}|{kind:'array';item:Spec;max:number}|{kind:'object';fields:Record<string,Spec>;optional?:readonly string[]}|{kind:'nullable';item:Spec};
const num=(max=1e9,integer=false):Spec=>({kind:'number',max,integer});
const en=(...values:readonly Scalar[]):Spec=>({kind:'enum',values});
const obj=(fields:Record<string,Spec>,optional:readonly string[]=[]):Spec=>({kind:'object',fields,optional});
const arr=(item:Spec,max:number):Spec=>({kind:'array',item,max});
const nullable=(item:Spec):Spec=>({kind:'nullable',item});
const fields=(keys:readonly string[],spec:Spec):Record<string,Spec>=>Object.fromEntries(keys.map(k=>[k,spec]));
const ids:Spec={kind:'text',pattern:/^(?:town-resident:\d{1,10}:\d{3}|causal:1:\d{1,10}(?:\/[a-z0-9:-]+){1,6})$/};
const action=en(null,'drink','rest','work','fetch','deliver','repair');
const evidence=en('delivery','intake','network','repair','pulse','cave');
const metrics=obj(fields(ITEMS,num()));
const causalSpec=obj({version:en(1),manifestHash:{kind:'text',pattern:/^[a-f0-9]{8}$/},planId:{kind:'text',pattern:/^causal:1:\d{1,10}$/},elapsed:num(),materials:num(),agentMaterialsSpent:num(),playerSpent:metrics,renown:num(),sourceRepaired:en(false,true),sourcePaid:en(false,true),depot:num(),extracted:num(),networkCaptured:num(),networkDiscarded:num(),playerWater:num(),agents:arr(obj({id:ids,thirst:num(100),fatigue:num(100),cargo:num(),workTime:num(),task:nullable(obj({kind:action}))}),6),jobs:arr(obj({id:ids,kind:en('water','repair','clear-route'),status:en('offered','accepted','completed','resolved','claimed','blocked'),reward:num(),accepted:en(false,true),playerContribution:en(false,true),playerEvidence:arr(evidence,6),resolvedAt:nullable(num()),createdAt:num(),reservedReward:num()}),8)});
const ledger=obj({epochs:num(1e9,true),...fields(['initial','produced','consumed','donated','overflow'],obj(fields(RESOURCES,num())))});
const townSpec=obj({version:en(1),seed:num(0xffffffff,true),revision:num(1e9,true),tick:num(1e9,true),cycleTick:num(1e9,true),resources:obj(fields(RESOURCES,num())),playerSpent:metrics,ledger,residents:arr(obj({id:ids,index:num(99,true),needs:obj(fields(NEEDS,num(100))),stress:num(100),completed:num(1e9,true),interruptions:num(1e9,true),action:en(null,'eat','rest','wash','socialize','leisure','garden','draw-water','cook','craft','maintain','recover'),status:en('idle','queued','traveling','acting')}),100)});
const townTarget:Spec={kind:'text',pattern:/^(?:town-resident:\d{1,10}:\d{3}|well|workshop|square|cookshop|inn|apothecary|garden-west|garden-east)$/};
const observationFields={lifeRevision:num(1e9,true),tick:num(1e9,true),value:num(1200),aux:num(1e9)};
const directorSpec=obj({version:en(1),seed:num(0xffffffff,true),revision:num(96,true),observedLifeRevision:num(1e9,true),phaseSteps:num(59,true),restSteps:num(600,true),episodes:arr(obj({
 id:{kind:'text',pattern:/^town-request-(?:[1-9]|1[0-9]|2[0-4])$/},kind:en('water-shortage','material-shortage','service-wear','resident-support'),issuerId:ids,serviceId:townTarget,targetId:townTarget,status:en('offered','accepted','completed','world-resolved','expired','declined'),deadlineSteps:num(720,true),remainingSteps:num(720,true),
 evidence:obj({...observationFields,estimatedActions:num(4,true)}),accepted:nullable(obj(observationFields)),outcome:nullable(obj({...observationFields,reason:en('helped','recovered','deadline','declined')})),
 contribution:nullable(obj({command:obj({kind:en('donate-water','donate-supplies','repair-service','encourage-resident'),targetId:townTarget,expectedRevision:num(1e9,true)}),lifeRevision:num(1e9,true),tick:num(1e9,true),beforeValue:num(1200),afterValue:num(1200),beforeAux:num(1e9),afterAux:num(1e9),count:num(64,true)})),
 }),24)});
const stateSpec=obj({townLayout:obj({version:en(3),recipe:en(1),manifestHash:{kind:'text',pattern:/^[a-f0-9]{1,8}$/}}),schemaVersion:en(6),seed:num(0xffffffff,true),generation:en(1,2),revision:num(1e9,true),inventory:metrics,settlement:obj(fields(['reserve','consumed','spilled','served'],num(2e9))),waterworks:obj(fields(['stored','extracted','delivered','drained'],num())),jobs:obj({completed:arr(en(...JOBS),3),active:nullable(obj({id:en(...JOBS),deliveredAt:num(),servedAt:num(2e9)})),renown:num()}),causal:causalSpec,townLife:townSpec,townDirector:directorSpec},['causal','townLife','townDirector','townLayout']);
function record(v:unknown):v is Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))return false;const p=Object.getPrototypeOf(v);return p===null||p===Object.prototype;}
function read(v:Record<string,unknown>,key:string):unknown{const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!('value' in d))throw new Error(`Missing data field ${key}`);return d.value;}
function project(value:unknown,spec:Spec,strict:boolean,path='snapshot'):Data{
 if(spec.kind==='nullable')return value===null?null:project(value,spec.item,strict,path);
 if(spec.kind==='number'){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>spec.max||(spec.integer&&!Number.isInteger(value)))throw new Error(`Invalid finite number at ${path}`);return Object.is(value,-0)?0:value;}
 if(spec.kind==='enum'){if(!spec.values.includes(value as Scalar))throw new Error(`Unknown value/version at ${path}`);return value as Scalar;}
 if(spec.kind==='text'){if(typeof value!=='string'||value.length>180||!spec.pattern.test(value))throw new Error(`Invalid bounded identifier at ${path}`);return value;}
 if(spec.kind==='array'){if(!Array.isArray(value)||value.length>spec.max)throw new Error(`Array limit at ${path}`);const out:Data[]=[];for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!('value' in d))throw new Error(`Invalid array data at ${path}`);out.push(project(d.value,spec.item,strict,`${path}[${i}]`));}if(strict&&Object.keys(value).length!==value.length)throw new Error(`Extra array fields at ${path}`);return out;}
 if(!record(value))throw new Error(`Object required at ${path}`);if(strict&&Object.keys(value).some(k=>!Object.hasOwn(spec.fields,k)))throw new Error(`Unknown field at ${path}`);const out:Record<string,Data>={};
 for(const [key,s]of Object.entries(spec.fields)){if(!Object.hasOwn(value,key)&&spec.optional?.includes(key))continue;out[key]=project(read(value,key),s,strict,`${path}.${key}`);}return out;
}
function bytes(text:string,max:number){if(typeof text!=='string'||text.length>max||new TextEncoder().encode(text).length>max)throw new Error(`Input exceeds ${max} bytes`);}
function parse(text:string,max:number):unknown{bytes(text,max);try{return JSON.parse(text);}catch{throw new Error('Expected bounded JSON data');}}
function same(a:unknown,b:unknown):boolean{if(a===b)return true;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]));if(record(a)&&record(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&same(read(a,k),read(b,k)));}return false;}
function freeze<T>(v:T):T{if(v&&typeof v==='object'){for(const item of Object.values(v))freeze(item);Object.freeze(v);}return v;}
export interface SaveSnapshot {format:'axiom-save-inspection';version:1;generationManifest:GenerationManifest;state:Record<string,Data>}
function checkIdentity(state:Record<string,Data>,manifest:unknown):GenerationManifest{
 if(state.townLayout&&!validTownLayout(state.townLayout,Number(state.seed)))throw Error('Unknown town layout identity');
 const expected=state.generation===1?GENERATION_MANIFEST:CONNECTED_GENERATION_MANIFEST;if(!same(manifest,expected))throw new Error('Unknown generation domains, recipes, framework or content hash');
 const town=state.townLife as Record<string,Data>|undefined;if(town&&town.seed!==state.seed)throw new Error('Town seed does not match world seed');
 const director=state.townDirector as Record<string,Data>|undefined;if(director){if(!town||director.seed!==state.seed||Number(director.observedLifeRevision)>Number(town.revision))throw new Error('Director does not match the captured town authority');for(const [i,row]of (director.episodes as Record<string,Data>[]).entries()){if(row.id!==`town-request-${i+1}`||!(row.issuerId as string).startsWith(`town-resident:${state.seed}:`))throw new Error('Director episode identity mismatch');for(const key of ['targetId','serviceId']){const target=row[key] as string;if(target.startsWith('town-resident:')&&!target.startsWith(`town-resident:${state.seed}:`))throw new Error('Director target seed mismatch');}}}
 const causal=state.causal as Record<string,Data>|undefined;if(causal&&causal.planId!==`causal:1:${state.seed}`)throw new Error('Causal domain does not match world seed');
 for(const [rows,prefix]of [[town?.residents,`town-resident:${state.seed}:`],[causal?.agents,`causal:1:${state.seed}/`],[causal?.jobs,`causal:1:${state.seed}/`]] as const){if(!rows)continue;const seen=new Set<string>();for(const row of rows as Record<string,Data>[]){const id=row.id as string;if(!id.startsWith(prefix)||seen.has(id))throw new Error('Duplicate or mismatched domain identity');seen.add(id);if(prefix.startsWith('town-')&&id!==`${prefix}${String(row.index).padStart(3,'0')}`)throw new Error('Town resident identity mismatch');}}
 return JSON.parse(JSON.stringify(expected)) as GenerationManifest;
}
/** Capture only known numeric/enum records from an explicitly supplied current State. */
export function captureSaveSnapshot(value:unknown):SaveSnapshot{
 if(!record(value))throw new Error('Provide a schema-6 world state');const state=project(value,stateSpec,false) as Record<string,Data>,generationManifest=checkIdentity(state,read(value,'generationManifest'));
 const snapshot={format:'axiom-save-inspection' as const,version:1 as const,generationManifest,state};bytes(JSON.stringify(snapshot),SAVE_DIFF_MAX_BYTES);return freeze(snapshot);
}
/** Accept either strict inspector v1 snapshots or explicitly supplied raw schema-6 JSON.
 * This parser never imports a campaign, normalizes a save, or touches a storage slot. */
export function parseSaveSnapshot(text:string):SaveSnapshot{
 const value=parse(text,SAVE_DIFF_RAW_MAX_BYTES);if(!record(value))throw new Error('Snapshot must be an object');
 if(!Object.hasOwn(value,'format'))return captureSaveSnapshot(value);
 bytes(text,SAVE_DIFF_MAX_BYTES);if(Object.keys(value).length!==4||!['format','version','generationManifest','state'].every(k=>Object.hasOwn(value,k))||read(value,'format')!=='axiom-save-inspection'||read(value,'version')!==1)throw new Error('Unknown inspection format/version or fields');
 const state=project(read(value,'state'),stateSpec,true) as Record<string,Data>,generationManifest=checkIdentity(state,read(value,'generationManifest'));return freeze({format:'axiom-save-inspection',version:1,generationManifest,state});
}
export function exportSaveSnapshot(snapshot:SaveSnapshot):string{const text=JSON.stringify(snapshot,null,2);return JSON.stringify(parseSaveSnapshot(text),null,2);}
export interface SaveChange {path:string;before:Scalar|undefined;after:Scalar|undefined;delta?:number}
export interface SaveDifference {format:'axiom-save-difference';version:1;comparable:boolean;identity:{before:{seed:Data;generation:Data;manifest:GenerationManifest};after:{seed:Data;generation:Data;manifest:GenerationManifest}};changes:SaveChange[];explanations:string[];limits:string[]}
function flatten(value:Data,path:string,out:Map<string,Scalar>){if(value===null||typeof value!=='object'){out.set(path,value);return;}if(Array.isArray(value)){value.forEach((item,i)=>{const id=record(item)&&typeof item.id==='string'?item.id:i;flatten(item,`${path}[${id}]`,out);});return;}for(const k of Object.keys(value).sort())flatten(value[k]!,path?`${path}.${k}`:k,out);}
export function diffSaveSnapshots(before:SaveSnapshot,after:SaveSnapshot):SaveDifference{
 // Revalidate typed callers as well as imported input. No trusted cast bypasses the size/version limits.
 const a=parseSaveSnapshot(exportSaveSnapshot(before)),b=parseSaveSnapshot(exportSaveSnapshot(after)),left=new Map<string,Scalar>(),right=new Map<string,Scalar>();flatten(a.state,'',left);flatten(b.state,'',right);
 const changes:SaveChange[]=[];for(const path of [...new Set([...left.keys(),...right.keys()])].sort()){const x=left.get(path),y=right.get(path);if(x!==y)changes.push({path,before:x,after:y,...(typeof x==='number'&&typeof y==='number'?{delta:y-x}:{})});}
 if(changes.length>4096)throw new Error('Difference exceeds 4096 changed records');const ca=a.state.causal as Record<string,Data>|undefined,cb=b.state.causal as Record<string,Data>|undefined;const comparable=same(a.state.townLayout,b.state.townLayout)&&a.state.seed===b.state.seed&&a.state.generation===b.state.generation&&same(a.generationManifest,b.generationManifest)&&(!ca||!cb||ca.manifestHash===cb.manifestHash);
 const explanations:string[]=[];const change=(path:string)=>changes.find(c=>c.path===path),delta=(path:string)=>change(path)?.delta??0;
 if(!comparable)explanations.push('World seed or generation/causal domain identity differs. These are cross-world differences; no gameplay causal attribution is made.');
 else {
  if(change('revision'))explanations.push(`World revision ${a.state.revision} → ${b.state.revision}. Snapshots establish endpoints only; intervening commands are not reconstructed.`);
  for(const item of ITEMS)if(change(`inventory.${item}`))explanations.push(`Inventory ${item}: net ${delta(`inventory.${item}`)}. Recorded causal spending Δ${delta(`causal.playerSpent.${item}`)}; town spending Δ${delta(`townLife.playerSpent.${item}`)}. These ledger observations are not a complete inventory history.`);
  if(change('causal.materials')){const m=change('causal.materials')!;explanations.push(m.delta===undefined?'Causal material records were added or removed. No net material flow can be inferred.':`Causal materials: net ${m.delta}; recorded agent material spending Δ${delta('causal.agentMaterialsSpent')}.`);}
  const ta=a.state.townLife as Record<string,Data>|undefined,tb=b.state.townLife as Record<string,Data>|undefined;
  if(ta&&tb){if(delta('townLife.ledger.epochs'))explanations.push('Town ledger epoch changed; cumulative ledger counters were rebased, so their direct differences cannot explain resource flow.');else for(const item of RESOURCES)if(change(`townLife.resources.${item}`)){const produced=delta(`townLife.ledger.produced.${item}`),consumed=delta(`townLife.ledger.consumed.${item}`),donated=delta(`townLife.ledger.donated.${item}`),overflow=delta(`townLife.ledger.overflow.${item}`),net=delta(`townLife.resources.${item}`),residual=net-produced+consumed-donated+overflow;explanations.push(`Town ${item}: net ${net}; ledger produced +${produced}, consumed −${consumed}, donated +${donated}, overflow −${overflow}; unreconciled remainder ${Math.abs(residual)<1e-6?0:residual}.`);}}
  const needs=changes.filter(c=>/\.needs\.|\.(thirst|fatigue)$/.test(c.path));if(needs.length)explanations.push(`${needs.length} need records changed. Present endpoints show net need changes; they do not prove which action caused them.`);
  for(const c of changes.filter(c=>/^causal\.jobs\[.*\]\.(status|playerContribution)$/.test(c.path)))explanations.push(`${c.path}: ${c.before??'absent'} → ${c.after??'absent'}. Compare the same job’s recorded playerEvidence and reward fields.`);
  for(const c of changes.filter(c=>/^townDirector\.episodes\[.*\]\.(status|outcome\.reason)$/.test(c.path)))explanations.push(`${c.path}: ${c.before??'absent'} → ${c.after??'absent'}. Evidence, accepted observations and contribution/outcome values are saved records; no unrecorded credit is inferred.`);
  if(changes.some(c=>c.path.startsWith('jobs.')))explanations.push('Commission fields changed. Active baseline, completed commission IDs and renown are direct saved records; a snapshot pair cannot establish the full acceptance/claim sequence.');
 }
 if(!changes.length&&same(a.generationManifest,b.generationManifest))explanations.push('All inspected records and generation identities match. Uninspected fields may still differ.');
 const result:SaveDifference={format:'axiom-save-difference',version:1,comparable,identity:{before:{seed:a.state.seed!,generation:a.state.generation!,manifest:a.generationManifest},after:{seed:b.state.seed!,generation:b.state.generation!,manifest:b.generationManifest}},changes,explanations,limits:['Read-only endpoint comparison; never loads, repairs, mutates or saves a campaign.','Coverage: world revision, inventory, waterworks counters, Mossbank needs/commissions, founding causal materials/needs/jobs town-life needs/resources/ledger/revision and town-director structured episode history.','Restoration and other regional/equipment systems, geometry, player position, free-form events and room/session credentials are excluded.','Unknown schemas/manifests/inspector versions are rejected. No causal claim is inferred from timing alone.']};bytes(JSON.stringify(result),SAVE_DIFF_REPORT_MAX_BYTES);return freeze(result);
}
