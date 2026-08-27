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
    // Второй тап по «Бросить забег» — подтверждение. Диалога здесь нет
    // намеренно: цена ошибки — жетон, и вопрос из двух тапов дешевле окна.
    abandonArmed: false,
    // Не хватило жетона на вход — он вспыхивает в кошельке (как в магазине).
    lack: null,
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

        const back = document.getElementById('wrath-rogue-back');
        if (back) back.onclick = (e) => { e.stopPropagation(); this.host.showLobby(); };
        if (this.abandonEl) {
            this.abandonEl.onclick = (e) => { e.stopPropagation(); this.abandon(); };
        }
    },

    // Сообщение здесь НЕ сбрасывается: с боя на карту возвращаются через
    // enter(), а показать надо именно то, что этот бой принёс. Гасится оно
    // в leave() — то есть при уходе в лобби или закрытии окна.
    enter() {
        this.abandonArmed = false;
        this.render();
    },

    // Уход с экрана. Итог забега здесь и умирает: на карту из боя возвращаются
    // не через leave(), а через host.showRogue(), и показанный итог должен
    // пережить эту дорогу.
    leave() {
        this.message = null;
        this.summary = null;
        this.abandonArmed = false;
    },

    // ---------- ПОКАЗ ----------
    render() {
        if (!this.root) return;
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
            // Второй тап — подтверждение: флаг краснеет и пульсирует, а не
            // переспрашивает словами.
            this.abandonEl.classList.toggle('armed', this.abandonArmed);
        }
        // Под итогом забега уходить некуда, кроме лобби, и кнопка для этого
        // уже есть — вторая такая же рядом выглядела бы ошибкой.
        const bottom = this.abandonEl && this.abandonEl.parentElement;
        if (bottom) bottom.style.display = this.summary ? 'none' : '';
    },

    // ---------- ШАПКА ----------
    renderStatus(run) {
        if (!this.statusEl) return;
        if (!run) {
            this.statusEl.innerHTML = WrathShop.walletHtml(this.lack);
            return;
        }

        // Усиления забега стоят рядом со здоровьем: они и есть ответ на
        // вопрос «что у меня накопилось», а больше его нигде не видно.
        const bonus = run.bonus || {};
        const chips = [];
        if (bonus.damage) chips.push(`<span class="rogue-chip">🗡 +${bonus.damage}</span>`);
        if (bonus.armor) chips.push(`<span class="rogue-chip">🛡 +${bonus.armor}</span>`);

        this.statusEl.innerHTML = `
            <span class="wallet-item"><b>❤️ ${run.hp}/${run.maxHp}</b></span>
            <span class="wallet-item"><b>🦷 ${run.teeth}</b></span>
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

                const enemy = point.enemy && cfg.enemies[point.enemy];
                // Числа противника видны заранее и у всех узлов: забег в
                // шесть боёв — это про подготовку, а не про сюрпризы. Имени
                // у противника на экране нет — за него говорят его числа, а
                // потом будет говорить облик.
                let note = '';
                if (enemy) note = `${enemy.hp}❤ ${enemy.damage[0]}–${enemy.damage[1]}🗡`;
                else if (point.locked) note = '🔒';
                else if (point.kind === 'heal') note = `${Math.round((cfg.healShare || 0.5) * 100)}%`;

                html += `
                    <button type="button" class="rogue-node ${point.kind} ${state}"
                            data-step="${i}" data-option="${point.option === null ? '' : point.option}"
                            ${state === 'current' ? '' : 'disabled'}
                            style="left:${(point.x * 100).toFixed(1)}%; top:${(point.y * 100).toFixed(1)}%">
                        <span class="rogue-node-dot">${passed ? '✓' : kind.emoji}</span>
                        ${note ? `<span class="rogue-node-label">${note}</span>` : ''}
                    </button>`;
            });
        });
        this.nodesEl.innerHTML = html;

        Array.prototype.forEach.call(this.nodesEl.querySelectorAll('.rogue-node'), el => {
            el.onclick = (e) => {
                e.stopPropagation();
                const option = el.dataset.option === '' ? null : parseInt(el.dataset.option, 10);
                this.enterNode(parseInt(el.dataset.step, 10), option);
            };
        });
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

                    out += `<path class="rogue-seg${done ? ' done' : ''}${dim ? ' dim' : ''}"
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
        if (run.pending) { this.renderChoice(run); return; }

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
            enemy ? `${enemy.hp}❤ ${enemy.damage[0]}–${enemy.damage[1]}🗡` : ''
        );
    },

    // Забега нет: предложение войти. Цена и то, что за неё будет, написаны
    // прямо здесь — жетон невозвратный, и игрок должен понимать, на что идёт.
    renderStart() {
        const cfg = Backend.rogueConfig();
        const price = cfg ? cfg.entry : {};
        const enough = !Object.keys(price).some(key => GameState.currency(key) < price[key]);

        // Что впереди и что с этого будет — двумя строками значков, без
        // единого слова. Числа считаются по карте: добавили узел — строка
        // пересчиталась сама.
        const counts = { fight: 0, miniboss: 0, boss: 0 };
        const loot = {};
        (cfg ? cfg.map : []).forEach(step => {
            if (!step.enemy) return;
            counts[step.kind] = (counts[step.kind] || 0) + 1;
            const reward = (cfg.enemies[step.enemy] || {}).reward || {};
            Object.keys(reward.currencies || {}).forEach(key => {
                loot[key] = (loot[key] || 0) + reward.currencies[key];
            });
        });

        const path = [
            `⚔️ ${counts.fight}`,
            counts.miniboss ? `👹 ${counts.miniboss}` : '',
            counts.boss ? `💀 ${counts.boss}` : ''
        ].filter(Boolean).join('  ');

        const lootLine = Object.keys(loot).map(key => {
            const conf = ECONOMY.currencies[key];
            return `${conf ? conf.emoji : key} ${loot[key]}`;
        }).join('  ');

        // С чем входишь — числами, крупно. Забег изолирован от лобби, и это
        // не должно быть сюрпризом на первом же бою: снаряжение остаётся за
        // дверью, все входят одинаково.
        const start = (cfg && cfg.start) || { hp: 20, damage: [3, 5] };

        this.cardEl.className = 'rogue-card shown';
        this.cardEl.innerHTML = `
            <div class="rogue-card-icon">🗺</div>
            <div class="rogue-card-row">${path}</div>
            <div class="rogue-card-row loot">${lootLine}</div>
            <div class="rogue-card-row start">❤️ ${start.hp}  🗡 ${start.damage[0]}–${start.damage[1]}</div>`;

        this.setAction(this.priceText(price), enough ? () => this.start() : null);
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

    // ---------- ИТОГ ЗАБЕГА ----------
    // Отдельный экран, а не сообщение поверх предложения войти. Причина та
    // же, по которой в бою кнопка «Окей» появляется с задержкой: забег
    // кончился, палец ещё на кнопке, а следующий тап по этому же месту стоил
    // бы жетона. Единственная кнопка здесь — уход в лобби.
    renderSummary() {
        const s = this.summary;
        const won = Object.keys(s.currencies || {}).map(key => {
            const conf = ECONOMY.currencies[key];
            return `${conf ? conf.emoji : key} +${s.currencies[key]}`;
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
        this.messageEl.textContent = this.message || '';
        this.messageEl.classList.toggle('show', !!this.message);
    },

    // ---------- ДЕЙСТВИЯ ----------
    // Вход: жетон списан — это и говорится, минусом на жетоне. Не хватило —
    // тот же жетон вспыхивает красным в кошельке.
    start() {
        const answer = Backend.startRun();
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
                return `${conf ? conf.emoji : key} −${price[key]}`;
            }).join(' ');
        }
        this.render();
    },

    abandon() {
        if (!Backend.run()) return;
        if (!this.abandonArmed) {
            this.abandonArmed = true;
            this.render();
            return;
        }
        Backend.abandonRun();
        this.abandonArmed = false;
        this.message = null;
        this.render();
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
            const conf = ECONOMY.currencies[key];
            parts.push(`${conf ? conf.emoji : key} +${g.currencies[key]}`);
        });
        return parts.join(' · ');
    },

    priceText(price) {
        return Object.keys(price || {}).map(key => {
            const conf = ECONOMY.currencies[key];
            return `${conf ? conf.emoji : key} ${price[key]}`;
        }).join(' · ');
    }
};

if (typeof window !== 'undefined') {
    window.WrathRogue = WrathRogue;
}
