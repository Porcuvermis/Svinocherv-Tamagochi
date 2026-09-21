const { chromium } = require('playwright');
const harness = require('./harness');

// ============ ПРОВЕРКА: ГОЛОВА ПРИ ПОВОРОТЕ ============
// Пять бед, найденных глазами на одном скриншоте повёрнутой головы. Общее у
// них одно: НИ ОДНА не видна на анфасе, а игра почти всё время показывает
// голову чуть довёрнутой.
//
//   1. Редактор крутил голову вдвое дальше, чем игра. Предел жил в трёх
//      местах порознь (автоповорот, именованные позы, ползунок студии), и
//      внешность правили на ракурсах, которых в игре не бывает.
//   2. На контуре черепа был ИЗЛОМ — в стыке двух кривых не совпадали
//      касательные. При анфасе 4° и читался скулой, на полном повороте 32°
//      и читался отрубленным затылком.
//   3. Слои кожи обрезались КОПИЕЙ контура, застывшей на моменте сборки, а
//      переход в шею — вписанным эллипсом. Повёрнутый череп асимметричен, и
//      из-под него светил туман за силуэтом.
//   4. Уши лежали одной группой ПОД головой — всегда. Ближнее ухо на
//      развороте обязано выходить вперёд, иначе голова читается вывернутой.
//   5. Бровь шире глаза, а к контуру прижимался только глаз: наружный конец
//      брови выезжал за голову.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-head-look.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/head-look-';
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
  await page.evaluate(() => window.MainWormHandle.setOptions({ wander: false, idleWave: false, blink: false }));

  // ---------- 1. ПРЕДЕЛ ПОВОРОТА ОДИН ----------
  say('');
  say('======== ГОЛОВА НЕ ВЫВОРАЧИВАЕТСЯ ДАЛЬШЕ, ЧЕМ В ИГРЕ ========');
  const lim = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    const L = h.getHeadPose().limit;
    const мера = async (v) => {
      h.setHeadPose(v, { instant: true });
      await new Promise(r => setTimeout(r, 250));
      // Чем меряем поворот: насколько разъехались глаза по экрану. Величина
      // видимая, а не внутренняя, — внутреннюю можно зажать и не нарисовать.
      const a = WormParts.client(h, 'eye-left'), b = WormParts.client(h, 'eye-right');
      return { span: +Math.abs(a.x - b.x).toFixed(1), yaw: h.getHeadPose().current };
    };
    const наПределе = await мера(L);
    const заПределом = await мера(1.5);
    const позаЛево = (h.getHeadPose().poses || {}).left;
    h.setHeadPose(0, { instant: true });
    await new Promise(r => setTimeout(r, 200));
    return { L, наПределе, заПределом, позаЛево };
  });
  say(`  предел ${lim.L}; на пределе разлёт глаз ${lim.наПределе.span}, за пределом ${lim.заПределом.span}`);
  check(lim.L > 0 && lim.L <= 0.75, `предел объявлен и он не «до упора»: ${lim.L}`);
  check(Math.abs(lim.заПределом.yaw) <= lim.L + 1e-6,
        `просьба вывернуть дальше зажата: ${lim.заПределом.yaw}`);
  check(Math.abs(lim.заПределом.span - lim.наПределе.span) < 1.5,
        'и на экране от этого ничего не меняется — дальше голова не идёт');
  check(Math.abs(lim.позаЛево) <= lim.L + 1e-6,
        `именованная поза тоже внутри предела: ${lim.позаЛево}`);

  // Ползунок студии обязан брать предел У РЕНДЕРЕРА: два предела разъедутся.
  const slider = await page.evaluate(async () => {
    DebugMode.toggle(); WormStudio.open();
    await new Promise(r => setTimeout(r, 900));
    const r = document.querySelector('[data-in="yaw"]');
    const L = WormStudio.handle.getHeadPose().limit;
    const res = { min: +r.min, max: +r.max, L };
    WormStudio.close();
    await new Promise(r2 => setTimeout(r2, 300));
    return res;
  });
  say(`  ползунок студии от ${slider.min} до ${slider.max} при пределе ${slider.L}`);
  check(Math.abs(slider.max - slider.L) < 1e-6 && Math.abs(slider.min + slider.L) < 1e-6,
        'ползунок студии ходит ровно до предела игры, не дальше');

  // ---------- 2. КОНТУР БЕЗ ИЗЛОМА ----------
  // Спрашиваем САМ контур: угол между входящей и исходящей касательной в
  // стыке кривых. Проверка «лишь бы путь строился» этого не видит вовсе.
  say('');
  say('======== НА КОНТУРЕ ЧЕРЕПА НЕТ ИЗЛОМА ========');
  const kink = await page.evaluate(() => {
    const ang = (dx, dy) => Math.atan2(dy, dx) * 180 / Math.PI;
    const пик = [];
    [0, 0.25, 0.5].forEach(yaw => {
      [1, -1].forEach(side => {
        const h = WormSilhouette.skullHalf(null, yaw, side);
        let prev = [0, -1];
        for (let i = 1; i < h.length; i++) {
          const p = h[i - 1], s = h[i];
          const inD = [(p.p[0] - p.c2[0]), (p.p[1] - p.c2[1])];
          const outD = [(s.c1[0] - p.p[0]), (s.c1[1] - p.p[1])];
          let d = ang(outD[0], outD[1]) - ang(inD[0], inD[1]);
          while (d > 180) d -= 360; while (d < -180) d += 360;
          пик.push({ yaw, side, стык: i, излом: +Math.abs(d).toFixed(1) });
        }
        prev = null;
      });
    });
    return пик;
  });
  const cheek = kink.filter(k => k.стык === 1);
  const muzzle = kink.filter(k => k.стык === 2);
  say(`  стык у скулы: до ${Math.max(...cheek.map(k => k.излом))}°, ` +
      `стык у края морды: до ${Math.max(...muzzle.map(k => k.излом))}°`);
  check(Math.max(...cheek.map(k => k.излом)) < 1,
        'касательные в стыке у скулы совпадают при ЛЮБОМ ракурсе — угла нет');
  // Край морды — угол НАМЕРЕННЫЙ: там морда отходит от челюсти. Но он обязан
  // быть одинаковым на всех ракурсах, иначе это уже не форма, а перекос.
  const mzSpread = Math.max(...muzzle.map(k => k.излом)) - Math.min(...muzzle.map(k => k.излом));
  check(mzSpread < 6, `а угол у края морды один и тот же при любом повороте: разброс ${mzSpread.toFixed(1)}°`);

  // ---------- 3. НИЧТО НЕ КРАСИТ ЗА СИЛУЭТОМ ----------
  say('');
  say('======== ЗА КОНТУР ГОЛОВЫ НИЧЕГО НЕ ВЫЛЕЗАЕТ ========');
  // Разрешено ровно двум: ушам (они и должны торчать) и самому контуру —
  // его обводка по определению лежит на кромке.
  const ЗАКОННЫЕ = ['ears', 'ears-front', 'worm-part-shape'];
  for (const yaw of [0, 0.5, -0.5]) {
    const leak = await page.evaluate(async (yaw) => {
      const h = window.MainWormHandle;
      h.setHeadPose(yaw, { instant: true });
      await new Promise(r => setTimeout(r, 300));
      const root = h.svgRoot.querySelector('.worm-root');
      const tilt = root.querySelector('[data-part="head-tilt"]');
      const skull = [...tilt.children].find(c => c.tagName === 'path');
      const svg = h.svgRoot, bb = tilt.getBoundingClientRect();
      const счёт = {};
      // Экран → местные координаты черепа через WormParts.localIn: он считает
      // ОТНОШЕНИЕМ двух CTM, и множитель css-масштаба холста сокращается.
      // Один голый getScreenCTM врёт на айфоне (учитывает ли он трансформацию
      // предка — вопрос браузера), и прогон обвинил бы игру за свой же замер.
      for (let y = bb.top - 16; y < bb.bottom + 16; y += 2) {
        for (let x = bb.left - 24; x < bb.right + 24; x += 2) {
          const loc = WormParts.localIn(h, skull, x, y);
          if (!loc) continue;
          const q = svg.createSVGPoint(); q.x = loc.x; q.y = loc.y;
          if (skull.isPointInFill(q)) continue;
          document.elementsFromPoint(x, y).forEach(el => {
            if (!tilt.contains(el)) return;
            let c = el; while (c.parentNode && c.parentNode !== tilt) c = c.parentNode;
            if (c.parentNode !== tilt) return;
            const имя = c.getAttribute('data-part') || c.getAttribute('class') || c.tagName;
            счёт[имя] = (счёт[имя] || 0) + 1;
          });
        }
      }
      return счёт;
    }, yaw);
    const чужие = Object.keys(leak).filter(k => ЗАКОННЫЕ.indexOf(k) < 0);
    check(чужие.length === 0,
          `ракурс ${yaw}: за силуэтом ${чужие.length ? 'красят ' + чужие.map(k => `${k} (${leak[k]})`).join(', ')
                                                    : 'только уши и сама обводка'}`);
  }

  // ---------- 3б. ГАБАРИТ ГОЛОВЫ НЕ РАЗДУВАЕТСЯ ----------
  // Клип прячет вылезшее ВИЗУАЛЬНО, но `getBoundingClientRect` в Chromium
  // обрезку НЕ учитывает: элемент, улетевший за экран, остаётся в габарите
  // головы. А по габариту головы считает половина игры — посадка шляпы,
  // кастрюля кухни, раскладка ванной.
  //
  // Ровно так и вышло: блик поехал за ракурсом, но `yawProject` отдаёт x в
  // ПИКСЕЛЯХ, а его умножили на радиус ещё раз. На экране не изменилось
  // ничего (клип прятал), зато габарит головы вырос в шестнадцать раз — и
  // сломалась посадка шляпы, в другом прогоне и в другом файле.
  say('');
  say('======== ГАБАРИТ ГОЛОВЫ ЧЕСТНЫЙ ========');
  const box = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    const L = h.getHeadPose().limit;
    const ряд = [];
    for (const yaw of [0, L, -L]) {
      h.setHeadPose(yaw, { instant: true });
      await new Promise(r => setTimeout(r, 300));
      const root = h.svgRoot.querySelector('.worm-root');
      const tilt = root.querySelector('[data-part="head-tilt"]');
      const skull = [...tilt.children].find(c => c.tagName === 'path');
      const head = root.querySelector('[data-part="head"]');
      ряд.push({ yaw: +yaw.toFixed(2),
                 голова: +head.getBoundingClientRect().width.toFixed(1),
                 череп: +skull.getBoundingClientRect().width.toFixed(1) });
    }
    h.setHeadPose(0, { instant: true });
    return ряд;
  });
  for (const r of box) {
    // С ушами голова шире черепа примерно вдвое — больше не бывает.
    check(r.голова < r.череп * 2.4,
          `ракурс ${r.yaw}: голова ${r.голова} при черепе ${r.череп} — ничто не улетело за экран`);
  }

  // ---------- 4. БЛИЖНЕЕ УХО ВЫХОДИТ ВПЕРЁД ----------
  // Первая версия решала это ЗНАКОМ ракурса и ошиблась стороной: вперёд
  // выходило ДАЛЬНЕЕ ухо. «Голова повернулась вправо» и «правое ухо ближе»
  // — разные утверждения: нос уезжает вправо, а к зрителю разворачивается
  // ЛЕВАЯ щека.
  //
  // Поэтому проверка не повторяет за кодом «при плюсе — правое». Она
  // спрашивает КАРТИНКУ, с какой стороны головы видно больше, и требует,
  // чтобы спереди оказалось ухо ИМЕННО ОТТУДА. Перепутать сторону так
  // нельзя: обе величины меряются на экране, и обе — следствия, а не
  // договорённости.
  say('');
  say('======== ВПЕРЁД ВЫХОДИТ УХО С ВИДИМОЙ СТОРОНЫ ========');
  const ears = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    const L = h.getHeadPose().limit;
    const снять = async (v) => {
      h.setHeadPose(v, { instant: true });
      await new Promise(r => setTimeout(r, 320));
      const root = h.svgRoot.querySelector('.worm-root');
      const tilt = root.querySelector('[data-part="head-tilt"]');
      const дети = [...tilt.children];
      const скулаI = дети.findIndex(c => c.tagName === 'path');
      const sb = дети[скулаI].getBoundingClientRect();
      const sn = root.querySelector('[data-part="snout"]').getBoundingClientRect();
      const нос = sn.x + sn.width / 2;
      const где = {}, ширина = {};
      ['left', 'right'].forEach(side => {
        const g = root.querySelector(`[data-part="ear-${side}"]`);
        let c = g; while (c.parentNode !== tilt) c = c.parentNode;
        где[side] = дети.indexOf(c) > скулаI ? 'перед' : 'за';
        ширина[side] = +g.getBoundingClientRect().width.toFixed(1);
      });
      return {
        где, ширина,
        // Сколько головы видно по каждую сторону от пятачка. Больше —
        // значит эта щека развёрнута к зрителю.
        щека: { left: +(нос - sb.left).toFixed(1), right: +(sb.right - нос).toFixed(1) }
      };
    };
    const анфас = await снять(0);
    const вправо = await снять(L);
    const влево = await снять(-L);
    h.setHeadPose(0, { instant: true });
    return { анфас, вправо, влево, L };
  });
  check(ears.анфас.где.left === 'за' && ears.анфас.где.right === 'за',
        'при анфасе оба уха за головой — их корни и правда за черепом');
  [['вправо', ears.вправо], ['влево', ears.влево]].forEach(([имя, r]) => {
    const видно = r.щека.left > r.щека.right ? 'left' : 'right';
    const дальний = видно === 'left' ? 'right' : 'left';
    say(`  ${имя}: щека слева ${r.щека.left}, справа ${r.щека.right}; ` +
        `ухо left ${r.где.left} (${r.ширина.left}), right ${r.где.right} (${r.ширина.right})`);
    check(r.где[видно] === 'перед' && r.где[дальний] === 'за',
          `${имя}: вперёд вышло ухо с той стороны, где видно больше головы (${видно})`);
    check(r.ширина[видно] > r.ширина[дальний] * 1.3,
          `${имя}: и это действительно ближнее ухо — оно развёрнуто к зрителю, а дальнее стоит ребром`);
  });

  // ---------- 5. БРОВЬ ОСТАЁТСЯ НА ГОЛОВЕ ----------
  say('');
  say('======== БРОВЬ НЕ ВЫЕЗЖАЕТ ЗА ГОЛОВУ ========');
  const brow = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    const L = h.getHeadPose().limit;
    const плохо = [];
    for (const yaw of [0, L * 0.5, L, -L * 0.5, -L]) {
      h.setHeadPose(yaw, { instant: true });
      await new Promise(r => setTimeout(r, 260));
      const root = h.svgRoot.querySelector('.worm-root');
      const tilt = root.querySelector('[data-part="head-tilt"]');
      const skull = [...tilt.children].find(c => c.tagName === 'path');
      ['left', 'right'].forEach(side => {
        const br = root.querySelector(`[data-part="brow-${side}"]`);
        if (!br) return;
        // Спрашиваем сам КОНТУР БРОВИ и сам КОНТУР ЧЕРЕПА, а не габариты:
        // габарит черепа шире его самого везде, кроме одной высоты, и
        // проверка по нему зелена почти всегда. Щетинки в расчёт не берём —
        // они нарочно торчат за кромку брови.
        const shape = br.querySelector('path');
        if (!shape) return;
        const L2 = shape.getTotalLength();
        // Матрица «бровь → череп» как ОТНОШЕНИЕ двух CTM: общий множитель
        // холста в нём сокращается, и замер не зависит от того, учитывает
        // браузер трансформацию предка или нет.
        const B = skull.getScreenCTM().inverse().multiply(shape.getScreenCTM());
        let вне = 0;
        for (let i = 0; i < 40; i++) {
          const q = shape.getPointAtLength(L2 * i / 40);
          const loc = q.matrixTransform(B);
          const t = h.svgRoot.createSVGPoint(); t.x = loc.x; t.y = loc.y;
          if (!skull.isPointInFill(t)) вне++;
        }
        if (вне > 1) плохо.push(`${side} при ${yaw.toFixed(2)}: ${вне} из 40 точек брови вне головы`);
      });
    }
    h.setHeadPose(0, { instant: true });
    return плохо;
  });
  check(brow.length === 0,
        brow.length ? brow.slice(0, 4).join(' · ') : 'оба конца обеих бровей внутри черепа при всех ракурсах');

  // ---------- 6. РУЧКИ БРОВЕЙ ДВИГАЮТ БРОВЬ ----------
  // Ползунок «брови» был привязан к настроению, то есть к изгибу РТА, и не
  // делал ровным счётом ничего. Проверяется ГЕОМЕТРИЯ, а не число в реестре.
  say('');
  say('======== КАЖДАЯ РУЧКА БРОВЕЙ ЧТО-ТО ДЕЛАЕТ ========');
  const knobs = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    const снимок = () => {
      const br = document.querySelector('.worm-root [data-part="brow-left"]');
      const r = br.getBoundingClientRect();
      return { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    const ряд = [];
    for (const k of ['browAngle', 'browLift', 'browArc', 'browThick']) {
      WormLook.reset(h); WormLook.flush();
      await new Promise(r => setTimeout(r, 220));
      const было = снимок();
      WormLook.apply(h, { [k]: 0.8 }, { absolute: true }); WormLook.flush();
      await new Promise(r => setTimeout(r, 260));
      const стало = снимок();
      const d = Math.max(Math.abs(стало.x - было.x), Math.abs(стало.y - было.y),
                         Math.abs(стало.w - было.w), Math.abs(стало.h - было.h));
      ряд.push({ k, сдвиг: +d.toFixed(1), есть: !!WormLook.knob(k) });
    }
    WormLook.reset(h); WormLook.flush();
    await new Promise(r => setTimeout(r, 250));
    return ряд;
  });
  knobs.forEach(r => check(r.есть && r.сдвиг > 0.8,
        `${r.k}: бровь сдвинулась на ${r.сдвиг} точек`));

  // ---------- ПЕРСОНАЖ ЦЕЛ ----------
  const alive = await page.evaluate(() => {
    const root = document.querySelector('.worm-root');
    let nan = 0;
    root.querySelectorAll('*').forEach(el => {
      for (const a of el.attributes) if (a.value.indexOf('NaN') >= 0) nan++;
    });
    return { nodes: root.querySelectorAll('*').length, nan };
  });
  check(alive.nodes > 400 && alive.nan === 0, `персонаж цел: ${alive.nodes} узлов, NaN ${alive.nan}`);
  await page.screenshot({ path: out + 'head.png' });

  if (errors.length) { say('\nОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n')); bad += errors.length; }
  say('\n' + (bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ СОШЛОСЬ'));
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
