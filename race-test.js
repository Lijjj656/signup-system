// race-test.js —— 并发报名压力测试
//
// 用法：node race-test.js [并发人数]
//   node race-test.js        → 默认 10 人抢 1 个名额
//   node race-test.js 50     → 50 人抢 1 个名额
//
// 它做的事：
//   1. 用管理员账号创建一个 quota=1 的活动（只有一个名额）
//   2. 注册 N 个互相独立的用户，各拿一个 token
//   3. 让这 N 个请求「同时」发出（Promise.all，不是 for 循环await）
//   4. 统计有多少人报上了名
//
// 关键在 Promise.all：for 循环里 await 是一个一个排队，
// 永远不会并发，也就永远测不出超卖。

const BASE = 'http://localhost:3000/api';
const N = Number(process.argv[2]) || 10;
const stamp = Date.now();

async function call(method, path, body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 100);
  }
  return { status: res.status, data };
}

(async () => {
  console.log(`\n=== 并发报名测试：${N} 人抢 1 个名额 ===\n`);

  // ---- 1. 管理员登录 ----
  let r = await call('POST', '/auth/login', {
    email: 'test@example.com',
    password: '123456',
  });
  if (!r.data.token) {
    console.error('管理员登录失败：', r);
    process.exit(1);
  }
  const adminToken = r.data.token;
  console.log('① 管理员已登录');

  // ---- 2. 建一个只有 1 个名额的活动 ----
  r = await call(
    'POST',
    '/events',
    { title: `并发测试活动 ${new Date().toLocaleTimeString()}`, quota: 1 },
    adminToken
  );
  if (!r.data.id) {
    console.error('创建活动失败：', r);
    process.exit(1);
  }
  const eventId = r.data.id;
  console.log(`② 活动已创建：id=${eventId}，名额 quota=1`);

  // ---- 3. 注册 N 个用户并登录 ----
  process.stdout.write(`③ 准备 ${N} 个用户...`);
  const users = [];
  for (let i = 0; i < N; i++) {
    const email = `p${stamp}_${i}@test.com`;
    const password = '12345678';
    await call('POST', '/auth/register', { email, password });
    const login = await call('POST', '/auth/login', { email, password });
    if (login.data.token) users.push({ email, token: login.data.token });
  }
  console.log(` 完成，拿到 ${users.length} 个 token`);

  // ---- 4. 预热：先把 TCP 连接和数据库连接都建好 ----
  //
  // 这一步是能不能测出超卖的关键。
  // 不预热的话，第一个请求要花十几毫秒建连（TCP 握手 + pg 认证），
  // 后面的请求只能排队等着 —— 结果它们「自动」错开了，永远撞不上。
  // 真实的抢购场景里，连接都是长连接、早就建好的，所以才会真的撞上。
  process.stdout.write('④ 预热连接池...');
  await Promise.all(Array.from({ length: users.length }, () => call('GET', '/events')));
  console.log(' 完成');

  // ---- 5. 同时发出 N 个报名请求 ----
  console.log(`⑤ 同时发起 ${users.length} 个报名请求...\n`);
  const t0 = Date.now();
  const results = await Promise.all(
    users.map((u) => call('POST', `/events/${eventId}/register`, null, u.token))
  );
  const cost = Date.now() - t0;

  // ---- 5. 统计 ----
  const ok = results.filter((x) => x.status === 201);
  const full = results.filter((x) => x.status === 409);

  console.log(`   耗时 ${cost} ms`);
  console.log(`   成功报名：\x1b[32m${ok.length}\x1b[0m 人`);
  console.log(`   提示名额已满：${full.length} 人`);

  // 把每个请求的结果打出来，方便看是「谁赢的」
  results.forEach((x, i) => {
    const tag = x.status === 201 ? '\x1b[32m201 成功\x1b[0m' : `\x1b[90m${x.status} ${x.data.error || ''}\x1b[0m`;
    console.log(`   ${String(i + 1).padStart(2)}. ${tag}`);
  });

  console.log('\n=== 判定 ===');
  if (ok.length > 1) {
    console.log(`\x1b[31m✗ 超卖了！名额只有 1 个，却有 ${ok.length} 人报名成功。\x1b[0m`);
    console.log('\n  这就是 TOCTOU 漏洞：');
    console.log('  所有人都查到了「还剩 1 个」，然后所有人都写了进去。');
    console.log(`  用这条 SQL 可以看到数据库里真实存了几条：`);
    console.log(`    SELECT count(*) FROM registrations`);
    console.log(`     WHERE event_id = ${eventId} AND status = 'confirmed';`);
    process.exitCode = 1;
  } else if (ok.length === 1) {
    console.log(`\x1b[32m✓ 正常：只有 1 人报名成功，名额没有被突破。\x1b[0m`);
  } else {
    console.log(`\x1b[33m? 没人报名成功，这不对劲，检查一下服务日志。\x1b[0m`);
  }

  console.log(`\n（活动 id = ${eventId}，稍后可以用它验证数据库里的真实数据）\n`);
})();
