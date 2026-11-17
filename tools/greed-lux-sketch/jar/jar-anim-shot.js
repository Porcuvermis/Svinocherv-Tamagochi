const { chromium } = require('playwright');
// Кадры анимации банки-магазина (jar-anim.html) по времени, прозрачный фон.
//   NODE_PATH=... node jar-anim-shot.js /tmp/ja- [кадров в секунду] [t1 t2 ...]
const out = process.argv[2], fps = +(process.argv[3] || 15), only = process.argv.slice(4).map(Number);
(async () => {
  const b = await chromium.launch({ executablePath: require('../../chrome-path') });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('CON', m.text()); });
  await p.goto(`http://127.0.0.1:${process.env.PORT || 8777}/tools/greed-lux-sketch/jar/jar-anim.html`);
  await p.waitForFunction(() => document.title === 'ready');
  const end = await p.evaluate(() => EV.end);
  const ts = only.length ? only : Array.from({ length: Math.round(end * fps) }, (_, i) => i / fps);
  for (const [i, t] of ts.entries()) {
    await p.evaluate((t) => window.frame(t), t);
    await p.screenshot({ path: `${out}${String(i).padStart(3, '0')}.png`, omitBackground: true });
  }
  await b.close();
})();
