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
