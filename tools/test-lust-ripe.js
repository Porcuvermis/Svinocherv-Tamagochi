// ============ «СОЗРЕВШИЙ» ПУЗЫРЬ ============
//
// Подсказка к этапу, где пену лопают тапами: через ripeMs тишины один пузырь
// вздувается и дышит (lust-ripe.js). Проверяет обе развилки — горку над
// хвостом и забег «только помыть» (тапы по червю): пузырь появляется ТОЛЬКО
// после тишины, стоит на пене, гаснет от тапа и не мешает прохождению.
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-lust-ripe.js /tmp/ripe-
const { chromium } = require('playwright');
const harness = require('./harness');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
  await harness.prepare(page);
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(1500);
  const out = process.argv[2] || '/tmp/ripe-';
  const fail = [];
  const ok = (cond, what, extra) => {
    console.log(`  ${cond ? 'ok  ' : 'ПЛОХО'} ${what}${extra ? '   ' + extra : ''}`);
    if (!cond) fail.push(what);
  };
  const ripe = () => page.evaluate(() => {
    const n = document.querySelector('#lust-game .bt-ripe');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  });
  const toMouse = (pt) => page.evaluate((p) => {
    const c = LustMinigame.cam;
    return SvgSpace.toClient(document.getElementById('bt-svg'), c.tx + c.s * p.x, c.ty + c.s * p.y);
  }, pt);

  // Дойти до пены: paid — горка (pop), иначе забег «только помыть» (wipe).
  const reach = (paid) => page.evaluate(async (paid) => {
    const L = LustMinigame, wait = (ms) => new Promise(r => setTimeout(r, ms));
    GameState.setSinValue('lust', 0);
    L.close(); L.open();
    await wait(600);
    L.startWater();
    // «Ещё рано»: награды не будет, хвоста и горки тоже.
    if (!paid) L.paidRun = false;
    await wait(1200);
    L.finishStage('soap');
    L.rub = 1; L.growTo('cloth', 1);
    L.finishStage('cloth');
    await wait(2500);
    return L.phase;
  }, paid);

  for (const [name, paid, want] of [['горка', true, 'pop'], ['червь', false, 'wipe']]) {
    console.log('— ' + name);
    const ph = await reach(paid);
    ok(ph === want, `дошли до этапа ${want}`, ph);
    // Сразу после появления этапа пузыря нет: сначала игрок смотрит сам.
    ok(!(await ripe()), 'пузыря нет, пока тишина не отсидела');
    await page.waitForTimeout(3500);
    const r1 = await ripe();
    ok(!!r1, 'после 3 с тишины пузырь есть');
    await page.screenshot({ path: out + name + '.png' });
    if (r1) {
      const inside = await page.evaluate((r) => {
        const e = document.elementFromPoint(r.x, r.y);
        return !!e;
      }, r1);
      ok(inside && r1.w > 10, 'пузырь на экране и не нулевой', `ширина ${r1.w.toFixed(0)}`);
    }
    // Тап — пузырь гаснет сразу.
    const tapAt = r1 || { x: 195, y: 420 };
    await page.mouse.click(tapAt.x, tapAt.y);
    await page.waitForTimeout(100);
    ok(!(await ripe()), 'тап гасит пузырь');
    await page.waitForTimeout(3800);
    ok(!!(await ripe()), 'после следующей тишины подсказка возвращается');
    // Выход из ванной убирает подсказку насовсем.
    await page.evaluate(() => LustMinigame.close());
    ok(!(await ripe()), 'выход убирает подсказку');
  }

  // ---------- ХВОСТ: валик по оси, пока палец не водит ----------
  console.log('— хвост');
  await reach(true);
  await page.evaluate(() => LustMinigame.startRub());
  const ring = () => page.evaluate(() => ({ s: BATH_ART.ring.s, t: BATH_ART.ring.t, ph: LustMinigame.phase,
                                            charge: LustMinigame.charge }));
  await page.waitForTimeout(1500);
  ok((await ring()).s < 0.1, 'до тишины валика нет');
  // Ловим валик в движении: он обязан пройти и корень, и кончик.
  const seen = []; let shot = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(100);
    const r = await ring();
    if (r.s > 0.5) seen.push(r.t);
    if (r.s > 0.5 && r.t > 0.45 && !shot) { shot = true; await page.screenshot({ path: out + 'хвост.png' }); }
  }
  ok(seen.length > 5 && Math.min(...seen) < 0.3 && Math.max(...seen) > 0.7,
     'после 3 с валик идёт от корня к кончику', `${seen.length} кадров, t ${Math.min(...seen).toFixed(2)}–${Math.max(...seen).toFixed(2)}`);
  ok((await ring()).charge === 0, 'подсказка заряд не даёт');
  // Палец на хвосте: валик отдан ему.
  const tp = await toMouse(await page.evaluate(() => {
    const A = BATH_ART.slots(), sp = BATH_ART.tailSpine(LustMinigame.bend, LustMinigame.tailGrow());
    const q = sp[Math.floor(sp.length * 0.4)];
    return { x: A.tail.x + q.x, y: A.tail.y + q.y };
  }));
  await page.mouse.move(tp.x, tp.y); await page.mouse.down();
  await page.waitForTimeout(400);
  const seen2 = [];
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(100); seen2.push((await ring()).t); }
  ok(Math.max(...seen2) - Math.min(...seen2) < 0.08, 'под пальцем валик стоит у пальца, а не бегает сам',
     `разброс ${(Math.max(...seen2) - Math.min(...seen2)).toFixed(2)}`);
  await page.mouse.up();
  await page.evaluate(() => LustMinigame.close());

  ok(errs.length === 0, 'в консоли чисто', errs.slice(0, 3).join(' | '));
  await browser.close();
  console.log(fail.length ? `\nПровалов: ${fail.length}` : '\nВсё хорошо');
  process.exit(fail.length ? 1 : 0);
})();
