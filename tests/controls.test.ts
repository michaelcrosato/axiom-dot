import {test} from 'node:test';import assert from 'node:assert/strict';import {FloatingStick} from '../src/controls.ts';
test('left-side floating origin, deadzone and analog strength',()=>{const s=new FloatingStick();assert.equal(s.begin(1,100,200,400),true);s.move(1,104,200);assert.deepEqual(s.value,{x:0,z:0});s.move(1,133,200);assert.equal(s.value.x,.5);s.move(1,158,258);assert.ok(Math.abs(Math.hypot(s.value.x,s.value.z)-1)<1e-12);});
test('right actions, UI and other fingers do not steal or release movement',()=>{const s=new FloatingStick();assert.equal(s.begin(2,300,200,400),false);assert.equal(s.begin(2,10,10,400,false),false);s.begin(1,100,200,400);assert.equal(s.begin(2,50,200,400),false);assert.equal(s.move(2,150,200),false);assert.equal(s.end(2),false);assert.equal(s.pointerId,1);s.end(1);assert.equal(s.pointerId,null);});
test('release, cancel and lifecycle reset leave zero movement and permit new origin',()=>{const s=new FloatingStick();s.begin(3,0,0,400);s.move(3,58,0);s.reset();assert.deepEqual(s.value,{x:0,z:0});assert.equal(s.move(3,100,0),false);assert.equal(s.begin(4,140,400,400),true);assert.deepEqual(s.origin,{x:140,y:400});});

import {GameplayPointers,keyboardAction,hasTouchControls,KEY_ACTIONS} from '../src/controls.ts';
import {readFileSync} from 'node:fs';
test('touch feature detection covers wide tablets and hybrid devices regardless of CSS viewport',()=>{
 assert.equal(hasTouchControls(5,false),true);assert.equal(hasTouchControls(0,true),true);assert.equal(hasTouchControls(0,false),false);
});
test('two thumbs independently move and orbit; UI cannot steal capture',()=>{
 const p=new GameplayPointers();assert.ok(p.begin(1,50,200,800,'touch',0,true));p.move(1,108,200);
 assert.ok(p.begin(2,650,200,800,'touch',0,true));const r=p.move(2,675,220);assert.equal(r.orbit,-.2);assert.equal(p.stick.value.x,1);
 assert.equal(p.begin(3,100,200,800,'touch',0,true),false);assert.equal(p.begin(4,100,200,800,'touch',0,false),false);
 p.end(3);assert.equal(p.orbitId,2);assert.equal(p.stick.pointerId,1);p.end(2);assert.equal(p.orbitId,null);assert.equal(p.stick.value.x,1);
 p.end(1);assert.deepEqual(p.stick.value,{x:0,z:0});
});
test('panels, loading, cancellation and lifecycle reset cannot leave stale touch motion',()=>{
 const p=new GameplayPointers();assert.equal(p.begin(1,30,40,400,'touch',0,false),false);assert.equal(p.begin(1,250,40,400,'touch',0,false),false);
 p.begin(1,30,40,400,'touch',0,true);p.begin(2,300,40,400,'touch',0,true);p.move(1,100,40);p.reset();
 assert.equal(p.orbitId,null);assert.equal(p.stick.pointerId,null);assert.equal(p.move(2,350,40).handled,false);assert.deepEqual(p.stick.value,{x:0,z:0});
 assert.equal(p.begin(3,200,40,400,'mouse',0,true),false);assert.equal(p.begin(3,200,40,400,'mouse',2,true),true);p.end(3);
});
test('keyboard actions do not consume native button Space or typed input; Escape still closes',()=>{
 for(const key of Object.keys(KEY_ACTIONS)){assert.equal(keyboardAction(key,true),key==='Escape'?'close':undefined);}
 assert.equal(keyboardAction('KeyC'),'crouch');assert.equal(keyboardAction('KeyF'),'pulse');assert.equal(keyboardAction('KeyG'),'guard');assert.equal(keyboardAction('KeyE'),'interact');assert.equal(keyboardAction('Space'),'jump');assert.equal(keyboardAction('KeyX'),undefined);
});
test('touch action coverage contract: contextual prompt is a button, every keyboard command has a touch route',()=>{
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.match(main,/<button id="interact" class="interact"/);assert.match(main,/\$\('interact'\)\.onclick=interact/);
 for(const id of ['interact-btn','attack-btn','guard-btn','build-menu','journal','settings','fullscreen-toggle','camera-settings','camera-back','orbit-left','orbit-right','zoom-in','zoom-out','camera-done','camera-reset','auto-pulse-toggle','journal-settings','build-settings','export','import','save-panel','reload-save','legacy-request','legacy-deliver']){
  assert.ok(main.includes(`id="${id}"`),`${id} rendered`);assert.ok(main.includes(`$('${id}').onclick=`),`${id} has tap handler`);
 }
 for(const id of ['crouch-btn','jump-btn']){assert.ok(main.includes(`id="${id}"`),`${id} rendered`);assert.ok(main.includes(`bindHoldButton($('${id}')`),`${id} has hold binding`);assert.ok(!main.includes(`$('${id}').onclick=`),`${id} is not a click toggle`);}
 assert.match(main,/\.close'\)!\.onclick=closePanel/);assert.match(main,/pointers\.begin\(.*panel.hidden&&!activeConversation&&physicsReady&&!transitioning/);
 assert.doesNotMatch(main,/addEventListener\('touchstart'/);assert.doesNotMatch(main,/Use F to release/);assert.doesNotMatch(main,/id="(?:sprint-btn|save-btn|camera-menu)"/);assert.doesNotMatch(main,/<div class="brand">/);assert.match(main,/settings-brand/);assert.match(main,/requestFullscreen\(\{navigationUI:'hide'\}\)/);assert.match(main,/fullscreenchange/);assert.match(main,/fullscreenerror/);
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');assert.match(css,/\.interact\{pointer-events:auto;min-height:48px/);assert.match(css,/any-pointer:coarse/);assert.match(css,/\.touch-ui \.actions/);
});


test('right-area pinch never steals the movement thumb and resumes orbit without a jump',()=>{
 const p=new GameplayPointers();p.begin(1,60,200,800,'touch',0,true);p.move(1,118,200);
 p.begin(2,550,200,800,'touch',0,true);p.begin(3,650,200,800,'touch',0,true);
 assert.equal(p.pinching,true);assert.deepEqual(p.pointerIds,[1,2,3]);
 const gesture=p.move(3,750,200);assert.equal(gesture.zoomRatio,.5);assert.equal(gesture.orbit,0);assert.equal(p.stick.value.x,1);
 assert.equal(p.begin(4,700,300,800,'touch',0,true),false);p.end(4);assert.equal(p.pinching,true);
 p.end(2);assert.equal(p.pinching,false);assert.equal(p.orbitId,3);assert.equal(p.move(3,750,200).orbit,0);assert.equal(p.move(3,775,200).orbit,-.2);
 assert.equal(p.stick.value.x,1);p.end(3);assert.equal(p.stick.pointerId,1);p.end(1);assert.deepEqual(p.pointerIds,[]);
});
test('crossing halves never reassigns a pointer; close pinches, cancellation and reset stay finite',()=>{
 const p=new GameplayPointers();p.begin(1,390,200,800,'touch',0,true);p.move(1,700,200);
 p.begin(2,500,200,800,'touch',0,true);assert.equal(p.pinching,false);p.move(2,100,200);assert.equal(p.stick.pointerId,1);
 p.begin(3,500,200,800,'touch',0,true);assert.equal(p.pinching,true);assert.ok(Number.isFinite(p.move(3,100,200).zoomRatio));assert.equal(p.move(2,101,200).zoomRatio,1);
 p.reset();assert.deepEqual(p.pointerIds,[]);assert.equal(p.move(3,800,200).handled,false);assert.equal(p.pinching,false);
 assert.equal(p.begin(9,500,200,800,'touch',0,false),false);p.begin(10,200,200,800,'mouse',2,true);assert.equal(p.begin(11,600,200,800,'touch',0,true),false);
});
