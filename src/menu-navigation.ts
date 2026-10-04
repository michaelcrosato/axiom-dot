/** Small, explicit navigation: exactly one menu section is visible at a time. */
export const MENU_SECTIONS=['play','field','controls','display','advanced'] as const;
export type MenuSection=typeof MENU_SECTIONS[number];
export function menuSection(value:string|undefined):MenuSection{return MENU_SECTIONS.includes(value as MenuSection)?value as MenuSection:'play';}
export function bindMenuNavigation(panel:HTMLElement,initial:MenuSection='play'){
 const buttons=[...panel.querySelectorAll<HTMLButtonElement>('[data-menu-section]')];
 const pages=[...panel.querySelectorAll<HTMLElement>('[data-menu-page]')];
 function select(value:string|undefined){const chosen=menuSection(value);for(const page of pages)page.hidden=page.dataset.menuPage!==chosen;for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.menuSection===chosen));panel.dataset.menuSection=chosen;panel.scrollTop=0;}
 for(const button of buttons)button.onclick=()=>select(button.dataset.menuSection);
 select(initial);
}
