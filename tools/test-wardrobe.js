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
      // ---------- ЗАМЕРЫ ТОЛЬКО ПО СВОЕМУ ЧЕРВЮ ----------
      // Червей на экране бывает несколько (комната, колесо грехов, лобби), и
      // наряд по состоянию надевается на ВСЕХ. document.querySelector брал
      // первого попавшегося — иногда скрытого, с вырожденной матрицей, — и
      // проверка «пришито к телу» краснела через раз на ровном месте.
      root() {
        return (window.MainWormHandle && MainWormHandle.svgRoot) || document.querySelector('#game-container svg');
      },
      q(sel) { const r = this.root(); return r ? r.querySelector(sel) : null; },
      qa(sel) { const r = this.root(); return r ? [...r.querySelectorAll(sel)] : []; },
      // Доля площади предмета, лежащая на теле. Тело — объединение силуэтов
      // частей; точки берутся сеткой по каждой фигуре предмета.
      //
      // ВИСЯЩИЕ части ([data-swing]) в счёт не идут: лента, качнувшаяся в
      // сторону, ЗАКОННО уходит с тела — на то она и висит. За них отвечает
      // отдельная проверка: пришитый конец обязан быть на теле.
      onBody(slot) {
        const svg = document.querySelector('#game-container svg');
        const g = this.q('[data-cosmetic="' + slot + '"]');
        if (!g || !svg) return null;
        const parts = this.qa('.worm-part-shape');
        let inside = 0, total = 0;
        const pt = svg.createSVGPoint();
        [...g.querySelectorAll('path,rect,circle,ellipse,polygon')].forEach(sh => {
          if (!sh.isPointInFill || sh.closest('[data-swing]')) return;
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
        const g = this.q('[data-cosmetic="head"]');
        if (!g) return null;
        const lens = [...g.querySelectorAll('rect')]
          .map(r => r.getBoundingClientRect())
          .filter(r => r.width > 3 && r.height > 3)
          .sort((a, b) => a.x - b.x);
        const eyes = ['left', 'right'].map(s => {
          const e = this.q('[data-part="eye-' + s + '"] ellipse[fill*="sclera"]');
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
        const g = this.q('[data-cosmetic="body"]');
        const belly = this.q('[data-anchor="belly-scars"]');
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

      // Пришитый конец висящей детали — на теле? Берём точку крепления
      // (начало координат её группы) и спрашиваем силуэты частей.
      hangRoots(slot) {
        const svg = document.querySelector('#game-container svg');
        const g = this.q('[data-cosmetic="' + slot + '"]');
        if (!g || !svg) return null;
        const parts = this.qa('.worm-part-shape');
        const out = [];
        [...g.querySelectorAll('[data-swing]')].forEach(el => {
          const m = el.getScreenCTM(); if (!m) return;
          const p = svg.createSVGPoint(); p.x = 0; p.y = 0;
          const scr = p.matrixTransform(m);
          out.push(parts.some(pt => {
            const pm = pt.getScreenCTM(); if (!pm) return false;
            const loc = scr.matrixTransform(pm.inverse());
            const q = svg.createSVGPoint(); q.x = loc.x; q.y = loc.y;
            return pt.isPointInFill(q);
          }));
        });
        return out;
      },

      // Где предмет стоит ОТНОСИТЕЛЬНО ГОЛОВЫ. Не на экране: червь ходит по
      // комнате, и экранный сдвиг считался бы от его шагов, а не от поворота.
      centre(slot) {
        const g = this.q('[data-cosmetic="' + slot + '"]');
        const head = this.q('[data-part="head"]');
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

  console.log('\n--- висящее пришито к телу ---');
  for (const [slot, id] of [['neck', 'chain'], ['body', 'tux'], ['tail', 'tail-bow']]) {
    const set = {}; set[slot] = id;
    await dress(set);
    let bad = 0, total = 0;
    for (const yaw of YAWS) {
      await setYaw(yaw);
      const r = await page.evaluate(s => window.__wear.hangRoots(s), slot);
      (r || []).forEach(ok => { total++; if (!ok) bad++; });
    }
    check(total > 0 && bad === 0,
      `у «${id}» пришитый конец висящей детали на теле: ${total - bad} из ${total}`);
  }

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

  // ---------- 5. НАРЯД ЖИВЁТ ВМЕСТЕ С ТЕЛОМ ----------
  // Жалоб было две, и они про РАЗНОЕ.
  //
  // «Бантик на хвосте всегда горизонтальный относительно экрана» — хвост
  // по-настоящему гнётся на экране, и надетое на него обязано гнуться с ним.
  //
  // «Фрак не должен крутиться вокруг своей оси» — а вот тело НЕ крутится:
  // для игрока червь стоит вертикально и поворачивается целиком. Фрак должен
  // уезжать вбок и сужаться, как очки на лице, и при этом НЕ вращаться.
  //
  // Поэтому у тела и у хвоста проверки разные, и это не поблажка, а два
  // разных движения.
  console.log('\n--- наряд живёт вместе с телом ---');
  await dress({ neck: 'chain', body: 'tux', tail: 'tail-bow' });
  const live = await page.evaluate(async () => {
    const turn = {}, swing = {}, squash = {}, hang = {};
    const span = (o) => { const r = {}; Object.keys(o).forEach(k => r[k] = +(o[k].max - o[k].min).toFixed(1)); return r; };
    const note = () => {
      window.__wear.qa('[data-cosmetic]').forEach(g => {
        const m = g.getScreenCTM(); if (!m) return;
        const k = g.getAttribute('data-cosmetic');
        const deg = Math.atan2(m.b, m.a) * 180 / Math.PI;
        if (!turn[k]) { turn[k] = { prev: deg, acc: 0, min: 0, max: 0 }; }
        else {
          let d = deg - turn[k].prev;
          while (d > 180) d -= 360;
          while (d < -180) d += 360;
          turn[k].prev = deg; turn[k].acc += d;
          turn[k].min = Math.min(turn[k].min, turn[k].acc);
          turn[k].max = Math.max(turn[k].max, turn[k].acc);
        }
        // Сужение при повороте тела — своим transform, не экранным.
        const sm = /scale\(([-0-9.]+)/.exec(g.getAttribute('transform') || '');
        const sx = sm ? parseFloat(sm[1]) : 1;
        squash[k] = squash[k] || { min: sx, max: sx };
        squash[k].min = Math.min(squash[k].min, sx); squash[k].max = Math.max(squash[k].max, sx);
      });
      window.__wear.qa('[data-swing]').forEach(el => {
        const host = el.closest('[data-cosmetic]');
        const k = host ? host.getAttribute('data-cosmetic') : '?';
        const m = /rotate\(([-0-9.]+)/.exec(el.getAttribute('transform') || '');
        const v = m ? parseFloat(m[1]) : 0;
        swing[k] = swing[k] || { min: v, max: v };
        swing[k].min = Math.min(swing[k].min, v); swing[k].max = Math.max(swing[k].max, v);
        // А ВИСИТ ли оно вниз по экрану: берём накопленный поворот самой
        // подвески вместе со всеми предками.
        const ctm = el.getScreenCTM();
        if (ctm) {
          const deg = Math.atan2(ctm.b, ctm.a) * 180 / Math.PI;
          hang[k] = hang[k] || { min: deg, max: deg };
          hang[k].min = Math.min(hang[k].min, deg); hang[k].max = Math.max(hang[k].max, deg);
        }
      });
    };
    if (MainWormHandle.walkTo) MainWormHandle.walkTo(320, 700);
    for (let i = 0; i < 420; i++) { await new Promise(r => requestAnimationFrame(r)); note(); }
    if (MainWormHandle.walkTo) MainWormHandle.walkTo(70, 700);
    for (let i = 0; i < 420; i++) { await new Promise(r => requestAnimationFrame(r)); note(); }
    const worstHang = {};
    Object.keys(hang).forEach(k => worstHang[k] = +Math.max(Math.abs(hang[k].min), Math.abs(hang[k].max)).toFixed(1));
    return { turn: span(turn), swing: span(swing), squash: span(squash), hang: worstHang };
  });
  ['neck', 'body'].forEach(slot => {
    check((live.turn[slot] || 0) < 8,
      `«${slot}» НЕ крутится вокруг своей оси: ${live.turn[slot]}°`);
    check((live.squash[slot] || 0) > 0.12,
      `«${slot}» отзывается на поворот тела сужением: размах ${live.squash[slot]}`);
  });
  check((live.turn.tail || 0) > 20,
    `«tail» гнётся вместе с хвостом: ${live.turn.tail}°`);
  ['neck', 'body', 'tail'].forEach(slot => {
    check((live.swing[slot] || 0) > 2,
      `у «${slot}» есть подвижная деталь и её качает ход: ${live.swing[slot]}°`);
    check((live.hang[slot] || 99) < 34,
      `висящее у «${slot}» висит ВНИЗ ПО ЭКРАНУ, а не по своей части: худший наклон ${live.hang[slot]}°`);
  });

  // ---------- 6. НАКЛОН ТЕЛЕФОНА ----------
  // Висящее слушается не только ходьбы, но и того, как завален сам телефон.
  // Датчика в прогоне нет — подаём событие руками: проверяется не железо, а
  // то, что число с датчика доезжает до ткани и разводит её в РАЗНЫЕ стороны.
  // И что без датчика всё работает как раньше: это штатный режим.
  console.log('\n--- наклон телефона отклоняет висящее ---');
  await dress({ body: 'tux' });
  const tilt = await page.evaluate(async () => {
    const quiet = { alive: Tilt.info().live, x: Tilt.x() };
    const fire = (g) => window.dispatchEvent(Object.assign(new Event('deviceorientation'),
                                                           { gamma: g, beta: 0, alpha: 0 }));
    const read = () => {
      const el = window.__wear.q('[data-cosmetic="body"] [data-swing]');
      const m = el && /rotate\(([-0-9.]+)/.exec(el.getAttribute('transform') || '');
      return m ? parseFloat(m[1]) : null;
    };
    // Единицу датчика игра определяет по данным, а не по вере: сперва даём
    // ей увидеть размах, и только потом меряем.
    fire(-30);
    for (let i = 0; i < 150; i++) { Tilt.x(); await new Promise(r => requestAnimationFrame(r)); }
    const left = read();
    fire(30);
    for (let i = 0; i < 150; i++) { Tilt.x(); await new Promise(r => requestAnimationFrame(r)); }
    const right = read();
    return { quiet, info: Tilt.info(), left, right };
  });
  check(tilt.quiet.alive === false && tilt.quiet.x === 0,
    'без датчика наклон равен нулю и ничего не ломает');
  check(tilt.left != null && tilt.right != null && tilt.right - tilt.left > 12,
    `наклон телефона отводит фалды в разные стороны: ${tilt.left}° → ${tilt.right}°`);

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
