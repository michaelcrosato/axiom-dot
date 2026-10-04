import {CoopClient,type CoopSavedRoom} from './coop.ts';
import type {State} from './world.ts';
export interface CoopPanelOptions {client:CoopClient;world:()=>State;close:()=>void;onEnter?:()=>void}
/** TextContent for all server/user text; the panel never reads or writes solo storage. */
export function mountCoopPanel(panel:HTMLElement,options:CoopPanelOptions){
  let alive=true;
  panel.innerHTML=`<button class="close" aria-label="Close co-op panel">×</button><span class="eyebrow">ONLINE EXPEDITION · UP TO 4</span><h2>Explore together</h2><p>One shared frontier, shared supplies and construction. Each explorer has their own position and suit integrity. Your solo campaign stays in its own save slot.</p><p role="status" data-coop-status>Checking the online room service…</p><div data-coop-content></div><p class="muted">Uses real hosted rooms with up to four state updates per second. Internet latency applies. The world pauses while the host is away. Friends need permission to open this Site; an invite code does not change its sharing settings.</p>`;
  const close=panel.querySelector<HTMLButtonElement>('.close')!,status=panel.querySelector<HTMLElement>('[data-coop-status]')!,content=panel.querySelector<HTMLElement>('[data-coop-content]')!;
  close.onclick=()=>{alive=false;options.close();};
  const button=(label:string,action:()=>Promise<void>)=>{const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){if(alive)status.textContent=e instanceof Error?e.message:'The room could not be opened';}finally{if(alive)b.disabled=false;}};return b;};
  let activeRoomId:string|null=null,activeCode:HTMLInputElement|null=null,activeRoster:HTMLElement|null=null,offlineReturn:HTMLButtonElement|null=null;
  const renderActive=()=>{
    const s=options.client.snapshot;if(!s)return;
    status.textContent=options.client.status==='reconnecting'?'Connection interrupted · retrying safely':options.client.status==='paused'?'Connection paused · room state is retained':s.paused?'Host away · shared world paused':`${s.peers.filter(p=>p.connected).length}/4 explorers connected`;
    if(activeRoomId!==s.roomId){
      activeRoomId=s.roomId;content.replaceChildren();
      const h=document.createElement('h3');h.textContent=s.name;content.append(h);
      const label=document.createElement('label');label.textContent='Invite code';const code=document.createElement('input');code.readOnly=true;code.setAttribute('aria-label','Co-op invite code');label.append(code);content.append(label);activeCode=code;
      content.append(button('Copy invite code',async()=>{const current=options.client.snapshot;if(current){await navigator.clipboard.writeText(current.code);status.textContent='Invite code copied'}}));
      activeRoster=document.createElement('ul');activeRoster.setAttribute('aria-label','Online explorers');content.append(activeRoster);
      content.append(button('Return to solo',async()=>{await options.client.leave();alive=false;options.close();}));
      if(s.selfId===s.hostId)content.append(button('Close room and keep co-op save',async()=>{await options.client.leave(true);alive=false;options.close();}));
      offlineReturn=button('Return to solo without connection',async()=>{options.client.disconnect();alive=false;options.close();});content.append(offlineReturn);
    }
    if(activeCode){const code=s.code.match(/.{1,4}/g)?.join('-')??s.code;if(activeCode.value!==code)activeCode.value=code;}
    if(activeRoster){activeRoster.replaceChildren();for(const p of s.peers){const item=document.createElement('li');item.textContent=`${p.name}${p.host?' · host':''} · ${p.connected?'online':'disconnected'} · ${p.zone}`;activeRoster.append(item);}}
    if(offlineReturn)offlineReturn.hidden=options.client.status!=='reconnecting'&&options.client.status!=='paused';
  };
  const renderLobby=(rooms:CoopSavedRoom[])=>{
    content.innerHTML=`<label>Explorer name<input data-coop-name maxlength="32" autocomplete="nickname" value="Explorer" aria-label="Explorer name"></label><div data-coop-host></div><label>Invite code<input data-coop-code maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" aria-label="Co-op invite code to join"></label><div data-coop-join></div><h3>Saved co-op frontiers</h3><div data-coop-saves></div>`;
    const name=()=>content.querySelector<HTMLInputElement>('[data-coop-name]')!.value.trim()||'Explorer';
    const entered=()=>{options.onEnter?.();renderActive();};
    content.querySelector('[data-coop-host]')!.append(button('Host a co-op copy of this world',async()=>{await options.client.create({name:name(),world:options.world()});entered();}));
    content.querySelector('[data-coop-join]')!.append(button('Join online room',async()=>{await options.client.join({name:name(),code:content.querySelector<HTMLInputElement>('[data-coop-code]')!.value});entered();}));
    const saves=content.querySelector('[data-coop-saves]')!;
    if(!rooms.length)saves.textContent='No hosted co-op saves yet';
    for(const room of rooms)saves.append(button(`${room.name} · seed ${room.seed}${room.closed?' · closed':''}`,async()=>{await options.client.resume(room.id,name());entered();}));
  };
  void(async()=>{
    if(options.client.active){renderActive();return;}
    try{const available=await options.client.availability();if(!alive)return;status.textContent=available.message;
      if(!available.available)return;
      if(!available.authenticated){const link=document.createElement('a');link.href='/signin-with-chatgpt?return_to=%2F';link.target='_top';link.textContent='Sign in with ChatGPT';content.append(link);return;}
      const rooms=await options.client.savedRooms();if(alive)renderLobby(rooms);
    }catch(error){if(alive)status.textContent=error instanceof Error?error.message:'The online room service is unavailable';}
  })();
  const dispose=()=>{alive=false;};dispose.refresh=()=>{if(alive&&options.client.active)renderActive();};return dispose;
}
