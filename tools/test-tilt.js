const { chromium } = require('playwright');
const { viewport, prepare } = require('./harness');

// ================= ПРОГОН: КАК ВИСЯЩЕЕ СЛУШАЕТСЯ НАКЛОНА =================
// Отдельный прогон появился после серёг. У них сошлись сразу два дефекта, и
// ни один из них test-wardrobe не видел, потому что мерил ОДНУ вещь (фалды
// фрака) и ОДНИМ числом («размах конца по экрану»):
//
//   1. подвеска вертелась вокруг начала координат носителя, а не вокруг
//      своего гвоздика, и при наклоне отрывалась от крепления;
//   2. левая копия живёт внутри scale(-1,1), и её поворот виден на экране с
//      обратным знаком: обе серьги на одном завале съезжались к голове, а на
//      другом расходились, вместо того чтобы обе искать низ.
//
// Проверка нарочно сделана ОБЩЕЙ: она ничего не знает про серьги, фалды и
// банты. Она берёт КАЖДЫЙ узел [data-swing], какой есть на червя, и спрашивает
// с него четыре вещи — те самые, которыми висящее отличается от нарисованного:
//
//   A. крепление не уезжает: точка data-pivot стоит на месте при любом угле
//      (у поворота вокруг неё это верно по построению — значит проверка ловит
//      ровно поворот вокруг ЧУЖОЙ точки);
//   B. крепление лежит НА подвеске: объявленная точка внутри её габарита.
//      Без этого пункта первый проверял бы сам себя;
//   C. свободный конец висит ВНИЗ ПО ЭКРАНУ;
//   D. завалили телефон вправо — конец уехал вправо. У КАЖДОЙ копии, включая
//      зеркальную. Это и есть «оба ищут низ», сказанное измеримо.
//
// Почему средним по кадрам: висящее качает не только наклон, но и ход червя
// по комнате, а он в разы сильнее. За сотню кадров ходьба даёт около нуля, и
// остаётся чистый наклон. Мерить мгновенное значение бессмысленно — оно
// краснеет через раз (docs/traps.md, п. 103).
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-tilt.js /tmp/shot-
(async () => {
  const out = process.argv[2] || '/tmp/tilt-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(viewport({ deviceScaleFactor: 2 }));
  await prepare(page);

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const fail = [];
  const check = (ok, what) => { console.log((ok ? '  ok  ' : ' FAIL ') + what); if (!ok) fail.push(what); };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);

  await page.addScriptTag({ content: `
    window.__tilt = {
      root() {
        return (window.MainWormHandle && MainWormHandle.svgRoot) || document.querySelector('#game-container svg');
      },
      // Все подвески червя: узел [data-swing] плюс имя гнезда, в котором он
      // сидит, и сторона (у парных вещей копии помечены data-side).
      list() {
        const r = this.root();
        if (!r) return [];
        return [...r.querySelectorAll('[data-swing]')].map((el, i) => {
          const own = el.closest('[data-cosmetic]');
          const side = el.closest('[data-side]');
          return { el, i,
                   slot: own ? own.getAttribute('data-cosmetic') : '?',
                   side: side ? side.getAttribute('data-side') : '' };
        });
      },
      pivot(el) {
        const v = (el.getAttribute('data-pivot') || '0,0').split(',');
        return { x: parseFloat(v[0]) || 0, y: parseFloat(v[1]) || 0 };
      },
      // Экранная точка внутри подвески. Матрица берётся у самого узла:
      // она уже несёт и поворот качания, и всё, чем повёрнут носитель.
      scr(el, x, y) {
        const m = el.getScreenCTM(); if (!m) return null;
        const svg = this.root();
        const p = svg.createSVGPoint(); p.x = x; p.y = y;
        return p.matrixTransform(m);
      },
      // Замер одного узла: куда уехал свободный конец ОТНОСИТЕЛЬНО крепления,
      // и стоит ли само крепление на месте в координатах носителя.
      probe(el) {
        const bb = el.getBBox();
        const pv = this.pivot(el);
        const P = this.scr(el, pv.x, pv.y);
        // Свободный конец — самая дальняя от крепления точка габарита.
        let best = null, bd = -1;
        [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height],
         [bb.x + bb.width, bb.y + bb.height],
         [bb.x + bb.width / 2, bb.y + bb.height]].forEach(q => {
          const d = (q[0] - pv.x) * (q[0] - pv.x) + (q[1] - pv.y) * (q[1] - pv.y);
          if (d > bd) { bd = d; best = q; }
        });
        const E = this.scr(el, best[0], best[1]);
        if (!P || !E) return null;
        // Крепление в координатах РОДИТЕЛЯ: поворот вокруг него обязан
        // оставить его на месте. Червь при этом ходит по комнате, поэтому
        // экранное место не годится — только местное.
        const t = el.transform.baseVal.consolidate();
        const m = t ? t.matrix : null;
        const mount = m ? { x: m.a * pv.x + m.c * pv.y + m.e, y: m.b * pv.x + m.d * pv.y + m.f }
                        : { x: pv.x, y: pv.y };
        return { dx: E.x - P.x, dy: E.y - P.y,
                 driftX: mount.x - pv.x, driftY: mount.y - pv.y,
                 // Лежит ли объявленное крепление на самой подвеске.
                 onHang: pv.x >= bb.x - 1 && pv.x <= bb.x + bb.width + 1
                      && pv.y >= bb.y - 1 && pv.y <= bb.y + bb.height + 1 };
      },
      fire(gamma) {
        window.dispatchEvent(Object.assign(new Event('deviceorientation'),
                                           { gamma, beta: 0, alpha: 0 }));
      },
      // Среднее по кадрам: ход червя качает висящее сильнее наклона, но за
      // сотню кадров даёт около нуля.
      async mean(frames) {
        const acc = new Map();
        for (let f = 0; f < frames; f++) {
          Tilt.x();
          await new Promise(r => requestAnimationFrame(r));
          if (f < frames * 0.4) continue;     // даём пружине дойти
          this.list().forEach(s => {
            const p = this.probe(s.el);
            if (!p) return;
            const key = s.slot + '/' + s.side + '/' + s.i;
            const a = acc.get(key) || { n: 0, dx: 0, dy: 0, drift: 0, onHang: true,
                                        slot: s.slot, side: s.side };
            a.n++; a.dx += p.dx; a.dy += p.dy;
            a.drift = Math.max(a.drift, Math.abs(p.driftX) + Math.abs(p.driftY));
            a.onHang = a.onHang && p.onHang;
            acc.set(key, a);
          });
        }
        const outv = {};
        acc.forEach((a, k) => outv[k] = { slot: a.slot, side: a.side, onHang: a.onHang,
                                          drift: +a.drift.toFixed(2),
                                          dx: +(a.dx / a.n).toFixed(2),
                                          dy: +(a.dy / a.n).toFixed(2) });
        return outv;
      }
    };
  ` });

  const dress = (c) => page.evaluate(async cc => {
    GameState.data.cosmetics = cc;
    GameState.data.scars = [];
    MainWormHandle.setOverride({ cosmetics: cc, scars: [] });
    await new Promise(r => setTimeout(r, 400));
  }, c);

  // Надеваем разом всё, у чего есть подвеска: гнёзда независимы, и один
  // прогон на все вещи честнее четырёх одинаковых.
  await dress({ ears: 'earrings', neck: 'chain', coat: 'tux', tailTip: 'tail-bow' });

  const runs = await page.evaluate(async () => {
    const T = window.__tilt;
    const res = {};
    // Единицу датчика игра определяет по данным — сперва даём увидеть размах.
    T.fire(-34); res.left = await T.mean(150);
    T.fire(0);   res.zero = await T.mean(150);
    T.fire(34);  res.right = await T.mean(150);
    return res;
  });

  const keys = Object.keys(runs.zero);
  console.log('\n--- подвесок найдено: ' + keys.length + ' ---');
  check(keys.length >= 5, `подвески на червя есть и их нашли: ${keys.join(', ')}`);

  console.log('\n--- A. крепление не уезжает ---');
  keys.forEach(k => {
    const worst = Math.max(runs.left[k].drift, runs.zero[k].drift, runs.right[k].drift);
    check(worst < 0.6,
      `«${k}» вертится ВОКРУГ СВОЕГО КРЕПЛЕНИЯ, а не рядом с ним: увод ${worst}`);
  });

  console.log('\n--- B. крепление лежит на самой подвеске ---');
  keys.forEach(k => check(runs.zero[k].onHang,
    `у «${k}» точка крепления объявлена НА подвеске, а не в стороне`));

  console.log('\n--- C. свободный конец висит вниз по экрану ---');
  keys.forEach(k => check(runs.zero[k].dy > 0,
    `«${k}» свисает ВНИЗ по экрану: конец ниже крепления на ${runs.zero[k].dy}`));

  console.log('\n--- D. завал вправо уводит конец вправо — у каждой копии ---');
  keys.forEach(k => {
    const l = runs.left[k].dx, z = runs.zero[k].dx, r = runs.right[k].dx;
    check(r - l > 1.2 && r > z && z > l,
      `«${k}» ищет низ ПО ТЕЛЕФОНУ: ${l} → ${z} → ${r} по экрану`);
  });

  // Парные копии — отдельной строкой: именно тут серьги расходились.
  const bySlot = {};
  keys.forEach(k => (bySlot[runs.zero[k].slot] = bySlot[runs.zero[k].slot] || []).push(k));
  console.log('\n--- парные копии едут в ОДНУ сторону ---');
  Object.keys(bySlot).filter(s => bySlot[s].length > 1).forEach(slot => {
    const moves = bySlot[slot].map(k => runs.right[k].dx - runs.left[k].dx);
    check(moves.every(m => m > 0),
      `обе копии «${slot}» уезжают в одну сторону: ${moves.map(m => m.toFixed(1)).join(' и ')}`);
  });

  // ---------- СНИМКИ ----------
  for (const [name, gamma] of [['left', -34], ['zero', 0], ['right', 34]]) {
    await page.evaluate(async g => {
      window.__tilt.fire(g);
      for (let i = 0; i < 150; i++) { Tilt.x(); await new Promise(r => requestAnimationFrame(r)); }
    }, gamma);
    const box = await page.evaluate(() => {
      const h = document.querySelector('[data-part="head"]').getBoundingClientRect();
      const t = document.querySelector('[data-part="tail"]').getBoundingClientRect();
      const x0 = Math.max(0, Math.min(h.x, t.x) - 25), y0 = Math.max(0, Math.min(h.y, t.y) - 30);
      return { x: x0, y: y0, width: Math.max(h.right, t.right) - x0 + 25,
               height: Math.max(h.bottom, t.bottom) - y0 + 25 };
    });
    await page.screenshot({ path: `${out}tilt-${name}.png`, clip: box });
  }

  console.log('');
  if (errors.length) { errors.forEach(e => console.log(' FAIL ' + e)); fail.push('ошибки страницы'); }
  console.log(fail.length ? `ПРОВАЛЕНО: ${fail.length}` : 'ВСЁ ЗЕЛЁНОЕ');
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})();
