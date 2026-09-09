// ============ ПРОГОН ГРУДНОЙ КЛЕТКИ ============
//
// Клетка — единственная часть персонажа, которая живёт в трёх измерениях:
// она доворачивается вместе с телом, как голова. Проверяется ровно то, из-за
// чего это писалось (правка 159):
//
//   * рёбра ТОЛЬКО в животе;
//   * анфас — клетка симметрична: половины опоясывают тушу с двух сторон;
//   * профиль и зеркальный профиль — отражение друг друга;
//   * ближняя половина рисуется ПОВЕРХ органов, дальняя под ними, и роли
//     меняются местами при развороте;
//   * пока червь не поворачивается, клетка не стоит НИЧЕГО (ноль записей).
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-ribs.js
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
  await page.evaluate(() => MainWormHandle.setOptions({ wander: false, blink: false }));

  // ---------- ТОЛЬКО В ЖИВОТЕ ----------
  const where = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#worm-stage svg [data-anat]').forEach(n => {
      if (n.querySelector('.worm-organ-ribs')) out.push(n.getAttribute('data-anat'));
    });
    return out;
  });
  ok(where.length === 1 && where[0] === 'belly', 'рёбра только в животе', where.join(',') || '—');

  // Что снимается с каждой половины: середина всех точек (где половина
  // лежит) и средний вектор «от начала ребра к концу» (куда рёбра растут).
  const walls = (yaw) => page.evaluate((yaw) => {
    MainWormHandle.setLivePose({ bodyYaw: yaw });
    return new Promise(res => setTimeout(() => {
      const layer = document.querySelector('#worm-stage svg [data-anat="belly"] .worm-organ-layer');
      const gs = Array.from(layer.querySelectorAll('.worm-organ-ribs'));
      const read = (g) => {
        const xs = [], ys = [], vec = [0, 0];
        const paths = Array.from(g.querySelectorAll('path')).filter((_, i) => i % 2 === 1);
        paths.forEach(p => {
          const n = (p.getAttribute('d') || '').match(/-?[\d.]+/g).map(Number);
          for (let i = 0; i < n.length; i += 2) { xs.push(n[i]); ys.push(n[i + 1]); }
          vec[0] += n[n.length - 2] - n[0];
          vec[1] += n[n.length - 1] - n[1];
        });
        const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
        return { side: g.getAttribute('data-side'), mid: [m(xs), m(ys)],
                 grow: [vec[0] / paths.length, vec[1] / paths.length] };
      };
      res({ walls: gs.map(read),
            order: Array.from(layer.children).map(k => k.getAttribute('data-side')
              || k.getAttribute('class').replace('worm-organ worm-organ-', '')) });
    }, 260));
  }, yaw);

  const dist = (a, b) => Math.hypot(a.mid[0] - b.mid[0], a.mid[1] - b.mid[1]);
  const front = await walls(0);
  const right = await walls(1);
  const left = await walls(-1);

  ok(front.walls.length === 2, 'у клетки две половины', String(front.walls.length));
  // Анфас половины расходятся по бокам — между ними целый поперечник тела.
  // В профиль обруч виден с ребра, и половины ложатся почти одна на другую.
  const apart = dist(front.walls[0], front.walls[1]);
  const flat = dist(right.walls[0], right.walls[1]);
  ok(apart > flat * 2.5, 'анфас половины расходятся по бокам, в профиль сходятся',
     apart.toFixed(1) + ' против ' + flat.toFixed(1));

  // Профиль и зеркальный профиль: рёбра растут в противоположные стороны.
  const growX = (w) => (w.walls[0].grow[0] + w.walls[1].grow[0]) / 2;
  ok(growX(right) * growX(left) < 0, 'в зеркальном профиле рёбра растут в другую сторону',
     growX(right).toFixed(1) + ' против ' + growX(left).toFixed(1));

  // Ближняя половина — поверх органов, дальняя под ними, и на развороте они
  // меняются ролями.
  const first = (w) => w.order[0], last = (w) => w.order[w.order.length - 1];
  ok(first(right) !== last(right) && ['a', 'b'].includes(first(right)) && ['a', 'b'].includes(last(right)),
     'одна половина под органами, другая поверх', right.order.join(' → '));
  ok(first(right) !== first(left), 'при развороте половины меняются местами',
     right.order.join(' → ') + '   и   ' + left.order.join(' → '));

  // ---------- ЦЕНА ----------
  const cost = await page.evaluate(() => new Promise(res => {
    const E = Element.prototype, sa = E.setAttribute;
    let still = 0, turning = 0, mode = 0, frames = [0, 0];
    E.setAttribute = function (a, v) { if (mode === 0) still++; else turning++; return sa.call(this, a, v); };
    const t0 = performance.now();
    const step = () => {
      const t = performance.now() - t0;
      if (t < 1200) { mode = 0; frames[0]++; }
      else if (t < 3600) { mode = 1; frames[1]++;
        MainWormHandle.setLivePose({ bodyYaw: Math.sin((t - 1200) / 1200 * Math.PI) }); }
      else { E.setAttribute = sa; return res({ still: +(still / frames[0]).toFixed(1),
                                               turning: +(turning / frames[1]).toFixed(1) }); }
      requestAnimationFrame(step);
    };
    MainWormHandle.setLivePose({ bodyYaw: 1 });
    requestAnimationFrame(step);
  }));
  ok(cost.turning - cost.still < 14, 'разворот клетки стоит меньше 14 записей на кадр',
     cost.still + ' стоя, ' + cost.turning + ' в развороте');

  console.log(errs.length ? '\n' + errs.join('\n') : '\nошибок страницы нет');
  console.log(fail.length ? '\nСЛОМАНО: ' + fail.join('; ') : '\nвсё сошлось');
  await browser.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
