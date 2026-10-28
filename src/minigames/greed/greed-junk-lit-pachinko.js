// ================= АППАРАТ АЛЧНОСТИ: ПАЧИНКО НА СВЕТУ =================
// Продолжение GreedJunkLit. Короб пачинко (рисунок — greed-junk-pachinko.js)
// — освещённый прибор своим холстом (greed-junk-lit-device.js). Холсты
// рисуются в координатах короба, а на аппарат ставятся крупнее (PACH_AT).
// Три холста снизу вверх: мягкая тень короба на аппарат (уходит от света
// переносом холста, как у колеса), сам короб на свету шейдером (только
// когда сдвинулся свет), стекло — готовым видом, один раз.
//
// Колесо монтируется после — его холсты поверх: колесо на переднем плане и
// заходит на левую стенку короба.
Object.assign(GreedJunkLit, {
    PACH_SINK_MS: 180,   // провал шарика в лунку или сток
    // тень: короб стоит в рельсах на gap от стенки, полутень — blur
    // Тень короба — два слоя. near: на то, что сразу за коробом (щит,
    // полка, стойка рамки) — короткая и чёткая, обрезана по аппарату.
    // far: на стену гаража за аппаратом (короб торчит над рамкой и правее
    // неё) — далеко, широко и бледно; лежит ПОД корпусом аппарата, и где
    // аппарат есть, его закрывает сам корпус. Было: одна тень на всё — на
    // стене за аппаратом она лежала так же близко, как на щите.
    PACH_SHADOW: { near: { gap: 6, max: 10, blur: 2.5, a: 0.45 }, far: { gap: 34, max: 44, blur: 9, a: 0.28 } },
    // аппарат там, где ложится ближняя тень: рамка верхнего ящика (поле
    // аппарата; остальные коробки — в пространстве короба, PACH_AT)
    PACH_NEAR_CLIP: { x: 16, y: -55, w: 304, h: 355 },

    pachBox(pad = 0) {
        const P = GreedJunk.PACH;
        return { x: P.x0 - 2 - pad, y: P.y0 - 2 - pad, w: P.x1 - P.x0 + 4 + pad * 2, h: P.y1 - P.y0 + 4 + pad * 2 };
    },

    pachMountLit(wrap) {
        if (!GreedJunk.pachinkoShown || !GreedJunk.pachinkoShown()) return;
        const G = GreedJunk, S = this.SCALE;
        // B — в пространстве короба: холст рисуется в его координатах, а на
        // аппарат ставится увеличенным (G.pachRect)
        const layer = (B) => {
            const cv = document.createElement('canvas');
            cv.width = Math.round(B.w * S); cv.height = Math.round(B.h * S);
            cv.style.cssText = `position:absolute;${G.css(G.pachRect(B))}z-index:1;pointer-events:none;background:none`;
            wrap.appendChild(cv);
            return cv;
        };
        // дальняя — под корпусом: вставляется перед его холстом
        const far = layer(this.pachShadowBox('far'));
        far.style.zIndex = '0';
        if (this._glCanvas && this._glCanvas.parentNode === wrap) wrap.insertBefore(far, this._glCanvas);
        // ближняя — поверх корпуса, в рамке аппарата
        const C = this.PACH_NEAR_CLIP, nclip = document.createElement('div');
        nclip.style.cssText = `position:absolute;${G.css(C)}overflow:hidden;z-index:1;pointer-events:none`;
        const near = layer(this.pachShadowBox('near'));
        const B = G.pachRect(this.pachShadowBox('near'));
        near.style.left = `${(B.x - C.x) / C.w * 100}%`; near.style.top = `${(B.y - C.y) / C.h * 100}%`;
        near.style.width = `${B.w / C.w * 100}%`; near.style.height = `${B.h / C.h * 100}%`;
        nclip.appendChild(near);
        wrap.appendChild(nclip);
        this.pachShadowCv = { near, far };
        this.pachCv = layer(this.pachBox());
        // шарик — между коробом и стеклом: стекло поверх него
        this.pachBallCv = layer(this.pachBox());
        this.pachGlassCv = layer(this.pachBox());
        // блики стекла — свой слой больше листа, обрезанный по листу:
        // сдвигается за светом (pachGlareAt)
        const R = G.pachGlassRect(), m = this.PACH_GLARE.m;
        const clip = document.createElement('div');
        clip.style.cssText = `position:absolute;${G.css(G.pachRect({ x: R.x0, y: R.y0, w: R.x1 - R.x0, h: R.y1 - R.y0 }))}overflow:hidden;z-index:1;pointer-events:none`;
        const gc = document.createElement('canvas');
        gc.width = Math.round((R.x1 - R.x0 + 2 * m) * S); gc.height = Math.round((R.y1 - R.y0 + 2 * m) * S);
        gc.style.cssText = `position:absolute;left:${-m / (R.x1 - R.x0) * 100}%;top:${-m / (R.y1 - R.y0) * 100}%;` +
            `width:${(R.x1 - R.x0 + 2 * m) / (R.x1 - R.x0) * 100}%;height:${(R.y1 - R.y0 + 2 * m) / (R.y1 - R.y0) * 100}%;background:none`;
        clip.appendChild(gc);
        wrap.appendChild(clip);
        this.pachGlareCv = gc;
        this._pach = { shown: null, ball: null, acc: 0, at: 0, press: 0 };
        this._pachP = this.pachSprites();
        // Кнопка запуска — тап по ней. Зона шире нарисованной кнопки: было
        // +4, на телефоне ~20 pt — мимо пальцем. Ниже — рукоять рычага, их
        // зоны не сходятся (рычаг ловит с y 282).
        wrap.addEventListener('pointerdown', (e) => {
            const B = G.PACH.button, [x, y] = G.pachInv(...G.toField(e, wrap));
            if (Math.hypot(x - B.x, y - B.y) > B.r + 11) return;
            e.preventDefault(); e.stopPropagation();
            this.pachLaunch();
        });
    },

    // ---------- ИСХОД: ЗАПУСК ПОД РЕШЁННУЮ ЛУНКУ ----------
    // Куда упадёт шарик, решает игра заранее (onPach → ключ лунки,
    // инвариант 2), а летит он по честной физике. Физика детерминирована:
    // скорость запуска v0 всегда ведёт в одну лунку. Значит, нужен v0 под
    // ключ — его ищут прогоном физики без рисования.
    //
    // Прогон — ~2.5 мс на сервере, на телефоне ~10, а редкой лунке нужно в
    // среднем ~80 прогонов: искать по нажатию — секунда ожидания. Поэтому
    // запас: пока короб стоит без дела, в паузах кадров (POOL_MS за кадр)
    // набирается по POOL запусков на каждый исход; нажатие берёт из запаса,
    // на его место ищется новый. Запуск расходуется один раз — пути не
    // повторяются. Запас хранится на телефоне (ключ — устройство поля:
    // поменялись гвозди или лунки — запас пересчитывается).
    POOL: 2, POOL_MS: 4,
    pachKey(done) { return done === 'drain' ? 'blank' : String(done).replace(/^cup:/, ''); },
    pachPoolId() {
        const G = GreedJunk, K = G.PACH_PHYS;
        return 'gj-pach-pool:' + G.pachNails().length + ':' + G.PACH_CUPS.map(c => c.key + c.x + c.y).join('') +
            ':' + [K.g, K.r, K.eNail, K.eWall, K.lip, K.v0.join('-')].join(',');
    },
    pachPool() {
        if (this._pool) return this._pool;
        let p = {};
        try { p = JSON.parse(localStorage.getItem(this.pachPoolId()) || '{}') || {}; } catch (e) { p = {}; }
        return (this._pool = p);
    },
    pachPoolSave() {
        try { localStorage.setItem(this.pachPoolId(), JSON.stringify(this._pool || {})); } catch (e) { /* нет хранилища */ }
    },
    // один прогон: случайный v0 → в запас, если там под его исход есть место
    pachTry() {
        const G = GreedJunk, K = G.PACH_PHYS, pool = this.pachPool();
        const v0 = K.v0[0] + Math.random() * (K.v0[1] - K.v0[0]);
        const b = G.pachBall(v0);
        while (!b.done) G.pachStepBall(b);
        const key = this.pachKey(b.done), list = pool[key] || (pool[key] = []);
        if (list.length < this.POOL) { list.push(v0); this._poolDirty = true; }
        return key;
    },
    pachKeys() { return Array.from(new Set(GreedJunk.PACH_CUPS.map(c => c.key).concat('blank'))); },
    // Добор запаса в паузе кадра. Короб занят шариком — не добирает (кадры
    // нужны полёту); всё набрано — стоит.
    pachFill(now) {
        const M = this._pach;
        // пока идёт переход (покров монет) — не добирать: кадры нужны ему
        if (typeof MgVeil !== 'undefined' && MgVeil.busy) return;
        if ((M.ball && !M.seek) || M.sink) return;
        const pool = this.pachPool(), keys = this.pachKeys();
        const want = M.seek || null;
        if (!want && keys.every(k => (pool[k] || []).length >= this.POOL)) {
            if (this._poolDirty) { this._poolDirty = false; this.pachPoolSave(); }
            return;
        }
        const t0 = performance.now(), budget = want ? 10 : this.POOL_MS;
        while (performance.now() - t0 < budget) {
            this.pachTry();
            if (want && (pool[want] || []).length) break;
        }
        if (want && (pool[want] || []).length) this.pachFire(pool[want].shift());
    },

    // Запас целиком — под покровом входа (GreedJunkLit.settled): порциями
    // по ~30 мс с отдачей потока, пока не наберётся. Монеты стоят, их кадры
    // не страдают. Иначе в первый раз на устройстве запас добирался в кадрах
    // уже после входа: прогон на телефоне дольше порции — подлагивало.
    // Дальше запас хранится на телефоне, и это мгновенно.
    pachFillAll() {
        if (!this._pgl) return Promise.resolve();
        const pool = this.pachPool(), keys = this.pachKeys();
        const full = () => keys.every(k => (pool[k] || []).length >= this.POOL);
        return new Promise((done) => {
            const chunk = () => {
                const t0 = performance.now();
                while (!full() && performance.now() - t0 < 30) this.pachTry();
                if (full()) { if (this._poolDirty) { this._poolDirty = false; this.pachPoolSave(); } done(); }
                else setTimeout(chunk, 0);
            };
            chunk();
        });
    },

    // Кнопка. Пока шарик летит — только щелчок. Игра решает исход (onPach);
    // без игры (превью) — как пружина бросит.
    pachLaunch() {
        const M = this._pach, K = GreedJunk.PACH_PHYS;
        if (!M || !this._pgl) return;
        M.press = performance.now();
        if (M.ball || M.seek || M.sink) { if (typeof Haptics !== 'undefined') Haptics.tick(); return; }
        if (!this.onPach) { this.pachFire(K.v0[0] + Math.random() * (K.v0[1] - K.v0[0])); return; }
        const key = this.onPach();
        if (key === false || key == null) { if (typeof Haptics !== 'undefined') Haptics.notify('error', true); return; }
        const list = this.pachPool()[key] || [];
        if (list.length) { this.pachFire(list.shift()); this._poolDirty = true; return; }
        // Запаса нет (первый раз): шарик лежит на пружине, пока ищется
        // запуск — кусками по кадрам (pachFill)
        M.seek = key;
        M.ball = GreedJunk.pachBall(0);
        M.ball.hold = true;
    },
    pachFire(v0) {
        const M = this._pach;
        M.seek = null;
        M.ball = GreedJunk.pachBall(v0);
        M.acc = 0; M.bat = 0;
        M.fireAt = performance.now();
        if (typeof Haptics !== 'undefined') Haptics.impact('rigid', true);
    },

    // Шарик — полированная сталь на свету шейдером, как всё остальное:
    // полусфера в карте высот, блик и тень от света. Картинка считается
    // прибором короба (deviceSprite) при смене света; в полёте рисуется
    // готовая. Было — нарисованный блик сверху-слева: при наклоне гвозди
    // рядом меняли свет, а шарик — нет.
    pachBallSprite() {
        if (this._pachSpr) return this._pachSpr;
        const Q = this._pgl, M = this._pach;
        if (!Q || !Q.ball) return null;
        const S = this.SCALE * 2, r = GreedJunk.PACH_PHYS.r, n = Math.ceil((r + 1) * 2 * S);
        const L = this.lightFor((M && M.lt) || this._tilt || { x: 0, y: 0 });
        // пружина — к тому же свету, все сжатия разом
        if (Q.spring) {
            const SB = GreedJunk.pachSpringBox();
            this._springSpr = Q.spring.map(st => this.deviceSprite(Q, st, Math.round(SB.w * S), Math.round(SB.h * S), L));
        }
        return (this._pachSpr = this.deviceSprite(Q, Q.ball, n, n, L));
    },
    // Сжатие пружины: пока ищется запуск — сжата (шарик на ней), выстрел —
    // распрямляется за SPRING_MS. Иначе 0.
    SPRING_K: [0, 0.33, 0.66, 1], SPRING_MS: 110,
    pachSpringK(now) {
        const M = this._pach;
        if (M.seek) return 1;
        const t = now - (M.fireAt || -1e9);
        return t < this.SPRING_MS ? 1 - t / this.SPRING_MS : 0;
    },
    // карты шарика: круг, полусфера (подъём = радиус), полированная сталь;
    // тело тёмное — хром в жизни тёмный, с ярким пятном отражения (светлое
    // тело с бликом полированной стали выходило белым шаром без блика)
    // Подъём купола — два радиуса: картинка шарика вдвое крупнее масштаба
    // корпуса (S = SCALE·2), а нормаль считается под масштаб корпуса —
    // склон с подъёмом в радиус выходил вдвое пологим, шар плоским.
    async pachBallMaps(Q) {
        const G = GreedJunk, J = PALETTE.greedJunk, S = this.SCALE * 2, r = G.PACH_PHYS.r, R = r + 1, n = Math.ceil(R * 2 * S);
        // купол в 12 ступеней: у domeH для малого радиуса их 4 — на шарике
        // крупным планом они читались кольцами
        const dome = '<g class="hpass">' + G.profile(12).map(([k, u]) =>
            `<circle r="${(r * k).toFixed(3)}" style="--dh:${G.dh(r * 2 * u)}"/>`).join('') + '</g>';
        const svg = (pass) => {
            G.pass = pass;
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="${-R} ${-R} ${R * 2} ${R * 2}">` + G.passStyle(pass) +
                G.T(2, 'chrome', `<circle r="${r}" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="0.5"/>` + dome) + '</svg>';
        };
        const maps = await Promise.all(['albedo', 'height', 'mat'].map(ps => this.image(svg(ps))));
        G.pass = 'baked';
        Q.ball = this.deviceSet(Q, maps);
        // пружина: сжатия SPRING_K, те же три карты, в масштабе шарика
        const SB = G.pachSpringBox(), sw = Math.round(SB.w * S), sh = Math.round(SB.h * S);
        const ssvg = (pass, k) => {
            G.pass = pass;
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="${SB.x} ${SB.y} ${SB.w} ${SB.h}">` +
                G.passStyle(pass) + G.T(6.5, 'steel', G.pachSpring(k)) + '</svg>';
        };
        // набор — целиком и только потом в прибор: картинки шарика
        // считаются в кадре и брали неполный набор пружины
        const sets = [];
        for (const k of this.SPRING_K) {
            const sm = await Promise.all(['albedo', 'height', 'mat'].map(ps => this.image(ssvg(ps, k))));
            sets.push(this.deviceSet(Q, sm));
        }
        Q.spring = sets;
        G.pass = 'baked';
        this._pachSpr = null;
        if (this._pach) this._pach.dirty = true;
    },

    // Полёт: физика фиксированным шагом (на любом кадре путь один), удар о
    // гвоздь — щелчок в палец, лунка — удар, сток — мягкий. Холст шарика
    // рисуется только пока шарик летит или кнопка нажата.
    pachBallStep(now) {
        const M = this._pach, G = GreedJunk, K = G.PACH_PHYS;
        // свои часы у полёта (bat), свои у света (at): были одни — полёт
        // переводил их каждый кадр, и пауза перед перерисовкой света не
        // проходила никогда, короб не перекрашивался от наклона вовсе
        const dt = Math.min(0.05, M.bat ? (now - M.bat) / 1000 : 1 / 60);
        M.bat = now;
        const pressed = now - M.press < 140;
        const springK = this.pachSpringK(now);
        if (!M.ball && !M.sink && !pressed && !M.dirty && springK === 0 && !M.springWas) return;
        if (M.ball && M.ball.hold) M.press = now;          // ищется запуск — кнопка вдавлена
        if (M.ball && !M.ball.hold) {
            M.acc += dt;
            while (M.acc >= K.STEP && M.ball) {
                M.acc -= K.STEP;
                const ev = G.pachStepBall(M.ball);
                if (ev === 'nail' && typeof Haptics !== 'undefined') Haptics.tick();
                if (M.ball.done) {
                    const res = M.ball.done, b = M.ball;
                    if (typeof Haptics !== 'undefined') Haptics.impact(res === 'drain' ? 'soft' : 'medium', true);
                    // Провал: шарик ещё уходит вниз, обрезанный по кромке —
                    // за переднюю стенку банки или в щель стока; выплата —
                    // когда скрылся. Было: шарик исчезал в тот же миг.
                    const cup = res === 'drain' ? null : G.pachWorld().cups.find(c => b.x >= c.x0 && b.x <= c.x1);
                    // в стоке — по передней панели: в тёмной щели шарик ещё виден
                    M.sink = { x: b.x, y: b.y, at: now, cut: cup ? cup.y0 + 0.6 : G.PACH.y1 - G.PACH.panel, res };
                    M.ball = null;
                }
            }
        }
        const S = this.SCALE, B = this.pachBox(), c = this.pachBallCv.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, this.pachBallCv.width, this.pachBallCv.height);
        c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        // пружина — ближайшее посчитанное сжатие
        this.pachBallSprite();          // к свету — и шарик, и пружина
        if (this._springSpr) {
            const ks = this.SPRING_K, i = ks.reduce((b, k, j) => Math.abs(k - springK) < Math.abs(ks[b] - springK) ? j : b, 0);
            const SB = G.pachSpringBox();
            c.drawImage(this._springSpr[i], SB.x, SB.y, SB.w, SB.h);
        }
        M.springWas = springK > 0;
        if (pressed) {
            // Кнопка утоплена: колпак уходит в обод — обод кладёт на него
            // серп тени со стороны света, сам колпак чуть темнеет. Было:
            // просто темнел.
            const Bt = G.PACH.button, L = this.lightFor(this._tilt || { x: 0, y: 0 }), n = Math.hypot(L[0], L[1]) || 1;
            const ox = -L[0] / n * 2.2, oy = -L[1] / n * 2.2;
            c.save();
            c.beginPath(); c.arc(Bt.x, Bt.y, Bt.r, 0, Math.PI * 2); c.clip();
            c.fillStyle = PALETTE.greedJunk.hole;
            c.globalAlpha = 0.18; c.fillRect(Bt.x - Bt.r, Bt.y - Bt.r, Bt.r * 2, Bt.r * 2);
            c.globalAlpha = 0.45;
            c.beginPath(); c.arc(Bt.x, Bt.y, Bt.r, 0, Math.PI * 2); c.arc(Bt.x - ox, Bt.y - oy, Bt.r, 0, Math.PI * 2, true); c.fill('evenodd');
            c.restore(); c.globalAlpha = 1;
        }
        if (M.sink) {
            // провал: вниз на радиус с хвостиком, выше кромки — видно
            const k = Math.min(1, (now - M.sink.at) / this.PACH_SINK_MS), r = K.r, spr = this.pachBallSprite();
            if (spr) {
                c.save();
                c.beginPath(); c.rect(M.sink.x - r - 2, M.sink.cut - 40, (r + 2) * 2, 40); c.clip();
                c.drawImage(spr, M.sink.x - r - 1, M.sink.y + k * (r * 2.4) - r - 1, (r + 1) * 2, (r + 1) * 2);
                c.restore();
            }
            if (k >= 1) {
                const res = M.sink.res;
                M.sink = null;
                if (this.onPachDone) this.onPachDone(res);
            }
        }
        if (M.ball) {
            const b = M.ball, r = K.r, spr = this.pachBallSprite(), L = this.lightFor(this._tilt || { x: 0, y: 0 });
            if (!spr) return;
            // тень шарика на поле: от света, шарик над краской на свой радиус
            c.globalAlpha = 0.35; c.fillStyle = PALETTE.greedJunk.hole;
            c.beginPath(); c.arc(b.x - L[0] / L[2] * r, b.y - L[1] / L[2] * r, r * 0.95, 0, Math.PI * 2); c.fill();
            c.globalAlpha = 1;
            // ищется запуск — шарик лежит на сжатой пружине
            const by = b.y + (b.hold ? G.SPRING_DROP * springK : 0);
            c.drawImage(spr, b.x - r - 1, by - r - 1, (r + 1) * 2, (r + 1) * 2);
        }
        M.dirty = !!M.ball || !!M.sink || pressed || springK > 0;
    },

    // Карты короба — один раз. Высоты в своей карте (важна разница):
    // поле на 2, стенки ящика на 12 — поле утоплено, стенки кладут на него
    // тень; лунки торчат на 4, гвозди — на nailUp, кнопка — над стенкой.
    async pachSprites() {
        const G = GreedJunk, S = this.SCALE, B = this.pachBox(), P = G.PACH;
        try {
            const svg = (pass, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(B.w * S)}" height="${Math.round(B.h * S)}" ` +
                `viewBox="${B.x} ${B.y} ${B.w} ${B.h}">` + G.passStyle(pass) + G.defs() + inner + '</svg>';
            const box = (pass) => {
                G.pass = pass;
                const p = G.pachParts();
                return svg(pass, G.T(12, 'lacquer', p.frame) + G.T(2, 'paint', p.field) + G.T(2, 'raw', p.drain) +
                    G.T(6.5, 'steel', p.steel) + G.T(6, 'paint', p.cups) + G.T(2 + P.nailUp, 'steel', p.nails) +
                    G.T(13, 'steel', p.corners) + G.T(13, 'plastic', p.button));
            };
            const maps = await Promise.all(['albedo', 'height', 'mat'].map(ps => this.image(box(ps))));
            G.pass = 'baked';
            const glass = await this.image(svg('baked', G.pachGlass()));
            G.pass = 'baked';
            const Q = this.deviceGL(this.pachCv);
            if (!Q) throw new Error('нет WebGL');
            Q.box = this.deviceSet(Q, maps);
            this._pgl = Q;
            await this.pachBallMaps(Q);
            const g = this.pachGlassCv.getContext('2d');
            g.drawImage(glass, 0, 0, this.pachGlassCv.width, this.pachGlassCv.height);
            const R = G.pachGlassRect(), m = this.PACH_GLARE.m;
            const glare = await this.image(`<svg xmlns="http://www.w3.org/2000/svg" width="${this.pachGlareCv.width}" height="${this.pachGlareCv.height}" ` +
                `viewBox="${R.x0 - m} ${R.y0 - m} ${R.x1 - R.x0 + 2 * m} ${R.y1 - R.y0 + 2 * m}">${G.pachGlare(m)}</svg>`);
            this.pachGlareCv.getContext('2d').drawImage(glare, 0, 0);
            this.pachGlareAt(this.lightFor(this._tilt || { x: 0, y: 0 }));
            this.pachShadow();
            this._pach.shown = null;
        } catch (e) {
            G.pass = 'baked';
            // видно в 🐞 на кнопке «Пачинко»: на iPhone консоли нет
            this.pachError = String((e && e.message) || e || 'картинка').slice(0, 40);
            console.warn('[Аппарат] пачинко не собралось', e);
        }
    },

    // Тень короба на аппарат: мягкий прямоугольник ровно под ним, один раз;
    // куда ляжет — pachShadowAt (как у колеса).
    pachShadowBox(k) { const K = this.PACH_SHADOW[k]; return this.pachBox(K.blur * 3); },
    // тени — мягкий прямоугольник ровно под коробом, один раз на слой
    pachShadow() {
        const S = this.SCALE, P = GreedJunk.PACH;
        ['near', 'far'].forEach(k => {
            const B = this.pachShadowBox(k), K = this.PACH_SHADOW[k], c = this.pachShadowCv[k].getContext('2d');
            c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
            c.filter = 'blur(' + (K.blur * S) + 'px)';
            c.globalAlpha = K.a; c.fillStyle = PALETTE.greedJunk.hole;
            c.fillRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0);
            c.filter = 'none'; c.globalAlpha = 1;
        });
        this.pachShadowAt(this.lightFor(this._tilt || { x: 0, y: 0 }));
    },
    // Блик стекла идёт за светом: сдвиг — разница направления света с
    // исходным (без наклона), умноженная на k; не дальше запаса слоя m.
    PACH_GLARE: { m: 40, k: 70 },
    pachGlareAt(L) {
        const cv = this.pachGlareCv, K = this.PACH_GLARE, R = GreedJunk.pachGlassRect();
        if (!cv) return;
        const n = Math.hypot(L[0], L[1], L[2]) || 1, L0 = this.lightFor({ x: 0, y: 0 }), n0 = Math.hypot(L0[0], L0[1], L0[2]) || 1;
        const cl = (v) => Math.max(-K.m, Math.min(K.m, v));
        const dx = cl((L[0] / n - L0[0] / n0) * K.k), dy = cl((L[1] / n - L0[1] / n0) * K.k);
        cv.style.transform = `translate(${(dx / (R.x1 - R.x0 + 2 * K.m) * 100).toFixed(2)}%, ${(dy / (R.y1 - R.y0 + 2 * K.m) * 100).toFixed(2)}%)`;
    },

    // сдвиг от света: короб над поверхностью на gap, не дальше max
    pachShadowAt(L) {
        if (!this.pachShadowCv) return;
        ['near', 'far'].forEach(k => {
            const cv = this.pachShadowCv[k], K = this.PACH_SHADOW[k], B = this.pachShadowBox(k);
            let dx = -L[0] / L[2] * K.gap, dy = -L[1] / L[2] * K.gap;
            const d = Math.hypot(dx, dy);
            if (d > K.max) { dx *= K.max / d; dy *= K.max / d; }
            cv.style.transform = `translate(${(dx / B.w * 100).toFixed(2)}%, ${(dy / B.h * 100).toFixed(2)}%)`;
        });
    },

    // Кадр: короб перерисовывается только когда сдвинулся свет (наклон с
    // мёртвой зоной — _tilt корпуса) и не чаще LIGHT_MS.
    pachStep(now) {
        const M = this._pach;
        if (!M || !this._pgl) return;
        this.pachBallStep(now);
        this.pachFill(now);
        const t = this._tilt || { x: 0, y: 0 };
        if (M.shown && M.lt && M.lt.x === t.x && M.lt.y === t.y) return;
        if (M.shown && now - (M.at || 0) < this.LIGHT_MS) return;
        M.lt = { x: t.x, y: t.y }; M.at = now; M.shown = true;
        this._pachSpr = null;          // шарик и пружина — к новому свету
        M.dirty = true;
        const L = this.lightFor(M.lt), Q = this._pgl, B = this.pachBox();
        this.deviceBegin(Q, L);
        this.deviceDraw(Q, B, Q.box, B.x + B.w / 2, B.y + B.h / 2, B.w / 2, B.h / 2);
        this.pachShadowAt(L);
        this.pachGlareAt(L);
    }
});
