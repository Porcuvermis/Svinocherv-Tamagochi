// ================= РОГАЛИК ГНЕВА: КАРТА ЗАБЕГА =================
// Карта в духе жанра: извилистая дорожка снизу вверх, узлы — точки на ней.
// Игрок жмёт на следующую доступную точку, и так до босса. Сам забег живёт не
// здесь, а в состоянии (state.runs.wrath) и в Backend — этот файл только
// показывает и зовёт.
//
// ---------- ПОЧЕМУ ЗАБЕГ НЕ СЕССИЯ ЭКРАНА ----------
// Мобильная сессия обязательно прервётся: звонок, свёрнутый Telegram,
// разряженный телефон. Потерять забег на шесть боёв вместе с жетоном — худшее,
// что может случиться в игре (docs/plan/03-wrath.md). Поэтому состояние
// пишется после КАЖДОГО узла, а вход при незавершённом забеге предлагает
// продолжить, а не начинает новый.
//
// ---------- ПОЧЕМУ КАРТА РИСУЕТСЯ СКРИПТОМ ----------
// Точки стоят по координатам из конфига (ECONOMY...rogue.map), а дорожка
// проводится через них. Значит подвинуть узел или вставить новый — это правка
// таблицы, а не разметки. Разбор и порядок работ — docs/plan/10-wrath-rogue.md.

const WrathRogue = {

    // Как показывается узел карты. Данные, а не ветвление в разметке: узлов
    // станет больше, и добавляться они должны записью.
    // Виды узлов — только значками (CLAUDE.md, инвариант 9). Что это за
    // узел, говорит картинка; что там будет, говорят числа рядом.
    NODE_KINDS: {
        fight:    { emoji: '⚔️' },
        miniboss: { emoji: '👹' },
        boss:     { emoji: '💀' },
        heal:     { emoji: '❤️' },
        shop:     { emoji: '💰' },
        event:    { emoji: '❓' },
        fork:     { emoji: '👆' }
    },

    host: null,
    root: null,
    statusEl: null,
    trailEl: null,
    nodesEl: null,
    cardEl: null,
    actionEl: null,
    messageEl: null,
    abandonEl: null,
    message: null,
    // ---------- БРОСИТЬ ЗАБЕГ — ТОЛЬКО УДЕРЖАНИЕМ ----------
    // Раньше хватало двух тапов: первый взводил флаг, второй бросал забег.
    // Этого мало. Взведённое состояние висело БЕЗ СРОКА — тапнул случайно,
    // через десять минут задел ещё раз, и забег вместе с жетоном кончился;
    // а на телефоне два тапа подряд по одному месту случаются сами собой.
    //
    // Теперь это УДЕРЖАНИЕ: палец на флаге полторы секунды, кнопка при этом
    // наливается. Случайный тап не делает ничего вообще, а отпустить раньше
    // времени можно в любой момент. Жест не новый — им же открывается
    // прокачка в лобби (WrathLobby.bindHold), и там он выбран по той же
    // причине: тап слишком дёшев для того, что стоит дорого.
    ABANDON_MS: 1500,
    abandonTimer: null,
    // Не хватило жетона на вход — он вспыхивает в кошельке (как в магазине).
    lack: null,
    level: 0,      // выбранная сложность в окне входа; забег хранит свою
    lackTimer: null,
    // Итог законченного забега. Пока он на экране, войти в новый нельзя:
    // забег только что кончился, палец ещё на кнопке, а вход стоит жетон.
    summary: null,

    init(host) {
        this.host = host;
        this.root = document.getElementById('wrath-rogue');
        if (!this.root) return;

        this.statusEl = document.getElementById('rogue-status');
        this.trailEl = document.getElementById('rogue-trail');
        this.nodesEl = document.getElementById('rogue-nodes');
        this.cardEl = document.getElementById('rogue-card');
        this.actionEl = document.getElementById('rogue-action');
        this.messageEl = document.getElementById('rogue-message');
        this.abandonEl = document.getElementById('rogue-abandon');

        // Своей кнопки возврата у экрана нет: она одна на все меню и стоит
        // в общем подвале (index.html, #wrath-foot).
        this.bindAbandon();
    },

    // Сообщение здесь НЕ сбрасывается: с боя на карту возвращаются через
    // enter(), а показать надо именно то, что этот бой принёс. Гасится оно
    // в leave() — то есть при уходе в лобби или закрытии окна.
    enter() {
        this.cancelAbandon();
        this.render();
    },

    // Уход с экрана. Итог забега здесь и умирает: на карту из боя возвращаются
    // не через leave(), а через host.showRogue(), и показанный итог должен
    // пережить эту дорогу.
    leave() {
        this.message = null;
        this.summary = null;
        this.cancelAbandon();
    },

    // ---------- ПОКАЗ ----------
    render() {
        if (!this.root) return;
        // Кошелёк в шапке подновляется СРАЗУ. Забег — единственный экран, где
        // валюта уходит и приходит БЕЗ смены экрана: вход платит жетоном,
        // мини-босс даёт осколок, босс — жетон и золото. Пока этого не было,
        // шапка врала до следующего перехода, и заметнее всего на входе.
        if (typeof WrathLobby !== 'undefined') WrathLobby.refreshWallet();
        const run = this.summary ? null : Backend.run();

        // Здоровье кончилось, а узел не засчитан: единственный способ сюда
        // попасть — закрыть игру посреди проигранного боя. Забег окончен,
        // и делать вид, что он продолжается, нельзя.
        if (run && run.hp <= 0) {
            this.takeAnswer(Backend.resolveNode('lose'));
            this.render();
            return;
        }

        this.renderStatus(run);
        this.renderMap(run);
        this.renderCard(run);
        this.showMessage();

        if (this.abandonEl) {
            this.abandonEl.classList.toggle('shown', !!run);
            // Забега нет — недодержанное удержание тоже ни к чему.
            if (!run) this.cancelAbandon();
        }
        // Под итогом забега бросать уже нечего: забег кончился.
    },

    // ---------- СТРОКА ЗАБЕГА ----------
    // Кошелька здесь больше нет: он в общей шапке греха, над этим экраном.
    // Строка показывает только то, что живёт ВНУТРИ забега и нигде больше не
    // видно, — его собственное здоровье, зубы и набранные усиления. Пока
    // забега нет, показывать нечего.
    renderStatus(run) {
        if (!this.statusEl) return;
        if (!run) {
            // Не просто пустая: СКРЫТАЯ. Пустая строка с рамкой и отступами —
            // это полоса на экране, которая выглядит элементом и ничем не
            // является; ровно то, от чего чистили это окно.
            this.statusEl.innerHTML = '';
            this.statusEl.classList.add('empty');
            return;
        }
        this.statusEl.classList.remove('empty');

        // Усиления забега стоят рядом со здоровьем: они и есть ответ на
        // вопрос «что у меня накопилось», а больше его нигде не видно.
        const bonus = run.bonus || {};
        const chips = [];
        if (bonus.damage) chips.push(`<span class="rogue-chip">🗡 +${bonus.damage}</span>`);
        if (bonus.armor) chips.push(`<span class="rogue-chip">🛡 +${bonus.armor}</span>`);

        this.statusEl.innerHTML = `
            <span class="wallet-item"><b>❤️ ${run.hp}/${run.maxHp}</b></span>
            <span class="wallet-item rogue-teeth"><b>🦷 ${run.teeth}</b></span>
            <span class="rogue-chips">${chips.join('')}</span>
        `;
    },

    // ---------- КАРТА ----------
    // Карта — это ШАГИ, а не точки: обычный шаг рисуется одной точкой,
    // развилка — тремя в ряд, из которых проходится одна, после чего дорога
    // снова сходится. Отсюда двойная адресация везде ниже: шаг и путь.
    //
    // Дорожка и точки рисуются всегда, даже когда забега нет: перед входом
    // игрок должен видеть, куда идёт, а не читать про это текстом.
    stepPoints(step) {
        if (step.kind === 'fork') {
            return (step.options || []).map((o, i) => ({
                x: o.x, y: step.y, option: i,
                kind: o.kind, locked: !!o.locked
            }));
        }
        return [{
            x: step.x, y: step.y, option: null,
            kind: step.kind, locked: !!step.locked, enemy: step.enemy
        }];
    },

    // Точка пройдена: шаг засчитан, и если это развилка — засчитан именно
    // этим путём. Нужна и дорожке, и виду самих точек.
    isPassed(run, index, point) {
        if (!run) return false;
        const node = run.map[index];
        if (!node || !node.done) return false;
        if (node.kind === 'fork') return node.chosen === point.option;
        return true;
    },

    // ---------- НА КАРТЕ ОДНИ ЗНАЧКИ ----------
    // Под каждой точкой раньше стояла строка «❤️ 50 🗡 1–10», и на восьми
    // узлах это давало восемь строк мелких чисел поверх дорожки. Карта из
    // «куда я иду» превращалась в таблицу, которую никто не читал: числа
    // следующего боя и так стоят на кнопке действия, а числа боя через три
    // узла ничего не решают — до него ещё дойти надо, и дойдёшь ты другим.
    //
    // Чем ОПАСЕН узел, говорит теперь его РАЗМЕР: рядовой мелкий, мини-босс
    // крупнее, босс крупнее всех. Это читается издали и не требует цифр.
    renderMap(run) {
        const cfg = Backend.rogueConfig();
        if (!cfg || !this.nodesEl) return;

        const steps = cfg.map;
        const current = run ? run.node : -1;

        this.drawTrail(steps, run);

        let html = '';
        steps.forEach((step, i) => {
            this.stepPoints(step).forEach(point => {
                const kind = this.NODE_KINDS[point.kind] || { emoji: '•', name: point.kind };
                const passed = this.isPassed(run, i, point);

                let state = 'future';
                if (point.locked) state = 'locked';
                else if (passed) state = 'done';
                // Путь развилки, мимо которого прошли: он был, но не выбран.
                else if (run && run.map[i] && run.map[i].done) state = 'skipped';
                else if (i === current) state = 'current';

                // Точка, пройденная ПОСЛЕДНЕЙ. По ней и бьёт вспышка шага.
                const just = passed && i === current - 1 ? ' just' : '';

                html += `
                    <button type="button" class="rogue-node ${point.kind} ${state}${just}"
                            data-step="${i}" data-option="${point.option === null ? '' : point.option}"
                            ${state === 'current' ? '' : 'disabled'}
                            style="left:${(point.x * 100).toFixed(1)}%; top:${(point.y * 100).toFixed(1)}%">
                        <span class="rogue-node-dot">${kind.emoji}</span>
                    </button>`;
            });
        });
        this.nodesEl.innerHTML = html;

        Array.prototype.forEach.call(this.nodesEl.querySelectorAll('.rogue-node'), el => {
            el.onclick = (e) => {
                e.stopPropagation();
                if (typeof Haptics !== 'undefined') Haptics.impact('light');
                const option = el.dataset.option === '' ? null : parseInt(el.dataset.option, 10);
                this.enterNode(parseInt(el.dataset.step, 10), option);
            };
        });

        // ---------- ШАГ ВПЕРЁД РИСУЕТСЯ, А НЕ ПРОСТО СЛУЧАЕТСЯ ----------
        // Дорожка до нового узла ПРОЧЕРЧИВАЕТСЯ, а сам узел коротко
        // вспыхивает. Анимация одноразовая и только на изменившемся куске:
        // вечных анимаций на карте нет (docs/traps.md, пп. 36–38), а без
        // движения продвижение по карте не чувствуется вовсе — точка просто
        // перекрашивается, и игрок не видит, что прошёл.
        if (run && this.shownNode != null && run.node > this.shownNode) this.playStep();
        this.shownNode = run ? run.node : null;
    },

    // Какой узел был показан в прошлый раз. По нему и только по нему видно,
    // что игрок продвинулся: сравнивать состояние с самим собой больше
    // негде — render() зовётся и просто так.
    shownNode: null,

    playStep() {
        // Прочерчивание: у только что пройденных отрезков снимается
        // пунктирный сдвиг, и линия «дорисовывается» от точки к точке.
        Array.prototype.forEach.call(this.trailEl.querySelectorAll('.rogue-seg.fresh'), el => {
            const len = el.getTotalLength ? el.getTotalLength() : 100;
            el.style.strokeDasharray = `${len}`;
            el.style.strokeDashoffset = `${len}`;
            // Кадр между записью и снятием обязателен: без него браузер
            // схлопывает оба значения в одно и анимации не будет вовсе.
            requestAnimationFrame(() => {
                el.style.transition = 'stroke-dashoffset 0.5s ease-out';
                el.style.strokeDashoffset = '0';
            });
        });
        const dot = this.nodesEl.querySelector('.rogue-node.just .rogue-node-dot');
        if (dot) {
            dot.classList.remove('pop');
            void dot.offsetWidth;
            dot.classList.add('pop');
        }
    },

    // Дорожка между точками. Кривая, а не ломаная: карта должна выглядеть
    // тропой, а не блок-схемой. Изгиб вертикальный — обе управляющие точки
    // уходят по высоте, — поэтому линия выходит из точки вниз и входит в
    // следующую сверху, а не режет расстояние хордой.
    //
    // На развилке дорога расходится натрое и сходится обратно, поэтому
    // отрезки строятся ОТ КАЖДОЙ точки шага К КАЖДОЙ точке следующего.
    // Каждый отрезок отдельным путём: так видно, каким путём игрок прошёл.
    drawTrail(steps, run) {
        if (!this.trailEl) return;

        const rows = steps.map(step => this.stepPoints(step));
        let out = '';

        for (let i = 0; i < rows.length - 1; i++) {
            rows[i].forEach(a => {
                rows[i + 1].forEach(b => {
                    // Изгиб — вертикальный: обе управляющие точки уходят по
                    // высоте, поэтому линия выходит из точки вниз и входит в
                    // следующую сверху, как тропа, а не как хорда.
                    const bend = (a.y - b.y) * 0.45;
                    const p1 = { x: a.x * 100, y: a.y * 100 };
                    const p2 = { x: b.x * 100, y: b.y * 100 };
                    const c1 = { x: p1.x, y: p1.y - bend * 100 };
                    const c2 = { x: p2.x, y: p2.y + bend * 100 };

                    // Красным светится только пройденное — и только тем
                    // путём, которым шли: развилка после выбора не должна
                    // выглядеть так, будто игрок прошёл всеми тремя.
                    const passedA = this.isPassed(run, i, a);
                    const nextIsFork = steps[i + 1].kind === 'fork';
                    const done = passedA && (!nextIsFork || this.isPassed(run, i + 1, b));
                    const dim = a.locked || b.locked;
                    // Свежий — тот, что упирается в ТЕКУЩУЮ точку: только он
                    // и прочерчивается, остальные уже нарисованы.
                    const fresh = done && run && i + 1 === run.node;

                    out += `<path class="rogue-seg${done ? ' done' : ''}${dim ? ' dim' : ''}${fresh ? ' fresh' : ''}"
                                  vector-effect="non-scaling-stroke"
                                  d="M${p1.x.toFixed(2)},${p1.y.toFixed(2)}
                                     C${c1.x.toFixed(2)},${c1.y.toFixed(2)}
                                      ${c2.x.toFixed(2)},${c2.y.toFixed(2)}
                                      ${p2.x.toFixed(2)},${p2.y.toFixed(2)}"/>`;
                });
            });
        }
        this.trailEl.innerHTML = out;
    },

    // ---------- КАРТОЧКА ПОВЕРХ КАРТЫ ----------
    // Одно место на три случая: предложение войти, выбор награды, итог.
    // Все три перекрывают карту целиком — потому что все три требуют ответа.
    renderCard(run) {
        if (!this.cardEl) return;

        if (this.summary) { this.renderSummary(); return; }
        if (!run) { this.renderStart(); return; }
        if (run.pending) {
            // В pending живут три разные вещи: выбор усиления после боя,
            // витрина магазина и событие. Вид у каждой свой, а механизм один
            // — пока лавка открыта, дальше по карте не пускает.
            if (run.pending.kind === 'shop') { this.renderShop(run); return; }
            if (run.pending.kind === 'event') { this.renderEvent(run); return; }
            this.renderChoice(run);
            return;
        }

        this.cardEl.className = 'rogue-card';
        this.cardEl.innerHTML = '';

        const node = run.map[run.node];
        if (!node) { this.setAction('↩', () => this.host.showLobby()); return; }

        const kind = this.NODE_KINDS[node.kind] || { emoji: '•' };

        // На развилке кнопки действия нет: путь выбирается тапом по точке на
        // карте. Кнопка показывает палец — «жми туда», и не нажимается сама.
        if (node.kind === 'fork') {
            this.setAction(kind.emoji, null);
            return;
        }

        const enemy = Backend.rogueEnemy(node);
        this.setAction(
            kind.emoji,
            () => this.enterNode(run.node),
            enemy ? this.foeStats(enemy) : ''
        );
    },

    // ---------- ЧИСЛА ПРОТИВНИКА ----------
    // Один формат на весь грех: значок ПЕРЕД числом, здоровье первым, урон
    // вторым. Раньше на точках карты стояло «56❤ 2–11🗡» — значок после
    // числа и в обратном порядке, — а в окне входа «❤️ 56 🗡 2–11». Две
    // записи одного и того же заставляют читать каждую заново; сравнивать
    // же приходится постоянно, и именно на сравнении держится вся карта.
    foeStats(enemy) {
        if (!enemy) return '';
        return `❤️ ${enemy.hp}  🗡 ${enemy.damage[0]}–${enemy.damage[1]}`;
    },

    // ---------- ОКНО ВХОДА ----------
    // На экране ровно три вещи: ЧТО выбрать, ГДЕ посмотреть награду и ЧЕМ
    // подтвердить. Ни одного числа, пока игрок сам его не спросит.
    //
    // ---------- ЧТО БЫЛО ДО ----------
    // Окно выкладывало всё сразу: сравнение «ты против босса», дорогу узлами
    // и строку «цена → добыча». Каждый блок по отдельности был осмыслен, а
    // вместе они давали шесть одинаковых плашек, из которых нажимались три.
    // Игрок видел набор чисел и не понимал ни где кнопка, ни что чему
    // соответствует (docs/traps.md, п. 82).
    //
    // Выброшено по одному правилу: «помогает ли это решить, идти или нет».
    //
    //   ДОРОГА — нет. Карта нарисована прямо за этим окном.
    //   С ЧЕМ ВХОДИШЬ — нет. Одинаково на всех сложностях, значит выбирать по
    //   нему нечего; это факт о режиме, а не о выборе.
    //   ЧИСЛА БОССА — хуже, чем нет: 50 → 56 → 60 выглядит «почти то же
    //   самое», а доходимость падает с 40% до 8%. Цифра прямо врала.
    //   ЦЕНА — одинаковая на всех трёх, в сравнении ей делать нечего. Её
    //   место на кнопке, которой платят.
    //
    // ---------- ЧТО ОСТАЛОСЬ ----------
    // Огоньки — выбор. СУНДУК — награда: он говорит «здесь добыча» сам, без
    // подписи и без обучения, а числа прячет внутрь и показывает по нажатию.
    // Кнопка — цена. Три предмета, три роли, и каждый нажимается.
    renderStart() {
        const cfg = Backend.rogueConfig();
        const levels = Backend.rogueLevels();
        if (this.level == null) this.level = 0;
        if (this.level >= levels.length) this.level = levels.length - 1;
        const level = Backend.rogueLevel(this.level);
        const price = level.entry || (cfg ? cfg.entry : {});
        const enough = !Object.keys(price).some(key => GameState.currency(key) < price[key]);

        const picker = levels.map((l, i) => `
            <button type="button" class="rogue-level${i === this.level ? ' on' : ''}"
                    data-level="${i}">${l.sign}</button>`).join('');

        this.cardEl.className = 'rogue-card shown start';
        this.cardEl.innerHTML = `
            <div class="rogue-levels">${picker}</div>
            <button type="button" class="rogue-chest" id="rogue-chest">
                ${LootArt.chest()}
            </button>`;

        this.cardEl.querySelectorAll('.rogue-level').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.level = Number(btn.dataset.level) || 0;
                this.renderStart();
            };
        });
        const chest = this.cardEl.querySelector('#rogue-chest');
        if (chest) chest.onclick = (e) => { e.stopPropagation(); this.openChest(); };

        // Цена — на кнопке, которой платят, и больше нигде. Не хватило —
        // кнопка приглушена, а ЧЕГО не хватило, отвечает кошелёк в шапке.
        this.setAction(this.priceText(price), enough ? () => this.start() : null);
        if (this.actionEl) this.actionEl.classList.toggle('poor', !enough);
    },

    // ---------- ЧТО В СУНДУКЕ ----------
    // Открывается по нажатию на сундук и показывает то, что игрок ГАРАНТИРОВАННО
    // унесёт, пройдя забег целиком. Не «сколько примерно», не «с какой
    // вероятностью» — просто содержимое, как в любой игре с сундуками.
    //
    // Сложность переключается прямо здесь: от неё едет вся добыча, и заставлять
    // закрывать окно ради сравнения — то же самое, что заставлять запоминать.
    openChest() {
        const cfg = Backend.rogueConfig();
        const levels = Backend.rogueLevels();
        const level = Backend.rogueLevel(this.level);

        // Что падает за полный проход: складывается по карте, как и раньше, но
        // теперь вместе с кладовой — мясо роняют мини-босс и босс.
        const coin = {}, pantry = {};
        (cfg ? cfg.map : []).forEach(step => {
            if (!step.enemy) return;
            const reward = (cfg.enemies[step.enemy] || {}).reward || {};
            Object.keys(reward.currencies || {}).forEach(key => {
                coin[key] = (coin[key] || 0) + Math.round(reward.currencies[key] * (level.loot || 1));
            });
            Object.keys(reward.pantry || {}).forEach(key => {
                pantry[key] = (pantry[key] || 0) + Math.round(reward.pantry[key] * (level.loot || 1));
            });
        });

        // Жетоны и осколки — одна валюта: осколок это треть жетона, и «2 жетона
        // и 2 осколка» заставляло бы складывать. Считается в девятых и рисуется
        // как в кошельке: целые со счётчиком плюс остаток недособранным.
        const per = (ECONOMY.exchange.wrath_shard || {}).per || 3;
        const ninths = (coin.wrath_token || 0) * TokenArt.PIECES
                     + (coin.wrath_shard || 0) * (TokenArt.PIECES / per);
        const whole = Math.floor(ninths / TokenArt.PIECES);
        const rest = Math.round(ninths % TokenArt.PIECES);

        const rows = [];
        if (whole) rows.push(`${TokenArt.svg('wrath_token', 0, { whole: true })}<b>${whole}</b>`);
        if (rest) rows.push(TokenArt.svg('wrath_token', rest));
        const tokenRow = rows.length ? `<div class="loot-row">${rows.join('')}</div>` : '';
        const goldRow = coin.gold
            ? `<div class="loot-row">${currencyMark('gold')}<b>${coin.gold}</b></div>` : '';

        // Мясо рисуется ТЕМ ЖЕ рисунком, что лежит в холодильнике кухни: игрок
        // должен узнать его с первого взгляда и понять, куда оно поедет.
        // Своего мяса гнев не заводит (src/config/kitchen.js).
        const meatRow = Object.keys(pantry).map(key => {
            const art = (typeof KITCHEN_ART !== 'undefined' && KITCHEN_ART.ingredientRaw)
                ? `<svg class="loot-meat" viewBox="-72 -62 144 124" aria-hidden="true">
                       ${KITCHEN_ART.ingredientRaw(key, 1)}</svg>`
                : ((KITCHEN.ingredients[key] || {}).emoji || '');
            return `<div class="loot-row">${art}<b>${pantry[key]}</b></div>`;
        }).join('');

        const picker = levels.map((l, i) => `
            <button type="button" class="rogue-level${i === this.level ? ' on' : ''}"
                    data-level="${i}">${l.sign}</button>`).join('');

        this.cardEl.className = 'rogue-card shown chest';
        this.cardEl.innerHTML = `
            <div class="rogue-levels">${picker}</div>
            <button type="button" class="rogue-chest open" id="rogue-chest-close">
                ${LootArt.chest({ open: true })}
            </button>
            <div class="loot-list">${tokenRow}${goldRow}${meatRow}</div>`;

        this.cardEl.querySelectorAll('.rogue-level').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.level = Number(btn.dataset.level) || 0;
                // Перерисовывается открытый сундук, а не окно входа: игрок
                // сравнивает добычу, и закрывать его ради этого незачем.
                this.openChest();
            };
        });
        const close = this.cardEl.querySelector('#rogue-chest-close');
        if (close) close.onclick = (e) => { e.stopPropagation(); this.renderStart(); };

        // Кнопка внизу остаётся той же: цена и вход. Из открытого сундука можно
        // уйти прямо в забег, не закрывая его.
        const price = level.entry || (cfg ? cfg.entry : {});
        const enough = !Object.keys(price).some(key => GameState.currency(key) < price[key]);
        this.setAction(this.priceText(price), enough ? () => this.start() : null);
        if (this.actionEl) this.actionEl.classList.toggle('poor', !enough);
    },

    // ---------- ВЫБОР НАГРАДЫ ----------
    // Пока он не сделан, дальше по карте не пускает. Выбор лежит в состоянии
    // и переживает перезаход — иначе он терялся бы вместе со свёрнутой игрой.
    renderChoice(run) {
        const cfg = Backend.rogueConfig();
        const cards = (run.pending.choices || []).map(id => {
            const boost = cfg.boosts[id];
            if (!boost) return '';
            // Что даёт карточка — значком и числом. Названия у усиления
            // нет: «+2» рядом с мечом и есть название.
            return `
                <button type="button" class="rogue-boost" data-boost="${id}">
                    <span class="rogue-boost-emoji">${boost.emoji}</span>
                    <b>+${boost.damage || boost.hp || boost.armor}</b>
                </button>`;
        }).join('');

        this.cardEl.className = 'rogue-card shown';
        this.cardEl.innerHTML = `
            <div class="rogue-card-icon">🎁</div>
            <div class="rogue-boosts">${cards}</div>`;

        Array.prototype.forEach.call(this.cardEl.querySelectorAll('.rogue-boost'), el => {
            el.onclick = (e) => { e.stopPropagation(); this.chooseBoost(el.dataset.boost); };
        });

        this.setAction('👆', null);
    },

    // ---------- МАГАЗИН ЗАБЕГА ----------
    // Путь развилки, где зубы наконец тратятся. Витрина — три вещи, каждая
    // значком и ценой; купить можно сколько угодно, пока хватает зубов, а
    // уйти — кнопкой внизу.
    //
    // Что уже купил, из витрины НЕ пропадает: пустое место на месте вещи
    // читается как «сломалось». Оно гаснет и перестаёт нажиматься — так же,
    // как выкупленная ступень в лавке снаряжения.
    //
    // Названий нет и не будет: «🗡 +2» и есть название (инвариант 9).
    renderShop(run) {
        const cfg = Backend.rogueConfig();
        const shop = (cfg && cfg.shop) || { items: {} };
        const bought = run.pending.bought || [];

        const rows = (run.pending.offer || []).map(id => {
            const item = (shop.items || {})[id];
            if (!item) return '';
            // Пустая вещь показана так же, как купленная: она гаснет и не
            // нажимается. Перевязка на полном здоровье ничего не даст, а зубы
            // спишет — это ловушка, а не выбор.
            const sold = bought.indexOf(id) >= 0 || Backend.rogueEffectEmpty(run, item.effect);
            const poor = run.teeth < item.price;
            return `
                <button type="button" class="rogue-buy${sold ? ' sold' : ''}${poor ? ' poor' : ''}"
                        data-item="${id}" ${sold ? 'disabled' : ''}>
                    <span class="buy-emoji">${item.emoji}</span>
                    <b class="buy-gain">${this.effectText(item.effect, run)}</b>
                    <span class="buy-price">🦷 ${item.price}</span>
                </button>`;
        }).join('');

        this.cardEl.className = 'rogue-card shown shop';
        this.cardEl.innerHTML = `
            <div class="rogue-card-icon">💰</div>
            <div class="rogue-buys">${rows}</div>`;

        Array.prototype.forEach.call(this.cardEl.querySelectorAll('.rogue-buy'), el => {
            el.onclick = (e) => { e.stopPropagation(); this.buy(el.dataset.item); };
        });

        // Уйти из магазина — отдельным шагом: покупок может быть несколько, и
        // решает игрок, а не последняя цена.
        this.setAction('➜', () => {
            Backend.closeRogueShop();
            if (typeof Haptics !== 'undefined') Haptics.tick();
            this.message = null;
            this.render();
        });
    },

    buy(id) {
        const answer = Backend.buyRogueItem(id);
        if (!answer.ok) {
            // Не хватило зубов — вспыхивает их счётчик в строке забега. Это
            // тот же приём, что у кошелька в шапке: отказ показывается там,
            // где лежит недостающее, а не там, где нажали.
            if (answer.error === 'not_enough') {
                this.flashTeeth();
                if (typeof Haptics !== 'undefined') Haptics.notify('error');
            }
            return;
        }
        if (typeof Haptics !== 'undefined') Haptics.notify('success');
        this.message = this.gainText(answer.gained);
        this.render();
    },

    // ---------- СЛУЧАЙНОЕ СОБЫТИЕ ----------
    // Каждое событие — ОБМЕН, и вариантов ровно два. Слева отдал, справа
    // получил, между ними стрелка: единственная раскладка, которая читается
    // без слов, когда стороны РАЗНЫЕ (docs/traps.md, п. 82). «Повезло / не
    // повезло» показать нечем, поэтому события здесь не лотерея, а решение.
    renderEvent(run) {
        const cfg = Backend.rogueConfig();
        const event = ((cfg && cfg.events) || {})[run.pending.id];
        if (!event) { Backend.takeRogueEvent(0); this.render(); return; }

        const rows = (event.options || []).map((opt, i) => {
            const give = this.effectText(opt, run, -1);
            const take = this.effectText(opt, run, 1);
            // Зубов не хватило — вариант гаснет. Долгов в забеге нет.
            const poor = opt.teeth < 0 && run.teeth < -opt.teeth;
            return `
                <button type="button" class="rogue-deal${poor ? ' poor' : ''}"
                        data-option="${i}" ${poor ? 'disabled' : ''}>
                    <span class="deal-give">${give}</span>
                    <span class="deal-arrow">➜</span>
                    <span class="deal-take">${take}</span>
                </button>`;
        }).join('');

        this.cardEl.className = 'rogue-card shown event';
        this.cardEl.innerHTML = `
            <div class="rogue-card-icon">${event.emoji}</div>
            <div class="rogue-deals">${rows}</div>`;

        Array.prototype.forEach.call(this.cardEl.querySelectorAll('.rogue-deal'), el => {
            el.onclick = (e) => { e.stopPropagation(); this.takeEvent(Number(el.dataset.option)); };
        });

        this.setAction('👆', null);
    },

    takeEvent(index) {
        const answer = Backend.takeRogueEvent(index);
        if (!answer.ok) {
            if (answer.error === 'not_enough') this.flashTeeth();
            return;
        }
        if (typeof Haptics !== 'undefined') Haptics.impact('medium');
        this.message = this.gainText(answer.gained);
        this.render();
    },

    // ---------- ЭФФЕКТ СТРОКОЙ ----------
    // Один формат на товар магазина и на вариант события: значок и число.
    // sign выбирает, какую половину показать, — отрицательную (цена) или
    // положительную (награда): из этого и складывается обмен со стрелкой.
    //
    // Доля здоровья переводится в ЧИСЛО хп прямо здесь. «30%» игроку нечего
    // делить в уме, а «+6» он сравнит с полосой над картой одним взглядом.
    effectText(eff, run, sign) {
        if (!eff) return '';
        const want = (v) => sign == null || (sign > 0 ? v > 0 : v < 0);
        const out = [];

        const hp = (eff.hp || 0) + (eff.hpShare ? (run ? run.maxHp : 20) * eff.hpShare : 0);
        if (hp && want(hp)) out.push(`❤️ ${hp > 0 ? '+' : '−'}${Math.abs(Math.round(hp))}`);
        if (eff.maxHp && want(eff.maxHp)) out.push(`💪 +${eff.maxHp}`);
        if (eff.damage && want(eff.damage)) out.push(`🗡 +${eff.damage}`);
        if (eff.armor && want(eff.armor)) out.push(`🛡 +${eff.armor}`);
        if (eff.teeth && want(eff.teeth)) {
            out.push(`🦷 ${eff.teeth > 0 ? '+' : '−'}${Math.abs(eff.teeth)}`);
        }
        Object.keys(eff.currencies || {}).forEach(key => {
            if (want(eff.currencies[key])) out.push(`${currencyMark(key)} +${eff.currencies[key]}`);
        });
        return out.join(' ');
    },

    // Не хватило зубов — дёргается их счётчик в строке забега, а не кнопка,
    // по которой нажали: отказ показывается там, где лежит недостающее.
    flashTeeth() {
        const el = this.statusEl && this.statusEl.querySelector('.rogue-teeth');
        if (!el) return;
        el.classList.remove('lack');
        void el.offsetWidth;
        el.classList.add('lack');
    },

    // ---------- ИТОГ ЗАБЕГА ----------
    // Отдельный экран, а не сообщение поверх предложения войти. Причина та
    // же, по которой в бою кнопка «Окей» появляется с задержкой: забег
    // кончился, палец ещё на кнопке, а следующий тап по этому же месту стоил
    // бы жетона. Единственная кнопка здесь — уход в лобби.
    renderSummary() {
        const s = this.summary;
        const won = Object.keys(s.currencies || {}).map(key => {
            const conf = ECONOMY.currencies[key];
            return `${currencyMark(key)} +${s.currencies[key]}`;
        }).join('  ');
        // Сгоревшие зубы показаны минусом: это и есть «они живут только
        // внутри забега», сказанное числом.
        const lost = s.teethLost ? `🦷 −${s.teethLost}` : '';

        this.cardEl.className = `rogue-card shown ${s.win ? 'win' : 'lose'}`;
        this.cardEl.innerHTML = `
            <div class="rogue-card-icon">${s.win ? '🏆' : '💀'}</div>
            <div class="rogue-card-row">${s.nodesDone}/${s.nodesTotal}</div>
            ${won ? `<div class="rogue-card-row loot">${won}</div>` : ''}
            ${lost ? `<div class="rogue-card-row lost">${lost}</div>` : ''}`;

        this.setAction('↩', () => this.host.showLobby());
    },

    setAction(text, onClick, note) {
        if (!this.actionEl) return;
        this.actionEl.innerHTML = note
            ? `<b>${text}</b><i>${note}</i>`
            : `<b>${text}</b>`;
        this.actionEl.disabled = !onClick;
        this.actionEl.onclick = onClick
            ? (e) => { e.stopPropagation(); onClick(); }
            : null;
    },

    showMessage() {
        if (!this.messageEl) return;
        // Разметка: сообщение собирается из currencyMark(), а золото там —
        // нарисованный кружок, а не значок (та же причина, что у строки
        // награды в бою).
        this.messageEl.innerHTML = this.message || '';
        this.messageEl.classList.toggle('show', !!this.message);
    },

    // ---------- ДЕЙСТВИЯ ----------
    // Вход: жетон списан — это и говорится, минусом на жетоне. Не хватило —
    // тот же жетон вспыхивает красным в кошельке.
    start() {
        const answer = Backend.startRun(this.level);
        if (!answer.ok) {
            this.lack = answer.currency || 'wrath_token';
            if (this.lackTimer) clearTimeout(this.lackTimer);
            this.lackTimer = setTimeout(() => {
                this.lackTimer = null;
                this.lack = null;
                this.render();
            }, 900);
        } else {
            this.lack = null;
            const price = (Backend.rogueConfig() || {}).entry || {};
            this.message = Object.keys(price).map(key => {
                const conf = ECONOMY.currencies[key];
                return `${currencyMark(key)} −${price[key]}`;
            }).join(' ');
        }
        this.render();
    },

    // ---------- УДЕРЖАНИЕ ФЛАГА ----------
    // Полторы секунды пальцем на флаге. Кнопка при этом наливается — это и
    // есть объяснение жеста: нажал, увидел, что что-то набирается, держишь
    // дальше. Отпустил раньше — ничего не случилось.
    //
    // Слушатели на pointer*, а не на click: клик приходит уже ПОСЛЕ отпускания
    // и о том, сколько палец лежал, не знает вовсе.
    bindAbandon() {
        const el = this.abandonEl;
        if (!el) return;
        el.style.touchAction = 'none';

        const start = (e) => {
            if (!Backend.run() || this.abandonTimer) return;
            e.preventDefault();
            e.stopPropagation();
            el.classList.add('holding');
            if (typeof Haptics !== 'undefined') Haptics.tick();
            this.abandonTimer = setTimeout(() => {
                this.abandonTimer = null;
                el.classList.remove('holding');
                // Тяжёлая отдача: то, что случилось, дорого стоит.
                if (typeof Haptics !== 'undefined') Haptics.impact('heavy');
                Backend.abandonRun();
                this.message = null;
                this.render();
            }, this.ABANDON_MS);
        };

        el.addEventListener('pointerdown', start);
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(name => {
            el.addEventListener(name, () => this.cancelAbandon());
        });

        // Палец УЕХАЛ с кнопки, не отпуская, — это тоже «передумал», и на
        // пальце это единственный способ передумать аккуратно.
        //
        // Проверяется КООРДИНАТАМИ, а не pointerleave. Причина в том, как
        // браузер ведёт себя с касанием: на touch он молча захватывает
        // указатель за элементом, pointermove продолжает приходить сюда же, а
        // pointerleave не приходит до самого отпускания. То есть на мыши
        // отмена работала бы, а на телефоне — нет, и уехавший палец всё равно
        // бросал бы забег. Для действия без отмены это недопустимо.
        el.addEventListener('pointermove', (e) => {
            if (!this.abandonTimer) return;
            const r = el.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right
                || e.clientY < r.top || e.clientY > r.bottom) this.cancelAbandon();
        });
    },

    cancelAbandon() {
        if (this.abandonTimer) { clearTimeout(this.abandonTimer); this.abandonTimer = null; }
        if (this.abandonEl) this.abandonEl.classList.remove('holding');
    },

    chooseBoost(id) {
        const cfg = Backend.rogueConfig();
        const answer = Backend.chooseBoost(id);
        if (!answer.ok) { this.render(); return; }
        const boost = cfg.boosts[id];
        this.message = boost
            ? `${boost.emoji} +${boost.damage || boost.hp || boost.armor}`
            : '';
        this.render();
    },

    // Узел карты. Бой уходит на экран боя и возвращается оттуда колбэками,
    // остальное решается на месте.
    enterNode(index, option) {
        const run = Backend.run();
        if (!run || run.pending || index !== run.node) return;
        const node = run.map[index];
        if (!node || node.locked) return;

        // Развилка: прошли выбранным путём, дорога сходится дальше сама.
        if (node.kind === 'fork') {
            this.takeAnswer(Backend.resolveNode('win', option));
            // Привал на полном здоровье ничего не дал — показываем само
            // здоровье: видно, что оно и так полное.
            if (!this.message) this.message = `❤️ ${run.hp}/${run.maxHp}`;
            this.render();
            return;
        }

        const enemy = Backend.rogueEnemy(node);
        if (enemy) {
            this.host.startRogueFight({
                enemy,
                hp: run.hp,
                maxHp: run.maxHp,
                bonus: run.bonus,
                // Исход засчитывается сразу по концу боя, а не по кнопке
                // «Окей»: здоровье уже записано, и закрытая между ними игра
                // не должна стирать бой.
                onResult: (outcome) => this.takeFight(outcome),
                onClose: () => this.host.showRogue()
            });
            return;
        }

        this.takeAnswer(Backend.resolveNode('win'));
        if (!this.message) this.message = `❤️ ${run.hp}/${run.maxHp}`;
        this.render();
    },

    // Ответ на бой: узел засчитан, а строкой возвращается то, что показать
    // прямо в окне боя, не отправляя игрока смотреть на карту.
    takeFight(outcome) {
        const answer = Backend.resolveNode(outcome === 'win' ? 'win' : 'lose');
        this.takeAnswer(answer);
        if (!answer || !answer.ok) return '';
        if (answer.outcome !== 'win') return '💀';
        return this.gainText(answer.gained) || '';
    },

    // Разбор ответа Backend: что показать и не кончился ли забег.
    takeAnswer(answer) {
        if (!answer || !answer.ok) return;
        if (answer.finished) {
            this.summary = {
                win: answer.outcome === 'win',
                nodesDone: answer.nodesDone,
                nodesTotal: answer.nodesTotal,
                currencies: (answer.gained && answer.gained.currencies) || {},
                teethLost: answer.teethLost || 0
            };
            this.message = null;
            return;
        }
        this.message = this.gainText(answer.gained);
    },

    gainText(gained) {
        const g = gained || {};
        const parts = [];
        if (g.teeth) parts.push(`🦷 +${g.teeth}`);
        if (g.healed) parts.push(`❤️ +${g.healed}`);
        Object.keys(g.currencies || {}).forEach(key => {
            parts.push(`${currencyMark(key)} +${g.currencies[key]}`);
        });
        // МЯСО. Сундук его обещал — значит, в момент выпадения оно обязано
        // появиться в строке, иначе обещание нечем подтвердить. Рисунок тот
        // же, что в сундуке и в холодильнике кухни: продукт узнаётся, а не
        // читается.
        Object.keys(g.pantry || {}).forEach(key => {
            const art = (typeof KITCHEN_ART !== 'undefined' && KITCHEN_ART.ingredientRaw)
                ? `<svg class="gain-meat" viewBox="-72 -62 144 124" aria-hidden="true">
                       ${KITCHEN_ART.ingredientRaw(key, 1)}</svg>`
                : ((KITCHEN.ingredients[key] || {}).emoji || '');
            parts.push(`${art} +${g.pantry[key]}`);
        });
        return parts.join(' · ');
    },

    priceText(price) {
        return Object.keys(price || {}).map(key => {
            const conf = ECONOMY.currencies[key];
            return `${currencyMark(key)} ${price[key]}`;
        }).join(' · ');
    }
};

if (typeof window !== 'undefined') {
    window.WrathRogue = WrathRogue;
}
