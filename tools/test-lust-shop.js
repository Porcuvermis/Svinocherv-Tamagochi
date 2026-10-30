const { chromium } = require('playwright');
const harness = require('./harness');

// ================= ПРОВЕРКА: МАГАЗИН ПОХОТИ =================
// Всё покупаемое в ванной — рекламный лист в журнале на унитазе (вход
// единственный: старой кнопки и прилавка в игре нет). Код —
// src/minigames/lust/lust-mag.js, mag-ad-art.js, lust-shop.js; замысел —
// docs/plan/21-lust-bath.md, разделы 6 и 7.
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Тап по журналу открывает МАГАЗИН и не включает душ: тап не должен
//      провалиться в сцену под журналом. Старой кнопки и прилавка нет.
//   2. Посреди забега журнал НЕ открывается и не зовёт. «Готовятся до,
//      тратят после» — прямой запрет из раздела 6 плана.
//   3. После финала магазин открывается СНОВА. Мест два, а не одно, и
//      второе забывается первым.
//   4. Купленная ступень СДВИГАЕТ ЧИСЛО ИГРЫ, а не только цифру на
//      листе. Апгрейд, который ничего не меняет, — проданная пустота, и
//      в этом проекте это уже было дважды (лестница возврата семян в саду,
//      семь ручек пульта, которых не существовало).
//   5. Пустой кошелёк: печатей нет, тап ничего не списывает
//      (docs/traps.md, п. 99). Выкупленная ветка — без бирки и печати.
//   6. Окон на листе ровно столько, сколько веток в конфиге: два списка
//      одного и того же однажды разойдутся молча.
//   7. Журнал на унитазе зовёт, только когда есть что купить и магазин
//      открыт; зов живёт на холсте размером с журнал, и двигают его
//      анимации видеокарты — между заходами их нет вовсе. Тап по журналу —
//      он взлетает и раскрывается листом во весь размер; тап по рекламе
//      подсвечивает печать-корзинку, по печати — покупает; мимо — журнал
//      улетает обратно на унитаз.
//      мимо — журнал улетает обратно на унитаз.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-lust-shop.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/lust-shop-';
  const browser = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
  await harness.prepare(page);
  const errors = [];
  let bad = 0;
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const say = console.log;
  const check = (ok, text) => { say((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) bad++; };

  // Палец водится ПО КООРДИНАТАМ журнала на унитазе, из камеры сцены на
  // этот момент: в забеге и после финала камера стоит иначе, чем до него.
  const magPoint = () => page.evaluate(() => {
    const c = LustMinigame.cam, C = BATH_MAG.GEO.top.center;
    return SvgSpace.toClient(document.getElementById('bt-svg'), c.tx + c.s * C[0], c.ty + c.s * C[1]);
  });
  const tapMag = async (wait) => {
    const at = await magPoint();
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(wait);
  };
  // Мимо журнала. Точка — от затемнения и журнала, а не числом: в окне не
  // 390×844 холст игры масштабирован и отцентрован, и «x = 8» уходит мимо
  // игры вовсе.
  const tapAside = async () => {
    const at = await page.evaluate(() => {
      const d = document.querySelector('.bm-dim').getBoundingClientRect(), m = document.querySelector('.bm-mag').getBoundingClientRect();
      return { x: (d.left + m.left) / 2, y: m.top + m.height / 2 };
    });
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(1300);
  };
  const magState = () => page.evaluate(() => ({ open: LustMag.isOpen, busy: LustMag.busy, phase: LustMinigame.phase }));

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2600);
  await page.evaluate(() => { GameManager.handleSinAction('lust'); });
  await page.waitForTimeout(1000);

  // ================= 1. ЖУРНАЛ ОТКРЫВАЕТ МАГАЗИН =================
  say('\n======== ЖУРНАЛ ОТКРЫВАЕТ МАГАЗИН, А НЕ ЗАБЕГ ========');
  const old = await page.evaluate(() => !!document.getElementById('bt-shop-btn') || !!document.getElementById('bt-shop'));
  check(!old, 'старой кнопки и прилавка в игре нет');
  await tapMag(2400);
  let st = await magState();
  check(st.open && !st.busy, 'журнал открылся');
  check(st.phase === 'idle', `душ не включился (фаза ${st.phase})`);
  await page.screenshot({ path: out + '1-shop.png' });

  // ---------- ОКНА: СТОЛЬКО, СКОЛЬКО В КОНФИГЕ ----------
  const shelves = await page.evaluate(() => ({
    wins: document.querySelectorAll('.bm-shop .mad-win').length,
    conf: (ECONOMY.minigames.lust.upgrades.order || []).length
  }));
  check(shelves.wins === shelves.conf,
        `окон на листе столько же, сколько веток в конфиге (${shelves.wins} из ${shelves.conf})`);

  // ================= 2. ЗАКРЫВАЕТСЯ ТАПОМ МИМО =================
  await tapAside();
  st = await magState();
  check(!st.open && st.phase === 'idle', 'закрылся тапом мимо журнала, душ не включился');

  // ================= 2а. ЖУРНАЛ НА УНИТАЗЕ ЗОВЁТ И ОТКРЫВАЕТ ПРИЛАВОК =================
  // Зов (BATH_MAG.call): блик по контуру и отгибающийся уголок — только когда
  // в магазине есть что купить. Живёт на СВОЁМ холсте размером с журнал
  // (п. 156) и слоем становится лишь на время захода (п. 152). Тап по журналу
  // — по координатам сцены, как палец.
  say('\n======== ЖУРНАЛ НА УНИТАЗЕ: ЗОВ И ВХОД ========');
  const poor0 = await page.evaluate(() => {
    for (const cur of ['lust_token', 'lust_shard']) GameState.addCurrency(cur, -GameState.currency(cur));
    return { afford: LustShop.anyAffordable(), wanted: BATH_MAG.call.wanted() };
  });
  check(!poor0.afford && !poor0.wanted, 'пустой кошелёк — купить нечего, журнал не зовёт');
  const rich0 = await page.evaluate(() => {
    Backend.grantCurrency('lust_token', 3);
    const box = document.getElementById('bt-mag-call'), r = box.getBoundingClientRect();
    const st = document.getElementById('bt-stage').getBoundingClientRect();
    return { afford: LustShop.anyAffordable(), wanted: BATH_MAG.call.wanted(),
             share: (r.width * r.height) / (st.width * st.height), anims: box.getAnimations({ subtree: true }).length };
  });
  check(rich0.afford && rich0.wanted, 'есть что купить — журнал зовёт');
  check(rich0.share > 0 && rich0.share < 0.08,
        `холст зова размером с журнал, а не с экран (${(rich0.share * 100).toFixed(1)}% экрана)`);
  check(rich0.anims === 0, 'между заходами у холста зова ни одной анимации');
  await page.evaluate(() => { clearTimeout(BATH_MAG.call.timer); BATH_MAG.call.play(); });
  await page.waitForTimeout(2500);
  // Посреди захода уголок поднят: окно ленты видно, лента сдвинута на кадр
  // подъёма; заход идёт анимациями видеокарты, а не кадрами скрипта.
  const mid = await page.evaluate(() => {
    const box = document.getElementById('bt-mag-call'), fl = box.querySelector('.bmc-flap');
    const m = new DOMMatrix(getComputedStyle(fl.querySelector('img')).transform);
    return { anims: box.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length,
             flap: +getComputedStyle(fl).opacity, shift: m.m42 };
  });
  check(mid.anims >= 3 && mid.flap > 0.5 && mid.shift < 0,
        `посреди захода уголок отогнут (лента сдвинута на ${mid.shift.toFixed(0)}), двигают анимации (${mid.anims})`);
  await page.screenshot({ path: out + '2a-call.png' });
  await page.waitForTimeout(2000);
  const end = await page.evaluate(() => { const box = document.getElementById('bt-mag-call');
    return { anims: box.getAnimations({ subtree: true }).length, flap: +getComputedStyle(box.querySelector('.bmc-flap')).opacity, next: !!BATH_MAG.call.timer }; });
  check(end.anims === 0 && end.flap === 0 && end.next, 'заход кончился: уголок лёг, анимаций нет, следующий назначен');
  const magAt = await magPoint();

  // Взлёт начинается С УНИТАЗА: журнал полёта в начальной позе лежит там же,
  // где журнал сцены. Без этой проверки журнал «телепортировался» в позу над
  // унитазом — его слой сидел в других координатах, чем холсты сцены.
  const startAt = await page.evaluate(() => {
    const sc = document.getElementById('bt-mag-top').getBoundingClientRect();
    LustMag.open(); LustMag.stopAnims();
    // Обложка согнутой модели — полосы; габарит — их объединение.
    const seen = (el) => +getComputedStyle(el).opacity > 0.5;
    const rs = [...document.querySelectorAll('.bm-bent .bm-sc')].filter(seen).map(e => e.getBoundingClientRect());
    const a = { x: Math.min(...rs.map(r => r.left)), y: Math.min(...rs.map(r => r.top)) };
    a.width = Math.max(...rs.map(r => r.right)) - a.x; a.height = Math.max(...rs.map(r => r.bottom)) - a.y;
    // Толстая: у лежащего журнала виден торец страниц (п. 163).
    const pages = [...document.querySelectorAll('.bm-bent .bm-sn, .bm-bent .bm-se')].filter(seen).length;
    const flatHidden = !seen(document.querySelector('.bm-a'));
    LustMag.hide();
    const cx = a.x + a.width / 2, cy = a.y + a.height / 2;
    return { inside: cx > sc.left && cx < sc.right && cy > sc.top && cy < sc.bottom, pages, flatHidden,
             d: Math.round(Math.hypot(cx - (sc.x + sc.width * 0.55), cy - (sc.y + sc.height * 0.4))) };
  });
  check(startAt.inside, `начальная поза полёта — на журнале сцены (середина обложки в его габарите, ${startAt.d} точек от центра)`);
  check(startAt.pages > 0 && startAt.flatHidden,
        `взлетает та же ТОЛСТАЯ модель: торец страниц виден (${startAt.pages} граней), плоской обложки нет (docs/traps.md, п. 163)`);
  await page.mouse.click(magAt.x, magAt.y);
  await page.waitForTimeout(150);
  const flying = await page.evaluate(() => ({ open: LustMag.isOpen, busy: LustMag.busy, phase: LustMinigame.phase,
    sceneHidden: document.getElementById('bt-mag-top').style.visibility === 'hidden' }));
  check(flying.open && flying.busy && flying.phase === 'idle' && flying.sceneHidden,
        'тап по журналу: журнал взлетает (на унитазе его больше нет), душ не включился');
  await page.waitForTimeout(2200);
  // Журнал раскрылся: перед игроком страница-прилавок во весь размер, по
  // центру, и ни одна пролистанная страница её не накрывает.
  const spread = await page.evaluate(() => {
    const r = document.querySelector('.bm-shop').getBoundingClientRect();
    const st = document.getElementById('bt-stage').getBoundingClientRect();
    // Окна рекламы на виду: в их середине — страница журнала (тап разбирает
    // она сама по прямоугольникам), а не затемнение и не пролистанная страница.
    const pg = document.querySelector('.bm-shop .mad-page').getBoundingClientRect();
    const ads = ECONOMY.minigames.lust.upgrades.order.map(k => {
      const [x, y, w, h] = MAG_AD.zones(k).win;
      const el = document.elementFromPoint(pg.x + (x + w / 2) / MAG_AD.W * pg.width, pg.y + (y + h / 2) / MAG_AD.H * pg.height);
      return !!el && !!el.closest('.bm-shop');
    });
    // Ушедшая за журнал страница гаснет прозрачностью своих сторон.
    const pages = [...document.querySelectorAll('.bm-page, .bm-cover')].map(p =>
      [...p.querySelectorAll('.bm-f, .bm-r, .bm-a, .bm-b, .bm-in')].every(f => +getComputedStyle(f).opacity === 0) ? 'hidden' : 'shown');
    return { busy: LustMag.busy, w: r.width / st.width, cx: (r.x + r.width / 2 - st.x) / st.width, ads, pages };
  });
  check(!spread.busy && spread.w > 0.7 && Math.abs(spread.cx - 0.5) < 0.05,
        `журнал встал по центру во весь размер меню (${(spread.w * 100).toFixed(0)}% ширины)`);
  check(spread.ads.length === 3 && spread.ads.every(Boolean), 'все три рекламы на виду и в них попадает палец');
  check(spread.pages.every(v => v === 'hidden'), 'обложка и пролистанные страницы ушли за журнал');
  // Тап по рекламе НЕ покупает, а подсвечивает печать-корзинку; тап по
  // печати — покупает. Пальцем по координатам. Жетонов 3 — по карману
  // только первая ступень, печать стоит у той ветки, что её продаёт.
  // Точки — от экранного прямоугольника листа и его раскладки (MAG_AD.zones).
  const toScreen = (k, part) => page.evaluate(([k, part]) => {
    const pg = document.querySelector('.bm-shop .mad-page').getBoundingClientRect(), Z = MAG_AD.zones(k);
    const [x, y] = part === 'seal' ? Z.seal : [Z.win[0] + MAG_AD.LAYOUT[k].medal[0], Z.win[1] + MAG_AD.LAYOUT[k].medal[1]];
    return { x: pg.x + x / MAG_AD.W * pg.width, y: pg.y + y / MAG_AD.H * pg.height, key: k };
  }, [k, part]);
  const sealKey = await page.evaluate(() => { const n = document.querySelector('.bm-shop .mad-seal'); return n && n.dataset.key; });
  check(!!sealKey, `печать-корзинка стоит там, где жетонов хватает (${sealKey})`);
  const seal0 = await toScreen(sealKey, 'seal');
  // Мимо печати — в середину медальона окна той же ветки.
  const adAt = await toScreen(sealKey, 'medal');
  const lv0 = await page.evaluate((k) => GameState.upgradeLevel('lust_' + k), seal0.key);
  await page.mouse.click(adAt.x, adAt.y);
  await page.waitForTimeout(120);
  const glow = await page.evaluate(([k, lv0]) => ({ glow: !!document.querySelector(`.mad-seal.bm-glow[data-key="${k}"]`),
    same: GameState.upgradeLevel('lust_' + k) === lv0 }), [seal0.key, lv0]);
  check(glow.glow && glow.same, 'тап по рекламе подсвечивает печать и ничего не покупает');
  const purse0 = await page.evaluate(() => GameState.currency('lust_token'));
  await page.mouse.click(seal0.x, seal0.y);
  await page.waitForTimeout(200);
  const after0 = await page.evaluate((k) => ({ lv: GameState.upgradeLevel('lust_' + k), purse: GameState.currency('lust_token'),
    wallet: +document.querySelector('.bm-shop .mad-wallet').dataset.num,
    stars: document.querySelectorAll(`.bm-shop .mad-win[data-key="${k}"] .mad-star.on`).length }), seal0.key);
  check(after0.lv === lv0 + 1, `тап по печати покупает (ступень ${lv0} → ${after0.lv})`);
  check(after0.purse < purse0 && after0.wallet === after0.purse,
        `жетоны списаны и кошелёк на развороте перерисован (${purse0} → ${after0.wallet})`);
  check(after0.stars === after0.lv, `литых звёзд столько, сколько куплено (${after0.stars})`);
  await page.screenshot({ path: out + '2b-spread.png' });
  // Пустой кошелёк: печатей нет ни у одной ветки — купить нечем, и тап по
  // рекламе ничего не списывает (docs/traps.md, п. 99).
  const poorMag = await page.evaluate(() => {
    GameState.addCurrency('lust_token', -GameState.currency('lust_token')); LustMag.renderShop();
    return { seals: document.querySelectorAll('.bm-shop .mad-seal').length,
             tags: document.querySelectorAll('.bm-shop .mad-tag').length };
  });
  check(poorMag.seals === 0 && poorMag.tags === 3, `пустой кошелёк: цены видны (${poorMag.tags}), печатей нет (${poorMag.seals})`);
  const lvPoor = await page.evaluate((k) => GameState.upgradeLevel('lust_' + k), seal0.key);
  await page.mouse.click(seal0.x, seal0.y);
  await page.waitForTimeout(150);
  check(await page.evaluate(([k, l]) => GameState.upgradeLevel('lust_' + k) === l && GameState.currency('lust_token') === 0, [seal0.key, lvPoor]),
        'тап туда, где стояла печать, без жетонов ничего не покупает');
  await page.screenshot({ path: out + '2c-poor.png' });
  // Выкупленная ветка: полка остаётся (решение игрока), но без бирки и
  // печати, все звёзды литые.
  const maxMag = await page.evaluate(() => {
    const u = ECONOMY.minigames.lust.upgrades;
    GameState.data.upgrades.lust_cloth = u.cloth.levels.length;
    Backend.grantCurrency('lust_token', 200); LustMag.renderShop();
    const w = document.querySelector('.bm-shop .mad-win[data-key="cloth"]');
    return { win: !!w, tag: !!w.querySelector('.mad-tag'), seal: !!w.querySelector('.mad-seal'),
             on: w.querySelectorAll('.mad-star.on').length, all: u.cloth.levels.length,
             others: document.querySelectorAll('.bm-shop .mad-seal').length };
  });
  check(maxMag.win && !maxMag.tag && !maxMag.seal && maxMag.on === maxMag.all,
        `выкупленная мочалка: полка на месте, ни бирки, ни печати, звёзд ${maxMag.on} из ${maxMag.all}`);
  check(maxMag.others === 2, `у остальных двух веток печати стоят (${maxMag.others})`);
  await page.screenshot({ path: out + '2d-max.png' });
  // Палец попадает в СВОЮ печать: тап по печати мыла покупает мыло, а не
  // соседний хвост или мочалку.
  const lvls = () => page.evaluate(() => ({ tail: GameState.upgradeLevel('lust_tail'), soap: GameState.upgradeLevel('lust_soap'), cloth: GameState.upgradeLevel('lust_cloth') }));
  const pre = await lvls(), soapAt = await toScreen('soap', 'seal');
  await page.mouse.click(soapAt.x, soapAt.y);
  await page.waitForTimeout(150);
  const post = await lvls();
  check(post.soap === pre.soap + 1 && post.tail === pre.tail && post.cloth === pre.cloth,
        `печать мыла покупает мыло и только его (мыло ${pre.soap} → ${post.soap})`);
  // Мимо журнала — закрывается и ложится обратно на унитаз.
  await tapAside();
  const back = await page.evaluate(() => ({ open: LustMag.isOpen, scene: document.getElementById('bt-mag-top').style.visibility !== 'hidden' }));
  check(!back.open && back.scene, 'тап мимо журнала — он улетает обратно и снова лежит на унитазе');
  // Покупка выше вернёт ступень: прогон дальше считает от нуля.
  await page.evaluate(() => { ECONOMY.minigames.lust.upgrades.order.forEach(k => { GameState.data.upgrades['lust_' + k] = 0; }); GameState.addCurrency('lust_token', -GameState.currency('lust_token')); GameState.save(); });
  await page.waitForTimeout(300);

  // ================= 3. ПОСРЕДИ ЗАБЕГА МАГАЗИНА НЕТ =================
  say('\n======== ПОСРЕДИ ЗАБЕГА ЖУРНАЛ НЕ ОТКРЫВАЕТСЯ ========');
  await page.evaluate(() => LustMinigame.startWater());
  await page.waitForTimeout(1400);
  // Журнал в кадре — иначе тап промахнулся бы и проверка была бы пустой.
  check(await page.evaluate(() => BATH_MAG.inView(LustMinigame.cam)), 'посреди забега журнал в кадре');
  await tapMag(600);
  st = await magState();
  check(!st.open && st.phase !== 'idle', `на этапе «${st.phase}» тап по журналу его не открывает`);
  const midRun = await page.evaluate(() => ({ wanted: BATH_MAG.call.wanted() }));
  check(!midRun.wanted, 'посреди забега журнал не зовёт');

  // ================= 4. ПОКУПКА ДВИГАЕТ ЧИСЛО ИГРЫ =================
  // Меряется НЕ цифра на прилавке, а то, чем игра пользуется: ступень
  // прицела, которой стреляет финал, и секунды трения мылом и мочалкой.
  say('\n======== КУПЛЕННАЯ СТУПЕНЬ ДВИГАЕТ ИГРУ ========');
  const read = () => page.evaluate(() => ({
    drain: GameState.drainHours('lust'),
    cooldown: GameState.rewardCooldownHours('lust'),
    sin: GameState.sinValue('lust'),
    tail: LustMinigame.tailTier(),
    shotMs: LustMinigame.shotMs(),
    soap: (LustMinigame.phase = 'soap', LustMinigame.stageRub()),
    cloth: (LustMinigame.phase = 'cloth', LustMinigame.stageRub())
  }));
  // Шкала просела пять часов назад: иначе прыжок от смены скорости не с чего
  // увидеть — он растёт вместе с прошедшим временем.
  await page.evaluate(() => { GameState.data.sins.lust.updated_at -= 5 * 3600 * 1000; });
  const before = await read();
  const buy = await page.evaluate(() => {
    Backend.grantCurrency('lust_token', 60);
    const r = {};
    ['tail', 'soap', 'cloth'].forEach(k => { r[k] = Backend.buyUpgrade(k, 'lust').ok; });
    return r;
  });
  check(buy.tail && buy.soap && buy.cloth, 'три покупки прошли');
  const after = await read();
  check(after.tail.shots === before.tail.shots + 1,
        `толчков стало больше: ${before.tail.shots} → ${after.tail.shots}`);
  check(after.shotMs < before.shotMs,
        `пауза между толчками короче, финал той же длины: ${Math.round(before.shotMs)} → ${Math.round(after.shotMs)} мс`);
  check(after.tail.spread < before.tail.spread && after.tail.gain > before.tail.gain
        && after.tail.relax < before.tail.relax,
        `разброс уже (±${before.tail.spread}° → ±${after.tail.spread}°), свайп даёт больше ` +
        `(${before.tail.gain} → ${after.tail.gain}), хвост выпрямляется медленнее ` +
        `(${before.tail.relax} → ${after.tail.relax})`);
  check(after.soap < before.soap,
        `мылить короче: ${before.soap} → ${after.soap} с трения`);
  check(after.cloth < before.cloth,
        `тереть мочалкой короче: ${before.cloth} → ${after.cloth} с трения`);
  // Вторая половина мыла и мочалки — таймеры, и они разведены: мыло
  // замедляет потребность, мочалка ускоряет награду.
  check(after.drain > before.drain,
        `шкала похоти пустеет медленнее: за ${before.drain} → ${after.drain} ч`);
  check(after.cooldown < before.cooldown,
        `награда снова доступна раньше: через ${before.cooldown} → ${after.cooldown} ч`);
  // Покупка мыла меняет СКОРОСТЬ шкалы, а значение считается формулой от
  // метки: без фиксации на момент покупки шкала прыгнула бы задним числом.
  check(Math.abs(after.sin - before.sin) < 0.5,
        `шкала не прыгнула в момент покупки: ${before.sin.toFixed(1)} → ${after.sin.toFixed(1)}`);
  await page.evaluate(() => { LustMinigame.phase = 'soap'; });

  // Списание настоящее: жетоны ушли из кошелька.
  const spent = await page.evaluate(() => 60 - GameState.currency('lust_token'));
  check(spent > 0, `жетоны списаны (${spent} за три покупки)`);

  // ================= 5. ПОСЛЕ ФИНАЛА ЖУРНАЛ ОТКРЫВАЕТСЯ СНОВА =================
  say('\n======== ПОСЛЕ ФИНАЛА ЖУРНАЛ ОТКРЫВАЕТСЯ СНОВА ========');
  await page.evaluate(() => LustMinigame.done());
  await page.waitForTimeout(600);
  await tapMag(2400);
  st = await magState();
  check(st.open && st.phase === 'done', `на фазе «${st.phase}» журнал открылся`);
  await page.screenshot({ path: out + '2-after.png' });
  await tapAside();
  check(!(await magState()).open, 'и закрылся тапом мимо');

  // ================= 8. DEBUG-ПАНЕЛЬ ПОХОТИ =================
  // Инструмент автора: ступени хвоста, мыла и мочалки кнопками, жетоны, и
  // сразу в финал — чтобы сравнить хвост на нуле и на максимуме рукой.
  // Проверяется, что кнопки НАЖИМАЮТСЯ (панель инспектора висит поверх всего
  // и однажды уже перехватывала её первую строку) и что делают своё.
  say('\n======== DEBUG-ПАНЕЛЬ ПОХОТИ ========');
  await page.evaluate(() => {
    const u = ECONOMY.minigames.lust.upgrades;
    u.order.forEach(k => { GameState.data.upgrades['lust_' + k] = 0; });
    GameState.data.currencies.lust_token = 0;
    LustMinigame.close(); LustMinigame.open();
    if (!DebugMode.enabled) DebugMode.toggle();
  });
  await page.waitForTimeout(800);
  const press = async (act) => {
    const b = await page.evaluate((a) => {
      const el = document.querySelector(`#lu-debug [data-act="${a}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, mine: top === el };
    }, act);
    if (!b) { check(false, 'нет кнопки ' + act); return false; }
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(250);
    return b.mine;
  };
  const reachable = await press('tok:10');
  check(reachable, 'первую строку панели ничто не накрывает');
  const dbg1 = await page.evaluate(() => GameState.currency('lust_token'));
  check(dbg1 === 10, `жетоны выдаются кнопкой (${dbg1})`);
  await press('allmax');
  await press('finale');
  await page.waitForTimeout(900);
  const dbg2 = await page.evaluate(() => ({
    tail: GameState.upgradeLevel('lust_tail'), top: ECONOMY.minigames.lust.upgrades.tail.levels.length,
    phase: LustMinigame.phase,
    shots: LustMinigame.shotsLeft, gain: LustMinigame.tailTier().gain }));
  check(dbg2.tail === dbg2.top,
        `«всё макс» ставит верхнюю ступень хвоста (${dbg2.tail})`);
  check(dbg2.phase === 'aim' && dbg2.shots >= 18,
        `«сразу в финал» ведёт в финал на купленной ступени (${dbg2.phase}, толчков осталось ${dbg2.shots})`);
  await press('allmin');
  const dbg3 = await page.evaluate(() => LustMinigame.tailTier().gain);
  check(dbg3 < dbg2.gain, `«всё 0» возвращает тугой хвост прямо в финале (отдача ${dbg2.gain} → ${dbg3})`);
  await page.screenshot({ path: out + '5-debug.png' });
  await page.evaluate(() => { if (DebugMode.enabled) DebugMode.toggle(); });

  say(errors.length ? '\nОШИБКИ:\n  ' + errors.join('\n  ') : '\nошибок в консоли нет');
  await browser.close();
  if (bad || errors.length) process.exit(1);
})();
