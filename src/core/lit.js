// ================= СВЕТ ШЕЙДЕРОМ: РАЗМЕТКА РИСУНКА ПО ПРОХОДАМ =================
// Общая часть технологии, придуманной на корпусе аппарата алчности
// (docs/materials.md): сцена рисуется SVG-строкой БЕЗ своего света, в
// нескольких проходах, а свет, блики и тени считает видеокарта
// (src/core/lit-gl.js).
//
//   baked   — запасной вид, когда видеокарты нет: свет нарисован руками
//             (градиенты, классы fx и hl видны);
//   albedo  — только цвет и фактура: градиенты сплющены в средний цвет,
//             нарисованные тени (fx) и блики (hl) спрятаны;
//   height  — карта высот: оттенок серого = высота детали над стеной;
//   mat     — карта материалов: R — сила блика, G — острота, B — металл.
//
// ---------- ПОЧЕМУ ЗАВОД, А НЕ ОДИН ОБЪЕКТ ----------
// У каждой сцены свой размах высот: корпус аппарата — 12 вниз и 32 вверх,
// гримёрка — шкаф глубиной в полметра. Одно общее число делило бы 256
// уровней карты между чужими сценами, и пологие скаты пошли бы ступеньками.
// Поэтому `Lit.kit({ H0, HMAX })` выдаёт набор, привязанный к своей сцене,
// и текущий проход живёт в наборе (`K.pass`), а не в глобальной переменной.
//
// ---------- ЧТО ОСТАЛОСЬ У АЛЧНОСТИ ----------
// Аппарат алчности пока на своей копии этих функций (greed-junk-light.js):
// перевод его на ядро трогает десяток файлов аппарата и его прогоны, и это
// отдельная работа. Счёт здесь тот же самый, перенесён как есть.
const Lit = {

    kit(opts) {
        const o = opts || {};
        const K = {
            pass: 'baked',
            // Запас вниз — для щелей и дыр (класс pit), вверх — самая высокая
            // деталь сцены. Единицы те же, что у рисунка.
            H0: o.H0 != null ? o.H0 : 8,
            HMAX: o.HMAX != null ? o.HMAX : 40,
            _gid: 0,
            prefix: o.prefix || 'lt',

            f(n) { return Math.round(n * 100) / 100; },
            gid(p) { return `${this.prefix}${p}${++this._gid}`; },

            // Высота детали в единицах → доля 0..1 карты высот.
            hv(h) { return Math.max(0, Math.min(1, (h + this.H0) / this.HMAX)); },
            // Прибавка к высоте детали для профиля внутри неё — в долях карты.
            dh(units) { return (units / this.HMAX).toFixed(4); },

            // ---------- ОБЁРТКА ДЕТАЛИ ----------
            // Высота и материал не дописываются в каждую фигуру: деталь
            // оборачивается в <g style="--h;--m">, а проход перекрашивает всё
            // по этим переменным одним <style>. Переменная наследуется, и
            // ближайшая обёртка побеждает.
            T(h, mat, inner) {
                const M = (typeof MATERIALS !== 'undefined' && (MATERIALS[mat] || MATERIALS.paper));
                const m = M ? M.shine : [0.05, 0.1, 0];
                const c = m.map(v => Math.round(v * 255)).join(',');
                return `<g style="--h:${this.hv(h).toFixed(4)};--m:rgb(${c})">${inner}</g>`;
            },

            // Цвет высоты для узла градиента: d — прибавка в долях карты
            // поверх высоты детали, в которой градиент лежит.
            hcol(d) {
                const v = `calc((var(--h,${this.hv(0).toFixed(4)}) + var(--dh,0) + ${d}) * 255)`;
                return `rgb(${v},${v},${v})`;
            },

            // ---------- <style> ПРОХОДА ----------
            passStyle(pass) {
                pass = pass || this.pass;
                if (pass === 'baked') return `<style>.hpass{display:none}</style>`;
                if (pass === 'albedo') return `<style>.fx,.hl,.hpass{display:none}</style>`;
                const off = `[fill="none"]{fill:none!important}*:not([stroke]){stroke:none!important}[stroke="none"]{stroke:none!important}`;
                if (pass === 'height') {
                    const v = (d) => `calc((var(--h,${this.hv(0).toFixed(4)}) + var(--dh,0) + ${d}) * 255)`;
                    const g = (d) => `rgb(${v(d)},${v(d)},${v(d)})`;
                    return `<style>*{fill:${g(0)}!important;stroke:${g(0)}!important}` +
                        `.bump,.bump *{fill:${g(0.03)}!important;stroke:${g(0.03)}!important}` +
                        `.pit,.pit *{fill:${g(-0.06)}!important;stroke:${g(-0.06)}!important}` +
                        off + `.fx,.hl,.nh{display:none}</style>`;
                }
                if (pass === 'mat') {
                    return `<style>*{fill:var(--m,rgb(0,0,0))!important;stroke:var(--m,rgb(0,0,0))!important}` +
                        `.pit,.pit *{fill:rgb(0,0,0)!important;stroke:rgb(0,0,0)!important}` +
                        off + `.fx,.hl,.hpass{display:none}</style>`;
                }
                // Силуэт: всё нарисованное — белым, остальное прозрачно. По нему
                // освещённую картинку режут на куски (смена декораций).
                if (pass === 'mask') {
                    return `<style>*{fill:#fff!important;stroke:#fff!important}` + off +
                        `.fx,.hl,.hpass,.nomask{display:none}</style>`;
                }
                return '';
            },

            // ---------- ГРАДИЕНТ, КОТОРЫЙ ЗНАЕТ ПРО ПРОХОДЫ ----------
            // В нарисованном виде (baked) — градиент, во всех остальных —
            // его средний цвет: свет за него посчитает шейдер, а градиент,
            // оставшийся в albedo, лёг бы вторым светом поверх первого.
            paint(id, a, b) {
                return this.pass === 'baked' ? `url(#${id})` : this.mid(a, b);
            },
            mid(a, b) {
                const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
                const x = p(a), y = p(b);
                return '#' + x.map((v, i) => Math.round((v + y[i]) / 2).toString(16).padStart(2, '0')).join('');
            },

            // ---------- ПРОФИЛЬ ВЫСОТ ----------
            // Ровная площадка годится доске, но круглое так выходит плоским.
            // Профиль рисуется ТОЛЬКО в проходе высот (класс hpass), одной
            // плавной формой: стопка плоских слоёв — это уступы, и свет рисует
            // на каждом полоску (урок аппарата алчности).
            //
            // Купол: высота по радиусу — четверть косинуса. Косинус, а не дуга
            // круга: у дуги на краю наклон вертикальный, и 8-битная карта
            // передаёт его рваными уровнями.
            domeH(cx, cy, r, rise, ry) {
                rise = rise == null ? r * 0.8 : rise;
                const f = this.f, id = this.gid('d'), n = Math.max(12, Math.ceil(r * 3));
                let st = '';
                for (let i = 0; i <= n; i++) {
                    const t = i / n;
                    st += `<stop offset="${t.toFixed(4)}" style="stop-color:${this.hcol(this.dh(rise * Math.cos(t * Math.PI / 2)))}"/>`;
                }
                const shape = ry
                    ? `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(r)}" ry="${f(ry)}" style="fill:url(#${id})!important;stroke:none!important"/>`
                    : `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" style="fill:url(#${id})!important;stroke:none!important"/>`;
                const tf = ry ? ` gradientTransform="translate(${f(cx)} ${f(cy)}) scale(1 ${f(ry / r)}) translate(${f(-cx)} ${f(-cy)})"` : '';
                return `<g class="hpass"><defs><radialGradient id="${id}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" gradientUnits="userSpaceOnUse"${tf}>${st}</radialGradient></defs>${shape}</g>`;
            },

            // Валик (цилиндр) по прямоугольнику: высота одной плавной кривой
            // поперёк оси. vertical — ось вертикальная (профиль поперёк x),
            // иначе горизонтальная (профиль поперёк y). base — высота детали в
            // единицах (как в T), rise — подъём оси над ней.
            cylH(x, y, w, h, base, rise, opts) {
                const O = opts || {}, f = this.f, id = this.gid('c');
                const vertical = O.vertical !== false;
                const across = vertical ? w : h, n = Math.max(16, Math.ceil(across * 3));
                let st = '';
                for (let i = 0; i <= n; i++) {
                    const t = i / n, u = Math.cos((2 * t - 1) * Math.PI / 2);
                    const c = (this.hv(base + rise * u) * 255).toFixed(1);
                    st += `<stop offset="${t.toFixed(4)}" stop-color="rgb(${c},${c},${c})"/>`;
                }
                const xy = vertical ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="0" y2="1"';
                return `<g class="hpass"><defs><linearGradient id="${id}" ${xy}>${st}</linearGradient></defs>` +
                    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${O.rx ? ` rx="${f(O.rx)}"` : ''} style="fill:url(#${id})!important;stroke:none!important"/></g>`;
            },

            // Валик вдоль любого пути (прут, кабель, ребро): полоса уже
            // полной ширины, размытая и обрезанная по полной — вершина по оси,
            // к краям спадает до детали (тот же счёт, что у аппарата).
            rodH(d, width, rise) {
                rise = rise == null ? width * 0.5 : rise;
                const f = this.f, m = this.gid('m'), b = this.gid('b'), B = this.pathBox(d), pad = width * 1.5;
                const reg = `x="${f(B.x - pad)}" y="${f(B.y - pad)}" width="${f(B.w + pad * 2)}" height="${f(B.h + pad * 2)}"`;
                const line = (w, extra) => `<path d="${d}" fill="none" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
                return `<g class="hpass"><defs>` +
                    `<mask id="${m}" maskUnits="userSpaceOnUse" ${reg}>${line(width, 'style="stroke:#fff!important;fill:none!important"')}</mask>` +
                    `<filter id="${b}" filterUnits="userSpaceOnUse" ${reg}><feGaussianBlur stdDeviation="${f(width * 0.18)}"/></filter></defs>` +
                    `<g mask="url(#${m})">${line(width * 0.6, `stroke="#000" filter="url(#${b})" style="--dh:${this.dh(rise / 0.9)}"`)}</g></g>`;
            },

            // Фаска по прямоугольнику: края поднимаются от base до base+rise
            // на ширине edge — рамы, филёнки, столешницы. Четыре трапеции
            // градиентом, а не обводка: обводка дала бы ровную полку, и свет
            // не нашёл бы на ней ни одного ската.
            bevelH(x, y, w, h, base, rise, edge) {
                const f = this.f, e = Math.min(edge, w / 2, h / 2);
                const lo = (this.hv(base) * 255).toFixed(1), hi = (this.hv(base + rise) * 255).toFixed(1);
                const sides = [
                    ['0', '0', '0', '1', `M${f(x)} ${f(y)}H${f(x + w)}L${f(x + w - e)} ${f(y + e)}H${f(x + e)}Z`],
                    ['0', '1', '0', '0', `M${f(x)} ${f(y + h)}H${f(x + w)}L${f(x + w - e)} ${f(y + h - e)}H${f(x + e)}Z`],
                    ['0', '0', '1', '0', `M${f(x)} ${f(y)}V${f(y + h)}L${f(x + e)} ${f(y + h - e)}V${f(y + e)}Z`],
                    ['1', '0', '0', '0', `M${f(x + w)} ${f(y)}V${f(y + h)}L${f(x + w - e)} ${f(y + h - e)}V${f(y + e)}Z`]
                ];
                // Градиент по ширине фаски: снаружи — высота детали, внутри —
                // поднятая. Координаты градиента — по рамке трапеции.
                return `<g class="hpass">` + sides.map(([x1, y1, x2, y2, d]) => {
                    const id = this.gid('v');
                    return `<defs><linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
                        `<stop offset="0" stop-color="rgb(${lo},${lo},${lo})"/><stop offset="1" stop-color="rgb(${hi},${hi},${hi})"/></linearGradient></defs>` +
                        `<path d="${d}" style="fill:url(#${id})!important;stroke:none!important"/>`;
                }).join('') + `<rect x="${f(x + e)}" y="${f(y + e)}" width="${f(w - 2 * e)}" height="${f(h - 2 * e)}" style="fill:rgb(${hi},${hi},${hi})!important;stroke:none!important"/></g>`;
            },

            // Рамка пути в его же координатах — браузер считает сам (getBBox).
            pathBox(d) {
                const C = this._pbox || (this._pbox = new Map());
                if (C.has(d)) return C.get(d);
                if (!Lit._pboxSvg && typeof document !== 'undefined') {
                    const ns = 'http://www.w3.org/2000/svg', sv = document.createElementNS(ns, 'svg');
                    sv.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden');
                    sv.appendChild(document.createElementNS(ns, 'path'));
                    document.body.appendChild(sv);
                    Lit._pboxSvg = sv;
                }
                let r;
                try {
                    const pth = Lit._pboxSvg.firstChild;
                    pth.setAttribute('d', d);
                    const q = pth.getBBox();
                    r = { x: q.x, y: q.y, w: q.width, h: q.height };
                } catch (e) { r = { x: -1e3, y: -1e3, w: 2e3, h: 2e3 }; }
                C.set(d, r);
                return r;
            }
        };
        return K;
    }
};

if (typeof window !== 'undefined') window.Lit = Lit;
