/** Read-only explanations for the existing campaign control gates. No work or payment is granted here. */
export interface CampaignControlReadiness {
 reloading:boolean;loadFailed:boolean;lab:boolean;connecting:boolean;online:boolean;canAct:boolean;
 closed:boolean;paused:boolean;hostOnly:boolean;host:boolean;valley:boolean;alive:boolean;
 physicsReady:boolean;transitioning:boolean;staffBusy:boolean;contactBusy:boolean;crouched:boolean;grounded:boolean;onTerrain:boolean;
}
export function campaignControlBlockReason(s:CampaignControlReadiness):string|null {
 if(s.loadFailed)return 'The saved world could not be loaded. Reopen the world before using campaign controls.';
 if(s.reloading)return 'The world is reloading. Wait for the current world to open.';
 if(s.lab)return 'Return to your campaign before using these shared stores.';
 if(s.connecting)return 'Connecting to the shared world. Wait for its current state.';
 if(s.online&&!s.canAct)return s.closed?'This room is closed. Return to solo or join an open room.':s.paused?'The shared world is paused. Wait for the host to return.':'Connection interrupted. Wait for the current shared state before retrying.';
 if(s.online&&s.hostOnly&&!s.host)return 'Only the host can manage these shared materials. Ask the host to use this control.';
 if(!s.valley)return 'Return to the valley to use this control.';
 if(!s.alive)return 'Recover your suit before using this control.';
 if(!s.physicsReady||s.transitioning)return 'Terrain is still preparing. Wait for the world transition to finish.';
 if(s.staffBusy)return 'Lower your staff and finish the attack or guard recovery.';
 if(s.contactBusy)return 'Release the crate or ledge before using this control.';
 if(s.crouched)return 'Stand upright before using this control.';
 if(!s.grounded||!s.onTerrain)return 'Stand on the ground beside this control.';
 return null;
}
export interface CampaignTargetReadiness {available:boolean;near:boolean;level:boolean;confirmed:boolean;clear:boolean;label:string}
export function campaignTargetBlockReason(s:CampaignTargetReadiness):string|null {
 if(!s.available)return 'This target is no longer available. Select a current target and try again.';
 if(!s.near)return `Walk to ${s.label}; the control must be within 3.5 metres.`;
 if(!s.level)return `Stand on the ground beside ${s.label}.`;
 if(!s.confirmed)return `Terrain at ${s.label} is still loading. Wait for collision confirmation.`;
 if(!s.clear)return `A solid obstacle blocks ${s.label}. Walk around it to reach the control.`;
 return null;
}
export const CAMPAIGN_ACTION_READINESS_ENGINE=Object.freeze({kind:'axiom-campaign-action-readiness',control:campaignControlBlockReason,target:campaignTargetBlockReason});
