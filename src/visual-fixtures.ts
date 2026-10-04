import {idleAnimation,type AnimationState} from './locomotion.ts';
import {LAB_SCRIPTS} from './lab-script.ts';
import type {AvatarAction,ComboPose} from './avatar.ts';
import {quadrupedCycleDistance} from './body.ts';
import {createEncounters,ENEMY_RULES,type EnemyState,type EnemyPhase} from './encounters.ts';
import {createCaveWater,applyCaveWaterCommand,advanceCaveWater,caveDepth,type CaveWaterState} from './cave-water.ts';
import {naturalCave} from './natural-cave.ts';
import {createEcologyState,applyEcologyCommand,advanceEcology,ecologyPlan,ecologyStage,ecologyView,ecologyWeather,ecologyWaterBalance,ECOLOGY_RULES,type EcologyState,type EcologyCommand,type EcologyContext,type EcologyInventory} from './ecology.ts';
import {worldValley} from './generation.ts';
import {valleySurfaceHeight} from './valley.ts';
export const VISUAL_FIXTURE_VERSION=3;
export interface VisualFixture {id:string;label:string;watch:string;animation:AnimationState;action:AvatarAction;progress:number;combo?:ComboPose;floorY:number}
const fixture=(id:string,label:string,watch:string,animation:Partial<AnimationState>={},extra:Partial<Pick<VisualFixture,'action'|'progress'|'combo'|'floorY'>>={}):VisualFixture=>({id,label,watch,animation:{...idleAnimation(),...animation},action:null,progress:0,floorY:0,...extra});
/** Fixed authoring probes of the real production rig, not a physics/playback certification. */
export const VISUAL_FIXTURES:readonly VisualFixture[]=[
 fixture('idle','Idle silhouette','Read the face, hat, hands and staff at the same time'),
 ...[0,.25,.5,.75].map((phase,i)=>fixture('sprint-'+i,'Sprint · '+Math.round(phase*100)+'%','Check foot planting and staff stow, then play the live course to judge motion',{speed:8,phase,gait:'sprint',lean:.12})),
 fixture('brake','Braking compression','Check weighted stance and braced feet',{speed:3,phase:.2,brake:1,lean:-.18,gait:'walk'}),
 fixture('turn','Reversal counter-lean','Check readable counter-lean and shoulder silhouette',{speed:4,phase:.6,turn:.13,lean:-.1,gait:'jog'}),
 fixture('takeoff','Jump · launch','Check leg extension and staff clearance',{airborne:true,vertical:6.3,takeoff:1},{floorY:.1}),
 fixture('apex','Jump · apex','Check tucked legs, hand silhouette and stowed equipment',{airborne:true,vertical:0},{floorY:1.02}),
 fixture('landing','Jump · landing','Check compression with soles on the floor',{landing:1}),
 fixture('crawl-a','Crawl · first support','Check palms/feet above floor and hat/staff under the amber 1.1 m guide',{speed:1.45,crouch:1,phase:.15,gait:'crawl'}),
 fixture('crawl-b','Crawl · opposite support','Check alternating support and readable elbow/knee bend',{speed:1.45,crouch:1,phase:.65,gait:'crawl'}),
 fixture('slide','Momentum slide','Check low silhouette, staff stow and forward leg shape',{speed:6,crouch:1,slide:1,phase:.25,gait:'slide'}),
 ...([1,2,3] as const).flatMap(stage=>(['prep','active','recovery'] as const).map(phase=>fixture('combo-'+stage+'-'+phase,`Combo ${stage} · ${phase}`,'Check two-hand grip, staff direction and difference between anticipation/contact/recovery',{}, {combo:{stage,phase,progress:phase==='prep'?.85:phase==='active'?.45:.6}}))),
 fixture('gather','Gather reach','Check feet and reaching-hand pose',{},{action:'gather',progress:.5}),
 fixture('repair','Repair reach','Check clear interaction gesture and equipment stow',{},{action:'repair',progress:.5}),
];
export const LAB_CAPTURE_TICKS:Readonly<Record<string,readonly number[]>>={
 'run-brake':[0,15,45,85,95,115,149],turn:[0,45,65,78,105,130,167],jump:[0,15,25,35,45,60,85,149],ceiling:[0,12,17,25,40,89],
 'slide-crawl':[0,30,35,45,70,120,200,255,299],combo:[0,8,14,24,40,50,62,78,90,106,132,160,215],whiff:[0,12,42,64,100,132,215],occlusion:[0,12,42,64,100,132,215],interrupt:[0,3,5,12,55,58,65,143],
};
/** Disposable deterministic worker-input fixture export; never runs on campaign state. */
export function labReplayFixture(id:string){const script=LAB_SCRIPTS[id];if(!script)throw new Error('Unknown lab replay');return {version:VISUAL_FIXTURE_VERSION,id,fixedHz:60,warmupTicks:60,frames:Array.from({length:Math.round(script.seconds*60)},(_,tick)=>({tick,input:script.input(tick)})),captureTicks:[...(LAB_CAPTURE_TICKS[id]??[])],scope:'Deterministic input fixture. Runtime physics, rendering and visual approval require a real browser run.'};}

export const REVIEW_SEED=73129;
export interface QuadrupedVisualFixture {id:string;label:string;watch:string;enemy:EnemyState}
const enemyFixture=(id:string,label:string,watch:string,phase:EnemyPhase,remaining=0,distance=0,hp=100):QuadrupedVisualFixture=>({id,label,watch,enemy:{...createEncounters([{id:'review-quadruped',zone:'review',x:0,z:0}]).enemies[0]!,phase,remaining,distance,hp,heading:0,attackId:['prepare','strike','recover','stagger'].includes(phase)?1:0,targetId:phase==='prepare'||phase==='strike'?'review-target':null}});
export const QUADRUPED_VISUAL_FIXTURES:readonly QuadrupedVisualFixture[]=[
 enemyFixture('quadruped-idle','Quadruped · idle','Check the four-support silhouette, shell, sensor and all four foot contacts','idle'),
 ...[0,.25,.5,.75].map((phase,i)=>enemyFixture('quadruped-pursuit-'+i,`Pursuit · ${Math.round(phase*100)}%`,'Check diagonal support pairs, knee direction and clearance; fixed probes do not certify continuous foot planting','pursuit',0,phase*quadrupedCycleDistance(ENEMY_RULES.speed))),
 ...[.1,.5,.9].map((progress,i)=>enemyFixture('quadruped-prepare-'+i,`Locked preparation · ${Math.round(progress*100)}%`,'Compare body compression, sensor color and warning arc. Heading is identical in these probes; test live pursuit to assess targeting','prepare',ENEMY_RULES.prepare*(1-progress))),
 ...[.1,.5,.9].map((progress,i)=>enemyFixture('quadruped-strike-'+i,`Strike · ${Math.round(progress*100)}%`,'Check the forward attack gesture and warning reach. The authority, not this preview, resolves damage','strike',ENEMY_RULES.strike*(1-progress))),
 enemyFixture('quadruped-recover','Quadruped · recovery','Check return to a stable stance and disappearance of the attack warning','recover',ENEMY_RULES.recover*.5),
 enemyFixture('quadruped-stagger','Quadruped · stagger','Check the cyan sensor and damaged health bar; no extra stagger animation is fabricated by this viewer','stagger',ENEMY_RULES.stagger*.5,0,62),
];
export interface CaveVisualFixture {id:string;label:string;watch:string;water:'flooded'|'low';framing:'overview'|'narrows'}
export const CAVE_VISUAL_FIXTURES:readonly CaveVisualFixture[]=[
 {id:'cave-flooded-overview',label:'River cave · flooded overview',watch:'Trace both dry return banks, carved chambers and all three connected flooded compartments',water:'flooded',framing:'overview'},
 {id:'cave-low-overview',label:'River cave · low-water overview',watch:'Compare the same geometry after the real repaired pump/drain simulation lowers all compartments',water:'low',framing:'overview'},
 {id:'cave-flooded-narrows',label:'River cave · flooded narrows',watch:'Check water height against tiled floor and walls. Flood access barriers are gameplay logic, not this image',water:'flooded',framing:'narrows'},
 {id:'cave-low-narrows',label:'River cave · low-water narrows',watch:'Check the revealed floor route and remaining shallow water. Judge walkability in the live cave',water:'low',framing:'narrows'},
];
/** Repaired low-water fixture comes from production commands and fixed quarter-second steps. */
export function caveReviewWater(seed=REVIEW_SEED):{flooded:CaveWaterState;low:CaveWaterState;steps:number}{
 const flooded=createCaveWater(seed),plan=naturalCave(seed);let low=flooded,inventory={scrap:4,core:1,water:0};
 for(const [type,player]of [['repair-valve',plan.anchors.valve],['repair-pump',plan.anchors.pump],['clear-drain',plan.anchors.drain]]as const){const result=applyCaveWaterCommand(low,{inventory,player,zone:'cave',hp:100},{type});if(result.state===low)throw new Error('Cave review repair fixture was rejected');low=result.state;inventory=result.inventory;}
 let steps=0;while(plan.basins.some(b=>caveDepth(low,b.index,plan)>.16)&&steps<2400){low=advanceCaveWater(low,.25);steps++;}
 if(plan.basins.some(b=>caveDepth(low,b.index,plan)>.16))throw new Error('Cave low-water review did not reach its bounded target');
 return {flooded,low,steps};
}

export type EcologyReviewStage='empty'|'seeded'|'sprouted'|'budding'|'ripe'|'harvested'|'rain';
export interface EcologyVisualFixture {id:string;label:string;watch:string;stage:EcologyReviewStage}
export const ECOLOGY_VISUAL_FIXTURES:readonly EcologyVisualFixture[]=[
 {id:'ecology-empty',label:'Garden · empty',watch:'Check the terrain-supported soil bed and four stakes before any seed or canister is spent',stage:'empty'},
 {id:'ecology-seeded',label:'Garden · planted and watered',watch:'Compare the small planted shoots and wetter soil after one real seed and one 4 L canister are spent',stage:'seeded'},
 {id:'ecology-sprouted',label:'Garden · sprouted',watch:'Compare actual first-stage growth against the same bed, terrain and camera',stage:'sprouted'},
 {id:'ecology-budding',label:'Garden · budding',watch:'Check the taller stems, leaves and small buds produced by committed growth',stage:'budding'},
 {id:'ecology-ripe',label:'Garden · ripe',watch:'Check mature fruit and full plant height before the harvest command',stage:'ripe'},
 {id:'ecology-harvested',label:'Garden · harvested',watch:'Compare with the ripe frame: the crop must disappear after exactly 2 biomass enters the pouch',stage:'harvested'},
 {id:'ecology-rain',label:'Garden · real rainfall',watch:'Check local rain streaks over the harvested bed after actual rainfall has entered the soil ledger',stage:'rain'},
];
export interface EcologyReviewSnapshot {state:EcologyState;inventory:EcologyInventory;steps:number;commands:{tick:number;command:EcologyCommand}[]}
export const ECOLOGY_REVIEW_MAX_STEPS=2400;
/** Isolated finite supplies, accepted production commands and bounded quarter-second growth. No saved campaign is read. */
export function ecologyReviewStates(seed=REVIEW_SEED){
 const plan=ecologyPlan(seed),plot=plan.plots[0]!,initialContext:EcologyContext={seed,generation:2,zone:'valley',player:{x:plot.position.x,z:plot.position.z,hp:100},inventory:{scrap:0,core:0,water:1}};
 let state=createEcologyState(seed),inventory={...initialContext.inventory},steps=0;
 const commands:EcologyReviewSnapshot['commands']=[];
 const snapshot=():EcologyReviewSnapshot=>structuredClone({state,inventory,steps,commands});
 const command=(command:EcologyCommand)=>{const result=applyEcologyCommand(state,{...initialContext,inventory},command);if(result.state===state)throw new Error('Ecology review command rejected: '+result.message);commands.push({tick:state.tick,command:{...command}});state=result.state;inventory=result.inventory;};
 const advanceUntil=(done:()=>boolean)=>{while(!done()&&steps<ECOLOGY_REVIEW_MAX_STEPS){state=advanceEcology(state,ECOLOGY_RULES.step);steps++;}if(!done())throw new Error('Ecology review exceeded its finite growth/weather budget');};
 const empty=snapshot();
 command({type:'plant',plotId:plot.id,species:plot.habitat==='sheltered'?'reedmoss':'sunleaf',expectedRevision:state.revision});
 command({type:'water',plotId:plot.id,expectedRevision:state.revision});
 const seeded=snapshot();advanceUntil(()=>ecologyStage(state.plots[0]!.crop)==='sprouted');
 const sprouted=snapshot();advanceUntil(()=>ecologyStage(state.plots[0]!.crop)==='budding');
 const budding=snapshot();advanceUntil(()=>ecologyStage(state.plots[0]!.crop)==='ripe');
 const ripe=snapshot();command({type:'harvest',plotId:plot.id,expectedRevision:state.revision});
 const harvested=snapshot(),rainBefore=state.water.rain;
 advanceUntil(()=>ecologyWeather(seed,state.tick*ECOLOGY_RULES.step).kind==='rain'&&state.water.rain>rainBefore);
 const states:Record<EcologyReviewStage,EcologyReviewSnapshot>={empty,seeded,sprouted,budding,ripe,harvested,rain:snapshot()};
 return {seed,plotId:plot.id,initialContext,stepSeconds:ECOLOGY_RULES.step,maxSteps:ECOLOGY_REVIEW_MAX_STEPS,states};
}
export type EcologyReview=ReturnType<typeof ecologyReviewStates>;
/** Numeric evidence accompanies actual raster captures; it is never a screenshot or visual approval. */
export function ecologyReviewEvidence(review:EcologyReview,fixture:EcologyVisualFixture){
 const snapshot=review.states[fixture.stage],state=snapshot.state;
 return structuredClone({scope:'Disposable production reducer snapshot; no campaign state or graphics approval',plotId:review.plotId,initialContext:review.initialContext,stepSeconds:review.stepSeconds,maxSteps:review.maxSteps,...snapshot,projection:ecologyView(state),waterLedger:{unit:'mL',...state.water,currentSoil:state.plots.reduce((total,p)=>total+p.soilWater,0),balance:ecologyWaterBalance(state)}});
}
/** Inspection-only support patch, aligned with production bed vertices and sampled from the real valley surface. */
export function ecologyReviewTerrain(seed=REVIEW_SEED){
 const plot=ecologyPlan(seed).plots[0]!,valley=worldValley(seed),subdivisions=48,spacing=ECOLOGY_RULES.plotHalf/4,half=subdivisions*spacing/2,positions:number[]=[],indices:number[]=[];
 for(let z=0;z<=subdivisions;z++)for(let x=0;x<=subdivisions;x++){const px=plot.position.x-half+x*spacing,pz=plot.position.z-half+z*spacing;positions.push(px,valleySurfaceHeight(valley,px,pz),pz);}
 for(let z=0;z<subdivisions;z++)for(let x=0;x<subdivisions;x++){const a=z*(subdivisions+1)+x,b=a+1,c=a+subdivisions+1,d=c+1;indices.push(a,c,b,b,c,d);}
 return {positions,indices,subdivisions,spacing,half,plotId:plot.id,source:'worldValley + valleySurfaceHeight; local support patch, no native scenery'};
}
/** Every ecology state uses the same fixed, selected-bed framing for a given camera angle. */
export function ecologyReviewCamera(seed=REVIEW_SEED,angle='three-quarter'){
 const {position:p}=ecologyPlan(seed).plots[0]!,offset=angle==='front'?[0,3.4,6.1]:angle==='side'?[6.1,3.4,0]:angle==='back'?[0,3.4,-6.1]:[4.2,3.2,4.8];
 return {position:[p.x+offset[0]!,p.y+offset[1]!,p.z+offset[2]!] as [number,number,number],target:[p.x,p.y+.7,p.z] as [number,number,number],near:.01,far:12};
}
