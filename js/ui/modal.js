const modal = {
  open({title='',content='',actions=[]}){
    const root=document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-mask" role="dialog" aria-modal="true">
      <div class="modal">
        <header>${title}</header>
        <section>${content}</section>
        <div class="actions"></div>
      </div></div>`;
    const box = root.querySelector('.actions');
    actions.forEach(a=>{
      const b=document.createElement('button');
      b.className='btn '+(a.class||'btn--light');
      b.textContent=a.text||'确定';
      b.onclick=()=>{ a.onClick&&a.onClick(); modal.close(); };
      box.appendChild(b);
    });
    root.querySelector('.modal-mask').addEventListener('click', e=>{
      if(e.target.classList.contains('modal-mask')) modal.close();
    });
  },
  close(){ const root=document.getElementById('modal-root'); root.innerHTML=''; }
};
export default modal;