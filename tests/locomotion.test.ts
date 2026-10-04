import {test} from 'node:test';import assert from 'node:assert/strict';
import {analogSpeed,movementInput,idleMotor,stepMotor,idleAnimation,stepAnimation,footContact,gaitFor,type MotionInput} from '../src/locomotion.ts';
const input=(x=0,z=0,extra:Partial<MotionInput>={}):MotionInput=>({x,z,analog:true,sprint:false,crouch:false,paused:false,...extra});
test('thumb speed is continuous and strictly increasing through all five gaits',()=>{
 let previous=0;for(let i=1;i<=1000;i++){const speed=analogSpeed(i/1000);assert.ok(speed>previous);assert.ok(speed-previous<.011);previous=speed;}
 assert.equal(analogSpeed(1),8);assert.equal(analogSpeed(0),0);assert.equal(analogSpeed(NaN),0);assert.equal(analogSpeed(9),8);
 assert.deepEqual([.1,.3,.5,.7,1].map(x=>gaitFor(analogSpeed(x))),['tiptoe','walk','jog','run','sprint']);
});
test('analog magnitude survives camera rotation and mixed axes; keyboard diagonal is no faster',()=>{
 for(const strength of [.07,.25,.5,1])for(const orbit of [0,.6,Math.PI]){const v=movementInput(0,0,strength,0,orbit);assert.ok(Math.abs(Math.hypot(v.x,v.z)-strength)<1e-10);}
 const a=movementInput(1,1,0,0,.4),b=movementInput(1,0,0,0,.4);assert.ok(Math.abs(Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))<1e-10);assert.ok(Math.abs(analogSpeed(Math.hypot(b.x,b.z))-5)<1e-10);
 assert.ok(Math.abs(Math.hypot(...Object.values(movementInput(1,1,1,1,0,true)))-1)<1e-10);
});
test('motor accelerates, decelerates and reverses with finite bounded momentum',()=>{
 let m=idleMotor();m=stepMotor(m,input(1),1/60);assert.ok(m.vx>0&&m.vx<1);for(let i=0;i<60;i++)m=stepMotor(m,input(1),1/60);assert.equal(m.vx,8);
 m=stepMotor(m,input(),1/60);assert.ok(m.vx>0&&m.vx<8);for(let i=0;i<20;i++)m=stepMotor(m,input(),1/60);assert.equal(m.vx,0);
 for(let i=0;i<60;i++)m=stepMotor(m,input(-1),1/60);assert.equal(m.vx,-8);assert.deepEqual(stepMotor(m,input(0,0,{paused:true}),1/60),idleMotor());
});
test('slide needs running and a new crouch press, then gives way to slow crawl',()=>{
 let m=stepMotor(idleMotor(),input(1,0,{crouch:true}),1/60);assert.equal(m.slide,0);
 for(let i=0;i<60;i++)m=stepMotor(m,input(1,0,{crouch:true}),1/60);assert.equal(m.vx,1.45);
 for(let i=0;i<60;i++)m=stepMotor(m,input(1),1/60);m=stepMotor(m,input(0,1,{crouch:true}),1/60);assert.ok(m.slide>0);assert.ok(m.vx>7);assert.equal(m.vz,0,'slide retains actual momentum rather than snapping to new input');
 for(let i=0;i<90;i++)m=stepMotor(m,input(0,1,{crouch:true}),1/60);assert.equal(m.slide,0);assert.equal(m.vx,0);assert.equal(m.vz,1.45);
});
test('actual velocity drives heading/gait; a wall and neutral state cannot walk in place',()=>{
 let a=idleAnimation();for(let i=0;i<30;i++)a=stepAnimation(a,0,5,true,false,false,1/60,5/60);
 assert.equal(a.gait,'run');const phase=a.phase;for(let i=0;i<80;i++)a=stepAnimation(a,0,0,true,false,false,1/60,0);
 assert.equal(a.gait,'idle');assert.ok(a.speed<1e-6);assert.equal(a.phase,phase);
 const turn=stepAnimation(a,5,0,true,false,false,1/60,.08);assert.ok(turn.heading>0&&turn.heading<Math.PI/2,'turn is bounded');
});
test('feet hold a flat support interval and recover above the ground with continuous endpoints',()=>{
 for(let p=0;p<.6;p+=.01){const f=footContact(p,.8,.2);assert.equal(f.y,0);assert.equal(f.planted,true);}
 for(let p=.6;p<=1;p+=.01){const f=footContact(p,.8,.2);assert.ok(f.y>=-1e-10);assert.ok(f.y<=.2);}
 const a=footContact(.6-1e-7,.8,.2),b=footContact(.6+1e-7,.8,.2);assert.ok(Math.abs(a.z-b.z)<1e-6);assert.ok(Math.abs(a.y-b.y)<1e-6);
});
test('hold crouch releases slide immediately and cannot start one in the air',()=>{
 let m=idleMotor();for(let i=0;i<60;i++)m=stepMotor(m,input(1),1/60);
 const airborne=stepMotor(m,input(1,0,{crouch:true}),1/60,false);assert.equal(airborne.slide,0);
 m=stepMotor(m,input(1,0,{crouch:true}),1/60);assert.ok(m.slide>0);
 const released=stepMotor(m,input(1),1/60);assert.equal(released.slide,0);assert.ok(released.vx>7,'release keeps bounded running momentum');
});
test('airborne animation stops ground gait, keeps heading responsive and consumes landing compression',()=>{
 const a={...idleAnimation(),speed:5,phase:.3};
 const air=stepAnimation(a,5,0,false,false,false,1/60,.08,0,6.3,0);assert.equal(air.airborne,true);assert.equal(air.vertical,6.3);assert.equal(air.phase,a.phase);assert.ok(air.heading>0);assert.equal(air.landing,0);
 const landed=stepAnimation(air,0,0,true,false,false,1/60,0,0,0,1);assert.equal(landed.airborne,false);assert.equal(landed.landing,1);assert.equal(landed.vertical,0);
});
