// ================= ТЩЕСЛАВИЕ: ВЫХОД НА ДОРОЖКУ =================
// Старт, зоны внимания, кому достаётся зона, ввод, разрыв серии, фоновые
// вспышки, счёт и множитель.
// Продолжение PrideMinigame (pride.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после pride.js.
Object.assign(PrideMinigame, {

    // ---------- СТАРТ ----------
    // Три шага, и каждый нужен: декорации меняются, потом отсчёт, потом
    // выход. Без отсчёта игрок оказывается на дорожке в тот момент, когда
    // ещё смотрит, как уезжает костюмерная, и первые зоны пропускает не по
    // своей вине.
    startShow() {
        if (this.phase !== 'wardrobe' || this.storeOpen || this.openSlot) return;
        // Числа берутся ЗАНОВО: в костюмерной можно просидеть час, и порог
        // голода за это время вполне переходится. Решать «платят ли» надо на
        // момент старта, а не на момент входа в грех.
        this.params = Backend.prideRun();
        this.phase = 'change';
        this.renderUI();
        this.setDecor('carpet', true);
        setTimeout(() => {
            if (this.phase !== 'change') return;
            this.startCount();
        }, PRIDE_VIEW.CHANGE_MS);
    },

    startCount() {
        this.phase = 'count';
        this.countLeft = 3;
        const tick = () => {
            if (this.phase !== 'count') return;
            if (this.countLeft <= 0) { this.beginRun(); return; }
            this.showCount(this.countLeft);
            this.countLeft--;
            setTimeout(tick, PRIDE_VIEW.COUNT_STEP_MS);
        };
        tick();
    },

    showCount(n) {
        if (!this.countEl) return;
        const C = PALETTE.redCarpet;
        // Цифра стоит ВЫШЕ середины: по центру она садится ровно на морду
        // червя, а он тут главный даже в отсчёте.
        const y = this.safe.y0 + (this.safe.y1 - this.safe.y0) * 0.42;
        this.countEl.innerHTML =
            `<text class="pr-count-digit" x="${PRIDE_ART.CX}" y="${y.toFixed(0)}"
                   text-anchor="middle" font-size="190" font-weight="800"
                   fill="${C.flash[300]}" stroke="${PALETTE.ink}" stroke-width="6"
                   paint-order="stroke">${n}</text>`;
    },

    beginRun() {
        this.phase = 'run';
        if (this.countEl) this.countEl.innerHTML = '';
        this.spawnAcc = this.params.spawnMs * 0.5;
        if (this.wormHandle && this.wormHandle.setTreadmill) this.wormHandle.setTreadmill(1);
        this.renderUI();
        this.placeMovers();
        this.renderHud();
    },

    finishRun() {
        if (this.phase !== 'run') return;
        this.phase = 'done';
        this.clearTargets();
        if (this.wormHandle && this.wormHandle.setTreadmill) this.wormHandle.setTreadmill(0);
        this.renderHud();

        // Мини-игра не начисляет сама: сообщает, сколько поцелуев собрано, а
        // выдавать ли их — решает конфиг наград через Backend (инвариант 2).
        // При сытом черве не выдаст ничего, но собирать там и нечего:
        // поцелуйных зон в таком выходе не появляется вовсе.
        GameEvents.emit('minigame:result', {
            sin: 'pride', mode: 'parade', outcome: 'win',
            meta: { kisses: this.kisses, hits: this.hits, misses: this.misses }
        });

        setTimeout(() => {
            if (this.phase !== 'done') return;
            if (!this.screenElement.classList.contains('active')) return;
            // Обратно в костюмерную — и декорации едут обратно тем же путём.
            this.setDecor('room', true);
            setTimeout(() => this.enterWardrobe(), PRIDE_VIEW.CHANGE_MS);
        }, PRIDE_VIEW.END_HOLD_MS);
    },

    // ---------- ЗОНЫ ВНИМАНИЯ ----------
    // Тип зоны решается ПРИ ПОЯВЛЕНИИ, а не при тапе: поцелуй вспыхивает на
    // черве, вспышка — за ограждением, в толпе. Раньше это решалось по точке
    // тапа через elementFromPoint, и различие вырождалось: зона большая и
    // почти всегда цепляла силуэт краем.
    spawnTarget() {
        if (this.phase !== 'run') return;
        if (this.targets.length >= this.params.maxTargets) return;
        // Поцелуй возможен только при живом стрике: пока толпа не заведена,
        // на червя никто не прыгает, и мешок при этом НЕ трогаем — иначе
        // выпавшие впустую поцелуи съедали бы долю уже открытого периода.
        const kiss = this.kissesOpen() && this.nextIsKiss() && !!this.wormBox;
        const spot = kiss ? this.pickKissSpot() : this.pickFlashSpot();
        if (!spot) return;

        const r = this.params.radius;
        const g = this.svgNode('g');
        g.setAttribute('class', 'pr-zone' + (kiss ? ' pr-zone-k' : ''));
        g.setAttribute('transform', `translate(${spot.x.toFixed(1)},${spot.y.toFixed(1)})`);
        // Пятно света = ЗОНА ПОПАДАНИЯ, один в один и на всю жизнь зоны.
        // Кольцо внутри — ТОЛЬКО таймер: оно стягивается, зона не меняется.
        g.innerHTML =
            `<circle r="${r}" fill="url(#${kiss ? 'pr-zone-kiss' : 'pr-zone-flash'})"/>` +
            `<circle class="pr-ring" r="${r}" fill="none" stroke="${kiss ? PALETTE.redCarpet.kiss[300] : PALETTE.redCarpet.flash[300]}" stroke-width="3"/>`;
        this.zonesEl.appendChild(g);

        this.tokenCounter++;
        this.targets.push({
            x: spot.x, y: spot.y, kiss, el: g,
            ring: g.querySelector('.pr-ring'),
            token: this.tokenCounter,
            bornAt: performance.now(),
            diesAt: performance.now() + this.params.lifeMs
        });
    },

    // ---------- КОМУ ДОСТАЁТСЯ ЗОНА ----------
    // Мешок, а не бросок монетки на каждую зону: из `of` зон ровно столько-то
    // поцелуйных, порядок случайный, тянем без возврата. Разница не в
    // среднем, а в хвостах — монетка регулярно выдаёт выход, где поцелуев
    // почти не было, и виноватым себя чувствует игрок, хотя не виноват.
    //
    // Доля фиксированная. Раньше она зависела от ажиотажа, но теперь тем же
    // занят стрик, и занят жёстче: при нулевом стрике поцелуев нет вообще.
    nextIsKiss() {
        if (!this.bag || !this.bag.length) this.fillBag();
        return this.bag.pop();
    },

    // Открыт ли червь для поцелуев. Условий два, и второе важнее:
    //
    //   • живой стрик — хотя бы одна белая зона закрыта и с тех пор ничего
    //     не пропущено;
    //   • червь ГОЛОДЕН, то есть шкала гордыни опустилась до порога. Пока он
    //     сыт, целовать его никто не лезет: выход идёт, шкала закроется, но
    //     поцелуев в кадре не будет ни одного.
    //
    // Второе — то самое правило антифарма, и живёт оно ЗДЕСЬ, в спавне зон, а
    // не в начислении. Разница принципиальная: игрок видит пустую дорожку, а
    // не пустой кошелёк после честно собранных четырнадцати поцелуев.
    kissesOpen() {
        return this.params.pays && this.streak >= this.params.streak.needForKiss;
    },

    fillBag() {
        const b = this.params.kissBag;
        this.bag = Array.from({ length: b.of }, (_, i) => i < b.kisses);
        // Тасовка Фишера—Йетса: доля в мешке задана, а порядок нет — иначе
        // поцелуи шли бы строго через три вспышки и читались расписанием.
        for (let i = this.bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = this.bag[i]; this.bag[i] = this.bag[j]; this.bag[j] = t;
        }
    },

    // Поцелуй — на черве. Точка берётся из измеренного габарита силуэта, с
    // тягой к середине тела: по краям коробки силуэта нет, там воздух.
    pickKissSpot() {
        const b = this.wormBox;
        for (let i = 0; i < PRIDE_VIEW.SPAWN_TRIES; i++) {
            const x = b.x + b.w * (0.5 + (Math.random() - 0.5) * 0.7);
            const y = b.y + b.h * (0.15 + Math.random() * 0.6);
            const spot = this.clampSpot(x, y);
            if (this.farEnough(spot)) return spot;
        }
        return this.clampSpot(b.x + b.w / 2, b.y + b.h * 0.4);
    },

    // Вспышка — за ограждением. Глубина случайна, поэтому вспышки идут и
    // вблизи, и у горизонта: толпа стоит вдоль всей дорожки.
    pickFlashSpot() {
        const A = PRIDE_ART;
        for (let i = 0; i < PRIDE_VIEW.SPAWN_TRIES; i++) {
            const z = A.Z_CROWD_MIN + Math.random() * (PRIDE_VIEW.FLASH_MAX_Z - A.Z_CROWD_MIN);
            const side = Math.random() < 0.5 ? -1 : 1;
            const x = A.CX + side * A.half(z) * A.LANE;
            const y = A.y(z) - A.CROWD_H * A.s(z) * (0.5 + Math.random() * 0.35);
            const spot = this.clampSpot(x, y);
            if (this.farEnough(spot)) return spot;
        }
        return null;
    },

    // Зона целиком в кадре: половина зоны за краем экрана — это половина
    // зоны, по которой нельзя попасть.
    clampSpot(x, y) {
        const r = this.params.radius, S = this.safe;
        return {
            x: Math.max(S.x0 + r, Math.min(S.x1 - r, x)),
            y: Math.max(Math.max(S.y0 + r, PRIDE_ART.HORIZON - r * 0.2),
                        Math.min(S.y1 - r, y))
        };
    },

    farEnough(spot) {
        const gap = this.params.radius * PRIDE_VIEW.ZONE_GAP;
        return !this.targets.some(t => Math.hypot(t.x - spot.x, t.y - spot.y) < gap);
    },

    tickTargets(now) {
        const r = this.params.radius;
        // Идём по КОПИИ, и каждую зону перед касанием проверяем на живость.
        // Погасшая зона рвёт стрик, а разрыв гасит ВЕСЬ экран — то есть
        // выносит тот самый массив, по которому идёт цикл. По живому массиву
        // это падало бы на первом же разрыве, и падало бы через кадр после
        // правки, а не в ней самой.
        for (const t of this.targets.slice()) {
            if (this.targets.indexOf(t) < 0) continue;
            const left = (t.diesAt - now) / this.params.lifeMs;
            if (left <= 0) {
                this.removeTarget(t);
                this.registerMiss();
                continue;
            }
            // Кольцо-таймер ведётся кадром, а не css-переходом: переход
            // пришлось бы каждый раз перезапускать через принудительный
            // рефлоу, а тут и так есть кадровый цикл.
            t.ring.setAttribute('r', (PRIDE_VIEW.ZONE_CORE + (r - PRIDE_VIEW.ZONE_CORE) * left).toFixed(1));
        }
    },

    removeTarget(target) {
        if (target.el) target.el.remove();
        const i = this.targets.indexOf(target);
        if (i >= 0) this.targets.splice(i, 1);
    },

    clearTargets() {
        while (this.targets.length) this.removeTarget(this.targets[0]);
        if (this.zonesEl) this.zonesEl.innerHTML = '';
    },

    // ---------- ВВОД ----------
    // Один обработчик на весь экран, разведённый по фазам. Всё, что открыто
    // поверх костюмерной, съедает ввод целиком: тап мимо карточки закрывает
    // её, а не улетает в костюмерную под ней.
    onDown(e) {
        e.preventDefault();
        const hit = (sel) => (e.target.closest ? e.target.closest(sel) : null);

        // Инвентарь слота стоит ПЕРЕД витриной: он открывается тапом по
        // слоту, витрина при этом закрыта, и оба состояния одновременно
        // невозможны.
        if (this.openSlot) {
            const pick = hit('.pr-slot-item');
            if (pick) { this.pickSlotItem(pick.dataset.slotItem); return; }
            // Тап по тому же слоту (он остался кликабельным под затемнением)
            // или мимо панели — закрываем.
            const slot = hit('.pr-slot');
            if (slot && slot.dataset.slot !== this.openSlot) { this.tapSlot(slot.dataset.slot); return; }
            this.openSlot = null;
            this.renderStore();
            return;
        }

        if (this.storeOpen) {
            const tab = hit('.pr-tab');
            if (tab) { this.storeTab = tab.dataset.tab; this.renderStore(); return; }
            const item = hit('.pr-item');
            if (item) { this.tapItem(item.dataset.item); return; }
            const boost = hit('.pr-boost');
            if (boost) { this.buyBoost(boost.dataset.boost); return; }
            // Крестик витрины или тап мимо панели — закрываем.
            if (hit('.pr-store-close') || hit('.pr-store-back')) {
                this.storeOpen = false;
                this.renderStore();
            }
            return;
        }

        if (this.phase === 'wardrobe') {
            const slot = hit('.pr-slot');
            if (slot) { this.tapSlot(slot.dataset.slot); return; }
            if (hit('#pr-shop-btn')) { this.storeOpen = true; this.renderStore(); return; }
            if (hit('#pr-start-btn')) { this.startShow(); return; }
            return;
        }
        if (this.phase !== 'run') return;

        const p = this.fromScreen(e.clientX, e.clientY);
        // Тап засчитывается той зоне, которой осталось жить меньше всех: если
        // две наложились краями, справедливее закрыть ту, что вот-вот
        // погаснет, — вторую игрок ещё успеет добрать.
        let pick = null;
        for (const t of this.targets) {
            if (Math.hypot(p.x - t.x, p.y - t.y) > this.params.radius) continue;
            if (!pick || t.diesAt < pick.diesAt) pick = t;
        }
        if (pick) this.resolveTarget(pick, p);
        else this.registerMissclick();   // барабанить пальцем по полю невыгодно
    },

    resolveTarget(target, p) {
        this.removeTarget(target);
        this.hits++;
        if (target.kiss) {
            // Поцелуй ПЛАТИТ, но стрик не растит: он его только удерживает
            // (это не промах). Иначе деньги дорожали бы сами от себя, и
            // вспышки, ради которых всё затевалось, стали бы не нужны.
            const mult = this.multiplier();
            this.kisses += mult;
            this.kissFx(target.x, target.y, mult);
        } else {
            // Белая зона — единственное, что растит стрик. Она же открывает
            // червя для поцелуев, если стрик был нулевым.
            this.streak += this.params.streak.perHit;
            this.flashFx(target.x, target.y);
        }
        this.renderHud();
    },

    // Зона погасла сама — СЕРИЯ РВЁТСЯ. Раньше это было мягче (ажиотаж просто
    // проседал), потому что зон бывает больше, чем успевает палец, и рвать за
    // это значит наказывать за купленную прокачку. Теперь тормоз держит не
    // мягкость наказания, а spawnFloor: интервал не опускается ниже того, что
    // палец физически закрывает, — а всё, что игрок увидел и не тронул, он
    // пропустил сам.
    registerMiss() {
        this.misses++;
        if (this.params.streak.breakOnMiss) this.breakStreak();
        this.renderHud();
    },

    // Тап в пустоту — тоже разрыв. Дробь по экрану обязана стоить дорого:
    // иначе выгодно молотить пальцем вслепую, а зоны большие и слепая дробь
    // закрывала бы их сама.
    registerMissclick() {
        this.misses++;
        if (this.params.streak.breakOnMissclick) this.breakStreak();
        this.renderHud();
    },

    // ---------- РАЗРЫВ ----------
    // Стрик в ноль, и ЭКРАН ОЧИЩАЕТСЯ ЦЕЛИКОМ: гаснут все висящие зоны, и
    // розовые, и белые.
    //
    // Белые сначала оставляли жить, и это была дыра, а не мягкость. Игрок
    // тыкал в пустоту при живой белой зоне, тут же добивал её — и стрик
    // возвращался к единице, а с ним и доступ к поцелуям. Мисклик не стоил
    // ничего: наказание отменялось той самой зоной, которая висела в момент
    // наказания. Разрыв обязан быть разрывом — после него набирать серию
    // приходится с зон, которые ЕЩЁ НЕ ПОЯВИЛИСЬ.
    //
    // Гасим ТИХО, минуя registerMiss: рекурсия из разрывов внутри разрыва —
    // это не наказание, а поломка.
    breakStreak() {
        if (this.streak > 0) this.flashReset();
        this.streak = 0;
        this.clearTargets();
    },

    // Сорванный множитель показывается тем же местом, где он рос: цифра
    // краснеет и дёргается. Без этого разрыв — самое обидное событие игры,
    // случившееся молча.
    flashReset() {
        const el = this.hudEl && this.hudEl.querySelector('.pr-mult');
        if (!el) return;
        el.classList.remove('pr-mult-drop');
        void el.getBBox();
        el.classList.add('pr-mult-drop');
    },

    // Множитель = длина стрика, потолок задаёт машина. При нулевом стрике
    // поцелуйных зон на экране нет, так что платить этой единицей нечему —
    // она нужна только показу.
    multiplier() {
        return Math.min(this.params.multCap, Math.max(1, this.streak));
    },

    // ---------- ФОНОВЫЕ ВСПЫШКИ ----------
    // Толпа щёлкает сама по себе, и тем чаще, чем выше ажиотаж. Это не зоны:
    // по ним не тапают, они ничего не дают. Это показ ажиотажа без единой
    // цифры — накал света (план, раздел 5).
    tickAmbient(dt) {
        this.ambientAcc += dt * 1000 * (1 + this.streak * 0.35);
        if (this.ambientAcc < PRIDE_VIEW.AMBIENT_MS) return;
        this.ambientAcc = 0;
        const spot = this.pickFlashSpot();
        if (!spot) return;
        const c = this.svgNode('circle');
        c.setAttribute('class', 'pr-ambient');
        c.setAttribute('cx', spot.x.toFixed(1));
        c.setAttribute('cy', spot.y.toFixed(1));
        c.setAttribute('r', (6 + Math.random() * 5).toFixed(1));
        c.setAttribute('fill', PALETTE.redCarpet.flash[300]);
        this.fxEl.appendChild(c);
        setTimeout(() => c.remove(), 420);
    },

    // Групп ДВЕ, и это не лишний узел: положение эффекта записано атрибутом
    // transform, а css-анимация, правящая transform, стёрла бы его целиком —
    // губы вылетали бы из левого верхнего угла кадра. Внешняя группа держит
    // место, внутренняя анимируется.
    kissFx(x, y, mult) {
        const outer = this.svgNode('g');
        outer.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
        // Цифра рядом с губами — это и есть весь рассказ о множителе: сколько
        // именно дал этот поцелуй. Цифра не слово (инвариант 9).
        outer.innerHTML =
            `<g class="pr-fx-kiss">` +
            `<text x="0" y="8" text-anchor="middle" font-size="34">💋</text>` +
            `<text x="26" y="-14" text-anchor="middle" font-size="22"` +
            ` fill="${PALETTE.redCarpet.kiss[300]}" font-weight="700">${mult}</text></g>`;
        this.fxEl.appendChild(outer);
        setTimeout(() => outer.remove(), PRIDE_VIEW.KISS_FX_MS);
    },

    flashFx(x, y) {
        const c = this.svgNode('circle');
        c.setAttribute('class', 'pr-fx-flash');
        c.setAttribute('cx', x.toFixed(1));
        c.setAttribute('cy', y.toFixed(1));
        c.setAttribute('r', '14');
        c.setAttribute('fill', PALETTE.redCarpet.flash[300]);
        this.fxEl.appendChild(c);
        setTimeout(() => c.remove(), PRIDE_VIEW.FLASH_FX_MS);
    },

    // ---------- СЧЁТ ----------
    // Две величины и ни одного слова: сколько поцелуев собрано и во сколько
    // раз дороже следующий. Множитель разгорается вместе с ажиотажем — это
    // тот же «накал света», только цифрой.
    renderHud() {
        if (!this.hudEl) return;
        const C = PALETTE.redCarpet;
        // ---------- КОШЕЛЁК И ПРИБАВКА — ДВА РАЗНЫХ ЧИСЛА ----------
        // Пока показывали одно, выход читался как ОБНУЛЕНИЕ кошелька: игрок
        // заканчивал выход с «💋 34», начинал следующий — и видел «💋 0».
        // Копилось при этом всё честно, врал именно показ.
        //
        // Теперь слева всегда КОШЕЛЁК (он не уменьшается никогда), а рядом со
        // знаком «плюс» — сколько добавит этот выход. В конце прибавка
        // складывается в кошелёк на глазах: число слева подскакивает ровно на
        // то, что стоит справа от плюса.
        const wallet = GameState.currency('pride_kiss');
        // Строка счёта — от ВИДИМОГО верха, а не от верха холста: иначе на
        // телефоне, где холст обрезан, цифры уезжают под край окна.
        const x = this.safe.x0 + 16, y = this.safe.y0 + 34;
        const purse = `<text x="${x}" y="${y}" font-size="26">💋</text>` +
                      `<text x="${x + 30}" y="${y}" font-size="26" fill="${C.kiss[300]}" font-weight="700">${wallet}</text>`;
        if (this.phase !== 'run' && this.phase !== 'done') {
            this.hudEl.innerHTML = purse;
            return;
        }
        // На финише показываем НАЧИСЛЕННОЕ, пока оно не пришло — собранное.
        const done = this.phase === 'done' && this.awardedKisses != null;
        const gain = done ? this.awardedKisses : this.kisses;
        const gx = x + 30 + String(wallet).length * 16 + 14;
        // Урезания больше нет: начисленное либо равно собранному, либо выхода
        // просто не оплатили (сытый червь), и тогда собирать было нечего —
        // поцелуйных зон в таком выходе не появлялось. Поэтому и показывать
        // здесь двух чисел больше не надо, а при неоплаченном выходе прибавку
        // не показываем вовсе: вместо неё говорит полоска голода.
        const px = gx;
        this.hudEl.innerHTML = purse +
            (this.params.pays
                ? `<text x="${px}" y="${y}" font-size="22" fill="${C.flash[500]}"
                         font-weight="700" opacity="${this.phase === 'done' ? 1 : 0.85}">+${gain}</text>`
                : '') +
            this.multBadge(this.safe.x1 - 18, y - 4);
    },

    // ---------- МНОЖИТЕЛЬ НА ЭКРАНЕ ----------
    // Он теперь главное, что игрок теряет за одну ошибку, — значит должен
    // быть виден всё время и крупно, а не тускнеть в углу. Три вещи в одном
    // месте:
    //   • сама цифра — во сколько раз дороже следующий поцелуй;
    //   • полоска под ней — насколько стрик подобрался к потолку машины;
    //   • размер — то же самое ростом, чтобы разрыв было видно боковым зрением.
    //
    // ПОГАШЕННЫЙ ВИД ПРИ НУЛЕВОМ СТРИКЕ — не украшение, а показ правила: пока
    // цифра серая, червя не целуют, и единственный способ это изменить —
    // закрыть белую зону. Ни одного слова на это не потрачено (инвариант 9).
    //
    // Упёрлись в потолок машины — полоска полная и золотая: видно, что упёрся
    // не в игру, а в непокупленное.
    multBadge(x, y) {
        const C = PALETTE.redCarpet;
        const live = this.kissesOpen();
        const mult = this.multiplier();
        const cap = this.params.multCap;
        const capped = live && mult >= cap;
        const toNext = cap > 1 ? Math.min(1, this.streak / cap) : (live ? 1 : 0);
        const size = 26 + (live ? Math.min(1, this.streak / cap) * 12 : 0);
        const bar = 36;
        const face = !live ? C.glow[500] : (capped ? C.gold[300] : C.flash[500]);
        return `<g class="pr-mult" transform="translate(${x.toFixed(0)},${y.toFixed(0)})"
                   opacity="${live ? 1 : 0.4}">
            <text x="0" y="0" text-anchor="end" font-size="${size.toFixed(0)}"
                  font-weight="800" fill="${face}">×${mult}</text>
            <rect x="${-bar}" y="9" width="${bar}" height="5" rx="2.5"
                  fill="${C.night[500]}" opacity="0.75"/>
            <rect x="${-bar}" y="9" width="${(bar * toNext).toFixed(1)}" height="5" rx="2.5"
                  fill="${capped ? C.gold[300] : C.kiss[300]}"/>
        </g>`;
    },
});
