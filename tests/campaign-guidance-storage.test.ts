import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCampaignGuidance,storeCampaignGuidance,campaignGuidanceStorageKey,type CampaignGuidanceIdentity} from '../src/campaign-guidance-storage.ts';
import {createPreviewStorage,previewStorageKey} from '../src/preview-storage.ts';
function storage(){const data=new Map<string,string>();const api:Storage={get length(){return data.size;},key(i){return [...data.keys()][i]??null;},getItem(k){return data.get(k)??null;},setItem(k,v){data.set(k,v);},removeItem(k){data.delete(k);},clear(){data.clear();}};return {data,api};}
const identity:CampaignGuidanceIdentity={generation:2,seed:73129,regional:{version:1}};

test('guidance selection reloads and explicit untracking persists without campaign save writes',()=>{
 const {api,data}=storage(),preview=createPreviewStorage(()=>api),unrelated=new Map([['axiom-save-region1-73129','original save'],[previewStorageKey('axiom-save-region1-73129'),'preview save'],[previewStorageKey('axiom-active-world'),'axiom-save-region1-73129'],[previewStorageKey('axiom-save-region1-73129-session-v1'),'epoch receipt']]);for(const [k,v]of unrelated)data.set(k,v);
 assert.deepEqual(loadCampaignGuidance(preview,identity),{goalId:null});assert(storeCampaignGuidance(preview,identity,{goalId:'supply',sourceId:'valley:73129:scrap:0'}));assert.deepEqual(loadCampaignGuidance(preview,identity),{goalId:'supply',sourceId:'valley:73129:scrap:0'});assert(storeCampaignGuidance(preview,identity,{goalId:null}));assert.deepEqual(loadCampaignGuidance(preview,identity),{goalId:null});
 assert.equal(data.size,unrelated.size+1);for(const [k,v]of unrelated)assert.equal(data.get(k),v);assert.equal(data.get(campaignGuidanceStorageKey(identity)!),undefined);assert(data.has(previewStorageKey(campaignGuidanceStorageKey(identity)!)));
});

test('guidance tracking is independent for seed generation region solo and each room',()=>{
 const {api}=storage(),contexts:CampaignGuidanceIdentity[]=[identity,{generation:2,seed:42,regional:{version:1}},{generation:2,seed:73129},{generation:1,seed:73129},{...identity,roomId:'12345678-1234-4234-8234-123456789abc'},{...identity,roomId:'22345678-1234-4234-8234-123456789abc'}];
 const goals=['supply','construction','restoration','care','regional','town'] as const;
 for(let i=0;i<contexts.length;i++)assert(storeCampaignGuidance(api,contexts[i]!,{goalId:goals[i]!}));
 assert.equal(new Set(contexts.map(c=>campaignGuidanceStorageKey(c))).size,contexts.length);for(let i=0;i<contexts.length;i++)assert.deepEqual(loadCampaignGuidance(api,contexts[i]!),{goalId:goals[i]!});
 assert.deepEqual(loadCampaignGuidance(api,{...contexts[4]!,roomId:contexts[4]!.roomId!.toUpperCase()}),{goalId:'regional'});
});

test('malformed oversized unknown-field and foreign-version preferences are ignored without rewriting them',()=>{
 const {api,data}=storage(),key=campaignGuidanceStorageKey(identity)!,valid={format:'axiom-campaign-guidance',version:1,selection:{goalId:'care',siteId:'habitat-v1-73129-site-0'}};
 for(const text of ['','not JSON',' '.repeat(513),JSON.stringify({...valid,version:2}),JSON.stringify({...valid,format:'other'}),JSON.stringify({...valid,world:{seed:1}}),JSON.stringify({...valid,selection:{goalId:'unknown'}}),JSON.stringify({...valid,selection:{goalId:'supply',sourceId:'x'.repeat(129)}}),JSON.stringify({...valid,selection:{goalId:'care',siteId:'bad\nsite'}}),JSON.stringify({...valid,selection:{goalId:'town',progress:1}}),JSON.stringify({...valid,selection:{goalId:null,siteId:'stale'}}),JSON.stringify({...valid,selection:null})]){
  api.setItem(key,text);assert.deepEqual(loadCampaignGuidance(api,identity),{goalId:null},text);assert.equal(data.get(key),text,'loading never rewrites preferences or migrates data');
 }
 api.setItem(key,JSON.stringify(valid));const read=loadCampaignGuidance(api,identity);assert.deepEqual(read,valid.selection);assert(Object.isFrozen(read));
});

test('invalid identity or selection cannot target save slots or cause storage reads and writes',()=>{
 let reads=0,writes=0;const api={getItem(){reads++;return null;},setItem(){writes++;}};
 for(const invalid of [{...identity,seed:-1},{...identity,seed:2**32},{...identity,seed:1.2},{...identity,generation:3},{generation:1,seed:1,regional:{version:1}},{...identity,regional:{version:2}},{...identity,roomId:'axiom-save-region1-73129'},{...identity,roomId:'../world'},{...identity,roomId:'x'.repeat(10000)},{...identity,sessionId:'secret'}]){
  const id=invalid as CampaignGuidanceIdentity;assert.equal(campaignGuidanceStorageKey(id),null);assert.deepEqual(loadCampaignGuidance(api,id),{goalId:null});assert.equal(storeCampaignGuidance(api,id,{goalId:'town'}),false);
 }
 assert.equal(reads,0);assert.equal(writes,0);
 for(const invalid of [{goalId:'wrong'},{goalId:'supply',sourceId:''},{goalId:'restoration',siteId:'secret?token=value'},{goalId:'town',snapshot:{}},{goalId:null,sourceId:'old'},{goalId:'care',siteId:undefined}])assert.equal(storeCampaignGuidance(api,identity,invalid as never),false);
 const getter=Object.defineProperty({goalId:'town'},'sourceId',{enumerable:true,get(){throw Error('do not read');}});assert.equal(storeCampaignGuidance(api,identity,getter as never),false);assert.equal(writes,0);
});

test('storage read and write failures preserve safe defaults and report an unsaved selection',()=>{
 const denied={getItem(){throw new Error('Denied');},setItem(){throw new Error('Quota');}};assert.deepEqual(loadCampaignGuidance(denied,identity),{goalId:null});assert.equal(storeCampaignGuidance(denied,identity,{goalId:'restoration',siteId:'habitat-v1-73129-site-0'}),false);
 const {api}=storage(),selection={goalId:'care' as const,siteId:'habitat-v1-73129-site-0'};assert(storeCampaignGuidance(api,identity,selection));assert.deepEqual(selection,{goalId:'care',siteId:'habitat-v1-73129-site-0'});assert.equal(storeCampaignGuidance({setItem(){throw Error('Quota');}},identity,{goalId:null}),false);assert.deepEqual(loadCampaignGuidance(api,identity),selection);
});

test('stored guidance contains only a bounded goal pointer with no world progress or room credentials',()=>{
 const {api,data}=storage(),id={...identity,roomId:'12345678-1234-4234-8234-123456789abc'};assert(storeCampaignGuidance(api,id,{goalId:'care',siteId:'habitat-v1-73129-site-0'}));const text=data.get(campaignGuidanceStorageKey(id)!)!;assert(text.length<=512);assert.deepEqual(Object.keys(JSON.parse(text)).sort(),['format','selection','version']);assert.equal(text.includes(id.roomId),false);assert.equal(text.includes('session'),false);assert.equal(text.includes('inventory'),false);
});
