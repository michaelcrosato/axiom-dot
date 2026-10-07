/** Fixed disposable course. Heights are metres; existing movement tuning applies.
 * No campaign geometry, clocks, rewards or saved props belong to this fixture. */
export const CONTACT_COURSE={
 version:2,spawn:{x:-5,z:-5},bound:18,
 obstacles:[
  {x:-8,y:.15,z:0,hx:2,hy:.15,hz:1},
  {x:0,y:1.2,z:0,hx:1.8,hy:1.2,hz:2},
  {x:7,y:1.2,z:0,hx:1.8,hy:1.2,hz:2},
  {x:7,y:3.8,z:0,hx:2,hy:.2,hz:2.5},
  {x:-5,y:1.4,z:7,hx:.15,hy:1.4,hz:2},
 ],
 movable:[{id:'course-crate',x:-8,y:.57,z:-5,hx:.58,hy:.55,hz:.58}],
 stations:[['0.30 m · STEP UP / DOWN',-8,0],['2.40 m · HANG / PULL UP / LOWER',0,0],['BLOCKED HEAD / LANDING',7,0],['1.10 m · CRATE PUSH / PULL / CLIMB / JUMP',-8,-5],['PULL BACKING WALL',-5,7]] as const,
};
export const CONTACT_GUIDE='Solo only. Keyboard: WASD/arrows move, Space jumps, E grips or releases, C crouches/drops. Touch: use the existing Move, Jump, Crouch and contextual X action. Grip from the crate side, then move toward/away to push/pull. While gripping close to a low crate, press Jump to hand-climb onto it. For a free jump, release the grip and jump toward it; walk off to step down and land. The 0.30 m step uses supported auto-step. Jump toward a tall ledge and tap action to catch; release Jump then press it again to pull up. Releasing the action button keeps the hang; tap again or Crouch to drop. To climb down a crate or lower from a tall ledge, stand about 0.45 m inside its edge, move outward and tap action. Crate descent ends on supported ground; tall lowering ends in a hang. Obstructed or unsupported paths are refused. Menus pause; interruptions release into collision-tested gravity. Co-op props and ledge traversal are unavailable.';
