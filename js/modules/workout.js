import state from '../core/state.js';
import { start, stop, reset } from '../services/timer.js';
import { videoEmbed } from '../services/media.js';
export default {
  init(){},
  render(){
    const el = document.getElementById('view-workout');
    const s = state.get(); const part = s.settings.last_part||'胸';
    const vids = s.videos[part]||[];
    el.innerHTML = `<div class="container">
      <h2>💪 训练 - ${part}</h2>
      <div class="timer" id="tm">00:00</div>
      <div class="row">
        <button class="btn btn--ok" id="start60">开始 60s</button>
        <button class="btn btn--light" id="stop">暂停</button>
        <button class="btn btn--light" id="reset">重置</button>
      </div>
      <div style="margin-top:12px">${vids.length?videoEmbed(vids[0].url):'<div class="badge">未配置视频</div>'}</div>
    </div>`;
    const tm = el.querySelector('#tm');
    function fmt(n){const m=String(Math.floor(n/60)).padStart(2,'0');const s=String(n%60).padStart(2,'0'); return `${m}:${s}`;}
    document.getElementById('start60').onclick=()=> start(60, v=> tm.textContent = fmt(v));
    document.getElementById('stop').onclick=()=> stop();
    document.getElementById('reset').onclick=()=> { reset(); tm.textContent='00:00'; };
  }
};