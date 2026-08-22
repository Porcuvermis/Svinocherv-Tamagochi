// ================= ЕДИНЫЙ РЕНДЕРЕР СВИНОЧЕРВЯ (WORM RENDERER) =================
// Строит SVG персонажа из WormModel (см. src/core/worm-model.js) и умеет
// монтироваться в ЛЮБОЙ контейнер — главный экран, любая мини-игра.
//
// Главная идея модульности: части тела — это <g data-part="...">, а шрамы,
// эффекты и будущие аксессуары монтируются КАК ДОЧЕРНИЕ ЭЛЕМЕНТЫ этих групп,
// поэтому при масштабировании сегмента (например, живот раздувается в
// Чревоугодии) все шрамы/украшения на нём растягиваются вместе с ним
// автоматически — через SVG-иерархию, без ручного пересчёта координат.
//
// Контекстные оверрайды: любой экран может временно "подменить" часть модели
// на время своего рендера через handle.setOverride(patch) — базовая
// сохранённая модель игрока при этом не трогается (см. mergeWormOverride).
// "Живой" канал handle.setLivePose(patch) — для непрерывных покадровых
// обновлений (наклон хвоста, раздутие живота, уровень век, открытие/форма
// рта) — не вызывает пересборку SVG, просто переставляет атрибуты уже
// созданных узлов в tick(). Это ЕДИНЫЙ механизм и для главного экрана
// (мимика, "болтовня"), и для любой мини-игры — параметры рта устроены так
// же, как и остальные части тела (веко, живот, хвост): не отдельная логика
// на каждый контекст, а один и тот же setLivePose({ mouthOpenness, mouthCurve }).
//
// Публичный API (mount/update/setOverride/setLivePose/...) и все
// data-part/data-anchor имена НЕ меняются между апгрейдами отрисовки —
// мини-игры, завязанные на них (gluttony.js читает [data-part="mouth"] и
// т.п.), продолжают работать без правок.

const SVG_NS = 'http://www.w3.org/2000/svg';
// Доп. отступ всей телесной цепочки от центра головы, чтобы сегмент-1
// не прятался почти целиком под головой, а минимум наполовину торчал из-под неё.
// Было 24, затем увеличено до 34 — оказалось уже СЛИШКОМ много; 29 —
// середина между "прячется" (24) и "слишком далеко" (34).
const WORM_CHAIN_HEAD_GAP = 29;
// Параметры анимации моргания — см. использование в tick(). Окно короткое
// (быстро), но внутри него уровень век непрерывно меняется по синусоиде
// (плавно), а не щёлкает между двумя состояниями.
const WORM_BLINK_CYCLE = 2600;
const WORM_BLINK_START = 2200;
const WORM_BLINK_DURATION = 220;
// Форма рта (см. updateMouthGeometry): "магическая" константа приближения
// четверти окружности/эллипса кубической кривой Безье — даёт гладкую дугу
// без видимых заломов. EGG_TOP/BOTTOM — лёгкая асимметрия "как яйцо" (верх
// чуть уже, низ чуть шире), а не идеально круглая форма.
const MOUTH_ARC_K = 0.5522847498;
const MOUTH_EGG_TOP = 0.85;
const MOUTH_EGG_BOTTOM = 1.12;

// ---------- ПОЗА ТЕЛА И АНИМАЦИЯ ДВИЖЕНИЯ ----------
// Раскладка цепочки при opts.pose === 'standing' (по умолчанию, главный
// экран): сегменты между головой и животом (fixedSegments) + сам живот
// стоят "вертикальным столбиком" — условная спина/шея, животом упирающаяся
// в пол. От живота дальше (growing-сегменты + хвост) цепочка лежит на полу
// и идёт горизонтально — как раньше, но теперь это только ЧАСТЬ цепочки.
// opts.pose === 'lying' — старая раскладка "одна прямая линия целиком",
// оставлена БЕЗ ИЗМЕНЕНИЙ в логике — нужна Чревоугодию, где персонаж лежит
// плашмя на боку во время кормления.
// Используется только легаси-раскладкой opts.pose==='lying' (см. ниже) —
// действующая напольная цепь ('standing') считает длину звена от РЕАЛЬНЫХ
// радиусов соседних частей, см. WORM_FLOOR_LINK_OVERLAP_RATIO.
const WORM_SEGMENT_SPACING = 18; // базовое расстояние между сегментами (px)

// Сколько "единиц" animTime проходит в РЕАЛЬНУЮ секунду — раньше animTime
// прирастал фиксированным шагом ЗА КАДР (`+= 0.05` в tick()), из-за чего
// скорость всех синусоидальных анимаций (виляние, дыхание, моргание)
// зависела от частоты кадров устройства. Теперь animTime считается от
// РЕАЛЬНОГО прошедшего времени (dt в tick()), не от количества кадров.
const WORM_ANIM_TIME_PER_SEC = 3;
// Та же проблема была у сглаживания движения к цели (было `*0.02` за
// кадр) — заменено на framerate-независимую формулу 1 - base^dtSec.
const WORM_WANDER_MOVE_BASE = 0.3;

// Порог (px): ниже него считаем, что цель движения достигнута — targetX/Y
// приближаются к wormX/Y экспоненциально и математически никогда не
// долетают ТОЧНО до цели.
const WORM_MOVE_EPS = 1.5;
// Насколько быстро "интенсивность движения" (0..1) сходится к цели —
// подставляется в framerate-независимую формулу 1 - base^dtSec: МЕНЬШЕ
// значение = БЫСТРЕЕ сходимость. Задаёт амплитуду/скорость покачивания
// (виляния) — см. блок "НОВАЯ СТОЯЩАЯ ПОЗА" в tick(). Длина звена
// напольной цепочки с этим полем больше не связана — см.
// WORM_SPEED_REF_PX_PER_SEC ниже.
const WORM_MOVE_INTENSITY_SMOOTH_BASE = 0.0025;
// Пауза "стоит на месте" между прогулками к новой случайной точке.
const WORM_IDLE_PAUSE_MIN = 3500;
const WORM_IDLE_PAUSE_MAX = 8000;

// ---------- РАСТЯЖЕНИЕ ХВОСТОВОЙ ЧАСТИ ОТ РЕАЛЬНОЙ СКОРОСТИ ----------
// Длина звена считается от ФАКТИЧЕСКОЙ мгновенной скорости перемещения
// (px/сек), а не от сглаженного бинарного флага "движется/стоит" — иначе
// хвостовая часть оставалась растянутой ещё около секунды ПОСЛЕ того, как
// персонаж уже визуально остановился.
const WORM_SPEED_REF_PX_PER_SEC = 60; // скорость, при которой достигается полное растяжение
const WORM_SPEED_INTENSITY_SMOOTH_BASE = 0.02; // быстрое сглаживание (~0.2с)

// ---------- НАПОЛЬНАЯ ЦЕПОЧКА КАК ПРОСТАЯ КИНЕМАТИЧЕСКАЯ ЦЕПЬ ----------
// growing-сегменты и хвост НЕ позиционируются каждый независимой формулой
// (это давало видимые разрывы между соседями). Вместо этого каждое звено
// вычисляется строго ОТ ПРЕДЫДУЩЕГО: позиция = позиция_предыдущего + длина
// звена в направлении текущего угла звена. Раз каждое звено жёстко
// привязано к предыдущему по построению — разъединиться им ГЕОМЕТРИЧЕСКИ
// невозможно, при любой амплитуде покачивания.
const WORM_MOVE_SPACING_EXTRA = 4; // доп. px к длине звена при ходьбе

// ---------- БАЗОВАЯ ДЛИНА ЗВЕНА НАПОЛЬНОЙ ЦЕПИ: ОТ РЕАЛЬНЫХ РАДИУСОВ ----------
// Одно плоское число не может подойти сразу всем парам сужающейся цепи,
// поэтому длина звена МЕЖДУ КОНКРЕТНОЙ ПАРОЙ считается от их РЕАЛЬНЫХ
// радиусов: сумма радиусов минус доля от МЕНЬШЕГО из двух — одинаковое
// ОТНОСИТЕЛЬНОЕ (не абсолютное) перекрытие для любой пары.
const WORM_FLOOR_LINK_OVERLAP_RATIO = 0.6;
function floorLinkBaseLength(radiusA, radiusB) {
    return radiusA + radiusB - WORM_FLOOR_LINK_OVERLAP_RATIO * Math.min(radiusA, radiusB);
}
// Покачивание угла КАЖДОГО звена напольной цепочки (включая точку
// крепления хвоста) — держит цепочку согласованной единой волной.
const WORM_CHAIN_WIGGLE_IDLE_DEG = 1.2;
const WORM_CHAIN_WIGGLE_MOVE_DEG = 3.5;
const WORM_CHAIN_WIGGLE_IDLE_SPEED = 0.5;
const WORM_CHAIN_WIGGLE_MOVE_SPEED = 1.1;
// Разница фазы (рад) между соседними звеньями — маленькая, чтобы сосед
// двигался почти вслед за соседом (мягкая бегущая волна), не вразнобой.
const WORM_CHAIN_PHASE_STEP = 0.3;
// Хвост дополнительно "вихляет" СВЕРХ базового угла звена — косметический
// поворот ЕГО СОБСТВЕННОЙ формы (bendGroup) вокруг уже вычисленной точки
// крепления, на само крепление не влияет.
const WORM_TAIL_EXTRA_WAG_IDLE_DEG = 2;
const WORM_TAIL_EXTRA_WAG_MOVE_DEG = 5;

// ---------- ФОРМА ХВОСТА ----------
// Основание хвоста = доля от реального радиуса ПОСЛЕДНЕГО growing-сегмента
// (см. buildTailNode) — продолжает естественное сужение цепочки. Кончик —
// доля УЖЕ от основания хвоста, закруглённый овал, а не точка.
const WORM_TAIL_BASE_RATIO = 0.7;
const WORM_TAIL_TIP_RATIO = 0.35;

// ---------- ВЕРТИКАЛЬНАЯ ЧАСТЬ ЦЕПОЧКИ (голова → сегмент-1 → сегмент-2 → живот) ----------
// У вертикальной части СВОЁ расстояние, независимое от напольной цепи
// (плоская константа здесь корректна: у всех трёх сегментов один радиус).
const WORM_VERTICAL_SPACING = 26;

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

// Слизистый след на полу во время ходьбы (растёт из-под предхвостового
// growing-сегмента) — см. startSlimeTrail/extendSlimeTrail/updateSlimeTrail
// внутри WormRenderer.mount().
const WORM_SLIME_FADE_MS = 15000;
const WORM_SLIME_WIDTH = 15;
const WORM_SLIME_MIN_STEP = 4;
const WORM_SLIME_COLOR = 'rgba(92,102,48,0.42)';

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

let wormInstanceCounter = 0;

function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
        Object.keys(attrs).forEach(key => el.setAttribute(key, attrs[key]));
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

function withAlpha(css, alpha) {
    const { r, g, b } = parseCssColor(css);
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}

// Грязно-оливковый (не чисто чёрный) для теней и болезненно-желтоватый (не
// чисто белый) для бликов — объёмный градиент читается как немытая кожа, а
// не глянцевая игрушка, без единого лишнего пятна/полоски поверх заливки.
const GRIME_SHADOW = '#241d10';
const GRIME_HIGHLIGHT = '#e9dfae';

// Радиальный градиент "блик сверху-слева → тень снизу-справа" — придаёт
// плоским SVG-эллипсам ощущение объёма без утяжеления разметки. Каждой части
// тела достаётся свой градиент с уникальным id (instanceId + имя части), т.к.
// на экране одновременно может быть смонтировано несколько персонажей.
function ensureVolumeGradient(defs, id, colorCss, opts) {
    opts = opts || {};
    const highlightAmt = opts.highlight != null ? opts.highlight : 0.3;
    const shadowAmt = opts.shadow != null ? opts.shadow : -0.3;
    const highlightTarget = opts.highlightTint || '#ffffff';
    const shadowTarget = opts.shadowTint || '#000000';
    const highlight = highlightAmt === 0 ? colorCss : mixColor(colorCss, highlightTarget, Math.abs(highlightAmt));
    const shadow = shadowAmt === 0 ? colorCss : mixColor(colorCss, shadowTarget, Math.abs(shadowAmt));
    const grad = svgEl('radialGradient', {
        id, cx: opts.cx || '35%', cy: opts.cy || '30%', r: opts.r || '75%'
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

// ============================================================================
//                        АНАТОМИЧЕСКИЕ СЛОИ ТЕЛА
// ============================================================================
// Тело — не один эллипс с градиентом, а слоистый материал. На КАЖДУЮ часть
// (сегмент/живот/хвост/голова) строится одна и та же стопка слоёв, в строго
// фиксированном порядке снизу вверх:
//
//   [0] skin base   — сама заливка части (уже существовавший эллипс/путь);
//   [1] skin tone   — неоднородность тона: крупные мягкие пятна светлее/темнее;
//   [2] dorsoventral— спина темнее, брюхо светлее (как у дождевого червя);
//   [3] muscle      — продольные тяжи под кожей, дают рельеф, а не гладкий шар;
//   [4] organs      — РАЗНЫЕ по форме структуры (кишка/мешочек/узелки/сосуд),
//                     у каждой свой цвет, свой ритм пульсации, своя видимость;
//   [5] coat        — покрытие кожи: кольцевые бороздки, складки, поясок,
//                     щетина, матовые участки и ЧЁТКИЙ блик слизи.
//
// Порядок задан ЯВНО (см. ANAT_LAYER_ORDER и buildAnatomyStack) — слои не
// собираются "как получится" и не могут случайно перекрыть друг друга.
//
// Ключевые технические решения (см. ТЗ по производительности):
//   • НИ ОДНОГО feGaussianBlur и ни одной SMIL-анимации. Мягкость краёв
//     достигается радиальными градиентами с падающей до нуля прозрачностью,
//     а не фильтрами — это стоит примерно как обычная заливка.
//   • "Просвечивание" — не blend-mode, а честный полупрозрачный слой органов
//     МЕЖДУ кожей и её покрытием, с локальной непрозрачностью по зоне тела
//     (skin.thinness): на животе кожа тоньше — видно лучше, на голове почти
//     не видно.
//   • Формы органов имеют ЧЁТКИЙ контур (stroke) — именно он даёт
//     читаемость силуэта органа; мягко растворяется только заливка внутри.
//   • Вся анатомия части лежит в ОДНОЙ группе, обрезанной по силуэту этой
//     части (clipPath) — ни один слой физически не может вылезти за пределы
//     своего сегмента на соседний.
//   • Пульсация органов считается в tick() от dt (framerate-independent),
//     через отдельный аккумулятор фазы — тот же принцип, что и у остальных
//     анимаций рендерера.

const ANAT_LAYER_ORDER = ['tone', 'dorsoventral', 'muscle', 'organs', 'coat'];

// Резервная анатомия для старых сохранённых моделей, в которых блока
// anatomy ещё нет: рендерер тогда просто рисует как раньше.
const ANAT_DISABLED = { enabled: false };

function getAnatomy(model) {
    const a = model && model.anatomy;
    if (!a || !a.enabled) return ANAT_DISABLED;
    return a;
}

// Локальная прозрачность кожи по зоне тела. Ключ 'growing' покрывает все
// растущие сегменты сразу (их количество меняется со взрослением, поэтому
// перечислять их поимённо в модели нельзя).
function anatThinness(anatomy, partName) {
    const t = (anatomy.skin && anatomy.skin.thinness) || {};
    if (t[partName] != null) return t[partName];
    if (partName.indexOf('growing-') === 0 && t.growing != null) return t.growing;
    return 0.4;
}

// Сид анатомии берётся из МОДЕЛИ (anatomy.seed), а не из instanceId — иначе
// один и тот же персонаж выглядел бы по-разному на главном экране и в
// мини-игре (у них разные instanceId). Узор особи должен быть её
// собственностью, а не свойством конкретного монтирования.
function anatRng(anatomy, partName, salt) {
    return mulberry32(hashStringSeed(`${anatomy.seed || 0}|${partName}|${salt || ''}`));
}

// Мягкое пятно: радиальный градиент, у которого прозрачность падает до нуля
// к краю. Это и есть замена размытию — края растворяются, но стоимость
// отрисовки как у обычной заливки.
function ensureSoftGradient(ctx, id, colorCss, peakAlpha) {
    if (ctx.gradCache[id]) return `url(#${id})`;
    const grad = svgEl('radialGradient', { id, cx: '50%', cy: '50%', r: '50%' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': colorCss, 'stop-opacity': peakAlpha.toFixed(3) }));
    grad.appendChild(svgEl('stop', { offset: '55%', 'stop-color': colorCss, 'stop-opacity': (peakAlpha * 0.5).toFixed(3) }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': colorCss, 'stop-opacity': '0' }));
    ctx.defs.appendChild(grad);
    ctx.gradCache[id] = true;
    return `url(#${id})`;
}

// Градиент "спина темнее — брюхо светлее". Один на весь инстанс: сила
// эффекта одинаковая для всех частей тела, поэтому дублировать его на
// каждый сегмент незачем.
function ensureDorsoVentralGradient(ctx) {
    const id = `worm-dv-${ctx.instanceId}`;
    if (ctx.gradCache[id]) return `url(#${id})`;
    const skin = ctx.anatomy.skin || {};
    const dark = skin.dorsalDarkening != null ? skin.dorsalDarkening : 0.3;
    const light = skin.ventralLightening != null ? skin.ventralLightening : 0.14;
    const grad = svgEl('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': GRIME_SHADOW, 'stop-opacity': (dark * 0.75).toFixed(3) }));
    grad.appendChild(svgEl('stop', { offset: '30%', 'stop-color': GRIME_SHADOW, 'stop-opacity': (dark * 0.22).toFixed(3) }));
    grad.appendChild(svgEl('stop', { offset: '52%', 'stop-color': GRIME_SHADOW, 'stop-opacity': '0' }));
    grad.appendChild(svgEl('stop', { offset: '78%', 'stop-color': GRIME_HIGHLIGHT, 'stop-opacity': (light * 0.45).toFixed(3) }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': GRIME_HIGHLIGHT, 'stop-opacity': light.toFixed(3) }));
    ctx.defs.appendChild(grad);
    ctx.gradCache[id] = true;
    return `url(#${id})`;
}

// ---------- ПЛАН ОРГАНОВ ----------
// Органы — не "цветные пятна", а несколько РАЗНЫХ по форме и поведению
// структур. План (что где лежит) считается детерминированно от сида особи,
// поэтому у разных червей внутренности разложены по-разному, но у одного и
// того же червя всегда одинаково.
//
// zone:
//   'core'  — живот: самое насыщенное место (кишка + мешочек + узелки);
//   'neck'  — сегменты между головой и животом: кишка проходит транзитом;
//   'floor' — растущие сегменты: кишка + иногда узелки;
//   'tail'  — хвост: только тонкий отросток кишки;
//   'head'  — голова: органов нет (кожа/череп плотные), только сосудики в ушах.
function organPlanForZone(zone, rng, density) {
    const plan = [];
    const d = density != null ? density : 1;
    function maybe(chance) { return rng() < chance * d; }

    // ВАЖНО: отдельных "кишок" по сегментам здесь больше нет. Кишечник —
    // ОДИН непрерывный тракт на всё тело (см. buildGutTractGeometry): куски
    // кишки, живущие каждый в своём сегменте, не могут быть связаны между
    // собой в принципе — на каждом стыке был разрыв. Здесь остаются только
    // локальные органы: мешочки и грозди узелков.
    if (zone === 'core') {
        // Орган-мешочек — компактный, с собственным ритмом.
        plan.push({
            kind: 'sac', cx: 0.3 + rng() * 0.16, cy: -0.16 - rng() * 0.12, len: 0.28, thick: 0.34,
            rot: rng() * 30 - 15, speedMul: 1.55, ampMul: 1.35, phase: rng() * 6.28
        });
        // Гроздь узелков.
        if (maybe(0.9)) {
            plan.push({
                kind: 'node', cx: -0.42 + rng() * 0.14, cy: -0.1 + rng() * 0.3, len: 0.2, thick: 0.24,
                rot: rng() * 40 - 20, speedMul: 1.05, ampMul: 0.8, phase: rng() * 6.28
            });
        }
    } else if (zone === 'neck') {
        if (maybe(0.5)) {
            plan.push({
                kind: 'sac', cx: -0.3 + rng() * 0.2, cy: -0.2, len: 0.2, thick: 0.22,
                rot: rng() * 24 - 12, speedMul: 1.4, ampMul: 1, phase: rng() * 6.28
            });
        }
    } else if (zone === 'floor') {
        if (maybe(0.65)) {
            plan.push({
                kind: 'node', cx: -0.25 + rng() * 0.5, cy: -0.22, len: 0.16, thick: 0.18,
                rot: rng() * 40 - 20, speedMul: 1.2, ampMul: 0.7, phase: rng() * 6.28
            });
        }
    }
    return plan;
}

// Сосудистая сеть, расходящаяся от органа. На хороших артах именно она
// связывает внутренности с телом: орган без сосудов выглядит проглоченным
// предметом, а не частью существа. Рекурсивное ветвление, каждый уровень
// тоньше и бледнее предыдущего.
function buildVesselTree(group, rng, x, y, angle, len, depth, color, width) {
    if (depth <= 0 || len < 1.5) return;
    const spread = (rng() - 0.5) * 0.9;
    const ex = x + Math.cos(angle) * len;
    const ey = y + Math.sin(angle) * len;
    const cx = x + Math.cos(angle + spread * 0.6) * len * 0.55;
    const cy = y + Math.sin(angle + spread * 0.6) * len * 0.55;
    group.appendChild(svgEl('path', {
        d: `M ${x.toFixed(1)},${y.toFixed(1)} Q ${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`,
        fill: 'none', stroke: color, 'stroke-width': width.toFixed(2),
        'stroke-linecap': 'round', opacity: (0.28 + 0.12 * depth).toFixed(2)
    }));
    const branches = depth > 1 ? 2 : 1;
    for (let i = 0; i < branches; i++) {
        buildVesselTree(group, rng, ex, ey,
            angle + (rng() - 0.5) * 1.5, len * (0.5 + rng() * 0.25),
            depth - 1, color, Math.max(0.35, width * 0.6));
    }
}

// Один орган: заливка мягко растворяется к краям (без фильтров), а КОНТУР
// остаётся чётким — именно контур делает орган "формой", а не пятном света.
function buildOrganNode(ctx, plan, halfLen, halfThick, idKey) {
    const palette = (ctx.anatomy.organs && ctx.anatomy.organs.palette) || {};
    const group = svgEl('g', { class: `worm-organ worm-organ-${plan.kind}` });
    const x = plan.cx * halfLen;
    const y = plan.cy * halfThick;

    if (plan.kind === 'gut') {
        const color = palette.gut || '#7d2f3e';
        const L = plan.len * halfLen;
        const w = Math.max(2.2, plan.thick * halfThick);
        const bend = (plan.bend || 0.3) * halfThick * 0.9;
        const d = `M ${(-L).toFixed(1)},0 C ${(-L * 0.45).toFixed(1)},${(-bend).toFixed(1)} ` +
                  `${(L * 0.45).toFixed(1)},${bend.toFixed(1)} ${L.toFixed(1)},0`;
        // Мягкая тень вокруг трубки — орган лежит ПОД кожей, а не наклеен
        // сверху. Без неё даже правильный по цвету орган читается как
        // нарисованная поверх линия.
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: GRIME_SHADOW,
            'stroke-width': (w + 5).toFixed(1), 'stroke-linecap': 'round', opacity: 0.16
        }));
        // Контур (чуть шире и темнее) — читаемая граница трубки.
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: mixColor(color, GRIME_SHADOW, 0.5),
            'stroke-width': (w + 1.8).toFixed(1), 'stroke-linecap': 'round', opacity: 0.7
        }));
        // Тело трубки.
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: color,
            'stroke-width': w.toFixed(1), 'stroke-linecap': 'round', opacity: 1
        }));
        // Продольный светлый рефлекс вдоль трубки — она читается объёмной,
        // а не плоской лентой.
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: mixColor(color, GRIME_HIGHLIGHT, 0.5),
            'stroke-width': Math.max(0.8, w * 0.28).toFixed(1), 'stroke-linecap': 'round',
            opacity: 0.35, transform: `translate(0,${(-w * 0.22).toFixed(1)})`
        }));
    } else if (plan.kind === 'sac') {
        // Капсула из пяти слоёв, как на референсных артах: тень под органом →
        // ореол свечения → тело → чёткий ободок → яркое ядро с бликом.
        // Свечение сделано вложенными градиентами с падающей прозрачностью —
        // визуально это то же, что размытие, но без единого фильтра.
        const color = palette.sac || '#6c7a33';
        const glow = (ctx.anatomy.organs && ctx.anatomy.organs.glow != null) ? ctx.anatomy.organs.glow : 0.6;
        const rx = plan.len * halfLen;
        const ry = plan.thick * halfThick;
        const gid = `worm-organ-sac-${ctx.instanceId}-${idKey}`;
        const fill = ensureSoftGradient(ctx, gid, color, 1);
        const shadowGid = `worm-organ-shadow-${ctx.instanceId}`;
        const coreColor = mixColor(color, '#fff3b0', 0.62);

        group.appendChild(svgEl('ellipse', {
            cx: 0, cy: 0, rx: (rx * 1.35).toFixed(1), ry: (ry * 1.35).toFixed(1),
            fill: ensureSoftGradient(ctx, shadowGid, GRIME_SHADOW, 1), opacity: 0.28
        }));
        if (glow > 0.02) {
            const glowFill = ensureSoftGradient(ctx, `worm-organ-glow-${ctx.instanceId}-${idKey}`, coreColor, 1);
            group.appendChild(svgEl('ellipse', {
                cx: 0, cy: 0, rx: (rx * 2.1).toFixed(1), ry: (ry * 2.1).toFixed(1),
                fill: glowFill, opacity: (0.32 * glow).toFixed(3)
            }));
            group.appendChild(svgEl('ellipse', {
                cx: 0, cy: 0, rx: (rx * 1.45).toFixed(1), ry: (ry * 1.45).toFixed(1),
                fill: glowFill, opacity: (0.3 * glow).toFixed(3)
            }));
        }
        group.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(1), ry: ry.toFixed(1), fill }));
        group.appendChild(svgEl('ellipse', {
            cx: 0, cy: 0, rx: rx.toFixed(1), ry: ry.toFixed(1),
            fill: 'none', stroke: mixColor(color, GRIME_SHADOW, 0.45),
            'stroke-width': 1.2, opacity: 0.75
        }));
        group.appendChild(svgEl('ellipse', {
            cx: (-rx * 0.12).toFixed(1), cy: (-ry * 0.12).toFixed(1),
            rx: (rx * 0.45).toFixed(1), ry: (ry * 0.45).toFixed(1),
            fill: coreColor, opacity: (0.5 + 0.3 * glow).toFixed(2)
        }));
        group.appendChild(svgEl('ellipse', {
            cx: (-rx * 0.3).toFixed(1), cy: (-ry * 0.34).toFixed(1),
            rx: (rx * 0.16).toFixed(1), ry: (ry * 0.13).toFixed(1),
            fill: '#ffffff', opacity: 0.4
        }));

        // Сосуды от капсулы — 3-5 стволов в разные стороны.
        const vrng = anatRng(ctx.anatomy, idKey, 'vessels');
        const vGroup = svgEl('g', { class: 'worm-organ-vessels' });
        const vColor = mixColor(color, palette.vessel || '#4a131e', 0.45);
        const trunks = 3 + Math.floor(vrng() * 3);
        for (let i = 0; i < trunks; i++) {
            const a = (i / trunks) * Math.PI * 2 + vrng() * 0.6;
            buildVesselTree(vGroup, vrng,
                Math.cos(a) * rx * 0.85, Math.sin(a) * ry * 0.85, a,
                Math.max(rx, ry) * (0.7 + vrng() * 0.6), 3, vColor, 1.1);
        }
        group.insertBefore(vGroup, group.firstChild ? group.firstChild.nextSibling : null);
    } else if (plan.kind === 'node') {
        const color = palette.node || '#a8703f';
        const rng = anatRng(ctx.anatomy, idKey, 'node');
        const base = plan.thick * halfThick;
        for (let i = 0; i < 3; i++) {
            const r = base * (0.45 + rng() * 0.4);
            const nx = (rng() - 0.5) * plan.len * halfLen * 1.4;
            const ny = (rng() - 0.5) * base * 1.2;
            group.appendChild(svgEl('circle', {
                cx: nx.toFixed(1), cy: ny.toFixed(1), r: r.toFixed(1),
                fill: color, opacity: 0.75,
                stroke: mixColor(color, GRIME_SHADOW, 0.45), 'stroke-width': 0.8
            }));
            group.appendChild(svgEl('circle', {
                cx: (nx - r * 0.2).toFixed(1), cy: (ny - r * 0.2).toFixed(1), r: (r * 0.42).toFixed(1),
                fill: mixColor(color, '#ffe9a8', 0.55), opacity: 0.6
            }));
        }
    }

    group.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(plan.rot || 0).toFixed(1)})`);
    return {
        group, x, y, rot: plan.rot || 0, kind: plan.kind,
        speedMul: plan.speedMul || 1, ampMul: plan.ampMul || 1, phase: plan.phase || 0
    };
}

// ---------- СЛОЙ МЫШЦ ----------
// Продольные тяжи: слегка светлее по верхней грани и темнее по нижней —
// читается как объёмный жгут под кожей, а не как нарисованная полоска.
function buildMuscleLayer(ctx, partName, halfLen, halfThick, enabled) {
    if (enabled === false) return null;
    const muscle = ctx.anatomy.muscle || {};
    const tone = muscle.tone != null ? muscle.tone : 0.55;
    if (tone <= 0.01) return null;
    const bundles = Math.max(1, Math.round(muscle.bundles != null ? muscle.bundles : 3));
    const rng = anatRng(ctx.anatomy, partName, 'muscle');
    const group = svgEl('g', { class: 'worm-muscle-layer' });

    for (let i = 0; i < bundles; i++) {
        const t = bundles === 1 ? 0 : (i / (bundles - 1)) * 2 - 1; // -1..1 поперёк тела
        const cy = t * halfThick * 0.5 + (rng() - 0.5) * halfThick * 0.12;
        const L = halfLen * (0.62 + rng() * 0.24);
        const w = halfThick * (0.16 + rng() * 0.1);
        const bend = (rng() - 0.5) * halfThick * 0.3;
        const d = `M ${(-L).toFixed(1)},${cy.toFixed(1)} Q 0,${(cy + bend).toFixed(1)} ${L.toFixed(1)},${cy.toFixed(1)}`;
        // Тяж читается ОЩУЩЕНИЕМ рельефа, а не нарисованной полоской:
        // непрозрачность намеренно низкая (единицы процентов), светлая грань
        // сверху и тёмная снизу дают лёгкую выпуклость под кожей. Всё, что
        // выше этих значений, немедленно превращается в "полосатую банку".
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: GRIME_HIGHLIGHT,
            'stroke-width': w.toFixed(1), 'stroke-linecap': 'round',
            opacity: (0.055 * tone).toFixed(3),
            transform: `translate(0,${(-w * 0.55).toFixed(1)})`
        }));
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: GRIME_SHADOW,
            'stroke-width': (w * 0.8).toFixed(1), 'stroke-linecap': 'round',
            opacity: (0.075 * tone).toFixed(3),
            transform: `translate(0,${(w * 0.6).toFixed(1)})`
        }));
    }
    return group;
}

// ---------- СЛОЙ НЕОДНОРОДНОСТИ ТОНА КОЖИ ----------
// "У каждой особи/сегмента — вариация тона, а не одна плоская заливка":
// 2-4 крупных мягких пятна (светлее/темнее) поверх базовой заливки.
function buildSkinToneLayer(ctx, partName, halfLen, halfThick) {
    const skin = ctx.anatomy.skin || {};
    const amount = skin.toneVariation != null ? skin.toneVariation : 0.55;
    if (amount <= 0.01) return null;
    const rng = anatRng(ctx.anatomy, partName, 'tone');
    const group = svgEl('g', { class: 'worm-skin-tone' });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
        const dark = rng() < 0.55;
        const color = dark ? GRIME_SHADOW : GRIME_HIGHLIGHT;
        const gid = `worm-tone-${ctx.instanceId}-${dark ? 'd' : 'l'}`;
        const fill = ensureSoftGradient(ctx, gid, color, 1);
        const rx = halfLen * (0.28 + rng() * 0.3);
        const ry = halfThick * (0.3 + rng() * 0.32);
        const cx = (rng() * 2 - 1) * halfLen * 0.5;
        const cy = (rng() * 2 - 1) * halfThick * 0.45;
        // Тёмные пятна работают лучше светлых: светлое пятно на розовой коже
        // быстро начинает читаться как запотевшее стекло, тёмное — как
        // неровный пигмент. Поэтому у светлых заметно меньший вес.
        group.appendChild(svgEl('ellipse', {
            cx: cx.toFixed(1), cy: cy.toFixed(1), rx: rx.toFixed(1), ry: ry.toFixed(1),
            fill, opacity: ((dark ? 0.34 : 0.14) * amount).toFixed(3)
        }));
    }
    return group;
}

// ---------- СЛОЙ ПОКРЫТИЯ КОЖИ ----------
// Кольцевые бороздки (червь), складки (свинья), поясок-клителлум, щетина,
// матовые участки и ЧЁТКИЙ блик слизи. Разные части тела получают разный
// набор — не одинаковый шаблон на всё тело.
//
// features:
//   rings — кольцевая сегментация; folds — свиные складки;
//   bristle — щетина; clitellum — поясок; vessel — спинной сосуд.
function buildCoatLayer(ctx, partName, halfLen, halfThick, features) {
    const coat = ctx.anatomy.coat || {};
    const rng = anatRng(ctx.anatomy, partName, 'coat');
    const group = svgEl('g', { class: 'worm-coat-layer' });
    let empty = true;

    // --- кольцевые бороздки: у дождевого червя тело разбито на кольца,
    // и это самая узнаваемая его черта. Рисуются дугами ПОПЕРЁК тела.
    // Важно: бороздка — это ВМЯТИНА, а не нарисованная линия. Поэтому она
    // (а) не пересекает сегмент насквозь — обрывается, не доходя до контура,
    // (б) заметно изогнута по кривизне тела, (в) сопровождается светлым
    // ребром с одной стороны. Прямая линия через весь сегмент читается как
    // полоска краски на банке — ровно это и было первой ошибкой.
    const rings = features.rings === false ? 0 : (coat.rings != null ? coat.rings : 0.5);
    if (rings > 0.01) {
        const count = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < count; i++) {
            const t = (i + 1) / (count + 1);
            const x = (t * 2 - 1) * halfLen * 0.66 + (rng() - 0.5) * halfLen * 0.1;
            const h = halfThick * (0.5 + rng() * 0.14);
            const curve = halfLen * 0.22 * (x > 0 ? 1 : -1);
            const d = `M ${x.toFixed(1)},${(-h).toFixed(1)} Q ${(x + curve).toFixed(1)},0 ${x.toFixed(1)},${h.toFixed(1)}`;
            group.appendChild(svgEl('path', {
                d, fill: 'none', stroke: GRIME_SHADOW, 'stroke-width': 1.2,
                opacity: (0.16 * rings).toFixed(3), 'stroke-linecap': 'round'
            }));
            group.appendChild(svgEl('path', {
                d, fill: 'none', stroke: GRIME_HIGHLIGHT, 'stroke-width': 0.8,
                opacity: (0.1 * rings).toFixed(3), 'stroke-linecap': 'round',
                transform: 'translate(1.8,0)'
            }));
            empty = false;
        }
    }

    // --- поясок (клителлум): у зрелого червя 14-16 сегменты охвачены
    // гладким утолщённым "ошейником". Здесь он живёт на сегменте-2 и
    // заодно визуально сшивает свиную голову с червячным телом.
    if (features.clitellum && (coat.clitellum || 0) > 0.01) {
        const strength = coat.clitellum;
        const w = halfLen * 0.5;
        group.appendChild(svgEl('ellipse', {
            cx: 0, cy: 0, rx: w.toFixed(1), ry: (halfThick * 0.99).toFixed(1),
            fill: GRIME_HIGHLIGHT, opacity: (0.14 * strength).toFixed(3)
        }));
        [-w, w].forEach(edge => {
            group.appendChild(svgEl('path', {
                d: `M ${edge.toFixed(1)},${(-halfThick * 0.92).toFixed(1)} Q ${(edge * 1.12).toFixed(1)},0 ${edge.toFixed(1)},${(halfThick * 0.92).toFixed(1)}`,
                fill: 'none', stroke: GRIME_SHADOW, 'stroke-width': 1.4,
                opacity: (0.3 * strength).toFixed(3), 'stroke-linecap': 'round'
            }));
        });
        empty = false;
    }

    // --- свиные складки: короткие мягкие дуги у "плеча" (там, где кожа
    // собирается при движении). Длинные штрихи через всю часть читались на
    // морде как царапины или усы — поэтому длина ограничена третью
    // поперечника, а сами складки прижаты к краю силуэта.
    if (features.folds && (coat.folds || 0) > 0.01) {
        const strength = coat.folds;
        const count = 2;
        for (let i = 0; i < count; i++) {
            const x = -halfLen * (0.42 + i * 0.18) - rng() * halfLen * 0.05;
            const y0 = -halfThick * (0.05 + rng() * 0.16);
            const len = halfThick * (0.24 + rng() * 0.12);
            const d = `M ${x.toFixed(1)},${y0.toFixed(1)} q ${(halfLen * 0.08).toFixed(1)},${(len * 0.5).toFixed(1)} ${(-halfLen * 0.02).toFixed(1)},${len.toFixed(1)}`;
            group.appendChild(svgEl('path', {
                d, fill: 'none', stroke: GRIME_SHADOW, 'stroke-width': 1.3,
                opacity: (0.16 * strength).toFixed(3), 'stroke-linecap': 'round'
            }));
            group.appendChild(svgEl('path', {
                d, fill: 'none', stroke: GRIME_HIGHLIGHT, 'stroke-width': 0.9,
                opacity: (0.1 * strength).toFixed(3), 'stroke-linecap': 'round',
                transform: 'translate(-1.2,0)'
            }));
            empty = false;
        }
    }

    // --- щетина: короткие редкие волоски ВДОЛЬ ВЕРХНЕГО КРАЯ силуэта.
    // Раньше они сеялись по всей площади части и на морде читались как
    // царапины/усы. Настоящая свиная щетина заметна именно на просвет по
    // контуру — поэтому каждый волосок ставится на дугу у края (радиус
    // 0.72..0.94 от габарита) и растёт наружу, коротким штрихом.
    if (features.bristle && (coat.bristle || 0) > 0.01) {
        const strength = coat.bristle;
        const count = 5 + Math.floor(rng() * 4);
        for (let i = 0; i < count; i++) {
            // Угол только по верхней половине: 200°..340°.
            const ang = (200 + (i / count) * 140 + rng() * 12) * Math.PI / 180;
            const rr = 0.72 + rng() * 0.2;
            const bx = Math.cos(ang) * halfLen * rr;
            const by = Math.sin(ang) * halfThick * rr;
            const len = 1.6 + rng() * 1.8;
            group.appendChild(svgEl('path', {
                d: `M ${bx.toFixed(1)},${by.toFixed(1)} l ${(Math.cos(ang) * len).toFixed(1)},${(Math.sin(ang) * len * 1.2).toFixed(1)}`,
                stroke: GRIME_SHADOW, 'stroke-width': 0.55, fill: 'none',
                opacity: (0.32 * strength).toFixed(3), 'stroke-linecap': 'round'
            }));
            empty = false;
        }
    }

    // --- спинной сосуд: тёмная линия, идущая под кожей вдоль всей спины.
    // У настоящего дождевого червя это самая заметная просвечивающая
    // структура — и заодно бесплатный способ связать сегменты в одно тело.
    if (features.vessel && (coat.dorsalVessel || 0) > 0.01) {
        const palette = (ctx.anatomy.organs && ctx.anatomy.organs.palette) || {};
        const strength = coat.dorsalVessel;
        const y = -halfThick * 0.55;
        group.appendChild(svgEl('path', {
            d: `M ${(-halfLen * 0.9).toFixed(1)},${y.toFixed(1)} Q 0,${(y - halfThick * 0.12).toFixed(1)} ${(halfLen * 0.9).toFixed(1)},${y.toFixed(1)}`,
            fill: 'none', stroke: palette.vessel || '#4a131e', 'stroke-width': 1.8,
            opacity: (0.5 * strength).toFixed(3), 'stroke-linecap': 'round'
        }));
        empty = false;
    }

    return empty ? null : group;
}

// ---------- ПОВЕРХНОСТЬ: БЛЕСК СЛИЗИ И МАТОВЫЕ УЧАСТКИ ----------
// Отдельный слой от buildCoatLayer, и вот почему: складки, кольца и щетина —
// свойства САМОЙ ТКАНИ, они живут в системе координат тела (вдоль/поперёк
// сегмента). А блеск — это отражение внешнего света, он должен быть с одной
// и той же стороны у ВСЕХ частей тела, как бы они ни были повёрнуты. Пока
// блеск считался вместе с остальным покрытием, у вертикально стоящих
// сегментов он уезжал вбок и читался как полоска краски на банке.
//
// Форма блика — узкий серп с ЧЁТКИМИ краями, изогнутый по кривизне части
// (референс: в 2D слизь и мокрая кожа рисуются жёсткой кистью поверх
// матовой основы; размытое пятно вместо блика — самая частая ошибка,
// именно она и провалила первую попытку с blur).
function buildSurfaceLayer(ctx, partName, rx, ry, features) {
    const coat = ctx.anatomy.coat || {};
    const group = svgEl('g', { class: 'worm-surface-layer' });
    let empty = true;

    // Контактная тень: часть, стоящая непосредственно под другой (шея под
    // головой), должна получать от неё тень — иначе на светлой коже шеи
    // граница головы растворяется и голова кажется парящей.
    if (features && features.contactTop) {
        const gid = `worm-contact-${ctx.instanceId}`;
        group.appendChild(svgEl('ellipse', {
            cx: 0, cy: (-ry * 0.72).toFixed(1),
            rx: (rx * 0.92).toFixed(1), ry: (ry * 0.5).toFixed(1),
            fill: ensureSoftGradient(ctx, gid, GRIME_SHADOW, 1),
            opacity: (0.3 * (features.contactStrength || 1)).toFixed(3)
        }));
        empty = false;
    }

    const matte = coat.matte != null ? coat.matte : 0.35;
    if (matte > 0.01) {
        const gid = `worm-matte-${ctx.instanceId}`;
        const fill = ensureSoftGradient(ctx, gid, GRIME_SHADOW, 1);
        group.appendChild(svgEl('ellipse', {
            cx: (rx * 0.3).toFixed(1), cy: (ry * 0.42).toFixed(1),
            rx: (rx * 0.46).toFixed(1), ry: (ry * 0.42).toFixed(1),
            fill, opacity: (0.26 * matte).toFixed(3)
        }));
        empty = false;
    }

    const gloss = coat.slimeGloss != null ? coat.slimeGloss : 0.55;
    if (gloss > 0.01) {
        // Серп: внешняя дуга по верхне-левой части силуэта, внутренняя —
        // чуть ниже, из-за чего фигура сходится в тонкие острые концы.
        const R = 0.62;                 // на каком удалении от центра лежит блик
        const a0 = Math.PI * 1.12, a1 = Math.PI * 1.62; // сектор верх-лево
        const p = (ang, k) => `${(Math.cos(ang) * rx * R * k).toFixed(1)},${(Math.sin(ang) * ry * R * k).toFixed(1)}`;
        const mid = (a0 + a1) / 2;
        const d = `M ${p(a0, 1)} Q ${p(mid, 1.13)} ${p(a1, 1)} Q ${p(mid, 0.9)} ${p(a0, 1)} Z`;
        group.appendChild(svgEl('path', { d, fill: '#ffffff', opacity: (0.34 * gloss).toFixed(3) }));
        // Вторая, совсем маленькая капля слизи — сбоку, чтобы блеск не
        // выглядел одним симметричным штампом на каждом сегменте.
        group.appendChild(svgEl('ellipse', {
            cx: (rx * 0.34).toFixed(1), cy: (-ry * 0.34).toFixed(1),
            rx: (rx * 0.09).toFixed(1), ry: (ry * 0.07).toFixed(1),
            fill: '#ffffff', opacity: (0.24 * gloss).toFixed(3)
        }));
        empty = false;
    }

    return empty ? null : group;
}

// ---------- СБОРКА ВСЕЙ СТОПКИ СЛОЁВ ДЛЯ ОДНОЙ ЧАСТИ ТЕЛА ----------
// Возвращает { group, organs, muscleGroup } либо null, если анатомия
// выключена. group — ОДИН узел, который вызывающий код кладёт в нужное
// место своей части; всё, что внутри, обрезано по силуэту этой части.
//
// axis:  'x' — тело части вытянуто вдоль экранного X (напольная цепь,
//              живот, хвост);
//        'y' — часть стоит "столбиком" (сегменты между головой и животом):
//              слои строятся в той же локальной системе (вдоль → +X) и
//              разворачиваются поворотом на 90°, чтобы продольные структуры
//              шли вдоль тела, а не поперёк него.
function buildAnatomyStack(ctx, partName, opts) {
    const anatomy = ctx.anatomy;
    if (!anatomy.enabled) return null;

    const rx = opts.rx, ry = opts.ry;
    const axis = opts.axis || 'x';
    const halfLen = axis === 'x' ? rx : ry;
    const halfThick = axis === 'x' ? ry : rx;

    // Клип по силуэту части — гарантия, что ни один слой не вылезет на
    // соседний сегмент, какие бы параметры ни выставили.
    const clipId = `worm-anat-clip-${ctx.instanceId}-${partName}`;
    const clip = svgEl('clipPath', { id: clipId });
    if (opts.clipPathData) {
        clip.appendChild(svgEl('path', { d: opts.clipPathData }));
    } else {
        clip.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2) }));
    }
    ctx.defs.appendChild(clip);

    // Внешняя группа — её масштабирует tick() (дыхание/раздутие живота).
    // Внутренняя — держит клип, ещё внутри — разворот вдоль оси тела.
    const outer = svgEl('g', { class: 'worm-anatomy', 'data-anat': partName });
    const clipped = svgEl('g', { 'clip-path': `url(#${clipId})` });
    const axisGroup = svgEl('g', axis === 'y' ? { transform: 'rotate(90)' } : null);
    clipped.appendChild(axisGroup);
    outer.appendChild(clipped);

    const layers = {};
    layers.tone = buildSkinToneLayer(ctx, partName, halfLen, halfThick);

    if ((anatomy.skin && (anatomy.skin.dorsalDarkening || anatomy.skin.ventralLightening))) {
        const dv = svgEl('ellipse', {
            cx: 0, cy: 0, rx: halfLen.toFixed(2), ry: halfThick.toFixed(2),
            fill: ensureDorsoVentralGradient(ctx)
        });
        layers.dorsoventral = dv;
    }

    layers.muscle = buildMuscleLayer(ctx, partName, halfLen, halfThick, opts.muscle);

    // Органы: собственная группа с непрозрачностью = общая видимость ×
    // локальная тонкость кожи в этой зоне. Именно здесь "разная степень
    // просвечивания в разных местах" — не в blur и не в blend-mode.
    const organs = [];
    const zone = opts.organZone;
    if (zone && anatomy.organs && (anatomy.organs.visibility || 0) > 0.01) {
        const thin = anatThinness(anatomy, partName);
        const alpha = clamp01(anatomy.organs.visibility * thin);
        if (alpha > 0.02) {
            const rng = anatRng(anatomy, partName, 'organs');
            const plan = organPlanForZone(zone, rng, anatomy.organs.density);
            const organGroup = svgEl('g', { class: 'worm-organ-layer', opacity: alpha.toFixed(3) });
            plan.forEach((p, i) => {
                const built = buildOrganNode(ctx, p, halfLen, halfThick, `${partName}-${i}`);
                organGroup.appendChild(built.group);
                organs.push(built);
            });
            layers.organs = organGroup;
        }
    }

    layers.coat = buildCoatLayer(ctx, partName, halfLen, halfThick, opts.coat || {});

    // Порядок слоёв — ЯВНЫЙ (ANAT_LAYER_ORDER), а не "как получилось".
    ANAT_LAYER_ORDER.forEach(name => {
        if (layers[name]) axisGroup.appendChild(layers[name]);
    });

    // Блеск/матовость — последними и УЖЕ ВНЕ поворота оси тела: свет падает
    // на персонажа снаружи, он не поворачивается вместе с сегментом.
    const surface = buildSurfaceLayer(ctx, partName, rx, ry, opts.surface || {});
    if (surface) clipped.appendChild(surface);

    return { group: outer, organs, muscleGroup: layers.muscle || null };
}

// ---------- ЛОКАЛЬНЫЕ ФОРМЫ (до позиционирования) ----------
function earPathData(mirror) {
    // mirror: 1 = правое ухо, -1 = левое. Точка (0,0) — место крепления к
    // голове. Свиное ухо — крупная широкая лопасть с мясистым основанием и
    // ШИРОКО ЗАКРУГЛЁННОЙ (не острой!) вершиной: там, где раньше вершина
    // сходилась в почти собачью точку, теперь верхний край — пологая дуга
    // между двумя контрольными точками, разнесёнными по ширине. Именно
    // острый, узкий, "вздёрнутый назад" силуэт читался как собачье ухо.
    const s = mirror;
    return `M ${(-s * 7).toFixed(1)},8 ` +
        `C ${(-s * 11).toFixed(1)},-2 ${(-s * 8).toFixed(1)},-16 ${(-s * 1).toFixed(1)},-23 ` +
        `C ${(s * 6).toFixed(1)},-29 ${(s * 17).toFixed(1)},-29 ${(s * 22).toFixed(1)},-21 ` +
        `C ${(s * 26).toFixed(1)},-14 ${(s * 24).toFixed(1)},-4 ${(s * 19).toFixed(1)},4 ` +
        `C ${(s * 15).toFixed(1)},11 ${(s * 3).toFixed(1)},13 ${(-s * 7).toFixed(1)},8 Z`;
}

// Раковина — углублённая часть уха: повторяет внешний контур с отступом
// внутрь, за счёт чего у уха появляется толщина, а не плоская заливка.
function earInnerPathData(mirror) {
    const s = mirror;
    return `M ${(-s * 2).toFixed(1)},4 ` +
        `C ${(-s * 5).toFixed(1)},-4 ${(-s * 3).toFixed(1)},-14 ${(s * 2).toFixed(1)},-20 ` +
        `C ${(s * 7).toFixed(1)},-25 ${(s * 14).toFixed(1)},-25 ${(s * 17).toFixed(1)},-19 ` +
        `C ${(s * 19).toFixed(1)},-13 ${(s * 17).toFixed(1)},-6 ${(s * 13).toFixed(1)},1 ` +
        `C ${(s * 10).toFixed(1)},6 ${(s * 2).toFixed(1)},7 ${(-s * 2).toFixed(1)},4 Z`;
}

// Сосудики внутри уха: у свиньи ухо — самая тонкая кожа на всём теле, оно
// реально просвечивает на свет. Дешёвая деталь (3-4 тонких пути), которая
// сразу сообщает "это живая ткань, а не розовый треугольник".
function buildEarVessels(ctx, mirror, side) {
    const anatomy = ctx.anatomy;
    if (!anatomy.enabled) return null;
    const palette = (anatomy.organs && anatomy.organs.palette) || {};
    const vis = clamp01((anatomy.organs && anatomy.organs.visibility != null ? anatomy.organs.visibility : 0.55));
    if (vis <= 0.02) return null;
    const rng = anatRng(anatomy, `ear-${side}`, 'vessel');
    const group = svgEl('g', { class: 'worm-ear-vessels', opacity: (0.5 * vis + 0.15).toFixed(3) });
    const s = mirror;
    const branches = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < branches; i++) {
        const t = (i + 1) / (branches + 1);
        const ex = s * (5 + t * 8 + rng() * 2);
        const ey = -6 - t * 14 - rng() * 3;
        group.appendChild(svgEl('path', {
            d: `M ${(s * 2).toFixed(1)},-2 Q ${(ex * 0.55).toFixed(1)},${(ey * 0.5).toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`,
            fill: 'none', stroke: palette.vessel || '#4a131e',
            'stroke-width': (0.9 - i * 0.15).toFixed(2), opacity: 0.55, 'stroke-linecap': 'round'
        }));
    }
    return group;
}

// Пара тонких "лопнувших сосудиков" на белке глаза — усталый/нездоровый вид
// без ресничек и без румян.
function buildEyeVeins(seedKey, rx, ry) {
    const rng = mulberry32(hashStringSeed(seedKey));
    const group = svgEl('g', { class: 'worm-eye-veins' });
    const veinCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < veinCount; i++) {
        const angle = rng() * Math.PI * 2;
        const startR = rx * (0.55 + rng() * 0.2);
        const ratio = ry / rx;
        const sx = Math.cos(angle) * startR;
        const sy = Math.sin(angle) * startR * ratio;
        const midAngle = angle + (rng() * 0.6 - 0.3);
        const midR = startR * 0.55;
        const mx = Math.cos(midAngle) * midR;
        const my = Math.sin(midAngle) * midR * ratio;
        const vein = svgEl('path', {
            d: `M ${sx.toFixed(1)},${sy.toFixed(1)} Q ${mx.toFixed(1)},${my.toFixed(1)} 0,0`,
            fill: 'none', stroke: '#b23a3a', 'stroke-width': 0.7, opacity: 0.4, 'stroke-linecap': 'round'
        });
        group.appendChild(vein);
    }
    return group;
}

// ---------- ПОСТРОЕНИЕ ОДНОГО СЕГМЕНТА ТЕЛА (не хвост, не голова) ----------
// ctx несёт общий контекст инстанса (defs, кэш градиентов, анатомию) — см.
// buildWormSVGGroup.
function buildSegmentNode(partName, seg, ctx, opts) {
    opts = opts || {};
    const group = svgEl('g', { 'data-part': partName });

    // ---------- СЛОЙ 0: СКЕЛЕТ ----------
    // Скелет буквально не рисуется, но задаёт форму: индивидуальная
    // вариация пропорций конкретного сегмента ("где тело толще, где
    // тоньше"). Держится маленькой — цепочка рассчитана на перекрытие
    // соседей, сильный разброс открыл бы зазоры между звеньями.
    let skelX = 1, skelY = 1;
    const skeleton = ctx.anatomy.enabled ? (ctx.anatomy.skeleton || {}) : null;
    if (skeleton && (skeleton.variation || 0) > 0.001) {
        const rng = anatRng(ctx.anatomy, partName, 'skeleton');
        skelX = 1 + (rng() * 2 - 1) * skeleton.variation;
        skelY = 1 + (rng() * 2 - 1) * skeleton.variation;
    }

    const baseRx = seg.radius * seg.stretchX * seg.scale * skelX;
    const baseRy = seg.radius * seg.stretchY * seg.scale * skelY;

    // Цвет сегмента может быть подмешан к цвету головы (переход червь →
    // свиная голова, см. skin.neckBlend) — сам цвет в модели при этом не
    // меняется, подмешивание делает только рендерер.
    const fillColor = opts.blendFill || seg.fill;

    const gradId = `worm-seg-grad-${ctx.instanceId}-${partName}`;
    const fillUrl = ensureVolumeGradient(ctx.defs, gradId, fillColor, {
        cx: '38%', cy: '30%', r: '80%',
        highlight: 0.22, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.32, shadowTint: GRIME_SHADOW
    });

    // ВАЖНО: у сегмента больше нет собственной обводки. Контур тела теперь
    // единый (см. createHullLayers) — иначе на каждом стыке виден шов, и тело
    // читается стопкой отдельных шаров, а не одним существом.
    const ellipse = svgEl('ellipse', {
        cx: 0, cy: 0,
        rx: baseRx.toFixed(2),
        ry: baseRy.toFixed(2),
        fill: fillUrl,
        stroke: 'none'
    });
    group.appendChild(ellipse);

    // Глянцевый блик — небольшой полупрозрачный эллипс в верхне-левой части
    // сегмента, поверх градиента усиливает объём.
    const shine = svgEl('ellipse', {
        cx: (-baseRx * 0.25).toFixed(2), cy: (-baseRy * 0.4).toFixed(2),
        rx: (baseRx * 0.38).toFixed(2), ry: (baseRy * 0.22).toFixed(2),
        fill: '#ffffff', opacity: 0.16
    });
    group.appendChild(shine);

    // ---------- СЛОИ 1..5: АНАТОМИЯ ----------
    const anat = buildAnatomyStack(ctx, partName, {
        rx: baseRx, ry: baseRy,
        axis: opts.axis || 'x',
        organZone: opts.organZone,
        muscle: opts.muscle,
        coat: opts.coat || {},
        surface: opts.surface || {}
    });
    if (anat) group.appendChild(anat.group);

    // Якорь под шрамы/эффекты этого сегмента — шрамы монтируются сюда же,
    // как дочерние элементы group, и наследуют её transform.
    const scarLayer = svgEl('g', { 'data-anchor': `${partName}-scars`, class: 'worm-scar-layer' });
    group.appendChild(scarLayer);
    // baseRx/baseRy сохраняются отдельно, чтобы мини-игры могли "живо"
    // (без пересборки SVG) масштабировать конкретный сегмент — например,
    // раздувание живота в Чревоугодии через handle.setLivePose({ bellyScale }).
    return { group, ellipse, shine, scarLayer, baseRx, baseRy, anat, fillColor };
}

// ---------- ПОСТРОЕНИЕ ХВОСТА (отдельная сущность, каплевидная форма) ----------
// attachRadius — реальный отрисованный радиус ПОСЛЕДНЕГО growing-сегмента
// (предхвостового): основание хвоста считается ДОЛЕЙ от него, а не
// собственным независимым числом — тогда сужение цепочки продолжается
// естественно и на хвост тоже.
function buildTailNode(tail, ctx, attachRadius) {
    const group = svgEl('g', { 'data-part': 'tail' });
    const L = 34 * tail.length; // общая длина хвоста, от основания до кончика
    const Rbase = (attachRadius || 15) * WORM_TAIL_BASE_RATIO * tail.thickness;
    // Кончик — маленький ЗАКРУГЛЁННЫЙ овал, а не точка: у него есть
    // собственный небольшой радиус, форма читается как капля/яйцо, не шип.
    const Rtip = Rbase * WORM_TAIL_TIP_RATIO;
    const tipCx = -(L - Rtip);
    const d = `M 0,${(-Rbase).toFixed(1)} ` +
              `A ${Rbase.toFixed(1)},${Rbase.toFixed(1)} 0 0 1 0,${Rbase.toFixed(1)} ` +
              `Q ${(tipCx * 0.55).toFixed(1)},${(Rbase * 0.9).toFixed(1)} ${tipCx.toFixed(1)},${Rtip.toFixed(1)} ` +
              `A ${Rtip.toFixed(1)},${Rtip.toFixed(1)} 0 0 1 ${tipCx.toFixed(1)},${(-Rtip).toFixed(1)} ` +
              `Q ${(tipCx * 0.55).toFixed(1)},${(-Rbase * 0.9).toFixed(1)} 0,${(-Rbase).toFixed(1)} Z`;

    const gradId = `worm-tail-grad-${ctx.instanceId}`;
    const fillUrl = ensureVolumeGradient(ctx.defs, gradId, tail.fill, {
        cx: '62%', cy: '35%', r: '85%',
        highlight: 0.2, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.32, shadowTint: GRIME_SHADOW
    });
    const path = svgEl('path', { d, fill: fillUrl, stroke: tail.stroke, 'stroke-width': 2 });

    // Внутренняя группа для "живого" изгиба хвоста — вращается вокруг точки
    // крепления (0,0), не требует пересборки SVG, обновляется напрямую через
    // handle.setLivePose({ tailBendAngle }).
    const bendGroup = svgEl('g', { 'data-part': 'tail-bend' });
    bendGroup.appendChild(path);

    // Анатомия хвоста обрезается по ЕГО СОБСТВЕННОЙ форме (тот же путь), а
    // не по эллипсу — иначе слои торчали бы за пределы каплевидного силуэта.
    // Центр анатомии смещён к середине хвоста, длина — половина хвоста.
    const anat = buildAnatomyStack(ctx, 'tail', {
        rx: L * 0.5, ry: Rbase * 0.92,
        axis: 'x',
        organZone: 'tail',
        clipPathData: d,
        coat: { rings: true }
    });
    if (anat) {
        anat.group.setAttribute('transform', `translate(${(-L * 0.5).toFixed(1)},0)`);
        bendGroup.appendChild(anat.group);
    }

    group.appendChild(bendGroup);
    const scarLayer = svgEl('g', { 'data-anchor': 'tail-scars', class: 'worm-scar-layer' });
    group.appendChild(scarLayer);
    return { group, path, bendGroup, scarLayer, baseRadius: Rbase, anat };
}

// ---------- ПОСТРОЕНИЕ ОДНОГО ГЛАЗА (склера, радужка, зрачок, веко-шторка) ----------
function buildEyeNode(eye, mirror, instanceId, eyeKey, defs) {
    const x = eye.offsetX * mirror;
    const y = eye.offsetY;
    const group = svgEl('g', {
        'data-part': `eye-${eyeKey}`,
        transform: `translate(${x},${y})`,
        visibility: eye.visible ? 'visible' : 'hidden'
    });

    const rx = 8 * eye.stretchX * eye.scale;
    const ry = 8 * eye.stretchY * eye.scale;

    // Глазница — тень вокруг глаза, "усаживает" его в морду и вместе с
    // веком-шторкой ниже создаёт усталый, нездоровый взгляд.
    const socket = svgEl('ellipse', {
        cx: 0, cy: (-ry * 0.1).toFixed(2),
        rx: (rx * 1.45).toFixed(2), ry: (ry * 1.4).toFixed(2),
        fill: withAlpha('#000000', 0.13)
    });
    // Тень от нависающего верхнего века: без неё глаз выглядит наклеенным
    // кружком, а не сидящим в глазнице.
    const browShadow = svgEl('ellipse', {
        cx: 0, cy: (-ry * 0.72).toFixed(2),
        rx: (rx * 1.2).toFixed(2), ry: (ry * 0.6).toFixed(2),
        fill: withAlpha('#4a2018', 0.22)
    });

    const scleraGradId = `worm-eye-sclera-${instanceId}-${eyeKey}`;
    const scleraFill = ensureVolumeGradient(defs, scleraGradId, '#eae2d6', { cx: '40%', cy: '35%', r: '75%', highlight: 0.05, shadow: -0.1 });
    const sclera = svgEl('ellipse', {
        cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2),
        fill: scleraFill, stroke: withAlpha('#000000', 0.2), 'stroke-width': 0.6
    });

    // Лопнувшие сосудики вместо ресничек/румян — не милота, а нездоровый вид.
    const veins = buildEyeVeins(`${instanceId}-${eyeKey}`, rx, ry);

    const irisR = rx * 0.6;
    const irisGradId = `worm-eye-iris-${instanceId}-${eyeKey}`;
    const irisFill = ensureVolumeGradient(defs, irisGradId, eye.color, { cx: '40%', cy: '35%', r: '80%', highlight: 0.4, shadow: -0.35 });
    const iris = svgEl('circle', { cx: 0, cy: 0, r: irisR.toFixed(2), fill: irisFill });
    // Лимб — тёмное кольцо по краю радужки. Дешёвая деталь, но именно она
    // отличает живой глаз от плоского кружка: без неё радужка сливается со
    // склерой и взгляд выглядит нарисованным.
    const limbus = svgEl('circle', {
        cx: 0, cy: 0, r: (irisR * 0.94).toFixed(2), fill: 'none',
        stroke: mixColor(eye.color, '#000000', 0.55), 'stroke-width': (irisR * 0.22).toFixed(2), opacity: 0.55
    });
    const pupil = svgEl('circle', { cx: 0, cy: 0, r: (irisR * 0.62).toFixed(2), fill: '#0e0405' });

    // Один скромный блик (не два "искрящихся", как у милого зверька).
    const highlight = svgEl('ellipse', {
        cx: (-irisR * 0.3).toFixed(2), cy: (-irisR * 0.32).toFixed(2),
        rx: (irisR * 0.22).toFixed(2), ry: (irisR * 0.16).toFixed(2),
        fill: '#ffffff', opacity: 0.5
    });

    // Бровь — короткая и почти плоская складка над глазом, а не выгнутая
    // "домиком" дуга: у свиньи нет мимической брови, есть лишь едва
    // заметный кожный валик. Раньше толстая тёмная дуга с сильным изгибом
    // читалась как насупленная собачья бровь ("грустный пёс") — сила
    // изгиба, толщина и контраст цвета уменьшены, длина укорочена, и
    // бровь придвинута ближе к глазу.
    const browGroup = svgEl('g', {
        'data-part': `brow-${eyeKey}`,
        transform: `translate(0,${(-ry - 4.5).toFixed(2)}) rotate(${eye.brow.angle * mirror})`,
        visibility: eye.brow.visible ? 'visible' : 'hidden'
    });
    const browShape = svgEl('path', {
        d: `M ${(-rx * 0.85).toFixed(2)},1 Q 0,${(-rx * 0.22).toFixed(2)} ${(rx * 0.85).toFixed(2)},1`,
        fill: 'none', stroke: withAlpha('#4a2018', 0.55), 'stroke-width': 2, 'stroke-linecap': 'round'
    });
    browGroup.appendChild(browShape);

    // ---------- ВЕКО КАК ШТОРКА, ЖИВУЩАЯ ВНУТРИ ГЛАЗА ----------
    // Веко — не отдельный "нарост" сверху, а пластина, которая ЕДЕТ
    // (translate по Y) поперёк глаза. Видна только та её часть, что попадает
    // в clipPath по форме глаза.
    const clipId = `worm-eye-clip-${instanceId}-${eyeKey}`;

    const lidHeight = ry * 2 + 6;
    const lidGradId = `worm-eyelid-grad-${instanceId}-${eyeKey}`;
    const lidFill = ensureVolumeGradient(defs, lidGradId, '#c98a7f', {
        cx: '50%', cy: '0%', r: '100%',
        highlight: 0.08, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.2, shadowTint: GRIME_SHADOW
    });
    const lidClipGroup = svgEl('g', { 'clip-path': `url(#${clipId})` });
    // lidTrack — единственный узел, который двигаем каждый кадр (translate);
    // сама пластина (lid) и складка (lidCrease) — его неподвижные дети.
    // Стартовое положение шторки задаётся СРАЗУ из модели: раньше оно
    // выставлялось только в tick() и только при opts.blink — на экранах с
    // выключенным морганием персонаж оставался с закрытыми глазами.
    const lidRest = clamp01(eye.eyelid ? eye.eyelid.level : 0);
    const lidTravel = 2 * ry + 5;
    const lidTrack = svgEl('g', {
        'data-part': `eyelid-${eyeKey}`,
        transform: `translate(0,${(-lidTravel * (1 - lidRest)).toFixed(2)})`
    });
    const lid = svgEl('rect', {
        x: (-rx - 3).toFixed(2), y: (-lidHeight / 2).toFixed(2),
        width: (rx * 2 + 6).toFixed(2), height: lidHeight.toFixed(2),
        fill: lidFill
    });
    const lidCrease = svgEl('line', {
        x1: (-rx).toFixed(2), y1: (lidHeight / 2).toFixed(2), x2: rx.toFixed(2), y2: (lidHeight / 2).toFixed(2),
        stroke: withAlpha('#3a1218', 0.5), 'stroke-width': 1
    });
    lidTrack.appendChild(lid);
    lidTrack.appendChild(lidCrease);
    lidClipGroup.appendChild(lidTrack);

    // Короткие редкие ресницы по верхнему веку — свиные, не кукольные.
    const lashes = svgEl('g', { class: 'worm-eye-lashes' });
    for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const lx = (-0.85 + t * 1.7) * rx;
        const ly = -Math.sqrt(Math.max(0, 1 - (lx / rx) * (lx / rx))) * ry;
        lashes.appendChild(svgEl('path', {
            d: `M ${lx.toFixed(1)},${ly.toFixed(1)} l ${(lx * 0.12).toFixed(1)},${(-1.8 - i % 2).toFixed(1)}`,
            stroke: '#3a1c12', 'stroke-width': 0.8, fill: 'none', opacity: 0.5, 'stroke-linecap': 'round'
        }));
    }

    // Складка верхнего века и морщинки у внешнего уголка — то, что делает
    // глаз посаженным в живую морду, а не приклеенным поверх неё.
    const eyeFolds = svgEl('g', { class: 'worm-eye-folds' });
    eyeFolds.appendChild(svgEl('path', {
        d: `M ${(-rx * 1.15).toFixed(1)},${(-ry * 0.85).toFixed(1)} ` +
           `Q 0,${(-ry * 1.7).toFixed(1)} ${(rx * 1.15).toFixed(1)},${(-ry * 0.85).toFixed(1)}`,
        fill: 'none', stroke: withAlpha('#5a2430', 0.4), 'stroke-width': 1.4, 'stroke-linecap': 'round'
    }));
    for (let i = 0; i < 2; i++) {
        const sx = mirror * rx * (1.15 + i * 0.16);
        eyeFolds.appendChild(svgEl('path', {
            d: `M ${sx.toFixed(1)},${(ry * (0.1 + i * 0.28)).toFixed(1)} l ${(mirror * 3.2).toFixed(1)},${(1.6 + i * 1.4).toFixed(1)}`,
            fill: 'none', stroke: withAlpha('#5a2430', 0.3), 'stroke-width': 0.9, 'stroke-linecap': 'round'
        }));
    }

    // Радужка, лимб, зрачок и блик — в одной группе: взгляд двигается
    // переносом ЭТОЙ группы, а не четырёх элементов по отдельности (и не
    // ценой пересборки SVG).
    // Клип по форме глаза заводим ДО первого использования: по нему
    // обрезаются и веко-шторка, и тень от верхнего века.
    const clipPath = svgEl('clipPath', { id: clipId });
    clipPath.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2) }));
    group.appendChild(clipPath);

    const gazeGroup = svgEl('g', { 'data-part': `gaze-${eyeKey}` });
    gazeGroup.appendChild(iris);
    gazeGroup.appendChild(limbus);
    gazeGroup.appendChild(pupil);
    gazeGroup.appendChild(highlight);

    group.appendChild(socket);
    group.appendChild(browShadow);
    group.appendChild(sclera);
    group.appendChild(veins);
    group.appendChild(gazeGroup);
    group.appendChild(svgEl('ellipse', {
        cx: 0, cy: (-ry * 1.05).toFixed(2), rx: (rx * 1.05).toFixed(2), ry: (ry * 0.75).toFixed(2),
        fill: withAlpha('#2b1008', 0.3), 'clip-path': `url(#worm-eye-clip-${instanceId}-${eyeKey})`
    }));
    group.appendChild(lidClipGroup);
    group.appendChild(lashes);
    group.appendChild(eyeFolds);
    group.appendChild(browGroup);

    return { group, sclera, iris, pupil, gazeGroup, lidTrack, browGroup, rx, ry, lidHeight };
}

// ---------- ПОСТРОЕНИЕ РТА: ЕДИНАЯ ПРОЦЕДУРНАЯ ФОРМА, ЖИВАЯ КАЖДЫЙ КАДР ----------
// Идея формы: круг, где кайма — губы, заливка — тёмная ротовая полость.
// Геометрия пересчитывается КАЖДЫЙ КАДР в tick() из bend/gap — как и
// раздутие живота, это "живой" параметр, управляемый через
// handle.setLivePose({ mouthOpenness }) БЕЗ пересборки всего SVG.
function buildMouthShapes(mouthAnchor, mouth, instanceId) {
    const W = 8.6;       // половина ширины рта в уголках
    const MAX_GAP = 10;  // при полном открытии (gap==W) рот примерно круглый

    const mouthShape = svgEl('path', {
        d: '', fill: '#3d0e14', stroke: mouth.color, 'stroke-width': 1.8, 'stroke-linejoin': 'round'
    });
    mouthAnchor.appendChild(mouthShape);

    const mouthClipId = `worm-mouth-clip-${instanceId}`;
    const mouthClipPath = svgEl('clipPath', { id: mouthClipId });
    const mouthClipShape = svgEl('path', { d: '' });
    mouthClipPath.appendChild(mouthClipShape);
    mouthAnchor.appendChild(mouthClipPath);

    // Кривые, неровные зубы — видны только когда рот заметно приоткрыт.
    const teethGroup = svgEl('g', { class: 'worm-teeth', 'clip-path': `url(#${mouthClipId})`, visibility: 'hidden' });
    const toothRng = mulberry32(hashStringSeed(`${instanceId}-teeth`));
    const teeth = [];
    const toothCount = 3;
    for (let i = 0; i < toothCount; i++) {
        const t = (i + 0.5) / toothCount; // 0..1 слева направо
        const tx = (-W * 0.9) + t * (W * 1.8);
        const jitter = (toothRng() - 0.5) * 2.4;
        const hBase = 4 + toothRng() * 2;
        const tw = 2.2 + toothRng() * 1.2;
        const toothEl = svgEl('path', { d: '', fill: '#d8cf9a' });
        teethGroup.appendChild(toothEl);
        teeth.push({ el: toothEl, tx, jitter, hBase, tw });
    }
    mouthAnchor.appendChild(teethGroup);

    return { mouthShape, mouthClipShape, teethGroup, teeth, W, MAX_GAP };
}

// Пересчитывает форму рта (и зубов) из bend/gap. Рот строится как НАСТОЯЩИЙ
// гладкий овал — 4 кубические дуги (константа MOUTH_ARC_K), где верхняя и
// нижняя половины могут иметь РАЗНЫЙ радиус (ryTop/ryBottom): касательная в
// уголках всегда строго вертикальна, поэтому стык гладкий при любом
// сочетании настроения и открытости.
function mouthBendFromCurve(curve) {
    return 7 * curve;
}

function updateMouthGeometry(mouthBuilt, bend, gap) {
    const W = mouthBuilt.W;
    const halfBend = bend / 2;
    const topBulge = Math.max(0, -halfBend);
    const bottomBulge = Math.max(0, halfBend);
    const ryTop = (gap + topBulge) * MOUTH_EGG_TOP;
    const ryBottom = (gap + bottomBulge) * MOUTH_EGG_BOTTOM;
    const k = MOUTH_ARC_K;
    const d = `M ${W.toFixed(2)},0 ` +
        `C ${W.toFixed(2)},${(-k * ryTop).toFixed(2)} ${(k * W).toFixed(2)},${(-ryTop).toFixed(2)} 0,${(-ryTop).toFixed(2)} ` +
        `C ${(-k * W).toFixed(2)},${(-ryTop).toFixed(2)} ${(-W).toFixed(2)},${(-k * ryTop).toFixed(2)} ${(-W).toFixed(2)},0 ` +
        `C ${(-W).toFixed(2)},${(k * ryBottom).toFixed(2)} ${(-k * W).toFixed(2)},${ryBottom.toFixed(2)} 0,${ryBottom.toFixed(2)} ` +
        `C ${(k * W).toFixed(2)},${ryBottom.toFixed(2)} ${W.toFixed(2)},${(k * ryBottom).toFixed(2)} ${W.toFixed(2)},0 Z`;
    mouthBuilt.mouthShape.setAttribute('d', d);
    mouthBuilt.mouthClipShape.setAttribute('d', d);
    if (gap > 2) {
        mouthBuilt.teethGroup.setAttribute('visibility', 'visible');
        const topY = -ryTop + 1;
        mouthBuilt.teeth.forEach(t => {
            const toothH = Math.min(gap * 0.85, t.hBase);
            t.el.setAttribute('d',
                `M ${(t.tx - t.tw / 2).toFixed(1)},${topY.toFixed(1)} ` +
                `L ${(t.tx + t.tw / 2 + t.jitter).toFixed(1)},${topY.toFixed(1)} ` +
                `L ${(t.tx + t.jitter * 0.4).toFixed(1)},${(topY + toothH).toFixed(1)} Z`);
        });
    } else {
        mouthBuilt.teethGroup.setAttribute('visibility', 'hidden');
    }
}

// ---------- ПЕРЕХОД ЧЕРВЬ → СВИНАЯ ГОЛОВА ----------
// Задача: чтобы не читалось как "два разных персонажа, состыкованных
// встык". Переход собран из четырёх согласованных вещей:
//   1) цвет: сегмент-1 и сегмент-2 подмешаны к цвету головы (skin.neckBlend)
//      — кожа плавно "розовеет" к голове, а не меняется скачком;
//   2) низ головы: градиентная юбка цветом шеи — граница черепа и тела
//      растворяется, голова выглядит выросшей из тела;
//   3) свиные признаки убывают вниз по телу: складки и щетина есть на
//      голове и сегменте-1, слабее на сегменте-2, дальше их нет;
//   4) червячные признаки убывают вверх: кольцевые бороздки идут по всему
//      телу, у шеи слабеют, а поясок-клителлум на сегменте-2 работает
//      "воротником" — естественной границей между двумя типами кожи.
// Пятачок при этом читается как передний конец ЧЕРВЯ (радиальные морщинки
// вокруг него — как у ротового конца), а не как приклеенная деталь свиньи.
function buildHeadNeckTransition(ctx, headRx, headRy, neckColor) {
    const anatomy = ctx.anatomy;
    if (!anatomy.enabled) return null;
    // Клип по силуэту черепа. Без него "юбка" перехода выступает ниже
    // головы и увеличивает её bbox — а на bbox головы завязана раскладка
    // Чревоугодия (кастрюля ставится строго над макушкой). Косметика не
    // имеет права менять измеримые габариты частей: это ровно тот класс
    // поломок, которые проявляются не тут, а в чужой мини-игре.
    const clipId = `worm-neck-clip-${ctx.instanceId}`;
    if (!ctx.gradCache[clipId]) {
        const clip = svgEl('clipPath', { id: clipId });
        clip.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: headRx.toFixed(2), ry: headRy.toFixed(2) }));
        ctx.defs.appendChild(clip);
        ctx.gradCache[clipId] = true;
    }
    const group = svgEl('g', { class: 'worm-neck-blend', 'clip-path': `url(#${clipId})` });
    const gid = `worm-neck-grad-${ctx.instanceId}`;
    if (!ctx.gradCache[gid]) {
        const grad = svgEl('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
        grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': neckColor, 'stop-opacity': '0' }));
        grad.appendChild(svgEl('stop', { offset: '55%', 'stop-color': neckColor, 'stop-opacity': '0.35' }));
        grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': neckColor, 'stop-opacity': '0.8' }));
        ctx.defs.appendChild(grad);
        ctx.gradCache[gid] = true;
    }
    // Габариты юбки заведомо внутри черепа (низ на 0.93*ry): clip-path
    // Chromium'ом в getBoundingClientRect() НЕ учитывается, поэтому одного
    // клипа мало — геометрия тоже должна помещаться внутрь головы, иначе
    // измеренный bbox головы вырастет, даже если визуально всё обрезано.
    group.appendChild(svgEl('ellipse', {
        cx: 0, cy: (headRy * 0.48).toFixed(1),
        rx: (headRx * 0.86).toFixed(1), ry: (headRy * 0.45).toFixed(1),
        fill: `url(#${gid})`
    }));
    return group;
}

// ---------- ДЕТАЛИЗАЦИЯ МОРДЫ ----------
// Складки лба, вибриссы, тень у основания ушей. Всё внутри клипа по черепу:
// ни одна деталь не имеет права выйти за габарит головы, потому что по её
// bbox Чревоугодие ставит кастрюлю над макушкой.
function buildHeadDetailLayer(ctx, rx, ry, skullPathD) {
    const anatomy = ctx.anatomy;
    if (!anatomy.enabled) return null;
    const coat = anatomy.coat || {};
    const folds = coat.folds != null ? coat.folds : 0.5;
    const bristle = coat.bristle != null ? coat.bristle : 0.45;
    const rng = anatRng(anatomy, 'head', 'detail');

    const clipId = `worm-head-detail-clip-${ctx.instanceId}`;
    if (!ctx.gradCache[clipId]) {
        const clip = svgEl('clipPath', { id: clipId });
        // Клип по РЕАЛЬНОМУ силуэту черепа, а не по вписанному эллипсу:
        // иначе складки и щетина обрезались бы по чужой форме.
        clip.appendChild(skullPathD ? svgEl('path', { d: skullPathD })
                                    : svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2) }));
        ctx.defs.appendChild(clip);
        ctx.gradCache[clipId] = true;
    }
    const group = svgEl('g', { class: 'worm-head-detail', 'clip-path': `url(#${clipId})` });

    // Тень у основания ушей — уши растут ИЗ головы, а не приставлены к ней.
    const shadeFill = ensureSoftGradient(ctx, `worm-head-earshade-${ctx.instanceId}`, GRIME_SHADOW, 1);
    [-1, 1].forEach(side => {
        group.appendChild(svgEl('ellipse', {
            cx: (side * rx * 0.58).toFixed(1), cy: (-ry * 0.56).toFixed(1),
            rx: (rx * 0.28).toFixed(1), ry: (ry * 0.18).toFixed(1),
            fill: shadeFill, opacity: 0.35
        }));
    });

    // Складки лба — две несимметричные дуги над бровями.
    if (folds > 0.01) {
        for (let i = 0; i < 2; i++) {
            const y = -ry * (0.52 + i * 0.12);
            const w = rx * (0.4 - i * 0.07);
            const shift = (rng() - 0.5) * rx * 0.12;
            group.appendChild(svgEl('path', {
                d: `M ${(-w + shift).toFixed(1)},${y.toFixed(1)} Q ${shift.toFixed(1)},${(y - ry * 0.09).toFixed(1)} ${(w + shift).toFixed(1)},${y.toFixed(1)}`,
                fill: 'none', stroke: GRIME_SHADOW, 'stroke-width': 1.3,
                opacity: (0.14 * folds).toFixed(3), 'stroke-linecap': 'round'
            }));
            group.appendChild(svgEl('path', {
                d: `M ${(-w + shift).toFixed(1)},${(y + 1.6).toFixed(1)} Q ${shift.toFixed(1)},${(y - ry * 0.09 + 1.6).toFixed(1)} ${(w + shift).toFixed(1)},${(y + 1.6).toFixed(1)}`,
                fill: 'none', stroke: GRIME_HIGHLIGHT, 'stroke-width': 0.9,
                opacity: (0.1 * folds).toFixed(3), 'stroke-linecap': 'round'
            }));
        }
    }

    // Вибриссы: длинные редкие волоски по щекам и над бровями. Держатся
    // внутри силуэта — торчащие наружу увеличили бы bbox головы.
    if (bristle > 0.01) {
        // Ровно по паре с каждой стороны и близко к краю щеки: вибриссы —
        // редкая деталь. Пять длинных волосков через всю морду мгновенно
        // превращают свинью в кота.
        const whiskers = 2;
        [-1, 1].forEach(side => {
            for (let i = 0; i < whiskers; i++) {
                const t = i / Math.max(1, whiskers - 1);
                const x0 = side * rx * (0.4 + t * 0.08);
                const y0 = ry * (0.3 + t * 0.18);
                const len = rx * (0.16 + rng() * 0.12);
                const up = -ry * (0.04 + rng() * 0.1);
                group.appendChild(svgEl('path', {
                    d: `M ${x0.toFixed(1)},${y0.toFixed(1)} Q ${(x0 + side * len * 0.6).toFixed(1)},${(y0 + up * 0.6).toFixed(1)} ${(x0 + side * len).toFixed(1)},${(y0 + up).toFixed(1)}`,
                    fill: 'none', stroke: GRIME_SHADOW, 'stroke-width': 0.7,
                    opacity: (0.15 * bristle).toFixed(3), 'stroke-linecap': 'round'
                }));
            }
        });
    }

    return group;
}

// ---------- ПОСТРОЕНИЕ ГОЛОВЫ (уши, пятачок, рот, глаза) ----------
// ---------- ФОРМА ЧЕРЕПА ----------
// Голова перестала быть кругом. У свиньи череп спереди читается так: широкий
// лоб между ушами → самые широкие точки на скулах → сужение к челюсти →
// выступающая вперёд-вниз морда с плоским пятачком на конце. Форма собрана
// кубическими кривыми и симметрична; все пропорции — параметры модели
// (`head.skull`), а не числа в коде, поэтому череп можно менять под возраст,
// породу или настроение, не трогая рендерер.
function skullPathData(rx, ry, p) {
    const brow = (p.browWidth != null ? p.browWidth : 0.62) * rx;   // ширина свода у макушки
    const temple = (p.templeWidth != null ? p.templeWidth : 0.97) * rx;
    const cheek = (p.cheekWidth != null ? p.cheekWidth : 1) * rx;   // самое широкое место
    const jaw = (p.jawWidth != null ? p.jawWidth : 0.78) * rx;
    const muzzle = (p.muzzleWidth != null ? p.muzzleWidth : 0.46) * rx;
    const chin = (p.chinDrop != null ? p.chinDrop : 1.04) * ry;
    const half = (side) => {
        const k = side;
        return `C ${(k * brow).toFixed(1)},${(-ry * 0.99).toFixed(1)} ${(k * temple).toFixed(1)},${(-ry * 0.72).toFixed(1)} ${(k * cheek).toFixed(1)},${(-ry * 0.08).toFixed(1)} ` +
               `C ${(k * cheek * 0.99).toFixed(1)},${(ry * 0.3).toFixed(1)} ${(k * jaw).toFixed(1)},${(ry * 0.56).toFixed(1)} ${(k * muzzle).toFixed(1)},${(ry * 0.84).toFixed(1)} ` +
               `C ${(k * muzzle * 0.92).toFixed(1)},${(chin * 0.97).toFixed(1)} ${(k * muzzle * 0.45).toFixed(1)},${chin.toFixed(1)} 0,${chin.toFixed(1)}`;
    };
    // Вниз по правой стороне, потом обратно вверх по левой.
    return `M 0,${(-ry).toFixed(1)} ${half(1)} ` +
           `${half(-1).replace('C', 'C').split(' ').reverse().length ? '' : ''}` +
           reverseHalf(half(-1)) + ' Z';
}

// Левая половина строится теми же кривыми, но проходится в обратном
// направлении — иначе контур пришлось бы дублировать вручную и он рисковал
// разъехаться при правке пропорций.
function reverseHalf(dRight) {
    // dRight: "C a,b c,d e,f C g,h i,j k,l" — разворачиваем порядок сегментов
    // и меняем местами контрольные точки внутри каждого.
    const segs = dRight.trim().split('C').filter(Boolean).map(seg => {
        const nums = seg.trim().split(/[ ,]+/).map(Number);
        return { c1: [nums[0], nums[1]], c2: [nums[2], nums[3]], p: [nums[4], nums[5]] };
    });
    let d = '';
    for (let i = segs.length - 1; i >= 0; i--) {
        const target = i === 0 ? null : segs[i - 1].p;
        const seg = segs[i];
        const end = target || [0, segs[0].c1[1]];
        d += ` C ${seg.c2[0].toFixed(1)},${seg.c2[1].toFixed(1)} ${seg.c1[0].toFixed(1)},${seg.c1[1].toFixed(1)} ${end[0].toFixed(1)},${end[1].toFixed(1)}`;
    }
    return d;
}

// ---------- ПОСТРОЕНИЕ ГОЛОВЫ (череп, морда, уши, пятачок, рот, глаза) ----------
function buildHeadNode(model, ctx) {
    const head = model.head;
    const anatomy = ctx.anatomy;
    const skullCfg = head.skull || {};
    // Группа наклона: весь набор частей головы висит в ней, чтобы мимический
    // наклон (livePose.headTilt) поворачивал голову целиком вокруг основания
    // шеи, а не каждую деталь по отдельности.
    const group = svgEl('g', { 'data-part': 'head' });
    const tiltGroup = svgEl('g', { 'data-part': 'head-tilt' });
    group.appendChild(tiltGroup);

    const R = 40 * head.scale;
    const rx = R * head.stretchX;
    const ry = R * head.stretchY;
    const skullD = skullPathData(rx, ry, skullCfg);

    const headGradId = `worm-head-grad-${ctx.instanceId}`;
    const headFill = ensureVolumeGradient(ctx.defs, headGradId, head.fill, {
        cx: '38%', cy: '26%', r: '88%',
        highlight: 0.2, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.34, shadowTint: GRIME_SHADOW
    });
    const skull = svgEl('path', { d: skullD, fill: headFill, stroke: head.stroke, 'stroke-width': 3, 'stroke-linejoin': 'round' });

    // Клип по РЕАЛЬНОЙ форме черепа: все слои кожи, складки и щетина
    // обрезаются силуэтом головы, а не вписанным эллипсом.
    const skullClipId = `worm-skull-clip-${ctx.instanceId}`;
    if (!ctx.gradCache[skullClipId]) {
        const clip = svgEl('clipPath', { id: skullClipId });
        clip.appendChild(svgEl('path', { d: skullD }));
        ctx.defs.appendChild(clip);
        ctx.gradCache[skullClipId] = true;
    }

    const headShine = svgEl('ellipse', {
        cx: (-rx * 0.28).toFixed(2), cy: (-ry * 0.52).toFixed(2),
        rx: (rx * 0.3).toFixed(2), ry: (ry * 0.16).toFixed(2),
        fill: '#ffffff', opacity: 0.16
    });

    // ---------- УШИ ----------
    // Крепятся к верхним углам черепа и по умолчанию развёрнуты наружу:
    // у свиньи уши стоят домиком, а не торчат строго вверх. Базовый разворот
    // живёт в рендерере, а `ear.rotation` из модели прибавляется к нему —
    // так прижатые уши (отрицательный угол) остаются рабочим состоянием.
    // Было 27 — вместе со старым узким остроконечным ухом это давало
    // посадку "домиком, вздёрнутым назад", как у настороженной собаки.
    // Широкое закруглённое ухо + меньший разворот наружу читаются как
    // отвисающее свиное ухо, а не стоячее собачье.
    const EAR_BASE_TILT = 16;
    const earsGroup = svgEl('g', { 'data-part': 'ears' });
    const earRefs = {};
    ['left', 'right'].forEach(side => {
        const mirror = side === 'left' ? -1 : 1;
        const ear = head.ears[side];
        const anchorX = mirror * rx * 0.62;
        const anchorY = -ry * 0.52;
        const baseAngle = mirror * EAR_BASE_TILT + ear.rotation;
        const earGroup = svgEl('g', {
            'data-part': `ear-${side}`,
            'data-anchor': `ear-${side}`,
            transform: `translate(${anchorX.toFixed(2)},${anchorY.toFixed(2)}) rotate(${baseAngle.toFixed(1)}) scale(${(ear.scale * ear.stretchX).toFixed(3)},${(ear.scale * ear.stretchY).toFixed(3)})`,
            visibility: ear.visible ? 'visible' : 'hidden'
        });
        const earGradId = `worm-ear-grad-${ctx.instanceId}-${side}`;
        const earFill = ensureVolumeGradient(ctx.defs, earGradId, ear.fill, {
            cx: mirror > 0 ? '35%' : '65%', cy: '30%', r: '85%',
            highlight: 0.2, highlightTint: GRIME_HIGHLIGHT,
            shadow: -0.32, shadowTint: GRIME_SHADOW
        });
        const earShape = svgEl('path', { d: earPathData(mirror), fill: earFill, stroke: ear.stroke, 'stroke-width': 2, 'stroke-linejoin': 'round' });
        const earInner = svgEl('path', { d: earInnerPathData(mirror), fill: mixColor(ear.fill, GRIME_SHADOW, 0.32), opacity: 0.6 });
        const earRidge = svgEl('path', {
            d: earInnerPathData(mirror), fill: 'none',
            stroke: mixColor(ear.fill, GRIME_HIGHLIGHT, 0.55), 'stroke-width': 1.1, opacity: 0.45
        });
        earGroup.appendChild(earShape);
        earGroup.appendChild(earInner);
        earGroup.appendChild(earRidge);
        const vessels = buildEarVessels(ctx, mirror, side);
        if (vessels) earGroup.appendChild(vessels);
        // Щетина по краю раковины — у свиньи ухо опушено по контуру.
        if (anatomy.enabled && (anatomy.coat && (anatomy.coat.bristle || 0) > 0.01) && ear.visible) {
            const brng = anatRng(anatomy, `ear-${side}`, 'fringe');
            const fringe = svgEl('g', { class: 'worm-ear-fringe' });
            // Бахрома растёт ВНУТРЬ контура уха: любая деталь, торчащая
            // наружу, увеличивает измеримый габарит персонажа, а на него
            // завязаны раскладки мини-игр.
            for (let i = 0; i < 5; i++) {
                const t = i / 4;
                const bx = mirror * (-7 + t * 18), by = 1 - t * 19;
                const len = 1.6 + brng() * 2;
                fringe.appendChild(svgEl('path', {
                    d: `M ${bx.toFixed(1)},${by.toFixed(1)} l ${(-mirror * len * 0.6).toFixed(1)},${(-len).toFixed(1)}`,
                    stroke: GRIME_SHADOW, 'stroke-width': 0.6, fill: 'none',
                    opacity: (0.3 * anatomy.coat.bristle).toFixed(3), 'stroke-linecap': 'round'
                }));
            }
            earGroup.appendChild(fringe);
        }
        earsGroup.appendChild(earGroup);
        earRefs[side] = { group: earGroup, shape: earShape, inner: earInner, anchorX, anchorY, baseAngle, scaleX: ear.scale * ear.stretchX, scaleY: ear.scale * ear.stretchY };
    });

    // ---------- СЛОИ КОЖИ ГОЛОВЫ ----------
    const headAnat = buildAnatomyStack(ctx, 'head', {
        rx, ry, axis: 'x',
        organZone: null,
        muscle: false,
        clipPathData: skullD,
        coat: { rings: false, folds: true, bristle: true }
    });

    // ---------- РЕЛЬЕФ ЧЕРЕПА ----------
    // Надбровные дуги, височные впадины, скулы и жевательная мышца. Всё
    // мягкими пятнами: любая нарисованная линия на морде читается царапиной.
    let skullShading = null;
    if (anatomy.enabled) {
        const taper = skullCfg.relief != null ? skullCfg.relief : ((anatomy.skeleton && anatomy.skeleton.headTaper != null) ? anatomy.skeleton.headTaper : 0.14);
        if (taper > 0.01) {
            const k = taper / 0.14;
            skullShading = svgEl('g', { class: 'worm-skull-shading', 'clip-path': `url(#${skullClipId})` });
            const shadowFill = ensureSoftGradient(ctx, `worm-head-cheek-${ctx.instanceId}`, GRIME_SHADOW, 1);
            const lightFill = ensureSoftGradient(ctx, `worm-head-light-${ctx.instanceId}`, GRIME_HIGHLIGHT, 1);
            [-1, 1].forEach(side => {
                // височная впадина
                skullShading.appendChild(svgEl('ellipse', {
                    cx: (side * rx * 0.62).toFixed(1), cy: (-ry * 0.42).toFixed(1),
                    rx: (rx * 0.22).toFixed(1), ry: (ry * 0.22).toFixed(1),
                    fill: shadowFill, opacity: (0.18 * k).toFixed(3)
                }));
                // скула — светлая грань
                skullShading.appendChild(svgEl('ellipse', {
                    cx: (side * rx * 0.66).toFixed(1), cy: (-ry * 0.04).toFixed(1),
                    rx: (rx * 0.26).toFixed(1), ry: (ry * 0.2).toFixed(1),
                    fill: lightFill, opacity: (0.16 * k).toFixed(3)
                }));
                // жевательная мышца / брыль
                skullShading.appendChild(svgEl('ellipse', {
                    cx: (side * rx * 0.56).toFixed(1), cy: (ry * 0.42).toFixed(1),
                    rx: (rx * 0.3).toFixed(1), ry: (ry * 0.26).toFixed(1),
                    fill: shadowFill, opacity: (0.2 * k).toFixed(3)
                }));
                // надбровная дуга
                skullShading.appendChild(svgEl('ellipse', {
                    cx: (side * rx * 0.34).toFixed(1), cy: (-ry * 0.4).toFixed(1),
                    rx: (rx * 0.26).toFixed(1), ry: (ry * 0.12).toFixed(1),
                    fill: lightFill, opacity: (0.14 * k).toFixed(3)
                }));
            });
            // лобная ложбинка по центру
            skullShading.appendChild(svgEl('ellipse', {
                cx: 0, cy: (-ry * 0.34).toFixed(1),
                rx: (rx * 0.1).toFixed(1), ry: (ry * 0.3).toFixed(1),
                fill: shadowFill, opacity: (0.12 * k).toFixed(3)
            }));
        }
    }

    // ---------- МОРДА (ROSTRUM) ----------
    // Отдельный объём, выступающий вперёд и вниз, а не пятачок, наклеенный на
    // плоское лицо. Собственная светлая грань сверху, тени по бокам и
    // контактная тень в месте, где морда выходит из черепа.
    const muzzleW = (skullCfg.muzzleWidth != null ? skullCfg.muzzleWidth : 0.46) * rx;
    const muzzleTop = ry * 0.05;
    const muzzleBottom = ry * 0.95;
    const muzzleGroup = svgEl('g', { 'data-part': 'muzzle', 'clip-path': `url(#${skullClipId})` });
    const muzzleGradId = `worm-muzzle-grad-${ctx.instanceId}`;
    const muzzleFill = ensureVolumeGradient(ctx.defs, muzzleGradId, mixColor(head.fill, GRIME_HIGHLIGHT, 0.12), {
        cx: '42%', cy: '22%', r: '80%',
        highlight: 0.16, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.24, shadowTint: GRIME_SHADOW
    });
    const muzzleD = `M ${(-muzzleW * 1.22).toFixed(1)},${muzzleTop.toFixed(1)} ` +
        `C ${(-muzzleW * 1.3).toFixed(1)},${(ry * 0.45).toFixed(1)} ${(-muzzleW * 1.08).toFixed(1)},${(ry * 0.78).toFixed(1)} ${(-muzzleW * 0.86).toFixed(1)},${muzzleBottom.toFixed(1)} ` +
        `C ${(-muzzleW * 0.5).toFixed(1)},${(ry * 1.08).toFixed(1)} ${(muzzleW * 0.5).toFixed(1)},${(ry * 1.08).toFixed(1)} ${(muzzleW * 0.86).toFixed(1)},${muzzleBottom.toFixed(1)} ` +
        `C ${(muzzleW * 1.08).toFixed(1)},${(ry * 0.78).toFixed(1)} ${(muzzleW * 1.3).toFixed(1)},${(ry * 0.45).toFixed(1)} ${(muzzleW * 1.22).toFixed(1)},${muzzleTop.toFixed(1)} ` +
        `C ${(muzzleW * 0.7).toFixed(1)},${(-ry * 0.12).toFixed(1)} ${(-muzzleW * 0.7).toFixed(1)},${(-ry * 0.12).toFixed(1)} ${(-muzzleW * 1.22).toFixed(1)},${muzzleTop.toFixed(1)} Z`;
    // Морда не должна иметь резкой верхней границы — она не накладка, а
    // продолжение черепа: заливка приглушена, а стык с лицом растворяется
    // мягким пятном (см. следующий слой).
    muzzleGroup.appendChild(svgEl('path', { d: muzzleD, fill: muzzleFill, opacity: 0.5 }));
    muzzleGroup.appendChild(svgEl('ellipse', {
        cx: 0, cy: (ry * 0.06).toFixed(1),
        rx: (muzzleW * 1.5).toFixed(1), ry: (ry * 0.26).toFixed(1),
        fill: ensureSoftGradient(ctx, `worm-muzzle-blend-${ctx.instanceId}`, mixColor(head.fill, GRIME_HIGHLIGHT, 0.12), 1),
        opacity: 0.5
    }));
    // Тени по бокам морды — она отделяется от щёк.
    [-1, 1].forEach(side => {
        muzzleGroup.appendChild(svgEl('ellipse', {
            cx: (side * muzzleW * 1.24).toFixed(1), cy: (ry * 0.5).toFixed(1),
            rx: (rx * 0.12).toFixed(1), ry: (ry * 0.34).toFixed(1),
            fill: ensureSoftGradient(ctx, `worm-muzzle-side-${ctx.instanceId}`, GRIME_SHADOW, 1),
            opacity: 0.35
        }));
    });
    // Светлая грань спинки морды.
    muzzleGroup.appendChild(svgEl('ellipse', {
        cx: (-muzzleW * 0.18).toFixed(1), cy: (ry * 0.34).toFixed(1),
        rx: (muzzleW * 0.44).toFixed(1), ry: (ry * 0.3).toFixed(1),
        fill: ensureSoftGradient(ctx, `worm-muzzle-top-${ctx.instanceId}`, GRIME_HIGHLIGHT, 1),
        opacity: 0.22
    }));

    // ---------- ЧЕЛЮСТЬ ----------
    // Нижняя губа и подбородок вынесены в свою группу: при открывании рта она
    // опускается (см. tick), и морда открывается как челюсть, а не как дырка
    // в неподвижной коже.
    const jawGroup = svgEl('g', { 'data-part': 'jaw', 'clip-path': `url(#${skullClipId})` });
    const jawFill = ensureSoftGradient(ctx, `worm-jaw-shade-${ctx.instanceId}`, GRIME_SHADOW, 1);
    jawGroup.appendChild(svgEl('ellipse', {
        cx: 0, cy: (ry * 1.0).toFixed(1),
        rx: (muzzleW * 0.95).toFixed(1), ry: (ry * 0.16).toFixed(1),
        fill: jawFill, opacity: 0.3
    }));
    const lipColor = mixColor(head.mouth.color, head.fill, 0.35);
    const lowerLip = svgEl('path', {
        d: `M ${(-muzzleW * 0.78).toFixed(1)},${(ry * 1.02).toFixed(1)} Q 0,${(ry * 1.1).toFixed(1)} ${(muzzleW * 0.78).toFixed(1)},${(ry * 1.02).toFixed(1)}`,
        fill: 'none', stroke: lipColor, 'stroke-width': 2, opacity: 0.5, 'stroke-linecap': 'round'
    });
    jawGroup.appendChild(lowerLip);

    // ---------- ПЯТАЧОК ----------
    const snout = head.snout;
    const snoutY = ry * 0.6;
    const snoutRx = 14.5, snoutRy = 10.5;
    const snoutGroup = svgEl('g', {
        'data-part': 'snout',
        'data-anchor': 'snout',
        transform: `translate(0,${snoutY.toFixed(2)}) scale(${(snout.scale * snout.stretchX).toFixed(3)},${(snout.scale * snout.stretchY).toFixed(3)})`
    });
    const snoutGradId = `worm-snout-grad-${ctx.instanceId}`;
    const snoutFill = ensureVolumeGradient(ctx.defs, snoutGradId, snout.fill, {
        cx: '38%', cy: '28%', r: '82%',
        highlight: 0.22, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.34, shadowTint: GRIME_SHADOW
    });
    // Диск пятачка + мягкая тень под ним: он выступает вперёд, а не лежит
    // в плоскости морды.
    snoutGroup.appendChild(svgEl('ellipse', {
        cx: 0, cy: (snoutRy * 0.42).toFixed(1), rx: (snoutRx * 1.05).toFixed(1), ry: (snoutRy * 0.8).toFixed(1),
        fill: ensureSoftGradient(ctx, `worm-snout-shadow-${ctx.instanceId}`, GRIME_SHADOW, 1), opacity: 0.4
    }));
    const snoutShape = svgEl('ellipse', { cx: 0, cy: 0, rx: snoutRx, ry: snoutRy, fill: snoutFill, stroke: snout.stroke, 'stroke-width': 2 });
    const nostrilL = svgEl('ellipse', { cx: -4.8, cy: 0, rx: 2.3, ry: 3.4, fill: '#631d27', transform: 'rotate(-14 -4.8 0)' });
    const nostrilR = svgEl('ellipse', { cx: 4.8, cy: 0, rx: 2.3, ry: 3.4, fill: '#631d27', transform: 'rotate(14 4.8 0)' });
    const snoutShine = svgEl('ellipse', { cx: -4, cy: -4.6, rx: 4.6, ry: 2, fill: '#ffffff', opacity: 0.32 });
    const poreGroup = svgEl('g', { class: 'worm-snout-pores' });
    const poreRng = mulberry32(hashStringSeed(`${ctx.instanceId}-snout-pores`));
    for (let i = 0; i < 14; i++) {
        const a = poreRng() * Math.PI * 2;
        const rr = Math.sqrt(poreRng()) * 0.86;
        const px = Math.cos(a) * snoutRx * rr, py = Math.sin(a) * snoutRy * rr;
        if (Math.abs(px) < 8 && Math.abs(py) < 4.5) continue;
        poreGroup.appendChild(svgEl('circle', {
            cx: px.toFixed(1), cy: py.toFixed(1), r: (0.5 + poreRng() * 0.6).toFixed(2),
            fill: mixColor(snout.fill, GRIME_SHADOW, 0.55), opacity: 0.42
        }));
    }
    const nostrilShade = svgEl('g');
    [[-4.8, -14], [4.8, 14]].forEach(([nx, rot]) => {
        nostrilShade.appendChild(svgEl('ellipse', {
            cx: nx, cy: 1, rx: 1.6, ry: 2.2, fill: '#2d0a11', opacity: 0.75,
            transform: `rotate(${rot} ${nx} 0)`
        }));
    });
    // Вертикальная бороздка (philtrum) — она есть у каждой свиньи и сразу
    // читается как порода, а не как абстрактный кружок.
    const philtrum = svgEl('path', {
        d: `M 0,${(-snoutRy * 0.25).toFixed(1)} L 0,${(snoutRy * 0.95).toFixed(1)}`,
        stroke: mixColor(snout.fill, GRIME_SHADOW, 0.5), 'stroke-width': 1.2, opacity: 0.5, fill: 'none'
    });
    snoutGroup.appendChild(snoutShape);
    snoutGroup.appendChild(poreGroup);
    snoutGroup.appendChild(snoutShine);
    snoutGroup.appendChild(nostrilL);
    snoutGroup.appendChild(nostrilR);
    snoutGroup.appendChild(nostrilShade);
    snoutGroup.appendChild(philtrum);
    if (anatomy.enabled && (anatomy.coat && (anatomy.coat.folds || 0) > 0.01)) {
        const rng = anatRng(anatomy, 'snout', 'radial');
        const wrinkles = svgEl('g', { class: 'worm-snout-wrinkles' });
        const count = 6 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + rng() * 0.2;
            const r0 = snoutRx * 1.05, r1 = r0 + 2 + rng() * 2.2;
            wrinkles.appendChild(svgEl('path', {
                d: `M ${(Math.cos(a) * r0).toFixed(1)},${(Math.sin(a) * r0 * 0.72).toFixed(1)} ` +
                   `L ${(Math.cos(a) * r1).toFixed(1)},${(Math.sin(a) * r1 * 0.72).toFixed(1)}`,
                stroke: GRIME_SHADOW, 'stroke-width': 0.8, fill: 'none',
                opacity: (0.26 * anatomy.coat.folds).toFixed(3), 'stroke-linecap': 'round'
            }));
        }
        snoutGroup.appendChild(wrinkles);
    }

    // ---------- РОТ ----------
    const mouth = head.mouth;
    const mouthAnchor = svgEl('g', {
        'data-part': 'mouth',
        'data-anchor': 'mouth',
        transform: `translate(0,${(ry * 1.0).toFixed(2)}) scale(${(mouth.scale * mouth.stretchX).toFixed(3)},${(mouth.scale * mouth.stretchY).toFixed(3)})`
    });
    const mouthBuilt = buildMouthShapes(mouthAnchor, mouth, ctx.instanceId);
    updateMouthGeometry(mouthBuilt, mouthBendFromCurve(mouth.curve), mouthBuilt.MAX_GAP * clamp01(mouth.openness || 0));

    // ---------- ГЛАЗА ----------
    const eyesGroup = svgEl('g', { 'data-part': 'eyes' });
    const eyeLeft = buildEyeNode(model.eyes.left, -1, ctx.instanceId, 'left', ctx.defs);
    const eyeRight = buildEyeNode(model.eyes.right, 1, ctx.instanceId, 'right', ctx.defs);
    eyesGroup.appendChild(eyeLeft.group);
    eyesGroup.appendChild(eyeRight.group);

    const hatAnchor = svgEl('g', { 'data-anchor': 'head-top', transform: `translate(0,${(-ry * 1.1).toFixed(2)})` });

    // Порядок ЯВНЫЙ, снизу вверх: уши → череп → слои кожи → рельеф черепа →
    // переход в шею → морда → челюсть → блик → рот → пятачок → глаза →
    // мелкая детализация кожи → якорь шляпы.
    tiltGroup.appendChild(earsGroup);
    tiltGroup.appendChild(skull);
    if (headAnat) tiltGroup.appendChild(headAnat.group);
    if (skullShading) tiltGroup.appendChild(skullShading);
    if (ctx.neckColor) {
        const neck = buildHeadNeckTransition(ctx, rx, ry, ctx.neckColor);
        if (neck) tiltGroup.appendChild(neck);
    }
    tiltGroup.appendChild(muzzleGroup);
    tiltGroup.appendChild(jawGroup);
    tiltGroup.appendChild(headShine);
    tiltGroup.appendChild(mouthAnchor);
    tiltGroup.appendChild(snoutGroup);
    tiltGroup.appendChild(eyesGroup);
    const headDetail = buildHeadDetailLayer(ctx, rx, ry, skullD);
    if (headDetail) tiltGroup.appendChild(headDetail);
    tiltGroup.appendChild(hatAnchor);

    const scarLayer = svgEl('g', { 'data-anchor': 'head-scars', class: 'worm-scar-layer' });
    tiltGroup.appendChild(scarLayer);

    return {
        group, tiltGroup, skull, ears: earRefs, snoutGroup, muzzleGroup, jawGroup,
        mouth: mouthBuilt, eyes: { left: eyeLeft, right: eyeRight },
        scarLayer, rx, ry, snoutY, anat: headAnat,
        fillColor: ctx.neckColor || head.fill
    };
}

// ---------- ШРАМЫ ----------
// Процедурно генерируемая метка на конкретном сегменте. Размер намеренно
// ограничен долей от радиуса сегмента-хозяина, чтобы не вылезать за его
// пределы.
function buildScarNode(scar, hostRadius) {
    const maxSize = hostRadius * 0.35;
    const size = Math.max(3, Math.min(maxSize, (scar.seed % 100) / 100 * maxSize));
    const group = svgEl('g', {
        transform: `translate(${(scar.x * hostRadius).toFixed(2)},${(scar.y * hostRadius).toFixed(2)}) rotate(${scar.rotation})`,
        class: `worm-scar worm-scar-${scar.type || 'organic'}`
    });
    if (scar.type === 'stitched') {
        const line = svgEl('line', { x1: -size, y1: 0, x2: size, y2: 0, stroke: scar.color, 'stroke-width': Math.max(1, size * 0.2) });
        group.appendChild(line);
        const stitchCount = 3;
        for (let i = 0; i < stitchCount; i++) {
            const sx = -size + (i + 0.5) * (size * 2 / stitchCount);
            group.appendChild(svgEl('line', { x1: sx, y1: -size * 0.4, x2: sx, y2: size * 0.4, stroke: scar.color, 'stroke-width': 1 }));
        }
    } else {
        const rx = size, ry = size * 0.5;
        group.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2), fill: scar.color, opacity: 0.85 }));
    }
    return group;
}

// ---------- СБОРКА ВСЕЙ ЦЕПОЧКИ ТЕЛА ----------
// ============================================================================
//                   ЕДИНЫЙ СИЛУЭТ ТЕЛА (BODY HULL)
// ============================================================================
// Раньше тело читалось как СТОПКА ОТДЕЛЬНЫХ ШАРОВ: у каждого сегмента была
// своя обводка, и на каждом стыке был виден шов. На качественных артах такого
// существа тело — ОДНО непрерывное, а сегментация сделана перетяжками ПОВЕРХ
// него, а не границами между шарами. Это самое крупное отличие, и оно чинится
// не косметикой, а сменой способа сборки силуэта.
//
// Как строится единый силуэт (без вычисления настоящей огибающей, которая на
// поворотах цепи даёт вырожденные дуги):
//   • тело = набор КРУГОВ (по одному на часть) + МОСТЫ между соседями
//     (трапеции по касательным) — вместе они дают ровно ту же фигуру, что и
//     огибающая, но каждая её деталь остаётся простым SVG-примитивом;
//   • контур — не обводка каждой части, а ОДНА тёмная копия всей фигуры,
//     раздутая на толщину контура и лежащая ПОД телом (приём "fake outline").
//     Никаких пересекающихся линий на стыках в принципе не возникает;
//   • та же фигура, собранная третий раз, служит clipPath — по нему
//     обрезаются перетяжки и отражённый свет, чтобы они не выходили за тело.
// Все три копии обновляются в tick() перестановкой атрибутов уже созданных
// узлов — новых элементов за кадр не создаётся.

// Мост между двумя кругами: трапеция по внешним касательным. Именно она
// заполняет промежуток между соседними частями, из-за которого тело раньше
// выглядело набором отдельных шаров.
function bridgeQuadPath(a, b, pad) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) return '';
    const nx = -dy / d, ny = dx / d;      // единичная нормаль к оси моста
    const ra = a.r + (pad || 0), rb = b.r + (pad || 0);
    const p1x = a.x + nx * ra, p1y = a.y + ny * ra;
    const p2x = b.x + nx * rb, p2y = b.y + ny * rb;
    const p3x = b.x - nx * rb, p3y = b.y - ny * rb;
    const p4x = a.x - nx * ra, p4y = a.y - ny * ra;
    return `M ${p1x.toFixed(1)},${p1y.toFixed(1)} L ${p2x.toFixed(1)},${p2y.toFixed(1)} ` +
           `L ${p3x.toFixed(1)},${p3y.toFixed(1)} L ${p4x.toFixed(1)},${p4y.toFixed(1)} Z`;
}

// Три синхронных представления одной фигуры: контур (раздутая тёмная копия),
// заполнение мостов и clipPath. Узлы создаются один раз на пересборке,
// дальше только переставляются координаты.
function createHullLayers(ctx, count, outlineColor, outlineWidth) {
    const clipId = `worm-hull-clip-${ctx.instanceId}`;
    const clip = svgEl('clipPath', { id: clipId });
    const outline = svgEl('g', { class: 'worm-hull-outline' });
    // Отражённый свет — ЕЩЁ ОДНА копия силуэта, светлая, чуть меньше
    // раздутая и сдвинутая вниз-вправо. Лежит между тёмным контуром и телом:
    // сверху-слева её перекрывает само тело, а снизу-справа остаётся узкая
    // светлая кайма. Тот же приём, что и с контуром, — никаких масок и
    // фильтров, и, в отличие от дуг по каждому кругу, кайма нигде не
    // проходит по внутренним стыкам.
    const rimFill = mixColor(ctx.rimBaseColor || outlineColor, GRIME_HIGHLIGHT, 0.5);
    const rimGroup = svgEl('g', { class: 'worm-hull-rim', opacity: 0.55, transform: 'translate(1,1.8)' });
    const bridges = svgEl('g', { class: 'worm-hull-bridges' });

    const outlineCircles = [], outlineBridges = [], clipCircles = [], clipBridges = [],
          bridgeShapes = [], rimCircles = [], rimBridges = [];
    for (let i = 0; i < count; i++) {
        const oc = svgEl('circle', { cx: 0, cy: 0, r: 0, fill: outlineColor });
        outline.appendChild(oc); outlineCircles.push(oc);
        const rc = svgEl('circle', { cx: 0, cy: 0, r: 0, fill: rimFill });
        rimGroup.appendChild(rc); rimCircles.push(rc);
        const cc = svgEl('circle', { cx: 0, cy: 0, r: 0 });
        clip.appendChild(cc); clipCircles.push(cc);
        if (i < count - 1) {
            const ob = svgEl('path', { d: '', fill: outlineColor });
            outline.appendChild(ob); outlineBridges.push(ob);
            const rb = svgEl('path', { d: '', fill: rimFill });
            rimGroup.appendChild(rb); rimBridges.push(rb);
            const cb = svgEl('path', { d: '' });
            clip.appendChild(cb); clipBridges.push(cb);
            const bs = svgEl('path', { d: '', fill: 'none' });
            bridges.appendChild(bs); bridgeShapes.push(bs);
        }
    }
    ctx.defs.appendChild(clip);
    return { clipId, clip, outline, rimGroup, bridges, outlineCircles, outlineBridges,
             rimCircles, rimBridges, clipCircles, clipBridges, bridgeShapes, outlineWidth };
}

// Перетяжки между частями ("кольца"). На арте это не линия, а ВАЛИК: тень
// перед ним и подсветка после. Собирается из двух узких эллипсов, повёрнутых
// поперёк оси тела, и обрезается по силуэту.
function createRingLayers(ctx, count) {
    const group = svgEl('g', { class: 'worm-body-rings', 'clip-path': `url(#worm-hull-clip-${ctx.instanceId})` });
    // Валик собран из мягких градиентных пятен, а не из плоских эллипсов:
    // жёсткая тёмная полоса поперёк тела читается как шов/стяжка ремнём, а
    // нужна вмятина — тень, плавно сходящая на нет по обе стороны.
    const shadeFill = ensureSoftGradient(ctx, `worm-ring-shade-${ctx.instanceId}`, GRIME_SHADOW, 1);
    const lightFill = ensureSoftGradient(ctx, `worm-ring-light-${ctx.instanceId}`, GRIME_HIGHLIGHT, 1);
    const rings = [];
    for (let i = 0; i < count; i++) {
        const g = svgEl('g', { class: 'worm-body-ring' });
        const shade = svgEl('ellipse', { cx: 0, cy: 0, rx: 3, ry: 10, fill: shadeFill, opacity: 0.3 });
        const light = svgEl('ellipse', { cx: 3, cy: 0, rx: 2, ry: 10, fill: lightFill, opacity: 0.26 });
        const crease = svgEl('ellipse', { cx: 0, cy: 0, rx: 0.9, ry: 10, fill: shadeFill, opacity: 0.4 });
        g.appendChild(shade); g.appendChild(light); g.appendChild(crease);
        group.appendChild(g);
        rings.push({ g, shade, light, crease });
    }
    return { group, rings };
}

// ============================================================================
//                  ЕДИНЫЙ КИШЕЧНЫЙ ТРАКТ (GUT TRACT)
// ============================================================================
// Кишка не может жить кусками внутри отдельных сегментов: каждый кусок знает
// только свой сегмент, поэтому на каждом стыке неизбежен разрыв, и на
// повороте тела (тело идёт вертикально от головы и разворачивается в животе
// к хвосту) куски смотрят в разные стороны. Поэтому тракт вынесен на уровень
// ВСЕГО ТЕЛА — ровно тем же приёмом, что и единый силуэт:
//
//   • осевая линия тракта строится по центрам тех же самых кругов силуэта,
//     то есть автоматически повторяет текущий изгиб тела, дыхание и
//     раздутие живота — разойтись с телом она не может;
//   • вдоль осевой тракт колеблется по нормали: в шее и хвосте это спокойная
//     волна, а в животе частота и амплитуда резко растут — получается
//     змеевидная петля кишечника, из которой тракт выходит вверх к голове и
//     вниз к хвосту одной неразрывной трубой;
//   • труба рисуется ЛЕНТОЙ (замкнутый контур из двух смещённых кромок), а
//     не линией со stroke: только так толщина может меняться вдоль тракта —
//     толще в животе, сходя на нет к голове и к кончику хвоста;
//   • весь тракт обрезается тем же clipPath, что и силуэт, поэтому нигде не
//     выходит за тело.

// Плотное сэмплирование осевой линии тела: сглаженная кривая Catmull-Rom
// через центры кругов силуэта, с интерполяцией радиуса тела вдоль неё.
function sampleBodyAxis(circles, step) {
    const pts = circles.filter(c => c && c.r > 0.5);
    if (pts.length < 2) return [];
    const out = [];
    const at = i => pts[Math.max(0, Math.min(pts.length - 1, i))];
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const n = Math.max(2, Math.ceil(segLen / step));
        for (let j = 0; j < n; j++) {
            const t = j / n, t2 = t * t, t3 = t2 * t;
            // Catmull-Rom: проходит через опорные точки, гладко стыкуется.
            out.push({
                x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
                r: p1.r + (p2.r - p1.r) * t
            });
        }
    }
    out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, r: pts[pts.length - 1].r });

    // Накопленная длина и касательная — от них считаются нормаль и фаза волны.
    let acc = 0;
    for (let i = 0; i < out.length; i++) {
        const prev = out[i - 1], next = out[i + 1];
        if (prev) acc += Math.hypot(out[i].x - prev.x, out[i].y - prev.y);
        out[i].s = acc;
        const a = prev || out[i], b = next || out[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        out[i].nx = -dy / len;
        out[i].ny = dx / len;
    }
    return out;
}

// Гладкая кривая через набор точек: каждая точка становится контрольной, а
// стыки ставятся в серединах отрезков — классический приём, дающий
// непрерывную касательную без вычисления сплайна.
function smoothPolyline(pts, continueFromCurrent) {
    if (!pts.length) return '';
    // Координаты округляются до целых: на экране разница незаметна, а строка
    // пути (её переставляют каждый второй кадр) становится заметно короче.
    const r = v => Math.round(v);
    let d = (continueFromCurrent ? ' L ' : 'M ') + `${r(pts[0][0])},${r(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
        d += ` Q ${r(pts[i][0])},${r(pts[i][1])} ${r((pts[i][0] + pts[i + 1][0]) / 2)},${r((pts[i][1] + pts[i + 1][1]) / 2)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${r(last[0])},${r(last[1])}`;
    return d;
}

// Геометрия тракта: возвращает d ленты и d центральной жилы.
// bellyPoint — центр живота: вокруг него тракт сворачивается в петли.
function buildGutTractGeometry(axis, bellyPoint, cfg) {
    if (!axis.length) return { ribbon: '', core: '' };
    const total = axis[axis.length - 1].s || 1;
    const maxR = axis.reduce((m, p) => Math.max(m, p.r), 1);

    // Где по длине тракта находится живот (в единицах накопленной длины).
    let bellyS = total * 0.5, bellyR = maxR;
    if (bellyPoint) {
        let best = Infinity;
        axis.forEach(p => {
            const d = Math.hypot(p.x - bellyPoint.x, p.y - bellyPoint.y);
            if (d < best) { best = d; bellyS = p.s; bellyR = p.r; }
        });
    }
    const bellyReach = Math.max(24, bellyR * 1.9); // насколько далеко тянется зона петель

    const left = [], right = [], core = [];
    let phase = cfg.phase || 0;
    let prevS = axis[0].s;

    for (let i = 0; i < axis.length; i++) {
        const p = axis[i];
        // 0 в шее/хвосте → 1 в самом центре живота. Плавно, без ступеньки.
        const near = clamp01(1 - Math.abs(p.s - bellyS) / bellyReach);
        const belly = near * near * (3 - 2 * near); // smoothstep

        // Частота: в животе витки заметно чаще — это и читается как
        // "кишечник сложен змейкой", а не как одна волнистая труба.
        const waveLen = lerp(cfg.waveLength, cfg.waveLength / cfg.loopDensity, belly);
        phase += ((p.s - prevS) / Math.max(4, waveLen)) * Math.PI * 2;
        prevS = p.s;

        // Амплитуда ограничена радиусом тела в этой точке — тракт физически
        // не может прижаться к стенке или вылезти наружу.
        let amp = p.r * lerp(cfg.wave, cfg.bellyWave, belly);
        const off0 = Math.sin(phase);

        // Толщина: толще в животе, сходит на нет к голове и кончику хвоста,
        // иначе труба выглядит обрубленной.
        const endFade = clamp01(Math.min(p.s, total - p.s) / (total * 0.1));
        const w = Math.max(0.6, p.r * lerp(cfg.width, cfg.bellyWidth, belly) * (0.35 + 0.65 * endFade));
        // Труба вместе со своей толщиной обязана оставаться внутри тела:
        // прижатая к стенке кишка читается как трещина на коже, а не как
        // орган под ней.
        amp = Math.min(amp, Math.max(0, p.r * 0.72 - w));
        const off = off0 * amp;

        const cx = p.x + p.nx * off, cy = p.y + p.ny * off;
        left.push([cx + p.nx * w, cy + p.ny * w]);
        right.push([cx - p.nx * w, cy - p.ny * w]);
        core.push([cx, cy]);
    }

    // Кромки собираются КРИВЫМИ, а не отрезками: ломаная на витках кишечника
    // мгновенно читается как зигзаг из палок, а не как мягкая трубка.
    const ribbon = smoothPolyline(left, false) + ' ' + smoothPolyline(right.slice().reverse(), true) + ' Z';
    return { ribbon, core: smoothPolyline(core, false) };
}

// Узлы тракта: тень под трубой → сама труба с контуром → светлая жила.
// Создаются один раз, в tick() у них меняется только атрибут d.
function createGutTract(ctx) {
    const anatomy = ctx.anatomy;
    const palette = (anatomy.organs && anatomy.organs.palette) || {};
    const color = palette.gut || '#63212f';
    const group = svgEl('g', {
        class: 'worm-gut-tract',
        'clip-path': `url(#worm-hull-clip-${ctx.instanceId})`
    });
    // Отдельного узла-тени нет намеренно: строка пути тракта длинная (~3 КБ),
    // и переставлять её дважды за кадр — самая дорогая операция во всём
    // рендере. Роль тени и контура одновременно играет широкая тёмная
    // обводка самой трубы.
    const tube = svgEl('path', {
        d: '', fill: color, stroke: mixColor(color, GRIME_SHADOW, 0.55),
        'stroke-width': 3, 'stroke-linejoin': 'round', opacity: 0.95
    });
    const coreLine = svgEl('path', {
        d: '', fill: 'none', stroke: mixColor(color, GRIME_HIGHLIGHT, 0.5),
        'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.3
    });
    group.appendChild(tube);
    group.appendChild(coreLine);
    return { group, tube, coreLine };
}

// Пересчёт всех трёх копий силуэта + перетяжек + отражённого света + тени.
// Вызывается раз за кадр из tick(): создаётся ноль новых узлов, меняются
// только атрибуты уже существующих.
function updateBodyHull(built, circles) {
    const hull = built.hull, rings = built.rings, rim = built.rim;
    if (!hull) return;
    const W = hull.outlineWidth;

    for (let i = 0; i < hull.outlineCircles.length; i++) {
        const c = circles[i];
        const oc = hull.outlineCircles[i], cc = hull.clipCircles[i], rc = hull.rimCircles[i];
        if (!c || !(c.r > 0)) { oc.setAttribute('r', 0); cc.setAttribute('r', 0); rc.setAttribute('r', 0); continue; }
        oc.setAttribute('cx', c.x.toFixed(1)); oc.setAttribute('cy', c.y.toFixed(1)); oc.setAttribute('r', (c.r + W).toFixed(1));
        rc.setAttribute('cx', c.x.toFixed(1)); rc.setAttribute('cy', c.y.toFixed(1)); rc.setAttribute('r', (c.r + W * 0.45).toFixed(1));
        cc.setAttribute('cx', c.x.toFixed(1)); cc.setAttribute('cy', c.y.toFixed(1)); cc.setAttribute('r', c.r.toFixed(1));
    }

    for (let i = 0; i < hull.bridgeShapes.length; i++) {
        const a = circles[i], b = circles[i + 1];
        const ob = hull.outlineBridges[i], cb = hull.clipBridges[i], bs = hull.bridgeShapes[i], rb = hull.rimBridges[i];
        if (!a || !b || !(a.r > 0) || !(b.r > 0)) {
            ob.setAttribute('d', ''); cb.setAttribute('d', ''); bs.setAttribute('d', ''); rb.setAttribute('d', '');
            continue;
        }
        // ТАЛИЯ: мост уже соседних кругов. Без неё тело превращается в ровную
        // трубу постоянной ширины — сегменты перестают читаться как отдельные
        // вздутия, и силуэт выглядит надувным матрасом. Отрицательный отступ и
        // есть та самая перетяжка между секциями.
        const waist = -Math.min(a.r, b.r) * WORM_HULL_WAIST_RATIO;
        ob.setAttribute('d', bridgeQuadPath(a, b, waist + W));
        rb.setAttribute('d', bridgeQuadPath(a, b, waist + W * 0.45));
        const plain = bridgeQuadPath(a, b, waist);
        cb.setAttribute('d', plain);
        bs.setAttribute('d', plain);
        // Цвет моста — среднее между соседями, поэтому переход тона по телу
        // остаётся непрерывным и промежуток не выглядит "заплаткой".
        if (a.color && b.color) bs.setAttribute('fill', mixColor(a.color, b.color, 0.5));
    }

    // Перетяжки: ставятся в точку касания соседних кругов и разворачиваются
    // поперёк оси тела. Толщина валика — от размера меньшего из соседей.
    for (let i = 0; i < rings.rings.length; i++) {
        const a = circles[i + 1], b = circles[i + 2];
        const r = rings.rings[i];
        if (!a || !b || !(a.r > 0) || !(b.r > 0)) { r.g.setAttribute('opacity', 0); continue; }
        r.g.setAttribute('opacity', 1);
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const t = (a.r + (dist - a.r - b.r) * 0.5) / dist; // середина перекрытия
        const px = a.x + dx * t, py = a.y + dy * t;
        const deg = Math.atan2(dy, dx) * 180 / Math.PI;
        const half = Math.min(a.r, b.r) * (1 - WORM_HULL_WAIST_RATIO) * 1.06;
        const w = Math.max(2.4, half * 0.26);
        r.shade.setAttribute('ry', half.toFixed(1)); r.shade.setAttribute('rx', w.toFixed(1));
        r.light.setAttribute('ry', (half * 0.96).toFixed(1)); r.light.setAttribute('rx', (w * 0.6).toFixed(1));
        r.light.setAttribute('cx', (w * 1.15).toFixed(1));
        r.crease.setAttribute('ry', (half * 0.99).toFixed(1)); r.crease.setAttribute('rx', Math.max(1.2, w * 0.42).toFixed(1));
        r.g.setAttribute('transform', `translate(${px.toFixed(1)},${py.toFixed(1)}) rotate(${deg.toFixed(1)})`);
    }

    // Тень на полу — по нижнему краю напольной части.
    if (built.floorShadow) {
        let minX = Infinity, maxX = -Infinity, bottom = -Infinity;
        circles.forEach(c => {
            if (!c || !(c.r > 0)) return;
            minX = Math.min(minX, c.x - c.r); maxX = Math.max(maxX, c.x + c.r);
            bottom = Math.max(bottom, c.y + c.r);
        });
        if (minX < maxX) {
            built.floorShadow.setAttribute('cx', ((minX + maxX) / 2).toFixed(1));
            built.floorShadow.setAttribute('cy', (bottom + 4).toFixed(1));
            built.floorShadow.setAttribute('rx', ((maxX - minX) / 2 + 10).toFixed(1));
            built.floorShadow.setAttribute('ry', '11');
        }
    }
}

function buildWormSVGGroup(model, instanceId) {
    const root = svgEl('g', { class: 'worm-root' });

    // Общий <defs> на весь инстанс персонажа — сюда складываются все
    // градиенты и клипы (голова, сегменты, хвост, уши, глаза, анатомия).
    const defs = svgEl('defs');
    root.appendChild(defs);

    const anatomy = getAnatomy(model);
    // Контекст инстанса: всё, что нужно любому строителю слоя. Передаётся
    // одним объектом, чтобы не тащить 5 аргументов через каждую функцию.
    const ctx = { defs, instanceId, anatomy, gradCache: Object.create(null), neckColor: null,
                  // база для отражённого света: тёплый оттенок самой кожи,
                  // а не производная от тёмного контура (иначе кайма выходит
                  // грязно-бежевой и читается как ореол, а не как свет)
                  rimBaseColor: model.belly.fill };

    // Порядок цепочки от головы к хвосту: 2 фикс. сегмента, живот, N
    // растущих сегментов, хвост.
    const chainParts = [];
    model.fixedSegments.forEach((seg, i) => chainParts.push({ name: `segment-${i + 1}`, data: seg }));
    const bellyIdx = model.fixedSegments.length + 1;
    chainParts.push({ name: 'belly', data: model.belly });
    model.growingSegments.forEach((seg, i) => chainParts.push({ name: `growing-${i + 1}`, data: seg }));

    const totalWithTail = chainParts.length + 1; // +1 за хвост
    const tailIdx = totalWithTail;

    // Реальный отрисованный радиус последнего (предхвостового) growing-
    // сегмента — от него считается основание хвоста.
    const lastGrowingSeg = model.growingSegments.length
        ? model.growingSegments[model.growingSegments.length - 1]
        : null;
    const tailAttachRadius = lastGrowingSeg
        ? lastGrowingSeg.radius * lastGrowingSeg.stretchX * lastGrowingSeg.scale
        : 15;

    // ---------- ПЕРЕХОД ЧЕРВЬ → ГОЛОВА: ПОДМЕШИВАНИЕ ЦВЕТА ШЕИ ----------
    // Цвет сегментов-шеи подмешивается к цвету головы, а сама голова снизу
    // получает "юбку" цветом сегмента-1 — стык перестаёт быть границей двух
    // разных существ. Модель при этом не меняется: подмешивает рендерер.
    const neckBlend = (anatomy.enabled && anatomy.skin && anatomy.skin.neckBlend) || null;
    const blendByPart = Object.create(null);
    if (neckBlend) {
        model.fixedSegments.forEach((seg, i) => {
            const amt = neckBlend[i];
            if (amt == null || amt <= 0) return;
            blendByPart[`segment-${i + 1}`] = {
                fill: mixColor(seg.fill, model.head.fill, amt),
                stroke: mixColor(seg.stroke, model.head.stroke, amt * 0.7)
            };
        });
        const seg1 = blendByPart['segment-1'];
        ctx.neckColor = seg1 ? seg1.fill : model.fixedSegments[0].fill;
    }

    // Zона анатомии по имени части — задаётся ОДИН раз здесь, чтобы правила
    // "что где просвечивает" не были размазаны по коду.
    function partAnatOpts(name, idx) {
        const isVertical = idx <= bellyIdx - 1; // сегменты между головой и животом
        const opts = {
            axis: isVertical ? 'y' : 'x',
            organZone: null,
            coat: { rings: true, vessel: !isVertical },
            surface: {}
        };
        if (name === 'belly') {
            opts.organZone = 'core';
            opts.axis = 'x';       // живот лежит на полу, растёт "вперёд" по X
            opts.coat.vessel = true;
        } else if (name === 'segment-1') {
            opts.organZone = 'neck';
            opts.coat.folds = true;    // свиные складки у "плеча"
            opts.coat.bristle = true;  // и щетина — ближе к голове кожа свиная
            opts.coat.rings = true;
            opts.surface.contactTop = true; // тень от головы, лежащей сверху
        } else if (name === 'segment-2') {
            opts.organZone = 'neck';
            opts.coat.folds = true;
            opts.coat.clitellum = true; // поясок-воротник: граница двух типов кожи
            opts.surface.contactTop = true;
            opts.surface.contactStrength = 0.5;
        } else if (name.indexOf('growing-') === 0) {
            opts.organZone = 'floor';
        }
        return opts;
    }

    // Z-порядок ("слои", как в фотошопе), СНИЗУ ВВЕРХ:
    // 1) напольная часть (growing-сегменты + хвост) — самый нижний слой;
    // 2) вертикальная часть тела (fixedSegments, между головой и животом);
    // 3) живот — поверх ВСЕХ остальных сегментов тела;
    // 4) голова — поверх абсолютно всего, рисуется отдельным шагом ниже.
    // Сторона (напольная / вертикальная / живот) — ПЕРВЫЙ, приоритетный
    // критерий сортировки, "расстояние от живота" — только второй.
    const allParts = chainParts.map((part, i) => ({ ...part, idx: i + 1, isTail: false }));
    allParts.push({ name: 'tail', data: model.tail, idx: tailIdx, isTail: true });
    function bodyLayerGroup(idx) {
        if (idx === bellyIdx) return 2;       // живот
        return idx > bellyIdx ? 0 : 1;        // 0 = напольная часть, 1 = вертикальная часть тела
    }
    allParts.sort((a, b) => {
        const groupA = bodyLayerGroup(a.idx);
        const groupB = bodyLayerGroup(b.idx);
        if (groupA !== groupB) return groupA - groupB;
        const distA = Math.abs(a.idx - bellyIdx);
        const distB = Math.abs(b.idx - bellyIdx);
        if (distA !== distB) return distB - distA;
        return a.idx - b.idx;
    });

    // ---------- ЕДИНЫЙ СИЛУЭТ: СЛОИ ПОД ТЕЛОМ ----------
    // Цепочка кругов силуэта: якорь внутри головы (чтобы шея входила в неё
    // без стыка) → сегменты → живот → растущие → основание хвоста.
    const hullCount = 1 + model.fixedSegments.length + 1 + model.growingSegments.length + 1;
    const outlineColor = mixColor(model.belly.stroke, GRIME_SHADOW, 0.25);
    const hull = createHullLayers(ctx, hullCount, outlineColor, 2.4);
    const rings = createRingLayers(ctx, Math.max(0, hullCount - 2));

    // Падающая тень на "полу" — тело перестаёт висеть в пустоте.
    const floorShadow = svgEl('ellipse', {
        class: 'worm-floor-shadow', cx: 0, cy: 0, rx: 0, ry: 0,
        fill: ensureSoftGradient(ctx, `worm-floor-shadow-${instanceId}`, '#000000', 1),
        opacity: 0.34
    });
    root.appendChild(floorShadow);
    root.appendChild(hull.outline);
    root.appendChild(hull.rimGroup);
    root.appendChild(hull.bridges);

    const segmentRefs = [];
    const organRefs = [];   // плоский список всех органов — для дешёвого tick()
    const muscleRefs = [];
    let tailBuilt = null;
    allParts.forEach(part => {
        if (part.isTail) {
            tailBuilt = buildTailNode(part.data, ctx, tailAttachRadius);
            root.appendChild(tailBuilt.group);
            if (tailBuilt.anat) {
                tailBuilt.anat.organs.forEach(o => organRefs.push(o));
                if (tailBuilt.anat.muscleGroup) muscleRefs.push(tailBuilt.anat.muscleGroup);
            }
        } else {
            const anatOpts = partAnatOpts(part.name, part.idx);
            const blend = blendByPart[part.name];
            const built = buildSegmentNode(part.name, part.data, ctx, {
                axis: anatOpts.axis,
                organZone: anatOpts.organZone,
                coat: anatOpts.coat,
                surface: anatOpts.surface,
                blendFill: blend ? blend.fill : null,
                blendStroke: blend ? blend.stroke : null
            });
            root.appendChild(built.group);
            segmentRefs.push({ idx: part.idx, name: part.name, radius: part.data.radius * part.data.scale, ...built });
            if (built.anat) {
                built.anat.organs.forEach(o => organRefs.push(o));
                if (built.anat.muscleGroup) muscleRefs.push(built.anat.muscleGroup);
            }
        }
    });

    // Кишечный тракт — поверх заливки тела (он просвечивает сквозь кожу),
    // но ПОД перетяжками и головой. Живёт на уровне всего тела, а не внутри
    // сегментов: иначе его невозможно сделать неразрывным.
    let gutTract = null;
    if (anatomy.enabled && anatomy.organs && (anatomy.organs.visibility || 0) > 0.01) {
        gutTract = createGutTract(ctx);
        root.appendChild(gutTract.group);
    }

    // Перетяжки — поверх тела, но ПОД головой: они принадлежат туше, а не
    // морде. (Отражённый свет живёт ниже, в hull.rimGroup — ему нужно быть
    // ПОД телом, чтобы наружу выходила только кайма.)
    root.appendChild(rings.group);

    // Голова — последняя, поверх всего.
    const headBuilt = buildHeadNode(model, ctx);
    root.appendChild(headBuilt.group);

    // Шрамы — монтируются как дети scarLayer конкретного сегмента-хозяина,
    // поэтому автоматически наследуют его текущий transform/scale.
    const scarHostByPart = { head: headBuilt.scarLayer, tail: tailBuilt.scarLayer };
    segmentRefs.forEach(seg => { scarHostByPart[seg.name] = seg.scarLayer; });
    (model.scars || []).forEach(scar => {
        const host = scarHostByPart[scar.part];
        if (!host) return;
        const hostRadius = scar.part === 'tail' ? tailBuilt.baseRadius :
            scar.part === 'head' ? headBuilt.rx :
            (segmentRefs.find(s => s.name === scar.part) || {}).radius || 15;
        host.appendChild(buildScarNode(scar, hostRadius));
    });

    return {
        root,
        totalWithTail,
        tail: { ...tailBuilt, idx: tailIdx },
        segments: segmentRefs,
        head: headBuilt,
        organs: organRefs,
        muscles: muscleRefs,
        hull, rings, floorShadow, gutTract,
        anatomy
    };
}

// ---------- ПУБЛИЧНЫЙ API РЕНДЕРЕРА ----------
const WormRenderer = {
    mount(container, model, opts) {
        opts = Object.assign({
            context: 'main',
            wander: false,
            blink: true,
            anchorX: 0.5,
            anchorY: 0.55,
            // Зеркалит всю модельку по горизонтали — цепочка тела тогда
            // растёт вправо от головы, а не влево.
            flip: false,
            // false — тело неподвижно застыло в базовой позе (нужно для
            // сцен, где персонаж лежит смирно, например кормление).
            idleWave: true,
            // 'center' (по умолчанию) — живот раздувается симметрично.
            // 'bottom' — нижний край живота остаётся на месте, раздувается
            // только вверх. 'top' — наоборот.
            bellyGrowthAnchor: 'center',
            // 'standing' (по умолчанию) / 'lying' (Чревоугодие).
            pose: 'standing'
        }, opts || {});
        const instanceId = ++wormInstanceCounter;

        container.innerHTML = '';
        const svg = svgEl('svg', { class: `worm-stage-svg worm-context-${opts.context}` });
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.display = 'block';
        svg.style.overflow = 'visible';
        container.appendChild(svg);

        // Два постоянных слоя внутри svg, которые НЕ трогает rebuild():
        // slimeLayer (след слизи, под персонажем) и charLayer (сам персонаж).
        const slimeLayer = svgEl('g', { class: 'worm-slime-layer' });
        const charLayer = svgEl('g', { class: 'worm-char-layer' });
        svg.appendChild(slimeLayer);
        svg.appendChild(charLayer);

        const state = {
            baseModel: model,
            override: null,
            built: null,
            animTime: 0,
            wormX: 0,
            wormY: 0,
            targetX: 0,
            targetY: 0,
            blinkClock: 0,
            faceClock: 0,
            rafId: null,
            lastFrameTs: null,
            // 0 = стоит на месте, 1 = идёт — рычаг интенсивности ТОЛЬКО
            // виляния.
            moveIntensity: 0,
            // 0..1 — от ФАКТИЧЕСКОЙ мгновенной скорости перемещения.
            speedIntensity: 0,
            nextMoveAt: null,
            // Аккумуляторы фазы: покачивание цепи, "флик" кончика хвоста и
            // пульсация внутренних органов. НЕ путать с animTime: эти поля
            // прирастают ТЕКУЩЕЙ скоростью каждый кадр, а не умножаются на
            // неё постфактум (см. блок про "эффект волчка" у констант).
            chainWigglePhase: 0,
            tailWagPhase: 0,
            organPhase: 0,
            gutPhase: 0,
            gutSkipFrame: false,
            activeSlimeTrail: null,
            slimeTrails: [],
            // "Горячий" канал для непрерывных обновлений от мини-игр — не
            // трогает baseModel/override, не вызывает пересборку SVG.
            livePose: {
                tailBendAngle: 0,   // градусы поворота хвоста вокруг точки крепления
                eyelidLevel: null,  // 0..1 — подменяет базовый уровень век обоих глаз
                bellyScale: null,   // множитель радиуса живота (1 = обычный)
                mouthOpenness: null, // 0..1 — подменяет head.mouth.openness
                mouthCurve: null,    // подменяет head.mouth.curve
                // Анатомические "живые" каналы — устроены ровно так же, как
                // всё остальное тело: null = брать из модели/оверрайда.
                // organPulseScale — множитель амплитуды пульсации органов
                // (например, "сытое" бурление после кормления или замирание
                // при испуге); organVisibility — временная подмена степени
                // просвечивания органов (кожа натянулась — видно лучше).
                organPulseScale: null,
                organVisibility: null,

                // ---------- МИМИКА ----------
                // Всё опционально: null = "не вмешиваюсь, работает
                // собственная жизнь персонажа" (см. idle-мимику в tick).
                headTilt: null,      // градусы наклона головы вокруг основания шеи
                gazeX: null,         // -1..1 — куда смотрит (доля от размера глаза)
                gazeY: null,
                browRaise: null,     // -1..1 — брови вниз (хмурится) / вверх (удивлён)
                earTilt: null,       // градусы к базовому развороту обоих ушей
                earTiltLeft: null,   // то же по отдельности
                earTiltRight: null,
                snoutTwitch: null,   // 0..1 — принюхивается
                cheekPuff: null,     // 0..1 — щёки надуты (например, полный рот)
                jawDrop: null        // 0..1 — челюсть опущена; по умолчанию следует за ртом
            }
        };

        function mergedModel() {
            return window.WormModelAPI.mergeWormOverride(state.baseModel, state.override);
        }

        function syncViewportSize() {
            const rect = container.getBoundingClientRect();
            const w = Math.max(1, rect.width);
            const h = Math.max(1, rect.height);
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            state.wormX = state.wormX || w * opts.anchorX;
            state.wormY = state.wormY || h * opts.anchorY;
            state.targetX = state.wormX;
            state.targetY = state.wormY;
        }

        function rootTransform() {
            const flipPart = opts.flip ? ' scale(-1,1)' : '';
            return `translate(${state.wormX.toFixed(1)},${state.wormY.toFixed(1)})${flipPart}`;
        }

        function rebuild() {
            const m = mergedModel();
            while (charLayer.firstChild) charLayer.removeChild(charLayer.firstChild);
            state.built = buildWormSVGGroup(m, instanceId);
            charLayer.appendChild(state.built.root);
            state.built.root.setAttribute('transform', rootTransform());
        }

        syncViewportSize();
        rebuild();

        // ---------- СЛИЗИСТЫЙ СЛЕД (pose:'standing' + wander) ----------
        function randomBlobPath(cx, cy, rng, r) {
            const n = 6;
            const pts = [];
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                const rr = r * (0.6 + rng() * 0.7);
                pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.75]);
            }
            let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} `;
            for (let i = 1; i <= n; i++) {
                const p = pts[i % n];
                d += `L ${p[0].toFixed(1)},${p[1].toFixed(1)} `;
            }
            return d + 'Z';
        }

        function startSlimeTrail(x, y) {
            const g = svgEl('g', { class: 'worm-slime-trail' });
            const rng = mulberry32(hashStringSeed(`slime-${instanceId}-${state.slimeTrails.length}-${Math.round(x)}-${Math.round(y)}`));
            const blot = svgEl('path', { d: randomBlobPath(x, y, rng, WORM_SLIME_WIDTH * 0.55), fill: WORM_SLIME_COLOR });
            const stroke = svgEl('path', {
                d: `M ${x.toFixed(1)},${y.toFixed(1)}`,
                fill: 'none', stroke: WORM_SLIME_COLOR, 'stroke-width': WORM_SLIME_WIDTH,
                'stroke-linecap': 'round', 'stroke-linejoin': 'round'
            });
            g.appendChild(blot);
            g.appendChild(stroke);
            slimeLayer.appendChild(g);
            state.slimeTrails.push({ g, stroke, points: [{ x, y }], finishedAt: null });
            state.activeSlimeTrail = state.slimeTrails[state.slimeTrails.length - 1];
        }

        function extendSlimeTrail(x, y) {
            const trail = state.activeSlimeTrail;
            if (!trail) return;
            const last = trail.points[trail.points.length - 1];
            if (Math.hypot(x - last.x, y - last.y) < WORM_SLIME_MIN_STEP) return;
            trail.points.push({ x, y });
            const d = trail.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
            trail.stroke.setAttribute('d', d);
        }

        function updateSlimeTrail(now, isMoving, anchor) {
            if (isMoving && anchor) {
                if (!state.activeSlimeTrail) startSlimeTrail(anchor.x, anchor.y);
                else extendSlimeTrail(anchor.x, anchor.y);
            } else if (state.activeSlimeTrail) {
                state.activeSlimeTrail.finishedAt = now;
                state.activeSlimeTrail = null;
            }

            for (let i = state.slimeTrails.length - 1; i >= 0; i--) {
                const trail = state.slimeTrails[i];
                if (trail.finishedAt == null) continue;
                const elapsed = now - trail.finishedAt;
                if (elapsed >= WORM_SLIME_FADE_MS) {
                    trail.g.remove();
                    state.slimeTrails.splice(i, 1);
                } else {
                    trail.g.setAttribute('opacity', (1 - elapsed / WORM_SLIME_FADE_MS).toFixed(3));
                }
            }
        }

        function tick(now) {
            if (!state.lastFrameTs) state.lastFrameTs = now;
            const dt = now - state.lastFrameTs;
            state.lastFrameTs = now;
            const dtSec = Math.min(0.25, Math.max(0, dt / 1000)); // клэмп на случай подвисания вкладки
            state.animTime += dtSec * WORM_ANIM_TIME_PER_SEC;

            // ---------- ДВИЖЕНИЕ К ЦЕЛИ + РАСПИСАНИЕ "ПРОГУЛОК" ----------
            let instSpeed = 0; // px/сек, фактическая мгновенная скорость этого кадра
            if (opts.wander) {
                const dx = state.targetX - state.wormX;
                const dy = state.targetY - state.wormY;
                const moveFactor = 1 - Math.pow(WORM_WANDER_MOVE_BASE, dtSec);
                const stepX = dx * moveFactor;
                const stepY = dy * moveFactor;
                state.wormX += stepX;
                state.wormY += stepY;
                instSpeed = dtSec > 0 ? Math.hypot(stepX, stepY) / dtSec : 0;
            }
            const dist = opts.wander ? Math.hypot(state.targetX - state.wormX, state.targetY - state.wormY) : 0;
            const isMoving = opts.wander && dist > WORM_MOVE_EPS;
            if (opts.wander) {
                if (isMoving) {
                    state.nextMoveAt = null;
                } else if (state.nextMoveAt == null) {
                    state.nextMoveAt = now + WORM_IDLE_PAUSE_MIN + Math.random() * (WORM_IDLE_PAUSE_MAX - WORM_IDLE_PAUSE_MIN);
                } else if (now >= state.nextMoveAt) {
                    const rect = container.getBoundingClientRect();
                    state.targetX = rect.width * 0.2 + Math.random() * (rect.width * 0.6);
                    state.targetY = rect.height * 0.4 + Math.random() * (rect.height * 0.3);
                    state.nextMoveAt = null;
                }
            }
            const intensityFactor = 1 - Math.pow(WORM_MOVE_INTENSITY_SMOOTH_BASE, dtSec);
            state.moveIntensity += ((isMoving ? 1 : 0) - state.moveIntensity) * intensityFactor;

            const speedIntensityTarget = Math.min(1, instSpeed / WORM_SPEED_REF_PX_PER_SEC);
            const speedIntensityFactor = 1 - Math.pow(WORM_SPEED_INTENSITY_SMOOTH_BASE, dtSec);
            state.speedIntensity += (speedIntensityTarget - state.speedIntensity) * speedIntensityFactor;

            if (state.built) {
                state.built.root.setAttribute('transform', rootTransform());

                // Модель читаем один раз за кадр и переиспользуем ниже.
                const mm = mergedModel();

                const bellySeg = state.built.segments.find(s => s.name === 'belly');
                const bellyFactor = state.livePose.bellyScale != null ? state.livePose.bellyScale : 1;
                // Раздувшийся живот растёт "вперёд" (в сторону хвоста) от
                // неподвижной точки стыка с головным соседом, а сегменты
                // дальше по цепочке отодвигаются на ту же величину.
                const bellyGrowX = bellySeg ? Math.max(0, bellySeg.baseRx * (bellyFactor - 1)) : 0;
                const bellyPushGap = bellyGrowX * 2;
                const bellyIdx = bellySeg ? bellySeg.idx : -1;

                let lastGrowLocal = null;
                const lastGrowingName = mm.growingSegments.length ? `growing-${mm.growingSegments.length}` : null;
                let breathWave = 0;

                // Круги единого силуэта, по порядку цепочки: [0] — якорь
                // внутри головы (чтобы шея входила в череп без стыка),
                // дальше сегменты по своим idx, последним — основание
                // хвоста. Заполняется теми же вычислениями, что уже двигают
                // сами части: силуэт не может разойтись с телом, потому что
                // считается из одних и тех же чисел.
                const hullCircles = new Array(state.built.tail.idx + 1).fill(null);
                hullCircles[0] = {
                    x: 0, y: 0,
                    r: state.built.head.ry * 0.42,
                    color: state.built.head.fillColor
                };

                if (opts.pose === 'lying') {
                    // ---------- СТАРАЯ РАСКЛАДКА: ОДНА ПРЯМАЯ ЛИНИЯ ----------
                    // Логика не тронута — нужна Чревоугодию.
                    const wave = opts.idleWave ? Math.sin(state.animTime) * 8 : 0;
                    state.built.head.group.setAttribute('transform', `translate(0,${wave.toFixed(2)})`);

                    state.built.segments.forEach(seg => {
                        const extraGap = seg.idx > bellyIdx ? bellyPushGap : 0;
                        const sx = -(seg.idx * WORM_SEGMENT_SPACING + WORM_CHAIN_HEAD_GAP + extraGap);
                        const sy = opts.idleWave ? (Math.sin(state.animTime + seg.idx * 0.6) * 12 + seg.idx * 4) : 0;
                        seg.group.setAttribute('transform', `translate(${sx.toFixed(1)},${sy.toFixed(1)})`);
                        hullCircles[seg.idx] = { x: sx, y: sy, r: seg.baseRx, color: seg.fillColor };
                    });

                    const tsx = -(state.built.tail.idx * WORM_SEGMENT_SPACING + WORM_CHAIN_HEAD_GAP + bellyPushGap);
                    const tsy = opts.idleWave ? (Math.sin(state.animTime + state.built.tail.idx * 0.6) * 12 + state.built.tail.idx * 4) : 0;
                    state.built.tail.group.setAttribute('transform', `translate(${tsx.toFixed(1)},${tsy.toFixed(1)})`);
                    hullCircles[state.built.tail.idx] = {
                        x: tsx, y: tsy, r: state.built.tail.baseRadius, color: mm.tail.fill
                    };
                    if (state.built.tail.bendGroup) {
                        state.built.tail.bendGroup.setAttribute('transform', `rotate(${state.livePose.tailBendAngle.toFixed(1)})`);
                    }
                } else {
                    // ---------- "СТОЯЩАЯ" ПОЗА ----------
                    state.built.head.group.setAttribute('transform', 'translate(0,0)');

                    const floorY = bellyIdx * WORM_VERTICAL_SPACING + WORM_CHAIN_HEAD_GAP;

                    // Однополярная волна дыхания: стартует с 0 (стандартный
                    // радиус), поднимается до 1 и возвращается к 0.
                    breathWave = opts.idleWave ? (1 - Math.cos(state.animTime * WORM_BREATH_SPEED)) / 2 : 0;

                    state.built.segments.forEach(seg => {
                        if (seg.idx > bellyIdx) return;
                        const vy = seg.idx * WORM_VERTICAL_SPACING + WORM_CHAIN_HEAD_GAP;
                        seg.group.setAttribute('transform', `translate(0,${vy.toFixed(1)})`);
                        hullCircles[seg.idx] = { x: 0, y: vy, r: seg.baseRx, color: seg.fillColor };
                        const breathRatio = WORM_BREATH_RATIO[seg.name];
                        if (breathRatio != null) {
                            const breathFactor = 1 + breathWave * WORM_BREATH_AMP * breathRatio;
                            hullCircles[seg.idx].r = seg.baseRx * breathFactor;
                            seg.ellipse.setAttribute('rx', (seg.baseRx * breathFactor).toFixed(2));
                            seg.ellipse.setAttribute('ry', (seg.baseRy * breathFactor).toFixed(2));
                            // Анатомические слои дышат ВМЕСТЕ с сегментом:
                            // одна группа = один setAttribute, вся стопка
                            // слоёв внутри масштабируется автоматически по
                            // SVG-иерархии (тот же принцип, что и у шрамов).
                            if (seg.anat) {
                                seg.anat.group.setAttribute('transform', `scale(${breathFactor.toFixed(4)})`);
                            }
                        }
                    });

                    // Напольная часть (growing-сегменты + хвост) — простая
                    // кинематическая цепь: каждое звено строится СТРОГО от
                    // позиции предыдущего, поэтому разъединиться геометрически
                    // невозможно ни при какой амплитуде покачивания.
                    const moveStretch = WORM_MOVE_SPACING_EXTRA * state.speedIntensity;
                    const wiggleSpeed = lerp(WORM_CHAIN_WIGGLE_IDLE_SPEED, WORM_CHAIN_WIGGLE_MOVE_SPEED, state.moveIntensity);
                    const wiggleAmpDeg = lerp(WORM_CHAIN_WIGGLE_IDLE_DEG, WORM_CHAIN_WIGGLE_MOVE_DEG, state.moveIntensity);
                    const tailExtraWagDeg = lerp(WORM_TAIL_EXTRA_WAG_IDLE_DEG, WORM_TAIL_EXTRA_WAG_MOVE_DEG, state.moveIntensity);
                    const DEG2RAD = Math.PI / 180;

                    state.chainWigglePhase += dtSec * WORM_ANIM_TIME_PER_SEC * wiggleSpeed;
                    state.tailWagPhase += dtSec * WORM_ANIM_TIME_PER_SEC * wiggleSpeed * 1.3;

                    const floorSegments = state.built.segments
                        .filter(seg => seg.idx > bellyIdx)
                        .sort((a, b) => a.idx - b.idx);

                    let chainX = -bellyPushGap;
                    let chainY = floorY;
                    let prevRadius = bellySeg ? bellySeg.baseRx : 15;
                    floorSegments.forEach(seg => {
                        const stepsFromBelly = seg.idx - bellyIdx;
                        const wiggleDeg = opts.idleWave ? Math.sin(state.chainWigglePhase + stepsFromBelly * WORM_CHAIN_PHASE_STEP) * wiggleAmpDeg : 0;
                        const angleRad = (180 + wiggleDeg) * DEG2RAD;
                        const linkLength = floorLinkBaseLength(prevRadius, seg.baseRx) + moveStretch;
                        chainX += linkLength * Math.cos(angleRad);
                        chainY += linkLength * Math.sin(angleRad);
                        seg.group.setAttribute('transform', `translate(${chainX.toFixed(1)},${chainY.toFixed(1)})`);
                        hullCircles[seg.idx] = { x: chainX, y: chainY, r: seg.baseRx, color: seg.fillColor };
                        prevRadius = seg.baseRx;
                        if (seg.name === lastGrowingName) {
                            lastGrowLocal = { x: chainX, y: chainY };
                        }
                    });

                    // Хвост — последнее звено той же цепи.
                    const tailStepsFromBelly = state.built.tail.idx - bellyIdx;
                    const tailWiggleDeg = opts.idleWave ? Math.sin(state.chainWigglePhase + tailStepsFromBelly * WORM_CHAIN_PHASE_STEP) * wiggleAmpDeg : 0;
                    const tailAngleDeg = 180 + tailWiggleDeg;
                    const tailAngleRad = tailAngleDeg * DEG2RAD;
                    const tailLinkLength = floorLinkBaseLength(prevRadius, state.built.tail.baseRadius) + moveStretch;
                    chainX += tailLinkLength * Math.cos(tailAngleRad);
                    chainY += tailLinkLength * Math.sin(tailAngleRad);
                    state.built.tail.group.setAttribute('transform', `translate(${chainX.toFixed(1)},${chainY.toFixed(1)})`);
                    hullCircles[state.built.tail.idx] = {
                        x: chainX, y: chainY, r: state.built.tail.baseRadius, color: mm.tail.fill
                    };
                    if (state.built.tail.bendGroup) {
                        const extraWag = opts.idleWave ? Math.sin(state.tailWagPhase + 1.7) * tailExtraWagDeg : 0;
                        const totalRotate = (tailAngleDeg - 180) + extraWag + state.livePose.tailBendAngle;
                        state.built.tail.bendGroup.setAttribute('transform', `rotate(${totalRotate.toFixed(1)})`);
                    }

                    if (opts.wander) {
                        const flip = opts.flip;
                        const anchorWorld = lastGrowLocal ? {
                            x: state.wormX + (flip ? -lastGrowLocal.x : lastGrowLocal.x),
                            y: state.wormY + lastGrowLocal.y
                        } : null;
                        updateSlimeTrail(now, isMoving, anchorWorld);
                    }
                }

                if (bellySeg) {
                    // Дыхание живота умножается на bellyFactor (раздутие из
                    // мини-игр через livePose.bellyScale), а не заменяет его.
                    const bellyBreathFactor = 1 + breathWave * WORM_BREATH_AMP * (WORM_BREATH_RATIO.belly || 0);
                    const effectiveBellyFactor = bellyFactor * bellyBreathFactor;
                    const newRx = bellySeg.baseRx * effectiveBellyFactor;
                    const newRy = bellySeg.baseRy * effectiveBellyFactor;
                    let cy = 0;
                    if (opts.bellyGrowthAnchor === 'bottom') cy = -(newRy - bellySeg.baseRy);
                    else if (opts.bellyGrowthAnchor === 'top') cy = (newRy - bellySeg.baseRy);
                    // По X живот всегда "растёт вперёд": локальный +X — это
                    // сторона стыка с головным соседом, она остаётся на месте.
                    const cx = -bellyGrowX;
                    bellySeg.ellipse.setAttribute('rx', newRx.toFixed(2));
                    bellySeg.ellipse.setAttribute('ry', newRy.toFixed(2));
                    bellySeg.ellipse.setAttribute('cx', cx.toFixed(2));
                    bellySeg.ellipse.setAttribute('cy', cy.toFixed(2));
                    if (bellySeg.shine) {
                        bellySeg.shine.setAttribute('cx', (cx - newRx * 0.25).toFixed(2));
                        bellySeg.shine.setAttribute('cy', (cy - newRy * 0.4).toFixed(2));
                        bellySeg.shine.setAttribute('rx', (newRx * 0.38).toFixed(2));
                        bellySeg.shine.setAttribute('ry', (newRy * 0.22).toFixed(2));
                    }
                    // Анатомия живота повторяет ровно ту же трансформацию,
                    // что и его заливка: смещение центра + масштаб. Один
                    // setAttribute на весь слоёный "пирог" — внутренности,
                    // мышцы, кольца и блики растягиваются вместе с животом
                    // (и, соответственно, честно раздуваются в Чревоугодии).
                    if (bellySeg.anat) {
                        bellySeg.anat.group.setAttribute('transform',
                            `translate(${cx.toFixed(2)},${cy.toFixed(2)}) scale(${effectiveBellyFactor.toFixed(4)})`);
                    }
                    // Живот в силуэте — с уже раздутыми размерами и смещённым
                    // центром: единый контур обязан повторять раздутие, иначе
                    // при кормлении тело вылезет за собственную обводку.
                    const bellyCircle = hullCircles[bellySeg.idx];
                    if (bellyCircle) {
                        bellyCircle.x += cx;
                        bellyCircle.y += cy;
                        bellyCircle.r = Math.max(newRx, newRy);
                    }
                }

                // Единый силуэт, перетяжки, отражённый свет и тень на полу.
                updateBodyHull(state.built, hullCircles);

                // ---------- ЕДИНЫЙ КИШЕЧНЫЙ ТРАКТ ----------
                // Пересчитывается из тех же кругов, что и силуэт, поэтому
                // повторяет любой изгиб тела и раздутие живота без единой
                // отдельной координаты. Фаза перистальтики — отдельный
                // аккумулятор от dt (тот же принцип, что у прочих анимаций).
                state.gutSkipFrame = !state.gutSkipFrame;
                if (state.built.gutTract && !state.gutSkipFrame) {
                    const anat = mm.anatomy && mm.anatomy.enabled ? mm.anatomy : null;
                    const organs = anat && anat.organs ? anat.organs : null;
                    const cfg = organs && organs.tract ? organs.tract : null;
                    if (cfg) {
                        state.gutPhase += dtSec * (cfg.speed != null ? cfg.speed : 0.32);
                        const axis = sampleBodyAxis(hullCircles, 3.4);
                        const geom = buildGutTractGeometry(axis, bellySeg ? hullCircles[bellySeg.idx] : null, {
                            phase: state.gutPhase,
                            width: cfg.width, bellyWidth: cfg.bellyWidth,
                            wave: cfg.wave, bellyWave: cfg.bellyWave,
                            waveLength: cfg.waveLength, loopDensity: cfg.loopDensity
                        });
                        state.built.gutTract.tube.setAttribute('d', geom.ribbon);
                        state.built.gutTract.coreLine.setAttribute('d', geom.core);
                        const liveVis = state.livePose.organVisibility;
                        const baseVis = liveVis != null ? liveVis : (organs.visibility != null ? organs.visibility : 0.6);
                        state.built.gutTract.group.setAttribute('opacity',
                            clamp01(baseVis * (cfg.visibility != null ? cfg.visibility : 0.85)).toFixed(3));
                    }
                }

                // ---------- ПУЛЬСАЦИЯ ВНУТРЕННИХ ОРГАНОВ ----------
                // Framerate-independent: фаза — отдельный аккумулятор,
                // прирастающий dtSec * текущая скорость (см. "эффект волчка").
                // Скорость может меняться на лету (livePose/оверрайд), поэтому
                // умножать общее накопленное время на неё нельзя.
                if (state.built.organs && state.built.organs.length) {
                    const anatomy = mm.anatomy && mm.anatomy.enabled ? mm.anatomy : null;
                    const pulse = anatomy && anatomy.organs ? (anatomy.organs.pulse || {}) : null;
                    if (pulse) {
                        const speed = pulse.speed != null ? pulse.speed : 0.85;
                        state.organPhase += dtSec * speed * Math.PI;
                        const ampScale = state.livePose.organPulseScale != null ? state.livePose.organPulseScale : 1;
                        const amp = (pulse.amp != null ? pulse.amp : 0.07) * ampScale;
                        if (amp > 0.0005) {
                            state.built.organs.forEach(o => {
                                const s = Math.sin(state.organPhase * o.speedMul + o.phase);
                                const a = amp * o.ampMul * s;
                                // Кишка "перистальтирует" (толще поперёк —
                                // короче вдоль), мешочек и узелки дышат
                                // равномерно: у каждого органа свой ритм и
                                // своя манера, а не общий мигающий scale.
                                const sx = o.kind === 'gut' ? (1 - a * 0.35) : (1 + a);
                                const sy = 1 + a;
                                o.group.setAttribute('transform',
                                    `translate(${o.x.toFixed(1)},${o.y.toFixed(1)}) rotate(${o.rot.toFixed(1)}) scale(${sx.toFixed(4)},${sy.toFixed(4)})`);
                            });
                        }
                    }
                }

                // Рот — пересчитываем форму каждый кадр из bend/gap.
                const mouthBuiltRef = state.built.head.mouth;
                if (mouthBuiltRef) {
                    const liveOpenness = state.livePose.mouthOpenness;
                    const openness = liveOpenness != null ? liveOpenness : Math.max(0, mm.head.mouth.openness || 0);
                    const liveCurve = state.livePose.mouthCurve;
                    const curve = liveCurve != null ? liveCurve : mm.head.mouth.curve;
                    const bend = mouthBendFromCurve(curve);
                    const gap = mouthBuiltRef.MAX_GAP * clamp01(openness);
                    updateMouthGeometry(mouthBuiltRef, bend, gap);
                }

                // ---------- МИМИКА ГОЛОВЫ ----------
                // Персонаж не должен быть застывшей маской: даже когда его
                // никто не трогает, у него подрагивают уши и он принюхивается.
                // Всё это — обычные "живые" параметры: мини-игра может задать
                // их напрямую через setLivePose, и тогда собственная жизнь
                // персонажа по этому каналу уступает управлению.
                const headRef = state.built.head;
                if (headRef && headRef.tiltGroup) {
                    const face = (mm.anatomy && mm.anatomy.face) || {};
                    const idle = face.idle || {};
                    state.faceClock += dt;

                    // Подёргивание уха: короткий импульс раз в несколько секунд,
                    // поочерёдно у разных ушей.
                    const earIdleAmt = idle.earTwitch != null ? idle.earTwitch : 1;
                    const earCycle = 5200;
                    const earPos = state.faceClock % earCycle;
                    const earImpulse = earPos < 260 ? Math.sin((earPos / 260) * Math.PI) : 0;
                    const twitchSide = Math.floor(state.faceClock / earCycle) % 2 === 0 ? 'left' : 'right';

                    // Принюхивание: серия из трёх быстрых движений пятачка.
                    const sniffIdleAmt = idle.sniff != null ? idle.sniff : 1;
                    const sniffCycle = 7400;
                    const sniffPos = state.faceClock % sniffCycle;
                    const sniffImpulse = sniffPos < 560 ? Math.abs(Math.sin((sniffPos / 560) * Math.PI * 3)) : 0;

                    // Наклон головы — вокруг основания шеи, а не центра черепа:
                    // иначе голова "съезжает" с тела.
                    const tilt = state.livePose.headTilt != null ? state.livePose.headTilt : 0;
                    headRef.tiltGroup.setAttribute('transform',
                        tilt ? `rotate(${tilt.toFixed(2)} 0 ${(headRef.ry * 1.15).toFixed(1)})` : '');

                    // Уши.
                    ['left', 'right'].forEach(side => {
                        const ref = headRef.ears[side];
                        if (!ref) return;
                        const live = side === 'left' ? state.livePose.earTiltLeft : state.livePose.earTiltRight;
                        const common = state.livePose.earTilt;
                        let extra = 0;
                        if (live != null) extra = live;
                        else if (common != null) extra = common;
                        else if (side === twitchSide) extra = -14 * earImpulse * earIdleAmt;
                        const mirror = side === 'left' ? -1 : 1;
                        ref.group.setAttribute('transform',
                            `translate(${ref.anchorX.toFixed(2)},${ref.anchorY.toFixed(2)}) ` +
                            `rotate(${(ref.baseAngle + extra * mirror).toFixed(2)}) ` +
                            `scale(${ref.scaleX.toFixed(3)},${ref.scaleY.toFixed(3)})`);
                    });

                    // Пятачок: при принюхивании чуть поднимается и сплющивается.
                    const twitch = state.livePose.snoutTwitch != null
                        ? clamp01(state.livePose.snoutTwitch)
                        : sniffImpulse * sniffIdleAmt;
                    if (headRef.snoutGroup) {
                        const sn = mm.head.snout;
                        const sx = sn.scale * sn.stretchX * (1 + 0.05 * twitch);
                        const sy = sn.scale * sn.stretchY * (1 - 0.07 * twitch);
                        headRef.snoutGroup.setAttribute('transform',
                            `translate(0,${(headRef.snoutY - 1.6 * twitch).toFixed(2)}) scale(${sx.toFixed(3)},${sy.toFixed(3)})`);
                    }

                    // Челюсть следует за ртом: рот открывается — низ морды
                    // уходит вниз, а не остаётся неподвижной кожей с дыркой.
                    if (headRef.jawGroup) {
                        const openness = state.livePose.mouthOpenness != null
                            ? clamp01(state.livePose.mouthOpenness)
                            : clamp01(mm.head.mouth.openness || 0);
                        const drop = state.livePose.jawDrop != null ? clamp01(state.livePose.jawDrop) : openness;
                        headRef.jawGroup.setAttribute('transform', `translate(0,${(drop * 5).toFixed(2)})`);
                    }

                    // Щёки: надуваются (полный рот) — брыли расходятся в стороны.
                    if (headRef.muzzleGroup) {
                        const puff = state.livePose.cheekPuff != null ? clamp01(state.livePose.cheekPuff) : 0;
                        headRef.muzzleGroup.setAttribute('transform',
                            puff ? `scale(${(1 + 0.12 * puff).toFixed(3)},${(1 + 0.05 * puff).toFixed(3)})` : '');
                    }

                    // Взгляд и брови.
                    const gx = state.livePose.gazeX, gy = state.livePose.gazeY;
                    const browRaise = state.livePose.browRaise;
                    ['left', 'right'].forEach(side => {
                        const eyeRef = headRef.eyes[side];
                        if (!eyeRef) return;
                        if (eyeRef.gazeGroup) {
                            const dx = (gx != null ? gx : 0) * eyeRef.rx * 0.34;
                            const dy = (gy != null ? gy : 0) * eyeRef.ry * 0.34;
                            eyeRef.gazeGroup.setAttribute('transform',
                                (dx || dy) ? `translate(${dx.toFixed(2)},${dy.toFixed(2)})` : '');
                        }
                        if (browRaise != null && eyeRef.browGroup) {
                            const eyeModel = mm.eyes[side];
                            const mirror = side === 'left' ? -1 : 1;
                            const lift = -browRaise * 4;
                            const angle = eyeModel.brow.angle * mirror - browRaise * 6 * mirror;
                            eyeRef.browGroup.setAttribute('transform',
                                `translate(0,${(-eyeRef.ry - 7 + lift).toFixed(2)}) rotate(${angle.toFixed(2)})`);
                        }
                    });
                }

                // Веки обновляются ВСЕГДА, а opts.blink лишь добавляет импульс
                // моргания: иначе на экранах с выключенным морганием
                // livePose.eyelidLevel (прищур, дрёма, зажмуривание) просто
                // не доезжал до персонажа.
                {
                    let blinkLevel = 0;
                    if (opts.blink) {
                        state.blinkClock += dt;
                        const cyclePos = state.blinkClock % WORM_BLINK_CYCLE;
                        if (cyclePos >= WORM_BLINK_START && cyclePos < WORM_BLINK_START + WORM_BLINK_DURATION) {
                            const p = (cyclePos - WORM_BLINK_START) / WORM_BLINK_DURATION;
                            blinkLevel = Math.sin(p * Math.PI);
                        }
                    }
                    ['left', 'right'].forEach(side => {
                        const eyeModel = mm.eyes[side];
                        const eyeRef = state.built.head.eyes[side];
                        const restLevel = state.livePose.eyelidLevel != null ? state.livePose.eyelidLevel : eyeModel.eyelid.level;
                        const level = Math.max(restLevel, blinkLevel);
                        const travel = 2 * eyeRef.ry + 5;
                        const ty = -travel * (1 - level);
                        eyeRef.lidTrack.setAttribute('transform', `translate(0,${ty.toFixed(2)})`);
                    });
                }
            }

            state.rafId = requestAnimationFrame(tick);
        }
        state.rafId = requestAnimationFrame(tick);

        function onResize() { syncViewportSize(); }
        window.addEventListener('resize', onResize);

        return {
            update(newModel) {
                state.baseModel = newModel;
                rebuild();
            },
            setOverride(patch) {
                state.override = patch;
                rebuild();
            },
            setPose(name) {
                svg.setAttribute('data-pose', name || '');
            },
            setLivePose(patch) {
                Object.assign(state.livePose, patch);
                // Степень просвечивания органов — единственный "живой"
                // параметр, который нельзя поменять одним transform: он
                // задан непрозрачностью слоя. Меняем её точечно, без
                // пересборки SVG (тот же принцип "не трогаем DOM зря").
                if (patch && patch.organVisibility !== undefined && state.built) {
                    const layers = state.built.root.querySelectorAll('.worm-organ-layer');
                    const m = mergedModel();
                    const base = (m.anatomy && m.anatomy.organs && m.anatomy.organs.visibility != null)
                        ? m.anatomy.organs.visibility : 0.55;
                    for (let i = 0; i < layers.length; i++) {
                        const host = layers[i].closest('[data-anat]');
                        const partName = host ? host.getAttribute('data-anat') : null;
                        const thin = partName && m.anatomy ? anatThinness(m.anatomy, partName) : 1;
                        const vis = patch.organVisibility != null ? patch.organVisibility : base;
                        layers[i].setAttribute('opacity', clamp01(vis * thin).toFixed(3));
                    }
                }
            },
            // Точечная перестановка "точки стояния" персонажа уже ПОСЛЕ
            // монтирования — нужна мини-играм, где раскладку нельзя выразить
            // одним фиксированным anchorX/anchorY.
            setPosition(x, y) {
                state.wormX = x;
                state.wormY = y;
                state.targetX = x;
                state.targetY = y;
                if (state.built) state.built.root.setAttribute('transform', rootTransform());
            },
            getPosition() {
                return { x: state.wormX, y: state.wormY };
            },
            // Прямой доступ к SVG для точечных вещей (хит-тест по конкретной
            // части, разовая подстройка стиля мини-игрой). Ищи части по
            // '[data-part="tail"]', '[data-part="belly"]' и т.п.
            svgRoot: svg,
            getMergedModel: mergedModel,
            destroy() {
                if (state.rafId) cancelAnimationFrame(state.rafId);
                window.removeEventListener('resize', onResize);
                container.innerHTML = '';
            }
        };
    }
};

window.WormRenderer = WormRenderer;
