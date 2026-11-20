const { chromium } = require('playwright');
// ================= АППАРАТ АЛЧНОСТИ: ПОКУПКА ВЕРСИИ 2 =================
// План 31, разд. 5г, п. 1. Жетонов на версию 2 хватает — она собирается
// заранее, скрытой под гаражным (greed-lux-prep.js): гаражный играет, его
// раскладка не сдвинута, заготовка пальцы не ловит и кадров не крутит.
// Покупка — та же обёртка становится видимой (ничего не собирается заново),
// гаражный и банка сняты. Ушёл, не купив, — заготовка снята с контекстами.
//   NODE_PATH=/opt/node22/lib/node_modules node tools/test-greed-v2-buy.js
(async () => {
  const [vw, vh] = (process.env.SVINO_VIEWPORT || '390x844').split('x').map(Number);
  const b = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let bad = 0;
  const ok = (c, m) => { console.log((c ? '  ok  ' : '  ✗   ') + m); if (!c) bad++; };
  await page.addInitScript(() => { localStorage.removeItem('gj-skin-slots'); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  // обе ветки открыты, в копилке v2 не хватает одного жетона, жетон есть
  const enter = () => page.evaluate(async () => {
    GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed');
    await GreedMinigame.veilReady();
  });
  await page.evaluate(() => {
    const u = GameState.data.upgrades || (GameState.data.upgrades = {});
    u.greed_slots = 0; u.greed_wheel = 1; u.greed_pachinko = 1;
    const g = GameState.data.greed || (GameState.data.greed = {}); g.jar = { wheel: 6, pachinko: 6, v2: ECONOMY.minigames.greed.jar.v2 - 1 };
    Backend.grantCurrency('greed_token', 1); Backend.grantCurrency('gold', 200); GameState.save();
  });
  await enter();
  await page.waitForFunction(() => GreedLux._prep && GreedLux.gl, null, { timeout: 20000 }).catch(() => {});
  const p1 = await page.evaluate(() => {
    const W = GreedLux.wrapEl, L = GreedJunkLit.wrapEl, cs = W && getComputedStyle(W);
    return { m: GreedMinigame.M === GreedJunkLit, prep: !!GreedLux._prep, gl: !!GreedLux.gl, raf: !!GreedLux.raf,
      hidden: cs && cs.opacity === '0' && cs.position === 'absolute' && cs.pointerEvents === 'none',
      sameParent: W && L && W.parentElement === L.parentElement, lx: L.getBoundingClientRect().left };
  });
  ok(p1.m && p1.prep && p1.gl, `заготовка собрана под гаражным (гаражный стоит: ${p1.m}, корпус: ${p1.gl})`);
  ok(p1.hidden && p1.sameParent, 'заготовка скрыта, вне раскладки, пальцы не ловит');
  ok(!p1.raf, 'цикл кадров у заготовки стоит');
  // ушёл — заготовка снята; вернулся — собрана снова
  await page.evaluate(() => GreedMinigame.close());
  ok(await page.evaluate(() => !GreedLux.wrapEl && !GreedLux.gl && !GreedLux._prep), 'закрыл игру — заготовка снята');
  await enter();
  await page.waitForFunction(() => GreedLux._prep && GreedLux.gl, null, { timeout: 20000 }).catch(() => {});
  if (process.env.NOPREP) await page.evaluate(() => { window.NOPREP = 1; });
  // покупка: последний жетон, затем то, что делает банка после закрытия
  const r = await page.evaluate(async () => {
    if (window.NOPREP) GreedLux.prepDrop();
    const W0 = GreedLux.wrapEl, gl0 = GreedLux.gl;
    const d = Backend.greedDeposit('v2');
    let gap = 0, last = performance.now(), run = true;
    const f = (t) => { gap = Math.max(gap, t - last); last = t; if (run) requestAnimationFrame(f); }; requestAnimationFrame(f);
    const t0 = performance.now(); await GreedDebug.rebuild(); const ms = performance.now() - t0;
    await new Promise(r => setTimeout(r, 400)); run = false;
    const W = GreedLux.wrapEl, cs = getComputedStyle(W);
    return { opened: d.opened, M: GreedMinigame.M === GreedLux, same: W === W0 && GreedLux.gl === gl0, vis: cs.opacity === '1' && cs.position === 'relative',
      raf: !!GreedLux.raf, prep: !!GreedLux._prep, junk: !(GreedJunkLit.wrapEl && GreedJunkLit.wrapEl.isConnected), jar: !GreedJarShop.cv, ms: Math.round(ms), gap: Math.round(gap) };
  });
  ok(r.opened && r.M, 'последний жетон — версия 2 куплена и стоит');
  ok(r.same, 'стоит та же заготовка: обёртка и контекст не пересозданы');
  ok(r.vis && r.raf && !r.prep, 'показана, цикл кадров идёт');
  ok(r.junk && r.jar, 'гаражный и банка сняты');
  console.log(`  ·   смена аппарата: ${r.ms} мс, самый долгий кадр ${r.gap} мс`);
  ok(!errs.length, errs.length ? 'ошибки:\n' + errs.join('\n') : 'ошибок страницы нет');
  console.log(bad ? `провалов: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
