const { chromium } = require('playwright');
// Видео: банка-магазин → последний жетон в колесо → сборка колеса за
// стеклом → банка поднимается. Запись — playwright recordVideo (в реальном
// времени), кадры — ffmpeg. Проверки — ошибки страницы, колесо открыто.
//   NODE_PATH=... node assembly-video.js /tmp/av/
(async () => {
  const dir = process.argv[2] || '/tmp/av/';
  const b = await chromium.launch({ executablePath: require('../../chrome-path') });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, recordVideo: { dir, size: { width: 390, height: 844 } } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' || /Сборка/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript(() => { localStorage.setItem('gj-wheel', '0'); localStorage.setItem('gj-pachinko', '0'); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  await page.evaluate(() => { Backend.grantCurrency('gold', 200); Backend.grantCurrency('greed_token', 4);
    const u = GameState.data.upgrades || (GameState.data.upgrades = {}); u.greed_wheel = 0; u.greed_pachinko = 0; GameState.data.greed.jar = { wheel: 5, pachinko: 0, v2: 0 }; GameState.save();
    GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); });
  await page.waitForFunction(() => window.GreedJunkLit && GreedJunkLit.lever, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => { Tilt.turn = () => ({ live: true, x: 0, y: 0 }); }); await page.waitForTimeout(2500);
  const at = (x, y) => page.evaluate(([x, y]) => { const S = GreedJarShop, r = S.host.getBoundingClientRect(), s = r.width / S.host.offsetWidth, [px, py] = S.toScene(x, y); return [r.left + px * s, r.top + py * s]; }, [x, y]);
  const t0 = Date.now();
  await page.mouse.click(...await at(305, 590)); await page.waitForTimeout(1800);
  const [wx, wy] = await at(...await page.evaluate(() => GreedJarShop.shopToField(...GreedJarShop.NODES.wheel)));
  console.log('магазин открыт через', Date.now() - t0, 'мс');
  const t1 = Date.now();
  await page.mouse.click(wx, wy);
  await page.waitForFunction(() => !GreedJarShop.busy && GreedJarShop.low && GreedJarShop.low.to === 0, null, { timeout: 30000 }).catch(e => errs.push('ждали конца сборки: ' + e.message));
  console.log('вкинут последний жетон → сборка и подъём банки:', Date.now() - t1, 'мс (вкидывание на', ((t1 - t0) / 1000).toFixed(1), 'с видео)');
  await page.waitForTimeout(1200);
  console.log(await page.evaluate(() => Backend.greedLevel('wheel') >= 1 && !!GreedJunkLit.wheelCv) ? '  ok  колесо открыто и стоит' : '  ✗   колеса нет');
  await page.mouse.click(...await at(180, 60)); await page.waitForTimeout(1400);
  console.log(errs.length ? 'ошибки:\n' + errs.join('\n') : 'ошибок страницы нет');
  await ctx.close(); await b.close();
})();
