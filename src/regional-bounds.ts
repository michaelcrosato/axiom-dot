/** Regional capsule center domain: physical radius plus the existing Rapier skin.
 * This only constrains the world perimeter; interior collision remains Rapier's. */
export const REGIONAL_PLAYER_RADIUS=.32;
export const REGIONAL_PLAYER_SKIN=.02;
export const REGIONAL_PLAYER_MARGIN=REGIONAL_PLAYER_RADIUS+REGIONAL_PLAYER_SKIN;
const float32=new Float32Array(1),bits=new Uint32Array(float32.buffer);
/** Largest float32 center limit no farther out than bound-radius-skin. Returning
 * an inward-rounded limit keeps authority, saved poses and native Rapier equal. */
export function regionalBodyCenterBound(bound:number,halfExtent:number,skin=REGIONAL_PLAYER_SKIN):number{
 if(![bound,halfExtent,skin].every(Number.isFinite)||halfExtent<=0||skin<0||bound<=halfExtent+skin)throw new RangeError('Invalid regional body bound');
 const exact=bound-halfExtent-skin;float32[0]=exact;if(float32[0]!>exact)bits[0]=bits[0]!-1;return float32[0]!;
}
export function regionalCenterBound(bound:number):number{return regionalBodyCenterBound(bound,REGIONAL_PLAYER_RADIUS);}
export function clampRegionalCoordinate(value:number,bound:number):number{
 if(!Number.isFinite(value))throw new RangeError('Invalid regional coordinate');
 const limit=regionalCenterBound(bound);return Math.max(-limit,Math.min(limit,value));
}
