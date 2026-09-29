// Тональный этюд фото: картинка сводится к N ступеням светлоты (и отдельно —
// к N цветам), чтобы увидеть БОЛЬШИЕ массы: где свет, где тень, где глубина,
// как распределён цвет. Это карта строения для художника, а не калька:
// обводить её запрещено.
//   node tools/art-tones.js <фото> <выход-префикс> [N=5]
// Выход: <префикс>-value.png (ступени светлоты), <префикс>-color.png (ступени цвета).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [photo, pre, n0] = process.argv.slice(2);
  const N = +(n0 || 5);
  const uri = 'data:image/' + (path.extname(photo).slice(1).replace('jpg', 'jpeg')) + ';base64,' + fs.readFileSync(photo).toString('base64');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage();
  const res = await p.evaluate(async ({ uri, N }) => {
    const img = new Image(); img.src = uri; await img.decode();
    const k = Math.min(1, 700 / Math.max(img.width, img.height));
    const w = Math.round(img.width * k), h = Math.round(img.height * k);
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const src = mk(), sx = src.getContext('2d'); sx.drawImage(img, 0, 0, w, h);
    // лёгкое размытие — чтобы ступени легли массами, а не шумом
    const bl = mk(), bx = bl.getContext('2d'); bx.filter = 'blur(3px)'; bx.drawImage(src, 0, 0);
    const d = bx.getImageData(0, 0, w, h);
    const v = mk(), vx = v.getContext('2d'), vd = vx.createImageData(w, h);
    const c = mk(), cx = c.getContext('2d'), cd = cx.createImageData(w, h);
    const q = (x) => Math.round(Math.round(x / 255 * (N - 1)) / (N - 1) * 255);
    for (let i = 0; i < d.data.length; i += 4) {
      const r = d.data[i], g = d.data[i + 1], bb = d.data[i + 2];
      const L = q(0.299 * r + 0.587 * g + 0.114 * bb);
      vd.data[i] = vd.data[i + 1] = vd.data[i + 2] = L; vd.data[i + 3] = 255;
      cd.data[i] = q(r); cd.data[i + 1] = q(g); cd.data[i + 2] = q(bb); cd.data[i + 3] = 255;
    }
    vx.putImageData(vd, 0, 0); cx.putImageData(cd, 0, 0);
    return { v: v.toDataURL(), c: c.toDataURL() };
  }, { uri, N });
  fs.writeFileSync(pre + '-value.png', Buffer.from(res.v.split(',')[1], 'base64'));
  fs.writeFileSync(pre + '-color.png', Buffer.from(res.c.split(',')[1], 'base64'));
  await b.close();
})();
