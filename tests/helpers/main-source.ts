import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';

/** Extract one complete production function without accidentally including later handlers. */
export function mainFunction(source:string,name:string):string {
 const start=source.indexOf('function '+name+'(');assert(start>=0,`production function ${name}`);
 for(let end=source.indexOf('\n',start);end>=0;end=source.indexOf('\n',end+1)){
  const text=source.slice(start,end);
  try{new Function(stripTypeScriptTypes(text,{mode:'strip'}));return text;}catch{}
 }
 throw new Error('Unterminated production function '+name);
}

/**
 * These legacy scenarios run the original course/live sentry with no restoration
 * attempt. Load the actual production initial state so new worker/lifecycle
 * dependencies are present; do not replace any restoration behavior with stubs.
 */
export function restorationInitialState(source:string):string {
 const collision=source.match(/^let restorationCollisionSignature=.*$/m)?.[0];
 const practice=source.match(/^let restorationView:.*$/m)?.[0];
 assert(collision&&practice,'production restoration state declarations');
 const contact=source.match(/^let contactPractice=.*$/m)?.[0];assert(contact,'production contact course state');
 return collision+'\n'+practice+'\n'+contact+"\nlet contactGeometryKey='';\n";
}
