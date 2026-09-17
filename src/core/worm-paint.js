// ================= ЗАПИСЬ, ЦВЕТ, ШУМ =================
// Третий файл стопки рендерера (карта — в worm-basis.js). Общие инструменты,
// которыми пользуются все следующие:
//
//   setAttr            запись атрибута, которая НЕ пишет то, что уже стоит —
//                      пятнадцать тысяч холостых записей за кадр стоили кадров;
//   mixColor и прочее  смешивание цвета. Обесцвечивание истощённого червя
//                      делается ЦВЕТОМ, а не фильтром: фильтр на живом слое
//                      стоит отдельного буфера (docs/traps.md, п. 73);
//   шум                детерминированный — один и тот же червь обязан
//                      выглядеть одинаково между запусками;
//   ориентация тела    куда развёрнута напольная цепь и как она доворачивается.

// ---------- ОРИЕНТАЦИЯ ТЕЛА ПО НАПРАВЛЕНИЮ ДВИЖЕНИЯ ----------
// Напольная цепь строилась под ЖЁСТКИМ углом 180°: тело всегда уходило влево
// от головы, куда бы червь ни полз. Существо не может ползти в одну сторону,
// держа хвост перед собой.
//
// Теперь есть tailAngle — экранный угол, вдоль которого лежит хвостовая часть.
// Он доворачивается к направлению, ПРОТИВОПОЛОЖНОМУ движению, и делает это
// плавно: мгновенный переброс хвоста читался бы телепортом, а не поворотом.
const WORM_TAIL_TURN_BASE = 0.015;   // 1 - base^dt: меньше = быстрее доворот
// ...но не быстрее этого, градусов в секунду. Ограничитель тут не для
// красоты, а против ступеней: у экспоненты первый шаг самый большой, и на
// развороте кругом он выходил 25–45 градусов ЗА КАДР. Такой поворот нельзя
// увидеть иначе как рывками — сколько кадров ему ни дай, он всё равно
// проскакивает почти всю дугу за два-три. Ограничение по скорости делает
// сам поворот равномерным, а его длительность — предсказуемой: разворот
// кругом занимает полторы секунды, и хвост при этом ВОЛОЧИТСЯ за телом,
// а не перебрасывается.
const WORM_TAIL_TURN_MAX_DPS = 110;
// Пол показан в перспективе, а не сверху: шаг вглубь комнаты даёт на экране
// меньше пикселей, чем такой же шаг вбок. Хвост лежит на полу, поэтому его
// вертикальная составляющая сжимается тем же множителем — иначе при движении
// вглубь тело встанет на дыбы вместо того, чтобы уйти в перспективу.
const WORM_FLOOR_PERSPECTIVE = 0.45;
// Насколько сильно голова доворачивается вслед за направлением ползания.
// 0.5 совпадает с именованными позами left/right — то есть автоповорот
// использует те же настроенные крайние значения, а не свои.
const WORM_HEAD_YAW_FOLLOW = 0.5;
// Скорость подъезда головы к целевому повороту (формула 1 - base^dt):
// МЕНЬШЕ значение = БЫСТРЕЕ. 0.0009 даёт поворот примерно за четверть
// секунды — читается щелчком, но остаётся плавным.
const WORM_HEAD_YAW_BASE = 0.0009;
const WORM_HEAD_YAW_EPS = 0.004;
const WORM_SPINE_LEAN = 16;
// Показатель степени: >1 держит шею почти прямой, а изгиб собирает внизу, у
// живота. Линейный снос дал бы равномерный завал всей колонны — это чтение
// «падает», а не «изогнулся».
const WORM_SPINE_LEAN_POW = 1.6;
// Снос сегмента колонны по его положению t (0 = шея у головы, 1 = живот).
// Возвращает МОДУЛЬ сноса; сторону задаёт вызывающий по углу хвоста —
// колонна обязана заваливаться в ту же сторону, куда лежит тело, иначе при
// развороте дуга сломается пополам.
function spineLeanMag(t) {
    return WORM_SPINE_LEAN * Math.pow(Math.max(0, Math.min(1, t)), WORM_SPINE_LEAN_POW);
}

// Насколько мост единого силуэта уже соседних кругов — глубина перетяжки
// между секциями тела. 0 = ровная труба, ~0.2 = выраженные "сосисочные"
// вздутия. Подобрано так, чтобы секции читались, но тело не разваливалось
// обратно на отдельные шары.
const WORM_HULL_WAIST_RATIO = 0.2;

// ---------- ТАЙМИНГ-БАГ "ЭФФЕКТ ВОЛЧКА" ----------
// НИКОГДА не умножать общее накопленное время на переменную скорость:
// `Math.sin(animTime * переменнаяСкорость)` даёт скачок фазы,
// пропорциональный ВСЕЙ прошедшей истории. Вместо этого — отдельный
// аккумулятор ФАЗЫ, который каждый кадр прирастает на
// dtSec * ANIM_TIME_PER_SEC * ТЕКУЩАЯ_скорость (см. state.chainWigglePhase /
// state.tailWagPhase / state.organPhase в tick()).

// "Дыхание" — лёгкая пульсация масштаба вертикальной части тела, работает
// ВСЕГДА, независимо от ходьбы. Голова не участвует. ОДНА общая фаза с
// разной амплитудой по сегментам (WORM_BREATH_RATIO). Волна ОДНОПОЛЯРНАЯ —
// никогда не опускается ниже стандартного радиуса, только поднимается.
const WORM_BREATH_AMP = 0.035;
const WORM_BREATH_SPEED = 0.6;
const WORM_BREATH_RATIO = { 'belly': 1, 'segment-2': 0.7, 'segment-1': 0.3 };

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

let wormInstanceCounter = 0;

// ---------- ЗАПИСЬ АТРИБУТА, КОТОРАЯ ЧТО-ТО МЕНЯЕТ ----------
// В svg установка атрибута — это не «положить число»: она метит геометрию
// грязной, и браузер пересчитывает её заново, даже если значение то же
// самое. А оно то же самое чаще всего: замер по живой игре показал, что
// ТРИ ЧЕТВЕРТИ всех записей за кадр (в тщеславии — четыре пятых) пишут ровно
// то, что уже стоит. Пятнадцать тысяч холостых записей за три секунды.
//
// Кэш висит на самом узле, а не в общей таблице: узлы создаются и выкидываются
// вместе с персонажем, и общая таблица их бы пережила.
//
// Условие одно и оно жёсткое: атрибуты этих узлов НИКТО не пишет мимо
// setAttr — иначе кэш разойдётся с деревом. Внутри рендерера так и есть,
// снаружи в его узлы никто не пишет (мини-игры читают части и меняют позу
// живым каналом).
function setAttr(el, name, value) {
    const v = String(value);
    const cache = el.__wattr || (el.__wattr = Object.create(null));
    if (cache[name] === v) return;
    cache[name] = v;
    Element.prototype.setAttribute.call(el, name, v);
}

function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
        Object.keys(attrs).forEach(key => setAttr(el, key, attrs[key]));
    }
    return el;
}

// ---------- ЦВЕТОВЫЕ УТИЛИТЫ (для объёмных градиентов) ----------
// Модель хранит цвета то как hex ('#ffb6c1'), то как hsl('hsl(340, 56%, 48%)') —
// чтобы одинаково подмешивать в любой из форматов другой цвет, используем сам
// браузер: временный элемент + getComputedStyle всегда отдаёт цвет в виде
// rgb(...), из которого легко интерполировать в сторону любого целевого цвета.
let colorParseEl = null;
const colorParseCache = Object.create(null);
function parseCssColor(css) {
    // Кэш: parseCssColor вызывается десятки раз при каждой пересборке
    // (у каждого слоя каждого сегмента свои подмешанные оттенки), а сам
    // вызов дорогой — он дёргает getComputedStyle, то есть синхронный
    // пересчёт стилей документа. Цвет → rgb — чистая функция, кэшируется
    // без каких-либо оговорок.
    if (colorParseCache[css]) return colorParseCache[css];
    if (!colorParseEl) {
        colorParseEl = document.createElement('span');
        colorParseEl.style.display = 'none';
        (document.body || document.documentElement).appendChild(colorParseEl);
    }
    colorParseEl.style.color = '';
    colorParseEl.style.color = css;
    const computed = getComputedStyle(colorParseEl).color || '';
    const m = computed.match(/rgba?\(([^)]+)\)/);
    let out;
    if (!m) {
        out = { r: 200, g: 100, b: 120 };
    } else {
        const parts = m[1].split(',').map(s => parseFloat(s));
        out = { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0 };
    }
    colorParseCache[css] = out;
    return out;
}

// Линейная интерполяция цвета css → target на долю t (0..1).
function mixColor(css, targetCss, t) {
    const a = parseCssColor(css);
    const b = parseCssColor(targetCss);
    const tt = clamp01(t);
    const nr = Math.round(a.r + (b.r - a.r) * tt);
    const ng = Math.round(a.g + (b.g - a.g) * tt);
    const nb = Math.round(a.b + (b.b - a.b) * tt);
    return `rgb(${nr},${ng},${nb})`;
}

// ---------- ОБЕСЦВЕЧИВАНИЕ ИСТОЩЁННОГО: ЦВЕТ, А НЕ ФИЛЬТР ----------
// Раньше здесь стоял родной SVG-фильтр (saturate + feComponentTransfer) на
// весь слой персонажа. Работал он везде, но стоил ДВУХ ТРЕТЕЙ КАДРОВ: любая
// правка внутри отфильтрованной группы заставляет браузер перерисовать её
// в отдельный буфер и прогнать через конвейер целиком — а червь меняется
// каждый кадр. Замер на айфоне (кнопка «−фильтр» в debug-панели): 24 кадра
// с фильтром против 60 без него, при одинаковой картинке.
//
// Поэтому обесцвечивание теперь ЗАПЕКАЕТСЯ В САМИ ЦВЕТА: те же две
// операции считаются один раз на ступень истощения и записываются в fill,
// stroke и stop-color. Плата — разовая пробежка по узлам на смену ступени,
// а не пересчёт всей группы в каждом кадре.
//
// Математика ровно та же, что была в фильтре, поэтому картинка не поехала:
// матрица saturate(s) из спецификации SVG, следом линейная яркость
// slope = 0.72 + 0.28·s. Считается в sRGB — фильтр стоял с
// color-interpolation-filters="sRGB", то есть в тех же числах.
const witherColorCache = Object.create(null);
function witherColor(css, s) {
    if (!css || css === 'none' || css.indexOf('url(') === 0) return null;
    const key = css + '|' + s;
    const hit = witherColorCache[key];
    if (hit !== undefined) return hit;

    let r, g, b, a = null;
    const hex = /^#([0-9a-f]{3,8})$/i.exec(css.trim());
    if (hex && (hex[1].length === 3 || hex[1].length === 6)) {
        const h = hex[1].length === 3
            ? hex[1].split('').map(c => c + c).join('') : hex[1];
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
    } else {
        const m = /^rgba?\(([^)]+)\)$/i.exec(css.trim());
        if (m) {
            const p = m[1].split(',').map(v => parseFloat(v));
            r = p[0]; g = p[1]; b = p[2];
            if (p.length > 3) a = p[3];
        } else {
            // Именованные и hsl — через браузер. Дорого, но их единицы.
            const c = parseCssColor(css);
            r = c.r; g = c.g; b = c.b;
        }
    }
    if (!(r >= 0)) { witherColorCache[key] = null; return null; }

    const k = 0.72 + s * 0.28;
    const lr = 0.213, lg = 0.715, lb = 0.072;
    const ch = (cr, cg, cb) => Math.max(0, Math.min(255, Math.round(k * (
        (lr + (cr - lr) * s) * r +
        (lg + (cg - lg) * s) * g +
        (lb + (cb - lb) * s) * b))));
    const nr = ch(1, 0, 0), ng = ch(0, 1, 0), nb = ch(0, 0, 1);
    const out = a == null ? `rgb(${nr},${ng},${nb})` : `rgba(${nr},${ng},${nb},${a})`;
    witherColorCache[key] = out;
    return out;
}

// Атрибуты, в которых у персонажа вообще лежит цвет. Проверено пробежкой по
// собранному дереву: ни одного цвета в style или в css-классах нет — иначе
// запекание бы их не достало.
const WITHER_COLOR_ATTRS = ['fill', 'stroke', 'stop-color'];

function withAlpha(css, alpha) {
    const { r, g, b } = parseCssColor(css);
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}

// Грязно-оливковый (не чисто чёрный) для теней и болезненно-желтоватый (не
// чисто белый) для бликов — объёмный градиент читается как немытая кожа, а
// не глянцевая игрушка, без единого лишнего пятна/полоски поверх заливки.
const GRIME_SHADOW = INK;
const GRIME_HIGHLIGHT = BILE[200];

// Радиальный градиент "блик сверху-слева → тень снизу-справа" — придаёт
// плоским SVG-эллипсам ощущение объёма без утяжеления разметки. Каждой части
// тела достаётся свой градиент с уникальным id (instanceId + имя части), т.к.
// на экране одновременно может быть смонтировано несколько персонажей.
function ensureVolumeGradient(defs, id, colorCss, opts) {
    opts = opts || {};
    const highlightAmt = opts.highlight != null ? opts.highlight : 0.3;
    const shadowAmt = opts.shadow != null ? opts.shadow : -0.3;
    const highlightTarget = opts.highlightTint || SPEC;
    const shadowTarget = opts.shadowTint || INK;
    const highlight = highlightAmt === 0 ? colorCss : mixColor(colorCss, highlightTarget, Math.abs(highlightAmt));
    const shadow = shadowAmt === 0 ? colorCss : mixColor(colorCss, shadowTarget, Math.abs(shadowAmt));
    // ЕДИНЫЙ ИСТОЧНИК СВЕТА. Раньше каждый вызов передавал СВОИ cx/cy, из-за
    // чего каждая часть тела была освещена собственной лампочкой и выглядела
    // самостоятельным глянцевым шариком — отсюда вид "гирлянда из пластика".
    // Теперь направление света берётся из LIGHT и одинаково для всех частей,
    // поэтому блики выстраиваются в одну линию и фигура читается единым
    // объёмом. Индивидуальные cx/cy намеренно ИГНОРИРУЮТСЯ — см.
    // docs/art-direction.md §3. Управлять размытием (r) по-прежнему можно.
    const grad = svgEl('radialGradient', {
        id,
        cx: (50 + LIGHT.dirX * 50).toFixed(1) + '%',
        cy: (50 + LIGHT.dirY * 50).toFixed(1) + '%',
        r: opts.r || '75%'
    });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': highlight }));
    grad.appendChild(svgEl('stop', { offset: '55%', 'stop-color': colorCss }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': shadow }));
    defs.appendChild(grad);
    return `url(#${id})`;
}

// ---------- ДЕТЕРМИНИРОВАННЫЙ ГЕНЕРАТОР ШУМА ----------
// Обычный Math.random() дал бы новый узор при каждой перерисовке одного и
// того же смонтированного персонажа (rebuild() дёргается на любой
// setOverride/update) — узор бы "мигал" и переставлялся.
function hashStringSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

