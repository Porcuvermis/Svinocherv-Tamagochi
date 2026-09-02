const { chromium } = require('playwright');

// ============ THREE.JS ГРУЗИТСЯ ТОЛЬКО ПОД ЗАВИСТЬ ============
//
// Библиотека нужна одной мини-игре из семи, а весит 145 КБ gzip — 22% всей
// загрузки. Подключённая обычным <script>, она попадала в window.load, а до
// него держится пелена загрузки: игра дольше не показывалась ВСЕМ, включая
// тех, кто в зависть не заходит.
//
// Проверка сторожит обе половины этого решения, потому что сломать можно
// каждую по отдельности:
//   1. при обычной загрузке за библиотекой НЕ ходят — иначе лень возвращать
//      её в index.html никто не заметит;
//   2. при открытии зависти она приезжает и сцена собирается — иначе
//      «оптимизация» просто ломает мини-игру, и это тоже никто не заметит,
//      пока не откроет зависть руками.
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//     node tools/test-lazy-three.js
(async () => {
  const browser = await chromium.launch({
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const asked = [];
  page.on('request', r => { if (/three/.test(r.url())) asked.push(r.url()); });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForLoadState('load');
  await page.waitForTimeout(1800);

  const bad = [];
  const ok = (name, cond, note) => {
    console.log(`  ${cond ? 'ok  ' : 'ПЛОХО'} ${name}${note ? '   ' + note : ''}`);
    if (!cond) bad.push(name);
  };

  console.log('--- обычная загрузка ---');
  ok('за three.js не ходили', asked.length === 0, asked.join(', '));
  ok('в окне нет THREE', !(await page.evaluate(() => !!window.THREE)));
  // Пелена — то, ради чего всё и затевалось: она обязана уже уйти.
  ok('пелена загрузки снята',
     await page.evaluate(() => {
         const v = document.querySelector('.boot-veil');
         return !v || !v.classList.contains('boot-veil-on');
     }));

  console.log('\n--- открываем зависть ---');
  await page.evaluate(() => EnvyMinigame.open());
  // Ждём загрузки библиотеки и сборки сцены: это первый заход, он самый
  // медленный — грузится и библиотека, и пул образов.
  await page.waitForFunction(() => !!window.THREE, null, { timeout: 15000 })
      .catch(() => {});
  await page.waitForTimeout(2500);

  ok('за three.js сходили', asked.length > 0, asked[0] || '');
  ok('THREE появился', await page.evaluate(() => !!window.THREE));
  ok('рендерер собран', await page.evaluate(() => !!EnvyMinigame.renderer));
  ok('игра перешла в play', await page.evaluate(() => EnvyMinigame.state === 'play'));

  // Холст не должен быть пустым: собранная сцена — это ещё не нарисованная.
  //
  // Снимается СКРИНШОТОМ, а не чтением холста через drawImage. У рендерера
  // нет preserveDrawingBuffer, и после того, как кадр ушёл в композитор,
  // буфер очищен: drawImage отдаёт пустоту независимо от того, нарисовано
  // что-нибудь или нет. Первая версия этой проверки на том и попалась —
  // ругалась на исправную игру.
  const shot = await page.locator('#envy-canvas').screenshot();
  // Порог ПРОМЕРЕН, а не назначен: пустой холст того же размера даёт 2.7 КБ
  // (ровная заливка жмётся почти в ничто), собранная сцена — 360 КБ.
  // Двадцать килобайт лежат между ними с большим запасом в обе стороны.
  // Разброс байтов, который стоял тут сначала, не годится вовсе: у пустого
  // холста он 77 при пороге 60, то есть проверка пропускала бы пустоту.
  ok('на холсте что-то нарисовано', shot.length > 20000,
     `${(shot.length / 1024).toFixed(0)} КБ снимка, пустой был бы ~3 КБ`);

  console.log();
  if (errors.length) { console.log('ОШИБКИ:\n  ' + errors.join('\n  ')); bad.push('ошибки в консоли'); }
  console.log(bad.length ? `ПЛОХО: ${bad.join('; ')}` : 'ошибок нет');
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})();
