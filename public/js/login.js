// ============================================================
// login.js —— 登录 / 注册页
//
// 一个表单干两件事：登录和注册。
// 靠一个变量 mode 记住"现在处于哪个模式"，
// 点下面的链接就切换，表单不重建，只改文字和按钮。
// ============================================================

document.getElementById('nav').innerHTML = renderNav('login');
bindNav();

// 已登录的人不该停在登录页，直接送回列表
if (isLoggedIn()) {
  location.replace('/');
}

let mode = 'login';   // 'login' | 'register'

const form = document.getElementById('authForm');
const errEl = document.getElementById('err');
const titleEl = document.getElementById('formTitle');
const hintEl = document.getElementById('switchHint');
const switchEl = document.getElementById('switchMode');
const btn = document.getElementById('submitBtn');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');


// ---------- 切换登录 / 注册 ----------
switchEl.addEventListener('click', (e) => {
  e.preventDefault();               // 阻止 <a href="#"> 跳转，否则页面会滚到顶部
  mode = mode === 'login' ? 'register' : 'login';

  const isRegister = mode === 'register';
  titleEl.textContent = isRegister ? '注册' : '登录';
  btn.textContent = isRegister ? '注册并登录' : '登录';
  hintEl.textContent = isRegister ? '已经有账号了？' : '还没有账号？';
  switchEl.textContent = isRegister ? '去登录' : '注册一个';
  passwordEl.autocomplete = isRegister ? 'new-password' : 'current-password';
  errEl.textContent = '';           // 切模式时把上一次的错误清掉
});


// ---------- 提交 ----------
form.addEventListener('submit', async (e) => {
  // 表单 submit 的默认行为是"刷新整个页面"，必须拦掉，
  // 否则请求还没发完页面就重新加载了。
  e.preventDefault();

  const email = emailEl.value.trim();
  const password = passwordEl.value;

  errEl.textContent = '';

  // 前端校验只是为了让用户少等一趟网络请求。
  // 后端必须再校验一遍，因为请求可以被绕过前端直接发出来。
  if (!email || !password) {
    errEl.textContent = '邮箱和密码都要填';
    return;
  }
  if (password.length < 8) {
    errEl.textContent = '密码至少 8 位';
    return;
  }

  // 提交期间禁用按钮：防止连点发出两次注册请求
  btn.disabled = true;
  btn.textContent = '处理中…';

  try {
    // 注册模式下先建账号。注册成功不代表登录了，
    // 所以紧接着还要调一次登录接口拿 token —— 用户少点一次。
    if (mode === 'register') {
      await api.post('/auth/register', { email, password });
    }

    const data = await api.post('/auth/login', { email, password });

    setToken(data.token);
    setUser(data.user);

    // ---------- 一个容易忽略的安全问题 ----------
    // 登录成功后跳回用户原本想去的页面（比如从 /my.html 被踢过来的）。
    // 但如果直接 location.href = next，别人可以构造：
    //   /login.html?next=https://钓鱼网站.com
    // 用户一看是自己的域名、就放心输密码，登录成功后却被送去钓鱼站。
    // 这类攻击叫「开放重定向」。
    //
    // 防御办法：只接受站内相对路径 —— 必须以单个 / 开头，
    // 且不能是 //（//evil.com 会被浏览器当成协议相对地址，跳到 evil.com）。
    const next = new URLSearchParams(location.search).get('next');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

    location.href = safeNext;
  } catch (err) {
    errEl.textContent = err.message;
    btn.disabled = false;
    btn.textContent = mode === 'register' ? '注册并登录' : '登录';
  }
});
