const { chromium } = require('playwright');

// ============ ЛУПА ПО КУХНЕ ============
// Снимает КУСОК кухни крупно, в заданной фазе игры. Нужна там, где общий
// снимок прогона показывает предмет размером в ноготь и по нему не понять,
// сел ли он на место: кран с лейкой, кучки на доске, полки холодильника.
//
// Запуск: node tools/zoom-kitchen.js <фаза> <x> <y> <полуразмер> <файл>
//   фазы: overview | fridge | chop | stove | pot
//   x, y — точка СЦЕНЫ, вокруг которой снимать
// Пример: node tools/zoom-kitchen.js stove 660 440 90 /tmp/z.png
(async () => {
  const [phase, sx, sy, half, out] = process.argv.slice(2);
  const browser = await chromium.launch({
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 },
                                       deviceScaleFactor: 3 });
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2200);
  await page.evaluate(() => GluttonyMinigame.open());
  await page.waitForTimeout(400);
  await page.evaluate((f) => GluttonyMinigame.setCamera(f, true), phase || 'overview');
  await page.waitForTimeout(700);

  // Точку сцены переводим в экранные координаты той же матрицей, которой
  // это делает игра: лупа обязана смотреть туда же, куда палец.
  const box = await page.evaluate(([x, y, h]) => {
    const svg = document.getElementById('kt-svg');
    const m = document.getElementById('kt-cam').getScreenCTM();
    const at = (px, py) => { const p = svg.createSVGPoint(); p.x = px; p.y = py;
                             return p.matrixTransform(m); };
    const a = at(x - h, y - h), b = at(x + h, y + h);
    return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  }, [+sx, +sy, +half]);

  await page.screenshot({ path: out || '/tmp/zoom.png', clip: box });
  console.log(`снято ${out}: фаза ${phase}, вокруг (${sx}, ${sy}), ±${half}`);
  await browser.close();
})();
