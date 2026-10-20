const { chromium } = require('playwright');

// ================= ПРОГОН: ОДИН КОНТРАКТ НА ВСЕ СЕМЬ ГРЕХОВ =================
// Семь веток одного дерева: у каждой своя игра внутри, но снаружи — одно и то
// же. Здесь это проверяется одинаковым сценарием для каждого греха, а итог
// печатается таблицей «грех × правило», чтобы расхождение было видно сразу.
//
// Проверяется только ОБЩЕЕ (рамка, крестик, вопрос при выходе, слова, размеры).
// Что творится внутри игры — дело её собственных тестов.
//
// Эталон размеров снимается не из головы, а с игры, которую мы доводим до
// финала (REFERENCE ниже): остальные подтягиваются к ней, а не наоборот.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-sins-contract.js
//     VERBOSE=1 ...   — печатает ещё и измеренные размеры
const REFERENCE = 'lust';

const SINS = [
  { sin: 'wrath',     obj: 'WrathMinigame',     screen: 'wrath-game' },
  { sin: 'greed',     obj: 'GreedMinigame',     screen: 'slots-game' },
  { sin: 'lust',      obj: 'LustMinigame',      screen: 'lust-game' },
  { sin: 'pride',     obj: 'PrideMinigame',     screen: 'pride-game' },
  { sin: 'sloth',     obj: 'SlothMinigame',     screen: 'sloth-game' },
  { sin: 'gluttony',  obj: 'GluttonyMinigame',  screen: 'gluttony-game' },
  { sin: 'envy',      obj: 'EnvyMinigame',      screen: 'envy-game' }
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);

  const rows = {};
  for (const s of SINS) {
    const r = await page.evaluate(async ({ obj, screen }) => {
      const res = { rules: {}, size: {} };
      const G = window[obj] || (new Function('return typeof ' + obj + ' !== "undefined" ? ' + obj + ' : null'))();
      if (!G) { res.rules.opens = false; return res; }
      try { G.open(); } catch (e) { res.rules.opens = false; res.err = String(e); return res; }
      await new Promise(r => setTimeout(r, 600));
      const el = document.getElementById(screen);
      const q = (sel) => el.querySelector(sel);
      const rect = (n) => { if (!n) return null; const b = n.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };

      res.rules.opens = !!el && el.classList.contains('active');
      const frame = q('.mg-frame'), bar = q('.mg-titlebar'), close = q('.mg-close'), body = q('.mg-body');
      res.rules.frame = !!(frame && bar && close && body && q('.mg-confirm'));
      res.size = { screen: rect(el), frame: rect(frame), bar: rect(bar), close: rect(close), body: rect(body) };
      const vw = innerWidth, vh = innerHeight;
      const sr = res.size.screen;
      res.rules.fullscreen = !!sr && sr.w >= vw - 1 && sr.h >= vh - 1;

      // слова: любой видимый текстовый узел вне svg, кроме эмодзи/цифр/знаков
      const words = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const t = (n.nodeValue || '').trim();
        if (!t || n.parentElement.closest('svg')) continue;
        if (/[A-Za-zА-Яа-яЁё]{2,}/.test(t)) words.push(t.slice(0, 20));
      }
      res.rules.noWords = words.length === 0;
      if (words.length) res.words = words.slice(0, 3);

      // крестик в игре без «выйти?»: если canLeave ложно, должен появиться вопрос
      if (close) {
        close.click();
        await new Promise(r => setTimeout(r, 200));
        const w = G.win;
        const asked = !!(w && w.isConfirmOpen && w.isConfirmOpen());
        const closedAtOnce = !el.classList.contains('active');
        res.rules.closeWorks = asked || closedAtOnce;
        if (asked) { w.hideConfirm(); }
        if (!el.classList.contains('active')) { /* закрылось без вопроса */ } else { try { G.close(); } catch (e) {} }
      } else { res.rules.closeWorks = false; }
      return res;
    }, s);
    rows[s.sin] = r;
    await page.waitForTimeout(300);
  }

  // ---------- таблица ----------
  const rules = ['opens', 'frame', 'fullscreen', 'noWords', 'closeWorks'];
  const mark = (v) => v === undefined ? ' ? ' : (v ? ' ✓ ' : ' ✗ ');
  console.log('\nгрех'.padEnd(12) + rules.map(r => r.padEnd(11)).join(''));
  const fail = [];
  for (const s of SINS) {
    const r = rows[s.sin];
    console.log(s.sin.padEnd(11) + rules.map(k => mark(r.rules[k]).padEnd(11)).join(''));
    for (const k of rules) if (!r.rules[k]) fail.push(s.sin + ': ' + k + (r.words ? ' ' + JSON.stringify(r.words) : '') + (r.err ? ' ' + r.err : ''));
  }

  // ---------- одинаковые ли размеры рамки ----------
  const ref = rows[REFERENCE] && rows[REFERENCE].size;
  const geom = ['frame', 'bar', 'close', 'body'];
  if (ref) {
    console.log('\nразмеры против эталона (' + REFERENCE + '):');
    for (const s of SINS) {
      const sz = rows[s.sin].size;
      if (!sz || !sz.frame) continue;
      const diffs = geom.filter(g => JSON.stringify(sz[g]) !== JSON.stringify(ref[g]));
      console.log('  ' + s.sin.padEnd(10) + (diffs.length ? 'отличается: ' + diffs.join(', ') : 'совпадает'));
      if (process.env.VERBOSE) console.log('    ' + JSON.stringify(sz));
      for (const g of diffs) fail.push(s.sin + ': размер ' + g + ' не как у ' + REFERENCE);
    }
  }

  if (errors.length) { console.log('\nОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n')); fail.push('ошибки страницы'); }
  console.log(fail.length ? '\nПРОВАЛЫ (' + fail.length + '):\n  ' + fail.join('\n  ') : '\nвсе семь по одному контракту');
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})();
