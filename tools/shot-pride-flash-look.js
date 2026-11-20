// ================= ТЩЕСЛАВИЕ: ВИД ВСПЫШКИ (лист кадров, задача 4.2) =================
// Неподвижные кадры поверх настоящей рамки, без анимации — принять вид до движения:
//   1 — по одной вспышке S, M, L на камерах;  2 — шквал из 30 маленьких по рамке и экрану;
//   3 — средние + белизна 0,3;  4 — большая у середины + белизна 0,75.
// Запуск: NODE_PATH=/opt/node22/lib/node_modules node tools/shot-pride-flash-look.js /tmp/look-
// Снимки: <префикс>1.png … <префикс>4.png
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '/tmp/look-';
  const browser = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    PrideMinigame.open(); PrideMinigame.win.ensureSkin();
    document.querySelectorAll('.mg-cam').forEach(c => { c.style.animation = 'none'; });
    const cv = document.createElement('canvas'); cv.id = 'look'; cv.width = 780; cv.height = 1688;
    Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, width: '390px', height: '844px', zIndex: 2147483647, pointerEvents: 'none', background: 'none' });
    document.body.appendChild(cv);
  });
  await page.waitForTimeout(600);
  const scenes = [
    (P, F, g, pts) => { const c = pts.filter(p => p.kind === 'cam'); F.draw(g, c[3].x, c[3].y, 'S', 1, 0.3); F.draw(g, c[14].x, c[14].y, 'M', 1, 0.2); F.draw(g, c[30].x, c[30].y, 'L', 1, 0.5); },
    (P, F, g, pts) => { pts.filter((p, i) => i % 2 === 0).slice(0, 30).forEach((p, i) => F.draw(g, p.x, p.y, 'S', 0.5 + (i % 5) * 0.12, i)); },
    (P, F, g, pts) => { F.whiteout(g, 0.3); pts.filter((p, i) => i % 7 === 1).forEach((p, i) => F.draw(g, p.x, p.y, 'M', 0.6 + (i % 3) * 0.2, i * 0.4)); },
    (P, F, g, pts) => { F.whiteout(g, 0.75); F.draw(g, 230, 380, 'L', 1, 0.2); pts.filter((p, i) => i % 9 === 4).forEach((p, i) => F.draw(g, p.x, p.y, 'S', 0.8, i)); }
  ];
  for (let i = 0; i < scenes.length; i++) {
    await page.evaluate((src) => {
      const P = PrideCameras, F = PrideFlash, cv = document.getElementById('look'), g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(2, 0, 0, 2, 0, 0);
      (new Function('return ' + src))()(P, F, g, P.flashPoints());
    }, scenes[i].toString());
    await page.screenshot({ path: out + (i + 1) + '.png' });
  }
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
