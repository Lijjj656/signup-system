-- ============================================================
-- seed.server.sql —— 服务器首次部署用的演示数据
--
-- 和 seed.sql 的区别：
--   1. 那个版本假设库里已经有一堆用户（本地压测留下的），直接跨表取 id；
--      服务器是空库，取不到人，events.created_by=1 还会撞外键。
--   2. 这个版本自己把用户造出来，账号密码是已知的，部署后能直接登录演示。
--
-- 执行：PGPASSWORD=postgres123 psql -h 127.0.0.1 -U postgres -d signup -f db/seed.server.sql
--
-- 账号（都已在下方用 bcrypt 哈希写死，明文不会进库）：
--   admin@demo.com                    ← 管理员，可创建活动。**密码不公开**
--   demo1@demo.com ~ demo6@demo.com / demo12345
--
-- ⚠️ 管理员密码为什么不在仓库里：
--   这个仓库是公开的，只要明文写在这里，任何人读完 README 就能以 admin 身份
--   创建活动（`POST /api/events` 有 role 校验，只有 admin 能过）。
--   所以 admin 的哈希对应的是一段 24 位随机密码，只在部署时单独设置，
--   不出现在代码与文档中。
-- ============================================================

begin;

delete from registrations;
delete from events;
delete from users;

-- ---------- 1. 用户 ----------
-- password_hash 是 bcrypt 哈希，$2b$10$ 是格式标识，后面 53 位是盐+摘要。
-- 同一个明文每次哈希结果都不同（盐随机），所以这里两段哈希可以反复复用。
insert into users (email, password_hash, role) values
  ('admin@demo.com', '$2b$10$ZIAawpYAOGQWTjQ7n/rwq.n9fWQxU3KiOCv6LC4FVwf/4PZqzZ5Uu', 'admin'),
  ('demo1@demo.com', '$2b$10$jBC2SD0dwgZEGpGomjEEYeMUWEppGDb6oskxVPtaOAubXDQxnJpf6', 'user'),
  ('demo2@demo.com', '$2b$10$jBC2SD0dwgZEGpGomjEEYeMUWEppGDb6oskxVPtaOAubXDQxnJpf6', 'user'),
  ('demo3@demo.com', '$2b$10$jBC2SD0dwgZEGpGomjEEYeMUWEppGDb6oskxVPtaOAubXDQxnJpf6', 'user'),
  ('demo4@demo.com', '$2b$10$jBC2SD0dwgZEGpGomjEEYeMUWEppGDb6oskxVPtaOAubXDQxnJpf6', 'user'),
  ('demo5@demo.com', '$2b$10$jBC2SD0dwgZEGpGomjEEYeMUWEppGDb6oskxVPtaOAubXDQxnJpf6', 'user'),
  ('demo6@demo.com', '$2b$10$jBC2SD0dwgZEGpGomjEEYeMUWEppGDb6oskxVPtaOAubXDQxnJpf6', 'user');

-- ---------- 2. 活动 ----------
-- created_by 用子查询取管理员 id，不写死数字（自增序列不一定从 1 开始）
insert into events (title, quota, start_at, created_by)
select v.title, v.quota, now() + v.starts_in, u.id
  from (values
    ('前端技术分享会 · React 19 实战',      50, interval '5 days'),
    ('上海互联网求职夜谈 · 第 3 期',          30, interval '8 days'),
    ('产品设计工作坊 · 从需求到原型',         8, interval '11 days'),
    ('小班代码评审 · 只看 4 行 SQL',           2, interval '3 days'),
    ('周末开源共创日',                        40, interval '14 days')
  ) as v(title, quota, starts_in)
 cross join (select id from users where email = 'admin@demo.com') u;

-- ---------- 3. 报名记录 ----------
-- 故意做出不同的占用比例，前端就能同时看到：
--   空进度 / 正常 / 接近满（黄）/ 已满（红）
-- 管理员不参与报名，这样你登录 admin 后每个活动都还能点"报名"。

-- 求职夜谈：6 人（quota 30，正常进度）
insert into registrations (user_id, event_id)
select u.id, e.id from users u, events e
 where u.email like 'demo%@demo.com'
   and e.title = '上海互联网求职夜谈 · 第 3 期';

-- 工作坊：5 人（quota 8，接近满，进度条会变黄）
insert into registrations (user_id, event_id)
select u.id, e.id from users u, events e
 where u.email in ('demo1@demo.com','demo2@demo.com','demo3@demo.com','demo4@demo.com','demo5@demo.com')
   and e.title = '产品设计工作坊 · 从需求到原型';

-- 代码评审：2 人（quota 2，正好满，显示"已满"）
insert into registrations (user_id, event_id)
select u.id, e.id from users u, events e
 where u.email in ('demo1@demo.com','demo2@demo.com')
   and e.title = '小班代码评审 · 只看 4 行 SQL';

-- 开源共创日：3 人
insert into registrations (user_id, event_id)
select u.id, e.id from users u, events e
 where u.email in ('demo3@demo.com','demo4@demo.com','demo6@demo.com')
   and e.title = '周末开源共创日';

-- React 分享会：0 人，用来展示"空"状态

commit;

-- ---------- 4. 自检 ----------
select e.title, e.quota,
       count(r.id) filter (where r.status = 'confirmed') as taken
  from events e
  left join registrations r on r.event_id = e.id
 group by e.id, e.title, e.quota
 order by e.id;
