import test from 'node:test';
import assert from 'node:assert/strict';
import {createTownLife} from '../src/town-life.ts';
import {townLifePoses} from '../src/town-life-runtime.ts';
import {createTownView} from '../src/town-view.ts';
import {TOWN_CENTER} from '../src/starting-town.ts';
import {validTownLifePoses} from '../src/town-life-projection.ts';
import type {TownResidentPose} from '../src/town-residents.ts';

/** Transport-unit evidence only: these deliberately authored, owned straight
 * trajectories test the actual replay and emitted matrices. They do not run
 * resident decisions, authority collision solving, or the worker/main coupling.
 * Real saved-world and worker integration remain separate acceptance gates. */
const jitter=[0,.04,.09,.02,.12,.06] as const;
const speed=1.8;
const start={x:TOWN_CENTER.x-12,z:TOWN_CENTER.z+10};

function acceptedAt(base:readonly TownResidentPose[],time:number):TownResidentPose[]{
 const stamp=Math.floor((time+1e-8)*2)/2;
 return base.map((p,i)=>i?{...p}:{...p,...start,x:start.x+stamp*speed,
  facing:Math.PI/2,moving:true,speed,distance:stamp*speed,
  motionPath:[{x:start.x+Math.max(0,stamp-.5)*speed,z:start.z,t:0},
   {x:start.x+stamp*speed,z:start.z,t:.5}]});
}

for(const hz of [5,10,15,30,60,120])for(const online of [false,true]){
 test(`owned trajectory transport keeps steady emitted root speed at ${hz} Hz ${online?'jittered 4 Hz packets':'solo'}`,()=>{
  const base=townLifePoses(createTownLife(73129))!,view=createTownView(73129);
  let current=acceptedAt(base,0),authority=0,packet=0,last={...start},settledFrames=0,maxStep=0;
  const packets:{at:number;time:number;input:TownResidentPose[]}[]=[];
  try{
   for(let frame=0;frame<=hz*8;frame++){
    const now=frame/hz;
    if(online){
     while(packet*.25<=now+1e-8){const time=packet*.25;packets.push({at:time+jitter[packet%jitter.length]!,time,input:acceptedAt(base,time)});packet++;}
     while(packets.length&&packets[0]!.at<=now+1e-8){const next=packets.shift()!;current=next.input;authority=next.time;assert(validTownLifePoses(current));view.acceptLife(authority,current);}
    }else{current=acceptedAt(base,now);authority=now;assert(validTownLifePoses(current));view.acceptLife(authority,current);}
    assert(current.every(p=>p.authoritativeMotion===1),'ownership must never be stripped to select the legacy projector');
    view.update(authority,TOWN_CENTER,()=>true,true,undefined,frame===0,frame?1/hz:0,[],online,current);
    const pose=view.poses[0]!,matrix=view.matrixEvidence().find(m=>m.index===0)!;
    assert(matrix,'the traveler must have actual emitted torso matrices');
    assert.equal(pose.authoritativeMotion,1);
    assert(Math.hypot(matrix.x-pose.x,matrix.z-pose.z)<.00003);
    assert(Math.abs(pose.z-start.z)<1e-8);
    const moved=Math.hypot(pose.x-last.x,pose.z-last.z);
    if(frame){maxStep=Math.max(maxStep,moved);assert(pose.x>=last.x-1e-8);}
    if(frame>hz*3){assert(moved*hz>1.79,'owned replay must not brake between half-second endpoints');assert(moved*hz<1.81,'owned replay must not surge between endpoints');settledFrames++;}
    assert.equal(view.stats.lifeHistoryIncomplete,false);
    assert.equal(view.stats.lifeRecoveringIds.length,0);
    last={x:pose.x,z:pose.z};
   }
   assert.equal(settledFrames,hz*5);
   assert(maxStep<=speed/hz+1e-7);
   assert(Math.abs(last.x-current[0]!.x)<1.5,'the steady buffer remains bounded');
  }finally{view.dispose();}
 });
}
