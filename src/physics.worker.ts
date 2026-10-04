import {townPlayerContactRecovery} from './town-player-contact.ts';
import {TOWN_CENTER,TOWN_BOUNDS} from './starting-town.ts';
import {TownCrowd,slideTownCrowd,type TownActor} from './town-crowd.ts';
import type {TownResidentPose} from './town-residents.ts';
import {validTownLifePoses,copyTownLifePoses,sameTownLifePoses} from './town-life-projection.ts';
import {LAB_SCRIPTS,knownLabScript} from './lab-script.ts';
import RAPIER from '@dimforge/rapier3d-compat';
import {ContactPhysics} from './contact-physics.ts';
import {regionalCenterBound,regionalBodyCenterBound,clampRegionalCoordinate} from './regional-bounds.ts';
import {validMovableBodies,type MovableBody} from './player-contact.ts';
import {idleMotor,stepMotor,type MotionInput,type Motor} from './locomotion.ts';
import {DEFAULT_TUNING,sanitizeTuning,type LabTuning} from './tuning.ts';
interface Obstacle { x:number;z:number;hx:number;hz:number;hy:number;y?:number;convexVertices?:readonly number[] }
interface CellBounds {minX:number;maxX:number;minZ:number;maxZ:number}
interface InitialCell {key:string;revision:number;obstacles:Obstacle[];terrain?:Terrain;bounds?:CellBounds}
interface Terrain {vertices:number[];indices:number[];bound:number;step?:number}
interface TownContext {seed:number;time:number;selfId:string;actors:TownActor[];lifePoses?:readonly TownResidentPose[]}
const validTownActors=(v:unknown):v is TownActor[]=>Array.isArray(v)&&v.length<=8&&v.every(a=>a&&typeof a.id==='string'&&a.id.length<=160&&[a.x,a.z,a.feetY??6].every(Number.isFinite));
const validTown=(v:TownContext)=>v&&Number.isInteger(v.seed)&&v.seed>=0&&v.seed<=0xffffffff&&Number.isFinite(v.time)&&v.time>=0&&typeof v.selfId==='string'&&v.selfId.length<=160&&validTownActors(v.actors)&&(v.lifePoses===undefined||validTownLifePoses(v.lifePoses));
let townCrowd:TownCrowd|undefined,townTime=0,townAnchor=0,townAnchorStep=0,townOnline=false,townSelfId='solo',townActors:TownActor[]=[];
let townLifePoses:readonly TownResidentPose[]|undefined,lastTownContactPoses:readonly TownResidentPose[]|undefined;
interface WorldMessage {town?:TownContext;x:number;z:number;y?:number;obstacles:Obstacle[];initialCells?:InitialCell[];epoch?:number;bound?:number;terrain?:Terrain;streamedTerrain?:boolean;sandbox?:boolean;checkpoint?:Checkpoint;movable?:MovableBody[];interactionEnabled?:boolean;online?:boolean;manual?:boolean;startPaused?:boolean}
let streamedTerrain=false,streamBlocked=false;
let floor:RAPIER.Collider;let world:RAPIER.World;let body:RAPIER.RigidBody;let collider:RAPIER.Collider;let controller:RAPIER.KinematicCharacterController;let terrain:Terrain|undefined;
const DT=1/60,SKIN=.02,STAND_HALF=.75,LOW_HALF=.2,RADIUS=.32;
const GRAVITY=18,JUMP_SPEED=6.6,COYOTE_TIME=.1,BUFFER_TIME=.12,LANDING_TIME=.18;
const neutral=():MotionInput=>({x:0,z:0,sprint:false,analog:false,crouch:false,jump:false,paused:false});
let pendingContactRequestId:string|null=null,contactRequestId:string|null=null;
let contacts:ContactPhysics;let grabHeld=false,grabActive=false,grabPulse=0,manual=false;
let input=neutral(),motor=idleMotor();let crouched=false,stance=0,traversalRecovery=false;let ready=false;let initializing=false;let epoch=0;
let vy=0,grounded=true,coyote=COYOTE_TIME,jumpBuffer=0,jumpHeld=false,landing=0,landingSpeed=0;
interface Checkpoint{x:number;z:number;feetY:number;vy:number;grounded:boolean;crouched:boolean;stance:number;coyote:number;landing:number;landingSpeed:number;motor:Motor}
let labPlayback:{id:string;warmup:number;tick:number}|null=null;
let onlineRevision=-1,onlineJumpId=-1,onlineLandingId=-1,currentBound=48;
let sandbox=false,tuning:LabTuning={...DEFAULT_TUNING},simulationStep=0;
const validCheckpoint=(p:Checkpoint)=>p&&[p.x,p.z,p.feetY,p.vy,p.stance,p.coyote,p.landing,p.landingSpeed,p.motor?.vx,p.motor?.vz,p.motor?.slide].every(Number.isFinite)&&Math.abs(p.feetY)<=1_000_000&&typeof p.grounded==='boolean'&&typeof p.crouched==='boolean'&&typeof p.motor.wasCrouched==='boolean'&&p.coyote>=0&&p.coyote<=COYOTE_TIME&&p.landing>=0&&p.landing<=LANDING_TIME&&p.landingSpeed>=0&&p.landingSpeed<=30&&Math.abs(p.vy)<=30&&p.stance>=0&&p.stance<=1&&Math.hypot(p.motor.vx,p.motor.vz)<=20&&p.motor.slide>=0&&p.motor.slide<=2;
function captureMotion():Checkpoint{const p=body.translation();return {x:p.x,z:p.z,feetY:p.y-halfHeight()-RADIUS-SKIN,vy,grounded,crouched,stance,coyote,landing,landingSpeed,motor:{...motor}};}
// Hard budgets cover resident geometry and replay protection independently. Never
// evict a revision tombstone: an old packet must not resurrect an unloaded cell.
const MAX_ACTIVE_CELLS=128,MAX_CELL_COLLIDERS=16384,MAX_CELL_HISTORY=4096,MAX_TERRAIN_VERTICES=4096,MAX_TERRAIN_INDICES=8192*3;
const SAFETY_RADIUS=RADIUS+SKIN+.3,VELOCITY_LEAD=.3;
let cells=new Map<string,RAPIER.Collider[]>(),cellRevisions=new Map<string,number>();
interface StreamedSurface {terrain:Terrain;bounds:CellBounds;collider:RAPIER.Collider;minY:number;maxY:number}
let cellTerrains=new Map<string,StreamedSurface>();
let pendingUnloads=new Map<string,number>();
let perimeterColliders=new Set<number>();
const hasTerrain=()=>streamedTerrain||!!terrain;
const cellColliderCount=()=>[...cells.values()].reduce((n,list)=>n+list.length,0);
function refreshCollisionQueries(){const dt=world.timestep;try{world.timestep=0;world.step();}finally{world.timestep=dt;}}
const validKey=(key:unknown):key is string=>typeof key==='string'&&key.length>0&&key.length<=160;
const validRevision=(revision:unknown):revision is number=>Number.isSafeInteger(revision)&&Number(revision)>=0;

function validConvex(o:Obstacle):boolean {
 const v=o.convexVertices;if(v===undefined)return true;
 if(!Array.isArray(v)||v.length<12||v.length>384||v.length%3!==0)return false;
 for(let i=0;i<v.length;i++)if(!Number.isFinite(v[i])||Math.abs(v[i]!)>[o.hx,o.hy,o.hz][i%3]!+.00001)return false;
 // Reject degenerate hulls before changing a live world. Rapier must never
 // substitute a bounding box for rejected rock geometry.
 const ax=v[0]!,ay=v[1]!,az=v[2]!;let bx=0,by=0,bz=0,nx=0,ny=0,nz=0;
 for(let i=3;i<v.length;i+=3){bx=v[i]!-ax;by=v[i+1]!-ay;bz=v[i+2]!-az;if(Math.hypot(bx,by,bz)>1e-7)break;}
 for(let i=3;i<v.length;i+=3){const cx=v[i]!-ax,cy=v[i+1]!-ay,cz=v[i+2]!-az;nx=by*cz-bz*cy;ny=bz*cx-bx*cz;nz=bx*cy-by*cx;if(Math.hypot(nx,ny,nz)>1e-9)break;}
 for(let i=3;i<v.length;i+=3)if(Math.abs(nx*(v[i]!-ax)+ny*(v[i+1]!-ay)+nz*(v[i+2]!-az))>1e-10)return true;
 return false;
}
const validObstacles=(value:unknown):value is Obstacle[]=>Array.isArray(value)&&value.length<=8192&&value.every(o=>o&&[o.x,o.z,o.hx,o.hy,o.hz].every(Number.isFinite)&&Math.abs(o.x)<=8192&&Math.abs(o.z)<=8192&&o.hx>0&&o.hx<=8192&&o.hy>0&&o.hy<=1_000_000&&o.hz>0&&o.hz<=8192&&(o.y===undefined||Number.isFinite(o.y)&&Math.abs(o.y)<=1_000_000)&&validConvex(o));
const validInitialCells=(value:unknown):value is InitialCell[]=>Array.isArray(value)&&value.length<=MAX_ACTIVE_CELLS&&value.reduce((n,c)=>n+(Array.isArray(c?.obstacles)?c.obstacles.length:MAX_CELL_COLLIDERS+1)+(c?.terrain?1:0),0)<=MAX_CELL_COLLIDERS&&new Set(value.map(c=>c?.key)).size===value.length&&value.every(validCell);
function createObstacle(o:Obstacle):RAPIER.Collider {
 const shape=o.convexVertices?RAPIER.ColliderDesc.convexHull(new Float32Array(o.convexVertices)):RAPIER.ColliderDesc.cuboid(o.hx,o.hy,o.hz);
 if(!shape)throw new Error('Invalid convex obstacle hull');
 return world.createCollider(shape.setTranslation(o.x,o.y??o.hy,o.z));
}
const validBound=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=1&&value<=4096;
// Validate before allocating a Rapier mesh or replacing a live world. A terrain packet
// is bounded indexed data, never an executable generator or a second collision recipe.
function validTerrain(value:unknown):value is Terrain{
 if(!value||typeof value!=='object')return false;
 const t=value as Terrain;
 if(!validBound(t.bound)||(t.step!==undefined&&(!Number.isFinite(t.step)||t.step<=0||t.step>t.bound*2)))return false;
 if(!Array.isArray(t.vertices)||t.vertices.length<9||t.vertices.length>65536*3||t.vertices.length%3!==0||!Array.isArray(t.indices)||t.indices.length<3||t.indices.length>131072*3||t.indices.length%3!==0)return false;
 for(let i=0;i<t.vertices.length;i++){const n=t.vertices[i]!;if(!Number.isFinite(n)||Math.abs(n)>(i%3===1?1_000_000:t.bound+.0001))return false;}
 const count=t.vertices.length/3;
 for(const i of t.indices)if(!Number.isSafeInteger(i)||i<0||i>=count)return false;
 for(let i=0;i<t.indices.length;i+=3){
  const a=t.indices[i]!*3,b=t.indices[i+1]!*3,c=t.indices[i+2]!*3,v=t.vertices;
  const ux=v[b]!-v[a]!,uy=v[b+1]!-v[a+1]!,uz=v[b+2]!-v[a+2]!,vx=v[c]!-v[a]!,vy=v[c+1]!-v[a+1]!,vz=v[c+2]!-v[a+2]!;
  if(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)<1e-8)return false;
 }
 return true;
}
function validCell(value:unknown):value is InitialCell{
 if(!value||typeof value!=='object')return false;
 const c=value as InitialCell;
 if(!validKey(c.key)||!validRevision(c.revision)||!validObstacles(c.obstacles))return false;
 if(c.bounds!==undefined&&!validCellBounds(c.bounds,c.terrain?.bound??4096))return false;
 if(c.terrain===undefined)return true;
 if(!validTerrain(c.terrain)||!validCellBounds(c.bounds,c.terrain.bound)||c.terrain.vertices.length/3>MAX_TERRAIN_VERTICES||c.terrain.indices.length>MAX_TERRAIN_INDICES)return false;
 const b=c.bounds!;
 for(let i=0;i<c.terrain.vertices.length;i+=3){const x=c.terrain.vertices[i]!,z=c.terrain.vertices[i+2]!;if(x<b.minX-.0001||x>b.maxX+.0001||z<b.minZ-.0001||z>b.maxZ+.0001)return false;}
 return true;
}
function validCellBounds(value:unknown,bound:number):value is CellBounds{
 if(!value||typeof value!=='object')return false;
 const b=value as CellBounds;
 return [b.minX,b.maxX,b.minZ,b.maxZ].every(Number.isFinite)&&b.minX<b.maxX&&b.minZ<b.maxZ&&b.maxX-b.minX<=64.0001&&b.maxZ-b.minZ<=64.0001&&Math.max(Math.abs(b.minX),Math.abs(b.maxX),Math.abs(b.minZ),Math.abs(b.maxZ))<=bound+.0001;
}
function initialTerrainReady(m:WorldMessage){
 const saved=m.checkpoint??m,bound=m.bound!,point={x:clampRegionalCoordinate(saved.x,bound),z:clampRegionalCoordinate(saved.z,bound)},surfaces=(m.initialCells??[]).filter(c=>c.terrain);
 const at=(x:number,z:number)=>surfaces.some(c=>x>=c.bounds!.minX-.00001&&x<=c.bounds!.maxX+.00001&&z>=c.bounds!.minZ-.00001&&z<=c.bounds!.maxZ+.00001&&Number.isFinite(triangleHeight(c.terrain!,x,z)));
 if(!at(point.x,point.z))return false;
 for(let i=0;i<16;i++){const a=i*Math.PI/8,x=Math.max(-bound+RADIUS,Math.min(bound-RADIUS,point.x+Math.cos(a)*SAFETY_RADIUS)),z=Math.max(-bound+RADIUS,Math.min(bound-RADIUS,point.z+Math.sin(a)*SAFETY_RADIUS));if(!at(x,z))return false;}
 return true;
}
function validWorld(m:WorldMessage){
 const bound=m.bound??m.terrain?.bound??48;
 return (m.town===undefined||m.streamedTerrain===true&&!m.sandbox&&validTown(m.town))&&Number.isFinite(m.x)&&Number.isFinite(m.z)&&(m.streamedTerrain?Math.abs(m.x)<=bound&&Math.abs(m.z)<=bound:Math.abs(m.x)<bound-RADIUS&&Math.abs(m.z)<bound-RADIUS)&&(m.y===undefined||Number.isFinite(m.y)&&Math.abs(m.y)<=1_000_000)&&validObstacles(m.obstacles)&&(m.initialCells===undefined||validInitialCells(m.initialCells))&&(m.bound===undefined||validBound(m.bound))&&(m.terrain===undefined||validTerrain(m.terrain))&&(m.streamedTerrain===undefined||typeof m.streamedTerrain==='boolean')&&(!m.streamedTerrain||m.terrain===undefined&&m.bound!==undefined&&!!m.initialCells?.some(c=>c.terrain))&&(m.epoch===undefined||validRevision(m.epoch))&&(m.checkpoint===undefined||validCheckpoint(m.checkpoint)&&(m.streamedTerrain?Math.abs(m.checkpoint.x)<=bound&&Math.abs(m.checkpoint.z)<=bound:Math.abs(m.checkpoint.x)<bound-RADIUS&&Math.abs(m.checkpoint.z)<bound-RADIUS))&&(m.movable===undefined||validMovableBodies(m.movable))&&(m.interactionEnabled===undefined||typeof m.interactionEnabled==='boolean')&&(m.online===undefined||typeof m.online==='boolean')&&(m.manual===undefined||typeof m.manual==='boolean')&&(m.startPaused===undefined||typeof m.startPaused==='boolean')&&(m.initialCells??[]).every(c=>!c.terrain||m.streamedTerrain===true&&Math.abs(c.terrain.bound-bound)<.0001)&&(m.movable??[]).every(c=>Math.abs(c.x)+c.hx<bound&&Math.abs(c.z)+c.hz<bound)&&(!m.streamedTerrain||initialTerrainReady(m));
}
function allocateCell(cell:InitialCell){
 const colliders:RAPIER.Collider[]=[];
 try{
  let surface:StreamedSurface|undefined;
  if(cell.terrain){
   const t=cell.terrain,c=world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(t.vertices),new Uint32Array(t.indices),RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));colliders.push(c);
   let minY=Infinity,maxY=-Infinity;for(let i=1;i<t.vertices.length;i+=3){minY=Math.min(minY,t.vertices[i]!);maxY=Math.max(maxY,t.vertices[i]!);}
   surface={terrain:t,bounds:cell.bounds!,collider:c,minY,maxY};
  }
  for(const o of cell.obstacles)colliders.push(createObstacle(o));
  return {colliders,surface};
 }catch(error){for(const c of colliders)world.removeCollider(c,true);throw error;}
}
function sampleStreamedElevation(x:number,z:number,exclude?:string){
 let height=-Infinity;
 for(const [key,c] of cellTerrains){
  const b=c.bounds;if(key===exclude||x<b.minX-.00001||x>b.maxX+.00001||z<b.minZ-.00001||z>b.maxZ+.00001)continue;
  const ray=new RAPIER.Ray({x,y:c.maxY+1,z},{x:0,y:-1,z:0}),hit=c.collider.castRay(ray,c.maxY-c.minY+2,true);
  if(hit>=0)height=Math.max(height,c.maxY+1-hit);
  else height=Math.max(height,triangleHeight(c.terrain,x,z)); // f32 ray rounding at a shared edge must not invent a residency hole
 }
 return height;
}
function terrainDiskReady(x:number,z:number,radius=SAFETY_RADIUS){
 if(!streamedTerrain)return true;
 if(!Number.isFinite(sampleStreamedElevation(x,z)))return false;
 for(let i=0;i<16;i++){const angle=i*Math.PI/8,px=Math.max(-currentBound+RADIUS,Math.min(currentBound-RADIUS,x+Math.cos(angle)*radius)),pz=Math.max(-currentBound+RADIUS,Math.min(currentBound-RADIUS,z+Math.sin(angle)*radius));if(!Number.isFinite(sampleStreamedElevation(px,pz)))return false;}
 return true;
}
function terrainTravelReady(x:number,z:number,vx:number,vz:number){
 // Test the swept safety disk, including a short velocity lead. This guard only
 // gates missing residency; actual elevation and solid support remain Rapier's.
 const length=Math.hypot(vx,vz)*VELOCITY_LEAD,steps=Math.max(1,Math.ceil(length/.3));
 for(let i=0;i<=steps;i++){const t=VELOCITY_LEAD*i/steps,px=Math.max(-currentBound+RADIUS,Math.min(currentBound-RADIUS,x+vx*t)),pz=Math.max(-currentBound+RADIUS,Math.min(currentBound-RADIUS,z+vz*t));if(!terrainDiskReady(px,pz))return false;}
 return true;
}
function protectedCell(key:string){
 if(!streamedTerrain||!body)return false;
 const p=body.translation(),cell=cellTerrains.get(key),radius=contacts?.isHanging()?4:SAFETY_RADIUS;
 if(cell){
  const b=cell.bounds,near=(x:number,z:number)=>Math.hypot(x-Math.max(b.minX,Math.min(b.maxX,x)),z-Math.max(b.minZ,Math.min(b.maxZ,z)))<=radius;
  if(near(p.x,p.z)||near(p.x+motor.vx*VELOCITY_LEAD,p.z+motor.vz*VELOCITY_LEAD))return true;
 }
 const shape=new RAPIER.Capsule(collider.halfHeight(),radius);
 return (cells.get(key)??[]).some(c=>c.intersectsShape(shape,p,{x:0,y:0,z:0,w:1}));
}
function removeCell(key:string,revision:number){
 for(const c of cells.get(key)??[])world.removeCollider(c,true);
 cells.delete(key);cellTerrains.delete(key);pendingUnloads.delete(key);cellRevisions.set(key,revision);refreshCollisionQueries();
 self.postMessage({type:'cell-ack',epoch,key,revision,loaded:false,count:0,terrainReady:false});
}
function finishPendingUnloads(){for(const [key,revision] of pendingUnloads)if(!protectedCell(key))removeCell(key,revision);}
// Optional spawn/teleport y is a feet elevation. Without it, sample the very same
// triangles supplied to rendering. This is only a spawn helper, not movement support.
function triangleHeight(mesh:Terrain,x:number,z:number){
 let height=-Infinity;const v=mesh.vertices;
 for(let i=0;i<mesh.indices.length;i+=3){
  const a=mesh.indices[i]!*3,b=mesh.indices[i+1]!*3,c=mesh.indices[i+2]!*3;
  const ax=v[a]!,az=v[a+2]!,bx=v[b]!,bz=v[b+2]!,cx=v[c]!,cz=v[c+2]!;
  const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(d)<1e-10)continue;
  const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,w=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d;
  if(u>=-1e-6&&w>=-1e-6&&u+w<=1+1e-6)height=Math.max(height,u*v[a+1]!+w*v[b+1]!+(1-u-w)*v[c+1]!);
 }
 return height;
}
function spawnElevation(x:number,z:number,y?:number){
 if(y!==undefined)return y;
 if(streamedTerrain)return sampleStreamedElevation(x,z);
 if(!terrain)return 0;
 const height=triangleHeight(terrain,x,z);return Number.isFinite(height)?height:0;
}
// A trusted explicit spawn height sampled at the old XZ is still a grounded
// terrain spawn after perimeter normalization. Deliberately airborne explicit
// heights remain untouched; checkpoint/online grounded flags are handled directly.
function normalizedSpawnElevation(oldX:number,oldZ:number,x:number,z:number,y?:number){
 if(streamedTerrain&&y!==undefined&&(x!==oldX||z!==oldZ)){
  const oldGround=sampleStreamedElevation(oldX,oldZ);
  if(Number.isFinite(oldGround)&&Math.abs(y-oldGround)<=SKIN*2)return spawnElevation(x,z);
 }
 return spawnElevation(x,z,y);
}
const halfHeight=()=>traversalRecovery?collider.halfHeight():crouched?LOW_HALF:STAND_HALF;
function resetMotion(resetContacts=true){pendingContactRequestId=null;contactRequestId=null;if(resetContacts)contacts?.reset();grabHeld=false;grabActive=false;grabPulse=0;input=neutral();motor=idleMotor();crouched=false;stance=0;traversalRecovery=false;vy=0;grounded=!hasTerrain();coyote=hasTerrain()?0:COYOTE_TIME;jumpBuffer=0;jumpHeld=false;landing=0;landingSpeed=0;}
function resolveSpawnOverlap(movable:readonly MovableBody[]){
 // Saves store x/z only. Resolve overlap before ready against both permanent
 // structures and preloaded cells; never announce a walkable gap for one frame.
 // Rapier's public shape object is cached: setHalfHeight changes the native
 // collider but leaves that JS capsule's halfHeight stale. Query the native size.
 const start=body.translation(),rotation={x:0,y:0,z:0,w:1},currentShape=new RAPIER.Capsule(collider.halfHeight(),RADIUS);
 const clear=(p:{x:number;y:number;z:number},shape:RAPIER.Shape=currentShape)=>Number.isFinite(p.y)&&(!streamedTerrain||terrainDiskReady(p.x,p.z))&&(streamedTerrain?Math.abs(p.x)<=regionalCenterBound(currentBound)&&Math.abs(p.z)<=regionalCenterBound(currentBound):Math.abs(p.x)<currentBound-RADIUS&&Math.abs(p.z)<currentBound-RADIUS)&&!world.intersectionWithShape(p,rotation,shape,undefined,undefined,collider)&&![...cells.values()].some(list=>list.some(c=>c.intersectsShape(shape,p,rotation)));
 if(!clear(start)){
  // Existing saves and low-ceiling fixtures may need a safe crouched pose at the
  // exact same feet position. Prefer that over moving out of the room.
  const low={x:start.x,y:start.y-(halfHeight()-LOW_HALF),z:start.z};
  if(!crouched&&clear(low,new RAPIER.Capsule(LOW_HALF,RADIUS))){crouched=true;stance=1;collider.setHalfHeight(LOW_HALF);body.setTranslation(low,true);body.setNextKinematicTranslation(low);world.propagateModifiedBodyPositionsToColliders();return;}

  const below=movable.filter(c=>Math.abs(start.x-c.x)<c.hx+RADIUS&&Math.abs(start.z-c.z)<c.hz+RADIUS).sort((a,b)=>(b.y+b.hy)-(a.y+a.hy));
  let safe:{x:number;y:number;z:number}|undefined;
  for(const top of below){const p={x:start.x,y:top.y+top.hy+halfHeight()+RADIUS+SKIN,z:start.z};if(clear(p)){safe=p;break;}}
  // Fixed radial order is deterministic. Ground candidates use the actual terrain
  // at their new x/z; an old explicit saved height cannot float a new position.
  for(let radius=.25;!safe&&radius<=12;radius+=.25)for(let i=0;i<32;i++){
   const angle=i*Math.PI/16,x=start.x+Math.cos(angle)*radius,z=start.z+Math.sin(angle)*radius;
   const p={x,y:spawnElevation(x,z)+halfHeight()+RADIUS+SKIN,z};if(clear(p)){safe=p;break;}
  }
  if(!safe)throw new Error('No clear spawn beside the saved solid geometry');
  body.setTranslation(safe,true);body.setNextKinematicTranslation(safe);world.propagateModifiedBodyPositionsToColliders();grounded=false;coyote=0;
 }
}
function replaceWorld(m:WorldMessage){
 // Stage a complete generation without freeing the previous world. If native
 // allocation or spawn resolution fails, restore its exact references and motion.
 const previous={townCrowd,townTime,townAnchor,townAnchorStep,townOnline,townSelfId,townActors,townLifePoses,lastTownContactPoses,world,floor,body,collider,controller,terrain,streamedTerrain,streamBlocked,pendingContactRequestId,contactRequestId,contacts,grabHeld,grabActive,grabPulse,manual,input,motor,crouched,stance,traversalRecovery,ready,initializing,epoch,vy,grounded,coyote,jumpBuffer,jumpHeld,landing,landingSpeed,labPlayback,onlineRevision,onlineJumpId,onlineLandingId,currentBound,sandbox,tuning,simulationStep,cells,cellRevisions,cellTerrains,pendingUnloads,perimeterColliders};let candidate:RAPIER.World|undefined;
 try{
 townCrowd=m.town?new TownCrowd(m.town.seed):undefined;townTime=townAnchor=m.town?.time??0;townAnchorStep=simulationStep;townOnline=m.online===true;townSelfId=m.town?.selfId??'solo';townActors=m.town?.actors??[];townLifePoses=m.town?.lifePoses?copyTownLifePoses(m.town.lifePoses):undefined;lastTownContactPoses=undefined;
 candidate=new RAPIER.World({x:0,y:-GRAVITY,z:0});
 ready=false;labPlayback=null;manual=m.manual===true;if(manual)simulationStep=0;townAnchorStep=simulationStep;terrain=m.terrain;streamedTerrain=m.streamedTerrain===true;streamBlocked=false;sandbox=m.sandbox===true;tuning={...DEFAULT_TUNING};resetMotion(false);if(sandbox||m.startPaused===true)input={...neutral(),paused:true};cells=new Map();cellTerrains=new Map();pendingUnloads=new Map();cellRevisions=new Map();perimeterColliders=new Set();epoch=m.epoch??0;
 world=candidate;world.timestep=DT;
 const bound=m.bound??terrain?.bound??48;currentBound=bound;onlineRevision=-1;onlineJumpId=-1;onlineLandingId=-1;
 if(terrain)world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(terrain.vertices),new Uint32Array(terrain.indices),RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));
 else if(!streamedTerrain)floor=world.createCollider(RAPIER.ColliderDesc.cuboid(bound,.2,bound).setTranslation(0,-.2,0));
 for(const o of m.obstacles)createObstacle(o);
 // Initial owner cells are part of the atomic replacement: first queries, restored
 // poses and the ready signal must already see every resident trunk and stone.
 for(const cell of m.initialCells??[]){const staged=allocateCell(cell);cells.set(cell.key,staged.colliders);if(staged.surface)cellTerrains.set(cell.key,staged.surface);cellRevisions.set(cell.key,cell.revision);}
 let wallY=5,wallHalf=streamedTerrain?1024:5;
 if(terrain){let low=Infinity,high=-Infinity;for(let i=1;i<terrain.vertices.length;i+=3){low=Math.min(low,terrain.vertices[i]!);high=Math.max(high,terrain.vertices[i]!);}wallY=(low+high)/2;wallHalf=(high-low)/2+10;}
 for(const o of [{x:bound+1,z:0,hx:1,hz:bound+2},{x:-bound-1,z:0,hx:1,hz:bound+2},{x:0,z:bound+1,hx:bound+2,hz:1},{x:0,z:-bound-1,hx:bound+2,hz:1}])perimeterColliders.add(world.createCollider(RAPIER.ColliderDesc.cuboid(o.hx,wallHalf,o.hz).setTranslation(o.x,wallY,o.z)).handle);
 const savedStart=m.checkpoint??m,start=streamedTerrain?{x:clampRegionalCoordinate(savedStart.x,bound),z:clampRegionalCoordinate(savedStart.z,bound)}:savedStart;body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x,normalizedSpawnElevation(savedStart.x,savedStart.z,start.x,start.z,m.checkpoint?.feetY??m.y)+STAND_HALF+RADIUS+SKIN,start.z));collider=world.createCollider(RAPIER.ColliderDesc.capsule(STAND_HALF,RADIUS),body);
 contacts=new ContactPhysics(world,body,collider,m.movable??[],m.interactionEnabled===true&&m.online!==true&&!sandbox,streamedTerrain?{
  supportAvailable:(spec,p)=>[-1,0,1].every(dx=>[-1,0,1].every(dz=>Number.isFinite(sampleStreamedElevation(p.x+dx*(spec.hx+SKIN),p.z+dz*(spec.hz+SKIN))))),
  constrainPosition:(spec,p)=>{const bx=regionalBodyCenterBound(bound,spec.hx),bz=regionalBodyCenterBound(bound,spec.hz);return {x:Math.max(-bx,Math.min(bx,p.x)),y:p.y,z:Math.max(-bz,Math.min(bz,p.z))};},
 }:undefined);
 controller=world.createCharacterController(SKIN);controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);
 if(hasTerrain()){controller.setMaxSlopeClimbAngle(Math.PI/4);controller.setMinSlopeSlideAngle(Math.PI/4+.01);controller.setNormalNudgeFactor(.001);}
 if(m.checkpoint&&validCheckpoint(m.checkpoint)){const p=m.checkpoint;crouched=p.crouched;stance=p.stance;vy=p.vy;grounded=p.grounded;coyote=p.coyote;landing=p.landing;landingSpeed=p.landingSpeed;motor={...p.motor};collider.setHalfHeight(halfHeight());const x=streamedTerrain?clampRegionalCoordinate(p.x,bound):p.x,z=streamedTerrain?clampRegionalCoordinate(p.z,bound):p.z,feetY=streamedTerrain&&p.grounded&&(x!==p.x||z!==p.z)?spawnElevation(x,z):p.feetY,pos={x,y:feetY+halfHeight()+RADIUS+SKIN,z};body.setTranslation(pos,true);body.setNextKinematicTranslation(pos);world.propagateModifiedBodyPositionsToColliders();input={...neutral(),paused:true};}
 // Populate broad-phase queries before a restored low pose can try to stand.
 world.step();
 resolveSpawnOverlap(m.movable??[]);
 // Read-only support query for the first pose. Never step or move the body to warm up.
 if(m.startPaused===true&&!m.checkpoint){controller.disableAutostep();controller.disableSnapToGround();controller.computeColliderMovement(collider,{x:0,y:-SKIN*2,z:0});grounded=controller.computedGrounded();coyote=grounded?COYOTE_TIME:0;controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);}

 if(townCrowd){const initial=townCrowd.sample(townTime,100,1,townActors,townLifePoses);if(initial[0]?.authoritativeMotion===1)lastTownContactPoses=copyTownLifePoses(initial);}
 ready=true;previous.world?.free();
 self.postMessage({type:'ready',epoch,step:simulationStep,version:RAPIER.version()});
 if(m.startPaused===true)snapshot(0,0);
 }catch(error){candidate?.free();({townCrowd,townTime,townAnchor,townAnchorStep,townOnline,townSelfId,townActors,townLifePoses,lastTownContactPoses,world,floor,body,collider,controller,terrain,streamedTerrain,streamBlocked,pendingContactRequestId,contactRequestId,contacts,grabHeld,grabActive,grabPulse,manual,input,motor,crouched,stance,traversalRecovery,ready,initializing,epoch,vy,grounded,coyote,jumpBuffer,jumpHeld,landing,landingSpeed,labPlayback,onlineRevision,onlineJumpId,onlineLandingId,currentBound,sandbox,tuning,simulationStep,cells,cellRevisions,cellTerrains,pendingUnloads,perimeterColliders}=previous);if(previous.ready){self.postMessage({type:'zone-rejected',epoch,requestedEpoch:m.epoch,reason:error instanceof Error?error.message:'Physics allocation failed'});return;}throw error;}
}
self.onmessage=async(e:MessageEvent)=>{const m=e.data;if(!m||typeof m!=='object'||typeof m.type!=='string')return;try{
 if(m.type==='init'){
  if(initializing||ready)return;
  if(!validWorld(m))throw new Error('Invalid physics initialization');
  initializing=true;await RAPIER.init();replaceWorld(m);
 }else if(m.type==='zone'){
  if(!ready||!Number.isSafeInteger(m.epoch)||m.epoch<=epoch||!validWorld(m))return;
  replaceWorld(m);
 }else if((m.epoch??0)!==epoch)return;
 else if(m.type==='step'&&ready&&manual&&Number.isSafeInteger(m.ticks)&&m.ticks>=1&&m.ticks<=120){for(let i=0;i<m.ticks;i++)physicsTick();self.postMessage({type:'stepped',epoch,requestId:m.requestId,step:simulationStep});}
 else if(m.type==='contact-release'&&ready){if(pendingContactRequestId)contactRequestId=pendingContactRequestId;pendingContactRequestId=null;contacts.reset();grabPulse=0;grabActive=false;}
 else if(m.type==='contact-grab'&&ready&&!input.paused){contacts.requestGrab();grabPulse=.25;if(typeof m.requestId==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(m.requestId))pendingContactRequestId=m.requestId;}
 else if(m.type==='online-motion'&&ready&&!sandbox){
  let a=m.motion;
  if(!Number.isSafeInteger(m.revision)||m.revision<=onlineRevision||!a||![m.x,m.z,a.feetY,a.vy].every(Number.isFinite)||Math.abs(m.x)>currentBound||Math.abs(m.z)>currentBound||Math.abs(a.feetY)>10000||Math.abs(a.vy)>30||typeof a.grounded!=='boolean'||typeof a.crouched!=='boolean'||!Number.isSafeInteger(a.jumpId)||a.jumpId<0||!Number.isSafeInteger(a.landingId)||a.landingId<0||a.grounded&&Math.abs(a.vy)>.00001)return;
  const targetX=streamedTerrain?clampRegionalCoordinate(m.x,currentBound):m.x,targetZ=streamedTerrain?clampRegionalCoordinate(m.z,currentBound):m.z;
  if(streamedTerrain&&a.grounded&&(targetX!==m.x||targetZ!==m.z)){const feetY=spawnElevation(targetX,targetZ);if(Number.isFinite(feetY))a={...a,feetY};}
  contacts.disable();grabPulse=0;onlineRevision=m.revision;const current=captureMotion(),newJump=a.jumpId!==onlineJumpId,newLanding=a.landingId!==onlineLandingId,horizontal=Math.hypot(current.x-targetX,current.z-targetZ)>3;
  const correct=collider.halfHeight()!==(a.crouched?LOW_HALF:STAND_HALF)||newJump||newLanding&&!current.grounded||horizontal||a.crouched!==crouched||Math.abs(current.feetY-a.feetY)>.28||a.grounded!==grounded&&Math.abs(current.feetY-a.feetY)>.08;
  if(correct){
   const half=a.crouched?LOW_HALF:STAND_HALF,shape=new RAPIER.Capsule(half,RADIUS);
   const support=(x:number,z:number)=>(!streamedTerrain||terrainDiskReady(x,z))&&(!a.grounded||[[0,0],[.24,0],[-.24,0],[0,.24],[0,-.24]].some(([dx,dz])=>{const hit=world.castRayAndGetNormal(new RAPIER.Ray({x:x+dx!,y:a.feetY+.08,z:z+dz!},{x:0,y:-1,z:0}),.18,true,undefined,undefined,collider);return !!hit&&hit.normal.y>.45;}));
   const safe=(x:number,z:number)=>support(x,z)&&!world.intersectionWithShape({x,y:a.feetY+half+RADIUS+SKIN,z},{x:0,y:0,z:0,w:1},shape,undefined,undefined,collider);
   let x=horizontal?targetX:current.x,z=horizontal?targetZ:current.z;
   if(!safe(x,z)){x=targetX;z=targetZ;if(!safe(x,z)){self.postMessage({type:'online-motion-ack',epoch,revision:m.revision,applied:false,reason:'Authoritative pose intersects local collision',checkpoint:current});return;}}
   traversalRecovery=false;crouched=a.crouched;stance=crouched?1:0;collider.setHalfHeight(half);const position={x,y:a.feetY+half+RADIUS+SKIN,z};body.setTranslation(position,true);body.setNextKinematicTranslation(position);world.propagateModifiedBodyPositionsToColliders();vy=a.vy;grounded=a.grounded;coyote=grounded?COYOTE_TIME:0;jumpBuffer=0;jumpHeld=input.jump===true;motor.slide=0;if(horizontal){motor.vx=0;motor.vz=0;}if(newLanding&&onlineLandingId>=0&&!current.grounded){landing=LANDING_TIME;landingSpeed=Math.max(1,-current.vy);}else if(newJump){landing=0;landingSpeed=0;}
  }
  onlineJumpId=a.jumpId;onlineLandingId=a.landingId;
  self.postMessage({type:'online-motion-ack',epoch,revision:m.revision,applied:correct,checkpoint:captureMotion()});
 } else if(m.type==='capture'&&ready){self.postMessage({type:'captured',epoch,requestId:m.requestId,checkpoint:captureMotion()});}
 else if(m.type==='lab-stop'&&ready&&sandbox){labPlayback=null;input={...neutral(),paused:true};motor=idleMotor();jumpBuffer=0;jumpHeld=false;}
 else if(m.type==='lab-script'&&ready&&sandbox&&knownLabScript(m.id)){labPlayback={id:m.id,warmup:60,tick:0};jumpHeld=false;jumpBuffer=0;}
 else if(m.type==='tuning'&&ready&&sandbox){tuning=sanitizeTuning(m.value);self.postMessage({type:'tuning-ack',epoch,tuning});}
 else if((m.type==='cell-load'||m.type==='cell-unload')&&ready){
  if(!validKey(m.key)||!validRevision(m.revision)||m.revision<=Math.max(cellRevisions.get(m.key)??-1,pendingUnloads.get(m.key)??-1))return;
  const reject=(reason:string)=>self.postMessage({type:'cell-rejected',epoch,key:m.key,revision:m.revision,loaded:cells.has(m.key),reason});
  if(!cellRevisions.has(m.key)&&cellRevisions.size>=MAX_CELL_HISTORY){reject('revision-capacity');return;}
  if(m.type==='cell-unload'){
   if(protectedCell(m.key)){pendingUnloads.set(m.key,m.revision);self.postMessage({type:'cell-pending',epoch,key:m.key,revision:m.revision,loaded:true,reason:'player-safety'});return;}
   removeCell(m.key,m.revision);return;
  }
  if(!validCell(m)||m.terrain&&(!streamedTerrain||Math.abs(m.terrain.bound-currentBound)>.0001)){reject('invalid-cell');return;}
  if(!cells.has(m.key)&&cells.size>=MAX_ACTIVE_CELLS||cellColliderCount()-(cells.get(m.key)?.length??0)+m.obstacles.length+(m.terrain?1:0)>MAX_CELL_COLLIDERS){reject('collider-capacity');return;}
  let staged:ReturnType<typeof allocateCell>;
  try{staged=allocateCell(m);}catch{reject('allocation-failed');return;}
  // All native allocations succeeded while the prior revision remains alive.
  // A bad replacement may not put solid geometry through the current capsule.
  if((streamedTerrain||m.key==='restoration-automaton')&&staged.colliders.some(c=>c.intersectsShape(new RAPIER.Capsule(collider.halfHeight(),RADIUS),body.translation(),{x:0,y:0,z:0,w:1}))){for(const c of staged.colliders)world.removeCollider(c,true);reject('player-overlap');return;}
  if(streamedTerrain){
   const previous=cellTerrains.get(m.key);cellTerrains.delete(m.key);if(staged.surface)cellTerrains.set(m.key,staged.surface);
   const p=body.translation(),safe=terrainDiskReady(p.x,p.z);cellTerrains.delete(m.key);if(previous)cellTerrains.set(m.key,previous);
   if(previous&&!safe){for(const c of staged.colliders)world.removeCollider(c,true);reject('terrain-not-ready');return;}
  }
  for(const c of cells.get(m.key)??[])world.removeCollider(c,true);
  cells.set(m.key,staged.colliders);cellTerrains.delete(m.key);if(staged.surface)cellTerrains.set(m.key,staged.surface);pendingUnloads.delete(m.key);cellRevisions.set(m.key,m.revision);refreshCollisionQueries();
  self.postMessage({type:'cell-ack',epoch,key:m.key,revision:m.revision,loaded:true,count:staged.colliders.length,terrainReady:!!staged.surface});
 }else if(m.type==='input'&&Number.isFinite(m.x)&&Number.isFinite(m.z)){
  if(townCrowd){
   if(Number.isFinite(m.townTime)&&m.townTime>=0){if(!townOnline||m.townTime!==townAnchor){townAnchor=m.townTime;townAnchorStep=townOnline?simulationStep:Number.isSafeInteger(m.townStep)&&m.townStep>=0&&m.townStep<=simulationStep?m.townStep:simulationStep;}if(validTownActors(m.townActors))townActors=m.townActors;}
   // Pose changes at the same clock are real state changes. Omitted/invalid input
   // preserves the last accepted snapshot; only world replacement clears it.
   if(validTownLifePoses(m.townLifePoses)&&!sameTownLifePoses(townLifePoses,m.townLifePoses))townLifePoses=copyTownLifePoses(m.townLifePoses);
  }

  const held=m.jump===true,paused=m.paused===true,grabbing=m.grab===true;
  if(!paused&&grabbing&&!grabHeld){contacts?.requestGrab();grabPulse=.25;grabActive=true;}if(!grabbing||paused)grabActive=false;grabHeld=grabbing;if(paused){grabPulse=0;pendingContactRequestId=null;contacts?.cancelPending();}
  if(labPlayback){input={...input,paused};if(paused)jumpBuffer=0;return;}
  // Latch message edges, not simulation samples: a press/release inside one tick still jumps.
  if(paused)jumpBuffer=0;else if(held&&!jumpHeld)jumpBuffer=BUFFER_TIME;
  jumpHeld=held;
  input={x:Math.max(-1,Math.min(1,m.x)),z:Math.max(-1,Math.min(1,m.z)),sprint:m.sprint===true,analog:m.analog===true,crouch:m.crouch===true,jump:held,paused};
 }else if(m.type==='teleport'&&ready&&Number.isFinite(m.x)&&Number.isFinite(m.z)&&(m.y===undefined||Number.isFinite(m.y)&&Math.abs(m.y)<=1_000_000)){
  const x=streamedTerrain?clampRegionalCoordinate(m.x,currentBound):m.x,z=streamedTerrain?clampRegionalCoordinate(m.z,currentBound):m.z;
  if((streamedTerrain?Math.abs(m.x)>currentBound||Math.abs(m.z)>currentBound:Math.abs(m.x)>=currentBound-RADIUS||Math.abs(m.z)>=currentBound-RADIUS)||streamedTerrain&&!terrainDiskReady(x,z)){self.postMessage({type:'teleport-rejected',epoch,reason:'terrain-not-ready'});return;}
  const paused=input.paused;resetMotion();input.paused=paused;collider.setHalfHeight(STAND_HALF);const p={x,y:normalizedSpawnElevation(m.x,m.z,x,z,m.y)+STAND_HALF+RADIUS+SKIN,z};body.setTranslation(p,true);body.setNextKinematicTranslation(p);world.propagateModifiedBodyPositionsToColliders();resolveSpawnOverlap(contacts.snapshot());
 }
 }catch(error){ready=false;if(m.type==='init')initializing=false;self.postMessage({type:'error',epoch,message:error instanceof Error?error.message:'Physics failure'});}};
function snapshot(vx:number,vz:number){
 const p=body.translation(),feetY=p.y-halfHeight()-RADIUS-SKIN;self.postMessage({type:'snapshot',epoch,step:simulationStep,sandbox,...(townCrowd?{town:{time:townTime,roster:100,rigidBodies:0,source:townLifePoses?'life':'routine',...(lastTownContactPoses?{contactPoses:lastTownContactPoses}:{})}}:{}),playback:labPlayback?{...labPlayback}:null,x:p.x,y:p.y,z:p.z,feetY:hasTerrain()?feetY:Math.max(0,feetY),vx,vz,vy:input.paused?0:vy,grounded,crouched,stance,sliding:motor.slide>0,landing:landing/LANDING_TIME,landingSpeed,contact:contacts.contact,contactRequestId,movable:contacts.snapshot(),...(streamedTerrain?{streaming:{activeCells:cells.size,terrainCells:cellTerrains.size,cellColliders:cellColliderCount(),totalColliders:world.colliders.len(),revisionKeys:cellRevisions.size,pendingUnloads:pendingUnloads.size,blocked:streamBlocked,maxCells:MAX_ACTIVE_CELLS,maxColliders:MAX_CELL_COLLIDERS,maxHistory:MAX_CELL_HISTORY}}:{})});
}
export function physicsTick(){
 if(!ready)return;
 finishPendingUnloads();
 // Contact frames belong to the whole town, even when this explorer is beyond
 // its collision AABB or an early terrain/traversal branch returns a snapshot.
 // Outside that AABB no town body can touch the explorer, but observers may
 // still see the residents. Never leave their acknowledged scene on an old frame.
 if(townLifePoses?.[0]?.authoritativeMotion===1&&(!input.paused||townOnline))lastTownContactPoses=copyTownLifePoses(townLifePoses);
 // A modal/background pause freezes the complete body, including its airborne height.
 // Preserve vertical momentum for a natural continuation; held/queued actions are cleared.
 if(input.paused){
  // Online world snapshots keep progressing through a local menu. A frozen
  // explorer must not leave the entire acknowledged town on an obsolete frame.
  if(townOnline&&townLifePoses?.[0]?.authoritativeMotion===1)lastTownContactPoses=copyTownLifePoses(townLifePoses);
  motor=idleMotor();jumpBuffer=0;snapshot(0,0);return;
 }
 if(labPlayback){const script=LAB_SCRIPTS[labPlayback.id]!;if(labPlayback.warmup===0&&labPlayback.tick>=Math.round(script.seconds*60)){input={...neutral(),paused:true};snapshot(0,0);return;}const command=labPlayback.warmup>0?{x:0,z:0,jump:false,crouch:false}:script.input(labPlayback.tick);if(command.jump&&!jumpHeld)jumpBuffer=BUFFER_TIME;jumpHeld=command.jump===true;input={...neutral(),x:command.x,z:command.z,analog:true,crouch:command.crouch===true,jump:jumpHeld};}
 simulationStep++;if(townCrowd)townTime=townAnchor+Math.min((simulationStep-townAnchorStep)*DT,townOnline?.3:Infinity);const dt=DT;grabPulse=Math.max(0,grabPulse-dt);let p=body.translation();const wasGrounded=grounded;motor=stepMotor(motor,input,dt,grounded,tuning);
 streamBlocked=streamedTerrain&&!terrainTravelReady(p.x,p.z,motor.vx,motor.vz);
 if(streamBlocked){motor=idleMotor();jumpBuffer=0;if(!terrainDiskReady(p.x,p.z)){snapshot(0,0);return;}}
 if(!contacts.isHanging()&&!crouched&&collider.halfHeight()<STAND_HALF-.001){traversalRecovery=true;crouched=true;stance=1;collider.setHalfHeight(LOW_HALF);}
 const wantsLow=input.crouch||motor.slide>0;
 // A compact mantle exit settles into the real low motor first. Recover its
 // height gradually only on ground, sweeping each rise instead of a .55 m pop.
 if(traversalRecovery){
  if(grounded){
   const oldHalf=collider.halfHeight(),targetHalf=wantsLow?LOW_HALF:STAND_HALF,nextHalf=Math.max(LOW_HALF,Math.min(STAND_HALF,oldHalf+Math.max(-DT*1.5,Math.min(DT*1.5,targetHalf-oldHalf)))),rise=nextHalf-oldHalf;
   const next={x:p.x,y:p.y+rise,z:p.z},shape=new RAPIER.Capsule(nextHalf,RADIUS);
   const hit=world.castShape(p,{x:0,y:0,z:0,w:1},{x:0,y:rise,z:0},new RAPIER.Capsule(Math.min(oldHalf,nextHalf),RADIUS),0,1,true,undefined,undefined,collider);
   if(!hit&&!world.intersectionWithShape(next,{x:0,y:0,z:0,w:1},shape,undefined,undefined,collider)){
    collider.setHalfHeight(nextHalf);p=next;body.setTranslation(p,true);world.propagateModifiedBodyPositionsToColliders();stance=(STAND_HALF-nextHalf)/(STAND_HALF-LOW_HALF);
    if(nextHalf===STAND_HALF&&!wantsLow){traversalRecovery=false;crouched=false;stance=0;}
   }
  }
 }else{
 // Duck visibly before reducing collision height; keep feet fixed in either stance.
 if(wantsLow&&!contacts.isHanging())stance=Math.min(1,stance+dt*6);
 if(wantsLow&&!contacts.isHanging()&&stance>=1&&!crouched){crouched=true;collider.setHalfHeight(LOW_HALF);p={x:p.x,y:p.y-(STAND_HALF-LOW_HALF),z:p.z};body.setTranslation(p,true);}
 else if(!wantsLow&&crouched){
  const upright={x:p.x,y:p.y+(STAND_HALF-LOW_HALF),z:p.z};
  if(!world.intersectionWithShape(upright,{x:0,y:0,z:0,w:1},new RAPIER.Capsule(STAND_HALF,RADIUS),undefined,undefined,collider)){
   crouched=false;collider.setHalfHeight(STAND_HALF);p=upright;body.setTranslation(p,true);
  }
 }
 if(!wantsLow)stance=crouched?1:Math.max(0,stance-dt*6);
 }
 if(hasTerrain())world.propagateModifiedBodyPositionsToColliders();
 if(crouched&&!wantsLow){const n=Math.hypot(motor.vx,motor.vz);if(n>1.45){motor.vx*=1.45/n;motor.vz*=1.45/n;}}
 const contactMotion=()=>({p:body.translation(),feetY:body.translation().y-halfHeight()-RADIUS-SKIN,grounded,crouched,vx:motor.vx,vz:motor.vz,inputX:input.x,inputZ:input.z,grab:grabActive||grabPulse>0,crouch:input.crouch,jump:jumpBuffer>0});
 const wasHanging=contacts.isHanging(),interaction=contacts.before(contactMotion());
 if(pendingContactRequestId){contactRequestId=pendingContactRequestId;pendingContactRequestId=null;}
 if(interaction.consumeJump)jumpBuffer=0;
 if(interaction.position){
  if(streamedTerrain&&(Math.abs(interaction.position.x)>regionalCenterBound(currentBound)||Math.abs(interaction.position.z)>regionalCenterBound(currentBound)||!terrainDiskReady(interaction.position.x,interaction.position.z))){contacts.reset();motor=idleMotor();streamBlocked=true;snapshot(0,0);return;}
  collider.setHalfHeight(interaction.capsuleHalfHeight??STAND_HALF);
  vy=0;grounded=false;coyote=0;jumpBuffer=0;landing=0;motor=idleMotor();body.setNextKinematicTranslation(interaction.position);world.step();
  const next=body.translation();if(interaction.finished){grounded=true;coyote=COYOTE_TIME;}
  snapshot((next.x-p.x)/dt,(next.z-p.z)/dt);return;
 }
 // A cancelled compact mantle continues in the actual compact motor shape. Never
 // inflate a standing capsule through the lip, or translate the body to fake clearance.
 if(!contacts.isHanging()&&!crouched&&!traversalRecovery&&collider.halfHeight()<STAND_HALF-.001){traversalRecovery=true;crouched=true;stance=1;collider.setHalfHeight(LOW_HALF);}
 if(wasHanging){vy=0;grounded=false;coyote=0;}
 motor.vx=interaction.vx;motor.vz=interaction.vz;
 coyote=grounded?COYOTE_TIME:Math.max(0,coyote-dt);landing=Math.max(0,landing-dt);
 if(jumpBuffer>0&&(grounded||coyote>0)){
  vy=tuning.jumpSpeed;grounded=false;coyote=0;jumpBuffer=0;landing=0;landingSpeed=0;motor.slide=0;
 }
 jumpBuffer=Math.max(0,jumpBuffer-dt);
 if(!grounded)vy=Math.max(-30,vy-tuning.gravity*dt);else vy=0;
 if(grounded){controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);}else{controller.disableAutostep();controller.disableSnapToGround();}
 // A tiny downward probe maintains contact without repeatedly projecting a large
 // artificial fall into sideways slope motion. Gravity still governs real airtime.
 const desiredY=grounded?(hasTerrain()?-.001:-.03):vy*dt;
 // Terrain always resolves one full sweep against the shared mesh and every box.
 // Only legacy flat worlds separate their exact authored support plane from obstacles.
 // Rapier's rounded
 // capsule/large-floor contact normals otherwise feed sideways jitter back into the motor.
 // Both sweeps use real colliders, including floor touchdown; only the floor's lateral
 // numerical correction is discarded. Obstacles still resolve the full 3D trajectory.
 const desired={x:motor.vx*dt,y:desiredY,z:motor.vz*dt};
 if(streamedTerrain){desired.x=clampRegionalCoordinate(p.x+desired.x,currentBound)-p.x;desired.z=clampRegionalCoordinate(p.z+desired.z,currentBound)-p.z;}
 const crowdPoses=townCrowd&&Math.abs(p.x-TOWN_CENTER.x)<TOWN_BOUNDS.halfWidth-2&&Math.abs(p.z-TOWN_CENTER.z)<TOWN_BOUNDS.halfDepth-6?townCrowd.sample(townTime,100,1,[...townActors.filter(a=>a.id!==townSelfId),{id:townSelfId,x:p.x,z:p.z,feetY:p.y-halfHeight()-RADIUS-SKIN}],townLifePoses):undefined;
 if(crowdPoses?.[0]?.authoritativeMotion===1)lastTownContactPoses=copyTownLifePoses(crowdPoses);
 if(crowdPoses){
  const feet=p.y-halfHeight()-RADIUS-SKIN,moved=slideTownCrowd(p,{x:p.x+desired.x,z:p.z+desired.z},crowdPoses,feet),next=townPlayerContactRecovery(moved,crowdPoses,feet,dt);
  // Rapier still clips the combined correction/input against actual terrain and
  // walls below. Only the explorer responds to entering kinematic town bodies.
  desired.x=next.x-p.x;desired.z=next.z-p.z;
 }
 if(hasTerrain())controller.computeColliderMovement(collider,desired);
 else controller.computeColliderMovement(collider,{x:motor.vx*dt,y:desiredY,z:motor.vz*dt},undefined,undefined,c=>c.handle!==floor.handle);
 let v=controller.computedMovement();if(crowdPoses){const next=slideTownCrowd(p,{x:p.x+v.x,z:p.z+v.z},crowdPoses,p.y-halfHeight()-RADIUS-SKIN);if(Math.hypot(next.x-p.x-v.x,next.z-p.z-v.z)>1e-7){controller.computeColliderMovement(collider,{x:next.x-p.x,y:v.y,z:next.z-p.z});v=controller.computedMovement();}}let supported=controller.computedGrounded();
 const collisions=Array.from({length:controller.numComputedCollisions()},(_,i)=>controller.computedCollision(i)!).filter(Boolean);
 // Only a real ceiling may cancel upward momentum. Regional perimeter walls
 // represent vertical extent planes; a noisy native normal from those enormous
 // boxes must not masquerade as a ceiling during a corner jump.
 if(vy>0)for(const hit of collisions){if(hit.normal1.y<-.5&&!(streamedTerrain&&hit.collider&&perimeterColliders.has(hit.collider.handle))){vy=0;break;}}
 if(!hasTerrain()&&v.y<=0){
  controller.computeColliderMovement(collider,{x:0,y:v.y,z:0},undefined,undefined,c=>c.handle===floor.handle);
  const floorMovement=controller.computedMovement();v.y=Math.max(v.y,floorMovement.y);supported=supported||controller.computedGrounded();
 }
 const impactSpeed=Math.max(0,-vy);
 grounded=desiredY<=0&&(supported||(!hasTerrain()&&p.y+v.y<=halfHeight()+RADIUS+SKIN+.001));
 if(grounded){vy=0;coyote=COYOTE_TIME;if(!wasGrounded&&impactSpeed>1){landing=LANDING_TIME;landingSpeed=impactSpeed;}}
 // The regional outer extent is an explicit geometric domain. Rapier still
 // resolves solids, tangential travel and terrain height; numerical normal
 // corrections may not push the capsule beyond radius+skin at that perimeter.
 if(streamedTerrain){v.x=clampRegionalCoordinate(p.x+v.x,currentBound)-p.x;v.z=clampRegionalCoordinate(p.z+v.z,currentBound)-p.z;}
 contacts.finishPair(v);
 body.setNextKinematicTranslation({x:p.x+v.x,y:hasTerrain()?p.y+v.y:Math.max(halfHeight()+RADIUS+SKIN,p.y+v.y),z:p.z+v.z});world.step();
 const n=body.translation(),vx=(n.x-p.x)/dt,vz=(n.z-p.z)/dt;
 // Do not accumulate intended momentum into walls; snapshots drive animation from reality.
 motor.vx=vx;motor.vz=vz;if(motor.slide>0&&Math.hypot(vx,vz)<.15)motor.slide=0;
 contacts.after(contactMotion(),{x:vx,z:vz},collisions);
 snapshot(vx,vz);if(labPlayback){if(labPlayback.warmup>0)labPlayback.warmup--;else labPlayback.tick++;}
}
setInterval(()=>{if(!manual)physicsTick();},1000/60);
