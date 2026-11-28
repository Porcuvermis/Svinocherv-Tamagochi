// ================= СНИМОК МИНИ-ИГРЫ ПО ШАГАМ =================
// Открывает грех, выполняет шаги и снимает кадр после каждого. Один прогон —
// все состояния экрана, дальше лист: python3 tools/sheet.py <префикс>.
// Видеокарта — программная (swiftshader): свет шейдером виден, скорость — нет.
//
//   SIN=pride STEPS='[["room",""],["store","PrideMinigame.openStore(\"boost\")"]]' \
//     NODE_PATH=/opt/node22/lib/node_modules node tools/shot-sin.js /tmp/s-
//
// SIN — грех (handleSinAction); SETUP — код до входа (покупки, валюта);
// STEPS — JSON [[имя, код, ждать_мс?], …]; код "freeze:<мс>" — заморозить
// css-переходы на этом времени (середина переезда честно, а не «как успел
// снимок»); WAIT — сколько ждать после входа (мс, 4000); DPR — плотность (1).
// По-айфонски: SVINO_VIEWPORT=390x700 SVINO_FAKE_CTM=1 (tools/harness.js).
const { chromium } = require('playwright');
const H = require('./harness.js');
(async () => {
  const pre = process.argv[2] || '/tmp/s-';
  const sin = process.env.SIN || 'pride';
  const steps = JSON.parse(process.env.STEPS || '[["0",""]]');
  const browser = await chromium.launch({ executablePath: require('./chrome-path'),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage(H.viewport({ deviceScaleFactor: +(process.env.DPR || 1) }));
  await H.prepare(page);
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`);
  await page.waitForTimeout(2300);
  if (process.env.SETUP) await page.evaluate(process.env.SETUP);
  await page.evaluate((s) => GameManager.handleSinAction(s), sin);
  await page.waitForTimeout(+(process.env.WAIT || 4000));
  for (const [name, code, wait] of steps) {
    if (code && code.startsWith('freeze:')) {
      const t = +code.slice(7);
      await page.evaluate((t) => document.getAnimations().filter(a => a instanceof CSSTransition)
        .forEach(a => { a.pause(); a.currentTime = t; }), t);
    } else if (code) {
      const r = await page.evaluate(code);
      if (r !== undefined) console.log(name, JSON.stringify(r));
    }
    await page.waitForTimeout(wait || 800);
    await page.screenshot({ path: `${pre}${name}.png` });
  }
  errs.forEach(e => console.log(e));
  await browser.close();
})();
