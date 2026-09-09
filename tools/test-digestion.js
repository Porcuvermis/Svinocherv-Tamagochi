// ============ ПРОГОН ПИЩЕВАРЕНИЯ: ЕДА В КИШКЕ ============
//
// Проверяет ровно то, из-за чего кормёжка когда-то роняла кадры (правка 154):
// слой еды обязан жить СНАРУЖИ группы тракта — без маски и обрезки. Внутри
// он тянул за собой пересчёт всей группы на каждый свой шаг, и «покормил —
// залагало» было видно на телефоне.
//
// Плюс то, ради чего это переделывалось: комок едет ПОКАДРОВО, сам по себе,
// без новых данных снаружи; он не вылезает за тело; и когда переваривать
// нечего — его не видно.
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-digestion.js
const { chromium } = require('playwright');
const harness = require('./harness');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport());
  await harness.prepare(page);
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(1500);
  const fail = [];
  const ok = (cond, what, extra) => {
    console.log(`  ${cond ? 'ok  ' : 'ПЛОХО'} ${what}${extra ? '   ' + extra : ''}`);
    if (!cond) fail.push(what);
  };

  // Фаза глотания с фиксированными комками: время здесь ни при чём.
  await page.evaluate(() => {
    MainWormHandle.setOptions({ wander: false, blink: false });
    GameState.digestion = () => ({ phase: 'swallow', progress: 0.4, elapsed: 8 });
    WormDigestion.update = function () {
      MainWormHandle.setDigestion({
        boluses: [{ s: 0.3, size: 1 }, { s: 0.62, size: 1 }], stomachFill: 0.2 });
    };
  });
  await page.waitForTimeout(700);

  // ---------- ГДЕ ЖИВЁТ СЛОЙ ЕДЫ ----------
  const home = await page.evaluate(() => {
    const layer = document.querySelector('#worm-stage svg .worm-food-layer');
    if (!layer) return null;
    const heavy = [];
    let n = layer;
    while (n && n.classList && !n.classList.contains('worm-char-layer')) {
      ['mask', 'clip-path', 'filter'].forEach(a => {
        if (n.getAttribute && n.getAttribute(a)) heavy.push(n.tagName + '[' + a + ']');
      });
      n = n.parentElement;
    }
    return { parent: layer.parentElement.getAttribute('class'), heavy,
             boluses: layer.querySelectorAll('.worm-bolus').length };
  });
  ok(!!home, 'слой еды есть');
  ok(home && home.parent !== 'worm-gut-tract', 'слой еды не внутри тракта', home && home.parent);
  ok(home && home.heavy.length === 0,
     'над едой нет ни маски, ни обрезки, ни фильтра', home && home.heavy.join(',') || '—');
  ok(home && home.boluses === 2, 'комков столько же, сколько заказано', home && String(home.boluses));

  // ---------- КОМОК ЕДЕТ САМ ----------
  // Данные снаружи больше не приходят, а перистальтика обязана идти: именно
  // ради этого движение уехало в кадр.
  const moved = await page.evaluate(() => new Promise(res => {
    WormDigestion.update = function () {};      // снаружи больше ничего не говорят
    const g = document.querySelector('#worm-stage svg .worm-bolus');
    const a = g.getAttribute('transform');
    setTimeout(() => res({ a, b: g.getAttribute('transform') }), 320);
  }));
  ok(moved.a !== moved.b, 'комок двигается покадрово, без новых данных',
     (moved.a || '').slice(0, 34) + ' → ' + (moved.b || '').slice(0, 34));

  // ---------- НЕ ВЫЛЕЗАЕТ ЗА ТЕЛО ----------
  const inside = await page.evaluate(() => {
    const body = document.querySelector('#worm-stage svg .worm-root').getBBox();
    return Array.from(document.querySelectorAll('#worm-stage svg .worm-bolus')).map(g => {
      const b = g.getBBox();
      const t = g.transform.baseVal.consolidate();
      const m = t ? t.matrix : null;
      const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height],
                   [b.x + b.width, b.y + b.height]];
      const out = pts.map(([x, y]) => m ? { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }
                                        : { x, y });
      return out.every(p => p.x >= body.x - 1 && p.x <= body.x + body.width + 1
                         && p.y >= body.y - 1 && p.y <= body.y + body.height + 1);
    });
  });
  ok(inside.length > 0 && inside.every(Boolean), 'комки остаются в габарите тела',
     inside.map(v => v ? '+' : '−').join(''));

  // ---------- ПУСТО — ЗНАЧИТ НЕ ВИДНО ----------
  await page.evaluate(() => {
    MainWormHandle.setDigestion({ boluses: [], stomachFill: 0 });
  });
  await page.waitForTimeout(200);
  const hidden = await page.evaluate(() => Array.from(
    document.querySelectorAll('#worm-stage svg .worm-bolus'))
      .every(g => parseFloat(g.getAttribute('opacity') || '0') < 0.001));
  ok(hidden, 'без еды комков не видно');

  console.log(errs.length ? '\n' + errs.join('\n') : '\nошибок страницы нет');
  console.log(fail.length ? '\nСЛОМАНО: ' + fail.join('; ') : '\nвсё сошлось');
  await browser.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
