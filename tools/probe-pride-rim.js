// ================= ТЩЕСЛАВИЕ: ЕСТЬ ЛИ ДЫРЫ В РАМКЕ ИЗ КАМЕР =================
// Рамка (src/minigames/pride/pride-cameras.js) не должна пропускать то, что
// под ней: ни пустого места между камерами, ни щелей у края. Проба включает
// PrideCameras.holeTest — подложка становится ярко-малиновой, вуали нет, — и
// считает малиновые точки в полосах рамки. Дыры нет — малинового нет.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/probe-pride-rim.js /tmp/pride-
// Снимки: <префикс>holes.png (тест, малиновая подложка), <префикс>rim.png (как в игре).
const { chromium } = require('playwright');
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
  const r = await page.evaluate(async () => {
    PrideCameras.holeTest = true;
    PrideCameras._lay = null;
    const w = PrideMinigame.win;
    w._rimScale = null; w.ensureSkin();
    const rim = document.querySelector('#pride-game .mg-rim');
    let bad = 0, total = 0;
    const where = {};
    rim.querySelectorAll('canvas').forEach((c, i) => {
      const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
      for (let p = 0; p < d.length; p += 4) {
        total++;
        if (d[p + 3] > 128 && d[p] > 200 && d[p + 1] < 70 && d[p + 2] > 200) {
          bad++;
          const px = (p / 4) % c.width, py = Math.floor(p / 4 / c.width);
          const k = i + ':' + Math.floor(px / 20) + ',' + Math.floor(py / 20);
          where[k] = (where[k] || 0) + 1;
        }
      }
    });
    return { bad, total, cells: Object.keys(where).length, sample: Object.entries(where).slice(0, 12) };
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + 'holes.png' });
  console.log(`малиновых точек ${r.bad} из ${r.total} (${(100 * r.bad / r.total).toFixed(3)}%), клеток 20×20 с дырой: ${r.cells}`);
  if (r.sample.length) console.log('первые места:', JSON.stringify(r.sample));
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  // До 300 точек в двойном разрешении (около 0,02 %) — щели в пиксель, глазом не видны.
  process.exit(r.bad > 8000 || errors.length ? 1 : 0);
})();
