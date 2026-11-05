// ============================================================
// my.js —— 我的报名
//
// 这个页面和列表页最大的不同：**必须登录**。
// 后端接口已经挂了 auth 中间件，没 token 会返回 401。
// 但更好的做法是在前端就先拦住，别让用户看到一个报错页面。
// ============================================================

// 没登录就送去登录页，并记住"登录后要回到这里"
if (!isLoggedIn()) {
  location.replace('/login.html?next=/my.html');
}

document.getElementById('nav').innerHTML = renderNav('my');
bindNav();

const listEl = document.getElementById('list');


async function load() {
  listEl.innerHTML = '<div class="state">加载中…</div>';

  try {
    const data = await api.get('/my/registrations');

    if (!data.items.length) {
      listEl.innerHTML = `
        <div class="state">
          你还没有报过任何活动<br>
          <a class="btn" href="/" style="margin-top:14px">去看看有哪些活动</a>
        </div>`;
      return;
    }

    render(data.items);
  } catch (err) {
    listEl.innerHTML = `
      <div class="state">
        ${escapeHtml(err.message)}<br>
        <button class="btn ghost" id="retry">重试</button>
      </div>`;
    document.getElementById('retry').addEventListener('click', load);
  }
}


function render(items) {
  listEl.innerHTML = items.map((r) => {
    // status 只有两个值：confirmed（有效）/ cancelled（已取消）
    const confirmed = r.status === 'confirmed';

    return `
      <article class="card">
        <div class="card-head">
          <h2 class="card-title">${escapeHtml(r.title)}</h2>
          <span class="tag ${confirmed ? 'ok' : 'off'}">
            ${confirmed ? '报名成功' : '已取消'}
          </span>
        </div>
        <p class="card-meta">
          活动时间：${formatTime(r.start_at)}　·　报名于 ${formatTime(r.created_at)}
        </p>
        <div class="card-foot">
          <span class="count">名额上限 <b>${r.quota}</b> 人</span>
          <span>
            ${confirmed
              ? `<button class="btn danger" data-cancel="${r.event_id}">取消报名</button>`
              : `<a class="btn ghost" href="/">重新选活动</a>`}
          </span>
        </div>
      </article>`;
  }).join('');
}


// 取消报名。和列表页用的是同一个接口，所以后端不需要为这个页面写新代码 ——
// 这就是"接口设计得好，前端随便怎么组合"的好处。
listEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cancel]');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = '处理中…';

  try {
    await api.post(`/events/${btn.dataset.cancel}/cancel`);
    toast('已取消报名');
    await load();
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false;
    btn.textContent = '取消报名';
  }
});

load();
