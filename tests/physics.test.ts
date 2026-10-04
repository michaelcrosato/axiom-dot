import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
test('Rapier 0.20 fixed-step capsule lands and cannot cross a solid wall',async()=>{
await RAPIER.init();assert.equal(RAPIER.version(),'0.20.0');const w=new RAPIER.World({x:0,y:-9.81,z:0});w.timestep=1/60;
w.createCollider(RAPIER.ColliderDesc.cuboid(20,.2,20).setTranslation(0,-.2,0));w.createCollider(RAPIER.ColliderDesc.cuboid(.5,3,5).setTranslation(3,3,0));
const body=w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,1,0));const c=w.createCollider(RAPIER.ColliderDesc.capsule(.55,.32),body);const controller=w.createCharacterController(.02);controller.enableSnapToGround(.3);
for(let i=0;i<180;i++){controller.computeColliderMovement(c,{x:5/60,y:-.12,z:0});const p=body.translation(),v=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});w.step();}
const p=body.translation();assert.ok(p.x>2&&p.x<2.2,`wall blocked at ${p.x}`);assert.ok(p.y>.85&&p.y<1,`ground height ${p.y}`);assert.equal(controller.computedGrounded(),true);w.free();
});
