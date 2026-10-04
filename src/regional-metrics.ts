import {analogSpeed,movementInput} from './locomotion.ts';
import {DEFAULT_TUNING} from './tuning.ts';
export interface RegionalCalibrationWorker {postMessage(message:unknown):void;terminate():unknown;onmessage:((event:{data:any})=>void)|null;onerror:((event:unknown)=>void)|null}
export interface RegionalCalibrationMeasurement {gait:'walk'|'jog'|'run'|'sprint';inputStrength:number;inputMode:'touch-analog'|'keyboard'|'keyboard-shift';steadySpeed:number;expectedSpeed:number;accelerationSeconds:number;distanceMetres:number;seconds:number;samples:number;groundedFraction:number;pass:boolean}
export interface RegionalCalibrationReport {version:1;status:'complete'|'interrupted';source:string;scope:string;hz:60;accelerationMetresPerSecondSquared:number;brakingMetresPerSecondSquared:number;sprintConsumesStamina:false;measurements:RegionalCalibrationMeasurement[];error?:string}
export const REGIONAL_CALIBRATION_INPUTS=Object.freeze([
 {gait:'walk',inputStrength:.36,inputMode:'touch-analog'},
 {gait:'jog',inputStrength:.58,inputMode:'touch-analog'},
 {gait:'run',inputStrength:.8,inputMode:'touch-analog'},
 {gait:'sprint',inputStrength:1,inputMode:'touch-analog'},
 {gait:'run',inputStrength:Math.hypot(...Object.values(movementInput(1,0,0,0,0,false))),inputMode:'keyboard'},
 {gait:'sprint',inputStrength:Math.hypot(...Object.values(movementInput(1,0,0,0,0,true))),inputMode:'keyboard-shift'},
] as const);
/** Measures resolved production-worker displacement on flat triangles. No time
 * comes from render callbacks or wall clock: 600 fixed ticks are ten seconds.
 * A fresh disposable world per input means no campaign position, stamina, saves,
 * procedural geometry or live render state is touched. */
export async function runRegionalCalibration(options:{signal?:AbortSignal;progress?:(completed:number,total:number,measurement:RegionalCalibrationMeasurement)=>void;workerFactory?:()=>RegionalCalibrationWorker}={}):Promise<RegionalCalibrationReport>{
 const report:RegionalCalibrationReport={version:1,status:'complete',source:'Production Rapier physics.worker.ts, default release motor, 60 Hz fixed steps',scope:'Flat-ground simulation calibration, with one metre per world unit. Includes acceleration from rest. This is not a physical-device frame-rate, touch-ergonomics or rendered visual benchmark. Sprint has no locomotion stamina drain; stamina belongs to combat actions.',hz:60,accelerationMetresPerSecondSquared:DEFAULT_TUNING.acceleration,brakingMetresPerSecondSquared:DEFAULT_TUNING.braking,sprintConsumesStamina:false,measurements:[]};
 const worker=options.workerFactory?.()??new Worker(new URL('./physics.worker.ts',import.meta.url),{type:'module'});let epoch=0,samples:{x:number;z:number;vx:number;vz:number;grounded:boolean;step:number}[]=[],pending:{type:string;resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}|undefined;
 const fail=(reason:string)=>{if(pending){clearTimeout(pending.timer);const p=pending;pending=undefined;p.reject(new Error(reason));}};
 worker.onerror=()=>fail('The calibration physics worker failed');worker.onmessage=({data:m}:{data:any})=>{if(m.epoch!==epoch)return;if(m.type==='snapshot')samples.push(m);if(m.type==='error')fail(m.message??'Calibration physics failed');if(pending&&m.type===pending.type){clearTimeout(pending.timer);const p=pending;pending=undefined;p.resolve();}};
 const abort=()=>fail('Calibration cancelled');options.signal?.addEventListener('abort',abort);
 const request=(message:Record<string,unknown>,type:string)=>new Promise<void>((resolve,reject)=>{if(options.signal?.aborted){reject(new Error('Calibration cancelled'));return;}pending={type,resolve,reject,timer:setTimeout(()=>fail('The calibration physics worker did not answer'),15000)};worker.postMessage({...message,epoch});});
 const advance=async(ticks:number)=>{for(let left=ticks;left>0;left-=120)await request({type:'step',ticks:Math.min(left,120)},'stepped');};
 const vertices:number[]=[],indices:number[]=[];for(let z=0;z<=128;z++)for(let x=0;x<=128;x++)vertices.push(x*2-128,0,z*2-128);for(let z=0;z<128;z++)for(let x=0;x<128;x++){const a=z*129+x,b=a+1,c=a+129,d=c+1;indices.push(a,c,b,b,c,d);}
 const flatTerrain={bound:128,step:2,vertices,indices};
 try{
  for(const specification of REGIONAL_CALIBRATION_INPUTS){
   epoch++;samples=[];
   await request({type:epoch===1?'init':'zone',manual:true,x:-80,z:0,bound:128,obstacles:[],terrain:flatTerrain},'ready');
   await advance(60);const start=samples.at(-1);if(!start)throw new Error('Calibration returned no warmup sample');samples=[];
   worker.postMessage({type:'input',epoch,x:specification.inputStrength,z:0,analog:true,sprint:specification.inputMode==='keyboard-shift'});await advance(600);
   const finish=samples.at(-1),steadyStart=samples[299];if(!finish||!steadyStart||samples.length!==600)throw new Error('Calibration returned an incomplete fixed-step trace');
   const expectedSpeed=analogSpeed(specification.inputStrength),steadySpeed=Math.hypot(finish.x-steadyStart.x,finish.z-steadyStart.z)/5,attained=samples.findIndex(s=>Math.hypot(s.vx,s.vz)>=expectedSpeed*.99),accelerationSeconds=attained<0?10:(attained+1)/60,distanceMetres=Math.hypot(finish.x-start.x,finish.z-start.z),groundedFraction=samples.filter(s=>s.grounded).length/samples.length;
   const result:RegionalCalibrationMeasurement={...specification,steadySpeed,expectedSpeed,accelerationSeconds,distanceMetres,seconds:(finish.step-start.step)/60,samples:samples.length,groundedFraction,pass:Math.abs(steadySpeed-expectedSpeed)<.025&&attained>=0&&Math.abs(accelerationSeconds-expectedSpeed/DEFAULT_TUNING.acceleration)<.04&&groundedFraction>.999&&samples.every(s=>[s.x,s.z,s.vx,s.vz].every(Number.isFinite))};
   report.measurements.push(result);options.progress?.(report.measurements.length,REGIONAL_CALIBRATION_INPUTS.length,result);
  }
 }catch(error){report.status='interrupted';report.error=error instanceof Error?error.message:String(error);}finally{options.signal?.removeEventListener('abort',abort);if(pending)clearTimeout(pending.timer);worker.terminate();}
 return report;
}
