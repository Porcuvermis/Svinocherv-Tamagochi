// Кадры показа монет алчности (🐞 → «Монеты») под 4× замедлением: fps, худший
// кадр, мс JS на кадр, мегапиксели квадратов монет на кадр. Аргумент — опции
// показа (window.__opt): {"batch":false} — монета на вызов; {"lo":0.5} — холст
// движения в половину. Запуск при поднятом сервере 8777:
//     NODE_PATH=/opt/node22/lib/node_modules node tools/prof-greed-coins.js '{"lo":1}'
// кадры показа монет под 4× замедлением: появление, стоит, уход
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8777/index.html'); await p.waitForTimeout(2500);
  const cdp = await p.context().newCDPSession(p);
  await p.evaluate((o) => { window.__opt = o; }, JSON.parse(process.argv[2] || '{}'));
  await p.evaluate(() => { DebugState.run('coins'); });
  await p.waitForFunction(() => GreedCoins._fullStats, null, { timeout: 30000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const mark = async () => p.evaluate(() => Object.assign({}, GreedCoins._prof));
  const r = await p.evaluate(() => new Promise(res => {
    const st = GreedCoins._fullStats, T = st.inMs + 2200 + st.outMs;
    const t0 = performance.now(), fr = []; let last = t0;
    const marks = [];
    const f = (now) => { fr.push([now - t0, now - last]); last = now; const P = GreedCoins._prof; if (P) marks.push([now - t0, P.js, P.frames, P.px]); if (now - t0 < T) requestAnimationFrame(f); else res({ st: { inMs: st.inMs, outMs: st.outMs }, fr, marks }); };
    requestAnimationFrame(f);
  }));
  const ph = (a, b) => { const x = r.fr.filter(f => f[0] >= a && f[0] < b); const n = x.length, d = (b - a) / 1000;
    const m = r.marks.filter(f => f[0] >= a && f[0] < b), m0 = m[0], m1 = m[m.length - 1];
    const fr = m1 && m0 ? m1[2] - m0[2] : 0;
    return { fps: +(n / d).toFixed(1), worst: Math.round(Math.max(...x.map(f => f[1]))), jsMs: fr ? +((m1[1] - m0[1]) / fr).toFixed(1) : null, Mpx: fr ? +((m1[3] - m0[3]) / fr / 1e6).toFixed(2) : null }; };
  const S = r.st;
  console.log(JSON.stringify({ opt: process.argv[2] || '{}', in: ph(0, S.inMs), hold: ph(S.inMs + 300, S.inMs + 2000), out: ph(S.inMs + 2200, S.inMs + 2200 + S.outMs) }), errs.length ? errs : '');
  await b.close();
})();
