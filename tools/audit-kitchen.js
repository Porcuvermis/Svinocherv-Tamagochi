const { chromium } = require('playwright');
const fs = require('fs');

// ============ АУДИТ КУХНИ: ПРЕДМЕТ ОТДЕЛЬНО, ПОТОМ ВМЕСТЕ ============
//
// Проверка подгонки (check-kitchen-fit.js) считает, ГДЕ предмет стоит.
// Она ничего не знает о том, как он ВЫГЛЯДИТ: не развалился ли на куски, не
// торчит ли лишнее, не просвечивает ли сквозь сцену дыра.
//
// Здесь предметы снимаются по одному на ядовито-розовом фоне, а потом
// собираются послойно. Розовый в палитре не встречается, поэтому:
//   • розовое ВНУТРИ собранной сцены = дыра, там ничего не нарисовано;
//   • число несвязных кусков у одиночного предмета = развалился ли он;
//   • габарит рисунка против объявленного box = торчит ли за свою рамку.
//
// Разбор снимков — tools/audit-kitchen.py.
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//     node tools/audit-kitchen.js /tmp/audit-
(async () => {
  const out = process.argv[2] || '/tmp/audit-';
  const browser = await chromium.launch({
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 780, height: 1600 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8777/tools/audit-kitchen.html');
  await page.waitForTimeout(300);

  const meta = { objects: [], order: [] };

  // ---------- 1. КАЖДЫЙ ПРЕДМЕТ ОТДЕЛЬНО ----------
  // Рамка снимка НЕ равна объявленному box: вокруг оставляется поле, иначе
  // то, что торчит за рамку, окажется просто обрезано, и торчание не увидеть.
  const names = await page.evaluate(() => Object.keys(KITCHEN_OBJECTS)
      .filter(k => KITCHEN_OBJECTS[k] && KITCHEN_OBJECTS[k].box && KITCHEN_OBJECTS[k].draw));
  for (const name of names) {
    const info = await page.evaluate((n) => {
      const o = KITCHEN_OBJECTS[n], b = o.box;
      const pad = Math.max(12, Math.round(Math.max(b.w, b.h) * 0.12));
      const box = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
      const scale = Math.min(4, Math.max(1, 620 / Math.max(box.w, box.h)));
      const size = window.show(o.draw(), box, scale);
      return { box, scale, size, declared: b, pad, parts: o.parts || 1 };
    }, name);
    await page.locator('#stage').screenshot({ path: `${out}obj-${name}.png` });
    meta.objects.push(Object.assign({ name }, info));
  }

  // ---------- 2. ПОСЛОЙНАЯ СБОРКА ----------
  // Кадр после каждого добавленного предмета: так видно, кто кого перекрыл
  // не в том порядке и где между ними осталась щель.
  const order = await page.evaluate(() => KITCHEN_OBJECTS.ORDER || []);
  for (let i = 0; i < order.length; i++) {
    await page.evaluate((n) => {
      const parts = (KITCHEN_OBJECTS.ORDER || []).slice(0, n + 1)
          .map(k => KITCHEN_OBJECTS[k] ? KITCHEN_OBJECTS[k].draw() : '').join('\n');
      window.show(parts, { x: 0, y: -60, w: 720, h: 1560 }, 0.5);
    }, i);
    await page.locator('#stage').screenshot({ path: `${out}step-${String(i).padStart(2, '0')}-${order[i]}.png` });
  }
  meta.order = order;

  // ---------- 2а. ПЕРЕДНИЙ ПЛАН ----------
  // Доска и нож живут в координатах стейджа и в склад не входят, поэтому в
  // разбор предметов не попадали вовсе. А ломаются они так же: у ножа
  // расходился стык клинка с рукоятью.
  await page.evaluate(() => {
      window.show(KITCHEN_ART.foreground(), { x: 0, y: 0, w: 390, h: 844 }, 1.6);
      const svg = document.getElementById('stage');
      // В разметке доска и нож спрятаны за краем: ставим их в видимое место.
      const b = svg.querySelector('#kt-board'), k = svg.querySelector('#kt-knife');
      if (b) b.setAttribute('transform', 'translate(195 220)');
      if (k) { k.setAttribute('opacity', '1');
               k.setAttribute('transform', 'translate(300 560)'); }
  });
  await page.locator('#stage').screenshot({ path: `${out}foreground.png` });

  // ---------- 3. СОБРАННАЯ ИГРОВАЯ СЦЕНА ----------
  // Та самая разметка, что уходит в игру, — со всеми игровыми слоями.
  await page.evaluate(() => {
    window.show(KITCHEN_ART.scene(), { x: 0, y: -60, w: 720, h: 1560 }, 1);
  });
  await page.locator('#stage').screenshot({ path: `${out}scene.png` });

  fs.writeFileSync(out + 'meta.json', JSON.stringify(meta, null, 1));
  console.log(`снято: ${names.length} предметов, ${order.length} шагов сборки, сцена`);
  if (errors.length) { console.log('ОШИБКИ:'); errors.forEach(e => console.log('  ' + e)); }
  await browser.close();
})();
