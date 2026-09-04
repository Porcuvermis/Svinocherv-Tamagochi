const { chromium } = require('playwright');

// ============ АУДИТ ВАННОЙ: КАЖДЫЙ ПРЕДМЕТ ОТДЕЛЬНО ============
//
// Запечённое из трёхмерного нельзя оценить по коду: сломанная модель и
// целая выглядят в тексте одинаково. Здесь предметы снимаются ПО ОДНОМУ на
// нейтральном фоне — так видно и развал, и дыры, и незакрытые торцы, и
// гранёный край, которые в общей сцене прячутся друг за другом.
//
// Стандарт, к которому идём (по нему и смотреть):
//   1. ЗАМКНУТОСТЬ — предмет не просвечивает и не показывает изнанку.
//   2. ОДНА ФИГУРА — читается целым, а не набором кусков.
//   3. ОБЪЁМ — есть светлая и тёмная сторона, а не одна заливка.
//   4. СИЛУЭТ — узнаётся по контуру, без деталей внутри.
//   5. КРАЙ — не гранёный: обводка идёт ровно, без зубцов и разрывов.
//   6. ЗАКОНЧЕННОСТЬ — нет обрубленных труб, висящих в воздухе концов и
//      торчащих за габарит хвостов.
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//     node tools/audit-bath.js /tmp/bath-
(async () => {
  const out = process.argv[2] || '/tmp/bath-';
  const browser = await chromium.launch({
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 800, height: 1400 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8777/tools/audit-bath.html');
  await page.waitForTimeout(250);

  const names = await page.evaluate((s) => sheet(s), 250);
  await page.waitForTimeout(150);
  await page.screenshot({ path: out + 'sheet.png', fullPage: true });
  console.log('контактный лист:', names.join(', '));

  // Крупно — то, что просили или всё подряд.
  const want = process.argv.slice(3);
  for (const name of (want.length ? want : names)) {
    const box = await page.evaluate((n) => one(n), name);
    await page.waitForTimeout(120);
    const el = await page.$('svg');
    await el.screenshot({ path: out + name + '.png' });
    console.log(`  ${name.padEnd(9)} габарит ${box.x},${box.y} ${box.w}×${box.h}`);
  }

  console.log(errors.length ? 'ОШИБКИ:\n  ' + errors.join('\n  ') : 'ошибок нет');
  await browser.close();
})();
