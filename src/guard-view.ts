import * as THREE from 'three/webgpu';
import {DEFAULT_GUARD_RECIPE,guardDuration,type GuardEvent,type GuardRecipe,type GuardState} from './guard.ts';
import type {AudioCueName} from './audio-recipes.ts';
/** The rendered boundary uses exactly the recipe's authority radius and front arc. */
export function guardFieldPoints(recipe:Readonly<GuardRecipe>=DEFAULT_GUARD_RECIPE,segments=32){
 const count=Number.isFinite(segments)?Math.max(3,Math.min(64,Math.floor(segments))):32;
 return Array.from({length:count+1},(_,i)=>{const phi=-recipe.arc/2+recipe.arc*i/count;return {x:Math.sin(phi)*recipe.range,y:.85,z:Math.cos(phi)*recipe.range};});
}
export function guardStatusText(s:GuardState,stamina:number,pending=false){
 if(pending)return 'Guard requested · awaiting authority';
 if(s.phase==='windup')return 'Guard windup · not protected';
 if(s.phase==='active')return s.spent?'Guard spent · recovering':'Guard active · one front strike';
 if(s.phase==='recovery')return 'Guard recovery';
 if(s.cooldownRemaining>0)return `Guard cooldown · ${s.cooldownRemaining.toFixed(1)}s`;
 return stamina<DEFAULT_GUARD_RECIPE.staminaCost?'Guard needs 22 stamina':'Guard ready · 22 stamina';
}
/** Sound edges come from the same ability timeline; no renderer timing authorizes sound/hits. */
export function guardAudioCue(event:GuardEvent):AudioCueName|null {
 if(event.type==='blocked')return 'guard-block';
 if(event.type==='phase'&&event.phase==='windup')return 'guard-windup';
 if(event.type==='interrupted')return 'guard-break';
 return null;
}
/** Production field adapter. Feed only confirmed state online; never predict protection. */
export function createGuardView(){
 const root=new THREE.Group();root.name='resonant-guard';root.visible=false;
 const points=guardFieldPoints(),positions:number[]=[];
 for(let i=0;i<points.length-1;i++){const a=points[i]!,b=points[i+1]!;positions.push(0,.85,0,a.x,a.y,a.z,b.x,b.y,b.z);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
 const fieldMaterial=new THREE.MeshBasicMaterial({color:DEFAULT_GUARD_RECIPE.color,transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false});
 const field=new THREE.Mesh(geometry,fieldMaterial);root.add(field);
 const lineMaterial=new THREE.LineBasicMaterial({color:DEFAULT_GUARD_RECIPE.color,transparent:true,opacity:.75,depthWrite:false});
 const boundary=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,.85,0),...points.map(p=>new THREE.Vector3(p.x,p.y,p.z)),new THREE.Vector3(0,.85,0)]),lineMaterial);root.add(boundary);
 const ground=boundary.clone();ground.position.y=-.81;ground.material=lineMaterial;root.add(ground);
 return {root,update(s:GuardState,position:{x:number;y:number;z:number},reducedMotion=false){
   root.visible=s.phase!=='idle'&&!!s.recipe;root.position.set(position.x,position.y,position.z);root.rotation.y=s.facing;
   const ready=s.phase==='active'&&!s.spent,color=ready?DEFAULT_GUARD_RECIPE.color:s.phase==='windup'?'#e9c477':'#6d928b';lineMaterial.color.set(color);fieldMaterial.color.set(color);
   lineMaterial.opacity=ready?.9:s.phase==='windup'?.55:.23;fieldMaterial.opacity=ready?.17:s.phase==='windup'?.055:.025;
   const remaining=s.recipe?Math.max(0,1-s.elapsed/guardDuration(s.recipe)):0;field.visible=ready||s.phase==='windup';boundary.visible=true;ground.visible=true;
   // No animated expansion changes the advertised hit volume. Only opacity breathes.
   if(!reducedMotion&&ready)fieldMaterial.opacity=.14+.035*Math.sin(remaining*Math.PI);
 },dispose(){geometry.dispose();boundary.geometry.dispose();lineMaterial.dispose();fieldMaterial.dispose();root.removeFromParent();}};
}
/**
 * Presentation-only projection of a SERVER-ACCEPTED cast, never an input prediction.
 * Polling can skip the entire active window. Advance that confirmed timeline locally,
 * expire it, and label online latency; this result MUST NOT resolve damage or stamina.
 * Receipt age cannot know network transit, so the visual is not a protection guarantee.
 */
export function confirmedGuardView(s:GuardState,secondsSinceSnapshot:number):GuardState {
 const age=Number.isFinite(secondsSinceSnapshot)?Math.max(0,secondsSinceSnapshot):Infinity;
 const cooldownRemaining=Math.max(0,s.cooldownRemaining-age);
 if(s.phase==='idle'||!s.recipe)return {...s,cooldownRemaining};
 const elapsed=s.elapsed+age,r=s.recipe;
 if(elapsed+1e-9>=guardDuration(r))return {...s,time:s.time+(Number.isFinite(age)?age:0),phase:'idle',elapsed:0,recipe:null,spent:false,cooldownRemaining};
 const phase=elapsed+1e-9>=r.windup+r.active?'recovery':elapsed+1e-9>=r.windup?'active':'windup';
 return {...s,time:s.time+(Number.isFinite(age)?age:0),phase,elapsed,cooldownRemaining};
}
/** Durable block counter catches contacts between polls; replayed snapshots make no second sound. */
export function guardSnapshotEvents(previous:GuardState|null,next:GuardState):GuardEvent[]{
 if(!previous)return [];
 const events:GuardEvent[]=[];
 if(next.castId>previous.castId&&next.phase==='windup')events.push({type:'phase',phase:'windup',castId:next.castId,at:next.time});
 if(next.lastBlock&&(next.lastBlock.id>(previous.lastBlock?.id??0)))events.push({type:'blocked',block:next.lastBlock,castId:next.lastBlock.castId,at:next.lastBlock.at});
 return events;
}
