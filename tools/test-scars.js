const { chromium } = require('playwright');
const { viewport, prepare } = require('./harness');

// ================= ПРОГОН: ШРАМЫ НА ТЕЛЕ =================
// Шрамы — не картинка поверх червя, а отметины НА КОЖЕ. Отсюда три
// требования, и все три когда-то нарушались разом (docs/traps.md, п. 102):
//
//   1. шрам целиком внутри силуэта — ни один конец не торчит наружу;
//   2. шрамы не налезают друг на друга — рядом можно, внахлёст нельзя;
//   3. при повороте головы шрамы едут ВМЕСТЕ С ЛИЦОМ: уехавшие на изнанку
//      прячутся, вернувшиеся — показываются.
//
// Первые две проверки считаются по поверхности и не нуждаются в браузере,
// третья — по реальному дереву после поворота.
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

  // ---------- 1. ГЕОМЕТРИЯ ПО ПОВЕРХНОСТИ ----------
  console.log('\n--- размещение по коже ---');
  const geom = await page.evaluate(() => {
    const model = WormModelAPI.loadWormModel();
    const marks = [];
    // Набиваем тело до отказа: интересен именно плотный случай.
    for (let i = 0; i < 400; i++) {
      const zone = WormMarks.ZONES[i % 3];
      const seed = 1000 + i * 7919;
      const spot = WormMarks.pickSpot(marks, zone, seed, model);
      if (!spot) continue;
      marks.push({ id: 'g' + i, kind: 'scar', zone, t: spot.t, phi: spot.phi, seed });
    }

    let outside = 0, clashes = 0, hidden = 0;
    marks.forEach(m => {
      const p = WormMarks.resolve(model, m);
      const g = WormMarks.geometry(m.seed, 'scar');
      const a = p.rotation * Math.PI / 180;
      // Габарит с учётом поворота — так же, как его считает размещение.
      const hx = Math.abs(g.length / 2 * Math.cos(a)) + Math.abs(g.width / 2 * Math.sin(a));
      const hy = Math.abs(g.length / 2 * Math.sin(a)) + Math.abs(g.width / 2 * Math.cos(a));
      if (Math.hypot(Math.abs(p.x) + hx, Math.abs(p.y) + hy) > 1) outside++;
      if (!p.front) hidden++;
    });
    for (let i = 0; i < marks.length; i++)
      for (let j = i + 1; j < marks.length; j++)
        if (WormMarks.clash(WormMarks.surface(model, marks[i]),
                            WormMarks.surface(model, marks[j]))) clashes++;

    return { total: marks.length, outside, clashes, hidden };
  });

  check(geom.total > 40, `на тело влезает вменяемое число шрамов: ${geom.total}`);
  check(geom.outside === 0,
    `ни один шрам не вылезает за силуэт: ${geom.outside} из ${geom.total}`);
  check(geom.clashes === 0,
    `ни одна пара не налезает друг на друга: ${geom.clashes}`);
  check(geom.hidden > 0 && geom.hidden < geom.total,
    `часть шрамов на изнанке и не рисуется: ${geom.hidden} из ${geom.total}`);

  // ---------- 2. РАКУРС НА ТЕЛЕ ----------
  // Шрам у силуэтного края сплющен поперёк: кожа там уходит от зрителя.
  // Без этого шрам читается наклейкой, а не отметиной на круглом теле.
  const squash = await page.evaluate(() => {
    const model = WormModelAPI.loadWormModel();
    const at = (phi) => WormMarks.resolve(model, { zone: 'body', t: 0.5, phi, seed: 7 });
    return { face: at(0).squashY, edge: at(Math.PI / 2 * 0.95).squashY, back: at(Math.PI).front };
  });
  check(squash.face > 0.9 && squash.edge < 0.25,
    `у края силуэта шрам сплющен, в центре нет: ${squash.face.toFixed(2)} → ${squash.edge.toFixed(2)}`);
  check(squash.back === false, 'шрам на изнанке не показывается');

  // ---------- 3. ШРАМЫ ГОЛОВЫ ЕДУТ С ЛИЦОМ ----------
  console.log('\n--- поворот головы ---');
  await page.evaluate(async () => {
    GameState.data.scars = [];
    for (let i = 0; i < 40; i++) Backend.grantMark('scar', 'head');
    GameState.save();
    refreshWormMarks();
    WrathMinigame.open();
    WrathMinigame.showLobby();
    await new Promise(r => setTimeout(r, 1200));
  });

  const look = (yaw) => page.evaluate(async (y) => {
    WrathLobby.wormHandle.setHeadPose(y);
    await new Promise(r => setTimeout(r, 800));
    const list = [...document.querySelectorAll('#wrath-lobby-worm [data-anchor="head-scars"] .worm-mark-scar')];
    const seen = list.filter(e => getComputedStyle(e).display !== 'none');
    // Глаз — это ГЛАЗНОЕ ЯБЛОКО, а не вся область вокруг него. Сначала тут
    // стояли группы ресниц и складок: их габарит захватывает бровь и пол-щеки,
    // и шрам на виске засчитывался «лёгшим на глаз», хотя на снимке щека
    // чистая. Проверка обязана мерить то же, что видит игрок.
    const eyes = [...document.querySelectorAll('#wrath-lobby-worm [data-part="head"] ellipse')]
      .filter(e => (e.getAttribute('fill') || '').indexOf('sclera') >= 0)
      .map(e => e.getBoundingClientRect());
    return {
      total: list.length,
      seen: seen.length,
      x: seen.length ? seen.reduce((s, e) => s + e.getBoundingClientRect().x, 0) / seen.length : 0,
      // Ни один видимый шрам не должен лежать на глазу.
      eyes: eyes.length,
      // Касание краем — не «лёг на глаз». Считается ДОЛЯ площади шрама,
      // накрывшая глазное яблоко: четверть и больше — это уже поверх глаза.
      onEye: seen.filter(e => {
        const b = e.getBoundingClientRect();
        const area = Math.max(1, b.width * b.height);
        return eyes.some(g => {
          const ox = Math.min(b.right, g.right) - Math.max(b.left, g.left);
          const oy = Math.min(b.bottom, g.bottom) - Math.max(b.top, g.top);
          return ox > 0 && oy > 0 && (ox * oy) / area > 0.25;
        });
      }).length
    };
  }, yaw);

  const left = await look(-1);
  await page.screenshot({ path: out + 'yaw-left.png' });
  const right = await look(1);
  await page.screenshot({ path: out + 'yaw-right.png' });

  check(Math.abs(right.x - left.x) > 12,
    `шрамы едут вместе с лицом: середина ${left.x.toFixed(0)} → ${right.x.toFixed(0)}`);
  check(left.seen < left.total,
    `часть шрамов уходит за голову при повороте: видно ${left.seen} из ${left.total}`);
  check(right.seen > left.seen,
    `и возвращается при повороте обратно: ${left.seen} → ${right.seen}`);
  check(left.eyes > 0 && right.eyes > 0,
    `глазные яблоки найдены: ${left.eyes} / ${right.eyes}`);
  check(left.onEye === 0 && right.onEye === 0,
    `ни один шрам не лёг на глаз: ${left.onEye} / ${right.onEye}`);

  console.log(errors.length ? '\nОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n') : '\nошибок страницы нет');
  console.log(fail.length ? `\nПРОВАЛЕНО: ${fail.length}` : '\nВСЁ ЗЕЛЁНОЕ');
  await browser.close();
  process.exit(fail.length || errors.length ? 1 : 0);
})();
