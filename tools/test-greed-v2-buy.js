const { chromium } = require('playwright');
// ================= АППАРАТ АЛЧНОСТИ: ПОКУПКА ВЕРСИИ 2 БЕЗ ЗАГОТОВКИ =================
// Игрок, 22.11: игра вылетала в Telegram на третьем жетоне в версию 2 после
// покупки колеса и пачинко в той же сессии. Причина — заготовка: версия 2
// собиралась целиком, скрытой под живым гаражным, как только жетонов
// хватало, — два аппарата в памяти всё время, пока кидаются жетоны.
// Теперь заготовки нет: при покупке гаражный — в картинку на его месте,
// его контексты назад, версия 2 собирается под картинкой (GreedLux.castRun).
// Проверяет:
//   * жетонов хватает — версия 2 НЕ собрана, живых контекстов как у гаражного;
//   * покупка — ни в один кадр гаражный и версия 2 не живут вместе;
//   * версия 2 стоит, гаражный снят, картинка гаражного убрана, литьё идёт;
//   * самый долгий кадр от последнего жетона до начала литья (цена сборки).
//   NODE_PATH=/opt/node22/lib/node_modules node tools/test-greed-v2-buy.js
(async () => {
  const [vw, vh] = (process.env.SVINO_VIEWPORT || '390x844').split('x').map(Number);
  const b = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let bad = 0;
  const ok = (c, m) => { console.log((c ? '  ok  ' : '  ✗   ') + m); if (!c) bad++; };
  await page.addInitScript(() => {
    localStorage.removeItem('gj-skin-slots');
    window.__ctx = [];
    const g = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, o) { const c = g.call(this, t, o); if (c && /webgl/.test(t) && !this.__gl) { this.__gl = c; window.__ctx.push(this); } return c; };
    window.__live = () => window.__ctx.filter(cv => !cv.__gl.isContextLost()).length;
  });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  // обе ветки открыты, жетонов на версию 2 с запасом
  await page.evaluate(() => {
    const u = GameState.data.upgrades || (GameState.data.upgrades = {});
    u.greed_slots = 0; u.greed_wheel = 1; u.greed_pachinko = 1;
    const g = GameState.data.greed || (GameState.data.greed = {}); g.jar = { wheel: 12, pachinko: 12, v2: ECONOMY.minigames.greed.jar.v2 - 3 };
    Backend.grantCurrency('greed_token', 10); Backend.grantCurrency('gold', 200); GameState.save();
    GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed');
  });
  await page.evaluate(() => GreedMinigame.veilReady());
  await page.evaluate(() => { const J = GreedJarShop; J.state = 'opening'; J.t0 = performance.now(); J.dirty = true; J.cv.style.pointerEvents = 'auto'; });
  await page.waitForFunction(() => GreedJarShop.state === 'open', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const p1 = await page.evaluate(() => ({ m: GreedMinigame.M === GreedJunkLit, v2: !!GreedLux.wrapEl || !!GreedLux.gl, live: window.__live() }));
  ok(p1.m && !p1.v2, 'жетонов хватает, банка открыта — версия 2 не собрана (заготовки нет)');
  ok(p1.live <= 5, `живых контекстов — только гаражного: ${p1.live}`);
  // жетоны до заполнения — как тапами; каждый кадр: живут ли оба аппарата
  const r = await page.evaluate(async () => {
    let both = 0, gap = 0, last = performance.now(), run = true;
    const f = (t) => {
      if (GreedLux.gl && !GreedLux.gl.isContextLost() && GreedJunkLit.gl && !GreedJunkLit.gl.isContextLost()) both++;
      if (!GreedLux._cast) gap = Math.max(gap, t - last);
      last = t; if (run) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    const J = GreedJarShop;
    for (let i = 0; i < 3; i++) { J.hold = { node: 'v2', next: 0, dt: 99999 }; J.deposit(); J.holdStop(); await new Promise(r => setTimeout(r, 300)); }
    const t0 = performance.now();
    for (let i = 0; i < 300 && !(GreedLux._cast && GreedLux._castC); i++) await new Promise(r => setTimeout(r, 50));
    const ms = performance.now() - t0;
    await new Promise(r => setTimeout(r, 600)); run = false;
    const cover = [...GreedLux.wrapEl.parentElement.children].some(el => el.tagName === 'CANVAS' && el.style.zIndex === '5');
    return { both, gap: Math.round(gap), ms: Math.round(ms), M: GreedMinigame.M === GreedLux, cast: !!GreedLux._cast,
      junk: !(GreedJunkLit.wrapEl && GreedJunkLit.wrapEl.isConnected) && !GreedJunkLit.gl, cover, raf: !!GreedLux.raf };
  });
  ok(r.M && r.cast, 'последний жетон — версия 2 куплена, стоит, литьё идёт');
  ok(r.both === 0, `ни в один кадр гаражный и версия 2 не живут вместе (кадров с обоими: ${r.both})`);
  ok(r.junk && !r.cover && r.raf, 'гаражный снят, его картинка убрана, цикл кадров версии 2 идёт');
  console.log(`  ·   от последнего жетона до литья: ${r.ms} мс, самый долгий кадр ${r.gap} мс`);
  ok(!errs.length, errs.length ? 'ошибки:\n' + errs.join('\n') : 'ошибок страницы нет');
  console.log(bad ? `провалов: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
