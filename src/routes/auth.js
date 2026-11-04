const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

// 注册
router.post('/register', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: '邮箱和密码必填' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '密码不能少于 8 位' });
  }

  try {
    // 密码永远不存明文。bcrypt 会自带随机盐，同一个密码每次 hash 结果都不同。
    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, role`,
      [String(email).toLowerCase().trim(), passwordHash]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    // 23505 = PostgreSQL 的唯一约束冲突，这里就是邮箱已存在
    if (err.code === '23505') {
      return res.status(409).json({ error: '该邮箱已注册' });
    }
    console.error('[register]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: '邮箱和密码必填' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1',
      [String(email).toLowerCase().trim()]
    );

    // 注意：邮箱不存在和密码错误要返回同一个提示，
    // 否则别人就能用这个接口「探测哪些邮箱注册过」。
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
