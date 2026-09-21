// ================= ПРЕСЕТЫ ВНЕШНОСТИ =================
// Склад сохранённых вариантов: «острое ухо», «тяжёлая челюсть», «толстый
// червь». Отдельно по частям тела и отдельно на всего персонажа целиком.
//
// ---------- ЗАЧЕМ ОТДЕЛЬНО ПО ЧАСТЯМ ----------
// Внешность правят по кусочкам: полчаса над ухом, потом полчаса над
// черепом. Если сохранять можно только всё разом, каждая удачная находка
// тащит за собой весь остальной персонаж — и собрать «то ухо с этим
// черепом» нельзя вовсе. Поэтому пресет знает свою ОБЛАСТЬ и трогает
// только её.
//
// ---------- ЧТО ТАКОЕ ОБЛАСТЬ ----------
// Ровно то, что показывает панель студии, когда выбрана эта вещь: её ручки
// плюс то, что правится не ручками (перекос черепа, форма контура уха,
// обхват звена). То есть «сохранить» кладёт в пресет ИМЕННО ТО, ЧТО ТЫ
// СЕЙЧАС КРУТИЛ, — заводить для этого вторую классификацию частей не надо.
//
// Парные вещи живут ОДНОЙ областью: «ухо» — это оба уха, вместе с их
// асимметрией. Пресет — это внешность, а не половина внешности.
//
// ---------- ПОЧЕМУ ПАТЧ, А НЕ МОДЕЛЬ ----------
// Храним значения ПУЛЬТА (относительные, ноль = «как задумано»), а не куски
// модели. Модель меняется со взрослением и эволюцией, и вклеенный в неё
// кусок однажды окажется от другого тела. Относительная правка переживает
// это сама: «на 15% больше» осмысленно при любом размере.

const WORM_PRESETS_KEY = 'svinocherv:worm-presets:v1';
// Область «весь червь». Не пустая строка и не `body`: среди частей тела
// есть свои имена, и спутать их нельзя.
const WORM_PRESET_ALL = '__all__';
// Имя, которое есть всегда и которое нельзя ни занять, ни удалить: та
// внешность, какой персонаж задуман. Возврат к ней — это обнуление области,
// а не загрузка чего-то сохранённого.
const WORM_PRESET_DEFAULT = 'по умолчанию';

const WormPresets = {
    ALL: WORM_PRESET_ALL,
    DEFAULT: WORM_PRESET_DEFAULT,

    // ---------- ОБЛАСТЬ ПО ВЫБРАННОЙ ВЕЩИ ----------
    // Парные и производные сущности сводятся к одному имени: левое ухо,
    // правое ухо и любая точка их контура — это одна область «ear».
    scopeOf(key) {
        if (!key) return WORM_PRESET_ALL;
        let k = String(key);
        k = k.replace(/^girth-/, '');                       // обхват живота → живот
        k = k.replace(/^(ear-(?:base|front|tip|break|lobe))-(left|right)$/, 'ear');
        k = k.replace(/-(left|right)$/, '');                 // парные — одна область
        // Ориентиры черепа принадлежат голове: «скулы» правят тот же череп.
        if (['crown', 'forehead', 'temple', 'cheek', 'jowl', 'muzzle-edge', 'chin'].indexOf(k) >= 0) k = 'head';
        return k;
    },

    // ---------- ЧТО ВХОДИТ В ОБЛАСТЬ ----------
    // Ручки берутся у ВСЕХ сущностей, которые сводятся к этой области:
    // выбрал «скулы» — в область головы входят и ширины черепа, и размер.
    knobsOf(scope) {
        if (scope === WORM_PRESET_ALL) return WormLook.registry().map(k => k.key);
        const out = [];
        WormParts.list().forEach(e => {
            if (this.scopeOf(e.key) !== scope) return;
            (e.knobs || []).forEach(k => { if (out.indexOf(k) < 0 && WormLook.knob(k)) out.push(k); });
        });
        return out;
    },

    // ---------- СНЯТЬ ТЕКУЩЕЕ ----------
    // Только ненулевое: пресет из тридцати нулей ничего не сообщает, а
    // отличить «не трогали» от «поставили ноль» всё равно нельзя — ноль и
    // значит «как задумано».
    capture(scope) {
        const out = { values: {} };
        this.knobsOf(scope).forEach(k => {
            const v = WormLook.values[k];
            if (v) out.values[k] = +v.toFixed(4);
        });
        const всё = scope === WORM_PRESET_ALL;
        if (WormLook.skew && (всё || scope === 'head')) {
            const sk = {};
            Object.keys(WormLook.skew).forEach(n => { if (WormLook.skew[n]) sk[n] = WormLook.skew[n]; });
            if (Object.keys(sk).length) out.skew = sk;
        }
        if (WormLook.form) {
            const f = {};
            Object.keys(WormLook.form).forEach(host => {
                if (!всё && this.scopeOf(host) !== scope) return;
                if (Object.keys(WormLook.form[host] || {}).length) f[host] = WormLook.form[host];
            });
            if (Object.keys(f).length) out.form = JSON.parse(JSON.stringify(f));
        }
        if (WormLook.girth) {
            const g = {};
            Object.keys(WormLook.girth).forEach(path => {
                if (!WormLook.girth[path]) return;
                if (!всё && this.girthScope(path) !== scope) return;
                g[path] = WormLook.girth[path];
            });
            if (Object.keys(g).length) out.girth = g;
        }
        return out;
    },

    // Путь звена в модели → имя части: `growingSegments.0` → `growing-1`.
    girthScope(path) {
        if (path === 'belly') return 'belly';
        const m = /^(fixedSegments|growingSegments)\.(\d+)$/.exec(path);
        if (!m) return null;
        return (m[1] === 'fixedSegments' ? 'segment-' : 'growing-') + (+m[2] + 1);
    },

    // ---------- ПРИМЕНИТЬ ----------
    // Сначала область ОБНУЛЯЕТСЯ, потом накладывается пресет. Иначе загрузка
    // «острого уха» поверх «висящего» дала бы смесь двух, и ни один пресет
    // нельзя было бы узнать по его имени.
    apply(handle, scope, data) {
        this.clear(scope);
        if (data) {
            Object.keys(data.values || {}).forEach(k => { WormLook.values[k] = data.values[k]; });
            if (data.skew) {
                WormLook.skew = WormLook.skew || {};
                Object.keys(data.skew).forEach(n => { WormLook.skew[n] = data.skew[n]; });
            }
            if (data.form) {
                WormLook.form = WormLook.form || {};
                Object.keys(data.form).forEach(h => { WormLook.form[h] = JSON.parse(JSON.stringify(data.form[h])); });
            }
            if (data.girth) {
                WormLook.girth = WormLook.girth || {};
                Object.keys(data.girth).forEach(p => { WormLook.girth[p] = data.girth[p]; });
            }
        }
        WormLook.push(handle, { immediate: true });
        return true;
    },

    // «По умолчанию» — это не сохранённый вариант, а обнуление области.
    clear(scope) {
        const всё = scope === WORM_PRESET_ALL;
        this.knobsOf(scope).forEach(k => { delete WormLook.values[k]; });
        if (WormLook.skew && (всё || scope === 'head')) WormLook.skew = null;
        if (WormLook.form) {
            Object.keys(WormLook.form).forEach(host => {
                if (всё || this.scopeOf(host) === scope) delete WormLook.form[host];
            });
        }
        if (WormLook.girth) {
            Object.keys(WormLook.girth).forEach(path => {
                if (всё || this.girthScope(path) === scope) delete WormLook.girth[path];
            });
        }
    },

    // ---------- СКЛАД ----------
    all() {
        try {
            const raw = localStorage.getItem(WORM_PRESETS_KEY);
            const v = raw ? JSON.parse(raw) : null;
            return (v && typeof v === 'object') ? v : {};
        } catch (err) { return {}; }
    },

    write(store) {
        try { localStorage.setItem(WORM_PRESETS_KEY, JSON.stringify(store)); return true; }
        catch (err) { return false; }   // приватный режим или переполнение
    },

    // Имена области. «По умолчанию» ВСЕГДА первое и всегда есть: к
    // задуманной внешности надо уметь вернуться, ничего для этого заранее
    // не сохранив.
    names(scope) {
        const box = this.all()[scope] || {};
        return [WORM_PRESET_DEFAULT].concat(Object.keys(box).sort((a, b) => a.localeCompare(b, 'ru')));
    },

    save(scope, name) {
        const n = String(name || '').trim();
        if (!n || n === WORM_PRESET_DEFAULT) return false;
        const store = this.all();
        store[scope] = store[scope] || {};
        store[scope][n] = this.capture(scope);
        return this.write(store);
    },

    remove(scope, name) {
        if (!name || name === WORM_PRESET_DEFAULT) return false;
        const store = this.all();
        if (!store[scope] || !store[scope][name]) return false;
        delete store[scope][name];
        if (!Object.keys(store[scope]).length) delete store[scope];
        return this.write(store);
    },

    load(handle, scope, name) {
        if (!name || name === WORM_PRESET_DEFAULT) return this.apply(handle, scope, null);
        const data = (this.all()[scope] || {})[name];
        if (!data) return false;
        return this.apply(handle, scope, data);
    }
};

if (typeof window !== 'undefined') window.WormPresets = WormPresets;
