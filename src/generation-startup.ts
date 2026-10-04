import {validGenerationManifest} from './generation.ts';
/** Read-only identity hints. They are not save validation and never select/replace a world. */
export interface GenerationHintStore {getItem(key:string):string|null}
export interface StartupGenerationHint {generation:2;seed:number}
export function startupGenerationHints(storage?:GenerationHintStore,session?:GenerationHintStore):StartupGenerationHint[]{
 const hints:StartupGenerationHint[]=[{generation:2,seed:73129}];
 const add=(v:unknown)=>{
  if(!v||typeof v!=='object')return;
  const s=v as {seed?:unknown;generation?:unknown;schemaVersion?:unknown;generationManifest?:unknown};
  if(s.generation!==2||s.schemaVersion!==6||!Number.isInteger(s.seed)||Number(s.seed)<0||Number(s.seed)>0xffffffff||!validGenerationManifest(s.generationManifest)||s.generationManifest.domains.valley!==2)return;
  const seed=Number(s.seed);const i=hints.findIndex(h=>h.seed===seed);if(i===0)return;if(i>0)hints.splice(i,1);hints.push({generation:2,seed});
 };
 function read(store:GenerationHintStore|undefined,key:string,limit=100000):unknown {try{const raw=store?.getItem(key);return raw&&raw.length<=limit?JSON.parse(raw):null;}catch{return null;}}
 // Known primary/backup records only. No key enumeration, parsed plans, or arbitrary pointers.
 add(read(storage,'axiom-save-v1'));add(read(storage,'axiom-save-backup-v1'));
 add(read(storage,'axiom-save-valley2-73129'));add(read(storage,'axiom-save-valley2-73129-backup'));
 try{const selected=storage?.getItem('axiom-active-world');if(selected&&/^axiom-save-(?:valley[12]|region1)-\d{1,10}$/.test(selected)){add(read(storage,selected+'-backup'));add(read(storage,selected));}}catch{}
 add(read(session,'axiom-coop-return-v1'));
 const boot=read(session,'axiom-coop-bootstrap-v1',600000) as {version?:unknown;world?:unknown;solo?:unknown}|null;
 if(boot?.version===1){add(boot.solo);add(boot.world);}
 // Preserve the default needed by current main, then at most three prioritized identities.
 // All fit the existing four-plan cache during safe sequential preparation.
 return [hints[0]!,...hints.slice(1).slice(-3)];
}
