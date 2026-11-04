const jwt = require('jsonwebtoken');

// 鉴权中间件：每个需要登录的接口前面挂一个它。
// 好处是「判断登录」只写一次，而不是在每个接口里复制粘贴。
module.exports = function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    // verify 会同时校验签名和过期时间
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, role }
    next();
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
};
