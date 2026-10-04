import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFileSync} from 'node:fs';
test('all bounded pack history caps plus a numeric allowance stay below 95 KB while the regional importer retains an explicit 12 MB ceiling',()=>{
 const result=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types',new URL('../scripts/water-request-size-envelope.mjs',import.meta.url).pathname],{encoding:'utf8'}));
 assert.equal(result.requestPack,9011);assert.equal(result.full,90403);assert.equal(result.conservativeTotal,94499);assert.ok(result.conservativeTotal<95000);assert.ok(result.headroom>5000);
 assert.match(readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),/file\.size>12_000_000/);
});
