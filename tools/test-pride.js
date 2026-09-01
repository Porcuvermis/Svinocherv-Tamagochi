const { chromium } = require('playwright');

// ================= ПРОВЕРКА: ТЩЕСЛАВИЕ ПРОХОДИМО =================
// Открывает мини-игру и играет за игрока с заданной точностью: тапает в
// центр самой «горящей» зоны, а с вероятностью (1 − точность) намеренно
// мажет мимо всех зон. Меряет, сколько секунд ушло на 100% шкалы.
//
// Смысл теста ровно один: игра была НЕПРОХОДИМА (зона попадания вчетверо
// меньше кольца + ускорение тайминга), и глазами это ловилось только через
// раздражение. Числом ловится сразу — docs/plan/17-pride.md.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-pride.js 1.0     # безошибочная игра
//     node tools/test-pride.js 0.7     # средний игрок
(async () => {
  const accuracy = parseFloat(process.argv[2] || '1');
  const limitSec = parseFloat(process.argv[3] || '90');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);
  await page.evaluate(() => GameManager.handleSinAction('pride'));
  await page.waitForTimeout(1200);

  const started = Date.now();
  let taps = 0, hits = 0, maxOnScreen = 0;

  while (Date.now() - started < limitSec * 1000) {
    const shot = await page.evaluate(() => {
      const f = document.getElementById('pride-field').getBoundingClientRect();
      return {
        done: PrideMinigame.finished,
        progress: Math.round(PrideMinigame.progress),
        field: { x: f.x, y: f.y, w: f.width, h: f.height },
        radius: PRIDE_CONFIG.TAP_RADIUS,
        targets: PrideMinigame.targets.filter(t => !t.resolved)
          .sort((a, b) => a.diesAt - b.diesAt)
          .map(t => ({ x: t.x, y: t.y }))
      };
    });
    if (shot.done) break;
    maxOnScreen = Math.max(maxOnScreen, shot.targets.length);

    if (shot.targets.length) {
      const t = shot.targets[0];
      const miss = Math.random() >= accuracy;
      // Промах моделируем честно: тапаем по точке, до которой ни одна живая
      // зона не дотягивается, — так же, как мажет живой палец.
      const pt = miss
        ? { x: shot.field.x + 4, y: shot.field.y + 4 }
        : { x: shot.field.x + t.x, y: shot.field.y + t.y };
      await page.mouse.click(pt.x, pt.y);
      taps++;
      if (!miss) hits++;
    }
    await page.waitForTimeout(60);
  }

  await page.waitForTimeout(400);
  const res = await page.evaluate(() => ({
    done: PrideMinigame.finished,
    progress: Math.round(PrideMinigame.progress),
    hits: PrideMinigame.hits, misses: PrideMinigame.misses,
    // Награда идёт не отсюда, а из конфига через Backend — проверяем, что
    // событие мини-игры реально доехало до начисления.
    sin: Math.round(GameState.sinValue('pride')),
    gold: GameState.currency('gold')
  }));
  const sec = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`точность бота: ${(accuracy * 100).toFixed(0)}%   тапов: ${taps} (в зону ${hits})`);
  console.log(`зон на экране одновременно, максимум: ${maxOnScreen}`);
  console.log(`шкала: ${res.progress}%   попаданий: ${res.hits}   промахов: ${res.misses}`);
  console.log(`начислено: шкала греха ${res.sin}   золото ${res.gold}`);
  console.log(res.done ? `ПРОЙДЕНО за ${sec} с` : `НЕ пройдено за ${sec} с`);
  if (errors.length) { console.log('\nОШИБКИ:'); errors.forEach(e => console.log('  ' + e)); }

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
