const { chromium } = require('playwright');
const { viewport, prepare } = require('./harness');

// ================= ПРОГОН: ГНЕВ — НАГРАДА И ЗАРАСТАНИЕ =================
// Проверяет ровно то, что чинилось правкой «победа платит всегда, а темп
// держит зарастание»:
//
//   1. победа в бою платит при ПОЛНОЙ шкале гнева (порог голода у боя снят);
//   2. поражение при полной шкале тоже засчитывается — «каждое третье»
//      считает все поражения, а не только те, что при просевшей шкале;
//   3. порог голода при этом жив у остальных грехов (проверяется тщеславием);
//   4. зарастание идёт ДОЛЕЙ от максимума в минуту: полная полоса за десять
//      минут и у голого червя, и у прокачанного;
//   5. прокачка ветки зарастания ускоряет ровно во столько, во сколько
//      обещает конфиг;
//   6. в бою зарастание заморожено, в лобби — размораживается;
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
  console.log('\n--- зарастание ---');
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
    const full = 1 / W.regenSharePerMinute;      // минут до полной полосы
    const levels = W.upgrades.regen.levels.map((step, i) => {
      GameState.data.upgrades.regen = i + 1;
      const share = W.regenSharePerMinute + step.bonus;
      const got = after(1, W.baseHp);
      return { level: i + 1, share, minutesToFull: 1 / share, hpInMinute: got };
    });
    GameState.data.upgrades.regen = 0;
    return {
      fullMinutes: full,
      baseHalf: after(full / 2, W.baseHp),           // половина срока — половина полосы
      baseFull: after(full, W.baseHp),
      baseOver: after(full * 3, W.baseHp),           // потолок не пробивается
      bigHalf: after(full / 2, 23),                  // прокачанный: та же доля
      bigFull: after(full, 23),
      levels
    };
  });
  const eps = 0.05;
  check(Math.abs(regen.baseHalf - 5) < eps, `за полсрока набежала половина полосы (${regen.baseHalf.toFixed(2)}/10)`);
  check(Math.abs(regen.baseFull - 10) < eps, `полная полоса за ${regen.fullMinutes} мин`);
  check(regen.baseOver === 10, 'сверх максимума не набегает');
  check(Math.abs(regen.bigHalf - 11.5) < eps * 3, `у бойца на 23 хп за тот же полсрока — половина полосы (${regen.bigHalf.toFixed(2)}/23)`);
  check(Math.abs(regen.bigFull - 23) < eps * 3, 'полная полоса за те же 10 мин при любом максимуме');
  regen.levels.forEach(l => {
    const want = l.share * 10;                       // хп за минуту при базовых 10
    check(Math.abs(l.hpInMinute - want) < eps,
      `ветка зарастания, ур. ${l.level}: ${(l.share * 100).toFixed(0)}%/мин — полная полоса за ${l.minutesToFull.toFixed(2).replace(/\.00$/, '')} мин`);
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
  check(frozen.inFight === 2, 'в бою здоровье не зарастает даже за час');
  check(Math.abs(frozen.afterLobby - 5) < eps, 'после возврата в лобби отсчёт пошёл заново');

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
  check(fight.froze, 'вход в бой заморозил зарастание');
  check(fight.over, `бой дошёл до конца, исход: ${fight.outcome}`);
  check(fight.hpLeft !== null && fight.hpLeft < 10, `здоровье осталось побитым: ${fight.hpLeft}/10`);
  check(fight.barFull, 'шкала гнева закрылась');
  if (fight.outcome === 'win') {
    check(fight.shardDelta >= 1 && fight.goldDelta > 0,
      `победа при полной шкале принесла ${fight.shardDelta} 🩸 и ${fight.goldDelta} золота`);
  } else {
    check(fight.award.length > 0, `итог показан строкой награды: «${fight.award}»`);
  }

  // Возврат в лобби размораживает.
  await page.evaluate(() => WrathMinigame.showLobby());
  await page.waitForTimeout(500);
  const thawed = await page.evaluate(() => !GameState.data.fighter.frozen);
  check(thawed, 'возврат в лобби разморозил зарастание');

  console.log('');
  if (errors.length) { console.log('ОШИБКИ В КОНСОЛИ:'); errors.forEach(e => console.log('  ' + e)); }
  console.log(fail.length ? `ПРОВАЛЕНО: ${fail.length}` : 'ВСЁ ЗЕЛЁНОЕ');
  await browser.close();
  process.exit(fail.length || errors.length ? 1 : 0);
})();
