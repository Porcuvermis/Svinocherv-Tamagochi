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
    while (miss < 20) { if (Backend.grantMark()) miss = 0; else miss++; }
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

  // ---------- ЧТО В ДАННЫХ, ТО И НА ТЕЛЕ ----------
  // Потолок «зона показывает последние восемь» делал так, что новый шрам
  // ВЫТАЛКИВАЛ с экрана старый: ставишь один — другой на глазах пропадает.
  // Двух разных правд об одном теле быть не должно.
  console.log('\n--- что в данных, то и на теле ---');
  const mounted = await page.evaluate(() => {
    const kinds = {}, shown = {};
    GameState.data.scars.forEach(m => { kinds[m.kind] = (kinds[m.kind] || 0) + 1; });
    document.querySelectorAll('.worm-scar-layer g.worm-mark').forEach(n => {
      const k = (n.getAttribute('class').match(/worm-mark-(\w+)/) || [])[1];
      shown[k] = (shown[k] || 0) + 1;
    });
    // Чем нарисован каждый вид: у фигур должны быть РАЗНЫЕ силуэты, иначе
    // «три вида» это три названия одного и того же.
    const shapes = {};
    document.querySelectorAll('.worm-scar-layer g.worm-mark').forEach(n => {
      const k = (n.getAttribute('class').match(/worm-mark-(\w+)/) || [])[1];
      if (shapes[k]) return;
      shapes[k] = [...n.children].map(c => c.tagName).join('+');
    });
    return { saved: GameState.data.scars.length, kinds, shown, shapes };
  });
  const shownTotal = Object.keys(mounted.shown).reduce((a, k) => a + mounted.shown[k], 0);
  check(shownTotal === mounted.saved,
    `на теле столько же отметин, сколько в сейве: ${shownTotal} и ${mounted.saved}`);
  check(Object.keys(mounted.kinds).length === 3,
    `встречаются все три вида: ${JSON.stringify(mounted.kinds)}`);
  check(new Set(Object.keys(mounted.shapes).map(k => mounted.shapes[k])).size === 3,
    `у каждого вида своя фигура, а не общая: ${JSON.stringify(mounted.shapes)}`);

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
    // Сколько отметин ПРЯТАЛИСЬ И ПОКАЗЫВАЛИСЬ. Считать «менялось ли общее
    // число скрытых» нельзя: на голове их всего две-три, и одна ушла, другая
    // пришла — итог тот же, а прогон краснеет на ровном месте.
    const swapped = ids.filter(i => {
      const on = track.some(t => t.xs[i] != null);
      const off = track.some(t => t.xs[i] == null);
      return on && off;
    }).length;
    // Каждая отметина головы обязана быть видна в том диапазоне, который
    // голова реально проходит (±0.5). Проверять это на «пусть червь поживёт»
    // нельзя: за семьсот кадров он успевает обойти не весь диапазон, и
    // прогон краснеет там, где всё в порядке.
    const inRange = track.filter(t => Math.abs(t.y) <= 0.5);
    const seenNear = ids.filter(i => inRange.some(t => t.xs[i] != null)).length;
    return { n, ever, travelled, swapped, seenNear, backwards, worstBack: +worstBack.toFixed(1), maxRun: +maxRun.toFixed(1),
             hidMin: Math.min(...hidden), hidMax: Math.max(...hidden) };
  })();
  await setYaw(-1); const yawLeft = await grab();
  await setYaw(1);  await grab();
  await setYaw(-1); const yawBack = await grab();
  yawTest.returned = Object.keys(yawLeft).every(i => (yawLeft[i] == null) === (yawBack[i] == null));
  check(yawTest.travelled > 0 && yawTest.backwards === 0,
    `шрамы едут вместе с лицом и ни разу назад: проехали ${yawTest.travelled} из ${yawTest.ever}, назад ${yawTest.backwards} (худший шаг назад ${yawTest.worstBack}px), ход ${yawTest.maxRun}px`);
  check(yawTest.n < 2 || yawTest.swapped > 0,
    `шрамы прячутся за голову и возвращаются: так делают ${yawTest.swapped} из ${yawTest.n}`);
  check(yawTest.returned, 'вернувшиеся показываются те же, что и прятались');
  check(yawTest.n === 0 || yawTest.seenNear === yawTest.n,
    `каждый шрам головы видно в рабочем повороте: ${yawTest.seenNear} из ${yawTest.n}`);


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
      // Глаз — это не только белок: веки, ресницы и бровь сидят на
      // глазнице, и шрам, задевший её, читается как шрам на глазу. Первая
      // версия мерила белок и была зелёной на скриншоте, где шрам лежал на
      // внешнем уголке.
      ['left', 'right'].forEach(side => {
        const g = document.querySelector(`[data-part="eye-${side}"]`);
        if (!g) return;
        const socket = g.querySelector('ellipse');           // глазница — первая
        const sclera = g.querySelector('ellipse[fill*="sclera"]');
        if (sclera) list.push({ kind: 'eye', el: sclera });
        if (socket && socket !== sclera) list.push({ kind: 'eye', el: socket });
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

  // ---------- НЕ МИГАЕТ ----------
  // Жалоба была ровно такая: «персонаж просто чуть-чуть ходит, а шрам на лбу
  // мигает». Поэтому здесь НИЧЕГО не задаётся руками — червь живёт сам, а мы
  // считаем, сколько раз каждая отметина сменила видимость. Один проход
  // головы туда-обратно — это максимум два переключения на отметину; больше
  // значит, что она моргает на пороге.
  console.log('\n--- не мигает ---');
  const flick = await page.evaluate(async () => {
    // Отпускаем поворот: до этого прогон держал его руками, и червь стоял бы
    // столбом — а мигание ловится именно на своей, живой болтанке головы.
    MainWormHandle.setLivePose({ headYaw: null });
    // Заставляем червя ПРОЙТИСЬ: своей болтанки головы за семьсот кадров
    // хватает не всегда (замер: то 0.98, то 0.04), и прогон краснел на ровном
    // месте. Ходьба поворачивает голову надёжно — и это ровно тот случай, на
    // который жаловались.
    if (MainWormHandle.walkTo) MainWormHandle.walkTo(320, 700);
    await new Promise(r => setTimeout(r, 400));
    const layer = document.querySelector('[data-anchor="head-scars"]');
    const state = {}, flips = {}, seen = {}; const yaws = [];
    for (let i = 0; i < 700; i++) {
      await new Promise(r => requestAnimationFrame(r));
      yaws.push(MainWormHandle.getHeadPose().current);
      if (i === 350 && MainWormHandle.walkTo) MainWormHandle.walkTo(70, 700);
      [...layer.querySelectorAll('g.worm-mark')].forEach(n => {
        const id = n.getAttribute('data-mark');
        const path = n.querySelector('path');
        const op = path ? parseFloat(path.getAttribute('opacity') || '1') : 0;
        const on = n.getAttribute('display') !== 'none' && op > 0.02;
        if (state[id] !== undefined && state[id] !== on) flips[id] = (flips[id] || 0) + 1;
        state[id] = on;
        if (on) seen[id] = (seen[id] || 0) + 1;
      });
    }
    const ids = Object.keys(state);
    return {
      n: ids.length,
      worst: Math.max(0, ...ids.map(k => flips[k] || 0)),
      everSeen: ids.filter(k => seen[k]).length,
      span: +(Math.max(...yaws) - Math.min(...yaws)).toFixed(2)
    };
  });
  // За семьсот кадров червь проходит комнату в обе стороны, и голова
  // успевает отвернуться и вернуться ДВАЖДЫ. Значит честных смен видимости у
  // одной отметины может быть до четырёх; всё, что сверху, — уже моргание.
  check(flick.worst <= 4, `шрам не моргает, пока червь живёт: худшая отметина сменила видимость ${flick.worst} раз за 700 кадров`);
  check(flick.span > 0.1, `голова за прогон успела погулять: на ${flick.span}`);

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
