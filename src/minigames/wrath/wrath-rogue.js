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
    NODE_KINDS: {
        fight:    { emoji: '⚔️', name: 'Бой',        action: 'В бой' },
        miniboss: { emoji: '👹', name: 'Мини-босс',  action: 'К мини-боссу' },
        boss:     { emoji: '💀', name: 'Босс',       action: 'К боссу' },
        heal:     { emoji: '❤️', name: 'Привал',     action: 'Отлежаться' },
        shop:     { emoji: '💰', name: 'Магазин',    action: 'Магазин' },
        event:    { emoji: '❓', name: 'Событие',    action: 'Событие' }
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
            this.abandonEl.textContent = this.abandonArmed ? 'Точно бросить?' : 'Бросить забег';
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
            this.statusEl.innerHTML = WrathShop.walletHtml();
            return;
        }

        // Усиления забега стоят рядом со здоровьем: они и есть ответ на
        // вопрос «что у меня накопилось», а больше его нигде не видно.
        const bonus = run.bonus || {};
        const chips = [];
        if (bonus.damage) chips.push(`<span class="rogue-chip">🗡 +${bonus.damage}</span>`);
        if (bonus.armor) chips.push(`<span class="rogue-chip">🛡 +${bonus.armor}</span>`);

        this.statusEl.innerHTML = `
            <span class="wallet-item"><b>❤️ ${run.hp}/${run.maxHp}</b><i>здоровье</i></span>
            <span class="wallet-item"><b>🦷 ${run.teeth}</b><i>зубы</i></span>
            <span class="rogue-chips">${chips.join('')}</span>
        `;
    },

    // ---------- КАРТА ----------
    // Дорожка и точки рисуются всегда, даже когда забега нет: перед входом
    // игрок должен видеть, куда идёт, а не читать про это текстом.
    renderMap(run) {
        const cfg = Backend.rogueConfig();
        if (!cfg || !this.nodesEl) return;

        const nodes = cfg.map;
        const current = run ? run.node : -1;

        this.drawTrail(nodes, run);

        this.nodesEl.innerHTML = nodes.map((node, i) => {
            const kind = this.NODE_KINDS[node.kind] || { emoji: '•', name: node.kind };
            const done = run ? !!(run.map[i] && run.map[i].done) : false;
            let state = 'future';
            if (node.locked) state = 'locked';
            else if (done) state = 'done';
            else if (i === current) state = 'current';

            const enemy = node.enemy && cfg.enemies[node.enemy];
            // Числа противника видны заранее и у всех узлов: забег в шесть
            // боёв — это про подготовку, а не про сюрпризы.
            const note = enemy
                ? `${enemy.hp}❤ · ${enemy.damage[0]}–${enemy.damage[1]}🗡`
                : (node.locked ? 'скоро' : '');

            return `
                <button type="button" class="rogue-node ${node.kind} ${state}"
                        data-node="${i}" ${state === 'current' ? '' : 'disabled'}
                        style="left:${(node.x * 100).toFixed(1)}%; top:${(node.y * 100).toFixed(1)}%">
                    <span class="rogue-node-dot">${done ? '✓' : kind.emoji}</span>
                    <span class="rogue-node-label">
                        <b>${enemy ? enemy.name : kind.name}</b>
                        ${note ? `<i>${note}</i>` : ''}
                    </span>
                </button>`;
        }).join('');

        Array.prototype.forEach.call(this.nodesEl.querySelectorAll('.rogue-node'), el => {
            el.onclick = (e) => {
                e.stopPropagation();
                this.enterNode(parseInt(el.dataset.node, 10));
            };
        });
    },

    // Дорожка между точками. Кривая, а не ломаная: карта должна выглядеть
    // тропой, а не блок-схемой. Проводится по Катмуллу-Рому — она проходит
    // ровно через заданные точки, в отличие от обычной безье.
    //
    // Каждый отрезок — отдельный путь: так видно, докуда игрок уже дошёл, и
    // не нужно считать длину линии.
    drawTrail(nodes, run) {
        if (!this.trailEl) return;
        const pts = nodes.map(n => ({ x: n.x * 100, y: n.y * 100 }));
        const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];

        let out = '';
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
            const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
            const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
            const done = run && run.map[i] && run.map[i].done;
            out += `<path class="rogue-seg${done ? ' done' : ''}" vector-effect="non-scaling-stroke"
                          d="M${p1.x.toFixed(2)},${p1.y.toFixed(2)}
                             C${c1x.toFixed(2)},${c1y.toFixed(2)}
                              ${c2x.toFixed(2)},${c2y.toFixed(2)}
                              ${p2.x.toFixed(2)},${p2.y.toFixed(2)}"/>`;
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
        if (!node) { this.setAction('Забег пройден', () => this.host.showLobby()); return; }

        const kind = this.NODE_KINDS[node.kind] || { name: node.kind, emoji: '•' };
        const enemy = Backend.rogueEnemy(node);
        this.setAction(
            `${kind.emoji} ${kind.action || kind.name}`,
            () => this.enterNode(run.node),
            enemy ? `${enemy.name} · ${enemy.hp}❤ · ${enemy.damage[0]}–${enemy.damage[1]}🗡` : ''
        );
    },

    // Забега нет: предложение войти. Цена и то, что за неё будет, написаны
    // прямо здесь — жетон невозвратный, и игрок должен понимать, на что идёт.
    renderStart() {
        const cfg = Backend.rogueConfig();
        const price = cfg ? cfg.entry : {};
        const enough = !Object.keys(price).some(key => GameState.currency(key) < price[key]);
        const fights = cfg ? cfg.map.filter(n => n.enemy).length : 0;

        this.cardEl.className = 'rogue-card shown';
        this.cardEl.innerHTML = `
            <div class="rogue-card-title">🗺 Забег</div>
            <p>${fights} боёв подряд, мини-босс посередине и босс в конце. За победы —
            зубы и усиления до конца забега, за мини-босса осколок, за босса жетон и монеты.</p>
            <p>Здоровье в забеге своё и начинается полным. Проиграл бой — забег окончен,
            жетон сгорел.</p>
            <p class="rogue-card-note">Забег можно бросить на середине и вернуться хоть через
            неделю: он сохраняется после каждого узла.</p>`;

        this.setAction(
            enough ? `Войти за ${this.priceText(price)}` : `Нужен ${this.priceText(price)}`,
            enough ? () => this.start() : null
        );
    },

    // ---------- ВЫБОР НАГРАДЫ ----------
    // Пока он не сделан, дальше по карте не пускает. Выбор лежит в состоянии
    // и переживает перезаход — иначе он терялся бы вместе со свёрнутой игрой.
    renderChoice(run) {
        const cfg = Backend.rogueConfig();
        const cards = (run.pending.choices || []).map(id => {
            const boost = cfg.boosts[id];
            if (!boost) return '';
            return `
                <button type="button" class="rogue-boost" data-boost="${id}">
                    <span class="rogue-boost-emoji">${boost.emoji}</span>
                    <b>${boost.name}</b>
                    <i>${boost.note || ''}</i>
                </button>`;
        }).join('');

        this.cardEl.className = 'rogue-card shown';
        this.cardEl.innerHTML = `
            <div class="rogue-card-title">Забирай награду</div>
            <div class="rogue-boosts">${cards}</div>
            <p class="rogue-card-note">Действует до конца забега.</p>`;

        Array.prototype.forEach.call(this.cardEl.querySelectorAll('.rogue-boost'), el => {
            el.onclick = (e) => { e.stopPropagation(); this.chooseBoost(el.dataset.boost); };
        });

        this.setAction('Выбери награду', null);
    },

    // ---------- ИТОГ ЗАБЕГА ----------
    // Отдельный экран, а не сообщение поверх предложения войти. Причина та
    // же, по которой в бою кнопка «Окей» появляется с задержкой: забег
    // кончился, палец ещё на кнопке, а следующий тап по этому же месту стоил
    // бы жетона. Единственная кнопка здесь — уход в лобби.
    renderSummary() {
        const s = this.summary;
        const lines = [];
        Object.keys(s.currencies || {}).forEach(key => {
            const conf = ECONOMY.currencies[key];
            lines.push(`<li>${conf ? conf.emoji : key} +${s.currencies[key]}</li>`);
        });
        if (s.teethLost) lines.push(`<li>🦷 ${s.teethLost} сгорело вместе с забегом</li>`);
        if (!lines.length) lines.push('<li>вынести ничего не удалось</li>');

        this.cardEl.className = `rogue-card shown ${s.win ? 'win' : 'lose'}`;
        this.cardEl.innerHTML = `
            <div class="rogue-card-title">${s.win ? '🏆 Забег пройден' : '💀 Забег окончен'}</div>
            <p>Узлов пройдено: ${s.nodesDone} из ${s.nodesTotal}.</p>
            <ul class="rogue-summary-list">${lines.join('')}</ul>
            <p class="rogue-card-note">Зубы сгорели — они живут только внутри забега.</p>`;

        this.setAction('В лобби', () => this.host.showLobby());
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
    start() {
        const answer = Backend.startRun();
        if (!answer.ok) {
            this.message = answer.error === 'not_enough'
                ? 'Не хватает жетонов на вход.'
                : 'Начать забег не вышло.';
        } else {
            this.message = 'Забег начат. Жетон сгорел — теперь только вперёд.';
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
        this.message = 'Забег брошен. Жетон не возвращается.';
        this.render();
    },

    chooseBoost(id) {
        const cfg = Backend.rogueConfig();
        const answer = Backend.chooseBoost(id);
        if (!answer.ok) { this.render(); return; }
        const boost = cfg.boosts[id];
        this.message = boost ? `${boost.emoji} ${boost.name}` : '';
        this.render();
    },

    // Узел карты. Бой уходит на экран боя и возвращается оттуда колбэками,
    // остальное решается на месте.
    enterNode(index) {
        const run = Backend.run();
        if (!run || run.pending || index !== run.node) return;
        const node = run.map[index];
        if (!node || node.locked) return;

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
        // Привал на полном здоровье — не молчание: пустая строка читается
        // как «ничего не произошло, узел завис».
        if (!this.message) this.message = 'Лечить нечего — и так целый.';
        this.render();
    },

    // Ответ на бой: узел засчитан, а строкой возвращается то, что показать
    // прямо в окне боя, не отправляя игрока смотреть на карту.
    takeFight(outcome) {
        const answer = Backend.resolveNode(outcome === 'win' ? 'win' : 'lose');
        this.takeAnswer(answer);
        if (!answer || !answer.ok) return '';
        if (answer.outcome !== 'win') return 'Забег окончен.';
        return this.gainText(answer.gained) || '';
    },

    // Разбор ответа Backend: что показать и не кончился ли забег.
    takeAnswer(answer) {
        if (!answer || !answer.ok) {
            this.message = 'Узел не засчитался.';
            return;
        }
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
