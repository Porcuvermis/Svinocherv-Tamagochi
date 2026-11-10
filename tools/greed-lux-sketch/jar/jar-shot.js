const { chromium } = require('playwright');
// Снимки болванки банки (jar.html) с параметрами адреса, прозрачный фон.
//   NODE_PATH=... node jar-shot.js /tmp/jar- "yaw=0&pitch=12" "lid=0.05&lidtilt=40" ...
const out = process.argv[2], views = process.argv.slice(3);
(async () => {
  const b = await chromium.launch({ executablePath: require('../../chrome-path') });
  const p = await b.newPage({ viewport: { width: 600, height: 600 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  for (const [i, v] of views.entries()) {
    await p.goto(`http://127.0.0.1:${process.env.PORT || 8777}/tools/greed-lux-sketch/jar/jar.html?${v}`);
    await p.waitForFunction(() => document.title === 'ready', null, { timeout: 15000 });
    await p.screenshot({ path: `${out}${i}.png`, omitBackground: true });
  }
  await b.close();
})();
