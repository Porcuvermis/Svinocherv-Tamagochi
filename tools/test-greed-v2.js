const { chromium } = require('playwright');
// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: ПРОГОН =================
// Версия 2 стоит в мини-игре вместо гаражной (вид 2), бандит играет:
// рычаг (пальцем — тянуть вниз), LED-экран встаёт ровно на исход крутки
// бэкенда, готовность возвращается после выплаты; вид 1 ↔ 2 в 🐞 на месте.
// План 31, разд. 5а.
//   NODE_PATH=/opt/node22/lib/node_modules node tools/test-greed-v2.js [/tmp/v2-]
(async () => {
  const out = process.argv[2] || '/tmp/v2-';
  const [vw, vh] = (process.env.SVINO_VIEWPORT || '390x844').split('x').map(Number);
  const b = await chromium.launch({ executablePath: require('./chrome-path') });
  const page = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let bad = 0;
  const ok = (c, m) => { console.log((c ? '  ok  ' : '  ✗   ') + m); if (!c) bad++; };
  await page.addInitScript(() => { localStorage.setItem('gj-wheel', '1'); localStorage.setItem('gj-pachinko', '1'); localStorage.setItem('gj-skin-slots', '2'); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8777}/index.html`); await page.waitForTimeout(2500);
  await page.evaluate(() => { Backend.grantCurrency('gold', 500); GreedMinigame.play = { slots: null, wheel: null, pachinko: null }; GameManager.handleSinAction('greed'); });
  await page.evaluate(() => GreedMinigame.veilReady()); await page.waitForTimeout(800);
  ok(await page.evaluate(() => GreedMinigame.M === GreedLux && !!GreedLux.gl && !!GreedLux.ledCv), 'стоит версия 2: корпус, LED-экран');
  // крутки: исход бэкенда — на линии экрана
  await page.evaluate(() => { const g = Backend.greedSpin; window.__res = []; Backend.greedSpin = function () { const r = g.apply(this, arguments); window.__res.push(r); return r; }; });
  const at = (x, y) => page.evaluate(([x, y]) => { const w = GreedLux.wrapEl.getBoundingClientRect(); return [w.left + x / 360 * w.width, w.top + (y + 57) / 696 * w.height]; }, [x, y]);
  const N = +(process.env.SPINS || 5);
  let match = 0, readyBack = 0;
  for (let i = 0; i < N; i++) {
    await page.waitForFunction(() => GreedLux.ready, null, { timeout: 8000 }).catch(() => {});
    // рывок пальцем: шар вниз по пазу до срыва
    const [bx, by] = await at(314, 299);
    await page.mouse.move(bx, by); await page.mouse.down();
    for (let k = 1; k <= 14; k++) { const [x, y] = await at(314, 299 + k * 4); await page.mouse.move(x, y); await page.waitForTimeout(25); }
    await page.mouse.up();
    await page.waitForFunction((n) => window.__res.length > n && !GreedLux.spinning() && !GreedMinigame.play.slots, i, { timeout: 12000 }).catch(() => {});
    const r = await page.evaluate(() => ({ want: window.__res[window.__res.length - 1].reels, got: GreedLux.reelKeys() }));
    if (JSON.stringify(r.want) === JSON.stringify(r.got)) match++;
    await page.waitForFunction(() => GreedLux.ready, null, { timeout: 6000 }).then(() => readyBack++).catch(() => {});
    if (i === 0) await page.screenshot({ path: out + 'spin.png' });
  }
  const spins = await page.evaluate(() => window.__res.length);
  ok(spins === N, `рычаг пальцем: круток ${spins}/${N}`);
  ok(match === N, `экран встал на исход крутки: ${match}/${N}`);
  ok(readyBack === N, `готовность вернулась после выплаты: ${readyBack}/${N}`);
  // колесо: бросок (сила взмаха — прямо: в браузере без видеокарты касания
  // идут реже, чем на телефоне), выпавший приз — под указателем
  await page.evaluate(() => { const u = GameState.data.upgrades || (GameState.data.upgrades = {}); if (!u.greed_wheel) { u.greed_wheel = 1; GameState.save(); }
    const g = Backend.greedPlay; window.__wres = []; Backend.greedPlay = function (game) { const r = g.apply(this, arguments); if (game === 'wheel') window.__wres.push(r); return r; }; });
  const W = +(process.env.WHEELS || 4);
  let under = 0;
  for (let i = 0; i < W; i++) {
    await page.waitForFunction(() => GreedLux._wheel && GreedLux._wheel.st === 'idle' && !GreedMinigame.play.wheel, null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => GreedLux.wheelThrow(GreedLux.WHEEL_SPIN.maxW * (0.6 + Math.random() * 0.4), performance.now()));
    await page.waitForFunction((n) => window.__wres.length > n && GreedLux._wheel.st === 'idle' && !GreedMinigame.play.wheel, i, { timeout: 20000 }).catch(() => {});
    const r = await page.evaluate(() => ({ want: window.__wres[window.__wres.length - 1].key, got: GreedJunk.wheelNow[GreedLux._deck.target] }));
    if (r.want === r.got) under++;
    if (i === 0) await page.screenshot({ path: out + 'wheel.png' });
  }
  const forced = await page.evaluate(() => GreedLux._deck.forced);
  ok(under === W, `колесо: выпавший приз под указателем ${under}/${W}`);
  ok(forced === 0, `колесо: подмен значков на виду — ${forced}`);
  // пачинко: кнопкой пальцем; исход подменён по очереди на каждый приз —
  // шарик по той же физике и запасу запусков, что у гаражного, в свою лунку
  await page.evaluate(() => { const u = GameState.data.upgrades; if (!u.greed_pachinko) { u.greed_pachinko = 1; GameState.save(); }
    const g = Backend.greedPlay; window.__pr = []; window.__pd = []; window.__pk = ['wrath', 'gold1', 'envy', 'greed', 'lust', 'pride', 'sloth', 'glut', 'blank'];
    Backend.greedPlay = function (game) { const r = g.apply(this, arguments); if (game === 'pachinko' && r.ok) { r.key = window.__pk[window.__pr.length % window.__pk.length]; r.currencies = {}; window.__pr.push(r.key); } return r; };
    const d = GreedLux.onPachDone; GreedLux.onPachDone = function (res) { window.__pd.push(GreedLux.pachKey(res)); return d.apply(this, arguments); }; });
  const [px, py] = await page.evaluate(() => { const G = GreedJunk, [x, y] = G.pachPt(G.PACH.button.x, G.PACH.button.y), w = GreedLux.wrapEl.getBoundingClientRect(); return [w.left + x / 360 * w.width, w.top + (y + 57) / 696 * w.height]; });
  const PN = 9;
  for (let i = 0; i < PN; i++) {
    await page.waitForFunction(() => !GreedMinigame.play.pachinko && !GreedLux._pach.ball && !GreedLux._pach.sink, null, { timeout: 20000 }).catch(() => {});
    await page.mouse.click(px, py);
    await page.waitForFunction((n) => window.__pd.length > n, i, { timeout: 25000 }).catch(() => {});
    if (i === 0) await page.screenshot({ path: out + 'pach.png' });
  }
  const pr = await page.evaluate(() => ({ want: window.__pr, got: window.__pd }));
  ok(pr.got.length === PN && pr.want.every((k, i) => k === pr.got[i]), `пачинко: шарик в решённую лунку ${pr.want.filter((k, i) => k === pr.got[i]).length}/${PN} (${pr.got.join(' ')})`);
  // низ: табло копилки — кошелёк; тап по табло ставки — следующая ставка
  // (если их больше одной); монета летит; выигрыш — в лоток; шкала — к значению
  await page.waitForFunction(() => !GreedMinigame.busy(), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const b0 = await page.evaluate(() => ({ bal: GreedLux._bot.shown, gold: Math.floor(GameState.currency('gold')), bets: Backend.greedBets('slots'), bet: GreedLux.betNow() }));
  ok(b0.bal === b0.gold, `табло копилки ${b0.bal} = кошелёк ${b0.gold}`);
  const [tx, ty] = await page.evaluate(() => { const L = GreedLux.meta.live.bet, w = GreedLux.wrapEl.getBoundingClientRect(); return [w.left + (L[0] + L[2]) / 2 / 360 * w.width, w.top + ((L[1] + L[3]) / 2 + 57) / 696 * w.height]; });
  await page.mouse.click(tx, ty); await page.waitForTimeout(300);
  const bet1 = await page.evaluate(() => GreedLux.betNow());
  ok(b0.bets.length < 2 ? bet1 === b0.bet : bet1 === b0.bets[(b0.bets.indexOf(b0.bet) + 1) % b0.bets.length], `ставка по тапу: ${b0.bet} → ${bet1} (${b0.bets.join('/')})`);
  await page.evaluate(() => { GreedMinigame.bet = null; GreedLux.coinIn(); GreedLux.trayPour(12); GreedLux.meterSet(0.9); });
  await page.waitForTimeout(200);
  const fly = await page.evaluate(() => GreedLux._bot.coins.length);
  await page.waitForTimeout(3000);
  const b1 = await page.evaluate(() => ({ fly: GreedLux._bot.coins.length, tray: GreedLux._bot.tray.coins.length, met: GreedLux._bot.met.L }));
  ok(fly === 1 && b1.fly === 0, `монета в щель: летела ${fly}, долетела`);
  ok(b1.tray >= 12, `лоток: монет ${b1.tray}`);
  ok(Math.abs(b1.met - 0.9) < 0.02, `шкала: ${b1.met.toFixed(3)} → 0,9`);
  // вид 1 ↔ 2 на месте
  await page.evaluate(() => { DebugMode.enabled = true; return GreedDebug.run('skin'); });
  await page.waitForFunction(() => GreedMinigame.M === GreedJunkLit && GreedJunkLit.lever, null, { timeout: 30000, polling: 300 }).catch(() => {});
  ok(await page.evaluate(() => GreedMinigame.M === GreedJunkLit && !GreedLux.wrapEl), 'вид 1 — гаражный, версия 2 снята');
  await page.evaluate(() => GreedDebug.run('skin'));
  await page.waitForFunction(() => GreedMinigame.M === GreedLux && GreedLux.ledCv, null, { timeout: 30000, polling: 300 }).catch(() => {});
  ok(await page.evaluate(() => GreedMinigame.M === GreedLux && !(GreedJunkLit.wrapEl && GreedJunkLit.wrapEl.isConnected) && !GreedJarShop.cv), 'снова вид 2, гаражный и банка сняты');
  ok(!errs.length, errs.length ? 'ошибки:\n' + errs.join('\n') : 'ошибок страницы нет');
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
