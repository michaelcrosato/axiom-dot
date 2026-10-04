import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindMenuNavigation,MENU_SECTIONS,menuSection} from '../src/menu-navigation.ts';
import {keyboardAction} from '../src/controls.ts';

function menuFixture(){
 const buttons=MENU_SECTIONS.map(id=>({dataset:{menuSection:id},attributes:{} as Record<string,string>,onclick:null as null|(()=>void),setAttribute(key:string,value:string){this.attributes[key]=value;}}));
 const pages=MENU_SECTIONS.map(id=>({dataset:{menuPage:id},hidden:false}));
 const panel={dataset:{} as Record<string,string>,scrollTop:123,querySelectorAll(query:string){return query==='[data-menu-section]'?buttons:pages;}};
 bindMenuNavigation(panel as unknown as HTMLElement);return {buttons,pages,panel};
}
test('menu starts with Play and reveals exactly one group without losing handlers',()=>{
 const {buttons,pages,panel}=menuFixture();assert.equal(panel.dataset.menuSection,'play');assert.equal(panel.scrollTop,0);
 for(const button of buttons){button.onclick!();assert.deepEqual(pages.filter(p=>!p.hidden).map(p=>p.dataset.menuPage),[button.dataset.menuSection]);assert.deepEqual(buttons.filter(b=>b.attributes['aria-pressed']==='true'),[button]);}
 buttons[0]!.onclick!();buttons[0]!.onclick!();assert.equal(pages.filter(p=>!p.hidden).length,1);
});
test('invalid menu routes default safely; M respects text fields and Escape still dismisses',()=>{
 assert.equal(menuSection('invalid'),'play');assert.equal(menuSection(undefined),'play');assert.equal(keyboardAction('KeyM'),'map');assert.equal(keyboardAction('KeyM',true),undefined);assert.equal(keyboardAction('Escape',true),'close');
});
test('menu sections preserve fixed touch actions and visible reset confirmation entry points',()=>{
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 for(const section of MENU_SECTIONS){assert.match(main,new RegExp(`data-menu-section="${section}"`));assert.match(main,new RegExp(`data-menu-page="${section}"`));}
 for(const id of ['map-settings','fresh-settings','restore-reset-settings','export-reset-settings','resume-settings']){assert.ok(main.includes(`id="${id}"`));assert.ok(main.includes(`$('${id}').onclick=`));}
 assert.match(main,/mapPanelDispose\?\.\(\);mapPanelDispose=null/);assert.match(main,/clearInput\(\);if\(!panel.hidden&&panel.dataset.type===type\)/);
 assert.match(css,/\.actions #interact-btn\{grid-area:1\/1\}/);assert.match(css,/\.actions #jump-btn\{grid-area:2\/2\}/);assert.match(css,/\[data-menu-page\]\[hidden\]\{display:none\}/);
});
