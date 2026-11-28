// ================= СНИМОК: ГРИМЁРКА ТЩЕСЛАВИЯ =================
// Гримёрка отдельно от игры (tools/pride-room.html): проходы рисунка и свет
// шейдером при заданном наклоне телефона. Зачем: свет проверяют кадрами, а
// не в уме — блик латуни, тень шкафа и сдвиг отражения в зеркале видны
// только рядом друг с другом (docs/materials.md).
//
//   node tools/shot-pride-room.js /tmp/room- lit "lit?tx=0.7&ty=0.4" albedo height mat baked
//
// Режимы: lit — свет видеокартой; baked — запасной нарисованный вид; albedo,
// height, mat, mask — проходы как есть. После «?» — наклон tx, ty (−1..1),
// nobulbs=1 — без колб поверх. Видеокарта в прогоне — программная
// (swiftshader): вид верный, скорость — нет.
const { chromium } = require('playwright');
(async () => {
  const pre = process.argv[2] || '/tmp/room-';
  const modes = process.argv.slice(3);
  if (!modes.length) modes.push('lit', 'baked');
  const browser = await chromium.launch({ executablePath: require('./chrome-path'),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  for (const m of modes) {
    const [mode, extra] = m.split('?');
    await page.goto(`http://127.0.0.1:8777/tools/pride-room.html?mode=${mode}${extra ? '&' + extra : ''}`);
    await page.waitForFunction(() => document.title !== '', null, { timeout: 60000 });
    const out = `${pre}${m.replace(/[?=&.,]/g, '_')}.png`;
    console.log(m, await page.title(), out);
    await page.screenshot({ path: out });
  }
  await browser.close();
})();
