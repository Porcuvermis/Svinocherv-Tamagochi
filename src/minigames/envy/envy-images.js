// ================= ПУЛ ЧУЖИХ ОБРАЗОВ (мини-игра «Зависть») =================
// То, чему завидуют: машина, кошка, собака, мешок денег, пачка сигарет.
// Добавить образ значит дописать одну запись в ENVY_IMAGES — размер,
// окантовка, попадание пальцем и место в полотне посчитаются от него сами.
//
// Образ рисуется КОДОМ и полноцветно: заливка, тёмная грань, блик, контур.
// Раньше это были плоские пиктограммы в один тон, а тон давал material.color —
// так одна текстура работала с любым цветом палитры. Для рисунка с объёмом
// этого мало: цветов в нём несколько, и красить их одним множителем нельзя.
// Поэтому текстуры готовятся заранее на каждое сочетание «образ × тон» и
// лежат в пуле — пять образов на пять тонов, один раз за запуск.
//
// Наклейка собирается из трёх слоёв, снизу вверх:
//   1. белый кант — дилатация силуэта, он же поле стикера;
//   2. круг ячейки в цвет тона — им наклейка накрывает своё место в полотне
//      (см. envy-packing.js), без него между наклейками остались бы щели;
//   3. сам рисунок.

const ENVY_LINE = '#6b2f1e';     // контур: тёмный тёплый, не чёрный
const ENVY_GLASS = '#cfe9f2';
const ENVY_CHROME = '#f5e6b8';
const ENVY_GOLD = '#f5c542';
const ENVY_TYRE = '#5b5560';
const ENVY_WHITE = '#ffffff';

// ---------- ГЕОМЕТРИЯ НАКЛЕЙКИ ----------
// Наклейка — это КРУГ, из которого местами торчит рисунок. Круг и отвечает за
// упаковку: он один накрывает ячейку, и полотно смыкается по построению.
//
// Почему круг, а не просто раздутый силуэт: чтобы одинаковые фигуры покрыли
// плоскость без щелей, их суммарная площадь минимум на 21% больше поля, и
// достигается этот минимум только кругами. Версия, раздувавшая силуэт
// равномерно, намеряла 37% наползания вместо обещанных десяти. Круг с
// выступами держится ближе к пределу, а выступы (крыша машины, уши кошки,
// горловина мешка) оставляют наклейке характер формы.
// Подложка занимает лишь треть спрайта, а рисунок — полтора её радиуса: так
// силуэт крупнее подложки в полтора раза и форму наклейки задаёт он, а не она.
// Выше поднимать нельзя — при CORE*BULGE + RIM > 0.5 рисунок упирается в край
// спрайта и обрезается.
const ENVY_CORE = 0.345;   // МИНИМАЛЬНЫЙ радиус подложки: им и накрывается ячейка
const ENVY_BULGE = 1.35;   // насколько рисунку позволено торчать за подложку
const ENVY_RIM = 0.030;    // белый кант, в долях спрайта
const ENVY_WOBBLE = 0.13;  // насколько подложку «ведёт» от круга

// Подложка наклейки — не круг, а слегка неправильная замкнутая кривая: своя
// у каждого образа. Ровный круг у всех подряд читается плашкой, а не вырезанной
// наклейкой, и полотно из одинаковых кружков выглядит машинным.
//
// Радиус гуляет ВОКРУГ БОЛЬШЕГО значения так, чтобы минимум остался равен
// ENVY_CORE: именно минимальный радиус накрывает ячейку, и покрытие полотна от
// неровности не страдает.
function envyBlobPath(S, phase) {
    const p = new Path2D();
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const r = ENVY_CORE * (1 + ENVY_WOBBLE * (1 + Math.sin(a * 3 + phase)) / 2
                                 + ENVY_WOBBLE * 0.4 * Math.sin(a * 5 - phase * 1.7)) * S;
        const x = S / 2 + Math.cos(a) * r;
        const y = S / 2 + Math.sin(a) * r;
        if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
    return p;
}

// ---------- ВСПОМОГАТЕЛЬНОЕ ----------
const envyMix = (hex, target, k) => {
    const n = parseInt(hex.slice(1), 16);
    const t = parseInt(target.slice(1), 16);
    const ch = (sh) => {
        const a = (n >> sh) & 255, b = (t >> sh) & 255;
        return Math.round(a + (b - a) * k);
    };
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};
const lighten = (hex, k) => envyMix(hex, '#ffffff', k);
const darken = (hex, k) => envyMix(hex, '#3a1410', k);

// Заливка с контуром — базовый приём всех образов: сперва цвет, следом тёмная
// линия по тому же пути. Обводка идёт ПОСЛЕ заливки, иначе половина её ширины
// прячется под ней и линия выходит вдвое тоньше.
function ink(ctx, path, fill, width) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(path); }
    if (width) {
        ctx.strokeStyle = ENVY_LINE;
        ctx.lineWidth = width;
        ctx.stroke(path);
    }
}

// Каждый примитив — СВОЙ Path2D. Иначе arc/ellipse дотягивает линию от текущей
// точки к началу дуги, и глаза с носом слипаются в загогулину.
const P = (build) => { const p = new Path2D(); build(p); return p; };
const circle = (x, y, rx, ry, rot) => P(p => p.ellipse(x, y, rx, ry === undefined ? rx : ry, rot || 0, 0, Math.PI * 2));
const poly = (...pts) => P(p => { pts.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); });
const line = (ctx, x1, y1, x2, y2, w) => {
    ctx.strokeStyle = ENVY_LINE;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
};

const ENVY_IMAGES = [
    {
        key: 'car',
        title: 'машина',
        // Векторный образ: SVG лежит в envy-art.js. Рисовать машину кодом
        // оказалось тупиком — шесть заходов дали приличную иконку, но не
        // иллюстрацию. Трассировка картинки даёт исходное качество сразу.
        svg: () => (typeof ENVY_ART !== 'undefined') ? ENVY_ART.car : null,
        tone: '#e8823c',
        // Длинный силуэт вписывается в круг наклейки по дальней точке и
        // потому садится мелким. Наклон кладёт его по диагонали круга, а
        // повышенный bulge разрешает торчать за круг сильнее прочих: у машины
        // выпирают только нос и корма, площади это почти не прибавляет.
        tilt: -0.20,
        phase: 0.0
    },
    {
        key: 'cat',
        phase: 1.1,
        title: 'кошка',
        // Голова анфас. Уши широкие у основания: узкие давали бы тонкие
        // отростки, которые кант раздувает в бесформенные рожки.
        draw(ctx, tone) {
            const ears = P(p => {
                p.moveTo(0.245, 0.470); p.lineTo(0.295, 0.150); p.lineTo(0.522, 0.358); p.closePath();
                p.moveTo(0.755, 0.470); p.lineTo(0.705, 0.150); p.lineTo(0.478, 0.358); p.closePath();
            });
            const head = circle(0.5, 0.560, 0.315, 0.290);

            ink(ctx, ears, tone, 0.026);
            ink(ctx, head, tone, 0.026);
            ctx.fillStyle = '#e59aac';
            ctx.fill(poly([0.318, 0.248], [0.348, 0.398], [0.458, 0.358]));
            ctx.fill(poly([0.682, 0.248], [0.652, 0.398], [0.542, 0.358]));
            ctx.fillStyle = lighten(tone, 0.42);
            ctx.fill(P(p => p.ellipse(0.372, 0.470, 0.115, 0.078, -0.55, 0, Math.PI * 2)));

            ink(ctx, circle(0.5, 0.638, 0.216, 0.172), lighten(tone, 0.55), 0.018);

            [[0.392, 0.520], [0.608, 0.520]].forEach(([x, y]) => {
                ink(ctx, circle(x, y, 0.058, 0.072), ENVY_WHITE, 0.018);
                ctx.fillStyle = ENVY_LINE;
                ctx.fill(circle(x, y + 0.004, 0.027, 0.048));
                ctx.fillStyle = ENVY_WHITE;
                ctx.fill(circle(x + 0.016, y - 0.024, 0.014));
            });

            ink(ctx, poly([0.452, 0.616], [0.548, 0.616], [0.5, 0.676]), '#e06a8b', 0.016);
            ctx.lineCap = 'round';
            line(ctx, 0.152, 0.598, 0.312, 0.588, 0.016);
            line(ctx, 0.152, 0.664, 0.312, 0.640, 0.016);
            line(ctx, 0.848, 0.598, 0.688, 0.588, 0.016);
            line(ctx, 0.848, 0.664, 0.688, 0.640, 0.016);
        }
    },
    {
        key: 'dog',
        phase: 2.3,
        title: 'собака',
        // Висячие уши по бокам добирают силуэт до круга — пёс ложится в
        // полотно плотнее кошки, у которой уши торчат вверх.
        draw(ctx, tone) {
            ink(ctx, circle(0.185, 0.560, 0.130, 0.250, 0.15), darken(tone, 0.30), 0.026);
            ink(ctx, circle(0.815, 0.560, 0.130, 0.250, -0.15), darken(tone, 0.30), 0.026);

            ink(ctx, circle(0.5, 0.468, 0.278, 0.262), tone, 0.026);
            ctx.fillStyle = lighten(tone, 0.40);
            ctx.fill(P(p => p.ellipse(0.398, 0.356, 0.122, 0.076, -0.5, 0, Math.PI * 2)));
            ink(ctx, circle(0.5, 0.678, 0.216, 0.176), lighten(tone, 0.52), 0.022);

            [[0.394, 0.432], [0.606, 0.432]].forEach(([x, y]) => {
                ink(ctx, circle(x, y, 0.052, 0.060), ENVY_WHITE, 0.018);
                ctx.fillStyle = ENVY_LINE;
                ctx.fill(circle(x, y + 0.004, 0.028, 0.036));
                ctx.fillStyle = ENVY_WHITE;
                ctx.fill(circle(x + 0.015, y - 0.018, 0.013));
            });

            ink(ctx, circle(0.5, 0.626, 0.074, 0.054), ENVY_LINE, 0);
            ctx.lineCap = 'round';
            line(ctx, 0.5, 0.658, 0.5, 0.716, 0.018);
            ctx.strokeStyle = ENVY_LINE;
            ctx.lineWidth = 0.018;
            ctx.beginPath();
            ctx.moveTo(0.412, 0.738);
            ctx.quadraticCurveTo(0.5, 0.774, 0.588, 0.738);
            ctx.stroke();
        }
    },
    {
        key: 'money',
        phase: 3.6,
        title: 'мешок денег',
        draw(ctx, tone) {
            const bag = P(p => {
                p.moveTo(0.350, 0.372);
                p.bezierCurveTo(0.088, 0.532, 0.108, 0.868, 0.500, 0.868);
                p.bezierCurveTo(0.892, 0.868, 0.912, 0.532, 0.650, 0.372);
                p.closePath();
            });

            ink(ctx, bag, tone, 0.026);
            // тёмная щека справа и блик слева — мешок должен читаться круглым
            ctx.fillStyle = darken(tone, 0.26);
            ctx.fill(P(p => {
                p.moveTo(0.652, 0.398);
                p.bezierCurveTo(0.882, 0.556, 0.862, 0.856, 0.522, 0.864);
                p.bezierCurveTo(0.762, 0.816, 0.802, 0.556, 0.622, 0.408);
                p.closePath();
            }));
            ctx.fillStyle = lighten(tone, 0.45);
            ctx.fill(P(p => {
                p.moveTo(0.352, 0.408);
                p.bezierCurveTo(0.202, 0.542, 0.192, 0.718, 0.246, 0.798);
                p.bezierCurveTo(0.216, 0.638, 0.282, 0.498, 0.402, 0.412);
                p.closePath();
            }));
            ctx.strokeStyle = ENVY_LINE; ctx.lineWidth = 0.026; ctx.stroke(bag);

            ink(ctx, poly([0.335, 0.172], [0.665, 0.172], [0.648, 0.390], [0.352, 0.390]),
                lighten(tone, 0.28), 0.026);
            ctx.strokeStyle = ENVY_LINE;
            ctx.lineWidth = 0.020;
            ctx.beginPath();
            ctx.moveTo(0.352, 0.296);
            ctx.quadraticCurveTo(0.5, 0.336, 0.648, 0.296);
            ctx.stroke();

            // знак валюты одной лентой, без слипающихся дуг
            ink(ctx, P(p => p.rect(0.478, 0.468, 0.044, 0.332)), ENVY_GOLD, 0.018);
            ink(ctx, P(p => {
                p.moveTo(0.612, 0.575);
                p.lineTo(0.545, 0.575);
                p.quadraticCurveTo(0.545, 0.538, 0.500, 0.538);
                p.quadraticCurveTo(0.455, 0.538, 0.455, 0.578);
                p.quadraticCurveTo(0.455, 0.606, 0.523, 0.621);
                p.quadraticCurveTo(0.622, 0.642, 0.622, 0.716);
                p.quadraticCurveTo(0.622, 0.792, 0.500, 0.792);
                p.quadraticCurveTo(0.381, 0.792, 0.381, 0.704);
                p.lineTo(0.452, 0.704);
                p.quadraticCurveTo(0.452, 0.736, 0.500, 0.736);
                p.quadraticCurveTo(0.549, 0.736, 0.549, 0.702);
                p.quadraticCurveTo(0.549, 0.674, 0.478, 0.658);
                p.quadraticCurveTo(0.381, 0.636, 0.381, 0.568);
                p.quadraticCurveTo(0.381, 0.498, 0.500, 0.498);
                p.quadraticCurveTo(0.612, 0.498, 0.612, 0.575);
                p.closePath();
            }), ENVY_GOLD, 0.018);
        }
    },
    {
        key: 'smokes',
        phase: 4.9,
        title: 'пачка сигарет',
        // Именно пачка, а не сигарета: коробка почти квадратная и потому
        // ложится в полотно без разросшегося канта.
        draw(ctx, tone) {
            [[0.332, 0.168], [0.452, 0.128], [0.572, 0.198]].forEach(([x, y]) => {
                ink(ctx, P(p => p.rect(x, y, 0.096, 0.220)), '#f3ead6', 0.020);
                ctx.fillStyle = '#d8a24a';
                ctx.fill(P(p => p.rect(x, y + 0.132, 0.096, 0.088)));
                ctx.strokeStyle = ENVY_LINE; ctx.lineWidth = 0.020;
                ctx.stroke(P(p => p.rect(x, y, 0.096, 0.220)));
            });

            const box = poly([0.245, 0.368], [0.755, 0.368], [0.755, 0.856], [0.245, 0.856]);
            ink(ctx, box, tone, 0.026);
            ctx.fillStyle = darken(tone, 0.30);
            ctx.fill(P(p => p.rect(0.642, 0.370, 0.111, 0.484)));
            ctx.fillStyle = lighten(tone, 0.38);
            ctx.fill(P(p => p.rect(0.248, 0.370, 0.092, 0.484)));
            ctx.strokeStyle = ENVY_LINE; ctx.lineWidth = 0.026; ctx.stroke(box);

            ink(ctx, poly([0.245, 0.390], [0.755, 0.390], [0.792, 0.278], [0.282, 0.278]),
                lighten(tone, 0.22), 0.026);
            ink(ctx, P(p => p.rect(0.292, 0.556, 0.416, 0.116)), ENVY_CHROME, 0.020);
            ink(ctx, circle(0.5, 0.756, 0.060, 0.042), lighten(tone, 0.50), 0.018);
        }
    }
];

const ENVY_IMAGE_POOL = {
    ready: false,
    images: [],

    // Во сколько раз габарит наклейки больше радиуса её ячейки. Круг накрывает
    // ячейку ровно, а сверх него торчат выступы рисунка и белый кант — на это
    // и закладывается поле по краям полотна.
    span: (ENVY_CORE * (1 + ENVY_WOBBLE * 1.4) * Math.max(ENVY_BULGE,
        ...ENVY_IMAGES.map(d => d.bulge || 0)) + ENVY_RIM) / ENVY_CORE,

    // Шесть тонов, разнесённых по кругу: каждый третий из палитры давал
    // подряд два красноватых, и полотно уходило в один цвет. Больше тонов —
    // больше текстур: шесть на пять образов это тридцать картинок 256×256.
    // Тон подложки для векторного образа: поворачивается синхронно с самим
    // рисунком, иначе оранжевая машина легла бы на зелёный круг.
    hueOf(hex, deg) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = hex || '#e8823c';
        ctx.fillRect(0, 0, 1, 1);
        const px = this.hueShift(canvas, deg).getContext('2d').getImageData(0, 0, 1, 1).data;
        return '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    },

    tones() {
        const p = (typeof PALETTE !== 'undefined' && PALETTE.envyImages) ? PALETTE.envyImages : null;
        if (!p) return ['#e04f4f', '#e8823c', '#b8c63f', '#46b598', '#4a86d8', '#9a5fd0'];
        return [0, 1, 3, 5, 8, 10].map(i => p[i % p.length]);
    },

    // Загрузка SVG в картинку. Через blob, а не data:URI — длинные data:URI
    // Safari режет по длине, а образ весит десятки килобайт.
    loadSvg(markup) {
        return new Promise((resolve, reject) => {
            const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg')); };
            img.src = url;
        });
    },

    // Поворот оттенка по кругу — так один рисунок даёт цветные варианты.
    // Считается по пикселям, а не через ctx.filter: фильтры канвы появились в
    // Safari только к 16.4, а игра должна открываться и на старых телефонах.
    hueShift(canvas, deg) {
        if (!deg) return canvas;
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = data.data;
        const a = deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
        const m = [
            0.213 + c * 0.787 - sn * 0.213, 0.715 - c * 0.715 - sn * 0.715, 0.072 - c * 0.072 + sn * 0.928,
            0.213 - c * 0.213 + sn * 0.143, 0.715 + c * 0.285 + sn * 0.140, 0.072 - c * 0.072 - sn * 0.283,
            0.213 - c * 0.213 - sn * 0.787, 0.715 - c * 0.715 + sn * 0.715, 0.072 + c * 0.928 + sn * 0.072
        ];
        for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] === 0) continue;
            const r = px[i], g = px[i + 1], b = px[i + 2];
            px[i]     = Math.max(0, Math.min(255, m[0] * r + m[1] * g + m[2] * b));
            px[i + 1] = Math.max(0, Math.min(255, m[3] * r + m[4] * g + m[5] * b));
            px[i + 2] = Math.max(0, Math.min(255, m[6] * r + m[7] * g + m[8] * b));
        }
        ctx.putImageData(data, 0, 0);
        return canvas;
    },

    async build(THREE) {
        if (this.ready) return this.images;
        const tones = this.tones();

        // Векторные образы приходят картинками, поэтому подготовка пула
        // асинхронная: сначала грузятся все SVG, потом собираются наклейки.
        const loaded = {};
        for (const def of ENVY_IMAGES) {
            if (!def.svg) continue;
            const markup = def.svg();
            if (markup) loaded[def.key] = await this.loadSvg(markup);
        }
        this.loaded = loaded;

        this.images = ENVY_IMAGES.map(def => {
            const vector = !!loaded[def.key];
            const m = this.measure(this.drawArt(def, def.tone || tones[0]));

            // Нарисованному кодом образу цвет задаётся тоном, векторному —
            // поворотом оттенка: перекрашивать готовую картинку по слоям
            // нечем, а сдвиг по кругу даёт те же шесть вариантов.
            const sheets = vector
                ? tones.map((_, i) => {
                    const hue = (360 / tones.length) * i;
                    return this.compose(def, m, this.hueOf(def.tone, hue), hue);
                })
                : tones.map(tone => this.compose(def, m, tone));

            return {
                key: def.key,
                title: def.title,
                core: ENVY_CORE,
                inRadius: m.inRadius,
                outRadius: m.outRadius,
                variants: sheets.map(canvas => {
                    const texture = new THREE.CanvasTexture(canvas);
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.generateMipmaps = false;
                    return texture;
                }),
                mask: this.maskOf(sheets[0])
            };
        });

        this.ready = true;
        return this.images;
    },

    // Рисунок сам по себе, в своих координатах: по нему считаются обмеры.
    // Образ бывает двух видов — нарисованный кодом и векторный; дальше по
    // цепочке разницы уже нет, всё считается по растру.
    drawArt(def, tone, hue) {
        const S = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');

        const img = this.loaded && this.loaded[def.key];
        if (img) {
            if (def.tilt) {
                ctx.translate(S / 2, S / 2);
                ctx.rotate(def.tilt);
                ctx.translate(-S / 2, -S / 2);
            }
            ctx.drawImage(img, 0, 0, S, S);
            return this.hueShift(canvas, hue || 0);
        }

        ctx.scale(S, S);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        def.draw(ctx, tone);
        return canvas;
    },

    // Готовая наклейка: кант, круг ячейки, рисунок.
    compose(def, m, tone, hue) {
        const S = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');

        const art = this.drawArt(def, tone, hue);
        const k = (ENVY_CORE * (def.bulge || ENVY_BULGE)) / m.outRadius;
        const rimPx = ENVY_RIM * S;

        const placed = (fn) => {
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.scale(k, k);
            ctx.translate(-S / 2 + m.offsetX * S, -S / 2 + m.offsetY * S);
            fn();
            ctx.restore();
        };

        // 1. Кант — силуэт рисунка, размноженный по кругу. Это дилатация: след
        // от многократного штампа со смещением и есть контур, отодвинутый
        // наружу. Обвести путями нельзя — рисунок собран из десятков фигур, и
        // общего контура у него попросту нет.
        const white = document.createElement('canvas');
        white.width = white.height = S;
        const wc = white.getContext('2d');
        wc.drawImage(art, 0, 0);
        wc.globalCompositeOperation = 'source-in';
        wc.fillStyle = ENVY_WHITE;
        wc.fillRect(0, 0, S, S);

        placed(() => {
            for (let i = 0; i < 20; i++) {
                const a = (i / 20) * Math.PI * 2;
                ctx.drawImage(white, Math.cos(a) * rimPx / k, Math.sin(a) * rimPx / k);
            }
        });

        const blob = envyBlobPath(S, def.phase || 0);
        ctx.fillStyle = ENVY_WHITE;
        ctx.strokeStyle = ENVY_WHITE;
        ctx.lineWidth = 2 * rimPx;
        ctx.lineJoin = 'round';
        ctx.stroke(blob);
        ctx.fill(blob);

        // 2. Круг ячейки: подложка стикера, она же гарантия смыкания полотна.
        // Сильно светлее тона — рисунок написан этим же тоном и на равной по
        // светлоте подложке пропадал.
        ctx.fillStyle = lighten(tone, 0.46);
        ctx.fill(blob);
        ctx.strokeStyle = ENVY_LINE;
        ctx.lineWidth = 0.014 * S;
        ctx.stroke(blob);

        // 3. Рисунок поверх.
        placed(() => ctx.drawImage(art, 0, 0));
        return canvas;
    },

    // Альфа-маска для попадания пальцем: ловится реальный силуэт наклейки, а
    // не квадрат спрайта. Мелкой сетки хватает — палец толще.
    maskOf(canvas) {
        const N = 48;
        const small = document.createElement('canvas');
        small.width = small.height = N;
        const ctx = small.getContext('2d');
        ctx.drawImage(canvas, 0, 0, N, N);
        const data = ctx.getImageData(0, 0, N, N).data;
        const bits = new Uint8Array(N * N);
        for (let i = 0; i < N * N; i++) bits[i] = data[i * 4 + 3] > 110 ? 1 : 0;
        return { size: N, bits };
    },

    // Обмер по растру: где у рисунка самый большой вписанный круг, насколько
    // он велик и как далеко торчит самая дальняя точка.
    //
    // Центр вписанного круга — та точка, за которую наклейку надо сажать в
    // ячейку: у мешка денег вся масса внизу, и если считать от середины
    // квадрата, он сядет в ячейку боком.
    measure(artCanvas) {
        const N = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = N;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(artCanvas, 0, 0, N, N);
        const data = ctx.getImageData(0, 0, N, N).data;

        // Расстояние до ближайшего прозрачного пикселя — двухпроходный
        // chamfer. Точнее перебора окружностей и не зависит от того,
        // звёздчатая фигура относительно центра или нет.
        const INF = 1e6, D1 = 1, D2 = Math.SQRT2;
        const dist = new Float32Array(N * N);
        for (let i = 0; i < N * N; i++) dist[i] = data[i * 4 + 3] > 110 ? INF : 0;

        const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? 0 : dist[y * N + x];
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const i = y * N + x;
                if (dist[i] === 0) continue;
                dist[i] = Math.min(dist[i], at(x - 1, y) + D1, at(x, y - 1) + D1,
                    at(x - 1, y - 1) + D2, at(x + 1, y - 1) + D2);
            }
        }
        for (let y = N - 1; y >= 0; y--) {
            for (let x = N - 1; x >= 0; x--) {
                const i = y * N + x;
                if (dist[i] === 0) continue;
                dist[i] = Math.min(dist[i], at(x + 1, y) + D1, at(x, y + 1) + D1,
                    at(x + 1, y + 1) + D2, at(x - 1, y + 1) + D2);
            }
        }

        let best = 0;
        for (let i = 0; i < N * N; i++) if (dist[i] < INF) best = Math.max(best, dist[i]);

        // Центр наклейки — середина ГАБАРИТОВ рисунка. Раньше брался центр
        // вписанного круга: у машины он попадает в кузов, и она садилась в
        // наклейку боком, вырываясь за край носом.
        let x0 = N, y0 = N, x1 = -1, y1 = -1;
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                if (data[(y * N + x) * 4 + 3] <= 110) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        const cx = (x0 + x1 + 1) / 2 / N, cy = (y0 + y1 + 1) / 2 / N;
        let outRadius = 0;
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                if (data[(y * N + x) * 4 + 3] <= 110) continue;
                outRadius = Math.max(outRadius, Math.hypot((x + 0.5) / N - cx, (y + 0.5) / N - cy));
            }
        }

        return {
            inRadius: best / N,
            outRadius: outRadius || 0.5,
            offsetX: 0.5 - cx,      // на столько сдвигается рисунок при сборке
            offsetY: 0.5 - cy
        };
    }
};

if (typeof window !== 'undefined') {
    window.ENVY_IMAGES = ENVY_IMAGES;
    window.ENVY_IMAGE_POOL = ENVY_IMAGE_POOL;
}
