// ================= ПУЛЬТ ВНЕШНОСТИ ЧЕРВЯ =================
// Шаг 3 перехода к визуальному управлению. Переводит человеческое намерение
// («объём головы на 15% больше») в числа модели — и ничего не рисует.
//
// ---------- ЗАЧЕМ ОН ПОВЕРХ, А НЕ ВМЕСТО ----------
// Низ уже параметризован: в модели шесть десятков числовых ручек плюс два
// десятка живых каналов. Не хватало не ручек, а СЛОВАРЯ и ПРОВОДКИ. За
// каждым числом рендерера стоит провал, описанный в комментарии рядом, —
// заменить их «понятными параметрами» значило бы выбросить знание.
//
// Поэтому пульт только переводит. Рендерер о нём не знает; убери файл — и
// ничего не изменится, кроме того, что крутить станет нечего.
//
// ---------- ТРИ ПРАВИЛА СЛОВАРЯ ----------
//   1. Значения ОТНОСИТЕЛЬНЫЕ. `headSize: +0.15` — «на 15% больше, чем
//      сейчас задумано», а не «поставь 1.15». Так команду можно выполнить,
//      не зная состояния, — и ровно так её формулирует человек.
//   2. Ноль — «как задумано». Диапазон −1…+1 или 0…1, и границы стоят там,
//      где кончается художественно допустимое, а не математика.
//   3. Ручка знает свои связи и умеет их ЗАМОРОЗИТЬ. «Увеличь голову, но не
//      трогай глаза» — не пожелание, а `lock: ['eyes']`, который пульт
//      проверяет.
//
// ---------- ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ ----------
// Прямого доступа к LIGHT по частям, hex мимо палитры и своего силуэта у
// сегмента. Это конституция стиля: единый свет, единая палитра, один
// силуэт. Пульт умеет сказать «нельзя и почему» — иначе первая же сессия
// расставит по частям тела отдельные лампочки и вернётся гирлянда из
// пластика (docs/art-direction.md, §3).

// ---------- КАК СЧИТАЕТСЯ НОВОЕ ЗНАЧЕНИЕ ----------
//   mul    — размеры: base × (1 + v). Размер вдвое больше и вдвое меньше
//            должны стоить одного движения ручки, а не разного.
//   add01  — доли 0…1 (блеск, матовость, видимость органов): base + v,
//            с зажимом. Умножение здесь врёт: у нуля умножать нечего, и
//            ручка на выключенном эффекте переставала бы работать вовсе.
//   count  — штуки (мышечные тяжи): округление, минимум один.
//   light  — общий свет сцены. Живёт НЕ в модели, поэтому правится и
//            откатывается отдельно (см. applyLight).
//   live   — живой канал (setLivePose): пересборки не требует.
const WORM_LOOK_KNOBS = [
    // ---------- ГАБАРИТЫ ----------
    { key: 'headSize', title: 'размер головы', group: 'габариты', kind: 'mul',
      paths: ['head.scale'], linked: ['eyes', 'ears'] },
    { key: 'bellySize', title: 'размер живота', group: 'габариты', kind: 'mul',
      paths: ['belly.radius'] },
    { key: 'neck', title: 'шея', group: 'габариты', kind: 'mul',
      paths: ['fixedSegments.0.radius'] },
    { key: 'thickness', title: 'толщина тела', group: 'габариты', kind: 'mul',
      paths: (m) => chainRadiusPaths(m) },
    { key: 'tailLength', title: 'длина хвоста', group: 'габариты', kind: 'mul',
      paths: ['tail.length'] },
    { key: 'tailThickness', title: 'толщина хвоста', group: 'габариты', kind: 'mul',
      paths: ['tail.thickness'] },
    { key: 'eyeSize', title: 'размер глаз', group: 'габариты', kind: 'mul',
      paths: ['eyes.left.scale', 'eyes.right.scale'] },
    { key: 'earSize', title: 'размер ушей', group: 'габариты', kind: 'mul',
      paths: ['head.ears.left.scale', 'head.ears.right.scale'] },

    // ---------- ЧЕРЕП ----------
    // Ширины идут парами «обе стороны» и «одна сторона». Общая двигает
    // номинал, боковая — перекос (head.skull.skew), и только она позволяет
    // тянуть левую скулу, не утаскивая правую.
    { key: 'headWidthBrow',   title: 'лоб',        group: 'череп', kind: 'mul', paths: ['head.skull.browWidth'] },
    { key: 'headWidthTemple', title: 'виски',      group: 'череп', kind: 'mul', paths: ['head.skull.templeWidth'] },
    { key: 'headWidthCheek',  title: 'скулы',      group: 'череп', kind: 'mul', paths: ['head.skull.cheekWidth'] },
    { key: 'headWidthJaw',    title: 'брыли',      group: 'череп', kind: 'mul', paths: ['head.skull.jawWidth'] },
    { key: 'headWidthMuzzle', title: 'морда',      group: 'череп', kind: 'mul', paths: ['head.skull.muzzleWidth'] },
    { key: 'headChin',        title: 'подбородок', group: 'череп', kind: 'mul', paths: ['head.skull.chinDrop'] },

    // ---------- ОБЪЁМ И СВЕТ ----------
    // `volume` — ОТДЕЛЬНАЯ ручка от размера, и это главная мысль словаря.
    // Когда говорят «плоский», почти никогда не просят «больше»: просят
    // резче свет и рельеф.
    { key: 'volume',   title: 'объём',    group: 'свет', kind: 'light', light: ['highlight', 'shadow'] },
    { key: 'contrast', title: 'контраст', group: 'свет', kind: 'light', light: ['verticalFalloff'] },
    { key: 'lightAngle', title: 'угол света', group: 'свет', kind: 'light', light: ['dir'] },
    { key: 'relief', title: 'рельеф', group: 'свет', kind: 'add01',
      paths: ['head.skull.relief', 'anatomy.muscle.tone'] },

    // ---------- ПОВЕРХНОСТЬ ----------
    { key: 'gloss',   title: 'блеск',      group: 'поверхность', kind: 'add01', paths: ['anatomy.coat.slimeGloss'] },
    { key: 'matte',   title: 'матовость',  group: 'поверхность', kind: 'add01', paths: ['anatomy.coat.matte'] },
    { key: 'rings',   title: 'кольца',     group: 'поверхность', kind: 'add01', paths: ['anatomy.coat.rings'] },
    { key: 'bristle', title: 'щетина',     group: 'поверхность', kind: 'add01', paths: ['anatomy.coat.bristle'] },
    { key: 'folds',   title: 'складки',    group: 'поверхность', kind: 'add01', paths: ['anatomy.coat.folds'] },
    { key: 'detail',  title: 'детальность', group: 'поверхность', kind: 'count', paths: ['anatomy.muscle.bundles'] },

    // ---------- НУТРО ----------
    { key: 'organs', title: 'органы', group: 'нутро', kind: 'add01',
      paths: ['anatomy.organs.visibility'] },
    { key: 'translucency', title: 'прозрачность кожи', group: 'нутро', kind: 'add01',
      paths: ['anatomy.skin.thinness.belly', 'anatomy.skin.thinness.segment-2'] },
    { key: 'guts', title: 'густота кишки', group: 'нутро', kind: 'mul',
      paths: ['anatomy.organs.tract.loopDensity'] },

    // ---------- ЖИВОЕ ----------
    // Пересборки не требует: переставляются атрибуты уже созданных узлов.
    { key: 'breath', title: 'дыхание', group: 'живое', kind: 'live', live: 'breathAmp', base: 0.035 },
    { key: 'mood',   title: 'настроение', group: 'живое', kind: 'live', live: 'mouthCurve', base: 0.28 }
];

// Радиусы всей цепочки — путями. Растущих сегментов бывает от двух до
// десяти, поэтому список считается от модели, а не пишется руками.
function chainRadiusPaths(m) {
    const out = ['belly.radius'];
    (m.fixedSegments || []).forEach((_, i) => out.push(`fixedSegments.${i}.radius`));
    (m.growingSegments || []).forEach((_, i) => out.push(`growingSegments.${i}.radius`));
    return out;
}

// ---------- ЧТО НЕЛЬЗЯ ----------
// Не «не советуем», а отказ с причиной. Пульт — единственное место, где
// правила стиля можно защитить от того, кто их не читал.
const WORM_LOOK_FORBIDDEN = {
    'light.part': 'свет в проекте ОДИН на сцену: у каждой части своя лампочка — это «гирлянда из пластика» (docs/art-direction.md, §3)',
    'color.hex': 'цвет берётся из палитры (src/core/palette.js), хардкод hex запрещён',
    'outline.part': 'силуэт один на тело: своя обводка у сегмента превращает червя в стопку шаров (docs/traps.md, п. 103)'
};

function lookGet(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function lookSet(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        // Массивы восстанавливаются массивами: deepMergeWormObjects заменяет
        // массив целиком, и подсунутый вместо него объект с ключами «0», «1»
        // молча выбросил бы остальные сегменты.
        if (cur[k] == null || typeof cur[k] !== 'object') {
            cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
        }
        cur = cur[k];
    }
    cur[keys[keys.length - 1]] = value;
    return obj;
}

const WormLook = {
    // Накопленный патч ручек: ключ → относительное значение. Ноль и
    // отсутствие — одно и то же.
    values: {},
    // Что заморожено: имена сущностей или ручек.
    locks: [],
    // История шагов. Достаётся ДАРОМ: setOverride заменяет патч целиком, а
    // не сливает, поэтому накопленное всё равно приходится хранить здесь, —
    // а раз оно хранится, стопка снимков и есть история с откатом.
    history: [],
    // Чужой оверрайд, поверх которого мы кладём своё (подмена внешности в
    // лобби гнева). Снимается один раз, при первом применении.
    foreign: null,
    // Исходный свет: он живёт не в модели, и откатывать его надо вручную.
    lightBase: null,

    knobs() { return WORM_LOOK_KNOBS; },

    knob(key) { return WORM_LOOK_KNOBS.find(k => k.key === key) || null; },

    // Реестр для панели и для агента: что можно крутить, в каких границах,
    // где стоит сейчас и с чем связано. Агент не угадывает имена — он их
    // спрашивает.
    registry(handle) {
        // От ИСХОДНОЙ, а не от текущей: `now` обязан показывать, во что
        // ручка превратит задуманное значение, а не во что превратит уже
        // превращённое.
        const m = handle ? this.baseModel(handle) : null;
        return WORM_LOOK_KNOBS.map(k => ({
            key: k.key, title: k.title, group: k.group, kind: k.kind,
            value: this.values[k.key] || 0,
            range: [-1, 1],
            linked: k.linked || [],
            locked: this.isLocked(k.key),
            now: m ? this.absolute(m, k) : null
        }));
    },

    forbidden() { return WORM_LOOK_FORBIDDEN; },

    // ---------- ЗАМОРОЗКА ----------
    // Заморожено может быть имя ручки ('eyeSize') или имя сущности
    // ('eyes', 'body'): человек говорит «не трогай глаза», а не «не трогай
    // eyeSize».
    ZONES: {
        eyes: ['eyeSize'],
        ears: ['earSize'],
        head: ['headSize', 'headWidthBrow', 'headWidthTemple', 'headWidthCheek',
               'headWidthJaw', 'headWidthMuzzle', 'headChin'],
        body: ['bellySize', 'neck', 'thickness'],
        tail: ['tailLength', 'tailThickness'],
        face: ['mood']
    },

    isLocked(key) {
        if (this.locks.indexOf(key) !== -1) return true;
        return this.locks.some(z => (this.ZONES[z] || []).indexOf(key) !== -1);
    },

    lock(list) { this.locks = (list || []).slice(); },

    // ---------- ПРИМЕНИТЬ ----------
    // patch: { headSize: +0.15, lock: ['eyes'] }. Значения ОТНОСИТЕЛЬНЫЕ и
    // НАКАПЛИВАЮТСЯ: два раза по +0.1 — это +0.2, а не +0.1.
    apply(handle, patch, opts) {
        if (!handle || !patch) return { changed: [], refused: [] };
        if (this.foreign === null && typeof handle.getOverride === 'function') {
            this.foreign = handle.getOverride() || {};
        }
        if (patch.lock) this.lock(patch.lock);

        const changed = [], refused = [];
        Object.keys(patch).forEach(key => {
            if (key === 'lock') return;
            const k = this.knob(key);
            if (!k) { refused.push({ key, why: 'такой ручки нет' }); return; }
            if (this.isLocked(key)) { refused.push({ key, why: 'заморожена' }); return; }
            const v = Number(patch[key]);
            if (!isFinite(v)) { refused.push({ key, why: 'не число' }); return; }
            // Абсолютная замена, а не накопление, когда просят именно её:
            // ползунку панели нужно «поставь ровно столько».
            const next = (opts && opts.absolute) ? v : (this.values[key] || 0) + v;
            this.values[key] = Math.max(-1, Math.min(1, next));
            changed.push(key);
        });

        if (changed.length) {
            this.history.push({ at: Date.now(), patch: Object.assign({}, patch),
                                snapshot: Object.assign({}, this.values) });
            if (this.history.length > 40) this.history.shift();
        }
        this.push(handle);
        return { changed, refused };
    },

    // ---------- ИСХОДНАЯ МОДЕЛЬ ----------
    // «Как задумано»: базовая модель плюс чужой оверрайд (подмена внешности
    // мини-игрой), но БЕЗ того, что написал сам пульт.
    //
    // Это самое важное место файла. Пока здесь стоял `getModel()`, пульт
    // читал модель С УЖЕ НАЛОЖЕННЫМ СВОИМ ПАТЧЕМ и множил её ещё раз на
    // каждом движении ползунка: ручка стояла на +0.5, а голова шла
    // 1.5 → 2.25 → 3.375 → 5.06 → 7.59. Вернуть её было нельзя ничем, кроме
    // полного сброса: любое ненулевое значение продолжало множить от
    // раздутого, а ноль просто убирал ключ из патча.
    //
    // Относительная ручка обязана отсчитывать от НЕПОДВИЖНОЙ точки. Иначе
    // это не ручка, а педаль газа.
    baseModel(handle) {
        const api = window.WormModelAPI;
        if (typeof handle.getBaseModel === 'function' && api) {
            return api.mergeWormOverride(handle.getBaseModel(), this.foreign);
        }
        // Ручка старая и исходной модели не отдаёт. Честнее взять
        // сохранённую, чем считать от собственного патча.
        return api ? api.loadWormModel() : null;
    },

    // ---------- СОБРАТЬ И ОТДАТЬ ----------
    push(handle, opts) {
        const base = this.baseModel(handle);
        if (!base) return;
        const over = JSON.parse(JSON.stringify(this.foreign || {}));
        const live = {};

        WORM_LOOK_KNOBS.forEach(k => {
            const v = this.values[k.key];
            if (!v) return;
            if (k.kind === 'light') return;                 // свет отдельно
            if (k.kind === 'live') { live[k.live] = this.absolute(base, k); return; }
            const paths = typeof k.paths === 'function' ? k.paths(base) : k.paths;
            paths.forEach(p => {
                const b = lookGet(base, p);
                if (typeof b !== 'number') return;
                lookSet(over, p, this.value(k, b, v));
            });
        });

        // Перекос черепа — не ручка списка, а прямые пары «черта+сторона»
        // (см. skew). Кладётся как есть.
        if (this.skew && Object.keys(this.skew).length) {
            Object.keys(this.skew).forEach(n => lookSet(over, 'head.skull.skew.' + n, this.skew[n]));
        }

        this.applyLight();
        // Живое — сразу: оно переставляет атрибуты уже созданных узлов и
        // пересборки не требует.
        if (Object.keys(live).length && handle.setLivePose) handle.setLivePose(live);

        // ---------- ПЕРЕСБОРКА НЕ ЧАЩЕ КАДРА ----------
        // setOverride собирает персонажа ЦЕЛИКОМ — шестьсот с лишним узлов.
        // Ползунок шлёт события быстрее, чем идут кадры: замер дал 23 полных
        // пересборки в секунду. Копим последнее состояние и отдаём его раз в
        // кадр; промежуточных всё равно никто не увидит.
        //
        // И не отдаём вовсе, если получилось то же самое: соседние шаги
        // ползунка часто дают одинаковые числа после округления, а
        // пересборка ради того же результата — чистая трата.
        const json = JSON.stringify(over);
        // Совпало с тем, что УЖЕ на персонаже — отдавать нечего. Но и
        // копить нечего тоже: отложенное состояние здесь обязано погибнуть.
        // Пока оно просто оставалось в очереди, кадр спустя прилетала
        // отменённая правка — сброс отрабатывал, а следом червь молча
        // возвращался к значению, которое сброс только что снял.
        if (json === this.lastJson) { this.pending = null; return; }
        this.pending = { handle, over, json };
        if (opts && opts.immediate) { this.flush(); return; }
        if (!this.pendingRaf) {
            this.pendingRaf = requestAnimationFrame(() => {
                this.pendingRaf = 0;
                this.flush();
            });
        }
    },

    // Отдать накопленное. Зовётся раз в кадр, а на отпускании ползунка и на
    // любой разовой правке — сразу: последнее значение обязано долететь, даже
    // если кадров больше не будет.
    flush() {
        const p = this.pending;
        if (!p) return;
        this.pending = null;
        this.lastJson = p.json;
        p.handle.setOverride(p.over);
    },

    value(k, base, v) {
        if (k.kind === 'mul') return base * (1 + v);
        if (k.kind === 'add01') return Math.max(0, Math.min(1, base + v));
        if (k.kind === 'count') return Math.max(1, Math.round(base * (1 + v)));
        return base;
    },

    absolute(model, k) {
        if (k.kind === 'light') return null;
        if (k.kind === 'live') return this.value({ kind: 'mul' }, k.base, this.values[k.key] || 0);
        const paths = typeof k.paths === 'function' ? k.paths(model) : k.paths;
        const b = lookGet(model, paths[0]);
        if (typeof b !== 'number') return null;
        return +this.value(k, b, this.values[k.key] || 0).toFixed(4);
    },

    // ---------- СВЕТ ----------
    // LIGHT — глобальный объект сцены, а не часть модели: он общий на всех
    // червей и на все экраны. Поэтому правится прямо, а исходные значения
    // запоминаются, чтобы откат был настоящим.
    //
    // Отдельных лампочек по частям тут нет и быть не может: ручка двигает
    // ОДИН источник (docs/art-direction.md, §3).
    applyLight() {
        if (typeof LIGHT === 'undefined') return;
        if (!this.lightBase) {
            this.lightBase = { dirX: LIGHT.dirX, dirY: LIGHT.dirY,
                               highlight: LIGHT.highlight, shadow: LIGHT.shadow,
                               verticalFalloff: LIGHT.verticalFalloff };
        }
        const B = this.lightBase;
        const vol = this.values.volume || 0;
        const con = this.values.contrast || 0;
        const ang = this.values.lightAngle || 0;
        LIGHT.highlight = Math.max(0, Math.min(1, B.highlight * (1 + vol)));
        LIGHT.shadow = Math.max(0, Math.min(1, B.shadow * (1 + vol)));
        LIGHT.verticalFalloff = Math.max(0, Math.min(1, B.verticalFalloff * (1 + con)));
        // Угол поворачивает направление, а не растягивает его: длина вектора
        // — это «насколько сбоку светит», и менять её ручкой угла нельзя.
        const a0 = Math.atan2(B.dirY, B.dirX);
        const len = Math.hypot(B.dirX, B.dirY);
        const a = a0 + ang * Math.PI;
        LIGHT.dirX = Math.cos(a) * len;
        LIGHT.dirY = Math.sin(a) * len;
    },

    // ---------- ПЕРЕКОС ЧЕРЕПА ----------
    // Пара «черта + сторона»: cheekL, cheekR, browL… Прибавка к ширине, и
    // только она позволяет тянуть левую скулу, не утаскивая правую.
    skew: null,

    setSkew(handle, name, side, delta) {
        if (!this.skew) this.skew = {};
        const key = name + (side < 0 ? 'L' : 'R');
        this.skew[key] = Math.max(-0.6, Math.min(0.6, (this.skew[key] || 0) + delta));
        this.history.push({ at: Date.now(), patch: { [key]: delta },
                            snapshot: Object.assign({}, this.values),
                            skew: Object.assign({}, this.skew) });
        this.push(handle, { immediate: true });
        return this.skew[key];
    },

    // ---------- ОТКАТ ----------
    undo(handle) {
        if (this.history.length < 1) return false;
        this.history.pop();
        const prev = this.history[this.history.length - 1];
        this.values = prev ? Object.assign({}, prev.snapshot) : {};
        this.skew = prev && prev.skew ? Object.assign({}, prev.skew) : null;
        this.push(handle, { immediate: true });
        return true;
    },

    reset(handle) {
        this.values = {};
        this.skew = null;
        this.history = [];
        this.push(handle, { immediate: true });
        return true;
    },

    // ---------- ПАТЧ НАРУЖУ ----------
    // То, что можно вклеить в модель или отдать агенту. Только ненулевое:
    // патч из тридцати нулей ничего не сообщает.
    patch() {
        const out = {};
        Object.keys(this.values).forEach(k => { if (this.values[k]) out[k] = +this.values[k].toFixed(3); });
        if (this.skew && Object.keys(this.skew).length) out.skew = Object.assign({}, this.skew);
        if (this.locks.length) out.lock = this.locks.slice();
        return out;
    },

    // ---------- ПРЯМОЕ РЕДАКТИРОВАНИЕ ----------
    // Тянем сущность мышкой — пульт считает, какие ручки и насколько
    // подвинуть.
    //
    // Обратная формула НЕ выводится в уме и не пишется отдельно: она бы
    // стала вторым описанием того же, а посадка глаза зажата упорами, и
    // честного обратного выражения у неё нет вовсе. Вместо этого меряется
    // ЧУВСТВИТЕЛЬНОСТЬ: чуть двинули ручку — посмотрели, куда уехала точка
    // на экране. Это и есть перевод, и он работает для любой сущности, включая
    // ту, которую упор никуда не пустит: тогда чувствительность выходит
    // нулевой, и пульт честно говорит «эту ручку здесь не сдвинуть».
    //
    // Меряется ОДИН РАЗ в начале перетаскивания: каждая проба — это полная
    // пересборка персонажа, и делать по две на кадр значило бы возить
    // мышкой кисель.
    dragStart(handle, entityKey) {
        const e = WormParts.get(entityKey);
        if (!e || !handle) return null;
        const p0 = WormParts.client(handle, entityKey);
        if (!p0) return null;

        const drag = { entity: e, from: { x: p0.x, y: p0.y }, axes: [] };
        const H = 0.06;   // проба: заметно для замера, незаметно для глаза

        // У ориентира черепа своя ручка — ПЕРЕКОС его стороны. Она одна, и
        // двигает точку вдоль своей линии; на неё и проецируем.
        if (e.kind === 'landmark' && e.skull && e.skull.side !== 0) {
            const name = WORM_LOOK_SKEW_OF[e.key.replace(/-(left|right)$/, '')];
            if (name) {
                const before = this.skew ? Object.assign({}, this.skew) : null;
                this.setSkew(handle, name, e.skull.side, H);
                this.flush();
                const p1 = WormParts.client(handle, entityKey);
                this.skew = before;
                this.push(handle, { immediate: true });
                if (p1) drag.axes.push({ kind: 'skew', name, side: e.skull.side,
                                         dx: (p1.x - p0.x) / H, dy: (p1.y - p0.y) / H });
            }
            return drag.axes.length ? drag : null;
        }

        // У остальных — их собственные ручки из таблицы сущностей.
        (e.knobs || []).forEach(key => {
            const k = this.knob(key);
            if (!k || k.kind === 'light' || this.isLocked(key)) return;
            const was = this.values[key] || 0;
            this.values[key] = Math.max(-1, Math.min(1, was + H));
            this.push(handle, { immediate: true });
            const p1 = WormParts.client(handle, entityKey);
            this.values[key] = was;
            this.push(handle, { immediate: true });
            if (!p1) return;
            const dx = (p1.x - p0.x) / H, dy = (p1.y - p0.y) / H;
            // Ручка, которая точку не двигает, в перетаскивании не участвует:
            // иначе решатель делил бы на ноль и уводил внешность в никуда.
            if (Math.hypot(dx, dy) > 0.5) drag.axes.push({ kind: 'knob', key, dx, dy });
        });
        return drag.axes.length ? drag : null;
    },

    // Довести сущность до точки. Решение — проекция нужного смещения на
    // измеренные направления ручек, по одной: две ручки, тянущие точку почти
    // в одну сторону, при честном решении системы дают огромные разнонаправ-
    // ленные значения, и внешность разъезжается от одного движения мышкой.
    dragTo(handle, drag, clientX, clientY) {
        if (!drag || !handle) return null;
        const p = WormParts.client(handle, drag.entity.key);
        if (!p) return null;
        const needX = clientX - p.x, needY = clientY - p.y;
        const applied = [];
        drag.axes.forEach(ax => {
            const len2 = ax.dx * ax.dx + ax.dy * ax.dy;
            if (len2 < 0.25) return;
            const step = (needX * ax.dx + needY * ax.dy) / len2;
            if (!isFinite(step) || Math.abs(step) < 1e-4) return;
            if (ax.kind === 'skew') this.setSkew(handle, ax.name, ax.side, step);
            else {
                this.values[ax.key] = Math.max(-1, Math.min(1, (this.values[ax.key] || 0) + step));
                this.push(handle);
            }
            applied.push({ knob: ax.kind === 'skew' ? ax.name + (ax.side < 0 ? 'L' : 'R') : ax.key,
                           step: +step.toFixed(4) });
        });
        return applied;
    }
};

// Имя черты черепа по ключу сущности: «скула» → `cheek`. Держится рядом со
// словарём, а не внутри перетаскивания, чтобы связь «сущность ↔ перекос»
// была видна одним взглядом.
const WORM_LOOK_SKEW_OF = {
    forehead: 'brow', temple: 'temple', cheek: 'cheek',
    jowl: 'jaw', 'muzzle-edge': 'muzzle'
};

if (typeof window !== 'undefined') window.WormLook = WormLook;
if (typeof module !== 'undefined' && module.exports) module.exports = WormLook;
