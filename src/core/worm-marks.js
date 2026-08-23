// ================= ОТМЕТИНЫ НА ТЕЛЕ =================
// «Тело как летопись»: каждый грех оставляет на персонаже свой след — гнев
// шрамы, чревоугодие жир, лень мох и наросты, гордыня золотые накостники,
// зависть бледность (docs/plan/02-economy.md, раздел 8.4). Через месяцы игры
// два разных червя должны выглядеть по-разному.
//
// Здесь только ДАННЫЕ и ГЕОМЕТРИЯ: где отметина сидит, какой она формы и
// какого цвета. Рисованием занимается рендерер, начислением — конфиг наград.
// Модуль намеренно без DOM: его можно прогонять в node и проверять правила
// размещения, не поднимая браузер.
//
// ---------- ПОЧЕМУ zone + t, А НЕ ПИКСЕЛИ И НЕ ИМЯ СЕГМЕНТА ----------
// Координаты нормализованные и привязаны к скелету: зона тела плюс позиция
// вдоль неё, 0..1. Так требует и план, и здравый смысл:
//
//   • пиксели поедут при любом изменении масштаба и при взрослении;
//   • имя сегмента ('growing-3') — не лучше: число растущих сегментов
//     меняется вместе с growthStage, и шрам, приколоченный к третьему,
//     при эволюции окажется либо на другом месте, либо нигде.
//
// Зона переживает и то, и другое: «середина хвостовой части» остаётся
// серединой хвостовой части, сколько бы сегментов там ни выросло.
//
// Формат одной отметины (он же строки таблицы scars в будущей БД):
//     { id, kind, zone, t, seed, created_at }
//   kind  — 'scar' | 'fat' | 'moss' | 'gold' (пока рисуются только шрамы)
//   zone  — 'head' | 'body' | 'tail'
//   t     — 0..1 вдоль зоны
//   seed  — из него детерминированно растёт форма

// Минимальное расстояние между отметинами внутри зоны. Без него они
// слипаются в одно пятно, и вместо «летописи» получается грязь.
const WORM_MARK_MIN_GAP = 0.04;

// Сколько отметин зона показывает. Сверх этого числа они продолжают
// копиться в данных (и считаются для обмена), но не рисуются: иначе к сотне
// шрамов червь превращается в сплошную штриховку.
const WORM_MARK_ZONE_CAP = 8;

const WORM_MARK_ZONES = ['head', 'body', 'tail'];

// ---------- ДЕТЕРМИНИРОВАННЫЙ ГЕНЕРАТОР ----------
// Тот же приём, что у растений в лени: форма не хранится, а выводится из
// сида. Значит одна отметина — это несколько байт, а не список точек, и
// выглядит она одинаково на любом устройстве и после любой пересборки.
function wormMarkRng(seed, salt) {
    let h = (seed >>> 0) ^ 0x9e3779b9;
    const s = String(salt || '');
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return function () {
        h = (h + 0x6D2B79F5) >>> 0;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------- ЦВЕТ ----------
// Цвет отметины НЕ абсолютный, а сдвиг от текущего тона кожи: темнее,
// чуть насыщеннее и в розовое. Иначе шрам, подобранный к дефолтной шкуре,
// будет чужеродным пятном на любом купленном скине — а скины в плане
// заявлены бесконечным стоком.
function wormHexToHsl(hex) {
    const m = String(hex || '').replace('#', '');
    const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
    const num = parseInt(full, 16);
    if (!isFinite(num)) return { h: 0, s: 0, l: 50 };
    const r = ((num >> 16) & 255) / 255, g = ((num >> 8) & 255) / 255, b = (num & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
}

function wormHslToHex(h, s, l) {
    const hh = ((h % 360) + 360) % 360 / 360;
    const ss = Math.max(0, Math.min(100, s)) / 100;
    const ll = Math.max(0, Math.min(100, l)) / 100;
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    const conv = (t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const to255 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
    const r = ss === 0 ? ll : conv(hh + 1 / 3);
    const g = ss === 0 ? ll : conv(hh);
    const b = ss === 0 ? ll : conv(hh - 1 / 3);
    return '#' + [to255(r), to255(g), to255(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Сдвиги по видам отметин.
//
// В плане у шрама было «L −12%, S +8%». На практике так нельзя: одна и та же
// поправка ведёт себя по-разному на разной коже. На светлой голове минус
// двенадцать пунктов яркости при добавленной насыщенности дают алую полосу —
// читается как боевая раскраска, а не шрам; на тёмных сегментах тела шрам
// с той же поправкой почти сливается с кожей.
//
// Поэтому сдвиг не фиксированный, а В СТОРОНУ, ГДЕ ЕСТЬ МЕСТО: от светлой
// кожи темнеем, от тёмной светлеем, на одну и ту же величину. Тогда отметина
// одинаково читается и на дефолтной шкуре, и на любом купленном скине — а
// скины в плане заявлены бесконечным стоком.
//
//   contrast — на сколько пунктов яркости уйти от кожи
//   sMul     — множитель насыщенности (рубец бледнее живой кожи)
//   dh       — сдвиг тона
const WORM_MARK_TINT = {
    scar: { dh: -6, sMul: 0.78, contrast: 18 },
    fat:  { dh: 6, sMul: 0.9, contrast: 8 },
    moss: { dh: 70, sMul: 0.75, contrast: 14 },
    gold: { dh: 34, sMul: 1.5, contrast: 20 }
};

function wormMarkColor(skinHex, kind) {
    const tint = WORM_MARK_TINT[kind] || WORM_MARK_TINT.scar;
    const hsl = wormHexToHsl(skinHex);
    // Светлая кожа — темнеем, тёмная — светлеем.
    const away = hsl.l > 45 ? -1 : 1;
    return wormHslToHex(hsl.h + tint.dh, hsl.s * tint.sMul, hsl.l + away * tint.contrast);
}

// ---------- РАЗМЕЩЕНИЕ ----------
// Зона тела состоит из разного числа частей, и это число меняется при
// взрослении. Поэтому список строится от модели, а не хардкодится.
function wormMarkZoneParts(model) {
    const growing = (model && model.growingSegments) ? model.growingSegments.length : 0;
    const fixed = (model && model.fixedSegments) ? model.fixedSegments.length : 2;
    const body = [];
    for (let i = 1; i <= fixed; i++) body.push('segment-' + i);
    body.push('belly');
    const tail = [];
    for (let i = 1; i <= growing; i++) tail.push('growing-' + i);
    tail.push('tail');
    return { head: ['head'], body, tail };
}

// Зона + позиция вдоль неё → конкретная часть и локальные координаты внутри
// неё (в долях радиуса части, как их ждёт рендерер).
function wormResolveMark(model, mark) {
    const zones = wormMarkZoneParts(model);
    const parts = zones[mark.zone] || zones.body;
    const t = Math.max(0, Math.min(0.9999, Number(mark.t) || 0));

    const idx = Math.min(parts.length - 1, Math.floor(t * parts.length));
    const local = t * parts.length - idx;          // 0..1 внутри части
    const rng = wormMarkRng(mark.seed || 0, 'place');

    return {
        part: parts[idx],
        // Вдоль оси части: края оставляем свободными, иначе отметина
        // наполовину вылезает за силуэт.
        x: (local * 2 - 1) * 0.62,
        // Поперёк — от сида, но не у самого края по той же причине.
        y: (rng() * 2 - 1) * 0.52,
        rotation: (rng() * 2 - 1) * 40
    };
}

// Свободно ли место: рядом с существующей отметиной новую не ставим.
function wormMarkSpotFree(marks, zone, t) {
    return !(marks || []).some(m => m.zone === zone && Math.abs((m.t || 0) - t) < WORM_MARK_MIN_GAP);
}

// Ищет свободное место в зоне. Если зона забита плотно (а места в ней
// конечное число), возвращает null — и это нормальный ответ, а не ошибка.
function wormPickMarkSpot(marks, zone, seed) {
    const rng = wormMarkRng(seed || 0, 'spot');
    for (let attempt = 0; attempt < 24; attempt++) {
        const t = rng();
        if (wormMarkSpotFree(marks, zone, t)) return t;
    }
    return null;
}

// ---------- ФОРМА ----------
// Из сида выводятся длина, ширина, изгиб и рваность контура. Рендерер
// превращает это в путь.
function wormMarkGeometry(seed, kind) {
    const rng = wormMarkRng(seed || 0, 'shape');
    // Доля радиуса части. Верхняя граница осознанно небольшая: шрам во всю
    // щёку читается как порез в комиксе, а не как след старой драки.
    const long = 0.26 + rng() * 0.34;
    return {
        kind: kind || 'scar',
        length: long,
        width: long * (0.13 + rng() * 0.12),
        curve: (rng() * 2 - 1) * 0.5,      // изгиб: прямой шрам выглядит нарисованным
        ragged: 0.25 + rng() * 0.6,        // насколько рваный контур
        notches: 2 + Math.floor(rng() * 3) // сколько изломов на сторону
    };
}

// ---------- СЛОТЫ КОСМЕТИКИ ----------
// Одежда и аксессуары крепятся в той же системе координат, что и отметины:
// зона плюс позиция вдоль неё. Причина та же — при взрослении и эволюции
// шляпа должна остаться на голове, а не уехать в пиксельную точку, где
// голова была раньше (docs/plan/02-economy.md, раздел 8.1).
//
// Сама косметика — этап 3. Здесь только якоря: они должны существовать до
// того, как появится первый предмет, иначе предметы прибьются к чему
// попало и переезд будет стоить дороже.
const WORM_COSMETIC_SLOTS = {
    head: { zone: 'head', t: 0.5, label: 'Голова' },
    neck: { zone: 'body', t: 0.02, label: 'Шея' },
    body: { zone: 'body', t: 0.6, label: 'Тело' },
    tail: { zone: 'tail', t: 0.85, label: 'Хвост' }
};

const WormMarks = {
    MIN_GAP: WORM_MARK_MIN_GAP,
    ZONE_CAP: WORM_MARK_ZONE_CAP,
    ZONES: WORM_MARK_ZONES,
    rng: wormMarkRng,
    color: wormMarkColor,
    zoneParts: wormMarkZoneParts,
    resolve: wormResolveMark,
    spotFree: wormMarkSpotFree,
    pickSpot: wormPickMarkSpot,
    geometry: wormMarkGeometry,

    // Отметины зоны, которые реально показываются: свежие важнее старых,
    // остальные остаются в данных.
    visible(marks, zone) {
        const list = (marks || []).filter(m => m.zone === zone);
        return list.slice(Math.max(0, list.length - WORM_MARK_ZONE_CAP));
    },

    SLOTS: WORM_COSMETIC_SLOTS,

    // Куда крепить предмет из слота. Тот же расчёт, что и для отметины:
    // одна система координат — один код.
    resolveSlot(model, slotKey) {
        const slot = WORM_COSMETIC_SLOTS[slotKey];
        if (!slot) return null;
        const place = wormResolveMark(model, { zone: slot.zone, t: slot.t, seed: 0 });
        // У предмета нет случайного разброса: он сидит на оси части.
        return { slot: slotKey, part: place.part, x: place.x, y: 0, rotation: 0 };
    }
};

if (typeof window !== 'undefined') window.WormMarks = WormMarks;
