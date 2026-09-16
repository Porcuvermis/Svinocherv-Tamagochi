const { chromium } = require('playwright');
const { viewport, prepare } = require('./harness');

// ================= ПРОГОН: ШРАМЫ НА ТЕЛЕ =================
// Шрамы — не картинка поверх червя, а отметины НА КОЖЕ. Отсюда четыре
// требования, и все четыре когда-то нарушались (docs/traps.md, пп. 102–103):
//
//   1. шрам целиком внутри силуэта — ни один конец не торчит наружу;
//   2. шрамы не налезают друг на друга — рядом можно, внахлёст нельзя;
//   3. они РАЗНЕСЕНЫ по части, а не сложены в одну точку;
//   4. при повороте головы шрамы едут ВМЕСТЕ С ЛИЦОМ: уехавшие на изнанку
//      прячутся, вернувшиеся — показываются.
//
// Мерить всё это надо ПО НАСТОЯЩЕМУ КОНТУРУ и ПО НАСТОЯЩИМ ФИГУРАМ, а не по
// вписанному кругу и габаритным прямоугольникам. Оба раза, когда прогон
// мерил приближение, он был зелёным, пока на экране висели шрамы в воздухе:
//   • круг радиуса rx шире черепа у лба и подбородка — «внутри круга» и
//     «внутри головы» это разные вещи;
//   • габарит повёрнутого шрама вдвое больше самой фигуры, поэтому
//     прямоугольники пересекаются у шрамов, которые друг друга не касаются;
//   • и наоборот: когда все шрамы части схлопнулись РОВНО В ЦЕНТР, проверка
//     «не снаружи» прошла идеально — стопка в центре силуэта не снаружи.
// Поэтому здесь: isPointInFill по `.worm-part-shape` и точки вдоль одной
// фигуры внутри другой.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-scars.js /tmp/shot-
(async () => {
  const out = process.argv[2] || '/tmp/scars-';
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

  // ---------- ОДИН СИЛУЭТ НА РИСОВАНИЕ И НА РАЗМЕЩЕНИЕ ----------
  console.log('\n--- силуэт один ---');
  const silo = await page.evaluate(() => {
    const cfg = WormModelAPI.loadWormModel().head.skull;
    // Полуширина черепа по высоте: она и есть то, по чему размещение
    // проверяет место. Если она разойдётся с нарисованным путём — разойдётся
    // и всё остальное.
    const path = WormSilhouette.skullPath(40, 40, cfg, 0);
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.appendChild(el); document.body.appendChild(svg);
    let worst = 0;
    for (let y = -0.9; y <= 0.9; y += 0.1) {
      const half = WormSilhouette.skullHalfWidth(y, cfg, 0, 1);
      const pt = svg.createSVGPoint();
      // точка чуть внутри обязана попасть внутрь, чуть снаружи — наружу
      pt.x = half * 40 * 0.94; pt.y = y * 40;
      const inside = el.isPointInFill(pt);
      pt.x = half * 40 * 1.08;
      const outside = !el.isPointInFill(pt);
      if (!inside || !outside) worst++;
    }
    svg.remove();
    return { mismatch: worst };
  });
  check(silo.mismatch === 0, `полуширина совпадает с нарисованным контуром: расхождений ${silo.mismatch}`);

  // ---------- ПОВОРОТ ГОЛОВЫ — ВЕЛИЧИНА С ИНЕРЦИЕЙ ----------
  // setLivePose({headYaw}) задаёт ЦЕЛЬ, а нарисованный угол едет к ней
  // плавно. Замер через кадр-другой ловит голову на полпути: первая версия
  // этого прогона просила ±1, получала ±0.05 и уверяла, что шрамы стоят на
  // месте. Ждём, пока угол ДОЕДЕТ.
  const setYaw = async (v) => {
    await page.evaluate(async target => {
      MainWormHandle.setLivePose({ headYaw: target });
      for (let i = 0; i < 240; i++) {
        const cur = MainWormHandle.getHeadPose().current;
        if (Math.abs(cur - target) < 0.01) return;
        await new Promise(r => requestAnimationFrame(r));
      }
    }, v);
  };

  // ---------- ЧТО ВИДНО НА ЭКРАНЕ ----------
  // Меряем по дереву: контур части — `.worm-part-shape`, фигура шрама — path
  // внутри `g.worm-mark`.
  const measure = () => page.evaluate(() => {
    const svg = document.querySelector('#game-container svg') || document.querySelector('svg');
    let shown = 0, outside = 0, clashes = 0, hidden = 0, worst = 0, stacked = 0;
    const where = {};
    document.querySelectorAll('.worm-scar-layer').forEach(layer => {
      const shape = layer.parentNode.querySelector(':scope > .worm-part-shape');
      if (!shape) return;
      const all = [...layer.querySelectorAll('g.worm-mark')];
      const vis = all.filter(k => k.getAttribute('display') !== 'none');
      hidden += all.length - vis.length;
      shown += vis.length;

      vis.forEach(k => {
        const bb = k.getBBox();
        const ctmK = k.getScreenCTM(), ctmS = shape.getScreenCTM();
        if (!ctmK || !ctmS) return;
        const inv = ctmS.inverse();
        let bad = 0;
        [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]]
          .forEach(([x, y]) => {
            const p = svg.createSVGPoint(); p.x = x; p.y = y;
            const s = p.matrixTransform(ctmK).matrixTransform(inv);
            if (shape.isPointInFill(s)) return;
            bad++;
            for (let n = 1; n <= 40; n++) {
              const q = svg.createSVGPoint(); q.x = s.x * (1 - n / 40); q.y = s.y * (1 - n / 40);
              if (shape.isPointInFill(q)) { worst = Math.max(worst, Math.hypot(s.x - q.x, s.y - q.y)); break; }
            }
          });
        if (bad) { outside++; where[layer.getAttribute('data-anchor')] = (where[layer.getAttribute('data-anchor')] || 0) + 1; }
      });

      // Наложение: точки вдоль контура одной фигуры внутри другой.
      const paths = vis.map(g => g.querySelector('path')).filter(Boolean);
      for (let i = 0; i < paths.length; i++) {
        for (let j = 0; j < paths.length; j++) {
          if (i === j) continue;
          const pa = paths[i], pb = paths[j];
          const len = pa.getTotalLength(), n = 24;
          const m = pb.getScreenCTM().inverse().multiply(pa.getScreenCTM());
          let hits = 0;
          for (let s = 0; s < n; s++) {
            const pt = pa.getPointAtLength(len * s / n);
            const sp = svg.createSVGPoint(); sp.x = pt.x; sp.y = pt.y;
            if (pb.isPointInFill(sp.matrixTransform(m))) hits++;
          }
          if (hits > n * 0.15) { clashes++; where['лап:' + layer.getAttribute('data-anchor')] = (where['лап:' + layer.getAttribute('data-anchor')] || 0) + 1; }
        }
      }
      // Стопка: два шрама в одной точке. Ловится отдельно от наложения,
      // потому что стопка в ЦЕНТРЕ силуэта не «снаружи» и не всегда даёт
      // пересечение фигур — а на экране это одна клякса.
      const seen = [];
      vis.forEach(g => {
        const r = g.getBoundingClientRect();
        const c = [r.x + r.width / 2, r.y + r.height / 2];
        if (seen.some(s => Math.hypot(s[0] - c[0], s[1] - c[1]) < 1)) stacked++;
        seen.push(c);
      });
    });
    return { shown, outside, clashes: clashes / 2, hidden, worst: +worst.toFixed(2), stacked, where };
  });

  const fill = () => page.evaluate(() => {
    GameState.data.scars = [];
    let miss = 0;
    while (miss < 20) { if (Backend.grantMark('scar')) miss = 0; else miss++; }
    if (typeof refreshWormMarks === 'function') refreshWormMarks();
    return GameState.data.scars.length;
  });

  // ---------- 1. ТЕЛО ЗАБИТО, ГОЛОВА ХОДИТ ----------
  console.log('\n--- шрам на коже, а не рядом с ней ---');
  const total = await fill();
  await page.waitForTimeout(500);

  let sumShown = 0, sumOut = 0, sumClash = 0, sumStack = 0, worstOut = 0, samples = 0;
  let seenAtMinusOne = 0, seenAtPlusOne = 0; const outWhere = {}, outYaw = {};
  for (let pass = 0; pass < 3; pass++) {
    if (pass) { await fill(); await page.waitForTimeout(350); }
    for (let yaw = -1; yaw <= 1.001; yaw += 0.1) {
      const y = Math.round(yaw * 10) / 10;
      await setYaw(y);
      const r = await measure();
      samples++;
      sumShown += r.shown; sumOut += r.outside; sumClash += r.clashes; sumStack += r.stacked;
      Object.keys(r.where).forEach(k => { outWhere[k] = (outWhere[k] || 0) + r.where[k]; if (r.where[k]) outYaw[k] = (outYaw[k] || []).concat(y); });
      worstOut = Math.max(worstOut, r.worst);
      if (pass === 0 && y === -1) seenAtMinusOne = r.shown;
      if (pass === 0 && y === 1) seenAtPlusOne = r.shown;
    }
  }
  check(total > 50, `на тело влезает вменяемое число шрамов: ${total}`);
  check(sumShown > 0, `шрамы вообще видны: ${sumShown} показов за ${samples} замеров`);
  check(sumOut === 0, `ни один шрам не вылез за силуэт: ${sumOut} за ${samples} замеров (худший перелёт ${worstOut}px) ${JSON.stringify(outWhere)} ${JSON.stringify(outYaw)}`);
  check(sumClash === 0, `ни одна пара не налезла друг на друга: ${sumClash} ${JSON.stringify(outWhere)}`);
  check(sumStack === 0, `ни один шрам не лёг на другой в одну точку: ${sumStack}`);

  // ---------- 2. ПОВОРОТ ГОЛОВЫ ----------
  console.log('\n--- поворот головы ---');
  // Следим за КАЖДЫМ шрамом по его ключу, а не по номеру в списке: персонаж
  // может пересобраться между замерами, и номера тогда означают уже другие
  // шрамы.
  const grab = () => page.evaluate(() => {
    const layer = document.querySelector('[data-anchor="head-scars"]');
    const map = {};
    [...layer.querySelectorAll('g.worm-mark')].forEach(k => {
      const id = k.getAttribute('data-mark');
      if (!id) return;
      if (k.getAttribute('display') === 'none') { map[id] = null; return; }
      // Берём СОБСТВЕННЫЙ сдвиг отметины внутри головы, а не место на
      // экране: червь по комнате ходит, и экранный x меняется от его шагов,
      // а не от поворота головы. На этом проверка и врала — показывала ход
      // в 190 пикселей на голове шириной 80 и «шаги назад» там, где червь
      // просто шёл влево.
      const m = /translate\(([-0-9.]+)/.exec(k.getAttribute('transform') || '');
      map[id] = m ? parseFloat(m[1]) : null;
    });
    return map;
  });
  // Сметаем весь диапазон и смотрим на КАЖДЫЙ шрам отдельно. Среднее по
  // видимым не годится: при повороте меняется сам набор видимых, и среднее
  // по разным наборам не говорит ни о чём — первая версия проверки мерила
  // именно его и показывала «203 → 203» там, где шрам проезжал полголовы.
  // Требовать, чтобы шрам пережил ОБА края, тоже нельзя: у края он честно
  // прячется. Требуем одного: пока он виден, он едет в ту же сторону, что и
  // лицо, и ни разу не назад.
  const track = [];
  for (let yaw = -1; yaw <= 1.001; yaw += 0.2) {
    const y = Math.round(yaw * 10) / 10;
    await setYaw(y);
    track.push({ y, xs: await grab() });
  }
  const yawTest = (() => {
    const ids = Object.keys(track[0].xs);
    const n = ids.length;
    let travelled = 0, backwards = 0, ever = 0, maxRun = 0, worstBack = 0;
    // Допуск на дрожание. Отметина, прижатая к самому контуру, при
    // повороте едет вместе с контуром, а он на голове дышит — и её x
    // может качнуться назад на доли пикселя. Это не «плавает по телу»,
    // это дрожание в пределах толщины линии.
    const BACK_TOL = 1;
    ids.forEach(i => {
      const seen = track.filter(t => t.xs[i] != null);
      if (seen.length) ever++;
      if (seen.length < 2) return;
      const run = seen[seen.length - 1].xs[i] - seen[0].xs[i];
      maxRun = Math.max(maxRun, run);
      if (run > 4) travelled++;
      for (let k = 1; k < seen.length; k++) {
        const d = seen[k].xs[i] - seen[k - 1].xs[i];
        if (d < -BACK_TOL) backwards++;
        worstBack = Math.min(worstBack, d);
      }
    });
    const hidden = track.map(t => Object.keys(t.xs).filter(k => t.xs[k] == null).length);
    return { n, ever, travelled, backwards, worstBack: +worstBack.toFixed(1), maxRun: +maxRun.toFixed(1),
             hidMin: Math.min(...hidden), hidMax: Math.max(...hidden) };
  })();
  await setYaw(-1); const yawLeft = await grab();
  await setYaw(1);  await grab();
  await setYaw(-1); const yawBack = await grab();
  yawTest.returned = Object.keys(yawLeft).every(i => (yawLeft[i] == null) === (yawBack[i] == null));
  check(yawTest.travelled > 0 && yawTest.backwards === 0,
    `шрамы едут вместе с лицом и ни разу назад: проехали ${yawTest.travelled} из ${yawTest.ever}, назад ${yawTest.backwards} (худший шаг назад ${yawTest.worstBack}px), ход ${yawTest.maxRun}px`);
  check(yawTest.hidMax > yawTest.hidMin,
    `часть шрамов уходит за голову при повороте: скрыто от ${yawTest.hidMin} до ${yawTest.hidMax} из ${yawTest.n}`);
  check(yawTest.returned, 'вернувшиеся показываются те же, что и прятались');


  // ---------- 3. ШРАМ НЕ НА ГЛАЗУ ----------
  // Мерить надо БЕЛОК, а не «складки у глаза»: складки — это брови и
  // пол-щеки, и по ним прогон краснел там, где на снимке было чисто.
  console.log('\n--- черты лица свободны ---');
  // Мерим по САМИМ ЧЕРТАМ, а не по их габаритам: и глаз, и пятачок круглые,
  // и прямоугольник вокруг них захватывает углы, где ничего нет. Ровно на
  // этом прогон уже краснел там, где на снимке было чисто.
  const face = await page.evaluate(async () => {
    const svg = document.querySelector('#game-container svg') || document.querySelector('svg');
    const res = { parts: 0, onEye: 0, onSnout: 0, samples: 0 };
    const shapes = () => {
      const list = [];
      ['left', 'right'].forEach(side => {
        const g = document.querySelector(`[data-part="eye-${side}"]`);
        const e = g && g.querySelector('ellipse[fill*="sclera"]');
        if (e) list.push({ kind: 'eye', el: e });
      });
      const sn = document.querySelector('[data-part="snout"]');
      const se = sn && sn.querySelector('ellipse');
      if (se) list.push({ kind: 'snout', el: se });
      return list;
    };
    for (let yaw = -1; yaw <= 1.001; yaw += 0.2) {
      const target = Math.round(yaw * 10) / 10;
      MainWormHandle.setLivePose({ headYaw: target });
      for (let i = 0; i < 240; i++) {
        if (Math.abs(MainWormHandle.getHeadPose().current - target) < 0.01) break;
        await new Promise(r => requestAnimationFrame(r));
      }
      const parts = shapes();
      res.parts = parts.length;
      const layer = document.querySelector('[data-anchor="head-scars"]');
      [...layer.querySelectorAll('g.worm-mark')].filter(k => k.getAttribute('display') !== 'none').forEach(k => {
        const path = k.querySelector('path');
        if (!path) return;
        res.samples++;
        const len = path.getTotalLength(), n = 24;
        parts.forEach(p => {
          const m = p.el.getScreenCTM().inverse().multiply(path.getScreenCTM());
          let hits = 0;
          for (let s = 0; s < n; s++) {
            const pt = path.getPointAtLength(len * s / n);
            const sp = svg.createSVGPoint(); sp.x = pt.x; sp.y = pt.y;
            if (p.el.isPointInFill(sp.matrixTransform(m))) hits++;
          }
          if (hits > n * 0.15) { if (p.kind === 'eye') res.onEye++; else res.onSnout++; }
        });
      });
    }
    return res;
  });
  check(face.parts >= 3, `черты лица найдены: ${face.parts}`);
  check(face.onEye === 0, `ни один шрам не лёг на глаз: ${face.onEye} из ${face.samples}`);
  check(face.onSnout === 0, `ни один шрам не лёг на пятачок: ${face.onSnout} из ${face.samples}`);

  // ---------- СНИМКИ ----------
  const box = await page.evaluate(() => {
    const h = document.querySelector('[data-part="head"]').getBoundingClientRect();
    return { x: Math.max(0, h.x - 50), y: Math.max(0, h.y - 30), width: h.width + 100, height: h.height + 140 };
  });
  for (const yaw of [-1, 0, 1]) {
    await setYaw(yaw);
    await page.screenshot({ path: `${out}yaw${yaw}.png`, clip: box });
  }

  console.log('\n' + (errors.length ? errors.join('\n') : 'ошибок страницы нет'));
  console.log('\n' + (fail.length ? 'ПРОВАЛЕНО: ' + fail.length : 'ВСЁ ЗЕЛЁНОЕ'));
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})();
