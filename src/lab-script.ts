/** Small, renderer/model-independent scripts executed on the authoritative worker clock. */
export interface ScriptInput{x:number;z:number;crouch?:boolean;jump?:boolean;attack?:boolean;stun?:boolean;cancel?:boolean}
export const LAB_SCRIPTS:Record<string,{seconds:number;input:(tick:number)=>ScriptInput}>={
 'run-brake':{seconds:2.5,input:t=>({x:t<90?1:0,z:0})},
 turn:{seconds:2.8,input:t=>({x:t<65?1:t<130?-1:0,z:0})},
 jump:{seconds:2.5,input:t=>({x:0,z:0,jump:t>=15&&t<65})},
 ceiling:{seconds:1.5,input:t=>({x:0,z:0,jump:t>=12&&t<35})},
 'slide-crawl':{seconds:5,input:t=>({x:t<255?1:0,z:0,crouch:t>=35&&t<255})},
 combo:{seconds:3.6,input:()=>({x:0,z:0,attack:true})},
 whiff:{seconds:3.6,input:()=>({x:0,z:0,attack:true})},
 occlusion:{seconds:3.6,input:()=>({x:0,z:0,attack:true})},
 interrupt:{seconds:2.4,input:t=>({x:0,z:0,attack:t===3||t===55,cancel:t===5,stun:t===58})},
};
export function knownLabScript(id:unknown):id is string{return typeof id==='string'&&Object.hasOwn(LAB_SCRIPTS,id);}
