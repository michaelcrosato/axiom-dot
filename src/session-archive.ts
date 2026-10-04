import type {SaveStorage} from './session.ts';
/** Rescue package contains only AXIOM local game-save keys; no auth/session credentials. */
export function localSaveArchive(storage:SaveStorage){
 const keys=new Set(['axiom-active-world','axiom-save-v1','axiom-save-backup-v1','axiom-save-valley2-73129','axiom-save-region1-73129']);
 for(let i=0;i<(storage.length??0);i++){const key=storage.key?.(i);if(key==='axiom-active-world'||key?.startsWith('axiom-save-'))keys.add(key);}
 const entries:Record<string,string>={};for(const key of [...keys].sort()){const value=storage.getItem(key);if(value!==null)entries[key]=value;}
 return {format:'axiom-local-save-rescue-v1',description:'Exact local save bytes for recovery. This archive is not a single-world import file.',entries};
}
