import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createRegionalState,enableRegionalSupply,applyAction,validateSave} from '../src/world.ts';
import {regionalSupplyPlan,regionalSupplyAvailable} from '../src/regional-supply.ts';
import {gatherRegionalSupplyMaterials} from '../src/regional-supply-lab.ts';

/** Exercise the actual built ESM Worker directly with Request/Response and SQLite.
 * No browser, production URL, outgoing request or site authentication is used. */
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'dist/client');
const worker=(await import(pathToFileURL(resolve(root,'dist/server/index.js')).href)).default;
assert.equal(typeof worker.fetch,'function');
const files:string[]=[];function walk(path:string){for(const entry of readdirSync(path,{withFileTypes:true})){const child=resolve(path,entry.name);if(entry.isDirectory())walk(child);else files.push(child);}}walk(dist);
let assetBytes=0;const verified:string[]=[];
for(const file of files){const url='/'+relative(dist,file).split('\\').join('/'),bytes=readFileSync(file),request=new Request('https://fixture.invalid'+url),response=await worker.fetch(request,{});
 assert.equal(response.status,200,url);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes,url);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 const etag='"'+createHash('sha256').update(bytes).digest('hex')+'"';assert.equal(response.headers.get('etag'),etag);
 const cached=await worker.fetch(new Request(request,{headers:{'If-None-Match':etag}}),{});assert.equal(cached.status,304);
 const head=await worker.fetch(new Request(request,{method:'HEAD'}),{});assert.equal(head.status,200);assert.equal(await head.text(),'');verified.push(url);assetBytes+=bytes.length;
}
assert.equal((await worker.fetch(new Request('https://fixture.invalid/missing-asset'),{})).status,404);
const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(resolve(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(resolve(root,'drizzle',file),'utf8'));
const DB={prepare(sql:string){let values:any[]=[];return {bind(...next:any[]){values=next;return this;},async first(){return sqlite.prepare(sql).get(...values)??null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){const result=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}};}};}};
async function request(path:string,body?:unknown,user='build-verification-host'){
 const response=await worker.fetch(new Request('https://fixture.invalid/api/coop'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://fixture.invalid','oai-authenticated-user-id':user,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),{DB});return {status:response.status,body:await response.json() as any};
}
let world=enableRegionalSupply(createRegionalState(73129));const outpost=regionalSupplyPlan(world.seed).outposts[0]!;world=gatherRegionalSupplyMaterials(world,outpost.deliveryPosition,outpost.cost).state;world=applyAction(world,{type:'move',x:outpost.deliveryPosition.x,z:outpost.deliveryPosition.z});
const created=await request('/rooms',{name:'Build verification',world});assert.equal(created.status,201,JSON.stringify(created.body));let snapshot=created.body;
for(const [index,type]of (['deliver','build'] as const).entries()){
 const command={seq:index+1,sessionId:snapshot.sessionId,actions:[{type:'regional-supply',command:{type,outpostId:outpost.id,expectedRevision:snapshot.world.frontierSupply.revision}}]};
 const accepted=await request(`/rooms/${snapshot.roomId}/sync`,command);assert.equal(accepted.status,200,JSON.stringify(accepted.body));snapshot=accepted.body;assert.equal(snapshot.world.frontierSupply.revision,index+1);assert(validateSave(snapshot.world));
 const replay=await request(`/rooms/${snapshot.roomId}/sync`,command);assert.equal(replay.status,200);assert.equal(replay.body.world.frontierSupply.revision,index+1);
}
assert.deepEqual(regionalSupplyAvailable(snapshot.world.frontierSupply,snapshot.world.wilderness),{wood:0,stone:0});assert.notEqual(snapshot.world.frontierSupply.outposts[0].buildStartedAt,null);
assert.equal((await request(`/rooms/${snapshot.roomId}`,undefined,'unrelated-user')).status,404);sqlite.close();
const report={version:1,status:'verified',scope:'Compiled Worker invoked directly with native Request/Response and SQLite; filesystem-exact static assets. No network, browser, device or production-site test.',runtime:process.version,assetFiles:verified,assetBytes,workerBytes:statSync(resolve(root,'dist/server/index.js')).size,workerSha256:createHash('sha256').update(readFileSync(resolve(root,'dist/server/index.js'))).digest('hex'),checks:['ESM fetch export','all bundled assets byte-exact','ETag and HEAD','missing asset404','authenticated compiled room creation','compiled delivery and build','sequence replay exact-once','material conservation','unrelated account denied']};
writeFileSync(process.argv[2]?resolve(process.argv[2]):resolve(root,'evidence/regional-supply-compiled-build.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
