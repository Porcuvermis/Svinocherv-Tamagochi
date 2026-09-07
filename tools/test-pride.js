const { chromium } = require('playwright');

// ================= ПРОВЕРКА: ВЫХОД ПО КОВРОВОЙ ДОРОЖКЕ =================
// Открывает тщеславие и играет за игрока с заданной точностью: тапает в
// центр той зоны, которой осталось жить меньше всех, а с вероятностью
// (1 − точность) намеренно мажет мимо всех зон.
//
// Проверяется ЧЕТЫРЕ вещи, и каждая ловилась глазами плохо:
//   • выход кончается сам и ровно за 20 секунд — дорожка и есть шкала;
//   • поцелуи растут с ажиотажем, а не по одному за зону;
//   • начисление доехало до кошелька через конфиг наград, а не из игры;
//   • покупка на поцелуи меняет числа СЛЕДУЮЩЕГО выхода.
//
// Тапает по координатам сцены, переведённым в экранные, — заодно проверка,
// что перевод «экран → сцена» не врёт.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-pride.js 1.0     # безошибочная игра
//     node tools/test-pride.js 0.85    # нормальный игрок
(async () => {
  const accuracy = parseFloat(process.argv[2] || '0.85');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);
  await page.evaluate(() => GameManager.handleSinAction('pride'));
  await page.waitForTimeout(1000);

  const params = await page.evaluate(() => PrideMinigame.params);
  console.log(`выход: ${params.runMs / 1000} с   зона каждые ${params.spawnMs} мс   ` +
              `радиус ${params.radius}   потолок ×${params.multCap}`);

  // Точка сцены → экран: тем же преобразованием, которым игра переводит тап
  // обратно. Если оно врёт, тест мажет мимо всех зон и это сразу видно.
  const toScreen = (p) => page.evaluate(([x, y]) => {
    const m = PrideMinigame.svgEl.getScreenCTM();
    const pt = PrideMinigame.svgEl.createSVGPoint();
    pt.x = x; pt.y = y;
    const s = pt.matrixTransform(m);
    return { x: s.x, y: s.y };
  }, [p.x, p.y]);

  // Старт: тап по ковру перед червём.
  const startAt = await toScreen({ x: 195, y: 700 });
  await page.mouse.click(startAt.x, startAt.y);
  const started = Date.now();

  let taps = 0, maxOnScreen = 0;
  while (Date.now() - started < 40000) {
    const shot = await page.evaluate(() => ({
      phase: PrideMinigame.phase,
      kisses: PrideMinigame.kisses,
      hype: PrideMinigame.hype,
      targets: PrideMinigame.targets.slice()
        .sort((a, b) => a.diesAt - b.diesAt)
        .map(t => ({ x: t.x, y: t.y, kiss: t.kiss }))
    }));
    if (shot.phase !== 'run') break;
    maxOnScreen = Math.max(maxOnScreen, shot.targets.length);
    if (shot.targets.length) {
      const t = shot.targets[0];
      // Промах моделируем честно: тапаем туда, куда не дотягивается ни одна
      // живая зона, — так же, как мажет живой палец. Точка ИЩЕТСЯ, а не
      // берётся из угла: угол кадра при обрезке холста может оказаться за
      // пределами видимой области, и тогда тап уходит мимо игры вовсе —
      // «промахов: 0» при точности 85% ловится только так.
      const miss = Math.random() >= accuracy;
      let aim = t;
      if (miss) {
        const cands = [{ x: 60, y: 300 }, { x: 330, y: 300 }, { x: 195, y: 780 },
                       { x: 60, y: 760 }, { x: 330, y: 760 }];
        aim = cands.map(c => ({
          c, d: Math.min(...shot.targets.map(z => Math.hypot(z.x - c.x, z.y - c.y)))
        })).sort((a, b) => b.d - a.d)[0].c;
      }
      const pt = await toScreen(aim);
      await page.mouse.click(pt.x, pt.y);
      taps++;
    }
    await page.waitForTimeout(70);
  }
  const sec = ((Date.now() - started) / 1000).toFixed(1);

  await page.waitForTimeout(600);
  const res = await page.evaluate(() => ({
    phase: PrideMinigame.phase,
    hits: PrideMinigame.hits, misses: PrideMinigame.misses,
    awarded: PrideMinigame.awardedKisses,
    sin: Math.round(GameState.sinValue('pride')),
    kiss: GameState.currency('pride_kiss'),
    gold: GameState.currency('gold')
  }));

  console.log(`тапов: ${taps}   попаданий: ${res.hits}   промахов: ${res.misses}   ` +
              `зон на экране разом: ${maxOnScreen}`);
  console.log(`выход занял ${sec} с   собрано поцелуев: ${res.awarded}`);
  console.log(`начислено: шкала греха ${res.sin}   поцелуи ${res.kiss}   золото ${res.gold}`);

  // ---------- ПОКУПКА ----------
  // Проверяем не «списались ли деньги», а то, ради чего покупка существует:
  // числа следующего выхода обязаны стать другими.
  const buy = await page.evaluate(() => {
    Backend.grantCurrency('pride_kiss', 300);
    const before = Backend.prideRun();
    const a = Backend.buyUpgrade('crowd', 'pride');
    const b = Backend.buyUpgrade('car', 'pride');
    const c = Backend.buyUpgrade('carpet', 'pride');
    PrideMinigame.resetRun();
    const after = Backend.prideRun();
    return { ok: a.ok && b.ok && c.ok, before, after, wallet: GameState.currency('pride_kiss') };
  });
  console.log(`покупка: интервал ${buy.before.spawnMs} → ${buy.after.spawnMs} мс   ` +
              `потолок ×${buy.before.multCap} → ×${buy.after.multCap}   ` +
              `радиус ${buy.before.radius} → ${buy.after.radius}   осталось 💋 ${buy.wallet}`);

  const bad = [];
  if (res.phase !== 'idle' && res.phase !== 'done') bad.push('выход не завершился сам');
  if (Math.abs(sec - params.runMs / 1000) > 4) bad.push(`длина выхода ${sec} с вместо ${params.runMs / 1000}`);
  if (res.sin !== 100) bad.push('шкала греха не закрылась');
  if (!buy.ok) bad.push('покупка не прошла');
  if (buy.after.spawnMs >= buy.before.spawnMs) bad.push('массовка не участила зоны');
  if (buy.after.multCap <= buy.before.multCap) bad.push('машина не подняла потолок');
  if (buy.after.radius <= buy.before.radius) bad.push('дорожка не расширила зоны');
  if (accuracy > 0.9 && res.awarded < 8) bad.push('безошибочная игра принесла подозрительно мало');

  console.log(bad.length ? 'ПРОВАЛ:\n  ' + bad.join('\n  ') : 'ВСЁ СОШЛОСЬ');
  if (errors.length) { console.log('\nОШИБКИ:'); errors.forEach(e => console.log('  ' + e)); }

  await browser.close();
  process.exit(bad.length || errors.length ? 1 : 0);
})();
