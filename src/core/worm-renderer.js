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
// зависела от частоты кадров устройства: на экране с более высокой частотой
// обновления (например, 120 Гц) всё крутилось бы вдвое быстрее, чем
// задумано — вероятная причина жалобы на "безумно быстрое" подёргивание.
// Теперь animTime считается от РЕАЛЬНОГО прошедшего времени (dt в tick()),
// не от количества кадров — скорость анимации одинакова на любом устройстве.
const WORM_ANIM_TIME_PER_SEC = 3;
// Та же проблема была у сглаживания движения к цели (было `*0.02` за
// кадр) — заменено на framerate-независимую формулу 1 - base^dtSec.
const WORM_WANDER_MOVE_BASE = 0.3;

// Порог (px): ниже него считаем, что цель движения достигнута — targetX/Y
// приближаются к wormX/Y экспоненциально и математически никогда не
// долетают ТОЧНО до цели.
const WORM_MOVE_EPS = 1.5;
// Насколько быстро "интенсивность движения" (0..1) сходится к цели —
// подставляется в framerate-независимую формулу 1 - base^dtSec (та же
// схема, что уже используется в gluttony.js для наклона ведра): МЕНЬШЕ
// значение = БЫСТРЕЕ сходимость. Задаёт амплитуду/скорость покачивания
// (виляния) — см. блок "НОВАЯ СТОЯЩАЯ ПОЗА" в tick(). Раньше от этой же
// величины зависела и длина звена напольной цепочки (растяжение при
// ходьбе) — но она "стоит на месте" целую секунду даже после того, как
// персонаж уже фактически остановился (плавно подъезжает к цели и
// visually стоит), потому что этот рычаг завязан на БИНАРНОЕ состояние
// "движется/не движется", а не на РЕАЛЬНУЮ скорость перемещения. См.
// WORM_SPEED_REF_PX_PER_SEC ниже — длина звена теперь считается от
// фактической мгновенной скорости.
const WORM_MOVE_INTENSITY_SMOOTH_BASE = 0.0025;
// Пауза "стоит на месте" между прогулками к новой случайной точке.
const WORM_IDLE_PAUSE_MIN = 3500;
const WORM_IDLE_PAUSE_MAX = 8000;

// ---------- РАСТЯЖЕНИЕ ХВОСТОВОЙ ЧАСТИ ОТ РЕАЛЬНОЙ СКОРОСТИ ----------
// Раньше длина звена напольной цепи зависела от state.moveIntensity —
// сглаженного БИНАРНОГО флага "движется/стоит" с довольно долгим (~1с)
// временем сходимости. Из-за этого, когда персонаж подъезжает к цели
// (экспоненциальное затухание — реальная скорость плавно падает к нулю
// ЗАДОЛГО до того, как расстояние до цели пересечёт порог WORM_MOVE_EPS),
// хвостовая часть оставалась растянутой ещё примерно секунду ПОСЛЕ того,
// как персонаж уже визуально остановился. Вместо бинарного флага длина
// звена теперь считается от ФАКТИЧЕСКОЙ мгновенной скорости перемещения
// (px/сек, честно посчитанной как пройденное расстояние за кадр / dtSec) —
// она и так уже плавная (тот же экспоненциальный "подъезд" к цели), лёгкое
// сглаживание нужно только чтобы не было единичного скачка в самый первый
// кадр после назначения новой цели.
const WORM_SPEED_REF_PX_PER_SEC = 60; // скорость, при которой достигается полное растяжение
const WORM_SPEED_INTENSITY_SMOOTH_BASE = 0.02; // быстрое сглаживание (~0.2с), не "долгое" как у WORM_MOVE_INTENSITY_SMOOTH_BASE

// ---------- НАПОЛЬНАЯ ЦЕПОЧКА КАК ПРОСТАЯ КИНЕМАТИЧЕСКАЯ ЦЕПЬ ----------
// growing-сегменты и хвост НЕ позиционируются каждый независимой формулой
// (это давало видимые разрывы между соседями, когда их амплитуды/фазы
// расходились — хвост визуально "отрывался" от предыдущего сегмента).
// Вместо этого каждое звено вычисляется строго ОТ ПРЕДЫДУЩЕГО: позиция =
// позиция_предыдущего + WORM_SEGMENT_SPACING(+доп. растяжение) в направлении
// текущего угла звена (180° = "от живота к хвосту" локально, + небольшое
// покачивание угла). Раз каждое звено жёстко привязано к предыдущему по
// построению — разъединиться им ГЕОМЕТРИЧЕСКИ невозможно, при любой
// амплитуде покачивания.
//
// Это ДВА независимых параметра, как и просили — "растяжение цепочки при
// ходьбе" и "покачивание при ходьбе" не одно и то же правило:
// - длина звена (WORM_SEGMENT_SPACING + WORM_MOVE_SPACING_EXTRA*intensity)
//   — просто расстояние, "дышит" вместе с интенсивностью движения;
// - угол звена (WORM_CHAIN_WIGGLE_IDLE/MOVE_DEG) — вносит лёгкое
//   покачивание направления звена, никак не влияя на расстояние.
// Было 8 — при полном растяжении хвост с предхвостовым сегментом сцеплялись
// только тонкой полоской обводки ("на пределе"); уменьшено вдвое.
const WORM_MOVE_SPACING_EXTRA = 4; // доп. px к длине звена при ходьбе

// ---------- БАЗОВАЯ ДЛИНА ЗВЕНА НАПОЛЬНОЙ ЦЕПИ: ОТ РЕАЛЬНЫХ РАДИУСОВ ----------
// Раньше базовая длина ВСЕХ звеньев напольной цепи (живот→growing-1→
// growing-2→хвост) была ОДНИМ плоским числом (WORM_SEGMENT_SPACING),
// одинаковым независимо от размера соседних частей. Это плохо работает на
// сужающейся цепочке: живот (радиус 23) и growing-1 (17) — крупная пара,
// плоское расстояние в 18px давало между ними огромный нахлёст (growing-1
// почти целиком прятался под животом), а growing-2 (15) и хвост (~10.5) —
// мелкая пара, для которой то же самое 18px — это уже МНОГО (см. правку 15,
// где именно эта пара едва не осталась без перекрытия при растяжении на
// ходу). Одно число физически не может одновременно подойти обеим парам.
//
// Вместо плоской константы длина звена МЕЖДУ КОНКРЕТНОЙ ПАРОЙ теперь
// считается от их РЕАЛЬНЫХ радиусов: сумма радиусов минус доля (см. ниже)
// от МЕНЬШЕГО из двух — то есть сохраняется одинаковое ОТНОСИТЕЛЬНОЕ (не
// абсолютное) перекрытие для любой пары, крупной или мелкой. У крупных пар
// (живот↔growing-1) расстояние автоматически получается заметно больше,
// у мелких (growing-2↔хвост) — остаётся тесным, как и было настроено в
// правке 15 (не открывает обратно зазор на хвосте).
const WORM_FLOOR_LINK_OVERLAP_RATIO = 0.6;
function floorLinkBaseLength(radiusA, radiusB) {
    return radiusA + radiusB - WORM_FLOOR_LINK_OVERLAP_RATIO * Math.min(radiusA, radiusB);
}
// Покачивание угла КАЖДОГО звена напольной цепочки (включая точку
// крепления хвоста) — держит цепочку согласованной единой волной. Нарочно
// маленькое: этого достаточно, чтобы цепочка не выглядела мёртвой линейкой,
// не создавая при этом тряски.
const WORM_CHAIN_WIGGLE_IDLE_DEG = 1.2;
const WORM_CHAIN_WIGGLE_MOVE_DEG = 3.5;
const WORM_CHAIN_WIGGLE_IDLE_SPEED = 0.5;
const WORM_CHAIN_WIGGLE_MOVE_SPEED = 1.1;
// Разница фазы (рад) между соседними звеньями — маленькая, чтобы сосед
// двигался почти вслед за соседом (мягкая бегущая волна), не вразнобой.
const WORM_CHAIN_PHASE_STEP = 0.3;
// Хвост дополнительно "вихляет" СВЕРХ базового угла звена — это чисто
// косметический поворот ЕГО СОБСТВЕННОЙ формы (bendGroup) вокруг уже
// корректно вычисленной точки крепления, поэтому на само крепление
// (позицию) никак не влияет и разъединения не создаёт — только заметнее
// "флик" кончика хвоста, чем у круглых сегментов.
const WORM_TAIL_EXTRA_WAG_IDLE_DEG = 2;
const WORM_TAIL_EXTRA_WAG_MOVE_DEG = 5;

// ---------- ФОРМА ХВОСТА ----------
// Основание хвоста = доля от реального радиуса ПОСЛЕДНЕГО growing-сегмента
// (см. buildTailNode) — продолжает естественное сужение цепочки, вместо
// того чтобы быть отдельным независимым числом (см. историю в
// buildTailNode). Кончик — доля УЖЕ от основания хвоста, закруглённый
// овал, а не точка.
const WORM_TAIL_BASE_RATIO = 0.7;
const WORM_TAIL_TIP_RATIO = 0.35;

// ---------- ВЕРТИКАЛЬНАЯ ЧАСТЬ ЦЕПОЧКИ (голова → сегмент-1 → сегмент-2 → живот) ----------
// Раньше делила общую константу WORM_SEGMENT_SPACING с напольной частью
// (growing-сегменты + хвост) — из-за этого расстояние между головой и
// сегментами было слишком маленьким относительно их собственных радиусов:
// первый сегмент почти целиком прятался под головой, второй — почти целиком
// под первым. Теперь у вертикальной части СВОЁ расстояние, независимое от
// напольной цепи (которую трогать не просили).
const WORM_VERTICAL_SPACING = 26; // было — общее с WORM_SEGMENT_SPACING (18)

// ---------- ВТОРОЙ, БОЛЕЕ КОВАРНЫЙ ТАЙМИНГ-БАГ: "ЭФФЕКТ ВОЛЧКА" ----------
// Даже после перехода на dtSec (см. WORM_ANIM_TIME_PER_SEC выше) покачивание
// цепи считалось как `Math.sin(state.animTime * wiggleSpeed + фаза)`, где
// wiggleSpeed — не константа, а величина, ПОСТОЯННО меняющаяся вместе с
// moveIntensity (idle-скорость <-> ходьба-скорость). Это математически
// некорректно: animTime — это ВСЁ прошедшее время с момента монтирования
// (растёт без ограничения), поэтому при любом изменении wiggleSpeed
// аргумент синуса скачет на величину ~animTime * Δспорость — а не на
// маленькую добавку за один кадр. Чем дольше персонаж уже смонтирован (чем
// больше накопленный animTime), тем ОГРОМНЕЕ этот скачок при каждом
// старте/остановке движения — визуально ровно то, что описал пользователь:
// "как волчок/монетка на столе" — бешеное дрожание в момент изменения
// скорости, затихающее, как только moveIntensity (а с ним и wiggleSpeed)
// перестаёт меняться и стабилизируется. Ровно то же самое рассинхронно
// дёргало и "флик" кончика хвоста (extraWag, отдельный поворот bendGroup) —
// он использовал ТУ ЖЕ схему с другим множителем скорости (*1.3), поэтому
// скачок фазы там был ДРУГОЙ величины, чем у угла крепления хвоста — эти
// два угла на миг расходились, и хвост визуально "отрывался" от тела, хотя
// сама точка крепления (позиция) оставалась корректной.
//
// Исправление: НИКОГДА не умножать общее накопленное время на переменную
// скорость. Вместо этого — отдельный аккумулятор ФАЗЫ, который каждый кадр
// прирастает на dtSec * ANIM_TIME_PER_SEC * ТЕКУЩАЯ_скорость (см.
// state.chainWigglePhase / state.tailWagPhase в tick()). Изменение скорости
// тогда влияет только на то, СКОЛЬКО фазы добавится в СЛЕДУЮЩИЕ кадры, и
// никогда не пересчитывает задним числом уже накопленную историю.

// "Дыхание" — лёгкая пульсация масштаба вертикальной части тела, работает
// ВСЕГДА, независимо от ходьбы. Голова не участвует (задел под будущую
// мимику, а не корпус). ОДНА общая фаза (не бегущая волна со сдвигом по
// сегментам, как было раньше) — это ОДНА и та же анимация дыхания на всю
// вертикальную часть, просто с разной амплитудой по сегментам (см.
// WORM_BREATH_RATIO): живот — амплитуда WORM_BREATH_AMP как есть (эталон,
// 100%), считается самым "дышащим" местом; чем ближе сегмент к голове, тем
// амплитуда меньше — 70% у сегмента-2 (рядом с животом), 30% у сегмента-1
// (рядом с головой). Раньше живот вообще не дышал (был статичен по
// изначальному требованию) — теперь дышит тоже, по прямой просьбе.
//
// Правка 18: раньше волна дыхания была ДВУПОЛЯРНОЙ (обычный sin,
// колеблется и выше, и ниже стандартного радиуса поровну) — по фидбеку
// это визуально читалось как "сегмент уменьшается и возвращается к
// стандартному", а нужно ровно наоборот: "увеличивается и возвращается к
// стандартному", той же величиной, какой раньше было уменьшение. Поэтому
// волна теперь ОДНОПОЛЯРНАЯ — никогда не опускается ниже стандартного
// радиуса (baseRx/baseRy), только поднимается до +WORM_BREATH_AMP и
// возвращается обратно к 0. Пик волны (и, соответственно, сама
// WORM_BREATH_AMP) не менялся — амплитуда роста та же, что раньше была у
// уменьшения.
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
function parseCssColor(css) {
    if (!colorParseEl) {
        colorParseEl = document.createElement('span');
        colorParseEl.style.display = 'none';
        (document.body || document.documentElement).appendChild(colorParseEl);
    }
    colorParseEl.style.color = '';
    colorParseEl.style.color = css;
    const computed = getComputedStyle(colorParseEl).color || '';
    const m = computed.match(/rgba?\(([^)]+)\)/);
    if (!m) return { r: 200, g: 100, b: 120 };
    const parts = m[1].split(',').map(s => parseFloat(s));
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0 };
}

// Линейная интерполяция цвета css → target на долю t (0..1).
function mixColor(css, targetCss, t) {
    const a = parseCssColor(css);
    const b = parseCssColor(targetCss);
    const tt = Math.min(1, Math.max(0, t));
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

// ---------- ДЕТЕРМИНИРОВАННЫЙ ГЕНЕРАТОР ШУМА (для сосудиков на глазах и зубов) ----------
// Обычный Math.random() дал бы новый узор при каждой перерисовке одного и
// того же смонтированного персонажа (rebuild() дёргается на любой
// setOverride/update) — узор бы "мигал" и переставлялся. Вместо этого сид
// считается из instanceId (не меняется на весь срок жизни handle) и имени
// части — узор стабилен, пока персонаж не перемонтирован заново.
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

// ---------- ЛОКАЛЬНЫЕ ФОРМЫ (до позиционирования) ----------
function earPathData(mirror) {
    // mirror: 1 = правое ухо, -1 = левое. Точка (0,0) — место крепления к голове.
    // Кривая Безье вместо прямых линий — силуэт уха округлый, "мясистый",
    // а не плоский треугольник.
    const s = mirror;
    return `M 0,0 ` +
        `Q ${s * 4},-14 ${s * 14},-26 ` +
        `Q ${s * 22},-32 ${s * 17},-20 ` +
        `Q ${s * 13},-10 ${s * 8},-4 ` +
        `Q ${s * 3},2 0,0 Z`;
}

// Внутреннее ухо — узкая вставка чуть темнее основного цвета, повторяет
// изгиб внешнего контура с отступом внутрь. Чисто декоративный слой.
function earInnerPathData(mirror) {
    const s = mirror;
    return `M ${s * 2},-3 Q ${s * 6},-13 ${s * 13},-23 Q ${s * 15},-16 ${s * 10},-9 Q ${s * 6},-4 ${s * 2},-3 Z`;
}

// ---------- ПОСТРОЕНИЕ ОДНОГО СЕГМЕНТА ТЕЛА (не хвост, не голова) ----------
function buildSegmentNode(partName, seg, defs, instanceId) {
    const group = svgEl('g', { 'data-part': partName });
    const baseRx = seg.radius * seg.stretchX * seg.scale;
    const baseRy = seg.radius * seg.stretchY * seg.scale;

    const gradId = `worm-seg-grad-${instanceId}-${partName}`;
    const fillUrl = ensureVolumeGradient(defs, gradId, seg.fill, {
        cx: '38%', cy: '30%', r: '80%',
        highlight: 0.22, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.32, shadowTint: GRIME_SHADOW
    });

    const ellipse = svgEl('ellipse', {
        cx: 0, cy: 0,
        rx: baseRx.toFixed(2),
        ry: baseRy.toFixed(2),
        fill: fillUrl,
        stroke: seg.stroke,
        'stroke-width': 2
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

    // Якорь под шрамы/эффекты этого сегмента — шрамы монтируются сюда же,
    // как дочерние элементы group, и наследуют её transform.
    const scarLayer = svgEl('g', { 'data-anchor': `${partName}-scars`, class: 'worm-scar-layer' });
    group.appendChild(scarLayer);
    // baseRx/baseRy сохраняются отдельно, чтобы мини-игры могли "живо"
    // (без пересборки SVG) масштабировать конкретный сегмент — например,
    // раздувание живота в Чревоугодии через handle.setLivePose({ bellyScale }).
    return { group, ellipse, shine, scarLayer, baseRx, baseRy };
}

// ---------- ПОСТРОЕНИЕ ХВОСТА (отдельная сущность, каплевидная форма) ----------
// attachRadius — реальный отрисованный радиус ПОСЛЕДНЕГО growing-сегмента
// (предхвостового), передаётся снаружи (см. buildWormSVGGroup): основание
// хвоста считается ДОЛЕЙ от него (WORM_TAIL_BASE_RATIO), а не собственным
// независимым числом — тогда сужение цепочки "каждый следующий чуть
// меньше" продолжается естественно и на хвост тоже. Раньше основание было
// фиксированным (7.5*thickness), заметно МЕНЬШЕ суммы радиусов с соседним
// сегментом при растянутой на ходу цепи (WORM_MOVE_SPACING_EXTRA) — это и
// давало видимый зазор ("хвост отрывается"), в отличие от остальных
// сегментов тела, которые всегда достаточно крупные, чтобы перекрывать
// друг друга на любом расстоянии внутри цепи.
function buildTailNode(tail, defs, instanceId, attachRadius) {
    const group = svgEl('g', { 'data-part': 'tail' });
    const L = 34 * tail.length; // общая длина хвоста, от основания до кончика
    const Rbase = (attachRadius || 15) * WORM_TAIL_BASE_RATIO * tail.thickness;
    // Кончик — маленький ЗАКРУГЛЁННЫЙ овал, а не точка ("кончик карандаша",
    // как жаловался пользователь): у него есть собственный небольшой
    // радиус, форма читается как капля/яйцо, не шип.
    const Rtip = Rbase * WORM_TAIL_TIP_RATIO;
    const tipCx = -(L - Rtip); // центр кончика — так, что его дальний край доходит ровно до -L
    // Основание — круглое (слегка заходит на +x — под предыдущий сегмент,
    // для бесшовного стыка) и сужается к кончику через две симметричные
    // квадратичные дуги, а кончик — не точка их схождения, а короткая дуга
    // вокруг маленькой окружности (Rtip), выгнутая ДАЛЬШЕ от тела (наружу) —
    // именно это и даёт яйцевидную, а не острую форму.
    const d = `M 0,${(-Rbase).toFixed(1)} ` +
              `A ${Rbase.toFixed(1)},${Rbase.toFixed(1)} 0 0 1 0,${Rbase.toFixed(1)} ` +
              `Q ${(tipCx * 0.55).toFixed(1)},${(Rbase * 0.9).toFixed(1)} ${tipCx.toFixed(1)},${Rtip.toFixed(1)} ` +
              `A ${Rtip.toFixed(1)},${Rtip.toFixed(1)} 0 0 1 ${tipCx.toFixed(1)},${(-Rtip).toFixed(1)} ` +
              `Q ${(tipCx * 0.55).toFixed(1)},${(-Rbase * 0.9).toFixed(1)} 0,${(-Rbase).toFixed(1)} Z`;

    const gradId = `worm-tail-grad-${instanceId}`;
    const fillUrl = ensureVolumeGradient(defs, gradId, tail.fill, {
        cx: '62%', cy: '35%', r: '85%',
        highlight: 0.2, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.32, shadowTint: GRIME_SHADOW
    });
    const path = svgEl('path', { d, fill: fillUrl, stroke: tail.stroke, 'stroke-width': 2 });

    // Внутренняя группа для "живого" изгиба хвоста (тянут в мини-игре Похоти
    // и т.п.) — вращается вокруг точки крепления (0,0), не требует пересборки
    // SVG, обновляется напрямую через handle.setLivePose({ tailBendAngle }).
    const bendGroup = svgEl('g', { 'data-part': 'tail-bend' });
    bendGroup.appendChild(path);
    group.appendChild(bendGroup);
    const scarLayer = svgEl('g', { 'data-anchor': 'tail-scars', class: 'worm-scar-layer' });
    group.appendChild(scarLayer);
    return { group, path, bendGroup, scarLayer, baseRadius: Rbase };
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
        rx: (rx * 1.4).toFixed(2), ry: (ry * 1.35).toFixed(2),
        fill: withAlpha('#000000', 0.1)
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
    const pupil = svgEl('circle', { cx: 0, cy: 0, r: (irisR * 0.55).toFixed(2), fill: '#0e0405' });

    // Один скромный блик (не два "искрящихся", как у милого зверька).
    const highlight = svgEl('ellipse', {
        cx: (-irisR * 0.3).toFixed(2), cy: (-irisR * 0.32).toFixed(2),
        rx: (irisR * 0.22).toFixed(2), ry: (irisR * 0.16).toFixed(2),
        fill: '#ffffff', opacity: 0.5
    });

    // Бровь — дугой (Q), а не прямой палочкой.
    const browGroup = svgEl('g', {
        'data-part': `brow-${eyeKey}`,
        transform: `translate(0,${(-ry - 7).toFixed(2)}) rotate(${eye.brow.angle * mirror})`,
        visibility: eye.brow.visible ? 'visible' : 'hidden'
    });
    const browShape = svgEl('path', {
        d: `M ${(-rx * 1.1).toFixed(2)},1.5 Q 0,${(-rx * 0.55).toFixed(2)} ${(rx * 1.1).toFixed(2)},1.5`,
        fill: 'none', stroke: '#2a0d14', 'stroke-width': 3.2, 'stroke-linecap': 'round'
    });
    browGroup.appendChild(browShape);

    // ---------- ВЕКО КАК ШТОРКА, ЖИВУЩАЯ ВНУТРИ ГЛАЗА ----------
    // Тот же принцип, что и в мини-игре Похоти: веко — не отдельный "нарост"
    // сверху, а полноценная пластина, которая ЕДЕТ (translate по Y) поперёк
    // глаза. Видна только та её часть, что попадает в clipPath по форме
    // глаза — стоит ей уйти за пределы глаза (вверх, когда глаз широко
    // открыт), она автоматически становится невидимой без ручного учёта
    // границ (просто обрезается клипом). Пластина выше диаметра глаза, чтобы
    // при полном закрытии перекрывать его целиком с запасом. Каждый кадр в
    // tick() двигается ПЛАВНО (см. WORM_BLINK_* и синусоиду моргания) — не
    // скачком между открыто/закрыто.
    const clipId = `worm-eye-clip-${instanceId}-${eyeKey}`;
    const clipPath = svgEl('clipPath', { id: clipId });
    clipPath.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2) }));
    group.appendChild(clipPath);

    const lidHeight = ry * 2 + 6;
    const lidGradId = `worm-eyelid-grad-${instanceId}-${eyeKey}`;
    const lidFill = ensureVolumeGradient(defs, lidGradId, '#c98a7f', {
        cx: '50%', cy: '0%', r: '100%',
        highlight: 0.08, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.2, shadowTint: GRIME_SHADOW
    });
    const lidClipGroup = svgEl('g', { 'clip-path': `url(#${clipId})` });
    // lidTrack — единственный узел, который двигаем каждый кадр (translate);
    // сама пластина (lid) и складка (lidCrease) — его неподвижные дети в
    // локальных координатах, центрированные на 0.
    const lidTrack = svgEl('g', { 'data-part': `eyelid-${eyeKey}` });
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

    group.appendChild(socket);
    group.appendChild(sclera);
    group.appendChild(veins);
    group.appendChild(iris);
    group.appendChild(pupil);
    group.appendChild(highlight);
    group.appendChild(lidClipGroup);
    group.appendChild(browGroup);

    return { group, sclera, iris, pupil, lidTrack, browGroup, rx, ry, lidHeight };
}

// ---------- ПОСТРОЕНИЕ РТА: ЕДИНАЯ ПРОЦЕДУРНАЯ ФОРМА, ЖИВАЯ КАЖДЫЙ КАДР ----------
// Идея формы: круг, где кайма — губы, заливка — тёмная ротовая полость.
// Строится как ДВЕ квадратичные кривые от левого уголка рта к правому и
// обратно: верхняя губа идёт через контрольную точку (0, bend-gap), нижняя —
// через (0, bend+gap). При gap=0 обе кривые СОВПАДАЮТ — контур вырождается в
// незаполненную линию ("сплющенный в линию круг": нейтральный, улыбающийся
// или грустный рот БЕЗ открытия, в зависимости от bend). При W == MAX_GAP
// полностью открытый рот получается примерно круглым, как и просили.
//
// Геометрия (d атрибуты пути/клипа/зубов) пересчитывается КАЖДЫЙ КАДР в
// tick() из bend/gap — как и раздутие живота, это "живой" параметр,
// управляемый через handle.setLivePose({ mouthOpenness }) БЕЗ пересборки
// всего SVG. Это важно для мини-игр вроде Чревоугодия: рот должен открываться
// непрерывно и плавно вслед за наклоном ведра, а не скачком между двумя
// заранее нарисованными состояниями.
function buildMouthShapes(mouthAnchor, mouth, instanceId) {
    const W = 10;        // половина ширины рта в уголках
    const MAX_GAP = 10;  // при полном открытии (gap==W) рот примерно круглый

    const mouthShape = svgEl('path', {
        d: '', fill: '#3d0e14', stroke: mouth.color, 'stroke-width': 2.4, 'stroke-linejoin': 'round'
    });
    mouthAnchor.appendChild(mouthShape);

    const mouthClipId = `worm-mouth-clip-${instanceId}`;
    const mouthClipPath = svgEl('clipPath', { id: mouthClipId });
    const mouthClipShape = svgEl('path', { d: '' });
    mouthClipPath.appendChild(mouthClipShape);
    mouthAnchor.appendChild(mouthClipPath);

    // Кривые, неровные зубы — видны только когда рот заметно приоткрыт.
    // Обрезаются по актуальной форме полости через тот же clipPath, поэтому
    // при живом изменении gap не вылезают за пределы рта.
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

// Пересчитывает форму рта (и зубов) из bend/gap — вызывается один раз при
// постройке (с исходными значениями модели) и затем каждый кадр в tick(),
// когда включён "живой" канал mouthOpenness/mouthCurve.
//
// ПОДХОД (переработан целиком — предыдущая версия на двух квадратичных
// кривых давала заметный "залом" в левом/правом уголке рта на любом
// ненулевом открытии): две квадратичные кривые, сходящиеся в общей точке —
// это форма миндалевидного глаза (vesica), у неё МАТЕМАТИЧЕСКИ не может
// быть гладкого стыка в уголках, если верхняя и нижняя дуги изогнуты
// по-разному (не хватает степеней свободы — касательные входящей и
// исходящей дуги неизбежно расходятся под углом).
//
// Вместо этого рот строится как НАСТОЯЩИЙ гладкий овал — 4 кубические дуги,
// как в стандартном приближении окружности/эллипса SVG-путём (константа
// MOUTH_ARC_K), где верхняя и нижняя половины могут иметь РАЗНЫЙ радиус
// (ryTop/ryBottom). В этой конструкции касательная в левой и правой точках
// оволала ВСЕГДА строго вертикальна — и снизу, и сверху, независимо от
// того, насколько разные ryTop и ryBottom — то есть стык гладкий (без
// заломов) при ЛЮБОМ сочетании настроения и открытости, включая полностью
// закрытый рот. Настроение (bend) кодируется как асимметрия между верхним
// и нижним радиусом (при закрытом рте, gap=0, "выступает" только одна из
// половин — рисуя тонкий гладкий серп, который на вид заменяет прежнюю
// одиночную кривую), а открытие (gap) — как одновременный рост ОБОИХ
// радиусов. MOUTH_EGG_TOP/BOTTOM добавляют лёгкую фиксированную асимметрию
// "как яйцо" (верх чуть уже, низ чуть шире), а не идеальный круг.
// mouth.curve → bend: вынесено в отдельную функцию, чтобы формула (и её
// знак) жила в ОДНОМ месте — раньше `-7 * curve` дублировался в двух местах
// (постройка + tick()) и при попытке поправить знак легко было забыть один
// из них. curve > 0 (хорошее настроение) даёт bend > 0 — середина рта
// провисает ВНИЗ относительно уголков, классическая улыбка "⌣" (уголки выше
// середины). curve < 0 — наоборот, середина приподнимается над уголками,
// грусть/недовольство "⌢".
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
        // Реальный верхний край полости — сама вершина верхней дуги
        // (настоящая точка овала, не приближение через control-point).
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

// ---------- ПОСТРОЕНИЕ ГОЛОВЫ (уши, пятачок, рот, глаза) ----------
function buildHeadNode(model, instanceId, defs) {
    const head = model.head;
    const group = svgEl('g', { 'data-part': 'head' });

    const R = 40 * head.scale;
    const rx = R * head.stretchX;
    const ry = R * head.stretchY;

    const headGradId = `worm-head-grad-${instanceId}`;
    const headFill = ensureVolumeGradient(defs, headGradId, head.fill, {
        cx: '38%', cy: '28%', r: '85%',
        highlight: 0.2, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.32, shadowTint: GRIME_SHADOW
    });
    const skull = svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2), fill: headFill, stroke: head.stroke, 'stroke-width': 3 });

    // Блик на макушке — усиливает объём поверх радиального градиента.
    const headShine = svgEl('ellipse', {
        cx: (-rx * 0.3).toFixed(2), cy: (-ry * 0.5).toFixed(2),
        rx: (rx * 0.32).toFixed(2), ry: (ry * 0.18).toFixed(2),
        fill: '#ffffff', opacity: 0.16
    });

    // Уши — крепятся по краю головы, каждое со своим поворотом/видимостью.
    const earsGroup = svgEl('g', { 'data-part': 'ears' });
    const earRefs = {};
    ['left', 'right'].forEach(side => {
        const mirror = side === 'left' ? -1 : 1;
        const ear = head.ears[side];
        const anchorX = mirror * rx * 0.55;
        const anchorY = -ry * 0.75;
        const earGroup = svgEl('g', {
            'data-part': `ear-${side}`,
            'data-anchor': `ear-${side}`,
            transform: `translate(${anchorX.toFixed(2)},${anchorY.toFixed(2)}) rotate(${ear.rotation}) scale(${ear.scale * ear.stretchX},${ear.scale * ear.stretchY})`,
            visibility: ear.visible ? 'visible' : 'hidden'
        });
        const earGradId = `worm-ear-grad-${instanceId}-${side}`;
        const earFill = ensureVolumeGradient(defs, earGradId, ear.fill, {
            cx: mirror > 0 ? '35%' : '65%', cy: '30%', r: '85%',
            highlight: 0.2, highlightTint: GRIME_HIGHLIGHT,
            shadow: -0.32, shadowTint: GRIME_SHADOW
        });
        const earShape = svgEl('path', { d: earPathData(mirror), fill: earFill, stroke: ear.stroke, 'stroke-width': 2, 'stroke-linejoin': 'round' });
        const earInner = svgEl('path', { d: earInnerPathData(mirror), fill: mixColor(ear.fill, GRIME_SHADOW, 0.3), opacity: 0.55 });
        earGroup.appendChild(earShape);
        earGroup.appendChild(earInner);
        earsGroup.appendChild(earGroup);
        earRefs[side] = { group: earGroup, shape: earShape, inner: earInner };
    });

    // Пятачок — поднят выше (ближе к глазам) и уменьшен, чтобы не наезжать
    // на широко открытый рот, который теперь всегда рисуется под ним.
    const snout = head.snout;
    const snoutGroup = svgEl('g', {
        'data-part': 'snout',
        'data-anchor': 'snout',
        transform: `translate(0,${(ry * 0.18).toFixed(2)}) scale(${snout.scale * snout.stretchX},${snout.scale * snout.stretchY})`
    });
    const snoutGradId = `worm-snout-grad-${instanceId}`;
    const snoutFill = ensureVolumeGradient(defs, snoutGradId, snout.fill, {
        cx: '38%', cy: '30%', r: '80%',
        highlight: 0.2, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.32, shadowTint: GRIME_SHADOW
    });
    const snoutShape = svgEl('ellipse', { cx: 0, cy: 0, rx: 12.5, ry: 9, fill: snoutFill, stroke: snout.stroke, 'stroke-width': 2 });
    // Ноздри — овальные и слегка развёрнутые, а не просто кружки.
    const nostrilL = svgEl('ellipse', { cx: -4, cy: 0, rx: 2.1, ry: 2.9, fill: '#631d27', transform: 'rotate(-12 -4 0)' });
    const nostrilR = svgEl('ellipse', { cx: 4, cy: 0, rx: 2.1, ry: 2.9, fill: '#631d27', transform: 'rotate(12 4 0)' });
    const snoutShine = svgEl('ellipse', { cx: -3.2, cy: -4, rx: 4, ry: 1.7, fill: '#ffffff', opacity: 0.3 });
    snoutGroup.appendChild(snoutShape);
    snoutGroup.appendChild(snoutShine);
    snoutGroup.appendChild(nostrilL);
    snoutGroup.appendChild(nostrilR);

    // Рот — см. buildMouthShapes/updateMouthGeometry выше. Анкер здесь же
    // задаёт позицию/масштаб на морде, сама форма считается отдельно и
    // обновляется каждый кадр в tick().
    const mouth = head.mouth;
    const mouthAnchor = svgEl('g', {
        'data-part': 'mouth',
        'data-anchor': 'mouth',
        transform: `translate(0,${(ry * 0.75).toFixed(2)}) scale(${mouth.scale * mouth.stretchX},${mouth.scale * mouth.stretchY})`
    });
    const mouthBuilt = buildMouthShapes(mouthAnchor, mouth, instanceId);
    updateMouthGeometry(mouthBuilt, mouthBendFromCurve(mouth.curve), mouthBuilt.MAX_GAP * Math.max(0, Math.min(1, mouth.openness || 0)));

    // Глаза
    const eyesGroup = svgEl('g', { 'data-part': 'eyes' });
    const eyeLeft = buildEyeNode(model.eyes.left, -1, instanceId, 'left', defs);
    const eyeRight = buildEyeNode(model.eyes.right, 1, instanceId, 'right', defs);
    eyesGroup.appendChild(eyeLeft.group);
    eyesGroup.appendChild(eyeRight.group);

    // Якорь под головной убор — над верхней точкой головы.
    const hatAnchor = svgEl('g', { 'data-anchor': 'head-top', transform: `translate(0,${(-ry * 1.1).toFixed(2)})` });

    // Порядок важен: рот кладём ДО пятачка, чтобы при полностью открытом
    // рте пятачок всегда оставался поверх (перекрывал зону нахлёста), а не
    // наоборот — даже если геометрически они и заходят друг на друга.
    group.appendChild(earsGroup);
    group.appendChild(skull);
    group.appendChild(headShine);
    group.appendChild(mouthAnchor);
    group.appendChild(snoutGroup);
    group.appendChild(eyesGroup);
    group.appendChild(hatAnchor);

    const scarLayer = svgEl('g', { 'data-anchor': 'head-scars', class: 'worm-scar-layer' });
    group.appendChild(scarLayer);

    return { group, skull, ears: earRefs, snoutGroup, mouth: mouthBuilt, eyes: { left: eyeLeft, right: eyeRight }, scarLayer, rx, ry };
}

// ---------- ШРАМЫ ----------
// Процедурно генерируемая метка на конкретном сегменте. Размер намеренно
// ограничен долей от радиуса сегмента-хозяина, чтобы не вылезать за его
// пределы (точная формула ещё будет уточняться по ходу разработки).
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
function buildWormSVGGroup(model, instanceId) {
    const root = svgEl('g', { class: 'worm-root' });

    // Общий <defs> на весь инстанс персонажа — сюда складываются все
    // радиальные градиенты объёма (голова, сегменты, хвост, уши, глаза).
    const defs = svgEl('defs');
    root.appendChild(defs);

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
    // сегмента — от него считается основание хвоста (см. buildTailNode),
    // чтобы сужение цепочки продолжалось естественно, а не задавалось
    // отдельным независимым числом.
    const lastGrowingSeg = model.growingSegments.length
        ? model.growingSegments[model.growingSegments.length - 1]
        : null;
    const tailAttachRadius = lastGrowingSeg
        ? lastGrowingSeg.radius * lastGrowingSeg.stretchX * lastGrowingSeg.scale
        : 15;

    // Z-порядок ("слои", как в фотошопе), СНИЗУ ВВЕРХ:
    // 1) напольная часть (growing-сегменты + хвост) — самый нижний слой;
    // 2) вертикальная часть тела (fixedSegments, между головой и животом);
    // 3) живот — поверх ВСЕХ остальных сегментов тела (и напольных, и
    //    вертикальных), но ещё не выше головы;
    // 4) голова — поверх абсолютно всего, рисуется отдельным шагом ниже.
    // Раньше слой считался ЕДИНОЙ мерой "расстояние от живота" сразу в ОБЕ
    // стороны цепочки — из-за этого сегменты напольной части могли оказаться
    // НАД сегментами вертикальной части тела при равном расстоянии до
    // живота (тай-брейк по idx решал не в пользу нужной стороны). Теперь
    // сторона (напольная / вертикальная / живот) — это ПЕРВЫЙ, приоритетный
    // критерий сортировки, а "расстояние от живота" — только второй,
    // определяет порядок ВНУТРИ одной стороны (дальше от живота — глубже).
    const allParts = chainParts.map((part, i) => ({ ...part, idx: i + 1, isTail: false }));
    allParts.push({ name: 'tail', data: model.tail, idx: tailIdx, isTail: true });
    function bodyLayerGroup(idx) {
        if (idx === bellyIdx) return 2;       // живот
        return idx > bellyIdx ? 0 : 1;        // 0 = напольная часть, 1 = вертикальная часть тела
    }
    allParts.sort((a, b) => {
        const groupA = bodyLayerGroup(a.idx);
        const groupB = bodyLayerGroup(b.idx);
        if (groupA !== groupB) return groupA - groupB; // группа 0 рисуется первой (ниже), группа 2 — последней (выше)
        const distA = Math.abs(a.idx - bellyIdx);
        const distB = Math.abs(b.idx - bellyIdx);
        if (distA !== distB) return distB - distA; // внутри своей группы: дальше от живота — рисуется раньше (глубже)
        return a.idx - b.idx; // стабильный порядок при равном расстоянии
    });

    const segmentRefs = [];
    let tailBuilt = null;
    allParts.forEach(part => {
        if (part.isTail) {
            tailBuilt = buildTailNode(part.data, defs, instanceId, tailAttachRadius);
            root.appendChild(tailBuilt.group);
        } else {
            const built = buildSegmentNode(part.name, part.data, defs, instanceId);
            root.appendChild(built.group);
            segmentRefs.push({ idx: part.idx, name: part.name, radius: part.data.radius * part.data.scale, ...built });
        }
    });

    // Голова — последняя, поверх всего.
    const headBuilt = buildHeadNode(model, instanceId, defs);
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
        head: headBuilt
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
            // растёт вправо от головы, а не влево (нужно для поз, где
            // персонаж лежит головой к одному краю экрана).
            flip: false,
            // false — тело неподвижно застыло в базовой позе (нужно для
            // сцен, где персонаж лежит смирно, например кормление).
            idleWave: true,
            // 'center' (по умолчанию) — живот раздувается симметрично.
            // 'bottom' — нижний край живота остаётся на месте, раздувается
            // только вверх. 'top' — наоборот.
            bellyGrowthAnchor: 'center',
            // 'standing' (по умолчанию) — "стоящая" поза: хвост и
            // growing-сегменты лежат на полу, живот — угловая точка на
            // полу, fixedSegments+живот образуют вертикальный столбик вверх
            // к голове. 'lying' — старая раскладка (одна прямая линия
            // целиком) — использует Чревоугодие, где персонаж должен лежать
            // плашмя на боку во время кормления.
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
        // slimeLayer (след слизи, под персонажем) и charLayer (сам
        // персонаж — единственное, что реально пересобирается). Раньше
        // rebuild() чистил весь svg целиком — это стирало бы след слизи при
        // каждом setOverride()/update().
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
            rafId: null,
            lastFrameTs: null,
            // 0 = стоит на месте, 1 = идёт — плавно едет между значениями
            // (см. WORM_MOVE_INTENSITY_SMOOTH_BASE), рычаг интенсивности
            // ТОЛЬКО виляния (амплитуда/скорость покачивания и "флик"
            // хвоста) — растяжение звеньев с этим полем больше не связано,
            // см. speedIntensity ниже.
            moveIntensity: 0,
            // 0..1 — от ФАКТИЧЕСКОЙ мгновенной скорости перемещения
            // (см. WORM_SPEED_REF_PX_PER_SEC), а не от бинарного
            // "движется/стоит". Двигает длину звена напольной цепи.
            speedIntensity: 0,
            // Метка времени (из rAF), когда персонаж в следующий раз
            // сорвётся с места из состояния покоя; null — пока не назначена
            // (назначается сразу, как только он остановился).
            nextMoveAt: null,
            // Аккумуляторы фазы покачивания цепи и "флика" кончика хвоста —
            // см. блок "ВТОРОЙ, БОЛЕЕ КОВАРНЫЙ ТАЙМИНГ-БАГ" у констант выше.
            // НЕ путать с animTime: эти два поля прирастают ТЕКУЩЕЙ скоростью
            // каждый кадр, а не умножаются на неё постфактум.
            chainWigglePhase: 0,
            tailWagPhase: 0,
            // Активный (ещё дорисовывающийся) след слизи и все следы,
            // которые сейчас гаснут на полу.
            activeSlimeTrail: null,
            slimeTrails: [],
            // "Горячий" канал для непрерывных обновлений от мини-игр — не
            // трогает baseModel/override, не вызывает пересборку SVG,
            // применяется каждый кадр напрямую поверх обычной анимации.
            livePose: {
                tailBendAngle: 0,   // градусы поворота хвоста вокруг точки крепления
                eyelidLevel: null,  // 0..1 — подменяет базовый уровень век обоих глаз; null = не подменять
                bellyScale: null,   // множитель радиуса живота (1 = обычный); null = как 1
                // Рот — такой же "живой" параметр, как и всё остальное тело
                // (веко, живот, хвост): один и тот же канал используется и
                // главным экраном (мимика, "болтовня", улыбка/грусть — когда
                // это будет спроектировано), и любой мини-игрой — не
                // отдельный механизм на каждый контекст. null = не
                // подменять, брать текущее значение из модели/оверрайда.
                mouthOpenness: null, // 0..1 — подменяет head.mouth.openness
                mouthCurve: null     // подменяет head.mouth.curve (0=нейтраль, >0=улыбка, <0=грусть)
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
        // Рисуется прямыми отрезками вдоль пройденного пути — сейчас
        // персонаж и ходит прямыми отрезками. Если в будущем маршрут
        // станет ломаным (несколько отрезков под разными углами), точки
        // будут просто добавляться чаще и след сам повторит новую
        // траекторию — переписывать эту часть не придётся.
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

        // Начало следа — неаккуратная клякса-"мазок" (не идеальный круг) в
        // точке старта, плюс сам путь, который дальше будет дорисовываться.
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

        // Дорисовывает активный след новой точкой (не чаще, чем раз в
        // WORM_SLIME_MIN_STEP px пройденного пути) — получается ОДИН
        // цельный путь, а не куча мелких пятен друг на друге.
        function extendSlimeTrail(x, y) {
            const trail = state.activeSlimeTrail;
            if (!trail) return;
            const last = trail.points[trail.points.length - 1];
            if (Math.hypot(x - last.x, y - last.y) < WORM_SLIME_MIN_STEP) return;
            trail.points.push({ x, y });
            const d = trail.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
            trail.stroke.setAttribute('d', d);
        }

        // Вызывается каждый кадр: пока идёт движение — дорисовывает
        // активный след (или начинает новый, если его ещё нет). Как только
        // движение прекращается — "закрывает" след временем остановки,
        // дальше он гаснет сам (см. ниже), даже если персонаж уже снова
        // пошёл и рисует поверх новый, отдельный след.
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
            // dtSec — прошедшее время в секундах; ниже используется ВЕЗДЕ,
            // где раньше был шаг "за кадр" (см. WORM_ANIM_TIME_PER_SEC),
            // чтобы скорость анимации не зависела от частоты кадров
            // устройства (см. комментарий у константы).
            const dtSec = Math.min(0.25, Math.max(0, dt / 1000)); // клэмп на случай подвисания вкладки
            state.animTime += dtSec * WORM_ANIM_TIME_PER_SEC;

            // ---------- ДВИЖЕНИЕ К ЦЕЛИ + РАСПИСАНИЕ "ПРОГУЛОК" ----------
            // Раньше новая случайная точка назначалась по таймеру каждые 3с
            // БЕЗУСЛОВНО — персонаж почти никогда не успевал долететь и
            // фактически двигался постоянно, состояния "стоит" не возникало
            // вовсе. Теперь после того как цель действительно достигнута,
            // персонаж выдерживает случайную паузу (WORM_IDLE_PAUSE_MIN/MAX)
            // и только потом срывается к новой точке — так появляются
            // настоящие периоды покоя, нужные и для контраста "стоит/идёт"
            // в анимации хвоста, и чтобы слизистый след успевал затухать.
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
            // Тоже framerate-независимо (см. WORM_MOVE_INTENSITY_SMOOTH_BASE)
            // — сходится к 0/1 примерно за одно и то же реальное время
            // независимо от частоты кадров устройства, никакого "залипания".
            // Двигает ТОЛЬКО виляние (см. комментарий у поля moveIntensity).
            const intensityFactor = 1 - Math.pow(WORM_MOVE_INTENSITY_SMOOTH_BASE, dtSec);
            state.moveIntensity += ((isMoving ? 1 : 0) - state.moveIntensity) * intensityFactor;

            // Растяжение звеньев напольной цепи — от РЕАЛЬНОЙ мгновенной
            // скорости (см. WORM_SPEED_REF_PX_PER_SEC), не от бинарного
            // isMoving. Сглаживание быстрое — только чтобы не было
            // единичного скачка длины в первый кадр после назначения новой
            // цели, а НЕ для медленного "затухания" (та скорость и так уже
            // плавно идёт к нулю по мере приближения к цели).
            const speedIntensityTarget = Math.min(1, instSpeed / WORM_SPEED_REF_PX_PER_SEC);
            const speedIntensityFactor = 1 - Math.pow(WORM_SPEED_INTENSITY_SMOOTH_BASE, dtSec);
            state.speedIntensity += (speedIntensityTarget - state.speedIntensity) * speedIntensityFactor;

            if (state.built) {
                state.built.root.setAttribute('transform', rootTransform());

                // Модель читаем один раз за кадр и переиспользуем ниже (для
                // век и для рта) — не по 2-3 раза за тик.
                const mm = mergedModel();

                const bellySeg = state.built.segments.find(s => s.name === 'belly');
                const bellyFactor = state.livePose.bellyScale != null ? state.livePose.bellyScale : 1;
                // Раздувшийся живот растёт "вперёд" (в сторону хвоста) от
                // неподвижной точки стыка с головным соседом (см. cx ниже),
                // а сегменты дальше по цепочке отодвигаются РОВНО на ту же
                // величину, на какую вырос сам живот — так нахлёст живота на
                // соседей остаётся примерно таким же, как и в состоянии покоя.
                const bellyGrowX = bellySeg ? Math.max(0, bellySeg.baseRx * (bellyFactor - 1)) : 0;
                // Край живота, обращённый к хвосту, смещается СРАЗУ по двум
                // причинам: (1) сам rx растёт на bellyGrowX, (2) центр (cx)
                // сдвигается ещё на -bellyGrowX, чтобы не наезжать на
                // головного соседа. Оба сдвига складываются — поэтому
                // соседей нужно отодвигать на удвоенную величину, иначе
                // живот их постепенно перекрывает.
                const bellyPushGap = bellyGrowX * 2;
                const bellyIdx = bellySeg ? bellySeg.idx : -1;

                let lastGrowLocal = null;
                const lastGrowingName = mm.growingSegments.length ? `growing-${mm.growingSegments.length}` : null;
                // Общая фаза дыхания вертикальной части (см. WORM_BREATH_RATIO) —
                // объявлена здесь (а не внутри ветки 'standing'), т.к. нужна и
                // блоку "if (bellySeg)" ниже, который выполняется вне этого if/else.
                let breathWave = 0;

                if (opts.pose === 'lying') {
                    // ---------- СТАРАЯ РАСКЛАДКА: ОДНА ПРЯМАЯ ЛИНИЯ ----------
                    // Логика не тронута — нужна Чревоугодию, где персонаж
                    // лежит плашмя на боку во время кормления.
                    const wave = opts.idleWave ? Math.sin(state.animTime) * 8 : 0;
                    state.built.head.group.setAttribute('transform', `translate(0,${wave.toFixed(2)})`);

                    state.built.segments.forEach(seg => {
                        const extraGap = seg.idx > bellyIdx ? bellyPushGap : 0;
                        const sx = -(seg.idx * WORM_SEGMENT_SPACING + WORM_CHAIN_HEAD_GAP + extraGap);
                        const sy = opts.idleWave ? (Math.sin(state.animTime + seg.idx * 0.6) * 12 + seg.idx * 4) : 0;
                        seg.group.setAttribute('transform', `translate(${sx.toFixed(1)},${sy.toFixed(1)})`);
                    });

                    const tsx = -(state.built.tail.idx * WORM_SEGMENT_SPACING + WORM_CHAIN_HEAD_GAP + bellyPushGap);
                    const tsy = opts.idleWave ? (Math.sin(state.animTime + state.built.tail.idx * 0.6) * 12 + state.built.tail.idx * 4) : 0;
                    state.built.tail.group.setAttribute('transform', `translate(${tsx.toFixed(1)},${tsy.toFixed(1)})`);
                    if (state.built.tail.bendGroup) {
                        state.built.tail.bendGroup.setAttribute('transform', `rotate(${state.livePose.tailBendAngle.toFixed(1)})`);
                    }
                } else {
                    // ---------- НОВАЯ "СТОЯЩАЯ" ПОЗА ----------
                    // Голова совсем неподвижна — никакого общего покачивания
                    // тела (это и было то "болтыхание волной", от которого
                    // просили избавиться).
                    state.built.head.group.setAttribute('transform', 'translate(0,0)');

                    const floorY = bellyIdx * WORM_VERTICAL_SPACING + WORM_CHAIN_HEAD_GAP;

                    // ЕДИНАЯ фаза дыхания на всю вертикальную часть — это
                    // ОДНА и та же анимация (не бегущая волна по сегментам,
                    // как было раньше), просто с разной амплитудой на
                    // разных сегментах, см. WORM_BREATH_RATIO. Живот
                    // применяется отдельно, ниже (его rx/ry дальше по коду
                    // всё равно пересчитываются из-за bellyScale — см. блок
                    // "if (bellySeg)").
                    //
                    // Правка 18: (1 - cos(x)) / 2 вместо sin(x) — та же
                    // угловая скорость и период, что и раньше, но волна
                    // ОДНОПОЛЯРНАЯ: стартует с 0 (стандартный радиус),
                    // плавно поднимается до 1 (пик роста) и плавно
                    // возвращается к 0 — никогда не уходит в отрицательные
                    // значения (то есть радиус никогда не становится меньше
                    // стандартного, только больше и обратно).
                    breathWave = opts.idleWave ? (1 - Math.cos(state.animTime * WORM_BREATH_SPEED)) / 2 : 0;

                    // Вертикальная часть (fixedSegments + сам живот) — стоит
                    // неподвижным столбиком строго над точкой пола, никакого
                    // виляния, только "дыхание".
                    state.built.segments.forEach(seg => {
                        if (seg.idx > bellyIdx) return;
                        const vy = seg.idx * WORM_VERTICAL_SPACING + WORM_CHAIN_HEAD_GAP;
                        seg.group.setAttribute('transform', `translate(0,${vy.toFixed(1)})`);
                        const breathRatio = WORM_BREATH_RATIO[seg.name];
                        if (breathRatio != null) {
                            const breathFactor = 1 + breathWave * WORM_BREATH_AMP * breathRatio;
                            seg.ellipse.setAttribute('rx', (seg.baseRx * breathFactor).toFixed(2));
                            seg.ellipse.setAttribute('ry', (seg.baseRy * breathFactor).toFixed(2));
                        }
                    });

                    // Напольная часть (growing-сегменты + хвост) — простая
                    // кинематическая цепь: каждое звено строится СТРОГО от
                    // позиции предыдущего (позиция = предыдущая + фиксированная
                    // длина звена в чуть покачивающемся направлении), поэтому
                    // разъединиться геометрически невозможно ни при какой
                    // амплитуде покачивания — раньше каждый сегмент считался
                    // независимой формулой, из-за чего при рассинхроне фаз
                    // между соседями (и особенно между сегментами и хвостом,
                    // который вилял ПОВОРОТОМ, а не смещением) между ними
                    // возникал видимый зазор — "хвост отрывался от тела".
                    //
                    // Два НЕЗАВИСИМЫХ друг от друга параметра, как и просили:
                    // длина звена (linkLength — просто расстояние, "дышит"
                    // вместе с интенсивностью движения) и угол звена
                    // (wiggleDeg — лёгкое покачивание направления) — одно не
                    // влияет на другое, оба лишь совместно определяют, куда
                    // ставится СЛЕДУЮЩЕЕ звено от уже вычисленного предыдущего.
                    //
                    // ВАЖНО: перебирать сегменты нужно строго по возрастанию
                    // idx (от живота к хвосту) — порядок в state.built.segments
                    // это порядок Z-слоёв отрисовки (см. buildWormSVGGroup), не
                    // порядок цепочки, поэтому сортируем явно.
                    //
                    // "Доп. растяжение на ходу" (WORM_MOVE_SPACING_EXTRA) —
                    // общая для всех звеньев добавка (не зависит от радиусов),
                    // складывается ПОВЕРХ базовой (уже разной для каждой пары)
                    // длины — см. floorLinkBaseLength() у констант выше.
                    const moveStretch = WORM_MOVE_SPACING_EXTRA * state.speedIntensity;
                    const wiggleSpeed = lerp(WORM_CHAIN_WIGGLE_IDLE_SPEED, WORM_CHAIN_WIGGLE_MOVE_SPEED, state.moveIntensity);
                    const wiggleAmpDeg = lerp(WORM_CHAIN_WIGGLE_IDLE_DEG, WORM_CHAIN_WIGGLE_MOVE_DEG, state.moveIntensity);
                    const tailExtraWagDeg = lerp(WORM_TAIL_EXTRA_WAG_IDLE_DEG, WORM_TAIL_EXTRA_WAG_MOVE_DEG, state.moveIntensity);
                    const DEG2RAD = Math.PI / 180;

                    // Аккумулируем фазу ТЕКУЩЕЙ скоростью (не умножаем на неё
                    // animTime — см. "ВТОРОЙ, БОЛЕЕ КОВАРНЫЙ ТАЙМИНГ-БАГ" у
                    // констант). tailWagPhase — отдельный аккумулятор (у
                    // "флика" кончика хвоста свой множитель скорости ×1.3),
                    // чтобы он больше никогда не мог разойтись рывком с
                    // фазой самой цепи.
                    state.chainWigglePhase += dtSec * WORM_ANIM_TIME_PER_SEC * wiggleSpeed;
                    state.tailWagPhase += dtSec * WORM_ANIM_TIME_PER_SEC * wiggleSpeed * 1.3;

                    const floorSegments = state.built.segments
                        .filter(seg => seg.idx > bellyIdx)
                        .sort((a, b) => a.idx - b.idx);

                    // Цепь стартует из позиции живота; bellyPushGap (доп.
                    // раздвижка при раздутом животе) — разовый сдвиг старта,
                    // не добавка к каждому звену, как и раньше.
                    let chainX = -bellyPushGap;
                    let chainY = floorY;
                    // Радиус ПРЕДЫДУЩЕЙ по цепи части — стартует с живота,
                    // дальше каждый шаг сдвигается на радиус только что
                    // поставленного звена (см. floorLinkBaseLength).
                    let prevRadius = bellySeg ? bellySeg.baseRx : 15;
                    floorSegments.forEach(seg => {
                        const stepsFromBelly = seg.idx - bellyIdx;
                        const wiggleDeg = opts.idleWave ? Math.sin(state.chainWigglePhase + stepsFromBelly * WORM_CHAIN_PHASE_STEP) * wiggleAmpDeg : 0;
                        const angleRad = (180 + wiggleDeg) * DEG2RAD;
                        const linkLength = floorLinkBaseLength(prevRadius, seg.baseRx) + moveStretch;
                        chainX += linkLength * Math.cos(angleRad);
                        chainY += linkLength * Math.sin(angleRad);
                        seg.group.setAttribute('transform', `translate(${chainX.toFixed(1)},${chainY.toFixed(1)})`);
                        prevRadius = seg.baseRx;
                        if (seg.name === lastGrowingName) {
                            lastGrowLocal = { x: chainX, y: chainY };
                        }
                    });

                    // Хвост — последнее звено той же цепи (позиция строится
                    // ровно так же, из последнего chainX/chainY).
                    const tailStepsFromBelly = state.built.tail.idx - bellyIdx;
                    const tailWiggleDeg = opts.idleWave ? Math.sin(state.chainWigglePhase + tailStepsFromBelly * WORM_CHAIN_PHASE_STEP) * wiggleAmpDeg : 0;
                    const tailAngleDeg = 180 + tailWiggleDeg;
                    const tailAngleRad = tailAngleDeg * DEG2RAD;
                    const tailLinkLength = floorLinkBaseLength(prevRadius, state.built.tail.baseRadius) + moveStretch;
                    chainX += tailLinkLength * Math.cos(tailAngleRad);
                    chainY += tailLinkLength * Math.sin(tailAngleRad);
                    state.built.tail.group.setAttribute('transform', `translate(${chainX.toFixed(1)},${chainY.toFixed(1)})`);
                    if (state.built.tail.bendGroup) {
                        // Хвост нарисован смотрящим по умолчанию влево (180°)
                        // — поворачиваем его РОВНО настолько, насколько
                        // отклонилось звено крепления (tailAngleDeg-180), плюс
                        // отдельный, чуть более заметный косметический "флик"
                        // кончика (tailExtraWagDeg). Этот доп. поворот крутит
                        // только САМУ ФОРМУ хвоста вокруг уже правильно
                        // вычисленной точки крепления — на позицию/
                        // непрерывность цепи никак не влияет, разъединения не
                        // создаёт, просто хвост выглядит чуть более "живым",
                        // чем круглые сегменты. tailBendAngle из мини-игр
                        // (livePose) складывается поверх всего этого.
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
                    // Дыхание живота (WORM_BREATH_RATIO.belly — эталонная,
                    // 100%-я амплитуда) умножается на bellyFactor (раздутие
                    // из мини-игр через livePose.bellyScale), а не заменяет
                    // его — оба эффекта складываются естественно.
                    const bellyBreathFactor = 1 + breathWave * WORM_BREATH_AMP * (WORM_BREATH_RATIO.belly || 0);
                    const effectiveBellyFactor = bellyFactor * bellyBreathFactor;
                    const newRx = bellySeg.baseRx * effectiveBellyFactor;
                    const newRy = bellySeg.baseRy * effectiveBellyFactor;
                    let cy = 0;
                    if (opts.bellyGrowthAnchor === 'bottom') cy = -(newRy - bellySeg.baseRy);
                    else if (opts.bellyGrowthAnchor === 'top') cy = (newRy - bellySeg.baseRy);
                    // По X живот всегда "растёт вперёд": локальный +X — это
                    // сторона стыка с головным соседом (сегмент-2), она
                    // остаётся на месте (не наезжает на соседа), а вся
                    // прибавка объёма уходит в сторону хвоста (-X).
                    const cx = -bellyGrowX;
                    bellySeg.ellipse.setAttribute('rx', newRx.toFixed(2));
                    bellySeg.ellipse.setAttribute('ry', newRy.toFixed(2));
                    bellySeg.ellipse.setAttribute('cx', cx.toFixed(2));
                    bellySeg.ellipse.setAttribute('cy', cy.toFixed(2));
                    // Блик на животе следует за его текущим размером/сдвигом,
                    // иначе при сильном раздутии он остаётся "прилипшим" к
                    // исходному маленькому животу и выглядит смещённым.
                    if (bellySeg.shine) {
                        bellySeg.shine.setAttribute('cx', (cx - newRx * 0.25).toFixed(2));
                        bellySeg.shine.setAttribute('cy', (cy - newRy * 0.4).toFixed(2));
                        bellySeg.shine.setAttribute('rx', (newRx * 0.38).toFixed(2));
                        bellySeg.shine.setAttribute('ry', (newRy * 0.22).toFixed(2));
                    }
                }

                // Рот — пересчитываем форму каждый кадр из bend/gap, оба
                // параметра берём из "живого" канала, если он задан, иначе
                // из модели. Один и тот же механизм что для главного
                // экрана (будущая мимика/"болтовня"), что для мини-игр
                // (сейчас — Чревоугодие, наклон ведра) — без пересборки SVG.
                const mouthBuiltRef = state.built.head.mouth;
                if (mouthBuiltRef) {
                    const liveOpenness = state.livePose.mouthOpenness;
                    const openness = liveOpenness != null ? liveOpenness : Math.max(0, mm.head.mouth.openness || 0);
                    const liveCurve = state.livePose.mouthCurve;
                    const curve = liveCurve != null ? liveCurve : mm.head.mouth.curve;
                    const bend = mouthBendFromCurve(curve);
                    const gap = mouthBuiltRef.MAX_GAP * Math.max(0, Math.min(1, openness));
                    updateMouthGeometry(mouthBuiltRef, bend, gap);
                }

                if (opts.blink) {
                    state.blinkClock += dt;
                    const cyclePos = state.blinkClock % WORM_BLINK_CYCLE;
                    // Моргание — не мгновенный щелчок между "открыто" и
                    // "закрыто", а непрерывная функция времени: внутри окна
                    // длиной WORM_BLINK_DURATION веко-шторка идёт по
                    // синусоиде 0 → 1 → 0, поэтому в каждом кадре окна у неё
                    // РАЗНОЕ положение — глаз реально закрывается и
                    // открывается, а не телепортируется между состояниями.
                    // Быстро (окно короткое), но плавно (кадр за кадром).
                    let blinkLevel = 0;
                    if (cyclePos >= WORM_BLINK_START && cyclePos < WORM_BLINK_START + WORM_BLINK_DURATION) {
                        const p = (cyclePos - WORM_BLINK_START) / WORM_BLINK_DURATION;
                        blinkLevel = Math.sin(p * Math.PI);
                    }
                    ['left', 'right'].forEach(side => {
                        const eyeModel = mm.eyes[side];
                        const eyeRef = state.built.head.eyes[side];
                        const restLevel = state.livePose.eyelidLevel != null ? state.livePose.eyelidLevel : eyeModel.eyelid.level;
                        const level = Math.max(restLevel, blinkLevel);
                        // level=0 — веко-шторка целиком выше глаза (скрыто
                        // клипом), level=1 — веко центрировано на глазу и
                        // полностью его перекрывает (пластина выше диаметра
                        // глаза, см. buildEyeNode).
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
            },
            // Правка 17: точечная перестановка "точки стояния" персонажа
            // (той самой (wormX, wormY), от которой считается голова и
            // вся цепочка) уже ПОСЛЕ монтирования — нужна мини-играм, где
            // раскладку нельзя выразить одним фиксированным anchorX/anchorY
            // (например, Чревоугодие подгоняет позицию под реально
            // отрисованные габариты персонажа, чтобы он весь помещался в
            // сцену и кастрюля всегда была строго над головой). Координаты
            // — те же единицы, что и getBoundingClientRect() контейнера
            // монтирования (viewBox 1:1 с CSS-пикселями, см.
            // syncViewportSize). wander (если он включён) продолжит вести
            // персонажа от новой точки, а не дёргать его обратно к старой.
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
            // Прямой доступ к SVG для точечных вещей, которые не стоит тащить
            // в общий API рендерера (хит-тест по конкретной части, разовая
            // подстройка стиля конкретной мини-игрой). Ищи части по
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
