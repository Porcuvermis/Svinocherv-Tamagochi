// Тихий запуск прогона: печатает только провалы, ошибки и хвост вывода.
// Зачем: подробный вывод (по строке на проверку) целиком попадает в контекст
// модели и оплачивается в каждом следующем запросе. Полный вывод: VERBOSE=1.
//   NODE_PATH=/opt/node22/lib/node_modules node tools/q.js test-wrath.js /tmp/shot-
const { spawnSync } = require('child_process');
const path = require('path');
const [script, ...rest] = process.argv.slice(2);
if (!script) { console.error('usage: node tools/q.js <test.js> [args]'); process.exit(2); }
const r = spawnSync('node', [path.join(__dirname, script), ...rest],
  { encoding: 'utf8', maxBuffer: 1 << 28 });
const lines = ((r.stdout || '') + (r.stderr || '')).split('\n');
if (process.env.VERBOSE) { console.log(lines.join('\n')); process.exit(r.status || 0); }
const bad = lines.filter(l => /FAIL|✗|Error|error|Timeout/.test(l)).slice(0, 40);
const total = lines.filter(l => /^\s*(ok|✓)\s/.test(l)).length;
console.log(`проверок ok: ${total}, код выхода: ${r.status}`);
if (bad.length) console.log(bad.join('\n'));
console.log('--- хвост ---\n' + lines.filter(Boolean).slice(-6).join('\n'));
process.exit(r.status || 0);
