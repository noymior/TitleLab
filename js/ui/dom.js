export const $ = (s,el=document)=> el.querySelector(s);
export const $$ = (s,el=document)=> Array.from(el.querySelectorAll(s));
export function delegate(root, ev, sel, fn){
  root.addEventListener(ev, (e)=>{
    const t = e.target.closest(sel);
    if(t && root.contains(t)) fn(e);
  });
}
