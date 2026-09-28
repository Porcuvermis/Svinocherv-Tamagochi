const { chromium } = require('playwright');
const harness = require('./harness');

// ================= ПРОВЕРКА: ЛЕСТНИЦА МЫЛА =================
// Девять ступеней вида мыла (src/minigames/lust/bath-soap.js, замысел —
// docs/plan/21-lust-bath.md, разд. 5в). Верхняя — волшебный флакон с
// собственным покадровым циклом и небом, которое едет от наклона телефона.
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Каждая ступень рисуется на полке и на иконке магазина без ошибок и
//      с разумным габаритом. Лестница из девяти картинок, до которых игрок
//      доберётся через месяцы, — ровно то, что ломается молча
//      (docs/traps.md, пп. 12а и 128).
//   2. Холст полки становится слоем композитора ТОЛЬКО пока на нём живой
//      флакон: слой, державшийся всегда, давал на айфоне чёрное моргание
//      (п. 152). Под открытым магазином полка не анимирует (п. 68), при
//      закрытии ванной цикл встаёт.
//   3. Во время переезда камеры и в режиме «мыло замерло» флакон не
//      трогается (пп. 150 и 152).
//   4. Небо получает картинку (её печёт Worker; без картинки флакон пуст).
//   5. СТОРОНА сдвига неба от наклона — а не «лишь бы менялось»: проверка
//      на размах зелена при любом знаке (п. 116). Дальний слой сдвигается
//      сильнее ближнего — иначе глубины нет.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-soap.js /tmp/soap-
(async () => {
  const out = process.argv[2] || '/tmp/soap-';
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
  await page.evaluate(() => { GameManager.handleSinAction('lust'); });
  await page.waitForTimeout(1000);

  const setTier = (n) => page.evaluate((n) => {
    LustDebug.setLevel('soap', n); BATH_SOAP.refresh();
  }, n);
  const liveLayers = () => page.evaluate(() => ['bt-shelf', 'bt-hand']
    .filter(id => document.getElementById(id).classList.contains('bt-live')));

  // ================= 1. КАЖДАЯ СТУПЕНЬ НА ПОЛКЕ И В МАГАЗИНЕ =================
  say('\n======== ДЕВЯТЬ СТУПЕНЕЙ: ПОЛКА И ИКОНКА ========');
  const tiers = await page.evaluate(() => BATH_SOAP.TIERS.length);
  // Что НЕ тело предмета: помеченное в рисунке .bs-over (ореол свечения,
  // волос, свисающий с обмылка), небо внутри флакона (обрезано полостью, но
  // getBBox обрезки не знает) и убранство вокруг. Всё это выходит за
  // предмет намеренно, box() описывает сам предмет.
  const NOT_BODY = '.bs-over, [clip-path], .bsm-aura, .bsm-rays1, .bsm-rays2, .bsm-caus, .bsm-motes-f, .bsm-motes-b, .bsm-dust, .bsm-glint';
  for (let n = 0; n < tiers; n++) {
    await setTier(n);
    await page.waitForTimeout(150);
    // Габарит нарисованного против объявленного box(): по box иконка
    // ужимает вещь под клетку, и разойдись они — вещь вылезет из клетки.
    // Меряется предмет БЕЗ полочных добавок (сопля обмылка, мыльница) —
    // в таком виде он идёт в руку и на иконку.
    const r = await page.evaluate(([n, NOT_BODY]) => {
      const shelf = document.getElementById('bt-soap-art');
      const nodes = shelf.querySelectorAll('*').length;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      shelf.parentNode.appendChild(g);
      g.innerHTML = BATH_SOAP.draw(n);
      g.querySelectorAll(NOT_BODY).forEach(el => el.setAttribute('display', 'none'));
      const b = g.getBBox();
      g.remove();
      BATH_SOAP.live.dirty = true;
      return { kind: BATH_SOAP.TIERS[n], nodes, b: { x: b.x, y: b.y, w: b.width, h: b.height }, d: BATH_SOAP.box(n) };
    }, [n, NOT_BODY]);
    const cx = r.b.x + r.b.w / 2, cy = r.b.y + r.b.h / 2;
    const dx = r.d.x + r.d.w / 2, dy = r.d.y + r.d.h / 2;
    const off = Math.hypot(cx - dx, cy - dy);
    const fill = Math.max(r.b.w / r.d.w, r.b.h / r.d.h);
    check(r.nodes > 3 && off < 0.12 * Math.max(r.d.w, r.d.h) && fill > 0.8 && fill < 1.15,
          `${n} ${r.kind}: на полке, центр предмета в ${off.toFixed(0)} ед. от объявленного, заполняет ${(fill * 100).toFixed(0)}% габарита`);
  }

  // Иконка — СЛЕДУЮЩАЯ ступень; клетка 68×68, предмет ужат до 56.
  for (let n = 0; n < tiers - 1; n++) {
    await setTier(n);
    const r = await page.evaluate((NOT_BODY) => {
      LustShop.show();
      const row = document.querySelector('.ls-row[data-key="soap"]');
      const svg = row && row.querySelector('svg');
      const g = svg && svg.querySelector('g');
      if (!g) { LustShop.close(); return null; }
      // Тело предмета — как на полке.
      const hide = g.querySelectorAll(NOT_BODY);
      hide.forEach(el => el.style.display = 'none');
      const a = g.getBoundingClientRect(), s = svg.getBoundingClientRect();
      hide.forEach(el => el.style.display = '');
      LustShop.close();
      return { a: { x: a.x, y: a.y, w: a.width, h: a.height }, s: { x: s.x, y: s.y, w: s.width, h: s.height } };
    }, NOT_BODY);
    if (!r) { check(false, `иконка ступени ${n + 1} есть в магазине`); continue; }
    const pad = 0.08 * r.s.w;
    const inside = r.a.x >= r.s.x - pad && r.a.y >= r.s.y - pad
                && r.a.x + r.a.w <= r.s.x + r.s.w + pad && r.a.y + r.a.h <= r.s.y + r.s.h + pad;
    const big = Math.max(r.a.w, r.a.h) / r.s.w;
    check(inside && big > 0.5, `иконка ступени ${n + 1} в клетке и не мелкая (${(big * 100).toFixed(0)}% клетки)`);
  }

  // ================= 2. СЛОЙ КОМПОЗИТОРА — ТОЛЬКО ПОКА ЖИВЁТ =================
  say('\n======== СЛОЙ КОМПОЗИТОРА: ТОЛЬКО С ЖИВЫМ ФЛАКОНОМ ========');
  await setTier(0);
  await page.waitForTimeout(300);
  check((await liveLayers()).length === 0, 'на нулевой ступени слоёв нет');
  await setTier(tiers - 1);
  await page.waitForTimeout(400);
  check((await liveLayers()).join() === 'bt-shelf', `флакон на полке — слоем только полка (${(await liveLayers()).join() || 'ничего'})`);
  await page.screenshot({ path: out + '1-shelf.png' });

  // Под магазином полку не видно — и анимировать её незачем. На верхней
  // ступени строки мыла в магазине нет, живых флаконов под ним не остаётся.
  await page.evaluate(() => LustShop.show());
  await page.waitForTimeout(300);
  const underShop = await page.evaluate(() => {
    const t = document.querySelector('#bt-soap-home .bsm-far');
    const a = t && t.getAttribute('transform');
    return new Promise(res => setTimeout(() => res({ same: a === (t && t.getAttribute('transform')) }), 400));
  });
  check(underShop.same, 'под открытым магазином флакон на полке стоит');
  check((await liveLayers()).length === 0, 'и слой полки снят');
  await page.evaluate(() => LustShop.close());
  await page.waitForTimeout(300);

  // ================= 3. ЗАМЕР И ПЕРЕЕЗД КАМЕРЫ =================
  say('\n======== ФЛАКОН СТОИТ: ЗАМЕР И ПЕРЕЕЗД КАМЕРЫ ========');
  const stillWhile = (arm, disarm) => page.evaluate(([arm, disarm]) => {
    const t = document.querySelector('#bt-soap-home .bsm-stop, #bt-soap-home .bsm-far');
    new Function(arm)();
    return new Promise(res => setTimeout(() => {
      const a = t.getAttribute('transform');
      setTimeout(() => {
        const b = t.getAttribute('transform');
        new Function(disarm)();
        res(a === b);
      }, 400);
    }, 100));
  }, [arm, disarm]);
  check(await stillWhile('BATH_SOAP.frozen = true', 'BATH_SOAP.frozen = false'), '«мыло замерло» — флакон не меняется');
  check(await stillWhile('window.__ct = LustMinigame.camTimer; LustMinigame.camTimer = 1',
                         'LustMinigame.camTimer = window.__ct'), 'на переезде камеры флакон не меняется');

  // ================= 4. НЕБО ПОЛУЧИЛО КАРТИНКУ =================
  const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('#bt-soap-home .bsm-tf, #bt-soap-home .bsm-tn'))
    .map(el => el.getAttribute('href') || ''));
  check(hrefs.length >= 2 && hrefs.every(h => h.startsWith('blob:') || h.startsWith('data:')),
        `небо во флаконе с картинкой (${hrefs.length} слоя)`);

  // ================= 5. СТОРОНА СДВИГА НЕБА =================
  // Наклон подменяется на входе (Tilt.lean), смотрится КАРТИНКА: куда
  // уехал дальний слой на экране. Знак записан один раз здесь; сменится
  // он в коде — прогон покраснеет, а не промолчит.
  say('\n======== НАКЛОН: В КАКУЮ СТОРОНУ ЕДЕТ НЕБО ========');
  const skyAt = async (x, y) => {
    await page.evaluate(([x, y]) => { window.__lean = { live: true, x, y }; Tilt.__orig = Tilt.__orig || Tilt.lean; Tilt.lean = () => window.__lean; }, [x, y]);
    await page.waitForTimeout(900);
    return page.evaluate(() => {
      const r = (s) => { const b = document.querySelector('#bt-soap-home ' + s).getBoundingClientRect(); return { x: b.x, y: b.y }; };
      return { far: r('.bsm-tf'), near: r('.bsm-tn') };
    });
  };
  const L = await skyAt(-0.3, 0), R = await skyAt(0.3, 0);
  const U = await skyAt(0, -0.3), D = await skyAt(0, 0.3);
  await page.evaluate(() => { if (Tilt.__orig) Tilt.lean = Tilt.__orig; });
  const fx = R.far.x - L.far.x, nx = R.near.x - L.near.x;
  const fy = D.far.y - U.far.y, ny = D.near.y - U.near.y;
  check(fx < -2, `наклон вправо (правый край вниз) — небо уезжает ВЛЕВО (${fx.toFixed(1)} px)`);
  check(fy < -2, `верх телефона к себе — небо уезжает ВВЕРХ (${fy.toFixed(1)} px)`);
  check(Math.abs(fx) > Math.abs(nx) * 1.5 && Math.abs(fy) > Math.abs(ny) * 1.5,
        `дальний слой едет сильнее ближнего (${Math.abs(fx).toFixed(1)} против ${Math.abs(nx).toFixed(1)})`);

  // ================= 6. ФЛАКОН ДЕРЖАТ ЗА ГОРЛЫШКО =================
  // Пузо флакона — окно в небо; палец посреди него закрывал бы то, ради
  // чего ступень покупали. Палец берёт воротник прямо на полке, в руке
  // воротник остаётся под пальцем, а мылит ПУЗО — ниже пальца.
  say('\n======== ФЛАКОН ЗА ГОРЛЫШКО, МЫЛИТ ПУЗО ========');
  await page.evaluate(() => { LustDebug.setLevel('soap', BATH_SOAP.TIERS.length - 1); BATH_SOAP.refresh(); LustMinigame.startWater(); });
  for (let i = 0; i < 40 && await page.evaluate(() => LustMinigame.phase) !== 'soap'; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(1200);
  const toC = (x, y) => page.evaluate(([x, y]) => { const L = LustMinigame, c = L.cam;
    return SvgSpace.toClient(L.svgEl, c.tx + c.s * x, c.ty + c.s * y); }, [x, y]);
  const g0 = await page.evaluate(() => BATH_SOAP.grip());
  const gc = await toC(g0.x, g0.y);
  await page.evaluate(() => { const L = LustMinigame, o = L.paint; window.__paint = [];
    L.paint = function (x, y, ...r) { window.__paint.push({ x, y }); return o.call(this, x, y, ...r); }; });
  await page.mouse.move(gc.x, gc.y); await page.mouse.down();
  const took = await page.evaluate(() => !!(LustMinigame.drag && LustMinigame.drag.kind === 'soap'));
  check(took, 'флакон взят с полки за горлышко');
  const cb = await page.evaluate(() => LustMinigame.coverBox());
  const tg = await toC(cb.x + cb.w * 0.5, cb.y + cb.h * 0.25);
  for (let i = 1; i <= 12; i++) { await page.mouse.move(gc.x + (tg.x - gc.x) * i / 12, gc.y + (tg.y - gc.y) * i / 12); await page.waitForTimeout(30); }
  await page.waitForTimeout(300);
  const hold = await page.evaluate(() => {
    const s = document.querySelector('#bt-held .bsm-stopper').getBoundingClientRect();
    return { stopBottom: s.y + s.height, stopX: s.x + s.width / 2, paint: window.__paint.slice(-1)[0] };
  });
  const fin = await page.evaluate(([x, y]) => LustMinigame.toScene({ clientX: x, clientY: y }), [tg.x, tg.y]);
  await page.mouse.up();
  await page.evaluate(() => { delete LustMinigame.paint; });
  const below = hold.stopBottom < tg.y && tg.y - hold.stopBottom < 60 && Math.abs(hold.stopX - tg.x) < 12;
  check(below, `в руке палец под самой пробкой — на воротнике (${(tg.y - hold.stopBottom).toFixed(0)} px ниже пробки)`);
  const dy = hold.paint ? hold.paint.y - fin.y : 0;
  check(hold.paint && dy > 40 && Math.abs(hold.paint.x - fin.x) < 2, `мылит пузо, ниже пальца на ${dy.toFixed(0)} ед. сцены`);

  // ================= 7. ЗАКРЫЛИ ВАННУЮ — ЦИКЛ ВСТАЛ =================
  await page.evaluate(() => LustMinigame.close());
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ raf: BATH_SOAP.live.raf,
    layers: ['bt-shelf', 'bt-hand'].filter(id => document.getElementById(id).classList.contains('bt-live')) }));
  check(!after.raf && !after.layers.length, 'ванная закрыта — цикл стоит и слоёв нет');

  say('');
  errors.forEach(e => say('  ' + e));
  check(!errors.length, `ошибок на странице нет (${errors.length})`);
  say(bad ? `\n✗ провалов: ${bad}` : '\n✓ всё зелёное');
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
