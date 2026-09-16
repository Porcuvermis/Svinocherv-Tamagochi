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
    WrathMinigame.startFight('duel');
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

  // Жетон в кошельке и в ценнике — НАРИСОВАННЫЙ, а не системный значок.
  //
  // Проверялось это раньше через WrathShop.walletHtml — сборку кошелька
  // внутри лавки. Кошелёк оттуда уехал в общую шапку ещё правкой 170, а
  // функция осталась жить: её никто не звал, кроме вот этой проверки. Прогон,
  // который держит мёртвый код живым, хуже отсутствующего — он врёт, что
  // проверяет игру. Меряется теперь то, что на экране: сама шапка.
  const wallet = await page.evaluate(() => {
    GameState.data.currencies.wrath_token = 2;
    WrathMinigame.startMode('shop');
    const panel = document.getElementById('wrath-panel');
    const chips = panel.querySelectorAll('.panel-chip.wallet');
    // Строка обмена шрамов живёт на экране прокачки — её надо открыть.
    WrathMinigame.startMode('boost');
    const scarsRow = (document.getElementById('boost-scars') || {}).innerHTML || '';
    WrathMinigame.startMode('shop');
    return {
      tokens: panel.querySelectorAll('.panel-chip.wallet .token-art').length,
      digits: [...chips].map(c => (c.textContent || '').replace(/\s/g, '')).join(),
      price: WrathShop.priceText(WRATH_GEAR.items['rusty-blade']).indexOf('token-art') !== -1,
      // Обмен шрамов — последнее место в грехе, где жетон был системным
      // билетиком 🎟 вместо нарисованной эмблемы.
      scars: scarsRow
    };
  });
  check(wallet.tokens === 2, 'в кошельке два нарисованных жетона: целый и собираемый');
  check(wallet.digits === '2,', `цифра в кошельке одна — число жетонов («${wallet.digits}»), дроби нет`);
  check(wallet.price, 'ценник в лавке тоже показывает нарисованный жетон');
  check(wallet.scars.indexOf('token-art') >= 0 && wallet.scars.indexOf('🎟') < 0,
    'обмен шрамов тоже рисует жетон, а не системный билетик');

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
    WrathMinigame.startFight('duel');
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

  // ---------- ОБЩИЙ ПОДВАЛ ----------
  // Пара к шапке: сверху — кто ты, снизу — куда пойти. Ряд режимов и кнопка
  // возврата стоят на одном месте во всех меню; раньше режимы жили внутри
  // лобби, а «назад» было своё у каждого экрана и переезжало от экрана к
  // экрану. Проверка следит за ОБОИМИ свойствами: подвал есть везде и не
  // прыгает.
  const foot = await page.evaluate(async () => {
    const seen = {};
    const look = () => {
      const el = document.getElementById('wrath-foot');
      const box = el.getBoundingClientRect();
      const modes = {};
      el.querySelectorAll('.mode-btn').forEach(b => {
        modes[b.dataset.mode] = (b.textContent || '').replace(/\s+/g, '');
      });
      return {
        shown: el.classList.contains('shown'),
        modes,
        lit: [...el.querySelectorAll('.mode-btn.on')].map(b => b.dataset.mode).join(),
        // Кнопки «назад» здесь нет вовсе: между меню ходят режимами.
        back: !!document.getElementById('wrath-foot-back'),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width)
      };
    };
    for (const mode of [null, 'shop', 'boost', 'rogue']) {
      if (mode) WrathMinigame.startMode(mode); else WrathMinigame.showLobby();
      await new Promise(r => setTimeout(r, 260));
      seen[mode || 'lobby'] = look();
    }
    WrathMinigame.startFight('duel');
    await new Promise(r => setTimeout(r, 400));
    seen.duel = look();
    WrathMinigame.showLobby();
    await new Promise(r => setTimeout(r, 260));
    return seen;
  });
  check(menus.every(m => foot[m].shown), 'подвал с режимами виден во всех четырёх меню');
  check(!foot.duel.shown, 'в бою подвал скрыт: уходить посреди размена нельзя');
  check(menus.every(m => foot[m].bottom === foot.lobby.bottom
                      && foot[m].width === foot.lobby.width),
    'подвал не прыгает при переключении экранов');
  check(menus.every(m => !foot[m].back),
    'кнопки «назад» в подвале нет: между меню ходят самими режимами');
  // Лобби — это меню БОЯ, поэтому в нём горит ⚔️: отдельного пункта «лобби»
  // в ряду нет.
  check(foot.lobby.lit === 'duel' && foot.shop.lit === 'shop' && foot.rogue.lit === 'rogue',
    `горит тот режим, в котором игрок: лобби «${foot.lobby.lit}», лавка «${foot.shop.lit}»`);

  // Главное, ради чего подвал и заводился: из лавки можно уйти прямо в
  // забег, не заходя по дороге в лобби. Раньше ряд режимов был внутри лобби,
  // и другого пути не было вовсе.
  //
  // И второе, ради чего убрали «назад»: кнопка ⚔️ открывает МЕНЮ боя, а не
  // бой. Пока она бросала драться сразу, промах по соседней кнопке стоил
  // здоровья, а оно набирается минутами.
  const hop = await page.evaluate(async () => {
    WrathMinigame.startMode('shop');
    await new Promise(r => setTimeout(r, 260));
    document.querySelector('#wrath-foot .mode-btn[data-mode="rogue"]').click();
    await new Promise(r => setTimeout(r, 300));
    const direct = WrathMinigame.current;
    Backend.setFighterHp(10);
    document.querySelector('#wrath-foot .mode-btn[data-mode="duel"]').click();
    await new Promise(r => setTimeout(r, 320));
    const menu = WrathMinigame.current;
    const fightBtn = document.getElementById('wrath-fight');
    const ready = !!fightBtn && !fightBtn.classList.contains('locked');
    fightBtn.click();
    await new Promise(r => setTimeout(r, 600));
    const fighting = WrathMinigame.current;

    // Без сил кнопка боя заперта, а кнопка режима — нет: посмотреть на своего
    // бойца можно и побитым, драться нельзя.
    WrathDuel.leave();
    WrathMinigame.showLobby();
    Backend.setFighterHp(0);
    WrathLobby.refreshHealth();
    await new Promise(r => setTimeout(r, 200));
    const deadLocked = document.getElementById('wrath-fight').classList.contains('locked');
    const tabFree = !document.querySelector('#wrath-foot .mode-btn[data-mode="duel"]')
                        .classList.contains('locked');
    document.getElementById('wrath-fight').click();
    await new Promise(r => setTimeout(r, 200));
    const stayed = WrathMinigame.current;
    Backend.setFighterHp(10);
    WrathLobby.refreshHealth();
    return { direct, menu, ready, fighting, deadLocked, tabFree, stayed };
  });
  check(hop.direct === 'rogue', `из лавки прямо в забег, без захода в лобби: «${hop.direct}»`);
  check(hop.menu === 'lobby', `кнопка ⚔️ открывает меню боя, а не бой: «${hop.menu}»`);
  check(hop.ready && hop.fighting === 'duel', 'бой начинается кнопкой в лобби, и только ею');
  check(hop.deadLocked && hop.tabFree,
    'без сил заперта кнопка боя, а кнопка режима открыта: на бойца можно смотреть побитым');
  check(hop.stayed === 'lobby', `запертая кнопка в бой не пускает: «${hop.stayed}»`);

  // Кнопки режимов очищены от чисел: значок и только значок.
  check(!/\d/.test(foot.lobby.modes.shop || ''), `на кнопке лавки нет чисел: «${foot.lobby.modes.shop}»`);
  check(!/\d/.test(foot.lobby.modes.rogue || ''), `на кнопке забега нет ценника: «${foot.lobby.modes.rogue}»`);

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
      const footBox = document.getElementById('wrath-foot').getBoundingClientRect();
      const headBox = document.getElementById('wrath-head').getBoundingClientRect();
      out[mode] = { outside, top: Math.round(scr.getBoundingClientRect().top),
                    bottom: Math.round(scr.getBoundingClientRect().bottom),
                    headBottom: Math.round(headBox.bottom),
                    footTop: Math.round(footBox.top) };
    }
    return out;
  });
  const cut = Object.keys(fit).filter(m => fit[m].outside.length);
  check(!cut.length, cut.length
    ? `кнопки вылезли за рамку: ${cut.map(m => m + ' → ' + fit[m].outside.join(',')).join('; ')}`
    : 'ни одна кнопка не вылезла за рамку ни в одном меню');
  // Сверяется с РЕАЛЬНЫМ низом шапки, а не с порогом «больше ста»: высота
  // шапки кладётся в css из замера, и стоит померить её в экранных пикселях
  // вместо единиц сцены — на айфоне, где масштаб не единица, экран съедет.
  // Ровно это и случилось; ловится только прогоном с SVINO_VIEWPORT.
  check(Object.keys(fit).every(m => fit[m].top === fit.lobby.top
                                 && Math.abs(fit[m].top - fit[m].headBottom) <= 2),
    `экраны начинаются ровно под шапкой, на одной высоте: y=${fit.lobby.top}`);
  // И кончаются НАД подвалом. Один раз уже вышло, что экрану сдвинули только
  // верх, а высоту оставили прежней, и он вылез за рамку; с подвалом та же
  // ошибка прячет ряд режимов под содержимым.
  check(Object.keys(fit).every(m => fit[m].bottom <= fit[m].footTop + 1),
    `экраны кончаются над подвалом: низ ${fit.lobby.bottom}, подвал с ${fit.lobby.footTop}`);

  // ---------- ФОН ЭКРАНА ----------
  // У каждого режима своё место, и фон — не украшение: он объясняет, ГДЕ
  // игрок и что здесь делают, без единого слова. Проверка следит за тремя
  // вещами, каждая из которых уже ломала эту игру в другом месте: фон есть
  // везде и разный, он не крутит анимаций (закрытые мини-игры однажды
  // красили сцену каждый кадр — docs/traps.md, пп. 36–38) и не ловит пальцы.
  console.log('\n--- фоны экранов ---');
  const back = await page.evaluate(async () => {
    const seen = {};
    for (const mode of ['lobby', 'shop', 'boost', 'rogue', 'duel']) {
      // В бой — только startFight: кнопка режима ⚔️ теперь открывает МЕНЮ боя
      // (то самое лобби), и через неё до арены не добраться.
      if (mode === 'lobby') WrathMinigame.showLobby();
      else if (mode === 'duel') WrathMinigame.startFight('duel');
      else WrathMinigame.startMode(mode);
      await new Promise(r => setTimeout(r, 320));
      const el = document.getElementById('wrath-backdrop');
      const svg = el.querySelector('svg');
      const box = el.getBoundingClientRect();
      seen[mode] = {
        has: !!svg,
        len: el.innerHTML.length,
        // Ни одного кадра: ни SMIL, ни css-анимации, ни фильтра, ни маски.
        moving: el.querySelectorAll('animate,animateTransform,animateMotion').length,
        heavy: el.querySelectorAll('filter,mask,clipPath').length,
        // Тап в середину фона обязан дойти до того, что под ним.
        taps: document.elementFromPoint(box.left + box.width / 2,
                                        box.top + box.height / 2) === el,
        text: (el.textContent || '').trim()
      };
    }
    WrathMinigame.showLobby();
    await new Promise(r => setTimeout(r, 260));
    return seen;
  });
  const modes5 = ['lobby', 'shop', 'boost', 'rogue', 'duel'];
  check(modes5.every(m => back[m].has && back[m].len > 400), 'фон есть на всех пяти экранах');
  check(new Set(modes5.map(m => back[m].len)).size === 5,
    `у каждого режима фон свой: ${modes5.map(m => back[m].len).join(' / ')} знаков`);
  check(modes5.every(m => !back[m].moving && !back[m].heavy),
    'фон статический: ни анимаций, ни фильтров, ни масок');
  check(modes5.every(m => !back[m].taps), 'фон не перехватывает тап');
  check(modes5.every(m => !back[m].text), 'на фоне нет ни одной буквы');

  const closed = await page.evaluate(async () => {
    WrathMinigame.close();
    await new Promise(r => setTimeout(r, 200));
    const el = document.getElementById('wrath-backdrop');
    const empty = !el.innerHTML;
    WrathMinigame.open();
    await new Promise(r => setTimeout(r, 400));
    return { empty, back: !!document.querySelector('#wrath-backdrop svg') };
  });
  check(closed.empty, 'закрытый грех сносит свой фон, а не держит его в дереве');
  check(closed.back, 'повторный вход собирает фон заново');

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

  // Забег, открытый ради проверки входа, сворачивается: окно входа проверяется
  // в том же виде, в каком его видит игрок перед забегом.
  await page.evaluate(async () => {
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    WrathMinigame.startMode('rogue');
    await new Promise(r => setTimeout(r, 300));
  });

  // ---------- ОКНО ВХОДА: ОГОНЬКИ, СУНДУК, ЦЕНА ----------
  // Первый вариант выкладывал четыре строки «значок плюс число» подряд, второй —
  // три блока со схваткой и дорогой. Оба читались только после объяснения.
  // Теперь в окне ровно три предмета и у каждого одна роль: огоньки — выбор,
  // СУНДУК — добыча (он говорит «здесь награда» сам, как во всех играх),
  // кнопка — цена. Числа спрятаны внутрь сундука и показываются по нажатию.
  const card = await page.evaluate(() => {
    const root = document.querySelector('.rogue-card.start');
    if (!root) return null;
    return {
      levels: root.querySelectorAll('.rogue-level').length,
      chest: !!root.querySelector('.rogue-chest svg'),
      // В закрытом окне НЕТ ни одной цифры: всё, что можно посчитать, лежит в
      // сундуке и на кнопке. Иначе снова получится ряд «значок плюс число».
      digits: /\d/.test(root.textContent || ''),
      kids: root.children.length,
      action: (document.getElementById('rogue-action').textContent || '').trim()
    };
  });
  check(card && card.levels === 3 && card.chest, 'в закрытом окне только огоньки и сундук');
  check(card && card.kids === 2 && !card.digits, 'в закрытом окне ни одной цифры: числа внутри сундука');
  check(card && /\d/.test(card.action), `цена стоит на кнопке входа: «${card.action}»`);

  // ---------- ЧТО В СУНДУКЕ ----------
  // По нажатию сундук открывается и показывает то, что игрок ГАРАНТИРОВАННО
  // унесёт за полный проход: жетон, золото и мясо. Мясо — то же самое, что
  // лежит в холодильнике кухни, и рисуется тем же рисунком.
  const chest = await page.evaluate(async () => {
    const rows = [];
    for (let i = 0; i < 3; i++) {
      document.querySelector(`.rogue-level[data-level="${i}"]`).click();
      const open = document.querySelector('.rogue-card.chest')
        || (document.getElementById('rogue-chest').click(), document.querySelector('.rogue-card.chest'));
      rows.push({
        // Сложность переключается ПРЯМО В ОТКРЫТОМ сундуке: игрок сравнивает
        // добычу, закрывать его ради этого незачем.
        stillOpen: !!document.querySelector('.rogue-card.chest'),
        chosen: Number(document.querySelector('.rogue-level.on').dataset.level),
        items: open.querySelectorAll('.loot-row').length,
        meat: !!open.querySelector('.loot-meat'),
        text: (open.querySelector('.loot-list').textContent || '').replace(/\s+/g, ' ').trim()
      });
    }
    document.getElementById('rogue-chest-close').click();
    return { rows, closed: !!document.querySelector('.rogue-card.start') };
  });
  check(chest.rows.every(r => r.stillOpen && r.chosen === chest.rows.indexOf(r)),
    'сложность переключается в открытом сундуке, он не захлопывается');
  check(chest.rows.every(r => r.items >= 3 && r.meat),
    `в сундуке жетон, золото и мясо: ${chest.rows[0].items} строки`);
  check(new Set(chest.rows.map(r => r.text)).size === 3,
    `добыча растёт со сложностью: ${chest.rows.map(r => r.text).join(' | ')}`);
  check(chest.closed, 'нажатие на открытый сундук закрывает его');

  check(rogue.rows.every((r, i) => r.chosen === i), 'выбранная сложность подсвечена');
  check(rogue.rows[0].bossHp < rogue.rows[1].bossHp && rogue.rows[1].bossHp < rogue.rows[2].bossHp,
    `босс растёт со сложностью: ${rogue.rows.map(r => r.bossHp).join(' → ')} хп`);
  check(rogue.started && rogue.runLevel === 2, `вход записал сложность в забег: ур. ${rogue.runLevel}`);
  check(rogue.enemyAtRun === rogue.rows[2].bossHp && rogue.enemyAtRun > rogue.enemyBase,
    `в идущем забеге враги той сложности, на которой вошли: ${rogue.enemyAtRun} против ${rogue.enemyBase} в таблице`);

  // ---------- МЯСО ДОЕЗЖАЕТ ДО КУХНИ ----------
  // Сундук обещает мясо — значит, победа над боссом обязана положить его в ту
  // же кладовую, из которой берёт холодильник кухни. Своего мяса кухня не
  // заводит (src/config/kitchen.js): гнев — единственный его источник, и до
  // этой правки обещание висело невыполненным.
  const meat = await page.evaluate(() => {
    GameState.data.pantry = {};
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    Backend.startRun(0);
    const cfg = Backend.rogueConfig();
    const out = { dropped: 0, line: '' };
    // Прогоняется вся карта: узлы, у которых в награде есть кладовая, обязаны
    // её наполнить, остальные — не трогать. Предложенное усиление берётся
    // сразу: пока оно висит, дорога дальше не идёт.
    let guard = 0;
    while (Backend.run() && guard++ < 30) {
      const run = Backend.run();
      const node = run.map[run.node];
      // На развилке берётся первый ОТКРЫТЫЙ путь: закрытый не выбирается и
      // здесь, иначе прогон спорил бы с правилом самой развилки.
      const pick = node && node.kind === 'fork'
        ? (node.options || []).findIndex(o => o && !o.locked) : undefined;
      const answer = Backend.resolveNode('win', pick);
      if (!answer.ok) break;
      if (answer.gained && answer.gained.pantry) {
        out.dropped += Object.values(answer.gained.pantry).reduce((a, b) => a + b, 0);
        out.line = WrathRogue.gainText(answer.gained);
      }
      if (answer.finished) break;
      // В pending теперь живут три разные вещи: выбор усиления, витрина
      // магазина и событие. Прогон закрывает любую — иначе забег встанет.
      const pend = Backend.run() && Backend.run().pending;
      if (pend && pend.kind === 'shop') Backend.closeRogueShop();
      else if (pend && pend.kind === 'event') Backend.takeRogueEvent(0);
      else if (pend) Backend.chooseBoost(pend.choices[0]);
    }
    out.pantry = Object.assign({}, GameState.data.pantry);
    // Кухня читает ту же кладовую — если мясо там, оно уже в холодильнике.
    out.fridge = Object.keys(out.pantry).filter(k => KITCHEN.ingredients[k]);
    return out;
  });
  check(meat.dropped >= 2, `за полный забег выпало мяса: ${meat.dropped} куска`);
  check((meat.pantry.pork || 0) >= 2, `мясо лежит в кладовой: ${JSON.stringify(meat.pantry)}`);
  check(meat.fridge.includes('pork'), 'кладовая с мясом — та самая, из которой берёт холодильник кухни');
  check(/\+\d/.test(meat.line) && /svg|🥩/.test(meat.line), 'выпавшее мясо показано в строке итога узла');

  await page.evaluate(() => {
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    GameState.data.currencies.wrath_shard = 0;
    GameState.data.counters = {};
    WrathMinigame.showLobby();
  });

  // ---------- РАЗВИЛКА: ПРИВАЛ, МАГАЗИН, СОБЫТИЕ ----------
  // Полгода два пути из трёх стояли закрытыми, и развилка была не выбором, а
  // лишним шагом. Проверка следит за тем, что все три работают и что каждый
  // из них — РАЗМЕН, а не подарок.
  console.log('\n--- развилка забега ---');
  const fork = await page.evaluate(async () => {
    GameState.data.currencies.wrath_token = 9;
    GameState.data.currencies.gold = 0;
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    Backend.startRun(0);
    for (let i = 0; i < 2; i++) {
      Backend.resolveNode('win');
      const p = Backend.run().pending;
      if (p && p.kind === 'boost') Backend.chooseBoost(p.choices[0]);
    }
    const run = Backend.run();
    const step = run.map[run.node];
    const kinds = (step.options || []).map(o => o.kind);
    const open = (step.options || []).filter(o => !o.locked).length;

    // ---------- МАГАЗИН ----------
    const items = ECONOMY.minigames.wrath.rogue.shop.items;
    Backend.resolveNode('win', kinds.indexOf('shop'));
    const shop = Backend.run().pending;
    const offer = (shop.offer || []).slice();
    const teethBefore = Backend.run().teeth;
    // Витрина НЕ перекатывается: она считается из сида забега, иначе «выйти и
    // зайти, пока не выпадет нужное» стало бы основной механикой магазина.
    const again = Backend.rogueShopOffer(Backend.run(), shop.step).join();

    // Здоровье роняется: перевязка на полной полосе не продаётся вовсе
    // (пустая вещь — ловушка, а не выбор), и покупка бы не состоялась.
    Backend.run().hp = 5;
    const cheap = offer.slice().sort((a, b) => items[a].price - items[b].price)[0];
    const empty = Backend.rogueEffectEmpty(
        Object.assign({}, Backend.run(), { hp: 20, maxHp: 20 }), items[cheap].effect);
    const buy = Backend.buyRogueItem(cheap);
    const twice = Backend.buyRogueItem(cheap);
    const dear = offer.find(id => id !== cheap && items[id].price > Backend.run().teeth);
    const poor = dear ? Backend.buyRogueItem(dear) : { error: 'no_dear' };
    const teethAfter = Backend.run().teeth;
    Backend.closeRogueShop();
    const shopClosed = !Backend.run().pending;

    // ---------- СОБЫТИЕ ----------
    // Вторая развилка. Здоровье роняется в единицу: событие обязано взять
    // цену, но НЕ убить — умереть от нажатия на картинку, не увидев боя, за
    // жетон нельзя.
    let guard = 0;
    while (Backend.run() && Backend.run().map[Backend.run().node].kind !== 'fork' && guard++ < 10) {
      const a = Backend.resolveNode('win');
      if (!a.ok) break;
      const p = Backend.run() && Backend.run().pending;
      if (p && p.kind === 'boost') Backend.chooseBoost(p.choices[0]);
    }
    const run2 = Backend.run();
    const eventAt = (run2.map[run2.node].options || []).findIndex(o => o.kind === 'event');
    run2.hp = 1;
    Backend.resolveNode('win', eventAt);
    // Событие подменяется на ТО, ЧТО БЕРЁТ ЗДОРОВЬЕ: выпади случайно то, что
    // здоровье даёт, проверка «не убивает» прошла бы ни о чём.
    Backend.run().pending.id = 'altar';
    const ev = Backend.run().pending;
    const conf = ECONOMY.minigames.wrath.rogue.events[ev.id];
    const goldBefore = GameState.currency('gold');
    const hpBefore = Backend.run().hp;
    const took = Backend.takeRogueEvent(0);
    const after = Backend.run();

    return {
      kinds, open,
      shop: {
        size: offer.length, stable: again === offer.join(),
        bought: buy.ok, twice: twice.error, poor: poor.error,
        spent: teethBefore - teethAfter, price: items[cheap].price,
        gained: buy.gained, closed: shopClosed, empty
      },
      event: {
        id: ev.id, options: (conf.options || []).length,
        ok: took.ok, gained: took.gained,
        hpBefore, hp: after.hp, pending: !!after.pending,
        gold: GameState.currency('gold') - goldBefore
      }
    };
  });

  check(fork.kinds.join() === 'shop,heal,event' && fork.open === 3,
    `на развилке три открытых пути: ${fork.kinds.join(' / ')}`);
  check(fork.shop.size === 3, `в витрине три вещи: ${fork.shop.size}`);
  check(fork.shop.stable, 'витрина не перекатывается: она считается из сида забега');
  check(fork.shop.bought && fork.shop.spent === fork.shop.price,
    `покупка списала ровно цену: ${fork.shop.spent} зубов`);
  check(!!(fork.shop.gained && (fork.shop.gained.healed || fork.shop.gained.damage
        || fork.shop.gained.armor)), 'покупка что-то дала, а не просто списала зубы');
  check(fork.shop.twice === 'sold_out', `вещь в витрине одна: «${fork.shop.twice}»`);
  check(fork.shop.poor === 'not_enough' || fork.shop.poor === 'no_dear',
    `не по карману — отказ: «${fork.shop.poor}»`);
  check(fork.shop.closed, 'из магазина выходят отдельным шагом, и он закрывается');
  check(fork.shop.empty, 'перевязка на полном здоровье не продаётся: пустая вещь — ловушка');

  check(fork.event.options === 2, `у события два варианта: ${fork.event.options}`);
  check(fork.event.ok && !fork.event.pending, 'выбор варианта закрывает событие сразу');
  check(fork.event.hp >= 1,
    `событие не убивает: было ${fork.event.hpBefore} хп, стало ${fork.event.hp}`);
  check(!!(fork.event.gained && (fork.event.gained.damage || fork.event.gained.armor
        || fork.event.gained.healed || fork.event.gained.teeth || fork.event.gold)),
    'событие — размен: за цену что-то дают');

  // ---------- КАРТА БЕЗ МУСОРА ----------
  // Под каждой точкой стояла строка чисел, и на восьми узлах это была таблица
  // поверх дорожки. Чем опасен узел, говорит теперь его РАЗМЕР.
  const map = await page.evaluate(async () => {
    // Забег заводится заново: к концу прошлого все рядовые узлы пройдены, а
    // пройденные сжаты до одного размера — лестницу угрозы по ним не видно.
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    GameState.data.currencies.wrath_token = 9;
    Backend.startRun(0);
    WrathMinigame.startMode('rogue');
    await new Promise(r => setTimeout(r, 400));
    // Мерятся НЕПРОЙДЕННЫЕ точки: пройденные сжимаются все до одного
    // размера, и лестница угрозы по ним не читается.
    const size = (sel) => {
      const el = document.querySelector('.rogue-node.' + sel + ':not(.done):not(.skipped) .rogue-node-dot');
      return el ? Math.round(el.getBoundingClientRect().width) : 0;
    };
    return {
      labels: document.querySelectorAll('.rogue-node-label').length,
      digits: /\d/.test(document.getElementById('rogue-nodes').textContent || ''),
      fight: size('fight'), miniboss: size('miniboss'), boss: size('boss'),
      ring: !!document.querySelector('.rogue-node.current')
    };
  });
  check(!map.labels && !map.digits, 'на карте ни одной подписи и ни одной цифры');
  check(map.boss > map.miniboss && map.miniboss > map.fight,
    `опасность узла — его размер: рядовой ${map.fight}, мини-босс ${map.miniboss}, босс ${map.boss}`);
  check(map.ring, 'текущая точка на карте есть и она нажимается');

  // ---------- КОШЕЛЁК В ШАПКЕ ЖИВОЙ ----------
  // Шапка целиком пересобирается только при СМЕНЕ ЭКРАНА, и из этого следовала
  // прямая ложь: жетон списан, а в шапке старое число. Заметнее всего на входе
  // в забег — там экран не меняется вовсе, и враньё висело до перехода.
  console.log('\n--- кошелёк в шапке ---');
  const purse = await page.evaluate(async () => {
    const head = () => {
      const el = document.querySelector('#wrath-panel .panel-chip.wallet[data-cur="wrath_token"] b');
      return el ? Number(el.textContent) : null;
    };
    GameState.data.currencies.wrath_token = 5;
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    WrathMinigame.showLobby();
    await new Promise(r => setTimeout(r, 300));
    WrathMinigame.startMode('rogue');
    await new Promise(r => setTimeout(r, 400));
    const before = head();

    // ВХОД В ЗАБЕГ. Экран не меняется — значит шапка обязана подновиться сама.
    WrathRogue.start();
    await new Promise(r => setTimeout(r, 200));
    const entry = { state: GameState.currency('wrath_token'), head: head() };

    // ПОКУПКА В ЛАВКЕ. Тот же случай: экран остаётся тем же.
    GameState.data.currencies.wrath_token = 9;
    WrathMinigame.startMode('shop');
    await new Promise(r => setTimeout(r, 300));
    const beforeBuy = GameState.currency('wrath_token');
    const btn = document.querySelector('#wrath-shop .shop-item');
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 200));
    const buy = { state: GameState.currency('wrath_token'), head: head(), spent: beforeBuy };

    // Покупка снимается обратно. Надетый предмет поднимает МАКСИМУМ здоровья,
    // а проверки ниже считают бойца голым («полное здоровье» у них 10 из 10) —
    // и падали бы не из-за своей поломки, а из-за чужой покупки.
    GameState.data.equipment = {};
    return { before, entry, buy };
  });
  check(purse.before === 5, `до входа в шапке настоящее число: ${purse.before}`);
  check(purse.entry.head === purse.entry.state,
    `вход в забег списал жетон И в шапке: ${purse.entry.head} при ${purse.entry.state} в состоянии`);
  check(purse.buy.state < purse.buy.spent && purse.buy.head === purse.buy.state,
    `покупка в лавке видна в шапке сразу: ${purse.buy.head} при ${purse.buy.state} в состоянии`);

  // ---------- БРОСИТЬ ЗАБЕГ ТОЛЬКО УДЕРЖАНИЕМ ----------
  // Двух тапов оказалось мало: взведённое состояние висело без срока, а на
  // телефоне два тапа подряд по одному месту случаются сами собой. Забег с
  // жетоном терялся от промаха.
  console.log('\n--- бросить забег ---');
  await page.evaluate(async () => {
    GameState.data.currencies.wrath_token = 9;
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    Backend.startRun(0);
    WrathMinigame.startMode('rogue');
    await new Promise(r => setTimeout(r, 400));
  });
  await page.waitForTimeout(300);
  const flagAt = await page.evaluate(() => {
    const r = document.getElementById('rogue-abandon').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  // Пальцем, а не через код: проверяется именно жест.
  await page.mouse.click(flagAt.x, flagAt.y);
  await page.waitForTimeout(250);
  const afterTap = await page.evaluate(() => !!Backend.run());

  await page.mouse.move(flagAt.x, flagAt.y);
  await page.mouse.down();
  await page.waitForTimeout(500);
  const filling = await page.evaluate(() =>
    document.getElementById('rogue-abandon').classList.contains('holding'));
  await page.mouse.up();
  await page.waitForTimeout(300);
  const afterShort = await page.evaluate(() => !!Backend.run());

  await page.mouse.move(flagAt.x, flagAt.y);
  await page.mouse.down();
  await page.waitForTimeout(1900);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterHold = await page.evaluate(() => !!Backend.run());

  check(afterTap, 'случайный тап по флагу забег НЕ бросает');
  check(filling, 'удержание видно: кнопка наливается, пока палец на месте');
  check(afterShort, 'отпустил раньше времени — забег цел');
  check(!afterHold, 'полное удержание бросает забег');

  // Палец УЕХАЛ с кнопки, не отпуская. Проверка отдельная, потому что чинится
  // это не pointerleave: на касании браузер молча захватывает указатель за
  // элементом, и leave не приходит до самого отпускания. На мыши отмена
  // работала бы, а на телефоне уехавший палец всё равно бросал бы забег.
  await page.evaluate(async () => {
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    GameState.data.currencies.wrath_token = 9;
    Backend.startRun(0);
    WrathRogue.render();
    await new Promise(r => setTimeout(r, 200));
  });
  const flagBox = await page.evaluate(() => {
    const r = document.getElementById('rogue-abandon').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  });
  await page.mouse.move(flagBox.x, flagBox.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.move(flagBox.x - flagBox.w * 2, flagBox.y);
  await page.waitForTimeout(1600);
  await page.mouse.up();
  await page.waitForTimeout(250);
  check(await page.evaluate(() => !!Backend.run()),
    'палец уехал с кнопки, не отпуская, — забег цел');

  // ---------- ИНСПЕКЦИЯ: ДЫРЫ, НАЙДЕННЫЕ ВЫЧИТКОЙ ----------
  // Пять разных мест, и общее у них одно: все работали «почти». Ни одно не
  // ловилось прежними проверками, потому что каждое проявляется только на
  // краю — на пальце, на медленном ответе, на пустом кошельке.
  console.log('\n--- полировка гнева ---');

  // 1. ОТКАЗ НА ВХОДЕ В ЗАБЕГ. Кнопка входа при нехватке была ВЫКЛЮЧЕНА:
  //    тап не доходил вообще, и игрок жал на приглушённую кнопку впустую.
  const entryRefuse = await page.evaluate(async () => {
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    GameState.data.currencies.wrath_token = 0;
    WrathMinigame.startMode('rogue');
    await new Promise(r => setTimeout(r, 400));
    const btn = document.getElementById('rogue-action');
    const dead = btn.disabled;
    btn.click();
    await new Promise(r => setTimeout(r, 120));
    return {
      dead,
      poor: btn.classList.contains('poor'),
      flashed: !!document.querySelector('#wrath-panel .panel-chip.wallet.lack'),
      started: !!Backend.run()
    };
  });
  check(!entryRefuse.dead && entryRefuse.poor, 'кнопка входа нажимается даже без жетона, но приглушена');
  check(entryRefuse.flashed, 'не хватило жетона — вспыхивает жетон в шапке, а не тишина');
  check(!entryRefuse.started, 'забег при этом не начался');

  // 2. УДЕРЖАНИЕ НА ЧЕРВЕ. Палец уехал с червя, не отпуская, — прокачка
  //    открываться не должна. На КАСАНИИ pointerleave не приходит до самого
  //    отпускания, поэтому ловится это координатами (docs/traps.md, п. 90).
  await page.evaluate(async () => {
    GameState.data.currencies.wrath_token = 9;
    Backend.setFighterHp(10);
    WrathMinigame.showLobby();
    await new Promise(r => setTimeout(r, 400));
  });
  const wormAt = await page.evaluate(() => {
    const r = WrathLobby.wormBox.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), top: Math.round(r.y) };
  });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }]
  });
  await touch('touchStart', wormAt.x, wormAt.y);
  await page.waitForTimeout(200);
  await touch('touchMove', wormAt.x, wormAt.top - 60);
  await page.waitForTimeout(1700);
  await touch('touchEnd', wormAt.x, wormAt.top - 60);
  await page.waitForTimeout(200);
  check(await page.evaluate(() => WrathMinigame.current) === 'lobby',
    'палец уехал с червя, не отпуская, — прокачка не открылась');

  // 3. ОТДАЧА В ПАЛЕЦ В БОЮ. Считается не «завибрировало ли» (в браузере это
  //    не проверить), а что игра её ЗАПРОСИЛА. До правки бой молчал целиком.
  const buzz = await page.evaluate(async () => {
    window.__h = [];
    const t = Haptics.tick.bind(Haptics), i = Haptics.impact.bind(Haptics), n = Haptics.notify.bind(Haptics);
    Haptics.tick = () => { window.__h.push('tick'); t(); };
    Haptics.impact = (k, f) => { window.__h.push('impact:' + (k || '')); i(k, f); };
    Haptics.notify = (k, f) => { window.__h.push('notify:' + (k || '')); n(k, f); };

    Backend.setFighterHp(10);
    WrathMinigame.startFight('duel');
    await new Promise(r => setTimeout(r, 500));
    const zone = document.querySelector('.zone-hit.player-zone');
    if (zone) zone.click();
    const afterZone = window.__h.slice();

    let guard = 0;
    const rounds = [];
    while (!WrathDuel.fightOver && guard++ < 60) {
      const before = window.__h.length;
      document.getElementById('dagger-btn').click();
      await new Promise(r => setTimeout(r, 120));
      const added = window.__h.slice(before).filter(x => x.indexOf('impact:') === 0);
      if (added.length) rounds.push(added.length);
    }
    await new Promise(r => setTimeout(r, 400));
    const all = window.__h.slice();
    Haptics.tick = t; Haptics.impact = i; Haptics.notify = n;
    return {
      zone: afterZone.indexOf('tick') >= 0,
      // Ровно одна отдача на раунд: в раунде бьют оба, и две вибрации подряд
      // читаются сбоем, а не двумя ударами.
      perRound: rounds.every(n => n === 1) && rounds.length > 0,
      outcome: all.some(x => x === 'notify:success' || x === 'notify:error' || x === 'impact:rigid')
    };
  });
  check(buzz.zone, 'выбор зоны отдаёт щелчком в палец');
  check(buzz.perRound, 'в бою ровно одна отдача на раунд, а не по одной на каждый удар');
  check(buzz.outcome, 'исход боя отдаёт в палец отдельно от размена');

  // 4. ПРОСРОЧЕННЫЙ СЛЕПОК СОПЕРНИКА. Соперник приходит ОТВЕТОМ, и ответ
  //    может доехать, когда бой уже другой: ушёл из драки, зашёл снова — и
  //    припозднившийся ответ перезапускал ИДУЩИЙ бой с чужим соперником.
  const stale = await page.evaluate(async () => {
    WrathMinigame.showLobby();
    await new Promise(r => setTimeout(r, 200));
    Backend.setFighterHp(10);
    const orig = Backend.getOpponent.bind(Backend);
    let n = 0;
    Backend.getOpponent = (mode) => {
      const id = ++n;
      // Первый ответ задерживается — как будто сеть тормознула.
      return orig(mode).then(a => id === 1 ? new Promise(r => setTimeout(() => r(a), 500)) : a);
    };
    GameState.data.counters = {};
    WrathMinigame.startFight('duel');
    await new Promise(r => setTimeout(r, 60));
    WrathMinigame.showLobby();
    await new Promise(r => setTimeout(r, 60));
    WrathMinigame.startFight('duel');
    await new Promise(r => setTimeout(r, 900));      // просроченный ответ доехал
    Backend.getOpponent = orig;
    // Счётчик боёв растёт в restartFight. Перезапуск от чужого ответа виден
    // по нему: боёв было бы два вместо одного.
    return GameState.totalCounter('wrath.duel.fights');
  });
  check(stale === 1, `просроченный ответ не перезапускает идущий бой: боёв ${stale}`);

  await page.evaluate(async () => {
    WrathDuel.leave();
    WrathMinigame.showLobby();
    await new Promise(r => setTimeout(r, 200));
  });

  // ---------- БРОШЕННЫЙ ЗАБЕГ НЕ ПОДСТАВЛЯЕТ ПЛАТЯЩУЮ КНОПКУ ----------
  // Живой случай: игрок жмякал белым флагом раз за разом и потратил все
  // жетоны. Флаг стоит в одной строке с кнопкой действия и при отсутствии
  // забега ПРОПАДАЛ вместе со своим местом — кнопка входа растягивалась с 316
  // до 370 и вставала ровно под палец, который только что держал флаг. А на
  // экране без забега кнопка действия — это ВХОД, то есть платящая.
  //
  // Проверяется обе половины починки: место флага держится, и брошенный забег
  // кончается итоговым окном, где платящей кнопки нет вовсе.
  console.log('\n--- брошенный забег ---');
  const dropped = await page.evaluate(async () => {
    GameState.data.currencies.wrath_token = 5;
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    Backend.startRun(0);
    WrathRogue.summary = null;
    WrathMinigame.startMode('rogue');
    await new Promise(r => setTimeout(r, 400));
    const fr = document.getElementById('rogue-abandon').getBoundingClientRect();
    const spot = { x: fr.x + fr.width / 2, y: fr.y + fr.height / 2 };
    const wide = Math.round(document.getElementById('rogue-action').getBoundingClientRect().width);

    WrathRogue.takeAbandon(Backend.abandonRun());
    await new Promise(r => setTimeout(r, 200));
    const el = document.elementFromPoint(spot.x, spot.y);
    return {
      spot,
      tokens: GameState.currency('wrath_token'),
      summary: !!WrathRogue.summary,
      // Ширина кнопки действия не изменилась — значит место флага на месте.
      same: Math.round(document.getElementById('rogue-action').getBoundingClientRect().width) === wide,
      under: el ? (el.id || el.className) : null
    };
  });
  check(dropped.summary, 'брошенный забег кончается итоговым окном, а не экраном входа');
  check(dropped.same, 'место флага держится: кнопка входа не растягивается под палец');
  check(dropped.under !== 'rogue-action',
    `под пальцем после броска не платящая кнопка, а «${dropped.under}»`);

  // И то же самое пальцем: пять тапов по месту флага не стоят ни жетона.
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(dropped.spot.x, dropped.spot.y);
    await page.waitForTimeout(90);
  }
  const afterSpam = await page.evaluate(() => ({
    tokens: GameState.currency('wrath_token'), run: !!Backend.run()
  }));
  check(afterSpam.tokens === dropped.tokens && !afterSpam.run,
    `пять тапов по месту флага не стоили ничего: ${dropped.tokens} → ${afterSpam.tokens}`);

  await page.evaluate(async () => {
    WrathRogue.summary = null;
    WrathMinigame.showLobby();
    await new Promise(r => setTimeout(r, 200));
  });

  // ---------- КОШЕЛЁК ГОВОРИТ САМ ----------
  // Три отдельные жалобы, и все три про одно: экран сообщал о деньгах и о
  // противнике где попало, а не там, где игрок на это смотрит.
  console.log('\n--- кошелёк говорит сам ---');
  const walletFx = await page.evaluate(async () => {
    GameState.data.currencies.wrath_token = 5;
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    WrathRogue.summary = null;
    WrathMinigame.startMode('rogue');
    await new Promise(r => setTimeout(r, 350));

    document.getElementById('rogue-action').click();
    await new Promise(r => setTimeout(r, 200));

    const fly = document.querySelector('.wallet-fx-item');
    const chip = document.querySelector('[data-cur="wrath_token"]');
    const flyBox = fly && fly.getBoundingClientRect();
    const chipBox = chip && chip.getBoundingClientRect();
    const out = {
      // Цифра вылетела, и вылетела ИЗ КОШЕЛЬКА, а не из середины экрана.
      flew: !!fly,
      text: fly ? fly.textContent.replace(/\s+/g, '') : '',
      seen: !!fly && getComputedStyle(fly).visibility !== 'hidden'
            && flyBox.width > 0 && flyBox.height > 0,
      nearChip: !!(flyBox && chipBox)
        && Math.abs((flyBox.top + flyBox.height / 2) - (chipBox.top + chipBox.height / 2)) < 40,
      // И НЕ ПОВЕРХ него: цифра, закрывшая изменившееся число, бесполезна.
      overlaps: !!(flyBox && chipBox)
        && flyBox.left < chipBox.right - 2 && flyBox.right > chipBox.left + 2,
      // Строки-сообщения под картой больше нет вовсе.
      messageRow: !!document.getElementById('rogue-message')
    };

    // Кнопка узла: только значок, никаких чисел противника.
    const run = Backend.run();
    WrathRogue.render();
    await new Promise(r => setTimeout(r, 120));
    const act = document.getElementById('rogue-action');
    out.actionText = act.textContent.replace(/\s+/g, ' ').trim();
    out.actionDigits = /\d/.test(out.actionText);

    // Бой узла: флаг обязан уйти вместе со своим экраном.
    WrathRogue.enterNode(run.node);
    await new Promise(r => setTimeout(r, 900));
    const flag = document.getElementById('rogue-abandon');
    const fb = flag.getBoundingClientRect();
    out.screen = WrathMinigame.current;
    out.flagHidden = getComputedStyle(flag).visibility === 'hidden';
    out.underFlag = (() => {
      const el = document.elementFromPoint(fb.x + fb.width / 2, fb.y + fb.height / 2);
      return el ? (el.id || el.className || '') : '';
    })();
    return out;
  });

  check(walletFx.flew && walletFx.seen,
    `трата показана в кошельке: «${walletFx.text}»`);
  check(walletFx.nearChip, 'цифра вылетела ИЗ кошелька, а не из середины экрана');
  check(!walletFx.overlaps, 'цифра стоит РЯДОМ со счётчиком, а не поверх него');
  check(!walletFx.messageRow, 'строки-сообщения под картой больше нет');
  check(!walletFx.actionDigits,
    `на кнопке узла только значок, без чисел противника: «${walletFx.actionText}»`);
  check(walletFx.screen === 'duel' && walletFx.flagHidden,
    'в бою флага «сдаться» нет: он ушёл вместе со своим экраном');
  check(walletFx.underFlag.indexOf('rogue') < 0,
    `на месте флага в бою не кнопка забега, а «${walletFx.underFlag}»`);

  // ---------- КАРТОЧКА ЗАБЕГА ВИДНА НА ЭКРАНЕ ----------
  // Проверка меряется КОРОБКОЙ на экране, а не разметкой. Разметка карточки
  // собиралась исправно и класс `shown` вешался — а правило, которое этот
  // класс включает, было снесено при чистке мёртвого css. Погасло сразу пять
  // экранов: вход со сложностями, выбор усиления, лавка, событие и итог.
  // Прогоны при этом оставались зелёными (docs/traps.md, п. 95).
  console.log('\n--- карточка поверх карты видна ---');
  const cardStates = await page.evaluate(async () => {
    const box = () => {
      const r = document.getElementById('rogue-card').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    const out = {};
    GameState.data.currencies.wrath_token = 9;
    if (GameState.data.runs) delete GameState.data.runs.wrath;
    WrathRogue.summary = null;
    WrathMinigame.startMode('rogue');
    await new Promise(r => setTimeout(r, 300));
    out.start = box();

    Backend.startRun(0);
    const run = Backend.run();

    run.pending = { kind: 'boost', choices: Object.keys(Backend.rogueConfig().boosts || {}).slice(0, 2) };
    WrathRogue.render();
    out.boost = box();

    run.pending = { kind: 'shop', step: 0, offer: Backend.rogueShopOffer(run, 0), bought: [] };
    WrathRogue.render();
    out.shop = box();

    run.pending = { kind: 'event', step: 0, id: Backend.rogueEventPick(run, 0) };
    WrathRogue.render();
    out.event = box();

    run.pending = null;
    WrathRogue.takeAbandon(Backend.abandonRun());
    out.summary = box();
    return out;
  });
  Object.keys(cardStates).forEach(name => {
    const b = cardStates[name];
    check(b.w > 100 && b.h > 100,
      `карточка «${name}» занимает место на экране: ${b.w}×${b.h}`);
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
    WrathMinigame.startFight('duel');
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
