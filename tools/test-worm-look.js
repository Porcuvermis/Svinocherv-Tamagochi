const { chromium } = require('playwright');
const harness = require('./harness');

// ============ ПРОВЕРКА: ПУЛЬТ ВНЕШНОСТИ ============
// `src/core/worm-look.js` — переводит человеческое намерение в числа модели.
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Ручка ДЕЙСТВИТЕЛЬНО двигает персонажа, а не только число в реестре.
//      Ручка, которая ничего не меняет, — проданная пустота, и в этом
//      проекте это уже было: лестница возврата семян существовала, а её
//      никто не читал.
//   2. Значения ОТНОСИТЕЛЬНЫЕ и НАКАПЛИВАЮТСЯ: два раза по +0.1 — это +0.2.
//      Ровно так формулирует команду человек: «ещё немного больше».
//   3. Заморозка НАСТОЯЩАЯ. «Увеличь голову, но не трогай глаза» — не
//      пожелание: заморожённая ручка отказывает и говорит почему.
//   4. Откат возвращает ровно то, что было, а сброс — исходное. История
//      достаётся даром, и проверять надо, что она действительно работает,
//      а не просто накапливается.
//   5. Перетаскивание ведёт вещь К ПАЛЬЦУ. Это главная проверка файла:
//      обратный перевод считается ЗАМЕРОМ чувствительности, а не формулой,
//      и сломаться он может молча.
//   6. Левую скулу можно двигать, НЕ утаскивая правую. Ради этого заведён
//      перекос черепа; без него обе половины читают один `cheekWidth`.
//   7. Пульт НЕ затирает чужой оверрайд: `setOverride` заменяет патч
//      целиком, и пульт, положивший своё не глядя, стёр бы подмену
//      внешности, которую делает лобби гнева.
//   8. Запрещённое остаётся запрещённым: свет по частям, hex мимо палитры,
//      свой силуэт у сегмента.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-worm-look.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/worm-look-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
  await harness.prepare(page);
  const errors = [];
  let bad = 0;
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const say = console.log;
  const check = (ok, text) => { say((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) bad++; };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2600);

  // ---------- ОБЕЗДВИЖИВАЕМ ПРЕДМЕТ ИЗМЕРЕНИЯ ----------
  // Мерится ЭКРАННАЯ точка сущности до и после поворота ручки, а червь
  // тем временем бродит по комнате, дышит и доворачивает голову за
  // направлением ходьбы. Всё это двигает ту же точку — и прогон то сходился,
  // то нет, причём винил игру. Замер обязан менять РОВНО ОДНУ величину:
  // ту, которую крутят.
  await page.evaluate(() => {
    const h = window.MainWormHandle;
    h.setOptions({ wander: false, idleWave: false, blink: false });
    h.setHeadPose(0, { instant: true });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '1-before.png' });

  // ---------- 0. РЕЕСТР ----------
  say('');
  say('======== РЕЕСТР РУЧЕК ========');
  const reg = await page.evaluate(() => {
    if (typeof WormLook === 'undefined') return null;
    const r = WormLook.registry(window.MainWormHandle);
    const groups = {};
    r.forEach(k => { groups[k.group] = (groups[k.group] || 0) + 1; });
    return { n: r.length, groups,
             noTitle: r.filter(k => !k.title).map(k => k.key),
             zeroed: r.every(k => k.value === 0),
             forbidden: Object.keys(WormLook.forbidden()) };
  });
  if (!reg) { say('  ✗ WormLook не загрузился'); await browser.close(); process.exit(1); }
  say(`  ручек: ${reg.n} — ` + Object.entries(reg.groups).map(([g, n]) => `${g} ${n}`).join(', '));
  check(reg.n >= 25, `ручек не меньше двадцати пяти: ${reg.n}`);
  check(reg.noTitle.length === 0, 'у каждой есть человеческое имя');
  check(reg.zeroed, 'все стоят на нуле: ноль — это «как задумано»');
  check(reg.forbidden.length >= 3, `запреты объявлены: ${reg.forbidden.join(', ')}`);

  // ---------- 1. РУЧКА ДВИГАЕТ ПЕРСОНАЖА ----------
  // Не «значение выросло», а САМА ГЕОМЕТРИЯ. Уровень может расти, пока его
  // никто не читает.
  say('');
  say('======== РУЧКА ДВИГАЕТ ПЕРСОНАЖА ========');
  const PROBE = [
    { key: 'headSize',  measure: 'headW',  dir: 'up' },
    { key: 'bellySize', measure: 'bellyW', dir: 'up' },
    { key: 'tailLength', measure: 'tailW', dir: 'up' },
    { key: 'headWidthCheek', measure: 'cheekSpan', dir: 'up' }
  ];
  for (const p of PROBE) {
    const r = await page.evaluate(async (p) => {
      const h = window.MainWormHandle;
      const W = (sel) => {
        const el = document.querySelector(`.worm-root [data-part="${sel}"]`);
        return el ? el.getBoundingClientRect().width : 0;
      };
      const span = () => {
        const a = WormParts.client(h, 'cheek-left'), b = WormParts.client(h, 'cheek-right');
        return (a && b) ? Math.abs(a.x - b.x) : 0;
      };
      const read = () => ({ headW: W('head'), bellyW: W('belly'), tailW: W('tail'), cheekSpan: span() });
      WormLook.reset(h);
      await new Promise(r => setTimeout(r, 120));
      const was = read();
      WormLook.apply(h, { [p.key]: 0.4 });
      await new Promise(r => setTimeout(r, 160));
      const now = read();
      WormLook.reset(h);
      await new Promise(r => setTimeout(r, 120));
      return { was: was[p.measure], now: now[p.measure] };
    }, p);
    check(r.now > r.was + 0.5,
          `${p.key}: ${p.measure} ${r.was.toFixed(1)} → ${r.now.toFixed(1)} — геометрия сдвинулась`);
  }

  // Свет — не модель, и проверяется отдельно: он живёт в LIGHT.
  const light = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    WormLook.reset(h);
    const was = { hi: LIGHT.highlight, sh: LIGHT.shadow };
    WormLook.apply(h, { volume: 0.5 });
    await new Promise(r => setTimeout(r, 120));
    const now = { hi: LIGHT.highlight, sh: LIGHT.shadow };
    WormLook.reset(h);
    await new Promise(r => setTimeout(r, 120));
    const back = { hi: LIGHT.highlight, sh: LIGHT.shadow };
    return { was, now, back };
  });
  check(light.now.hi > light.was.hi && light.now.sh > light.was.sh,
        `объём поднял блик и тень: ${light.was.hi} → ${light.now.hi.toFixed(3)}`);
  check(Math.abs(light.back.hi - light.was.hi) < 1e-9,
        'и сброс вернул свет ровно на место — он не в модели, откатывать его надо вручную');

  // ---------- 2. ОТНОСИТЕЛЬНЫЕ И НАКАПЛИВАЮТСЯ ----------
  say('');
  say('======== ЗНАЧЕНИЯ ОТНОСИТЕЛЬНЫЕ ========');
  const acc = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    WormLook.reset(h);
    WormLook.apply(h, { headSize: 0.1 });
    const a = WormLook.values.headSize;
    WormLook.apply(h, { headSize: 0.1 });
    const b = WormLook.values.headSize;
    WormLook.apply(h, { headSize: 0.5 }, { absolute: true });
    const c = WormLook.values.headSize;
    WormLook.apply(h, { headSize: 9 });          // за границей
    const d = WormLook.values.headSize;
    WormLook.reset(h);
    return { a, b, c, d };
  });
  check(Math.abs(acc.a - 0.1) < 1e-9 && Math.abs(acc.b - 0.2) < 1e-9,
        `два раза по +0.1 дают +0.2 (${acc.a} → ${acc.b}), а не +0.1`);
  check(Math.abs(acc.c - 0.5) < 1e-9, 'а «поставь ровно» ставит ровно: 0.5');
  check(acc.d === 1, 'за границу не пускает: 9 зажато в 1');

  // ---------- 3. ЗАМОРОЗКА ----------
  say('');
  say('======== ЗАМОРОЗКА НАСТОЯЩАЯ ========');
  const lock = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    const eyeW = () => document.querySelector('.worm-root [data-part="eye-left"]')
      .getBoundingClientRect().width;
    WormLook.reset(h);
    // Ждём ПОСЛЕ сброса, а не меряем сразу: сброс — это setOverride, то есть
    // пересборка всего персонажа, и посадка глаза встаёт на место не в том
    // же кадре. Без ожидания `was` снимался с недособранной головы, и прогон
    // объявлял, что заморозка не работает, — хотя у глаза не менялся ни один
    // атрибут. Мерить надо УСТОЯВШЕЕСЯ, иначе меряешь переходный процесс.
    await new Promise(r => setTimeout(r, 200));
    const was = eyeW();
    // «Увеличь голову, но не трогай глаза»
    const res = WormLook.apply(h, { headSize: 0.3, eyeSize: 0.5, lock: ['eyes'] });
    await new Promise(r => setTimeout(r, 200));
    const now = eyeW();
    const headMoved = WormLook.values.headSize;
    // Габарит — следствие; настоящая гарантия заморозки в том, что у глаза
    // не поехал ни один СОБСТВЕННЫЙ параметр.
    const m = h.getModel();
    const own = { scale: m.eyes.left.scale, stretchX: m.eyes.left.stretchX };
    WormLook.lock([]);
    WormLook.reset(h);
    return { res, was, now, headMoved, own };
  });
  check(lock.res.changed.indexOf('headSize') !== -1, 'голова изменилась: ' + lock.res.changed.join(', '));
  check(lock.res.refused.some(r => r.key === 'eyeSize' && r.why === 'заморожена'),
        'а глаза ОТКАЗАЛИ с причиной: ' + JSON.stringify(lock.res.refused));
  check(Math.abs(lock.now - lock.was) < 1.5,
        `и габарит глаза не поехал: ${lock.was.toFixed(1)} → ${lock.now.toFixed(1)}`);
  check(lock.own.scale === 0.95 && lock.own.stretchX === 1,
        `и собственные числа глаза нетронуты: ${JSON.stringify(lock.own)}`);

  // ---------- 4. ОТКАТ И СБРОС ----------
  say('');
  say('======== ОТКАТ ВОЗВРАЩАЕТ ТО, ЧТО БЫЛО ========');
  const undo = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    WormLook.reset(h);
    WormLook.apply(h, { gloss: 0.3 });
    const one = Object.assign({}, WormLook.values);
    WormLook.apply(h, { matte: 0.4 });
    const two = Object.assign({}, WormLook.values);
    WormLook.undo(h);
    const back = Object.assign({}, WormLook.values);
    const steps = WormLook.history.length;
    WormLook.reset(h);
    const clean = Object.assign({}, WormLook.values);
    return { one, two, back, steps, clean, hist: WormLook.history.length };
  });
  check(undo.two.matte === 0.4, 'второй шаг применился');
  check(undo.back.matte === undefined || undo.back.matte === 0,
        'откат снял ВТОРОЙ шаг: ' + JSON.stringify(undo.back));
  check(undo.back.gloss === 0.3, 'а первый оставил на месте');
  check(Object.keys(undo.clean).length === 0 && undo.hist === 0,
        'сброс вычистил всё, включая историю');

  // ---------- 5. ПЕРЕТАСКИВАНИЕ ВЕДЁТ К ПАЛЬЦУ ----------
  // Главная проверка файла. Обратный перевод считается ЗАМЕРОМ
  // чувствительности, а не формулой, и сломаться он может молча.
  say('');
  say('======== ПЕРЕТАСКИВАНИЕ ВЕДЁТ ВЕЩЬ К ПАЛЬЦУ ========');
  const drag = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    WormLook.reset(h);
    await new Promise(r => setTimeout(r, 150));
    const p0 = WormParts.client(h, 'cheek-left');
    // Тянем скулу НАРУЖУ — влево от головы, на двенадцать точек.
    const target = { x: p0.x - 12, y: p0.y };
    const d = WormLook.dragStart(h, 'cheek-left');
    if (!d) return { err: 'перетаскивание не началось' };
    WormLook.dragTo(h, d, target.x, target.y);
    await new Promise(r => setTimeout(r, 160));
    const p1 = WormParts.client(h, 'cheek-left');
    const res = {
      axes: d.axes.map(a => a.kind === 'skew' ? a.name + (a.side < 0 ? 'L' : 'R') : a.key),
      was: +p0.x.toFixed(1), want: +target.x.toFixed(1), now: +p1.x.toFixed(1),
      promah: +Math.abs(p1.x - target.x).toFixed(1),
      shag: +Math.abs(p1.x - p0.x).toFixed(1)
    };
    WormLook.reset(h);
    return res;
  });
  if (drag.err) check(false, drag.err);
  else {
    say(`  ручки под скулой: ${drag.axes.join(', ')}`);
    say(`  было ${drag.was} → целились ${drag.want} → стало ${drag.now}`);
    check(drag.shag > 3, `скула действительно поехала: на ${drag.shag} точек`);
    check(drag.promah < 5, `и доехала близко к пальцу: промах ${drag.promah} точек`);
  }

  // ---------- 6. ЛЕВАЯ СКУЛА НЕ ТАЩИТ ПРАВУЮ ----------
  say('');
  say('======== ЛЕВАЯ СКУЛА НЕ ТАЩИТ ПРАВУЮ ========');
  const side = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    WormLook.reset(h);
    await new Promise(r => setTimeout(r, 150));
    const L0 = WormParts.client(h, 'cheek-left').x;
    const R0 = WormParts.client(h, 'cheek-right').x;
    WormLook.setSkew(h, 'cheek', -1, 0.25);
    await new Promise(r => setTimeout(r, 180));
    const L1 = WormParts.client(h, 'cheek-left').x;
    const R1 = WormParts.client(h, 'cheek-right').x;
    WormLook.reset(h);
    return { dl: +(L1 - L0).toFixed(1), dr: +(R1 - R0).toFixed(1) };
  });
  say(`  левая сдвинулась на ${side.dl}, правая на ${side.dr}`);
  check(Math.abs(side.dl) > 2, 'левая скула поехала');
  check(Math.abs(side.dr) < 1, 'а правая осталась на месте — перекос односторонний');

  // ---------- 7. ЧУЖОЙ ОВЕРРАЙД НЕ ЗАТЁРТ ----------
  say('');
  say('======== ЧУЖОЙ ОВЕРРАЙД НЕ ЗАТЁРТ ========');
  const foreign = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    WormLook.reset(h);
    WormLook.foreign = null;                      // как при первом применении
    h.setOverride({ tail: { length: 2.5 } });     // «мини-игра подменила внешность»
    await new Promise(r => setTimeout(r, 150));
    WormLook.apply(h, { gloss: 0.3 });
    await new Promise(r => setTimeout(r, 180));
    const m = h.getModel();
    const res = { tail: m.tail.length, gloss: m.anatomy.coat.slimeGloss };
    WormLook.foreign = null;
    h.setOverride(null);
    WormLook.reset(h);
    return res;
  });
  check(Math.abs(foreign.tail - 2.5) < 1e-9,
        `подмена мини-игры цела: длина хвоста ${foreign.tail}`);
  check(foreign.gloss > 0.5, `и правка пульта тоже применилась: блеск ${foreign.gloss}`);

  // ---------- 8. ЗАПРЕЩЁННОЕ ОСТАЛОСЬ ЗАПРЕЩЁННЫМ ----------
  say('');
  say('======== ЗАПРЕТЫ ========');
  const forb = await page.evaluate(() => {
    const h = window.MainWormHandle;
    // Ручки с таким именем нет и быть не должно: свет по частям, свой цвет,
    // свой силуэт — это конституция стиля, а не настройка.
    const res = WormLook.apply(h, { lightPart: 0.5, headColor: 0.5 });
    WormLook.reset(h);
    return { refused: res.refused.map(r => r.key), f: WormLook.forbidden() };
  });
  check(forb.refused.length === 2, 'выдуманные ручки отвергнуты: ' + forb.refused.join(', '));
  check(!!forb.f['light.part'] && !!forb.f['color.hex'] && !!forb.f['outline.part'],
        'и каждый запрет объяснён, а не просто назван');

  // ---------- ПЕРСОНАЖ ЦЕЛ ----------
  const alive = await page.evaluate(() => {
    const root = document.querySelector('.worm-root');
    return { nodes: root ? root.querySelectorAll('*').length : 0 };
  });
  check(alive.nodes > 400, `персонаж цел после всех правок: ${alive.nodes} узлов`);
  await page.screenshot({ path: out + '2-after.png' });

  if (errors.length) { say('\nОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n')); bad += errors.length; }
  say('\n' + (bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ СОШЛОСЬ'));
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
