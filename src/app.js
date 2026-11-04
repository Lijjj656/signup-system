const express = require('express');
const cors = require('cors');
const pool = require('./db');
const authRouter = require('./routes/auth');
const eventsRouter = require('./routes/events');

const app = express();

app.use(cors());          // 允许前端跨域访问，否则浏览器会拦
app.use(express.json());  // 把请求体里的 JSON 自动解析成 req.body

app.use('/api/auth', authRouter);
app.use('/api', eventsRouter);   // /api/events、/api/my/registrations 等

// 健康检查：能返回数据库时间，说明「服务 + 数据库」两边都通了
app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT now() AS now');
    res.json({ ok: true, db: rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// 统一错误处理（必须放在所有路由之后）
//
// 三个要点：
// 1. 参数必须是 4 个 (err, req, res, next)，Express 才认它是"错误处理器"
// 2. 它接住的是所有没被 try/catch 处理掉的异常
// 3. 永远不要把 err.stack 返回给客户端 —— 那会暴露文件路径、依赖版本、
//    数据库结构，是渗透测试的第一手资料。堆栈只该进服务器日志。
// ============================================================
app.use((err, req, res, next) => {
  // express.json() 解析失败时会抛这个：客户端发来的不是合法 JSON
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法的 JSON' });
  }

  console.error('[unhandled]', err);   // 堆栈留在服务器日志里，自己看
  res.status(500).json({ error: '服务器错误' });  // 对外只给一句话
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务已启动: http://localhost:${PORT}/api/health`);
});
