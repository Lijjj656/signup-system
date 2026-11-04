// try-console-table.js —— 体验 console.log 和 console.table 的区别
//
// 用法：node try-console-table.js
// 这个脚本不启动服务，直接连数据库查数据，是最轻量的实验方式。

const pool = require('./src/db');

(async () => {
  const { rows } = await pool.query(
    `select e.id, e.title, e.quota,
            (select count(*)::int
               from registrations r
              where r.event_id = e.id
                and r.status = 'confirmed') as taken
       from events e
      order by e.id`
  );

  console.log('\n========== console.log(rows) ==========\n');
  console.log(rows);

  console.log('\n========== console.table(rows) ==========\n');
  console.table(rows);

  console.log('\n========== console.log 的三种常见用法 ==========\n');

  // 1. 多个值一起打
  console.log('活动总数:', rows.length);

  // 2. 打单个字段
  rows.forEach((e) => console.log(`  活动 ${e.id}：${e.title}（${e.taken}/${e.quota}）`));

  // 3. 只挑几列做成表格
  console.table(rows, ['id', 'quota', 'taken']);

  await pool.end();
})();
