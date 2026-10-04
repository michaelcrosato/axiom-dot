import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createEcologyState,ecologyPlan,advanceEcology,applyEcologyCommand,ecologyStage,type EcologyContext,type EcologyState} from '../src/ecology.ts';
import {mountEcologyPanel} from '../src/ecology-ui.ts';
import {createEcologyView} from '../src/ecology-view.ts';
import {worldValley} from '../src/generation.ts';
import {valleySurfaceHeight} from '../src/valley.ts';
class FakeElement {
 tagName:string;textContent='';className='';children:FakeElement[]=[];dataset:Record<string,string>={};attributes:Record<string,string>={};onclick:(()=>void)|null=null;disabled=false;title='';open=false;min=0;max=0;value=0;type='';
 constructor(tag:string){this.tagName=tag;}
 append(...children:FakeElement[]){this.children.push(...children);}
 replaceChildren(...children:FakeElement[]){this.children=[...children];}
 setAttribute(name:string,value:string){this.attributes[name]=value;}
 all():FakeElement[]{return [this,...this.children.flatMap(c=>c.all())];}
}
test('field panel is snapshot-only, accessible, rechecks clicked transactions and never double-spends stale buttons',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:(tag:string)=>new FakeElement(tag)}});
 try{
  let ecology=createEcologyState(1),calls=0,closed=0;const p=ecologyPlan(1).plots[0]!,panel=new FakeElement('aside');let context:EcologyContext={seed:1,generation:2,zone:'valley',player:{x:p.position.x,z:p.position.z,hp:50},inventory:{scrap:0,core:0,water:2}};
  const options={state:()=>({ecology,context}),act:(command:Parameters<typeof applyEcologyCommand>[2])=>{calls++;const result=applyEcologyCommand(ecology,context,command);ecology=result.state;context={...context,inventory:result.inventory,player:{...context.player,hp:context.player.hp+result.hpEffect}};},close:()=>closed++,selectedPlotId:p.id};
  const before=JSON.stringify(ecology);mountEcologyPanel(panel as unknown as HTMLElement,options);assert.equal(JSON.stringify(ecology),before);assert.equal(calls,0);assert.ok(panel.all().some(e=>e.textContent.includes('4 L')));assert.equal(panel.all().filter(e=>e.tagName==='meter').length,3);
  const water=panel.all().find(e=>e.tagName==='button'&&e.textContent==='Water soil · 1 canister'&&!e.disabled)!;assert.ok(water);water.onclick!();assert.equal(context.inventory.water,1);assert.equal(ecology.water.irrigation,4000);water.onclick!();assert.equal(context.inventory.water,1,'detached stale callback cannot charge again');
  assert.equal(panel.all().find(e=>e.tagName==='button'&&e.textContent==='Water soil · 1 canister')!.disabled,true);const close=panel.all().find(e=>e.attributes['aria-label']==='Close climate and field ecology')!;close.onclick!();assert.equal(closed,1);
  mountEcologyPanel(panel as unknown as HTMLElement,options);assert.equal(panel.all().filter(e=>e.tagName==='h2').length,1,'repeated mounts replace contents');assert.equal(ecology.tick,0,'the DOM cannot advance weather or growth');
 }finally{if(old)Object.defineProperty(globalThis,'document',old);else Reflect.deleteProperty(globalThis,'document');}
});

test('production renderer places ground geometry on real terrain and shares instanced plant shapes',()=>{
 const seed=3,view=createEcologyView(seed),state=createEcologyState(seed),valley=worldValley(seed),nodes:THREE.Object3D[]=[];view.root.traverse(o=>nodes.push(o));
 assert.equal(view.plan,ecologyPlan(seed));assert.equal(view.plots.length,3);assert.equal(nodes.filter(o=>o instanceof THREE.InstancedMesh).length,5);assert.ok(nodes.filter(o=>o instanceof THREE.Mesh).length<=8);
 for(const mesh of view.plots){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-valleySurfaceHeight(valley,p.getX(i),p.getZ(i))-.022)<1e-5);}
 view.sync(undefined);assert.equal(view.root.visible,false);view.sync(state);assert.equal(view.root.visible,true);const unchanged=JSON.stringify(state);view.sync(state);assert.equal(JSON.stringify(state),unchanged);
 const p=view.plan.plots[0]!,ctx:EcologyContext={seed,generation:2,zone:'valley',player:{x:p.position.x,z:p.position.z,hp:40},inventory:{scrap:0,core:0,water:1}};let planted=applyEcologyCommand(state,ctx,{type:'plant',plotId:p.id,species:'sunleaf',expectedRevision:0}).state;view.sync(planted);
 for(let i=0;i<400&&ecologyStage(planted.plots[0]!.crop)!=='ripe';i++)planted=advanceEcology(planted,1);assert.equal(ecologyStage(planted.plots[0]!.crop),'ripe');view.sync(planted);
 const plantMeshes=nodes.filter((o):o is THREE.InstancedMesh=>o instanceof THREE.InstancedMesh&&o.count===15),matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),pos=new THREE.Vector3(),q=new THREE.Quaternion();
 assert.equal(plantMeshes.length,3);for(const m of plantMeshes){m.getMatrixAt(0,matrix);matrix.decompose(pos,q,scale);assert.ok(scale.length()>0);}
 const harvested=applyEcologyCommand(planted,ctx,{type:'harvest',plotId:p.id,expectedRevision:planted.revision}).state;view.sync(harvested);plantMeshes[2]!.getMatrixAt(0,matrix);assert.equal(matrix.elements[0]!+matrix.elements[5]!+matrix.elements[10]!,0,'ripe goods disappear when actually harvested');
 view.dispose();assert.equal(view.root.children.length,0);
});
