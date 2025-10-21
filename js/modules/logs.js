import state from '../core/state.js';
export default {
  init(){},
  render(){
    const el = document.getElementById('view-logs');
    const s = state.get();
    el.innerHTML = `<div class="container">
      <h2>📘 日志</h2>
      <div class="row">
        <button class="btn btn--ok" id="add">新增日志</button>
      </div>
      <div class="list" id="list" style="margin-top:12px"></div>
    </div>`;
    const list = el.querySelector('#list');
    const rows = s.logs.slice().reverse();
    list.innerHTML = rows.map(l=>`<div class="log-item">
      <div><b>${l.date}</b> · ${l.part||''} · ${l.title||''}</div>
      <div>${l.note||''}</div>
    </div>`).join('') || '<div class="badge">暂无记录</div>';
    document.getElementById('add').onclick=()=>{
      const log = { date: new Date().toISOString().slice(0,16).replace('T',' '), part:s.settings.last_part, title:'训练', note:'' };
      s.logs.push(log); state.save(); this.render();
    };
  }
};