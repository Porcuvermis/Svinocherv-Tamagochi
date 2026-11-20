// ================= ТЩЕСЛАВИЕ: ПЕРЕХОД ВСПЫШКАМИ — ЛЕНТА КАДРОВ =================
// Кадры по подменённым часам поверх настоящей рамки (камеры не качаются — для
// сравнения кадров). Ленты: вход (cover, затем reveal), нажатия 1-2-3.
// Запуск: NODE_PATH=/opt/node22/lib/node_modules node tools/shot-pride-flash-film.js /tmp/film-
// Снимки: <префикс>enter-NN.png, <префикс>knock-NN.png (склеить — PIL или tools/sheet.py)
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '/tmp/film-';
  const browser = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    PrideMinigame.open(); PrideMinigame.win.ensureSkin();
    document.querySelectorAll('.mg-cam').forEach(c => { c.style.animation = 'none'; });
    const cv = document.createElement('canvas'); cv.id = 'film'; cv.width = 390; cv.height = 844;
    Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, width: '390px', height: '844px', zIndex: 2147483647, pointerEvents: 'none', background: 'none' });
    document.body.appendChild(cv);
    window.__T = 0; PrideFlash.clock = () => window.__T;
  });
  await page.waitForTimeout(500);
  const films = {
    enter: { steps: [[0, 'cover'], [1250, 'reveal']], at: [60, 180, 300, 420, 540, 660, 780, 900, 1250, 1400, 1550, 1700, 1900, 2150, 2450] },
    knock: { steps: [[0, 'burst', 1], [1100, 'burst', 2], [2700, 'finish']], at: [60, 160, 300, 500, 1180, 1300, 1450, 1700, 2000, 2780, 2950, 3150, 3350, 3550] }
  };
  for (const [name, f] of Object.entries(films)) {
    await page.evaluate(() => { PrideFlash.reset(); PrideFlash.seed = 7; });
    let si = 0;
    for (let i = 0; i < f.at.length; i++) {
      await page.evaluate(([steps, from, t]) => {
        for (let k = from; k < steps.length && steps[k][0] <= t; k++) { window.__T = steps[k][0]; PrideFlash.start(steps[k][1], steps[k][2]); }
        window.__T = t;
        const g = document.getElementById('film').getContext('2d');
        PrideFlash.render(g, t);
      }, [f.steps, si, f.at[i]]);
      while (si < f.steps.length && f.steps[si][0] <= f.at[i]) si++;
      await page.screenshot({ path: `${out}${name}-${String(i).padStart(2, '0')}.png` });
    }
  }
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
