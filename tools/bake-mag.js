const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ================= ЗАПЕКАНИЕ ЖУРНАЛОВ НА УНИТАЗЕ =================
// Вектор журналов (BATH_MAG.drawVector, BATH_MAG.flapVector) — исходник; игра
// показывает его ЗАПЕЧЁННЫМ в три PNG: стопка, верхний журнал и лента кадров
// уголка зова. Причина — docs/traps.md, п. 162: обложки натянуты кусками с
// заливкой-узором, и WebKit на айфоне заводил под каждое применение узора
// свою плитку — сотни мегабайт видеопамяти, фон чернел через полминуты.
//
// Окна картинок — по настоящему габариту нарисованного (getBBox) с запасом
// под обводку и тени; масштаб S точек на единицу сцены — с запасом на
// самую крупную камеру, где журнал виден (мытьё, ×0.85), и плотность айфона 3.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/bake-mag.js
// Перезапускать после правки tools/gen-mag-geo.py или рисунка в bath-mag.js.
const S = 3, PAD = 6;
const OUT = path.join(__dirname, '..', 'src', 'minigames', 'lust');

(async () => {
  const browser = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);

  // Габариты групп в единицах сцены — по нарисованному, а не по числам GEO.
  const boxes = await page.evaluate((PAD) => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 1000 1200');
    svg.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:1200px';
    svg.innerHTML = BATH_MAG.drawVector();
    document.body.appendChild(svg);
    const F = BATH_MAG.flapVector();
    const fl = document.createElementNS(ns, 'g');
    fl.innerHTML = F.under + F.frames.join('');
    svg.appendChild(fl);
    const bb = (el) => { const b = el.getBBox(); return { x: Math.floor(b.x - PAD), y: Math.floor(b.y - PAD), w: Math.ceil(b.width + 2 * PAD), h: Math.ceil(b.height + 2 * PAD) }; };
    const r = { stack: bb(svg.querySelector('#bt-mag-stack')), top: bb(svg.querySelector('#bt-mag-top')), flap: bb(fl), n: F.frames.length };
    svg.remove();
    return r;
  }, PAD);

  // Каждая картинка — отдельный svg во весь кадр страницы, всё прочее со
  // страницы убрано, фон прозрачный.
  const shoot = async (name, build) => {
    const size = await page.evaluate(({ build, S }) => {
      const ns = 'http://www.w3.org/2000/svg';
      // всё прочее со страницы — прочь (в т. ч. чужие defs с теми же id)
      document.querySelectorAll('body > *:not(script):not(#bake-svg)').forEach(n => n.remove());
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
      const old = document.getElementById('bake-svg'); if (old) old.remove();
      const svg = document.createElementNS(ns, 'svg');
      svg.id = 'bake-svg';
      const r = (new Function('return ' + build))();
      svg.setAttribute('viewBox', `0 0 ${r.w} ${r.h}`);
      svg.setAttribute('width', r.w * S); svg.setAttribute('height', r.h * S);
      svg.style.cssText = 'position:fixed;left:0;top:0;display:block';
      svg.innerHTML = r.html;
      document.body.appendChild(svg);
      return { w: r.w * S, h: r.h * S };
    }, { build, S });
    await page.setViewportSize({ width: Math.max(200, size.w), height: Math.max(200, size.h) });
    await page.waitForTimeout(700);                     // картинка обложки в узоре
    await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: size.w, height: size.h }, omitBackground: true });
  };

  // Стопка и верхний — из одного и того же рисунка, второй спрятан.
  for (const [name, show, hide, box] of [['mag-stack.png', 'bt-mag-stack', 'bt-mag-top', boxes.stack],
                                          ['mag-top.png', 'bt-mag-top', 'bt-mag-stack', boxes.top]]) {
    await shoot(name, `(() => {
      const b = ${JSON.stringify(box)};
      const html = BATH_MAG.drawVector().replace('id="${hide}"', 'id="${hide}" style="display:none"');
      return { w: b.w, h: b.h, html: '<g transform="translate(' + (-b.x) + ' ' + (-b.y) + ')">' + html + '</g>' };
    })()`);
  }
  // Лента уголка: кадры сверху вниз, у каждого страница под ним и лоскут.
  const fb = boxes.flap;
  await shoot('mag-flap.png', `(() => {
    const b = ${JSON.stringify(fb)}, F = BATH_MAG.flapVector();
    const cells = F.frames.map((fr, i) => '<svg x="0" y="' + (i * b.h) + '" width="' + b.w + '" height="' + b.h + '" viewBox="' + b.x + ' ' + b.y + ' ' + b.w + ' ' + b.h + '">' + F.under + fr + '</svg>').join('');
    return { w: b.w, h: b.h * F.frames.length, html: '<defs>' + F.defs + '</defs>' + cells };
  })()`);

  const src = (n) => `src/minigames/lust/${n}`;
  const baked = {
    stack: { src: src('mag-stack.png'), ...boxes.stack },
    top: { src: src('mag-top.png'), ...boxes.top },
    flap: { src: src('mag-flap.png'), ...boxes.flap, n: boxes.n }
  };
  fs.writeFileSync(path.join(OUT, 'bath-mag-baked.js'),
`// ФАЙЛ СГЕНЕРИРОВАН: node tools/bake-mag.js — руками не править.
// Журналы на унитазе, запечённые из вектора (BATH_MAG.drawVector,
// flapVector) в PNG по ${S} точки на единицу сцены. Окна — в единицах сцены.
// Почему растр, а не вектор: docs/traps.md, п. 162.
const BATH_MAG_BAKED = ${JSON.stringify(baked, null, 4)};
`);
  console.log('запечено:', JSON.stringify(baked));
  await browser.close();
})();
