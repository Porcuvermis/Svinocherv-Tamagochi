// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ЧРЕВОУГОДИЯ =================
const GluttonyMinigame = {
    screenElement: null,
    closeBtn: null,
    fadeEl: null,

    stageTable: null,
    tableEl: null,
    nextTableBtn: null,

    stageBucket: null,
    bucketBody: null,
    lidWrap: null,
    lidEl: null,
    lidHint: null,
    fallZone: null,
    spoonEl: null,
    nextBucketBtn: null,

    stageFeed: null,
    feedSceneEl: null,
    tiltBucket: null,
    potEl: null,
    pourLayer: null,
    gaugeBar: null,

    // Персонаж на этапе кормления теперь — общая моделька игрока через
    // WormRenderer, а не отдельный хардкод-SVG. Монтируется один раз при
    // первом входе в этот этап (когда контейнер уже видим — иначе он
    // измерит нулевые размеры).
    wormStageEl: null,
    wormHandle: null,

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
    // Насколько сильно "поджимаем" зону срабатывания к центру ведра:
    // 0.15 значит, что край засчитывается уже на 15% ширины ведра
    // от его настоящего края, а не у самого физического края.
    MIX_EDGE_INSET: 0.18,
    // Максимальный угол наклона ручки ложки в каждую сторону (градусы)
    MIX_MAX_ANGLE: 34,

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
    // feedAngle — реальный, плавно анимируемый угол наклона кастрюли.
    // feedTargetAngle — куда он должен прийти (задаётся драгом пальца, либо
    // 0 при отпускании). Единое значение читают И визуальный поворот
    // кастрюли, И открытие рта персонажа (см. feedTick) — поэтому они
    // никогда не рассинхронизируются.
    feedAngle: 0,
    feedTargetAngle: 0,
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
        this.bucketBody = document.getElementById('glut-bucket-body');
        this.lidWrap = document.getElementById('glut-lid-wrap');
        this.lidEl = document.getElementById('glut-lid');
        this.lidHint = document.getElementById('glut-lid-hint');
        this.fallZone = document.getElementById('glut-fall-zone');
        this.spoonEl = document.getElementById('glut-spoon');
        this.nextBucketBtn = document.getElementById('glut-next-bucket');

        this.stageFeed = document.getElementById('glut-stage-feed');
        this.feedSceneEl = this.stageFeed ? this.stageFeed.querySelector('.glut-feed-scene') : null;
        this.tiltBucket = document.getElementById('glut-tilt-bucket');
        this.potEl = document.getElementById('glut-pot-body');
        this.pourLayer = document.getElementById('glut-pour-layer');
        this.wormStageEl = document.getElementById('glut-worm-stage');
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
            this.spoonEl.style.setProperty('--spoon-rot', '0deg');
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
        this.spoonEl.style.setProperty('--spoon-rot', '0deg');
        this.spoonEl.classList.add('show');
        this.mixPos = 0.5;
        this.mixSwings = 0;
    },

    startMixDrag(e) {
        if (!this.spoonEl.classList.contains('show') || this.mixSwings >= this.MIX_SWINGS_NEEDED) return;
        this.mixDragging = true;
        try { this.spoonEl.setPointerCapture(e.pointerId); } catch (err) {}

        // Диапазон свайпа считаем от самого ведра (а не от всей сцены
        // с рамками и стрелкой) — так засчитать край можно, не утыкаясь
        // пальцем в самый физический угол экрана.
        this.mixDragRect = this.bucketBody.getBoundingClientRect();

        this.onMixMove(e);
    },

    onMixMove(e) {
        if (!this.mixDragging || !this.mixDragRect || this.mixDragRect.width <= 0) return;

        const rect = this.mixDragRect;
        const inset = rect.width * this.MIX_EDGE_INSET;
        const usableLeft = rect.left + inset;
        const usableWidth = rect.width - inset * 2;

        const frac = (e.clientX - usableLeft) / usableWidth;
        this.applyMixPos(frac);
    },

    onMixUp() {
        this.mixDragging = false;
        this.mixDragRect = null;
    },

    applyMixPos(rawFraction) {
        this.mixPos = Math.min(1, Math.max(0, rawFraction));
        const angle = (this.mixPos - 0.5) * 2 * this.MIX_MAX_ANGLE; // -MAX..+MAX градусов
        this.spoonEl.style.setProperty('--spoon-rot', `${angle.toFixed(1)}deg`);
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
        this.mixDragging = false;
        this.mixDragRect = null;
        this.spoonEl.classList.add('fly-away');
        setTimeout(() => {
            this.spoonEl.classList.remove('show', 'fly-away');
            this.spoonEl.style.setProperty('--spoon-rot', '0deg');
            if (this.nextBucketBtn) {
                this.nextBucketBtn.style.display = 'block';
                this.nextBucketBtn.classList.add('enabled');
            }
        }, 400);
    },

    // ---------- ЭТАП 3: КОРМЛЕНИЕ ----------

    // Кастрюля и контейнер персонажа на этапе кормления собираются прямо
    // здесь, через JS, а не через правки index.html/gluttony.css — по
    // опыту эти правки вручную не применяются, а разметка в репозитории
    // остаётся старой (старый SVG-червь + эмодзи-ведро 🪣). Метод
    // идемпотентен: при повторном входе на этап ничего не пересоздаёт.
    ensureFeedMarkup() {
        if (this.feedMarkupReady) return;
        if (!this.feedSceneEl) return;

        // Старая захардкоженная иллюстрация червя (ещё до перехода на
        // общую модельку) — прячем, если она осталась в разметке.
        const legacySvg = document.getElementById('glut-worm-lying');
        if (legacySvg) legacySvg.style.display = 'none';

        // Контейнер для WormRenderer (общая модель персонажа).
        this.wormStageEl = document.getElementById('glut-worm-stage');
        if (!this.wormStageEl) {
            this.wormStageEl = document.createElement('div');
            this.wormStageEl.id = 'glut-worm-stage';
            this.feedSceneEl.insertBefore(this.wormStageEl, this.feedSceneEl.firstChild);
        }
        Object.assign(this.wormStageEl.style, {
            position: 'absolute',
            left: '0', top: '0', width: '100%', height: '100%',
            zIndex: '2',
            pointerEvents: 'none'
        });

        // Ведро на этапе кормления должно выглядеть ТОЧНО так же, как
        // ведро на этапе замешивания (.glut-bucket / #glut-bucket-body) —
        // тот самый серый металлический градиент с окантовкой, а не
        // эмодзи и не отдельно нарисованная форма. Копируем стиль прямо
        // из рабочего варианта (см. .glut-bucket в gluttony.css) сюда,
        // инлайново, чтобы это больше не зависело от разметки index.html.
        this.tiltBucket = document.getElementById('glut-tilt-bucket');
        if (this.tiltBucket) {
            this.tiltBucket.textContent = '';
            Object.assign(this.tiltBucket.style, {
                position: 'absolute',
                top: '4%',
                left: '10%',
                width: '30%',
                maxWidth: '120px',
                fontSize: '0',
                transformOrigin: 'top center',
                touchAction: 'none',
                cursor: 'grab',
                zIndex: '5'
            });

            this.potEl = document.getElementById('glut-pot-body');
            if (!this.potEl) {
                this.potEl = document.createElement('div');
                this.potEl.id = 'glut-pot-body';
                this.tiltBucket.appendChild(this.potEl);
            }
            Object.assign(this.potEl.style, {
                position: 'relative',
                width: '100%',
                aspectRatio: '0.9',
                boxSizing: 'border-box',
                background: 'linear-gradient(180deg, #d9d9d9 0%, #9a9a9a 60%, #7a7a7a 100%)',
                border: '3px solid #5a5a5a',
                borderRadius: '14px 14px 26px 26px / 14px 14px 40px 40px',
                boxShadow: 'inset 0 -10px 20px rgba(0,0,0,0.3)'
            });
        }

        this.feedMarkupReady = true;

        // Правка 17: раскладка (положение персонажа + кастрюли) зависит от
        // РЕАЛЬНОГО размера сцены — на смену ориентации/поворот экрана
        // пересчитываем её так же, как при входе на этап.
        if (!this._feedResizeHandlerBound) {
            this._feedResizeHandlerBound = true;
            window.addEventListener('resize', () => {
                if (this.stageFeed && this.stageFeed.classList.contains('active')) this.layoutFeedStage();
            });
        }
    },

    setupFeedStage() {
        this.feedProgress = 0;
        this.feedFinished = false;
        this.feedDragging = false;
        this.feedDy = 0;
        this.feedAngle = 0;
        this.feedTargetAngle = 0;
        this.feedLastDropTime = 0;
        this.ensureFeedMarkup();
        if (this.tiltBucket) {
            this.tiltBucket.style.transform = 'rotate(0deg)';
        }

        // Персонаж — общая моделька игрока, не своя отрисовка. Монтируем
        // (один раз за сессию) именно здесь, когда .glut-stage-feed уже
        // получил класс .active и контейнер видим — иначе рендерер
        // измерит нулевые размеры контейнера.
        //
        // Раскладка этапа: персонаж лежит вдоль низа сцены, головой к
        // левому краю (flip — тело растёт вправо от головы), тело
        // неподвижно (idleWave:false — никакого шевеления/покачивания,
        // просто лежит), живот раздувается только вверх, от нижней
        // границы (bellyGrowthAnchor:'bottom') — как и просили: живот не
        // растёт "в сторону спины".
        if (!window.WormModelAPI || !window.WormRenderer) {
            alert('Чревоугодие: не найден WormModelAPI/WormRenderer — проверь, что src/core/worm-model.js и src/core/worm-renderer.js подключены в index.html до gluttony.js.');
        } else if (this.wormStageEl) try {
            const model = window.WormModelAPI.loadWormModel();
            if (!this.wormHandle) {
                this.wormHandle = window.WormRenderer.mount(this.wormStageEl, model, {
                    context: 'gluttony',
                    // pose явно не задаём — берётся дефолтная 'standing'
                    // (та же поза, что и на главном экране): персонаж
                    // кормится стоя, а не лёжа плашмя, как было раньше.
                    wander: false,
                    blink: true,
                    idleWave: false,
                    flip: true,
                    bellyGrowthAnchor: 'bottom',
                    // Стартовый анкор — просто разумная точка по
                    // умолчанию (совпадает с дефолтом самого рендерера).
                    // Точную позицию, при которой персонаж целиком
                    // помещается в сцену, а кастрюля стоит над головой,
                    // выставляет layoutFeedStage() сразу после монтажа —
                    // см. вызов ниже.
                    anchorX: 0.5,
                    anchorY: 0.55
                });
            } else {
                // На случай, если базовая модель поменялась где-то ещё
                // (например, отредактирована на главном экране) — всегда
                // подтягиваем актуальную версию при входе на этот этап.
                this.wormHandle.update(model);
            }
            // Живот сбрасывается к стандартному размеру на входе в этап —
            // раздувать его будет сама механика кормления ниже. Рот: только
            // ОТКРЫТОСТЬ (mouthOpenness) — "живой" параметр, который тут
            // анимируется вслед за наклоном ведра (см. feedTick()). Кривизну
            // (mouthCurve) НЕ трогаем и не переопределяем — она приходит из
            // той же базовой модели, что и на главном экране, без изменений:
            // если персонаж улыбается/грустит там, ровно то же самое видно и
            // здесь, в мини-игре. Раньше здесь стоял принудительный сброс к
            // нейтральной кривизне (mouthCurve:0) — убран по фидбеку: не
            // должно быть отдельного "состояния рта" для мини-игры, только
            // общая модель + живое открытие.
            this.wormHandle.setLivePose({ bellyScale: 1, mouthOpenness: 0 });
            // Раскладка (позиция персонажа + кастрюли над его головой)
            // требует реальных, уже отрисованных габаритов SVG — сегменты
            // напольной цепи получают свои transform только в первом тике
            // рендерера (requestAnimationFrame), не в момент mount()/update().
            // Двойной rAF — гарантированно ПОСЛЕ этого первого тика.
            requestAnimationFrame(() => requestAnimationFrame(() => this.layoutFeedStage()));
        } catch (err) {
            alert('Чревоугодие: ошибка при отрисовке персонажа — ' + (err && err.message ? err.message : err));
            console.error(err);
        }

        this.updateFeedUI();
        if (!this.feedRafId) this.feedRafId = requestAnimationFrame((t) => this.feedTick(t));
    },

    // Правка 17: раньше здесь была alignPotToMouth() — подгоняла только
    // ГОРИЗОНТАЛЬ кастрюли под рот, а сама позиция персонажа была
    // захардкожена (anchorX/anchorY), из-за чего он частично не влезал в
    // сцену. Теперь одна функция решает обе задачи сразу и делает это не
    // "на глаз" числами, а по РЕАЛЬНЫМ измеренным габаритам уже
    // отрисованного персонажа (getBoundingClientRect его SVG) — это
    // единственный способ, который сам собой продолжит работать и после
    // появления взросления (новые сегменты, другой размер тела): силуэт
    // персонажа просто станет больше/другим, а раскладка пересчитается от
    // него заново, без правки констант.
    //
    // Логика:
    // 1) меряем фактический bbox всего персонажа (bodyRect) и его головы
    //    (headRect) — они дают "сколько места нужно" в каждую сторону от
    //    ЦЕНТРА головы (up/down/left/right extent);
    // 2) выбираем новую точку стояния головы (wormX/wormY) так, чтобы весь
    //    силуэт был центрирован по горизонтали и стоял чуть ниже центра
    //    сцены по вертикали, но целиком помещался в видимую область и
    //    оставлял сверху место под кастрюлю;
    // 3) переставляем персонажа туда через WormRenderer.setPosition();
    // 4) ставим кастрюлю строго над новым положением головы (центр по X
    //    совпадает с центром головы, дно — на небольшом зазоре над
    //    макушкой) — поэтому кастрюля "над головой" гарантированно, где бы
    //    голова ни оказалась.
    layoutFeedStage() {
        if (!this.wormHandle || !this.wormStageEl || !this.feedSceneEl || !this.tiltBucket) return;

        const stageRect = this.wormStageEl.getBoundingClientRect();
        if (stageRect.width < 1 || stageRect.height < 1) return;

        const headEl = this.wormHandle.svgRoot.querySelector('[data-part="head"]');
        // ВАЖНО: bbox мерим по группе .worm-root (тот <g>, что реально
        // содержит и двигает персонажа), а НЕ по this.wormHandle.svgRoot —
        // svgRoot это сам внешний <svg>, его getBoundingClientRect() равен
        // размеру КОНТЕЙНЕРА (он растянут на всю сцену через viewBox), а
        // не силуэту персонажа внутри него.
        const bodyGroup = this.wormHandle.svgRoot.querySelector('.worm-root');
        if (!headEl || !bodyGroup) return;
        const bodyRect = bodyGroup.getBoundingClientRect();
        const headRect = headEl.getBoundingClientRect();
        if (bodyRect.width < 1 || bodyRect.height < 1 || headRect.width < 1) return;

        const headCenterX = headRect.left + headRect.width / 2;
        const headCenterY = headRect.top + headRect.height / 2;

        // Сколько персонаж реально занимает в каждую сторону от центра
        // головы — хвостовая часть тянется в одну сторону намного дальше,
        // чем что-либо в другую, поэтому все четыре отступа разные.
        const upExtent = headCenterY - bodyRect.top;
        const downExtent = bodyRect.bottom - headCenterY;
        const leftExtent = headCenterX - bodyRect.left;
        const rightExtent = bodyRect.right - headCenterX;

        const potRect = this.tiltBucket.getBoundingClientRect();
        const potWidth = potRect.width || stageRect.width * 0.3;
        const potHeight = potRect.height || potWidth / 0.9;

        const MARGIN = 10;   // отступ от краёв сцены
        const POT_GAP = 6;   // зазор между дном кастрюли и макушкой головы

        // По горизонтали центрируем весь силуэт (не саму голову — у неё
        // разные "плечи" из-за хвоста), с зажимом в границы сцены.
        let targetHeadX = stageRect.width / 2 + (leftExtent - rightExtent) / 2;
        targetHeadX = Math.min(Math.max(targetHeadX, MARGIN + leftExtent), stageRect.width - MARGIN - rightExtent);

        // По вертикали — чуть ниже центра сцены (экран портретный, а поза
        // персонажа высокая), но обязательно так, чтобы снизу тело влезало
        // целиком, а сверху оставалось место под кастрюлю.
        const minHeadY = MARGIN + potHeight + POT_GAP + upExtent;
        const maxHeadY = stageRect.height - MARGIN - downExtent;
        let targetHeadY = stageRect.height * 0.58;
        if (minHeadY <= maxHeadY) {
            targetHeadY = Math.min(Math.max(targetHeadY, minHeadY), maxHeadY);
        } else {
            // Сцена слишком тесная для идеальной раскладки — приоритет
            // месту под кастрюлю и полной видимости головы/верха тела.
            targetHeadY = minHeadY;
        }

        // headRect/bodyRect — во ВЬЮПОРТЕ; переводим их через уже
        // известную ТЕКУЩУЮ позицию головы (getPosition) в систему
        // координат сцены (= системе координат SVG персонажа, см.
        // syncViewportSize — viewBox 1:1 с CSS-пикселями контейнера).
        const currentPos = this.wormHandle.getPosition();
        const currentHeadX = headCenterX - stageRect.left;
        const currentHeadY = headCenterY - stageRect.top;
        const dx = targetHeadX - currentHeadX;
        const dy = targetHeadY - currentHeadY;
        this.wormHandle.setPosition(currentPos.x + dx, currentPos.y + dy);

        // Кастрюля целится в РОТ, а не в центр головы. Пока голова была
        // строго анфас, это было одно и то же; с появлением поворота
        // (head.yaw) рот уезжает вбок на полтора десятка пикселей, и еда
        // лилась бы мимо. Смещение считаем относительно центра головы,
        // потому что вся раскладка ниже уже построена от него.
        const mouthEl = this.wormHandle.svgRoot.querySelector('[data-anchor="mouth"]');
        let mouthOffsetX = 0;
        if (mouthEl) {
            const mouthRect = mouthEl.getBoundingClientRect();
            if (mouthRect.width > 0) {
                mouthOffsetX = (mouthRect.left + mouthRect.width / 2) - headCenterX;
            }
        }
        this.tiltBucket.style.left = `${targetHeadX + mouthOffsetX - potWidth / 2}px`;
        this.tiltBucket.style.top = `${targetHeadY - upExtent - POT_GAP - potHeight}px`;
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
        try { this.tiltBucket.setPointerCapture(e.pointerId); } catch (err) {}

        const onMove = (ev) => {
            if (!this.feedDragging) return;
            const dy = Math.min(this.MAX_DY, Math.max(0, ev.clientY - this.feedStartY));
            this.feedDy = dy;
            // Только ЦЕЛЬ — сам наклон кастрюли и открытие рта плавно едут
            // к ней каждый кадр в feedTick() одним и тем же значением угла,
            // чтобы кастрюля и рот не могли разъехаться между собой.
            this.feedTargetAngle = (dy / this.MAX_DY) * this.MAX_ANGLE;
        };
        const onUp = () => {
            this.feedDragging = false;
            this.feedDy = 0;
            this.feedTargetAngle = 0;
            this.tiltBucket.removeEventListener('pointermove', onMove);
            this.tiltBucket.removeEventListener('pointerup', onUp);
            this.tiltBucket.removeEventListener('pointercancel', onUp);
        };

        this.tiltBucket.addEventListener('pointermove', onMove);
        this.tiltBucket.addEventListener('pointerup', onUp);
        this.tiltBucket.addEventListener('pointercancel', onUp);
    },

    feedTick(now) {
        if (!this.feedLastTick) this.feedLastTick = now;
        const dt = (now - this.feedLastTick) / 1000;
        this.feedLastTick = now;

        // Плавно подводим текущий угол наклона кастрюли к целевому —
        // экспоненциальное сглаживание, не зависящее от частоты кадров
        // (dt-корректное). Быстро (доходит за ~150-200мс), но без единого
        // резкого скачка — и это же значение сразу двигает рот персонажа.
        const smoothing = Math.min(1, 1 - Math.pow(0.0005, dt));
        this.feedAngle += (this.feedTargetAngle - this.feedAngle) * smoothing;
        if (Math.abs(this.feedTargetAngle - this.feedAngle) < 0.05) this.feedAngle = this.feedTargetAngle;

        if (this.tiltBucket) {
            this.tiltBucket.style.transform = `rotate(${this.feedAngle.toFixed(1)}deg)`;
        }
        if (this.wormHandle) {
            // Наклон ведра 0° → рот закрыт (0), наклон MAX_ANGLE → рот
            // открыт полностью (1) — прямое пропорциональное соответствие,
            // как и просили: "ведро наклонено полностью = рот открыт
            // полностью", в любой промежуточный момент тоже верно.
            const openness = Math.max(0, Math.min(1, this.feedAngle / this.MAX_ANGLE));
            this.wormHandle.setLivePose({ mouthOpenness: openness });
        }

        if (!this.feedFinished && this.feedDragging) {
            if (this.feedAngle >= this.POUR_THRESHOLD_ANGLE) {
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
        if (!this.pourLayer || !this.potEl) return;
        const drop = document.createElement('div');
        drop.className = 'glut-drop';
        // Берём границы самой кастрюли (не всей поворотной обёртки), причём
        // не центр, а передний/нижний край её текущего (уже повёрнутого)
        // прямоугольника — getBoundingClientRect() после rotate() возвращает
        // именно повёрнутый bbox, так что right/bottom — это и есть "носик"
        // наклонённой кастрюли, а не геометрический центр.
        const potRect = this.potEl.getBoundingClientRect();
        const layerRect = this.pourLayer.getBoundingClientRect();
        drop.style.left = `${potRect.right - layerRect.left - 6}px`;
        drop.style.top = `${potRect.bottom - layerRect.top - 4}px`;
        this.pourLayer.appendChild(drop);
        setTimeout(() => drop.remove(), 550);
    },

    updateFeedUI() {
        const t = this.feedProgress / 100;
        if (this.gaugeBar) this.gaugeBar.style.width = `${this.feedProgress}%`;
        // Живот раздувается прямо на общей модельке персонажа через
        // "горячий" канал рендерера — без пересборки SVG на каждый кадр.
        if (this.wormHandle) this.wormHandle.setLivePose({ bellyScale: 1 + t * 0.9 });
    },

    finishFeeding() {
        this.feedFinished = true;
        this.showWinText();

        // Мини-игра не начисляет сама: сообщает результат, а что за него
        // дать, решает конфиг наград (src/config/economy.js).
        GameEvents.emit('minigame:result', { sin: 'gluttony', mode: 'feast', outcome: 'win' });
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
