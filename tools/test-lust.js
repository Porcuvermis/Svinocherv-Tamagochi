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
  // Хвост держится ТОЛЧКАМИ: палец наклоняет его движением по дуге вокруг
  // корня, а сам он всё время выпрямляется. Проверяем обе половины.
  const arcPoint = (a, r) => page.evaluate(([ang, rad]) => {
    const A2 = BATH_ART.slots();
    return { x: A2.tail.x + Math.sin(ang) * rad, y: A2.tail.y - Math.cos(ang) * rad };
  }, [a, r]);
  const R = 190;

  // Один проход пальцем по дуге: наклоняет хвост.
  const stroke = async (from, to, steps) => {
    for (let i = 0; i <= (steps || 8); i++) {
      const p2 = await arcPoint(from + (to - from) * i / (steps || 8), R);
      const s2 = await toScreen(p2);
      await page.mouse.move(s2.x, s2.y);
    }
  };

  const aim = await page.evaluate(() => LustMinigame.bendAim);
  const bendMax = await page.evaluate(() => LustMinigame.BEND_MAX);
  // Прицел обязан лежать В СЕРЕДИНЕ размаха. Один раз он оказался у самого
  // предела: максимально согнутый хвост всё равно не доставал до рта, и финал
  // был физически непроходим. Заодно это и требование к игре — должно быть
  // место и недогнуть, и перегнуть.
  ok(aim > bendMax * 0.25 && aim < bendMax * 0.7,
     'прицел лежит в середине размаха хвоста',
     `${aim.toFixed(2)} из ${bendMax}`);
  const start = await arcPoint(0.05, R);
  const ss = await toScreen(start);
  await page.mouse.move(ss.x, ss.y);
  await page.mouse.down();
  await stroke(0.05, 1.15, 12);
  await stroke(0.05, 1.15, 12);
  const pushed = await page.evaluate(() => LustMinigame.bend);
  ok(pushed > aim * 0.7, 'хвост наклоняется толчком пальца',
     `изгиб ${pushed.toFixed(2)} при прицеле ${aim.toFixed(2)}`);

  // Палец НА ЭКРАНЕ и неподвижен — хвост обязан выпрямляться сам.
  await page.waitForTimeout(1100);
  const held = await page.evaluate(() => LustMinigame.bend);
  // Окно попадания по изгибу — примерно ±0.13 радиана, и за секунду хвост
  // обязан уйти из него с запасом. Иначе «поставил и забыл» возвращается.
  // Доля, а не разница: скорость выпрямления зависит от того, насколько
  // хвост согнут, и порог в абсолютных радианах сравнивал бы разные величины.
  ok((pushed - held) / pushed > 0.17, 'неподвижный палец хвост не держит',
     `${pushed.toFixed(2)} → ${held.toFixed(2)} за секунду`);

  // Перегнуть можно: доводим до упора.
  for (let i = 0; i < 9; i++) await stroke(0.05, 1.4, 8);
  const over = await page.evaluate(() => LustMinigame.bend);
  ok(over > aim * 1.25, 'хвост можно перегнуть', over.toFixed(2));
  await page.mouse.up();
  await page.waitForTimeout(2600);
  const back = await page.evaluate(() => LustMinigame.bend);
  ok(back < over * 0.5, 'отпущенный хвост выпрямляется',
     `${over.toFixed(2)} → ${back.toFixed(2)}`);

  // Весь финал: держим прицел подталкиваниями — это и есть умелая игра, под
  // которую считан баланс в tools/sim-lust.js.
  const s0 = await toScreen(await arcPoint(0.05, R));
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.down();
  const shots = await page.evaluate(() => LustMinigame.cfg().shots);
  const t0 = Date.now();
  let held0 = 0, held0n = 0;
  while (Date.now() - t0 < (shots + 2) * 1500) {
    const b = await page.evaluate(() => LustMinigame.bend);
    held0 += Math.abs(b - aim); held0n++;
    if (b < aim - 0.03) {
      // Короткий подталкивающий ход — так же поправляет прицел живая рука.
      const from = 0.4 + Math.random() * 0.2;
      await stroke(from, from + 0.14, 3);
    } else {
      await page.waitForTimeout(70);
    }
  }
  await page.mouse.up();
  await page.waitForTimeout(1200);
  ok(held0 / held0n < 0.3, 'прицел удерживается подталкиваниями',
     `среднее отклонение ${(held0 / held0n).toFixed(2)} рад`);

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
