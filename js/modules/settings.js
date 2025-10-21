import state from '../core/state.js';
import * as cloud from '../services/cloud.js';
import modal from '../ui/modal.js';
import toast from '../ui/toast.js';

async function verify(){ const ok = await cloud.ping(); toast(ok?'验证成功':'验证失败'); }
async function connect(){ toast('连接逻辑可在 cloud.js 中扩展'); }

export default {
  init(){},
  async verify(){ return verify(); },
  async connect(){ return connect(); },
  render(){
    const el = document.getElementById('view-settings');
    const s = state.get();
    el.innerHTML = `<div class="container">
      <h2>⚙️ 设置</h2>
      <div class="kv">
        <div>休息时长</div>
        <div><input id="rest" type="number" min="10" max="300" value="${s.settings.rest||90}"> 秒</div>
        <div>主题</div>
        <div>
          <select id="theme">
            <option value="light"${s.settings.theme==='light'?' selected':''}>浅色</option>
            <option value="dark"${s.settings.theme==='dark'?' selected':''}>深色</option>
          </select>
        </div>
      </div>
      <div style="margin-top:16px" class="row">
        <button class="btn btn--ok" id="save">保存设置</button>
        <button class="btn btn--light" id="editVideo">添加视频</button>
      </div>
    </div>`;

    document.getElementById('save').onclick=()=>{
      s.settings.rest = parseInt(document.getElementById('rest').value||'90',10);
      s.settings.theme = document.getElementById('theme').value;
      state.save(); toast('设置已保存');
    };

    document.getElementById('editVideo').onclick=()=>{
      const parts = Object.keys(s.videos);
      const content = `<div class="kv">
        <div>部位</div><div><select id="p">${parts.map(p=>`<option>${p}</option>`).join('')}</select></div>
        <div>标题</div><div><input id="t" placeholder="视频标题"></div>
        <div>链接</div><div><input id="u" placeholder="https://..."></div>
      </div>`;
      modal.open({
        title:'添加视频',
        content,
        actions:[
          { text:'取消', class:'btn--light' },
          { text:'保存', class:'btn--ok', onClick:()=>{
            const p=document.getElementById('p').value;
            const t=document.getElementById('t').value;
            const u=document.getElementById('u').value;
            s.videos[p] = s.videos[p] || [];
            s.videos[p].unshift({name:t,url:u});
            state.save(); toast('已添加'); 
          }}
        ]
      });
    };
  }
};