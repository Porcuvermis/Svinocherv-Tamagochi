// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ЧРЕВОУГОДИЯ =================
const GluttonyMinigame = {
    screenElement: null,
    closeBtn: null,
    fadeEl: null,

    stageTable: null,
    tableEl: null,
    nextTableBtn: null,

    stageBucket: null,
    lidWrap: null,
    lidEl: null,
    lidHint: null,
    fallZone: null,
    spoonEl: null,
    nextBucketBtn: null,

    stageFeed: null,
    tiltBucket: null,
    pourLayer: null,
    bellyEl: null,
    gaugeBar: null,

    winOverlay: null,

    ITEMS: [
        { id: 'apple',   emoji: '🍎', x: 18, y: 18 },
        { id: 'bread',   emoji: '🍞', x: 50, y: 14 },
        { id: 'meat',    emoji: '🍖', x: 82, y: 20 },
        { id: 'fish',    emoji: '🐟', x: 16, y: 45 },
        { id: 'cheese',  emoji: '🧀', x: 50, y: 42 },
        { id: 'carrot',  emoji: '🥕', x: 84, y: 47 },
        { id: 'tomato',  emoji: '🍅', x: 20, y: 72 },
        { id: 'chicken', emoji: '🍗', x: 50, y: 70 },
        { id: 'pizza',   emoji: '🍕', x: 82, y: 74 },
        { id: 'cake',    emoji: '🍰', x: 50, y: 90 }
    ],

    // ---------- НАСТРОЙКИ ПЕРЕМЕШИВАНИЯ ----------
    MIX_SWINGS_NEEDED: 5,
    MIX_GAIN: 20,

    // ---------- НАСТРОЙКИ КОРМЛЕНИЯ ----------
    MAX_DY: 90,          // px наклона до максимума
    MAX_ANGLE: 55,       // градусы максимального наклона
    POUR_THRESHOLD_ANGLE: 28,
    FEED_RATE_PER_SEC: 14, // %/сек пока льётся
    DROP_INTERVAL: 140,   // мс между каплями

    // ---------- СОСТОЯНИЕ ----------
    selectedIds: [],
    mixPos: 0.5,
    mixDragRect: null,
    mixDragging: false,
    mixAtLeft: false,
    mixAtRight: false,
    mixLastExtreme: null,
    mixSwings: 0,

    feedDragging: false,
    feedStartY: 0,
    feedDy: 0,
    feedProgress: 0,
    feedFinished: false,
    feedLastDropTime: 0,
    feedRafId: null,
    feedLastTick: null,

    init() {
        this.screenElement = document.getElementById('gluttony-game');
        this.closeBtn = document.getElementById('glut-close-btn');
        this.fadeEl = document.getElementById('glut-fade');

        this.stageTable = document.getElementById('glut-stage-table');
        this.tableEl = document.getElementById('glut-table');
        this.nextTableBtn = document.getElementById('glut-next-table');

        this.stageBucket = document.getElementById('glut-stage-bucket');
        this.lidWrap = document.getElementById('glut-lid-wrap');
        this.lidEl = document.getElementById('glut-lid');
        this.lidHint = document.getElementById('glut-lid-hint');
        this.fallZone = document.getElementById('glut-fall-zone');
        this.spoonEl = document.getElementById('glut-spoon');
        this.nextBucketBtn = document.getElementById('glut-next-bucket');

        this.stageFeed = document.getElementById('glut-stage-feed');
        this.tiltBucket = document.getElementById('glut-tilt-bucket');
        this.pourLayer = document.getElementById('glut-pour-layer');
        this.bellyEl = document.getElementById('glut-belly');
        this.gaugeBar = document.getElementById('glut-gauge-bar');

        this.winOverlay = document.getElementById('glut-win-overlay');

        if (this.closeBtn) {
            this.closeBtn.onclick = (e) => { e.stopPropagation(); this.close(); };
        }
        if (this.nextTableBtn) {
            this.nextTableBtn.onclick = (e) => {
                e.stopPropagation();
                if (this.selectedIds.length === 0) return;
                this.transitionTo('bucket');
            };
        }
        if (this.lidEl) {
            this.lidEl.addEventListener('pointerdown', (e) => this.startLidDrag(e));
        }
        if (this.spoonEl) {
            this.spoonEl.addEventListener('pointerdown', (e) => this.startMixDrag(e));
            this.spoonEl.addEventListener('pointermove', (e) => this.onMixMove(e));
            this.spoonEl.addEventListener('pointerup', (e) => this.onMixUp(e));
            this.spoonEl.addEventListener('pointercancel', (e) => this.onMixUp(e));
        }
        if (this.tiltBucket) {
            this.tiltBucket.addEventListener('pointerdown', (e) => this.startFeedDrag(e));
        }
    },

    open() {
        if (!this.screenElement) this.init();
        this.screenElement.classList.add('active');
        this.resetAll();
    },

    close() {
        if (this.screenElement) this.screenElement.classList.remove('active');
        this.stopFeedTick();
    },

    resetAll() {
        this.selectedIds = [];
        this.buildTable();
        this.setStage('table');
        if (this.fadeEl) this.fadeEl.classList.remove('show');
        if (this.winOverlay) this.winOverlay.classList.remove('show', 'fade-out');
    },

    setStage(name) {
        [this.stageTable, this.stageBucket, this.stageFeed].forEach(s => {
            if (s) s.classList.remove('active');
        });
        if (name === 'table' && this.stageTable) this.stageTable.classList.add('active');
        if (name === 'bucket' && this.stageBucket) {
            this.stageBucket.classList.add('active');
            this.setupBucketStage();
        }
        if (name === 'feed' && this.stageFeed) {
            this.stageFeed.classList.add('active');
            this.setupFeedStage();
        }
    },

    transitionTo(name) {
        if (this.fadeEl) this.fadeEl.classList.add('show');
        setTimeout(() => {
            this.setStage(name);
            setTimeout(() => {
                if (this.fadeEl) this.fadeEl.classList.remove('show');
            }, 30);
        }, 220);
    },

    // ---------- ЭТАП 1: СТОЛ ----------
    buildTable() {
        if (!this.tableEl) return;
        this.tableEl.innerHTML = '';
        this.ITEMS.forEach(item => {
            const el = document.createElement('div');
            el.className = 'glut-item';
            el.dataset.id = item.id;
            el.dataset.emoji = item.emoji;
            el.style.left = `${item.x}%`;
            el.style.top = `${item.y}%`;
            el.textContent = item.emoji;
            el.onclick = (e) => { e.stopPropagation(); this.toggleItem(item.id, el); };
            this.tableEl.appendChild(el);
        });
        this.updateNextTableBtn();
    },

    toggleItem(id, el) {
        const idx = this.selectedIds.indexOf(id);
        if (idx === -1) {
            this.selectedIds.push(id);
            el.classList.add('selected');
        } else {
            this.selectedIds.splice(idx, 1);
            el.classList.remove('selected');
        }
        this.updateNextTableBtn();
    },

    updateNextTableBtn() {
        if (!this.nextTableBtn) return;
        this.nextTableBtn.classList.toggle('enabled', this.selectedIds.length > 0);
    },

    // ---------- ЭТАП 2: ВЕДРО ----------
    setupBucketStage() {
        this.mixSwings = 0;
        this.mixPos = 0.5;
        this.mixAtLeft = false;
        this.mixAtRight = false;
        this.mixLastExtreme = null;

        if (this.nextBucketBtn) {
            this.nextBucketBtn.style.display = 'none';
            this.nextBucketBtn.classList.remove('enabled');
        }
        if (this.lidWrap) this.lidWrap.style.display = 'flex';
        if (this.lidEl) {
            this.lidEl.classList.remove('dragging', 'returning', 'removed');
            this.lidEl.style.transform = '';
            this.lidEl.style.opacity = '1';
        }
        if (this.lidHint) this.lidHint.style.display = 'block';
        if (this.fallZone) this.fallZone.innerHTML = '';
        if (this.spoonEl) {
            this.spoonEl.classList.remove('show', 'fly-away');
        }
        if (this.nextBucketBtn) {
            this.nextBucketBtn.onclick = (e) => {
                e.stopPropagation();
                this.transitionTo('feed');
            };
        }
    },

    startLidDrag(e) {
        if (this.lidEl.classList.contains('removed')) return;
        this.lidDragging = true;
        this.lidStartY = e.clientY;
        this.lidEl.classList.add('dragging');
        try { this.lidEl.setPointerCapture(e.pointerId); } catch (err) {}

        const onMove = (ev) => {
            if (!this.lidDragging) return;
            const dy = Math.min(0, ev.clientY - this.lidStartY);
            this.lidEl.style.transform = `translateY(${dy}px)`;
            if (this.lidStartY - ev.clientY >= 70) {
                finishRemoveLid();
            }
        };
        const onUp = () => {
            this.lidDragging = false;
            this.lidEl.removeEventListener('pointermove', onMove);
            this.lidEl.removeEventListener('pointerup', onUp);
            this.lidEl.removeEventListener('pointercancel', onUp);
            if (!this.lidEl.classList.contains('removed')) {
                this.lidEl.classList.add('returning');
                this.lidEl.style.transform = '';
            }
        };
        const finishRemoveLid = () => {
            this.lidDragging = false;
            this.lidEl.removeEventListener('pointermove', onMove);
            this.lidEl.removeEventListener('pointerup', onUp);
            this.lidEl.classList.remove('dragging');
            this.lidEl.classList.add('removed');
            this.lidEl.style.transform = 'translateY(-160px)';
            this.lidEl.style.opacity = '0';
            if (this.lidHint) this.lidHint.style.display = 'none';
            setTimeout(() => this.spawnIngredientsFalling(), 300);
        };

        this.lidEl.addEventListener('pointermove', onMove);
        this.lidEl.addEventListener('pointerup', onUp);
        this.lidEl.addEventListener('pointercancel', onUp);
    },

    spawnIngredientsFalling() {
        const items = this.ITEMS.filter(i => this.selectedIds.includes(i.id));
        items.forEach((item, i) => {
            setTimeout(() => {
                const el = document.createElement('div');
                el.className = 'glut-fall-item';
                el.textContent = item.emoji;
                el.style.left = `${30 + Math.random() * 40}%`;
                this.fallZone.appendChild(el);
                setTimeout(() => el.remove(), 600);
            }, i * 180);
        });

        const totalTime = items.length * 180 + 600;
        setTimeout(() => this.spawnSpoon(), totalTime + 150);
    },

    spawnSpoon() {
        if (!this.spoonEl) return;
        this.spoonEl.classList.add('show');
        this.mixPos = 0.5;
        this.mixSwings = 0;
    },

    startMixDrag(e) {
        if (!this.spoonEl.classList.contains('show') || this.mixSwings >= this.MIX_SWINGS_NEEDED) return;
        this.mixDragging = true;
        try { this.spoonEl.setPointerCapture(e.pointerId); } catch (err) {}
        this.mixDragRect = this.stageBucket.getBoundingClientRect();
        this.onMixMove(e);
    },

    onMixMove(e) {
        if (!this.mixDragging || !this.mixDragRect) return;
        const frac = (e.clientX - this.mixDragRect.left) / this.mixDragRect.width;
        this.applyMixPos(frac);
    },

    onMixUp() {
        this.mixDragging = false;
        this.mixDragRect = null;
    },

    applyMixPos(rawFraction) {
        this.mixPos = Math.min(1, Math.max(0, rawFraction));
        const offsetPct = (this.mixPos - 0.5) * 60; // визуальное смещение ложки
        this.spoonEl.style.left = `calc(50% + ${offsetPct}%)`;
        this.checkMixExtreme();
    },

    checkMixExtreme() {
        if (this.mixSwings >= this.MIX_SWINGS_NEEDED) return;

        if (this.mixPos >= 1) {
            if (!this.mixAtRight) {
                this.mixAtRight = true;
                this.mixAtLeft = false;
                if (this.mixLastExtreme === null || this.mixLastExtreme === 'left') {
                    this.mixLastExtreme = 'right';
                    this.addMixSwing();
                }
            }
        } else if (this.mixPos <= 0) {
            if (!this.mixAtLeft) {
                this.mixAtLeft = true;
                this.mixAtRight = false;
                if (this.mixLastExtreme === null || this.mixLastExtreme === 'right') {
                    this.mixLastExtreme = 'left';
                    this.addMixSwing();
                }
            }
        } else {
            this.mixAtLeft = false;
            this.mixAtRight = false;
        }
    },

    addMixSwing() {
        this.mixSwings++;
        if (this.mixSwings >= this.MIX_SWINGS_NEEDED) {
            this.finishMixing();
        }
    },

    finishMixing() {
        this.spoonEl.classList.add('fly-away');
        setTimeout(() => {
            this.spoonEl.classList.remove('show', 'fly-away');
            this.spoonEl.style.left = '50%';
            if (this.nextBucketBtn) {
                this.nextBucketBtn.style.display = 'block';
                this.nextBucketBtn.classList.add('enabled');
            }
        }, 400);
    },

    // ---------- ЭТАП 3: КОРМЛЕНИЕ ----------
    setupFeedStage() {
        this.feedProgress = 0;
        this.feedFinished = false;
        this.feedDragging = false;
        this.feedDy = 0;
        this.feedLastDropTime = 0;
        if (this.tiltBucket) {
            this.tiltBucket.classList.remove('returning');
            this.tiltBucket.style.transform = 'rotate(0deg)';
        }
        this.updateFeedUI();
        if (!this.feedRafId) this.feedRafId = requestAnimationFrame((t) => this.feedTick(t));
    },

    stopFeedTick() {
        if (this.feedRafId) {
            cancelAnimationFrame(this.feedRafId);
            this.feedRafId = null;
        }
        this.feedLastTick = null;
    },

    startFeedDrag(e) {
        if (this.feedFinished) return;
        this.feedDragging = true;
        this.feedStartY = e.clientY;
        this.tiltBucket.classList.remove('returning');
        try { this.tiltBucket.setPointerCapture(e.pointerId); } catch (err) {}

        const onMove = (ev) => {
            if (!this.feedDragging) return;
            const dy = Math.min(this.MAX_DY, Math.max(0, ev.clientY - this.feedStartY));
            this.feedDy = dy;
            const angle = (dy / this.MAX_DY) * this.MAX_ANGLE;
            this.tiltBucket.style.transform = `rotate(${angle}deg)`;
        };
        const onUp = () => {
            this.feedDragging = false;
            this.feedDy = 0;
            this.tiltBucket.removeEventListener('pointermove', onMove);
            this.tiltBucket.removeEventListener('pointerup', onUp);
            this.tiltBucket.removeEventListener('pointercancel', onUp);
            this.tiltBucket.classList.add('returning');
            this.tiltBucket.style.transform = 'rotate(0deg)';
        };

        this.tiltBucket.addEventListener('pointermove', onMove);
        this.tiltBucket.addEventListener('pointerup', onUp);
        this.tiltBucket.addEventListener('pointercancel', onUp);
    },

    feedTick(now) {
        if (!this.feedLastTick) this.feedLastTick = now;
        const dt = (now - this.feedLastTick) / 1000;
        this.feedLastTick = now;

        if (!this.feedFinished && this.feedDragging) {
            const angle = (this.feedDy / this.MAX_DY) * this.MAX_ANGLE;
            if (angle >= this.POUR_THRESHOLD_ANGLE) {
                this.feedProgress = Math.min(100, this.feedProgress + this.FEED_RATE_PER_SEC * dt);
                this.updateFeedUI();
                if (now - this.feedLastDropTime > this.DROP_INTERVAL) {
                    this.feedLastDropTime = now;
                    this.spawnDrop();
                }
                if (this.feedProgress >= 100) {
                    this.finishFeeding();
                }
            }
        }

        this.feedRafId = requestAnimationFrame((t) => this.feedTick(t));
    },

    spawnDrop() {
        if (!this.pourLayer) return;
        const drop = document.createElement('div');
        drop.className = 'glut-drop';
        const bucketRect = this.tiltBucket.getBoundingClientRect();
        const layerRect = this.pourLayer.getBoundingClientRect();
        drop.style.left = `${bucketRect.left + bucketRect.width * 0.3 - layerRect.left}px`;
        drop.style.top = `${bucketRect.bottom - layerRect.top - 10}px`;
        this.pourLayer.appendChild(drop);
        setTimeout(() => drop.remove(), 550);
    },

    updateFeedUI() {
        const t = this.feedProgress / 100;
        if (this.gaugeBar) this.gaugeBar.style.width = `${this.feedProgress}%`;
        if (this.bellyEl) this.bellyEl.setAttribute('transform', `scale(${1 + t * 0.9})`);
    },

    finishFeeding() {
        this.feedFinished = true;
        this.showWinText();

        if (typeof GameManager !== 'undefined') {
            GameManager.sins.gluttony.value = 100;
            GameManager.updateUI();
        }
    },

    showWinText() {
        if (!this.winOverlay) return;
        this.winOverlay.classList.remove('fade-out');
        this.winOverlay.classList.add('show');
        setTimeout(() => this.winOverlay.classList.add('fade-out'), 1500);
        setTimeout(() => this.winOverlay.classList.remove('show', 'fade-out'), 2500);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GluttonyMinigame.init());
} else {
    GluttonyMinigame.init();
}
