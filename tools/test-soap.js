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

  // ================= 6. ЭТАП НАЧАЛСЯ — ВЕЩЬ САМА ВЗЛЕТАЕТ С ПОЛКИ =================
  // Подсказка «бери меня» — движением, без слов: нужная вещь поднимается
  // над полкой, парит вверх-вниз и светится. Под пальцем не парит и не
  // светится; оставленная где угодно — снова парит (просьба игрока).
  say('\n======== ЭТАП НАЧАЛСЯ — ФЛАКОН ВЗЛЕТЕЛ И ПАРИТ ========');
  await page.evaluate(() => { LustDebug.setLevel('soap', BATH_SOAP.TIERS.length - 1); BATH_SOAP.refresh(); LustMinigame.startWater(); });
  for (let i = 0; i < 40 && await page.evaluate(() => LustMinigame.phase) !== 'soap'; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(1200);
  const collarAt = (sel) => page.evaluate((sel) => {
    // Воротник, а не пробка: пробка левитирует сама, и замер ловил её фазу.
    const r = document.querySelector(sel + ' .bsm-collar').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height };
  }, sel);
  const floatState = () => page.evaluate(() => {
    const h = document.getElementById('bt-hand'), aura = document.querySelector('#bt-held .bsm-aura');
    return { float: h.classList.contains('bt-float'), filter: getComputedStyle(h).filter,
             aura: !!aura && aura.getAttribute('display') !== 'none',
             home: document.getElementById('bt-soap-home').style.opacity, loose: !!LustMinigame.loose };
  });
  const up = await floatState();
  const shelfC = await collarAt('#bt-soap-home'), airC = await collarAt('#bt-held');
  check(up.loose && up.home === '0' && airC.y < shelfC.y - 5,
        `флакон снят с полки и висит над ней (выше на ${(shelfC.y - airC.y).toFixed(0)} px)`);
  check(up.float, 'парит');
  check(up.aura && (up.filter === 'none' || !up.filter), 'светится своим сиянием — без тени поверх живого холста');
  // Качание — ВВЕРХ от места, где вещь висит, и заметное глазу.
  const bobs = [];
  for (let i = 0; i < 14; i++) { bobs.push(await page.evaluate(() => LustMinigame.bobY())); await page.waitForTimeout(110); }
  check(Math.min(...bobs) < -3 && Math.max(...bobs) <= 0.01,
        `качается вверх-вниз над своим местом (${Math.min(...bobs).toFixed(1)}…${Math.max(...bobs).toFixed(1)} ед.)`);

  // ================= 7. ПРЕДМЕТ ДЕРЖАТ ТАМ, ГДЕ ВЗЯЛИ =================
  // Пузо флакона — окно в небо. Взял за горлышко — палец остаётся на
  // горлышке: предмет не прыгает серединой под палец (замечание игрока,
  // первая попытка — хват всегда за воротник — прыгала, если взять за
  // пузо). Мерится КАРТИНКА: воротник до хвата и после. Мылит при этом
  // сам предмет, а не палец.
  say('\n======== ДЕРЖИТСЯ ТЕМ МЕСТОМ, ЗА КОТОРОЕ ВЗЯЛИ ========');
  const toC = (x, y) => page.evaluate(([x, y]) => { const L = LustMinigame, c = L.cam;
    return SvgSpace.toClient(L.svgEl, c.tx + c.s * x, c.ty + c.s * y); }, [x, y]);
  // Точка рисунка → экран, пока вещь висит в воздухе (loose).
  const airC2 = (x, y) => page.evaluate(([x, y]) => { const L = LustMinigame, o = L.loose;
    return SvgSpace.toClient(L.svgEl, o.pos.x + (x - o.at.x) * o.k, o.pos.y + (y - o.at.y) * o.k); }, [x, y]);
  // Где мылит — видно по точке касания, которую получает трение (soapRub).
  await page.evaluate(() => { const L = LustMinigame, o = L.soapRub; window.__paint = []; window.__paintOrig = o;
    L.soapRub = function (p, ...r) { window.__paint.push({ x: p.x, y: p.y }); return o.call(this, p, ...r); }; });
  // Горлышко и пузо — точки на рисунке полки, из того же конфига.
  const spots = await page.evaluate(() => {
    const A = BATH_ART.slots().soap, M = BATH_SOAP.MAGIC, y0 = A.y + 2 + M.FLOOR * (1 - M.SCALE);
    return { 'горлышко': { x: A.x, y: y0 + M.SCALE * (M.NECK.collar[0] + M.NECK.collar[1]) / 2 },
             'пузо': { x: A.x + 6, y: y0 + M.SCALE * M.CY } };
  });
  // Холст руки качается — на время замера он стоит (п. 137): мерится хват,
  // а не фаза качания. Флакон не замораживается: воротник у него не
  // шевелится, а убранство обязано успеть погаснуть и загореться.
  const still = (on) => page.evaluate((on) => {
    document.getElementById('bt-hand').style.animation = on ? 'none' : ''; }, on);
  await still(true);
  for (const [name, sp] of Object.entries(spots)) {
    if (!(await page.evaluate(() => !!LustMinigame.loose))) {
      await page.evaluate(() => LustMinigame.liftTool('soap'));
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(200);
    const f = await airC2(sp.x, sp.y);
    const s0 = await collarAt('#bt-held');
    await page.mouse.move(f.x, f.y); await page.mouse.down();
    await page.waitForTimeout(100);
    const s1 = await collarAt('#bt-held');
    const jump = Math.hypot(s1.x - s0.x, s1.y - s0.y);
    check(jump < 1.5, `взял за ${name} — предмет не прыгнул (${jump.toFixed(1)} px)`);
    const held = await floatState();
    check(!held.float && !held.aura, `под пальцем не парит и не светится`);
    if (name === 'горлышко') {
      const cb = await page.evaluate(() => LustMinigame.coverBox());
      const tg = await toC(cb.x + cb.w * 0.5, cb.y + cb.h * 0.25);
      for (let i = 1; i <= 12; i++) { await page.mouse.move(f.x + (tg.x - f.x) * i / 12, f.y + (tg.y - f.y) * i / 12); await page.waitForTimeout(30); }
      await page.waitForTimeout(200);
      const s2 = await collarAt('#bt-held');
      const kept = Math.hypot((s2.x - tg.x) - (s1.x - f.x), (s2.y - tg.y) - (s1.y - f.y));
      check(kept < 1.5, `на ходу палец остаётся на горлышке (${kept.toFixed(1)} px)`);
      const fin = await page.evaluate(([x, y]) => LustMinigame.toScene({ clientX: x, clientY: y }), [tg.x, tg.y]);
      const pt = await page.evaluate(() => window.__paint.slice(-1)[0]);
      const dy = pt ? pt.y - fin.y : 0;
      check(pt && dy > 40, `мылит пузо, ниже пальца на ${dy.toFixed(0)} ед. сцены`);

      // Отпустил посреди этапа — предмет ОСТАЁТСЯ, где отпустили, а не
      // уезжает на полку (просьба игрока). Подхватывается с того места, за
      // которое взяли снова, — тоже без прыжка.
      await page.mouse.up();
      await page.waitForTimeout(300);
      const s3 = await collarAt('#bt-held').catch(() => null);
      const left = await floatState();
      check(s3 && Math.hypot(s3.x - s2.x, s3.y - s2.y) < 1.5 && left.home === '0',
            'отпустил — флакон лежит там же, на полке его нет');
      check(left.float && left.aura, 'оставленный снова парит и светится');
      // Середина пуза — от размера самого флакона на экране: число
      // пикселей уводило точку за край при масштабе холста не единица.
      const u = await page.evaluate(() => { const M = BATH_SOAP.MAGIC, [c0, c1] = M.NECK.collar;
        return { collar: c0 - c1, belly: (c0 + c1) / 2 - M.CY }; });
      const f2 = { x: s3.x + 2, y: s3.y - s3.h / u.collar * u.belly };
      await page.mouse.move(f2.x, f2.y); await page.mouse.down();
      await page.waitForTimeout(100);
      const again = await page.evaluate(() => !!(LustMinigame.drag && LustMinigame.drag.kind === 'soap'));
      const s4 = await collarAt('#bt-held');
      check(again && Math.hypot(s4.x - s3.x, s4.y - s3.y) < 1.5, `подхватил снова за пузо — не прыгнул (${again ? Math.hypot(s4.x - s3.x, s4.y - s3.y).toFixed(1) + ' px' : 'не взял'})`);
      await page.mouse.up();
      const miss = { x: s3.x - 150, y: s3.y - 200 };
      await page.mouse.click(miss.x, miss.y);
      const idle = await page.evaluate(() => !LustMinigame.drag && !!LustMinigame.loose);
      check(idle, 'тап мимо лежащего флакона его не берёт');
      await page.evaluate(() => LustMinigame.returnTool());
      await page.waitForTimeout(200);
      const back = await page.evaluate(() => ({ held: !!document.getElementById('bt-held'),
        home: document.getElementById('bt-soap-home').style.opacity }));
      check(!back.held && back.home === '1', 'конец этапа — флакон снова на полке');
      continue;
    }
    await page.mouse.up();
  }
  await page.evaluate(() => { LustMinigame.soapRub = window.__paintOrig; });
  await still(false);

  // Мочалка — то же самое: взлетает сама, светится ТЕНЬЮ (картинка её
  // стоит — тень рисуется один раз), отпущенная лежит до конца этапа.
  // ================= 9. КОНЕЦ ЭТАПА — ДОМОЙ ПО ДУГЕ =================
  // Вещь не телепортируется на полку, а летит туда сама — по дуге, а не по
  // прямой (просьба игрока). Мерится ПУТЬ: кадр за кадром, где летящий узел.
  // Мочалка поднимается, только когда мыло село: у них один холст руки, и
  // парение со свечением мочалки досталось бы летящему мылу. Мыло на полке
  // не должно появиться, пока его копия ещё в воздухе (двойник).
  say('\n======== КОНЕЦ ЭТАПА — ДОМОЙ ПО ДУГЕ ========');
  const flight = (stage) => page.evaluate((stage) => new Promise(res => {
    const L = LustMinigame, kind = stage, out = [];
    let twin = false, glow = false;
    L.finishStage(stage);
    const t0 = performance.now();
    const tick = () => {
      const n = document.getElementById('bt-homing');
      const home = document.getElementById(`bt-${kind}-home`).style.opacity;
      if (n) {
        const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(n.getAttribute('transform') || '');
        if (m) out.push({ x: +m[1], y: +m[2] });
        if (home !== '0') twin = true;
        if (document.getElementById('bt-hand').classList.contains('bt-float')) glow = true;
      }
      if (performance.now() - t0 < 1600) requestAnimationFrame(tick);
      else res({ path: out, twin, glow, home, phase: L.phase,
                 held: !!document.getElementById('bt-held'), homing: !!document.getElementById('bt-homing') });
    };
    requestAnimationFrame(tick);
  }), stage);
  const arc = (p) => {
    if (p.length < 8) return null;
    const a = p[0], b = p[p.length - 1];
    return { frames: p.length, lift: Math.min(a.y, b.y) - Math.min(...p.map(q => q.y)), move: Math.hypot(b.x - a.x, b.y - a.y) };
  };
  if (!(await page.evaluate(() => !!LustMinigame.loose))) {
    await page.evaluate(() => LustMinigame.liftTool('soap'));
    await page.waitForTimeout(800);
  }
  const fs = await flight('soap');
  const as = arc(fs.path);
  check(as && as.move > 5, `мыло летит на полку, а не телепортируется (${as ? as.frames : 0} кадров пути)`);
  check(as && as.lift > 10, `по дуге — выше обоих концов пути на ${as ? as.lift.toFixed(0) : 0} ед.`);
  check(!fs.twin && fs.home === '1' && !fs.homing, 'на полке появляется ровно в миг приземления, двойника нет');
  check(!fs.glow, 'летит домой не паря и не светясь');
  check(fs.held && fs.phase === 'cloth', 'мыло село — и только тогда поднялась мочалка');
  const cUp = await page.evaluate(() => { const h = document.getElementById('bt-hand');
    return { loose: !!LustMinigame.loose && LustMinigame.loose.kind === 'cloth', float: h.classList.contains('bt-float'),
             filter: getComputedStyle(h).filter, home: document.getElementById('bt-cloth-home').style.opacity }; });
  check(cUp.loose && cUp.float && cUp.home === '0', 'этап мочалки — мочалка взлетела с полки и парит');
  check(/drop-shadow/.test(cUp.filter), 'и светится по контуру');
  const ca = await page.evaluate(() => { const o = LustMinigame.loose; return { x: o.at.x, y: o.at.y }; });
  const cc = await airC2(ca.x, ca.y);
  await page.mouse.move(cc.x, cc.y); await page.mouse.down();
  const cHeld = await page.evaluate(() => ({ drag: !!LustMinigame.drag && LustMinigame.drag.kind === 'cloth',
    float: document.getElementById('bt-hand').classList.contains('bt-float') }));
  check(cHeld.drag && !cHeld.float, 'взятая мочалка не парит');
  await page.mouse.move(cc.x - 120, cc.y + 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const cl = await page.evaluate(() => ({ phase: LustMinigame.phase, held: !!document.getElementById('bt-held'),
    float: document.getElementById('bt-hand').classList.contains('bt-float'),
    home: document.getElementById('bt-cloth-home').style.opacity }));
  check(cl.phase === 'cloth' && cl.held && cl.home === '0' && cl.float, 'отпущенная мочалка лежит там же и снова парит');
  const fc = await flight('cloth');
  const ac = arc(fc.path);
  check(ac && ac.move > 5 && ac.lift > 10, `конец этапа — мочалка летит на полку по дуге (выше концов на ${ac ? ac.lift.toFixed(0) : 0} ед.)`);
  check(!fc.twin && !fc.glow && fc.home === '1' && !fc.held && !fc.homing, 'и приземляется на полку без двойника, по пути не светясь');
  check(fc.phase !== 'cloth' && fc.phase !== 'return', `после приземления забег идёт дальше (фаза ${fc.phase})`);

  // ================= 10. МЫЛО — ЭТО ТРЕНИЕ, А НЕ ЗАКРАСКА =================
  // Прогресс этапа мыла копится от ДВИЖЕНИЯ пальца с мылом по телу (решение
  // игрока: закраска клеток вырождалась в поиск пикселя). Засчитывается
  // только живой палец — оставленное на черве мыло парит и ничего не
  // натирает само. Быстрее ступени не натереть: скорость ограничена.
  say('\n======== МЫЛО — ТРЕНИЕ ПАЛЬЦЕМ ПО ТЕЛУ ========');
  await page.evaluate(() => { LustMinigame.close(); LustMinigame.open();
    LustDebug.setLevel('soap', 0); BATH_SOAP.refresh(); LustMinigame.startWater(); });
  for (let i = 0; i < 40 && await page.evaluate(() => LustMinigame.phase) !== 'soap'; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(1300);
  const rubNow = () => page.evaluate(() => LustMinigame.rub);
  // Покрытие холста мытья: доля непрозрачных точек (сама картинка, а не число).
  const cover = () => page.evaluate(() => { const c = document.getElementById('bt-wash');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 8) n++; return n; });
  const bodyC = async (u, v) => page.evaluate(([u, v]) => { const L = LustMinigame, b = L.coverBox(), c = L.cam;
    return SvgSpace.toClient(L.svgEl, c.tx + c.s * (b.x + b.w * u), c.ty + c.s * (b.y + b.h * v)); }, [u, v]);
  // Берём мыло из воздуха и ведём пальцем так, чтобы пузо (точка касания)
  // шло по середине тела: хват — в гнезде, значит пузо под пальцем.
  const soapAt = await page.evaluate(() => { const L = LustMinigame, o = L.loose;
    return SvgSpace.toClient(L.svgEl, o.pos.x, o.pos.y); });
  await page.mouse.move(soapAt.x, soapAt.y); await page.mouse.down();
  const mid = await bodyC(0.42, 0.45);
  await page.mouse.move(mid.x, mid.y, { steps: 8 });
  const r0 = await rubNow();
  await page.waitForTimeout(1500);
  check(Math.abs((await rubNow()) - r0) < 1e-6, 'палец стоит на теле — прогресса нет');
  // Мимо тела: вода и плитка справа от червя.
  const off = await bodyC(1.25, 0.9), off2 = await bodyC(1.25, 0.6);
  await page.mouse.move(off.x, off.y, { steps: 6 });
  const r1 = await rubNow();
  for (let i = 0; i < 20; i++) { await page.mouse.move(i % 2 ? off.x : off2.x, i % 2 ? off.y : off2.y, { steps: 3 }); await page.waitForTimeout(30); }
  check(Math.abs((await rubNow()) - r1) < 1e-6, 'трение мимо тела не считается');
  // Трение по телу: ~2 секунды туда-сюда.
  const a = await bodyC(0.3, 0.35), b2 = await bodyC(0.6, 0.5);
  const c0 = await cover(), rA = await rubNow(), tA = Date.now();
  for (let i = 0; i < 40; i++) { const q = i % 2 ? a : b2; await page.mouse.move(q.x, q.y, { steps: 4 }); }
  const rB = await rubNow(), secB = (Date.now() - tA) / 1000, c1 = await cover();
  const rubS = await page.evaluate(() => LustMinigame.stageRub('soap'));
  check(rB > rA + 0.05, `трение по телу копит прогресс (${(rA * 100).toFixed(0)} → ${(rB * 100).toFixed(0)}%)`);
  check(rB - rA <= secB / rubS * 1.05 + 0.01,
        `не быстрее ступени: +${((rB - rA) * 100).toFixed(0)}% за ${secB.toFixed(1)} с при ${rubS} с на этап`);
  check(c1 > c0, `пена на теле растёт вместе с прогрессом (${c0} → ${c1} точек)`);
  const spot = await page.evaluate(() => document.getElementById('bt-spot').innerHTML.length);
  // Оставил мыло НА черве — оно парит там и не трёт само.
  await page.mouse.move(mid.x, mid.y, { steps: 4 });
  await page.mouse.up();
  const rC = await rubNow();
  await page.waitForTimeout(3000);
  const loose = await page.evaluate(() => !!LustMinigame.loose && document.getElementById('bt-hand').classList.contains('bt-float'));
  check(loose && Math.abs((await rubNow()) - rC) < 1e-6, 'мыло, оставленное на черве, парит и само не натирает');
  check(spot === 0 && (await page.evaluate(() => document.getElementById('bt-spot').innerHTML.length)) === 0,
        'кольца-подсказки «где не домыл» у мыла нет');

  // ================= 10а. ГЛАЗА ЧИСТЫЕ, КРАЙ МЯГКИЙ =================
  // Пены на глазах нет (просьба игрока), и сделано это как у настоящей пены:
  // пузырь с центром на глазу не рождается вовсе (лопнут), соседние целые;
  // плёнка тает С ЗАПАСОМ до глаза. Два прошлых провала стерегутся здесь же:
  // мягкое стирание всего подряд давало полупрозрачные огрызки пузырей, а
  // вырез плёнки ровно по глазу читался вырезом.
  const eyes = await page.evaluate(() => {
    const L = LustMinigame, bubbles = [], o = L.glintBubble;
    L.glintBubble = function (G, bx, by, r, pc) { bubbles.push({ x: bx, y: by, r }); return o.call(this, G, bx, by, r, pc); };
    // Растёт ПО ШАГАМ, как в игре: стирание у глаз на каждом шаге копилось,
    // и мягкий край к концу этапа становился резким кругом — «очками»
    // (замечание игрока с айфона). Одним шагом этого не видно.
    L.growReset();
    for (let i = 1; i <= 30; i++) L.growTo('soap', i / 30);
    L.glintBubble = o;
    // Плёнка — как её видит игрок: после растворения у глаз.
    // Муть — одним слоем, по пикселю на клетку карты: точка холста мытья
    // переводится в клетку.
    const Fl = L._grows.soap.film;
    const film = { getImageData: (x, y) => ({ data: [0, 0, 0, 255 * Fl.a[Math.floor(y / Fl.S) * Fl.gw + Math.floor(x / Fl.S)]] }) };
    const ring = (ctx, e, k) => { let s = 0;
      for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2;
        s += ctx.getImageData(Math.round(e.x + Math.cos(t) * e.rx * k), Math.round(e.y + Math.sin(t) * e.ry * k), 1, 1).data[3]; }
      return s / 24; };
    const wash = document.getElementById('bt-wash').getContext('2d');
    const d = (b, e) => Math.hypot((b.x - e.x) / e.rx, (b.y - e.y) / e.ry);
    return L.eyeSpots().map(e => ({
      core: ring(wash, e, 0.3),
      onEye: bubbles.filter(b => d(b, e) <= 1).length,
      near: bubbles.filter(b => d(b, e) > 1 && d(b, e) < 1.6).length,
      fIn: ring(film, e, 0.9), fMid: ring(film, e, 1.45), fOut: ring(film, e, 2.4) }));
  });
  check(eyes.length === 2, `глаза найдены на нарисованном черве (${eyes.length})`);
  check(eyes.every(e => e.core < 8), `в глазах пены нет (${eyes.map(e => e.core.toFixed(0)).join(' / ')})`);
  check(eyes.every(e => e.onEye === 0 && e.near > 0),
        `пузыри на глазу лопнуты, рядом с глазом целые (на глазу ${eyes.map(e => e.onEye).join('/')}, рядом ${eyes.map(e => e.near).join('/')})`);
  check(eyes.every(e => e.fIn < 4 && e.fMid > e.fOut * 0.25 && e.fMid < e.fOut * 0.85),
        `плёнка тает с запасом до глаза, а не вырезана по нему (у края ${eyes.map(e => e.fIn.toFixed(0)).join('/')}, пояс ${eyes.map(e => e.fMid.toFixed(0)).join('/')}, снаружи ${eyes.map(e => e.fOut.toFixed(0)).join('/')})`);

  // ================= 10б. МУТЬ РАЗЛИВАЕТСЯ ОДНИМ СЛОЕМ =================
  // Муть не кладётся стопкой полупрозрачных кружков, а разливается из
  // нескольких очагов, как пятно воды, пока не зальёт силуэт (замечание
  // игрока). Меряется сам слой: на раннем этапе — несколько отдельных пятен
  // (не одно и не россыпь), к концу — покрыт весь силуэт, а рост монотонный.
  const spread = await page.evaluate(() => {
    const L = LustMinigame;
    L.growReset();
    const Fl = L._grows.soap.film, out = [];
    for (const p of [0.12, 0.5, 1]) {
      for (let i = 1; i <= 20; i++) L.growTo('soap', (out.length ? [0.12, 0.5][out.length - 1] : 0) + (p - (out.length ? [0.12, 0.5][out.length - 1] : 0)) * i / 20);
      const on = new Uint8Array(Fl.gw * Fl.gh);
      let n = 0;
      for (const k of Fl.cells) if (Fl.a[k] > 0.5 * Fl.dens[k] && Fl.dens[k] > 0.05) { on[k] = 1; n++; }
      // Пятна — связные области (4-соседство), мелочь меньше десятка клеток
      // не в счёт.
      const seen = new Uint8Array(on.length); let blobs = 0;
      for (let k = 0; k < on.length; k++) {
        if (!on[k] || seen[k]) continue;
        let size = 0; const st = [k]; seen[k] = 1;
        while (st.length) { const q = st.pop(); size++;
          const i = q % Fl.gw, j = (q / Fl.gw) | 0;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const a = i + di, b = j + dj, r = b * Fl.gw + a;
            if (a >= 0 && b >= 0 && a < Fl.gw && b < Fl.gh && on[r] && !seen[r]) { seen[r] = 1; st.push(r); } } }
        if (size >= 10) blobs++;
      }
      const live = Fl.cells.filter(k => Fl.dens[k] > 0.05).length;
      out.push({ p, cover: n / Math.max(1, live), blobs });
    }
    return out;
  });
  say(`  разлив: ${spread.map(s => `${Math.round(s.p * 100)}% → покрыто ${(s.cover * 100).toFixed(0)}%, пятен ${s.blobs}`).join('; ')}`);
  check(spread[0].blobs >= 2 && spread[0].blobs <= 12, `в начале муть — несколько отдельных очагов (${spread[0].blobs})`);
  check(spread[0].cover < spread[1].cover && spread[1].cover < spread[2].cover, 'разлив растёт монотонно');
  check(spread[2].cover > 0.97, `к концу залит весь силуэт (${(spread[2].cover * 100).toFixed(1)}%)`);

  // ================= 11. БЛЕСК ПУЗЫРЕЙ ОТ НАКЛОНА =================
  // У каждого пузыря свой блик, он ходит от наклона ВНУТРИ своего пузыря
  // (макет принят игроком). Мерится КАРТИНКА у самого крупного пузыря: куда
  // сместился яркий центр холста бликов. Сторона — не «лишь бы менялось»
  // (п. 116): наклон вправо — блик на левом боку, влево — на правом.
  say('\n======== БЛИК У КАЖДОГО ПУЗЫРЯ, ХОДИТ ОТ НАКЛОНА ========');
  // Механика меряется на ГЕЛЕ (ступень 4): у матового хозяйственного блик
  // нарочно редкий и тусклый — прогресс блеска по ступеням. Место блика —
  // на мути (там пузыри стоят поодиночке), вспышки и искры — на ПЕНЕ
  // мочалки: блеск и искры у пены, муть нарочно тише (решение игрока,
  // BATH_ART.LATHER_DIM).
  await page.evaluate(() => { const L = LustMinigame; LustDebug.setLevel('soap', 4); BATH_SOAP.refresh();
    L.growReset(); L.growTo('soap', 1); });
  // Мерится у самого крупного одинокого пузыря В КАЖДОЙ из трёх групп:
  // у групп свой покой блика и своя вязкость.
  const glintAt = async (x, y) => {
    await page.evaluate(([x, y]) => { window.__lean = { live: true, x, y }; Tilt.__origT = Tilt.__origT || Tilt.turn; Tilt.turn = () => window.__lean; }, [x, y]);
    // Ждём, пока уляжется и вспышка от самого шага: искра нарочно шире
    // пузыря, а здесь мерится блик.
    await page.waitForTimeout(3400);
    return page.evaluate(() => {
      const L = LustMinigame, bs = L._glintTop || [], ctx = L.glintCtx;
      // Одинокий — чей блик не перекрывают блики соседей (блик рисуется
      // только у отобранных, остальные пузыри холст бликов не трогают).
      const alone = bs.filter(b => !bs.some(o => o !== b && o.r > b.r * 0.25 && Math.hypot(o.x - b.x, o.y - b.y) < (o.r + b.r) * 0.9));
      const at = (b) => {
        const R = Math.ceil(b.r * 1.05), x0 = Math.round(b.x - R), y0 = Math.round(b.y - R);
        const d = ctx.getImageData(x0, y0, R * 2, R * 2).data;
        // Главный блик — по самым ярким точкам: второе отражение напротив
        // тусклее и иначе тянет центр яркости в обратную сторону.
        let top = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > top) top = d[i];
        let sx = 0, sy = 0, sw = 0, far = 0;
        for (let j = 0; j < R * 2; j++) for (let i = 0; i < R * 2; i++) {
          const w = d[(j * R * 2 + i) * 4 + 3]; if (w < 12) continue;
          if (Math.hypot(x0 + i + 0.5 - b.x, y0 + j + 0.5 - b.y) > b.r) far++;
          if (w < top * 0.7) continue;
          const px = x0 + i + 0.5 - b.x, py = y0 + j + 0.5 - b.y;
          sx += px * w; sy += py * w; sw += w; }
        return { cx: sw ? sx / sw / b.r : 0, cy: sw ? sy / sw / b.r : 0, far };
      };
      const G = [0, 1, 2].map(g => {
        const c = alone.filter(b => b.g === g);
        return c.length ? at(c.reduce((m, q) => q.r > m.r ? q : m)) : null;
      });
      return { n: bs.length, G, far: G.reduce((s, g) => s + (g ? g.far : 0), 0), draws: L.glintDraws || 0,
               light: L.glintLean.g.map(q => q.lx) };
    });
  };
  const g0 = await glintAt(0, 0), gR = await glintAt(0.4, 0), gL = await glintAt(-0.4, 0), gD = await glintAt(0, 0.4);
  const f2 = (g) => g ? `${g.cx.toFixed(2)}, ${g.cy.toFixed(2)}` : '—';
  check(g0.n > 30, `блик есть у каждого заметного пузыря (${g0.n})`);
  check(g0.G.every(Boolean), 'одинокий пузырь нашёлся в каждой из трёх групп');
  if (g0.G.every(Boolean)) {
    const [B, M, S] = g0.G;
    check(g0.G.every(g => g.cx < -0.05 && g.cy < -0.05), `в покое блик у всех групп сверху слева (${g0.G.map(f2).join(' | ')})`);
    check(B.cy < S.cy - 0.12 && S.cx < B.cx - 0.12, `группы разнесены: у крупных блик выше и правее, у мелких ниже и левее (крупные ${f2(B)}, мелкие ${f2(S)})`);
    const m = (g) => g.G[1] || { cx: 0, cy: 0 };
    check(m(gR).cx < m(gL).cx - 0.2, `наклон вправо — блик на ЛЕВОМ боку, влево — на правом (${m(gR).cx.toFixed(2)} против ${m(gL).cx.toFixed(2)})`);
    check(m(gD).cy > M.cy + 0.1, `верх к себе — блик ниже (${M.cy.toFixed(2)} → ${m(gD).cy.toFixed(2)})`);
    // У крупных и мелких — по свету группы, а не по картинке: у края круга
    // хода главный блик сплющен и тускл, и второе отражение напротив
    // перетягивало замер яркости в обратную сторону (плавало от прогона к
    // прогону). Картинку уже проверили у средних, выше.
    check([0, 2].every(i => gR.light[i] < gL.light[i] - 0.2), `крупные и мелкие тоже уходят на ЛЕВЫЙ бок от наклона вправо (свет ${[0, 2].map(i => gR.light[i].toFixed(2) + ' против ' + gL.light[i].toFixed(2)).join('; ')})`);
  }
  // До двух точек — сглаживание края штампа при масштабировании (заготовка
  // ровно в квадрат пузыря), а не блик за кромкой.
  check([g0, gR, gL, gD].every(g => g.far <= 2), `блик не выходит за свой пузырь (${[g0, gR, gL, gD].map(g => g.far).join('/')})`);

  // ТАНЕЦ. Вспышку дают не угол, а ДВИЖЕНИЕ: держишь ровно — ни одной,
  // дрогнула рука на пару градусов — вспыхнула часть пузырей (не все),
  // дрогнула в другую сторону — вспыхнули ДРУГИЕ. Меряется сила штампа
  // каждого пузыря прямо в перерисовке.
  const alphas = async (x, y, wait, force) => page.evaluate(async ([x, y, wait, force]) => {
    const L = LustMinigame, ctx = L.glintCtx, orig = ctx.drawImage;
    window.__lean = { live: true, x, y };
    // В покое холст не перерисовывается — перерисовка вынуждается, иначе
    // проверять нечего (так и пропустили вспышки на неподвижном телефоне).
    if (force) L.glintDirty = true;
    let rec = null, stars = 0;
    // Искры вспыхнувших — отдельные штампы; сила пузыря — по его блику.
    const isStar = (img) => Object.entries(L._stamps || {}).some(([k, v]) => v === img && k.startsWith('star|'));
    ctx.drawImage = function (...a) { if (rec) { if (isStar(a[0])) stars++; else rec.push(ctx.globalAlpha); } return orig.apply(this, a); };
    await new Promise(r => setTimeout(r, wait));
    rec = [];
    const d0 = L.glintDraws;
    await new Promise(r => { const w = () => (L.glintDraws > d0 ? r() : requestAnimationFrame(w)); w(); setTimeout(r, 300); });
    ctx.drawImage = orig;
    const bs = L._glintTop, base = L.GLINT.flash.base;
    // Вспыхнул — ярче своей ровной силы в 1.25 раза.
    const lit = rec.length === bs.length ? bs.map((b, i) => rec[i] > Math.min(1, b.k * L.GLINT.groups[b.g].k * base) * 1.25 + 1e-6) : null;
    return { n: rec.length, lit, stars };
  }, [x, y, wait, force]);
  // Муть тише пены: блики на ней вспыхивают, но искр у мути нет — искры
  // только у пены мочалки (решение игрока).
  await page.evaluate(() => { window.__lean = { live: true, x: 0.1, y: 0 }; });
  await page.waitForTimeout(4000);
  const soapJig = await alphas(0.1 + 0.05, 0, 90);
  check(soapJig.stars === 0 && soapJig.n > 0, `у мути мыла искр нет, даже когда рука дрогнула (искр ${soapJig.stars})`);
  await page.evaluate(() => LustMinigame.growTo('cloth', 1));
  await page.evaluate(() => { window.__lean = { live: true, x: 0.1, y: 0 }; });
  await page.waitForTimeout(4000);
  const steady = await alphas(0.1, 0, 0, true);
  const jigR = await alphas(0.1 + 0.05, 0, 90);
  await page.waitForTimeout(4000);
  const jigL = await alphas(0.1, 0, 90);
  const frac = (a) => a && a.lit ? a.lit.filter(Boolean).length / a.lit.length : -1;
  say(`  вспыхнуло: ровно ${frac(steady).toFixed(2)}, дрожь вправо ${frac(jigR).toFixed(2)}, назад ${frac(jigL).toFixed(2)}`);
  check(steady.n > 0 && frac(steady) === 0 && steady.stars === 0, `телефон держат ровно под наклоном — вспышек и искр нет (${frac(steady).toFixed(2)}, искр ${steady.stars})`);
  check(frac(jigR) > 0.05 && frac(jigR) < 0.6, `рука дрогнула на 1.75° — вспыхнула часть пузырей, а не все (${frac(jigR).toFixed(2)})`);
  const both = jigR.lit && jigL.lit ? jigR.lit.filter((v, i) => v && jigL.lit[i]).length : -1;
  const litR = jigR.lit ? jigR.lit.filter(Boolean).length : 0;
  check(frac(jigL) > 0.05 && both >= 0 && both < litR * 0.3, `дрогнула обратно — вспыхнули ДРУГИЕ (общих ${both} из ${litR})`);
  check(jigR.stars > 0 && jigR.stars <= litR * 1.5 && !steady.stars, `на вспыхнувших загораются искры (${jigR.stars}), на ровном телефоне их нет`);

  // Телефон неподвижен — холст бликов не перерисовывается.
  // Сглаживание наклона доезжает не сразу — ждём устоявшегося (п. 137).
  await page.waitForTimeout(2500);
  const dr0 = await page.evaluate(() => LustMinigame.glintDraws);
  await page.waitForTimeout(800);
  const dr1 = await page.evaluate(() => LustMinigame.glintDraws);
  check(dr1 === dr0, `телефон неподвижен — ни одной перерисовки бликов (${dr1 - dr0})`);
  await page.evaluate(() => { if (Tilt.__origT) Tilt.turn = Tilt.__origT; });

  // НАСТОЯЩИЙ ДАТЧИК, ТЕЛЕФОН СТОЙМЯ. Телефон держат почти вертикально, чуть
  // запрокинув экран, — это и есть ноль (замечание игрока). Главный жест
  // руки тогда — поворот вокруг вертикали: он приходит в alpha, а в gamma
  // его нет. Блики обязаны его видеть. События — настоящие deviceorientation.
  const orient = (a, b, g) => page.evaluate(([a, b, g]) =>
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: a, beta: b, gamma: g })), [a, b, g]);
  const held = async (a, b, g, ms) => { const t = Date.now(); while (Date.now() - t < ms) { await orient(a, b, g); await page.waitForTimeout(30); } };
  await held(0, 70, 8, 200); await held(0, 70, 0, 3800);   // первое событие с размахом — единица «градусы»
  await held(0, 75, 0, 9000);                                // поза хвата устоялась
  const T0 = await page.evaluate(() => ({ t: Tilt.turn(), l: Tilt.lean() }));
  await held(6, 75, 0, 150);                                 // повернул вокруг вертикали на 6°
  const T1 = await page.evaluate(() => ({ t: Tilt.turn(), l: Tilt.lean() }));
  say(`  стоймя: поворот ${T0.t.x.toFixed(3)} → ${T1.t.x.toFixed(3)}, завал вбок ${T0.l.x.toFixed(3)} → ${T1.l.x.toFixed(3)}`);
  check(T0.t.live && Math.abs(T0.t.x) < 0.02 && Math.abs(T0.t.y) < 0.02, `телефон стоймя в позе хвата — поворот ноль (${T0.t.x.toFixed(3)}, ${T0.t.y.toFixed(3)})`);
  check(T1.t.x > 0.1 && Math.abs(T1.l.x) < 0.01, `поворот стоящего телефона вокруг вертикали виден блику (${T1.t.x.toFixed(2)}), хотя завала вбок нет`);
  // Сторона: для лежащего телефона поворот совпадает с завалом вбок (gamma).
  await held(0, 5, 0, 4000); await held(0, 5, 0, 9000);
  await held(0, 5, 6, 150);
  const T2 = await page.evaluate(() => Tilt.turn());
  check(T2.x > 0.1, `лежащий телефон: правый край вниз — поворот того же знака, что gamma (${T2.x.toFixed(2)})`);
  await held(0, 5, 0, 150); await held(0, 11, 0, 150);
  const T3 = await page.evaluate(() => Tilt.turn());
  check(T3.y > 0.1, `верх к себе — y поворота положителен, как у lean (${T3.y.toFixed(2)})`);
  // Смыли — цикл встал.
  await page.evaluate(() => LustMinigame.washShown(false));
  check(!(await page.evaluate(() => LustMinigame.glintRaf)), 'след смыт — цикл бликов встал');

  // ================= 12. ЗА КРАЙ ЭКРАНА НЕ УХОДИТ =================
  // Мыло и мочалку можно было увести за край экрана и потерять (замечание
  // игрока). Палец доходит до края окна, предмет останавливается: формой за
  // край холста — не больше 5% своего размера. Отпущенный там же парит в
  // пределах (сверху — с запасом на покачивание). Меряется НАРИСОВАННЫЙ
  // предмет (без ореола и убранства), флакон — самый крупный, ступень 8.
  say('\n======== МЫЛО И МОЧАЛКА НЕ УХОДЯТ ЗА КРАЙ ========');
  await page.evaluate(() => { const L = LustMinigame; L.close(); L.open();
    LustDebug.setLevel('soap', 8); BATH_SOAP.refresh(); L.startWater(); });
  for (let i = 0; i < 40 && await page.evaluate(() => LustMinigame.phase) !== 'soap'; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(1300);
  const heldOut = () => page.evaluate((NOT_BODY) => {
    const L = LustMinigame, h = document.getElementById('bt-held');
    if (!h) return null;
    // Пар из горла флакона (пузыри, поднимающиеся над пробкой) — не тело.
    const hide = Array.from(h.querySelectorAll(NOT_BODY + ', .bsm-bub, .bsm-vapor')).filter(el => el.getAttribute('display') !== 'none');
    hide.forEach(el => el.setAttribute('display', 'none'));
    const b = h.getBBox();
    hide.forEach(el => el.removeAttribute('display'));
    const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(h.getAttribute('transform') || '');
    const x = b.x + (m ? +m[1] : 0), y = b.y + (m ? +m[2] : 0);
    // Край — видимая область svg руки (он вписан с обрезкой под шапкой
    // окна), а не рамка холста.
    const V = L.handView();
    return { l: (V.x - x) / b.width, r: (x + b.width - V.x - V.w) / b.width,
             t: (V.y - y) / b.height, b: (y + b.height - V.y - V.h) / b.height, V };
  }, NOT_BODY);
  const edgeRun = async (kind) => {
    const at = await page.evaluate(() => { const L = LustMinigame, o = L.loose;
      return SvgSpace.toClient(L.svgEl, o.pos.x, o.pos.y); });
    await page.mouse.move(at.x, at.y); await page.mouse.down();
    const vw = page.viewportSize().width, vh = page.viewportSize().height;
    const out = {};
    for (const [side, x, y] of [['l', 1, vh / 2], ['r', vw - 1, vh / 2], ['t', vw / 2, 1], ['b', vw / 2, vh - 1]]) {
      await page.mouse.move(x, y, { steps: 10 });
      await page.waitForTimeout(60);
      const o = await heldOut();
      out[side] = o ? o[side] : 9;
    }
    // Отпущен в углу — парит в пределах.
    await page.mouse.move(1, 1, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const loose = await heldOut();
    say(`  ${kind}: за край ${Object.entries(out).map(([k, v]) => k + ' ' + (v * 100).toFixed(1) + '%').join(', ')}; отпущен в углу: слева ${(loose.l * 100).toFixed(1)}%, сверху ${(loose.t * 100).toFixed(1)}%`);
    // Упирается — дошёл до края (сверху держится запас на покачивание, там
    // может остаться чуть внутри), и за край не дальше 5%.
    check(Object.values(out).every(v => v <= 0.055) && out.l > 0 && out.r > 0 && out.b > 0,
          `${kind}: палец у края — предмет упирается, за край не больше 5% формы (${Object.values(out).map(v => (v * 100).toFixed(1)).join('/')}%)`);
    check(loose && loose.l <= 0.055 && loose.t <= 0.055, `${kind}: отпущенный у края парит в пределах экрана`);
  };
  await edgeRun('мыло');
  await page.evaluate(() => { const L = LustMinigame; L.rub = 1; L.growTo('soap', 1); L.finishStage('soap'); });
  for (let i = 0; i < 60 && !(await page.evaluate(() => LustMinigame.phase === 'cloth' && LustMinigame.loose && !LustMinigame.liftRaf)); i++) await page.waitForTimeout(200);
  await page.waitForTimeout(600);
  await edgeRun('мочалка');

  // ================= 8. ЗАКРЫЛИ ВАННУЮ — ЦИКЛ ВСТАЛ =================
  await page.evaluate(() => LustMinigame.close());
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ raf: BATH_SOAP.live.raf,
    float: document.getElementById('bt-hand').classList.contains('bt-float'),
    layers: ['bt-shelf', 'bt-hand'].filter(id => document.getElementById(id).classList.contains('bt-live')) }));
  check(!after.raf && !after.layers.length && !after.float, 'ванная закрыта — цикл стоит, слоёв нет, ничего не парит');

  say('');
  errors.forEach(e => say('  ' + e));
  check(!errors.length, `ошибок на странице нет (${errors.length})`);
  say(bad ? `\n✗ провалов: ${bad}` : '\n✓ всё зелёное');
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
