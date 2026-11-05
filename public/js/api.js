// ============================================================
// api.js —— 所有页面共用的「请求工具」
//
// 为什么要有这个文件？
//   三个页面都要发请求，都要带 token，都要处理「出错了怎么办」。
//   如果每个页面各写一遍，将来要改就会漏改。
//   所以把这件事收在一处，页面里只写 api.get('/events') 这么短。
//
// 这个文件不需要 import，只要在 HTML 里用 <script src> 先加载它，
// 后面的脚本就能直接用里面定义的函数（因为都是全局的）。
// ============================================================

const API_BASE = '/api';

// ---------- 1. token 的存取 ----------
//
// localStorage 是浏览器自带的"小仓库"，特点：
//   - 关掉浏览器、重启电脑都还在
//   - 只能存字符串
//   - **同一个域名下所有 JS 都能读**，所以绝不能存密码
//
// 这里存两个东西：
//   token → 证明"我是谁"的凭证，每次请求带在头上
//   user  → 邮箱、角色这些展示用的信息，省得每次都问服务器

function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function setUser(user) {
  localStorage.setItem('user', JSON.stringify(user));   // 对象要先变成字符串才能存
}

function getUser() {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);   // 取出来再变回对象
  } catch {
    return null;              // 万一被手动改坏了，别让页面直接崩
  }
}

function isLoggedIn() {
  return !!getToken();
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.href = '/login.html';
}

// ---------- 2. 统一的请求函数 ----------
//
// 这是整个前端唯一调用 fetch 的地方。
// 所有页面都通过它说话，好处是"带 token""解析错误"只写一次。
//
// async / await 的读法：
//   await 就是"停在这等结果"，和你在后端写的 await pool.query() 一模一样。
//   不同之处只是：后端等数据库，前端等服务器。

async function request(path, { method = 'GET', body } = {}) {
  const headers = {};

  // 只有带 body 的请求才需要声明"我发的是 JSON"
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // 已登录就带上身份凭证。格式是固定的：Bearer 后面一个空格再接 token
  const token = getToken();
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // 走到这里说明连接都没建立成功：服务没启动、断网、断点打太久
    throw new Error('连不上服务器，检查后端是否启动');
  }

  // 服务器可能返回空 body（比如 204），所以 .json() 失败时给 null 兜底
  const data = await res.json().catch(() => null);

  // ---------- 401 的特殊处理 ----------
  // 401 = 我不知道你是谁。可能是 token 过期，也可能是压根没登录。
  // 但登录接口本身密码错也返回 401，那种情况必须把错误显示在表单上，
  // 不能跳转（否则用户在登录页被踢回登录页，看着像没反应）。
  if (res.status === 401 && !path.startsWith('/auth/')) {
    logout();
    throw new Error('登录已过期，请重新登录');
  }

  if (!res.ok) {
    // 后端所有错误都是 { error: '一句话' } 这个形状，直接拿来显示
    throw new Error((data && data.error) || `请求失败（${res.status}）`);
  }

  return data;
}

// ---------- 3. 两个便捷方法 ----------

const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
};

// ---------- 4. 几个页面都要用的小工具 ----------

// 把安全风险挡在源头：用户输入的东西绝不能直接塞进 innerHTML，
// 否则别人把活动标题写成 <img src=x onerror=alert(1)> 就能执行脚本（XSS）。
// 这个函数把 < > & " ' 转成 HTML 实体，显示出来还是原文，但不会被当成标签执行。
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

// 把 ISO 时间（2026-11-11T13:09:44.683Z）变成人看的样子（11月11日 21:09）
function formatTime(iso) {
  if (!iso) return '未设置';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '时间格式异常';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 页面顶部的导航条，三个页面长得一样，所以生成一次复用
function renderNav(active) {
  const user = getUser();
  const who = user ? escapeHtml(user.email) : '';
  return `
    <nav class="nav">
      <a class="brand" href="/">活动报名</a>
      <div class="links">
        <a href="/" class="${active === 'events' ? 'on' : ''}">活动列表</a>
        <a href="/my.html" class="${active === 'my' ? 'on' : ''}">我的报名</a>
        ${user
          ? `<span class="who">${who}</span><button class="btn-text" id="navLogout">退出</button>`
          : `<a href="/login.html" class="${active === 'login' ? 'on' : ''}">登录 / 注册</a>`}
      </div>
    </nav>`;
}

// 导航条渲染完再绑退出按钮，否则按钮还不存在，绑不上
function bindNav() {
  const btn = document.getElementById('navLogout');
  if (btn) btn.addEventListener('click', logout);
}

// 页面顶部的小提示条（报名成功、取消成功之类的）
function toast(message, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
