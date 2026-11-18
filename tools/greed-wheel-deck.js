const { chromium } = require('playwright');
// ================= КОЛОДА КОЛЕСА: ПРОВЕРКА =================
// Колесо алчности тасует значки за кадром (greed-junk-lit-wheel-deck.js,
// docs/plan/31-greed-premium.md, разд. 0б). Проверяется:
//   1. логика: выпавший приз всегда на секторе под язычком, ложные редкие —
//      примерно вдвое чаще шанса выпасть и не рядом с выпавшим;
//   2. настоящие крутки игры: под язычком — ключ исхода, каждая подмена —
//      когда сектор целиком под монетами, вынужденных на виду нет;
//   3. пиксели: кусок, переписанный в текстуры, совпадает с диском,
//      растрированным целиком по той же раскладке (шва нет).
//   NODE_PATH=/opt/node22/lib/node_modules node tools/greed-wheel-deck.js [/tmp/wd-]
(async () => {
  const out = process.argv[2] || '/tmp/wd-';
  const b = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let bad = 0;
  const ok = (c, m) => { console.log((c ? '  ok  ' : '  ✗   ') + m); if (!c) bad++; };
  await page.addInitScript(() => { localStorage.setItem('gj-wheel', '1'); localStorage.setItem('gj-pachinko', '0'); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  await page.evaluate(() => { Backend.grantCurrency('gold', 5000);
    const u = GameState.data.upgrades || (GameState.data.upgrades = {}); u.greed_wheel = 1; GameState.save();
    GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); });
  await page.waitForFunction(() => typeof GreedJunkLit !== 'undefined' && GreedJunkLit._wgl && GreedJunkLit._deck, null, { timeout: 90000, polling: 500 });
  await page.evaluate(() => { Tilt.turn = () => ({ live: true, x: 0, y: 0 }); });
  await page.waitForTimeout(1500);

  // ---------- 1. логика на 20000 планах (без подмены) ----------
  const L1 = await page.evaluate(() => {
    const L = GreedJunkLit, G = GreedJunk, p = L.wheelOdds(), keys = Object.keys(p), n = G.wheelKeys().length;
    const pick = () => { let r = Math.random(), k; for (k of keys) { r -= p[k]; if (r < 0) return k; } return k; };
    const rare = keys.filter(k => p[k] < L.WHEEL_RARE), shown = {}, near = { n: 0 };
    rare.forEach(k => { shown[k] = 0; });
    let wrong = 0;
    const save = G.wheelNow.slice(), D = L._deck;
    const N = 20000;
    for (let t = 0; t < N; t++) {
      const key = pick(), idx = L.wheelDeckPlan(key);
      const next = G.wheelNow.slice(); D.queue.forEach(q => { next[q.i] = q.k; });
      if (next[idx] !== key) wrong++;
      rare.forEach(k => {
        // ложный: редкий не на выпавшем секторе
        if (next.some((x, i) => x === k && i !== idx)) shown[k]++;
      });
      next.forEach((x, i) => { if (i !== idx && rare.includes(x) && Math.min((i - idx + n) % n, (idx - i + n) % n) <= 2) near.n++; });
      G.wheelNow = next;
    }
    G.wheelNow = save; D.queue = [];
    return { wrong, rare, shown: Object.fromEntries(rare.map(k => [k, shown[k] / N])), p: Object.fromEntries(rare.map(k => [k, p[k]])), near: near.n };
  });
  ok(L1.wrong === 0, 'выпавший приз всегда на секторе под язычком');
  L1.rare.forEach(k => ok(Math.abs(L1.shown[k] / L1.p[k] - 2) < 0.35,
    `${k}: выпадает ${(L1.p[k] * 100).toFixed(1)}%, ложно на колесе ${(L1.shown[k] * 100).toFixed(1)}% круток (≈ вдвое)`));
  ok(L1.near === 0, 'ложные редкие не встают рядом с выпавшим');

  // ---------- 2. настоящие крутки ----------
  await page.evaluate(() => {
    const L = GreedJunkLit;
    window.__wd = { spins: [], visibleSwaps: 0 };
    // подмена легла — сектор под монетами? (в момент записи в текстуры)
    const orig = L.wheelSwap;
    L.wheelSwap = function (c) { this._deck.cur = c; return orig.call(this, c); };
    const up = L.deviceTile;
    L.deviceTile = function (Q, st, imgs, x, y) {
      const c = this._deck && this._deck.cur;
      if (st === Q.disc && c && !c.force && !this.wheelHidden(c.i, this._wheel.rot)) window.__wd.visibleSwaps++;
      return up.call(this, Q, st, imgs, x, y);
    };
    const done = L.onWheelDone;
    L.onWheelDone = function () {
      const D = this._deck, G = GreedJunk;
      window.__wd.spins.push({ key: window.__wd.last, under: G.wheelNow[D.target], forced: D.forced, left: D.queue.length });
      return done && done.apply(this, arguments);
    };
    const ow = L.onWheel;
    L.onWheel = function () { const k = ow.apply(this, arguments); window.__wd.last = k; return k; };
  });
  const SPINS = +(process.env.SPINS || 10);
  for (let i = 0; i < SPINS; i++) {
    // бросок — когда игра готова к новой крутке: прошлая ещё доигрывает
    // выигрыш, и бросок в это время игра отклоняет (why: refused)
    for (let tries = 0; tries < 20; tries++) {
      const why = await page.evaluate(() => { const L = GreedJunkLit; L.wheelThrow(L.WHEEL_SPIN.maxW * (Math.random() < 0.5 ? 1 : 0.7), performance.now()); return L.wheelLast.why; });
      if (why === 'play') break;
      await page.waitForTimeout(500);
    }
    await page.waitForFunction((n) => window.__wd.spins.length > n, i, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(400);
    if (i < 3) await page.screenshot({ path: `${out}spin${i}.png` });
  }
  const R = await page.evaluate(() => ({ wd: window.__wd, swaps: GreedJunkLit._deck.swaps, forced: GreedJunkLit._deck.forced }));
  ok(R.wd.spins.length === SPINS, `крутки дошли до конца: ${R.wd.spins.length}/${SPINS}`);
  ok(R.wd.spins.every(s => s.key && s.under === s.key), 'под язычком — ключ исхода в каждой крутке (' + R.wd.spins.map(s => s.key).join(' ') + ')');
  ok(R.forced === 0, `подмен на виду (растр не успел) — ${R.forced}`);
  ok(R.wd.visibleSwaps === 0, `подмен, записанных не за кадром — ${R.wd.visibleSwaps}`);
  console.log(`  подмен за кадром всего: ${R.swaps}`);

  // ---------- 3. пиксели: кусок = диск целиком ----------
  if (process.env.WHERE) await page.evaluate(() => { window.__diffPng = true; });
  const P = await page.evaluate(async () => {
    const L = GreedJunkLit, G = GreedJunk, Q = L._wgl, gl = Q.gl, st = Q.disc, Sp = L._wheelSpr;
    // текстура цвета из видеокарты
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, st.t[0], 0);
    const a = new Uint8Array(st.w * st.h * 4); gl.readPixels(0, 0, st.w, st.h, gl.RGBA, gl.UNSIGNED_BYTE, a);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb);
    // диск целиком по текущей раскладке → такая же текстура
    const img = await L.image(Sp.svg('albedo', G.wheelNow.slice())); G.pass = 'baked';
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    const fb2 = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb2);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const c = new Uint8Array(st.w * st.h * 4); gl.readPixels(0, 0, st.w, st.h, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb2); gl.deleteTexture(t);
    let diff = 0, max = 0;
    const where = {};
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - c[i]); if (d > max) max = d;
      if (d > 8) { diff++; const px = (i >> 2) % st.w, py = Math.floor((i >> 2) / st.w), k = Math.floor(px / 40) + ',' + Math.floor(py / 40); where[k] = (where[k] || 0) + 1; }
    }
    let png = null;
    if (window.__diffPng) {
      const cv = document.createElement('canvas'); cv.width = st.w; cv.height = st.h;
      const g = cv.getContext('2d'), im = g.createImageData(st.w, st.h);
      for (let p = 0; p < st.w * st.h; p++) {
        let d = 0; for (let q = 0; q < 3; q++) d = Math.max(d, Math.abs(a[p * 4 + q] - c[p * 4 + q]));
        im.data[p * 4] = d > 8 ? 255 : a[p * 4] * 0.35; im.data[p * 4 + 1] = a[p * 4 + 1] * 0.35; im.data[p * 4 + 2] = a[p * 4 + 2] * 0.35; im.data[p * 4 + 3] = 255;
      }
      g.putImageData(im, 0, 0); png = cv.toDataURL('image/png');
    }
    return { png, diff, share: diff / a.length, max, where: Object.entries(where).sort((x, y) => y[1] - x[1]).slice(0, 12), w: st.w };
  });
  if (process.env.WHERE) {
    console.log('  где (клетки 40 пикс.):', JSON.stringify(P.where), 'диск', P.w);
    if (P.png) require('fs').writeFileSync(out + 'diff.png', Buffer.from(P.png.split(',')[1], 'base64'));
  }
  // разница — только сглаживание кромок у края куска (до ~45 из 255);
  // хвост убранного значка давал 210 (кусок был меньше значка)
  ok(P.share < 0.001 && P.max <= 60, `текстура цвета = диск целиком: расходится ${P.diff} каналов (${(P.share * 100).toFixed(3)}%), наибольшая разница ${P.max}`);
  console.log(errs.length ? 'ошибки:\n' + errs.join('\n') : 'ошибок страницы нет');
  if (errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
