import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync,renameSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {runRegionalSupplyLab} from '../src/regional-supply-lab.ts';

/** Ordinary deterministic model and production-controller tests only. No browser, live server, publication,
 * campaign/storage access, or standalone runtime/WASM diagnostics. */
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const files=['tests/regional-supply-integration.test.ts','tests/regional-supply-physics.test.ts','tests/regional-supply-terrain-physics.test.ts','tests/regional-supply-main.test.ts'];
const sources=['src/regional-view.ts','src/main.ts','src/session.ts','src/world-map-view.ts','src/regional-supply-ui.ts','src/regional-supply-view.ts','server/coop-authority.ts','server/coop-api.ts','server/coop-validation.ts','src/regional-supply.ts','src/regional-supply-lab.ts','src/world.ts','src/regional-world.ts','src/wilderness-state.ts','src/wilderness.ts','src/wilderness-geometry.ts','src/ecology.ts','src/physics.worker.ts','src/tuning.ts','src/contact-physics.ts','src/player-contact.ts','src/locomotion.ts','src/ledge-mantle.ts','tests/helpers/regional-physics.ts',...files,'scripts/measure-regional-supply.mts','package.json','package-lock.json'];
const fingerprints=()=>Object.fromEntries(sources.map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
const measuredSources=fingerprints(),command=[process.execPath,'--experimental-strip-types','--test','--test-reporter=spec',...files];
const result=spawnSync(command[0]!,command.slice(1),{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');
const records=(result.stdout??'').split('\n').flatMap(line=>{const i=line.indexOf('{');if(i<0)return [];try{const value=JSON.parse(line.slice(i));return value.regionalSupplyAllOutposts||value.regionalSupplyGeometry||value.regionalSupplyPhysics||value.regionalSupplyTerrainPhysics?[value]:[];}catch{return [];}});
const coverage={allOutposts:records.find(r=>r.regionalSupplyAllOutposts)??null,geometry:records.find(r=>r.regionalSupplyGeometry)??null,physics:records.find(r=>r.regionalSupplyPhysics)??null,regionalTerrainPhysics:records.find(r=>r.regionalSupplyTerrainPhysics)??null};
const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}),dirty=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});
const lab=runRegionalSupplyLab(73129,3,{sourceRevision:git.status===0?git.stdout.trim():'isolated-stage'}),sourceUnchanged=JSON.stringify(measuredSources)===JSON.stringify(fingerprints());
const verified=result.status===0&&lab.status==='complete'&&lab.runs.length===3&&lab.runs.every(run=>run.checks.length>0&&run.checks.every(check=>check.pass))&&sourceUnchanged&&Object.values(coverage).every(Boolean);
const report={version:1,status:verified?'verified':'failed',measuredAt:new Date().toISOString(),source:{head:git.status===0?git.stdout.trim():null,workingTreeDirty:dirty.status===0?Boolean(dirty.stdout.trim()):null,sha256:measuredSources,runtime:process.version},scope:lab.scope,command:command.map(p=>p===process.execPath?'node':p).join(' '),testFiles:files,lab,coverage,checks:{exitCode:result.status,sourceUnchangedDuringRun:sourceUnchanged,...(!verified?{error:result.error?.message??lab.error??'A scenario assertion or test failed'}:{})}};
mkdirSync(resolve(root,'evidence'),{recursive:true});const target=resolve(root,'evidence/regional-supply-report.json'),temporary=target+'.tmp';writeFileSync(temporary,JSON.stringify(report,null,2)+'\n');renameSync(temporary,target);
process.stdout.write(`\n${verified?'Verified':'Failed'} regional supply evidence: evidence/regional-supply-report.json\n`);if(!verified)process.exitCode=1;
