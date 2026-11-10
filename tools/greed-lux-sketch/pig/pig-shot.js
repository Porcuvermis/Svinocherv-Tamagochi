const { chromium } = require('playwright');
// Снимки болванки копилки в нескольких ракурсах (прозрачный фон) — для
// раскладки в кадр игры (compose в pig-place.py).
//   NODE_PATH=... node pig-shot.js /tmp/pig- "yaw,pitch,roll" ...
const out = process.argv[2], views = process.argv.slice(3);
(async () => {
  const b = await chromium.launch({ executablePath: require('../../chrome-path') });
  const p = await b.newPage({ viewport: { width: 600, height: 600 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  for (const [i, v] of views.entries()) {
    const [yaw, pitch, roll] = v.split(',');
    await p.goto(`http://127.0.0.1:${process.env.PORT || 8777}/tools/greed-lux-sketch/pig/pig.html?yaw=${yaw}&pitch=${pitch}&roll=${roll || 0}`);
    await p.waitForFunction(() => document.title === 'ready', null, { timeout: 15000 });
    await p.screenshot({ path: `${out}${i}.png`, omitBackground: true });
  }
  await b.close();
})();
