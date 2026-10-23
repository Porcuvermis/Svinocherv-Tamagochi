// ================= ЗАВИСТЬ: ЗАКРЫВАЮТ ЛИ ГЛАЗА РОВНУЮ КРОМКУ =================
// Рамка из глаз (src/minigames/envy/envy-eyes.js) должна ломать ровную кромку
// сцены почти везде — сами глаза, без наплывов без зрачков (оценка игрока).
//
// Прогон прячет наклейки и красит сцену в пурпур: на снимке видно, где
// прямая кромка выглядывает между глазами. И считает то же числом: точки
// шва (EnvyEyes.seamPath — кромка на 2 единицы внутрь сцены) вне всех
// миндалей. Печатает долю открытого шва и длиннейшие открытые куски.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/probe-envy-rim.js /tmp/envy-
// Снимок: <префикс>rim.png
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '/tmp/envy-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    EnvyMinigame.open();
    // рамку дорисовать сразу, не дожидаясь простоя
    if (EnvyMinigame.win && EnvyMinigame.win.ensureSkin) EnvyMinigame.win.ensureSkin();
  });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content:
    '#envy-canvas{visibility:hidden!important}' +
    '.envy-modal,#envy-game .mg-body{background:#ff00ff!important}' });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const path = EnvyEyes.seamPath(), eyes = EnvyEyes._eyes || [];
    const open = path.map(q => !eyes.some(e => EnvyEyes.inAlmond(e, q.x, q.y)));
    const runs = [];
    let cur = 0;
    for (const o of open.concat([false])) {
      if (o) cur++;
      else if (cur) { runs.push(cur); cur = 0; }
    }
    runs.sort((a, b) => b - a);
    return { n: path.length, k: open.filter(Boolean).length, runs, eyes: eyes.length, reach: EnvyEyes.reach() };
  });
  await page.screenshot({ path: out + 'rim.png' });
  console.log(`глаз ${r.eyes}, заход на сцену ${r.reach} ед.`);
  console.log(`шов ${r.n} ед., открыто ${r.k} (${(100 * r.k / r.n).toFixed(1)}%), кусков ${r.runs.length}, длиннейшие ${r.runs.slice(0, 8).join(', ')}`);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
