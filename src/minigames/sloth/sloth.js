// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ЛЕНИ (САД) =================
// Полноэкранное окно (формат остальных крупных мини-игр), атмосферная
// сцена сада (облака, многослойные холмы, керамический горшок) и
// генерация/отрисовка растения, полностью переработанная на основе
// структурной модели PlantModel (см. plant-model.js — трейты, типы
// стебля, план листьев) и рендерера ниже (PlantRenderer-часть этого
// объекта — по аналогии с парой worm-model.js/worm-renderer.js).
//
// Ключевые исправления по сравнению с прошлой версией (по фидбэку):
// 1) Растение "пропадало" за какой-то границей — canvas растения был
//    зажат в узкую ширину самого горшка (.pot-wrap было 42% ширины
//    сцены), и при сильном наклоне/изгибе часть стебля/листьев
//    рисовалась за пределами пиксельного холста и просто не попадала
//    в кадр (не CSS-обрезка, а обрезка краем canvas). Исправлено: сцена
//    роста (.pot-wrap) расширена, плюс жёсткий программный клэмп
//    координат в stemPointAt() как гарантия на любом экране.
// 2) Стебель у земли выглядел "обрубленным"/приклеенным поверх сцены —
//    потому что ВЕСЬ стебель (включая самое основание) сразу рисовался
//    под общим углом наклона. Исправлено: стебель теперь всегда
//    стартует СТРОГО ВЕРТИКАЛЬНО из земли (корневой участок rootLen) и
//    только выше плавно уходит в наклон/изгиб — плюс добавлено
//    "корневое расширение" (rootFlare/rootBumps) у самой почвы, чтобы
//    основание визуально вросло в горшок, а не обрывалось линией.
// 3) Листья росли "все с одной стороны" — они крепились не к реальной
//    кривой стебля, а к прямой линии между основанием и верхушкой
//    (короткий путь), из-за чего на изогнутых/наклонных стеблях
//    смещались визуально в одну сторону от настоящего стебля.
//    Исправлено: точки крепления листьев теперь считаются той же самой
//    функцией stemPointAt(), что рисует сам стебель, плюс сторона
//    выбирается алгоритмом из PlantModel.buildLeafPlan(), который
//    гарантирует чередование (не более 1 повтора подряд) и равномерное
//    распределение по высоте без наложений.
const SlothMinigame = {
    screenElement: null,
    closeBtn: null,
    potWrap: null,
    plantCanvas: null,
    weedsLayer: null,
    fruitSpot: null,
    fruitEmoji: null,
    footer: null,

    tools: {},

    // Линия почвы в координатах canvas (0..1 от высоты pot-wrap) — должна совпадать с .pot-rim/.pot-soil в CSS.
    // Считается от ВЫСОКОЙ сцены роста (#pot-wrap): 0.56 + 0.40*0.44 = 0.736
    // (см. подробный комментарий в sloth.css рядом с .pot-visual).
    soilLineRatio: 0.736,

    order: ['seed', 'water', 'fert', 'rake'],
    stepIndex: 0,
    growth: 0,
    plant: null,
    weedEls: [],
    busy: false,
    finished: false,

    // Непрерывное лёгкое покачивание стебля на ветру, пока мини-игра
    // открыта — работает через собственный rAF-цикл, независимый от
    // цикла роста (animateGrowth). Управляется токеном-поколением
    // (idleSwayGen, тот же паттерн, что spinGeneration в greed.js), а НЕ
    // общим булевым флагом — иначе при быстром close()+open() в течение
    // одного кадра "устаревший" цикл от предыдущей сессии мог бы снова
    // считать себя активным и продолжить тикать ВТОРЫМ циклом параллельно
    // новому. Токен захватывается в замыкании при СОЗДАНИИ цикла, поэтому
    // любой close() (инкремент) гарантированно "хоронит" все старые циклы.
    idleSwayGen: 0,
    swayOffsetDeg: 0,

    footerText: {
        seed: 'ПЕРЕТАЩИ ПАКЕТИК С СЕМЕНЕМ НА ГОРШОК',
        water: 'ПЕРЕТАЩИ ЛЕЙКУ НА ГОРШОК',
        fert: 'ПЕРЕТАЩИ УДОБРЕНИЕ НА ГОРШОК',
        rake: 'ПЕРЕТАЩИ ТЯПКУ, ЧТОБЫ УБРАТЬ СОРНЯКИ',
        fruit: 'СОБЕРИ ПЛОД'
    },

    init() {
        this.screenElement = document.getElementById('sloth-game');
        this.closeBtn = document.getElementById('sloth-close-btn');
        this.potWrap = document.getElementById('pot-wrap');
        this.plantCanvas = document.getElementById('plant-canvas');
        this.weedsLayer = document.getElementById('weeds-layer');
        this.fruitSpot = document.getElementById('fruit-spot');
        this.fruitEmoji = document.getElementById('fruit-emoji');
        this.footer = document.getElementById('sloth-footer');

        this.tools = {
            seed: document.getElementById('tool-seed'),
            water: document.getElementById('tool-can'),
            fert: document.getElementById('tool-fert'),
            rake: document.getElementById('tool-rake')
        };

        if (this.closeBtn) {
            this.closeBtn.onclick = (e) => { e.stopPropagation(); this.close(); };
        }

        Object.keys(this.tools).forEach(key => {
            const el = this.tools[key];
            if (!el) return;
            el.addEventListener('pointerdown', (e) => this.startDrag(key, el, e));
        });

        if (this.fruitSpot) {
            this.fruitSpot.onclick = (e) => {
                e.stopPropagation();
                if (this.fruitSpot.classList.contains('ready')) this.pickFruit();
            };
        }

        window.addEventListener('resize', () => this.drawPlant());
    },

    open() {
        if (!this.screenElement) this.init();
        this.screenElement.classList.add('active');
        this.resetState();
        requestAnimationFrame(() => this.drawPlant());
        this.startIdleSway();
    },

    close() {
        if (this.screenElement) this.screenElement.classList.remove('active');
        this.idleSwayGen++; // хоронит текущий (и любой ещё не всплывший старый) цикл покачивания
    },

    resetState() {
        this.stepIndex = 0;
        this.growth = 0;
        this.busy = false;
        this.finished = false;
        this.swayOffsetDeg = 0;

        this.weedEls.forEach(w => w.remove());
        this.weedEls = [];

        if (this.fruitSpot) {
            this.fruitSpot.classList.remove('ready', 'picked');
            this.fruitSpot.style.left = '50%';
            this.fruitSpot.style.top = `${this.soilLineRatio * 100 - 8}%`;
        }

        // Вся генерация трейтов и плана листьев — в PlantModel (структурная
        // модель растения, см. plant-model.js). Здесь мы её только вызываем.
        this.plant = PlantModel.generate();

        this.updateActiveTool();
    },

    updateActiveTool() {
        const currentKey = this.order[this.stepIndex];
        Object.keys(this.tools).forEach(key => {
            const el = this.tools[key];
            if (!el) return;
            el.classList.toggle('active', key === currentKey && !this.finished);
        });
        if (this.footer) {
            this.footer.textContent = this.finished ? this.footerText.fruit : (this.footerText[currentKey] || '');
        }
    },

    // ---------- DRAG & DROP ----------
    startDrag(key, el, e) {
        if (!el.classList.contains('active') || this.busy) return;
        e.preventDefault();

        const startRect = el.getBoundingClientRect();
        el.setPointerCapture(e.pointerId);

        const offsetX = e.clientX - startRect.left;
        const offsetY = e.clientY - startRect.top;

        el.classList.remove('returning');
        el.classList.add('dragging');
        el.style.left = `${startRect.left}px`;
        el.style.top = `${startRect.top}px`;

        const onMove = (ev) => {
            el.style.left = `${ev.clientX - offsetX}px`;
            el.style.top = `${ev.clientY - offsetY}px`;
        };

        const onUp = (ev) => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.classList.remove('dragging');

            const potRect = this.potWrap.getBoundingClientRect();
            const dropped =
                ev.clientX >= potRect.left && ev.clientX <= potRect.right &&
                ev.clientY >= potRect.top && ev.clientY <= potRect.bottom;

            el.classList.add('returning');
            setTimeout(() => {
                el.style.left = '';
                el.style.top = '';
                el.classList.remove('returning');
            }, 50);

            if (dropped) this.handleDrop(key);
        };

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
    },

    handleDrop(key) {
        if (this.busy || key !== this.order[this.stepIndex]) return;
        this.busy = true;

        if (key === 'seed') this.stepSeed();
        else if (key === 'water') this.stepWater();
        else if (key === 'fert') this.stepFert();
        else if (key === 'rake') this.stepRake();
    },

    stepSeed() {
        // Сразу заметный росток, а не точка
        this.animateGrowth(0, 0.22, 400, () => this.advanceStep());
    },

    stepWater() {
        this.spawnDrops();
        setTimeout(() => {
            this.animateGrowth(this.growth, 0.45, 750, () => this.advanceStep());
        }, 250);
    },

    stepFert() {
        this.animateGrowth(this.growth, 0.8, 850, () => {
            this.spawnWeeds();
            this.advanceStep();
        });
    },

    stepRake() {
        this.removeWeeds(() => {
            this.animateGrowth(this.growth, 1, 750, () => {
                this.finished = true;
                this.updateActiveTool();
                this.showFruit();
                this.busy = false;
            });
        });
    },

    advanceStep() {
        this.stepIndex++;
        this.updateActiveTool();
        this.busy = false;
    },

    // Лёгкий "отскок" в конце роста — делает анимацию заметной без лишней сложности
    easeOutBack(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },

    animateGrowth(from, to, duration, onDone) {
        const start = performance.now();
        const step = (now) => {
            const rawT = Math.min(1, (now - start) / duration);
            const eased = this.easeOutBack(rawT);
            this.growth = from + (to - from) * eased;
            this.drawPlant();
            if (rawT < 1) {
                requestAnimationFrame(step);
            } else {
                this.growth = to;
                this.drawPlant();
                if (onDone) onDone();
            }
        };
        requestAnimationFrame(step);
    },

    // ---------- НЕПРЕРЫВНОЕ ЛЁГКОЕ ПОКАЧИВАНИЕ НА ВЕТРУ ----------
    startIdleSway() {
        const gen = ++this.idleSwayGen; // инвалидирует любой ранее запущенный цикл
        const AMPLITUDE_DEG = 2.6;
        const PERIOD_MS = 4200;
        const loop = () => {
            if (gen !== this.idleSwayGen) return; // этот цикл устарел — новее close()/open() уже был
            this.swayOffsetDeg = Math.sin((performance.now() / PERIOD_MS) * Math.PI * 2) * AMPLITUDE_DEG;
            this.drawPlant();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    },

    // ---------- ЦВЕТОВЫЕ УТИЛИТЫ ----------
    shadeColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        let r = (num >> 16) + Math.round(2.55 * percent);
        let g = ((num >> 8) & 0x00FF) + Math.round(2.55 * percent);
        let b = (num & 0x0000FF) + Math.round(2.55 * percent);
        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));
        return `rgb(${r}, ${g}, ${b})`;
    },

    // =====================================================================
    // ---------- РЕНДЕРЕР СТЕБЛЯ (аналог worm-renderer.js для плана PlantModel) ----------
    // =====================================================================

    // Точка на кубической кривой Безье при параметре t (0..1).
    cubicPoint(p0, p1, p2, p3, t) {
        const mt = 1 - t;
        const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
        return {
            x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
            y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
        };
    },

    // Касательная (производная) той же кривой — нужна, чтобы построить
    // перпендикулярное направление для ширины стебля и для угла крепления листьев.
    cubicTangent(p0, p1, p2, p3, t) {
        const mt = 1 - t;
        return {
            x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
            y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
        };
    },

    // ЕДИНАЯ геометрия стебля — контрольные точки кубической кривой,
    // построенные по трейтам this.plant. P0 (земля) -> P1 (строго над P0,
    // задаёт вертикальный "корневой" старт) -> P2/P3 (изгиб и наклон,
    // зависят от stemType). Используется и для отрисовки, и для позиции
    // плода/сорняков — единственный источник правды о форме стебля.
    getStemGeometry() {
        const canvas = this.plantCanvas;
        const w = canvas.clientWidth || 150;
        const h = canvas.clientHeight || 220;
        const p = this.plant;
        const stemDef = PlantModel.STEM_TYPES[p.stemType] || PlantModel.STEM_TYPES.straight;

        const baseX = w / 2;
        const baseY = h * this.soilLineRatio + 6;

        const topPadding = h * 0.07;
        const maxStemLen = Math.max(20, baseY - topPadding);
        const stemLen = this.growth > 0
            ? Math.max(16, maxStemLen * p.heightFrac * this.growth)
            : 0;

        const tiltRad = ((p.tilt + this.swayOffsetDeg) * Math.PI) / 180;

        // Жёсткий предел бокового отклонения от центра — гарантия того,
        // что стебель/листья никогда не уйдут за пределы пиксельного
        // холста, независимо от случайных трейтов и размера экрана.
        const lateralMax = w * 0.40;
        let lateral = Math.sin(tiltRad) * stemLen + p.curve * stemLen * stemDef.curveMul;
        lateral = Math.max(-lateralMax, Math.min(lateralMax, lateral));

        // Стебель ВСЕГДА начинает расти строго вверх на первом участке
        // (rootLen) — только выше он уходит в наклон/изгиб. Это убирает
        // эффект "обрубленного"/приклеенного основания.
        const rootLen = stemLen * 0.22;

        const P0 = { x: baseX, y: baseY };
        const P1 = { x: baseX, y: baseY - rootLen };
        const P2 = { x: baseX + lateral * 0.72, y: baseY - stemLen * 0.62 };
        const P3 = { x: baseX + lateral, y: baseY - stemLen };

        const geo = { w, h, baseX, baseY, stemLen, rootLen, tiltRad, lateral, stemDef, P0, P1, P2, P3 };

        // Финальная точка верхушки — считается той же функцией, что и
        // всё остальное (с учётом волнового смещения и клэмпа), чтобы
        // цветок/плод всегда сидели ровно на конце нарисованной кривой.
        const tip = this.stemPointAt(geo, 1);
        geo.tipX = tip.x;
        geo.tipY = tip.y;

        return geo;
    },

    // Точка НА РЕАЛЬНО ОТРИСОВАННОЙ кривой стебля в доле t (0..1), с учётом
    // волнового рисунка (zigzag/spiral типы) и с клэмпом по X в пределах
    // холста. Возвращает и единичную нормаль (nx, ny) — перпендикуляр к
    // касательной, нужен и для ширины стебля, и для угла крепления листа.
    // ЭТО ЕДИНСТВЕННОЕ место, вычисляющее точки стебля — раньше стебель
    // рисовался по этой кривой, а листья крепились к ПРЯМОЙ линии
    // база->верхушка, из-за чего на изогнутых стеблях они "съезжали" в
    // одну сторону от настоящего стебля.
    stemPointAt(geo, t) {
        const { P0, P1, P2, P3, stemDef, stemLen, w } = geo;
        const pt = this.cubicPoint(P0, P1, P2, P3, t);
        const tan = this.cubicTangent(P0, P1, P2, P3, t);
        const tlen = Math.hypot(tan.x, tan.y) || 1;
        const nx = -tan.y / tlen;
        const ny = tan.x / tlen;

        let x = pt.x, y = pt.y;

        if (stemDef.wobbleAmp > 0) {
            // Амплитуда волны растёт от 0 у земли к максимуму у верхушки —
            // сама "волна"/"излом" не портит натуральный вертикальный старт.
            const wob = stemDef.wobbleAmp * Math.sin(t * Math.PI * stemDef.wobbleFreq * 2 + (this.plant.wobblePhase || 0)) * stemLen * 0.11 * t;
            x += nx * wob;
            y += ny * wob;
        }

        const marginX = w * 0.05;
        if (x < marginX) x = marginX;
        if (x > w - marginX) x = w - marginX;

        return { x, y, nx, ny };
    },

    // Ширина стебля (полная, не радиус) в доле t — сужается от основания к
    // верхушке, плюс локальное "корневое расширение" у самой земли (rootFlare).
    widthAt(t, baseThickness, tipThickness, p) {
        let width = baseThickness + (tipThickness - baseThickness) * t;
        if (t < 0.14) {
            const flareT = 1 - t / 0.14;
            width += baseThickness * (p.rootFlare - 1) * flareT * 0.5;
        }
        return width;
    },

    // ---------- ОТРИСОВКА РАСТЕНИЯ ----------
    drawPlant() {
        const canvas = this.plantCanvas;
        if (!canvas) return;
        const w = canvas.clientWidth || 150;
        const h = canvas.clientHeight || 220;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        if (this.growth <= 0 || !this.plant) return;

        const p = this.plant;
        const geo = this.getStemGeometry();

        const baseThickness = Math.max(6, 6 + p.thickness * 7.5 * this.growth);
        const tipThickness = Math.max(1.5, baseThickness * 0.2);

        // ---- Корневое расширение: основание визуально врастает в почву ----
        this.drawRootFlare(ctx, geo, p, baseThickness);

        // ---- Стебель: сужающийся объёмный силуэт по кубической кривой ----
        const SAMPLES = 22;
        const left = [];
        const right = [];
        for (let i = 0; i <= SAMPLES; i++) {
            const t = i / SAMPLES;
            const sp = this.stemPointAt(geo, t);
            const halfW = this.widthAt(t, baseThickness, tipThickness, p) / 2;
            left.push({ x: sp.x + sp.nx * halfW, y: sp.y + sp.ny * halfW });
            right.push({ x: sp.x - sp.nx * halfW, y: sp.y - sp.ny * halfW });
        }

        ctx.save();
        ctx.shadowColor = 'rgba(20, 15, 5, 0.3)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 2;

        const stemGrad = ctx.createLinearGradient(geo.baseX - baseThickness, 0, geo.baseX + baseThickness, 0);
        stemGrad.addColorStop(0, `hsl(${p.hue}, ${p.satBase}%, ${Math.max(12, p.lightBase - 8)}%)`);
        stemGrad.addColorStop(0.45, `hsl(${p.hue}, ${p.satBase}%, ${p.lightBase + 6}%)`);
        stemGrad.addColorStop(0.7, `hsl(${p.hue}, ${Math.min(70, p.satBase + 8)}%, ${p.lightBase + 16}%)`);
        stemGrad.addColorStop(1, `hsl(${p.hue}, ${p.satBase}%, ${Math.max(14, p.lightBase - 4)}%)`);

        ctx.beginPath();
        ctx.moveTo(left[0].x, left[0].y);
        for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
        for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
        ctx.closePath();
        ctx.fillStyle = stemGrad;
        ctx.fill();
        ctx.strokeStyle = `hsl(${p.hue}, ${p.satBase}%, ${Math.max(10, p.lightBase - 12)}%)`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // ---- Листья: точки крепления и стороны — из плана PlantModel ----
        for (const leaf of p.leaves) {
            const revealAt = leaf.t * 0.78;
            if (this.growth < revealAt) continue;
            const localGrowth = Math.min(1, (this.growth - revealAt) / 0.22);
            if (localGrowth <= 0) continue;

            const sp = this.stemPointAt(geo, leaf.t);
            const halfW = this.widthAt(leaf.t, baseThickness, tipThickness, p) / 2;
            const nx = sp.nx * leaf.side;
            const ny = sp.ny * leaf.side;

            // Черешок листа выносит точку крепления НА поверхность стебля
            // (а не в его центр) — лист явно "растёт из" стебля, а не
            // проваливается внутрь него.
            const originX = sp.x + nx * halfW * 0.55 * leaf.distScale;
            const originY = sp.y + ny * halfW * 0.55 * leaf.distScale;
            const angle = Math.atan2(ny, nx) + leaf.angleVar;

            const sizeMul = p.leafSizeBase * leaf.sizeScale * localGrowth;
            const leafLen = Math.max(4, (11 + p.thickness * 7) * sizeMul);
            const leafWide = leafLen * 0.56;
            const hue = p.hue + leaf.hueShift;

            this.drawLeaf(ctx, originX, originY, angle, leafLen, leafWide, p.leafShape, hue, Math.round(leaf.t * 10) + 20);
        }

        // Цветок на верхушке при почти полном росте
        if (this.growth > 0.9) {
            const bloom = Math.min(1, (this.growth - 0.9) / 0.1);
            this.drawFlower(ctx, geo.tipX, geo.tipY, bloom, p);
        }
    },

    // "Корневое" расширение у основания — мягкое радиальное пятно цвета
    // стебля (гораздо темнее, почти сливается с почвой) плюс несколько
    // нерегулярных бугорков вокруг него, чтобы граница стебель/земля не
    // читалась как ровный обрубленный овал.
    drawRootFlare(ctx, geo, p, baseThickness) {
        const flareW = baseThickness * p.rootFlare;
        const flareH = flareW * 0.4;

        ctx.save();
        ctx.translate(geo.P0.x, geo.P0.y);

        const grad = ctx.createRadialGradient(0, -flareH * 0.25, 0, 0, 0, flareW * 0.8);
        grad.addColorStop(0, `hsl(${p.hue}, ${p.satBase}%, ${Math.max(9, p.lightBase - 10)}%)`);
        grad.addColorStop(1, 'rgba(20, 14, 8, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, flareW * 0.65, flareH, 0, 0, Math.PI * 2);
        ctx.fill();

        p.rootBumps.forEach(b => {
            const bx = Math.cos(b.angle) * flareW * b.dist * 0.55;
            const by = Math.abs(Math.sin(b.angle)) * flareH * b.dist * 0.4;
            ctx.beginPath();
            ctx.ellipse(bx, by * 0.5, flareW * b.r * 0.5, flareH * b.r * 0.6, 0, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${p.hue}, ${p.satBase}%, ${Math.max(7, p.lightBase - 14)}%, 0.75)`;
            ctx.fill();
        });

        ctx.restore();
    },

    // Рисует один лист заданной формы с прожилками, лёгкой тенью и
    // градиентной заливкой (у основания темнее, к краю — светлее/ярче).
    drawLeaf(ctx, lx, ly, angle, leafLen, leafWide, shape, hue, index) {
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(angle);
        ctx.shadowColor = 'rgba(15, 10, 5, 0.28)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        ctx.beginPath();
        if (shape === 'pointed') {
            // Вытянутый заострённый лист — узкие "плечи", резкий кончик
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(leafLen * 0.32, -leafWide * 0.42, leafLen, 0);
            ctx.quadraticCurveTo(leafLen * 0.32, leafWide * 0.42, 0, 0);
        } else if (shape === 'heart') {
            // Лист с небольшой выемкой у основания (два лепестка у черешка)
            const notch = leafWide * 0.14;
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(leafLen * 0.18, -notch, leafLen * 0.42, -leafWide * 0.62);
            ctx.quadraticCurveTo(leafLen * 0.95, -leafWide * 0.3, leafLen, 0);
            ctx.quadraticCurveTo(leafLen * 0.95, leafWide * 0.3, leafLen * 0.42, leafWide * 0.62);
            ctx.quadraticCurveTo(leafLen * 0.18, notch, 0, 0);
        } else if (shape === 'fern') {
            // Перистый лист — центральная ость с чередующимися дольками
            const segs = 5;
            ctx.moveTo(0, 0);
            for (let s = 1; s <= segs; s++) {
                const t = s / segs;
                const sx = leafLen * t;
                const sw = leafWide * 0.5 * Math.sin(Math.PI * t) + leafWide * 0.06;
                ctx.quadraticCurveTo(sx - leafLen * 0.06, -sw, sx, -leafWide * 0.05);
            }
            ctx.lineTo(leafLen, 0);
            for (let s = segs; s >= 1; s--) {
                const t = s / segs;
                const sx = leafLen * t;
                const sw = leafWide * 0.5 * Math.sin(Math.PI * t) + leafWide * 0.06;
                ctx.quadraticCurveTo(sx - leafLen * 0.06, sw, sx - leafLen / segs, leafWide * 0.05 * (s % 2 === 0 ? 1 : 0.4));
            }
            ctx.lineTo(0, 0);
        } else {
            // oval — классическая форма капли (по умолчанию)
            ctx.quadraticCurveTo(leafLen * 0.4, -leafWide * 0.6, leafLen, 0);
            ctx.quadraticCurveTo(leafLen * 0.4, leafWide * 0.6, 0, 0);
        }
        ctx.closePath();

        const leafGrad = ctx.createLinearGradient(0, -leafWide * 0.6, leafLen, leafWide * 0.6);
        leafGrad.addColorStop(0, `hsl(${hue}, 42%, ${26 + (index % 12)}%)`);
        leafGrad.addColorStop(0.55, `hsl(${hue}, 58%, ${40 + (index % 12) * 1.4}%)`);
        leafGrad.addColorStop(1, `hsl(${hue + 6}, 62%, ${50 + (index % 12)}%)`);
        ctx.fillStyle = leafGrad;
        ctx.fill();
        ctx.strokeStyle = `hsl(${hue}, 45%, 22%)`;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // без тени для прожилок — они должны читаться поверх листа, не под ним
        ctx.shadowColor = 'transparent';

        if (shape !== 'fern') {
            // Центральная прожилка
            ctx.beginPath();
            ctx.moveTo(2, 0);
            ctx.lineTo(leafLen - 2, 0);
            ctx.strokeStyle = `hsla(${hue}, 40%, 18%, 0.55)`;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Пара боковых прожилок для более "настоящего" вида листа
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(leafLen * 0.3, 0);
                ctx.quadraticCurveTo(leafLen * 0.5, s * leafWide * 0.18, leafLen * 0.68, s * leafWide * 0.32);
                ctx.strokeStyle = `hsla(${hue}, 40%, 18%, 0.35)`;
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }
        }

        ctx.restore();
    },

    // Слоистый цветок: N лепестков-капель с радиальным градиентом
    // (тёмное основание → светлый кончик) вместо плоских кружков, плюс
    // мягкое свечение-ореол и текстурированная сердцевина.
    drawFlower(ctx, tipX, tipY, bloom, p) {
        const petalLen = (13 + p.thickness * 2.4) * bloom;
        const petalWide = petalLen * 0.52;
        const petalColorLight = this.shadeColor(p.flowerColor, 28);
        const petalColorDark = this.shadeColor(p.flowerColor, -22);

        ctx.save();
        ctx.translate(tipX, tipY);

        // Мягкий ореол за цветком
        const glowR = petalLen * 2.1;
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
        glow.addColorStop(0, `${p.flowerColor}55`);
        glow.addColorStop(1, `${p.flowerColor}00`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, glowR, 0, Math.PI * 2);
        ctx.fill();

        const count = p.petalCount || 6;
        for (let k = 0; k < count; k++) {
            const ang = (Math.PI * 2 * k) / count;
            ctx.save();
            ctx.rotate(ang);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(petalLen * 0.35, -petalWide * 0.5, petalLen, 0);
            ctx.quadraticCurveTo(petalLen * 0.35, petalWide * 0.5, 0, 0);
            ctx.closePath();
            const petalGrad = ctx.createLinearGradient(0, 0, petalLen, 0);
            petalGrad.addColorStop(0, petalColorDark);
            petalGrad.addColorStop(1, petalColorLight);
            ctx.fillStyle = petalGrad;
            ctx.fill();
            ctx.restore();
        }

        // Сердцевина с текстурой (несколько точек "пыльцы")
        const coreR = petalLen * 0.42;
        const coreGrad = ctx.createRadialGradient(-coreR * 0.3, -coreR * 0.3, 0, 0, 0, coreR);
        coreGrad.addColorStop(0, '#fff8d0');
        coreGrad.addColorStop(1, '#e8b93a');
        ctx.beginPath();
        ctx.arc(0, 0, coreR, 0, Math.PI * 2);
        ctx.fillStyle = coreGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(140, 100, 10, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();

        for (let d = 0; d < 5; d++) {
            const dAng = Math.random() * Math.PI * 2;
            const dDist = Math.random() * coreR * 0.6;
            ctx.beginPath();
            ctx.arc(Math.cos(dAng) * dDist, Math.sin(dAng) * dDist, coreR * 0.08, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(140, 100, 10, 0.4)';
            ctx.fill();
        }

        ctx.restore();
    },

    // ---------- КАПЛИ ВОДЫ ----------
    spawnDrops() {
        for (let i = 0; i < 6; i++) {
            setTimeout(() => {
                const drop = document.createElement('div');
                drop.className = 'water-drop';
                drop.style.left = `${40 + Math.random() * 20}%`;
                drop.style.top = `10%`;
                this.potWrap.appendChild(drop);
                setTimeout(() => drop.remove(), 550);
            }, i * 60);
        }
    },

    // ---------- СОРНЯКИ ----------
    spawnWeeds() {
        const count = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            const weed = document.createElement('div');
            weed.className = 'weed';
            const leftPct = 30 + Math.random() * 40;
            weed.style.left = `${leftPct}%`;
            weed.style.top = `${this.soilLineRatio * 100 + 6}%`;
            weed.innerHTML = `
                <svg viewBox="0 0 14 22" width="100%" height="100%">
                    <path d="M7 22 Q3 12 1 2" stroke="hsl(100,40%,30%)" stroke-width="2" fill="none"/>
                    <path d="M7 22 Q11 12 13 2" stroke="hsl(90,40%,26%)" stroke-width="2" fill="none"/>
                    <path d="M7 22 Q7 10 7 0" stroke="hsl(95,45%,34%)" stroke-width="2" fill="none"/>
                </svg>`;
            this.weedsLayer.appendChild(weed);
            this.weedEls.push(weed);
            requestAnimationFrame(() => weed.classList.add('shown'));
        }
    },

    removeWeeds(onDone) {
        if (this.weedEls.length === 0) { onDone(); return; }
        this.weedEls.forEach(w => w.classList.add('removing'));
        setTimeout(() => {
            this.weedEls.forEach(w => w.remove());
            this.weedEls = [];
            onDone();
        }, 320);
    },

    // ---------- ФИНАЛ ----------
    showFruit() {
        if (!this.fruitSpot) return;

        const geo = this.getStemGeometry();
        const leftPct = Math.min(82, Math.max(18, (geo.tipX / geo.w) * 100));
        const topPct = Math.min(72, Math.max(8, (geo.tipY / geo.h) * 100));

        this.fruitSpot.style.left = `${leftPct}%`;
        this.fruitSpot.style.top = `${topPct}%`;
        if (this.fruitEmoji) this.fruitEmoji.textContent = this.plant.fruitIcon;

        this.fruitSpot.classList.add('ready');
    },

    pickFruit() {
        if (this.finished !== true) return;
        this.finished = 'done';
        this.fruitSpot.classList.remove('ready');
        this.fruitSpot.classList.add('picked');

        this.showWinAnimation();

        if (typeof GameManager !== 'undefined') {
            GameManager.sins.sloth.value = 100;
            GameManager.updateUI();
        }

        setTimeout(() => this.close(), 2200);
    },

    showWinAnimation() {
        let overlay = document.getElementById('sloth-win-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sloth-win-overlay';
            overlay.className = 'sloth-win-overlay';
            overlay.innerHTML = `<div class="sloth-win-text">Урожай собран!</div>`;
            this.screenElement.querySelector('.sloth-modal').appendChild(overlay);
        }
        overlay.classList.remove('fade-out');
        overlay.classList.add('show');
        setTimeout(() => overlay.classList.add('fade-out'), 1400);
        setTimeout(() => overlay.classList.remove('show', 'fade-out'), 2200);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SlothMinigame.init());
} else {
    SlothMinigame.init();
}
