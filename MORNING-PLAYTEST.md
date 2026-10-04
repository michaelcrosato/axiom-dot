# AXIOM: a short desktop playtest

Start by exporting your current save from Settings. Use the isolated lab first, so you can judge movement and combat without spending campaign resources.

If Settings says saving is paused because a rollback checkpoint is invalid, keep both **Export save** and **Export last stored checkpoint** before reloading. Play can continue for the session, but it is not being saved. The stored checkpoint export preserves its original bytes.

## 1. Movement and combat

Open **Settings → Developer lab → Enter isolated lab**, then reopen **Tune / report → Start live sentry practice**.

Face the quadruped with movement. Watch its amber warning: sidestep, jump with Space, or time G to intercept one front strike. F attacks can interrupt it; the nearby solid wall is cover. Q/R only orbit the camera. Let one attempt fail so you can read the warning, then use **Reset live sentry** for fresh practice health and stamina. **Resume** handles interruptions; **Capture next 2 seconds** records real frames for inspection. These attempts do not spend campaign supplies or award progress.

Then choose **Stop · return to course**. Choose a station and press **Reset & practice**.

- **Run & brake / Reverse direction:** move with WASD, sprint with Shift, then release or reverse. Look for planted feet, readable braking and a clean turn rather than skating
- **Jump & landing / Jump ceiling:** press Space. Look for one responsive jump, a grounded landing and no head or staff poking through the ceiling. Holding Jump should not repeatedly jump
- **Slide into crawl:** run, then hold C. Look for a slide settling into a crawl, with the character staying low if the ceiling prevents standing
- **1–2–3 combo / Whiff & recovery / Solid-wall protection:** use F. Look for three distinct contact beats, real recovery after a miss and no damage through the wall

For a repeatable comparison, choose **3 runs → Run all nine scenarios**. Keep the tab focused. Use **Capture selected station** to save real rendered frames, then export the contact sheet and report. Rate visual quality yourself; a model check is not a visual pass.

**Reset:** Reset & practice rebuilds that station. **Return to campaign** restores the captured campaign state. Lab equipment and tuning stay in the lab.

The guard costs 22 stamina. A rear or late strike should still hit. Try the same counterplay in the valley after you are comfortable with the disposable practice round.

## 2. Co-op

Open **Settings → Host or join**. Start or resume an expedition, move, jump, open a menu, then leave and return to solo.

**Check:** online movement continues while menus are open; the expedition saves separately; returning to solo restores the solo checkpoint. Reloading should resume saved progress, not reset the expedition.

For the four-person pass, each friend needs their own account with permission to open this private Site, plus the room code. That sharing decision is still pending. Once access is arranged, check that everyone sees the same enemy/material changes exactly once, health remains individual, and only the host changes shared equipment after everyone finishes their combat commitment.

**Repeat:** resume the same room. Export a save before deliberately testing destructive world changes.

## 3. Follow a real world consequence

Use a connected world for these systems. Keep your original save in its separate slot.

- **Cave:** enter the natural cave and inspect its dry-bank controls. A paid valve, pump or drain repair should lower measured water depth and open a physically blocked route
- **Households:** connect the cave outfall for 2 scrap. Watch the Living frontier's depot, carrier cargo and household receipts. Newly discharged water should reach homes through actual carrier trips
- **Barter:** at a household's gold flag, exchange a 4 L canister for existing communal repair scrap when its reserve is below 6 L. The exchange history should show both transfers. Taking that stock can leave builders unable to repair a workshop until you fund it yourself
- **Recurring needs:** after real relief to at least 8 L, residents must consume at least 5 L and leave less than 3 L before a fresh request can appear. Open Recurring water relief, accept at the flag, and make a new delivery before its deadline. Close solo menus to let time advance. Rewards come from the original finite town budget, so they cannot be farmed endlessly
- **Equipment:** preview A/B grip, shaft and head choices in the workbench. Invalid sockets should be explained; assembly should recycle the old staff and charge the new exact cost. Preview and comparison should spend nothing

**Repeat:** export before changes, then reload that compatible checkpoint for another route through the same seed. Developer lab's repeated world-system checks provide a disposable model comparison without changing your campaign.

## What still needs your eyes and ears

The code, save ledgers, input handlers, collision models and four-client server flows have been checked. Actual rendered appearance, sound, real-device performance and a hosted four-human session have not been inspected or played. The preview route was blocked. Mobile layout and touch ergonomics remain for your planned morning pass.

The larger 17-domain vision is still unfinished; these are bounded, connected gameplay systems. General crowds, unbounded regions and full simulation-worker architecture remain open.
