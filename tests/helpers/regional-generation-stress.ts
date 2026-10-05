/** Reproducible bounded seed sweep: node --experimental-strip-types tests/helpers/regional-generation-stress.ts */
import {regionalPlan,regionalHeight,generateRegionalChunk,regionalChunkAt,REGIONAL_MAX_ROAD_GRADE} from '../../src/regional-world.ts';
import {regionalTrailGradeAudit} from '../../src/regional-routes.ts';
import {obstacleSegmentIntersects,type WildernessObstacle} from '../../src/wilderness-geometry.ts';
export function runRegionalGenerationStress(count=100){
 let maxGrade=0,worst:{seed:number;x:number;z:number;road:string}|null=null,minTrailMetres=Infinity,maxTrailMetres=0,collisionSamples=0,gradeFailures=0,planFailures=0,sampledTrailMetres=0,townMaxGrade=0,townGradeFailures=0,townWorst:{seed:number;x:number;z:number;road:string}|null=null;
 const failures:string[]=[];
 for(let j=0;j<count;j++){
  const seed=Math.imul(j+1,2654435761)>>>0;let plan;
  try{plan=regionalPlan(seed);}catch(error){planFailures++;failures.push(`Seed ${seed}: ${(error as Error).message}`);continue;}
  const boxes:WildernessObstacle[]=plan.sites.flatMap(site=>{const at=regionalChunkAt(site.position.x,site.position.z);return generateRegionalChunk(seed,at.cx,at.cz).structures;}).map(b=>({featureId:b.id,x:b.center.x,y:b.center.y,z:b.center.z,hx:b.half.x,hy:b.half.y,hz:b.half.z}));
  let seedMaxGrade=0,trailMetres=0;
  for(const road of plan.roads)for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1]!,b=road.points[i]!,length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/2);trailMetres+=length;
   let previous={...a,y:regionalHeight(seed,a.x,a.z)};
   for(let k=1;k<=steps;k++){
    const t=k/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=regionalHeight(seed,x,z),grade=Math.abs(y-previous.y)/(length/steps);seedMaxGrade=Math.max(seedMaxGrade,grade);
    if(grade>maxGrade){maxGrade=grade;worst={seed,x,z,road:road.id};}
    if(boxes.some(box=>obstacleSegmentIntersects(box,{...previous,y:previous.y+.95},{x,y:y+.95,z},.36)))collisionSamples++;
    previous={x,y,z};
   }
  }
  sampledTrailMetres+=trailMetres;minTrailMetres=Math.min(minTrailMetres,trailMetres);maxTrailMetres=Math.max(maxTrailMetres,trailMetres);
  if(seedMaxGrade>REGIONAL_MAX_ROAD_GRADE){gradeFailures++;failures.push(`Seed ${seed}: road grade ${seedMaxGrade}`);}
  // Hearthmere streets share the regional surface; their connector joins the west trail.
  const town=regionalTrailGradeAudit(seed).trails.filter(t=>t.kind==='town'),steepTown=town.reduce((a,b)=>b.maxGrade>a.maxGrade?b:a);
  if(steepTown.maxGrade>townMaxGrade){townMaxGrade=steepTown.maxGrade;townWorst={seed,...steepTown.at,road:steepTown.id};}
  if(steepTown.maxGrade>REGIONAL_MAX_ROAD_GRADE){townGradeFailures++;failures.push(`Seed ${seed}: town street grade ${steepTown.maxGrade}`);}
 }
 return {count,planFailures,gradeFailures,collisionSamples,maxGrade,worst,townGradeFailures,townMaxGrade,townWorst,minTrailMetres,maxTrailMetres,sampledTrailMetres,failures};
}
if(process.argv[1]?.endsWith('regional-generation-stress.ts')){const report=runRegionalGenerationStress();console.log(JSON.stringify(report,null,2));if(report.planFailures||report.gradeFailures||report.townGradeFailures||report.collisionSamples)process.exitCode=1;}
