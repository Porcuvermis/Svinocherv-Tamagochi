// ================= ПЕРЕВОД КООРДИНАТ: ЭКРАН ↔ SVG =================
// Одно место на всю игру, где палец с экрана превращается в точку сцены и
// обратно. Раньше каждая мини-игра звала `getScreenCTM()` и жила надеждой,
// что браузер учтёт масштаб холста.
//
// ---------- ПОЧЕМУ НЕ getScreenCTM ----------
// Вся игра лежит внутри контейнера с css-трансформацией (инвариант 11:
// холст 390×844 масштабируется под окно целиком). Учитывает ли
// `getScreenCTM()` трансформацию ПРЕДКА — вопрос браузера, а не спецификации
// в понятном смысле: в Chromium учитывает, в WebKit исторически нет.
//
// На айфоне это годами не всплывало по чистой случайности: логический экран
// айфона — ровно 390×844, то есть масштаб холста был РОВНО ЕДИНИЦА, и
// разница «учитывает или нет» ничего не меняла. Внутри Telegram видимая
// высота меньше (шапка клиента), масштаб становится 0.85–0.9 — и всё, что
// считалось через CTM, поехало: червь в ванной оказался больше самой ванны,
// лопата в саду повисла в стороне от пальца.
//
// ---------- КАК СЧИТАЕТСЯ ЗДЕСЬ ----------
// Без матриц и без веры в браузер, по двум измерениям, которые врать не
// умеют:
//
//   • `getBoundingClientRect()` — где svg НА ЭКРАНЕ, со всеми трансформациями
//     предков (это работает одинаково везде);
//   • `clientWidth/clientHeight` — его же размер БЕЗ трансформаций, то есть
//     в единицах холста.
//
// Их отношение и есть масштаб холста. Дальше — обычная арифметика viewBox:
// вписывание (meet) или обрезка (slice) и выравнивание. Всё.
const SvgSpace = {

    // Разбор того, как содержимое svg легло в его рамку.
    //   m          — сколько px в одной единице viewBox;
    //   offX/offY  — отступ содержимого внутри рамки (выравнивание);
    //   k          — масштаб холста (css-трансформация предков);
    //   W/H        — размер рамки в единицах холста.
    fit(svg) {
        const rect = svg.getBoundingClientRect();
        const W = svg.clientWidth || rect.width || 1;
        const H = svg.clientHeight || rect.height || 1;
        const k = (rect.width / W) || 1;

        const vb = svg.viewBox && svg.viewBox.baseVal;
        if (!vb || !vb.width || !vb.height) {
            // Без viewBox единицы svg — это его же пиксели.
            return { m: 1, offX: 0, offY: 0, k, W, H, vx: 0, vy: 0, rect };
        }

        const par = svg.preserveAspectRatio && svg.preserveAspectRatio.baseVal;
        const NONE = 1;   // SVG_PRESERVEASPECTRATIO_NONE
        const SLICE = 2;  // SVG_MEETORSLICE_SLICE
        const align = par ? par.align : 6;          // 6 = xMidYMid
        const slice = par ? par.meetOrSlice === SLICE : false;

        if (align === NONE) {
            return { m: W / vb.width, my: H / vb.height, offX: 0, offY: 0,
                     k, W, H, vx: vb.x, vy: vb.y, rect };
        }

        const m = slice ? Math.max(W / vb.width, H / vb.height)
                        : Math.min(W / vb.width, H / vb.height);
        // Выравнивание: xMin/xMid/xMax и yMin/yMid/yMax зашиты в номер align
        // (2..10, по три подряд на каждую строку) — доля отступа выходит из
        // остатка от деления.
        const ax = [0, 0.5, 1][(align - 2) % 3];
        const ay = [0, 0.5, 1][Math.floor((align - 2) / 3)];
        return {
            m,
            offX: (W - vb.width * m) * ax,
            offY: (H - vb.height * m) * ay,
            k, W, H, vx: vb.x, vy: vb.y, rect
        };
    },

    // Экран → единицы КОРНЕВОГО svg (viewBox), без учёта внутренних групп.
    fromClient(svg, clientX, clientY) {
        const f = this.fit(svg);
        const lx = (clientX - f.rect.left) / f.k;   // px внутри рамки, без трансформации
        const ly = (clientY - f.rect.top) / f.k;
        return {
            x: f.vx + (lx - f.offX) / f.m,
            y: f.vy + (ly - f.offY) / (f.my || f.m)
        };
    },

    // Единицы svg → px ВНУТРИ УКАЗАННОГО элемента, без учёта трансформации
    // холста. Нужно там, где по точке сцены ставят html-слой (червь в ванной):
    // его смещение задаётся в тех же нетрансформированных пикселях.
    //
    // Разности прямоугольников делятся на масштаб холста, поэтому он
    // сокращается — и ответ не зависит ни от какого CTM.
    toLocal(svg, x, y, parentEl) {
        const f = this.fit(svg);
        const lx = f.offX + (x - f.vx) * f.m;
        const ly = f.offY + (y - f.vy) * (f.my || f.m);
        if (!parentEl) return { x: lx, y: ly };
        const pr = parentEl.getBoundingClientRect();
        return {
            x: (f.rect.left - pr.left) / f.k + lx,
            y: (f.rect.top - pr.top) / f.k + ly
        };
    },

    // Единицы svg → ЭКРАННЫЕ координаты (client). Обратная к fromClient:
    // нужна тем, кто ставит что-то по точке сцены в экранных координатах, и
    // прогонам — чтобы вести пальцем по сцене, не спрашивая CTM.
    toClient(svg, x, y) {
        const f = this.fit(svg);
        return {
            x: f.rect.left + (f.offX + (x - f.vx) * f.m) * f.k,
            y: f.rect.top + (f.offY + (y - f.vy) * (f.my || f.m)) * f.k
        };
    },

    // Сколько нетрансформированных пикселей в одной единице svg. Мини-играм
    // это нужно, чтобы масштабировать html-слои под сцену.
    unit(svg) {
        return this.fit(svg).m;
    }
};

if (typeof window !== 'undefined') window.SvgSpace = SvgSpace;
