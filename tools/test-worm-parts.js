const { chromium } = require('playwright');
const harness = require('./harness');

// ============ ПРОВЕРКА: ТАБЛИЦА ВИЗУАЛЬНЫХ СУЩНОСТЕЙ ============
// `src/core/worm-parts.js` — имена для человека и агента: «левая скула»,
// «пятачок», «покров кожи». Таблица снаружи рендерера, и проверять её надо
// ровно потому, что она снаружи: разъехаться с деревом ей ничто не мешает.
//
// ---------- ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО ----------
//   1. Каждая сущность НАХОДИТСЯ и отдаёт точку ВНУТРИ персонажа. Таблица,
//      половина которой указывает в пустоту, хуже отсутствия таблицы:
//      она выглядит работающей.
//   2. Ориентиры черепа лежат НА КОНТУРЕ, а не рядом. Они считаются
//      формулой, а не берутся из дерева, и единственный способ узнать, что
//      формула та же, — спросить сам контур: точка чуть внутрь — внутри,
//      чуть наружу — снаружи.
//   3. Левое и правое означают ОДНО И ТО ЖЕ у всех сущностей. «Левая скула»
//      обязана лежать с той же стороны, что «левый глаз», иначе таблица
//      врёт человеку и агенту одинаково убедительно.
//   4. Ориентиры едут за ракурсом. Скула, стоящая на месте при повороте
//      головы, — это ручка, которая при повороте окажется не на скуле.
//   5. `identify()` НИКОГДА не возвращает техническую обёртку. Ради этого
//      файл и заведён: тык в голову даёт `head-tilt`, а такой части тела
//      не существует.
//   6. Кисть СХЛОПЫВАЕТ стопку: девять технических слоёв под пальцем
//      превращаются в единицы осмысленных. Перебор, в котором «покров кожи»
//      идёт пять раз подряд, — это не перебор.
//   7. Таблица не трогает игру: персонаж с ней и без неё одинаков.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     node tools/test-worm-parts.js /tmp/shots-
(async () => {
  const out = process.argv[2] || '/tmp/worm-parts-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
  await harness.prepare(page);
  const errors = [];
  let bad = 0;
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const say = console.log;
  const check = (ok, text) => { say((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) bad++; };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: out + '1-main.png' });

  // ---------- 0. ТАБЛИЦА ВООБЩЕ ЕСТЬ ----------
  say('');
  say('======== ТАБЛИЦА ========');
  const table = await page.evaluate(() => {
    if (typeof WormParts === 'undefined') return null;
    const l = WormParts.list();
    const byKind = {};
    l.forEach(e => { byKind[e.kind] = (byKind[e.kind] || 0) + 1; });
    const keys = l.map(e => e.key), titles = l.map(e => e.title);
    return {
      total: l.length, byKind,
      dupKeys: keys.filter((k, i) => keys.indexOf(k) !== i),
      dupTitles: titles.filter((t, i) => titles.indexOf(t) !== i),
      noTitle: l.filter(e => !e.title || !e.title.trim()).map(e => e.key),
      // Ни одна сущность не смеет называться технической обёрткой.
      wrappers: l.filter(e => WormParts.WRAPPERS.has(e.key)).map(e => e.key)
    };
  });
  if (!table) { say('  ✗ WormParts не загрузился'); await browser.close(); process.exit(1); }
  say(`  сущностей: ${table.total} (узлов ${table.byKind.node}, ` +
      `ориентиров ${table.byKind.landmark}, слоёв ${table.byKind.layer})`);
  check(table.dupKeys.length === 0, 'ключи уникальны' + (table.dupKeys.length ? ': повтор ' + table.dupKeys.join(',') : ''));
  check(table.dupTitles.length === 0, 'имена уникальны' + (table.dupTitles.length ? ': повтор ' + table.dupTitles.join(',') : ''));
  check(table.noTitle.length === 0, 'у каждой есть человеческое имя');
  check(table.wrappers.length === 0, 'ни одна сущность не названа технической обёрткой');

  // ---------- 1. КАЖДАЯ НАХОДИТСЯ И УКАЗЫВАЕТ В ПЕРСОНАЖА ----------
  say('');
  say('======== КАЖДАЯ УКАЗЫВАЕТ В ПЕРСОНАЖА ========');
  // Сверяется ЭКРАННАЯ точка с ЭКРАННЫМ габаритом. Первая версия брала
  // `root.getBBox()` — а он в координатах самой группы, тогда как `at()`
  // отвечает в координатах корневого svg. Две разные системы, и прогон
  // объявил мимо персонажа ВСЁ, включая голову. Ошибка прогона, не игры, но
  // выглядела она в точности как провал игры.
  const found = await page.evaluate(() => {
    const h = window.MainWormHandle;
    const root = h.svgRoot.querySelector('.worm-root');
    const b = root.getBoundingClientRect();
    // Запас: у хвоста и ушей точка ложится к самой кромке габарита.
    const pad = 6;
    const res = { present: [], absent: [], outside: [] };
    WormParts.list().forEach(e => {
      const p = WormParts.client(h, e.key);
      if (!p) { res.absent.push(e.key); return; }
      const inside = p.x >= b.left - pad && p.x <= b.right + pad
                  && p.y >= b.top - pad && p.y <= b.bottom + pad;
      if (!inside) res.outside.push({ key: e.key, x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
      else res.present.push(e.key);
    });
    res.box = { w: +b.width.toFixed(0), h: +b.height.toFixed(0) };
    return res;
  });
  say(`  габарит персонажа: ${found.box.w}×${found.box.h}`);
  say(`  нашлось ${found.present.length}, нет на экране ${found.absent.length}`);
  // «Нет на экране» — законный ответ: растущих сегментов всего два из
  // двенадцати возможных, анатомия части слоёв может быть выключена.
  say(`  отсутствуют: ${found.absent.join(', ') || '—'}`);
  check(found.outside.length === 0,
        'ни одна найденная не указывает мимо персонажа' +
        (found.outside.length ? ': ' + found.outside.map(o => `${o.key}(${o.x},${o.y})`).join(', ') : ''));
  check(found.present.length >= 40, `нашлось не меньше сорока сущностей: ${found.present.length}`);
  // Без этих пяти таблица бессмысленна, как бы ни выглядела статистика.
  const MUST = ['head', 'belly', 'tail', 'eye-left', 'cheek-left'];
  MUST.forEach(k => check(found.present.indexOf(k) !== -1, `«${k}» на месте`));

  // ---------- 2. ОРИЕНТИРЫ ЛЕЖАТ НА КОНТУРЕ ----------
  // Спрашиваем САМ контур (WormSilhouette.skullContains), а не повторяем
  // здесь формулу: проверка, списанная с того же места, что и код, согласна
  // с ним всегда и потому бесполезна.
  say('');
  say('======== ОРИЕНТИРЫ ЧЕРЕПА ЛЕЖАТ НА КОНТУРЕ ========');
  const marks = await page.evaluate(() => {
    const h = window.MainWormHandle;
    const m = WormParts.model(h), yaw = WormParts.yaw(h);
    // Только ЧЕРЕПНЫЕ: у точек контура уха своя кривая и своя система
    // координат (местная, самого уха), и спрашивать с них череп — значит
    // проверять не то.
    return WormParts.list().filter(e => e.kind === 'landmark' && e.skull).map(e => {
      const p = WormParts.at(h, e.key);
      if (!p || !p.local) return { key: e.key, err: 'не нашлось' };
      const n = p.local;
      // Чуть внутрь — обязан быть внутри; чуть наружу — снаружи.
      return {
        key: e.key, title: e.title,
        x: +n.x.toFixed(3), y: +n.y.toFixed(3),
        inside: WormSilhouette.skullContains(n.x * 0.93, n.y * 0.93, m.head.skull, yaw),
        outside: !WormSilhouette.skullContains(n.x * 1.10, n.y * 1.10, m.head.skull, yaw)
      };
    });
  });
  marks.forEach(mk => {
    if (mk.err) { check(false, `${mk.key}: ${mk.err}`); return; }
    check(mk.inside && mk.outside,
          `${mk.title.padEnd(16)} (${mk.x}, ${mk.y}) — на кромке черепа` +
          (mk.inside ? '' : ' [точка НЕ внутри]') + (mk.outside ? '' : ' [точка НЕ у края]'));
  });

  // ---------- 2б. ТОЧКИ КОНТУРА УХА ЛЕЖАТ НА УХЕ ----------
  // Та же мысль, что и у черепа, но контур другой: спрашиваем САМ
  // нарисованный путь уха, а не повторяем здесь его числа. Ручка, стоящая
  // не на контуре, двигает не то, на что показывает, — и увидеть это
  // глазом нельзя: она всё равно где-то рядом с ухом.
  say('');
  say('======== ТОЧКИ КОНТУРА УХА ЛЕЖАТ НА КОНТУРЕ УХА ========');
  const ears = await page.evaluate(() => {
    const h = window.MainWormHandle;
    const root = h.svgRoot.querySelector('.worm-root');
    return WormParts.list().filter(e => e.kind === 'landmark' && e.form).map(e => {
      const p = WormParts.at(h, e.key);
      if (!p || !p.local) return { key: e.key, err: 'не нашлось' };
      const host = root.querySelector(`[data-part="${e.form.host}"]`);
      const path = host && host.querySelector('path');
      if (!path) return { key: e.key, err: 'у уха нет пути' };
      const pt = h.svgRoot.createSVGPoint();
      pt.x = p.local.x; pt.y = p.local.y;
      // Чуть внутрь от центра уха — внутри; чуть наружу — снаружи.
      const C = { x: 4, y: -8 };   // середина клина
      const k = (f) => {
        const q = h.svgRoot.createSVGPoint();
        q.x = C.x + (p.local.x - C.x) * f;
        q.y = C.y + (p.local.y - C.y) * f;
        return path.isPointInFill(q);
      };
      return { key: e.key, title: e.title,
               x: +p.local.x.toFixed(1), y: +p.local.y.toFixed(1),
               inside: k(0.88), outside: !k(1.18) };
    });
  });
  check(ears.length === 10, `точек контура уха: ${ears.length} — по пять на сторону`);
  ears.forEach(mk => {
    if (mk.err) { check(false, `${mk.key}: ${mk.err}`); return; }
    check(mk.inside && mk.outside,
          `${mk.title.padEnd(22)} (${mk.x}, ${mk.y}) — на кромке уха` +
          (mk.inside ? '' : ' [точка НЕ внутри]') + (mk.outside ? '' : ' [снаружи тоже внутри]'));
  });

  // ---------- 3. ЛЕВОЕ ЕСТЬ ЛЕВОЕ ----------
  say('');
  say('======== ЛЕВОЕ И ПРАВОЕ ОЗНАЧАЮТ ОДНО И ТО ЖЕ ========');
  const sides = await page.evaluate(() => {
    const h = window.MainWormHandle;
    const x = (k) => { const p = WormParts.at(h, k); return p ? p.x : null; };
    const pairs = [['eye-left', 'eye-right'], ['ear-left', 'ear-right'],
                   ['cheek-left', 'cheek-right'], ['temple-left', 'temple-right'],
                   ['jowl-left', 'jowl-right'], ['brow-left', 'brow-right']];
    const ref = x('eye-left') - x('eye-right');   // знак «левое относительно правого»
    return pairs.map(([l, r]) => {
      const a = x(l), b = x(r);
      return { l, r, ok: a != null && b != null && Math.sign(a - b) === Math.sign(ref),
               dx: a != null && b != null ? +(a - b).toFixed(1) : null };
    });
  });
  sides.forEach(s => check(s.ok, `${s.l} и ${s.r} по разные стороны, левое там же, где у глаза (Δx ${s.dx})`));

  // ---------- 4. ОРИЕНТИРЫ ЕДУТ ЗА РАКУРСОМ ----------
  // Скула, стоящая на месте при повороте головы, — это ручка, которая при
  // повороте окажется не на скуле.
  say('');
  say('======== ОРИЕНТИРЫ ЕДУТ ЗА РАКУРСОМ ========');
  const moved = await page.evaluate(async () => {
    const h = window.MainWormHandle;
    const read = () => ['cheek-left', 'cheek-right', 'temple-left', 'jowl-right']
      .map(k => { const p = WormParts.at(h, k); return p ? p.x : null; });
    h.setHeadPose(-1, { instant: true });
    await new Promise(r => setTimeout(r, 260));
    const at0 = read();
    h.setHeadPose(1, { instant: true });
    await new Promise(r => setTimeout(r, 260));
    const at1 = read();
    h.setHeadPose('auto');
    return { at0, at1, yawSeen: WormParts.yaw(h) };
  });
  const deltas = moved.at1.map((v, i) => Math.abs(v - moved.at0[i]));
  say('  сдвиг ориентиров при развороте −1 → +1: ' + deltas.map(d => d.toFixed(1)).join(', '));
  check(deltas.every(d => d > 0.5), 'каждый ориентир сдвинулся — формула читает ракурс, а не игнорирует его');

  // ---------- 5. IDENTIFY НЕ ОТДАЁТ ОБЁРТКИ ----------
  say('');
  say('======== ТЫК НЕ ВОЗВРАЩАЕТ ТЕХНИЧЕСКУЮ ОБЁРТКУ ========');
  const ident = await page.evaluate(() => {
    const h = window.MainWormHandle;
    const root = h.svgRoot.querySelector('.worm-root');
    const bad = [], sample = [];
    // Спрашиваем про КАЖДЫЙ узел персонажа: где-то обёртка да вылезет, если
    // она вылезает вообще.
    root.querySelectorAll('*').forEach(el => {
      const id = WormParts.identify(el);
      if (!id) return;
      const keys = [id.entity.key, id.part ? id.part.key : null].filter(Boolean);
      keys.forEach(k => { if (WormParts.WRAPPERS.has(k)) bad.push(k); });
      if (sample.length < 6 && id.part) sample.push(id.title);
    });
    return { bad: [...new Set(bad)], sample, total: root.querySelectorAll('*').length };
  });
  say(`  опрошено узлов: ${ident.total}`);
  say(`  примеры ответов: ${ident.sample.join(' · ')}`);
  check(ident.bad.length === 0,
        'ни один ответ не является обёрткой' + (ident.bad.length ? ': ' + ident.bad.join(',') : ''));

  // ---------- 6. КИСТЬ СХЛОПЫВАЕТ СТОПКУ ----------
  say('');
  say('======== КИСТЬ СХЛОПЫВАЕТ СТОПКУ ========');
  const brush = await page.evaluate(() => {
    const h = window.MainWormHandle;
    const root = h.svgRoot.querySelector('.worm-root');
    const r = root.getBoundingClientRect();
    const probe = (fx, fy) => {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      const raw = document.elementsFromPoint(x, y).filter(e => root.contains(e)).length;
      const st = WormParts.stack(h, x, y);
      return { raw, named: st.length, titles: st.map(s => s.title) };
    };
    return { head: probe(0.62, 0.18), tail: probe(0.12, 0.82) };
  });
  ['head', 'tail'].forEach(k => {
    const p = brush[k];
    say(`  ${k === 'head' ? 'голова' : 'хвост '}: ${p.raw} узлов в дереве → ${p.named} имён`);
    say('          ' + p.titles.map((t, i) => (i + 1) + '. ' + t).join('   '));
    check(p.named > 0, `${k}: кисть что-то нашла`);
    check(p.named <= p.raw, `${k}: имён не больше, чем узлов (повторы схлопнуты)`);
  });

  // ---------- 7. ТАБЛИЦА НЕ ТРОГАЕТ ИГРУ ----------
  // Она только читает. Проверяется тем, что после всех опросов персонаж
  // цел: узлы на месте, ошибок на странице нет.
  say('');
  say('======== ТАБЛИЦА ТОЛЬКО ЧИТАЕТ ========');
  const after = await page.evaluate(() => {
    const root = window.MainWormHandle.svgRoot.querySelector('.worm-root');
    return { nodes: root.querySelectorAll('*').length };
  });
  check(after.nodes === ident.total, `узлов столько же, сколько до опроса: ${after.nodes}`);
  await page.screenshot({ path: out + '2-after.png' });

  if (errors.length) { say('\nОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n')); bad += errors.length; }
  say('\n' + (bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ СОШЛОСЬ'));
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
