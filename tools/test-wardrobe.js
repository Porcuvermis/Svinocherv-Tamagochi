const { chromium } = require('playwright');
const { viewport, prepare } = require('./harness');

// ================= ПРОГОН: КАК СИДИТ НАРЯД =================
// Одежда носится ВЕЗДЕ и видна всегда — значит её посадка это не украшение,
// а такая же механика, как ракурс глаз. Проверяется четыре вещи:
//
//   1. предмет ЛЕЖИТ НА ТЕЛЕ — доля не ниже заявленной в каталоге (`sits`).
//      Именно так ловится повисший в воздухе угол: лента выходила за живот
//      концами (0.84), бант парил над хвостом (0.67);
//   2. надетое на голову ЕДЕТ ВМЕСТЕ С ЛИЦОМ. До правки оно висело
//      статическим узлом: очки съезжали мимо глаз, цилиндр уходил с черепа;
//   3. очки сидят НА ГЛАЗАХ при любом повороте — линза на яблоке, а не рядом;
//   4. живот не закрыт одеждой целиком: он единственная вершина силуэта
//      (docs/art-direction.md §4.1), и фрак обязан быть распахнут.
//
// Мерится по ДЕРЕВУ, а не по картинке: тело — объединение `.worm-part-shape`,
// предмет — его собственные фигуры, попадание считается isPointInFill.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-wardrobe.js /tmp/shot-
(async () => {
  const out = process.argv[2] || '/tmp/wear-';
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
    window.__wear = {
      // Доля площади предмета, лежащая на теле. Тело — объединение силуэтов
      // частей; точки берутся сеткой по каждой фигуре предмета.
      onBody(slot) {
        const svg = document.querySelector('#game-container svg');
        const g = document.querySelector('[data-cosmetic="' + slot + '"]');
        if (!g || !svg) return null;
        const parts = [...document.querySelectorAll('.worm-part-shape')];
        let inside = 0, total = 0;
        const pt = svg.createSVGPoint();
        [...g.querySelectorAll('path,rect,circle,ellipse,polygon')].forEach(sh => {
          if (!sh.isPointInFill) return;
          const bb = sh.getBBox(), N = 14;
          for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
            pt.x = bb.x + bb.width * i / N; pt.y = bb.y + bb.height * j / N;
            if (!sh.isPointInFill(pt)) continue;
            total++;
            const scr = pt.matrixTransform(sh.getScreenCTM());
            const on = parts.some(p => {
              const m = p.getScreenCTM(); if (!m) return false;
              const loc = scr.matrixTransform(m.inverse());
              const q = svg.createSVGPoint(); q.x = loc.x; q.y = loc.y;
              return p.isPointInFill(q);
            });
            if (on) inside++;
          }
        });
        return total ? +(inside / total).toFixed(3) : null;
      },

      // Насколько линзы очков совпали с глазами, в долях радиуса глаза.
      lensOffEye() {
        const g = document.querySelector('[data-cosmetic="head"]');
        if (!g) return null;
        const lens = [...g.querySelectorAll('rect')]
          .map(r => r.getBoundingClientRect())
          .filter(r => r.width > 3 && r.height > 3)
          .sort((a, b) => a.x - b.x);
        const eyes = ['left', 'right'].map(s => {
          const e = document.querySelector('[data-part="eye-' + s + '"] ellipse[fill*="sclera"]');
          return e ? e.getBoundingClientRect() : null;
        }).filter(Boolean).sort((a, b) => a.x - b.x);
        if (lens.length < 2 || eyes.length < 2) return null;
        let worst = 0;
        for (let i = 0; i < 2; i++) {
          const dx = (lens[i].x + lens[i].width / 2) - (eyes[i].x + eyes[i].width / 2);
          const dy = (lens[i].y + lens[i].height / 2) - (eyes[i].y + eyes[i].height / 2);
          worst = Math.max(worst, Math.hypot(dx, dy) / Math.max(4, eyes[i].width / 2));
        }
        return +worst.toFixed(2);
      },

      // Доля ЖИВОТА, закрытая надетым. Живот — вершина силуэта, затянуть его
      // целиком нельзя.
      bellyCovered() {
        const svg = document.querySelector('#game-container svg');
        const g = document.querySelector('[data-cosmetic="body"]');
        const belly = document.querySelector('[data-anchor="belly-scars"]');
        const shape = belly && belly.parentNode.querySelector(':scope > .worm-part-shape');
        if (!g || !shape) return null;
        const bb = shape.getBBox(), N = 24;
        let inside = 0, covered = 0;
        const pt = svg.createSVGPoint();
        const cloth = [...g.querySelectorAll('path,rect,circle,ellipse,polygon')];
        for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
          pt.x = bb.x + bb.width * i / N; pt.y = bb.y + bb.height * j / N;
          if (!shape.isPointInFill(pt)) continue;
          inside++;
          const scr = pt.matrixTransform(shape.getScreenCTM());
          const hit = cloth.some(c => {
            if (!c.isPointInFill) return false;
            const m = c.getScreenCTM(); if (!m) return false;
            const loc = scr.matrixTransform(m.inverse());
            const q = svg.createSVGPoint(); q.x = loc.x; q.y = loc.y;
            return c.isPointInFill(q);
          });
          if (hit) covered++;
        }
        return inside ? +(covered / inside).toFixed(3) : null;
      },

      // Где предмет стоит ОТНОСИТЕЛЬНО ГОЛОВЫ. Не на экране: червь ходит по
      // комнате, и экранный сдвиг считался бы от его шагов, а не от поворота.
      centre(slot) {
        const g = document.querySelector('[data-cosmetic="' + slot + '"]');
        const head = document.querySelector('[data-part="head"]');
        if (!g || !head) return null;
        const r = g.getBoundingClientRect(), h = head.getBoundingClientRect();
        return +((r.x + r.width / 2) - (h.x + h.width / 2)).toFixed(1);
      }
    };
  ` });

  const setYaw = (v) => page.evaluate(async t => {
    MainWormHandle.setLivePose({ headYaw: t });
    for (let i = 0; i < 240; i++) {
      if (Math.abs(MainWormHandle.getHeadPose().current - t) < 0.01) return;
      await new Promise(r => requestAnimationFrame(r));
    }
  }, v);

  const dress = (c) => page.evaluate(async cc => {
    GameState.data.cosmetics = cc;
    GameState.data.scars = [];
    MainWormHandle.setOverride({ cosmetics: cc, scars: [] });
    await new Promise(r => setTimeout(r, 400));
  }, c);

  const catalog = await page.evaluate(() => PRIDE_WARDROBE.items.map(i => ({ id: i.id, slot: i.slot, sits: i.sits })));
  const YAWS = [-1, -0.5, 0, 0.5, 1];

  // ---------- 1. ВСЁ ЛЕЖИТ НА ТЕЛЕ ----------
  console.log('\n--- предмет лежит на теле, а не рядом ---');
  const worst = {};
  for (const item of catalog) {
    const set = {}; set[item.slot] = item.id;
    await dress(set);
    for (const yaw of YAWS) {
      await setYaw(yaw);
      const v = await page.evaluate(s => window.__wear.onBody(s), item.slot);
      if (v == null) { worst[item.id] = null; continue; }
      worst[item.id] = worst[item.id] == null ? v : Math.min(worst[item.id], v);
    }
  }
  catalog.forEach(item => {
    const v = worst[item.id];
    check(v != null && v >= item.sits,
      `«${item.id}» лежит на теле: ${v} при заявленных ${item.sits}`);
  });

  // ---------- 2. ГОЛОВНОЕ ЕДЕТ ВМЕСТЕ С ЛИЦОМ ----------
  console.log('\n--- надетое на голову едет с лицом ---');
  for (const id of ['top-hat', 'shades']) {
    await dress({ head: id });
    await setYaw(-1); const left = await page.evaluate(() => window.__wear.centre('head'));
    await setYaw(1);  const right = await page.evaluate(() => window.__wear.centre('head'));
    check(left != null && right != null && right - left > 6,
      `«${id}» проехал вместе с головой: ${left} → ${right}`);
  }

  // ---------- 3. ЛИНЗЫ НА ГЛАЗАХ ----------
  console.log('\n--- очки сидят на глазах ---');
  await dress({ head: 'shades' });
  let lensWorst = 0, lensMeasured = 0;
  for (const yaw of YAWS) {
    await setYaw(yaw);
    const v = await page.evaluate(() => window.__wear.lensOffEye());
    if (v != null) { lensMeasured++; lensWorst = Math.max(lensWorst, v); }
  }
  check(lensMeasured && lensWorst < 0.8,
    `линза не уезжает с яблока ни при каком повороте: худший промах ${lensWorst} радиуса глаза (замеров ${lensMeasured} из ${YAWS.length})`);

  // ---------- 4. ЖИВОТ НЕ ЗАТЯНУТ ЦЕЛИКОМ ----------
  console.log('\n--- живот виден из-под одежды ---');
  for (const id of ['tux', 'sash']) {
    await dress({ body: id });
    await setYaw(0);
    const v = await page.evaluate(() => window.__wear.bellyCovered());
    check(v != null && v < 0.7, `«${id}» не затягивает живот целиком: закрыто ${v}`);
  }

  // ---------- СНИМКИ ----------
  for (const [name, set] of [
    ['wear', { head: 'top-hat', neck: 'bow-tie', body: 'tux', tail: 'tail-sock' }],
    ['glam', { head: 'shades', neck: 'chain', body: 'sash', tail: 'tail-bow' }]
  ]) {
    await dress(set);
    for (const yaw of [-1, 0, 1]) {
      await setYaw(yaw);
      const box = await page.evaluate(() => {
        const h = document.querySelector('[data-part="head"]').getBoundingClientRect();
        const t = document.querySelector('[data-part="tail"]').getBoundingClientRect();
        const x0 = Math.max(0, Math.min(h.x, t.x) - 25), y0 = Math.max(0, Math.min(h.y, t.y) - 30);
        return { x: x0, y: y0, width: Math.max(h.right, t.right) - x0 + 25,
                 height: Math.max(h.bottom, t.bottom) - y0 + 25 };
      });
      await page.screenshot({ path: `${out}${name}${yaw}.png`, clip: box });
    }
  }

  console.log('\n' + (errors.length ? errors.join('\n') : 'ошибок страницы нет'));
  console.log('\n' + (fail.length ? 'ПРОВАЛЕНО: ' + fail.length : 'ВСЁ ЗЕЛЁНОЕ'));
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})();
