import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createWildernessView} from '../src/wilderness-view.ts';
import {wildernessFeatures} from '../src/wilderness.ts';

function finite(root:THREE.Object3D){
  root.updateMatrixWorld(true);
  root.traverse(node=>assert.ok([...node.position.toArray(),...node.rotation.toArray().slice(0,3),...node.scale.toArray(),...node.matrixWorld.elements].every(Number.isFinite),node.name||node.type));
  const bounds=new THREE.Box3().setFromObject(root);
  assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));
}
function dispose(root:THREE.Object3D){root.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();}});}

test('untouched tree canopies remain finite through repeated first-frame and idle updates',()=>{
  const view=createWildernessView(),tree=wildernessFeatures({generation:2,seed:73129}).find(feature=>feature.kind==='tree')!,root=view.create(tree,false);
  try{
    finite(root);
    for(const dt of [0,1/60,1,60,3600]){view.update(dt,false);finite(root);}
    assert.ok(root.children.every(child=>child.rotation.z===0));
    view.update(1/60,true);finite(root);
  }finally{view.forget(tree.id,root);dispose(root);}
});

test('staff tree feedback settles to finite neutral geometry and respects reduced motion',()=>{
  const view=createWildernessView(),tree=wildernessFeatures({generation:1,seed:3}).find(feature=>feature.kind==='tree')!,root=view.create(tree,true);
  try{
    view.hit(tree.id);view.update(1/60,false);finite(root);
    assert.ok(root.children.some(child=>child.rotation.z!==0),'live hit gives a bounded canopy response');
    for(let frame=0;frame<240;frame++){view.update(1/60,false);finite(root);}
    assert.ok(root.children.every(child=>child.rotation.z===0),'expired hit returns exactly to rest');
    view.hit(tree.id);view.update(1/60,true);finite(root);
    assert.ok(root.children.every(child=>child.rotation.z===0),'reduced motion remains still');
    view.setDebug(true);assert.equal(root.getObjectByName('physical-solid-outline')!.visible,true);
    view.setDebug(false);assert.equal(root.getObjectByName('physical-solid-outline')!.visible,false);
  }finally{view.forget(tree.id,root);dispose(root);}
});

test('replacing a resident feature keeps the new visual registered when its old root is disposed',()=>{
  const view=createWildernessView(),tree=wildernessFeatures({generation:2,seed:73129}).find(feature=>feature.kind==='tree')!,old=view.create(tree,false),next=view.create(tree,true);
  try{
    view.forget(tree.id,old);assert.equal(view.count,1);
    view.hit(tree.id);view.update(1/60,false);finite(next);
    assert.ok(next.children.some(child=>child.rotation.z!==0));
    assert.ok(old.children.every(child=>child.rotation.z===0));
    view.forget(tree.id,next);assert.equal(view.count,0);
  }finally{dispose(old);dispose(next);}
});
