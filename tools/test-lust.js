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
const harness = require('./harness');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
  await harness.prepare(page);
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

  await page.evaluate(() => { GameState.setSinValue('lust', 0); LustMinigame.open(); });
  await page.waitForTimeout(600);

  // Точка сцены → точка экрана. Через SvgSpace и числа камеры, а НЕ через
  // getScreenCTM: прогон, который сам считает матрицей, промахнётся вместе с
  // ней и обвинит игру (см. tools/harness.js).
  const toScreen = (pt) => page.evaluate((p) => {
    const c = LustMinigame.cam;
    return SvgSpace.toClient(document.getElementById('bt-svg'),
                             c.tx + c.s * p.x, c.ty + c.s * p.y);
  }, pt);
  const phase = () => page.evaluate(() => LustMinigame.phase);
  const A = await page.evaluate(() => BATH_ART.slots());

  // ---------- ДУШ ----------
  const nodesNow = () => page.evaluate(() =>
    document.getElementById('bt-cam').querySelectorAll('*').length);

  let p = await toScreen(A.showerHead);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(2000);
  const nodesBefore = await nodesNow();
  ok(await phase() === 'soap', 'душ полил и пустил к мылу', await phase());
  await page.screenshot({ path: out + '1-wash.png' });

  // ---------- МЫТЬЁ ----------
  // Возит инструментом по всей коробке покрытия. Мочалке нужно несколько
  // проходов: клетка засчитывается не с первого раза — тем она и отличается
  // от мыла.
  // Водит инструментом змейкой по всей коробке покрытия, шагом в полклетки:
  // мельче шага мазок всё равно не засчитывается. Возвращает, сколько
  // движений понадобилось — по этому числу видно, мгновенный этап или нет.
  const scrub = async (kind, maxPasses) => {
    const box = await page.evaluate(() => LustMinigame.coverBox());
    const G = await page.evaluate(() => LustMinigame.grid());
    const q = await toScreen(A[kind]);
    await page.mouse.move(q.x, q.y);
    await page.mouse.down();
    let moves = 0, done = false;
    for (let n = 0; n < maxPasses && !done; n++) {
      for (let j = 0; j < G.ny * 2 && !done; j++) {
        for (let i = 0; i <= G.nx * 2; i++) {
          const ii = (j % 2) ? G.nx * 2 - i : i;
          const s = await toScreen({ x: box.x + (ii + 0.5) * box.w / (G.nx * 2),
                                     y: box.y + (j + 0.5) * box.h / (G.ny * 2) });
          await page.mouse.move(s.x, s.y);
          moves++;
        }
        // Проверяем после КАЖДОГО ряда, а не прохода: иначе счётчик работы
        // округляется до целого прохода и этапы становятся неразличимы.
        if (await phase() !== kind) done = true;
      }
    }
    await page.mouse.up();
    return moves;
  };
  const soapMoves = await scrub('soap', 4);
  ok(await phase() === 'cloth', 'мыло покрыло тело и передало мочалке', await phase());
  // Этап не должен проходиться одним движением. Порог по ЧИСЛУ мазков, а не
  // по секундам: секунды в headless свои, а работа — та же.
  ok(soapMoves > 30, 'намыливание требует работы, а не одного мазка',
     `${soapMoves} движений`);
  const nodesAfterSoap = await nodesNow();

  // Мыло обязано лежать НА ЧЕРВЕ. Проверка буквальная: сравниваем пиксели
  // следа с маской силуэта. Первая версия рисовала след фигурами в svg, и
  // намыливалась вся вода вокруг тела.
  //
  // Но и НОЛЬ снаружи — тоже неправда. Пузырь выпуклый: у кромки тела
  // половина его честно торчит наружу, и обрезка всего следа силуэтом
  // давала пене идеально ровную дугу по контуру червя. Поэтому проверяется
  // не «ни точки снаружи», а КАЙМА: доля снаружи мелкая, и ни одна точка не
  // отходит от силуэта дальше пузыря.
  const spill = await page.evaluate(() => {
    const L = LustMinigame;
    const c = document.getElementById('bt-wash');
    const f = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const m = L.mask.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const W = c.width;
    let out = 0, on = 0;
    const bb = (o) => o;
    let fx0 = 1e9, fy0 = 1e9, fx1 = -1e9, fy1 = -1e9;
    let mx0 = 1e9, my0 = 1e9, mx1 = -1e9, my1 = -1e9;
    for (let i = 3, p = 0; i < f.length; i += 4, p++) {
      const x = p % W, y = (p / W) | 0;
      if (m[i] > 0) {
        if (x < mx0) mx0 = x; if (x > mx1) mx1 = x;
        if (y < my0) my0 = y; if (y > my1) my1 = y;
      }
      if (f[i] < 8) continue;
      if (x < fx0) fx0 = x; if (x > fx1) fx1 = x;
      if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
      if (m[i] > 0) on++; else out++;
    }
    return { out, on,
             over: Math.max(mx0 - fx0, fx1 - mx1, my0 - fy0, fy1 - my1) };
  });
  ok(spill.on > 1000, 'мыло легло на тело', `${spill.on} точек`);
  ok(spill.out / (spill.on + spill.out) < 0.08,
     'за силуэт вылезает только кайма пены',
     `${(spill.out / (spill.on + spill.out) * 100).toFixed(1)}% точек снаружи`);
  ok(spill.over <= 34, 'кайма не дальше одного пузыря от тела',
     `${spill.over} точек холста`);

  const clothMoves = await scrub('cloth', 8);
  // Мочалка НЕ обязана быть длиннее мыла — она обязана быть НЕ КОРОЧЕ и
  // требовать своей работы. Пока с неё спрашивали три тёрки узким пятном,
  // она и была длиннее — ценой того, что игрок доводил её пиксель-хантингом
  // по уже сплошь намыленному червю. Разница между мылом и мочалкой в
  // ДВИЖЕНИИ (широкий мазок против частой тёрки), а не в минутах.
  ok(clothMoves >= soapMoves * 0.9, 'мочалка требует своей работы',
     `${clothMoves} против ${soapMoves} у мыла`);
  await page.waitForTimeout(1600);
  const bubbles = await page.evaluate(() => (LustMinigame.bubbles || []).length);
  ok(await phase() === 'pop', 'мочалка домыла, хвост всплыл', await phase());
  const BUB = await page.evaluate(() => LustMinigame.cfg());
  ok(bubbles >= BUB.bubblesMin && bubbles <= BUB.bubblesMax,
     `пузырей ${BUB.bubblesMin}–${BUB.bubblesMax}`, String(bubbles));
  // Калибр РАЗНЫЙ: одинаковые кружки складываются в бусы, а не в пену.
  const rr = await page.evaluate(() => (LustMinigame.bubbles || []).map(b => b.r));
  ok(Math.max(...rr) / Math.min(...rr) > 1.8, 'пузыри разного калибра',
     `${Math.min(...rr).toFixed(0)}…${Math.max(...rr).toFixed(0)}`);
  await page.screenshot({ path: out + '2-tail.png' });

  // ---------- ПУЗЫРИ ----------
  // Лопаются ПО ОДНОМУ за касание: щелчок по пузырю — само по себе
  // удовольствие, ради которого этап и существует.
  let taps = 0;
  for (let n = 0; n < 50; n++) {
    const b = await page.evaluate(() =>
      (LustMinigame.bubbles || []).filter(x => x.alive)[0] || null);
    if (!b) break;
    const s = await toScreen(b);
    await page.mouse.click(s.x, s.y);
    taps++;
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
  ok(await phase() === 'rub', 'пузыри лопнули, начались поглаживания',
     await phase());
  // След от мыла и мочалки раньше копился ОТДЕЛЬНЫМИ полупрозрачными
  // фигурами — к концу мытья их набиралось за две сотни, и на телефоне кадры
  // умирали. Теперь весь след — два холста, и дерево сцены от мытья не
  // меняется вовсе. Сравниваем с замером ДО мытья: абсолютное число зависит
  // от того, что ещё нарисовано в кадре, а прирост — только от следа.
  ok(nodesAfterSoap === nodesBefore, 'дерево сцены не распухает от следа',
     `${nodesAfterSoap} против ${nodesBefore}`);
  ok(taps === bubbles, 'лопались по одному за касание',
     `${taps} тапов на ${bubbles}`);
  await page.screenshot({ path: out + '3-rub.png' });

  // Сколько капель ОБЕЩАНО рту при вылете. Попадёт ли капля, игра решает
  // в момент толчка тем же полётом, что у калькулятора (LustShot.fly), и
  // дальше такую каплю ничто не ловит. Если по дороге её перехватит морда
  // или хвост, попаданий станет меньше обещанного — и баланс, посчитанный
  // калькулятором, разойдётся с игрой. Считаются только вызовы из толчка:
  // прицел на входе в финал тоже зовёт fly, но ничего не обещает.
  await page.evaluate(() => {
    const fly = LustShot.fly;
    window.__promised = 0;
    LustShot.fly = function (...a) {
      const r = fly.apply(this, a);
      if (r.hit && /shoot/.test(new Error().stack)) window.__promised++;
      return r;
    };
  });

  // ---------- ПОГЛАЖИВАНИЕ ----------
  // Хвост наливается от ПУТИ пальца вдоль него и спадает, пока палец стоит.
  // Проверяем обе половины: иначе достаточно положить палец и ждать.
  const tailPt = (t) => page.evaluate((k) => {
    const A2 = BATH_ART.slots();
    const sp = BATH_ART.tailSpine(0, LustMinigame.tailGrow());
    const p2 = sp[Math.round(k * (sp.length - 1))];
    return { x: A2.tail.x + p2.x, y: A2.tail.y + p2.y };
  }, t);
  const grow0 = await page.evaluate(() => LustMinigame.tailGrow());
  let a2 = await toScreen(await tailPt(0.15));
  await page.mouse.move(a2.x, a2.y);
  await page.mouse.down();
  // Палец лежит неподвижно — заряд не растёт.
  await page.waitForTimeout(700);
  const still = await page.evaluate(() => LustMinigame.charge);
  ok(still < 0.02, 'неподвижный палец хвост не наливает', still.toFixed(3));

  // ---------- КОЛЬЦО ПОД ПАЛЬЦЕМ ----------
  // Палец на хвосте — невидимое сжимающее кольцо (BATH_ART.RING): под ним
  // хвост ТОНЬШЕ, чем был бы без пальца, выдавленная плоть собирается
  // ВАЛИКОМ по ходу, а отпущенный хвост расправляется сам. Толщина
  // сравнивается с той же точкой без кольца — иначе звено и складка
  // спорили бы с кольцом, и проверка мерила бы не его.
  const ringHold = await page.evaluate(() => {
    const R = BATH_ART.ring, L = LustMinigame, g = L.tailGrow();
    const w = (t) => BATH_ART.tailHalfSide(t, g, 1) + BATH_ART.tailHalfSide(t, g, -1);
    const keep = { ...R };
    const t0 = R.t, under = w(t0);
    BATH_ART.setRing(t0, 0, 0); const bare = w(t0);
    // Ход к кончику: валик впереди, то есть ВЫШЕ кольца.
    const tr = 0.35, ahead = tr + 1.9 * BATH_ART.RING.width;
    BATH_ART.setRing(tr, 1, BATH_ART.RING.vRef); const aheadMoving = w(ahead);
    BATH_ART.setRing(tr, 0, 0); const aheadBare = w(ahead);
    // Головка не сминается: кольцо прямо на ней — толщина та же.
    const G = BATH_ART.look().glansAt, tg = G + (1 - G) * 0.35;
    BATH_ART.setRing(tg, 1, 0); const glansRing = w(tg);
    BATH_ART.setRing(tg, 0, 0); const glansBare = w(tg);
    BATH_ART.setRing(keep.t, keep.s, keep.v);
    return { s: keep.s, t: +t0.toFixed(2), squeeze: +(under / bare).toFixed(2), bulge: +(aheadMoving / aheadBare).toFixed(2),
             glans: +(glansRing / glansBare).toFixed(3) };
  });
  ok(ringHold.s > 0.9, 'палец на хвосте включает кольцо', `сила ${ringHold.s.toFixed(2)} на доле ${ringHold.t}`);
  // Пороги — с запасом от замера (×0.89 и ×1.11): кольцо намеренно мягкое,
  // и проверка сторожит, что оно ЕСТЬ, а не его точную силу.
  ok(ringHold.squeeze < 0.95, 'под кольцом хвост приминается', `толщина ×${ringHold.squeeze}`);
  ok(ringHold.bulge > 1.04, 'выдавленная плоть собирается валиком по ходу', `толщина впереди ×${ringHold.bulge}`);
  ok(Math.abs(ringHold.glans - 1) < 0.01, 'головка под кольцом не сминается', `толщина ×${ringHold.glans}`);
  // Ведём вдоль хвоста туда-обратно.
  let strokes = 0;
  for (let n = 0; n < 80 && await page.evaluate(() => LustMinigame.phase) === 'rub'; n++) {
    for (const t of (n % 2 ? [0.9, 0.7, 0.5, 0.3, 0.15] : [0.15, 0.3, 0.5, 0.7, 0.9])) {
      const q2 = await toScreen(await tailPt(t));
      await page.mouse.move(q2.x, q2.y);
    }
    strokes++;
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
  ok(await phase() === 'aim', 'хвост налился, начался финал', await phase());
  // Отпущенный хвост расправляется: кольцо гаснет пружиной за секунду с
  // небольшим (пружина мягкая, с одним-двумя покачиваниями).
  await page.waitForTimeout(1500);
  const ringOff = await page.evaluate(() => BATH_ART.ring.s);
  ok(Math.abs(ringOff) < 0.02, 'отпущенный хвост расправляется', `сила кольца ${ringOff.toFixed(3)}`);

  // ---------- ФИНАЛ: КОЛЬЦА НЕТ, ИДУТ ПОРЦИИ ----------
  // Палец в финале наклоняет хвост, а по стволу к каждому толчку подходит
  // порция (BATH_ART.PULSE). Порция считается от времени до толчка, так что
  // проверяется на подставленных моментах: вздутие едет к головке, к
  // выстрелу стоит у шейки, а сама головка от неё не раздувается.
  const pulse = await page.evaluate(() => {
    const L = LustMinigame, g = L.tailGrow();
    const w = (t) => BATH_ART.tailHalfSide(t, g, 1) + BATH_ART.tailHalfSide(t, g, -1);
    // Палец на самом хвосте в финале кольца не включает.
    const A = BATH_ART.slots(), sp = BATH_ART.tailSpine(L.bend, g), q = sp[Math.round(sp.length * 0.4)];
    L.aimAt({ x: A.tail.x + q.x, y: A.tail.y + q.y });
    for (let i = 0; i < 20; i++) L.stepRing(0.016);
    const ringS = BATH_ART.ring.s;
    const keep = { next: L.nextShotAt, shot: L.shotAt }, T0 = 1e6;
    L.nextShotAt = T0; L.shotAt = null;
    const G = BATH_ART.look().glansAt, tg = G + (1 - G) * 0.4;
    const pos = [], ms = [500, 300, 150, 30];
    for (const m of ms) { L.stepPulse(T0 - m); pos.push(+BATH_ART.pulse.t.toFixed(3)); }
    const atNeck = BATH_ART.pulse.t, glansWith = w(tg);
    BATH_ART.setPulse(0, 0, 0); const glansBare = w(tg);
    L.nextShotAt = keep.next; L.shotAt = keep.shot; L.stepPulse(performance.now());
    return { ringS: +ringS.toFixed(3), pos, gap: +(G - atNeck).toFixed(3), glans: +(glansWith / glansBare).toFixed(3) };
  });
  ok(Math.abs(pulse.ringS) < 0.02, 'в финале палец на хвосте его не мнёт', `сила кольца ${pulse.ringS}`);
  ok(pulse.pos.every((v, i) => !i || v > pulse.pos[i - 1]), 'порция едет к головке', pulse.pos.join(' → '));
  ok(pulse.gap > 0 && pulse.gap < 0.08, 'к выстрелу порция стоит у шейки', `до головки ${pulse.gap} длины`);
  ok(Math.abs(pulse.glans - 1) < 0.01, 'головка от порции не раздувается', `толщина ×${pulse.glans}`);
  // Этап обязан ТЯНУТЬСЯ: в нём всё удовольствие, и проскакивать его
  // незачем. На живом прогоне выходит быстрее, чем здесь: рука ведёт
  // длинными ходами, а тест — аккуратными пятиточечными.
  ok(strokes >= 25, 'налив требует работы, а не одного хода', `${strokes} ходов`);
  const grow1 = await page.evaluate(() => LustMinigame.tailGrow());
  ok(grow1 > grow0 * 1.15, 'хвост вырос', `${grow0.toFixed(2)} → ${grow1.toFixed(2)}`);
  await page.screenshot({ path: out + '3-aim.png' });

  // ---------- ФИНАЛ ----------
  // Хвост держится ТОЛЧКАМИ: палец наклоняет его движением по дуге вокруг
  // корня, а сам он всё время выпрямляется. Проверяем обе половины.
  const arcPoint = (a, r) => page.evaluate(([ang, rad]) => {
    const A2 = BATH_ART.slots();
    return { x: A2.tail.x + Math.sin(ang) * rad, y: A2.tail.y - Math.cos(ang) * rad };
  }, [a, r]);
  const R = 190;

  // Один проход пальцем по дуге. Руку заводят ПО ВОЗДУХУ: палец в обе
  // стороны работает — ход назад разгибает хвост, — поэтому вернуться к
  // началу дуги, не отрывая пальца, значило бы отменить только что
  // сделанное. Так и играет человек: провёл, оторвал, провёл снова.
  const glide = async (from, to, steps) => {
    for (let i = 0; i <= (steps || 8); i++) {
      const p2 = await arcPoint(from + (to - from) * i / (steps || 8), R);
      const s2 = await toScreen(p2);
      await page.mouse.move(s2.x, s2.y);
    }
  };
  const stroke = async (from, to, steps) => {
    const p0 = await toScreen(await arcPoint(from, R));
    await page.mouse.up();
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
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

  // Палец ведёт угол В ОБЕ СТОРОНЫ: согнули, и тем же пальцем, не отрывая,
  // ведём обратно — хвост разгибается быстрее, чем выпрямился бы сам.
  // Сравнивается с его СОБСТВЕННЫМ выпрямлением за то же время, посчитанным
  // той же формулой: «уменьшился» было бы зелёным и без пальца.
  for (let i = 0; i < 6; i++) await stroke(0.05, 1.3, 8);
  const bent = await page.evaluate(() => ({ b: LustMinigame.bend, t: performance.now() }));
  await glide(1.3, 0.05, 8);
  const unbent = await page.evaluate((b0) => {
    const L = LustMinigame, t = L.tailTier();
    const el = (performance.now() - b0.t) / 1000;
    let b = b0.b;
    for (let k = 0; k < Math.ceil(el * 120); k++)
      b = LustShot.relaxBend(b, el / Math.ceil(el * 120),
                             { relax: t.relax, hard: L.BEND_HARD }, L.BEND_MAX);
    return { b: L.bend, alone: b, el };
  }, bent);
  ok(unbent.b < unbent.alone - 0.15, 'ход пальца назад разгибает хвост',
     `${bent.b.toFixed(2)} → ${unbent.b.toFixed(2)} за ${unbent.el.toFixed(2)} с; сам бы выпрямился до ${unbent.alone.toFixed(2)}`);
  // Дальше прямого хвост не уходит: разгибание кончается вертикалью.
  await glide(0.05, -0.9, 6);
  const floor = await page.evaluate(() => LustMinigame.bend);
  ok(floor >= 0, 'разогнуть можно до прямого, не дальше', floor.toFixed(3));
  await page.mouse.up();

  // Весь финал: держим прицел подталкиваниями — это и есть умелая игра, под
  // которую считан баланс в tools/sim-lust.js.
  const s0 = await toScreen(await arcPoint(0.05, R));
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.down();
  // Толчков столько, сколько даёт ступень хвоста, а финал длится всегда
  // одинаково (finalMs): ждём по длине финала, а не по числу толчков.
  const fin = await page.evaluate(() => ({
    shots: LustMinigame.tailTier().shots, ms: LustMinigame.cfg().finalMs || 15000,
    gap: LustMinigame.shotMs() }));
  const shots = fin.shots;
  ok(Math.abs(fin.gap * fin.shots - fin.ms) < 1,
     'финал длится столько, сколько задано, при любом числе толчков',
     `${fin.shots} толчков по ${Math.round(fin.gap)} мс`);
  const t0 = Date.now();
  let held0 = 0, held0n = 0;
  // Меряем удержание ТОЛЬКО пока идут толчки. После последнего игра
  // доигрывает капли ('settle'), хвост при этом сам опадает к нулю — считать
  // это промахом игрока незачем.
  while (Date.now() - t0 < fin.ms + 3000) {
    const st = await page.evaluate(() => ({ b: LustMinigame.bend, p: LustMinigame.phase }));
    if (st.p !== 'aim') break;
    const b = st.b;
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
  // Доигрывание: капли долетают, хвост опадает, червь отдышивается.
  await page.waitForTimeout(4000);
  ok(held0 / held0n < 0.3, 'прицел удерживается подталкиваниями',
     `среднее отклонение ${(held0 / held0n).toFixed(2)} рад`);

  const res = await page.evaluate(() => ({
    phase: LustMinigame.phase,
    hits: LustMinigame.hits,
    shard: GameState.data.currencies.lust_shard || 0,
    token: GameState.data.currencies.lust_token || 0,
    sin: Math.round(GameState.sinValue('lust')),
    flying: (LustMinigame.drops || []).length,
    rain: +(document.getElementById('bt-rain-far').style.opacity || 1)
  }));
  ok(res.phase === 'done', 'финал доигран', res.phase);
  // Ни одной капли в воздухе: игра не считается доигранной, пока последняя
  // не приземлилась. Раньше кадровый цикл гасили по таймеру, и капли,
  // не успевшие долететь, ЗАМИРАЛИ в воздухе до конца экрана.
  ok(res.flying === 0, 'все капли долетели', `${res.flying} в воздухе`);
  ok(res.rain < 0.05, 'душ выключен на доигрывании', `прозрачность ${res.rain}`);
  const promised = await page.evaluate(() => window.__promised);
  ok(promised === res.hits, 'рот поймал ровно столько, сколько обещал полёт калькулятора',
     `${res.hits} из ${promised}: ни морда, ни хвост долетающую каплю не перехватили`);
  // Живой забег — выборка из десяти толчков, и ноль попаданий в ней бывает
  // законно. Поэтому проверяется МОДЕЛЬ на большой выборке: та же физика,
  // тот же прицел, та же корзина, что и в игре, — и доля попаданий обязана
  // ---------- ШКАЛА: ЖЕТОН ИЗ ЧАСТЕЙ РАЗНОЙ ЦЕНЫ ----------
  // Сколько частей закрыто, считается по ценам из конфига (2, 5, 8) — по
  // порядку и с нуля. Проверяется НАЧИСЛЕННОЕ, а не нарисованное: осколков
  // пришло ровно столько, сколько частей закрыли пойманные капли.
  const gauge = await page.evaluate((h) => {
    const steps = LustMinigame.gaugeSteps();
    return { steps, done: LustShot.gaugeState(h, steps).done,
             wedges: document.querySelectorAll('#bt-gauge path').length };
  }, res.hits);
  ok(gauge.wedges === gauge.steps.reduce((a, b) => a + b, 0),
     'над головой жетон, поделённый на дольки по ценам частей',
     `${gauge.wedges} долек при ценах ${gauge.steps.join('/')}`);
  ok(res.shard + 3 * res.token === gauge.done,
     'осколков начислено столько, сколько частей закрыто',
     `${res.hits} попаданий → ${gauge.done} частей, в кошельке ${res.shard} + ${res.token}×3`);

  // ---------- ТОН ХВОСТА — ОТ КОЖИ ПЕРСОНАЖА ----------
  // Хвост рисуется не рендерером, и его цвет обязан СЛЕДОВАТЬ за кожей
  // особи, а не лежать в палитре: у синего червя — синий хвост, у
  // истощённого — серый, налитой — сочнее. Проверяется функция тона на
  // подменённых моделях; сравнение в OKLCH — тем же пространством, что и
  // сам тон, иначе «тот же оттенок» мерился бы по-разному у разных цветов.
  const tone = await page.evaluate(() => {
    const T = SkinTone, m0 = LustMinigame.bathModel();
    const withSkin = (css) => { const m = JSON.parse(JSON.stringify(m0)); m.belly.fill = css; return m; };
    const hueGap = (a, b) => { const d = T.toLch(a).H - T.toLch(b).H; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 180 / Math.PI; };
    const out = {};
    for (const [k, css] of [['pink', m0.belly.fill], ['blue', 'hsl(200, 40%, 46%)'], ['green', 'hsl(120, 38%, 44%)']]) {
      const t = BATH_ART.tailTone(withSkin(css), 1, 0);
      out[k] = { body: +hueGap(t.vol[2], css).toFixed(1), glans: +hueGap(t.glans[1], css).toFixed(1) };
    }
    const c = (x) => T.toLch(x).C;
    const base = BATH_ART.tailTone(m0, 1, 0).vol[2];
    out.witherC = +(c(BATH_ART.tailTone(m0, 0.3, 0).vol[2]) / c(base)).toFixed(2);
    out.chargeC = +(c(BATH_ART.tailTone(m0, 1, 1).vol[2]) / c(base)).toFixed(2);
    return out;
  });
  ok(['pink', 'blue', 'green'].every(k => tone[k].body < 12 && tone[k].glans < 25),
     'хвост того же оттенка, что кожа червя, у любой особи',
     `разница оттенка тело/головка: розовый ${tone.pink.body}°/${tone.pink.glans}°, синий ${tone.blue.body}°/${tone.blue.glans}°, зелёный ${tone.green.body}°/${tone.green.glans}°`);
  ok(tone.witherC < 0.6, 'у истощённого червя хвост бледнеет вместе с телом', `насыщенность ×${tone.witherC}`);
  ok(tone.chargeC > 1.08, 'налитой хвост сочнее', `насыщенность ×${tone.chargeC}`);

  // ---------- ГЕОМЕТРИЯ ФИНАЛА СОВПАДАЕТ С КАЛЬКУЛЯТОРОМ ----------
  // tools/sim-lust.js держит раскладку финала своими константами (кончик при
  // каждом изгибе и рот). Если сцена переехала, а они нет, баланс считается
  // для геометрии, которой в игре больше нет.
  const geo = await page.evaluate(() => {
    const L = LustMinigame, keep = L.charge;
    // Геометрию меряем при ПОЛНОМ хвосте: стрелял он налитым.
    L.charge = 1;
    // Рот берётся ТОТ, по которому игра считала попадания весь финал
    // (mouthAt — снят один раз на входе в финал), а не спрашивается заново:
    // сейчас червь тяжело дышит после забега, морда ходит на вдохе, и
    // замер «на ходу» гулял на пять точек от прогона к прогону (traps, п. 137).
    const m = L.mouthAt || L.mouthPoint(), s = L.tipState(L.bendAim), z = L.tipState(0);
    L.charge = keep;
    return { mouth: { x: +m.x.toFixed(1), y: +m.y.toFixed(1) }, aim: +L.bendAim.toFixed(3),
             tip: { x: +s.x.toFixed(1), y: +s.y.toFixed(1) },
             tip0: { x: +z.x.toFixed(1), y: +z.y.toFixed(1) } };
  });
  ok(Math.hypot(geo.mouth.x - 388.3, geo.mouth.y - 598.0) < 3,
     'рот стоит там же, где у калькулятора', `(${geo.mouth.x},${geo.mouth.y})`);
  ok(Math.hypot(geo.tip0.x - 238, geo.tip0.y - 617.4) < 3,
     'прямой хвост стоит там же, где у калькулятора', `(${geo.tip0.x},${geo.tip0.y})`);
  ok(Math.abs(geo.aim - 0.412) < 0.03,
     'прицел тот же, что у калькулятора', `изгиб ${geo.aim}`);
  console.log(`  инфо  прицел — изгиб ${geo.aim}, кончик (${geo.tip.x},${geo.tip.y}), `
    + `рот (${geo.mouth.x},${geo.mouth.y}); таблица кончика и рот стоят в tools/sim-lust.js`);

  await page.screenshot({ path: out + '4-done.png' });

  // ================= СЛЕДЫ СТРУИ =================
  // Промах прилипает к ПЕРВОМУ, во что упёрся, и живёт в плане этой
  // поверхности (src/minigames/lust/lust-goo.js). Капли здесь ставятся
  // руками в известные точки: живой забег случаен, и в нём не каждая
  // поверхность успевает поймать хоть что-то.
  const goo = await page.evaluate(async () => {
    const L = LustMinigame, G = LustGoo, A2 = BATH_ART.slots();
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const drop = (x, y, extra) => Object.assign(
      { x, y, vx: 0, vy: 120, t: 1, r: 6, main: false, trail: [] }, extra || {});
    const land = (d) => { G.arm(d); d.wallAt = null; Object.assign(d, d._after || {});
                          const n = G.live.length; const over = G.hit(d);
                          return { over, surf: G.live.length > n ? G.live[G.live.length - 1].surf : null }; };
    const out = {};
    // Тело: точка ПОСЕРЕДИНЕ силуэта, по той же маске, что у мыла.
    const mb = L.maskBounds(), box = L.wormBoxScene(), B = L.WORM_BASE, S = L.MASK_SCALE;
    const inMask = (p) => { const k = B.w / box.w;
      const x = Math.round((p.x - box.x) * k * S), y = Math.round((p.y - box.y) * k * S);
      return L.maskAlpha[y * L.mask.width + x] > 0; };
    let body = null;
    for (let f = 0.5; f < 0.9 && !body; f += 0.05) {
      const p = { x: mb.x + mb.w * 0.55, y: mb.y + mb.h * f };
      if (inMask(p)) body = p;
    }
    // ГДЕ садятся: капли летят поперёк тела по одной прямой. Раньше все
    // садились в первом пикселе силуэта — бусами вдоль контура.
    {
      const C = L.cfg(), y = body.y;
      let x0 = body.x; while (inMask({ x: x0 - 1, y })) x0--;
      let x1 = body.x; while (inMask({ x: x1 + 1, y })) x1++;
      const depth = [];
      let pass = 0;
      const N = 300;
      // Гравитация на время замера снята: иначе капля за пролёт проседает и
      // выходит из тела снизу раньше дальнего края, и медиана глубины
      // уезжает к кромке не из-за игры, а из-за замера (traps, п. 137).
      const g0 = C.gravity;
      C.gravity = 0;
      for (let i = 0; i < N; i++) {
        // Ровно горизонтально: ширина тела на пути — это x0..x1.
        const d = drop(x0 - 12, y, { vx: 600, vy: 0 }); G.arm(d); d.wallAt = null;
        const n = G.live.length; let over = false;
        for (let k = 0; k < 400 && !over; k++) { LustShot.step(d, C); over = G.hit(d); }
        const s = G.live.length > n ? G.live[G.live.length - 1] : null;
        if (s && s.surf === 'worm') depth.push((d.x - x0) / Math.max(1, x1 - x0));
        else pass++;
      }
      C.gravity = g0;
      depth.sort((a, b) => a - b);
      out.spread = { pass: pass / N, n: depth.length, width: x1 - x0,
                     q25: depth[Math.floor(depth.length * 0.25)],
                     q50: depth[Math.floor(depth.length * 0.5)],
                     q75: depth[Math.floor(depth.length * 0.75)] };
      G.reset();
    }
    // Капля над телом садится не сразу: точку выбирает на своём пути.
    const keepPass = G.PASS_CHANCE;
    G.PASS_CHANCE = 0;
    {
      const d = drop(body.x, body.y); G.arm(d); d.wallAt = null;
      const n = G.live.length; let over = false;
      for (let i = 0; i < 400 && !over; i++) { LustShot.step(d, L.cfg()); over = G.hit(d); }
      out.worm = { over, surf: G.live.length > n ? G.live[G.live.length - 1].surf : null };
    }
    G.PASS_CHANCE = keepPass;
    // Хвост: середина его оси при текущем изгибе.
    const sp = BATH_ART.tailSpine(L.bend, L.tailGrow()), mid = sp[Math.round(sp.length / 2)];
    out.tail = land(drop(A2.tail.x + mid.x, A2.tail.y + mid.y));
    // Борт: капля переходит линию борта сверху вниз правее червя.
    const rimY = A2.rimFront.y, rx = A2.rimR.x - 30;
    const keep = G.RIM_CHANCE;
    G.RIM_CHANCE = 1;
    const dr = drop(rx, rimY + 2); G.arm(dr); dr.wallAt = null; dr.prevY = rimY - 3;
    const n0 = G.live.length; out.rim = { over: G.hit(dr), surf: G.live.length > n0 ? G.live[G.live.length - 1].surf : null };
    G.RIM_CHANCE = 0;
    const di = drop(rx, rimY + 2); G.arm(di); di.wallAt = null; di.prevY = rimY - 3;
    const n1 = G.live.length; out.inside = { over: G.hit(di), added: G.live.length - n1 };
    G.RIM_CHANCE = keep;
    // Стена: опустилась после верха дуги на заданную глубину.
    const dw = drop(A2.rimL.x + 20, 420); G.arm(dw); dw.apexY = 360; dw.wallAt = 50;
    const n2 = G.live.length; out.wall = { over: G.hit(dw), surf: G.live.length > n2 ? G.live[G.live.length - 1].surf : null };

    // Хвост согнули — пятна на нём поехали следом.
    await wait(2500);
    const tailD0 = document.getElementById('bt-tail-goo-done').getAttribute('d');
    const b0 = L.bend; L.bend = 0.6; L._tailKey = null; L.drawTail(true);
    const tailD1 = document.getElementById('bt-tail-goo-done').getAttribute('d');
    L.bend = b0; L._tailKey = null; L.drawTail(true);
    out.tailMoves = !!tailD0 && tailD0 !== tailD1;
    out.live = G.live.length;
    const inked = (id) => { const k = document.getElementById(id);
      const px = k.getContext('2d').getImageData(0, 0, k.width, k.height).data;
      let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i]) n++; return n; };
    out.wallNodes = inked('bt-goo-wall');
    // Размыто ли: у пятна на стене обязан быть ПЛАВНЫЙ край — много точек
    // промежуточной прозрачности, а не резкая кромка.
    {
      const k = document.getElementById('bt-goo-wall');
      const px = k.getContext('2d').getImageData(0, 0, k.width, k.height).data;
      let soft = 0, all = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i]) { all++; if (px[i] < 200) soft++; }
      out.wallSoft = all ? soft / all : 0;
    }
    out.rimNodes = G.rimDone.length;
    out.tailDone = G.tailDone.length;
    // ---------- НЕ ВЫЛЕЗАЕТ ЗА СВОЙ ПРЕДМЕТ ----------
    // Спрашивается КАРТИНКА: по контуру застывших пятен идём точками и
    // каждую проверяем фигурой предмета — части тела, хвоста, борта. Не
    // «поджатие вызывалось», а «на экране ничего не висит в воздухе».
    const walk = (path, n, test) => {
      let a = 0, b = 0;
      const len = path ? path.getTotalLength() : 0;
      for (let i = 0; len && i < n; i++) {
        const q = path.getPointAtLength(len * (i + 0.5) / n);
        test(q) ? a++ : b++;
      }
      return { on: a, off: b };
    };
    const hostsU = [...new Set(Object.values(G.hosts))];
    const onBody = { on: 0, off: 0 };
    for (const h of hostsU) {
      const path = document.getElementById(h.id + '-done');
      const shapes = G.parts().filter(c => c.host === h.el).map(c => c.shape);
      const r = walk(path, 400, (q) => shapes.some(sh => sh.isPointInFill(
        new DOMPoint(q.x, q.y).matrixTransform(G.rel(path, sh)))));
      onBody.on += r.on; onBody.off += r.off;
    }
    out.wormPx = onBody;
    const tailBody = document.getElementById('bt-tail-body');
    const tailIn = () => walk(document.getElementById('bt-tail-goo-done'), 400,
      (q) => tailBody.isPointInFill(new DOMPoint(q.x, q.y)));
    out.tailIn = tailIn();
    { const b0 = L.bend; L.bend = 0.7; L._tailKey = null; L.drawTail(true);
      out.tailInBent = tailIn();
      L.bend = b0; L._tailKey = null; L.drawTail(true); }
    const rimTop = BATH_ART.box('tub').y;
    out.rimIn = walk(document.getElementById('bt-goo-rim-done'), 400, (q) => q.y >= rimTop);

    // ---------- ДЫШИТ ВМЕСТЕ С ТЕЛОМ ----------
    // Червь в конце тяжело дышит, звенья раздуваются. След на звене обязан
    // расти вместе с ним: меряется ширина звена и ширина следов на нём в
    // самой узкой и самой широкой фазе вдоха. Холст поверх червя (первая
    // версия) давал следам отношение ровно единица — они висели коркой.
    // Капля — точно в середину живота: именно он раздувается сильнее всех.
    {
      const root = L.wormHandle.svgRoot, B2 = L.WORM_BASE, bx = L.wormBoxScene();
      const belly = root.querySelector('[data-part="belly"] > .worm-part-shape');
      const bb = belly.getBBox();
      const c = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height * 0.35)
        .matrixTransform(G.rel(belly, root));
      G.stick('worm', drop(bx.x + c.x * bx.w / B2.w, bx.y + c.y * bx.w / B2.w,
                           { r: 8, main: true, vx: 200, vy: 0 }));
      await wait(3500);
    }
    const bodyHost = [...new Set(Object.values(G.hosts))].find(h => h.id === 'bt-wgoo-belly' && h.done.length);
    if (bodyHost) {
      const part = G.parts().find(c => c.host === bodyHost.el);
      const gp = document.getElementById(bodyHost.id + '-done');
      let lo = null, hi = null;
      for (let i = 0; i < 45; i++) {
        const sw = part.shape.getBoundingClientRect().width, gw = gp.getBoundingClientRect().width;
        if (!lo || sw < lo.s) lo = { s: sw, g: gw };
        if (!hi || sw > hi.s) hi = { s: sw, g: gw };
        await wait(40);
      }
      out.breath = { part: part.key, shape: hi.s / lo.s, goo: hi.g / lo.g };
    }

    // Брызги, залетевшие в рот, глотаются, но НЕ засчитываются.
    const m = L.mouthAt || L.mouthPoint(), h0 = L.hits;
    L.drops = [{ x: m.x, y: m.y, vx: 0, vy: 0, t: 0.5, r: 4, main: false, trail: [] }];
    L.stepDrops(L.cfg().dt * 1.01);
    out.spray = { hits: L.hits - h0, left: L.drops.length };

    // Уход из ванной смывает всё (вариант «а»).
    L.close();
    const paint = document.querySelectorAll('.bt-goo-host').length;
    out.afterClose = {
      wall: inked('bt-goo-wall'),
      rim: G.rimDone.length + (document.getElementById('bt-goo-rim-done').getAttribute('d') || '').length,
      tail: G.tailDone.length, live: G.live.length, worm: paint
    };
    L.open();
    await wait(300);
    return out;
  });
  ok(goo.worm.over && goo.worm.surf === 'worm', 'капля в тело прилипает к телу');
  // Равномерно по пути над телом — квартили около четверти, половины и трёх
  // четвертей ширины; насквозь — около PASS_CHANCE (0.3).
  ok(goo.spread.q25 > 0.12 && goo.spread.q25 < 0.38 && goo.spread.q50 > 0.36
     && goo.spread.q50 < 0.64 && goo.spread.q75 > 0.62,
     'капля садится по ВСЕМУ телу, а не вдоль контура',
     `квартили глубины ${goo.spread.q25.toFixed(2)} / ${goo.spread.q50.toFixed(2)} / ${goo.spread.q75.toFixed(2)} при ширине ${goo.spread.width}`);
  ok(goo.spread.pass > 0.2 && goo.spread.pass < 0.4, 'часть капель пролетает тело насквозь',
     `${(goo.spread.pass * 100).toFixed(0)}% пролетели`);
  ok(goo.tail.over && goo.tail.surf === 'tail', 'капля в хвост прилипает к хвосту');
  ok(goo.rim.over && goo.rim.surf === 'rim', 'капля на борт прилипает к борту');
  ok(goo.inside.over && goo.inside.added === 0, 'перелетевшая борт уходит в ванну и не рисуется поверх чаши');
  ok(goo.wall.over && goo.wall.surf === 'wall', 'капля за верхом дуги прилипает к стене');
  ok(goo.live === 0 && goo.wallNodes >= 1 && goo.rimNodes >= 1 && goo.tailDone >= 1,
     'стёкшие потёки застыли и легли каждый в свой слой',
     `стена ${goo.wallNodes} точек, борт ${goo.rimNodes}, хвост ${goo.tailDone}, живых ${goo.live}`);
  ok(goo.tailMoves, 'пятна на хвосте едут вместе с его изгибом');
  ok(goo.wallSoft > 0.3, 'пятно на стене размыто плавно, как сама стена',
     `${(goo.wallSoft * 100).toFixed(0)}% точек с частичной прозрачностью`);
  ok(goo.wormPx.on > 50 && goo.wormPx.off === 0, 'след на теле не вылезает за свою часть',
     `${goo.wormPx.on} точек контура внутри, ${goo.wormPx.off} снаружи`);
  ok(goo.tailIn.on > 50 && goo.tailIn.off === 0 && goo.tailInBent.off === 0,
     'след на хвосте не вылезает за хвост — и когда хвост согнули',
     `прямо: ${goo.tailIn.off} снаружи из ${goo.tailIn.on + goo.tailIn.off}; согнутый: ${goo.tailInBent.off}`);
  ok(goo.rimIn.on > 20 && goo.rimIn.off === 0, 'над кромкой борта следа нет',
     `${goo.rimIn.off} точек выше кромки из ${goo.rimIn.on + goo.rimIn.off}`);
  ok(goo.breath && goo.breath.shape > 1.04 && Math.abs(goo.breath.goo - goo.breath.shape) < 0.03,
     'след на теле дышит вместе с частью',
     goo.breath ? `${goo.breath.part}: часть ×${goo.breath.shape.toFixed(3)}, следы ×${goo.breath.goo.toFixed(3)}` : 'нет следа на звене');
  ok(goo.spray.hits === 0 && goo.spray.left === 0, 'брызги во рту проглочены, но не засчитаны');
  ok(Object.values(goo.afterClose).every(v => v === 0), 'уход из ванной смывает все следы',
     JSON.stringify(goo.afterClose));

  // ================= СТРУЯ — ОДНА ЛЕНТА =================
  // Струя не нанизанные бусы, а цельная лента: в полёте она в разы длиннее
  // своей толщины. Капля, оторвавшись, становится ОТДЕЛЬНОЙ каплей в полёте,
  // а лента после этого короче.
  const jet = await page.evaluate(() => {
    const L = LustMinigame, C = L.cfg();
    const v = C.speedMin + 0.95 * (C.speedMax - C.speedMin), a = -1.0;
    const keep = L.drops;
    L.drops = [];
    const d = { x: 250, y: 620, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, r: 11,
                main: true, trail: [], shed: 0, shedT: 0,
                stream: { x0: 250, y0: 620, vx: Math.cos(a) * v, vy: Math.sin(a) * v, back: 1 } };
    const len = () => { let s = 0, p = L.streamAt(d, 0);
      for (let i = 1; i <= 10; i++) { const q = L.streamAt(d, d.stream.back * i / 10);
        s += Math.hypot(q.x - p.x, q.y - p.y); p = q; } return s; };
    while (d.t < L.STREAM.emit + 0.03) LustShot.step(d, C);
    const long = len() / (2 * d.r * 0.72);
    const back0 = d.stream.back, n0 = L.drops.length;
    d.shedT = -1;
    L.shedStream(d);
    const out = { long, shorter: d.stream.back < back0, dropped: L.drops.length - n0,
                  apart: L.drops[0] ? !L.drops[0].stream : false };
    L.drops = keep;
    return out;
  });
  ok(jet.long > 3.5, 'струя — вытянутая лента, а не шарик', `длина — ${jet.long.toFixed(1)} толщины`);
  ok(jet.dropped === 1 && jet.apart && jet.shorter,
     'оторвавшаяся капля летит сама, а лента после неё короче');

  // ================= В ВАННОЙ РАЗДЕВАЮТСЯ =================
  // Надетое снаружи в ванную не попадает: червь моется голым. Но наряд не
  // теряется — он в состоянии игрока и вернётся, как только выйдет.
  const naked = await page.evaluate(async () => {
    const L = LustMinigame, wait = (ms) => new Promise(r => setTimeout(r, ms));
    const was = GameState.data.cosmetics;
    GameState.data.cosmetics = { hat: 'top-hat', neck: 'bow-tie' };
    L.close(); L.open();
    await wait(600);
    const worn = L.wormHandle.svgRoot.querySelectorAll('[data-cosmetic]').length;
    const kept = JSON.stringify(GameState.data.cosmetics);
    const room = window.WormModelAPI.loadWormModel().cosmetics;
    GameState.data.cosmetics = was;
    L.close(); L.open();
    await wait(300);
    return { worn, kept, room: Object.keys(room || {}).length };
  });
  ok(naked.worn === 0, 'в ванной червь голый, что бы на нём ни было надето',
     `${naked.worn} надетых вещей на черве в ванной`);
  ok(naked.kept.includes('top-hat') && naked.room === 2, 'наряд не пропал: снаружи червь одет',
     naked.kept);

  // ================= ЗАБЕГ «ТОЛЬКО ПОМЫТЬ» =================
  // Награда у похоти на своём таймере (docs/plan/21-lust-bath.md, разд. 7а).
  // Только что сыграли на жетон — значит, следующий заход приходится на «ещё
  // рано»: червя моют, и на этом всё. Мытьё здесь не водится пальцем заново:
  // его проверяет забег выше, а тут проверяется развилка ПОСЛЕ мочалки.
  const wash = await page.evaluate(async () => {
    const L = LustMinigame;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const before = {
      shard: GameState.currency('lust_shard'), token: GameState.currency('lust_token'),
      paidAt: GameState.data.sins.lust.paid_at
    };
    L.close(); L.open();
    await wait(400);
    // Дадим шкале просесть: забег обязан её закрыть и без награды.
    GameState.data.sins.lust.updated_at -= 6 * 3600 * 1000;
    const readyAtStart = Backend.sinPays('lust');
    L.startWater();
    await wait(1200);
    L.finishStage('soap');
    const pile = !!L.pile;
    L.finishStage('cloth');
    await wait(1500);
    return {
      readyAtStart, pile, phase: L.phase,
      tail: +(document.getElementById('bt-tail').style.opacity || 0),
      shop: document.getElementById('bt-shop-btn').classList.contains('on'),
      sin: Math.round(GameState.sinValue('lust')),
      shard: GameState.currency('lust_shard'), token: GameState.currency('lust_token'),
      paidAt: GameState.data.sins.lust.paid_at, before,
      wheel: Backend.rewardReady('lust')
    };
  });
  ok(!wash.readyAtStart, 'сразу после игры на жетон награда ещё не готова');
  ok(!wash.pile && wash.phase === 'done' && wash.tail === 0,
     'без награды забег кончается после мочалки: ни горки пены, ни хвоста',
     `фаза ${wash.phase}, горка ${wash.pile}, хвост ${wash.tail}`);
  ok(wash.sin === 100, 'червь вымыт — шкала закрыта и без награды', `шкала ${wash.sin}`);
  ok(wash.shard === wash.before.shard && wash.token === wash.before.token,
     'за «только помыть» ничего не начислено');
  ok(wash.paidAt === wash.before.paidAt, 'таймер награды не потрачен');
  ok(wash.shop, 'после забега снова виден вход в магазин');
  ok(!wash.wheel.ready && wash.wheel.fill < 100,
     'узел похоти в колесе не горит, луч налит по таймеру',
     `налито ${wash.wheel.fill.toFixed(0)}%, осталось ${wash.wheel.hoursLeft.toFixed(1)} ч`);
  // Таймер истёк — награда снова готова, и колесо об этом знает.
  const later = await page.evaluate(() => {
    GameState.data.sins.lust.paid_at -= GameState.rewardCooldownHours('lust') * 3600 * 1000 + 1000;
    return { pays: Backend.sinPays('lust'), wheel: SinsMenu.read('lust') };
  });
  ok(later.pays && later.wheel.ready && later.wheel.fill === 100,
     'таймер истёк — награда готова и узел горит');
  await page.screenshot({ path: out + '5-wash-only.png' });

  // ================= ПЕРЕЕЗД КАМЕРЫ БЕЗ ЧЁРНЫХ КРАЁВ =================
  // Камера едет css-анимацией готовых текстур. Пока текстура рисовалась
  // только кадром «откуда», всё, что въезжало в кадр по дороге, было
  // чёрным: на «мытьё → хвост» пятая часть кадра, на «хвост → общий план»
  // две трети, и поверх черноты торчал кусок тела. Меряется доля тёмных
  // точек сцены посреди движения; сама сцена даёт около 2% (контуры,
  // тени), битый переезд — от 20%.
  const darkShare = async () => {
    const buf = await page.screenshot();
    return page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const top = Math.round(img.height * 0.07);          // без шапки окна
      const d = x.getImageData(0, top, c.width, c.height - top).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 90) n++;
      return n / (d.length / 4);
    }, buf.toString('base64'));
  };
  for (const [a, b] of [['body', 'tail'], ['body', 'overview'], ['tail', 'overview']]) {
    await page.evaluate((n) => LustMinigame.setCamera(n), a);
    await page.waitForTimeout(400);
    await page.evaluate((n) => LustMinigame.setCamera(n, 1000), b);
    let worst = 0;
    for (let i = 0; i < 7; i++) { await page.waitForTimeout(120); worst = Math.max(worst, await darkShare()); }
    await page.waitForTimeout(300);
    ok(worst < 0.06, `переезд «${a} → ${b}» без чёрных краёв`,
       `худший кадр ${(worst * 100).toFixed(1)}% тёмного`);
  }

  console.log(errs.length ? '\nОШИБКИ:\n  ' + errs.join('\n  ') : '\nошибок нет');
  await browser.close();
  if (fail.length || errs.length) process.exit(1);
})();
