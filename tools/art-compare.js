// Сравнение «фото | набросок» одной картинкой: слева фото, справа набросок,
// одной высоты; снизу — оба же МЕЛКО (высота 60 px, как вещь на полке) —
// там решается посыл. Критик смотрит только эту склейку.
//   node tools/art-compare.js <фото> <набросок.png> <выход.png>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [photo, sketch, out] = process.argv.slice(2);
  const uri = (f) => 'data:image/' + (path.extname(f).slice(1).replace('jpg', 'jpeg')) + ';base64,' + fs.readFileSync(f).toString('base64');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
  await p.setContent(`<body style="margin:0;background:#cfd9df;font:0/0 a">
    <div id=w style="display:inline-block;padding:10px">
      <div style="display:flex;gap:10px;align-items:center">
        <img src="${uri(photo)}" style="height:420px;background:#fff">
        <img src="${uri(sketch)}" style="height:420px">
      </div>
      <div style="display:flex;gap:40px;align-items:center;margin-top:12px">
        <img src="${uri(photo)}" style="height:60px;background:#fff">
        <img src="${uri(sketch)}" style="height:60px">
      </div>
    </div></body>`);
  await p.waitForTimeout(300);
  await (await p.$('#w')).screenshot({ path: out });
  await b.close();
})();
