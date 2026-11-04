-- 活动报名系统 · 表结构
-- 执行方式：psql -U postgres -d signup -f db/schema.sql
-- 重复执行请先 DROP TABLE（顺序要对，先删有外键的）

DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS users;

-- 1. 用户表
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user'
                            CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 活动表
CREATE TABLE events (
  id         BIGSERIAL   PRIMARY KEY,
  title      TEXT        NOT NULL,
  quota      INTEGER     NOT NULL CHECK (quota > 0),  -- 名额上限
  start_at   TIMESTAMPTZ NOT NULL,
  created_by BIGINT      REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 报名表
-- 关键设计：取消报名用 UPDATE status='cancelled'，而不是 DELETE。
-- 这样才能用 (user_id, event_id) 唯一约束防止同一人重复报名，
-- 同时保留"这个人曾经报过并取消了"的历史。
CREATE TABLE registrations (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id   BIGINT      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'confirmed'
                         CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

-- 统计某个活动已报名人数时，走这个索引
CREATE INDEX idx_reg_event_status ON registrations (event_id, status);
