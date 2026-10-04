import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
import {movementInput} from '../src/locomotion.ts';import {GameplayPointers,keyboardAction} from '../src/controls.ts';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
function harness(){
 const listeners=new Map<string,(event:any)=>void>(),messages:any[]=[],nodes=new Map<string,any>();
 const $=(id:string)=>{if(!nodes.has(id))nodes.set(id,{setAttribute(){},querySelector(){return {textContent:''};}});return nodes.get(id);};
 const functions=main.slice(main.indexOf('function refreshHeldActions()'),main.indexOf('\nlet panelReturnFocus:'));
 const keyboard=main.slice(main.indexOf("addEventListener('keydown',"),main.indexOf("canvas.addEventListener('wheel',"));
 const source=`const state={regional:false,zone:'valley',player:{hp:100}};const labActive=false,livePractice=null;const coop={active:false,canAct:true,setSuspended(){}},coopPending=false;let coopJumpHeld=false,contactRequestId=null;const keys=new Set(),pointers=new GameplayPointers(),stick=pointers.stick;let crouch=false,jump=false,heldCrouch=false,heldJump=false,physicsReady=true,transitioning=false,windowActive=true,inputMode='desktop',orbit=0;const panel={hidden:true},document={hidden:false},touchButtons={reset(){}},crouchHold={reset(){}},jumpHold={reset(){}},canvas={hasPointerCapture(){return false}};let attacks=0;function cancelGuardInput(){}function pressGuard(){}function attack(){attacks++}function interact(){}function persist(){}function openPanel(){panel.hidden=false;clearInput()}function closePanel(){panel.hidden=true;clearInput()}${functions}${keyboard}return {pointers,panel,setTouch(c,j){heldCrouch=c;heldJump=j;refreshHeldActions()},get(){return {crouch,jump,attacks}},sendMovement,clearInput};`;
 const api=new Function('$','sendPhysics','addEventListener','movementInput','GameplayPointers','keyboardAction',stripTypeScriptTypes('function run(){const activeConversation=null;function closeConversation(){}const startup={playing:true,initialized:true,failed:false,detail(){},fail(){},cleanup(){}};'+source+'}',{mode:'strip'})+';return run();')($,(m:any)=>messages.push(m),(name:string,fn:any)=>listeners.set(name,fn),movementInput,GameplayPointers,keyboardAction);
 const key=(type:string,code:string,extra={})=>listeners.get(type)!({code,repeat:false,target:{closest:()=>null},preventDefault(){},...extra});
 return {api,messages,key};
}
test('production held actions aggregate keyboard and touch while preserving analog movement',()=>{
 const h=harness();h.api.pointers.begin(1,50,100,800,'touch',0,true);h.api.pointers.move(1,108,100);
 h.api.setTouch(true,false);assert.equal(h.messages.at(-1).x,1);assert.equal(h.messages.at(-1).crouch,true);
 h.key('keydown','Space');assert.equal(h.messages.at(-1).jump,true);assert.equal(h.messages.at(-1).crouch,true);assert.equal(h.messages.at(-1).x,1);
 h.key('keydown','KeyC');h.api.setTouch(false,false);assert.equal(h.messages.at(-1).crouch,true,'keyboard still holds crouch');
 h.key('keyup','KeyC');assert.equal(h.messages.at(-1).crouch,false);assert.equal(h.messages.at(-1).jump,true);
 h.key('keyup','Space');assert.equal(h.messages.at(-1).jump,false);assert.equal(h.api.get().attacks,0);
 h.key('keydown','KeyF');assert.equal(h.api.get().attacks,1);assert.equal(h.api.pointers.stick.pointerId,1);
});
test('production menu/reset clears all held intents and blocks jump until gameplay resumes',()=>{
 const h=harness();h.key('keydown','KeyW');h.key('keydown','KeyC');h.key('keydown','Space');h.api.setTouch(true,true);
 h.key('keydown','KeyB');assert.equal(h.api.panel.hidden,false);assert.equal(h.messages.at(-1).paused,true);assert.equal(h.messages.at(-1).jump,false);assert.equal(h.messages.at(-1).crouch,false);
 h.key('keydown','Space');h.api.sendMovement();assert.equal(h.messages.at(-1).jump,false);assert.equal(h.messages.at(-1).x,0);assert.equal(h.messages.at(-1).z,0);
 h.key('keydown','Escape');h.api.sendMovement();assert.equal(h.messages.at(-1).jump,false);assert.equal(h.messages.at(-1).crouch,false);
});
test('quick Space press and release send both edges instead of waiting for a render frame',()=>{
 const h=harness();h.key('keydown','Space');h.key('keyup','Space');assert.deepEqual(h.messages.map(m=>m.jump),[true,false]);
 h.key('keydown','Space',{target:{closest:(selector:string)=>selector==='button'?{}:null}});assert.equal(h.messages.length,2,'native button space is left to its own hold or click binding');
});
test('four rendered slots have invariant grid coordinates and contextual actions update labels in place',()=>{
 for(const [id,slot,area] of [['interact-btn','x','1/1'],['attack-btn','y','1/2'],['crouch-btn','b','2/1'],['jump-btn','a','2/2']]){
  assert.ok(main.includes(`id="${id}" data-slot="${slot}"`));
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');assert.ok(css.includes(`.actions #${id}{grid-area:${area}}`));
 }
 const context=main.slice(main.indexOf('function updateContextControls()'),main.indexOf('function updateAutoPulseUI()'));
 assert.match(context,/interactButton\.querySelector\('\.action-title'\)!\.textContent=label/);assert.doesNotMatch(context,/innerHTML|style\.display|remove\(/);
 assert.match(main,/shadow\.position\.set\(player\.position\.x,supportY\+\.04,player\.position\.z\)/);
 assert.match(main,/targetPosition\.set\(m\.x,m\.feetY/);
});
