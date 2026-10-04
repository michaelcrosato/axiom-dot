import type {StaffAttack} from './combat.ts';
/** Visible energy-sector boundary uses the same range and full front arc as hit authority. */
export function staffSectorPoints(attack:Readonly<StaffAttack>,segments=32){return Array.from({length:segments+1},(_,i)=>{const phi=-attack.arc/2+attack.arc*i/segments;return {x:Math.sin(phi)*attack.range,y:.85,z:Math.cos(phi)*attack.range};});}
