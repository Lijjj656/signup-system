-- ============================================================
-- seed.sql —— 本地演示数据
--
-- 用途：清掉压测留下的垃圾活动，生成一批看起来像真实产品的数据，
--       方便开发时看效果、截图放简历。
--
-- ⚠️ 会清空 events 和 registrations 两张表，只在本地开发用，
--    千万别在生产库上执行。
--
-- 执行：psql -h 127.0.0.1 -p 5433 -U postgres -d signup -f db/seed.sql
-- ============================================================

begin;

delete from registrations;
delete from events;

-- 五个活动，故意做成不同的「占用比例」，
-- 这样前端能同时看到：空进度、正常、接近满（黄）、已满（红）
insert into events (title, quota, start_at, created_by) values
  ('前端技术分享会 · React 19 实战',      50, now() + interval '5 days',  1),
  ('上海互联网求职夜谈 · 第 3 期',          30, now() + interval '8 days',  1),
  ('产品设计工作坊 · 从需求到原型',          8, now() + interval '11 days', 1),
  ('小班代码评审 · 只看 4 行 SQL',            2, now() + interval '3 days',  1),
  ('周末开源共创日',                        40, now() + interval '14 days', 1);

-- 报名记录：借用现成的压测用户来凑人数。
-- 排除 id=1（admin / 你自己的账号），这样你登录后每个活动都还能报名。
insert into registrations (user_id, event_id)
select u.id, e.id
  from (select id from users where id <> 1 order by id limit 12) u
 cross join (select id from events where title = '上海互联网求职夜谈 · 第 3 期') e;

insert into registrations (user_id, event_id)
select u.id, e.id
  from (select id from users where id <> 1 order by id limit 7) u
 cross join (select id from events where title = '产品设计工作坊 · 从需求到原型') e;

insert into registrations (user_id, event_id)
select u.id, e.id
  from (select id from users where id <> 1 order by id limit 2) u
 cross join (select id from events where title = '小班代码评审 · 只看 4 行 SQL') e;

insert into registrations (user_id, event_id)
select u.id, e.id
  from (select id from users where id <> 1 order by id limit 25) u
 cross join (select id from events where title = '周末开源共创日') e;

commit;
