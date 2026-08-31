const { chromium } = require('playwright');

// ================= ПРОВЕРКА: КУХНЯ ЧРЕВОУГОДИЯ =================
// Проходит весь цикл готовки так же, как игрок: тащит продукты пальцем,
// держит доску, качает нож, льёт жидкость, мешает ложкой. Селекторов не
// жмёт — только координаты, и это заодно проверка, что перевод «экран →
// сцена» и «экран → передний план» не врут.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-kitchen.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/kitchen-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const say = console.log;

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);
  const before = await page.evaluate(() => Object.assign({}, GameState.data.pantry));
  say('кладовая до: ' + JSON.stringify(before));

  // Координаты сцены → экранные (внутри камеры).
  const atScene = (x, y) => page.evaluate(([sx, sy]) => {
    const svg = document.getElementById('kt-svg');
    const p = svg.createSVGPoint(); p.x = sx; p.y = sy;
    const r = p.matrixTransform(document.getElementById('kt-cam').getScreenCTM());
    return { x: r.x, y: r.y };
  }, [x, y]);
  // Координаты стейджа → экранные (передний план).
  const atStage = (x, y) => page.evaluate(([sx, sy]) => {
    const svg = document.getElementById('kt-svg');
    const p = svg.createSVGPoint(); p.x = sx; p.y = sy;
    const r = p.matrixTransform(svg.getScreenCTM());
    return { x: r.x, y: r.y };
  }, [x, y]);

  // Ждём, пока камера ДОЕДЕТ. Сравнивать атрибут бесполезно: его ставят один
  // раз, а двигает картинку CSS-переход — атрибут «замирает» сразу, и тест
  // считал координаты на лету, попадая пальцем не туда. Смотрим на реальную
  // матрицу отрисовки.
  const waitCamera = async () => {
    let prev = '';
    for (let i = 0; i < 80; i++) {
      const now = await page.evaluate(() => {
        const m = document.getElementById('kt-cam').getScreenCTM();
        return [m.a, m.b, m.c, m.d, m.e, m.f].map(v => v.toFixed(3)).join(',');
      });
      const settled = now === prev; prev = now;
      await page.waitForTimeout(60);
      if (settled && i > 2) return;
    }
  };
  const dragPts = async (from, to, steps, holdMs) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= (steps || 12); i++) {
      await page.mouse.move(from.x + (to.x - from.x) * i / (steps || 12),
                            from.y + (to.y - from.y) * i / (steps || 12));
      await page.waitForTimeout(18);
    }
    if (holdMs) {
      // Держим на месте: наливание идёт, пока сосуд над кастрюлей.
      for (let i = 0; i < holdMs / 40; i++) { await page.mouse.move(to.x + (i % 2), to.y); await page.waitForTimeout(40); }
    }
    await page.mouse.up();
  };

  await page.evaluate(() => GameManager.handleSinAction('gluttony'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: out + '1-overview.png' });

  // Тап по кухне открывает холодильник.
  const mid = await atScene(155, 800);
  await page.mouse.click(mid.x, mid.y);
  await waitCamera();
  await page.waitForTimeout(700);
  await page.screenshot({ path: out + '2-fridge.png' });

  // По одному продукту каждого типа перетаскиваем на доску.
  const shelf = await page.evaluate(() => Array.from(document.querySelectorAll('#kt-loose .kt-item'))
    .filter(g => g.dataset.where === 'fridge')
    .map(g => ({ key: g.dataset.key, type: g.dataset.type, home: JSON.parse(g.dataset.home) })));
  say('на полках: ' + shelf.map(s => s.key + '/' + s.type).join(', '));

  const boardAt = await page.evaluate(() => KITCHEN_ART.FG.board.fridge);
  const seen = {};
  for (const s of shelf) {
    if (s.type === 'block' || seen[s.type]) continue;
    seen[s.type] = true;
    await dragPts(await atScene(s.home.x, s.home.y), await atStage(boardAt.x, boardAt.y));
    await page.waitForTimeout(400);
  }
  say('на доске: ' + await page.evaluate(() => GluttonyMinigame.onBoard.map(o => o.key).join(', ')));
  await page.screenshot({ path: out + '3-board.png' });

  // Доску отодвигают вправо — тем же жестом, что и все остальные переходы.
  await dragPts(await atStage(boardAt.x, boardAt.y), await atStage(boardAt.x + 170, boardAt.y), 14);
  await waitCamera();
  await page.waitForTimeout(900);
  say('фаза после сдвига доски: ' + await page.evaluate(() => GluttonyMinigame.phase));
  await page.screenshot({ path: out + '4-chop.png' });

  // Нарезка: полный размах ножа — вверх до упора и вниз до доски.
  const kn = await page.evaluate(() => KITCHEN_ART.FG.knife);
  const k0 = await atStage(kn.x - 60, kn.y);
  await page.mouse.move(k0.x, k0.y);
  await page.mouse.down();
  for (let i = 0; i < 30; i++) {
    const p = await atStage(kn.x - 60, kn.y + (i % 2 ? -140 : 140));
    await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  say('надрезов: ' + await page.evaluate(() => GluttonyMinigame.chops) +
      '   нож: ' + await page.evaluate(() => {
        const k = document.getElementById('kt-knife');
        return 'class=' + k.getAttribute('class') + ' pe=' + k.getAttribute('pointer-events') +
               ' css=' + getComputedStyle(k).pointerEvents;
      }));
  await page.screenshot({ path: out + '5-chopped.png' });

  // Доску тянем вверх — она уходит к плите.
  await dragPts(await atStage(195, 620), await atStage(195, 120), 14);
  await waitCamera();
  await page.waitForTimeout(900);
  say('фаза после подъёма доски: ' + await page.evaluate(() => GluttonyMinigame.phase));
  await page.screenshot({ path: out + '6-stove.png' });

  // Жидкость: держим бутыль над кастрюлей, пока не нальётся.
  const bottle = await page.evaluate(() => {
    const g = document.querySelector('#kt-bottles .kt-bottle:not([data-empty])');
    return g ? JSON.parse(g.dataset.home) : null;
  });
  const potTop = await page.evaluate(() => {
    const z = KITCHEN_ART.SLOTS.potZone;
    return { x: z.x + z.w / 2, y: z.y + 60 };
  });
  say('бутыль: ' + JSON.stringify(bottle) + '   зона: ' + JSON.stringify(potTop));
  {
    const sp = await atScene(bottle.x, bottle.y);
    say('под бутылью: ' + await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      const chain = []; let n = el;
      while (n && chain.length < 5) { chain.push(n.tagName + (n.id ? '#' + n.id : '') + (n.getAttribute && n.getAttribute('class') ? '.' + n.getAttribute('class') : '')); n = n.parentElement; }
      return chain.join(' < ');
    }, [sp.x, sp.y]));
  }
  if (bottle) await dragPts(await atScene(bottle.x, bottle.y), await atScene(potTop.x, potTop.y), 12, 2200);
  say('основа: ' + await page.evaluate(() => GluttonyMinigame.liquid) +
      '   налито: ' + await page.evaluate(() => GluttonyMinigame.pourLevel || 0) +
      '   фаза: ' + await page.evaluate(() => GluttonyMinigame.phase));
  await page.screenshot({ path: out + '7-poured.png' });

  // Кучки в кастрюлю.
  for (let i = 0; i < 5; i++) {
    const pile = await page.evaluate(() => {
      const g = document.querySelector('#kt-loose .kt-item[data-where="pile"]');
      if (!g) return null;
      const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform'));
      return { x: +m[1], y: +m[2] };
    });
    if (!pile) break;
    await dragPts(await atScene(pile.x, pile.y), await atScene(potTop.x, potTop.y + 80));
    await page.waitForTimeout(500);
  }
  say('в кастрюле: ' + await page.evaluate(() => GluttonyMinigame.inPot.join(', ')));
  await waitCamera();
  await page.waitForTimeout(900);
  say('фаза: ' + await page.evaluate(() => GluttonyMinigame.phase));
  await page.screenshot({ path: out + '8-potzoom.png' });

  // Помешивание — слева направо.
  const sp = await page.evaluate(() => KITCHEN_ART.SLOTS.spoon);
  const s0 = await atScene(sp.x, sp.y);
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.down();
  for (let i = 0; i < 16; i++) {
    const p = await atScene(sp.x + (i % 2 ? -70 : 70), sp.y);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  say('помешиваний: ' + await page.evaluate(() => GluttonyMinigame.stirSwings));

  // Кастрюлю вниз — приходит червь.
  const potP = await page.evaluate(() => KITCHEN_ART.SLOTS.pot);
  await dragPts(await atScene(potP.x, potP.y), await atStage(195, 720), 14);
  await page.waitForTimeout(900);
  say('фаза: ' + await page.evaluate(() => GluttonyMinigame.phase));
  await page.screenshot({ path: out + '9-feed.png' });

  for (let i = 0; i < 40 && await page.evaluate(() => GluttonyMinigame.phase !== 'feed'); i++) await page.waitForTimeout(100);
  const pot = await page.$('#glut-tilt-bucket');
  if (pot) {
    const b = await pot.boundingBox();
    if (b) {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 120, { steps: 8 });
      await page.waitForTimeout(9000);
      await page.mouse.up();
      await page.waitForTimeout(1200);
    }
  }
  await page.screenshot({ path: out + '10-result.png' });

  const after = await page.evaluate(() => ({
    finished: GluttonyMinigame.feedFinished,
    pantry: Object.assign({}, GameState.data.pantry),
    shards: GameState.currency('glut_shard'),
    tokens: GameState.currency('glut_token'),
    sin: Math.round(GameState.sinValue('gluttony')),
    poopSize: GameState.data.digestion.poop_size
  }));
  say('\nнакормлен: ' + after.finished + '   шкала: ' + after.sin);
  say('кладовая после: ' + JSON.stringify(after.pantry));
  say('осколки: ' + after.shards + '   жетоны: ' + after.tokens + '   кучка: ' + after.poopSize);
  if (errors.length) { console.log('\nОШИБКИ:'); errors.forEach(e => console.log('  ' + e)); }
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
