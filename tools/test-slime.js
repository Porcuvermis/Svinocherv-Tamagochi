// ============ ПРОГОН СЛЕДА СЛИЗИ ============
//
// След — самая дорогая вещь на полу: он растёт, пока червь ходит, и лежит,
// пока не высохнет. Проверяется то, из-за чего он ронял кадры на телефоне
// (правка 160):
//
//   * наложение (multiply/screen) — РОВНО ДВЕ группы на весь экран, сколько
//     бы отрезков ни лежало. Пока их было по две на отрезок, за каждый кусок
//     следа платили отдельно, а перекрёстки темнели вдвое;
//   * путь одного отрезка КОРОТКИЙ и достраивается, а не пересобирается:
//     объём записей за проход по комнате не должен расти как длина следа;
//   * число отрезков ограничено — беготня не копит их без предела;
//   * высохший след исчезает целиком.
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-slime.js
const { chromium } = require('playwright');
const harness = require('./harness');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(harness.viewport());
  await harness.prepare(page);
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto('http://127.0.0.1:8777/index.html');
  await page.waitForTimeout(1500);
  const fail = [];
  const ok = (cond, what, extra) => {
    console.log(`  ${cond ? 'ok  ' : 'ПЛОХО'} ${what}${extra ? '   ' + extra : ''}`);
    if (!cond) fail.push(what);
  };

  // Гоняем червя по комнате туда-сюда и считаем, сколько символов пути
  // уходит в дерево за кадр.
  const run = await page.evaluate(() => new Promise(res => {
    let chars = 0, frames = 0;
    const E = Element.prototype, sa = E.setAttribute;
    E.setAttribute = function (a, v) {
      if (a === 'd' && this.closest && this.closest('.worm-slime-layer')) chars += String(v).length;
      return sa.call(this, a, v);
    };
    let i = 0;
    const walk = setInterval(() => { MainWormHandle.walkTo((i % 2) ? 90 : 310, 660 + (i % 3) * 40); i++; }, 1500);
    const t0 = performance.now();
    const step = () => {
      frames++;
      if (performance.now() - t0 < 9000) return requestAnimationFrame(step);
      clearInterval(walk);
      E.setAttribute = sa;
      const layer = document.querySelector('.worm-slime-layer');
      const paths = Array.from(layer.querySelectorAll('path'));
      res({
        charsPerFrame: Math.round(chars / frames),
        blends: Array.from(layer.querySelectorAll('*'))
          .filter(x => (x.getAttribute('style') || '').includes('mix-blend-mode')).length,
        segments: layer.querySelectorAll('.worm-slime-wet').length,
        longestPath: paths.reduce((m, p) => Math.max(m, (p.getAttribute('d') || '').length), 0),
        nodes: layer.querySelectorAll('*').length
      });
    };
    requestAnimationFrame(step);
  }));

  ok(run.blends === 2, 'групп с наложением ровно две на весь след', String(run.blends));
  ok(run.segments > 1, 'длинный след разрезан на отрезки', run.segments + ' шт.');
  ok(run.longestPath < 900, 'самый длинный путь отрезка короткий', run.longestPath + ' символов');
  ok(run.charsPerFrame < 700, 'за кадр в дерево уходит немного пути',
     run.charsPerFrame + ' символов на кадр');
  ok(run.segments <= 16, 'отрезков не больше предела', String(run.segments));

  // ---------- СЛЕД НЕПРЕРЫВЕН НА СТЫКАХ ----------
  // Отрезки нарезаны ради дешёвой перерисовки, но для игрока это одна
  // дорожка: каждый следующий обязан начинаться ровно там, где кончился
  // предыдущий. Пока новый начинался «где придётся» (то есть там, куда червь
  // уехал к следующему кадру), на каждом стыке зиял разрыв в один кадр хода —
  // и на слабом устройстве, где кадр длинный, подсыхающий след рассыпался на
  // куски. Прогон идёт с ЗАМЕДЛЕНИЕМ процессора: на быстрой машине разрыв
  // меньше единицы и незаметен.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  const joints = await page.evaluate(() => new Promise(res => {
    MainWormHandle.setPosition(70, 660);
    MainWormHandle.walkTo(330, 800);
    setTimeout(() => {
      const segs = Array.from(document.querySelectorAll('.worm-slime-layer .worm-slime-wet'));
      const pts = segs.map(g => {
        const d = g.querySelector('path').getAttribute('d') || '';
        const n = d.match(/-?[\d.]+/g).map(Number);
        return { start: [n[0], n[1]], end: [n[n.length - 2], n[n.length - 1]] };
      });
      const gaps = [];
      for (let i = 1; i < pts.length; i++) {
        gaps.push(+Math.hypot(pts[i].start[0] - pts[i - 1].end[0],
                              pts[i].start[1] - pts[i - 1].end[1]).toFixed(1));
      }
      res({ segs: pts.length, gaps });
    }, 1700);
  }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  ok(joints.segs > 1, 'за проход набралось несколько отрезков', String(joints.segs));
  ok(joints.gaps.every(g => g <= 1.5), 'на стыках отрезков нет разрывов',
     joints.gaps.join(', ') || '—');

  // ---------- НИ ОДНОГО ПОЛУПРОЗРАЧНОГО КУСКА ----------
  // Главное правило плёнки: прозрачность есть только у ОБЩЕЙ группы, а
  // каждый кусок внутри непрозрачен. Иначе подсыхающие куски снова начнут
  // просвечивать друг сквозь друга, и на пересечениях следа проступят
  // отдельные слои — ровно то, ради чего всё и переделывалось.
  const seeThrough = await page.evaluate(() => new Promise(res => {
    // Ловим момент высыхания: ходим, встаём и смотрим на середине жизни.
    MainWormHandle.walkTo(300, 700);
    setTimeout(() => {
      MainWormHandle.walkTo(150, 760);
      setTimeout(() => {
        MainWormHandle.setOptions({ wander: false });
        setTimeout(() => {
          const bad = [];
          document.querySelectorAll('.worm-slime-layer *').forEach(n => {
            const cls = n.getAttribute('class') || '';
            if (cls === 'worm-slime-wet-all') return;      // общая плёнка — ей и положено
            const o = n.getAttribute('opacity');
            if (o != null && parseFloat(o) < 0.999) bad.push(cls || n.tagName);
          });
          res(bad);
        }, 900);
      }, 1000);
    }, 1200);
  }));
  ok(seeThrough.length === 0, 'при высыхании ни один кусок не полупрозрачен',
     seeThrough.slice(0, 4).join(',') || 'ни одного');

  // ---------- ОДИН ПРЕДМЕТ, А НЕ РОССЫПЬ ----------
  // Слизь на полу — одно тело. Значит ни один её кусок не имеет права лежать
  // отдельно: ни капля рядом с кромкой, ни сгусток, переживший плёнку под
  // собой. Раньше отрывались оба — «дальние» капли ставились в полторы
  // полуширины от оси (то есть заведомо мимо следа), а украшения снимались
  // по собственному возрасту, а не по краю высыхания. И то и другое игрок
  // читает одинаково: след распался.
  //
  // Проверяется в САМОМ ХОДЕ высыхания, когда край уже съел часть следа.
  const loose = await page.evaluate(() => new Promise(res => {
    MainWormHandle.setOptions({ wander: true });
    MainWormHandle.setPosition(70, 690);
    MainWormHandle.walkTo(330, 790);
    setTimeout(() => {
      const film = [];      // точки видимой плёнки
      let half = 0;
      document.querySelectorAll('.worm-slime-wet').forEach(g => {
        const paths = g.querySelectorAll('path');
        if (!paths.length) return;
        // Полуширина берётся по САМОМУ ШИРОКОМУ слою: это и есть внешняя
        // кромка плёнки, дальше неё слизи нет.
        paths.forEach(p => half = Math.max(half, parseFloat(p.getAttribute('stroke-width')) / 2));
        const body = paths[paths.length - 1];
        const total = body.getTotalLength();
        const off = -parseFloat(body.getAttribute('stroke-dashoffset') || '0');
        for (let u = Math.max(0, off); u <= total; u += 2) {
          const q = body.getPointAtLength(u);
          film.push([q.x, q.y]);
        }
      });
      const centre = (el) => {
        const tr = el.getAttribute('transform') || '';
        const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(tr);
        if (m) return [+m[1], +m[2]];
        return [parseFloat(el.getAttribute('cx')), parseFloat(el.getAttribute('cy'))];
      };
      const sel = '.worm-slime-lumps > *, .worm-slime-shine > *, .worm-slime-bubbles > *';
      const bad = [];
      document.querySelectorAll(sel).forEach(el => {
        const [x, y] = centre(el);
        if (!isFinite(x)) return;
        let best = Infinity;
        for (let i = 0; i < film.length; i++) {
          const d = Math.hypot(film[i][0] - x, film[i][1] - y);
          if (d < best) best = d;
        }
        if (best > half + 2) bad.push(Math.round(best));
      });
      res({ film: film.length, half: +half.toFixed(1), bad,
            decor: document.querySelectorAll(sel).length });
    }, 2000);
  }));
  ok(loose.film > 0 && loose.decor > 3, 'на полу есть и плёнка, и украшения',
     `точек ${loose.film}, украшений ${loose.decor}`);
  ok(loose.bad.length === 0, 'ни один кусок слизи не лежит отдельно от плёнки',
     loose.bad.length ? `оторвались ${loose.bad.length} шт., дальше кромки на `
                        + loose.bad.slice(0, 5).join(', ') + ' ед.'
                      : `полуширина ${loose.half}`);

  // ---------- ПАУЗА НЕ РВЁТ СЛЕД ----------
  // Червь останавливается посреди комнаты и идёт дальше. Отрезок при
  // остановке закрывается — и следующий обязан начаться там же, где закрылся
  // предыдущий, а не там, куда за время стойки уехал хвост (при развороте на
  // месте это десятки единиц).
  const pause = await page.evaluate(() => new Promise(res => {
    MainWormHandle.setOptions({ wander: true });
    MainWormHandle.setPosition(90, 700);
    MainWormHandle.walkTo(300, 700);          // идём вправо
    setTimeout(() => {
      MainWormHandle.walkTo(300, 700);        // пришли и стоим: след оборвался
      setTimeout(() => {
        MainWormHandle.walkTo(80, 790);       // пошли ОБРАТНО — хвост перекинулся
        setTimeout(() => {
          const segs = Array.from(document.querySelectorAll('.worm-slime-wet'));
          const pts = segs.map(g => {
            const d = g.querySelector('path').getAttribute('d') || '';
            const n = d.match(/-?[\d.]+/g).map(Number);
            return { start: [n[0], n[1]], end: [n[n.length - 2], n[n.length - 1]] };
          });
          const gaps = [];
          for (let i = 1; i < pts.length; i++)
            gaps.push(+Math.hypot(pts[i].start[0] - pts[i - 1].end[0],
                                  pts[i].start[1] - pts[i - 1].end[1]).toFixed(1));
          res({ segs: pts.length, gaps });
        }, 500);
      }, 700);
    }, 2200);
  }));
  ok(pause.segs > 1, 'после паузы след продолжен новым отрезком', String(pause.segs));
  ok(pause.gaps.every(g => g <= 1.5), 'остановка не оставила дыры в следе',
     pause.gaps.join(', ') || '—');

  // Высыхание: червь стоит, след уходит целиком.
  const gone = await page.evaluate(() => new Promise(res => {
    MainWormHandle.setOptions({ wander: false });
    const t0 = performance.now();
    const tick = () => {
      const n = document.querySelectorAll('.worm-slime-layer .worm-slime-wet').length;
      if (n === 0) return res({ ms: Math.round(performance.now() - t0), left: 0 });
      if (performance.now() - t0 > 14000) return res({ ms: -1, left: n });
      setTimeout(tick, 250);
    };
    tick();
  }));
  ok(gone.left === 0, 'высохший след исчезает весь', gone.ms > 0 ? 'за ' + gone.ms + ' мс' : 'осталось ' + gone.left);
  ok(gone.ms > 0 && gone.ms < 3200, 'жизнь слизи около двух секунд', gone.ms + ' мс');

  console.log(errs.length ? '\n' + errs.join('\n') : '\nошибок страницы нет');
  console.log(fail.length ? '\nСЛОМАНО: ' + fail.join('; ') : '\nвсё сошлось');
  await browser.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
