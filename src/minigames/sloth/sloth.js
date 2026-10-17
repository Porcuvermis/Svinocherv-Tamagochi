// ================= МИНИ-ИГРА ГРЕХ ЛЕНИ: САД =================
// Участок с грядками вместо одного горшка (docs/plan/19-sloth-garden.md).
// Интерфейс диегетический, как на кухне: инструмент ТАЩАТ на грядку, а не
// выбирают в меню. Слов нет ни одного (инвариант 9), окно общее (инвариант 8).
//
// ---------- КРУГ ГРЯДКИ ----------
//   разобрал завал (рукой) → вскопал лунку → посеял → полил
//        └─ ЭТАП 1: часы, идёт ОФФЛАЙН, ускоряется удобрением
//   прополол
//        └─ ЭТАП 2: минуты, идёт в сессии, сокращается граблями
//   собрал → плод лёг в кладовую кухни
//
// Ни один этап не тикает: состояние грядки — формула от метки времени
// (инвариант 1), и спрашивают его у Backend в момент отрисовки. Поэтому сад
// можно закрыть на неделю, и он не «догоняет» время при следующем открытии.
//
// ---------- ПОЧЕМУ ШКАЛА РАСТЁТ И ОТ ПРЕБЫВАНИЯ ----------
// Лень — единственный грех, которому «положил телефон и ничего не делаешь»
// не противоречит, а ровно соответствует. Поэтому шкала растёт от двух вещей
// сразу: минута в саду закрывает её целиком сама, каждое действие даёт пятую
// часть. Возиться быстрее, чем сидеть, — иначе сад незачем открывать.
//
// Тикающего счётчика при этом нет (инвариант 1): экран держит МЕТКУ времени
// открытия, а добавку считает Backend формулой от разницы меток. Метка живёт
// в памяти экрана, а не в сейве — пребывание нельзя накопить, закрыв игру с
// открытым садом.
//
// ---------- ЧТО ПОКАЗЫВАЕТ ВРЕМЯ ----------
// Двумя вещами сразу: растение тем выше, чем ближе срок, а в кольце над
// грядкой стоят цифры — сколько осталось. Кольцо без цифр отвечало только
// «скоро/не скоро», а решение «ждать или скинуть какашкой» принимается по
// разнице между двумя часами и двадцатью минутами. Цифра не слово
// (инвариант 9).
const SlothMinigame = {
    screenElement: null,
    win: null,
    svgEl: null,
    camEl: null,
    fgEl: null,

    // Сколько инструмент «работает», прежде чем действие засчитается. Действия
    // нарочно не мгновенные: из них и складывается размеренность сада, ради
    // которой он затевался.
    ACT_MS: 520,

    // Во сколько раз предмет в руке крупнее, чем на полке. Предмет под
    // пальцем обязан быть крупнее самого пальца, иначе не видно, что держишь.
    // Число нужно и носику лейки: струя выходит из повёрнутого и увеличенного
    // рисунка, а не из точки «примерно там».
    DRAG_SCALE: 1.6,

    camX: 0,
    camRaf: 0,
    drag: null,
    locked: false,
    tickId: null,

    init() {
        this.screenElement = document.getElementById('sloth-game');
        if (!this.screenElement) return;

        if (typeof MinigameWindow !== 'undefined') {
            this.win = MinigameWindow.attach(this.screenElement, {
                sin: 'sloth',
                onLeave: () => this.close(),
                // В саду нечего терять при выходе: всё, что сделано, уже лежит
                // в состоянии, а грядки зреют без игрока. Спрашивать «точно
                // выйти?» тут не о чем.
                canLeave: () => true
            });
        }

        this.svgEl = document.getElementById('gd-svg');
        this.camEl = document.getElementById('gd-cam');
        this.fgEl = document.getElementById('gd-fg');
        if (!this.svgEl) return;

        this.beds = (typeof GARDEN !== 'undefined') ? GARDEN.BEDS_TOTAL : 6;
        this.buildScene();

        if (typeof SlothShop !== 'undefined') SlothShop.init(this);

        // Своя debug-панель: сад меряется часами, и без отмотки времени
        // проверить его нельзя вообще никак.
        if (typeof GardenDebug !== 'undefined') GardenDebug.init(this.screenElement);

        this.svgEl.addEventListener('pointerdown', (e) => this.onDown(e));
        window.addEventListener('pointermove', (e) => this.onMove(e));
        window.addEventListener('pointerup', (e) => this.onUp(e));
        window.addEventListener('pointercancel', (e) => this.onUp(e));
    },

    open() {
        if (!this.screenElement) this.init();
        this.screenElement.classList.add('active');
        this.camX = 0;
        // Заходим всегда на первую грядку: «где я остановился в прошлый раз»
        // — вопрос, которого у сада нет, а память о нём сделала бы вход
        // непредсказуемым.
        this.bed = 0;
        this.drag = null;
        this.locked = false;
        // Метка пребывания ставится ЗАНОВО при каждом открытии: время, пока
        // сад был закрыт, лени не засчитывается.
        this.watchMark = GameTime.now();
        // Мгновенно: переезд при входе выглядел бы как «камера куда-то
        // поехала», хотя игрок ещё ничего не нажимал.
        this.goToBed(0, true);
        this.render();
        if (typeof GardenDebug !== 'undefined') GardenDebug.render();
        // Один кадровый цикл на весь сад: он двигает только КАРТИНКУ —
        // подросшее растение и струю из лейки. Состояние он не трогает.
        if (!this.tickId) this.tickId = setInterval(() => this.render(), 1000);
        // Отдельный кадровый цикл на ОДНУ полосу: перерисовывать ради неё
        // шесть грядок шестьдесят раз в секунду незачем, а двигаться она
        // должна гладко. Состояния он не трогает — только ширину.
        if (!this.gaugeRaf) {
            const step = () => {
                if (!this.gaugeRaf) return;
                this.renderGauge();
                this.gaugeRaf = requestAnimationFrame(step);
            };
            this.gaugeRaf = requestAnimationFrame(step);
        }
    },

    close() {
        // Закрытая мини-игра ничего не оставляет открытым внутри себя:
        // магазин, забытый поднятым, встретит игрока в следующий заход.
        if (typeof SlothShop !== 'undefined') SlothShop.close();
        // Досчитать пребывание за последний неполный кусок и записать: иначе
        // секунды между последней отрисовкой и выходом пропадают.
        this.settleWatch();
        GameState.save();
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
        this.screenElement.classList.remove('active');
        if (this.tickId) { clearInterval(this.tickId); this.tickId = null; }
        if (this.gaugeRaf) { cancelAnimationFrame(this.gaugeRaf); this.gaugeRaf = 0; }
        if (this.pourRaf) { cancelAnimationFrame(this.pourRaf); this.pourRaf = 0; }
        this.stopCam();
        this.work = null;
        this.stroke = null;
        this.sackOpen = false;
        const wl = document.getElementById('gd-work');
        if (wl) wl.innerHTML = '';
        const sl = document.getElementById('gd-fg-sack');
        if (sl) sl.innerHTML = '';
        LiquidStream.clear(this.stream);
        if (this.wetEl) this.wetEl.innerHTML = '';
        this.drag = null;
        this.watchMark = 0;
    },

    // Пребывание: считает Backend, экран только отдаёт метку и забирает новую.
    settleWatch() {
        if (!this.watchMark) return 0;
        const r = Backend.slothWatch(this.watchMark);
        this.watchMark = r.mark;
        return r.fill;
    },

    // ---------- КООРДИНАТЫ ----------
    // Через SvgSpace, а не через getScreenCTM: вся игра лежит в контейнере с
    // css-трансформацией, а учитывает ли CTM трансформацию ПРЕДКА — вопрос
    // браузера (src/core/svg-space.js). Внутри Telegram, где масштаб холста
    // перестал быть единицей, лопата от этого повисала в стороне от пальца.
    //
    // Камера сада — сдвиг вбок на camX И ЗУМ (см. setCam), одинаковый по
    // обеим осям, с неподвижной линией земли. Значит перевод в обе стороны —
    // это умножение и сложение, без матриц; но написан он РОВНО ОДИН РАЗ и
    // в двух направлениях. Пока зума не было, обратный перевод был «плюс
    // camX», и его переписали по месту в трёх файлах — ровно так и
    // расходятся описания одного и того же.
    toStage(e) { return SvgSpace.fromClient(this.svgEl, e.clientX, e.clientY); },

    // сцена → экран
    toStagePoint(x, y) {
        const Z = GARDEN_ART.ZOOM, zy = GARDEN_ART.zoomY();
        return { x: (x - (this.camX || 0)) * Z, y: zy + (y - zy) * Z };
    },

    // экран → сцена
    fromStagePoint(x, y) {
        const Z = GARDEN_ART.ZOOM, zy = GARDEN_ART.zoomY();
        return { x: x / Z + (this.camX || 0), y: zy + (y - zy) / Z };
    },

    toScene(e) {
        const p = this.toStage(e);
        return this.fromStagePoint(p.x, p.y);
    },

    // ---------- СБОРКА СЛОЁВ ----------
    // Каждый слой глубины живёт в своей группе и получает свой transform.
    // Узлы слоёв лежат в разметке (index.html), а не создаются здесь: их
    // порядок — это глубина, и задавать её сборкой строк значило бы прятать
    // её в коде.
    buildScene() {
        const html = GARDEN_ART.sceneLayers(this.beds);
        this.layerEls = {};
        GARDEN_ART.LAYERS.forEach(L => {
            const el = document.getElementById(L.key === 'front' ? 'gd-cam' : 'gd-' + L.key);
            if (!el) return;
            el.innerHTML = html[L.key];
            this.layerEls[L.key] = el;
        });
    },

    // Низкоуровневый сдвиг камеры. Переднему слою достаётся весь ход, дальним
    // — их доля: из этого и получается глубина (GARDEN_ART.LAYERS).
    //
    // Оставлен открытым (им пользуется прогон сада), но игрок сюда не
    // попадает: свободной панорамы больше нет, камера ездит только по
    // грядкам — см. goToBed.
    setCam(x) {
        const maxX = GARDEN_ART.camXMax(this.beds);
        this.camX = Math.max(0, Math.min(maxX, x));
        GARDEN_ART.LAYERS.forEach(L => {
            const el = (this.layerEls || {})[L.key];
            if (el) el.setAttribute('transform',
                GARDEN_ART.layerTransform(this.camX, L.factor));
        });
    },

    // ---------- ПЕРЕЕЗД ----------
    // Переезд считается покадрово здесь, а НЕ css-переходом на transform, и
    // причины тому две.
    //
    // Первая: css-переход двигает только картинку, а camX прыгал бы в
    // конечное значение сразу — и тап посреди переезда попадал бы в грядку,
    // которой под пальцем ещё нет. Перевод «экран → сцена» врал бы ровно
    // полсекунды, и поймать это было бы нечем.
    //
    // Вторая: transform у svg — атрибут, и переход по нему браузеры
    // анимируют кто как. На компьютере переезд шёл, а на телефоне — тот
    // самый скачок, на который и пожаловались.
    CAM_MS: 620,

    stopCam() {
        if (this.camRaf) { cancelAnimationFrame(this.camRaf); this.camRaf = 0; }
    },

    glideCam(to) {
        this.stopCam();
        const from = this.camX || 0;
        if (Math.abs(to - from) < 0.5) { this.setCam(to); return; }
        const t0 = performance.now(), ms = this.CAM_MS;
        const step = () => {
            const p = Math.min(1, (performance.now() - t0) / ms);
            // Разгон и торможение: ради них переезд и затевался. Ровное
            // движение читается как рывок карты, а не как «камера поехала»,
            // и разницы в скорости слоёв на нём не разглядеть.
            const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
            this.setCam(from + (to - from) * e);
            if (p < 1) this.camRaf = requestAnimationFrame(step);
            else this.camRaf = 0;
        };
        this.camRaf = requestAnimationFrame(step);
    },

    // ---------- ПЕРЕХОД МЕЖДУ ГРЯДКАМИ ----------
    // В центре внимания ВСЕГДА одна грядка. Свободная панорама была и убрана:
    // ею игрок ставил участок в любое положение, в том числе в такое, где
    // работать неудобно — полгрядки за краем, — и сам же этого не замечал.
    // Разбор — docs/plan/19-sloth-garden.md, раздел 1а.
    //
    // До какой грядки можно дойти: до всех открытых и ОДНОЙ закрытой справа.
    // Одна закрытая нужна затем, чтобы расширение участка было видно: цена
    // стоит на самом завале, и не дойдя до него, игрок не узнает, что участок
    // вообще растёт. Дальше второй закрытой хода нет — иначе видно пустую
    // даль, в которую ещё десять покупок.
    lastBed() {
        let lastOpen = -1;
        for (let i = 0; i < this.beds; i++) {
            const b = Backend.gardenBed(i);
            if (b && b.stage !== 'locked') lastOpen = i;
        }
        return Math.min(this.beds - 1, lastOpen + 1);
    },

    // Камера так, чтобы грядка стояла ПОСЕРЕДИНЕ экрана — любая, включая
    // крайние: поля участка по краям шире, чем видимая при зуме полоса, и в
    // упор камера не утыкается.
    goToBed(i, instant) {
        const want = Math.max(0, Math.min(this.lastBed(), i | 0));
        this.bed = want;
        const to = GARDEN_ART.camXForBed(want);
        if (instant) { this.stopCam(); this.setCam(to); }
        else this.glideCam(to);
        this.renderArrows();
    },

    step(dir) {
        const want = this.bed + dir;
        if (want < 0 || want > this.lastBed()) return;
        this.goToBed(want);
        if (typeof Haptics !== 'undefined') Haptics.tick();
    },

    // Стрелки живут в ПЕРЕДНЕМ ПЛАНЕ, в координатах экрана: они не часть
    // участка и ездить вместе с ним не должны.
    //
    // Стрелки, которой некуда вести, не существует вовсе. Приглушённая
    // стрелка в никуда была бы вопросом без ответа: игрок жмёт, ничего не
    // происходит, и показать причину нечем. Место она при этом не отдаёт —
    // обе стоят в своих углах намертво (docs/traps.md, п. 94).
    renderArrows() {
        const layer = document.getElementById('gd-fg-nav');
        if (!layer) return;
        const last = this.lastBed();
        layer.innerHTML =
            (this.bed > 0 ? GARDEN_ART.navArrow(-1) : '') +
            (this.bed < last ? GARDEN_ART.navArrow(1) : '');
    },

    // ---------- ОТРИСОВКА ----------
    // Грядки перерисовываются целиком: их шесть, каждая — десяток фигур, и
    // разбирать, что именно изменилось, дороже, чем собрать строку заново.
    render() {
        if (!this.camEl) return;
        // Пребывание досчитывается на каждой отрисовке: раз в секунду шкала и
        // так перерисовывается, второго механизма для этого не нужно.
        this.settleWatch();
        const beds = Backend.gardenSettle();
        beds.forEach((bed, i) => {
            const g = document.getElementById('gd-bed-' + i);
            if (!g) return;
            g.setAttribute('transform', `translate(${GARDEN_ART.bedX(i)} 0)`);
            const growth = this.growthOf(bed);
            const plant = bed.species ? PlantModel.generate(bed.species, bed.seed || 1) : null;
            // Содержимое грядки лежит во ВЛОЖЕННОЙ группе. Анимации приседания
            // и сбора правят transform, а на внешней группе им записана
            // позиция грядки в сцене — совпав, они выкидывали грядку к нулю,
            // и она прыгала через весь экран (docs/traps.md, п. 2).
            const work = (this.work && this.work.i === i)
                ? { action: this.work.action, frac: this.work.done / this.work.need } : null;
            g.innerHTML = `<g class="gd-bed-in">` + GARDEN_ART.bed(bed.stage, {
                seed: bed.seed || (i + 1) * 17,
                // Плод берётся из вида, а НЕ из его ключа: у травы плода
                // нет вовсе, и по ключу 'grass' кухня рисовала запасной
                // пищеблок — трава колосилась кирпичом.
                uid: i, plant, growth, work,
                fruitKey: (GARDEN.species[bed.species] || {}).fruit || null
            }) + this.badgeFor(bed, plant, growth, work) + `</g>`;
        });
        this.renderTools();
        this.renderGauge();
        this.renderWallet();
        // Стрелки зависят от того, сколько грядок открыто: разобрал завал —
        // справа появилась следующая. Без этого правая стрелка возникала бы
        // только при следующем заходе.
        this.renderArrows();
    },

    // Что грядка просит прямо сейчас. Одна таблица на всё: если состоянию
    // нечего сюда положить, значит от игрока в нём ничего не ждут.
    // Порядок тот же, что у полки с инструментами: рука → лопата → семечко →
    // лейка → грабли → рука.
    NEED: { locked: 'hand', empty: 'spade', dug: 'seed', sown: 'can', weedy: 'rake', ripe: 'hand' },

    // Значок висит НАД растением, а не на фиксированной высоте: иначе выросший
    // куст закрывает собой ровно ту подсказку, которая к нему относится.
    badgeFor(bed, plant, growth, work) {
        const need = this.NEED[bed.stage];
        const waiting = bed.stage === 'growing' || bed.stage === 'ripening';
        // Пока идёт ручная работа, над грядкой висит её кольцо: сколько
        // движений осталось. Просить инструмент в этот момент незачем — он
        // уже в руках.
        if (work) {
            // Выше обычного значка: под кольцом стоит инструмент в рабочем
            // положении, и на прежней высоте черенок лопаты упирался в него.
            const y = Math.max(110, GARDEN_ART.SOIL_Y - (plant ? GARDEN_ART.plantHeight(plant, growth) + 18 : 30) - 112);
            return `<g transform="translate(0 ${y.toFixed(0)})">${GARDEN_ART.badge('work', work.frac)}</g>`;
        }
        // Заваленная грядка просит не руку, а ЖЕТОН: она стоит денег, и
        // узнать об этом игрок должен до того, как начнёт её разгребать.
        if (bed.stage === 'locked') {
            const cost = Backend.gardenBedCost();
            const enough = GameState.currency(cost.currency) >= cost.amount;
            return `<g transform="translate(0 ${(GARDEN_ART.SOIL_Y - 92).toFixed(0)})">${
                GARDEN_ART.badge('price', 0, enough)}</g>`;
        }
        if (!need && !waiting) return '';
        // Высоту куста спрашиваем у того же кода, который его рисует: свой
        // расчёт разъезжается с настоящим, и значок садится кусту на голову.
        const top = plant ? GARDEN_ART.plantHeight(plant, growth) + 18 : 30;
        const y = Math.max(120, GARDEN_ART.SOIL_Y - top - 56);
        const art = waiting
            ? GARDEN_ART.badge('wait', growth, Backend.gardenLeft(bed))
            : GARDEN_ART.badge(need);
        return `<g transform="translate(0 ${y.toFixed(0)})">${art}</g>`;
    },

    // ---------- ШКАЛА ЛЕНИ ----------
    // Её не было видно вообще: игрок делал действия и не понимал, зачем.
    // Лежит поверх сцены сверху — снизу грядки и инструменты, и закрывать их
    // нечем.
    renderGauge() {
        const el = document.getElementById('gd-gauge-bar');
        if (!el) return;
        const max = GameState.maxValue('sloth');
        // Показывается ЗАСЧИТАННОЕ ПЛЮС НАБЕЖАВШЕЕ: в состоянии пребывание
        // фиксируется редко (на отрисовках и действиях), а глазу нужно
        // непрерывное движение. Формула та же, просто взятая на текущий
        // момент, а не на момент последней записи.
        //
        // Из-за этого и был «баг»: значение всегда росло ровно на сто за
        // минуту, но полоса обновлялась раз в секунду и ползла с задержкой,
        // а во время работы перерисовывалась чаще и догоняла правду. Работа
        // казалась выгоднее безделья, хотя капало одинаково. Чинить надо было
        // ПОКАЗ, а не начисление — и это стоило одного замера вместо правки
        // наугад.
        const v = Math.max(0, Math.min(1, (GameState.sinValue('sloth')
                                           + this.pendingWatch()) / max));
        // РАСТЯЖЕНИЕМ, а не шириной. Полоса обновляется каждый кадр, а
        // ширина — свойство раскладки: браузер пересчитывал всю страницу
        // шестьдесят раз в секунду ради полоски, которая ползёт на сотую
        // долю процента. Замер: Layout 721 мс из трёх секунд — больше, чем
        // вся отрисовка. Растяжение считает композитор, и стоит оно ноль.
        el.style.transform = `scaleX(${v.toFixed(4)})`;
    },

    // Сколько пребывания набежало с последней записи. Ничего не начисляет —
    // только считает, поэтому звать её можно хоть каждый кадр.
    pendingWatch() {
        if (!this.watchMark) return 0;
        const dt = GameTime.now() - this.watchMark;
        if (!(dt > 0)) return 0;
        return GameState.maxValue('sloth') * dt / GARDEN.WATCH_FULL_MS;
    },

    // Доля роста: от неё зависит высота растения, и она же — единственная
    // видимая шкала времени в саду.
    //
    // Рост идёт СКВОЗЬ ОБА ЭТАПА одной непрерывной линией: этап 1 поднимает
    // куст с нуля до трёх четвертей, этап 2 доводит до полного. Считать
    // каждый этап от нуля было ошибкой — прополотая грядка внезапно
    // становилась ростком, и выходило, что прополка растение уменьшила.
    GROW_STAGE1: 0.74,

    growthOf(bed) {
        const left = Backend.gardenLeft(bed);
        const tools = Backend.gardenTools();
        if (bed.stage === 'growing') {
            if (!bed.at) return 0.1;
            const hours = Backend.canTier().hours;
            const total = Math.max(1, hours - (bed.skipped || 0) * GARDEN.FERT_HOURS_PER_DUNG) * 3600000;
            const done = Math.max(0, Math.min(1, 1 - left / total));
            return 0.1 + done * (this.GROW_STAGE1 - 0.1);
        }
        if (bed.stage === 'weedy') return this.GROW_STAGE1;
        if (bed.stage === 'ripening') {
            if (!bed.at) return this.GROW_STAGE1;
            const mins = GARDEN.RAKE_TIERS[Math.min(tools.rake, GARDEN.RAKE_TIERS.length - 1)].minutes;
            const total = mins * ((GARDEN.species[bed.species] || {}).stage2 || 1) * 60000;
            const done = Math.max(0, Math.min(1, 1 - left / total));
            return this.GROW_STAGE1 + done * (1 - this.GROW_STAGE1);
        }
        return bed.stage === 'ripe' ? 1 : 0.1;
    },

    // ---------- ИНСТРУМЕНТЫ ----------
    // Полка с инструментами лежит в переднем плане: она не уезжает вместе с
    // участком, потому что инструменты игрок держит при себе.
    // Полка выложена ПО ПОРЯДКУ ПРИМЕНЕНИЯ, слева направо, как круг грядки и
    // идёт: лопата (лунка) → семена (посев) → лейка (полив) → какашка
    // (удобрение) → грабли (прополка). Порядок сам по себе объясняет цикл, и
    // искать нужную вещь не приходится — она следующая справа.
    tools() {
        const list = [{ kind: 'spade' }, { kind: 'sack' }, { kind: 'can' }];
        if (GameState.currency('dung') > 0) list.push({ kind: 'dung' });
        list.push({ kind: 'rake' });
        // Вход в магазин — последним в ряду. Он не инструмент и в круг грядки
        // не входит, поэтому и стоит с краю, а не между лейкой и граблями:
        // порядок полки объясняет цикл, и чужой предмет в середине его рвёт.
        //
        // Сейчас это просто корзина. Нарративное оформление магазина —
        // отдельная работа; здесь нужна работающая механика, а не вид.
        list.push({ kind: 'shop' });
        return list;
    },

    // Передний план разложен на слои РАЗ и навсегда: полка перерисовывается
    // каждую секунду, а пул шариков струи создаётся один раз и переживать
    // перерисовку обязан. Раньше `fgEl.innerHTML = ...` сносил бы его вместе
    // с полкой.
    buildFg() {
        if (document.getElementById('gd-fg-tools')) return;
        this.fgEl.innerHTML =
            `<g id="gd-fg-wet"></g>
             <g id="gd-fg-stream" filter="url(#gd-goo)" fill="${PALETTE.garden.water[500]}"></g>
             <g id="gd-fg-nav"></g>
             <g id="gd-fg-tools"></g>
             <g id="gd-fg-sack"></g>`;
        this.wetEl = document.getElementById('gd-fg-wet');
        // Тот же движок струи, что на кухне (src/core/liquid-stream.js).
        // Шарики летят в координатах ЭКРАНА: лейку игрок держит перед собой, и
        // ездить вместе с участком она не должна.
        // Числа подобраны по картинке, и вот что каждое держит:
        //   emitMs пореже — струя рвалась на отдельные бусины на пути от
        //     поднятой лейки до земли (это метра полтора по сцене);
        //   bow небольшой — у лейки короткий носик, и вода из неё падает
        //     почти сразу, а не летит дугой, как из опрокинутой бутыли.
        //   taper мягче кухонного — лейку поднимают высоко, и при обычном
        //     сужении струя таяла над самой грядкой, не долетев.
        this.stream = LiquidStream.make(document.getElementById('gd-fg-stream'), {
            pool: 64, r: 8, emitMs: 15, base: 0.85, acc: 1.4, bow: 0.22, ref: 220, taper: 0.08
        });
    },

    // ---------- ПОЧЕМУ ПОЛКА НЕ У САМОЙ КРОМКИ ----------
    // Холст 844 единицы высотой, но мини-игра видит НЕ ВЕСЬ: шапку окна
    // занимает заголовок с крестиком, а svg сцены растянут по ширине
    // (preserveAspectRatio="slice") и потому срезан сверху и снизу примерно
    // на два десятка единиц. Полка стояла на 782 и упиралась в этот срез с
    // запасом в три единицы — на телефоне её срезало (docs/traps.md, п. 134).
    //
    // 770 даёт полтора десятка единиц запаса. Ровнять по 844 нельзя: до
    // нижней кромки холста полка никогда не доходит.
    SHELF_Y: 770,

    renderTools() {
        this.buildFg();
        const list = this.tools();
        const step = Math.min(64, 340 / Math.max(1, list.length));
        const x0 = 195 - step * (list.length - 1) / 2;
        document.getElementById('gd-fg-tools').innerHTML = list.map((t, i) => {
            const art = t.kind === 'sack' ? GARDEN_ART.sackClosed() : GARDEN_ART.tool(t.kind);
            const badge = t.kind === 'dung'
                ? `<text class="gd-count" x="0" y="34">${GameState.currency('dung')}</text>` : '';
            return `<g class="gd-tool" data-kind="${t.kind}"
                        transform="translate(${(x0 + i * step).toFixed(1)} ${this.SHELF_Y})">${art}${badge}</g>`;
        }).join('');
    },

    // ---------- МЕШОК С СЕМЕНАМИ ----------
    // Открывается тапом, закрывается тапом мимо или тем, что семечку вынули.
    // Один жест на всё: в саду больше ничего не открывается удержанием, и
    // отдельное правило для одного предмета читается как поломка.

    // Что лежит в мешке. Порядок ячеек — порядок видов в конфиге, и он
    // ПОСТОЯНЕН: место каждого вида закреплено, чтобы через неделю игрок
    // тянулся за помидором не глядя.
    // Что лежит в мешке. Порядок ячеек — порядок видов в конфиге, и он
    // ПОСТОЯНЕН: место каждого вида закреплено, чтобы через неделю игрок
    // тянулся за помидором не глядя.
    //
    // Показываются только ОТКРЫТЫЕ виды: мешок — это склад, а не витрина.
    // Покупка семян и открытие новых видов живут в магазине
    // (src/minigames/sloth/sloth-shop.js), и цен здесь нет намеренно —
    // иначе одно и то же покупалось бы в двух местах.
    sackItems() {
        const known = Backend.gardenSeedKeys();
        return Object.keys(GARDEN.species)
            .filter(key => known.indexOf(key) !== -1)
            .map(key => {
                const n = Backend.gardenSeedCount(key);
                // null — «бесконечно»: у травы счётчика нет, как у пищеблока
                // в холодильнике. Цифра «∞» была бы значком без смысла.
                const count = n === Infinity ? null : n;
                return { key, count, state: count === 0 ? 'empty' : 'have' };
            });
    },

    // Хватает ли на цену. Одна читалка на мешок и на ценники полки: две
    // разошлись бы на первой же валюте, добавленной в одну из них.
    affordable(price) {
        return !Object.keys(price || {}).some(cur => GameState.currency(cur) < price[cur]);
    },

    openSack() {
        this.sackOpen = true;
        const layer = document.getElementById('gd-fg-sack');
        if (layer) layer.innerHTML = GARDEN_ART.sackOpen(this.sackItems());
        this.renderTools();
    },

    closeSack() {
        this.sackOpen = false;
        const layer = document.getElementById('gd-fg-sack');
        if (layer) layer.innerHTML = '';
        this.renderTools();
    },

    // ---------- КОШЕЛЁК ----------
    // Сено и жетон лени. Заведён вместе с магазином, и не для красоты: отказ
    // «не хватило» обязан показываться ТАМ, ГДЕ ЛЕЖИТ НЕДОСТАЮЩЕЕ, а не под
    // пальцем (docs/traps.md, п. 91). Покупки в саду разбросаны по предметам —
    // ценники на полке, цены в мешке, цена грядки на самой грядке, — и общего
    // места для отказа до него не было.
    renderWallet() {
        const hay = document.getElementById('gd-w-hay');
        const tok = document.getElementById('gd-w-token');
        if (!hay || !tok) return;
        // Значки рисуются тем же кодом, что и в саду: жетон лени на полке и
        // жетон лени в кошельке — один предмет (docs/traps.md, п. 83).
        const svg = (inner) => `<svg viewBox="-20 -20 40 40" class="gd-coin-art">${inner}</svg>`;
        hay.innerHTML = svg(GARDEN_ART.hay()) + `<b>${GameState.currency('hay')}</b>`;
        tok.innerHTML = svg(GARDEN_ART.token(true)) + `<b>${GameState.currency('sloth_token')}</b>`;
    },

    // Вздрогнуть валютой, которой не хватило. Запасной адресат — весь
    // кошелёк: пункт 99 из граблей, ответ рисуется на том, что есть ВСЕГДА.
    flashLack(cur) {
        const el = document.querySelector(`.gd-coin[data-cur="${cur}"]`)
                || document.getElementById('gd-wallet');
        if (!el) return;
        el.classList.remove('gd-no');
        void el.offsetWidth;
        el.classList.add('gd-no');
        clearTimeout(this._lackTimer);
        this._lackTimer = setTimeout(() => el.classList.remove('gd-no'), 900);
        if (typeof Haptics !== 'undefined') Haptics.notify('error', true);
    },
};

if (typeof window !== 'undefined') window.SlothMinigame = SlothMinigame;
