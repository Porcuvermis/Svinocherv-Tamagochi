const { chromium } = require('playwright'); const fs = require('fs');
// SVG-карты эскиза → PNG точно в размер (для bake-preview.py)
(async () => { const b = await chromium.launch({ executablePath: require('../chrome-path') });
  for (const f of process.argv.slice(2)) {
    const svg = fs.readFileSync(f, 'utf8'); const w = +svg.match(/width="(\d+)"/)[1], h = +svg.match(/height="(\d+)"/)[1];
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(`<body style="margin:0">${svg}</body>`); await p.screenshot({ path: f.replace('.svg', '.png') }); await p.close(); }
  await b.close(); })();
