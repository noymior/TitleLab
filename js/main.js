// 1) 核心基础设施
import './core/state.js';
import { initRouter } from './core/router.js';
import app from './core/app.js';

// 2) 服务/工具（按需）
import './services/cloud.js';
import './ui/toast.js';

// 3) 功能模块（依赖 core）
import home from './modules/home.js';
import workout from './modules/workout.js';
import logs from './modules/logs.js';
import settings from './modules/settings.js';

// 启动
window.addEventListener('DOMContentLoaded', ()=> {
  app.start({ home, workout, logs, settings, initRouter });
});
