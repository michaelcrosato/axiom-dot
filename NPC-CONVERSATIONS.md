# Conversations in the world

Approach any of Hearthmere's 100 residents, or any existing named valley worker, within 3.5 metres and with a clear line of sight. Press E or tap the fixed Talk action. Shop signs still open trade services. Conversation requires grounded footing, a lowered staff, no active grip and no outstanding online jump/guard intent.

The world remains visible. The camera eases toward the pair, the speaker turns to the player and continues a restrained idle gesture, and an open lower-third composition shows one short reply. There is no chat window, portrait card stack, log or compulsory exposition. The player's last exact utterance appears above the NPC reply. A small name marker identifies the actual figure. Camera orbit/zoom preferences survive the exchange.

## Player agency

- Eight subjects: the day, work, home/relationships, the past, interests, the town, ambitions, and outlook
- Every subject has two follow-ups and supportive, skeptical, playful and direct responses
- Replies are full player utterances. Four are visible at once, with More replies for the remaining choices
- Press 1–4, use arrow keys/Tab and Enter, or tap a reply. Something else changes subject without repeating the introduction
- Leave or Escape returns immediately. B/J/M or a top game-menu button transfers to the requested menu without creating an extra history entry
- Browser Back, blur, resizing, hiding the page, a world change, danger or lost online readiness safely end the exchange. Held movement/action inputs are cleared

This is local authored/procedural dialogue, not freeform AI or generated speech. Text is deliberately short (up to 240 characters per NPC reply). Personality, current routine, profession, interests, recorded backstory and reciprocal household facts supply the response. The named valley workers use only their actual home, role, workplace and current work status; missing family history is not invented.

## Time, memory and isolation

Solo simulation holds during conversation, with the town scene and visual attention still rendered. Dialogue gestures do not advance campaign time or change NPC collision. In an online expedition the shared world continues; the conversation ends if the actual current-clock resident moves beyond eight metres, the player takes damage, or the connection stops being ready. Other players' clocks and NPC physics are never altered by local dialogue.

People remember the subjects discussed and the last response tone, and recognize a return visit. There is no trust/reputation meter, reward, item grant, promised quest or resource debit. Repeated replies cannot farm progress. Memory version 1 is scoped by world seed and real resident ID, limited to 106 residents per world and four recently used seeds. It is separate from campaign and room saves, in the existing preview-only browser namespace. Invalid/extra fields, IDs, versions, sparse arrays and oversize data are rejected. If storage is unavailable, a four-world in-session cache preserves the current visit until the page closes. Clearing browser data clears these local conversation memories; they do not sync between devices.

## Developer exposure

Menu → Developer laboratory → Systems → Conversation rehearsal lists all 100 residents and each actual named valley worker. This is a clearly labelled disposable model using the production dialogue engine, not a teleport or simulated playthrough.

Seed (0–4294967295, integer) and routine time (0–480 simulation seconds, integer) are typed bounded scenario inputs. Changing them stages a draft; Apply rebuilds the scenario and resets its separate memory. Discard restores applied values; defaults only stage. Select any resident, exercise every subject/reaction, leave and return with memory, or reset memory. The branch inspector includes the exact profile and session. Versioned allowlisted preset import stages only a scenario. Preset/evidence export and clipboard/text fallback record build/source, seed, applied versus draft inputs, profile, context, memory and at most 128 recent actions. No campaign, account, credential or room data is included. Online users must return to solo to enter this isolated tool.

## Verification scope

The focused tests cover all resident identities, branch variation, factual continuity, short copy, deterministic return memory, strict persistence boundaries, no-reward behavior, reply paging/focus/input contracts, camera-space framing and render-only attention. Production main-handler harnesses preserve their old behavior with dialogue inactive and test movement suppression while it is active. Actual emitted dialogue and articulated projection matrices are compared with source. These are numerical/DOM-contract checks, not rendered browser, GPU, real-touch, device performance or aesthetic certification.

The full permitted aggregate is selected from the same exact thirteen exclusions documented in EXPERIMENTAL-PREVIEW.md. Registration-only discovery records every expected case name without executing a test callback; the final actual run must complete the identical case-name multiset with no failed, skipped, canceled or missing tests. No held terminal-clock, browser or registry probes are substituted.

## V9 live motives and help

For a resident with authoritative town-life state, current day/town/hopes/follow-up answers now use actual activity, decision reasons, needs, mood, personal desire, relationships and local shortages. The eight original topics, identity/history and bounded device conversation memory remain. Two additional game-native help choices can inspect the selected resident’s town-life situation or perform explicit nearby encouragement through the shared world command kernel. Ordinary reaction choices do not silently become rewards or interventions. Solo pauses remain; online choices recheck current position and intervention revision. See TOWN-LIFE.md for costs/cooldowns and authority.
