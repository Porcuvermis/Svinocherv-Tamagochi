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
    //
    // null — «неизвестно, перерисовать обязательно». Именно null, а не пустая
    // строка: пустая строка — это ЗАКОННАЯ подпись пустого списка, и когда
    // ею же помечали «надо перерисовать», снятие последней кучки совпадало
    // с меткой и перерисовка не происходила. Узел оставался на экране, в
    // состоянии его уже не было, и он навсегда переставал реагировать на
    // тапы — та самая неубираемая кучка. Появление следующей кучки меняло
    // подпись, слой перерисовывался, и мёртвый узел «сам пропадал».
    poopsKey: null,

    // Насколько кучки должны отстоять друг от друга. Размер кучки около
    // четырнадцати единиц, так что тридцать — это «рядом, но не внахлёст».
    POOP_GAP: 30,

    // Свободное место рядом с точкой: если там уже что-то лежит, отходим по
    // спирали. Почему это вообще нужно: между двумя быстрыми кормёжками
    // червь не успевает отойти, и вторая кучка ложится ровно на первую.
    // Выглядит как ОДНА кучка, тап убирает верхнюю, нижняя остаётся на том же
    // месте — и кажется, что тап не сработал.
    freeSpotNear(base, poops) {
        const taken = poops.filter(p => p.x != null);
        const busy = (x, y) => taken.some(p => Math.hypot(p.x - x, p.y - y) < this.POOP_GAP);
        if (!busy(base.x, base.y)) return base;
        for (let i = 1; i <= 14; i++) {
            const a = i * 2.1;                       // расходящаяся спираль
            const r = this.POOP_GAP * (0.9 + i * 0.22);
            // По вертикали смещаемся меньше: пол в перспективе, шаг вглубь
            // виден сильнее, чем шаг вбок.
            const x = base.x + Math.cos(a) * r;
            const y = base.y + Math.sin(a) * r * 0.45;
            if (!busy(x, y)) return { x, y };
        }
        return base;   // всё занято — кладём как есть, лишь бы не потерять
    },

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
            const spot = this.freeSpotNear({ x: pos.x, y: pos.y + 10 }, poops);
            p.x = spot.x;
            p.y = spot.y;
            changed = true;
        });
        if (changed) GameState.save();

        // Перерисовываем, только когда список реально поменялся. Иначе узлы
        // пересоздавались бы шестьдесят раз в секунду — и ради ничего, и с
        // побочным эффектом: тап не успевал бы попасть по элементу, который
        // уже заменили новым.
        const key = poops.map(p => p.id + ':' + Math.round(p.x || 0)).join('|');
        if (this.poopsKey !== null && key === this.poopsKey) return;
        this.poopsKey = key;
        MainWormHandle.setRoomObjects(poops);
    }
};

// ================= САМОЧУВСТВИЕ: ОТ ШКАЛ К ВИДУ ЧЕРВЯ =================
// Довольность считает WormCondition, здесь она только доезжает до картинки:
// морда, худоба, серость, смерть.
//
// Почему это отдельный цикл, а не часть пищеварения: пищеварению нужны
// пятнадцать обновлений в секунду (комок ползёт), а довольность меняется
// ЧАСАМИ — раза в секунду хватает с колоссальным запасом. Дёргать из-за неё
// геометрию чаще было бы чистой тратой батареи.
const WormMood = {
    timer: null,
    shownGrey: null,
    wasDead: null,

    start() {
        if (this.timer) return;
        this.apply();
        this.timer = setInterval(() => {
            if (document.hidden) return;   // в фоне рисовать некому
            this.apply();
        }, 1000);
    },

    apply() {
        if (!MainWormHandle || typeof WormCondition === 'undefined') return;
        if (typeof GameState === 'undefined' || !GameState.data) return;

        const dead = WormCondition.dead();

        // Смена жизнь/смерть — единственное здесь, что меняется скачком.
        if (dead !== this.wasDead) {
            this.wasDead = dead;
            document.body.classList.toggle('worm-dead', dead);
            // Мёртвый не бродит по комнате и не моргает. Это не косметика:
            // бродящий труп с закрытыми глазами выглядел бы спящим.
            if (MainWormHandle.setOptions) {
                MainWormHandle.setOptions({ wander: !dead, blink: !dead });
            }

            // Ожил — распрямляем то, что уронила смерть. Именно здесь, на
            // переходе, а не в мимике довольности: наклон головы и изгиб
            // хвоста ей не принадлежат, а хвостом вдобавок распоряжается
            // пищеварение. Писать в него каждую секунду значило бы затирать
            // анимацию какания на полудвижении.
            if (!dead) {
                MainWormHandle.setLivePose({ headTilt: 0, tailBendAngle: 0 });
            }
        }

        if (dead) {
            // Мёртвая морда — не «очень грустная», а ПУСТАЯ: закрытые глаза и
            // прямая линия рта. Грусть — это ещё живое выражение, у трупа его
            // быть не должно.
            //
            // Отдельная забота — не дать смерти читаться сном. Стоящий столбом
            // червь с закрытыми глазами выглядит именно спящим, поэтому здесь
            // всё, что можно уронить, уронено: голова свесилась набок, уши
            // легли совсем плоско, хвост обмяк. Настоящей лежачей позы у
            // рендерера пока нет — она стоит отдельной работы (см.
            // docs/plan/07-condition.md).
            MainWormHandle.setLivePose({
                mouthCurve: -0.05,
                eyelidLevel: 1,
                gazeY: 0.3,
                browRaise: 0,
                earTilt: 42,
                headTilt: 21,
                tailBendAngle: 26,
                bellyScale: 1 - ECONOMY.condition.witherThin
            });
            this.setGrey(0.06);
            return;
        }

        const mood = WormCondition.mood();
        const wither = WormCondition.wither(mood);

        // Мимика и худоба идут одним патчем: это те же самые «живые» каналы,
        // которыми пользуются мини-игры, поэтому пока открыта мини-игра со
        // своей мимикой, она просто перебивает эту — и наоборот, по выходе
        // самочувствие возвращается само, без кода восстановления.
        const pose = WormCondition.facePose(mood);
        pose.bellyScale = wither.belly;
        MainWormHandle.setLivePose(pose);

        this.setGrey(wither.saturation);
    },

    // Обесцвечивание — CSS-фильтром, а не подменой цветов в модели. Причина:
    // цвета червя размазаны по десяткам градиентов, и пересобирать их ради
    // оттенка значит перестраивать весь SVG. Фильтр же считает видеокарта, и
    // он ничего не знает про устройство персонажа — сереет и кожа, и рёбра, и
    // будущая косметика, без единой правки.
    //
    // Фильтр висит на слоях ЧЕРВЯ, а не на всей сцене. Сначала он стоял на
    // контейнере — и вместе с червём выцветала комната, хотя она тут ни при
    // чём: истощён персонаж, а не его жильё. Хуже того, это съедало сам
    // эффект — когда фон сереет вместе с телом, контраст между ними не
    // меняется, и понять по картинке, что червю плохо, становится нельзя.
    // Комната обязана оставаться цветной: она точка отсчёта.
    setGrey(saturation) {
        const shown = Math.round(saturation * 100) / 100;
        if (this.shownGrey === shown) return;   // фильтр — не бесплатная запись
        this.shownGrey = shown;

        // Вместе с цветом уходит и яркость: обескровленный червь ещё и
        // темнеет. Полностью здоровому фильтр не ставится вовсе.
        const value = shown >= 0.999
            ? ''
            : `saturate(${shown}) brightness(${(0.72 + shown * 0.28).toFixed(3)})`;

        // Слизь — тоже след червя, она выцветает вместе с ним. Кучки на полу
        // (worm-room-objects) намеренно НЕ трогаем: то, что уже отделилось от
        // тела, живёт своей жизнью и вянуть вместе с ним не обязано.
        ['.worm-char-layer', '.worm-slime-layer'].forEach(sel => {
            const el = document.querySelector('#worm-stage ' + sel);
            if (el) el.style.filter = value;
        });
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
            // Тёплый тёмный, как «за коробкой» у локации: этот фон видно
            // только до того, как отрисуется SVG комнаты, и холодный серый
            // давал в этот момент заметную вспышку не того цвета.
            container.style.background = '#2a2119';
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
                Backend.removePoop(id);
                // Перерисовываем в любом случае. Если тапнули по кучке,
                // которой в состоянии уже нет (узел устарел), то без этого
                // он останется на экране навсегда и будет молча съедать
                // тапы — ровно та «какашка, которая ни на что не реагирует».
                WormDigestion.poopsKey = null;   // перерисовать обязательно
                WormDigestion.placePoops();
            },
            wander: true,
            // Тап по свободному полу — «иди сюда». Только на главном экране:
            // в мини-играх червём распоряжается сама мини-игра.
            tapToWalk: true,
            // Главный экран — комната с полом в перспективе.
            room: true,
            // Какая именно комната — из состояния: локация это косметика,
            // она сохраняется вместе с остальным прогрессом.
            location: (GameState.data && GameState.data.room)
                ? GameState.data.room.location : undefined,
            blink: true,
            anchorX: 0.5,
            anchorY: 0.55
        });

        window.MainWormHandle = MainWormHandle;

        // Пищеварение и то, что лежит на полу.
        WormDigestion.start();
        WormDigestion.placePoops();

        // Самочувствие: морда и вид тела по семи шкалам.
        WormMood.start();
    } catch (err) {
        // Любая другая ошибка внутри рендера — тоже наружу через alert(),
        // чтобы можно было прочитать текст без доступа к консоли браузера.
        alert('Свиночервь: ошибка при отрисовке — ' + (err && err.message ? err.message : err));
        console.error(err);
    }
}
