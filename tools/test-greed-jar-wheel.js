const { chromium } = require('playwright');
// ================= АППАРАТ АЛЧНОСТИ: КОЛЕСО ИЗ БАНКИ =================
// Путь игрока (20.11, вылет игры в Telegram): сброс → жетоны → алчность →
// банка → колесо (сборка за стеклом) → закрыть банку. Проверяет: колесо
// куплено и стоит, ошибок и предупреждений сборки нет, текстуры видов
// сборки удалены (было: перебор шёл по обёртке { sets, masks }, падал, и
// память видеокарты не возвращалась), банка закрылась.
//   NODE_PATH=/opt/node22/lib/node_modules node tools/test-greed-jar-wheel.js
(async () => {
  const b = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (/Сборка|\[Аппарат\]/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  let bad = 0;
  const ok = (c, m) => { console.log((c ? '  ok  ' : '  ✗   ') + m); if (!c) bad++; };
  await page.addInitScript(() => { localStorage.removeItem('gj-skin-slots'); localStorage.removeItem('gj-wheel'); localStorage.removeItem('gj-pachinko'); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  await page.evaluate(() => { GameState.reset(); Backend.grantCurrency('greed_token', 40); Backend.grantCurrency('gold', 300); GameState.save();
    GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); });
  await page.evaluate(() => GreedMinigame.veilReady()); await page.waitForTimeout(1500);
  await page.evaluate(() => { const J = GreedJarShop; J.state = 'opening'; J.t0 = performance.now(); J.dirty = true; J.cv.style.pointerEvents = 'auto'; });
  await page.waitForFunction(() => GreedJarShop.state === 'open', null, { timeout: 8000 }).catch(() => {});
  // считать удалённые текстуры прибора колеса
  await page.evaluate(() => { window.__del = 0; const wrap = () => { const Q = GreedJunkLit._wgl; if (Q && Q.gl && !Q.gl.__w) { const d = Q.gl.deleteTexture.bind(Q.gl); Q.gl.deleteTexture = (t) => { window.__del++; return d(t); }; Q.gl.__w = 1; } }; window.__wrapT = setInterval(wrap, 50); });
  await page.evaluate(() => { const J = GreedJarShop; J.hold = { node: 'wheel', next: 0, dt: 120 }; J.deposit(); });
  await page.waitForFunction(() => (GameState.data.upgrades || {}).greed_wheel >= 1, null, { timeout: 20000 }).catch(() => {});
  await page.waitForFunction(() => !GreedJarShop.busy, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
  const s = await page.evaluate(() => ({ lvl: Backend.greedLevel('wheel'), wheel: !!GreedJunkLit._wgl, del: window.__del }));
  ok(s.lvl >= 1 && s.wheel, 'колесо куплено и стоит');
  ok(s.del > 0, `текстуры видов сборки удалены: ${s.del}`);
  await page.evaluate(() => { clearInterval(window.__wrapT); GreedJarShop.close(); });
  await page.waitForFunction(() => GreedJarShop.state === 'rest', null, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => GreedJarShop.state === 'rest'), 'банка закрылась');
  ok(!errs.length, errs.length ? 'ошибки:\n' + errs.join('\n') : 'ошибок и предупреждений сборки нет');
  console.log(bad ? `провалов: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
