const { chromium } = require('playwright');
const fs = require('fs');

// ============ ЗАПЕЧЬ ВАННУЮ ИЗ 3Д В SVG ============
//
// Гоняет tools/bake-3d.html в headless-браузере и КЛАДЁТ РЕЗУЛЬТАТ В РЕПОЗИТОРИЙ:
// src/minigames/lust/bath-baked.js. Файл сгенерированный, но обычный — игра
// подключает его тегом script, никакого шага сборки в рантайме нет, и правка
// по-прежнему видна в браузере сразу (CLAUDE.md, §5).
//
// three.js при этом в игру НЕ уезжает: он работает только здесь.
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//     node tools/bake-3d.js
//
// Подробности решения — docs/bake-3d.md.

// ---------- КАМЕРА КОМНАТЫ ----------
// Одна на всю ванную, потому что наезды в игре — это crop и zoom одной
// картинки, а не движение камеры. Смотрит СВЕРХУ под углом: в чашу надо
// заглядывать, иначе воды и червя в ней не видно вовсе.
const VIEW = {
    fov: 20,
    from: { x: 2.0, y: 23.8, z: 35.3 },
    at:   { x: 0, y: 3.4, z: 0.4 },
    origin: { x: 360, y: 700 },
    scale: 330
};

// Порядок — решение художника, а не результат вычисления: между предметами
// он задан этим списком, по глубине сортируется только внутри предмета.
// Ванна распилена по глубине надвое: дальняя половина рисуется ЗА червём,
// ближняя — ПЕРЕД ним. Одним куском её нельзя: либо персонаж стоит перед
// ванной, либо за ней целиком, и оба варианта уже пробовали.
const ORDER = ['wall', 'floor', 'shower', 'faucet', 'shelf', 'soap', 'cloth',
               'tub', 'water'];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const page = await browser.newPage({ viewport: { width: 820, height: 1200 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    await page.goto('http://127.0.0.1:8777/tools/bake-3d.html');
    await page.waitForTimeout(400);

    const out = await page.evaluate(([view, order]) => {
        const v = BAKE.camera(view);
        const B = PALETTE.bathScene, M = BATH_MODELS, L = M.LAYOUT;
        const chrome = [B.chrome[900], B.chrome[700], B.chrome[500],
                        B.chrome[300], B.chrome[100]];
        const tubOpts = L.tub;
        const build = {
            wall:   { root: M.wall(),   ramp: [B.tile.lo, B.tile[500], B.tile.hi] },
            floor:  { root: M.floor(),  ramp: [B.floor.lo, B.floor[500], B.floor.hi] },
            shower: { root: M.shower(), ramp: chrome },
            faucet: { root: M.faucet(), ramp: chrome },
            shelf:  { root: M.shelf(),  ramp: [B.shelf.lo, B.shelf.edge, B.shelf.top] },
            soap:   { root: M.soap(),   ramp: B.soap },
            cloth:  { root: M.cloth(),  ramp: B.cloth },
            // splitZ — глубина, на которой стоит червь: всё, что ближе к
            // камере, обязано рисоваться поверх него.
            tub:    { root: M.tub(tubOpts), ramp: B.enamel,
                      // Нутро чаши — своя, тёмная рампа.
                      ramps: { inner: B.basin },
                      splitZ: M.anchorPoints().worm.z },
            water:  { root: M.water(Object.assign({}, tubOpts, { level: L.water })),
                      ramp: [B.water.deep, B.water.surf, B.water.surfHi] }
        };

        // Каждый предмет запекается ОТДЕЛЬНО (свой габарит, своя разметка),
        // но одной и той же камерой: игра включает и гасит их по ходу забега,
        // и общей простынёй это было бы невозможно.
        // Обводка силуэта: тонкая чернильная линия по краю предмета. Она и
        // прячет угловатость низкополигональной модели, и собирает предмет в
        // одну фигуру — без неё запечённое читается набором граней.
        const inked = (name, parts) => {
            const loops = (BAKE.lastOutlines[name] || [])
                .filter(l => l.length > 2)
                .map(l => BAKE.smooth(l))
                .filter(Boolean);
            return { d: parts, box: BAKE.box(parts), ink: loops.join('') };
        };

        const items = {};
        for (const name of order) {
            const spec = build[name];
            const parts = BAKE.bake([Object.assign({ name }, spec)], v);
            if (spec.splitZ == null) {
                items[name] = inked(name, parts);
            } else {
                for (const half of [name + 'Far', name + 'Near']) {
                    items[half] = inked(half, parts.filter(p => p.name === half));
                }
            }
        }
        return { items, ink: PALETTE.ink,
                 anchors: BAKE.anchors(M.anchorPoints(), v),
                 tiles: BAKE.segments(M.tileLines(), v),
                 grout: B.tile.grout };
    }, [VIEW, ORDER]);

    if (errors.length) {
        console.log('ОШИБКИ:\n  ' + errors.join('\n  '));
        await browser.close();
        process.exit(1);
    }

    // ---------- ЗАПИСЬ ----------
    const esc = (s) => String(s).replace(/`/g, '\\`');
    const lines = [];
    lines.push('// ============ ВАННАЯ: ЗАПЕЧЁННАЯ ГРАФИКА ============');
    lines.push('// ФАЙЛ СГЕНЕРИРОВАН. Правится не он, а модели:');
    lines.push('//     tools/models/bath-models.js — геометрия,');
    lines.push('//     tools/bake-3d-core.js       — проекция и раскраска,');
    lines.push('//     tools/bake-3d.js            — камера, порядок, запись.');
    lines.push('// Перезапечь: node tools/bake-3d.js (нужен python3 -m http.server 8777).');
    lines.push('//');
    lines.push('// Почему предметы приходят отсюда, а не рисуются рукой:');
    lines.push('// восемь ручных подгонок не дали прочитать ванну ванной. Проекция');
    lines.push('// камерой даёт перспективу правильной ПО ПОСТРОЕНИЮ — см. docs/bake-3d.md.');
    lines.push('//');
    lines.push('// three.js в игру НЕ уезжает: он работает только при запекании.');
    lines.push('');
    lines.push('const BATH_BAKED = {');
    lines.push('    // Точки сцены, посчитанные проекцией тех же мировых координат,');
    lines.push('    // по которым построены предметы. Гнёзда игры берутся отсюда и');
    lines.push('    // потому не могут разъехаться с картинкой.');
    lines.push('    anchors: ' + JSON.stringify(out.anchors, null, 8)
        .replace(/\n/g, '\n    ') + ',');
    lines.push('');
    lines.push('    // Швы кафеля: отрезки, спроецированные той же камерой. Рисуются');
    lines.push('    // ПОВЕРХ стены и ПОД всем остальным — это часть стены, а не');
    lines.push('    // самостоятельный предмет.');
    lines.push('    grout: ' + JSON.stringify(out.grout) + ',');
    lines.push('    // Цвет обводки силуэта — общие чернила игры.');
    lines.push('    ink: ' + JSON.stringify(out.ink) + ',');
    lines.push('    tiles: ' + JSON.stringify(out.tiles) + ',');
    lines.push('');
    lines.push('    items: {');
    const names = Object.keys(out.items);
    names.forEach((name, i) => {
        const it = out.items[name];
        lines.push(`        ${name}: {`);
        lines.push(`            box: ${JSON.stringify(it.box)},`);
        lines.push(`            ink: '${esc(it.ink || '')}',`);
        lines.push('            d: [');
        it.d.forEach((p, j) => {
            lines.push(`                ['${esc(p.color)}', '${esc(p.d)}']`
                + (j === it.d.length - 1 ? '' : ','));
        });
        lines.push('            ]');
        lines.push('        }' + (i === names.length - 1 ? '' : ','));
    });
    lines.push('    },');
    lines.push('');
    lines.push('    // Разметка предмета. Ни одного собственного числа: всё пришло');
    lines.push('    // из модели.');
    lines.push('    draw(name) {');
    lines.push('        const it = BATH_BAKED.items[name];');
    lines.push('        if (!it) return \'\';');
    lines.push('        // Обводка идёт ПЕРВОЙ, под заливками, и потому вдвое');
    lines.push('        // толще: наружу торчит ровно половина. Поверх заливок она');
    lines.push('        // показывала бы и внутренние края — рёбра скрытых');
    lines.push('        // поверхностей самого предмета, — и ванна читалась');
    lines.push('        // прозрачной. Под заливками остаётся только силуэт.');
    lines.push('        const ink = it.ink');
    lines.push('            ? `<path class="bb-ink" fill="none" stroke="${BATH_BAKED.ink}"`');
    lines.push('              + ` stroke-width="5.4" stroke-linejoin="round"`');
    lines.push('              + ` stroke-linecap="round" d="${it.ink}"/>` : \'\';');
    lines.push('        return `<g class="bb bb-${name}">` + ink');
    lines.push('             + it.d.map(p => `<path fill="${p[0]}" d="${p[1]}"/>`).join(\'\')');
    lines.push('             + \'</g>\';');
    lines.push('    },');
    lines.push('');
    lines.push('    drawTiles(width) {');
    lines.push('        const d = BATH_BAKED.tiles.map(t =>');
    lines.push('            `M${t[0]} ${t[1]}L${t[2]} ${t[3]}`).join(\'\');');
    lines.push('        return `<path class="bb bb-tiles" fill="none" stroke="${BATH_BAKED.grout}"`');
    lines.push('             + ` stroke-width="${width || 1.6}" opacity="0.45" d="${d}"/>`;');
    lines.push('    },');
    lines.push('');
    lines.push('    box(name) {');
    lines.push('        return (BATH_BAKED.items[name] || {}).box || null;');
    lines.push('    }');
    lines.push('};');
    lines.push('');

    const dest = 'src/minigames/lust/bath-baked.js';
    fs.writeFileSync(dest, lines.join('\n'), 'utf8');

    const kb = (fs.statSync(dest).size / 1024).toFixed(0);
    let paths = 0;
    for (const n of names) paths += out.items[n].d.length;
    console.log(`запечено ${names.length} предметов, ${paths} путей,`
        + ` ${out.tiles.length} швов кафеля, ${kb} КБ`);
    for (const n of names) {
        const b = out.items[n].box;
        console.log(`  ${n.padEnd(8)} ${String(out.items[n].d.length).padStart(4)} путей`
            + `   габарит ${b.x},${b.y} ${b.w}×${b.h}`);
    }
    console.log('\nякоря:');
    for (const k of Object.keys(out.anchors))
        console.log(`  ${k.padEnd(11)} (${out.anchors[k].x}, ${out.anchors[k].y})`);
    await browser.close();
})();
