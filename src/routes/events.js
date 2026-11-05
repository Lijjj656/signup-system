const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// ============================================================
// 活动列表（分页）
// 分页是列表接口的标配：数据一多，一次全查出来会把内存和带宽打爆
// ============================================================
router.get('/events', async (req, res) => {
  // 参数来自 URL，绝对不可信：可能是 "abc"、可能是 -5、可能是 100000
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(req.query.size) || 10));
  const offset = (page - 1) * size;

  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.title, e.quota, e.start_at,
              -- 子查询算出「已报名人数」，前端就能显示 3/50 这种进度
              (SELECT count(*)::int FROM registrations r
                WHERE r.event_id = e.id AND r.status = 'confirmed') AS taken
         FROM events e
        ORDER BY e.start_at ASC
        LIMIT $1 OFFSET $2`,
      [size, offset]
    );

    const { rows: t } = await pool.query('SELECT count(*)::int AS n FROM events');

    res.json({ page, size, total: t[0].n, items: rows });
  } catch (err) {
    console.error('[events.list]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============================================================
// 【练习 1】活动详情 —— 这个函数留给你自己写
//
// 我不会给答案，但会把「需求」拆到你能下手的程度。
//
// ── 需求原文（产品经理说的话）──────────────────────
//   "前端要做一个活动详情页。用户点开一个活动，要看到：
//    活动标题、总名额、还剩几个名额。
//    如果这个活动根本不存在，要提示 404。"
//
// ── 把这段话翻译成技术语言 ──────────────────────────
//   ① "活动标题、总名额"   → 从 events 表里查 title 和 quota
//   ② "还剩几个名额"       → quota 减去「已报名人数」
//   ③ "已报名人数"         → registrations 表里 event_id 相同、status='confirmed' 的条数
//   ④ "活动不存在要 404"   → 查出来的 rows 是空的，就 return 404
//
// ── 你要做的四件事 ─────────────────────────────────
//   TODO 1：把事件信息和已报名人数一起查出来
//   TODO 2：查不到就返回 404
//   TODO 3：算出剩余名额
//   TODO 4：用 res.json 返回
//
// ── 验收标准 ───────────────────────────────────────
//   浏览器打开 http://localhost:3000/api/events/1
//   应该看到类似：
//   {"id":1,"title":"...","quota":1,"taken":1,"left":0}
//
//   换成 http://localhost:3000/api/events/999999 应该返回 404
// ============================================================
router.get('/events/:id', async (req, res) => {
  const eventId = Number(req.params.id);

  // 这一行我帮你写了，作为「输入校验」的示范：
  // 地址栏里的 :id 是用户随便填的，可能是 /events/abc
  // Number('abc') 得到 NaN，直接拿去查库会报错
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return res.status(400).json({ error: 'id 不合法' });
  }

  try {
    const { rows } = await pool.query(
      `select e.id, e.title, e.quota,
              (select count(*)::int
                 from registrations r
                where r.event_id = e.id
                  and r.status = 'confirmed') as taken
         from events e
        where e.id = $1`,
      [eventId]
    );

    console.log('查到:', rows);
    // 活动不存在时提前返回，后面的代码不再执行
    if (!rows[0]) {
      return res.status(404).json({ error: '活动不存在' });
    }

    const ev = rows[0];
    const left = ev.quota - ev.taken;   // 总名额 - 已报名 = 剩余

    res.json({
      id: ev.id,
      title: ev.title,
      quota: ev.quota,
      taken: ev.taken,
      left,
    });
  } catch (err) {
    console.error('[events.detail]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============================================================
// 创建活动（只有管理员能建）
// 401 vs 403 的区别：
//   401 = 我不知道你是谁（没登录 / token 过期）→ 去登录
//   403 = 我知道你是谁，但你没权限 → 登录也没用
// ============================================================
router.post('/events', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const { title, quota, start_at } = req.body || {};

  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title 必填' });
  }
  const q = Number(quota);
  if (!Number.isInteger(q) || q <= 0) {
    return res.status(400).json({ error: 'quota 必须是正整数' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO events (title, quota, start_at, created_by)
       VALUES ($1, $2, COALESCE($3::timestamptz, now() + interval '7 days'), $4)
       RETURNING id, title, quota, start_at`,
      [title, q, start_at || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[events.create]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============================================================
// 报名 —— 修复版：事务 + 行锁
//
// 之前的错误写法（TOCTOU 漏洞）：
//   SELECT count(*) → 判断 → INSERT
//   查和写之间有时间差，并发时所有人读到同一个「还剩 1 个」，全部放行。
//
// 修复思路：把「读活动 → 数人数 → 写记录」三件事关进一个事务，
// 并且在读活动时用 FOR UPDATE 给这一行加排他锁。
// 锁住之后，其他事务执行到同一句会**阻塞等待**，
// 直到我 COMMIT，它们才能读到最新的数字。
//
// 代价：同一个活动的报名变成串行（排队）。
// 好处：不同活动互不影响，仍然并行。
// ============================================================
router.post('/events/:id/register', auth, async (req, res) => {
  const eventId = Number(req.params.id);
  const userId = req.user.id;

  // ⚠️ 必须用 pool.connect() 借出【一个】连接，而不是 pool.query()
  //
  // 因为事务是「连接级」的概念：BEGIN 只对当前这个连接有效。
  // 如果用 pool.query()，三次查询可能落到三个不同连接上，
  // BEGIN 开在 A 连接、INSERT 跑在 B 连接 —— 事务等于没开，锁也白加。
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // FOR UPDATE：给这一行加排他锁。
    // 后到的请求会停在这一句上排队，等前一个事务结束。
    const ev = await client.query(
      'SELECT id, quota FROM events WHERE id = $1 FOR UPDATE',
      [eventId]
    );

    if (!ev.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '活动不存在' });
    }

    // 因为拿到了锁，此刻数出来的人数一定是准的
    const cnt = await client.query(
      `SELECT count(*)::int AS n FROM registrations
        WHERE event_id = $1 AND status = 'confirmed'`,
      [eventId]
    );

    if (cnt.rows[0].n >= ev.rows[0].quota) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: '名额已满' });
    }

    const { rows } = await client.query(
      `INSERT INTO registrations (user_id, event_id)
       VALUES ($1, $2)
       RETURNING id, event_id, status, created_at`,
      [userId, eventId]
    );

    await client.query('COMMIT');   // 提交，释放锁，下一个排队的才能进
    res.status(201).json(rows[0]);
  } catch (err) {
    // 出错必须回滚，否则这个事务会一直挂着锁着行
    await client.query('ROLLBACK').catch(() => {});

    if (err.code === '23505') {
      return res.status(409).json({ error: '你已经报名过了' });
    }
    console.error('[events.register]', err);
    res.status(500).json({ error: '服务器错误' });
  } finally {
    // ⚠️ 无论成功还是失败，连接都必须归还给连接池。
    // 漏了这句，连接会被逐渐耗尽，最后服务整体卡死（表现为所有请求都超时）。
    // 这是新手用连接池最容易犯的致命错误。
    client.release();
  }
});

// ============================================================
// 取消报名
// 注意：是 UPDATE status 而不是 DELETE。
// 因为表上有 UNIQUE(user_id, event_id)，
// 如果删掉记录，同一人再报名会重新插入，历史就丢了；
// 而且要防止「取消后重复报名刷名额」也需要这条记录在。
// ============================================================
router.post('/events/:id/cancel', auth, async (req, res) => {
  const eventId = Number(req.params.id);

  try {
    const { rowCount } = await pool.query(
      `UPDATE registrations
          SET status = 'cancelled'
        WHERE user_id = $1 AND event_id = $2 AND status = 'confirmed'`,
      [req.user.id, eventId]
    );

    if (rowCount === 0) {
      return res.status(409).json({ error: '你没有报名这个活动，或已取消' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[events.cancel]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============================================================
// 我的报名（需要登录）
// ============================================================
router.get('/my/registrations', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.status, r.created_at,
              e.id AS event_id, e.title, e.quota, e.start_at
         FROM registrations r
         JOIN events e ON e.id = r.event_id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json({ items: rows });
  } catch (err) {
    console.error('[my.registrations]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
