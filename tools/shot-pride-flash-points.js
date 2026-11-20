// ================= ТЩЕСЛАВИЕ: ТОЧКИ ВСПЫШЕК (лист для проверки глазом) =================
// docs/plan/32-pride-cameras.md, задача 4.1. Два снимка:
//   <префикс>models.png — все модели с точкой вспышки (красная мишень);
//   <префикс>rim.png    — рамка в покое со всеми точками перехода:
//       голубая — камера видна, точка на месте; оранжевая — сдвинута к видимой части
//       камеры (сверху лежала другая); зелёная — точки посреди экрана.
// Запуск: NODE_PATH=/opt/node22/lib/node_modules node tools/shot-pride-flash-points.js /tmp/flash-
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const out = process.argv[2] || '/tmp/flash-';
  const browser = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const P = PrideCameras, K = 2;
    // --- модели ---
    const ids = Object.keys(P.MODELS).concat('cross'), cw = 300, ch = 220, cols = 6;
    const m = document.createElement('canvas'); m.width = cols * cw; m.height = Math.ceil(ids.length / cols) * ch;
    const g = m.getContext('2d'); g.fillStyle = '#d8d2de'; g.fillRect(0, 0, m.width, m.height);
    ids.forEach((id, i) => {
      const M = id === 'cross' ? P.CROSS : P.MODELS[id], im = P.imgs.pic[id];
      const k = Math.min((cw - 30) / M.w, (ch - 30) / M.h), w = M.w * k, h = M.h * k;
      const x = (i % cols) * cw + (cw - w) / 2, y = Math.floor(i / cols) * ch + (ch - h) / 2;
      g.drawImage(im, x, y, w, h);
      const uv = P.FLASH_UV[id], fx = x + uv[0] * w, fy = y + uv[1] * h;
      g.strokeStyle = '#ff1a1a'; g.lineWidth = 3;
      g.beginPath(); g.arc(fx, fy, 9, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(fx - 15, fy); g.lineTo(fx + 15, fy); g.moveTo(fx, fy - 15); g.lineTo(fx, fy + 15); g.stroke();
    });
    // --- рамка ---
    const L = P.layout(), pts = P.flashPoints();
    const c = document.createElement('canvas'); c.width = 390 * K; c.height = 844 * K;
    const q = c.getContext('2d'); q.scale(K, K);
    q.fillStyle = '#3a2a40'; q.fillRect(0, 0, 390, 844);
    P.paintBg(q, PALETTE.ink);
    L.back.forEach(it => P.put(q, it, false)); L.mid.forEach(it => P.put(q, it, true)); L.front.forEach(it => P.put(q, it, true)); P.putCross(q);
    pts.forEach(p => {
      q.fillStyle = p.kind === 'screen' ? '#3dff6a' : p.moved ? '#ff9a1a' : '#29c8ff';
      q.strokeStyle = '#000'; q.lineWidth = 1;
      q.beginPath(); q.arc(p.x, p.y, 4.5, 0, 7); q.fill(); q.stroke();
    });
    const cams = L.back.length + L.mid.length + L.front.length + 1;
    return { models: m.toDataURL(), rim: c.toDataURL(), cams, onCam: pts.filter(p => p.kind === 'cam').length,
             moved: pts.filter(p => p.moved).length, screen: pts.filter(p => p.kind === 'screen').length };
  });
  fs.writeFileSync(out + 'models.png', Buffer.from(r.models.split(',')[1], 'base64'));
  fs.writeFileSync(out + 'rim.png', Buffer.from(r.rim.split(',')[1], 'base64'));
  console.log(`камер ${r.cams}, вспыхивают ${r.onCam} (из них сдвинуто к видимой части ${r.moved}), закрыты целиком ${r.cams - r.onCam}; точек посреди экрана ${r.screen}`);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
