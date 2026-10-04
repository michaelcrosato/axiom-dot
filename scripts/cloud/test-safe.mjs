/** Explicitly excludes the 13 inherited held files. No CI is enabled here. */
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
process.chdir(root);
assert.equal(process.version,'v22.23.0','Select the verified Node v22.23.0 runtime first');
const excluded=[
  'tests/ecology.test.ts',
  'tests/regional-clock-precision.test.ts',
  'tests/regional-food-trade-witness.test.ts',
  'tests/regional-food-world-authority.test.ts',
  'tests/regional-food.test.ts',
  'tests/regional-supply.test.ts',
  'tests/regional-trade-integration.test.ts',
  'tests/regional-trade-timeline.test.ts',
  'tests/regional-trade.test.ts',
  'tests/regional-weather-cold.test.ts',
  'tests/regional-weather-trade-authority.test.ts',
  'tests/regional-weather-trade.test.ts',
  'tests/regional-weather.test.ts',
];
const documented=[...readFileSync('EXPERIMENTAL-PREVIEW.md','utf8').matchAll(/^- (tests\/[^\n]+\.test\.ts)$/gm)].map(m=>m[1]).sort();
assert.deepEqual(documented,[...excluded].sort(),'Review exclusions changed; reconcile the safe runner before running');
const all=readdirSync('tests').filter(f=>f.endsWith('.test.ts')).map(f=>'tests/'+f).sort();
for(const file of excluded)assert(all.includes(file),'Missing held-file entry: '+file);
const files=all.filter(f=>!excluded.includes(f));
assert(files.length>0,'No permitted test files selected');
console.log(`Running ${files.length} test files; ${excluded.length} held files excluded. This is not a full aggregate pass.`);
const result=spawnSync(process.execPath,['--experimental-strip-types','--test',...files],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
