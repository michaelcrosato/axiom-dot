import test from 'node:test';import assert from 'node:assert/strict';
import {createTownLifeScenario} from '../src/town-life.ts';
import {createTownDirector,applyTownDirectorCommand,townDirectorInteractionPosition} from '../src/town-director.ts';
import {CONNECTED_GENERATION_MANIFEST} from '../src/generation-manifest.ts';
import {captureSaveSnapshot,diffSaveSnapshots,parseSaveSnapshot,exportSaveSnapshot} from '../src/save-diff.ts';
function fixture(scenario:string){const townLife=createTownLifeScenario(42,scenario),townDirector=createTownDirector(townLife);return {schemaVersion:6,seed:42,generation:2,revision:0,generationManifest:CONNECTED_GENERATION_MANIFEST,inventory:{scrap:4,core:1,water:3},settlement:{reserve:0,consumed:0,spilled:0,served:0},waterworks:{stored:0,extracted:0,delivered:0,drained:0},jobs:{completed:[],active:null,renown:0},townLife,townDirector};}
test('director causes/history capture exact bounded engine records without free text',()=>{
 for(const scenario of ['balanced','lean-stores','service-outage','social-strain']){const state=fixture(scenario),before=JSON.stringify(state),snapshot=captureSaveSnapshot(state),text=exportSaveSnapshot(snapshot);assert.deepEqual(parseSaveSnapshot(text),snapshot);assert.equal(JSON.stringify(state),before);assert.doesNotMatch(text,/"reason": "Choosing|"title"|"roomToken"/);const director=snapshot.state.townDirector as any;assert.equal(director.revision,state.townDirector.revision);assert.deepEqual(director.episodes.map((e:any)=>({id:e.id,kind:e.kind,targetId:e.targetId,evidence:e.evidence})),state.townDirector.episodes.map(e=>({id:e.id,kind:e.kind,targetId:e.targetId,evidence:e.evidence})));}
});
test('actual director decline produces exact status and observed outcome differences',()=>{
 const state=fixture('lean-stores'),episode=state.townDirector.episodes[0]!,p=townDirectorInteractionPosition(state.townDirector,episode.id)!;assert(p);const next=applyTownDirectorCommand(state.townDirector,state.townLife,{seed:42,zone:'valley',player:{...p,hp:100}},{kind:'decline',episodeId:episode.id,expectedRevision:state.townDirector.revision,expectedLifeRevision:state.townLife.revision});assert(next);
 const diff=diffSaveSnapshots(captureSaveSnapshot(state),captureSaveSnapshot({...state,townDirector:next}));assert(diff.changes.some(c=>c.path===`townDirector.episodes[${episode.id}].status`&&c.after==='declined'));assert(diff.changes.some(c=>c.path.endsWith('.outcome.reason')&&c.after==='declined'));assert.match(diff.explanations.join('\n'),/no unrecorded credit is inferred/);
});
test('director unknown versions, over-limit histories and cross-seed targets are rejected',()=>{
 const state=fixture('lean-stores');assert.throws(()=>captureSaveSnapshot({...state,townDirector:{...state.townDirector,version:2}}));assert.throws(()=>captureSaveSnapshot({...state,townDirector:{...state.townDirector,episodes:Array(25).fill(state.townDirector.episodes[0])}}));const wrong=structuredClone(state);wrong.townDirector.episodes[0]!.targetId='town-resident:43:001';assert.throws(()=>captureSaveSnapshot(wrong));
});
