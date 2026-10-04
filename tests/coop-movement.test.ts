import test from 'node:test';
import assert from 'node:assert/strict';
import {actorPathClear,COOP_BODY} from '../server/coop-movement.ts';
test('full actor sweep catches low pipes that an eye-height ray misses',()=>{
  const pipe=[{x:0,z:0,hx:1,hz:.2,hy:.2,y:.2}],a={x:0,y:0,z:-2},b={x:0,y:0,z:2};
  assert.equal(actorPathClear(a,b,pipe,false),false);assert.equal(actorPathClear(a,b,pipe,true),false);
});
test('standing clearance rejects overhead beam but legal crouch fits',()=>{
  const beam=[{x:0,z:0,hx:1,hz:1,hy:.2,y:1.5}],a={x:0,y:0,z:-2},b={x:0,y:0,z:2};
  assert.equal(actorPathClear(a,b,beam,false),false);assert.equal(actorPathClear(a,b,beam,true),true);
  assert.equal(actorPathClear({x:0,y:0,z:0},{x:0,y:0,z:0},beam,false),false);
  const tooLow=[{...beam[0]!,y:1.15}];assert.equal(actorPathClear(a,b,tooLow,true),false);
});
test('capsule footprint, support contact and raised feet are part of sweep',()=>{
  const floor=[{x:0,z:0,y:-.2,hx:4,hz:4,hy:.2}],a={x:0,y:0,z:-2},b={x:0,y:0,z:2};
  assert.equal(actorPathClear(a,b,floor,false),true);
  const wall=[{x:COOP_BODY.radius+.1,z:0,hx:.2,hz:1,hy:2}];assert.equal(actorPathClear(a,b,wall,false),false);
  assert.equal(actorPathClear({...a,y:3},{...b,y:3},[{x:0,z:0,hx:1,hz:.2,hy:.2}],false),true);
  assert.equal(actorPathClear({...a,x:NaN},b,[],false),false);
});
