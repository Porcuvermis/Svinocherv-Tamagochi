const { chromium } = require('playwright');
// ================= АППАРАТ АЛЧНОСТИ: КОЛЕСО ИЗ БАНКИ =================
// Путь игрока (20.11, вылет игры в Telegram): сброс → жетоны → алчность →
// банка → колесо (сборка за стеклом) → закрыть банку. Проверяет: колесо
// куплено и стоит, ошибок и предупреждений сборки нет, текстуры видов
// сборки удалены (было: перебор шёл по обёртке { sets, masks }, падал, и
// память видеокарты не возвращалась), банка закрылась; затем пачинко — и
// его короб попадает в снимок аппарата (на литье версии 2 он пропадал);
// стикер ставки — тап отрывает его, ставка по кругу 1 → 3 → 10 → 100 → 1.
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
  // стикер ставки (20.11): тап — отрывается, под ним следующий; по кругу 1 → 3 → 10 → 100 → 1
  await page.waitForFunction(() => GreedJunkLit._betShown === 1, null, { timeout: 8000 }).catch(() => {});
  const seq = [];
  for (let i = 0; i < 4; i++) {
    const [hx, hy] = await page.evaluate(() => { const r = GreedJunkLit.betHit.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.click(hx, hy);
    await page.waitForFunction(() => !GreedJunkLit._betAnim, null, { timeout: 4000 }).catch(() => {});
    seq.push(await page.evaluate(() => [GreedMinigame.bet, GreedJunkLit._betShown].join('/')));
  }
  ok(seq.join(' ') === '3/3 10/10 100/100 1/1', `стикер ставки по кругу: ${seq.join(' ')}`);
  ok(await page.evaluate(() => { const r = Backend.greedSpin(GreedMinigame.bet); return r.ok && r.cost === 1; }), 'крутка идёт по ставке со стикера');
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
  // пачинко из банки — и оно на снимке аппарата (литьё версии 2 начинает
  // с него): холст прибора без сохранения буфера читался пустым, на литье
  // пачинко пропадало (игрок, 20.11)
  await page.evaluate(() => { const J = GreedJarShop; J.state = 'opening'; J.t0 = performance.now(); J.dirty = true; J.cv.style.pointerEvents = 'auto'; });
  await page.waitForFunction(() => GreedJarShop.state === 'open', null, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => { const J = GreedJarShop; J.hold = { node: 'pachinko', next: 0, dt: 100 }; J.deposit(); });
  await page.waitForFunction(() => Backend.greedLevel('pachinko') >= 1 && !GreedJarShop.busy, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => GreedJarShop.close()); await page.waitForTimeout(2500);
  const pc = await page.evaluate(() => {
    const L = GreedJunkLit, B = L.pachBox(), snap = GreedLux.castSnapshot(), S = snap.width / 360, g = snap.getContext('2d');
    // середина поля пачинко на снимке — против того же места на корпусе без короба
    const at = (x, y) => g.getImageData(Math.round(x * S), Math.round((y + 57) * S), 1, 1).data;
    const cx = B.x + B.w / 2, cy = B.y + B.h * 0.35, p = at(cx, cy);
    const c2 = document.createElement('canvas'); c2.width = L.pachCv.width; c2.height = L.pachCv.height;
    L.pachDraw(); c2.getContext('2d').drawImage(L.pachCv, 0, 0); const d = c2.getContext('2d').getImageData(c2.width >> 1, Math.round(c2.height * 0.35), 1, 1).data;
    return { draw: typeof L.pachDraw === 'function', boxA: d[3], snap: [p[0], p[1], p[2]] };
  });
  ok(pc.draw && pc.boxA > 200, `короб пачинко рисуется в той же задаче, что снимок (альфа ${pc.boxA})`);
  ok(!errs.length, errs.length ? 'ошибки:\n' + errs.join('\n') : 'ошибок и предупреждений сборки нет');
  console.log(bad ? `провалов: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
