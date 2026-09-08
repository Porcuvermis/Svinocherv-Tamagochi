const { chromium } = require('playwright');

// ================= ПРОГОН: МИНИ-ПРИЛОЖЕНИЕ TELEGRAM =================
// Проверяет вторую жизнь игры — ту, которую нельзя посмотреть глазами с этой
// машины: запуск ВНУТРИ Telegram.
//
//   1. обычная страница не ходит за библиотекой Telegram вовсе (её грузят
//      только там, где она нужна, — как three.js у зависти);
//   2. в адресе есть параметры мини-приложения → мост просыпается;
//   3. окно разворачивается, вертикальный свайп-закрытие запрещён (без
//      этого рычаг автомата и хвост в ванной сворачивают приложение),
//      рамка и фон чёрные;
//   4. отдача в палец идёт через тактильный мост Telegram, а не через
//      vibrate.
//
// Клиент подделан: настоящий Telegram сюда не приедет, а проверять надо не
// его, а НАШУ сторону.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-telegram.js
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = [];
  const check = (ok, what) => { console.log((ok ? '  ok  ' : ' FAIL ') + what); if (!ok) fail.push(what); };

  // ---------- 1. ОБЫЧНАЯ СТРАНИЦА ----------
  const plain = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const asked = [];
  await plain.route('**://telegram.org/**', route => { asked.push(route.request().url()); route.abort(); });
  await plain.goto('http://127.0.0.1:8777/index.html');
  await plain.waitForTimeout(2200);
  check(asked.length === 0, 'вне Telegram за библиотекой не ходят');
  check(await plain.evaluate(() => typeof Haptics !== 'undefined' && !Haptics.tg()),
        'тактильного моста нет — отдача уходит в vibrate или в тишину');
  await plain.close();

  // ---------- 2–4. ВНУТРИ TELEGRAM ----------
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.__tg = [];
    const log = (name) => (arg) => { window.__tg.push(name + (arg !== undefined ? ':' + arg : '')); };
    window.Telegram = {
      WebApp: {
        ready: log('ready'),
        expand: log('expand'),
        disableVerticalSwipes: log('disableVerticalSwipes'),
        setHeaderColor: log('setHeaderColor'),
        setBackgroundColor: log('setBackgroundColor'),
        HapticFeedback: {
          impactOccurred: log('impact'),
          selectionChanged: log('selection'),
          notificationOccurred: log('notify')
        }
      }
    };
  });
  await page.goto('http://127.0.0.1:8777/index.html#tgWebAppData=stub&tgWebAppVersion=7.10');
  await page.waitForTimeout(2400);

  const calls = await page.evaluate(() => window.__tg.slice());
  check(calls.includes('ready') && calls.includes('expand'), 'окно развёрнуто и клиент оповещён');
  check(calls.includes('disableVerticalSwipes'),
        'вертикальный свайп не сворачивает приложение — иначе рычаг неиграбелен');
  check(calls.includes('setHeaderColor:#000000') && calls.includes('setBackgroundColor:#000000'),
        'рамка клиента чёрная, как пелена загрузки');

  // Отдача идёт через Telegram, а не через vibrate.
  // Пауза между двумя отдачами не для красоты: слой не пропускает их чаще
  // раза в 35 мс (иначе на Android это сливается в жужжание), и щелчок,
  // посланный сразу за ударом, был бы законно съеден.
  await page.evaluate(() => { window.__tg.length = 0; Haptics.impact('heavy', true); });
  await page.waitForTimeout(120);
  await page.evaluate(() => Haptics.tick());
  await page.waitForTimeout(60);
  const feel = await page.evaluate(() => window.__tg.slice());
  check(feel.includes('impact:heavy'), 'удар идёт тактильным мостом Telegram');
  check(feel.includes('selection'), 'щелчок храповика — selectionChanged, а не удар');

  console.log(fail.length ? '\nПРОВАЛЕНО: ' + fail.length : '\nвсё сошлось');
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})();
