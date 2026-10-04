import {DEFAULT_COMBO_TUNING,sanitizeComboTuning,type ComboTuning} from './combat.ts';
import type {EquipmentPlan} from './equipment.ts';
/** Physical length and head focus set the visible energy volume; inertia sets commitment. */
export function equipmentCombat(plan:EquipmentPlan|null):ComboTuning {
 if(!plan)return sanitizeComboTuning(DEFAULT_COMBO_TUNING);
 const s=plan.stats;return sanitizeComboTuning({...DEFAULT_COMBO_TUNING,attacks:DEFAULT_COMBO_TUNING.attacks.map((a,i)=>({...a,name:[`Opening ${plan.spec.head} sweep`,'Reverse sweep','Resonant finisher'][i]!,range:Math.max(.5,s.reach-[.45,.3,0][i]!),prep:a.prep*s.tempo,active:a.active*s.tempo,recovery:a.recovery*s.tempo,damage:Math.round(a.damage*s.damageScale),staminaCost:Math.round(a.staminaCost*s.staminaScale),knockback:a.knockback*Math.min(1.3,s.mass/2+.65)}))});
}
