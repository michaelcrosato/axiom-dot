import {test} from 'node:test';
import assert from 'node:assert/strict';
import {idleAnimation,idleMotor,stepAnimation,stepMotor,stepGroundSupport,footContact,contactAnimationPhase,supportDutyFor,strideFor,landingForImpact,type AnimationState,type GroundLimbSupport,type GroundPoint} from '../src/locomotion.ts';
const DT=1/60;
const near=(a:number,b:number,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
const world=(limb:GroundLimbSupport,position:GroundPoint,heading:number):GroundPoint=>({x:position.x+limb.target.x*Math.cos(heading)+limb.target.z*Math.sin(heading),y:position.y+limb.target.y,z:position.z-limb.target.x*Math.sin(heading)+limb.target.z*Math.cos(heading)});
const pointNear=(a:GroundPoint,b:GroundPoint)=>{near(a.x,b.x);near(a.y,b.y);near(a.z,b.z);};
const supported=(a:AnimationState,position:GroundPoint={x:0,y:0,z:0},mode='none')=>stepGroundSupport(idleAnimation(),a,position,mode);

test('jump launch and touchdown preserve horizontal momentum without false braking or acceleration',()=>{
 let a={...idleAnimation(),speed:6,lean:.09};
 a=stepAnimation(a,0,6,false,false,false,DT,.1,0,6.3);
 near(a.speed,6);near(a.brake,0);near(a.lean,.09);assert.equal(a.takeoff,1);assert.equal(a.phase,0);
 for(let tick=1;tick<=40;tick++)a=stepAnimation(a,0,6,false,false,false,DT,.1,0,6.3-.3*tick);
 near(a.speed,6);near(a.brake,0);near(a.lean,.09);
 a=stepAnimation(a,0,6,true,false,false,DT,.1,0,0,1);
 near(a.speed,6);near(a.brake,0);near(a.lean,.09);assert.equal(a.landing,1);
 const brake=stepAnimation(a,0,4,true,false,false,DT,4*DT,0,0,0);
 assert.ok(brake.brake>.15,'real ground deceleration still produces braking weight');
});

test('walking off an edge does not invent a takeoff impulse',()=>{
 const falling=stepAnimation({...idleAnimation(),speed:3},0,3,false,false,false,DT,.05,0,-.3);
 assert.equal(falling.takeoff,0);near(falling.brake,0);assert.equal(falling.airborne,true);
});

test('foot recovery matches support horizontal velocity and zero vertical contact velocity',()=>{
 const epsilon=1e-6,stride=.8,lift=.2;
 for(const phase of [.6,1]){
  const before=footContact(phase-epsilon,stride,lift),at=footContact(phase,stride,lift),after=footContact(phase+epsilon,stride,lift);
  near((at.z-before.z)/epsilon,-stride/.6,1e-4);near((after.z-at.z)/epsilon,-stride/.6,1e-4);
  near((at.y-before.y)/epsilon,0,2e-5);near((after.y-at.y)/epsilon,0,2e-5);
 }
 for(let i=0;i<=100;i++){const f=footContact(.6+.4*i/100,stride,lift);assert.ok(f.y>=0&&f.y<=lift+1e-12);}
});

test('serialized support holds actual world plants through acceleration, turns and braking',()=>{
 let animation=idleAnimation(),motor=idleMotor(),position={x:0,y:0,z:0},plantPairs=0,releases=0;
 for(let tick=0;tick<240;tick++){
  const input={x:tick>=60&&tick<120?.45:0,z:tick<120?.8:0,analog:true,sprint:false,crouch:false,paused:false};
  motor=stepMotor(motor,input,DT);position={x:position.x+motor.vx*DT,y:0,z:position.z+motor.vz*DT};
  const previous=animation,next=stepAnimation(previous,motor.vx,motor.vz,true,false,false,DT,Math.hypot(motor.vx,motor.vz)*DT);
  animation=stepGroundSupport(previous,next,position,'none',DT);
  assert.ok(animation.support);
  for(const name of ['leftFoot','rightFoot'] as const){
   const current=animation.support[name],prior=previous.support?.[name];
   if(current.planted){assert.ok(current.anchor);pointNear(world(current,position,animation.heading),current.anchor);}
   if(prior?.planted&&current.planted){plantPairs++;assert.deepEqual(current.anchor,prior.anchor);near(current.heading,prior.heading);}
   if(prior?.planted&&!current.planted)releases++;
  }
  const replay=stepGroundSupport(JSON.parse(JSON.stringify(previous)),JSON.parse(JSON.stringify(next)),{...position},'none',DT);
  assert.deepEqual(replay,animation,'contact state is deterministic and JSON-serializable');
 }
 assert.ok(plantPairs>100);assert.ok(releases>5);
 const settled=JSON.parse(JSON.stringify(animation.support));
 for(let i=0;i<30;i++)animation=stepGroundSupport(animation,stepAnimation(animation,0,0,true,false,false,DT,0),position);
 assert.deepEqual(animation.support!.leftFoot.anchor,settled.leftFoot.anchor);
 assert.deepEqual(animation.support!.rightFoot.anchor,settled.rightFoot.anchor);
});

test('pull walks backward with world-fixed support instead of a root-relative static brace',()=>{
 let a=supported({...idleAnimation(),speed:1,phase:.3}),position={x:0,y:0,z:0},pairs=0;
 for(let i=0;i<90;i++){
  position={...position,z:position.z-DT};const previous=a;
  a=stepAnimation(a,0,-1,true,false,false,DT,DT);
  a=contactAnimationPhase(previous,a,'pull',DT);a.heading=0;
  a=stepGroundSupport(previous,a,position,'pull');
  for(const name of ['leftFoot','rightFoot'] as const){const prior=previous.support?.[name],current=a.support![name];if(prior?.planted&&current.planted){pairs++;pointNear(world(current,position,0),prior.anchor!);}}
 }
 assert.ok(pairs>40);
});

test('unreachable or overtwisted support releases deliberately before relocating',()=>{
 const base=supported({...idleAnimation(),phase:.3,speed:1});
 const translated=stepGroundSupport(base,{...base,phase:.31},{x:0,y:0,z:.55});
 assert.equal(translated.support!.leftFoot.planted,false);assert.equal(translated.support!.leftFoot.anchor,null);
 const foot=translated.support!.leftFoot;assert.ok(foot.recovery>0);assert.ok(foot.target.y>.09);assert.ok(Math.hypot(foot.target.x+.19,foot.target.z)<=.400001);
 const turned=stepGroundSupport(base,{...base,heading:Math.PI/2},{x:0,y:0,z:0});
 assert.equal(turned.support!.leftFoot.planted,false);assert.ok(turned.support!.leftFoot.recovery>0);
 let recovered=turned;
 for(let i=0;i<15;i++)recovered=stepGroundSupport(recovered,{...recovered,speed:0},{x:0,y:0,z:0});
 assert.equal(recovered.support!.leftFoot.planted,true);near(recovered.support!.leftFoot.heading,Math.PI/2);
});

test('crawl uses alternating world palm anchors only once the body can reach the floor',()=>{
 const entering=supported({...idleAnimation(),crouch:.7,speed:1});assert.equal(entering.support!.leftHand,null);
 let a=supported({...idleAnimation(),crouch:1,speed:1,phase:.1}),position={x:0,y:0,z:0},pairs=0;
 for(let i=0;i<90;i++){
  const previous=a;position={...position,z:position.z+DT};
  a=stepGroundSupport(previous,stepAnimation(previous,0,1,true,true,false,DT,DT,1),position);
  for(const name of ['leftHand','rightHand'] as const){const prior=previous.support?.[name],current=a.support![name]!;if(prior?.planted&&current.planted){pairs++;pointNear(world(current,position,0),prior.anchor!);}}
 }
 assert.ok(pairs>25);
 const rising=stepGroundSupport(a,{...a,crouch:.9},position);assert.equal(rising.support!.leftHand,null);
});

test('air, slide, ledge movement and teleports retire obsolete ground supports',()=>{
 const base=supported({...idleAnimation(),speed:2,phase:.2});
 for(const change of [{airborne:true},{slide:.2}])assert.equal(stepGroundSupport(base,{...base,...change},{x:0,y:0,z:0}).support,null);
 for(const mode of ['hang','climb'])assert.equal(stepGroundSupport(base,base,{x:0,y:0,z:0},mode).support,null);
 const teleported=stepGroundSupport(base,base,{x:5,y:2,z:3});assert.notDeepEqual(teleported.support!.leftFoot.anchor,base.support!.leftFoot.anchor);
 pointNear(world(teleported.support!.leftFoot,{x:5,y:2,z:3},0),teleported.support!.leftFoot.anchor!);
});

test('crate effort uses bounded stance and matched cadence without placing toes into the crate',()=>{
 for(const mode of ['push','pull']){
  let a=supported({...idleAnimation(),speed:6,phase:.05}),position={x:0,y:0,z:0};
  for(let i=0;i<50;i++){
   const previous=a,distance=.025,direction=mode==='pull'?-1:1;position={...position,z:position.z+direction*distance};
   const next=contactAnimationPhase(previous,{...a,phase:0},mode,distance);near(((next.phase-previous.phase+1)%1),((direction*distance*.6/.4+1)%1));
   a=stepGroundSupport(previous,next,position,mode);
   for(const name of ['leftFoot','rightFoot'] as const){const f=a.support![name];assert.ok(f.target.z<=.1000001,'front of ankle stays at least .255m behind boot-toe plane');}
  }
 }
});


test('standing and crawling cadence follows credible stride lengths instead of nine-step-per-second shuffles',()=>{
 for(const [speed,crouch,min,max] of [[2,0,3,3.5],[6,0,4.4,4.6],[8,0,4.9,5.1],[1.45,1,4,4.3]]){
  const cadence=2*speed*supportDutyFor(speed,crouch)/strideFor(speed,crouch);
  assert.ok(cadence>=min&&cadence<=max,`${speed}m/s crouch=${crouch}: ${cadence} steps/s`);
  let a={...idleAnimation(),speed,crouch},travel=0;
  for(let tick=0;tick<600;tick++){const next=stepAnimation(a,0,speed,true,crouch>0,false,DT,speed*DT,crouch);travel+=(next.phase-a.phase+1)%1;a=next;}
  near(travel*2/10,cadence,1e-9);
 }
 for(const duty of [.25,.3,.4,.6])for(const phase of [duty,1]){
  const e=1e-6,a=footContact(phase-e,.8,.2,duty),b=footContact(phase,.8,.2,duty),c=footContact(phase+e,.8,.2,duty);
  near((b.z-a.z)/e,-.8/duty,2e-4);near((c.z-b.z)/e,-.8/duty,2e-4);
  near((b.y-a.y)/e,0,2e-5);near((c.y-b.y)/e,0,2e-5);
 }
});

test('ground swing targets remain reachable and a completed forced recovery does not reuse its stale offset',()=>{
 let a=supported({...idleAnimation(),speed:6,phase:.1}),position={x:0,y:0,z:0};
 for(let i=0;i<120;i++){
  const previous=a;position={...position,z:position.z+.1};a=stepGroundSupport(previous,stepAnimation(a,0,6,true,false,false,DT,.1),position);
  for(const side of ['leftFoot','rightFoot'] as const){const f=a.support![side];if(!f.planted)assert.ok(Math.hypot(f.target.x-(side==='leftFoot'?-.19:.19),f.target.z)<=.400001);}
 }
 const interrupted=supported({...idleAnimation(),speed:6,phase:.4});
 const old=interrupted.support!.leftFoot;old.planted=false;old.anchor=null;old.release={x:0,y:0,z:-.3};old.recovery=.01;
 const finished=stepGroundSupport(interrupted,{...interrupted,phase:.4},{x:0,y:0,z:0});
 assert.equal(finished.support!.leftFoot.recovery,0);assert.equal(finished.support!.leftFoot.release,null);
});

test('landing compression is bounded and scales with measured impact speed',()=>{
 near(landingForImpact(1,6.3),1);near(landingForImpact(.5,6.3),.5);near(landingForImpact(1,1.26),.2);
 assert.ok(landingForImpact(1,2)<landingForImpact(1,5));near(landingForImpact(5,30),1);
 near(landingForImpact(NaN,6),0);near(landingForImpact(-1,6),0);near(landingForImpact(1,Infinity),.2);
});


test('footstep cues share support acquisitions instead of retaining the old nine-step sprint clock',async()=>{
 const {groundStepContacts}=await import('../src/locomotion.ts');
 let a=idleAnimation(),position={x:0,y:0,z:0},sounds=0;
 for(let tick=0;tick<600;tick++){position={...position,z:position.z+.1};let next=stepAnimation(a,0,6,true,false,false,1/60,.1);next=stepGroundSupport(a,next,position);sounds+=groundStepContacts(a,next);a=next;}
 assert.ok(sounds>=39&&sounds<=49,`6m/s footfall count ${sounds} over ten seconds`);
 assert.equal(groundStepContacts(a,{...a,airborne:true}),0);assert.equal(groundStepContacts(a,{...a,support:null}),0);
});
