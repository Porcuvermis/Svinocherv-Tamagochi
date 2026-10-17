// ================= ЧРЕВОУГОДИЕ: КОРМЁЖКА =================
// Сцена кормления, червь приходит сам, струя из кастрюли, итог.
// Продолжение GluttonyMinigame (gluttony.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после gluttony.js.
Object.assign(GluttonyMinigame, {

    // ================= КОРМЁЖКА =================
    // Кухня НЕ прячется и своего кадра у кормёжки нет. Отдельная сцена
    // читалась как переход в другую игру, а отдельный кадр показывал пустой
    // пол — кухни в нём почти не оставалось. Камера отъезжает на ОБЩИЙ ВИД,
    // кастрюля с плиты исчезает (её понесли вниз), справа приходит червь.
    goToFeed() {
        this.phase = 'feed';
        this.setOpacity('kt-pot', 0);
        this.setOpacity('kt-flame', 0);
        this.setOpacity('kt-spoon', 0);
        this.setOpacity('kt-hint', 0);
        this.setCamera('overview');
        if (this.stageFeed) this.stageFeed.classList.add('active');
        this.ensureFeedMarkup();
        if (this.tiltBucket) this.tiltBucket.style.opacity = '0';
        // Раскладка считается от точки НА КУХНЕ (центр коврика), поэтому её
        // нельзя считать посреди переезда камеры: коврик ещё не там, где
        // будет, и червь приходил в угол экрана, а кастрюля висела за краем.
        // 680 мс — чуть больше перехода #kt-cam (0.62 с).
        setTimeout(() => this.setupFeedStage(), 680);
    },

    dishMeta() {
        const types = [];
        this.inPot.forEach(key => {
            const t = KITCHEN.ingredients[key].type;
            if (types.indexOf(t) === -1) types.push(t);
        });
        const liq = this.liquid ? KITCHEN.liquids[this.liquid] : null;
        return {
            types,
            richLiquid: !!(liq && !liq.plain),
            items: this.inPot.slice(),
            liquid: this.liquid
        };
    },

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
            pointerEvents: 'none',
            // Слой скрыт до первого шага прихода. Рендерер монтирует червя по
            // умолчанию в центр сцены и рисует его там же, ещё до того как
            // раскладка успеет посчитаться, — и он на кадр вспыхивал посреди
            // кухни, чтобы тут же исчезнуть и полезть из-за края.
            opacity: '0'
        });

        // Кастрюлю рисует kitchen-art (KITCHEN_ART.potHeld), а не css-градиент:
        // кормёжка идёт на самой кухне, и серый прямоугольник посреди
        // нарисованной от руки сцены выглядел деталью из другой игры.
        // Здесь только раскладка: где висит, за что берут, вокруг чего
        // наклоняется (ось — верхний край, как у настоящей кастрюли в руках).
        this.tiltBucket = document.getElementById('glut-tilt-bucket');
        if (this.tiltBucket) {
            this.tiltBucket.textContent = '';
            Object.assign(this.tiltBucket.style, {
                position: 'absolute',
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
                // Ровно как viewBox кастрюли: при совпадении пропорций svg
                // ложится в блок без полей, и доли из SPOUT — это честные
                // координаты носика, а не «примерно там».
                aspectRatio: '200 / 224',
                boxSizing: 'border-box'
            });
        }

        this.buildFeedStream();

        // Обработчик наклона вешается здесь же: в прежнем init() он висел на
        // разметке, которой больше нет, а кастрюля всё равно собирается тут.
        if (this.tiltBucket && !this.tiltBucket._feedBound) {
            this.tiltBucket._feedBound = true;
            this.tiltBucket.addEventListener('pointerdown', (e) => this.startFeedDrag(e));
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
        this.ensureFeedMarkup();
        if (this.tiltBucket) {
            this.tiltBucket.style.transform = 'rotate(0deg)';
        }
        // Цвет варева — тот же, что налили в кастрюлю на плите: блюдо
        // доехало до червя тем же, каким его готовили.
        if (this.potEl) this.potEl.innerHTML = KITCHEN_ART.potHeld(this.liquid);
        // Струя того же цвета, что варево в кастрюле: это одна и та же еда.
        this.streamClear(this.feedStream);
        this.streamColor(this.feedStream, this.liquid);

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
            requestAnimationFrame(() => requestAnimationFrame(() => {
                this.layoutFeedStage();
                this.startWormWalk();
            }));
        } catch (err) {
            alert('Чревоугодие: ошибка при отрисовке персонажа — ' + (err && err.message ? err.message : err));
            console.error(err);
        }

        this.updateFeedUI();
        if (!this.feedRafId) this.feedRafId = requestAnimationFrame((t) => this.feedTick(t));
    },

    // Раскладка кормёжки. Считается не числами «на глаз», а по РЕАЛЬНО
    // измеренному силуэту уже отрисованного персонажа — единственный способ,
    // который переживёт взросление: тело станет другим, раскладка
    // пересчитается сама.
    //
    // Точка стояния берётся из СЦЕНЫ (центр коврика), а не из долей экрана:
    // червя кормят в конкретном месте кухни, и если коврик в картинке
    // подвинут, кормёжка переезжает следом без правки кода.
    //
    // ВАЖНО про единицы. getBoundingClientRect отдаёт ВЬЮПОРТНЫЕ пиксели, а
    // весь холст ещё и отмасштабирован (--stage-scale). Раскладка же живёт в
    // css-пикселях слоя персонажа — на это и делится k. Без деления на
    // телефоне персонаж уезжал тем сильнее, чем мельче окно.
    layoutFeedStage() {
        if (!this.wormHandle || !this.wormStageEl || !this.tiltBucket) return;

        const host = this.wormStageEl;
        const hostRect = host.getBoundingClientRect();
        if (hostRect.width < 1 || hostRect.height < 1) return;
        const k = (hostRect.width / (host.clientWidth || hostRect.width)) || 1;
        const W = host.clientWidth || hostRect.width;
        const H = host.clientHeight || hostRect.height;

        const headEl = this.wormHandle.svgRoot.querySelector('[data-part="head"]');
        // Габарит мерим по группе .worm-root (тот <g>, что реально содержит
        // персонажа), а не по svgRoot: внешний <svg> растянут на весь слой, и
        // его прямоугольник — это размер контейнера, а не силуэта.
        const bodyGroup = this.wormHandle.svgRoot.querySelector('.worm-root');
        if (!headEl || !bodyGroup) return;
        const bodyRect = bodyGroup.getBoundingClientRect();
        const headRect = headEl.getBoundingClientRect();
        if (bodyRect.width < 1 || bodyRect.height < 1 || headRect.width < 1) return;

        const headCenterX = headRect.left + headRect.width / 2;
        const headCenterY = headRect.top + headRect.height / 2;

        // Сколько персонаж занимает в каждую сторону от центра головы: хвост
        // тянется в одну сторону намного дальше, поэтому отступы разные.
        const upExtent    = (headCenterY - bodyRect.top) / k;
        const downExtent  = (bodyRect.bottom - headCenterY) / k;
        const leftExtent  = (headCenterX - bodyRect.left) / k;
        const rightExtent = (bodyRect.right - headCenterX) / k;

        const potRect = this.tiltBucket.getBoundingClientRect();
        const potWidth  = potRect.width  ? potRect.width  / k : W * 0.3;
        const potHeight = potRect.height ? potRect.height / k : potWidth / 0.9;

        const MARGIN = 10;   // отступ от краёв
        const POT_GAP = 6;   // зазор между дном кастрюли и макушкой

        const spot = this.sceneToWorm(this.feedSpot());

        // По горизонтали центрируем над ковриком ВЕСЬ силуэт, а не голову: у
        // неё разные «плечи» из-за хвоста.
        let x = spot.x + (leftExtent - rightExtent) / 2;
        x = Math.min(Math.max(x, MARGIN + leftExtent), W - MARGIN - rightExtent);

        // По вертикали тело низом встаёт на коврик, но обязательно так, чтобы
        // сверху осталось место под кастрюлю.
        let y = spot.y - downExtent;
        const minY = MARGIN + potHeight + POT_GAP + upExtent;
        const maxY = H - MARGIN - downExtent;
        y = (minY <= maxY) ? Math.min(Math.max(y, minY), maxY) : minY;

        // Смещение «начало координат персонажа → центр головы». Меряется
        // здесь один раз, дальше позиция ставится арифметикой: во время
        // прихода червя это происходит каждый кадр, и замер в кадре был бы
        // лишней раскладкой браузера.
        const pos = this.wormHandle.getPosition();
        this.wormHeadOffset = {
            x: (headCenterX - hostRect.left) / k - pos.x,
            y: (headCenterY - hostRect.top) / k - pos.y
        };

        // Кастрюля целится в РОТ, а не в центр головы: с поворотом головы рот
        // уезжает вбок на полтора десятка пикселей, и еда лилась бы мимо.
        const mouthEl = this.wormHandle.svgRoot.querySelector('[data-anchor="mouth"]');
        let mouthOffsetX = 0, mouthOffsetY = upExtent * 0.15;
        if (mouthEl) {
            const mouthRect = mouthEl.getBoundingClientRect();
            if (mouthRect.width > 0) {
                mouthOffsetX = ((mouthRect.left + mouthRect.width / 2) - headCenterX) / k;
                mouthOffsetY = ((mouthRect.top + mouthRect.height / 2) - headCenterY) / k;
            }
        }
        this.feedMouth = { dx: mouthOffsetX, dy: mouthOffsetY };
        // Над ртом висит НЕ центр кастрюли, а её НОСИК: держат кастрюлю сбоку
        // и опрокидывают к морде — так и наливают в жизни. Раньше центр стоял
        // над ртом, и струя из левого края лилась мимо, левее морды.
        this.feedPot = {
            w: potWidth,
            h: potHeight,
            dx: mouthOffsetX - this.SPOUT.x * potWidth,
            dy: -upExtent - POT_GAP - potHeight
        };

        // Слой струи считает в тех же css-пикселях, что и вся раскладка.
        if (this.pourSvg) this.pourSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);

        this.feedHead = { x, y };
        // Пока червь ползёт — не дёргаем его на место, только обновляем цель.
        if (this.wormWalk) this.wormWalk.to = this.feedHead;
        else this.setWormHead(x, y);
        this.placePot();
    },

    setWormHead(x, y) {
        const o = this.wormHeadOffset;
        if (!this.wormHandle || !o) return;
        this.wormHandle.setPosition(x - o.x, y - o.y);
    },

    placePot() {
        if (!this.tiltBucket || !this.feedHead || !this.feedPot) return;
        this.tiltBucket.style.left = `${(this.feedHead.x + this.feedPot.dx).toFixed(1)}px`;
        this.tiltBucket.style.top  = `${(this.feedHead.y + this.feedPot.dy).toFixed(1)}px`;
    },

    // ---------- ЧЕРВЬ ПРИХОДИТ САМ ----------
    // Без прихода еда просто появляется рядом с персонажем, и непонятно, как
    // он тут оказался. Ползёт справа за кадром: голова ведёт, тело тянется
    // следом. Своя анимация, а не шагающий цикл рендерера, потому что тот
    // включается только вместе с «прогулками» — а прогулки увели бы червя с
    // коврика прямо во время кормления.
    WALK_MS: 1500,

    startWormWalk() {
        if (!this.feedHead || !this.wormStageEl) return;
        this.stopWormWalk();
        const W = this.wormStageEl.clientWidth || 390;
        this.wormWalk = {
            from: { x: this.feedHead.x + W * 0.95, y: this.feedHead.y + 24 },
            to: this.feedHead,
            at: null
        };
        if (this.tiltBucket) this.tiltBucket.style.opacity = '0';
        this.setWormHead(this.wormWalk.from.x, this.wormWalk.from.y);
        // Показываем ТОЛЬКО когда червь уже поставлен за край экрана.
        if (this.wormStageEl) this.wormStageEl.style.opacity = '1';
        this.wormWalkRaf = requestAnimationFrame(t => this.wormWalkTick(t));
    },

    wormWalkTick(now) {
        const w = this.wormWalk;
        if (!w) { this.wormWalkRaf = null; return; }
        if (w.at === null) w.at = now;
        const t = Math.min(1, (now - w.at) / this.WALK_MS);
        const e = 1 - Math.pow(1 - t, 2);        // трогается охотно, подъезжает мягко
        // Ползёт, а не едет: к прямой добавлена затухающая волна — тело идёт
        // рывками, как у гусеницы.
        const wob = Math.sin(t * Math.PI * 6) * 6 * (1 - t);
        this.setWormHead(w.from.x + (w.to.x - w.from.x) * e,
                         w.from.y + (w.to.y - w.from.y) * e + wob);
        if (t >= 1) {
            this.wormWalk = null;
            this.wormWalkRaf = null;
            this.setWormHead(w.to.x, w.to.y);
            this.placePot();
            if (this.tiltBucket) this.tiltBucket.style.opacity = '1';
            return;
        }
        this.wormWalkRaf = requestAnimationFrame(x => this.wormWalkTick(x));
    },

    stopWormWalk() {
        if (this.wormWalkRaf) cancelAnimationFrame(this.wormWalkRaf);
        this.wormWalkRaf = null;
        this.wormWalk = null;
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
        // Потолок на шаг: свернули вкладку или браузер задержал кадр — без
        // ограничения вся струя разом перескакивает в рот и пропадает.
        const dt = Math.min(0.05, (now - this.feedLastTick) / 1000);
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

        const pouring = !this.feedFinished && this.feedDragging &&
                        this.feedAngle >= this.POUR_THRESHOLD_ANGLE;
        if (pouring) {
            this.feedProgress = Math.min(100, this.feedProgress + this.FEED_RATE_PER_SEC * dt);
            this.updateFeedUI();
            if (this.feedProgress >= 100) this.finishFeeding();
        }
        // Струя живёт каждый кадр, а не только пока льют: перестали лить —
        // новые шарики не выходят, но вылетевшие доезжают до рта.
        this.streamTick(this.feedStream, dt,
                        pouring ? this.spoutPoint() : null, this.mouthPoint());

        this.feedRafId = requestAnimationFrame((t) => this.feedTick(t));
    },

    // ================= СТРУЯ =================
    // ---------- СТРУЯ ----------
    // Движок живёт в ядре (`src/core/liquid-stream.js`): та же струя нужна
    // саду для лейки, а второй копии физики жидкости в игре быть не должно.
    // Здесь остались только переходники — кухня зовёт их так же, как раньше.
    makeStream(layer, cfg) { return LiquidStream.make(layer, cfg); },
    streamSpawn(st, from, to) { return LiquidStream.spawn(st, from, to); },
    streamTick(st, dt, from, to) { return LiquidStream.tick(st, dt, from, to); },
    streamClear(st) { return LiquidStream.clear(st); },

    // Цвет — единственное, что у кухни своё: ключ жидкости знает она, а не
    // ядро.
    streamColor(st, key) {
        LiquidStream.color(st, KITCHEN_ART.liquid(key)[500]);
    },

    // ---------- СТРУЯ КОРМЁЖКИ ----------
    buildFeedStream() {
        if (!this.pourLayer) return;
        if (this.feedStream && this.feedStream.layer.isConnected) return;
        this.pourLayer.innerHTML =
            `<svg id="glut-pour-svg" preserveAspectRatio="none"
                  style="position:absolute;inset:0;width:100%;height:100%">
                <defs>
                    <filter id="glut-goo" x="-25%" y="-15%" width="150%" height="130%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/>
                        <feColorMatrix in="b" type="matrix" values="
                            1 0 0 0 0
                            0 1 0 0 0
                            0 0 1 0 0
                            0 0 0 26 -11"/>
                    </filter>
                </defs>
                <g id="glut-pour-blobs" filter="url(#glut-goo)"></g>
            </svg>`;
        this.pourSvg = document.getElementById('glut-pour-svg');
        this.feedStream = this.makeStream(document.getElementById('glut-pour-blobs'), {
            pool: this.BLOB_POOL, r: this.BLOB_R, emitMs: this.POUR_EMIT_MS,
            base: this.STREAM_BASE, acc: this.STREAM_ACC, bow: this.STREAM_BOW,
            ref: this.FEED_STREAM_REF
        });
    },

    // Носик — правый край горловины, повёрнутый вместе с кастрюлей вокруг её
    // верхней кромки (transform-origin: top center). Считается формулой, а не
    // замером: замер прямоугольника каждый кадр — лишняя раскладка страницы.
    spoutPoint() {
        const P = this.feedPot, H = this.feedHead;
        if (!P || !H) return null;
        const bx = H.x + P.dx, by = H.y + P.dy;
        const cx = bx + P.w / 2;                        // ось поворота
        const lx = bx + P.w * this.SPOUT.x - cx;
        const ly = P.h * this.SPOUT.y;
        const a = this.feedAngle * Math.PI / 180;       // тот же знак, что в transform
        const cos = Math.cos(a), sin = Math.sin(a);
        return {
            x: cx + lx * cos - ly * sin,
            y: by + lx * sin + ly * cos,
            // Куда льётся: направление «наружу из горловины», повёрнутое
            // вместе с кастрюлей. Пока кастрюля стоит — вбок, опрокинули —
            // вниз. Отсюда и берётся начало струи.
            dx: cos - 0.35 * sin,
            dy: sin + 0.35 * cos
        };
    },

    // Целимся чуть ГЛУБЖЕ рта: шарик убывает на последней десятой пути, и
    // если конец кривой — ровно край рта, струя видимо обрывается, не
    // доставая до него. Пусть последние шарики гаснут уже внутри.
    mouthPoint() {
        const H = this.feedHead, M = this.feedMouth;
        if (!H || !M) return null;
        return { x: H.x + M.dx, y: H.y + M.dy + 14 };
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
        const meta = this.dishMeta();

        // Продукты списываются ЗДЕСЬ, а не когда игрок ткнул в холодильник:
        // закрыл игру на середине готовки — всё осталось на месте.
        const spent = meta.items.slice();
        if (meta.liquid) spent.push(meta.liquid);
        if (typeof Backend !== 'undefined') Backend.spendIngredients(spent);

        // Мини-игра не начисляет сама: сообщает результат, а что за него
        // дать, решает конфиг наград (src/config/economy.js). Качество блюда
        // считает Backend.dishQuality по meta.
        GameEvents.emit('minigame:result', {
            sin: 'gluttony', mode: 'feast', outcome: 'win', meta
        });

        this.showResult(typeof Backend !== 'undefined' ? Backend.dishQuality(meta) : null);
    },

    // Итог без единого слова: кучка, которая получится, и осколки жетона.
    // Цифра — не слово, а пиктограмма количества (инвариант 9).
    showResult(dish) {
        if (!this.winOverlay) return;
        if (this.resultEl && dish) {
            const poop = dish.poop > 0 ? `💩<i>×${dish.poop}</i>` : '';
            const shards = dish.shards > 0 ? `🥄<i>×${dish.shards}</i>` : '';
            this.resultEl.innerHTML = [poop, shards].filter(Boolean).join(' ');
        }
        this.winOverlay.classList.remove('fade-out');
        this.winOverlay.classList.add('show');
        setTimeout(() => this.winOverlay.classList.add('fade-out'), 1800);
        setTimeout(() => this.winOverlay.classList.remove('show', 'fade-out'), 2800);
    },
});

// Запуск — здесь, а не в gluttony.js: этот файл подключается последним,
// и к этому моменту все методы уже на объекте.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GluttonyMinigame.init());
} else {
    GluttonyMinigame.init();
}
