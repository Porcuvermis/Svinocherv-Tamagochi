const { chromium } = require('playwright'); const fs = require('fs');
// Геометрия поля пачинко из игры → pach-geom.json для machine.py (версия 2
// рисует ТО ЖЕ поле: гвозди, лунки, дуга, дорожка — физика и запас запусков
// не меняются). Перезапускать, если поле в игре поменялось.
//   NODE_PATH=/opt/node22/lib/node_modules node pach-geom.js
(async () => {
  const b = await chromium.launch({ executablePath: require('../chrome-path') });
  const p = await b.newPage();
  await p.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await p.waitForTimeout(2000);
  const g = await p.evaluate(() => { const G = GreedJunk; return {
    PACH: G.PACH, CUPS: G.PACH_CUPS, AT: G.PACH_AT, nails: G.pachNails(), spring: G.pachSpringBox(), springDrop: G.SPRING_DROP,
    glass: G.pachGlassRect(), phys: { r: G.PACH_PHYS.r, nailR: G.PACH_PHYS.nailR }, world: (({ left, sep, sepTop, laneR, drain, start }) => ({ left, sep, sepTop, laneR, drain, start }))(G.pachWorld()) }; });
  fs.writeFileSync(__dirname + '/pach-geom.json', JSON.stringify(g));
  console.log('гвоздей', g.nails.length, 'лунок', g.CUPS.length);
  await b.close();
})();
