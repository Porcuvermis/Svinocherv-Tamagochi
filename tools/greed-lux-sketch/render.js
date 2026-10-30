const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 760, height: 1460 } });
 for (const f of process.argv.slice(2)) { await p.setContent(`<body style="margin:0">${fs.readFileSync(f,'utf8')}</body>`); await p.screenshot({ path: f.replace('.svg','.png') }); }
 await b.close(); })();
