const { chromium } = require('playwright');

// ================= ПРОВЕРКА: РАСКЛАДКА И ПОДСКАЗКА В БОЮ =================
// Меряет, где стоят бойцы, полоски здоровья, кинжалы и мишени, и требует,
// чтобы они не наезжали друг на друга. Плюс читает вычисленные стили зон на
// каждом шаге раунда и при разном опыте игрока.
//
// «Полоска наехала на червя» и «мигает не та сторона» глазами ловятся
// последними, а числом — первыми. Разбор решений — docs/plan/09-wrath-rework.md,
// раздел 12.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-fight-layout.js /tmp/shots-   0    # новичок
//     node tools/test-fight-layout.js /tmp/shots-   20   # опытный
(async () => {
  const out = process.argv[2];
  const fights = parseInt(process.argv[3] || '0', 10);   // «опыт» игрока
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2300);
  await page.evaluate((n) => {
    if (n) { GameState.bumpTotal('wrath.duel.fights', n); GameState.save(); }
    GameManager.handleSinAction('wrath');
  }, fights);
  await page.waitForTimeout(800);
  await page.evaluate(() => WrathMinigame.startMode('duel'));
  await page.waitForTimeout(1600);

  const box = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
  }, sel);

  const geom = {
    enemyWorm: await box('#wrath-enemy-stage .worm-root'),
    playerWorm: await box('#wrath-player-stage .worm-root'),
    enemyHp: await box('.enemy-side'),
    playerHp: await box('.player-side'),
    daggers: await box('#dagger-btn'),
    zones: await page.evaluate(() => {
      const out = {};
      document.querySelectorAll('#wrath-duel .zone-hit').forEach(el => {
        const r = el.getBoundingClientRect();
        out[el.className.replace(/\s+/g, '.') + ':' + el.dataset.zone] =
          `${Math.round(r.width)}x${Math.round(r.height)} @ ${Math.round(r.x)},${Math.round(r.y)}`;
      });
      return out;
    })
  };

  // Полоска здоровья не должна залезать на своего бойца: она стоит в
  // свободном углу, и это надо проверять числом, а не глазами.
  const overlap = (a, b) => {
    if (!a || !b) return null;
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return (w > 0 && h > 0) ? `${Math.round(w)}x${Math.round(h)}` : 'нет';
  };
  geom.overlapEnemy = overlap(geom.enemyWorm, geom.enemyHp);
  geom.overlapPlayer = overlap(geom.playerWorm, geom.playerHp);
  geom.overlapDaggersEnemy = overlap(geom.enemyWorm, geom.daggers);
  geom.overlapDaggersPlayer = overlap(geom.playerWorm, geom.daggers);

  const guide = async () => page.evaluate(() => {
    const root = document.getElementById('wrath-duel');
    const zone = document.querySelector('.player-zone[data-zone="head"]');
    const enemyZone = document.querySelector('.enemy-zone[data-zone="head"]');
    const anim = (el) => {
      const st = getComputedStyle(el);
      return `${st.animationName} ×${st.animationIterationCount} op:${st.opacity}`;
    };
    return { classes: root.className, player: anim(zone), enemy: anim(enemyZone),
             daggers: getComputedStyle(document.getElementById('dagger-btn')).animationName };
  });

  const steps = {};
  steps.start = await guide();
  await page.screenshot({ path: out + 'fl-1-start.png' });

  await page.evaluate(() => document.querySelector('.player-zone[data-zone="body"]').click());
  await page.waitForTimeout(250);
  steps.afterDefense = await guide();
  await page.screenshot({ path: out + 'fl-2-defense.png' });

  await page.evaluate(() => document.querySelector('.enemy-zone[data-zone="head"]').click());
  await page.waitForTimeout(250);
  steps.afterAttack = await guide();
  await page.screenshot({ path: out + 'fl-3-attack.png' });

  await page.evaluate(() => document.getElementById('dagger-btn').click());
  await page.waitForTimeout(700);
  await page.screenshot({ path: out + 'fl-4-round.png' });
  steps.nextRound = await guide();

  console.log(JSON.stringify({ fights, geom, steps, errors }, null, 1));
  await browser.close();
})();
