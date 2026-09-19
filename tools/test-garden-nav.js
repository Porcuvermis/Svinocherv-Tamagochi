const { chromium } = require('playwright');
const harness = require('./harness');

// ============ ПРОВЕРКА: ПЕРЕХОД МЕЖДУ ГРЯДКАМИ И ГЛУБИНА ============
// Свободной панорамы у сада нет: в центре внимания ВСЕГДА одна грядка, к
// соседней переезжают стрелкой у края экрана (замысел —
// docs/plan/19-sloth-garden.md, раздел 1а).
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Грядка встаёт РОВНО в середину экрана, и крайние тоже. Пока поля
//      участка были уже половины экрана, первая грядка не центровалась
//      никогда: камера упиралась в край раньше, чем довозила её.
//   2. Границы: левее первой и правее последней ДОСТУПНОЙ хода нет.
//      Доступны все открытые и ОДНА закрытая справа — по ней видно, что
//      участок растёт, и стоит её цена.
//   3. Стрелки, которой некуда вести, нет вовсе. Приглушённая стрелка в
//      никуда была бы вопросом без ответа: показать причину нечем.
//   4. Панорамы БОЛЬШЕ НЕТ. Проверка живая: ведём пальцем через весь экран
//      и смотрим, что камера не сдвинулась ни на единицу.
//   5. Глубина: четыре слоя едут с РАЗНОЙ скоростью, и чем слой дальше, тем
//      медленнее. Передний — ровно один к одному: в его координатах
//      считается палец, и любая другая доля сломала бы перевод
//      «экран → сцена» молча.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-garden-nav.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/garden-nav-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
  await harness.prepare(page);
  const errors = [];
  let bad = 0;
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const say = console.log;
  const check = (ok, text) => { say((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) bad++; };
  const arrows = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.gd-arrow')).map(a => +a.dataset.dir).sort());
  // Тап по стрелке и ОЖИДАНИЕ ТОГО, ЧТО ПРОСИЛИ, а не фиксированной паузы.
  // С паузой прогон разок упал: слой стрелок перерисовывается и по переезду,
  // и раз в секунду вместе со всем садом, и «подождать 600 мс» попадало то до,
  // то после. Ждать надо состояние — «грядка сменилась», — тогда прогон либо
  // дожидается, либо честно падает, а не как повезёт.
  const tapArrow = async (dir) => {
    const was = await page.evaluate(() => SlothMinigame.bed);
    const b = await page.locator(`.gd-arrow[data-dir="${dir}"]`).boundingBox().catch(() => null);
    if (!b) { check(false, `стрелки ${dir > 0 ? '→' : '←'} нет, а она ожидалась`); return false; }
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    for (let i = 0; i < 40; i++) {
      if (await page.evaluate(() => SlothMinigame.bed) !== was) {
        // Переезд считается покадрово, и пока он идёт, camX — промежуточный.
        // Ждём ИМЕННО его конца (camRaf обнуляется на последнем кадре), а не
        // «примерно столько же миллисекунд»: длительность переезда правят, а
        // про прогон при этом забывают.
        await page.waitForFunction(() => !SlothMinigame.camRaf, null, { timeout: 4000 });
        return true;
      }
      await page.waitForTimeout(50);
    }
    check(false, `тап по стрелке ${dir > 0 ? '→' : '←'} не сменил грядку`);
    return false;
  };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);
  await page.evaluate(() => GameManager.handleSinAction('sloth'));
  await page.waitForTimeout(1300);
  await page.screenshot({ path: out + '1-bed0.png' });

  // ---------- 1. ГРЯДКА В ЦЕНТРЕ ЭКРАНА ----------
  say('');
  say('======== ГРЯДКА ВСТАЁТ В ЦЕНТР ========');
  const centred = await page.evaluate(() => {
    const res = [];
    const last = SlothMinigame.lastBed();
    for (let i = 0; i <= last; i++) {
      SlothMinigame.goToBed(i, true);
      res.push({ i, onScreen: +SlothMinigame.toStagePoint(GARDEN_ART.bedX(i), 0).x.toFixed(1) });
    }
    SlothMinigame.goToBed(0, true);
    return res;
  });
  centred.forEach(r => check(Math.abs(r.onScreen - 195) < 1,
    `грядка ${r.i} стоит на x=${r.onScreen} (середина экрана — 195)`));

  // И крайняя справа тоже: именно на ней камера раньше упиралась в край.
  const far = await page.evaluate(() => {
    GameState.data.garden.beds.forEach(b => { b.stage = 'empty'; });
    SlothMinigame.render();
    const i = GARDEN.BEDS_TOTAL - 1;
    SlothMinigame.goToBed(i, true);
    return { i, onScreen: +SlothMinigame.toStagePoint(GARDEN_ART.bedX(i), 0).x.toFixed(1) };
  });
  check(Math.abs(far.onScreen - 195) < 1,
        `последняя грядка (${far.i}) тоже встаёт по центру: x=${far.onScreen}`);

  // ---------- 2–3. ГРАНИЦЫ И СТРЕЛКИ ----------
  say('');
  say('======== ГРАНИЦЫ ХОДА ========');
  // Возвращаем сад к началу: две открытые грядки и одна закрытая справа.
  await page.evaluate(() => {
    GameState.data.garden.beds.forEach((b, i) => {
      b.stage = i < GARDEN.BEDS_OPEN ? 'empty' : 'locked';
    });
    GameState.save();
    SlothMinigame.goToBed(0, true);
    SlothMinigame.render();
  });
  await page.waitForTimeout(400);

  const start = await page.evaluate(() => ({
    bed: SlothMinigame.bed, last: SlothMinigame.lastBed(), total: GARDEN.BEDS_TOTAL
  }));
  check(start.total === 10, `грядок на участке: ${start.total}`);
  const openCount = await page.evaluate(() => GARDEN.BEDS_OPEN);
  check(start.last === openCount,
        `открытых ${openCount} (индексы 0…${openCount - 1}), доступна ещё закрытая ${openCount}`);
  check(await page.evaluate((i) => {
    const b = Backend.gardenBed(i); return !!b && b.stage === 'locked';
  }, start.last), `грядка ${start.last} действительно закрыта — на ней видна цена`);

  check(JSON.stringify(await arrows()) === '[1]',
        'на первой грядке есть только правая стрелка');
  const beforeLeft = await page.evaluate(() => SlothMinigame.camX);
  await page.evaluate(() => SlothMinigame.step(-1));
  await page.waitForTimeout(400);
  check(await page.evaluate(() => SlothMinigame.camX) === beforeLeft,
        'левее первой грядки хода нет');

  // До последней доступной и упереться.
  for (let i = 0; i < start.last; i++) await tapArrow(1);
  const atEnd = await page.evaluate(() => ({ bed: SlothMinigame.bed, camX: SlothMinigame.camX }));
  check(atEnd.bed === start.last, `дошли до последней доступной грядки (${atEnd.bed})`);
  check(JSON.stringify(await arrows()) === '[-1]',
        'на ней есть только левая стрелка: дальше закрытая, ходу нет');
  await page.evaluate(() => SlothMinigame.step(1));
  await page.waitForTimeout(400);
  check(await page.evaluate(() => SlothMinigame.camX) === atEnd.camX,
        'и правее последней доступной хода нет');
  await page.screenshot({ path: out + '2-last.png' });

  // Открыли ещё одну — граница сдвинулась вправо ровно на одну.
  await page.evaluate(() => {
    const beds = GameState.data.garden.beds;
    beds[GARDEN.BEDS_OPEN].stage = 'empty';
    GameState.save();
    SlothMinigame.render();
  });
  await page.waitForTimeout(400);
  check(await page.evaluate(() => SlothMinigame.lastBed()) === start.last + 1,
        'разобрали завал — граница сдвинулась ровно на одну грядку');
  check(JSON.stringify(await arrows()) === '[-1,1]',
        'и правая стрелка появилась сразу, не дожидаясь следующего захода');

  // ---------- 4. ПАНОРАМЫ БОЛЬШЕ НЕТ ----------
  say('');
  say('======== СВОБОДНОЙ ПАНОРАМЫ НЕТ ========');
  const camWas = await page.evaluate(() => SlothMinigame.camX);
  // Ведём пальцем через весь экран по пустому небу — там раньше начиналась
  // панорама.
  await page.mouse.move(330, 300);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(330 - i * 28, 300); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(400);
  check(await page.evaluate(() => SlothMinigame.camX) === camWas,
        'палец через весь экран не сдвинул камеру ни на единицу');

  // ---------- 5. ЗУМ: СОСЕДНЕЙ ГРЯДКИ В КАДРЕ НЕТ ----------
  // Ради этого зум и вводился. Считается по РЕАЛЬНОМУ положению грядок на
  // экране, а не по формуле из того же файла: формула и проверка, списанные
  // друг с друга, согласны всегда.
  say('');
  say('======== СОСЕДНЕЙ ГРЯДКИ НЕ ВИДНО ========');
  const frame = await page.evaluate(() => {
    SlothMinigame.goToBed(1, true);
    const hw = GARDEN_ART.BED_W / 2;
    const at = (i) => ({
      l: SlothMinigame.toStagePoint(GARDEN_ART.bedX(i) - hw, 0).x,
      r: SlothMinigame.toStagePoint(GARDEN_ART.bedX(i) + hw, 0).x
    });
    return { zoom: GARDEN_ART.ZOOM, mid: at(1), left: at(0), right: at(2) };
  });
  say(`  зум камеры ×${frame.zoom}`);
  say(`  грядка в центре занимает ${frame.mid.l.toFixed(0)} … ${frame.mid.r.toFixed(0)} из 0 … 390`);
  check(frame.zoom > 1, `камера приближена (×${frame.zoom}), а не стоит один к одному`);
  check(frame.left.r < 0 && frame.right.l > 390,
        `соседние грядки за кадром: левая кончается на ${frame.left.r.toFixed(0)}, ` +
        `правая начинается на ${frame.right.l.toFixed(0)}`);
  // И сама грядка при этом целиком в кадре: зум, срезавший её края, лечил бы
  // одно другим.
  check(frame.mid.l > 0 && frame.mid.r < 390,
        'а та, что в центре, влезает целиком — зум не срезал её краёв');
  await page.evaluate(() => SlothMinigame.goToBed(0, true));
  await page.screenshot({ path: out + '3-zoom.png' });

  // ---------- 6. ГЛУБИНА ----------
  say('');
  say('======== ЧЕТЫРЕ СЛОЯ ЕДУТ С РАЗНОЙ СКОРОСТЬЮ ========');
  const depth = await page.evaluate(() => {
    SlothMinigame.goToBed(0, true);
    const read = () => {
      const out = {};
      GARDEN_ART.LAYERS.forEach(L => {
        const el = document.getElementById(L.key === 'front' ? 'gd-cam' : 'gd-' + L.key);
        const m = /translate\(([-\d.]+)/.exec(el.getAttribute('transform') || 'translate(0');
        out[L.key] = m ? Math.abs(parseFloat(m[1])) : 0;
        // Зум обязан быть ОДИН на все слои: разный масштаб у соседних слоёв
        // — это не глубина, а разъехавшаяся сцена.
        const z = /scale\(([-\d.]+)/.exec(el.getAttribute('transform') || '');
        out[L.key + '@'] = z ? parseFloat(z[1]) : 1;
      });
      return out;
    };
    const at0 = read(), cam0 = SlothMinigame.camX;
    SlothMinigame.goToBed(SlothMinigame.lastBed(), true);
    const at1 = read();
    // Ход камеры — это РАЗНИЦА, а не конечное значение: при зуме камера и на
    // первой грядке стоит не в нуле (полэкрана сцены остаётся слева).
    return { camX: SlothMinigame.camX - cam0, at0, at1, zoom: GARDEN_ART.ZOOM,
             order: GARDEN_ART.LAYERS.map(L => L.key) };
  });

  const moved = {};
  depth.order.forEach(k => { moved[k] = depth.at1[k] - depth.at0[k]; });
  check(depth.order.every(k => Math.abs(depth.at1[k + '@'] - depth.zoom) < 0.001),
        `зум одинаков у всех четырёх слоёв (×${depth.zoom})`);
  depth.order.forEach(k =>
    say(`  ${k.padEnd(6)} сдвинулся на ${moved[k].toFixed(1)} при ходе камеры ${depth.camX.toFixed(0)}`));

  check(Math.abs(moved.front - depth.camX * depth.zoom) < 0.5,
        'передний слой едет РОВНО на ход камеры (в масштабе зума) — в его ' +
        'координатах считается палец');
  check(moved.near < moved.front && moved.mid < moved.near && moved.sky < moved.mid,
        'каждый следующий слой едет медленнее предыдущего');
  check(moved.sky > 0, 'и самый дальний всё-таки едет, а не стоит: небо тоже часть хода');

  if (errors.length) { say('\nОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n')); bad += errors.length; }
  say('\n' + (bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ СОШЛОСЬ'));
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
