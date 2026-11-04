// test-api.js —— 接口自测脚本
// 用法：在项目目录下执行  node test-api.js
//
// 为什么要这个脚本：
// 1. 终端（PowerShell / cmd / bash）各有各的引号规则，用 curl 发 JSON 很容易被吃掉引号
// 2. 脚本里用 JSON.stringify() 生成请求体，不存在转义问题
// 3. 一条命令跑完所有用例，改完代码立刻知道有没有改坏
//
// 设计原则（重要）：
//   断言「行为」，不要断言「文案」。
//   文案会变（产品经理一句话就改），状态码不会。
//   只校验 status 的测试，改文案时不会误报。

const BASE = 'http://localhost:3000/api';
const stamp = Date.now();  // 用时间戳做邮箱后缀，避免"邮箱已注册"干扰测试

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
    data = text.slice(0, 120);
  }
  return { status: res.status, data };
}

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`     实际结果: ${JSON.stringify(detail).slice(0, 200)}`);
  }
}

(async () => {
  console.log('\n=== 接口自测开始 ===\n');

  // ---------- 一、基础链路 ----------
  console.log('[基础]');

  let r = await call('GET', '/health');
  check('健康检查：服务与数据库都在线', r.status === 200 && r.data.ok === true, r);

  r = await call('POST', '/auth/register', {
    email: `short${stamp}@test.com`,
    password: '123456',
  });
  check('6 位密码被拒绝（只看状态码 400）', r.status === 400, r);

  const emailA = `a${stamp}@test.com`;
  const password = '12345678';
  r = await call('POST', '/auth/register', { email: emailA, password });
  check('8 位密码注册成功，返回用户 id', r.status < 300 && !!r.data.id, r);

  r = await call('POST', '/auth/register', { email: emailA, password });
  check('重复邮箱注册被拒绝', r.status === 409, r);

  r = await call('POST', '/auth/login', { email: emailA, password });
  const tokenA = r.data.token;
  check('登录成功并返回 JWT token', r.status === 200 && !!tokenA, r);

  r = await call('POST', '/auth/login', { email: emailA, password: 'wrongpassword' });
  check('错误密码被拒绝', r.status === 401, r);

  // ---------- 二、鉴权 ----------
  console.log('\n[鉴权]');

  r = await call('GET', '/my/registrations');
  check('未登录访问受保护接口 → 401', r.status === 401, r);

  r = await call('GET', '/my/registrations', null, 'this.is.not.a.valid.token');
  check('伪造 token → 401', r.status === 401, r);

  r = await call('GET', '/my/registrations', null, tokenA);
  check('带合法 token → 200', r.status === 200, r);

  // ---------- 三、权限 ----------
  console.log('\n[权限]');

  r = await call('POST', '/events', { title: 'illegal', quota: 5 }, tokenA);
  check('普通用户建活动 → 403（不是 401）', r.status === 403, r);

  // ---------- 四、报名业务流 ----------
  console.log('\n[报名业务流 · 1 个名额]');

  // 管理员登录（test@example.com 已被设为 admin）
  r = await call('POST', '/auth/login', {
    email: 'test@example.com',
    password: '123456',
  });
  const adminToken = r.data.token;
  check('管理员登录成功', !!adminToken, r);

  r = await call(
    'POST',
    '/events',
    { title: `quota-release-test ${new Date().toLocaleTimeString()}`, quota: 1 },
    adminToken
  );
  const eventId = r.data.id;
  check('创建 quota=1 的活动', r.status === 201 && !!eventId, r);

  r = await call('POST', `/events/${eventId}/register`, null, tokenA);
  check('用户 A 报名成功 → 201', r.status === 201, r);

  // 第二个用户 B
  const emailB = `b${stamp}@test.com`;
  await call('POST', '/auth/register', { email: emailB, password });
  r = await call('POST', '/auth/login', { email: emailB, password });
  const tokenB = r.data.token;
  check('用户 B 注册并登录', !!tokenB, r);

  r = await call('POST', `/events/${eventId}/register`, null, tokenB);
  check('名额已满时用户 B 被拒 → 409', r.status === 409, r);

  r = await call('POST', `/events/${eventId}/register`, null, tokenA);
  check('用户 A 重复报名被拒（唯一约束）', r.status === 409, r);

  r = await call('POST', `/events/${eventId}/cancel`, null, tokenA);
  check('用户 A 取消报名成功', r.status === 200, r);

  r = await call('POST', `/events/${eventId}/register`, null, tokenB);
  check('取消后名额释放，用户 B 报名成功 → 201', r.status === 201, r);

  r = await call('GET', '/events?page=1&size=50');
  const listed = r.data.items?.find((e) => e.id === eventId);
  check('列表里该活动显示已报 1 人', r.status === 200 && listed && listed.taken === 1, r);

  // ---------- 五、非法输入 ----------
  console.log('\n[非法输入]');

  r = await call('POST', '/events', { title: 'x', quota: -5 }, adminToken);
  check('quota 为负数被拒 → 400', r.status === 400, r);

  r = await call('POST', '/events', { title: 'x', quota: 'abc' }, adminToken);
  check('quota 不是数字被拒 → 400', r.status === 400, r);

  r = await call('POST', '/events/999999/register', null, tokenA);
  check('报名不存在的活动 → 404', r.status === 404, r);

  r = await call('POST', '/events', { title: '' }, adminToken);
  check('标题为空被拒 → 400', r.status === 400, r);

  console.log('\n=== 结果 ===');
  console.log(`  通过 \x1b[32m${pass}\x1b[0m 项，失败 ${fail > 0 ? '\x1b[31m' : ''}${fail}\x1b[0m 项`);
  if (fail > 0) {
    console.log('\n  有失败项，把上面的"实际结果"发我。');
    process.exit(1);
  } else {
    console.log('\n  全部通过。');
  }
})();
