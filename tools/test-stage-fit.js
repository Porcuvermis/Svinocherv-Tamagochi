const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const harness = require('./harness');

// ============ ПРОВЕРКА: ВСЁ ЛИ ПОМЕЩАЕТСЯ В ХОЛСТ ============
// Инвариант 11: игра живёт в холсте 390×844, который Stage.apply() ВПИСЫВАЕТ
// в видимую область целиком. Значит раскладка от устройства не зависит —
// и вот ровно это здесь и проверяется, потому что однажды зависела.
//
// ---------- ЧТО СЛУЧИЛОСЬ ----------
// Внутри холста стояли env(safe-area-inset-*): отступ под чёлку у шапки окна
// мини-игры и под нижнюю кромку у рамки. На компьютере они нулевые, и всё
// выглядело правильно во ВСЕХ прогонах. На айфоне в Telegram они не нулевые,
// и тело окна становилось на сотню единиц ниже — а svg сцены растянут по
// ширине (preserveAspectRatio="slice") и срезается сверху и снизу ровно на
// эту разницу. В саду под кромку уходила полка с инструментами.
//
// Ошибка двойная: холст УЖЕ вписан в безопасную область (Stage.viewport
// вычитает и чёлку, и шапку клиента Telegram), а второй отступ считается в
// настоящих пикселях устройства — при масштабе холста 0.85 отступ в 47 px
// съедает 55 единиц сцены. Разбор — docs/traps.md, п. 134.
//
// ---------- ПОЭТОМУ ПРОВЕРОК ДВЕ ----------
//   А. В стилях внутри холста нет ни одного env(safe-area-inset-*). Это
//      проверка ПО ПОСТРОЕНИЮ: она ловит возврат ошибки, даже если на
//      машине разработчика безопасные зоны нулевые и глазами не видно
//      ничего.
//   Б. Всё, что обязано быть видно, лежит внутри СРЕЗАННОЙ области svg с
//      запасом. Срез никуда не делся — он свойство «slice», — просто
//      теперь он постоянный, и в него надо укладываться.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-stage-fit.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/stage-fit-';
  const root = path.join(__dirname, '..');
  const say = console.log;
  let bad = 0;
  const check = (ok, text) => { say((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) bad++; };

  // ---------- А. НИ ОДНОГО env(safe-area) В СТИЛЯХ ХОЛСТА ----------
  // Ищем только в ЗНАЧЕНИЯХ: в комментариях это слово встречается там, где
  // объясняется, почему его нет, и запрещать его там бессмысленно.
  say('');
  say('======== А. БЕЗОПАСНЫЕ ЗОНЫ ВНУТРИ ХОЛСТА ========');
  const cssFiles = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      if (e.name === 'node_modules' || e.name.startsWith('.')) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.css')) cssFiles.push(full);
    });
  })(root);

  const guilty = [];
  cssFiles.forEach(file => {
    const text = fs.readFileSync(file, 'utf8');
    // Убираем комментарии — в них про env говорить можно и нужно.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '');
    code.split('\n').forEach((line, i) => {
      if (/env\(\s*safe-area-inset/.test(line)) {
        guilty.push(path.relative(root, file) + ':' + (i + 1) + ' ' + line.trim());
      }
    });
  });
  say(`  просмотрено файлов стилей: ${cssFiles.length}`);
  check(guilty.length === 0,
        guilty.length ? 'env(safe-area-inset) внутри холста:\n      ' + guilty.join('\n      ')
                      : 'ни одного env(safe-area-inset) — раскладка не зависит от устройства');

  // ---------- Б. ВСЁ ВИДНО ----------
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
  await harness.prepare(page);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);

  // Запас, который обязан остаться между предметом и кромкой среза. Восьми
  // единиц хватает, чтобы правка шапки окна на пару пикселей не срезала
  // ничего молча.
  const MARGIN = 8;

  say('');
  say('======== Б. ПОЛКА САДА ВНУТРИ ВИДИМОЙ ОБЛАСТИ ========');
  // Какашка появляется на полке только когда она есть — иначе самый нижний
  // предмет ряда в проверку не попадёт вовсе.
  await page.evaluate(() => {
    Backend.grantCurrency('dung', 3);
    GameManager.handleSinAction('sloth');
  });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: out + '1-garden.png' });

  const shelf = await page.evaluate(() => {
    const svg = document.getElementById('gd-svg');
    const r = svg.getBoundingClientRect();
    const sceneY = (clientY) => {
      const p = svg.createSVGPoint();
      p.x = r.left + 1; p.y = clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse()).y;
    };
    const band = [sceneY(r.top), sceneY(r.bottom)];
    const items = [];
    document.querySelectorAll('#gd-fg-tools .gd-tool').forEach(g => {
      const bb = g.getBBox();
      const m = g.transform.baseVal.consolidate();
      const dy = m ? m.matrix.f : 0;
      items.push({ kind: g.dataset.kind, top: bb.y + dy, bottom: bb.y + bb.height + dy });
    });
    return { band, items };
  });

  say(`  видимая полоса сцены: ${shelf.band[0].toFixed(1)} … ${shelf.band[1].toFixed(1)} ` +
      `(из 0 … 844 — срезано по ${shelf.band[0].toFixed(0)} сверху и снизу)`);
  check(shelf.items.length > 0, `предметов на полке: ${shelf.items.length}`);
  shelf.items.forEach(it => {
    const gap = shelf.band[1] - it.bottom;
    check(gap >= MARGIN,
          `${it.kind}: до нижней кромки ${gap.toFixed(1)} ед. (нужно ≥ ${MARGIN})`);
  });

  // ---------- ТЕЛЕФОН КУХНИ: ЕГО СРЕЗАТЬ МОЖНО, НО НЕ ВЕСЬ ----------
  // Он НАМЕРЕННО выглядывает из-за края, поэтому запас у него не на низ, а
  // на то, что видимая часть достаточно велика, чтобы в неё попасть пальцем.
  say('');
  say('======== Б. ТЕЛЕФОН КУХНИ ОСТАЁТСЯ НАЖИМАЕМЫМ ========');
  await page.evaluate(() => {
    if (typeof SlothMinigame !== 'undefined') SlothMinigame.close();
    GameManager.handleSinAction('gluttony');
  });
  await page.waitForTimeout(1200);
  const phone = await page.evaluate(() => {
    const svg = document.getElementById('kt-svg');
    const r = svg.getBoundingClientRect();
    const node = document.getElementById('kt-phone');
    const b = node.getBoundingClientRect();
    const vis = Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top));
    const visW = Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left));
    return { h: +vis.toFixed(1), w: +visW.toFixed(1) };
  });
  say(`  видимая часть телефона: ${phone.w} × ${phone.h} экранных точек`);
  // Сорок точек — палец. Меньше означает, что в угол уже не попасть.
  check(phone.h >= 40 && phone.w >= 40,
        'видимой части хватает, чтобы попасть пальцем (нужно ≥ 40 × 40)');

  if (errors.length) { say('\nОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n')); bad += errors.length; }
  say('\n' + (bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ СОШЛОСЬ'));
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
