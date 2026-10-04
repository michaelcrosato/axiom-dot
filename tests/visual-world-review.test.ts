import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import * as THREE from 'three/webgpu';
import {QUADRUPED_VISUAL_FIXTURES,CAVE_VISUAL_FIXTURES,REVIEW_SEED,caveReviewWater} from '../src/visual-fixtures.ts';
import {validEncounters,ENEMY_RULES} from '../src/encounters.ts';
import {caveDepth,caveWaterBalance,validCaveWater,caveRouteOpen} from '../src/cave-water.ts';
import {naturalCave} from '../src/natural-cave.ts';

// Numeric geometry checks only. Import resolution is adapted for Node; model logic is unchanged.
async function productionView(name:string){const url=new URL('../src/'+name+'.ts',import.meta.url),source=await readFile(url,'utf8');const linked=source.replace(/from ['"]([^'"]+)['"]/g,(_all,specifier:string)=>'from '+JSON.stringify(specifier.startsWith('.')?new URL(specifier.endsWith('.ts')?specifier:specifier+'.ts',url).href:import.meta.resolve(specifier)));return import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(linked)).toString('base64'));}

test('quadruped probes preserve finite authority states, fixed preparation heading and distance-driven gait samples',()=>{
 assert.equal(QUADRUPED_VISUAL_FIXTURES.length,13);assert.equal(new Set(QUADRUPED_VISUAL_FIXTURES.map(f=>f.id)).size,13);
 for(const f of QUADRUPED_VISUAL_FIXTURES)assert.equal(validEncounters({version:1,step:0,remainder:0,enemies:[f.enemy]},[{id:'review-quadruped',zone:'review',x:0,z:0}],[]),true,f.id);
 const preparation=QUADRUPED_VISUAL_FIXTURES.filter(f=>f.enemy.phase==='prepare');assert.equal(new Set(preparation.map(f=>f.enemy.heading)).size,1);assert.ok(preparation.every(f=>f.enemy.remaining>0&&f.enemy.remaining<ENEMY_RULES.prepare));
 const pursuit=QUADRUPED_VISUAL_FIXTURES.filter(f=>f.enemy.phase==='pursuit');assert.equal(pursuit.length,4);assert.ok(pursuit.every((f,i)=>i===0||f.enemy.distance>pursuit[i-1]!.enemy.distance));
});
test('production quadruped probe geometry is finite, bounded and shows warnings only in committed attack phases',async()=>{
 const {createQuadruped}=await productionView('creature-view'),model=createQuadruped(REVIEW_SEED);
 try{for(const f of QUADRUPED_VISUAL_FIXTURES){model.update(structuredClone(f.enemy));model.root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model.root,true);assert.ok([bounds.min.x,bounds.min.y,bounds.min.z,bounds.max.x,bounds.max.y,bounds.max.z].every(Number.isFinite),f.id);assert.ok(bounds.min.y>-.15&&bounds.max.y<2.2,f.id+' conservative numeric envelope');const warning=model.root.children.find((o:THREE.Object3D)=>o instanceof THREE.Mesh&&o.geometry instanceof THREE.RingGeometry);assert.equal(warning?.visible,['prepare','strike'].includes(f.enemy.phase),f.id);}}
 finally{model.dispose();}
});
test('cave low-water probes are reproducible valid reducer outcomes, conserve water and open the bounded route',()=>{
 const a=caveReviewWater();assert.deepEqual(a,caveReviewWater());assert.equal(CAVE_VISUAL_FIXTURES.length,4);assert.ok(a.steps>0&&a.steps<=2400);assert.equal(validCaveWater(a.flooded,REVIEW_SEED),true);assert.equal(validCaveWater(a.low,REVIEW_SEED),true);assert.equal(caveRouteOpen(a.flooded),false);assert.equal(caveRouteOpen(a.low),true);assert.ok(Math.abs(caveWaterBalance(a.low))<1e-7);
 for(const b of naturalCave(REVIEW_SEED).basins)assert.ok(caveDepth(a.low,b.index)<=.16);
});
test('actual cave-view surfaces follow both production water fixtures without changing cave geometry',async()=>{
 const {createCaveView}=await productionView('cave-view'),model=createCaveView(REVIEW_SEED),states=caveReviewWater(),plan=model.plan;
 try{const children=model.root.children.length;for(const key of ['flooded','low']as const){model.sync(states[key],[]);model.root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model.root,true);assert.ok(Number.isFinite(bounds.max.y)&&bounds.min.y>=-.17&&bounds.max.y<=6.7);assert.equal(model.root.children.length,children);const surfaces=model.root.children.filter((o:THREE.Object3D)=>o instanceof THREE.Mesh&&o.geometry instanceof THREE.PlaneGeometry);assert.equal(surfaces.length,plan.tiles.filter((t:{basin:number|null})=>t.basin!==null).length);for(const s of surfaces){const tile=plan.tiles.find((t:{x:number;z:number})=>t.x===s.position.x&&t.z===s.position.z);assert.ok(tile&&tile.basin!==null);assert.ok(Math.abs(s.position.y-Math.max(.003,caveDepth(states[key],tile.basin,plan)))<1e-10);}}}
 finally{model.dispose();}
});
