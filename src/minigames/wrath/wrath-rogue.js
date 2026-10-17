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
    abandonEl: null,
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
        this.summary = null;
        this.cancelAbandon();
        // Таймер отказа гасится тоже: иначе он сработает уже на другом
        // экране и перерисует этот — тот, которого на экране нет.
        if (this.lackTimer) { clearTimeout(this.lackTimer); this.lackTimer = null; }
    },

    // ---------- ПОКАЗ ----------
    render() {
        if (!this.root) return;
        // Кошелёк в шапке подновляется СРАЗУ. Забег — единственный экран, где
        // валюта уходит и приходит БЕЗ смены экрана: вход платит жетоном,
        // мини-босс даёт осколок, босс — жетон и золото. Пока этого не было,
        // шапка врала до следующего перехода, и заметнее всего на входе.
        if (typeof WrathLobby !== 'undefined') WrathLobby.refreshWallet();
        // Живой забег СТИРАЕТ показанный итог: итог значит «забег кончился»,
        // и держать его поверх начатого — показывать прошлое вместо
        // настоящего.
        if (this.summary && Backend.run()) this.summary = null;
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

        // ---------- ТРИ ХАРАКТЕРИСТИКИ, ВСЕГДА ВСЕ ТРИ ----------
        // Раньше здесь стояли здоровье и зубы, а урон с бронёй появлялись,
        // только если забег их где-то добыл. Из-за этого у бойца забега как
        // будто не было ни урона, ни брони — и главный вопрос игрока («едет
        // ли сюда моё снаряжение?») оставался без ответа.
        //
        // Ответ — НЕ ЕДЕТ: забег изолирован, боец входит с числами из
        // конфига (WrathFighter.forRun). Показывается это не словами, а
        // теми же тремя значками, что в лобби: ❤️ 🗡 🛡. Числа рядом другие
        // — этого достаточно, чтобы увидеть, что боец здесь свой.
        const me = WrathFighter.forRun(run).stats;
        const dmg = me.damageMin === me.damageMax
            ? String(me.damageMin) : `${me.damageMin}–${me.damageMax}`;

        this.statusEl.innerHTML = `
            <span class="wallet-item" data-cur="hp"><b>❤️ ${run.hp}/${run.maxHp}</b></span>
            <span class="wallet-item" data-cur="damage"><b>🗡 ${dmg}</b></span>
            <span class="wallet-item" data-cur="armor"><b>🛡 ${me.armor}</b></span>
            <span class="wallet-item rogue-teeth" data-cur="teeth"><b>🦷 ${run.teeth}</b></span>
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

        // ---------- НА КНОПКЕ ТОЛЬКО ЗНАЧОК ----------
        // Под значком стояли числа противника — «❤️ 5 🗡 1–3». Выброшены по
        // тому же правилу, что и половина окна входа: помогает ли это
        // РЕШИТЬ. Не помогает: ответов у игрока на этом месте ровно два —
        // идти в бой или бросить забег, и оба доступны всегда, при любых
        // числах. Сила узла и так видна на карте — размером точки.
        this.setAction(kind.emoji, () => this.enterNode(run.node));
    },
};

if (typeof window !== 'undefined') {
    window.WrathRogue = WrathRogue;
}
