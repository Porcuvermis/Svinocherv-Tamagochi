const { chromium } = require('playwright');
// Банка-магазин в игре: покой → тап → магазин → вкидывание (тап и
// удержание) → открытие колеса → выход. Снимки и проверки.
//   NODE_PATH=... node jar-shop-test.js /tmp/js-
(async () => {
  const out = process.argv[2] || '/tmp/js-';
  const b = await chromium.launch({ executablePath: require('../../chrome-path') });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.addInitScript(() => { localStorage.setItem('gj-wheel', '0'); localStorage.setItem('gj-pachinko', '0'); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  await page.evaluate(() => { Backend.grantCurrency('gold', 200); Backend.grantCurrency('greed_token', 9);
    const u = GameState.data.upgrades || (GameState.data.upgrades = {}); u.greed_wheel = 0; u.greed_pachinko = 0; GameState.data.greed.jar = { wheel: 3, pachinko: 0, v2: 0 }; GameState.save();
    GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); });
  await page.waitForFunction(() => window.GreedJunkLit && GreedJunkLit.lever, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => { Tilt.turn = () => ({ live: true, x: 0, y: 0 }); }); await page.waitForTimeout(1500);
  const shot = (n) => page.screenshot({ path: out + n + '.png' });
  const at = (x, y) => page.evaluate(([x, y]) => { const S = GreedJarShop, r = S.host.getBoundingClientRect(), s = r.width / S.host.offsetWidth, [px, py] = S.toScene(x, y); return [r.left + px * s, r.top + py * s]; }, [x, y]);
  const ok = (c, m) => console.log((c ? '  ok  ' : '  ✗   ') + m);
  await shot('0-rest');
  const [jx, jy] = await at(305, 590);
  await page.mouse.click(jx, jy);
  await page.waitForTimeout(250); await shot('1-fly');
  await page.waitForTimeout(900); await shot('2-open');
  ok(await page.evaluate(() => GreedJarShop.state === 'open'), 'тап по банке — магазин открыт');
  const node = (k) => page.evaluate((k) => GreedJarShop.shopToField(...GreedJarShop.NODES[k]), k);
  const [wx, wy] = await at(...await node('wheel'));
  const t0 = await page.evaluate(() => GameState.currency('greed_token'));
  await page.mouse.click(wx, wy); await page.waitForTimeout(90); await shot('3-drop');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => Backend.greedJar().wheel === 4), 'тап по колесу — +1 в копилку');
  ok(await page.evaluate((t0) => GameState.currency('greed_token') === t0 - 1, t0), 'жетон списан');
  await page.mouse.move(wx, wy); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
  await page.waitForTimeout(200); await shot('4-done');
  ok(await page.evaluate(() => Backend.greedLevel('wheel') >= 1), 'удержание — копилка полна, колесо открыто');
  // колесо собирается за стеклом банки; банка опускается и поднимается, магазин открыт
  await page.waitForFunction(() => !GreedJarShop.busy, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600); await shot('5-back');
  ok(await page.evaluate(() => GreedJarShop.state === 'open' && GreedJarShop.lowAt(performance.now()) === 0), 'после сборки банка поднялась, магазин открыт');
  ok(await page.evaluate(() => !!GreedJunkLit.wheelCv && !GreedAssembly.ov), 'аппарат с колесом, стоп-кадра нет');
  await shot('6-wheel');
  // подготовка рычага отложена до конца сборки — потом он готов
  await page.waitForFunction(() => GreedJunkLit.lever, null, { timeout: 20000 }).catch(() => {});
  ok(await page.evaluate(() => !!GreedJunkLit.lever), 'рычаг после сборки готов');
  // пачинко: копилка до конца — собирается за стеклом так же
  await page.evaluate(() => { Backend.grantCurrency('greed_token', 6); });
  const [qx, qy] = await at(...await node('pachinko'));
  await page.mouse.move(qx, qy); await page.mouse.down(); await page.waitForTimeout(2200); await page.mouse.up();
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !GreedJarShop.busy, null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(600); await shot('7-pach');
  ok(await page.evaluate(() => Backend.greedLevel('pachinko') >= 1 && !!GreedJunkLit.pachCv && !GreedAssembly.base), 'пачинко открыто и собрано, стоп-кадра нет');
  // выход тапом по стеклу
  await page.mouse.click(...await at(180, 60)); await page.waitForTimeout(1300);
  ok(await page.evaluate(() => GreedJarShop.state === 'rest'), 'тап по стеклу — выход');
  console.log(errs.length ? 'ошибки:\n' + errs.join('\n') : 'ошибок страницы нет');
  await b.close();
})();
