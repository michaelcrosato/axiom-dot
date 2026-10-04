import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPreviewStorage,previewStorageKey,PREVIEW_STORAGE_NAMESPACE} from '../src/preview-storage.ts';
class Store implements Storage {
 [name:string]:unknown;
 data=new Map<string,string>();
 get length(){return this.data.size;} key(index:number){return [...this.data.keys()][index]??null;}
 getItem(key:string){return this.data.get(key)??null;} setItem(key:string,value:string){this.data.set(key,value);}
 removeItem(key:string){this.data.delete(key);} clear(){this.data.clear();}
}
test('preview browser storage cannot discover, load or overwrite unprefixed saves and room bootstrap',()=>{
 const raw=new Store();raw.setItem('axiom-save-region1-73129','original save');raw.setItem('axiom-coop-bootstrap-v1','original room');
 const preview=createPreviewStorage(()=>raw);assert.equal(preview.length,0);assert.equal(preview.getItem('axiom-save-region1-73129'),null);assert.equal(preview.getItem('axiom-coop-bootstrap-v1'),null);
 preview.setItem('axiom-save-region1-73129','preview save');preview.setItem('axiom-coop-bootstrap-v1','preview room');
 assert.equal(raw.getItem('axiom-save-region1-73129'),'original save');assert.equal(raw.getItem('axiom-coop-bootstrap-v1'),'original room');
 assert.equal(raw.getItem(previewStorageKey('axiom-save-region1-73129')),'preview save');assert.equal(preview.length,2);assert.equal(preview.key(0),'axiom-save-region1-73129');
 preview.removeItem('axiom-coop-bootstrap-v1');preview.clear();assert.equal(preview.length,0);assert.equal(raw.length,2);
});
test('preview storage preserves ordinary failures for existing recovery paths',()=>{
 const preview=createPreviewStorage(()=>{throw Error('Storage unavailable');});assert.throws(()=>preview.getItem('save'),/Storage unavailable/);assert.throws(()=>preview.setItem('save','data'),/Storage unavailable/);
});
test('preview browser bindings, notices, storage events and internal navigation remain explicit',()=>{
 const read=(name:string)=>readFileSync(new URL('../'+name,import.meta.url),'utf8'),main=read('src/main.ts'),workbench=read('src/system-workbench-ui.ts');
 assert.match(main,/localStorage=createPreviewStorage\(\(\)=>window.localStorage\),sessionStorage=createPreviewStorage\(\(\)=>window.sessionStorage\)/);
 assert.match(main,/event.key===previewStorageKey\(sessionEpochKey\(state\)\)/);assert.ok(PREVIEW_STORAGE_NAMESPACE.startsWith('axiom-experimental-preview'));
 for(const source of [main,workbench]){assert.match(source,/EXPERIMENTAL PREVIEW/);assert.match(source,/final edge-case review is incomplete/);assert.match(source,/Browser\/device performance is unverified/);assert.match(source,/separate preview may have bugs/);assert.doesNotMatch(source,/https:\/\/axiom-living-frontier/);}
 assert.match(main,/href="\.\/system-workbench.html/);assert.match(workbench,/href="\.\/"/);
});
test('preview worker accepts only its dedicated new Site database binding',()=>{
 const hosting=JSON.parse(readFileSync(new URL('../.openai/hosting.json',import.meta.url),'utf8'));
 assert.equal(hosting.project_id,'appgprj_6ac1395afe608191ad13ebdd53ccb864');assert.equal(hosting.d1,'AXIOM_PREVIEW_DB');
 const server=readFileSync(new URL('../server/index.ts',import.meta.url),'utf8');assert.match(server,/AXIOM_PREVIEW_DB/);assert.doesNotMatch(server,/env\.DB\b/);
});
