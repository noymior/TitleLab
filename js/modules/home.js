import state from '../core/state.js';
export default {
  init(){},
  render(){
    const el = document.getElementById('view-home');
    const s = state.get();
    el.innerHTML = `<div class="container">
      <h2>🏠 首页</h2>
      <div class="grid">
        <div>上次训练部位：<b>${s.settings.last_part||'—'}</b></div>
        <div class="row">
          <label>选择部位：</label>
          ${Object.keys(s.videos).map(p=>`<button class="btn btn--light" data-part="${p}">${p}</button>`).join('')}
        </div>
      </div>
    </div>`;
    el.querySelectorAll('button[data-part]').forEach(b=> b.onclick=()=>{
      s.settings.last_part = b.dataset.part; state.save(); this.render();
    });
  }
};