// ================= ЖУРНАЛ: ВЗЛЁТ И РАЗВОРОТ =================
// Вход в магазин похоти (docs/plan/21-lust-bath.md, разд. 7б). Замысел
// игрока: тап по журналу на унитазе — он взлетает, на лету выпрямляется и
// разворачивается обложкой к игроку, приближается и встаёт на место будущего
// меню, около секунды; чуть раньше остановки обложка открывается и
// заворачивается за журнал, за ней пролистываются ещё несколько страниц — и
// перед игроком во весь размер страница-прилавок.
//
// ---------- КАК ЖУРНАЛ ВЗЛЕТАЕТ ИМЕННО С ТОГО МЕСТА, ГДЕ ЛЕЖИТ ----------
// Сцена ванной запечена камерой (fov 20°, tools/bake-3d.js), и эта камера в
// css-3d повторяется ТОЧНО: перспектива K, начало перспективы — точка (360,
// 760) сцены, точка мира (X, Y, Z) — это (X, −(Y − 4.2), K − (46 − Z)).
// Генератор (tools/gen-mag-geo.py) отдаёт журнал на унитазе в этих числах:
// базис у корешка, профиль изгиба обложки и толщину. Первый кадр полёта —
// ТА ЖЕ толстая модель, что на картинке (см. «Толстая модель»), дальше
// журнал — твёрдое тело ПОСТОЯННОГО размера: к игроку он растёт сам, потому
// что приближается. Изгиб на лету выпрямляется.
//
// ---------- ПОЧЕМУ ВСЁ НА ВИДЕОКАРТЕ ----------
// Каждый кадр меняется только transform (полёт, поворот, перелистывание) и
// прозрачность затемнения — ни одной перерисовки. Локальный размер журнала
// равен размеру меню на экране: слой с 3d-преобразованием растрируется в
// своих точках, и маленький журнал, растянутый преобразованием, вышел бы
// мыльным.
//
// ---------- ЧТО ЗДЕСЬ НЕ РЕШАЕТСЯ ----------
// Цены, списание, потолок — LustShop / Backend (инвариант 2). Здесь показ.

const LustMag = {
    // Открытие ужато на 30% от первого чистовика по просьбе игрока: на
    // полной длине вход в магазин тянулся.
    FLY: 700,           // полёт до места меню, мс
    STRAIGHT: 295,      // журнал выпрямляется
    GHOST: 85,          // подмена журнала сцены журналом полёта — на месте, до взлёта
    OPEN_AT: 545,       // обложка начинает открываться — чуть раньше остановки
    TURN: 475,          // одна страница от закрытой до «за журналом»
    STAGGER: 80,        // следующая страница — вдогонку
    // Закрытие — то же пролистывание назад, быстрее открытия: уходят из
    // магазина, ждать там нечего.
    TURN_BACK: 300,     // страница из-за журнала обратно на место
    STAGGER_BACK: 70,
    PAGES: 3,           // сколько страниц пролистывается до прилавка
    BACK: 620,          // обратный полёт
    WIDTH: 330,         // ширина меню в точках холста
    ZTOP: 4,            // обложка лежит на этой глубине журнала; блок страниц — под ней

    host: null, root: null, isOpen: false, busy: false, raf: 0,

    init(host) {
        this.host = host;
        if (this.root) return;
        const scr = host.screenElement;
        const R = document.createElement('div');
        R.id = 'bt-mag-fly';
        R.className = 'bm-fly';
        R.innerHTML = `
            <div class="bm-dim"></div>
            <div class="bm-space"><div class="bm-persp"><div class="bm-mag">
                <div class="bm-block"></div>
                <div class="bm-back"></div>
                <div class="bm-shop"></div>
                ${Array.from({ length: this.PAGES }, (_, i) => `<div class="bm-page" data-i="${i}"><div class="bm-f"></div><div class="bm-r"></div></div>`).join('')}
                <div class="bm-cover"><div class="bm-a"></div><div class="bm-in"></div></div>
                <div class="bm-bent"></div>
            </div></div><img class="bm-ghost" alt=""></div>`;
        // Внутрь обёртки сцены (#bt-stage), а не экрана мини-игры: точки
        // журнала должны совпадать с точками холстов сцены. Обёртка сдвинута
        // рамкой окна, и на экране мини-игры журнал взлетал не с унитаза, а
        // на полсотни точек выше — с бортика ванны.
        (document.getElementById('bt-stage') || scr).appendChild(R);
        this.root = R;
        this.$ = (sel) => R.querySelector(sel);
        // Тап мимо журнала — закрыть. По журналу тапы ловит прилавок.
        R.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (this.busy || !this.isOpen) return;
            if (this.$('.bm-mag').contains(e.target)) return;
            this.close();
        });
    },

    // ---------- ГЕОМЕТРИЯ ----------
    // Холст ванной → точки обёртки (stageMap) и камера (cam): всё переводится
    // в точки холста игры, где меню имеет размер WIDTH.
    frame() {
        const h = this.host, c = h.cam, M = h.stageMap();
        const F = BATH_MAG.GEO.top.fly, [CW, CH] = BATH_MAG.GEO.top.size;
        const LW = this.WIDTH, LH = LW * CH / CW;
        return { c, M, F, LW, LH, K: F.K * c.s, O: [c.tx + c.s * F.origin[0], c.ty + c.s * F.origin[1]] };
    },
    // Начальная поза: базис у корешка в начале журнала (x — вдоль ширины от
    // корешка, y — касательная к обложке, z — наружу), масштаб «мир на точку
    // журнала». Изгиб — профилем (bentPose), а не поворотом пластины.
    startPose(G) {
        const F = G.F, V = this.vec;
        // Глубины в генераторе — для перспективы K; здесь она K·s (камера
        // ванной масштабирует холст): z = K − d сдвигается вместе с ней.
        const p0 = [F.p0[0], F.p0[1], F.p0[2] - F.K + G.K];
        const x = V.unit(F.e1), y = V.unit(V.sub(F.e2, V.mul(x, V.dot(F.e2, x)))), z = V.cross(x, y);
        const k = V.len(F.e1) / G.LW;
        // Верх журнала в позе — на z = ZTOP (там лежит обложка), а не на 0.
        const C = V.add(p0, V.add(V.mul(x, k * G.LW / 2), V.add(V.mul(y, k * G.LH / 2), V.mul(z, -k * this.ZTOP))));
        return { R: [x, y, z], k, C };
    },
    // Конечная поза: лицом к игроку, по центру холста, той же величины в мире
    // — значит на глубине, где она видна шириной LW.
    endPose(G, k) {
        const d = G.K * k;                                     // глубина, где 1 точка журнала = 1 точка экрана
        const sx = 195, sy = 430;
        return { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], k,
                 C: [(sx - G.O[0]) * d / G.K, (sy - G.O[1]) * d / G.K, G.K - d] };
    },
    matrix(P, G) {
        const [x, y, z] = P.R, k = P.k, V = this.vec;
        const t = V.sub(P.C, V.add(V.mul(x, k * G.LW / 2), V.mul(y, k * G.LH / 2)));
        const n = (v) => v.toFixed(6);
        return `translate(${G.O[0].toFixed(3)}px, ${G.O[1].toFixed(3)}px) perspective(${G.K.toFixed(3)}px) ` +
               `matrix3d(${[...x.map(v => v * k), 0, ...y.map(v => v * k), 0, ...z.map(v => v * k), 0, ...t, 1].map(n).join(',')})`;
    },

    // ---------- ОТКРЫТЬ ----------
    open() {
        if (this.busy || this.isOpen) return;
        this.init(this.host);
        const G = this.frame(), P0 = this.startPose(G), P1 = this.endPose(G, P0.k);
        this.G = G; this.P0 = P0; this.P1 = P1;
        const R = this.root, mag = this.$('.bm-mag');
        mag.style.width = G.LW + 'px'; mag.style.height = G.LH + 'px';
        this.build(G);
        const sp = this.$('.bm-space');
        sp.style.transform = `translate(${G.M.ox}px, ${G.M.oy}px) scale(${G.M.m})`;
        // Перспектива вписана В САМО преобразование журнала: translate(O)
        // perspective(K) matrix3d(поза). Свойством perspective на родителе с
        // началом в точке камеры Chrome рисовал журнал на 30 точек мимо того
        // места, что считала раскладка, и не прятал обороты страниц.
        this.renderShop();
        this.resetPages();
        this._inner = null; this.inner(false);
        // Призрак — та же запечённая картинка, что лежит в сцене, на её
        // точном месте. Летит та же толстая модель, но картинка сцены
        // нарисована тоньше css (скругления, тень на крышке) — подмена идёт
        // растворением поверх журнала, пока тот ещё лежит (GHOST мс); на
        // закрытии картинка проявляется, когда журнал уже лёг. Света на
        // верхнем журнале нет ни там, ни там (bath-mag.js, drawVector).
        const gh = this.$('.bm-ghost'), B = typeof BATH_MAG_BAKED !== 'undefined' ? BATH_MAG_BAKED.top : null;
        if (B) {
            const c = G.c;
            gh.src = B.src;
            Object.assign(gh.style, { left: (c.tx + c.s * B.x) + 'px', top: (c.ty + c.s * B.y) + 'px',
                                      width: (c.s * B.w) + 'px', height: (c.s * B.h) + 'px' });
        }
        this.put(mag, 'transform', this.matrix(P0, G));
        this.model(1, P0);
        this.put(this.$('.bm-dim'), 'opacity', '0');
        R.classList.add('on');
        this.sleepScene(true);
        this.isOpen = true; this.busy = true;
        // Журнал на унитазе прячется: летит он сам. Холст сцены
        // перерисуется один раз — это не покадровая правка.
        this.sceneMag(false);
        if (typeof BATH_MAG !== 'undefined') BATH_MAG.call.reset();
        if (typeof Haptics !== 'undefined') Haptics.impact('light');
        const H = this.GHOST;
        this.run(H + this.OPEN_AT + this.TURN + this.STAGGER * this.PAGES + 60, (e) => {
            // Сначала подмена НА МЕСТЕ: картинка сцены лежит поверх летящего
            // журнала в той же позе и растворяется (docs/traps.md, п. 163).
            this.ghost(1 - Math.min(1, e / H));
            this.openFrame(Math.max(0, e - H));
        }, () => { this.busy = false; });
    },
    openFrame(e) {
        const G = this.G, f = Math.min(1, e / this.FLY);
        // Полёт: быстро отрывается, мягко встаёт; по дороге приподнимается
        // дугой — взлетает, а не ползёт к камере.
        const u = this.ease(f), V = this.vec;
        const C = V.add(V.lerp(this.P0.C, this.P1.C, u), [0, -Math.sin(Math.PI * u) * 0.35 * this.P0.k * G.LW, 0]);
        const R = this.slerpR(this.P0.R, u);
        // Левитация у места: лёгкое покачивание, гаснущее к концу.
        const wob = f > 0.75 ? Math.sin((e - 0.75 * this.FLY) / 100) * 0.03 * (1 - Math.min(1, (e - this.FLY) / 630)) : 0;
        const Rw = wob ? this.mulR(R, this.rotX(wob)) : R;
        const P = { R: Rw, k: this.P0.k, C };
        this.put(this.$('.bm-mag'), 'transform', this.matrix(P, G));
        this.put(this.$('.bm-dim'), 'opacity', Math.min(1, e / this.FLY).toFixed(2));
        // Нутро журнала (страницы, прилавок, задник) — плоское во всю длину:
        // пока журнал согнут, его не видно.
        this.inner(e >= this.STRAIGHT);
        // Обложка и страницы: от 0 до −340° вокруг корешка — открываются и
        // заворачиваются за журнал. До своего начала их не трогают.
        this.turn(this.$('.bm-cover'), e - this.OPEN_AT);
        if (this._inner) this.pages.forEach((p, i) => this.turn(p, e - this.OPEN_AT - this.STAGGER * (i + 1)));
        // Выпрямление — плавно с места. После обложки: та пишет себе
        // прозрачность сама, а пока журнал согнут, её место — у полос.
        this.model(1 - this.ease(Math.min(1, e / this.STRAIGHT)), P);
    },
    // Призрак лежит ПОВЕРХ летящего журнала, а тот под ним непрозрачен.
    // Раньше гасли оба навстречу друг другу, и на середине (0.5 + 0.5)
    // сквозь журнал просвечивала крышка — журнал моргал (docs/traps.md, п. 163).
    ghost(a) { this.put(this.$('.bm-ghost'), 'opacity', a.toFixed(2)); },

    // ---------- ТОЛСТАЯ МОДЕЛЬ ----------
    // Летит ТОТ ЖЕ журнал, что лежит на унитазе: блок страниц толщиной
    // F.thick, обложка изогнута по профилю генератора (плоско на стопке,
    // плавно через кромку крышки, провис). Две плоские пластины с одним
    // переломом летели тонким листом — в момент тапа игрок видел, как одну
    // модель подменяют другой (docs/traps.md, п. 163).
    //
    // Модели две, и обе — одно тело. СОГНУТАЯ (.bm-bent): полосы по
    // профилю, у каждой кусок обложки, торец страниц и корешок; на взлёте
    // полосы выпрямляются. ПЛОСКАЯ (.bm-block + обложка .bm-a): цельные
    // грани, на ней листаются страницы — полосы на повороте обложки дали бы
    // волоски на стыках (п. 160). Смена — в кадре, где полосы уже легли в
    // одну плоскость и совпадают с цельными гранями.
    build(G) {
        if (this._built === G.LW) return;
        this._built = G.LW;
        const F = G.F, LW = G.LW, LH = G.LH, zt = this.ZTOP, D = F.thick * LH;
        const Mg = PALETTE.bathScene.magazine, Pp = Mg.paper, ink = PALETTE.ink;
        const cl = (v) => Math.max(0, Math.min(1, v));
        const paper = (t) => mixColor(Pp.lo, Pp[500], cl((t + 0.45) / 0.9));
        // Линии листов поперёк толщины — как у торца на картинке (bath-mag.js, pages).
        const leaves = (deg, t) => `linear-gradient(${deg}deg, ${paper(t)} 0 26%, ${Pp.line} 26% 32%, ${paper(t)} 32% 51%, ${Pp.line} 51% 57%, ${paper(t)} 57% 76%, ${Pp.line} 76% 82%, ${paper(t)} 82%)`;
        const spine = `linear-gradient(90deg, ${Mg.pinup[500]}, ${Mg.pinup.lo})`;
        const url = 'url(src/minigames/lust/mag-cover.jpg)';
        const T = F.tone;
        this.D = D;
        // Узлы профиля в точках журнала: v — по картинке обложки, y/z — верх.
        const nd = F.prof.map(([v, y, z]) => ({ v: v * LH, y: y * LH, z: zt + z * LH }));
        const segs = [];
        for (let i = 0; i + 1 < nd.length; i++) {
            const a = nd[i], b = nd[i + 1];
            segs.push({ v: a.v, flat: b.v - a.v, L: Math.hypot(b.y - a.y, b.z - a.z), phi: Math.atan2(b.z - a.z, b.y - a.y) });
        }
        this.segs = segs;
        // Контур — как у картинки сцены: по силуэту толстый и СНАРУЖИ грани
        // (на картинке обводка лежит под заливкой и видна внешняя половина),
        // внутренние рёбра — тонкие. Толщина задана НА ЭКРАНЕ у унитаза и
        // переведена в точки журнала по проекции позы: журнал лежит в ракурсе,
        // и одна толщина в его точках вдоль ширины выходила втрое тоньше,
        // а внутри грани линия съедала узкий торец целиком.
        const P0 = this.startPose(G), V = this.vec, px = (v) => v.toFixed(2) + 'px';
        const prj = (p) => {
            const [x, y, z] = P0.R, k = P0.k;
            const t = V.sub(P0.C, V.add(V.mul(x, k * LW / 2), V.mul(y, k * LH / 2)));
            const w = V.add(t, V.mul(V.add(V.add(V.mul(x, p[0]), V.mul(y, p[1])), V.mul(z, p[2])), k));
            const q = G.K / (G.K - w[2]);
            return [w[0] * q, w[1] * q];
        };
        // Сколько точек журнала по b даёт на экране target поперёк ребра d.
        const across = (p, d, b, target) => {
            const a0 = prj(p), ad = prj(V.add(p, d)), ab = prj(V.add(p, b));
            const dd = [ad[0] - a0[0], ad[1] - a0[1]], db = [ab[0] - a0[0], ab[1] - a0[1]];
            const per = Math.abs(dd[0] * db[1] - dd[1] * db[0]) / (Math.hypot(dd[0], dd[1]) || 1);
            return Math.min(30, target / Math.max(per, 1e-3));
        };
        const T1 = STROKE.contour * G.c.s, T2 = STROKE.detail * G.c.s, X = [1, 0, 0];
        // Нахлёст полос: без него на стыках светились волоски фона (п. 160).
        const OV = 4;
        // Рамка грани расширена под внешнюю линию (вне рамки слой не рисуется),
        // заливка грани — только её настоящий размер (no-repeat).
        const ln = (bwid, bg) => `<i class="bm-ln" style="border-width:${bwid};border-color:${ink};${bg ? `background:${bg};` : ''}"></i>`;
        const face = (cls, x, w, h, bg, over) =>
            `<div class="bm-face ${cls}" style="left:${px(x)};width:${px(w)};height:${px(h)};background:${bg}">${over || ''}</div>`;
        // Боковые линии торца и тонкое ребро — одной толщины на всех полосах,
        // по середине изгиба: своя у каждой полосы давала лесенку на стыках.
        // Силуэт слева (корешок) сжат ракурсом сильнее всего и меняется вдоль
        // журнала вдвое — он клином: толщина в каждом узле своя, полоса
        // обрезана трапецией (clip-path), и стыки совпадают.
        const rest = this.bentPose(1), qm = rest[Math.floor(rest.length * 0.6)], gm = segs[Math.floor(rest.length * 0.6)];
        const cm = Math.cos(qm.phi), smn = Math.sin(qm.phi), aym = [0, cm, smn], azm = [0, -smn, cm];
        const atm = (x, d) => [x, qm.y + cm * gm.L / 2 + smn * d, qm.z + smn * gm.L / 2 - cm * d];
        const bR = across(atm(LW, 0), aym, X, T2);
        const sF = across(atm(0, D), aym, azm, T1), sN = across(atm(LW, D), aym, azm, T1);
        const wN = rest.map((q, i) => { const c = Math.cos(q.phi), sn = Math.sin(q.phi); return across([0, q.y, q.z], [0, c, sn], X, T1); });
        { const q = rest[rest.length - 1], c = Math.cos(q.phi), sn = Math.sin(q.phi); wN.push(across([0, q.y + c * q.L, q.z + sn * q.L], [0, c, sn], X, T1)); }
        const bL = Math.max(...wN);
        // Клин — svg-фоном полосы: обрезка clip-path в 3d-контексте ломала
        // порядок граней, и торец страниц лез поверх обложки.
        const wedge = (x0, x1, hh) => {
            const W = (bL + 1).toFixed(2), H = hh.toFixed(2);
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`
                      + `<polygon points="${x0.toFixed(2)},0 ${W},0 ${W},${H} ${x1.toFixed(2)},${H}" fill="${ink}"/></svg>`;
            return `url('data:image/svg+xml,${encodeURIComponent(svg)}') 0 0 / ${W}px 100% no-repeat`;
        };
        let bent = '';
        rest.forEach((q, i) => {
            const g = segs[i], last = i === segs.length - 1, h = g.L + (last ? 0 : OV);
            const c = Math.cos(q.phi), sn = Math.sin(q.phi), ay = [0, c, sn], az = [0, -sn, c];
            const at = (x, u, d) => [x, q.y + c * u + sn * d, q.z + sn * u - c * d];   // u — вдоль, d — вглубь
            const top = i === 0 ? across(at(LW / 2, 0, 0), X, ay, T1) : 0;
            const bgH = LH * g.L / g.flat;
            const side = (bg) => `${bg} 0 0 / ${px(D)} 100% no-repeat`;
            let ends = '';
            if (i === 0) {
                const e = across(at(0, 0, D / 2), az, X, T2);
                ends += face('bm-st', -e, LW + 2 * e, D, `${leaves(0, T.end)} ${px(e)} 0 / ${px(LW)} 100% no-repeat`, ln(`0 ${px(e)}`));
            }
            if (last) {
                const eb = across(at(LW / 2, g.L, D), X, az, T1), el = across(at(0, g.L, D / 2), az, X, T1), er = across(at(LW, g.L, D / 2), az, X, T2);
                this.endShift = el;
                ends += face('bm-se', -el, LW + el + er, D + eb, `${leaves(180, T.end)} ${px(el)} 0 / ${px(LW)} ${px(D)} no-repeat`,
                             ln(`0 ${px(er)} ${px(eb)} ${px(el)}`));
            }
            bent += `<div class="bm-seg">`
                + face('bm-sf', 0, D + sF, h, side(spine), ln(`0 ${px(sF)} 0 0`))
                + face('bm-sn', 0, D + sN, h, side(leaves(90, T.near)), ln(`0 ${px(sN)} 0 0`))
                + ends
                + face('bm-sc', -bL, LW + bL + bR, h + top, `${url} ${px(bL)} ${px(top - g.v * bgH / LH)} / ${px(LW)} ${px(bgH)} no-repeat`,
                       ln(`${px(top)} ${px(bR)} 0 0`, wedge(bL - wN[i], bL - wN[i + 1], h + top)))
                    .replace('style="', `style="top:${px(-top)};`)
                + `</div>`;
        });
        this.$('.bm-bent').innerHTML = bent;
        this.lnEls = null;
        this.$('.bm-block').innerHTML =
              face('bm-bf', 0, D, LH, spine)
            + face('bm-bt', 0, LW, D, leaves(0, T.end))
            + face('bm-bn', 0, D, LH, leaves(90, T.near))
            + face('bm-be', 0, LW, D, leaves(180, T.end));
        const a = this.$('.bm-a');
        a.style.height = LH + 'px';
        a.style.backgroundImage = url;
        a.style.backgroundSize = `${LW}px ${LH}px`;
        this.$('.bm-back').style.transform = `translateZ(${(zt - D).toFixed(2)}px)`;
        // Цельные грани блока: корешок (x = 0), торец у стопки (y = 0),
        // торец страниц (x = LW), низ (y = LH). Все уходят от верха вниз на D.
        const B = this.$('.bm-block');
        B.querySelector('.bm-bf').style.transform = `translate3d(0, 0, ${zt}px) rotateY(90deg)`;
        B.querySelector('.bm-bt').style.transform = `translate3d(0, 0, ${zt}px) rotateX(-90deg)`;
        B.querySelector('.bm-bn').style.transform = `translate3d(${LW}px, 0, ${zt}px) rotateY(90deg)`;
        B.querySelector('.bm-be').style.transform = `translate3d(0, ${LH}px, ${zt}px) rotateX(-90deg)`;
        this.blockFaces = [
            [B.querySelector('.bm-bf'), [-1, 0, 0], [0, LH / 2, zt - D / 2]],
            [B.querySelector('.bm-bt'), [0, -1, 0], [LW / 2, 0, zt - D / 2]],
            [B.querySelector('.bm-bn'), [1, 0, 0], [LW, LH / 2, zt - D / 2]],
            [B.querySelector('.bm-be'), [0, 1, 0], [LW / 2, LH, zt - D / 2]]];
        this.segEls = this.$$('.bm-seg').map(el => ({
            f: el.querySelector('.bm-sf'), n: el.querySelector('.bm-sn'), c: el.querySelector('.bm-sc'),
            t: el.querySelector('.bm-st'), e: el.querySelector('.bm-se') }));
    },
    // Изгиб a (1 — как на унитазе, 0 — плоско): узлы заново по хордам с
    // углами φ·a; длина хорды — от изогнутой к плоской (обложка на изгибе
    // чуть длиннее своего места на картинке).
    bentPose(a) {
        let y = 0, z = this.ZTOP;
        return this.segs.map(g => {
            const phi = g.phi * a, L = g.flat + (g.L - g.flat) * a, o = { y, z, phi, L, s: L / g.L };
            y += L * Math.cos(phi); z += L * Math.sin(phi);
            return o;
        });
    },
    // Грань видна, если смотрит на камеру. Считает код, а не
    // backface-visibility: без видеокарты Chrome её не соблюдает (п. 161).
    seen(P, n, p) {
        const [x, y, z] = P.R, V = this.vec, G = this.G, k = P.k;
        const t = V.sub(P.C, V.add(V.mul(x, k * G.LW / 2), V.mul(y, k * G.LH / 2)));
        const w = (v) => V.add(V.add(V.mul(x, v[0]), V.mul(y, v[1])), V.mul(z, v[2]));
        const pw = V.add(t, V.mul(w(p), k));
        return V.dot(w(n), V.sub([0, 0, G.K], pw)) > 0;
    },
    model(a, P) {
        const on = (el, v) => el && this.put(el, 'opacity', v ? '1' : '0');
        const LW = this.G.LW, D = this.D;
        if (a <= 0) {
            this.segEls.forEach(s => ['f', 'n', 'c', 't', 'e'].forEach(k => on(s[k], false)));
            this.blockFaces.forEach(([el, n, p]) => on(el, this.seen(P, n, p)));
            // Обложку, пока она закрыта, включает модель; открывает — setTurn.
            if (this.$('.bm-cover')._a === 0) on(this.$('.bm-a'), true);
            return;
        }
        this.blockFaces.forEach(([el]) => on(el, false));
        on(this.$('.bm-a'), false);
        if (!this.lnEls) this.lnEls = this.$$('.bm-bent .bm-ln');
        // Гаснут к середине выпрямления: линии в ракурсе лежащего журнала
        // толще в его точках и на развороте раздувались бы серыми полосами.
        const ao = Math.max(0, Math.min(1, (a - 0.5) / 0.5));
        this.lnEls.forEach(el => this.put(el, 'opacity', ao.toFixed(3)));
        const pose = this.bentPose(a), f4 = (v) => v.toFixed(3);
        pose.forEach((q, i) => {
            const s = this.segEls[i], c = Math.cos(q.phi), sn = Math.sin(q.phi);
            const base = `translate3d(0, ${f4(q.y)}px, ${f4(q.z)}px) rotateX(${q.phi.toFixed(5)}rad)`;
            // Ось полосы в журнале: y — вдоль, z — наружу.
            const ay = [0, c, sn], az = [0, -sn, c], mid = (u, d) => [u, q.y + c * q.L / 2 - sn * -d, q.z + sn * q.L / 2 + c * -d];
            this.put(s.c, 'transform', `${base} scaleY(${f4(q.s)})`);
            this.put(s.f, 'transform', `${base} rotateY(90deg) scaleY(${f4(q.s)})`);
            this.put(s.n, 'transform', `${base} translateX(${LW}px) rotateY(90deg) scaleY(${f4(q.s)})`);
            on(s.c, this.seen(P, az, mid(LW / 2, 0)));
            on(s.f, this.seen(P, [-1, 0, 0], mid(0, D / 2)));
            on(s.n, this.seen(P, [1, 0, 0], mid(LW, D / 2)));
            if (s.t) { this.put(s.t, 'transform', `${base} rotateX(-90deg)`); on(s.t, this.seen(P, [0, -c, -sn], [LW / 2, q.y - sn * -D / 2, q.z + c * -D / 2])); }
            if (s.e) {
                this.put(s.e, 'transform', `${base} translateY(${f4(q.L)}px) rotateX(-90deg)`);
                const ey = q.y + c * q.L, ez = q.z + sn * q.L;
                on(s.e, this.seen(P, ay, [LW / 2, ey + sn * D / 2, ez - c * D / 2]));
            }
        });
    },
    inner(on) {
        if (on === this._inner) return;
        this._inner = on;
        for (const el of [this.$('.bm-shop'), this.$('.bm-back')]) this.put(el, 'opacity', on ? '1' : '0');
        this.pages.forEach(p => {
            p._a = null;
            if (on) { this.setTurn(p, 0); return; }
            if (!p._faces) this.setTurn(p, 0);
            p._faces.forEach(list => list.forEach(f => this.put(f, 'opacity', '0')));
        });
    },
    turn(el, t) {
        if (t <= 0 && el._a === 0) return;
        const u = Math.max(0, Math.min(1, t / this.TURN));
        this.setTurn(el, -340 * this.ease(u));
    },
    // Страница (или обложка) повёрнута на a° вокруг корешка. Какая сторона
    // смотрит на игрока, решает ЭТОТ код, а не backface-visibility, и
    // ушедшая за журнал страница гаснет здесь же, а не прячется сортировкой
    // по глубине: без видеокарты Chrome не делает ни того, ни другого, и
    // оборот обложки лежал поверх её лица. Так одинаково везде.
    //   0…−90°     — лицо к игроку;
    //   −90…−265°  — оборот (страница ушла влево и смотрит изнанкой);
    //   дальше     — за журналом, не видна.
    setTurn(el, a) {
        if (el._a === a) return;
        el._a = a;
        const face = a > -90, gone = a <= -265;
        if (!gone) this.put(el, 'transform', `translateZ(${el.dataset.z || 0}px) rotateY(${a.toFixed(1)}deg)`);
        if (!el._faces) {
            const isCover = el.classList.contains('bm-cover');
            el._faces = [el.querySelectorAll(isCover ? '.bm-a, .bm-b' : '.bm-f'), el.querySelectorAll(isCover ? '.bm-in' : '.bm-r')];
        }
        // Стороны — прозрачностью (её анимирует композитор), а не display.
        el._faces[0].forEach(f => this.put(f, 'opacity', !gone && face ? '1' : '0'));
        el._faces[1].forEach(b => this.put(b, 'opacity', !gone && !face ? '1' : '0'));
    },

    // ---------- ЗАКРЫТЬ ----------
    // Открытие задом наперёд: страницы возвращаются из-за журнала по одной —
    // первой та, что ушла последней, обложка закрывает журнал последней, —
    // и, пока она закрывается, журнал уже летит обратно и ложится.
    close() {
        if (this.busy || !this.isOpen) return;
        this.busy = true;
        const G = this.G, T = this.BACK, TB = this.TURN_BACK, SB = this.STAGGER_BACK, H = this.GHOST;
        const leaves = [...this.pages].reverse().concat(this.$('.bm-cover'));
        leaves.forEach(p => { p._a = null; this.setTurn(p, -340); });
        const F0 = SB * this.PAGES + TB * 0.5;              // взлёт — с полузакрытой обложкой
        this.run(F0 + T + H, (e) => {
            // С −265°, а не с −340°: дальше страница за журналом и не видна,
            // и закрытие начиналось с паузы на её невидимый путь.
            leaves.forEach((p, i) => this.setTurn(p, -265 * (1 - this.ease(Math.max(0, Math.min(1, (e - SB * i) / TB))))));
            const f = Math.max(0, Math.min(1, (e - F0) / T)), u = this.ease(f), V = this.vec;
            // журнал снова сгибается — нутро прячется под обложку
            this.inner(f < 0.5);
            // Картинка сцены проявляется, когда журнал УЖЕ лёг и согнулся.
            this.ghost(Math.max(0, Math.min(1, (e - F0 - T) / H)));
            const C = V.add(V.lerp(this.P1.C, this.P0.C, u), [0, -Math.sin(Math.PI * u) * 0.2 * this.P0.k * G.LW, 0]);
            const P = { R: this.slerpR(this.P0.R, 1 - u), k: this.P0.k, C };
            this.put(this.$('.bm-mag'), 'transform', this.matrix(P, G));
            this.model(this.ease(Math.max(0, (f - 0.55) / 0.45)), P);
            this.put(this.$('.bm-dim'), 'opacity', (1 - f).toFixed(2));
        }, () => {
            this.root.classList.remove('on');
            this.sceneMag(true);
            this.sleepScene(false);
            this.isOpen = false; this.busy = false;
        });
    },

    // Сброс без анимации — игра закрылась посреди полёта.
    hide() {
        this.stopAnims(); this.raf = 0;
        if (this.root) this.root.classList.remove('on');
        this.sceneMag(true);
        this.sleepScene(false);
        this.isOpen = false; this.busy = false;
    },

    // Пока журнал открыт, сцена за затемнением СПИТ: червь не пересчитывает
    // кадры, живые вещи на полке стоят, дождь и прочие css-циклы на паузе
    // (lust.css, .bm-reading). Крутить их под журналом — греть телефон зря.
    sleepScene(on) {
        const h = this.host;
        if (h.screenElement) h.screenElement.classList.toggle('bm-reading', on);
        if (h.wormHandle && h.wormHandle.setPaused) h.wormHandle.setPaused(on);
        if (typeof BATH_SOAP !== 'undefined') { if (on) BATH_SOAP.stop(); else BATH_SOAP.wake(); }
    },

    sceneMag(on) {
        const g = document.getElementById('bt-mag-top');
        if (g) g.style.visibility = on ? '' : 'hidden';
    },
    resetPages() {
        this.stopAnims();
        const cov = this.$('.bm-cover');
        this.pages = this.$$('.bm-page');
        cov.dataset.z = 4; cov._a = null; this.setTurn(cov, 0);
        this.pages.forEach((p, i) => { p.dataset.z = 3 - i * 0.8; p._a = null; this.setTurn(p, 0); });
    },

    // ---------- ПРИЛАВОК НА СТРАНИЦЕ ----------
    // Страница — рекламный лист (mag-ad-art.js): три окна-полки, в медальоне
    // следующая ступень, бирка с ценой, сургучная печать-корзинка. Лист
    // статичный: рисуется на открытие журнала и после покупки, не на кадре.
    renderShop() {
        const el = this.$('.bm-shop');
        if (!el || typeof LustShop === 'undefined' || typeof MAG_AD === 'undefined') return;
        const u = LustShop.conf(), A = MAG_AD;
        const data = (key) => {
            const b = u[key], lvl = LustShop.level(key), n = b.levels.length;
            const lv = b.levels[lvl], price = lv && lv.price, cur = price && Object.keys(price)[0];
            return { bought: lvl, next: Math.min(lvl + 1, n), price: price ? price[cur] : null,
                     canBuy: !!price && LustShop.affordable(price) };
        };
        // Предмет следующей ступени — тот же рисунок, что в ванне.
        const thing = (L, key) => { const d = data(key); return Object.assign(d, { item: { svg: L.draw(d.next), box: L.box(d.next) } }); };
        const windows = {};
        if (u.tail) windows.tail = () => { const d = data('tail'); d.item = A.tailItem(d.next, this.host && this.host.tailModel); return A.shelf('tail', d); };
        if (u.cloth && typeof BATH_CLOTH !== 'undefined') windows.cloth = () => A.shelf('cloth', thing(BATH_CLOTH, 'cloth'));
        if (u.soap && typeof BATH_SOAP !== 'undefined') windows.soap = () => A.shelf('soap', thing(BATH_SOAP, 'soap'));
        // Кошелёк — своя полка на самом листе (MAG_AD.wallet); лист
        // перерисовывается после покупки, и число вместе с ним.
        el.innerHTML = A.page({ windows, wallet: GameState.currency('lust_token') });
        // Попадание считается по экранному прямоугольнику листа и раскладке
        // окон (MAG_AD.zones), а не по цели события: внутри 3d-журнала Chrome
        // отдаёт тап самой странице, а не её детям. В конечной позе журнал
        // смотрит прямо на игрока, и прямоугольник листа точный.
        el.onpointerdown = (e) => {
            e.stopPropagation();
            if (this.busy) return;
            const r = el.querySelector('.mad-page').getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width * A.W, y = (e.clientY - r.top) / r.height * A.H;
            const keys = Object.keys(windows), seal = (k) => el.querySelector(`.mad-seal[data-key="${k}"]`);
            // Печать — с запасом на палец: оттиск на телефоне меньше подушечки.
            const hitSeal = keys.find(k => { const [cx, cy, sr] = A.zones(k).seal; return seal(k) && Math.hypot(x - cx, y - cy) <= sr * 1.35; });
            if (hitSeal) { LustShop.buy(hitSeal); this.renderShop(); return; }
            // Тап по рекламе не покупает — подсвечивает печать. Нет печати —
            // жетонов не хватает, и купить нечем.
            const win = keys.find(k => { const [wx, wy, ww, wh] = A.zones(k).win; return x >= wx && x <= wx + ww && y >= wy && y <= wy + wh; });
            const c = win && seal(win);
            if (!c) return;
            c.classList.remove('bm-glow'); void c.getBoundingClientRect(); c.classList.add('bm-glow');
        };
    },

    // ---------- ЧАСЫ: ВСЁ ДВИЖЕНИЕ — НА ВИДЕОКАРТЕ ----------
    // Кадр полёта не считается на каждом кадре экрана. Вся анимация один раз
    // раскладывается в ключевые кадры (каждые 25 мс: transform и opacity
    // каждого элемента журнала) и отдаётся Web Animations — их проигрывает
    // поток композитора, главный поток на кадре не делает ничего. Пока полёт
    // вёл скрипт, каждый кадр пересылал дерево слоёв в композитор (Commit +
    // Layerize — 8 мс кадра под замедлением), и на айфоне журнал летел в три
    // кадра. Анимация стартует, когда её первый кадр уже собран, — прыжка от
    // долгого первого кадра нет сама собой (docs/traps.md, п. 158).
    run(ms, frame, done) {
        this.stopAnims();
        const N = Math.max(2, Math.ceil(ms / 25)), rec = new Map();
        this.rec = { rec, i: 0 };
        for (let i = 0; i <= N; i++) { this.rec.i = i; frame(ms * i / N); }
        this.rec = null;
        const anims = [];
        rec.forEach((props, el) => {
            const kf = [], last = {}, c = el._bm || (el._bm = {});
            for (let i = 0; i <= N; i++) {
                const k = { offset: i / N };
                for (const prop of Object.keys(props)) {
                    let v = props[prop][i];
                    if (v === undefined) v = prop in last ? last[prop] : (c[prop] != null ? c[prop] : (prop === 'opacity' ? '1' : 'none'));
                    last[prop] = v; k[prop] = v;
                }
                kf.push(k);
            }
            Object.assign(c, last);                        // кеш записей — по конечному кадру
            anims.push(el.animate(kf, { duration: ms, easing: 'linear', fill: 'forwards' }));
        });
        this.anims = anims;
        const fin = () => { if (this.anims === anims) { this.raf = 0; if (done) done(); } };
        if (!anims.length) { fin(); return; }
        Promise.all(anims.map(a => a.finished)).then(fin, () => {});
    },
    // Снять анимации, оставив элементы там, где их застали.
    stopAnims() {
        for (const a of this.anims || []) { try { a.commitStyles(); } catch (e) {} a.cancel(); }
        this.anims = [];
    },
    $$(sel) { return Array.from(this.root.querySelectorAll(sel)); },
    // Стиль пишется, только если значение другое: каждая запись в слой с
    // 3d-преобразованием — пересборка дерева слоёв (Commit + Layerize были
    // самой дорогой частью кадра полёта).
    put(el, prop, val) {
        if (this.rec) {                                    // раскладка анимации в кадры
            const m = this.rec.rec, p = m.get(el) || (m.set(el, {}), m.get(el));
            (p[prop] || (p[prop] = []))[this.rec.i] = val;
            return;
        }
        const c = el._bm || (el._bm = {});
        if (c[prop] === val) return;
        c[prop] = val; el.style[prop] = val;
    },
    ease(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    easeOut(u) { return 1 - Math.pow(1 - u, 3); },

    // ---------- ВЕКТОРЫ И ПОВОРОТЫ ----------
    vec: {
        add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
        sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
        mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
        dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
        cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
        len: (a) => Math.hypot(a[0], a[1], a[2]),
        unit: (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; },
        lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    },
    // Поворот из базиса R0 (столбцы x, y, z) в единичный — сферически: журнал
    // разворачивается по кратчайшей дуге, а не сплющивается по пути.
    slerpR(R0, t) {
        const q = this.quat(R0), q1 = [0, 0, 0, 1];
        let d = q[0] * q1[0] + q[1] * q1[1] + q[2] * q1[2] + q[3] * q1[3];
        const s = d < 0 ? -1 : 1; d = Math.abs(d);
        let a, b;
        if (d > 0.9995) { a = 1 - t; b = t; }
        else { const th = Math.acos(d), sn = Math.sin(th); a = Math.sin((1 - t) * th) / sn; b = Math.sin(t * th) / sn; }
        const r = [q[0] * a + s * q1[0] * b, q[1] * a + s * q1[1] * b, q[2] * a + s * q1[2] * b, q[3] * a + s * q1[3] * b];
        const n = Math.hypot(...r);
        return this.mat(r.map(v => v / n));
    },
    quat(R) {   // R — столбцы
        const m00 = R[0][0], m10 = R[0][1], m20 = R[0][2], m01 = R[1][0], m11 = R[1][1], m21 = R[1][2], m02 = R[2][0], m12 = R[2][1], m22 = R[2][2];
        const tr = m00 + m11 + m22;
        if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; return [(m21 - m12) / S, (m02 - m20) / S, (m10 - m01) / S, 0.25 * S]; }
        if (m00 > m11 && m00 > m22) { const S = Math.sqrt(1 + m00 - m11 - m22) * 2; return [0.25 * S, (m01 + m10) / S, (m02 + m20) / S, (m21 - m12) / S]; }
        if (m11 > m22) { const S = Math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / S, 0.25 * S, (m12 + m21) / S, (m02 - m20) / S]; }
        const S = Math.sqrt(1 + m22 - m00 - m11) * 2; return [(m02 + m20) / S, (m12 + m21) / S, 0.25 * S, (m10 - m01) / S];
    },
    mat(q) {    // кватернион → столбцы
        const [x, y, z, w] = q;
        return [[1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
                [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
                [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]];
    },
    rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; },
    mulR(A, B) {  // столбцы: (A·B)[:, j] = A · B[:, j]
        return B.map(col => [0, 1, 2].map(i => A[0][i] * col[0] + A[1][i] * col[1] + A[2][i] * col[2]));
    }
};
