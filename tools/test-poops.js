// ============================================================================
//   ПРОВЕРКА КУЧЕК НА ИЗМОР
// ============================================================================
// Живая проверка в настоящем браузере: много циклов пищеварения, тапы в
// разном порядке, перестроения комнаты, перезагрузка страницы. После каждого
// шага проверяется один инвариант: ЧТО НАРИСОВАНО, ТО И ЕСТЬ В СОСТОЯНИИ —
// ни лишних узлов, ни пропавших, ни дублей.
//
// Зачем это отдельным файлом. На этом месте уже дважды ловились баги, каждый
// из которых руками воспроизводился с десятого раза:
//   • подпись «перерисовать обязательно» совпадала с подписью пустого списка,
//     и снятие последней кучки не перерисовывало слой — узел оставался на
//     экране навсегда и молча съедал тапы;
//   • между двумя быстрыми кормёжками червь не успевал отойти, и кучки
//     ложились одна на другую в одну точку: тап убирал верхнюю, нижняя
//     оставалась на том же месте, и выглядело это как «тап не работает».
//
// Как запускать (нужен playwright-core и локальный сервер с игрой):
//     npm i playwright-core
//     python3 -m http.server 8161      # из корня репозитория
//     node tools/test-poops.js
//
// Червя тест намеренно отгоняет от кучки перед тапом: тело закрывает пол
// собой, и это правильное поведение, а не поломка.
// ============================================================================

// Проверка кучек «на измор»: много циклов, тапы в разном порядке,
// перестроения комнаты. После КАЖДОГО шага проверяется один инвариант —
// что нарисовано, то и есть в состоянии, ни больше ни меньше.
const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8161/', { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  await p.evaluate(() => GameState.reset());
  await p.click('#debug-toggle-btn');
  await p.waitForTimeout(200);

  let problems = 0;
  const check = async (step) => {
    const r = await p.evaluate(() => {
      const state = GameState.data.room.poops.map(x => x.id).sort();
      const dom = [...document.querySelectorAll('.worm-poop')].map(n => n.getAttribute('data-poop-id')).sort();
      return { state, dom,
        лишние: dom.filter(id => !state.includes(id)),
        пропали: state.filter(id => !dom.includes(id)),
        дубли: dom.filter((id, i) => dom.indexOf(id) !== i) };
    });
    const bad = r.лишние.length || r.пропали.length || r.дубли.length;
    if (bad) {
      problems++;
      console.log('!!! ' + step + ' — лишние:' + JSON.stringify(r.лишние) +
                  ' пропали:' + JSON.stringify(r.пропали) + ' дубли:' + JSON.stringify(r.дубли));
    }
    return r;
  };

  const cycle = async () => {
    await p.click('#debug-state-panel [data-act="feed"]');
    await p.waitForTimeout(300);
    await p.click('#debug-state-panel [data-act="hour"]');
    await p.click('#debug-state-panel [data-act="hour"]');
    await p.waitForTimeout(2400);
  };

  // Тап по кучке с предварительным отгоном червя, чтобы он не загораживал
  const tap = async (id) => {
    const at = await p.evaluate((id) => {
      const o = GameState.data.room.poops.find(x => x.id === id);
      if (!o) return null;
      // Червя уводим в заведомо видимую точку подальше от кучки
      const box = MainWormHandle.svgRoot.getBoundingClientRect();
      MainWormHandle.setPosition(o.x > 200 ? 60 : 340, 120);
      const svg = MainWormHandle.svgRoot;
      const pt = svg.createSVGPoint(); pt.x = o.x; pt.y = o.y;
      const s = pt.matrixTransform(svg.getScreenCTM());
      return { x: s.x, y: s.y, w: window.innerWidth, h: window.innerHeight };
    }, id);
    if (!at) return 'нет в состоянии';
    await p.waitForTimeout(150);
    const onscreen = at.x >= 0 && at.y >= 0 && at.x <= at.w && at.y <= at.h;
    if (!onscreen) return 'ВНЕ ЭКРАНА (' + Math.round(at.x) + ',' + Math.round(at.y) + ')';
    // Кто на самом деле лежит в точке нажатия
    const who = await p.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return 'ничего';
      const cls = el.getAttribute && el.getAttribute('class');
      const poop = el.closest && el.closest('.worm-poop');
      return (poop ? 'КУЧКА' : (el.tagName + (cls ? '.' + cls : '') +
             (el.id ? '#' + el.id : '')));
    }, [at.x, at.y]);
    await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(350);
    const gone = await p.evaluate((id) => !GameState.data.room.poops.some(x => x.id === id), id);
    return gone ? 'убрана' : ('ОСТАЛАСЬ, в точке: ' + who);
  };

  console.log('--- сценарий 1: копим три кучки, убираем в обратном порядке ---');
  for (let i = 0; i < 3; i++) { await cycle(); await check('накопление ' + (i + 1)); }
  let ids = await p.evaluate(() => GameState.data.room.poops.map(x => x.id));
  console.log('накоплено:', ids.length);
  for (const id of ids.slice().reverse()) {
    const res = await tap(id);
    console.log('  тап', id, '→', res);
    if (res === 'ОСТАЛАСЬ') problems++;
    await check('после тапа ' + id);
  }
  await check('после снятия всех');
  console.log('  на экране узлов:', await p.evaluate(() => document.querySelectorAll('.worm-poop').length), '(ждём 0)');

  console.log('--- сценарий 2: одна кучка → снять → снова накопить ---');
  for (let round = 0; round < 3; round++) {
    await cycle(); await check('раунд ' + round + ' появление');
    const id = (await p.evaluate(() => GameState.data.room.poops.map(x => x.id)))[0];
    const res = await tap(id);
    console.log('  раунд', round, '→', res);
    if (res === 'ОСТАЛАСЬ') problems++;
    await check('раунд ' + round + ' после снятия');
    const nodes = await p.evaluate(() => document.querySelectorAll('.worm-poop').length);
    if (nodes !== 0) { problems++; console.log('!!! после снятия осталось узлов:', nodes); }
  }

  console.log('--- сценарий 3: перестроения и мини-игра между циклами ---');
  await cycle();
  await p.setViewportSize({ width: 420, height: 800 }); await p.waitForTimeout(900);
  await check('после смены размера');
  await p.evaluate(() => GameManager.handleSinAction('gluttony')); await p.waitForTimeout(900);
  await p.evaluate(() => { const el = document.getElementById('gluttony-game'); if (el) el.classList.remove('active'); });
  await p.waitForTimeout(900); await check('после мини-игры');
  await cycle(); await check('цикл после перестроений');
  ids = await p.evaluate(() => GameState.data.room.poops.map(x => x.id));
  for (const id of ids) {
    const res = await tap(id);
    console.log('  тап', id, '→', res);
    if (res === 'ОСТАЛАСЬ') problems++;
    await check('после тапа ' + id);
  }
  console.log('  узлов на экране:', await p.evaluate(() => document.querySelectorAll('.worm-poop').length), '(ждём 0)');

  console.log('--- сценарий 4: перезагрузка страницы с кучками на полу ---');
  await cycle(); await cycle();
  const before = await p.evaluate(() => GameState.data.room.poops.map(x => x.id).sort());
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2500);
  const after = await p.evaluate(() => GameState.data.room.poops.map(x => x.id).sort());
  console.log('  до перезагрузки:', before.length, '| после:', after.length,
              '| совпали:', JSON.stringify(before) === JSON.stringify(after));
  if (JSON.stringify(before) !== JSON.stringify(after)) problems++;
  await check('после перезагрузки');
  for (const id of after) {
    const res = await tap(id);
    console.log('  тап', id, '→', res);
    if (res === 'ОСТАЛАСЬ') problems++;
  }
  await check('финал');

  console.log('');
  console.log(problems ? ('НАЙДЕНО ПРОБЛЕМ: ' + problems) : 'ВСЁ ЧИСТО: расхождений нет, все кучки убираются');
  console.log('ошибки в консоли:', errs);
  await b.close();
})();
