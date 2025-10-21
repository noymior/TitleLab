export default function toast(msg, type='info'){
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast '+type;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(()=>{ el.remove(); }, 2000);
}