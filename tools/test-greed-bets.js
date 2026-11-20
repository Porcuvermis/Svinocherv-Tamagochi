const { chromium } = require('playwright');
// ================= АППАРАТ АЛЧНОСТИ: СТАВКИ И ВЕЩИ =================
// Ставка множит только золото; вещи (жетон, осколок, продукт, семечка) —
// по одной, растёт их шанс (конфиг betItems, 20.11). Тысячи круток бэкенда
// на ставке 1 и 100: ни одной награды вещами больше одной, золото кратно
// ставке, частота вещей — как в tools/sim-slots.js (раздел «ставки»), и на
// высокой ставке она выше.
//   NODE_PATH=/opt/node22/lib/node_modules node tools/test-greed-bets.js
(async () => {
  const b = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await b.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let bad = 0;
  const ok = (c, m) => { console.log((c ? '  ok  ' : '  ✗   ') + m); if (!c) bad++; };
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const up = GameState.data.upgrades || (GameState.data.upgrades = {});
    up.greed_slots = 1; up.greed_wheel = 2; up.greed_pachinko = 2;
    GameState.save = () => {};                       // тысячи круток — без записи
    const N = 4000, out = {};
    const run = (game, bet) => {
      let items = 0, multi = 0, goldBad = 0;
      for (let i = 0; i < N; i++) {
        GameState.data.currencies = GameState.data.currencies || {};
        Backend.grantCurrency('gold', bet * 2);
        const res = Backend.greedPlay(game, bet);
        if (!res.ok) continue;
        const cur = res.currencies || {};
        const things = Object.keys(cur).filter(k => k !== 'gold' && cur[k] > 0).map(k => cur[k]);
        const it = res.items && (res.items.got || 0) + (res.items.rest || 0);
        if (things.length || it) items++;
        if (things.some(v => v > 1) || it > 1) multi++;
        const g = (cur.gold || 0) + (res.pay && game === 'slots' ? 0 : 0);
        if (game === 'slots' && res.pay % bet) goldBad++;
      }
      return { rate: items / N, multi, goldBad };
    };
    ['slots', 'wheel', 'pachinko'].forEach(g => { out[g] = { b1: run(g, 1), b100: run(g, 100) }; });
    return out;
  });
  // ожидаемое — из калькулятора (бандит — тройки с вещью, с гарантией чуть выше)
  const want = { slots: [1 / 29.5 + 1 / 182, 1 / 3.4 + 1 / 18.7], wheel: [1 / 3.6, 1 / 1.5], pachinko: [1 / 51.7, 1 / 5.3] };
  for (const g of ['slots', 'wheel', 'pachinko']) {
    const x = r[g];
    ok(x.b1.multi === 0 && x.b100.multi === 0, `${g}: вещей больше одной за крутку — ни разу`);
    ok(x.b100.rate > x.b1.rate * 1.5, `${g}: на ставке 100 вещи чаще: ${(x.b1.rate * 100).toFixed(1)}% → ${(x.b100.rate * 100).toFixed(1)}%`);
    const near = (a, w) => Math.abs(a - w) / w < 0.2;
    ok(near(x.b1.rate, want[g][0]) && near(x.b100.rate, want[g][1]), `${g}: частота как в расчёте (${(want[g][0] * 100).toFixed(1)}% / ${(want[g][1] * 100).toFixed(1)}%)`);
  }
  ok(r.slots.b100.goldBad === 0, 'бандит: золото выплаты кратно ставке');
  ok(!errs.length, errs.length ? 'ошибки:\n' + errs.join('\n') : 'ошибок страницы нет');
  console.log(bad ? `провалов: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
