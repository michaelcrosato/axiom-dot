import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync,renameSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

/** Re-run the production worker calibration and streaming journeys, then persist
 * only current, real measurements. No browser, server, publication or save state. */
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const files=['tests/regional-metrics.test.ts','tests/regional-physics.test.ts','tests/regional-travel-physics.test.ts'];
const sources=['src/physics.worker.ts','src/regional-bounds.ts','src/locomotion.ts','src/tuning.ts','src/contact-physics.ts','src/player-contact.ts','src/ledge-mantle.ts','src/lab-script.ts','src/regional-world.ts','src/regional-metrics.ts','src/wilderness-geometry.ts','src/procedural.ts','src/valley.ts','src/building.ts',...files,'tests/helpers/regional-physics.ts','scripts/measure-regional-world.mts','package.json','package-lock.json'];
const fingerprints=()=>Object.fromEntries(sources.map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
const measuredSources=fingerprints();
const command=[process.execPath,'--experimental-strip-types','--test','--test-reporter=spec',...files];
const result=spawnSync(command[0]!,command.slice(1),{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');
const records=(result.stdout??'').split('\n').flatMap(line=>{const i=line.indexOf('{');if(i<0)return [];try{const value=JSON.parse(line.slice(i));return value.gait||value.route?[value]:[];}catch{return [];}});
const calibration=records.filter(r=>r.gait),journeys=records.filter(r=>r.route),sourceUnchanged=JSON.stringify(measuredSources)===JSON.stringify(fingerprints()),verified=result.status===0&&calibration.length===6&&journeys.length===2&&sourceUnchanged;
const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}),dirty=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});
const report={version:1,status:verified?'verified':'failed',measuredAt:new Date().toISOString(),source:{head:git.status===0?git.stdout.trim():null,workingTreeDirty:dirty.status===0?Boolean(dirty.stdout.trim()):null,worker:'src/physics.worker.ts',sha256:measuredSources,driver:'scripts/measure-regional-world.mts',runtime:process.version},scope:'Real Rapier WASM and production controller, manually clocked at exactly 60 Hz. One world unit is one metre. Journey metres are cumulative collision-resolved horizontal distance. Includes acceleration, turns, waypoint approaches and live bounded terrain/solid residency. These are simulation measurements, not a physical-device FPS, visual, or network test.',world:{areaSquareMetres:10_000_000,boundMetres:Math.sqrt(10_000_000)/2,widthMetres:Math.sqrt(10_000_000),chunkMetres:64,terrainStepMetres:2},controller:{hz:60,accelerationMetresPerSecondSquared:22,brakingMetresPerSecondSquared:30,sprintConsumesStamina:false,staminaScope:'Combat attack and guard actions only'},command:command.map(p=>p===process.execPath?'node':p).join(' '),testFiles:files,calibration,journeys,checks:{exitCode:result.status,sourceUnchangedDuringRun:sourceUnchanged,measurementsComplete:calibration.length===6&&journeys.length===2,...(!verified?{error:result.error?.message??'One or more test assertions or expected measurements failed'}:{})}};
mkdirSync(resolve(root,'evidence'),{recursive:true});const target=resolve(root,'evidence/regional-physics-report.json'),temporary=target+'.tmp';writeFileSync(temporary,JSON.stringify(report,null,2)+'\n');renameSync(temporary,target);
process.stdout.write(`\n${verified?'Verified':'Failed'} regional physics evidence: evidence/regional-physics-report.json\n`);if(!verified)process.exitCode=1;
