// localStorage 方案（与 v10 一致）
const LS_KEY='jaspergym_v11';
const state = {
  logs: [],
  settings: { rest: 90, theme: 'light', last_part: '胸' },
  videos: { '胸': [], '背': [], '腿': [], '肩': [], '臂': [], '腹': [] }
};

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){ const data = JSON.parse(raw); Object.assign(state, data); }
  }catch(e){ console.warn('load failed', e); }
}
function save(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
export default {
  async init(){ load(); },
  snapshot(){ return JSON.parse(JSON.stringify(state)); },
  get(){ return state; },
  save
};