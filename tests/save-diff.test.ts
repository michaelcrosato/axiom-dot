import test from 'node:test';import assert from 'node:assert/strict';
import {captureSaveSnapshot,parseSaveSnapshot,exportSaveSnapshot,diffSaveSnapshots} from '../src/save-diff.ts';
import {GENERATION_MANIFEST,CONNECTED_GENERATION_MANIFEST} from '../src/generation-manifest.ts';
import {createCausalState} from '../src/causal.ts';
import {createTownLife,advanceTownLife} from '../src/town-life.ts';
export function fixture(seed=42){return {schemaVersion:6,seed,generation:2,revision:0,generationManifest:CONNECTED_GENERATION_MANIFEST,inventory:{scrap:4,core:1,water:3},settlement:{reserve:0,consumed:0,spilled:0,served:0},waterworks:{stored:0,extracted:0,delivered:0,drained:0},jobs:{completed:[],active:null,renown:0}};}
test('read-only capture/import are deterministic; room credentials and free text never enter exports',()=>{
 let secretRead=false;const state={...fixture(),roomToken:'super-secret',session:{credentials:'also-secret'},events:['private-secret'],player:{x:1,z:2,hp:100}};
 Object.defineProperty(state,'roomToken',{get(){secretRead=true;throw Error('Must not inspect room credentials');}});const before=JSON.stringify({...fixture()}),snap=captureSaveSnapshot(state),text=exportSaveSnapshot(snap);
 assert(!secretRead);assert.doesNotMatch(text,/secret|roomToken|session|events|player/);assert.deepEqual(parseSaveSnapshot(text),snap);assert.deepEqual(parseSaveSnapshot(JSON.stringify(fixture())),snap);assert.equal(JSON.stringify(fixture()),before);assert(Object.isFrozen(snap.state));assert.equal(diffSaveSnapshots(snap,snap).changes.length,0);assert.match(diffSaveSnapshots(snap,snap).explanations.join(' '),/Uninspected fields/);
});
test('exact seeds, generation domains, content hashes and unknown versions are enforced',()=>{
 const base=fixture();for(const bad of [{schemaVersion:7},{generation:3},{seed:-1},{seed:1.5},{seed:2**32},{revision:Infinity},{generationManifest:{...CONNECTED_GENERATION_MANIFEST,contentHash:'ffffffff'}},{generationManifest:{...CONNECTED_GENERATION_MANIFEST,domains:{...CONNECTED_GENERATION_MANIFEST.domains,workshop:2}}}])assert.throws(()=>captureSaveSnapshot({...base,...bad}));
 const snap=captureSaveSnapshot(base),value=JSON.parse(exportSaveSnapshot(snap));for(const bad of [{version:2},{format:'save'},{extra:1}])assert.throws(()=>parseSaveSnapshot(JSON.stringify({...value,...bad})));
 value.state.inventory.code='execute';assert.throws(()=>parseSaveSnapshot(JSON.stringify(value)));assert.throws(()=>parseSaveSnapshot(' '.repeat(2097153)));
 const different=captureSaveSnapshot(fixture(43)),diff=diffSaveSnapshots(snap,different);assert(!diff.comparable);assert.equal(diff.identity.before.seed,42);assert.equal(diff.identity.after.seed,43);assert.match(diff.explanations[0]!,/no gameplay causal attribution/);
 const legacy=captureSaveSnapshot({...fixture(),generation:1,generationManifest:GENERATION_MANIFEST});assert(!diffSaveSnapshots(legacy,snap).comparable);assert.equal(diffSaveSnapshots(legacy,snap).identity.before.manifest.domains.valley,1);
});
test('real town/causal state records yield bounded need, materials, jobs and revision differences',()=>{
 const townLife=createTownLife(42),causal=createCausalState(42),state={...fixture(),townLife,causal};const bytes=JSON.stringify(state),before=captureSaveSnapshot(state);
 let next=townLife;for(let i=0;i<10;i++)next=advanceTownLife(next,1);
 const after=captureSaveSnapshot({...state,revision:1,townLife:next,inventory:{...state.inventory,scrap:3},causal:{...causal,materials:causal.materials-1,agentMaterialsSpent:causal.agentMaterialsSpent+1,playerSpent:{...causal.playerSpent,scrap:1}}});
 const report=diffSaveSnapshots(before,after);assert(report.comparable);assert(report.changes.some(c=>c.path==='revision'&&c.delta===1));assert(report.changes.some(c=>c.path.includes('.needs.')));assert(report.changes.some(c=>c.path==='inventory.scrap'&&c.delta===-1));assert.match(report.explanations.join('\n'),/Recorded causal spending Δ1/);assert.match(report.explanations.join('\n'),/recorded agent material spending Δ1/);assert.equal(JSON.stringify(state),bytes);
 assert.equal(report.identity.after.manifest.contentHash,CONNECTED_GENERATION_MANIFEST.contentHash);assert(report.changes.length<4096);
});
test('town ledger explanations use actual same-epoch deltas and refuse rebased causal math',()=>{
 const townLife=createTownLife(42),state={...fixture(),townLife},before=captureSaveSnapshot(state);const after=structuredClone(state);after.townLife.resources.materials+=7;after.townLife.ledger.produced.materials+=10;after.townLife.ledger.consumed.materials+=3;
 const result=diffSaveSnapshots(before,captureSaveSnapshot(after));assert.match(result.explanations.join('\n'),/Town materials: net 7; ledger produced \+10, consumed −3.*unreconciled remainder 0/);
 after.townLife.ledger.epochs++;const rebased=diffSaveSnapshots(before,captureSaveSnapshot(after));assert.match(rebased.explanations.join('\n'),/rebased/);assert.doesNotMatch(rebased.explanations.join('\n'),/unreconciled remainder/);
});
test('strict bounds reject poisoned selected fields without invoking getters',()=>{
 const state=fixture();let invoked=false;Object.defineProperty(state.inventory,'scrap',{get(){invoked=true;return 4;},enumerable:true});assert.throws(()=>captureSaveSnapshot(state));assert(!invoked);
 const townLife=createTownLife(42);assert.throws(()=>captureSaveSnapshot({...fixture(),townLife:{...townLife,version:2}}));assert.throws(()=>captureSaveSnapshot({...fixture(),townLife:{...townLife,seed:43}}));assert.throws(()=>captureSaveSnapshot({...fixture(),townLife:{...townLife,residents:[...townLife.residents,townLife.residents[0]]}}));
 const duplicated=structuredClone(townLife);duplicated.residents[1]=duplicated.residents[0]!;assert.throws(()=>captureSaveSnapshot({...fixture(),townLife:duplicated}));assert.throws(()=>captureSaveSnapshot({...fixture(),causal:{...createCausalState(42),version:2}}));
});
test('commission changes and optional-domain additions preserve exact facts without fabricated zero flows',()=>{
 const before=captureSaveSnapshot(fixture()),state={...fixture(),jobs:{completed:[],active:{id:'commission',deliveredAt:0,servedAt:0},renown:0},causal:createCausalState(42)},after=captureSaveSnapshot(state),diff=diffSaveSnapshots(before,after);
 assert(diff.changes.some(c=>c.path==='jobs.active.id'&&c.after==='commission'));assert.match(diff.explanations.join('\n'),/Commission fields changed/);assert.match(diff.explanations.join('\n'),/Causal material records were added or removed/);assert.doesNotMatch(diff.explanations.join('\n'),/Causal materials: net 0/);
 const altered=structuredClone(state);altered.causal.manifestHash='abcdef01';assert.equal(diffSaveSnapshots(after,captureSaveSnapshot(altered)).comparable,false);
});
