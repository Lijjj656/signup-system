const { Pool } = require('pg');
require('dotenv').config();

// 连接池：一次建多条连接，请求来了借一条，用完还回去。
// 比每个请求都新建连接快得多，这是后端最基本的一层优化。
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;
