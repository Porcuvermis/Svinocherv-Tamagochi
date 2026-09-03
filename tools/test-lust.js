// ============ ПРОГОН ВАННОЙ ЦЕЛИКОМ ============
//
// Водит пальцем ПО КООРДИНАТАМ, а не по селекторам: заодно проверяется, что
// перевод «экран → сцена» не врёт, а гнёзда, пришедшие из якорей запекания,
// стоят там, где нарисованы предметы.
//
// Проходит весь забег: кран → вода → мыло → мочалка → всплытие хвоста →
// пузыри → финал на меткость → награда в кошельке.
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-lust.js /tmp/shot-
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 },
                                       deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(1500);
  const out = process.argv[2] || '/tmp/lust-';
  const fail = [];
  const ok = (cond, what, extra) => {
    console.log(`  ${cond ? 'ok  ' : 'ПЛОХО'} ${what}${extra ? '   ' + extra : ''}`);
    if (!cond) fail.push(what);
  };

  await page.evaluate(() => LustMinigame.open());
  await page.waitForTimeout(600);

  // Точка сцены → точка экрана. Тот же перевод, которым игра кладёт предметы.
  const toScreen = (pt) => page.evaluate((p) => {
    const m = document.getElementById('bt-cam').getScreenCTM();
    const s = document.getElementById('bt-svg').createSVGPoint();
    s.x = p.x; s.y = p.y;
    const r = s.matrixTransform(m);
    return { x: r.x, y: r.y };
  }, pt);
  const phase = () => page.evaluate(() => LustMinigame.phase);
  const A = await page.evaluate(() => BATH_ART.slots());

  // ---------- КРАН ----------
  let p = await toScreen(A.faucet);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(3000);
  ok(await phase() === 'soap', 'кран налил воду и пустил к мылу', await phase());
  await page.screenshot({ path: out + '1-wash.png' });

  // ---------- МЫТЬЁ ----------
  // Возит инструментом по всей коробке покрытия. Мочалке нужно несколько
  // проходов: клетка засчитывается не с первого раза — тем она и отличается
  // от мыла.
  const scrub = async (kind, passes) => {
    const box = await page.evaluate(() => LustMinigame.coverBox());
    const q = await toScreen(A[kind]);
    await page.mouse.move(q.x, q.y);
    await page.mouse.down();
    for (let n = 0; n < passes; n++)
      for (let j = 0; j < 9; j++)
        for (let i = 0; i <= 14; i++) {
          const s = await toScreen({ x: box.x + (i + 0.5) * box.w / 14,
                                     y: box.y + (j + 0.5) * box.h / 9 });
          await page.mouse.move(s.x, s.y);
        }
    await page.mouse.up();
  };
  await scrub('soap', 1);
  ok(await phase() === 'cloth', 'мыло покрыло тело и передало мочалке', await phase());

  // Мыло обязано лежать ТОЛЬКО на черве. Проверка буквальная: сравниваем
  // пиксели следа с маской силуэта. Первая версия рисовала след фигурами в
  // svg, и намыливалась вся вода вокруг тела.
  const spill = await page.evaluate(() => {
    const L = LustMinigame;
    const f = document.getElementById('bt-film').getContext('2d')
        .getImageData(0, 0, 900, 450).data;
    const m = L.mask.getContext('2d').getImageData(0, 0, 900, 450).data;
    let out = 0, on = 0;
    for (let i = 3; i < f.length; i += 4) {
      if (f[i] < 8) continue;
      if (m[i] > 0) on++; else out++;
    }
    return { out, on };
  });
  ok(spill.on > 1000, 'мыло легло на тело', `${spill.on} точек`);
  ok(spill.out === 0, 'мимо тела не намылено', `${spill.out} точек мимо`);

  await scrub('cloth', 4);
  await page.waitForTimeout(1600);
  const bubbles = await page.evaluate(() => (LustMinigame.bubbles || []).length);
  ok(await phase() === 'pop', 'мочалка домыла, хвост всплыл', await phase());
  ok(bubbles >= 8 && bubbles <= 12, 'пузырей 8–12', String(bubbles));
  await page.screenshot({ path: out + '2-tail.png' });

  // ---------- ПУЗЫРИ ----------
  // Тапов должно хватить МЕНЬШЕ, чем пузырей: соседние лопаются пачкой.
  let taps = 0;
  for (let n = 0; n < 20; n++) {
    const b = await page.evaluate(() =>
      (LustMinigame.bubbles || []).filter(x => x.alive)[0] || null);
    if (!b) break;
    const s = await toScreen(b);
    await page.mouse.click(s.x, s.y);
    taps++;
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
  ok(await phase() === 'aim', 'пузыри лопнули, начался финал', await phase());
  // Потолок на узлы в сцене. След от мыла и мочалки раньше копился
  // ОТДЕЛЬНЫМИ полупрозрачными фигурами — к концу мытья их набиралось за
  // две сотни, и на телефоне кадры умирали. Теперь весь след — два холста,
  // и дерево обязано оставаться маленьким.
  const nodes = await page.evaluate(() =>
    document.getElementById('bt-cam').querySelectorAll('*').length);
  ok(nodes < 120, 'дерево сцены не распухает от следа', `${nodes} узлов`);
  ok(taps < bubbles, 'лопались пачкой, а не по одному', `${taps} тапов на ${bubbles}`);
  await page.screenshot({ path: out + '3-aim.png' });

  // ---------- ФИНАЛ ----------
  // Хвост — отгибаемый прут: он НЕ встаёт туда, куда показывает палец.
  // Проверяем это прямо: сначала тянем ровно «на рот» и убеждаемся, что
  // упругость не пускает, потом с перетягом — и тогда встаёт.
  const bendAt = async (target) => {
    const t = await toScreen(target);
    await page.mouse.move(t.x, t.y);
    await page.mouse.down();
    await page.waitForTimeout(900);
    const b = await page.evaluate(() => LustMinigame.bend);
    await page.mouse.up();
    await page.waitForTimeout(900);
    return b;
  };
  const aim = await page.evaluate(() => LustMinigame.bendAim);
  // «Навёл ровно на цель» — палец на той дуге, которая соответствует нужному
  // изгибу один в один, без всякого запаса на упругость.
  const naive = await bendAt(await page.evaluate(() => {
    const L = LustMinigame, A2 = BATH_ART.slots();
    const a = L.bendAim / L.BEND_MAX * Math.PI / 2, r = 200;
    return { x: A2.tail.x + Math.sin(a) * r, y: A2.tail.y - Math.cos(a) * r };
  }));
  ok(naive < aim * 0.85, 'хвост сопротивляется, а не идёт за пальцем',
     `навёл на рот — изгиб ${naive.toFixed(2)} из нужных ${aim.toFixed(2)}`);
  const relaxed = await page.evaluate(() => LustMinigame.bend);
  ok(relaxed < naive * 0.5, 'отпущенный хвост возвращается', relaxed.toFixed(2));

  // Точка перетяга: палец уводится по дуге вокруг корня дальше, чем нужный
  // изгиб, — ровно настолько, чтобы равновесие село на прицел. Так тянет и
  // живой игрок: «дальше, чем нужно, потому что не доходит».
  const hold = await page.evaluate(() => {
    const L = LustMinigame, A2 = BATH_ART.slots(), u = L.bendAim / L.BEND_MAX;
    const wantU = u + L.BEND_STIFF * u * (1 + L.BEND_HARD * u * u) / L.BEND_PULL;
    const a = Math.min(1, wantU) * Math.PI / 2, r = 200;
    return { x: A2.tail.x + Math.sin(a) * r, y: A2.tail.y - Math.cos(a) * r };
  });
  const hs = await toScreen(hold);
  await page.mouse.move(hs.x, hs.y);
  await page.mouse.down();
  await page.waitForTimeout(900);
  const held = await page.evaluate(() => LustMinigame.bend);
  ok(Math.abs(held - aim) < 0.18, 'с перетягом хвост встаёт на прицел',
     `${held.toFixed(2)} против ${aim.toFixed(2)}`);

  const shots = await page.evaluate(() => LustMinigame.cfg().shots);
  for (let i = 0; i < shots + 2; i++) {
    await page.mouse.move(hs.x + (i % 2), hs.y);   // палец держит, хвост не отпускает
    await page.waitForTimeout(1500);
  }
  await page.mouse.up();
  await page.waitForTimeout(1200);

  const res = await page.evaluate(() => ({
    phase: LustMinigame.phase,
    hits: LustMinigame.hits,
    shard: GameState.data.currencies.lust_shard || 0,
    token: GameState.data.currencies.lust_token || 0,
    sin: Math.round(GameState.sinValue('lust'))
  }));
  ok(res.phase === 'done', 'финал доигран', res.phase);
  ok(res.hits > 0, 'на прицеле хотя бы одно попадание', `${res.hits} из ${shots}`);
  ok(res.sin === 100, 'шкала похоти полная', String(res.sin));
  // Осколок за каждую заполненную секцию; три складываются в жетон разменом.
  const want = Math.min(3, Math.floor(res.hits / 2));
  ok(res.shard + res.token * 3 === want, 'начислено по числу секций',
     `${res.shard} осколка + ${res.token} жетон, ждали ${want}`);
  await page.screenshot({ path: out + '4-done.png' });

  console.log(errs.length ? '\nОШИБКИ:\n  ' + errs.join('\n  ') : '\nошибок нет');
  await browser.close();
  if (fail.length || errs.length) process.exit(1);
})();
