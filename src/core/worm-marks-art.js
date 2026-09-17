// ================= ОТМЕТИНЫ НА КОЖЕ И КАКАШКИ =================
// Шестой файл стопки рендерера (карта — в worm-basis.js).
//
// Здесь только КАРТИНКА отметины. Где она лежит и влезает ли — считает
// worm-marks.js, и спрашивать надо его: три вида отличаются силуэтом, а не
// размером (docs/traps.md, п. 107).

// ---------- ШРАМЫ ----------
// Процедурно генерируемая метка на конкретном сегменте. Размер намеренно
// ограничен долей от радиуса сегмента-хозяина, чтобы не вылезать за его
// пределы.
// ---------- ОТМЕТИНА НА ТЕЛЕ ----------
// Форма выводится из сида (WormMarks.geometry), цвет — сдвиг от тона кожи
// хозяина (WormMarks.color). Ни то, ни другое не хранится: отметина в данных
// это несколько чисел, а не список точек и не hex.
//
// Раньше здесь была ровная горизонтальная эллипса цвета scar.color. Ровный
// эллипс читается как наклейка: у шрама неровный край и он изогнут, потому
// что кожа при заживлении стягивается. Отсюда рваный контур и дуга.
// ---------- ТРИ ВИДА ОТМЕТИН ----------
// Отличаются СИЛУЭТОМ, а не размером: на теле отметина размером с ноготь, и
// пять «шрамов» разной длины читаются одним и тем же шрамом. Поэтому у
// каждого вида своя фигура — полоса, клякса и линия со стежками, — и узнать
// их можно с одного взгляда, не приглядываясь.
//
// Общее у всех трёх: габарит берётся у WormMarks.extent, а не считается тут
// заново (docs/traps.md, п. 103), и базовая прозрачность каждого элемента
// запоминается на нём — у края силуэта отметина гаснет умножением, а не
// прозрачностью группы (traps, п. 73).
function markPaint(el, opacity) {
    setAttr(el, 'opacity', opacity);
    el.__baseOpacity = opacity;
    return el;
}

// ПОРЕЗ: вытянутая рваная фигура со светлой жилкой вдоль.
function buildCutShape(group, geo, ext, color, shineColor, rng) {
    const half = ext.half, wide = ext.wide;
    const bend = (geo.curve || 0) * half * 0.5;
    const axisAt = (u) => ({ x: u * half, y: bend * (1 - u * u) });

    // Обходим фигуру по одной стороне и возвращаемся по другой, дёргая
    // ширину на каждом шаге: получается неровный край.
    const steps = 5 + geo.notches * 2;
    const side = (dir) => {
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const u = dir > 0 ? (-1 + (2 * i) / steps) : (1 - (2 * i) / steps);
            const p = axisAt(u);
            // К концам шрам сходит на нет, в середине шире всего.
            const taper = Math.pow(1 - u * u, 0.6);
            const jitter = 1 - geo.ragged * rng() * 0.55;
            pts.push(`${p.x.toFixed(2)},${(p.y + wide * taper * jitter * dir).toFixed(2)}`);
        }
        return pts;
    };
    group.appendChild(markPaint(svgEl('path', {
        d: 'M ' + side(1).join(' L ') + ' L ' + side(-1).join(' L ') + ' Z',
        fill: color
    }), 0.9));

    // Тонкая светлая жилка вдоль шрама: рубцовая ткань блестит сильнее кожи.
    const shine = [];
    for (let i = 0; i <= steps; i++) {
        const p = axisAt(-1 + (2 * i) / steps);
        shine.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    }
    group.appendChild(markPaint(svgEl('polyline', {
        points: shine.join(' '),
        fill: 'none',
        stroke: shineColor,
        'stroke-width': Math.max(0.4, wide * 0.2).toFixed(2),
        'stroke-linecap': 'round'
    }), 0.32));
}

// ОЖОГ: круглая клякса с языками по краю и обугленной серединой. Оси у него
// нет вовсе — этим он и отличается от пореза на первый взгляд.
function burnBlob(r, geo, rng, k) {
    const steps = 22;
    const pts = [];
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        // Языки по краю — синус по углу, плюс небольшая случайная рябь:
        // ровная волна читается цветком, а не ожогом.
        const wob = 1 + (geo.wobble || 0) * k * (Math.sin(a * (geo.lobes || 4) + (geo.phase || 0)) * 0.75
                                               + (rng() * 2 - 1) * 0.25);
        pts.push([Math.cos(a) * r * wob, Math.sin(a) * r * wob]);
    }
    // ---------- КОНТУР СГЛАЖЕН, А НЕ ЛОМАНЫЙ ----------
    // Ломаная по тем же точкам давала колючую звезду: на размер с ноготь
    // каждый излом читается лучом. Идём квадратичными кривыми через СЕРЕДИНЫ
    // отрезков — углы съедаются, форма остаётся.
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const f = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
    let d = 'M ' + f(mid(pts[steps - 1], pts[0]));
    for (let i = 0; i < steps; i++) {
        d += ` Q ${f(pts[i])} ${f(mid(pts[i], pts[(i + 1) % steps]))}`;
    }
    return d + ' Z';
}

function buildBurnShape(group, geo, ext, color, coreColor, rimColor, rng) {
    const r = ext.half / (1 + (geo.wobble || 0));   // ext.half уже с запасом на языки
    // Ожог — ОДНО неровное пятно с тёмной серединой и маленьким бликом.
    // Кольцо большего радиуса под пятном (первая версия) давало не ожог, а
    // значок: два вложенных контура читаются звездой или печатью.
    // Ни кольца, ни блика внутри: и то и другое даёт вложенные контуры, а
    // вложенные контуры на круглом пятне читаются глазом. Проверено дважды —
    // сперва светлым кольцом большего радиуса (вышла звезда-печать), потом
    // светлым пятнышком внутри (вышел зрачок). Ожог — это ОДНА неровная
    // клякса с более тёмным натёком, сдвинутым к краю.
    group.appendChild(markPaint(svgEl('path', {
        d: burnBlob(r, geo, rng, 1), fill: color
    }), 0.8));
    const core = svgEl('path', { d: burnBlob(r * (geo.core || 0.5), geo, rng, 1.35), fill: coreColor });
    setAttr(core, 'transform', `translate(${(r * 0.26).toFixed(2)},${(r * 0.2).toFixed(2)})`);
    group.appendChild(markPaint(core, 0.55));
}

// ШОВ: тонкая затянувшаяся линия и поперечные стежки. Силуэт дают именно
// стежки — линия одна читалась бы царапиной.
function buildStitchShape(group, geo, ext, color, rng) {
    const half = ext.half;
    const bend = (geo.curve || 0) * half * 0.5;
    const axisAt = (u) => ({ x: u * half, y: bend * (1 - u * u) });

    const line = [];
    for (let i = 0; i <= 10; i++) {
        const p = axisAt(-1 + i / 5);
        line.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    }
    const w = Math.max(0.5, ext.wide);
    group.appendChild(markPaint(svgEl('polyline', {
        points: line.join(' '), fill: 'none', stroke: color,
        'stroke-width': w.toFixed(2), 'stroke-linecap': 'round'
    }), 0.8));

    const n = geo.stitches || 4;
    const out = ext.stitchOut || half * 0.25;
    const tilt = (geo.stitchTilt || 18) * Math.PI / 180;
    for (let i = 0; i < n; i++) {
        // Стежки не по всей длине: у концов рана сходится сама.
        const u = -0.72 + (1.44 * i) / Math.max(1, n - 1);
        const p = axisAt(u);
        // Лёгкий разнобой в длине и наклоне — но наклон В ОДНУ СТОРОНУ:
        // чередование через стежок давало зигзаг, который читается молнией,
        // а не швом. Настоящий шов идёт косыми стежками в одну сторону.
        // Длина и наклон гуляют ВНУТРЬ разрешённого габарита, а не вокруг
        // него: out — это максимум, который посчитало размещение.
        const len = out * (0.7 + rng() * 0.3);
        const a = tilt * (0.75 + rng() * 0.5);
        const dx = Math.sin(a) * len, dy = Math.cos(a) * len;
        group.appendChild(markPaint(svgEl('line', {
            x1: (p.x - dx).toFixed(2), y1: (p.y - dy).toFixed(2),
            x2: (p.x + dx).toFixed(2), y2: (p.y + dy).toFixed(2),
            stroke: color, 'stroke-width': Math.max(0.55, w * 0.9).toFixed(2),
            'stroke-linecap': 'round'
        }), 0.85));
    }
}

function buildMarkNode(mark, place, hostRadius, skinColor) {
    const kind = mark.kind || 'scar';
    const geo = WormMarks.geometry(mark.seed, kind);
    const skin = skinColor || FLESH[500];
    const rng = WormMarks.rng(mark.seed || 0, 'draw');
    // Размеры берутся у WormMarks, а не считаются здесь заново: по ним же
    // размещение проверяло, влезает ли отметина в силуэт.
    const ext = WormMarks.extent(geo, hostRadius);

    // ---------- РАКУРС ----------
    // Отметина нарисована НА КОЖЕ, а кожа круглая. Поэтому у края силуэта она
    // сплющивается поперёк (squashY), а уехавшую на изнанку не видно вовсе.
    // Сжатие стоит ДО поворота: сплющивается поверхность, а не сам рисунок.
    //
    // Тело мы видим сбоку — вокруг трубы отметина ездит по вертикали, и
    // ракурс у неё вертикальный. У головы ракурс горизонтальный и живой,
    // его пересчитывает applyHeadYaw при каждом повороте.
    const squashY = place.squashY == null ? 1 : place.squashY;
    const group = svgEl('g', {
        transform: `translate(${(place.x * hostRadius).toFixed(2)},${(place.y * hostRadius).toFixed(2)})`
                 + (squashY < 0.999 ? ` scale(1,${squashY.toFixed(3)})` : '')
                 + ` rotate(${place.rotation.toFixed(1)})`,
        class: `worm-mark worm-mark-${kind}`,
        // Устойчивый ключ: по нему отметину можно найти после пересборки
        // персонажа. Прогон, следивший за шрамом по НОМЕРУ узла, при
        // пересборке начинал сравнивать разные шрамы и объявлял скачок через
        // всю голову.
        'data-mark': mark.id || ''
    });
    if (place.front === false) setAttr(group, 'display', 'none');

    if (kind === 'burn') {
        buildBurnShape(group, geo, ext, WormMarks.color(skin, 'burn'),
            WormMarks.color(skin, 'burnCore'), WormMarks.color(skin, 'shine'), rng);
    } else if (kind === 'stitch') {
        buildStitchShape(group, geo, ext, WormMarks.color(skin, 'stitch'), rng);
    } else {
        buildCutShape(group, geo, ext, WormMarks.color(skin, 'scar'), WormMarks.color(skin, 'shine'), rng);
    }
    return group;
}


// ---------- КУЧКА НА ПОЛУ ----------
// Результат пищеварения. Форма детерминированная от сида: две-три спирали
// друг на друге, каждая следующая мельче. Цвет — из палитры (жёлчная линия
// плюс чернота), а не подобранный на глаз коричневый.
function buildPoopNode(obj, depthScale) {
    const scale = depthScale || 1;
    const rng = mulberry32(hashStringSeed(String(obj.seed || obj.id || 'poop')));
    const base = 7 * scale;
    const group = svgEl('g', {
        class: 'worm-poop',
        transform: `translate(${obj.x.toFixed(1)},${obj.y.toFixed(1)})`
    });

    const body = mixColor(BILE[600], P_.ink, 0.42);
    const light = mixColor(body, GRIME_HIGHLIGHT, 0.35);

    // Тень на полу: без неё кучка висит над полом.
    group.appendChild(svgEl('ellipse', {
        cx: 0, cy: (base * 0.15).toFixed(1),
        rx: (base * 1.5).toFixed(1), ry: (base * 0.5).toFixed(1),
        fill: P_.ink, opacity: 0.3
    }));

    const layers = 3;
    for (let i = 0; i < layers; i++) {
        const k = i / (layers - 1);
        const rx = base * (1.25 - k * 0.55) * (0.9 + rng() * 0.2);
        const ry = base * (0.5 - k * 0.14);
        const cy = -i * base * 0.42;
        const cx = (rng() - 0.5) * base * 0.3;
        group.appendChild(svgEl('ellipse', {
            cx: cx.toFixed(1), cy: cy.toFixed(1), rx: rx.toFixed(1), ry: ry.toFixed(1),
            fill: body, stroke: P_.ink, 'stroke-width': SW.detail
        }));
        group.appendChild(svgEl('ellipse', {
            cx: (cx - rx * 0.25).toFixed(1), cy: (cy - ry * 0.3).toFixed(1),
            rx: (rx * 0.35).toFixed(1), ry: (ry * 0.3).toFixed(1),
            fill: light, opacity: 0.4
        }));
    }
    // Кончик сверху — узнаваемый силуэт кучки.
    group.appendChild(svgEl('path', {
        d: `M ${(-base * 0.22).toFixed(1)},${(-layers * base * 0.42 + base * 0.1).toFixed(1)} ` +
           `Q 0,${(-layers * base * 0.42 - base * 0.5).toFixed(1)} ${(base * 0.22).toFixed(1)},${(-layers * base * 0.42 + base * 0.1).toFixed(1)} Z`,
        fill: body, stroke: P_.ink, 'stroke-width': SW.hairline
    }));
    return group;
}

