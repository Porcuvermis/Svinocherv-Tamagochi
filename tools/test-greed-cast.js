const { chromium } = require('playwright');
// ================= АППАРАТ АЛЧНОСТИ: ЛИТЬЁ ВЕРСИИ 2 =================
// План 31, разд. 5г, п. 2. Последний жетон в узел версии 2 — банка выливает
// расплав на гаражный аппарат, и под ним проступает версия 2 (greed-lux-cast.js).
// Проверяет ход целиком, по-настоящему (рычаг — пальцем):
//   * под банкой гаражный снят (его контексты потеряны), стоит версия 2;
//   * пока льётся, палец в аппарат не проходит;
//   * экраны включаются по очереди, сверху вниз;
//   * в конце холст литья и его контекст сняты, банка снята, рычаг играет;
//   * закрыл окно посреди литья — всё снято, при входе версия 2 без литья.
//   NODE_PATH=/opt/node22/lib/node_modules node tools/test-greed-cast.js [/tmp/cast-]
(async () => {
  const out = process.argv[2] || '/tmp/cast-';
  const [vw, vh] = (process.env.SVINO_VIEWPORT || '390x844').split('x').map(Number);
  const b = await chromium.launch({ executablePath: require('./chrome-path') });
  let bad = 0;
  const ok = (c, m) => { console.log((c ? '  ok  ' : '  ✗   ') + m); if (!c) bad++; };
  const open = async () => {
    const page = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
    page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
    await page.addInitScript(() => { localStorage.removeItem('gj-skin-slots'); localStorage.setItem('gj-wheel', '1'); localStorage.setItem('gj-pachinko', '1'); });
    await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const u = GameState.data.upgrades || (GameState.data.upgrades = {}); u.greed_slots = 0; u.greed_wheel = 1; u.greed_pachinko = 1;
      const g = GameState.data.greed || (GameState.data.greed = {}); g.jar = { wheel: 6, pachinko: 6, v2: ECONOMY.minigames.greed.jar.v2 - 1 };
      Backend.grantCurrency('greed_token', 1); Backend.grantCurrency('gold', 300); GameState.save();
      GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed');
    });
    await page.evaluate(() => GreedMinigame.veilReady());
    await page.waitForFunction(() => GreedLux._prep && GreedLux.gl && GreedLux._kgl, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(800);
    return page;
  };
  // последний жетон из открытой банки
  const buy = (page) => page.evaluate(() => {
    const J = GreedJarShop; J.state = 'open'; J.dirty = true;
    const d = Backend.greedDeposit('v2'); if (d.opened) J.opened('v2'); return d.opened;
  });
  const at = (page, x, y) => page.evaluate(([x, y]) => { const w = GreedLux.wrapEl.getBoundingClientRect(); return [w.left + x / 360 * w.width, w.top + (y + 57) / 696 * w.height]; }, [x, y]);

  // ---------- ход целиком ----------
  const page = await open();
  ok(await buy(page), 'последний жетон — узел версии 2 заполнен');
  await page.waitForFunction(() => GreedLux._cast && GreedLux._castC, null, { timeout: 15000 }).catch(() => {});
  const s1 = await page.evaluate(() => ({ cast: !!GreedLux._cast, M: GreedMinigame.M === GreedLux, junk: !GreedJunkLit.wrapEl, heat: !!GreedLux._castH,
    jar: GreedJarShop.state, boot: !!GreedLux._boot }));
  ok(s1.cast && s1.M && s1.junk, 'литьё идёт: гаражный снят, стоит версия 2');
  ok(s1.heat && s1.boot && s1.jar === 'pour', 'жар литого, план включения экранов, банка льёт');
  // палец в аппарат не проходит
  await page.evaluate(() => { window.__pd = 0; GreedLux.wrapEl.addEventListener('pointerdown', () => window.__pd++); });
  const [bx, by] = await at(page, 314, 299);
  await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.up();
  ok(await page.evaluate(() => window.__pd === 0), 'палец в аппарат не проходит, пока льётся');
  // экраны — по очереди, сверху вниз (расписание, а не замер вживую: на
  // машине без видеокарты кадры по полсекунды, «середина» плавает)
  const plan = await page.evaluate(() => { const B = GreedLux._boot, w = B.wheel.filter(x => x != null); return { pach: B.pach, led: B.led, small: B.small, w0: Math.min(...w), w1: Math.max(...w) }; });
  ok(plan.pach < plan.led && plan.led < plan.small, `экраны сверху вниз: пачинко ${plan.pach | 0} → LED ${plan.led | 0} → табло ${plan.small | 0} мс`);
  ok(plan.w1 - plan.w0 > 300, `сектора колеса — по одному: ${plan.w0 | 0}…${plan.w1 | 0} мс`);
  // конец
  await page.waitForFunction(() => !GreedLux._cast, null, { timeout: 40000 }).catch(() => {});
  const s2 = await page.evaluate(() => ({ cast: !!GreedLux._cast, cv: !!GreedLux._castC, jar: !GreedJarShop.cv, boot: !GreedLux._boot,
    z5: [...GreedLux.wrapEl.querySelectorAll('canvas')].some(c => c.style.zIndex === '5') }));
  ok(!s2.cast && !s2.cv && !s2.z5, 'литьё кончилось: холст литья снят');
  ok(s2.jar && s2.boot, 'банка снята, экраны горят');
  await page.screenshot({ path: out + 'end.png' });
  // рычаг играет
  await page.evaluate(() => { const g = Backend.greedSpin; window.__spins = 0; Backend.greedSpin = function () { window.__spins++; return g.apply(this, arguments); }; });
  await page.waitForFunction(() => GreedLux.ready, null, { timeout: 8000 }).catch(() => {});
  await page.mouse.move(bx, by); await page.mouse.down();
  for (let k = 1; k <= 14; k++) { const [x, y] = await at(page, 314, 299 + k * 4); await page.mouse.move(x, y); await page.waitForTimeout(25); }
  await page.mouse.up();
  await page.waitForFunction(() => window.__spins > 0, null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => window.__spins > 0), 'после литья рычаг играет');
  ok(!page.errs.length, page.errs.length ? 'ошибки:\n' + page.errs.join('\n') : 'ошибок страницы нет');
  await page.close();

  // ---------- закрыл окно посреди литья ----------
  const p2 = await open();
  await buy(p2);
  await p2.waitForFunction(() => GreedLux._cast, null, { timeout: 15000 }).catch(() => {});
  await p2.waitForTimeout(1500);
  await p2.evaluate(() => GreedMinigame.close());
  const s3 = await p2.evaluate(() => ({ cast: !!GreedLux._cast, cv: !!GreedLux._castC, jar: !GreedJarShop.cv }));
  ok(!s3.cast && !s3.cv && s3.jar, 'закрыл посреди литья — холст литья и банка сняты');
  await p2.evaluate(async () => { GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); await GreedMinigame.veilReady(); });
  await p2.waitForTimeout(500);
  ok(await p2.evaluate(() => GreedMinigame.M === GreedLux && !GreedLux._cast && !!GreedLux.raf), 'снова вошёл — версия 2 стоит, без литья');
  ok(!p2.errs.length, p2.errs.length ? 'ошибки:\n' + p2.errs.join('\n') : 'ошибок страницы нет');
  console.log(bad ? `провалов: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
