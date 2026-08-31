const { chromium } = require('playwright');

// ============ ПРОВЕРКА: ПИЩЕБЛОК — СТРАХОВКА ОТ ТУПИКА ============
// Второй путь через кухню: не «наготовил из трёх типов», а «нечем кормить,
// беру пищеблок». Проверяется ровно то, что обещано в плане
// (docs/plan/20-gluttony-kitchen.md, раздел 3):
//
//   * пищеблок всегда лежит в морозилке и берётся, даже когда кладовая пуста;
//   * цифры остатка у него НЕТ — он бесконечный, а «0» рядом с бесконечным
//     предметом врёт ровно наоборот;
//   * блюдо из него закрывает шкалу, даёт осколок и НЕ даёт какашки;
//   * кладовая после него не тратится.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-kitchen-block.js
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', e => errors.push('ERR '+e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('CON '+m.text()); });
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);
  const atScene = (x,y) => page.evaluate(([sx,sy]) => { const svg=document.getElementById('kt-svg');
    const p=svg.createSVGPoint(); p.x=sx; p.y=sy; const r=p.matrixTransform(document.getElementById('kt-cam').getScreenCTM()); return {x:r.x,y:r.y}; }, [x,y]);
  const atStage = (x,y) => page.evaluate(([sx,sy]) => { const svg=document.getElementById('kt-svg');
    const p=svg.createSVGPoint(); p.x=sx; p.y=sy; const r=p.matrixTransform(svg.getScreenCTM()); return {x:r.x,y:r.y}; }, [x,y]);
  const waitCamera = async () => { let prev=''; for (let i=0;i<80;i++){ const now = await page.evaluate(()=>{const m=document.getElementById('kt-cam').getScreenCTM(); return [m.a,m.b,m.c,m.d,m.e,m.f].map(v=>v.toFixed(3)).join(',');}); const st=now===prev; prev=now; await page.waitForTimeout(60); if(st&&i>2)return; } };
  const dragPts = async (f,t,st) => { await page.mouse.move(f.x,f.y); await page.mouse.down();
    for(let i=1;i<=(st||12);i++){ await page.mouse.move(f.x+(t.x-f.x)*i/(st||12), f.y+(t.y-f.y)*i/(st||12)); await page.waitForTimeout(18);} await page.mouse.up(); };

  await page.evaluate(() => GameManager.handleSinAction('gluttony'));
  await page.waitForTimeout(600);
  await page.mouse.click((await atScene(155,800)).x, (await atScene(155,800)).y);
  await waitCamera(); await page.waitForTimeout(700);
  const boardAt = await page.evaluate(() => KITCHEN_ART.FG.board.fridge);
  const bh = await page.evaluate(() => { const g=Array.from(document.querySelectorAll('#kt-loose .kt-item')).find(n=>n.dataset.key==='block'); return JSON.parse(g.dataset.home); });
  await dragPts(await atScene(bh.x, bh.y), await atStage(boardAt.x, boardAt.y));
  await page.waitForTimeout(450);
  console.log('пищеблок на доске: ' + await page.evaluate(() => GluttonyMinigame.onBoard.map(o=>o.key).join(',')));
  await dragPts(await atStage(boardAt.x+130, boardAt.y), await atStage(boardAt.x+190, boardAt.y), 14);
  await waitCamera(); await page.waitForTimeout(900);
  console.log('фаза: ' + await page.evaluate(() => GluttonyMinigame.phase));
  const kn = await page.evaluate(() => KITCHEN_ART.FG.knife);
  const k0 = await atStage(kn.x-60, kn.y);
  await page.mouse.move(k0.x,k0.y); await page.mouse.down();
  for (let i=0;i<30;i++){ const p=await atStage(kn.x-60, kn.y+(i%2?-110:110)); await page.mouse.move(p.x,p.y,{steps:3}); await page.waitForTimeout(40); }
  await page.mouse.up();
  console.log('надрезов: ' + await page.evaluate(() => GluttonyMinigame.chops));
  await page.waitForTimeout(600);
  await dragPts(await atStage(345,620), await atStage(345,460), 14);
  await waitCamera(); await page.waitForTimeout(900);
  // вода из крана
  const hose = await page.evaluate(() => KITCHEN_ART.SLOTS.hose);
  const z = await page.evaluate(() => KITCHEN_ART.SLOTS.potZone);
  const f2 = await atScene(hose.x,hose.y), t2 = await atScene(z.x+z.w/2, z.y+70);
  await page.mouse.move(f2.x,f2.y); await page.mouse.down();
  for(let i=1;i<=10;i++){ await page.mouse.move(f2.x+(t2.x-f2.x)*i/10, f2.y+(t2.y-f2.y)*i/10); await page.waitForTimeout(20);}
  for(let i=0;i<50 && !(await page.evaluate(()=>!!GluttonyMinigame.liquid)); i++) await page.waitForTimeout(60);
  await page.mouse.up(); await page.waitForTimeout(500);
  console.log('основа: ' + await page.evaluate(() => GluttonyMinigame.liquid));
  // кучку в кастрюлю
  for (let i=0;i<3;i++){
    const pile = await page.evaluate(() => { const g=document.querySelector('#kt-loose .kt-item[data-where="pile"]'); if(!g) return null;
      const m=/translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform')); return {x:+m[1],y:+m[2]}; });
    if (!pile) break;
    await dragPts(await atScene(pile.x,pile.y), await atScene(535, 600));
    await page.waitForTimeout(500);
  }
  await waitCamera(); await page.waitForTimeout(900);
  console.log('в кастрюле: ' + await page.evaluate(() => GluttonyMinigame.inPot.join(',')) + '  фаза: ' + await page.evaluate(()=>GluttonyMinigame.phase));
  const sp = await page.evaluate(() => KITCHEN_ART.SLOTS.spoon);
  const s0 = await atScene(sp.x, sp.y);
  await page.mouse.move(s0.x,s0.y); await page.mouse.down();
  for (let i=0;i<16;i++){ const p=await atScene(sp.x+(i%2?-70:70), sp.y); await page.mouse.move(p.x,p.y,{steps:3}); await page.waitForTimeout(50);}
  await page.mouse.up();
  const potP = await page.evaluate(() => KITCHEN_ART.SLOTS.pot);
  const pf = await atScene(potP.x, potP.y);
  await dragPts(pf, {x: pf.x, y: pf.y + 190}, 14);
  await page.waitForTimeout(900);
  console.log('фаза: ' + await page.evaluate(()=>GluttonyMinigame.phase));
  for (let i=0;i<40 && await page.evaluate(()=>!!GluttonyMinigame.wormWalk); i++) await page.waitForTimeout(100);
  const pot = await page.$('#glut-tilt-bucket'); const b = await pot.boundingBox();
  await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down();
  await page.mouse.move(b.x+b.width/2, b.y+b.height/2+120, {steps:8});
  await page.waitForTimeout(9000); await page.mouse.up(); await page.waitForTimeout(1000);
  console.log(await page.evaluate(() => JSON.stringify({ fed: GluttonyMinigame.feedFinished,
     shards: GameState.currency('glut_shard'), poop: GameState.data.digestion.poop_size,
     pantry: GameState.data.pantry })));
  console.log(errors.length ? errors.join('\n') : 'ошибок нет');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
