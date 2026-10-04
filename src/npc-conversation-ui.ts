/** A transparent, game-native conversation surface. No world state lives here. */
export interface ConversationPresentation {
 name:string; role:string; subtitle:string; line:string; location?:string;
 choices:readonly {id:string;text:string;kind:string}[];
 topic?:string|null; remembered?:string|boolean|null; canBack?:boolean;
}
export const CONVERSATION_PAGE_SIZE=4;
export function conversationPage<T>(choices:readonly T[],page:number){
 const pages=Math.max(1,Math.ceil(choices.length/CONVERSATION_PAGE_SIZE));
 const current=Math.max(0,Math.min(pages-1,Number.isFinite(page)?Math.floor(page):0));
 return {page:current,pages,choices:choices.slice(current*CONVERSATION_PAGE_SIZE,(current+1)*CONVERSATION_PAGE_SIZE)};
}
export function createConversationOverlay(host:HTMLElement,options:{choose:(id:string)=>void;back:()=>void;close:(keepHistory?:boolean)=>void}){
 const root=document.createElement('section');root.className='conversation';root.hidden=true;
 root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Conversation');root.tabIndex=-1;
 const marker=document.createElement('div');marker.className='conversation-speaker-marker';marker.setAttribute('aria-hidden','true');marker.hidden=true;host.append(marker,root);
 let view:ConversationPresentation|null=null,page=0,generation=0,lastChoice=-Infinity,playerLine='',online=false;
 const el=<K extends keyof HTMLElementTagNameMap>(tag:K,className:string,text?:string)=>{const e=document.createElement(tag);e.className=className;if(text)e.textContent=text;return e;};
 const button=(text:string,className:string,fn:()=>void)=>{const b=el('button',className,text);b.type='button';b.onclick=event=>{if(event.detail>1)return;fn();};return b;};
 function render(focus=false){
  if(!view)return;const version=++generation,selection=conversationPage(view.choices,page);page=selection.page;root.replaceChildren();
  root.setAttribute('aria-label',`Conversation with ${view.name}`);
  const heading=el('header','conversation-heading');heading.append(el('span','conversation-kicker',online?'A passing conversation':`A moment in ${view.location??'the valley'}`),el('h2','conversation-name',view.name),el('span','conversation-role',view.role));
  const leave=button('Leave  ·  Esc','conversation-leave',()=>options.close());leave.setAttribute('aria-label','Leave conversation and return to the world');heading.append(leave);root.append(heading);
  const speech=el('div','conversation-speech');speech.setAttribute('aria-live','polite');speech.setAttribute('aria-atomic','true');
  if(playerLine)speech.append(el('p','conversation-player-line',`You: “${playerLine}”`));
  const line=el('p','conversation-line',view.line);speech.append(line);
  if(view.subtitle)speech.append(el('p','conversation-manner',view.subtitle));root.append(speech);
  const choices=el('div','conversation-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label','Choose what you say');
  selection.choices.forEach((choice,index)=>{
   const b=button('','conversation-choice',()=>{
    if(version!==generation||performance.now()-lastChoice<180)return;
    lastChoice=performance.now();playerLine=choice.text;options.choose(choice.id);
   });b.dataset.choice=choice.id;b.dataset.kind=choice.kind;
   b.setAttribute('aria-label',`${index+1}. ${choice.text}`);
   b.append(el('span','conversation-choice-number',String(index+1)),el('span','conversation-choice-text',choice.text));choices.append(b);
  });root.append(choices);
  const navigation=el('nav','conversation-navigation');navigation.setAttribute('aria-label','Conversation directions');
  if(view.canBack)navigation.append(button('↶  Something else','conversation-nav',()=>{playerLine='';page=0;options.back();}));
  if(selection.pages>1){navigation.append(button('‹','conversation-page',()=>{page=(page+selection.pages-1)%selection.pages;render(true);}));const count=el('span','conversation-page-count',`${page+1} / ${selection.pages}`);count.setAttribute('aria-label',`Reply page ${page+1} of ${selection.pages}`);navigation.append(count);const next=button('More replies  ›','conversation-nav',()=>{page=(page+1)%selection.pages;render(true);});navigation.append(next);}
  navigation.append(el('span','conversation-help','1–4 choose  ·  ← → replies  ·  Tab navigate'));root.append(navigation);
  marker.textContent=view.name;
  if(focus)(root.querySelector<HTMLButtonElement>('.conversation-choice')??leave).focus({preventScroll:true});
 }
 const chooseVisible=(index:number)=>{root.querySelectorAll<HTMLButtonElement>('.conversation-choice')[index]?.click();};
 function keydown(event:KeyboardEvent){
  if(root.hidden||event.metaKey||event.ctrlKey||event.altKey)return false;
  if(event.code==='Escape'){event.preventDefault();options.close();return true;}
  if(['KeyB','KeyJ','KeyM'].includes(event.code)){options.close(true);return false;}
  if(event.repeat){event.preventDefault();return true;}
  if(/^Digit[1-4]$/.test(event.code)){event.preventDefault();chooseVisible(Number(event.code.slice(-1))-1);return true;}
  if(event.code==='ArrowLeft'||event.code==='ArrowRight'){event.preventDefault();const pages=conversationPage(view?.choices??[],page).pages;page=(page+pages+(event.code==='ArrowLeft'?-1:1))%pages;render(true);return true;}
  const buttons=[...root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  if(event.code==='Tab'||event.code==='ArrowDown'||event.code==='ArrowUp'){
   event.preventDefault();const current=buttons.indexOf(document.activeElement as HTMLButtonElement),delta=event.code==='ArrowUp'||event.shiftKey?-1:1;
   buttons[(current+delta+buttons.length)%buttons.length]?.focus({preventScroll:true});return true;
  }
  if(event.code==='Enter'||event.code==='Space'){
   event.preventDefault();if(root.contains(document.activeElement))(document.activeElement as HTMLButtonElement).click?.();return true;
  }
  // Movement and combat keys belong to the conversation until it closes.
  if(['KeyW','KeyA','KeyS','KeyD','KeyE','KeyF','KeyG','KeyC','KeyQ','KeyR','KeyK','ShiftLeft','ShiftRight'].includes(event.code)){event.preventDefault();return true;}
  return false;
 }
 return {root,keydown,
  show(next:ConversationPresentation,connected=false){const first=root.hidden,changed=next.topic!==view?.topic;view=next;online=connected;page=first||changed?0:page;root.hidden=false;document.documentElement.classList.add('conversation-open');render(true);},
  position(x:number,y:number,visible:boolean){marker.hidden=root.hidden||!visible;if(visible){marker.style.left=`${x}px`;marker.style.top=`${y}px`;}},
  hide(){generation++;root.hidden=true;marker.hidden=true;view=null;playerLine='';page=0;lastChoice=-Infinity;document.documentElement.classList.remove('conversation-open');},
  dispose(){root.remove();marker.remove();document.documentElement.classList.remove('conversation-open');},
 };
}
