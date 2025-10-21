import state from '../core/state.js';
import { CONFIG } from '../config.js';

export async function ping(){
  if(!CONFIG.WORKER_URL) return false;
  try{
    const r = await fetch(CONFIG.WORKER_URL+'/?ping=1', { headers:{'X-Access-Key': CONFIG.ACCESS_KEY||''} });
    return r.ok;
  }catch{ return false; }
}

export async function loadAll(){
  if(!CONFIG.WORKER_URL) return false;
  try{
    const r = await fetch(CONFIG.WORKER_URL, { headers:{'X-Access-Key': CONFIG.ACCESS_KEY||''} });
    if(!r.ok) return false;
    const data = await r.json();
    const s = state.get();
    if(data.logs) s.logs = data.logs;
    if(data.settings) s.settings = data.settings;
    if(data.videos) s.videos = data.videos;
    state.save();
    return true;
  }catch(e){ console.warn(e); return false; }
}

export async function saveAll(payload){
  if(!CONFIG.WORKER_URL) return false;
  try{
    const r = await fetch(CONFIG.WORKER_URL, {
      method:'PUT',
      headers:{'Content-Type':'application/json','X-Access-Key': CONFIG.ACCESS_KEY||''},
      body: JSON.stringify(payload)
    });
    return r.ok;
  }catch(e){ console.warn(e); return false; }
}
