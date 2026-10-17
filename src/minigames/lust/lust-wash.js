// ================= ПОХОТЬ: МЫТЬЁ =================
// Маска силуэта, покрытие пеной, след на холсте, ввод пальцем, этапы мытья
// (кран → мыло → мочалка), подсказка «где не домыли».
// Продолжение LustMinigame (lust.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после lust.js.
Object.assign(LustMinigame, {

    // ---------- МАСКА СИЛУЭТА ----------
    // Мыло обязано ложиться НА ЧЕРВЯ, а не на воду вокруг него. Силуэт для
    // этого берётся у самого нарисованного персонажа: его svg переводится в
    // картинку и растрируется один раз. Подбирать силуэт числами нельзя —
    // червь меняется отметинами, животом и будущим взрослением.
    //
    // Альфа приводится к ДВУМ значениям, 0 или 255: маска накладывается на
    // каждый мазок, и полупрозрачная кромка от повторов таяла бы, обгрызая
    // пену по краю тела.
    buildMask() {
        const root = this.wormHandle && this.wormHandle.svgRoot;
        if (!root) return;
        const B = this.WORM_BASE, S = this.MASK_SCALE, box = this.wormBoxScene();
        const copy = root.cloneNode(true);
        copy.setAttribute('width', B.w);
        copy.setAttribute('height', B.h);
        copy.setAttribute('viewBox', `0 0 ${B.w} ${B.h}`);
        // Всё красится в ПЛОСКИЙ чёрный, снимаются фильтры и прозрачности —
        // маске нужен один силуэт.
        //
        // А вот ОБРЕЗКИ СНИМАТЬ НЕЛЬЗЯ. Раньше снимались вместе со всем
        // остальным, и маска выходила ЗАМЕТНО БОЛЬШЕ червя: анатомические
        // слои сегментов обрезаны по своей форме, и без обрезки они
        // расползались за тело — из-под живота вылезал прямой косой клин, по
        // которому мыло ложилось на пустую плитку. Ссылки url(#...)
        // разрешаются: клонируется весь корень вместе с defs.
        //
        // Убирается только display:none — им спрятаны утопленные части
        // (opts.endAtBelly), и в маске их быть не должно тем более.
        const all = copy.querySelectorAll('*');
        for (const n of all) {
            const tag = n.tagName.toLowerCase();
            if (tag === 'filter') { n.remove(); continue; }
            if (n.closest('defs') || n.closest('clipPath')) continue;
            n.removeAttribute('mask');
            n.removeAttribute('filter');
            n.removeAttribute('style');
            n.removeAttribute('opacity');
            n.removeAttribute('fill-opacity');
            n.removeAttribute('stroke-opacity');
            if (n.hasAttribute('fill') || tag !== 'g') n.setAttribute('fill', '#000');
            if (n.hasAttribute('stroke')) n.setAttribute('stroke', '#000');
        }
        // Рамка габарита (opts.endAtBelly) после перекраски стала бы чёрным
        // прямоугольником во всю маску.
        for (const n of copy.querySelectorAll('.worm-extent')) n.remove();
        // Спрятанное остаётся спрятанным: style снят выше со всех, поэтому
        // прячем заново уже в клоне.
        for (const n of copy.querySelectorAll('[data-part]')) {
            const q = n.getAttribute('data-part') || '';
            if (q === 'tail' || q.indexOf('growing-') === 0)
                n.setAttribute('display', 'none');
        }
        const svg = new XMLSerializer().serializeToString(copy);
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = B.w * S; c.height = B.h * S;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0, c.width, c.height);
            try {
                const d = g.getImageData(0, 0, c.width, c.height);
                for (let i = 3; i < d.data.length; i += 4)
                    d.data[i] = d.data[i] > 24 ? 255 : 0;
                g.putImageData(d, 0, 0);
            } catch (e) { /* холст запачкан — сойдёт и мягкая кромка */ }
            // Ниже борта червя НЕ ВИДНО — там и мылить нечего. Линия берётся
            // у дальней половины чаши: ровно она его и закрывает. Раньше
            // стояла доля от холста персонажа, и клетки под бортом считались
            // «на теле»: игрок тёр видимое, а этап требовал невидимого.
            const cut = (this.visibleLine() - box.y) * (B.h / box.h) * S;
            g.clearRect(0, Math.max(0, cut), c.width, c.height);
            this.mask = c;
            // Альфа маски снимается ОДИН РАЗ и живёт рядом: по ней потом
            // проверяется, стоит ли центр пузыря на теле. Маска за этап не
            // меняется, а getImageData на каждую перерисовку следа — это
            // мегабайт чтения по десятку раз в секунду.
            this.maskAlpha = null;
            try {
                const d = g.getImageData(0, 0, c.width, c.height).data;
                const a = new Uint8Array(c.width * c.height);
                for (let i = 0, j = 0; j < a.length; i += 4, j++) a[j] = d[i + 3];
                this.maskAlpha = a;
            } catch (e) { /* холст запачкан — обойдёмся без проверки */ }
            // Коробка покрытия выводится ИЗ МАСКИ, значит её кэш обязан
            // сброситься здесь: до этой строки маски не было и коробка
            // считалась по запасному варианту.
            this._cover = null;
            this.buildCells();
        };
        img.onerror = () => {
            this.mask = null; this.maskAlpha = null; this.buildCells();
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    },

    // Какие клетки покрытия вообще лежат на теле. Без этого порог 92%
    // недостижим: угол коробки червём не занят, и мылить там нечего.
    buildCells() {
        const G = this.grid(), b = this.coverBox();
        const box = this.wormBoxScene(), B = this.WORM_BASE, S = this.MASK_SCALE;
        this.cellOn = new Array(G.nx * G.ny).fill(true);
        this.cellTotal = G.nx * G.ny;
        if (!this.mask) return;
        const g = this.mask.getContext('2d');
        const k = B.w / box.w * S;
        let on = 0;
        for (let j = 0; j < G.ny; j++) {
            for (let i = 0; i < G.nx; i++) {
                const sx = b.x + (i + 0.5) * b.w / G.nx;
                const sy = b.y + (j + 0.5) * b.h / G.ny;
                const px = Math.round((sx - box.x) * k);
                const py = Math.round((sy - box.y) * k);
                let a = 0;
                try { a = g.getImageData(px, py, 1, 1).data[3]; } catch (e) { a = 255; }
                const hit = a > 0;
                this.cellOn[j * G.nx + i] = hit;
                if (hit) on++;
            }
        }
        // Совсем пустая маска означает, что силуэт не сняли: лучше считать
        // по всей коробке, чем сделать этап непроходимым.
        if (on >= 8) this.cellTotal = on;
        else this.cellOn.fill(true);
        this.resetCover();
    },

    // ---------- ПОКРЫТИЕ ----------
    // Клетки лежат на самом ЧЕРВЕ, а не на воде под ним. Первый вариант
    // считал покрытие по габариту воды: мазки по пустой воде рядом с телом
    // засчитывались, и пена оставалась там же — мыли ванну, а не червя.
    //
    // Габарит берётся у НАРИСОВАННОГО персонажа, а не подбирается числом:
    // единицы его холста переводятся в сцену тем же множителем, что и в
    // layoutWorm.
    // Габарит СИЛУЭТА — прямо по маске, а не по коробке червя с поджатием.
    // Поджатие было подобранным числом (семь процентов по бокам, вдвое
    // сверху) и врало: уши и макушка оказывались ВНЕ коробки, и мыло на них
    // не ложилось вовсе, а снизу коробка уходила на семь десятков единиц
    // ниже силуэта — там мылить было нечего, но клетки считались. Из ста
    // клеток сетки на теле оказывалось сорок.
    maskBounds() {
        if (!this.mask) return null;
        const box = this.wormBoxScene(), B = this.WORM_BASE, S = this.MASK_SCALE;
        let d;
        try {
            d = this.mask.getContext('2d')
                .getImageData(0, 0, this.mask.width, this.mask.height).data;
        } catch (e) { return null; }
        const W = this.mask.width, H = this.mask.height;
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) {
            const row = y * W * 4;
            for (let x = 0; x < W; x++) {
                if (!d[row + x * 4 + 3]) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        if (x1 < 0) return null;
        const k = box.w / (B.w * S);          // пиксель маски → единица сцены
        return { x: box.x + x0 * k, y: box.y + y0 * k,
                 w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k };
    },

    coverBox() {
        if (this._cover) return this._cover;
        this._cover = this.maskBounds()
            || BATH_ART.box('tub') || { x: 100, y: 600, w: 500, h: 150 };
        return this._cover;
    },

    resetCover() {
        const G = this.grid();
        this.cells = new Array(G.nx * G.ny).fill(0);
        this.covered = 0;
        this.dirty = false;
    },

    // Пометить клетки под мазком. Возвращает долю покрытого — от клеток НА
    // ТЕЛЕ, а не от всей коробки: мазки мимо червя больше не засчитываются,
    // и требовать их незачем.
    paint(x, y, radius, need) {
        const b = this.coverBox(), G = this.grid();
        const cw = b.w / G.nx, ch = b.h / G.ny;
        const i0 = Math.max(0, Math.floor((x - radius - b.x) / cw));
        const i1 = Math.min(G.nx - 1, Math.floor((x + radius - b.x) / cw));
        const j0 = Math.max(0, Math.floor((y - radius - b.y) / ch));
        const j1 = Math.min(G.ny - 1, Math.floor((y + radius - b.y) / ch));
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                const k = j * G.nx + i;
                if (this.cellOn && !this.cellOn[k]) continue;
                const cx = b.x + (i + 0.5) * cw, cy = b.y + (j + 0.5) * ch;
                if (Math.hypot(cx - x, cy - y) > radius) continue;
                if (this.cells[k] >= need) continue;
                this.cells[k]++;
                this.dirty = true;
                if (this.cells[k] >= need) this.covered++;
            }
        }
        return this.covered / (this.cellTotal || (G.nx * G.ny));
    },

    // ---------- СЛЕД НА ХОЛСТЕ ----------
    // Рисуется РОВНО ТА ЖЕ СЕТКА, по которой считается прогресс: клетка со
    // ступенью яркости по числу проходов. Пока след был мягкими пятнами
    // «примерно там, где вёл палец», картинка и учёт жили отдельно, и игрок
    // не понимал ни где сделано, ни сколько осталось — особенно на мочалке,
    // где клетке нужно три прохода.
    //
    // Перерисовывается ЦЕЛИКОМ, но только когда клетка изменилась: сотня
    // кругов раз в несколько событий указателя дешевле, чем накопление
    // мазков, и картинка не может разойтись с состоянием.
    // Состояние КЛЕТКИ и есть картинка. Рисуется ровно та сетка, по которой
    // считается прогресс, поэтому «где сделано» видно буквально, а не
    // угадывается по мягкому пятну примерно там, где вёл палец.
    //
    // Три вида, и они различаются НАЗНАЧЕНИЕМ, а не оттенком одного и того
    // же: голая кожа — не трогали; мутная плёнка — намылено; яркая пена —
    // оттёрто, со ступенью на каждую тёрку. Пока муть и пена жили разными
    // слоями и складывались, «намылено» и «оттёрто» давали одно бледное
    // пятно, и этап мочалки читался пустым.
    renderLather() {
        const ctx = this.washCtx;
        if (!ctx || !this.cells) return;
        const box = this.wormBoxScene(), B = this.WORM_BASE, S = this.MASK_SCALE;
        const k = B.w / box.w * S;
        const b = this.coverBox(), G = this.grid(), need = this.stageNeed();
        const cw = b.w / G.nx, ch = b.h / G.ny;
        const r = Math.max(cw, ch) * 0.78 * k;
        const cloth = this.phase === 'cloth';

        // ДВА ПРОХОДА, и разница между ними — обрезка силуэтом.
        //
        // Подложка — это плёнка НА КОЖЕ: она обязана кончаться там же, где
        // кончается червь. Пузырь — предмет, лежащий на коже: он выпуклый,
        // и у края тела половина его честно торчит наружу. Пока обрезалось
        // всё разом, пена кончалась идеально ровной дугой по контуру червя,
        // а крайние пузыри стояли аккуратными полукружиями — так пена не
        // выглядит нигде.
        //
        // Наружу пузырь может уехать только НЕМНОГО: сажают его по клетке, а
        // клетки живут строго на теле (cellOn). Дальше своего радиуса край
        // не уйдёт, и получается ровно то, что нужно, — мохнатая кромка.
        // Стоит ли точка холста на теле. Нужна пузырям: сажают их по клетке,
        // а клетка крупная, и центр большого пузыря может уехать за силуэт —
        // тогда он повиснет в воздухе отдельным колечком.
        const W = this.mask ? this.mask.width : 0;
        const H = this.mask ? this.mask.height : 0;
        const A = this.maskAlpha;
        const inside = A ? (px, py) => {
            const i = Math.round(px), j = Math.round(py);
            if (i < 0 || j < 0 || i >= W || j >= H) return false;
            return A[j * W + i] > 0;
        } : null;

        const paint = (part) => {
            for (let j = 0; j < G.ny; j++) {
                for (let i = 0; i < G.nx; i++) {
                    const idx = j * G.nx + i;
                    if (this.cellOn && !this.cellOn[idx]) continue;
                    const rubs = this.cells[idx] || 0;
                    const filmed = cloth ? (this.filmCells && this.filmCells[idx])
                                         : rubs > 0;
                    if (!rubs && !filmed) continue;
                    const x = (b.x + (i + 0.5) * cw - box.x) * k;
                    const y = (b.y + (j + 0.5) * ch - box.y) * k;
                    // На этапе мочалки клетка сначала показывает муть, а тёрки
                    // проступают поверх неё яркой пеной — тем и видно разницу.
                    if (filmed)
                        BATH_ART.washCell(ctx, 'soap', x, y, r, 1,
                                          idx * 7 + 3, part, inside);
                    if (cloth && rubs)
                        BATH_ART.washCell(ctx, 'cloth', x, y, r, rubs / need,
                                          idx * 13 + 91, part, inside);
                }
            }
        };

        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, B.w * S, B.h * S);
        paint('base');
        if (this.mask) {
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(this.mask, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
        }
        paint('foam');
    },

    wipeLather() {
        const n = this.el('bt-wash');
        // Переход снимается: его ставит конец забега «только помыть», и без
        // сброса следующий забег начинался бы с того, что пена медленно
        // проявляется из ниоткуда.
        if (n) { n.style.transition = ''; n.style.opacity = '1'; }
        if (this.washCtx) this.washCtx.clearRect(0, 0, n.width, n.height);
        this.filmCells = null;
    },

    // ---------- ВВОД ----------
    onDown(e) {
        if (this.win && this.win.isConfirmOpen && this.win.isConfirmOpen()) return;
        const p = this.toScene(e);
        const A = BATH_ART.slots();

        if (this.phase === 'idle') {
            // Душ включает воду — это и есть старт забега.
            if (Math.hypot(p.x - A.showerHead.x, p.y - A.showerHead.y) < 96)
                this.startWater();
            return;
        }
        if (this.phase === 'soap' || this.phase === 'cloth') {
            const kind = this.phase;
            if (Math.hypot(p.x - A[kind].x, p.y - A[kind].y) < 70) this.takeTool(kind, e);
            return;
        }
        if (this.phase === 'pop') { this.pop(p); return; }
        if (this.phase === 'rub') {
            this.drag = { kind: 'rub', t: null };
            this.rubMove(p);
            return;
        }
        // В финале палец не берёт предмет, а ДЕРЖИТ хвост: пока он на экране,
        // хвост стоит там, куда его увели, и тянется обратно, как только
        // палец убрали.
        if (this.phase === 'aim') { this.drag = { kind: 'tail' }; this.aimAt(p); }
        // В 'settle' управление уже отобрано: доигрываются капли.
    },

    onMove(e) {
        if (!this.drag) return;
        e.preventDefault();
        if (this.drag.kind === 'rub') { this.rubMove(this.toScene(e)); return; }
        if (this.drag.kind === 'tail') { this.aimAt(this.toScene(e)); return; }
        this.moveTool(this.toStage(e));

        const p = this.toScene(e);
        this.armHint();
        const C = this.cfg(), kind = this.drag.kind;
        const radius = this.stageRadius();

        // Мазок засчитывается не на каждое событие указателя, а раз в треть
        // радиуса пути: событий за забег приходят сотни, а клетка от них
        // всё равно меняется один раз.
        const last = this.drag.mark;
        if (last && Math.hypot(p.x - last.x, p.y - last.y) <= radius * 0.34) return;
        this.drag.mark = p;

        const share = this.paint(p.x, p.y, radius, this.stageNeed());
        if (this.dirty) { this.renderLather(); this.dirty = false; }
        // Пена копится НЕ ТОЛЬКО на черве: над будущим хвостом растёт горка.
        // Растёт она ровно по той же доле вытертого — игрок видит, что она
        // связана с его работой, а не появилась сама.
        if (kind === 'cloth')
            this.pileShow(share / Math.max(0.01, C.coverGoal || 0.92));
        if (share >= (C.coverGoal || 0.92)) this.finishStage(kind);
    },

    onUp() {
        if (!this.drag) return;
        this.bendHand = null;
        if (this.drag.kind !== 'tail' && this.drag.kind !== 'rub') {
            this.fgEl.innerHTML = '';
            this.showTools(true);
        }
        this.drag = null;
    },

    // ---------- ЭТАПЫ ----------
    // Душ включён — и больше не выключается. Раньше здесь наливалась ванна:
    // рос уровень воды, обрезка ползла снизу вверх. С фронтальной камерой
    // нутра чаши не видно вовсе, наливать некуда и нечего показывать — вода
    // теперь просто ИДЁТ ИЗ ЛЕЙКИ, а забег начинается сразу.
    startWater() {
        this.phase = 'rinse';
        this.syncShopButton();
        // Играется ли забег НА ЖЕТОН — решается в момент, когда полилась вода,
        // и дальше не меняется. У похоти награда на своём таймере, и если он
        // ещё не истёк, червя только моют: хвоста, пузырей и финала не будет
        // (docs/plan/21-lust-bath.md, разд. 7а). Решать в конце мытья
        // нельзя: горка пены над хвостом копится ВО ВРЕМЯ мочалки, и её
        // надо либо строить, либо нет с самого начала.
        this.paidRun = (typeof Backend === 'undefined') || Backend.sinPays('lust');
        // Душ смывает всё, что осталось от прошлого забега в этот же заход.
        if (typeof LustGoo !== 'undefined') LustGoo.reset();
        this.ready(null);
        this.setOpacity('bt-rain-far', 1);
        this.setOpacity('bt-rain-near', 1);
        this.setOpacity('bt-rain-veil', 1);
        // Наезд ОДНОВРЕМЕННО с водой и ПЛАВНЫЙ: игра начинается с общего
        // плана, где видно всю комнату, и камера сама подъезжает к участку,
        // на котором идёт работа. Скачок читался сменой сцены — как будто
        // открыли другую игру, а не подошли ближе.
        this.setCamera('body', 900);
        const t0 = performance.now();
        const DUR = 900;      // ровно чтобы заметить, что полилось
        const step = (t) => {
            if (t - t0 < DUR) { this.fillRaf = requestAnimationFrame(step); return; }
            this.fillRaf = 0;
            this.phase = 'soap';
            this.resetCover();
            this.ready('soap');
            this.armHint();
        };
        this.fillRaf = requestAnimationFrame(step);
    },

    takeTool(kind, e) {
        this.drag = { kind };
        this.showTools(false, kind);
        this.ready(null);
        this.fgEl.innerHTML =
            `<g id="bt-held">${BATH_ART.held(kind, this.cam ? this.cam.s : 1)}</g>`;
        this.moveTool(this.toStage(e));
    },

    // Предмет в руке живёт в координатах ХОЛСТА: его держат перед собой, и
    // камере он не подчиняется.
    moveTool(p) {
        const held = this.el('bt-held');
        if (held) held.setAttribute('transform',
            `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    },

    showTools(show, except) {
        for (const k of ['soap', 'cloth']) {
            const n = this.el(`bt-${k}-home`);
            if (n) n.style.opacity = (show || k !== except) ? '1' : '0';
        }
    },

    finishStage(kind) {
        this.onUp();
        this.clearHint();
        if (kind === 'soap') {
            // Горка пены над будущим хвостом собирается ЗАРАНЕЕ, пока червя
            // трут мочалкой. К моменту, когда хвост всплывает, она уже
            // непроницаема, и его появления не видно.
            if (this.paidRun) this.buildPile();
            // Мочалка снимает мыло и оставляет пену: муть гасится, чтобы
            // второй этап был виден.
            // Что намылено — запоминается: на этапе мочалки это фон, по
            // которому видно, где пена уже проступила, а где ещё нет.
            this.filmCells = this.cells.slice();
            this.phase = 'cloth';
            this.resetCover();
            this.renderLather();
            this.ready('cloth');
            this.armHint();
            return;
        }
        if (this.paidRun) this.raiseTail();
        else this.finishWash();
    },

    // ---------- ЗАБЕГ «ТОЛЬКО ПОМЫТЬ» ----------
    // Награда ещё не готова — червя вымыли, и на этом всё. Сказано без
    // единого слова (инвариант 9): вода выключается, пена сходит с тела,
    // камера отъезжает на общий план, кнопка магазина возвращается. Хвост не
    // всплывает — ширмы над ним и не копилось.
    //
    // Шкала потребности закрывается, как после любого захода: червь чистый.
    // Таймер награды НЕ тратится (rewards.lust.wash без claimsReward).
    finishWash() {
        this.phase = 'done';
        this.stopClocks();
        this.ready(null);
        this.setOpacity('bt-rain-far', 0);
        this.setOpacity('bt-rain-near', 0);
        this.setOpacity('bt-rain-veil', 0);
        const wash = this.el('bt-wash');
        if (wash) {
            wash.style.transition = 'opacity 1.2s ease';
            wash.style.opacity = '0';
        }
        this.setCamera('overview', 900);
        GameEvents.emit('minigame:result', {
            sin: 'lust', mode: 'wash', outcome: 'win', meta: { wash: true }
        });
        this.syncShopButton();
    },

    // ---------- ПОДСКАЗКА: ГДЕ НЕ ДОМЫЛИ ----------
    // Порог 92% без подсказки превращается в поиск пикселя: игрок водит
    // пальцем и не понимает, почему этап не кончается (план, §1). Кольцо
    // показывается на самой недомытой клетке — без слов и без стрелок.
    armHint() {
        this.clearHint();
        if (this.phase !== 'soap' && this.phase !== 'cloth') return;
        this.hintTimer = setTimeout(() => this.showHint(), this.cfg().hintMs || 2200);
    },

    clearHint() {
        clearTimeout(this.hintTimer);
        this.hintTimer = 0;
        const n = this.el('bt-spot');
        if (n) n.innerHTML = '';
    },

    showHint() {
        const b = this.coverBox(), G = this.grid(), need = this.stageNeed();
        let worst = -1, worstVal = need;
        for (let k = 0; k < this.cells.length; k++) {
            if (this.cellOn && !this.cellOn[k]) continue;   // мимо тела мылить нечего
            if (this.cells[k] < worstVal) { worstVal = this.cells[k]; worst = k; }
        }
        if (worst < 0) return;
        const i = worst % G.nx, j = (worst / G.nx) | 0;
        const x = b.x + (i + 0.5) * b.w / G.nx;
        const y = b.y + (j + 0.5) * b.h / G.ny;
        this.el('bt-spot').innerHTML = BATH_ART.spot(x, y, 26);
    },
});
