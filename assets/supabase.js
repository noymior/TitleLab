// assets/supabase.js

// 这里直接写死默认 Supabase 项目信息
// （这是 anon 公钥，只能做前端允许的操作，注意不要用 service_role）
const SUPABASE_URL = 'https://ukinuavvsjnqmrbtmwtq.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVraW51YXZ2c2pucW1yYnRtd3RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNDgwNzUsImV4cCI6MjA3ODYyNDA3NX0.e4Y9sw_apIhln146rSExKadRAzzO3RoCGqgRh7eIGnI';

// 支持“标题 / 文案使用各自数据库” 的可选配置：
// 如果页面上预先挂了 window.TITLE_SUPABASE_URL / window.TITLE_SUPABASE_KEY
// 或 window.CONTENT_SUPABASE_URL / window.CONTENT_SUPABASE_KEY，将优先使用；
// 否则退回到上面的默认项目。
const SUPABASE_PAGE_MODE = window.location.pathname.includes('content')
  ? 'content'
  : 'title';

const pageConfig = (() => {
  if (SUPABASE_PAGE_MODE === 'content') {
    return {
      url: window.CONTENT_SUPABASE_URL || SUPABASE_URL,
      key: window.CONTENT_SUPABASE_KEY || SUPABASE_ANON_KEY,
      table: 'contents'
    };
  }
  return {
    url: window.TITLE_SUPABASE_URL || SUPABASE_URL,
    key: window.TITLE_SUPABASE_KEY || SUPABASE_ANON_KEY,
    table: 'titles'
  };
})();

// 防御：如果 Supabase SDK 没加载，会在控制台给出提示
if (!window.supabase) {
  console.error('❌ Supabase JS SDK 未加载，请检查 <script> 引用顺序');
}

// 创建客户端（前提是 SDK 已加载）
const supabaseClient = window.supabase
  ? window.supabase.createClient(pageConfig.url, pageConfig.key)
  : null;

// ✅ 关键：挂到 window 上，给 app-title.js 使用
window.supabaseClient = supabaseClient;

// 状态检查：右上角的小 pill 提示 Supabase 在线/错误
async function pingSupabase() {
  try {
    const el = document.getElementById('supabaseStatus');
    if (!el || !supabaseClient) return;

    // 按页面检查对应的表是否可用（标题/文案各有独立表）
    const { error } = await supabaseClient
      .from(pageConfig.table)
      .select('id')
      .limit(1);

    if (error) {
      console.error('Supabase error:', error);
      el.textContent = 'DB Error';
      el.classList.remove('pill-muted');
      el.classList.add('pill');
      el.style.backgroundColor = '#fee2e2';
      el.style.color = '#b91c1c';
    } else {
      el.textContent = 'Supabase 在线';
      el.classList.remove('pill-muted');
      el.classList.add('pill');
      el.style.backgroundColor = '#dcfce7';
      el.style.color = '#166534';
    }
  } catch (e) {
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', pingSupabase);
