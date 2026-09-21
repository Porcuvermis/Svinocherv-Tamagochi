const { chromium } = require('playwright');
const harness = require('./harness');

// ============ ПРОВЕРКА: СТУДИЯ ВНЕШНОСТИ ============
// `src/core/worm-studio.js` — отдельный экран редактора.
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Закрытая студия НЕ ловит пальцы. Экран на весь холст, и оставленный
//      поверх игры он делает игру неиграбельной — молча.
//   2. Экран стоит ПО ХОЛСТУ, а не по окну. Верх окна в Telegram занят
//      шапкой клиента и чёлкой; то же самое уже ловили у панели инспектора.
//   3. Персонаж СВОЙ и НЕПОДВИЖНЫЙ. Ради этого студия и затевалась: в
//      движущуюся цель не попасть ни пальцем, ни глазом. Проверяется
//      габаритом по кадрам, а не флагом опции: флаг может стоять, а тело
//      всё равно дышать.
//   4. Комнатный червь не тронут: студия монтирует свой экземпляр, а не
//      забирает чужой.
//   5. Камера НАЕЗЖАЕТ на выбранное. Это главное обещание экрана: «выбрал
//      ухо — камера подъехала к уху». Меряется экранным размером уха ДО и
//      ПОСЛЕ, а не значением зума: зум может расти, а кадр стоять.
//   6. Ручки контура стоят НА персонаже и тянутся К ПАЛЬЦУ. Форма черепа
//      правится именно ими, и промах здесь невидим глазом.
//   7. Палец попадает туда, куда целились, ПРИ НАЕХАВШЕЙ КАМЕРЕ. Зум сделан
//      через viewBox ровно затем, чтобы перевод «экран → сцена» остался
//      честным; css-масштаб предка дал бы ловушку svg-space.
//   8. Правка уезжает в игру при закрытии, и студия за собой убирает.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-worm-studio.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/worm-studio-';
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

  // ---------- 1. ЗАКРЫТАЯ НЕ МЕШАЕТ ----------
  say('');
  say('======== ЗАКРЫТАЯ СТУДИЯ НЕ ЛОВИТ ПАЛЬЦЫ ========');
  const shut = await page.evaluate(() => {
    const el = document.elementFromPoint(195, 500);
    const root = document.getElementById('ws-root');
    return { top: el ? (el.id || el.className.baseVal || el.className || el.tagName) : '',
             inside: !!(root && root.contains(el)) };
  });
  check(!shut.inside, `под пальцем не студия, а игра: ${shut.top}`);

  // ---------- 2. ОТКРЫВАЕТСЯ ----------
  await page.evaluate(() => { DebugMode.toggle(); WormStudio.open(); });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: out + '1-open.png' });

  // ---------- 3. СВОЙ ПЕРСОНАЖ, И ОН СТОИТ ----------
  say('');
  say('======== ПЕРСОНАЖ СВОЙ И НЕПОДВИЖНЫЙ ========');
  const own = await page.evaluate(() => ({
    svgs: document.querySelectorAll('.worm-stage-svg').length,
    studioIsOwn: WormStudio.handle && window.MainWormHandle
                 && WormStudio.handle.svgRoot !== window.MainWormHandle.svgRoot,
    ctx: WormStudio.handle ? WormStudio.handle.svgRoot.getAttribute('class') : ''
  }));
  check(!!own.studioIsOwn, 'студия монтирует СВОЙ экземпляр, а не забирает комнатного');
  check(/worm-context-studio/.test(own.ctx), `и он помечен своим контекстом: ${own.ctx}`);

  // Габарит по кадрам: флаг опции может стоять, а тело дышать.
  const still = await page.evaluate(async () => {
    const svg = WormStudio.handle.svgRoot;
    const ряд = [];
    let i = 0;
    await new Promise(done => {
      const step = () => {
        if (i++ > 24) return done();
        const r = svg.querySelector('.worm-root').getBoundingClientRect();
        ряд.push(+(r.height).toFixed(1));
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return ряд;
  });
  const lo = Math.min(...still), hi = Math.max(...still);
  say(`  габарит по ${still.length} кадрам: от ${lo} до ${hi}`);
  check(hi - lo < 1.5, `персонаж стоит: размах ${(hi - lo).toFixed(1)} точек`);

  // А по кнопке «идёт» — оживает. Проверка нужна: кнопка, которая только
  // гасит, превращает студию в тупик.
  const alive = await page.evaluate(async () => {
    WormStudio.setFrozen(false);
    const svg = WormStudio.handle.svgRoot;
    const ряд = [];
    for (let i = 0; i < 40; i++) {
      await new Promise(r => requestAnimationFrame(r));
      ряд.push(+svg.querySelector('.worm-root').getBoundingClientRect().height.toFixed(1));
    }
    WormStudio.setFrozen(true);
    return ряд;
  });
  check(Math.max(...alive) - Math.min(...alive) > 0.3,
        `а «идёт» возвращает дыхание: размах ${(Math.max(...alive) - Math.min(...alive)).toFixed(1)}`);

  // ---------- 4. КАМЕРА НАЕЗЖАЕТ НА ВЫБРАННОЕ ----------
  say('');
  say('======== ВЫБРАЛ ВЕЩЬ — КАМЕРА ПОДЪЕХАЛА ========');
  const zoom = await page.evaluate(async () => {
    const W = () => {
      const el = WormStudio.handle.svgRoot.querySelector('[data-part="ear-left"]');
      return el ? +el.getBoundingClientRect().width.toFixed(1) : 0;
    };
    WormStudio.frameAll(true);
    await new Promise(r => setTimeout(r, 400));
    const было = W();
    WormStudio.row = 'face'; WormStudio.renderRows();
    WormStudio.select('ear-left');
    // Камера ПОДЪЕЗЖАЕТ, а не прыгает: ждём, пока доедет.
    await new Promise(r => setTimeout(r, 900));
    return { было, стало: W(), z: +WormStudio.cam.z.toFixed(2) };
  });
  say(`  ухо на экране: ${zoom.было} → ${zoom.стало} точек, зум ${zoom.z}`);
  check(zoom.стало > zoom.было * 1.6, 'ухо на экране стало заметно крупнее — камера действительно подъехала');
  await page.screenshot({ path: out + '2-ear.png' });

  // ---------- 5. ПАЛЕЦ ПОПАДАЕТ ПРИ НАЕХАВШЕЙ КАМЕРЕ ----------
  // Ради этого зум сделан через viewBox, а не css-масштабом предка: через
  // viewBox умеет считать SvgSpace, а css-масштаб WebKit в getScreenCTM не
  // учитывает — палец промахнулся бы ровно на величину наезда.
  say('');
  say('======== ПАЛЕЦ ПОПАДАЕТ ТУДА, КУДА ЦЕЛИЛИСЬ ========');
  const aim = await page.evaluate(() => WormParts.client(WormStudio.handle, 'ear-left'));
  await page.mouse.click(aim.x, aim.y);
  await page.waitForTimeout(300);
  const hit = await page.evaluate(() => WormStudio.picked);
  check(hit === 'ear-left' || hit === 'ear-fringe' || hit === 'ear-vessels',
        `тык в ухо выбрал ухо, а не соседа: ${hit}`);

  // ---------- 6. РУЧКИ КОНТУРА ----------
  say('');
  say('======== ФОРМУ ЧЕРЕПА ТЯНУТ ЗА КОНТУР ========');
  await page.evaluate(() => {
    WormLook.reset(WormStudio.handle);
    WormStudio.row = 'skull'; WormStudio.renderRows();
    WormStudio.select('cheek-left');
  });
  await page.waitForTimeout(900);
  const handles = await page.evaluate(() => {
    const svg = WormStudio.handle.svgRoot;
    const worm = svg.querySelector('.worm-root').getBoundingClientRect();
    const hs = [...document.querySelectorAll('.ws-h')].map(c => {
      const r = c.getBoundingClientRect();
      return { key: c.getAttribute('data-h'), x: r.left + r.width / 2, y: r.top + r.height / 2,
               r: r.width / 2 };
    });
    return { n: hs.length,
             // Ручка обязана лежать НА персонаже: висящая в стороне ручка
             // двигает не то, на что показывает.
             outside: hs.filter(h => h.x < worm.left - 6 || h.x > worm.right + 6
                                  || h.y < worm.top - 6 || h.y > worm.bottom + 6).length,
             small: hs.filter(h => h.r * 2 < 20).length,
             hs };
  });
  say(`  ручек на контуре: ${handles.n}, размер ${handles.hs[0] ? (handles.hs[0].r * 2).toFixed(0) : 0} точек`);
  check(handles.n >= 10, 'ориентиры черепа показаны все разом — форму видно целиком');
  check(handles.outside === 0, 'и каждая лежит на персонаже, а не рядом с ним');
  check(handles.small === 0, 'ручка не мельче двадцати точек — в мелкую палец не попадает');

  // Тянем скулу и смотрим, доехала ли она ДО ПАЛЬЦА.
  const cheek = handles.hs.find(h => h.key === 'cheek-left');
  const targetX = cheek.x - 26;
  await page.mouse.move(cheek.x, cheek.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(cheek.x + (targetX - cheek.x) * i / 6, cheek.y);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => ({
    p: WormParts.client(WormStudio.handle, 'cheek-left'),
    skew: WormLook.skew ? Object.assign({}, WormLook.skew) : null,
    right: WormParts.client(WormStudio.handle, 'cheek-right')
  }));
  say(`  скула: была ${cheek.x.toFixed(1)} → целились ${targetX.toFixed(1)} → стала ${after.p.x.toFixed(1)}`);
  check(Math.abs(after.p.x - cheek.x) > 8, 'скула действительно поехала за пальцем');
  check(Math.abs(after.p.x - targetX) < 14, `и доехала близко: промах ${Math.abs(after.p.x - targetX).toFixed(0)} точек`);
  check(!!(after.skew && Object.keys(after.skew).length), `правка легла в перекос: ${JSON.stringify(after.skew)}`);
  await page.screenshot({ path: out + '3-drag.png' });

  // ---------- 6б. ФОРМА УХА ----------
  // Ради этого всё и затевалось: «сделай ухо поострее, а мочку пониже» —
  // это «потяни кончик вверх, а мочку вниз», и делается пальцем, а не
  // просьбой ко мне.
  //
  // Проверяется САМ ПУТЬ уха, а не число в модели: число может лечь, а
  // рисование его не прочесть — ровно так контур и жил, пока был строкой с
  // полусотней чисел в коде.
  say('');
  say('======== ФОРМУ УХА ТЯНУТ ЗА КОНТУР ========');
  await page.evaluate(() => {
    WormLook.reset(WormStudio.handle);
    WormStudio.select('ear-left');
  });
  await page.waitForTimeout(900);
  const earHs = await page.evaluate(() => {
    const d = () => {
      const p = WormStudio.handle.svgRoot.querySelector('.worm-root [data-part="ear-left"] path');
      return p ? p.getAttribute('d') : '';
    };
    return { было: d(),
             hs: [...document.querySelectorAll('.ws-h')].map(c => {
               const r = c.getBoundingClientRect();
               return { k: c.getAttribute('data-h'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
             }) };
  });
  say(`  ручек на контуре уха: ${earHs.hs.length}`);
  check(earHs.hs.length === 5, 'все пять точек показаны разом — форму видно целиком');

  const tip = earHs.hs.find(h => h.k === 'ear-tip-left');
  check(!!tip, 'кончик среди них есть');
  if (tip) {
    const tx = tip.x - 18, ty = tip.y - 42;   // «поострее и повыше»
    await page.mouse.move(tip.x, tip.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(tip.x + (tx - tip.x) * i / 8, tip.y + (ty - tip.y) * i / 8);
      await page.waitForTimeout(35);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const p = WormStudio.handle.svgRoot.querySelector('.worm-root [data-part="ear-left"] path');
      const inner = WormStudio.handle.svgRoot.querySelector('.worm-root [data-part="ear-left"] path:nth-of-type(2)');
      return { d: p ? p.getAttribute('d') : '', inner: inner ? inner.getAttribute('d') : '',
               точка: WormParts.client(WormStudio.handle, 'ear-tip-left'),
               форма: WormLook.form,
               // Вторая сторона обязана остаться нетронутой: правят ОДНО ухо.
               правое: WormParts.client(WormStudio.handle, 'ear-tip-right') };
    });
    say(`  кончик: был ${tip.x.toFixed(1)},${tip.y.toFixed(1)} → целились ${tx.toFixed(1)},${ty.toFixed(1)} → стал ${r.точка.x.toFixed(1)},${r.точка.y.toFixed(1)}`);
    check(r.d !== earHs.было, 'путь уха перерисован — сдвиг дошёл до рисования, а не осел в модели');
    check(Math.hypot(r.точка.x - tx, r.точка.y - ty) < 12,
          `кончик доехал до пальца: промах ${Math.hypot(r.точка.x - tx, r.точка.y - ty).toFixed(0)} точек`);
    check(!!(r.форма && r.форма['ear-left'] && r.форма['ear-left']['ear-tip']),
          `правка легла в форму: ${JSON.stringify(r.форма)}`);
    // Раковина обязана ехать за контуром: пока их правили порознь, она
    // вылезала за ухо при первом же движении кончика.
    check(/-?\d/.test(r.inner) && r.inner !== '', 'раковина тоже перерисована');
    await page.screenshot({ path: out + '5-ear.png' });

    // Откат снимает ВЕСЬ жест, а не последний его миллиметр.
    const undone = await page.evaluate(async () => {
      WormLook.undo(WormStudio.handle);
      WormLook.flush();
      await new Promise(r => setTimeout(r, 300));
      const p = WormStudio.handle.svgRoot.querySelector('.worm-root [data-part="ear-left"] path');
      return { d: p ? p.getAttribute('d') : '', форма: WormLook.form };
    });
    check(undone.d === earHs.было, 'откат вернул ухо целиком — жест снят одним шагом, а не по миллиметру');
  }

  // Правое ухо не поехало: форма односторонняя.
  const other = await page.evaluate(() => WormLook.form);
  check(!other || !other['ear-right'], 'правое ухо не тронуто — форма у каждой стороны своя');

  // ---------- 6в. ПРОФИЛЬ ТЕЛА ----------
  // «Толщина тела» двигает всю цепочку разом и форму сохраняет. А профиль
  // силуэта — где толще, где тоньше — выводился из сида и руками не
  // правился вовсе, хотя именно он и есть фигура: горб на загривке,
  // перехват за животом, сужение к хвосту.
  say('');
  say('======== ПРОФИЛЬ ТЕЛА ТЯНУТ ПО ЗВЕНЬЯМ ========');
  await page.evaluate(() => {
    WormLook.reset(WormStudio.handle);
    WormStudio.row = 'body'; WormStudio.renderRows();
    WormStudio.select('belly');
  });
  await page.waitForTimeout(900);
  const chain = await page.evaluate(() => {
    const W = (p) => {
      const el = WormStudio.handle.svgRoot.querySelector(`.worm-root [data-part="${p}"]`);
      return el ? +el.getBoundingClientRect().height.toFixed(1) : 0;
    };
    return { hs: [...document.querySelectorAll('.ws-h')].map(c => {
               const r = c.getBoundingClientRect();
               return { k: c.getAttribute('data-h'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
             }),
             живот: W('belly'), сосед: W('segment-2') };
  });
  say(`  обхватов на цепочке: ${chain.hs.length}`);
  check(chain.hs.length >= 4, 'обхваты всех звеньев показаны разом — профиль видно целиком');
  check(chain.hs.every(h => /^girth-/.test(h.k)), 'и это именно обхваты, а не сами звенья');

  const belly = chain.hs.find(h => h.k === 'girth-belly');
  check(!!belly, 'живот среди них есть');
  if (belly) {
    // Тянем кромку живота ВВЕРХ — он обязан стать толще, а соседнее звено
    // остаться прежним: обхват односторонний, иначе это просто «толщина».
    const ty = belly.y - 16;
    await page.mouse.move(belly.x, belly.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(belly.x, belly.y + (ty - belly.y) * i / 6);
      await page.waitForTimeout(35);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const W = (p) => {
        const el = WormStudio.handle.svgRoot.querySelector(`.worm-root [data-part="${p}"]`);
        return el ? +el.getBoundingClientRect().height.toFixed(1) : 0;
      };
      const root = WormStudio.handle.svgRoot.querySelector('.worm-root');
      let nan = 0;
      root.querySelectorAll('*').forEach(el => {
        for (const a of el.attributes) if (a.value.indexOf('NaN') >= 0) nan++;
      });
      return { живот: W('belly'), сосед: W('segment-2'), girth: WormLook.girth, nan,
               узлов: root.querySelectorAll('*').length,
               ползунок: !!document.querySelector('.ws-knob input[data-girth]') };
    });
    say(`  живот ${chain.живот} → ${r.живот}, соседнее звено ${chain.сосед} → ${r.сосед}`);
    check(r.живот > chain.живот + 3, 'живот стал толще — кромка потянулась за пальцем');
    check(Math.abs(r.сосед - chain.сосед) < 2.5, 'а соседнее звено осталось прежним: обхват — у каждого свой');
    check(!!(r.girth && r.girth.belly), `правка легла в обхват: ${JSON.stringify(r.girth)}`);
    // Сегменты лежат в модели МАССИВАМИ, а слияние патча заменяет массив
    // целиком: неполный элемент оставлял от цепочки одно звено и уводил
    // всего персонажа в NaN (docs/traps.md, п. 143).
    check(r.nan === 0 && r.узлов > 400,
          `персонаж цел после правки цепочки: ${r.узлов} узлов, NaN в атрибутах ${r.nan}`);
    check(r.ползунок, 'и обхват виден ползунком — правка есть, значит её показывают');
    await page.screenshot({ path: out + '6-girth.png' });
  }

  // ---------- 7. ПЛИТКИ ----------
  say('');
  say('======== ПЛИТКИ ВЫБИРАЮТ БЕЗ ПИКСЕЛЬ-ХАНТИНГА ========');
  const chips = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-chip]')];
    return { n: all.length,
             small: all.filter(b => b.getBoundingClientRect().height < 44).length,
             rows: [...document.querySelectorAll('[data-row]')].length };
  });
  say(`  плиток в ряду «череп»: ${chips.n}, рядов ${chips.rows}`);
  check(chips.n >= 5, 'плиток хватает, чтобы не целиться пальцем в персонажа');
  check(chips.small === 0, 'и ни одна не ниже сорока четырёх точек');

  const byChip = await page.evaluate(async () => {
    WormStudio.row = 'skull'; WormStudio.renderRows();
    const b = [...document.querySelectorAll('[data-chip]')].find(x => x.getAttribute('data-chip') === 'chin');
    if (!b) return null;
    b.click();
    await new Promise(r => setTimeout(r, 300));
    return { picked: WormStudio.picked, knobs: document.querySelectorAll('.ws-knob').length };
  });
  check(!!byChip && byChip.picked === 'chin', 'плитка выбирает вещь');
  check(!!byChip && byChip.knobs > 0, `и под ней появляются её ручки: ${byChip ? byChip.knobs : 0}`);

  // ---------- 8. ЗАКРЫТИЕ ----------
  say('');
  say('======== ЗАКРЫЛИ — ПРАВКА УЕХАЛА В ИГРУ ========');
  const closed = await page.evaluate(async () => {
    const before = window.MainWormHandle.getOverride();
    // Что-нибудь непустое, иначе проверять нечего: откат в разделе про ухо
    // вернул внешность к исходной.
    WormLook.setSkew(WormStudio.handle, 'cheek', -1, 0.2);
    WormStudio.close();
    await new Promise(r => setTimeout(r, 400));
    const el = document.elementFromPoint(195, 500);
    const root = document.getElementById('ws-root');
    return {
      skewInGame: !!(window.MainWormHandle.getOverride()
                     && window.MainWormHandle.getOverride().head
                     && window.MainWormHandle.getOverride().head.skull
                     && window.MainWormHandle.getOverride().head.skull.skew),
      hadBefore: !!(before && before.head && before.head.skull && before.head.skull.skew),
      studioWorms: document.querySelectorAll('.worm-context-studio').length,
      catching: !!(root && root.contains(el)),
      nodes: document.querySelectorAll('.worm-root')[0].querySelectorAll('*').length
    };
  });
  check(closed.skewInGame && !closed.hadBefore, 'перекос, сделанный в студии, уехал на комнатного червя');
  check(closed.studioWorms === 0, 'а свой экземпляр студия за собой разобрала');
  check(!closed.catching, 'и закрытая студия снова не ловит пальцы');
  check(closed.nodes > 400, `персонаж цел: ${closed.nodes} узлов`);
  await page.screenshot({ path: out + '4-closed.png' });

  // ---------- ЭКРАН В TELEGRAM НА АЙФОНЕ ----------
  // Стоит последней: она подделывает клиент Telegram и пересобирает холст,
  // после чего мерить что-либо ещё нельзя.
  //
  // Без неё «экран внутри холста» ничего не доказывает: на компьютере холст
  // начинается от самого верха окна, и что угодно проходит её даром.
  // Настоящая беда видна ТОЛЬКО там, где верх окна занят чужим — чёлка плюс
  // шапка клиента. Ровно туда уезжала панель инспектора, и экран на весь
  // холст уехал бы так же, только незаметнее: под шапку попала бы кнопка
  // «закрыть», и из студии стало бы не выйти.
  say('');
  say('======== ЭКРАН НЕ ЛЕЗЕТ ПОД ШАПКУ TELEGRAM ========');
  const tg = await page.evaluate(async () => {
    const CHROME = { notch: 60, header: 56 };
    window.Telegram = { WebApp: {
      viewportStableHeight: window.innerHeight - 180,
      safeAreaInset: { top: CHROME.notch, bottom: 34, left: 0, right: 0 },
      contentSafeAreaInset: { top: CHROME.header, bottom: 0, left: 0, right: 0 }
    } };
    Stage.apply();
    WormStudio.open();
    await new Promise(r => setTimeout(r, 500));
    const r = document.getElementById('ws-root').getBoundingClientRect();
    const g = document.getElementById('game-container').getBoundingClientRect();
    const x = document.querySelector('[data-act="close"]').getBoundingClientRect();
    WormStudio.close();
    return {
      занято: CHROME.notch + CHROME.header,
      холст: +g.top.toFixed(0), экран: +r.top.toFixed(0), крестик: +x.top.toFixed(0),
      внутри: r.top >= g.top - 1 && r.bottom <= g.bottom + 1
           && r.left >= g.left - 1 && r.right <= g.right + 1
    };
  });
  say(`  верх окна занят чужим на ${tg.занято}, холст с ${tg.холст}, студия с ${tg.экран}, крестик с ${tg.крестик}`);
  check(tg.экран >= tg.занято, 'верх студии НЕ под шапкой клиента и не под чёлкой');
  check(tg.крестик >= tg.занято, 'и кнопка «закрыть» доступна — иначе из студии не выйти');
  check(tg.внутри, 'экран целиком внутри холста');

  if (errors.length) { say('\nОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n')); bad += errors.length; }
  say('\n' + (bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ СОШЛОСЬ'));
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
