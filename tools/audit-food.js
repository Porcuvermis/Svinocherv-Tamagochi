const { chromium } = require('playwright');
const fs = require('fs');

// ============ АУДИТ ПРОДУКТОВ ============
//
// Продукты — единственное на кухне, чего в референсе НЕТ: их нельзя снять
// пипеткой, их приходится придумывать. Значит и проверять их надо иначе,
// чем предметы склада.
//
// Продукт живёт не сам по себе, а на ТРЁХ фонах, и каждый ставит своё
// условие:
//   • полка холодильника — светло-голубая, почти белая. Здесь продукт
//     выбирают, и здесь он обязан читаться силуэтом;
//   • разделочная доска — светлое дерево. Сюда его кладут перед нарезкой;
//   • бульон в кастрюле — тёмный и тёплый. Сюда падают кучки.
// Продукт, читаемый на полке и пропадающий в бульоне, — это брак, который
// одним снимком не поймать: на полке всё хорошо.
//
// Снимается каждый продукт на каждом фоне плюс отдельно на ядовито-розовом
// (для силуэта и габарита). Разбор — tools/audit-food.py.
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//     node tools/audit-food.js /tmp/food-
(async () => {
  const out = process.argv[2] || '/tmp/food-';
  const browser = await chromium.launch({
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8777/tools/audit-kitchen.html');
  await page.waitForTimeout(300);

  // Фоны — ровно те, на которых продукт оказывается в игре.
  const grounds = await page.evaluate(() => ({
      shelf: PALETTE.kitchenScene.inside.shelf,
      board: PALETTE.kitchenScene.board[500],
      broth: PALETTE.kitchen.broth[500],
      none:  '#ff00ff'
  }));

  const keys = await page.evaluate(() => KITCHEN_ART.FOOD_KEYS
      || ['pork', 'potato', 'carrot', 'tomato', 'berry', 'herb', 'pepper', 'block']);

  const meta = { keys, grounds, items: [], piles: [] };

  // ---------- 1. ПРОДУКТ ОТДЕЛЬНО, НА КАЖДОМ ФОНЕ ----------
  // Окно шире продукта: то, что вылезло за габарит, должно быть видно, а не
  // обрезано рамкой.
  const BOX = { x: -80, y: -80, w: 160, h: 160 };
  for (const key of keys) {
    for (const g of Object.keys(grounds)) {
      await page.evaluate(([k, col, box, bare]) => {
        document.body.style.background = col;
        const svg = document.getElementById('stage');
        svg.style.background = col;
        // На розовом продукт снимается БЕЗ мягкой тени: по этому снимку
        // строится маска, а тень размывает край и подменяет собой контур.
        window.show((bare ? '<style>.kt-shade{display:none}</style>' : '')
                    + KITCHEN_ART.ingredient(k, 11), box, 4);
      }, [key, grounds[g], BOX, g === 'none']);
      await page.locator('#stage').screenshot({ path: `${out}${g}-${key}.png` });
    }
    meta.items.push({ key });
  }

  // ---------- 2. КУЧКИ НАРЕЗАННОГО ----------
  // Кучка — не продукт: это НЕСКОЛЬКО рамп сразу, и проверяется у неё
  // другое — различимы ли составляющие. Одноцветная каша означает, что по
  // блюду не прочитать, из чего оно.
  const PILE = { x: -120, y: -70, w: 240, h: 140 };
  for (const [name, ks, stage] of [['half', ['pork', 'potato', 'herb'], 1],
                                   ['fine', ['pork', 'potato', 'herb'], 2],
                                   ['block', ['block'], 2]]) {
    for (const g of ['board', 'broth', 'none']) {
      await page.evaluate(([keys, st, col, box]) => {
        document.body.style.background = col;
        const svg = document.getElementById('stage');
        svg.style.background = col;
        window.show(KITCHEN_ART.chopped(keys, st, 17), box, 4);
      }, [ks, stage, grounds[g], PILE]);
      await page.locator('#stage').screenshot({ path: `${out}pile-${g}-${name}.png` });
    }
    meta.piles.push({ name, keys: ks, stage });
  }

  // ---------- 3. ОБЩИЙ ЛИСТ ----------
  // Все продукты рядом на полке: так видно, не слиплись ли два в один цвет.
  await page.evaluate(([ks, col]) => {
    document.body.style.background = col;
    const svg = document.getElementById('stage');
    svg.style.background = col;
    const row = ks.map((k, i) =>
        `<g transform="translate(${90 + i * 150} 90)">${KITCHEN_ART.ingredient(k, 11)}</g>`)
        .join('');
    window.show(row, { x: 0, y: 0, w: 150 * ks.length + 30, h: 180 }, 2.4);
  }, [keys, grounds.shelf]);
  await page.locator('#stage').screenshot({ path: `${out}sheet.png` });

  fs.writeFileSync(`${out}meta.json`, JSON.stringify(meta, null, 1));
  console.log(`снято: ${keys.length} продуктов на ${Object.keys(grounds).length} фонах,`
      + ` ${meta.piles.length} кучки`);
  if (errors.length) console.log('ОШИБКИ:\n  ' + errors.join('\n  '));
  await browser.close();
})();
