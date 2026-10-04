import {createWorkbenchHandler,type WorkbenchRequest} from './system-workbench-protocol.ts';
const handle=createWorkbenchHandler();
self.onmessage=(event:MessageEvent<WorkbenchRequest>)=>self.postMessage(handle(event.data));
