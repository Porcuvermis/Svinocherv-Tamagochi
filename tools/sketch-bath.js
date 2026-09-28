// ================= НАБРОСОК ВЕЩИ ВАННОЙ В КОНТЕКСТЕ =================
// Инструмент художника (docs/bench/art-pair.md): быстрый набросок проверяется
// там, где вещь будет жить, без правки игры. Сейчас — место мочалки.

// Набросок в контексте: кусок SVG (в координатах СЦЕНЫ, вокруг гнезда
// мочалки (573, 492), дно корзины y=530, передняя сетка закрывает y 513–530)
// показывается там, где будет жить вещь: на полке, в руке над мордой червя
// и крупно. Игра не меняется — подменяется только то, что рисует мочалку.
//
//   node sketch.js <фрагмент.svg> <префикс-вывода>
// Выход: <префикс>shelf.png (полка крупно), <префикс>hand.png (в руке),
//        <префикс>big.png (крупно на фоне кафеля), <префикс>icon.png (56×56).
// Фрагмент — содержимое без обёртки <svg>: пути, группы, defs. Строка
// <!--FRONT--> делит его на часть в корзине (за передней сеткой) и часть,
// свисающую через край наружу (поверх сетки) — так вещь живёт на полке. Цвета можно
// брать из палитры через плейсхолдеры {rag0}…{rag4}, {ink} — подставятся.
const { chromium } = require('playwright');
const fs = require('fs');
const harness = require('./harness');
(async () => {
  const [file, pre] = process.argv.slice(2);
  const frag0 = fs.readFileSync(file, 'utf8');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 3 }));
  await harness.prepare(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8777/index.html'); await page.waitForTimeout(2600);
  await page.evaluate(() => GameManager.handleSinAction('lust')); await page.waitForTimeout(800);
  // Плейсхолдеры цветов — из живой палитры.
  const frag = await page.evaluate((f) => {
    const P = btPal(), map = { ink: PALETTE.ink };
    (P.rag || []).forEach((c, i) => { map['rag' + i] = c; });
    return f.replace(/\{(\w+)\}/g, (m, k) => map[k] || m);
  }, frag0);
  // Подмена мочалки: рисунок — фрагмент, габарит — его getBBox.
  const box = await page.evaluate((frag) => {
    const art = document.getElementById('bt-cloth-art'), g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    art.parentNode.appendChild(g); g.innerHTML = frag; const b = g.getBBox(); g.remove();
    const box = { x: Math.floor(b.x), y: Math.floor(b.y), w: Math.ceil(b.width) + 1, h: Math.ceil(b.height) + 1 };
    // <!--FRONT--> делит фрагмент: до — лежит в корзине (за сеткой), после —
    // свисает наружу поверх сетки. В руке и крупно — вместе.
    const [main, front] = frag.split('<!--FRONT-->');
    BATH_CLOTH.tierArt = () => ({ main, front: front || '' }); BATH_CLOTH.box = () => box; BATH_CLOTH.refresh();
    return box;
  }, frag);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => { const L = LustMinigame, b = BATH_ART.box('cloth'), c = L.cam;
    const p0 = SvgSpace.toClient(L.svgEl, c.tx + c.s * (b.x - 30), c.ty + c.s * (b.y - 30));
    const p1 = SvgSpace.toClient(L.svgEl, c.tx + c.s * (b.x + b.w + 30), c.ty + c.s * (b.y + b.h + 25));
    return { x: p0.x, y: p0.y, w: p1.x - p0.x, h: p1.y - p0.y }; });
  await page.screenshot({ path: `${pre}shelf.png`, clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
  // Крупно и иконка — отдельной страницей, только фрагмент.
  const big = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x - 8} ${box.y - 8} ${box.w + 16} ${box.h + 16}" width="600" height="${Math.round(600 * (box.h + 16) / (box.w + 16))}" style="background:#cfd9df">${frag}</svg>`;
  const k = 56 / Math.max(box.w, box.h);
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-34 -34 68 68" width="68" height="68" style="background:#2a2230"><g transform="scale(${k}) translate(${-(box.x + box.w / 2)} ${-(box.y + box.h / 2)})">${frag}</g></svg>`;
  const p2 = await browser.newPage({ deviceScaleFactor: 1 });
  await p2.setContent(`<body style="margin:0">${big}</body>`); await p2.screenshot({ path: `${pre}big.png`, fullPage: true });
  await p2.setContent(`<body style="margin:0">${icon}</body>`); await p2.screenshot({ path: `${pre}icon.png`, clip: { x: 0, y: 0, width: 68, height: 68 } });
  // В руке: мыло закончено, мочалка поднялась — берём и ведём к лицу.
  await page.evaluate(() => LustMinigame.startWater());
  for (let i = 0; i < 40 && await page.evaluate(() => LustMinigame.phase) !== 'soap'; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(1300);
  await page.evaluate(() => { const L = LustMinigame; L.rub = 1; L.growTo('soap', 1); L.finishStage('soap'); });
  for (let i = 0; i < 60 && !(await page.evaluate(() => LustMinigame.phase === 'cloth' && LustMinigame.loose && !LustMinigame.liftRaf)); i++) await page.waitForTimeout(200);
  await page.waitForTimeout(500);
  const at = await page.evaluate(() => { const L = LustMinigame, o = L.loose; return SvgSpace.toClient(L.svgEl, o.pos.x, o.pos.y); });
  await page.mouse.move(at.x, at.y); await page.mouse.down();
  await page.mouse.move(at.x - 90, at.y + 60, { steps: 10 }); await page.waitForTimeout(300);
  await page.screenshot({ path: `${pre}hand.png`, clip: { x: at.x - 200, y: at.y - 50, width: 220, height: 220 } });
  await page.mouse.up();
  console.log(JSON.stringify({ box, errors: errs.slice(0, 3) }));
  await browser.close();
})();
