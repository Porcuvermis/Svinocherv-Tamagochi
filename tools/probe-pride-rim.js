// ================= ТЩЕСЛАВИЕ: ЕСТЬ ЛИ ДЫРЫ В РАМКЕ ИЗ КАМЕР =================
// Рамка (src/minigames/pride/pride-cameras.js) не должна пропускать то, что под
// ней: ни пустого места между камерами, ни щелей у края. Проба собирает камеры в
// исходных местах на ярко-малиновой подложке (PrideCameras.holeReport) и считает
// малиновые точки. Камеры в игре качаются на несколько единиц — щели в покое
// важнее всего, при качании подложка под ними тёмная, не сцена.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/probe-pride-rim.js /tmp/pride-
// Снимки: <префикс>rim.png (как в игре), <префикс>holes.png (малиновая подложка).
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const out = process.argv[2] || '/tmp/pride-';
  const browser = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { PrideMinigame.open(); PrideMinigame.win.ensureSkin(); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + 'rim.png' });
  const cams = await page.evaluate(() => document.querySelectorAll('#pride-game .mg-cam').length);
  const r = await page.evaluate(() => PrideCameras.holeReport());
  fs.writeFileSync(out + 'holes.png', Buffer.from(r.png.split(',')[1], 'base64'));
  console.log(`камер-слоёв ${cams}; малиновых точек ${r.bad} из ${r.total} (${(100 * r.bad / r.total).toFixed(3)}%), клеток 20×20: ${r.cells}`);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  process.exit(r.bad > 8000 || !cams || errors.length ? 1 : 0);
})();
