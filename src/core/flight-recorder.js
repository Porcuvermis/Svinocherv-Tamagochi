// ================= САМОПИСЕЦ =================
// Бортовой самописец для бед, которые видны только на телефоне.
//
// ---------- ЗАЧЕМ ----------
// Игрок проверяет игру в Telegram на айфоне (WebKit), прогоны идут в
// Chromium. Беды вида «на телефоне дёргается, мигает, прыгает» с этой машины
// не видны вовсе: мочалку трясло при подъёме с полки ТОЛЬКО на айфоне, и
// причину нашли лишь по записи экрана, разбирая видео покадрово. Видео
// показывает, ЧТО дёрнулось, но не почему: какой класс переключился, какой
// атрибут записали дважды за кадр, какой кадр был длинным.
//
// Самописец пишет это по кадрам, а игрок одним нажатием копирует отчёт и
// присылает его текстом в чат.
//
// ---------- КАК УСТРОЕН ----------
// Ядро ничего не знает о конкретной игре. Экран регистрирует «щуп»:
//     FlightRecorder.register('ванная', () => ({ ... }), { watch: ['#bt-hand'] })
// функция зовётся на каждом кадре записи и возвращает МАЛЕНЬКИЙ объект
// чисел и строк (что смотреть — решает экран). Вернула null — экран сейчас
// не на виду, щуп молчит. `watch` — элементы, за которыми следит
// MutationObserver: переключения классов идут отдельной строкой с номером
// кадра, записи transform/style считаются, правки ВНУТРИ — тоже считаются.
//
// В строку кадра пишутся только ИЗМЕНЕНИЯ относительно прошлого кадра:
// иначе 12 секунд по 60 кадров не влезли бы ни в какой чат.
//
// ---------- ЧЕГО ОН СТОИТ ----------
// Выключенный — НОЛЬ: ни цикла кадров, ни наблюдателей, ни подписок.
// register() только кладёт функцию в список. Закрытое не крутится
// (docs/traps.md, пп. 36–38).
//
// Включённый — стоит, и это надо помнить, читая отчёт: щуп ванной читает
// getBoundingClientRect и getComputedStyle, то есть заставляет браузер
// досчитать стиль и раскладку на каждом кадре. Длинные кадры под записью и
// без неё — не одно и то же; счётчик кадров в debug-панели меряет без неё.
//
// ---------- ЧЕГО ОН НЕ ДЕЛАЕТ ----------
// Ничего не меняет в игре: только читает. Интерфейс (кнопка и окошко с
// отчётом) живёт в debug.js — ядро о нём не знает.
const FlightRecorder = {
    DURATION: 12000,     // длительность записи по умолчанию, мс
    DELAY: 3000,         // отложенный старт: успеть закрыть панель и сделать действие
    LIMIT: 56000,        // предел строк кадров, знаков (с шапкой и сводкой ~60 КБ)
    LONG: 34,            // кадр длиннее — «длинный» (два пропущенных кадра на 60 Гц)

    probes: [],
    state: 'off',        // off | armed | rec
    raf: 0,
    ticks: 0,            // сколько раз звался цикл кадров за всю жизнь страницы
    rec: null,
    last: '',            // последний отчёт
    listeners: [],

    // ---------- РЕГИСТРАЦИЯ ЩУПА ----------
    // opts.watch — список селекторов. Ищутся заново на КАЖДОМ кадре записи:
    // игра меняет узлы целиком (у ванной #bt-held пересобирается при каждой
    // смене вещи и переименовывается в #bt-homing на полёте домой), и
    // наблюдатель на старом узле молча слушал бы пустоту. Замена узла сама
    // по себе событие и пишется строкой.
    register(name, probe, opts) {
        this.probes = this.probes.filter(p => p.name !== name);
        this.probes.push({ name, fn: probe, watch: (opts && opts.watch) || [] });
    },

    onChange(fn) { this.listeners.push(fn); },
    emit() {
        this.listeners.forEach(fn => { try { fn(this.state); } catch (e) { /* не роняем запись */ } });
    },

    // Одна кнопка на всё: выключен → взвести (старт через DELAY), взведён →
    // отменить, пишет → остановить. Пальцу удобнее одна большая цель, чем
    // три маленьких.
    toggle() {
        if (this.state === 'off') this.arm();
        else if (this.state === 'armed') this.disarm();
        else this.stop();
    },

    arm(delay) {
        if (this.state !== 'off') return;
        this.state = 'armed';
        this.armedAt = performance.now();
        this.armDelay = delay == null ? this.DELAY : delay;
        this.armTimer = setTimeout(() => { this.armTimer = 0; this.start(); }, this.armDelay);
        this.emit();
    },

    disarm() {
        clearTimeout(this.armTimer);
        this.armTimer = 0;
        this.state = 'off';
        this.emit();
    },

    start(ms) {
        clearTimeout(this.armTimer);
        this.armTimer = 0;
        if (this.state === 'rec') return;
        this.state = 'rec';
        this.rec = {
            duration: ms || this.DURATION,
            t0: null, wall0: performance.now(), date: new Date(),
            lines: [], size: 0, cut: null,
            frames: 0, dts: [], long: 0, lastRaf: null,
            prev: {}, mut: {}, mutTotal: {}, toggles: {}, swaps: {},
            nodes: {}, active: {}
        };
        if (!this.tickFn) this.tickFn = (now) => this.tick(now);
        this.raf = requestAnimationFrame(this.tickFn);
        this.emit();
    },

    // Остановить и собрать отчёт. Возвращает текст; он же лежит в `last`.
    stop() {
        if (this.state === 'armed') { this.disarm(); return this.last; }
        if (this.state !== 'rec') return this.last;
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        const r = this.rec;
        Object.keys(r.nodes).forEach(sel => {
            const w = r.nodes[sel];
            if (w.mo) { this.onMutations(w.mo.takeRecords(), sel); w.mo.disconnect(); }
        });
        this.last = this.report(r);
        this.rec = null;
        this.state = 'off';
        this.emit();
        return this.last;
    },

    // Сколько осталось до конца записи (или до старта, если взведён), мс.
    remaining() {
        const now = performance.now();
        if (this.state === 'armed') return Math.max(0, this.armDelay - (now - this.armedAt));
        if (this.state === 'rec' && this.rec) return Math.max(0, this.rec.duration - (now - this.rec.wall0));
        return 0;
    },

    // ---------- ЧИСЛА В ТЕКСТ ----------
    // Числа — с точностью 0.1: дрожь в две-три точки видна, шум в тысячных
    // не раздувает отчёт. В строках (матрица transform, путь) — до тысячных:
    // масштаб 0.987 при округлении до десятых стал бы единицей и спрятал бы
    // ровно то, что ищем.
    fmt(v) {
        if (v === null || v === undefined) return '-';
        if (typeof v === 'number') {
            if (!isFinite(v)) return String(v);
            const r = Math.round(v * 10) / 10;
            return String(r === 0 ? 0 : r);
        }
        if (typeof v === 'boolean') return v ? '1' : '0';
        // 5.4e-06 — это ноль, а не шесть знаков шума.
        return String(v).replace(/-?\d+(\.\d+)?e-\d+/g, '0')
            .replace(/(-?\d+\.\d{3})\d+/g, '$1').replace(/\s+/g, ' ');
    },

    flatten(obj, prefix, out) {
        Object.keys(obj).forEach(k => {
            const v = obj[k], key = prefix ? prefix + '.' + k : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) this.flatten(v, key, out);
            else out[key] = this.fmt(Array.isArray(v) ? v.join(',') : v);
        });
        return out;
    },

    // ---------- КАДР ----------
    tick(now) {
        this.ticks += 1;
        const r = this.rec;
        if (!r || this.state !== 'rec') return;
        this.raf = requestAnimationFrame(this.tickFn);
        if (r.t0 === null) r.t0 = now;
        const wall = performance.now();
        const dt = r.lastRaf === null ? 0 : now - r.lastRaf;
        r.lastRaf = now;
        r.frames += 1;
        if (r.frames > 1) {
            r.dts.push(dt);
            if (dt > this.LONG) r.long += 1;
        }

        this.resolve(r);

        const cur = {};
        this.probes.forEach(p => {
            let v = null;
            try { v = p.fn(); } catch (err) { v = { 'ошибка': String(err && err.message || err) }; }
            if (!v) return;
            r.active[p.name] = (r.active[p.name] || 0) + 1;
            const flat = this.flatten(v, '', {});
            Object.keys(flat).forEach(k => {
                // Ключи разных щупов не должны пересекаться; если всё же
                // совпали — второй получает имя щупа, а не затирает первый.
                cur[k in cur ? p.name + '.' + k : k] = flat[k];
            });
        });

        const parts = [];
        Object.keys(cur).forEach(k => { if (cur[k] !== r.prev[k]) parts.push(k + '=' + cur[k]); });
        Object.keys(r.prev).forEach(k => { if (!(k in cur)) parts.push(k + '=∅'); });
        r.prev = cur;
        // Записи атрибутов с прошлой строки. Двойная запись за кадр — первый
        // подозреваемый в дрожи: два хозяина спорят за один узел.
        const mk = Object.keys(r.mut);
        if (mk.length) {
            parts.push('м[' + mk.map(k => k + '×' + r.mut[k]).join(' ') + ']');
            r.mut = {};
        }
        // Колбэк кадра опоздал против времени кадра: скрипт до нас в этом
        // же кадре занял столько. Пишется, только когда заметно.
        const late = wall - now;
        if (late >= 3) parts.push('опозд=' + this.fmt(late));

        this.line(r.frames + ';' + this.fmt(now - r.t0) + ';' + this.fmt(dt)
                  + (dt > this.LONG ? '!' : '') + ';' + parts.join(' '));

        if (wall - r.wall0 >= r.duration) this.stop();
    },

    line(text) {
        const r = this.rec;
        if (!r) return;
        if (r.cut) return;
        if (r.size + text.length + 1 > this.LIMIT) {
            r.cut = r.frames;
            return;
        }
        r.lines.push(text);
        r.size += text.length + 1;
    },

    // Время события от начала записи (до первого кадра — от нажатия).
    at() {
        const r = this.rec;
        return this.fmt(performance.now() - (r.t0 === null ? r.wall0 : r.t0));
    },

    // ---------- НАБЛЮДЕНИЕ ЗА УЗЛАМИ ----------
    resolve(r) {
        const sels = [];
        this.probes.forEach(p => p.watch.forEach(s => { if (sels.indexOf(s) < 0) sels.push(s); }));
        sels.forEach(sel => {
            const el = document.querySelector(sel);
            const w = r.nodes[sel] || (r.nodes[sel] = { el: null, mo: null });
            if (w.el === el) return;
            if (w.mo) { this.onMutations(w.mo.takeRecords(), sel); w.mo.disconnect(); w.mo = null; }
            // Первый кадр записи — не замена, а знакомство.
            if (r.frames > 1 || w.el) {
                const what = !w.el ? 'появился' : !el ? 'исчез' : 'заменён';
                r.swaps[sel] = (r.swaps[sel] || 0) + 1;
                this.line('!' + r.frames + ';' + this.at() + ';' + sel + ' ' + what);
            }
            w.el = el;
            if (el && typeof MutationObserver !== 'undefined') {
                w.mo = new MutationObserver(list => this.onMutations(list, sel));
                w.mo.observe(el, { attributes: true, attributeOldValue: true, subtree: true, childList: true,
                                   attributeFilter: ['class', 'style', 'transform', 'd', 'opacity', 'href'] });
            }
        });
    },

    onMutations(list, sel) {
        const r = this.rec;
        if (!r || !list || !list.length) return;
        const w = r.nodes[sel];
        const root = w && w.el;
        list.forEach((m, i) => {
            if (m.target !== root || m.type !== 'attributes') {
                const k = sel + '/внутри';
                r.mut[k] = (r.mut[k] || 0) + 1;
                r.mutTotal[k] = (r.mutTotal[k] || 0) + 1;
                return;
            }
            const attr = m.attributeName;
            if (attr === 'class') {
                // Новое значение этой записи — старое у следующей записи того
                // же атрибута или нынешнее: записей в пачке может быть
                // несколько, и вкл-выкл за один кадр — тоже событие.
                let next = null;
                for (let j = i + 1; j < list.length; j++) {
                    if (list[j].target === root && list[j].attributeName === 'class') { next = list[j].oldValue; break; }
                }
                if (next === null) next = root.getAttribute('class');
                const a = (m.oldValue || '').split(/\s+/).filter(Boolean);
                const b = (next || '').split(/\s+/).filter(Boolean);
                const diff = b.filter(c => a.indexOf(c) < 0).map(c => '+' + c)
                    .concat(a.filter(c => b.indexOf(c) < 0).map(c => '−' + c));
                if (!diff.length) return;
                diff.forEach(d => { const c = d.slice(1); r.toggles[c] = (r.toggles[c] || 0) + 1; });
                this.line('!' + r.frames + ';' + this.at() + ';' + sel + ' класс ' + diff.join(' '));
                return;
            }
            const k = sel + '.' + attr;
            r.mut[k] = (r.mut[k] || 0) + 1;
            r.mutTotal[k] = (r.mutTotal[k] || 0) + 1;
        });
    },

    // ---------- ОТЧЁТ ----------
    header(r) {
        const f = (v) => this.fmt(v);
        const out = [];
        out.push('САМОПИСЕЦ · ' + r.date.toISOString());
        out.push('сборка: ' + (window.APP_BRANCH || '?') + ' · ' + (window.APP_BUILD || '?'));
        out.push('ua: ' + navigator.userAgent);
        const vv = window.visualViewport;
        let line = 'dpr ' + (window.devicePixelRatio || 1) + ' · окно ' + window.innerWidth + '×' + window.innerHeight;
        if (vv) line += ' (видимо ' + f(vv.width) + '×' + f(vv.height) + ')';
        const scale = getComputedStyle(document.documentElement).getPropertyValue('--stage-scale').trim();
        const box = document.getElementById('game-container');
        if (box) {
            const b = box.getBoundingClientRect();
            line += ' · холст ' + box.offsetWidth + '×' + box.offsetHeight + ' ×' + (scale || '?')
                  + ' → ' + f(b.width) + '×' + f(b.height) + ' @' + f(b.left) + ',' + f(b.top);
        }
        out.push(line);
        const tg = window.Telegram && window.Telegram.WebApp;
        const inTg = (typeof TelegramBridge !== 'undefined') && TelegramBridge.inTelegram();
        if (tg) {
            const ins = (o) => o ? [o.top, o.bottom, o.left, o.right].map(v => Number(v) || 0).join('/') : '-';
            out.push('telegram: ' + (tg.platform || '?') + ' ' + (tg.version || '?')
                     + ' · высота ' + f(tg.viewportHeight) + '/' + f(tg.viewportStableHeight)
                     + ' · зоны ' + ins(tg.safeAreaInset) + ' + ' + ins(tg.contentSafeAreaInset)
                     + (tg.isFullscreen ? ' · полный экран' : ''));
        } else {
            out.push('telegram: ' + (inTg ? 'признаки есть, библиотеки нет' : 'нет (обычная страница)'));
        }
        if (typeof Tilt !== 'undefined' && Tilt.info) {
            const t = Tilt.info();
            out.push('наклон: ' + (t.live ? t.source + '/' + t.unit : 'нет'));
        }
        out.push('щупы: ' + (this.probes.map(p => p.name + (r.active[p.name] ? ' (' + r.active[p.name] + ' кадров)' : ' (молчал)')).join(', ') || 'нет'));
        return out;
    },

    summary(r) {
        const f = (v) => this.fmt(v);
        const d = r.dts.slice().sort((a, b) => a - b);
        const q = (p) => d.length ? d[Math.min(d.length - 1, Math.floor(p * (d.length - 1) + 0.5))] : 0;
        const dur = r.lastRaf !== null && r.t0 !== null ? (r.lastRaf - r.t0) / 1000 : 0;
        const out = ['--- сводка ---'];
        out.push('кадров ' + r.frames + ' за ' + f(dur) + ' с · dt медиана ' + f(q(0.5)) + ' · 95% ' + f(q(0.95))
                 + ' · макс ' + f(d.length ? d[d.length - 1] : 0) + ' мс · длинных (>' + this.LONG + ' мс) ' + r.long);
        const tg = Object.keys(r.toggles);
        const toggles = tg.reduce((s, k) => s + r.toggles[k], 0);
        out.push('переключений классов ' + toggles + (tg.length ? ': ' + tg.map(k => k + ' ' + r.toggles[k]).join(' · ') : ''));
        const sw = Object.keys(r.swaps);
        out.push('замен узлов: ' + (sw.length ? sw.map(k => k + ' ' + r.swaps[k]).join(' · ') : 'нет'));
        const mt = Object.keys(r.mutTotal);
        out.push('записей атрибутов: ' + (mt.length ? mt.map(k => k + ' ' + r.mutTotal[k]).join(' · ') : 'нет'));
        if (r.cut) out.push('ОБРЕЗАНО: строки кадров кончились на кадре ' + r.cut + ' из ' + r.frames
                            + ' (предел ' + Math.round(this.LIMIT / 1000) + ' КБ). Сводка — по всей записи.');
        return out;
    },

    report(r) {
        return this.header(r)
            .concat(this.summary(r))
            .concat(['--- легенда ---',
                     'кадр;t мс от первого кадра;dt мс (! — длинный);что поменялось с прошлого кадра (∅ — пропало)',
                     '!кадр;t;событие — переключение класса или замена узла, сразу после кадра',
                     'м[узел.атрибут×N] — сколько раз писали с прошлой строки; /внутри — правки в потомках',
                     '--- кадры ---'])
            .concat(r.lines)
            .concat(r.cut ? ['… обрезано'] : [])
            .join('\n');
    }
};

if (typeof window !== 'undefined') window.FlightRecorder = FlightRecorder;
