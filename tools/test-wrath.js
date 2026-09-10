const { chromium } = require('playwright');
const { viewport, prepare } = require('./harness');

// ================= ПРОГОН: ГНЕВ — НАГРАДА И ЗАРАСТАНИЕ =================
// Проверяет ровно то, что чинилось правкой «победа платит всегда, а темп
// держит регенерацию»:
//
//   1. победа в бою платит при ПОЛНОЙ шкале гнева (порог голода у боя снят);
//   2. поражение при полной шкале тоже засчитывается — «каждое третье»
//      считает все поражения, а не только те, что при просевшей шкале;
//   3. порог голода при этом жив у остальных грехов (проверяется тщеславием);
//   4. регенерация идёт ДОЛЕЙ от максимума в минуту: полная полоса за десять
//      минут и у голого червя, и у прокачанного;
//   5. прокачка ветки регенерации ускоряет ровно во столько, во сколько
//      обещает конфиг;
//   6. в бою регенерация заморожено, в лобби — размораживается;
//   7. узел гнева в колесе горит по ЗДОРОВЬЮ, а не по шкале греха;
//   8. полоса здоровья в лобби едет по дробному здоровью, а не стоит
//      минуту на месте вместе с целым числом;
//   9. бой пальцем по зонам доходит до конца и приносит начисление.
//
// Время не отматывается системными часами: двигается метка fighter.updated_at
// в состоянии — ровно тот механизм, что работает в игре (CLAUDE.md, п. 1).
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-wrath.js /tmp/shot-
(async () => {
  const out = process.argv[2] || '/tmp/wrath-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(viewport({ deviceScaleFactor: 2 }));
  await prepare(page);

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const fail = [];
  const check = (ok, what) => { console.log((ok ? '  ok  ' : ' FAIL ') + what); if (!ok) fail.push(what); };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);

  // ---------- 1–3. ПОРОГ ГОЛОДА ----------
  console.log('\n--- награда при полной шкале ---');
  const pays = await page.evaluate(async () => {
    const max = GameState.maxValue('wrath');
    const shardsAt = () => GameState.currency('wrath_shard');
    const goldAt = () => GameState.currency('gold');

    // Шкала доверху: до правки ровно это и глушило награду за победу.
    GameState.setSinValue('wrath', max);
    const shardBefore = shardsAt(), goldBefore = goldAt();
    const win = (await Backend.minigameResult({ sin: 'wrath', mode: 'duel', outcome: 'win' })).awarded;

    // Три поражения подряд при полной шкале обязаны сложиться в осколок.
    let loseShards = 0;
    const n = ECONOMY.rewards.wrath.duel.lose.everyN.n;
    for (let i = 0; i < n; i++) {
      GameState.setSinValue('wrath', GameState.maxValue('wrath'));
      const a = (await Backend.minigameResult({ sin: 'wrath', mode: 'duel', outcome: 'lose' })).awarded;
      loseShards += (a.currencies.wrath_shard || 0);
    }

    // Тщеславие — контроль: у него порог на месте и платить не должно.
    GameState.setSinValue('pride', GameState.maxValue('pride'));
    const pride = (await Backend.minigameResult({ sin: 'pride', mode: 'parade', outcome: 'win',
                                                 meta: { kisses: 5 } })).awarded;
    return {
      winPays: win.pays,
      winShard: shardsAt() >= shardBefore + 1,
      winGold: goldAt() > goldBefore,
      loseShards, n,
      pridePays: pride.pays,
      prideKisses: pride.currencies.pride_kiss || 0
    };
  });
  check(pays.winPays === true, 'победа при полной шкале гнева считается оплаченной');
  check(pays.winShard, 'за победу при полной шкале начислен осколок');
  check(pays.winGold, 'за победу при полной шкале начислено золото');
  check(pays.loseShards === 1, `каждое ${pays.n}-е поражение даёт осколок и при полной шкале`);
  check(pays.pridePays === false, 'у тщеславия порог голода на месте: сытый грех не платит');
  check(pays.prideKisses === 0, 'сытому тщеславию поцелуи не начислены');

  // ---------- 4–5. СКОРОСТЬ ЗАРАСТАНИЯ ----------
  console.log('\n--- регенерация ---');
  const regen = await page.evaluate(() => {
    const W = ECONOMY.minigames.wrath;
    // Отматывается метка в состоянии, а не часы: проверяется тот же механизм,
    // что работает при закрытой игре.
    const after = (minutes, maxHp) => {
      Backend.setFighterHp(0);
      GameState.data.fighter.updated_at = GameTime.now() - minutes * 60000;
      GameState.data.fighter.frozen = false;
      return GameState.fighterHpExact(maxHp);
    };
    const base = W.regenPerMinute;
    const levels = W.upgrades.regen.levels.map((step, i) => {
      GameState.data.upgrades.regen = i + 1;
      const rate = base + step.bonus;
      return { level: i + 1, rate, got: after(1, 40), full: W.baseHp / rate };
    });
    GameState.data.upgrades.regen = 0;
    return {
      base,
      inMinute: after(1, 40),                     // потолок заведомо выше — мерим саму скорость
      baseFull: after(W.baseHp / base, W.baseHp), // ровно столько, сколько нужно на полную полосу
      baseOver: after(W.baseHp / base * 3, W.baseHp),
      // Плоское число: у бойца на 30 хп за то же время набегает СТОЛЬКО ЖЕ хп,
      // а не столько же процентов. На этом и держится спор двух веток
      // прокачки — чем больше запас, тем нужнее регенерация.
      bigInMinute: after(1, 30),
      bigFull: after(W.baseHp / base, 30),
      levels
    };
  });
  const eps = 0.02;
  check(Math.abs(regen.inMinute - regen.base) < eps, `база: ${regen.base} хп в минуту`);
  check(Math.abs(regen.baseFull - 10) < eps, `полная полоса базового бойца за ${(10 / regen.base)} мин`);
  check(regen.baseOver === 10, 'сверх максимума не набегает');
  check(Math.abs(regen.bigInMinute - regen.base) < eps,
    'у бойца на 30 хп за минуту набегает столько же хп, а не столько же долей');
  check(regen.bigFull < 30 - 1,
    `и полная полоса ему за 10 минут НЕ набирается (${regen.bigFull.toFixed(1)}/30) — ветка регенерации нужна тем сильнее, чем больше запас`);
  regen.levels.forEach(l => {
    check(Math.abs(l.got - l.rate) < eps,
      `ветка регенерации, ур. ${l.level}: ${l.rate} хп/мин — полная полоса базового за ${l.full.toFixed(2).replace(/\.?0+$/, '')} мин`);
  });

  // ---------- 6. ЗАМОРОЗКА ----------
  console.log('\n--- заморозка в бою ---');
  const frozen = await page.evaluate(() => {
    Backend.setFighterHp(2);
    Backend.freezeHeal(10);
    GameState.data.fighter.updated_at = GameTime.now() - 60 * 60000;   // час
    const inFight = GameState.fighterHpExact(10);
    Backend.resumeHeal();
    GameState.data.fighter.updated_at = GameTime.now() - 3 * 60000;    // три минуты
    const afterLobby = GameState.fighterHpExact(10);
    return { inFight, afterLobby };
  });
  check(frozen.inFight === 2, 'в бою здоровье не восстанавливается даже за час');
  check(Math.abs(frozen.afterLobby - 5) < eps, 'после возврата в лобби отсчёт пошёл заново');

  // ---------- 6a. СОПЕРНИК ----------
  console.log('\n--- соперник ---');
  const foes = await page.evaluate(async () => {
    // Одеваем и качаем игрока, чтобы копия сразу бросалась в глаза.
    GameState.data.equipment = { weapon: 'tusk-saber', armor: 'bone-plate' };
    GameState.data.upgrades = { damage: 3, hp: 3, regen: 0 };
    const mine = Backend.wrathStats(GameState.data.equipment, GameState.data.upgrades);
    const myAvg = (mine.damageMin + mine.damageMax) / 2;
    const myPower = Backend.wrathPower(mine, myAvg);

    const out = [];
    for (let i = 0; i < 12; i++) {
      const foe = (await Backend.getOpponent('duel')).opponent;
      const f = WrathFighter.fromSnapshot(foe);
      out.push({
        seed: foe.seed,
        selfCopy: foe.is_self_copy,
        equipment: JSON.stringify(foe.equipment),
        upgrades: JSON.stringify(foe.upgrades),
        stats: `${f.stats.hp}/${f.stats.damageMin}-${f.stats.damageMax}`,
        power: Backend.wrathPower(f.stats, myAvg),
        ratio: foe.powerRatio,
        skin: foe.model && foe.model.head ? foe.model.head.fill : null,
        gut: foe.model && foe.model.anatomy ? foe.model.anatomy.organs.tract.loopDensity : null,
        scars: foe.model && foe.model.scars ? foe.model.scars.length : -1,
        wear: foe.model ? Object.keys(foe.model.cosmetics || {}).length : -1
      });
    }
    return { myPower, mineStats: `${mine.hp}/${mine.damageMin}-${mine.damageMax}`, out };
  });
  const uniqKey = k => new Set(foes.out.map(f => f[k])).size;
  check(foes.out.every(f => f.selfCopy === false), 'соперник больше не помечен копией игрока');
  check(uniqKey('equipment') >= 8, `снаряжение разное: ${uniqKey('equipment')} вариантов из 12`);
  check(uniqKey('stats') >= 6, `числа разные: ${uniqKey('stats')} вариантов из 12`);
  check(uniqKey('skin') >= 10, `окрас разный: ${uniqKey('skin')} из 12`);
  check(uniqKey('gut') >= 10, `тело разное (плотность кишки): ${uniqKey('gut')} из 12`);
  check(uniqKey('scars') >= 4, `шрамы разные: ${uniqKey('scars')} вариантов из 12`);
  check(foes.out.some(f => f.wear > 0), 'кто-то из соперников одет');
  check(foes.out.some(f => f.stats !== foes.mineStats), 'соперник не повторяет числа игрока');

  // Главное: сила соперника рядом с силой игрока, а не где попало.
  const spread = await page.evaluate(() => ECONOMY.minigames.wrath.opponent.spread);
  const ratios = foes.out.map(f => f.ratio);
  const lo = Math.min(...ratios), hi = Math.max(...ratios);
  check(lo > spread[0] - 0.35 && hi < spread[1] + 0.35,
    `сила соперника рядом с игроком: ×${lo.toFixed(2)}…×${hi.toFixed(2)} при коридоре ×${spread[0]}…×${spread[1]}`);

  // И столь же важное: прокачка соперника — ЕГО, а не игрока. Раньше
  // WrathFighter.stats читал уровни из состояния кому угодно.
  const notMine = await page.evaluate(() => {
    GameState.data.upgrades = { damage: 3, hp: 3, regen: 0 };
    const snap = { equipment: {}, upgrades: { damage: 0, hp: 0 } };
    const f = WrathFighter.fromSnapshot(snap);
    const W = ECONOMY.minigames.wrath;
    return { hp: f.stats.hp, dmg: f.stats.damageMax, baseHp: W.baseHp, baseDmg: W.damageMax };
  });
  check(notMine.hp === notMine.baseHp && notMine.dmg === notMine.baseDmg,
    `голый соперник голый и при прокачанном игроке: ${notMine.hp} хп, урон до ${notMine.dmg}`);

  // Раздеваем игрока обратно: дальше меряется полоса здоровья, и она обязана
  // быть базовой десяткой, иначе проверки ниже считают не то.
  await page.evaluate(() => {
    GameState.data.equipment = {};
    GameState.data.upgrades = { damage: 0, hp: 0, regen: 0 };
  });

  // ---------- 6b. ЖЕТОН ПО ЧАСТЯМ ----------
  // Жетон рисуется целиком всегда, а закрашены в нём ровно те дольки, что
  // заработаны: треть за победу, девятая за поражение. Проверяется и сама
  // арифметика долек, и то, что после размена скелет начинается заново.
  console.log('\n--- жетон по частям ---');
  const tok = await page.evaluate(() => {
    const put = (shards, losses) => {
      GameState.data.currencies.wrath_shard = shards;
      GameState.data.counters = {};
      if (losses) GameState.bumpTotal('wrath.duel.lose', losses);
      return TokenArt.progress('wrath_token', 'wrath.duel.lose');
    };
    const svgOf = (n) => TokenArt.svg('wrath_token', n);
    const countFilled = (markup) => {
      const box = document.createElement('div');
      box.innerHTML = markup;
      return {
        filled: box.querySelectorAll('path[fill^="url"]').length,
        dashed: box.querySelectorAll('path[stroke-dasharray]').length,
        rim: box.querySelectorAll('circle').length,
        spokes: box.querySelectorAll('line').length
      };
    };
    return {
      pieces: TokenArt.PIECES,
      // Осколок — треть, поражение — девятая. Эти числа обязаны совпадать с
      // разменом и с everyN в конфиге, иначе картинка врёт.
      exchangePer: ECONOMY.exchange.wrath_shard.per,
      everyN: ECONOMY.rewards.wrath.duel.lose.everyN.n,
      empty: put(0, 0),
      oneLoss: put(0, 1),
      twoLosses: put(0, 2),
      oneShard: put(1, 0),
      shardAndLoss: put(1, 2),
      almost: put(2, 2),
      shape0: countFilled(svgOf(0)),
      shape5: countFilled(svgOf(5)),
      shape9: countFilled(svgOf(9)),
      whole: countFilled(TokenArt.svg('wrath_token', 0, { whole: true }))
    };
  });
  check(tok.pieces === tok.exchangePer * tok.everyN,
    `жетон делится ровно как в конфиге: ${tok.exchangePer} осколка × ${tok.everyN} поражения = ${tok.pieces} долек`);
  check(tok.empty === 0 && tok.oneLoss === 1 && tok.twoLosses === 2,
    'поражение красит одну девятую');
  check(tok.oneShard === 3, 'осколок красит треть (три девятых)');
  check(tok.shardAndLoss === 5, 'треть плюс две девятых даёт пять долек');
  check(tok.almost === 8, 'до полного жетона не хватает ровно одной дольки');
  check(tok.shape0.filled === 0 && tok.shape0.dashed === 9,
    'пустой жетон нарисован ЦЕЛИКОМ: девять долек пунктиром');
  check(tok.shape5.filled === 5 && tok.shape5.dashed === 4,
    'наполовину собранный: пять закрашено, четыре пунктиром');
  check(tok.shape9.filled === 9 && tok.shape9.dashed === 0, 'полный закрашен весь');
  check(tok.whole.filled === 9, 'заработанный жетон рисуется целым');
  check(tok.shape0.rim >= 2 && tok.shape0.spokes >= 3,
    'скелет на месте и у пустого: ободок, дырка и три линии разлома');

  // Размен: жетон собрался, улетел, скелет вернулся с остатком.
  const fly = await page.evaluate(async () => {
    GameState.data.currencies.wrath_shard = 2;
    GameState.data.currencies.wrath_token = 0;
    GameState.data.counters = {}; GameState.bumpTotal('wrath.duel.lose', 2);
    GameState.setSinValue('wrath', GameState.maxValue('wrath'));
    const a = (await Backend.minigameResult({ sin: 'wrath', mode: 'duel', outcome: 'win' })).awarded;
    WrathMinigame.open();
    WrathMinigame.startMode('duel');
    await new Promise(r => setTimeout(r, 600));
    WrathDuel.awardPrefix = '';
    WrathDuel.showResult();
    WrathDuel.showAward(a);
    await new Promise(r => setTimeout(r, 150));
    const el = document.getElementById('wrath-token');
    const atOnce = { filled: el.querySelectorAll('path[fill^="url"]').length,
                     flying: el.classList.contains('done') };
    await new Promise(r => setTimeout(r, 1100));
    return { exchanged: !!a.exchanged, tokens: GameState.currency('wrath_token'), atOnce,
             after: { filled: el.querySelectorAll('path[fill^="url"]').length,
                      flying: el.classList.contains('done') } };
  });
  check(fly.exchanged && fly.tokens === 1, 'три осколка сложились в жетон');
  check(fly.atOnce.filled === 9 && fly.atOnce.flying,
    'собравшийся жетон показан ПОЛНЫМ и улетает в кошелёк');
  check(fly.after.filled === 2 && !fly.after.flying,
    `после полёта на скелете снова закрашен остаток: ${fly.after.filled}/9`);

  // Кошелёк лавки: жетон вместо значка со счётчиком.
  const wallet = await page.evaluate(() => {
    GameState.data.currencies.wrath_token = 2;
    WrathMinigame.startMode('shop');
    const box = document.createElement('div');
    box.innerHTML = WrathShop.walletHtml(null);
    return {
      tokens: box.querySelectorAll('.token-art').length,
      digits: (box.textContent || '').replace(/\s/g, ''),
      price: WrathShop.priceText(WRATH_GEAR.items['rusty-blade']).indexOf('token-art') !== -1
    };
  });
  check(wallet.tokens === 2, 'в кошельке два нарисованных жетона: целый и собираемый');
  check(wallet.digits === '2', `цифра в кошельке одна — число жетонов («${wallet.digits}»), дроби нет`);
  check(wallet.price, 'ценник в лавке тоже показывает нарисованный жетон');

  // Раздеваем игрока обратно.
  await page.evaluate(() => {
    GameState.data.currencies.wrath_shard = 0;
    GameState.data.counters = {};
    WrathMinigame.showLobby();
  });

  // ---------- 6c. ОБЩАЯ ШАПКА ЛОББИ ----------
  // Здоровье, характеристики и кошелёк — одни на четыре экрана греха. Раньше
  // панель бойца жила внутри лобби, а кошелёк был размазан по кнопкам
  // режимов: числами под значком лавки и ценником под значком забега.
  console.log('\n--- общая шапка ---');
  const head = await page.evaluate(async () => {
    GameState.data.currencies.wrath_token = 3;
    GameState.data.currencies.wrath_shard = 1;
    GameState.data.counters = {}; GameState.bumpTotal('wrath.duel.lose', 1);
    GameState.data.equipment = {}; GameState.data.upgrades = { damage: 0, hp: 0, regen: 0 };
    Backend.setFighterHp(6);
    WrathMinigame.open();
    const seen = {};
    const look = () => {
      const el = document.getElementById('wrath-head');
      return {
        shown: el.classList.contains('shown'),
        hp: (el.querySelector('#wrath-hp-num') || {}).textContent || '',
        chips: el.querySelectorAll('.panel-chip').length,
        wallet: el.querySelectorAll('.panel-chip.wallet .token-art').length,
        width: Math.round(el.getBoundingClientRect().width),
        top: Math.round(el.getBoundingClientRect().top)
      };
    };
    for (const mode of [null, 'shop', 'boost', 'rogue']) {
      if (mode) WrathMinigame.startMode(mode); else WrathMinigame.showLobby();
      await new Promise(r => setTimeout(r, 260));
      seen[mode || 'lobby'] = look();
    }
    WrathMinigame.startMode('duel');
    await new Promise(r => setTimeout(r, 400));
    seen.duel = look();
    return seen;
  });
  const menus = ['lobby', 'shop', 'boost', 'rogue'];
  check(menus.every(m => head[m].shown), 'шапка видна во всех четырёх меню лобби');
  check(!head.duel.shown, 'в бою шапка скрыта: там своё здоровье');
  check(menus.every(m => head[m].hp === head.lobby.hp && head.lobby.hp),
    `здоровье одно и то же во всех меню: ${head.lobby.hp}`);
  check(menus.every(m => head[m].top === head.lobby.top && head[m].width === head.lobby.width),
    'шапка не прыгает при переключении экранов');
  check(head.lobby.wallet === 2,
    'кошелёк в шапке: целый жетон со счётчиком и собираемый');

  // Кнопки режимов очищены от чисел: значок и только значок.
  const modes = await page.evaluate(async () => {
    WrathMinigame.showLobby();
    await new Promise(r => setTimeout(r, 260));
    const out = {};
    document.querySelectorAll('#wrath-lobby .mode-btn').forEach(btn => {
      out[btn.dataset.mode] = (btn.textContent || '').replace(/\s+/g, '');
    });
    return out;
  });
  check(!/\d/.test(modes.shop || ''), `на кнопке лавки нет чисел: «${modes.shop}»`);
  check(!/\d/.test(modes.rogue || ''), `на кнопке забега нет ценника: «${modes.rogue}»`);

  // Отказ по нехватке валюты отвечает шапкой — кошелька в лавке больше нет.
  const refuse = await page.evaluate(async () => {
    GameState.data.currencies.wrath_token = 0;
    WrathMinigame.startMode('shop');
    await new Promise(r => setTimeout(r, 260));
    const btn = document.querySelector('#wrath-shop .shop-item');
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 80));
    return !!document.querySelector('#wrath-head .panel-chip.wallet.lack');
  });
  check(refuse, 'не хватило жетонов — дёргается кошелёк в шапке');

  // Шапка лежит ПОВЕРХ экранов (те абсолютные во всю рамку), поэтому экраны
  // сдвинуты вниз на её высоту. Стоит забыть снять им высоту — и они вылезут
  // за низ рамки ровно на эту высоту, вместе с кнопкой возврата. Один раз так
  // и вышло, поэтому проверка постоянная.
  const fit = await page.evaluate(async () => {
    const out = {};
    for (const mode of ['lobby', 'shop', 'boost', 'rogue']) {
      if (mode === 'lobby') WrathMinigame.showLobby(); else WrathMinigame.startMode(mode);
      await new Promise(r => setTimeout(r, 300));
      const body = document.querySelector('#wrath-game .mg-body').getBoundingClientRect();
      const scr = document.querySelector('#wrath-game .wrath-screen.active');
      const outside = [...scr.querySelectorAll('button')]
        .filter(b => b.offsetParent !== null)
        .filter(b => {
          const r = b.getBoundingClientRect();
          return r.bottom > body.bottom + 1 || r.top < body.top - 1;
        })
        .map(b => (b.className || b.id || 'button'));
      out[mode] = { outside, top: Math.round(scr.getBoundingClientRect().top) };
    }
    return out;
  });
  const cut = Object.keys(fit).filter(m => fit[m].outside.length);
  check(!cut.length, cut.length
    ? `кнопки вылезли за рамку: ${cut.map(m => m + ' → ' + fit[m].outside.join(',')).join('; ')}`
    : 'ни одна кнопка не вылезла за рамку ни в одном меню');
  check(Object.keys(fit).every(m => fit[m].top === fit.lobby.top && fit.lobby.top > 100),
    `экраны начинаются под шапкой, на одной высоте: y=${fit.lobby.top}`);

  // ---------- 6d. СЛОЖНОСТЬ ЗАБЕГА ----------
  // Цена и содержимое забега живут в окне входа, там же выбирается сложность.
  console.log('\n--- сложности забега ---');
  const rogue = await page.evaluate(async () => {
    GameState.data.currencies.wrath_token = 9;
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    WrathMinigame.startMode('rogue');
    await new Promise(r => setTimeout(r, 400));
    const levels = Backend.rogueLevels();
    const rows = [];
    for (let i = 0; i < levels.length; i++) {
      const btn = document.querySelector(`.rogue-level[data-level="${i}"]`);
      if (btn) btn.click();
      await new Promise(r => setTimeout(r, 120));
      const boss = Backend.rogueEnemy({ enemy: 'boss' }, i);
      rows.push({
        chosen: Number(document.querySelector('.rogue-level.on').dataset.level),
        price: (document.getElementById('rogue-action').textContent || '').trim(),
        bossHp: boss.hp,
        card: (document.getElementById('rogue-card').textContent || '').replace(/\s+/g, ' ')
      });
    }
    // Вход на выбранной сложности: она обязана записаться в сам забег.
    const answer = Backend.startRun(2);
    return { count: levels.length, rows, started: answer.ok,
             runLevel: Backend.run() ? Backend.run().level : null,
             enemyAtRun: Backend.rogueEnemy({ enemy: 'boss' }).hp,
             enemyBase: Backend.rogueConfig().enemies.boss.hp };
  });
  check(rogue.count === 3, `сложностей три: ${rogue.count}`);

  // ---------- СТРУКТУРА ОКНА ВХОДА ----------
  // Первый вариант выкладывал четыре строки «значок плюс число» подряд, и
  // читать их было нельзя: ни одна не говорила, про что она, а один и тот же
  // значок означал в соседних строках разное. Теперь три блока, и каждый
  // держится на приёме, который читается без подписи. Проверка следит, что
  // блоки на месте и что в них ровно то, что задумано.
  const card = await page.evaluate(() => {
    const root = document.querySelector('.rogue-card.start');
    if (!root) return null;
    const vs = root.querySelectorAll('.rogue-versus .vs-side');
    const stats = [...vs].map(s => [...s.querySelectorAll('.vs-stat')].map(e => e.textContent.trim()));
    return {
      blocks: ['.rogue-levels', '.rogue-versus', '.rogue-road', '.rogue-deal']
        .filter(sel => root.querySelector(sel)).length,
      sides: vs.length,
      // Обе стороны схватки обязаны нести ОДНИ И ТЕ ЖЕ величины в одном
      // порядке — именно одинаковость строк и делает это сравнением.
      sameShape: stats.length === 2 && stats[0].length === stats[1].length
                 && stats[0].every((t, i) => t[0] === stats[1][i][0]),
      roadNodes: root.querySelectorAll('.rogue-road .road-node').length,
      mapSteps: Backend.rogueConfig().map.length,
      // На дороге развилка НЕ рисуется значком узла: там 👆, и это подсказка
      // кнопке («жми по точке»), а в ряду она читалась как «тут надо нажать».
      forkGlyph: (root.querySelector('.rogue-road .road-node.fork') || {}).textContent,
      pay: root.querySelectorAll('.deal-pay .deal-item').length,
      win: root.querySelectorAll('.deal-win .deal-item').length,
      arrow: !!root.querySelector('.deal-arrow'),
      // Цена стоит в сделке, а не на кнопке: на кнопке она была бы вторым
      // местом для одного числа.
      action: (document.getElementById('rogue-action').textContent || '').trim()
    };
  });
  check(card && card.blocks === 4, 'в окне четыре блока: сложность, схватка, дорога, сделка');
  check(card.sides === 2 && card.sameShape,
    'схватка: две стороны с одинаковыми величинами в одном порядке');
  check(card.roadNodes === card.mapSteps,
    `дорога показывает все узлы карты: ${card.roadNodes} из ${card.mapSteps}`);
  check(card.forkGlyph && card.forkGlyph !== '👆',
    `развилка на дороге не палец, а «${card.forkGlyph}»`);
  check(card.pay >= 1 && card.win >= 2 && card.arrow,
    `сделка: ${card.pay} слева, стрелка, ${card.win} справа`);
  check(!/\d/.test(card.action), `на кнопке нет цены, только «${card.action}»`);
  check(rogue.rows.every((r, i) => r.chosen === i), 'выбранная сложность подсвечена');
  check(rogue.rows[0].bossHp < rogue.rows[1].bossHp && rogue.rows[1].bossHp < rogue.rows[2].bossHp,
    `босс растёт со сложностью: ${rogue.rows.map(r => r.bossHp).join(' → ')} хп`);
  check(new Set(rogue.rows.map(r => r.card)).size === 3, 'окно перерисовывается целиком: добыча и враг едут вместе с ценой');
  check(rogue.started && rogue.runLevel === 2, `вход записал сложность в забег: ур. ${rogue.runLevel}`);
  check(rogue.enemyAtRun === rogue.rows[2].bossHp && rogue.enemyAtRun > rogue.enemyBase,
    `в идущем забеге враги той сложности, на которой вошли: ${rogue.enemyAtRun} против ${rogue.enemyBase} в таблице`);

  await page.evaluate(() => {
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    GameState.data.currencies.wrath_shard = 0;
    GameState.data.counters = {};
    WrathMinigame.showLobby();
  });

  // ---------- 7. УЗЕЛ В КОЛЕСЕ ----------
  console.log('\n--- узел гнева в колесе ---');
  const node = await page.evaluate(() => {
    const read = () => SinsMenu.read('wrath');
    GameState.setSinValue('wrath', GameState.maxValue('wrath'));   // сытый грех
    Backend.setFighterHp(10);
    const fullHp = read();
    Backend.setFighterHp(3);
    const hurt = read();
    Backend.setFighterHp(0);
    const dead = read();
    return { own: typeof SinsMenu.readers.wrath === 'function', fullHp, hurt, dead };
  });
  check(node.own, 'у гнева своя читалка, а не общее правило');
  check(node.fullHp.ready === true, 'полное здоровье при полной шкале греха — узел ГОРИТ');
  check(node.hurt.ready === false && Math.abs(node.hurt.fill - 30) < 1, 'побитый червь — узел погашен, луч налит на треть');
  check(node.dead.ready === false && node.dead.fill === 0, 'без сил — луч пуст');

  // ---------- 8–9. ЛОББИ И БОЙ ПАЛЬЦЕМ ----------
  console.log('\n--- лобби и бой ---');
  await page.evaluate(() => {
    GameState.setSinValue('wrath', GameState.maxValue('wrath'));
    Backend.setFighterHp(10);
    WrathMinigame.open();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + 'lobby.png' });

  // Полоса обязана ехать между целыми: ставим здоровье на 3 и отматываем
  // двадцать секунд — целое число ещё 3, а полоса уже уехала.
  const bar = await page.evaluate(async () => {
    Backend.setFighterHp(3);
    GameState.data.fighter.updated_at = GameTime.now() - 20000;
    WrathLobby.refreshHealth();
    const width = parseFloat(document.getElementById('wrath-hp-fill').style.width);
    const num = document.getElementById('wrath-hp-num').textContent;
    return { width, num };
  });
  check(bar.num === '3/10', 'число под полосой остаётся целым');
  check(bar.width > 30.1 && bar.width < 36, `полоса уехала за целое число: ${bar.width.toFixed(1)}%`);

  // Бой пальцем: тыкаем в зоны и в кинжал, пока бой не кончится.
  const fight = await page.evaluate(async () => {
    Backend.setFighterHp(10);
    const per = ECONOMY.exchange.wrath_shard.per;
    const shardBefore = GameState.currency('wrath_shard');
    const tokenBefore = GameState.currency('wrath_token');
    const goldBefore = GameState.currency('gold');
    WrathMinigame.startMode('duel');
    await new Promise(r => setTimeout(r, 700));
    const froze = !!GameState.data.fighter.frozen;
    let guard = 0;
    while (!WrathDuel.fightOver && guard++ < 60) {
      const btn = document.getElementById('dagger-btn');
      if (btn) btn.click();
      await new Promise(r => setTimeout(r, 120));
    }
    await new Promise(r => setTimeout(r, 900));
    return {
      froze,
      over: WrathDuel.fightOver,
      outcome: WrathDuel.outcome,
      award: (document.getElementById('wrath-award') || {}).textContent || '',
      tokenShown: (document.getElementById('wrath-token') || {}).innerHTML.length > 100,
      hpLeft: GameState.data.fighter.hp,
      // Осколки считаются вместе с жетонами: три осколка складываются в
      // жетон сами (ECONOMY.exchange), и голая разница по осколкам после
      // такого размена уходит в минус.
      shardDelta: (GameState.currency('wrath_shard') + GameState.currency('wrath_token') * per)
                - (shardBefore + tokenBefore * per),
      goldDelta: GameState.currency('gold') - goldBefore,
      // С допуском: шкала считается формулой от метки времени и за те
      // полсекунды, что идёт показ итога, успевает просесть на сотые.
      barFull: GameState.sinValue('wrath') > GameState.maxValue('wrath') - 0.5
    };
  });
  await page.screenshot({ path: out + 'duel.png' });
  check(fight.froze, 'вход в бой заморозил регенерацию');
  check(fight.over, `бой дошёл до конца, исход: ${fight.outcome}`);
  check(fight.hpLeft !== null && fight.hpLeft < 10, `здоровье осталось побитым: ${fight.hpLeft}/10`);
  check(fight.barFull, 'шкала гнева закрылась');
  if (fight.outcome === 'win') {
    check(fight.shardDelta >= 1 && fight.goldDelta > 0,
      `победа при полной шкале принесла ${fight.shardDelta} 🩸 и ${fight.goldDelta} золота`);
  } else {
    // Строка награды при поражении может быть и пустой: осколки и жетоны в
    // неё больше не пишутся числом — их показывает жетон под ней, и он же
    // единственный обязательный итог. Раньше здесь ждали непустую строку, и
    // проверка падала ровно на честном поражении без золота и без шрама.
    check(fight.tokenShown, 'итог поражения показан жетоном под строкой');
  }

  // Возврат в лобби размораживает.
  await page.evaluate(() => WrathMinigame.showLobby());
  await page.waitForTimeout(500);
  const thawed = await page.evaluate(() => !GameState.data.fighter.frozen);
  check(thawed, 'возврат в лобби разморозил регенерацию');

  console.log('');
  if (errors.length) { console.log('ОШИБКИ В КОНСОЛИ:'); errors.forEach(e => console.log('  ' + e)); }
  console.log(fail.length ? `ПРОВАЛЕНО: ${fail.length}` : 'ВСЁ ЗЕЛЁНОЕ');
  await browser.close();
  process.exit(fail.length || errors.length ? 1 : 0);
})();
