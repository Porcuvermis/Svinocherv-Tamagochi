const { chromium } = require('playwright');
const harness = require('./harness');

// ================= ПРОВЕРКА: САМОПИСЕЦ =================
// Самописец (src/core/flight-recorder.js) пишет по кадрам то, что на
// телефоне дёргается и мигает, а игрок присылает отчёт текстом. Здесь
// проверяется, что отчёт ГОДЕН для разбора, а не просто «что-то записалось»:
//   1. Выключенный самописец не крутит ни одного кадра. Считается не его
//      собственным счётчиком, а requestAnimationFrame, подменённым ДО
//      загрузки страницы: вызов засчитывается самописцу по стеку. Свой
//      счётчик соврал бы ровно тогда, когда цикл запущен мимо него.
//   2. Кнопка в debug-панели взводит запись, через три секунды запись
//      идёт — и продолжается при ВЫКЛЮЧЕННОМ debug (игрок убирает панели,
//      чтобы они не закрывали сцену).
//   3. Ванная: мыло летит домой, мочалка поднимается с полки. В отчёте —
//      шапка, сводка, кадры, на которых меняется положение #bt-held, и
//      переключения классов холста руки отдельными строками.
//   4. Стоп той же кнопкой — окошко с отчётом внутри холста, кнопки не
//      мельче 44 единиц. «Копировать» кладёт в буфер ровно текст отчёта, а
//      при отказе буфера копирует выделением.
//   5. После стопа цикл стоит. Запись сама кончается по времени; предел
//      размера честно помечает «обрезано».
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-flight-recorder.js /tmp/recorder-
(async () => {
  const out = process.argv[2] || '/tmp/recorder-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
  await harness.prepare(page);
  const errors = [];
  let bad = 0;
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const say = console.log;
  const check = (ok, text) => { say((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) bad++; };

  // Чей вызов requestAnimationFrame — по стеку. Ставится до любого скрипта
  // страницы.
  await page.addInitScript(() => {
    window.__frRaf = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (cb) {
      if (/flight-recorder\.js/.test(new Error().stack || '')) window.__frRaf += 1;
      return orig(cb);
    };
  });

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2600);

  const rafs = () => page.evaluate(() => window.__frRaf);
  const idle = async (label) => {
    const a = await rafs();
    await page.waitForTimeout(1000);
    const b = await rafs();
    check(a === b, `${label}: ни одного кадра самописца за секунду (${b - a})`);
  };

  say('\n======== ВЫКЛЮЧЕН — НОЛЬ ========');
  await idle('после загрузки');
  check(await page.evaluate(() => FlightRecorder.ticks === 0 && FlightRecorder.raf === 0),
        'и его цикл не звался ни разу');

  await page.evaluate(() => { GameManager.handleSinAction('lust'); });
  await page.waitForTimeout(1000);
  check(await page.evaluate(() => FlightRecorder.probes.some(p => p.name === 'ванная')), 'щуп ванной зарегистрирован');
  await idle('ванная открыта, debug выключен');
  await page.evaluate(() => DebugMode.toggle());
  await idle('debug включён, запись не нажата');

  // Мыло поднялось и парит: до этого места запись не нужна.
  await page.evaluate(() => LustMinigame.startWater());
  for (let i = 0; i < 40 && !(await page.evaluate(() => LustMinigame.phase === 'soap' && LustMinigame.loose && !LustMinigame.liftRaf)); i++) await page.waitForTimeout(250);

  say('\n======== КНОПКА: ВЗВЕСТИ, ЗАПИСАТЬ, ОСТАНОВИТЬ ========');
  // Палец по координатам, а не селектором: заодно проверка, что кнопку
  // ничто не накрывает (панель инспектора, панель ванной).
  const tap = async (sel) => {
    const at = await page.evaluate((sel) => {
      const n = document.querySelector(sel); if (!n) return null;
      const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);
    if (!at) return false;
    const hit = await page.evaluate(({ sel, x, y }) => {
      const n = document.elementFromPoint(x, y); return !!n && !!n.closest(sel);
    }, { sel, x: at.x, y: at.y });
    await page.mouse.click(at.x, at.y);
    return hit;
  };
  check(await tap('#debug-state-panel [data-act="rec"]'), 'кнопку «Самописец» видно и её ничто не накрывает');
  const armed = await page.evaluate(() => ({ st: FlightRecorder.state, txt: document.querySelector('[data-act="rec"]').textContent,
    bug: document.getElementById('debug-toggle-btn').classList.contains('rec') }));
  check(armed.st === 'armed' && /старт/.test(armed.txt), `нажата — запись взведена, на кнопке отсчёт («${armed.txt}»)`);
  check(armed.bug, '🐞 обведена красным');
  check(await page.evaluate(() => window.__frRaf) === 0, 'взведённая запись кадров ещё не крутит');
  // Игрок убирает debug, чтобы панели не закрывали сцену.
  await page.evaluate(() => DebugMode.toggle());
  await page.waitForTimeout(3300);
  check(await page.evaluate(() => FlightRecorder.state === 'rec'), 'через три секунды запись пошла — и при выключенном debug тоже');

  // Мыло домой, мочалка с полки — то самое место, где мочалку трясло.
  await page.evaluate(() => { const L = LustMinigame; L.rub = 1; L.growTo('soap', 1); L.finishStage('soap'); });
  for (let i = 0; i < 60 && !(await page.evaluate(() => LustMinigame.phase === 'cloth' && LustMinigame.loose && !LustMinigame.liftRaf)); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(700);
  check(await page.evaluate(() => FlightRecorder.state === 'rec'), 'мочалка поднялась, запись ещё идёт');

  await page.evaluate(() => DebugMode.toggle());
  check(await tap('#debug-state-panel [data-act="rec"]'), 'стоп той же кнопкой');
  await page.waitForTimeout(200);
  const rep = await page.evaluate(() => ({
    st: FlightRecorder.state, text: FlightRecorder.last,
    open: document.getElementById('fr-root') && document.getElementById('fr-root').classList.contains('open'),
    shown: document.querySelector('#fr-root .fr-text') && document.querySelector('#fr-root .fr-text').value }));
  check(rep.st === 'off', 'запись остановлена');
  check(rep.open && rep.shown === rep.text && rep.text.length > 500, `окошко открылось, в нём отчёт (${rep.text.length} знаков)`);

  say('\n======== ЧТО В ОТЧЁТЕ ========');
  const T = rep.text, lines = T.split('\n');
  check(/^САМОПИСЕЦ · /.test(lines[0]) && /\nua: /.test(T) && /\ndpr [\d.]+ · окно \d+×\d+/.test(T) && /холст 390×844 ×/.test(T),
        'шапка: время, устройство, окно, холст и масштаб');
  check(/\nсборка: /.test(T) && /\ntelegram: /.test(T), 'шапка: сборка и Telegram');
  const sm = /кадров (\d+) за ([\d.]+) с · dt медиана ([\d.]+) · 95% ([\d.]+) · макс ([\d.]+) мс · длинных \(>34 мс\) (\d+)/.exec(T);
  check(!!sm && +sm[1] > 60, `сводка: ${sm ? sm[0] : 'нет'}`);
  check(/переключений классов \d+:.*bt-float/.test(T), 'сводка считает переключения слоёв (bt-float)');
  const frames = lines.filter(l => /^\d+;[\d.]+;[\d.]+!?;/.test(l));
  check(sm && frames.length === +sm[1], `строк кадров столько же, сколько кадров (${frames.length})`);
  const heldMoves = frames.filter(l => /held\.at=/.test(l));
  check(heldMoves.length >= 5, `положение #bt-held меняется по кадрам (${heldMoves.length} строк), пример: ${(heldMoves[2] || '').slice(0, 140)}`);
  const cls = lines.filter(l => /^!\d+;[\d.]+;#bt-hand класс /.test(l));
  check(cls.some(l => /\+bt-float/.test(l)), `переключения классов #bt-hand — отдельной строкой с кадром: ${cls.slice(0, 3).join(' | ')}`);
  check(lines.some(l => /^!\d+;[\d.]+;#bt-(held|homing) (появился|исчез|заменён)/.test(l)), 'замена узла вещи отмечена');
  check(frames.some(l => /hand\.anim=.*waapi:running/.test(l)), 'подъём видно: анимация холста руки идёт');
  // Щуп ванной называет холсты вещей и их размер (docs/traps.md, п. 156):
  // вещь в руке перерисовывает холст размером с себя, а не 390×844.
  const handBox = frames.map(l => /box=[^;]*?рука (\d+)x(\d+)\*/.exec(l)).filter(Boolean);
  check(handBox.length > 0 && handBox.every(m => +m[1] < 390 && +m[2] < 844 && +m[1] * +m[2] < 390 * 844 / 3),
        `щуп: холст вещи в руке — слой размером с вещь (${handBox.slice(0, 3).map(m => m[1] + '×' + m[2]).join(', ') || 'нет'})`);
  check(frames.some(l => /ph=cloth/.test(l)) && frames.some(l => /loose=cloth/.test(l)), 'фаза и вещь в воздухе меняются в строках кадров');
  // Только изменения: ключ, не менявшийся с прошлого кадра, повторно не пишется.
  const repeat = frames.slice(1).filter((l, i) => {
    const prev = frames[i];
    const a = /ph=(\w+)/.exec(prev), b = /ph=(\w+)/.exec(l);
    return a && b && a[1] === b[1];
  });
  check(repeat.length === 0, 'в строки пишутся только изменения (фаза не повторяется подряд)');
  check(T.length < 64000, `отчёт влезает в предел (${(T.length / 1000).toFixed(1)} тыс. знаков)`);
  say('  --- кусок отчёта ---');
  lines.slice(0, 16).forEach(l => say('    ' + l.slice(0, 200)));
  const mid = lines.findIndex(l => /#bt-hand класс \+bt-float/.test(l));
  lines.slice(Math.max(0, mid - 3), mid + 2).forEach(l => say('    ' + l.slice(0, 260)));

  say('\n======== ОКОШКО ========');
  const geo = await page.evaluate(() => {
    const box = document.getElementById('game-container').getBoundingClientRect();
    const k = box.width / document.getElementById('game-container').offsetWidth;
    const card = document.querySelector('#fr-root .fr-card').getBoundingClientRect();
    const btns = Array.from(document.querySelectorAll('#fr-root button')).map(b => {
      const r = b.getBoundingClientRect(); return Math.min(r.width, r.height) / k; });
    return { inside: card.left >= box.left - 0.5 && card.right <= box.right + 0.5 && card.top >= box.top - 0.5 && card.bottom <= box.bottom + 0.5,
             minBtn: Math.min(...btns), n: btns.length };
  });
  check(geo.inside, 'окошко целиком внутри холста');
  check(geo.minBtn >= 44, `кнопки не мельче 44 единиц холста (${geo.minBtn.toFixed(0)}, кнопок ${geo.n})`);
  await page.screenshot({ path: out + 'shot.png' });
  say('  снимок: ' + out + 'shot.png');

  say('\n======== КОПИРОВАНИЕ ========');
  await page.evaluate(() => {
    window.__clip = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText: (t) => { window.__clip = t; return Promise.resolve(); } } });
  });
  check(await tap('#fr-root .fr-row [data-fr="copy"]'), 'кнопку «Копировать» ничто не накрывает');
  await page.waitForTimeout(100);
  const c1 = await page.evaluate(() => ({ clip: window.__clip, text: FlightRecorder.last, st: document.querySelector('#fr-root .fr-status').textContent }));
  check(c1.clip === c1.text && /Скопировано/.test(c1.st), `буфер получил ровно отчёт («${c1.st}»)`);
  // Вебвью Telegram на iOS: буфер отказывает — копирование выделением.
  await page.evaluate(() => {
    window.__sel = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText: () => Promise.reject(new Error('NotAllowedError')) } });
    document.execCommand = (cmd) => {
      const ta = document.querySelector('#fr-root .fr-text');
      window.__sel = cmd === 'copy' ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : null;
      return cmd === 'copy';
    };
  });
  await tap('#fr-root .fr-row [data-fr="copy"]');
  await page.waitForTimeout(100);
  const c2 = await page.evaluate(() => ({ sel: window.__sel, text: FlightRecorder.last, st: document.querySelector('#fr-root .fr-status').textContent }));
  check(c2.sel === c2.text && /выделением/.test(c2.st), `буфер отказал — скопировано выделением всего отчёта («${c2.st}»)`);
  check(await tap('#fr-root .fr-x'), 'крестик не накрыт');
  check(await page.evaluate(() => !document.getElementById('fr-root').classList.contains('open')), 'крестик закрывает окошко');

  say('\n======== ПОСЛЕ СТОПА — СНОВА НОЛЬ ========');
  await idle('после остановки');
  check(await page.evaluate(() => FlightRecorder.raf === 0), 'цикл снят');

  say('\n======== САМА КОНЧАЕТСЯ И ЧЕСТНО ОБРЕЗАЕТСЯ ========');
  const auto = await page.evaluate(() => new Promise(res => {
    const before = FlightRecorder.last;
    FlightRecorder.start(600);
    setTimeout(() => res({ st: FlightRecorder.state, fresh: FlightRecorder.last !== before,
      open: document.getElementById('fr-root').classList.contains('open') }), 1200);
  }));
  check(auto.st === 'off' && auto.fresh && auto.open, 'запись на 0.6 с сама остановилась и показала отчёт');
  const cut = await page.evaluate(() => new Promise(res => {
    const lim = FlightRecorder.LIMIT;
    FlightRecorder.LIMIT = 1500;
    FlightRecorder.start(1500);
    setTimeout(() => { FlightRecorder.LIMIT = lim; const t = FlightRecorder.last;
      res({ cut: /ОБРЕЗАНО: строки кадров кончились на кадре \d+ из \d+/.test(t), tail: /… обрезано$/.test(t),
            all: (/кадров (\d+)/.exec(t) || [])[1] }); }, 2000);
  }));
  check(cut.cut && cut.tail, `предел размера — пометка «обрезано», сводка по всей записи (${cut.all} кадров)`);
  await page.evaluate(() => DebugRecorder.close());
  await idle('после всех записей');

  if (errors.length) { say('\nОШИБКИ:'); errors.forEach(e => say('  ' + e)); bad += errors.length; }
  say(`\n${bad ? '✗ провалов: ' + bad : '✓ всё прошло'}`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
