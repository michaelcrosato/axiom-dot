/** Preview-only adapter: never reads, copies, clears or migrates unprefixed data. */
export const PREVIEW_STORAGE_NAMESPACE='axiom-experimental-preview-v1:';
export const previewStorageKey=(key:string)=>PREVIEW_STORAGE_NAMESPACE+key;
export function createPreviewStorage(resolve:()=>Storage):Storage {
 const keys=()=>{const storage=resolve(),result:string[]=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREVIEW_STORAGE_NAMESPACE))result.push(key.slice(PREVIEW_STORAGE_NAMESPACE.length));}return result;};
 return {
  get length(){return keys().length;},
  key(index:number){return keys()[index]??null;},
  getItem(key:string){return resolve().getItem(previewStorageKey(key));},
  setItem(key:string,value:string){resolve().setItem(previewStorageKey(key),value);},
  removeItem(key:string){resolve().removeItem(previewStorageKey(key));},
  clear(){const storage=resolve();for(const key of keys())storage.removeItem(previewStorageKey(key));},
 };
}
