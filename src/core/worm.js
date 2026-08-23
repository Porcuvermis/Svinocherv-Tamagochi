// ================= ГЛАВНЫЙ ЭКРАН: МОНТАЖ СВИНОЧЕРВЯ =================
// Раньше здесь была вся отрисовка на Canvas. Теперь вся отрисовка живёт в
// WormRenderer (src/core/worm-renderer.js) и работает с общей моделью
// персонажа (src/core/worm-model.js) — тем же кодом, что используют и
// мини-игры. Этот файл только загружает модель игрока и монтирует рендерер
// в контейнер главного экрана.

let MainWormHandle = null;
let MainWormModel = null;

// Отметины из состояния игрока. Состояния может не быть вовсе (мини-игра
// монтирует червя у себя, отдельный экран) — тогда просто пустой список.
function wormMarksFromState() {
    if (typeof GameState === 'undefined' || !GameState.data) return [];
    return GameState.data.scars || [];
}

// Перерисовать червя с актуальными отметинами. Дёргается, когда появилась
// новая: пересборка SVG — вещь недешёвая, поэтому по событию, а не по
// таймеру и не на каждое сохранение состояния.
function refreshWormMarks() {
    if (!MainWormHandle) return;
    MainWormHandle.setOverride({ scars: wormMarksFromState() });
}

// ================= ПИЩЕВАРЕНИЕ: ОТ МЕТКИ ВРЕМЕНИ К КАРТИНКЕ =================
// Состояние пищеварения — одна метка «когда покормили». Здесь она
// превращается в то, что видно: комки, ползущие по кишке, наполненный
// желудок, кучка на полу.
//
// Считается каждый кадр и ничего не накапливает: свернул приложение на час,
// вернулся — комок уже в конце пути, а не там, где его застали. Это тот же
// принцип, что и у шкал грехов, просто применённый к анимации.
const WormDigestion = {
    raf: null,
    poopAnimUntil: 0,

    // Где вдоль тракта лежит желудок. Тракт идёт от головы к хвосту, а
    // живот — третье звено цепи, поэтому доля считается от длины цепи: у
    // подросшего червя хвостовая часть длиннее, и желудок оказывается ближе
    // к голове, как и должно быть.
    stomachAt(model) {
        const fixed = (model.fixedSegments || []).length;
        const growing = (model.growingSegments || []).length;
        const total = fixed + 1 + growing + 1;
        return (fixed + 1) / total;
    },

    // Доля кэшируется: пересчитывать её каждый кадр незачем, длина цепи
    // меняется только при взрослении.
    stomachS: null,

    lastAt: 0,
    wasActive: false,

    start() {
        if (this.raf) return;
        this.stomachS = MainWormModel ? this.stomachAt(MainWormModel) : 0.5;
        const tick = (now) => {
            this.raf = requestAnimationFrame(tick);
            if (document.hidden) return;
            // Пятнадцати обновлений в секунду хватает с запасом: самый
            // быстрый комок ползёт пятнадцать секунд, а самый медленный
            // десять минут. Шестьдесят раз в секунду дёргать геометрию кишки
            // недопустимо дорого — см. update().
            if (now - this.lastAt < 66) return;
            this.lastAt = now;
            this.update();
        };
        this.raf = requestAnimationFrame(tick);
    },

    update() {
        if (!MainWormHandle || typeof GameState === 'undefined' || !GameState.data) return;

        const cfg = ECONOMY.digestion;
        const sStomach = this.stomachS != null ? this.stomachS : 0.5;
        const d = GameState.digestion();

        let boluses = [];
        let stomachFill = 0;

        if (d.phase === 'swallow') {
            // Куски заглатываются по одному, с задержкой: это глотки, а не
            // одна колбаса.
            for (let i = 0; i < cfg.bites; i++) {
                const t = (d.elapsed - i * cfg.biteGapSeconds) / cfg.swallowSeconds;
                if (t <= 0) continue;               // ещё не проглочен
                if (t >= 1) { stomachFill += 1 / cfg.bites; continue; }  // уже в желудке
                boluses.push({ s: sStomach * t, size: 1 });
            }
        } else if (d.phase === 'stomach') {
            // Переваривается: содержимое медленно оседает.
            stomachFill = 1 - d.progress * 0.35;
        } else if (d.phase === 'bowel') {
            // Из желудка к хвосту идёт уже один комок.
            stomachFill = Math.max(0, 0.65 - d.progress * 0.65);
            boluses.push({ s: sStomach + (1 - sStomach) * d.progress, size: 1.15 });
        }

        // Пока переваривать нечего, рендерер не трогаем совсем. Это не
        // экономия на спичках: setDigestion считает длину пути кишки, а её
        // строка меняется каждый кадр вслед за телом — то есть кеш длины
        // каждый раз недействителен, и промер идёт заново. На восьмикратно
        // замедленном процессоре это стоило четверти кадров.
        const active = boluses.length > 0 || stomachFill > 0;
        if (active || this.wasActive) {
            MainWormHandle.setDigestion({ boluses, stomachFill });
        }
        this.wasActive = active;

        // Пора ли какать — решает Backend (он же начисляет всё остальное).
        const fresh = Backend.settleDigestion();
        if (fresh) {
            this.poopAnimUntil = GameTime.now() + 1400;
        }

        // Анимация «покакивания»: хвост поджимается и подрагивает.
        if (this.poopAnimUntil > GameTime.now()) {
            const left = (this.poopAnimUntil - GameTime.now()) / 1400;
            MainWormHandle.setLivePose({ tailBendAngle: Math.sin(left * Math.PI * 6) * 18 * left });
            return;                                  // кучку кладём после анимации
        }
        if (this.poopAnimUntil) {
            MainWormHandle.setLivePose({ tailBendAngle: 0 });
            this.poopAnimUntil = 0;
        }

        this.placePoops();
    },

    // Подпись списка кучек: по ней видно, изменилось ли что-нибудь.
    poopsKey: '',

    // Кучка появляется там, где червь стоял, — под хвостом. Координаты
    // запоминаются один раз: убежал дальше — кучка осталась на месте.
    placePoops() {
        const poops = GameState.data.room.poops;
        let changed = false;
        poops.forEach(p => {
            if (p.x != null) return;
            // Именно под хвостом, а не «слева от червя»: тело поворачивается
            // по ходу движения, и хвост уезжает вместе с ним.
            const pos = MainWormHandle.getPartPoint
                ? MainWormHandle.getPartPoint('tail')
                : MainWormHandle.getPosition();
            p.x = pos.x;
            p.y = pos.y + 10;
            changed = true;
        });
        if (changed) GameState.save();

        // Перерисовываем, только когда список реально поменялся. Иначе узлы
        // пересоздавались бы шестьдесят раз в секунду — и ради ничего, и с
        // побочным эффектом: тап не успевал бы попасть по элементу, который
        // уже заменили новым.
        const key = poops.map(p => p.id + ':' + Math.round(p.x || 0)).join('|');
        if (key === this.poopsKey) return;
        this.poopsKey = key;
        MainWormHandle.setRoomObjects(poops);
    }
};

function initWorm() {
    try {
        // Без этих двух файлов (и соответствующих <script> в index.html)
        // рендерер персонажа работать не может — сообщаем об этом явно
        // через alert(), раз консоль недоступна (iPhone/Safari).
        if (!window.WormModelAPI) {
            alert('Свиночервь: не найден src/core/worm-model.js — проверь, что файл добавлен в репозиторий и подключён в index.html до worm.js.');
            return;
        }
        if (!window.WormRenderer) {
            alert('Свиночервь: не найден src/core/worm-renderer.js — проверь, что файл добавлен в репозиторий и подключён в index.html до worm.js.');
            return;
        }

        let container = document.getElementById('worm-stage');

        // Совместимость: если разметка ещё не обновлена и в HTML остался
        // старый <canvas id="gameCanvas">, сами подменяем его на
        // div-контейнер — ничего вручную в index.html менять не обязательно.
        if (!container) {
            const legacyCanvas = document.getElementById('gameCanvas');
            if (legacyCanvas) {
                container = document.createElement('div');
                container.id = 'worm-stage';
                legacyCanvas.replaceWith(container);
            }
        }
        if (!container) {
            alert('Свиночервь: не найден контейнер #worm-stage (и старого #gameCanvas тоже нет) — проверь разметку index.html внутри #game-container.');
            return;
        }

        // Критичные для видимости стили выставляем прямо здесь, а не
        // полагаемся только на style.css — так персонаж не пропадёт, даже
        // если CSS-файл ещё не подтянул правило под #worm-stage.
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        if (!container.style.zIndex) container.style.zIndex = '1';
        if (!container.style.background) {
            container.style.background = 'radial-gradient(circle, #3a3a3a 0%, #1a1a1a 100%)';
        }

        const model = window.WormModelAPI.loadWormModel();
        MainWormModel = model;

        // Внешность червя (модель) и его летопись (отметины) — разные вещи и
        // хранятся раздельно: модель это «как он устроен», отметины — «что с
        // ним было». Правда об отметинах живёт в состоянии игрока, а сюда
        // они попадают только на время отрисовки.
        model.scars = wormMarksFromState();

        MainWormHandle = window.WormRenderer.mount(container, model, {
            context: 'main',
            // Тап по кучке на полу убирает её. Уборка идёт через Backend, а
            // не прямо в состояние: когда кучка станет ресурсом, начисление
            // добавится там же, а не в обработчике тапа.
            onRoomObjectTap: (id) => {
                if (typeof Backend === 'undefined') return;
                if (Backend.removePoop(id)) {
                    WormDigestion.poopsKey = '';   // список изменился — перерисовать
                    WormDigestion.placePoops();
                }
            },
            wander: true,
            // Главный экран — комната с полом в перспективе.
            room: true,
            blink: true,
            anchorX: 0.5,
            anchorY: 0.55
        });

        window.MainWormHandle = MainWormHandle;

        // Пищеварение и то, что лежит на полу.
        WormDigestion.start();
        WormDigestion.placePoops();
    } catch (err) {
        // Любая другая ошибка внутри рендера — тоже наружу через alert(),
        // чтобы можно было прочитать текст без доступа к консоли браузера.
        alert('Свиночервь: ошибка при отрисовке — ' + (err && err.message ? err.message : err));
        console.error(err);
    }
}
