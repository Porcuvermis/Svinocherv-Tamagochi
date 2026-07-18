// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ЛЕНИ (САД) =================
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

    // Линия почвы в координатах canvas (0..1 от высоты pot-wrap) — должна совпадать с .pot-rim/.pot-soil в CSS
    soilLineRatio: 0.40,

    order: ['seed', 'water', 'fert', 'rake'],
    stepIndex: 0,
    growth: 0,
    plant: null,
    weedEls: [],
    busy: false,
    finished: false,

    footerText: {
        seed: 'ПЕРЕТАЩИ ПАКЕТИК С СЕМЕНЕМ НА ГОРШОК',
        water: 'ПЕРЕТАЩИ ЛЕЙКУ НА ГОРШОК',
        fert: 'ПЕРЕТАЩИ УДОБРЕНИЕ НА ГОРШОК',
        rake: 'ПЕРЕТАЩИ ТЯПКУ, ЧТОБЫ УБРАТЬ СОРНЯКИ',
        fruit: 'СОБЕРИ ПЛОД'
    },

    fruitIcons: ['🍓', '🍅', '🍆', '🫐', '🍇', '🌶️'],

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
    },

    close() {
        if (this.screenElement) this.screenElement.classList.remove('active');
    },

    resetState() {
        this.stepIndex = 0;
        this.growth = 0;
        this.busy = false;
        this.finished = false;

        this.weedEls.forEach(w => w.remove());
        this.weedEls = [];

        if (this.fruitSpot) {
            this.fruitSpot.classList.remove('ready', 'picked');
            this.fruitSpot.style.left = '50%';
            this.fruitSpot.style.top = `${this.soilLineRatio * 100 - 8}%`;
        }

        // Широкие диапазоны — чтобы каждое растение реально отличалось
        this.plant = {
            hue: 60 + Math.floor(Math.random() * 140),          // 60-200: от жёлто-зелёного до сине-зелёного
            heightFrac: 0.55 + Math.random() * 0.45,             // доля от доступной высоты стебля
            tilt: (Math.random() - 0.5) * 64,                    // -32..32 градуса — заметный наклон
            curve: (Math.random() - 0.5) * 1.6,                  // доп. изгиб стебля вбок
            thickness: 0.6 + Math.random() * 1.4,                // 0.6-2.0 — толщина стебля
            leafCount: 3 + Math.floor(Math.random() * 6),        // 3-8 листьев
            leafSpread: 0.6 + Math.random() * 0.8,               // насколько широко расходятся листья
            flowerColor: ['#ffd166', '#ef476f', '#f4a261', '#c04dbf', '#118ab2'][Math.floor(Math.random() * 5)],
            fruitIcon: this.fruitIcons[Math.floor(Math.random() * this.fruitIcons.length)]
        };

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

    // ---------- ЕДИНАЯ ГЕОМЕТРИЯ СТЕБЛЯ (используется и рисованием, и позицией плода) ----------
    getStemGeometry() {
        const canvas = this.plantCanvas;
        const w = canvas.clientWidth || 150;
        const h = canvas.clientHeight || 220;
        const p = this.plant;

        const baseX = w / 2;
        const baseY = h * this.soilLineRatio + 6;

        // Доступное пространство над почвой с небольшим отступом сверху,
        // чтобы верхушка НИКОГДА не обрезалась краем канваса
        const topPadding = h * 0.06;
        const maxStemLen = Math.max(20, baseY - topPadding);

        const stemLen = this.growth > 0
            ? Math.max(16, maxStemLen * p.heightFrac * this.growth)
            : 0;

        const tiltRad = (p.tilt * Math.PI) / 180;
        const curveOffsetX = p.curve * stemLen * 0.35;

        const tipX = baseX + Math.sin(tiltRad) * stemLen + curveOffsetX * 0.4;
        const tipY = baseY - stemLen;

        return { w, h, baseX, baseY, stemLen, tiltRad, curveOffsetX, tipX, tipY };
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
        if (this.growth <= 0) return;

        const p = this.plant;
        const geo = this.getStemGeometry();
        const { baseX, baseY, stemLen, tiltRad, curveOffsetX, tipX, tipY } = geo;

        const thickness = Math.max(5, 6 + p.thickness * 6 * this.growth);

        // Стебель — с изгибом через управляющую точку
        ctx.strokeStyle = `hsl(${p.hue}, 50%, 30%)`;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(
            baseX + Math.sin(tiltRad) * stemLen * 0.5 + curveOffsetX,
            baseY - stemLen * 0.55,
            tipX, tipY
        );
        ctx.stroke();

        // Листья — форма капли с прожилкой, размер и разброс завязаны на leafSpread
        const visibleLeaves = Math.max(this.growth > 0.15 ? 1 : 0, Math.round(p.leafCount * this.growth));
        for (let i = 1; i <= visibleLeaves; i++) {
            const t = i / (p.leafCount + 1);
            const lx = baseX + (tipX - baseX) * t;
            const ly = baseY + (tipY - baseY) * t;
            const side = i % 2 === 0 ? 1 : -1;
            const leafLen = Math.max(16, (22 + p.thickness * 10) * this.growth) * p.leafSpread;
            const leafWide = leafLen * 0.55;

            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(tiltRad + side * (0.7 * p.leafSpread));

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(leafLen * 0.4, -leafWide * 0.6, leafLen, 0);
            ctx.quadraticCurveTo(leafLen * 0.4, leafWide * 0.6, 0, 0);
            ctx.closePath();
            ctx.fillStyle = `hsl(${p.hue}, 58%, ${40 + i * 2}%)`;
            ctx.fill();
            ctx.strokeStyle = `hsl(${p.hue}, 45%, 24%)`;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(2, 0);
            ctx.lineTo(leafLen - 2, 0);
            ctx.strokeStyle = `hsl(${p.hue}, 40%, 22%)`;
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();
        }

        // Цветок на верхушке при почти полном росте
        if (this.growth > 0.9) {
            const bloom = Math.min(1, (this.growth - 0.9) / 0.1);
            const petalR = (9 + p.thickness * 2) * bloom;
            const petalDist = (10 + p.thickness * 2) * bloom;
            ctx.save();
            ctx.translate(tipX, tipY);
            for (let k = 0; k < 6; k++) {
                const ang = (Math.PI * 2 * k) / 6;
                ctx.beginPath();
                ctx.arc(Math.cos(ang) * petalDist, Math.sin(ang) * petalDist, petalR, 0, Math.PI * 2);
                ctx.fillStyle = p.flowerColor;
                ctx.fill();
            }
            ctx.beginPath();
            ctx.arc(0, 0, petalR * 0.9, 0, Math.PI * 2);
            ctx.fillStyle = '#fff3a0';
            ctx.fill();
            ctx.restore();
        }
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
