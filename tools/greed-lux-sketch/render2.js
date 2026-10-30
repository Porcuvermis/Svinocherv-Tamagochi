const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 720, height: 450 } });
 for (const f of process.argv.slice(2)) { await p.setContent(`<body style="margin:0;background:#111">${fs.readFileSync(f,'utf8')}</body>`); await p.screenshot({ path: f.replace('.svg','.png') }); }
 await b.close(); })();
