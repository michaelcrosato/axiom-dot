/** One same-URL history entry per overlay session: browser Back dismisses it.
 * Reject reopening only while an explicit close's asynchronous back is pending. */
export interface PanelHistory {state:unknown;pushState(data:unknown,unused:string):void;replaceState(data:unknown,unused:string):void;back():void}
const MARKER='axiomPanelOpen';
function stateObject(state:unknown):Record<string,unknown>{return state&&typeof state==='object'&&!Array.isArray(state)?{...state}:{};}
export function createPanelNavigation(history:PanelHistory,onBack:()=>void){
 let open=false,closing=false;
 const initial=stateObject(history.state);if(initial[MARKER]){delete initial[MARKER];history.replaceState(initial,'');}
 return {
  get blocked(){return closing;},
  enter(){if(closing)return false;if(!open){try{history.pushState({...stateObject(history.state),[MARKER]:true},'');open=true;}catch{/* Embedded views can deny history; Close/Escape still work. */}}return true;},
  dismiss(){if(!open)return;open=false;if(stateObject(history.state)[MARKER]){closing=true;try{history.back();}catch{closing=false;const next=stateObject(history.state);delete next[MARKER];history.replaceState(next,'');}}},
  popped(){const dismiss=open;open=false;closing=false;if(dismiss)onBack();},
  resume(){closing=false;if(!stateObject(history.state)[MARKER])open=false;},
 };
}
