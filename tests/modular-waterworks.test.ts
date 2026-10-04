import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILD_AREA,BUILD_EXCLUSIONS,GRID_CELLS,MAX_MODULES,PART_DEFS,PADS,LINKS,build,capacity,emptyWaterworks,flow,inletWorking,supplyWorking,linkEndpoints,machineCosts,machineObstacles,migrateLegacyMachine,moduleObstacles,portsFor,possibleLinks,safeMachineSpawn,snapToGrid,validLegacyMachine,validMachine,withinBuildArea,type Module,type Part,type Rotation,type Waterworks,type BuildCommand} from '../src/waterworks.ts';
import {createState,applyAction,generateObjects,parseSave,serializeSave,validateSave,type State} from '../src/world.ts';
const player={x:-10,z:10};
const inventory={scrap:100,core:100,water:0};
const part=(id:string,kind:Part,x:number,z:number,rotation:Rotation=0):Module=>({id,kind,x,z,rotation});
function assemble(modules:Module[]){let w=emptyWaterworks();for(const m of modules){const result=build(w,inventory,{type:'place',...m},{x:m.x,z:m.z+2},'valley');assert.notEqual(result.machine,w,result.reason);w=result.machine;}for(const link of possibleLinks(w)){const result=build(w,inventory,{type:'connect',link},player,'valley');assert.notEqual(result.machine,w,result.reason);w=result.machine;}return w;}
const defaultModules=()=>PADS.map(p=>part(p.id,p.kind,p.x,p.z));
const bentModules=()=>[part('source','pump',-5,6),part('turn-south','corner',-8,6),part('turn-west','elbow',-8,9,3),part('store','reservoir',-11,9),part('town','outlet',-14,9)];
function paidWorld(){let s=createState(7);for(const o of generateObjects(s.seed).filter(o=>['scrap','core'].includes(o.kind))){s=applyAction(s,{type:'move',x:o.x,z:o.z});s=applyAction(s,{type:'collect',id:o.id});}s=applyAction(s,{type:'move',...player});for(const p of PADS)s=applyAction(s,{type:'build',command:{type:'place',pad:p.id,kind:p.kind,x:p.x,z:p.z}});for(const link of LINKS)s=applyAction(s,{type:'build',command:{type:'connect',link}});return s;}

test('bounded board contains eighteen snapped cells; projection does not silently clamp an outside position',()=>{
 assert.equal(GRID_CELLS.length,18);assert.equal(new Set(GRID_CELLS.map(p=>`${p.x},${p.z}`)).size,18);
 assert.deepEqual(snapToGrid(-16.8,8.8),{x:-17,z:9});assert.deepEqual(snapToGrid(-2,15),{x:-2,z:15});
 assert.equal(withinBuildArea(-21.5,4.5),true);assert.equal(withinBuildArea(-22,4),false);assert.equal(withinBuildArea(-22,4,.5),true);
 for(const c of GRID_CELLS)assert.deepEqual(snapToGrid(c.x,c.z),c);
 assert.equal(BUILD_AREA.maxModules,MAX_MODULES);
});

test('all seven definitions support every quarter turn and colliders rotate with their actual asymmetric solids',()=>{
 for(const kind of Object.keys(PART_DEFS) as Part[])for(let r=0;r<4;r++){
  const rotation=r as Rotation,x=kind==='pump'?-5:kind==='outlet'?-20:-17,z=kind==='pump'?6:9;
  const m=part('test',kind,x,z,rotation),w=build(emptyWaterworks(),inventory,{type:'place',...m},{x:m.x,z:m.z+2},'valley').machine;
  assert.equal(w.parts.length,1,`${kind}/${r}`);assert.ok(validMachine(w));
  const ports=portsFor(m);assert.equal(ports.length,PART_DEFS[kind].ports.length);
  for(let i=0;i<ports.length;i++){
   const p=ports[i]!,local=PART_DEFS[kind].ports[i]!;
   assert.equal(Math.abs(p.x-x)+Math.abs(p.z-z),1.5);assert.equal(Math.abs(p.dx)+Math.abs(p.dz),1);
   assert.equal(p.direction,local.direction);assert.equal(p.fluid,'water');assert.ok(Math.abs(p.x-x-p.dx*1.5)<1e-12);assert.ok(Math.abs(p.z-z-p.dz*1.5)<1e-12);
  }
  for(let i=0;i<PART_DEFS[kind].solids.length;i++){
   const local=PART_DEFS[kind].solids[i]!,o=moduleObstacles(m)[i]!;
   assert.equal(o.hx,r%2?local.hz:local.hx);assert.equal(o.hz,r%2?local.hx:local.hz);assert.equal(o.hy,local.hy);
   assert.ok(Math.abs(Math.hypot(o.x-x,o.z-z)-Math.hypot(local.x,local.z))<1e-12);
  }
 }
 const corner=part('bend','corner',-17,9);assert.equal(moduleObstacles(corner).length,2);
 assert.ok(!moduleObstacles(corner).some(o=>-18>o.x-o.hx&&-18<o.x+o.hx&&8>o.z-o.hz&&8<o.z+o.hz),'empty northwest corner stays physically clear');
});

test('authority rejects off-grid, outside, route/object collisions, wrong source/sink banks and invalid rotations',()=>{
 const empty=emptyWaterworks();
 const bad:unknown[]=[
  {type:'place',kind:'pipe',x:-17.1,z:9}, {type:'place',kind:'pipe',x:-23,z:9},
  {type:'place',kind:'pipe',x:-17,z:3}, {type:'place',kind:'pump',x:-8,z:6}, {type:'place',kind:'outlet',x:-11,z:9},
  {type:'place',kind:'reservoir',x:-8,z:9}, // actual salvage footprint at (-9,8)
  {type:'place',kind:'reservoir',x:-11,z:12}, // salvage at (-11,13)
  {type:'place',kind:'pipe',x:-17,z:9,rotation:4},{type:'place',kind:'pipe',x:-17,z:9,rotation:-1},
  {type:'place',kind:'pipe',x:-17,z:9,rotation:null},{type:'place',kind:'pipe',x:-17,z:9,rotation:.5},{type:'place',kind:'pipe',x:-17,z:9,rotation:NaN},
  {type:'place',kind:'constructor',x:-17,z:9},{type:'place',kind:'pipe',x:Infinity,z:9},
  {type:'place',kind:'pipe',x:-17,z:9,id:'a.out>b.in'}, {type:'forged'}, null,
 ];
 for(const command of bad)assert.equal(build(empty,inventory,command as BuildCommand,player,'valley').machine,empty,JSON.stringify(command));
 const command={type:'place',kind:'pipe',x:-17,z:9} as const;
 for(const p of [{x:-17,z:9},{x:-15.3,z:9},{x:-17,z:9.5}])assert.equal(build(empty,inventory,command,p,'valley').machine,empty);
 assert.equal(build(empty,inventory,command,{x:40,z:40},'valley').machine,empty);
 assert.equal(build(empty,inventory,command,player,'dungeon').machine,empty);
 assert.equal(build(empty,{...inventory,scrap:NaN},command,player,'valley').machine,empty);
 const w=build(empty,inventory,command,player,'valley').machine;
 assert.equal(build(w,inventory,command,player,'valley').machine,w);
 assert.equal(build(w,inventory,{...command,x:-14,id:w.parts[0]!.id},player,'valley').machine,w);
});

test('new bent layout has typed adjoining directed sockets, real connectivity and unchanged conserved rates',()=>{
 const w=assemble(bentModules());assert.equal(w.parts.length,5);assert.equal(w.links.length,4);assert.equal(capacity(w),20);
 assert.deepEqual(machineCosts(w),{scrap:4,core:1});assert.ok(inletWorking(w));assert.ok(supplyWorking(w));
 for(const link of w.links){const e=linkEndpoints(w,link)!;assert.equal(e.from.port.x,e.to.port.x);assert.equal(e.from.port.z,e.to.port.z);assert.ok(e.from.port.dx===-e.to.port.dx);assert.ok(e.from.port.dz===-e.to.port.dz);}
 assert.equal(linkEndpoints(w,'source.out>store.in'),null);assert.equal(linkEndpoints(w,'store.in>source.out'),null);
 let bent=w,straight=assemble(defaultModules());for(let i=0;i<90;i++){bent=flow(bent,1);straight=flow(straight,1);}
 for(const k of ['stored','extracted','delivered','drained'] as const)assert.equal(bent[k],straight[k],k);
 let missing=build(w,inventory,{type:'disconnect',link:'turn-south.out>turn-west.in'},player,'valley').machine;
 assert.equal(inletWorking(missing),false);assert.equal(flow(missing,1),missing);
 missing=build(missing,inventory,{type:'connect',link:'turn-south.out>turn-west.in'},player,'valley').machine;assert.ok(supplyWorking(missing));
});

test('tee dead-end branch never duplicates extraction or delivery; pipe rotation invalidates joins without cost or water loss',()=>{
 const modules=defaultModules();modules[1]=part('transfer','tee',-8,6);modules.push(part('side','elbow',-8,9,3));
 let w=assemble(modules);assert.equal(w.links.length,4);assert.ok(w.links.includes('transfer.branch>side.in'));
 for(let i=0;i<60;i++)w=flow(w,1);assert.equal(w.extracted,80);assert.equal(w.delivered,60);assert.equal(w.stored,20);
 const before=inventory,rotated=build(w,before,{type:'rotate',id:'transfer',rotation:1},player,'valley');
 assert.equal(rotated.inventory,before);assert.deepEqual(rotated.machine.links,['tank.out>outlet.in']);assert.equal(rotated.machine.stored,20);
 assert.equal(rotated.machine.extracted,80);assert.ok(validMachine(rotated.machine));assert.equal(inletWorking(rotated.machine),false);
 assert.equal(build(rotated.machine,before,{type:'rotate',id:'transfer',rotation:1},player,'valley').machine,rotated.machine);
});

test('network topology validates every port, unique occupancy, single storage/source/sink and no directed cycles',()=>{
 const w=assemble(defaultModules());
 const bad:unknown[]=[
  {...w,parts:Array(1)}, {...w,parts:[...w.parts,w.parts[0]]}, {...w,parts:[...w.parts,{...w.parts[1],id:'copy'}]},
  {...w,parts:[...w.parts,part('extra-pump','pump',-5,9)]}, {...w,parts:[...w.parts,part('extra-tank','reservoir',-17,9)]},
  {...w,parts:[...w.parts,part('extra-outlet','outlet',-20,9)]}, {...w,parts:[...w.parts,part('outside','pipe',40,40)]},
  {...w,links:[...w.links,w.links[0]]}, {...w,links:['intake:transfer']}, {...w,links:['intake.out>tank.in']},
  {...w,links:['transfer.in>intake.out']}, {...w,links:['ghost.out>transfer.in']}, {...w,links:['intake.missing>transfer.in']},
  {...w,parts:w.parts.map((m,i)=>i?m:{...m,rotation:NaN})}, {...w,stored:1}, {...w,extracted:Infinity},
 ];
 for(const malformed of bad){assert.equal(validMachine(malformed),false);assert.equal(flow(malformed as Waterworks,1),malformed);}
 // Four rotated corners form physically mating sockets, but closing the last edge is prohibited.
 let cycle=emptyWaterworks();cycle.parts=[part('a','corner',-20,6,0),part('b','corner',-17,6,1),part('c','corner',-17,9,2),part('d','corner',-20,9,3)];
 // Construct cycle directly from port mating rather than assuming coordinate orientation.
 const candidates=cycle.parts.flatMap(a=>portsFor(a).filter(p=>p.direction==='out').flatMap(p=>cycle.parts.flatMap(b=>portsFor(b).filter(q=>q.direction==='in').map(q=>`${a.id}.${p.id}>${b.id}.${q.id}`)))).filter(l=>linkEndpoints(cycle,l));
 assert.equal(candidates.length,4);cycle.links=candidates.slice(0,3);assert.ok(validMachine(cycle));
 const final=candidates[3]!;assert.ok(!possibleLinks(cycle).includes(final));assert.equal(build(cycle,inventory,{type:'connect',link:final},player,'valley').machine,cycle);
 assert.equal(validMachine({...cycle,links:candidates}),false);
});

test('global module budget is enforced independently of available materials',()=>{
 let w=emptyWaterworks();
 for(const c of GRID_CELLS){const result=build(w,inventory,{type:'place',kind:'pipe',...c}, {x:c.x,z:c.z+2},'valley');if(w.parts.length<MAX_MODULES)assert.notEqual(result.machine,w,result.reason);else assert.equal(result.machine,w);w=result.machine;}
 assert.equal(w.parts.length,MAX_MODULES);assert.ok(validMachine(w));
 assert.equal(validMachine({...w,parts:[...w.parts,part('too-many','pipe',-5,12)]}),false);
});

test('branched and bent flow remain step-equivalent across tank-full and empty transitions; drainage and refunds are idempotent',()=>{
 const initial=assemble(bentModules());let coarse=initial,fine=initial;for(let i=0;i<120;i++)coarse=flow(coarse,1);for(let i=0;i<7200;i++)fine=flow(fine,1/60);
 for(const k of ['stored','extracted','delivered'] as const)assert.ok(Math.abs(coarse[k]-fine[k])<1e-7);
 const disconnected=build(coarse,inventory,{type:'disconnect',link:coarse.links[0]!},player,'valley').machine;
 const repeated=build(disconnected,inventory,{type:'disconnect',link:coarse.links[0]!},player,'valley');assert.equal(repeated.machine,disconnected);
 let drain=disconnected;for(let i=0;i<30;i++)drain=flow(drain,1);assert.equal(drain.stored,0);assert.equal(drain.extracted,disconnected.extracted);assert.equal(drain.extracted,drain.delivered);
 const result=build(coarse,inventory,{type:'dismantle',id:'store'},player,'valley');assert.equal(result.machine.drained,20);assert.equal(result.machine.stored,0);assert.equal(result.inventory.scrap,101);assert.ok(validMachine(result.machine));
 assert.equal(build(result.machine,result.inventory,{type:'dismantle',id:'store'},player,'valley').machine,result.machine);
 assert.equal(build(result.machine,result.inventory,{type:'dismantle',id:'store'},player,'valley').inventory,result.inventory);
});

test('schema 4 migrates semantic module identities, link direction, original costs and every existing ledger exactly',()=>{
 let s=paidWorld();for(let i=0;i<35;i++)s=applyAction(s,{type:'tick',dt:1});
 const old={...s,schemaVersion:4,waterworks:{...s.waterworks,parts:PADS.map(p=>p.id),links:[...LINKS]}};
 assert.ok(validLegacyMachine(old.waterworks));const migrated=parseSave(JSON.stringify(old))!;assert.ok(migrated);assert.equal(migrated.schemaVersion,6);
 assert.deepEqual(migrated.waterworks.parts,defaultModules());assert.deepEqual(migrated.waterworks.links,['intake.out>transfer.in','transfer.out>tank.in','tank.out>outlet.in']);
 assert.deepEqual(machineCosts(migrated.waterworks),{scrap:3,core:1});
 for(const key of ['player','inventory','collected','defeated','settlement','jobs','waterRestored','jobAccepted','revision','events'] as const)assert.deepEqual(migrated[key],s[key],key);
 for(const key of ['stored','extracted','delivered','drained'] as const)assert.equal(migrated.waterworks[key],s.waterworks[key],key);
 assert.deepEqual(parseSave(serializeSave(migrated)),migrated);assert.ok(validateSave(migrated));
 for(const corrupt of [{...old.waterworks,parts:['intake','intake']},{...old.waterworks,stored:21},{...old.waterworks,links:['transfer:intake']},{...old.waterworks,parts:['ghost']},{...old.waterworks,delivered:1e5}]){assert.equal(migrateLegacyMachine(corrupt),null);assert.equal(parseSave(JSON.stringify({...old,waterworks:corrupt})),null);}
 for(const malformed of [{...s,inventory:{...s.inventory,scrap:s.inventory.scrap+1}},{...s,waterworks:{...s.waterworks,parts:s.waterworks.parts.map((p,i)=>i? p:{...p,kind:'pipe'})}}])assert.equal(validateSave(malformed),false);
});

test('schema 1/2/3 still migrates and malformed legacy module data cannot be promoted',()=>{
 const s=createState();
 for(const schemaVersion of [1,2,3]){const legacy={...s,schemaVersion,waterworks: schemaVersion<3?undefined:{parts:[],links:[],stored:0,extracted:0,delivered:0,drained:0},settlement:undefined,jobs:undefined};const migrated=parseSave(JSON.stringify(legacy));assert.ok(migrated);assert.deepEqual(migrated, s);}
 assert.equal(parseSave(JSON.stringify({...s,schemaVersion:3,waterworks:{...emptyWaterworks(),parts:[part('custom','pipe',-17,9)]}})),null);
});

test('jumping above a module saves safely: planar reload relocates only player position beside collision geometry',()=>{
 const s=paidWorld(),onTop={...s,player:{x:-11,z:6,hp:75}};
 assert.ok(validateSave(onTop));const loaded=parseSave(serializeSave(onTop))!;assert.ok(loaded);assert.notDeepEqual(loaded.player,onTop.player);assert.equal(loaded.player.hp,75);
 assert.deepEqual({...loaded,player:onTop.player},onTop);
 for(const o of machineObstacles(loaded.waterworks))assert.ok(Math.hypot(Math.max(0,Math.abs(loaded.player.x-o.x)-o.hx),Math.max(0,Math.abs(loaded.player.z-o.z)-o.hz))>=.34);
 assert.equal(safeMachineSpawn(s.waterworks,s.player),s.player);assert.deepEqual(parseSave(serializeSave(s)),s);
 assert.ok(!BUILD_EXCLUSIONS.some(o=>Math.abs(loaded.player.x-o.x)<o.hx&&Math.abs(loaded.player.z-o.z)<o.hz));
});

test('emergency recall and loading a dead save cannot embed a player in a newly built camp-side pipe',()=>{
 let s=paidWorld();s=applyAction(s,{type:'build',command:{type:'place',kind:'pipe',id:'camp-side',x:-14,z:12}});
 assert.ok(s.waterworks.parts.some(p=>p.id==='camp-side'));assert.ok(validateSave(s));
 const dead:State={...s,player:{x:-14,z:12,hp:0}};
 const loaded=parseSave(serializeSave(dead))!;assert.ok(loaded);assert.equal(loaded.player.hp,0);
 const recalled=applyAction(loaded,{type:'respawn'});assert.equal(recalled.player.hp,100);assert.equal(recalled.zone,'valley');
 assert.notDeepEqual({x:recalled.player.x,z:recalled.player.z},{x:-13,z:12});
 for(const p of [loaded.player,recalled.player])for(const o of machineObstacles(s.waterworks))assert.ok(Math.hypot(Math.max(0,Math.abs(p.x-o.x)-o.hx),Math.max(0,Math.abs(p.z-o.z)-o.hz))>=.34);
 for(const key of ['waterworks','inventory','collected','defeated','settlement','jobs','waterRestored','jobAccepted'] as const)assert.deepEqual(recalled[key],s[key]);
 assert.equal(applyAction(recalled,{type:'respawn'}),recalled);assert.ok(validateSave(recalled));
});
