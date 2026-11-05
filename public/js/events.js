// ============================================================
// events.js —— 活动列表页的逻辑
//
// 一个页面的脚本永远只有三段：
//   ① 先拿到页面上的元素（document.getElementById）
//   ② 请求数据（api.get）
//   ③ 把数据变成 HTML 塞进去（innerHTML）
// 后面所有页面都是这个骨架，只是内容不同。
// ============================================================

const listEl = document.getElementById('list');
const totalEl = document.getElementById('total');

// 导航条：三个页面共用 renderNav，传不同参数只是为了让当前页高亮
document.getElementById('nav').innerHTML = renderNav('events');
bindNav();


// ---------- ① 加载数据 ----------
async function load() {
  // 【三态之一】加载中。用户点了到看到内容之间有网络延迟，
  // 不给提示的话页面是一片空白，用户会以为坏了。
  listEl.innerHTML = '<div class="state">加载中…</div>';

  try {
    // Promise.all：两个请求同时发出去，等两个都回来才继续。
    // 如果用两次 await 依次发，总耗时是两者相加；同时发只要最慢的那个。
    //
    // 第二个请求为什么套 .catch(() => ({ items: [] }))？
    // 因为「我的报名」失败不该让整个列表页崩掉——
    // 顶多不显示"已报名"标记，活动列表还是应该能看。
    const [data, mine] = await Promise.all([
      api.get('/events?size=50'),
      isLoggedIn()
        ? api.get('/my/registrations').catch(() => ({ items: [] }))
        : Promise.resolve({ items: [] }),
    ]);

    totalEl.textContent = data.total;

    // 【三态之三】空数据。和"加载中"是两回事：
    // 加载完发现一条都没有，得明确告诉用户"这里本来就没东西"。
    if (!data.items.length) {
      listEl.innerHTML = '<div class="state">还没有活动，等管理员发布吧。</div>';
      return;
    }

    // 把「我报过名的活动 id」收成一个集合，查起来是 O(1)
    // 注意用 String() 统一类型：数据库返回的 id 是字符串 '1'，不是数字 1
    const mySet = new Set(
      mine.items
        .filter((r) => r.status === 'confirmed')
        .map((r) => String(r.event_id))
    );

    render(data.items, mySet);
  } catch (err) {
    // 【三态之二】出错。必须把"发生了什么"和"怎么办"一起给出来，
    // 只写"加载失败"等于什么都没说。
    listEl.innerHTML = `
      <div class="state">
        ${escapeHtml(err.message)}<br>
        <button class="btn ghost" id="retry">重试</button>
      </div>`;
    document.getElementById('retry').addEventListener('click', load);
  }
}


// ---------- ② 把数组变成 HTML ----------
function render(items, mySet) {
  // map 把每个活动对象变成一段 HTML 字符串，join('') 再拼成一整块。
  // 这是原生 JS 最常用的"数据渲染成界面"的写法。
  listEl.innerHTML = items.map((item) => {
    const id = String(item.id);
    const quota = Number(item.quota);
    const taken = Number(item.taken);
    const left = quota - taken;                     // 剩余名额（可能是负数，那是数据异常）
    const pct = quota > 0 ? Math.min(100, Math.round((taken / quota) * 100)) : 0;

    const isMine = mySet.has(id);                   // 我报过名了吗
    const isFull = left <= 0;

    // 进度条颜色：满了红、快满黄、其余绿
    const barClass = isFull ? 'full' : pct >= 80 ? 'warn' : '';
    const hot =taken >=20;

    // 按钮分三种情况，这段就是页面的"业务规则"
    let action;
    if (isMine) {
      action = `<span class="tag ok">已报名</span>
                <button class="btn danger" data-cancel="${id}">取消报名</button>`;
    } else if (!isLoggedIn()) {
      action = `<a class="btn" href="/login.html">登录后报名</a>`;
    } else if (isFull) {
      action = `<button class="btn" disabled>名额已满</button>`;
    } else {
      action = `<button class="btn" data-register="${id}">立即报名</button>`;
    }

    return `
      <article class="card">
        <div class="card-head">
          <h2 class="card-title">
          ${escapeHtml(item.title)}
          ${hot ? '<span class="tag ok">热门</span>':''}
          </h2>
        </div>
        <p class="card-meta">开始时间：${formatTime(item.start_at)}</p>
        <div class="bar ${barClass}"><i style="width:${pct}%"></i></div>
        <div class="card-foot">
          <span class="count">
            <b>${taken}</b> / ${quota} 人已报名
            ${left > 0 ? `· 还剩 <b>${left}</b> 个名额` : '· <span style="color:#d1242f">已满</span>'}
          </span>
          <span>${action}</span>
        </div>
      </article>`;
  }).join('');
}


// ---------- ③ 处理点击 ----------
//
// 这里用的是「事件委托」：监听整个列表，而不是给每个按钮单独绑。
// 好处是列表重渲染（innerHTML 换掉整块）之后，监听依然有效，
// 不会出现"按钮点了没反应"这种新手常见 bug。
//
// e.target.closest('[data-register]') 的意思是：
// 从被点的元素往上找，找到最近的带 data-register 属性的元素。
// 这样即使点到按钮里的文字也认得出是哪个按钮。
listEl.addEventListener('click', async (e) => {
  const regBtn = e.target.closest('[data-register]');
  const cancelBtn = e.target.closest('[data-cancel]');

  if (regBtn) {
    const id = regBtn.dataset.register;

    // 立刻禁用按钮 —— 防止用户手快连点两次。
    // 后端有唯一约束会挡住第二个请求，但前端不该把脏活推给后端。
    regBtn.disabled = true;
    regBtn.textContent = '处理中…';

    try {
      await api.post(`/events/${id}/register`);
      toast('报名成功');
      await load();          // 重新拉数据，名额和按钮状态一起刷新
    } catch (err) {
      toast(err.message, 'err');
      regBtn.disabled = false;
      regBtn.textContent = '立即报名';
    }
  }

  if (cancelBtn) {
    const id = cancelBtn.dataset.cancel;
    cancelBtn.disabled = true;
    try {
      await api.post(`/events/${id}/cancel`);
      toast('已取消报名');
      await load();
    } catch (err) {
      toast(err.message, 'err');
      cancelBtn.disabled = false;
    }
  }
});


// 页面打开就加载
load();
