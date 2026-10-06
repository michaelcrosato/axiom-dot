import {createRegionalState,enableStartingTown,applyAction,worldTownSupplySources,type State} from '../../src/world.ts';
import {townSupplyPosition,type TownSupplyCommand} from '../../src/town-supply.ts';
export function townSupplyWorld(seed=73129){return enableStartingTown(createRegionalState(seed));}
export function supplyCommand(s:State,kind:TownSupplyCommand['kind'],index=0):TownSupplyCommand {return {kind,targetId:kind==='load'?worldTownSupplySources(s)[index]!.id:'workshop',expectedRevision:s.townSupply?.revision??0};}
export function atSupply(s:State,kind:TownSupplyCommand['kind'],index=0):State {const p=townSupplyPosition(s.seed,worldTownSupplySources(s),supplyCommand(s,kind,index))!;return {...s,player:{...s.player,x:p.x,z:p.z}};}
export function loadSupply(s:State,count:number):State {for(let i=0;i<count;i++){const sources=worldTownSupplySources(s),index=sources.findIndex(o=>!s.collected.includes(o.id));s=atSupply(s,'load',index);s=applyAction(s,{type:'town-supply',command:supplyCommand(s,'load',index)});}return s;}
