const { chromium } = require('playwright');
const { viewport, prepare } = require('./harness');

// ================= ПРОГОН: КАК СИДИТ НАРЯД =================
// Одежда носится ВЕЗДЕ и видна всегда — значит её посадка это не украшение,
// а такая же механика, как ракурс глаз. Проверяется четыре вещи:
//
//   1. предмет ЛЕЖИТ НА ТЕЛЕ — доля не ниже заявленной в каталоге (`sits`).
//      Именно так ловится повисший в воздухе угол: лента выходила за живот
//      концами (0.84), бант парил над хвостом (0.67);
//   2. надетое на голову ЕДЕТ ВМЕСТЕ С ЛИЦОМ. До правки оно висело
//      статическим узлом: очки съезжали мимо глаз, цилиндр уходил с черепа;
//   3. очки сидят НА ГЛАЗАХ при любом повороте — линза на яблоке, а не рядом;
//   4. живот не закрыт одеждой целиком: он единственная вершина силуэта
//      (docs/art-direction.md §4.1), и фрак обязан быть распахнут.
//
// Мерится по ДЕРЕВУ, а не по картинке: тело — объединение `.worm-part-shape`,
// предмет — его собственные фигуры, попадание считается isPointInFill.
//
// Запуск (из корня, при поднятом `python3 -m http.server 8777`):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-wardrobe.js /tmp/shot-
(async () => {
  const out = process.argv[2] || '/tmp/wear-';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(viewport({ deviceScaleFactor: 2 }));
  await prepare(page);

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const fail = [];
  const check = (ok, what) => { console.log((ok ? '  ok  ' : ' FAIL ') + what); if (!ok) fail.push(what); };

  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(2500);

  await page.addScriptTag({ content: `
    window.__wear = {
      // ---------- ЗАМЕРЫ ТОЛЬКО ПО СВОЕМУ ЧЕРВЮ ----------
      // Червей на экране бывает несколько (комната, колесо грехов, лобби), и
      // наряд по состоянию надевается на ВСЕХ. document.querySelector брал
      // первого попавшегося — иногда скрытого, с вырожденной матрицей, — и
      // проверка «пришито к телу» краснела через раз на ровном месте.
      root() {
        return (window.MainWormHandle && MainWormHandle.svgRoot) || document.querySelector('#game-container svg');
      },
      q(sel) { const r = this.root(); return r ? r.querySelector(sel) : null; },
      qa(sel) { const r = this.root(); return r ? [...r.querySelectorAll(sel)] : []; },
      // Доля площади предмета, лежащая на теле. Тело — объединение силуэтов
      // частей; точки берутся сеткой по каждой фигуре предмета.
      //
      // ВИСЯЩИЕ части ([data-swing]) в счёт не идут: лента, качнувшаяся в
      // сторону, ЗАКОННО уходит с тела — на то она и висит. За них отвечает
      // отдельная проверка: пришитый конец обязан быть на теле.
      // У гнезда может быть НЕСКОЛЬКО узлов: верхняя одежда занимает два
      // сегмента, серьга висит на двух ушах. Считаем по всем сразу.
      nodes(slot) { return this.qa('[data-cosmetic="' + slot + '"]'); },

      onBody(slot) {
        const svg = document.querySelector('#game-container svg');
        const gs = this.nodes(slot);
        if (!gs.length || !svg) return null;
        const parts = this.qa('.worm-part-shape');
        let inside = 0, total = 0;
        const pt = svg.createSVGPoint();
        const shapes = [];
        gs.forEach(g => shapes.push(...g.querySelectorAll('path,rect,circle,ellipse,polygon')));
        shapes.forEach(sh => {
          if (!sh.isPointInFill || sh.closest('[data-swing]')) return;
          const bb = sh.getBBox(), N = 14;
          for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
            pt.x = bb.x + bb.width * i / N; pt.y = bb.y + bb.height * j / N;
            if (!sh.isPointInFill(pt)) continue;
            total++;
            const scr = pt.matrixTransform(sh.getScreenCTM());
            const on = parts.some(p => {
              const m = p.getScreenCTM(); if (!m) return false;
              const loc = scr.matrixTransform(m.inverse());
              const q = svg.createSVGPoint(); q.x = loc.x; q.y = loc.y;
              return p.isPointInFill(q);
            });
            if (on) inside++;
          }
        });
        return total ? +(inside / total).toFixed(3) : null;
      },

      // Насколько линзы очков совпали с глазами, в долях радиуса глаза.
      lensOffEye() {
        const g = this.q('[data-cosmetic="eyes"]');
        if (!g) return null;
        // Перемычка между линзами — тоже rect, но линзой не является.
        const lens = [...g.querySelectorAll('rect:not([data-span])')]
          .map(r => r.getBoundingClientRect())
          .filter(r => r.width > 3 && r.height > 3)
          .sort((a, b) => a.x - b.x);
        const eyes = ['left', 'right'].map(s => {
          const e = this.q('[data-part="eye-' + s + '"] ellipse[fill*="sclera"]');
          return e ? e.getBoundingClientRect() : null;
        }).filter(Boolean).sort((a, b) => a.x - b.x);
        if (lens.length < 2 || eyes.length < 2) return null;
        let worst = 0;
        for (let i = 0; i < 2; i++) {
          const dx = (lens[i].x + lens[i].width / 2) - (eyes[i].x + eyes[i].width / 2);
          const dy = (lens[i].y + lens[i].height / 2) - (eyes[i].y + eyes[i].height / 2);
          worst = Math.max(worst, Math.hypot(dx, dy) / Math.max(4, eyes[i].width / 2));
        }
        return +worst.toFixed(2);
      },

      // Доля ЖИВОТА, закрытая надетым. Живот — вершина силуэта, затянуть его
      // целиком нельзя.
      // Доля ТОЛЩИНЫ части, закрытая тканью там, где ткань лежит. Одежда
      // обязана доходить до краёв: то, что кончается внутри части, читается
      // наклейкой. Меряется по настоящему силуэту (isPointInFill), а не по
      // габаритному прямоугольнику: у хвоста-капли прямоугольник вдвое выше
      // самого хвоста в том месте, где надета гетра.
      //
      // Висящее ([data-swing]) не в счёт — оно и должно выходить за тело.
      // Часть спрашивается у того же WormMarks.resolveSlot, что и у
      // рендерера: угадывать её «ближайшей к предмету» значило бы завести
      // второе описание.
      // sub — какая ЧАСТЬ многочастной вещи меряется ('upper' / 'lower').
      // У гнезда мест может быть два, и мерить их надо по отдельности:
      // каждая половина сидит на своём сегменте.
      clothSpan(slot, along, sub) {
        const svg = document.querySelector('#game-container svg');
        const g = sub ? this.q('[data-cosmetic="' + slot + '"][data-sub="' + sub + '"]')
                      : this.q('[data-cosmetic="' + slot + '"]');
        const places = WormMarks.resolveSlot(MainWormHandle.model || GameState.data.worm, slot) || [];
        const place = sub ? places.filter(pl => pl.sub === sub)[0] : places[0];
        if (!g || !place || !svg) return null;
        const holder = this.q('[data-part="' + place.part + '"]');
        const shape = holder && holder.querySelector('.worm-part-shape');
        if (!shape) return null;
        const cloth = [...g.querySelectorAll('path,rect,circle,ellipse,polygon')]
          .filter(el => !el.closest('[data-swing]'));
        if (!cloth.length) return null;
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        cloth.forEach(el => {
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) return;
          x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.right);
          y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.bottom);
        });
        if (x1 <= x0) return null;
        // ---------- РЕЗАТЬ НАДО ПОПЕРЁК ЧАСТИ, А НЕ ПОПЕРЁК ЭКРАНА ----------
        // Разрез шёл строго по вертикали экрана. Пока хвост лежал
        // горизонтально, это совпадало; стоило ему загнуться — вертикаль
        // проходила наискось и мерила НЕ толщину, а диагональ. Проверка
        // краснела от позы червя, а не от кроя.
        //
        // Ось части знает её матрица: (a, b) — куда смотрит местный x на
        // экране, (c, d) — местный y. Режем вдоль них.
        const m = shape.getScreenCTM();
        const ax = Math.hypot(m.a, m.b) || 1, ay = Math.hypot(m.c, m.d) || 1;
        const dir = along ? { x: m.c / ay, y: m.d / ay }    // поперёк длинной части
                          : { x: m.a / ax, y: m.b / ax };   // поперёк обычной
        // ---------- ЭКРАН → ЧАСТЬ: БЕЗ СЫРОГО getScreenCTM ----------
        // Точки сюда приходят ЭКРАННЫЕ (getBoundingClientRect), а перевод шёл
        // одной обратной матрицей части. Обе величины меряют разное: рамка
        // учитывает css-трансформацию холста всегда, а учитывает ли её CTM —
        // вопрос браузера. При масштабе холста РОВНО ЕДИНИЦА разницы нет, и
        // прогон был зелёным годами; стоило прогнать его «по-айфонски»
        // (SVINO_FAKE_CTM=1), и разрез не попадал в часть ни разу — шесть
        // проверок отвечали «null её толщины» и винили крой.
        //
        // Считаем в два шага, и оба безопасны: экран → корневой svg через
        // SvgSpace (он вообще без матриц), дальше svg → часть ОТНОШЕНИЕМ двух
        // CTM, в котором множитель предка сокращается.
        const toPart = shape.getScreenCTM().inverse().multiply(svg.getScreenCTM());
        const pt = svg.createSVGPoint();
        const hit = (sx, sy) => {
          const v = SvgSpace.fromClient(svg, sx, sy);
          pt.x = v.x; pt.y = v.y;
          const loc = pt.matrixTransform(toPart);
          const q = svg.createSVGPoint(); q.x = loc.x; q.y = loc.y;
          return shape.isPointInFill(q);
        };
        // Центр ткани и её протяжённость ВДОЛЬ линии разреза.
        const cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2;
        const proj = (px, py) => (px - cx0) * dir.x + (py - cy0) * dir.y;
        let c0 = 1e9, c1 = -1e9;
        cloth.forEach(el => {
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) return;
          [[r.x, r.y], [r.right, r.y], [r.x, r.bottom], [r.right, r.bottom]]
            .forEach(q => { const t = proj(q[0], q[1]); c0 = Math.min(c0, t); c1 = Math.max(c1, t); });
        });
        // Сколько части попадает под тот же разрез.
        const pr = shape.getBoundingClientRect();
        const reach = Math.hypot(pr.width, pr.height);
        const N = 400;
        let a = null, b = null;
        for (let i = 0; i <= N; i++) {
          const t = -reach + (2 * reach) * i / N;
          if (!hit(cx0 + dir.x * t, cy0 + dir.y * t)) continue;
          if (a == null) a = t;
          b = t;
        }
        if (a == null || b <= a) return null;
        const cover = Math.min(c1, b) - Math.max(c0, a);
        return +(cover / (b - a)).toFixed(3);
      },

      // Экранная ширина ОБШИВКИ вещи (без подола) и центр её лица.
      // По первой видно, растёт ли одежда вместе с частью, по второму —
      // не разошлись ли половины одной вещи.
      clothWidth(slot, sub) {
        const g = this.q('[data-cosmetic="' + slot + '"]'
                         + (sub ? '[data-sub="' + sub + '"]' : ''));
        if (!g) return null;
        const cloth = [...g.querySelectorAll('path,rect,circle,ellipse,polygon')]
          .filter(el => !el.closest('[data-swing]'));
        let x0 = 1e9, x1 = -1e9;
        cloth.forEach(el => {
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) return;
          x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.right);
        });
        return x1 > x0 ? +(x1 - x0).toFixed(2) : null;
      },
      faceCentre(slot, sub) {
        const g = this.q('[data-cosmetic="' + slot + '"]'
                         + (sub ? '[data-sub="' + sub + '"]' : ''));
        const f = g && g.querySelector('[data-face]');
        if (!f) return null;
        const r = f.getBoundingClientRect();
        return r.width ? +(r.x + r.width / 2).toFixed(2) : null;
      },
      // Ширина самой ЧАСТИ на экране — мера, с которой сверяется одежда.
      partWidth(slot, sub) {
        const places = WormMarks.resolveSlot(MainWormHandle.model || GameState.data.worm, slot) || [];
        const place = sub ? places.filter(pl => pl.sub === sub)[0] : places[0];
        if (!place) return null;
        const holder = this.q('[data-part="' + place.part + '"]');
        const shape = holder && holder.querySelector('.worm-part-shape');
        if (!shape) return null;
        const r = shape.getBoundingClientRect();
        return r.width ? +r.width.toFixed(2) : null;
      },

      // Сколько точек ВНУТРИ раздутого живота занято одеждой ЧУЖОЙ части.
      // Слой одежды один на всё тело и лежит выше каждой части разом, так
      // что пиджак соседнего сегмента — сам-то скрытый за животом — может
      // остаться лежать поверх живота отдельной нашлёпкой.
      //
      // Мерится не деревом, а тем, что РЕАЛЬНО видно в точке: у выреза
      // (clip-path) в дереве ничего не меняется, и любая проверка по узлам
      // была бы зелена и до правки, и после.
      overFront(exceptSub) {
        const root = this.root();
        const svg = document.querySelector('#game-container svg');
        const belly = root.querySelector('[data-part="belly"] .worm-part-shape');
        if (!belly || !svg) return null;
        const bb = belly.getBBox(), m = belly.getScreenCTM(), N = 40;
        const pt = svg.createSVGPoint();
        let inside = 0, over = 0;
        // Сетка идёт по СЕРЕДИНАМ клеток, а не по их углам. Угловая сетка
        // начинается ровно на кромке габарита живота — а там законно лежит
        // одежда СОСЕДНЕГО сегмента: сегменты перекрываются, на то они и
        // цепочка. Замер это и показал: нарушение всегда приходило в одну и
        // ту же точку верхнего ряда (j = 0) и только при ×1.25, то есть
        // проверка при допуске «ровно ноль» решкой падала, а орлом проходила.
        //
        // Порог остался НОЛЬ — ослаблять его нельзя, дефект был настоящий и
        // стоил двадцати четырёх точек из ста. Поменялось только то, ГДЕ
        // задаётся вопрос: в теле живота, а не на его шве.
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          pt.x = bb.x + bb.width * (i + 0.5) / N;
          pt.y = bb.y + bb.height * (j + 0.5) / N;
          if (!belly.isPointInFill(pt)) continue;
          inside++;
          const s = pt.matrixTransform(m);
          const el = document.elementFromPoint(s.x, s.y);
          const g = el && el.closest && el.closest('[data-cosmetic]');
          if (!g) continue;
          if (g.getAttribute('data-sub') !== exceptSub) over++;
        }
        return { inside, over };
      },

      bellyCovered() {
        const svg = document.querySelector('#game-container svg');
        const g = this.q('[data-cosmetic="coat"][data-sub="lower"]');
        const belly = this.q('[data-anchor="belly-scars"]');
        const shape = belly && belly.parentNode.querySelector(':scope > .worm-part-shape');
        if (!g || !shape) return null;
        const bb = shape.getBBox(), N = 24;
        let inside = 0, covered = 0;
        const pt = svg.createSVGPoint();
        // ---------- МЕРЯЕТСЯ ОБШИВКА, А НЕ ПОДОЛ ----------
        // Правило про живот — про то, чтобы ткань не ЗАТЯГИВАЛА его. Подол,
        // свисающий ниже тела, — законная часть вещи (на то он и подол), и
        // считать его «затянутым животом» неправильно: так проверка требовала
        // бы отказаться от фалд у фрака.
        const cloth = [...g.querySelectorAll('path,rect,circle,ellipse,polygon')]
          .filter(el => !el.closest('[data-swing]'));
        for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
          pt.x = bb.x + bb.width * i / N; pt.y = bb.y + bb.height * j / N;
          if (!shape.isPointInFill(pt)) continue;
          inside++;
          const scr = pt.matrixTransform(shape.getScreenCTM());
          const hit = cloth.some(c => {
            if (!c.isPointInFill) return false;
            const m = c.getScreenCTM(); if (!m) return false;
            const loc = scr.matrixTransform(m.inverse());
            const q = svg.createSVGPoint(); q.x = loc.x; q.y = loc.y;
            return c.isPointInFill(q);
          });
          if (hit) covered++;
        }
        return inside ? +(covered / inside).toFixed(3) : null;
      },

      // Пришитый конец висящей детали — на теле? Берём точку крепления
      // (начало координат её группы) и спрашиваем силуэты частей.
      hangRoots(slot) {
        const svg = document.querySelector('#game-container svg');
        const gs = this.nodes(slot);
        if (!gs.length || !svg) return null;
        const parts = this.qa('.worm-part-shape');
        const out = [];
        const swings = [];
        gs.forEach(g => swings.push(...g.querySelectorAll('[data-swing]')));
        swings.forEach(el => {
          const m = el.getScreenCTM(); if (!m) return;
          const p = svg.createSVGPoint(); p.x = 0; p.y = 0;
          const scr = p.matrixTransform(m);
          out.push(parts.some(pt => {
            const pm = pt.getScreenCTM(); if (!pm) return false;
            const loc = scr.matrixTransform(pm.inverse());
            const q = svg.createSVGPoint(); q.x = loc.x; q.y = loc.y;
            return pt.isPointInFill(q);
          }));
        });
        return out;
      },

      // Где предмет стоит ОТНОСИТЕЛЬНО ГОЛОВЫ. Не на экране: червь ходит по
      // комнате, и экранный сдвиг считался бы от его шагов, а не от поворота.
      // Какая доля вещи накрыта головой. Для того, что ТОРЧИТ (сигара),
      // это и есть главное: она может быть сколь угодно снаружи, но обязана
      // держаться лица при любом ракурсе.
      overlapHead(slot) {
        const g = this.q('[data-cosmetic="' + slot + '"]');
        const head = this.q('[data-part="head-tilt"]');
        if (!g || !head) return null;
        const r = g.getBoundingClientRect(), h = head.getBoundingClientRect();
        const w = Math.min(r.right, h.right) - Math.max(r.x, h.x);
        const v = Math.min(r.bottom, h.bottom) - Math.max(r.y, h.y);
        if (w <= 0 || v <= 0 || !r.width) return 0;
        return +(w / r.width).toFixed(3);
      },

      // Смещение вещи от ЕЁ ЧЕРТЫ. Сигара сидит на морде, серьга — на ухе,
      // и «едет вместе с головой» им не подходит: их черта сама ездит, и
      // относительно неё вещь обязана СТОЯТЬ. Заодно видно, что черта и
      // правда двигалась, — иначе проверка мерила бы неподвижность.
      // У ВИСЯЩЕГО мерится ТОЧКА КРЕПЛЕНИЯ, а не середина габарита. Серьга
      // висит, а висящее держится вниз ПО ЭКРАНУ, а не по своей детали
      // (docs/bench/turn.md): когда ухо разворачивается, тело серьги
      // законно уезжает относительно него. Мерить это как «уход» — значит
      // мерить задуманное поведение и называть его дефектом.
      //
      // Замер показал разницу: середина габарита гуляла на 4.94 при пороге
      // «меньше 5» — то есть проверка проходила или падала по случайности.
      // Крепление на тех же пяти ракурсах гуляет на 0.40. Порог перестал
      // быть монеткой, а проверка стала отвечать на свой вопрос: серьга
      // ПРИШИТА к уху и с него не съезжает.
      rides(slot, hostSel, side) {
        const g = side ? this.q('[data-cosmetic="' + slot + '"][data-side="' + side + '"]')
                       : this.q('[data-cosmetic="' + slot + '"]');
        const host = this.q(hostSel);
        if (!g || !host) return null;
        const h = host.getBoundingClientRect();
        const skull = this.q('[data-part="head-tilt"]');
        const s0 = skull ? skull.getBoundingClientRect() : h;
        const черта = +((h.x + h.width / 2) - (s0.x + s0.width / 2)).toFixed(1);

        // Крепление — начало координат узла подвески, пересчитанное в
        // систему САМОЙ ЧЕРТЫ. Отношение двух матриц, поэтому масштаб
        // холста сокращается.
        const svg = this.root();
        const sw = g.querySelector('[data-swing]');
        if (sw && svg && sw.getScreenCTM && host.getScreenCTM) {
          const m = sw.getScreenCTM(), hm = host.getScreenCTM();
          if (m && hm) {
            const p = svg.createSVGPoint(); p.x = 0; p.y = 0;
            const loc = p.matrixTransform(m).matrixTransform(hm.inverse());
            return { от: +loc.x.toFixed(2), черта, крепление: true };
          }
        }
        // У неподвижной вещи крепления нет — меряем как раньше, серединой.
        const r = g.getBoundingClientRect();
        return { от: +((r.x + r.width / 2) - (h.x + h.width / 2)).toFixed(1), черта, крепление: false };
      },

      // Симметричную пару (серьги) мерить надо по ОДНОЙ стороне: середина
      // двух зеркальных узлов при повороте почти не двигается, и проверка
      // «поехало вместе с головой» получала ноль на работающей вещи.
      centre(slot, side) {
        const g = side ? this.q('[data-cosmetic="' + slot + '"][data-side="' + side + '"]')
                       : this.q('[data-cosmetic="' + slot + '"]');
        const head = this.q('[data-part="head"]');
        if (!g || !head) return null;
        const r = g.getBoundingClientRect(), h = head.getBoundingClientRect();
        return +((r.x + r.width / 2) - (h.x + h.width / 2)).toFixed(1);
      }
    };
  ` });

  // Ждём не только СОСТОЯНИЕ, но и его отрисовку. Персонаж пересчитывается
  // на своей частоте (по умолчанию 30 Гц), а опрос идёт кадрами страницы
  // (60 Гц): «ракурс доехал» становится правдой на кадр раньше, чем узлы
  // встают на новые места. Замер, сделанный в этот зазор, снимает
  // ПРЕДЫДУЩИЙ ракурс — и проверка с тесным порогом решкой падает, а орлом
  // проходит. Отсюда и брался плавающий провал: то серьга, то цепь, то
  // ничего.
  //
  // Ждём, пока измеряемое перестанет меняться, а не фиксированную паузу:
  // частоту пересчёта правят, а про прогон при этом забывают.
  const setYaw = (v) => page.evaluate(async t => {
    MainWormHandle.setLivePose({ headYaw: t });
    for (let i = 0; i < 240; i++) {
      if (Math.abs(MainWormHandle.getHeadPose().current - t) < 0.01) break;
      await new Promise(r => requestAnimationFrame(r));
    }
    const head = document.querySelector('[data-part="head-tilt"]');
    let prev = null, same = 0;
    for (let i = 0; i < 120 && same < 3; i++) {
      await new Promise(r => requestAnimationFrame(r));
      const r = head ? head.getBoundingClientRect() : null;
      const now = r ? `${r.x.toFixed(2)}|${r.width.toFixed(2)}|${r.height.toFixed(2)}` : '';
      same = (now === prev) ? same + 1 : 0;
      prev = now;
    }
  }, v);

  const dress = (c) => page.evaluate(async cc => {
    GameState.data.cosmetics = cc;
    GameState.data.scars = [];
    MainWormHandle.setOverride({ cosmetics: cc, scars: [] });
    await new Promise(r => setTimeout(r, 400));
  }, c);

  const catalog = await page.evaluate(() => PRIDE_WARDROBE.items.map(i => ({ id: i.id, slot: i.slot, sits: i.sits })));
  const YAWS = [-1, -0.5, 0, 0.5, 1];

  // ---------- 0. КАЖДАЯ ВЕЩЬ ИДЁТ ПО РЕЛЬСАМ ----------
  // Проверяется не картинка, а КРОЙ — то, что должно достаться новой вещи
  // само, без отладки. Три правила:
  //
  //   1. каталог и картинки не разъехались: у каждого купленного предмета
  //      есть выкройка, и род у неё объявлен;
  //   2. у ткани объявлен ОХВАТ — докуда по части она идёт. Вещь без охвата
  //      кроится наугад;
  //   3. ткань ДОХОДИТ ДО КРАЁВ части. Это и отличает одежду от нашлёпки:
  //      фрак занимал два узких клина у краёв живота, между ними и телом
  //      оставалась голая кожа, и вся вещь читалась галстуком-бабочкой.
  console.log('\n--- крой: вещь скроена по телу, а не наклеена ---');
  const rails = await page.evaluate(ids => ids.map(id => {
    const p = WormCosmetics.ITEMS[id];
    if (!p) return { id, есть: false };
    // Вещь может быть МНОГОЧАСТНОЙ: верхняя одежда занимает два сегмента, и
    // охват объявлен у каждой половины отдельно.
    const halves = p.parts ? Object.keys(p.parts).map(k => p.parts[k]) : [p];
    const ok = (c) => !!(c && c.length === 2 && c[0] >= -1 && c[1] <= 1 && c[1] > c[0]);
    return {
      id, есть: true, kind: p.kind || null, along: !!(p.along || halves.some(h => h.along)),
      части: p.parts ? Object.keys(p.parts) : null,
      охват: p.kind === 'cloth' ? halves.every(h => ok(h.cover)) : true
    };
  }), catalog.map(i => i.id));
  rails.forEach(r => {
    check(r.есть && (r.kind === 'cloth' || r.kind === 'rigid'),
      `у «${r.id}» есть выкройка и объявлен род: ${r.kind}`);
    check(r.охват, `у «${r.id}» объявлен охват по части`);
  });
  // Замер идёт СТРОГО В АНФАС: при повороте тела вещь законно сужается до
  // двух третей, и проверка «доходит ли до краёв» в три четверти мерила бы
  // ракурс, а не крой.
  for (const item of catalog) {
    const p = rails.filter(r => r.id === item.id)[0];
    if (!p || p.kind !== 'cloth') continue;
    const set = {}; set[item.slot] = item.id;
    await dress(set);
    await page.evaluate(async () => {
      MainWormHandle.setLivePose({ bodyYaw: 0 });
      for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    });
    // У многочастной вещи проверяется КАЖДАЯ половина: разошлась одна —
    // костюм разъехался по шву.
    for (const sub of (p.части || [null])) {
      const w = await page.evaluate(a => window.__wear.clothSpan(a[0], a[1], a[2]),
                                    [item.slot, !!p.along, sub]);
      check(w != null && w >= 0.85,
        `«${item.id}${sub ? ':' + sub : ''}» доходит до краёв части: ${w} её толщины`);
    }
  }
  await page.evaluate(() => MainWormHandle.setLivePose({ bodyYaw: null }));

  // ---------- 1. ВСЁ ЛЕЖИТ НА ТЕЛЕ ----------
  console.log('\n--- предмет лежит на теле, а не рядом ---');
  const worst = {};
  for (const item of catalog) {
    const set = {}; set[item.slot] = item.id;
    await dress(set);
    for (const yaw of YAWS) {
      await setYaw(yaw);
      const v = await page.evaluate(s => window.__wear.onBody(s), item.slot);
      if (v == null) { worst[item.id] = null; continue; }
      worst[item.id] = worst[item.id] == null ? v : Math.min(worst[item.id], v);
    }
  }
  catalog.forEach(item => {
    const v = worst[item.id];
    check(v != null && v >= item.sits,
      `«${item.id}» лежит на теле: ${v} при заявленных ${item.sits}`);
  });

  console.log('\n--- висящее пришито к телу ---');
  for (const [slot, id] of [['neck', 'chain'], ['coat', 'tux'], ['tailTip', 'tail-bow']]) {
    const set = {}; set[slot] = id;
    await dress(set);
    let bad = 0, total = 0;
    for (const yaw of YAWS) {
      await setYaw(yaw);
      const r = await page.evaluate(s => window.__wear.hangRoots(s), slot);
      (r || []).forEach(ok => { total++; if (!ok) bad++; });
    }
    check(total > 0 && bad === 0,
      `у «${id}» пришитый конец висящей детали на теле: ${total - bad} из ${total}`);
  }

  // ---------- 2. ГОЛОВНОЕ ЕДЕТ ВМЕСТЕ С ЛИЦОМ ----------
  // На голове четыре гнезда, и каждое обязано ехать: шляпа на макушке, очки
  // на глазах, сигара во рту, серьги в ушах. Пока гнездо было одно, носить
  // их одновременно было нельзя, а половина этих проверок не существовала.
  console.log('\n--- надетое на голову едет с лицом ---');
  // Шляпа и очки ездят по ЧЕРЕПУ — их сдвиг виден относительно головы.
  for (const slot of ['hat', 'eyes']) {
    const item = catalog.filter(i => i.slot === slot)[0];
    if (!item) { check(false, `в гнезде «${slot}» нет ни одного предмета`); continue; }
    const set = {}; set[slot] = item.id;
    await dress(set);
    await setYaw(-1); const left = await page.evaluate(s => window.__wear.centre(s), slot);
    await setYaw(1);  const right = await page.evaluate(s => window.__wear.centre(s), slot);
    check(left != null && right != null && right - left > 6,
      `«${item.id}» (${slot}) проехал вместе с головой: ${left} → ${right}`);
  }

  // ---------- 2б. РОТ И УШИ ЕДУТ СО СВОЕЙ ЧЕРТОЙ ----------
  // Сигара сидит на морде, серьга — на ухе. Относительно ЧЕРТЫ они обязаны
  // стоять на месте: черта ездит сама, и вещь просто повторяет её. Пока
  // сигара получала сдвиг морды, но не её сужение, она при повороте
  // отрывалась от лица.
  // Опора мерится по САМОЙ ЧЕРТЕ, а не по её соседям. Пробовали морду —
  // её группа обрезана по черепу и при повороте не сужается вовсе; пробовали
  // пятачок — он выступает вперёд и ездит по своему закону. Вещь во рту
  // обязана совпадать со РТОМ, вещь на ухе — со СВОИМ ухом.
  for (const [slot, hostSel, side] of [['ears', '[data-part="ear-right"]', 'right']]) {
    const item = catalog.filter(i => i.slot === slot)[0];
    if (!item) { check(false, `в гнезде «${slot}» нет ни одного предмета`); continue; }
    const set = {}; set[slot] = item.id;
    await dress(set);
    const seen = [];
    for (const yaw of YAWS) {
      await setYaw(yaw);
      const v = await page.evaluate(a => window.__wear.rides(a[0], a[1], a[2]), [slot, hostSel, side]);
      if (v) seen.push(v);
    }
    const offs = seen.map(v => v.от);
    const hostMoved = Math.max(...seen.map(v => v.черта)) - Math.min(...seen.map(v => v.черта));
    const drift = offs.length ? Math.max(...offs) - Math.min(...offs) : null;
    check(seen.length === YAWS.length && hostMoved > 4,
      `черта под «${item.id}» и правда ездит: размах ${hostMoved.toFixed(1)}`);
    // Порог тесный НАМЕРЕННО: меряется крепление, а оно обязано стоять
    // намертво. Прежние «меньше 5» стояли на измеренных 4.94 — запас в один
    // процент, то есть монетка (см. rides).
    const pinned = seen.every(v => v.крепление);
    check(drift != null && drift < (pinned ? 1.5 : 5),
      `«${item.id}» ${pinned ? 'пришита к своей черте: крепление гуляет на' : 'едет вместе со своей чертой: уход'} ${drift}`);
  }

  // ---------- 2в. ТОРЧАЩЕЕ ДЕРЖИТСЯ ЛИЦА ----------
  // У сигары мерить «смещение от рта» бессмысленно: она повторяет transform
  // самого рта, и ответ был бы тождественно нулевым — проверка проверяла бы
  // сама себя. Смысл в другом: при повороте она не должна ОТОРВАТЬСЯ от
  // лица. Именно это и было видно глазами — сигара улетала вбок.
  {
    const item = catalog.filter(i => i.slot === 'mouth')[0];
    await dress({ mouth: item.id });
    let worst = 1;
    for (const yaw of YAWS) {
      await setYaw(yaw);
      const v = await page.evaluate(() => window.__wear.overlapHead('mouth'));
      if (v != null) worst = Math.min(worst, v);
    }
    check(worst > 0.25,
      `«${item.id}» держится лица при любом повороте: худшее перекрытие ${worst}`);
  }

  // ---------- 3. ЛИНЗЫ НА ГЛАЗАХ ----------
  console.log('\n--- очки сидят на глазах ---');
  await dress({ eyes: 'shades' });
  let lensWorst = 0, lensMeasured = 0;
  for (const yaw of YAWS) {
    await setYaw(yaw);
    const v = await page.evaluate(() => window.__wear.lensOffEye());
    if (v != null) { lensMeasured++; lensWorst = Math.max(lensWorst, v); }
  }
  check(lensMeasured && lensWorst < 0.8,
    `линза не уезжает с яблока ни при каком повороте: худший промах ${lensWorst} радиуса глаза (замеров ${lensMeasured} из ${YAWS.length})`);

  // ---------- 4. ЖИВОТ НЕ ЗАТЯНУТ ЦЕЛИКОМ ----------
  console.log('\n--- живот виден из-под одежды ---');
  for (const id of ['tux', 'sash']) {
    await dress({ coat: id });
    await setYaw(0);
    const v = await page.evaluate(() => window.__wear.bellyCovered());
    check(v != null && v < 0.7, `«${id}» не затягивает живот целиком: закрыто ${v}`);
  }

  // ---------- 4а. ВЕЩЬ РАСТЁТ ВМЕСТЕ С ЧАСТЬЮ ----------
  // Накормленный червь вылезал из фрака голым животом: раздутие живота — это
  // новые rx/ry у ЭЛЛИПСА части, а не трансформ её группы, и слой одежды
  // (он лежит выше колец и кишки, то есть вне группы) об этом не узнавал.
  //
  // Мерятся две разные вещи, и обе нужны:
  //   ДОЛЯ — какую часть поперечника части занимает ткань. Она обязана
  //   остаться ТОЙ ЖЕ: вещь скроена по телу, а не по числу;
  //   ШИРИНА на экране — обязана вырасти во столько же раз, во сколько
  //   выросла сама часть. Без неё проверка доли зелена и у одежды, которая
  //   вообще не меняется (доля считается от ткани, а ткань постоянна).
  //
  // Третьим пунктом — шов: половины одной вещи обязаны остаться на одной
  // оси. Раздутый живот уезжает вбок, и пока сдвиг доставался только верхней
  // половине, фрак рвался пополам и половины расходились в стороны.
  console.log('\n--- одежда растёт вместе с частью ---');
  await dress({ coat: 'tux' });
  await setYaw(0);
  // ---------- РАЗДУТИЕ НАДО ДЕРЖАТЬ, А НЕ ПОСТАВИТЬ ----------
  // Самочувствие (WormCondition) переписывает bellyScale своим числом — так и
  // задумано: худоба от голода идёт тем же каналом, что раздутие от еды, и
  // кухня поэтому давит на него КАЖДЫЙ кадр. Прогон, который выставил его
  // один раз, мерил не раздутый живот, а обычный — и показывал красивые
  // числа ни о чём.
  const setBelly = (v) => page.evaluate(async b => {
    for (let i = 0; i < 30; i++) {
      MainWormHandle.setLivePose({ bellyScale: b });
      await new Promise(r => requestAnimationFrame(r));
    }
  }, v);

  const grow = {};
  for (const bs of [1, 1.9]) {
    await setBelly(bs);
    grow[bs] = await page.evaluate(b => (MainWormHandle.setLivePose({ bellyScale: b }), {
      span: window.__wear.clothSpan('coat', false, 'lower'),
      cloth: window.__wear.clothWidth('coat', 'lower'),
      part: window.__wear.partWidth('coat', 'lower'),
      gapFace: (() => {
        const a = window.__wear.faceCentre('coat', 'upper');
        const b = window.__wear.faceCentre('coat', 'lower');
        return (a == null || b == null) ? null : +Math.abs(a - b).toFixed(2);
      })()
    }), bs);
  }
  await setBelly(1);

  const thin = grow[1], fat = grow[1.9];
  check(thin.span != null && fat.span != null && Math.abs(fat.span - thin.span) < 0.06,
    `доля поперечника под тканью не поехала от раздутия: ${thin.span} → ${fat.span}`);
  const clothK = fat.cloth / thin.cloth, partK = fat.part / thin.part;
  check(partK > 1.3, `живот в проверке действительно раздулся: часть ×${partK.toFixed(2)}`);
  check(Math.abs(clothK - partK) / partK < 0.12,
    `ткань выросла во столько же раз, во сколько часть: ×${clothK.toFixed(2)} против ×${partK.toFixed(2)}`);
  check(fat.gapFace != null && fat.gapFace < 6,
    `половины фрака не разъехались на раздутом животе: лица врозь на ${fat.gapFace}`);

  // ---------- ПУЗО ЗАСЛОНЯЕТ СОСЕДА ВМЕСТЕ С ЕГО ОДЕЖДОЙ ----------
  // Тело это делало и раньше — порядок частей верный. А одежда нет: слой у
  // неё ОДИН на всё тело (иначе сквозь неё просвечивают кольца и кишка), и
  // пиджак соседнего сегмента, сам-то скрытый за животом, оставался лежать
  // поверх живота отдельной нашлёпкой.
  //
  // Проверка спрашивает у браузера, ЧТО ВИДНО в точке: вырез не меняет
  // дерева, и проверка по узлам была бы зелена в обоих случаях.
  // Перебираются НЕСКОЛЬКО размеров: дефект сильнее всего на СРЕДНЕМ
  // раздутии. К двум живот уезжает вперёд настолько, что сосед выходит из-под
  // него сам, и одного замера «на самом толстом» хватило бы, чтобы проверка
  // была зелена при живой ошибке (на 1.3 её двадцать четыре точки из ста).
  const frontWorst = { over: 0, at: null, inside: 0 };
  for (const bs of [1.25, 1.5, 1.8]) {
    await setBelly(bs);
    const f = await page.evaluate(b => (MainWormHandle.setLivePose({ bellyScale: b }),
                                        window.__wear.overFront('lower')), bs);
    if (!f) continue;
    frontWorst.inside = Math.max(frontWorst.inside, f.inside);
    if (f.over >= frontWorst.over) { frontWorst.over = f.over; frontWorst.at = bs; }
  }
  await setBelly(1);
  check(frontWorst.inside > 200,
    `раздутый живот нашёлся и по нему есть что мерить: точек ${frontWorst.inside}`);
  check(frontWorst.over === 0,
    `на раздутом животе не лежит одежда чужой части: худшее ${frontWorst.over} точек (живот ×${frontWorst.at})`);

  // ---------- 5. НАРЯД ЖИВЁТ ВМЕСТЕ С ТЕЛОМ ----------
  // Жалоб было две, и они про РАЗНОЕ.
  //
  // «Бантик на хвосте всегда горизонтальный относительно экрана» — хвост
  // по-настоящему гнётся на экране, и надетое на него обязано гнуться с ним.
  //
  // «Фрак не должен крутиться вокруг своей оси» — а вот тело НЕ крутится:
  // для игрока червь стоит вертикально и поворачивается целиком. Фрак должен
  // уезжать вбок и сужаться, как очки на лице, и при этом НЕ вращаться.
  //
  // Поэтому у тела и у хвоста проверки разные, и это не поблажка, а два
  // разных движения.
  console.log('\n--- наряд живёт вместе с телом ---');
  await dress({ neck: 'chain', coat: 'tux', tailTip: 'tail-bow' });
  const live = await page.evaluate(async () => {
    const turn = {}, swing = {}, squash = {}, hang = {};
    const span = (o) => { const r = {}; Object.keys(o).forEach(k => r[k] = +(o[k].max - o[k].min).toFixed(1)); return r; };
    const note = () => {
      window.__wear.qa('[data-cosmetic]').forEach(g => {
        const m = g.getScreenCTM(); if (!m) return;
        const k = g.getAttribute('data-cosmetic');
        const deg = Math.atan2(m.b, m.a) * 180 / Math.PI;
        if (!turn[k]) { turn[k] = { prev: deg, acc: 0, min: 0, max: 0 }; }
        else {
          let d = deg - turn[k].prev;
          while (d > 180) d -= 360;
          while (d < -180) d += 360;
          turn[k].prev = deg; turn[k].acc += d;
          turn[k].min = Math.min(turn[k].min, turn[k].acc);
          turn[k].max = Math.max(turn[k].max, turn[k].acc);
        }
        // ---------- СУЖАЕТСЯ ЛИЦО, А НЕ ВСЯ ВЕЩЬ ----------
        // Мерить надо узел [data-face] — то, что нарисовано на груди.
        // Обшивка при развороте НЕ сужается нарочно: она обнимает часть
        // кругом и обязана доставать до обоих краёв силуэта. Пока проверка
        // смотрела на всю вещь, она требовала ровно того дефекта, из-за
        // которого одежда скукоживалась к центру.
        const fg = g.querySelector('[data-face]') || g;
        const sm = /scale\(([-0-9.]+)/.exec(fg.getAttribute('transform') || '');
        const sx = sm ? parseFloat(sm[1]) : 1;
        squash[k] = squash[k] || { min: sx, max: sx };
        squash[k].min = Math.min(squash[k].min, sx); squash[k].max = Math.max(squash[k].max, sx);
      });
      window.__wear.qa('[data-swing]').forEach(el => {
        const host = el.closest('[data-cosmetic]');
        const k = host ? host.getAttribute('data-cosmetic') : '?';
        const m = /rotate\(([-0-9.]+)/.exec(el.getAttribute('transform') || '');
        const v = m ? parseFloat(m[1]) : 0;
        swing[k] = swing[k] || { min: v, max: v };
        swing[k].min = Math.min(swing[k].min, v); swing[k].max = Math.max(swing[k].max, v);
        // А ВИСИТ ли оно вниз по экрану: берём накопленный поворот самой
        // подвески вместе со всеми предками.
        const ctm = el.getScreenCTM();
        if (ctm) {
          const deg = Math.atan2(ctm.b, ctm.a) * 180 / Math.PI;
          hang[k] = hang[k] || { min: deg, max: deg };
          hang[k].min = Math.min(hang[k].min, deg); hang[k].max = Math.max(hang[k].max, deg);
        }
      });
    };
    if (MainWormHandle.walkTo) MainWormHandle.walkTo(320, 700);
    for (let i = 0; i < 420; i++) { await new Promise(r => requestAnimationFrame(r)); note(); }
    if (MainWormHandle.walkTo) MainWormHandle.walkTo(70, 700);
    for (let i = 0; i < 420; i++) { await new Promise(r => requestAnimationFrame(r)); note(); }
    // ---------- РАКУРС ЗАДАЁТСЯ, А НЕ ВЫХАЖИВАЕТСЯ ----------
    // Сужение — это ответ на РАКУРС ТЕЛА, и мерить его ходьбой было
    // гаданием: разворот в конце прохода то успевал за отведённые кадры, то
    // нет, и проверка краснела через раз на ровном месте. Ход остаётся для
    // качания (оно и правда от скорости), а ракурс задаётся прямо.
    for (const k of [-1, 0, 1, 0]) {
      MainWormHandle.setLivePose({ bodyYaw: k });
      for (let i = 0; i < 12; i++) { await new Promise(r => requestAnimationFrame(r)); note(); }
    }
    MainWormHandle.setLivePose({ bodyYaw: null });
    const worstHang = {};
    Object.keys(hang).forEach(k => worstHang[k] = +Math.max(Math.abs(hang[k].min), Math.abs(hang[k].max)).toFixed(1));
    return { turn: span(turn), swing: span(swing), squash: span(squash), hang: worstHang };
  });
  ['neck', 'coat'].forEach(slot => {
    check((live.turn[slot] || 0) < 8,
      `«${slot}» НЕ крутится вокруг своей оси: ${live.turn[slot]}°`);
    check((live.squash[slot] || 0) > 0.12,
      `«${slot}» отзывается на поворот тела сужением: размах ${live.squash[slot]}`);
  });
  check((live.turn.tailTip || 0) > 20,
    `«tailTip» гнётся вместе с хвостом: ${live.turn.tailTip}°`);
  ['neck', 'coat', 'tailTip'].forEach(slot => {
    check((live.swing[slot] || 0) > 2,
      `у «${slot}» есть подвижная деталь и её качает ход: ${live.swing[slot]}°`);
    check((live.hang[slot] || 99) < 34,
      `висящее у «${slot}» висит ВНИЗ ПО ЭКРАНУ, а не по своей части: худший наклон ${live.hang[slot]}°`);
  });

  // ---------- 6. НАКЛОН ТЕЛЕФОНА ----------
  // Висящее слушается не только ходьбы, но и того, как завален сам телефон.
  // Датчика в прогоне нет — подаём событие руками: проверяется не железо, а
  // то, что число с датчика доезжает до ткани и разводит её в РАЗНЫЕ стороны.
  // И что без датчика всё работает как раньше: это штатный режим.
  console.log('\n--- наклон телефона отклоняет висящее ---');
  await dress({ coat: 'tux' });
  const tilt = await page.evaluate(async () => {
    const quiet = { alive: Tilt.info().live, x: Tilt.x() };
    const fire = (g) => window.dispatchEvent(Object.assign(new Event('deviceorientation'),
                                                           { gamma: g, beta: 0, alpha: 0 }));
    // ---------- МЕРИМ КОНЕЦ, А НЕ УГОЛ ----------
    // Угол сам по себе не говорит НИЧЕГО про сторону: у svg ось Y вниз, и
    // положительный поворот уводит висящий конец ВЛЕВО. Поэтому берём
    // экранное место самого свободного конца — низ фигуры. Проверка на
    // размах («лишь бы менялось») пропускала перевёрнутый знак, и наклон
    // работал ровно наоборот.
    const tipX = () => {
      const el = window.__wear.q('[data-cosmetic="coat"] [data-swing]');
      if (!el) return null;
      const bb = el.getBBox();
      const svg = document.querySelector('#game-container svg');
      const m = el.getScreenCTM(); if (!m) return null;
      const pt = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(m); };
      // Считаем сдвиг конца ОТНОСИТЕЛЬНО точки крепления: червь всё это время
      // ходит по комнате, и экранный x сам по себе меряет его шаги, а не
      // наклон (на этом уже обжигались — docs/traps.md, п. 103).
      return pt(bb.x + bb.width / 2, bb.y + bb.height).x - pt(0, 0).x;
    };
    const settle = async () => {
      for (let i = 0; i < 170; i++) { Tilt.x(); await new Promise(r => requestAnimationFrame(r)); }
    };
    // Единицу датчика игра определяет по данным: сперва даём увидеть размах.
    fire(-30); await settle();
    const left = tipX();
    fire(30); await settle();
    const right = tipX();
    return { quiet, info: Tilt.info(), left: left && +left.toFixed(1), right: right && +right.toFixed(1) };
  });
  check(tilt.quiet.alive === false && tilt.quiet.x === 0,
    'без датчика наклон равен нулю и ничего не ломает');
  check(tilt.left != null && tilt.right != null && tilt.right - tilt.left > 6,
    `завал телефона ВПРАВО уводит свободный конец ВПРАВО: ${tilt.left} → ${tilt.right} по экрану`);

  // ---------- СНИМКИ ----------
  for (const [name, set] of [
    ['wear', { head: 'top-hat', neck: 'bow-tie', body: 'tux', tail: 'tail-sock' }],
    ['glam', { head: 'shades', neck: 'chain', body: 'sash', tail: 'tail-bow' }]
  ]) {
    await dress(set);
    for (const yaw of [-1, 0, 1]) {
      await setYaw(yaw);
      const box = await page.evaluate(() => {
        const h = document.querySelector('[data-part="head"]').getBoundingClientRect();
        const t = document.querySelector('[data-part="tail"]').getBoundingClientRect();
        const x0 = Math.max(0, Math.min(h.x, t.x) - 25), y0 = Math.max(0, Math.min(h.y, t.y) - 30);
        return { x: x0, y: y0, width: Math.max(h.right, t.right) - x0 + 25,
                 height: Math.max(h.bottom, t.bottom) - y0 + 25 };
      });
      await page.screenshot({ path: `${out}${name}${yaw}.png`, clip: box });
    }
  }

  console.log('\n' + (errors.length ? errors.join('\n') : 'ошибок страницы нет'));
  console.log('\n' + (fail.length ? 'ПРОВАЛЕНО: ' + fail.length : 'ВСЁ ЗЕЛЁНОЕ'));
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})();
