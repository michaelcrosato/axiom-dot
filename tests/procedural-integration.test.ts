import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {compileWaterworks,emptyWaterworks,build,machineCosts,machineObstacles,portsFor,PADS,type Waterworks} from '../src/waterworks.ts';
import {workbenchModel} from '../src/workbench.ts';
import {createState,parseSave,serializeSave,validateSave} from '../src/world.ts';
import {GENERATION_MANIFEST,worldWorkshop} from '../src/generation.ts';
import {clearPulsePath} from '../src/combat.ts';
function assembly(){let w=emptyWaterworks(),inventory={scrap:8,core:1,water:0};for(const p of PADS){const result=build(w,inventory,{type:'place',kind:p.kind,x:p.x,z:p.z,pad:p.id},{x:-12,z:3},'valley');w=result.machine;inventory=result.inventory;}for(let i=0;i<3;i++)w=build(w,inventory,{type:'connect',link:`${PADS[i]!.id}.out>${PADS[i+1]!.id}.in`},{x:-12,z:3},'valley').machine;return w;}
test('live construction, geometry, costs, connections and inspector use the same compiled water plan',()=>{
 const w=assembly(),plan=compileWaterworks(w);assert.ok(plan.valid);assert.equal(plan.nodes.length,4);assert.equal(plan.connections.length,3);assert.deepEqual(machineCosts(w),plan.costs);assert.deepEqual(machineObstacles(w),plan.shapes.filter(s=>s.solid).map(s=>({x:s.center.x,z:s.center.z,hx:s.half.x,hz:s.half.z,hy:s.half.y})));
 for(const m of w.parts){const n=plan.nodes.find(n=>n.key===m.id)!;assert.deepEqual(portsFor(m).map(p=>[p.id,p.x,p.z,p.dx,p.dz]),n.ports.map(p=>[p.key,p.position.x,p.position.z,p.facing.x,p.facing.z]));}
 assert.deepEqual(workbenchModel('waterworks',0,w).plan,plan);assert.equal(compileWaterworks({...w,links:[...w.links,'intake.out>tank.in']}).valid,false);
 const rotated=build(w,{scrap:5,core:0,water:0},{type:'rotate',id:'transfer',rotation:1},{x:-12,z:3},'valley').machine;assert.ok(compileWaterworks(rotated).valid);assert.equal(compileWaterworks(rotated).connections.length,1);
});
test('workbench preview changes meaningful workshop plans without mutating live state',()=>{
 const state=createState(73129),before=serializeSave(state);const geometries=new Set(Array.from({length:32},(_,seed)=>JSON.stringify(workbenchModel('workshop',seed,state.waterworks).plan.shapes.map(s=>[s.center,s.half]))));assert.ok(geometries.size>20);assert.equal(serializeSave(state),before);
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');assert.match(main,/workbench-settings.*Procedural workbench/);assert.match(main,/workbench-build.*Inspect procedural plan/);assert.match(main,/mountWorkbench\(panel,state.waterworks,state.seed,closePanel\)/);assert.match(main,/const blocked=!startup.playing\|\|!!activeConversation\|\|!panel.hidden/);assert.match(main,/action==='close'.*closePanel\(\)/);assert.match(main,/for\(const s of workshop.plan.shapes\).*obstacles.push\(\{x:s.center.x,y:s.center.y/s);
});
test('schema5 migrates to pinned manifest with exact state; unknown versions/content are rejected',()=>{
 const now=createState(73129);const {generationManifest,...legacy}=now;const migrated=parseSave(JSON.stringify({...legacy,schemaVersion:5}));assert.deepEqual(migrated,now);assert.deepEqual(migrated!.generationManifest,GENERATION_MANIFEST);assert.ok(validateSave(migrated));
 assert.equal(parseSave(JSON.stringify({...now,generationManifest:{...GENERATION_MANIFEST,contentHash:'changed'}})),null);assert.equal(parseSave(JSON.stringify({...now,generationManifest:{...GENERATION_MANIFEST,domains:{...GENERATION_MANIFEST.domains,workshop:2}}})),null);
 const workshop=worldWorkshop(now.seed),wall=workshop.plan.shapes.find(s=>s.center.y===1.6&&s.half.y===1.6)!;assert.ok(wall);const rescued=parseSave(JSON.stringify({...legacy,schemaVersion:5,player:{x:wall.center.x,z:wall.center.z,hp:90}}))!;assert.equal(rescued.player.hp,90);assert.deepEqual({x:rescued.player.x,z:rescued.player.z},workshop.spawn);assert.deepEqual(rescued.inventory,now.inventory);
});
test('overhead workshop roofs and foundation never become invisible horizontal pulse blockers',()=>{
 const from={x:0,z:0},to={x:0,z:3};assert.equal(clearPulsePath(from,to,[{x:0,z:1.5,hx:2,hz:2,y:3.32,hy:.12},{x:0,z:1.5,hx:2,hz:2,y:-.06,hy:.06}]),true);assert.equal(clearPulsePath(from,to,[{x:0,z:1.5,hx:2,hz:.1,y:1.6,hy:1.6}]),false);
});
test('introducing the workshop clears only its plot without consuming legacy valley random draws',async()=>{
 const {generateObjects}=await import('../src/world.ts');const {withinBuildArea}=await import('../src/waterworks.ts');const {WORKSHOP_CLEARANCE}=await import('../src/building.ts');
 const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');const treeLoop=source.split('\n').find(l=>l.startsWith('for(let i=0;i<130;i++)'))!;const rockLoop=source.split('\n').find(l=>l.startsWith('for(let i=0;i<90;i++)'))!;
 assert.ok(treeLoop.includes('const size=.9+rnd()*1.6;if(inWorkshopClearance'));assert.ok(rockLoop.includes('const size=.25+rnd()*.5;if(inWorkshopClearance'));
 const legacyTree=treeLoop.replace('const size=.9+rnd()*1.6;if(inWorkshopClearance(x,z,1))continue;tree(x,z,size);','tree(x,z,.9+rnd()*1.6);');
 const legacyRock=rockLoop.replace('const size=.25+rnd()*.5;if(inWorkshopClearance(x,z,.5))continue;const r=mesh(new THREE.DodecahedronGeometry(size,0)','const r=mesh(new THREE.DodecahedronGeometry(.25+rnd()*.5,0)');
 const clear=(x:number,z:number,margin=0)=>Math.abs(x-WORKSHOP_CLEARANCE.x)<WORKSHOP_CLEARANCE.hx+margin&&Math.abs(z-WORKSHOP_CLEARANCE.z)<WORKSHOP_CLEARANCE.hz+margin;
 function run(seed:number,trees:string,rocks:string){const foundTrees:number[][]=[],foundRocks:number[][]=[];const THREE={DodecahedronGeometry:class {size:number;constructor(size:number){this.size=size;}}};const mesh=(g:{size:number},_color:string,_scene:unknown,x:number,_y:number,z:number)=>{foundRocks.push([x,z,g.size]);return {scale:{y:1}};};const body=`let rngState=state.seed;function rnd(){rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;} ${trees} ${rocks} return rngState;`;const rng=Function('state','withinBuildArea','valleyObjects','tree','inWorkshopClearance','THREE','scene','mesh',body)({seed},withinBuildArea,generateObjects(seed),(x:number,z:number,s:number)=>foundTrees.push([x,z,s]),clear,THREE,{},mesh);return {rng,trees:foundTrees,rocks:foundRocks};}
 for(const seed of [0,1,7,42,606,73129,4294967295]){const old=run(seed,legacyTree,legacyRock),current=run(seed,treeLoop,rockLoop);assert.equal(current.rng,old.rng,`random stream at seed ${seed}`);assert.deepEqual(current.trees,old.trees.filter(t=>!clear(t[0]!,t[1]!,1)));assert.deepEqual(current.rocks,old.rocks.filter(r=>!clear(r[0]!,r[1]!,.5)));}
});
test('sub-micro-unit costs cannot be rounded away to bypass a zero resource budget',async()=>{
 const {AxiomRegistry,compileRecipe,expr}=await import('../src/procedural.ts');const r=new AxiomRegistry().register({id:'dust',version:1,label:'Dust',shapes:[],ports:[],costs:{gold:.0000004},properties:{}});const p=compileRecipe(r,{id:'dust-recipe',version:1,description:'Precision guard',limits:{nodes:1,operations:50,depth:4},expression:expr.instantiate('dust','dust')},{seed:1,owner:'test',maxCost:{gold:0}});assert.equal(p.valid,false);assert.match(p.constraints.find(c=>!c.ok)!.message,/six decimal/);
});
test('duplicate semantic choice and requirement names fail instead of becoming order-dependent',async()=>{
 const {AxiomRegistry,compileRecipe,expr}=await import('../src/procedural.ts');const registry=new AxiomRegistry().register({id:'a',version:1,label:'A',shapes:[],ports:[],costs:{},properties:{}});const compile=(expression:import('../src/procedural.ts').Expression)=>compileRecipe(registry,{id:'duplicates',version:1,description:'Duplicates',limits:{nodes:10,operations:100,depth:10},expression},{seed:1,owner:'test'});
 for(const keys of [['first','second'],['second','first']]){const p=compile(expr.group(...keys.map(key=>expr.choose('duplicate','variant',[{key,weight:1,child:expr.instantiate('node','a')}]))));assert.equal(p.valid,false);assert.match(p.constraints.find(c=>!c.ok)!.message,/Duplicate choice/);}
 assert.equal(compile(expr.group(expr.require('same',{kind:'count',axiom:'a',min:0,max:1}),expr.require('same',{kind:'count',axiom:'a',min:0,max:1}))).valid,false);
});
test('node, shape, port and connection identity namespaces cannot alias with slash-bearing keys',async()=>{
 const {AxiomRegistry,compileRecipe,expr}=await import('../src/procedural.ts');const registry=new AxiomRegistry();for(const [id,key]of [['a','x/shape/b'],['b','b']]as const)registry.register({id,version:1,label:id,costs:{},properties:{},shapes:[{key,center:{x:0,y:1,z:0},half:{x:1,y:1,z:1},material:'stone'}],ports:[{key:key.replace('shape','port'),type:'work',direction:'both',protocol:'work',capacity:1,unit:'worker',position:{x:0,y:0,z:0},facing:{x:1,y:0,z:0}}]});
 const p=compileRecipe(registry,{id:'ids',version:1,description:'Identity guard',limits:{nodes:10,operations:500,depth:8},expression:expr.group(expr.instantiate('a','a'),expr.instantiate('a/shape/x','b'),expr.instantiate('a/port/x','b'),expr.instantiate('connection/supply','b'))},{seed:1,owner:'o'});assert.ok(p.valid);const ids=[...p.nodes.map(n=>n.id),...p.shapes.map(s=>s.id),...p.nodes.flatMap(n=>n.ports.map(p=>p.id)),...p.connections.map(c=>c.id)];assert.equal(new Set(ids).size,ids.length);
});
