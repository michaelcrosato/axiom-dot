import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCoop,type CoopEnv} from '../../server/coop-api.ts';
import type {CoopRoom} from '../../server/coop-authority.ts';
import type {D1Database,D1Statement} from '../../server/coop-store.ts';
import type {CoopAction,CoopMove,CoopSnapshot} from '../../src/coop-protocol.ts';
import type {State} from '../../src/world.ts';

export type FoodHandler=(request:Request,env:CoopEnv,now:number)=>Promise<Response|null>;
/** Actual TCP HTTP and SQLite. The fixture is the trusted platform identity
 * boundary; production client input never chooses a player or inventory owner. */
export async function foodHttpFixture(handler:FoodHandler=handleCoop){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../../drizzle',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../../drizzle/${file}`,import.meta.url),'utf8'));
 let now=1_800_000_000_000,origin='',conflicts=0,pause:undefined|{arrived:()=>void;gate:Promise<void>};
 const DB:D1Database={prepare(sql){let values:unknown[]=[];const statement:D1Statement={bind(...args){values=args;return statement;},async first<T>(){return (sqlite.prepare(sql).get(...values as never[])??null) as T|null;},async all<T>(){return {results:sqlite.prepare(sql).all(...values as never[]) as T[]};},async run(){if(sql.startsWith('UPDATE axiom_coop_rooms')&&pause){const p=pause;pause=undefined;p.arrived();await p.gate;}const result=sqlite.prepare(sql).run(...values as never[]),changes=Number(result.changes);if(sql.startsWith('UPDATE axiom_coop_rooms')&&!changes)conflicts++;return {success:true,meta:{changes}};}};return statement;}};
 const server=createServer(async(req,res)=>{
  try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);const body=Buffer.concat(chunks).toString('utf8'),response=await handler(new Request(`${origin}${req.url}`,{method:req.method,headers,...(body?{body}:{})}),{DB},now);res.writeHead(response?.status??404,Object.fromEntries(response?.headers??[]));res.end(await response?.text());}catch(error){res.writeHead(500);res.end(String(error));}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address==='object');origin=`http://127.0.0.1:${address.port}`;
 const raw=async(user:string,path:string,body?:unknown,extra:Record<string,string>={})=>{const response=await fetch(`${origin}/api/coop${path}`,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':user,Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json(),headers:response.headers};};
 const stored=(id:string):CoopRoom=>JSON.parse(String(sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(id)!.body));
 const replace=(room:CoopRoom)=>sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(room),room.id);
 const hold=()=>{assert.equal(pause,undefined);let release=()=>{},arrived=()=>{};const gate=new Promise<void>(r=>{release=r;}),waiting=new Promise<void>(r=>{arrived=r;});pause={arrived,gate};return {release,waiting};};
 return {raw,stored,replace,hold,origin,conflicts:()=>conflicts,time:()=>now,advance:(ms:number)=>{now+=ms;},stop:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));sqlite.close();}};
}
export type FoodFixture=Awaited<ReturnType<typeof foodHttpFixture>>;
export type FoodPeer={user:string;s:CoopSnapshot};
export async function foodExpedition(f:FoodFixture,world:State,count=4){const created=await f.raw('host','/rooms',{name:'Host',world});assert.equal(created.status,201,JSON.stringify(created.body));const peers:FoodPeer[]=[{user:'host',s:created.body}];for(let i=1;i<count;i++){const joined=await f.raw(`guest-${i}`,'/join',{name:`Guest ${i}`,code:created.body.code});assert.equal(joined.status,200,JSON.stringify(joined.body));peers.push({user:`guest-${i}`,s:joined.body});}return peers;}
export async function foodInput(f:FoodFixture,p:FoodPeer,actions:CoopAction[]=[],move?:CoopMove){const result=await f.raw(p.user,`/rooms/${p.s.roomId}/sync`,{seq:p.s.ack+1,sessionId:p.s.sessionId,actions,...(move?{move}:{})});assert.equal(result.status,200,JSON.stringify(result.body));p.s=result.body;return p.s;}
export async function foodCurrent(f:FoodFixture,p:FoodPeer){const result=await f.raw(p.user,`/rooms/${p.s.roomId}`);assert.equal(result.status,200,JSON.stringify(result.body));p.s=result.body;return p.s;}
