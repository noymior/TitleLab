import { navigateTo } from './router.js';
import * as cloud from '../services/cloud.js';
import * as dom from '../ui/dom.js';
import toast from '../ui/toast.js';
import modal from '../ui/modal.js';
import state from './state.js';
import { CONFIG } from '../config.js';

const app = {
  async start({home, workout, logs, settings, initRouter}){
    // Top bar actions
    dom.delegate(document, 'click', '.gbtn[data-action="verify"]', ()=> settings.verify());
    dom.delegate(document, 'click', '.gbtn[data-action="connect"]', ()=> settings.connect());
    dom.delegate(document, 'click', '.gbtn[data-action="load"]', async ()=> {
      const ok = await cloud.loadAll();
      toast(ok ? '云端读取成功' : '云端读取失败');
      home.render(); workout.render(); logs.render(); settings.render();
    });
    dom.delegate(document, 'click', '.gbtn[data-action="save"]', async ()=> {
      const ok = await cloud.saveAll(state.snapshot());
      toast(ok ? '云端保存成功' : '云端保存失败');
    });
    dom.delegate(document, 'click', '.gbtn[data-route]', (e)=>{
      navigateTo(e.target.getAttribute('data-route'));
    });

    // init modules
    await state.init();
    home.init(); workout.init(); logs.init(); settings.init();

    // router
    initRouter({
      '#home':   ()=> home.render(),
      '#workout':()=> workout.render(),
      '#logs':   ()=> logs.render(),
      '#settings':()=> settings.render(),
      'default': ()=> home.render()
    });

    // Auto connect (可选)
    if(CONFIG.AUTO_CONNECT){ settings.verify(); }
  }
};
export default app;
