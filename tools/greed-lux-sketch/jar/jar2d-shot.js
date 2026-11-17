const { chromium } = require('playwright');
// Банка 2D (src/minigames/greed/greed-jar3.js) прямо в игре по позам:
//   NODE_PATH=... node jar2d-shot.js /tmp/j2d- '[{"cx":318,"cy":716,"k":158,"roll":18,"yaw":-32,"view":0.16}]'
// Банка 2D (greed-jar3.js) прямо в игре: холст поверх аппарата, ПОД рамкой
// из монет; поза — с болванки (покой).
(async () => {
  const b = await chromium.launch({ executablePath: require('../../chrome-path') });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.addInitScript(() => { localStorage.setItem('gj-wheel','1'); localStorage.setItem('gj-pachinko','1'); });
  await page.goto('http://127.0.0.1:8777/index.html'); await page.waitForTimeout(2500);
  await page.evaluate(() => { Backend.grantCurrency('gold',200); const u=GameState.data.upgrades||(GameState.data.upgrades={}); u.greed_wheel=1; u.greed_pachinko=1; GameState.save(); GreedMinigame.play={slots:null,wheel:null,pachinko:null}; GameManager.handleSinAction('greed'); });
  await page.waitForFunction(() => window.GreedJunkLit && GreedJunkLit.lever, null, {timeout:30000}).catch(()=>{});
  await page.evaluate(() => { Tilt.turn = () => ({ live: true, x: 0, y: 0 }); }); await page.waitForTimeout(2000);
  await page.addScriptTag({ url: '/src/minigames/greed/greed-jar3.js' });
  await page.addScriptTag({ url: '/src/minigames/greed/greed-jar3-coins.js' });
  const poses = JSON.parse(process.argv[3] || '[]');
  for (const [i, P] of poses.entries()) {
    await page.evaluate((P) => {
      GreedJunkLit.jarCv.style.visibility = 'hidden';
      let cv = document.getElementById('jar3cv');
      const host = GreedJunkLit.wrapEl.parentElement;
      if (!cv) { cv = document.createElement('canvas'); cv.id = 'jar3cv'; host.appendChild(cv); }
      // тело окна масштабировано трансформом: холст — в своих единицах
      // (offsetWidth), поза — в точках экрана; перевод через масштаб m
      const hr = host.getBoundingClientRect(), W = host.offsetWidth, H = host.offsetHeight, m = hr.width / W;
      cv.width = W * 3; cv.height = H * 3;
      cv.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:5;pointer-events:none;background:none`;
      const c = cv.getContext('2d'); c.setTransform(3 / m, 0, 0, 3 / m, -hr.left * 3 / m, -hr.top * 3 / m); c.clearRect(-1e4, -1e4, 2e4, 2e4);
      // st — магазин на скотче (в упор): бумага без числа + холст магазина
      const tape = GreedJar3.tapeCoins(P.st ? '' : 200), shop = P.st ? GreedJar3.tapeShop(P.st) : null;
      GreedJar3.draw(c, Object.assign({ tape, shop, coins: !P.st }, P));
    }, P);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${process.argv[2]}${i}.png` });
  }
  await b.close();
})();
