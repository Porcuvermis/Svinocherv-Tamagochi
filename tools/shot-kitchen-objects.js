const { chromium } = require('playwright');

// ================= СНИМКИ СКЛАДА ПРЕДМЕТОВ КУХНИ =================
// Рисует три картинки: склад, собранную сцену и сверку с референсом.
// Правка, которую не сравнили с референсом наложением, не проверена.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/shot-kitchen-objects.js /tmp/ko-
(async () => {
  const out = process.argv[2] || '/tmp/ko-';
  const browser = await chromium.launch({
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 780, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:8777/tools/kitchen-objects.html');
  await page.waitForTimeout(400);
  // Шапка липкая и налезает на снимок сцены. Не прячем её (кнопки нужны
  // для переключения режимов), а лишаем липкости.
  await page.addStyleTag({ content: 'header { position: static }' });
  console.log(await page.textContent('#count'));

  await page.locator('#shelf').screenshot({ path: out + 'shelf.png' });

  await page.click('#b-scene');
  await page.waitForTimeout(200);
  await page.locator('#stage').screenshot({ path: out + 'scene.png' });

  await page.click('#b-diff');
  await page.waitForTimeout(200);
  await page.locator('#stage').screenshot({ path: out + 'diff.png' });

  if (errors.length) { console.log('ОШИБКИ:'); errors.forEach(e => console.log('  ' + e)); }
  else console.log('ошибок нет');
  await browser.close();
})();
