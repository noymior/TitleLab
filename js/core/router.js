let routes={};
export function initRouter(map){
  routes = map;
  window.addEventListener('hashchange', render);
  render();
}
export function navigateTo(hash){
  if(location.hash!==hash){ location.hash = hash; } else { render(); }
}
function show(hash){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const id = '#view-' + (hash.replace('#','') || 'home');
  const el = document.querySelector(id);
  if(el) el.classList.add('active');
}
function render(){
  const h = location.hash || '#home';
  show(h);
  (routes[h] || routes['default'])();
}