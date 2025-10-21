let t=null, remain=0, cb=null;
export function start(sec, onTick){ stop(); remain = sec|0; cb=onTick; tick(); t=setInterval(tick,1000); }
export function stop(){ if(t){ clearInterval(t); t=null; } }
export function reset(){ stop(); remain=0; cb&&cb(remain); }
function tick(){ remain=Math.max(0, remain-1); cb&&cb(remain); if(remain<=0) stop(); }
