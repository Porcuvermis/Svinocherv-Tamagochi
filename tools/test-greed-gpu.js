const { chromium } = require('playwright');
// ================= АППАРАТ АЛЧНОСТИ: ПАМЯТЬ ВИДЕОКАРТЫ ПРИ ПОКУПКЕ =================
// Вылеты на iPhone в Telegram при покупке колеса, пачинко и версии 2
// (игрок, 21.11). Замер показал не утечку, а пик: в миг покупки в памяти
// живой аппарат плюс заготовка того, что покупается (версия 2 — целиком,
// второй аппарат). Тест держит бюджет пика: живые контексты WebGL и
// текстуры в них — замер каждые 100 мс по ходу покупки, считается
// наибольшее. Плюс: заготовка игр — одна, а не две; после покупки версии 2
// у гаражного не осталось живых контекстов (лоток монет жил — 6 МБ атласа);
// журнал шагов (greed-crumbs.js) пишет покупку.
//
// Десктопный Chromium не падает и при вдвое большем — числа здесь не порог
// вылета, а защёлка: пик не должен расти незаметно.
//   NODE_PATH=/opt/node22/lib/node_modules node tools/test-greed-gpu.js
const BUDGET = {
  games: { ctx: 5, texMB: 140 },       // колесо, потом пачинко (было: 5, 136 до первой покупки)
  // версия 2 под гаражным: оба аппарата в памяти — так устроена заготовка
  // (план 31, 5г); кант вплетён в литьё и раньше покупки нужен. Ниже —
  // только переделкой заготовки; пока защёлка на замере 21.11 (10 и 182)
  v2: { ctx: 10, texMB: 185 }
};
(async () => {
  const b = await chromium.launch({ executablePath: require('./chrome-path') });
  let bad = 0;
  const ok = (c, m) => { console.log((c ? '  ok  ' : '  ✗   ') + m); if (!c) bad++; };
  const fresh = async () => {
    const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
    await page.addInitScript(() => {
      // каждый холст WebGL и размер текстур в нём (удалённые — ноль)
      window.__ctx = [];
      const g = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, o) {
        const c = g.call(this, t, o);
        if (c && /webgl/.test(t) && !this.__gl) { this.__gl = c; window.__ctx.push(this); }
        return c;
      };
      const P = WebGLRenderingContext.prototype;
      const ti = P.texImage2D;
      P.texImage2D = function (...a) {
        const t = this.getParameter(this.TEXTURE_BINDING_2D), x = a[a.length - 1];
        if (t && !a[1]) t.__b = a.length >= 9 ? a[3] * a[4] * 4 : (x && x.width ? x.width * x.height * 4 : 0);
        (this.__tex || (this.__tex = new Set())).add(t);
        return ti.apply(this, a);
      };
      const dt = P.deleteTexture;
      P.deleteTexture = function (t) { if (t) t.__b = 0; return dt.call(this, t); };
      window.__now = () => {
        let ctx = 0, b = 0;
        window.__ctx.forEach(cv => {
          const gl = cv.__gl;
          if (!gl || gl.isContextLost()) return;
          ctx++;
          if (gl.__tex) gl.__tex.forEach(t => { if (t && t.__b) b += t.__b; });
        });
        return { ctx, texMB: Math.round(b / 1048576) };
      };
      window.__peak = { ctx: 0, texMB: 0 };
      setInterval(() => { const n = window.__now(), p = window.__peak; p.ctx = Math.max(p.ctx, n.ctx); p.texMB = Math.max(p.texMB, n.texMB); }, 100);
      localStorage.removeItem('gj-skin-slots'); localStorage.removeItem('gj-wheel'); localStorage.removeItem('gj-pachinko');
    });
    await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
    return page;
  };
  const enter = (page) => page.evaluate(async () => {
    GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed');
    await GreedMinigame.veilReady();
  });
  const openJar = async (page) => {
    await page.evaluate(() => { const J = GreedJarShop; J.state = 'opening'; J.t0 = performance.now(); J.dirty = true; J.cv.style.pointerEvents = 'auto'; });
    await page.waitForFunction(() => GreedJarShop.state === 'open', null, { timeout: 8000 }).catch(() => {});
  };
  const buy = (page, node) => page.evaluate((n) => { const J = GreedJarShop; J.hold = { node: n, next: 0, dt: 100 }; J.prepFor(n); J.deposit(); }, node);

  // ---- колесо и пачинко ----
  {
    const page = await fresh();
    await page.evaluate(() => { GameState.reset(); Backend.grantCurrency('greed_token', 60); Backend.grantCurrency('gold', 300); GameState.save(); });
    await enter(page);
    await openJar(page);
    await page.waitForTimeout(4000);
    const pre = await page.evaluate(() => Object.keys(GreedJunkLit.growPre || {}));
    ok(pre.length === 1, `жетонов хватает на обе игры — заготовка одна: ${pre.join(', ') || 'нет'}`);
    await page.evaluate(() => { window.__peak = { ctx: 0, texMB: 0 }; });
    for (const n of ['wheel', 'pachinko']) {
      await buy(page, n);
      await page.waitForFunction((n) => Backend.greedLevel(n) >= 1 && !GreedJarShop.busy, n, { timeout: 90000 }).catch(() => {});
      await page.waitForTimeout(1500);
      ok(await page.evaluate((n) => Backend.greedLevel(n) >= 1, n), `${n} куплено`);
    }
    const pk = await page.evaluate(() => window.__peak);
    console.log(`  ·   пик при покупке игр: контекстов ${pk.ctx}, текстур ${pk.texMB} МБ`);
    ok(pk.ctx <= BUDGET.games.ctx && pk.texMB <= BUDGET.games.texMB, `в бюджете (${BUDGET.games.ctx} контекстов, ${BUDGET.games.texMB} МБ)`);
    ok(await page.evaluate(() => GreedCrumbs.list.some(s => /покупка pachinko встала/.test(s))), 'журнал шагов пишет покупку');
    ok(!page.errs.length, page.errs.length ? 'ошибки:\n' + page.errs.join('\n') : 'ошибок страницы нет');
    await page.close();
  }

  // ---- версия 2 ----
  {
    const page = await fresh();
    await page.evaluate(() => {
      const u = GameState.data.upgrades || (GameState.data.upgrades = {});
      u.greed_slots = 0; u.greed_wheel = 1; u.greed_pachinko = 1;
      const g = GameState.data.greed || (GameState.data.greed = {}); g.jar = { wheel: 6, pachinko: 6, v2: ECONOMY.minigames.greed.jar.v2 - 1 };
      Backend.grantCurrency('greed_token', 5); Backend.grantCurrency('gold', 200); GameState.save();
    });
    await enter(page);
    await page.waitForFunction(() => GreedLux._prep && GreedLux.gl, null, { timeout: 20000 }).catch(() => {});
    await openJar(page);
    await page.waitForTimeout(2500);
    // все холсты WebGL гаражного — чтобы после покупки проверить, что ни один не живёт
    await page.evaluate(() => {
      const L = GreedJunkLit, mine = new Set([...L.wrapEl.querySelectorAll('canvas')]);
      if (L.trayCv) mine.add(L.trayCv);
      window.__junk = window.__ctx.filter(cv => mine.has(cv));
      window.__peak = { ctx: 0, texMB: 0 };
    });
    // замер пика — когда заготовка уже целиком в видеокарте
    await page.waitForFunction(() => window.__now().ctx >= 10, null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => { window.__peak = window.__now(); });
    await buy(page, 'v2');
    await page.waitForFunction(() => GreedMinigame.M === GreedLux, null, { timeout: 30000 }).catch(() => {});
    // накал кучи монет в банке (литьё) — один холст на все ступени, а не восемь
    let melt = 0;
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(200); melt = Math.max(melt, await page.evaluate(() => (GreedJar3._melt ? 1 : 0) + Object.keys(GreedJar3._meltT || {}).length)); }
    ok(melt === 1, `накал монет банки — один холст (было до 8 по ~7 МБ): ${melt}`);
    ok(await page.evaluate(() => !GreedJar3._melt && !GreedJar3._cs), 'банка снята — её картинки монет освобождены');
    const r = await page.evaluate(() => ({
      v2: GreedMinigame.M === GreedLux, peak: window.__peak,
      junk: window.__junk.length, alive: window.__junk.filter(cv => !cv.__gl.isContextLost()).map(cv => cv.width + '×' + cv.height)
    }));
    ok(r.v2, 'версия 2 куплена и стоит');
    console.log(`  ·   пик при покупке версии 2: контекстов ${r.peak.ctx}, текстур ${r.peak.texMB} МБ`);
    ok(r.peak.ctx <= BUDGET.v2.ctx && r.peak.texMB <= BUDGET.v2.texMB, `в бюджете (${BUDGET.v2.ctx} контекстов, ${BUDGET.v2.texMB} МБ)`);
    ok(r.junk > 0 && !r.alive.length, `у гаражного живых контекстов не осталось (из ${r.junk}${r.alive.length ? '; живы: ' + r.alive.join(', ') : ''})`);
    ok(await page.evaluate(() => GreedCrumbs.list.some(s => /покупка: v2/.test(s)) && GreedCrumbs.list.some(s => /гаражный снят/.test(s))), 'журнал шагов пишет покупку версии 2');
    ok(!page.errs.length, page.errs.length ? 'ошибки:\n' + page.errs.join('\n') : 'ошибок страницы нет');
    await page.close();
  }

  console.log(bad ? `провалов: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
