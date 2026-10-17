// ================= ЗАВИСТЬ: ОБЛАКА, ВВОД, ХОД ИГРЫ, ЦИКЛ =================
// Продолжение EnvyMinigame (envy.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после envy.js.
Object.assign(EnvyMinigame, {

    // ================= ОБЛАКА =================
    wrongCountFor(fill) {
        const b = this.balance();
        const step = Math.max(0, Math.min(b.rounds - 1, fill));
        return Math.min(b.wrongMax, b.wrongBase + b.wrongPerRound * step);
    },

    rebuildClouds() {
        this.disposeCloud(this.clouds.cur);
        this.disposeCloud(this.clouds.next);
        this.disposeCloud(this.clouds.prev);

        const s = this.layout.spacing;
        this.clouds.cur = this.buildCloud(0, this.wrongCountFor(this.fillThirds));
        this.clouds.next = this.buildCloud(-s, this.wrongCountFor(this.fillThirds + 1));
        this.clouds.prev = this.buildCloud(s, this.wrongCountFor(this.fillThirds - 1));
        this.hideNeighbours();

        this.camera.position.z = ENVY_SCENE.CAM_DIST;
        this.activeTile = null;
        this.waves = [];
    },

    // Пока камера стоит, соседние облака не рисуются. Предыдущее и так за
    // спиной, а следующее в покое видно крошечным пятном через просветы между
    // образами — оно читается грязью, а не «облаком вдалеке». Показывается
    // ровно в тот момент, когда камера трогается к нему.
    hideNeighbours() {
        if (this.clouds.prev) this.clouds.prev.group.visible = false;
        if (this.clouds.next) this.clouds.next.group.visible = false;
    },

    buildCloud(originZ, wrongCount) {
        const L = this.layout;
        const group = new THREE.Group();
        group.position.z = originZ;
        this.scene.add(group);


        // Места и ячейки. Наклейке достаётся радиус её ячейки — ровно столько
        // она обязана накрыть собой, чтобы полотно сомкнулось.
        const spots = ENVY_PACKING.build(
            L.cols, L.rows, L.cell, L.rowStep, L.cell * ENVY_SCENE.JITTER,
            { x0: -L.fieldW / 2, y0: -L.fieldH / 2, x1: L.fieldW / 2, y1: L.fieldH / 2 },
            ENVY_SCENE.RELAX_STEPS
        );


        // Ячейки Вороного даже после релаксации расходятся по размеру почти
        // вдвое, и одна и та же наклейка попадалась то крохотной, то огромной.
        // Радиусы поджимаются к медиане: наклейка крупнее своей ячейки в
        // ENVY_BULGE раз, и этого запаса хватает, чтобы урезанная всё равно
        // ячейку накрыла — щелей в полотне не появляется.
        // Радиус ограничивается и расстоянием до ближайшего соседа: у
        // вытянутой ячейки дальняя вершина далеко, а сосед при этом вплотную —
        // такая наклейка раздувалась и топила соседей, сколько её слой ни
        // переставляй. Множитель 1.16 — отношение описанной окружности
        // правильного шестиугольника к вписанной: ровно столько нужно, чтобы
        // накрыть ячейку, и ни на волос больше.
        spots.forEach(s => { s.radius = Math.min(s.radius, s.gap * 0.5 * 1.16); });

        const radii = spots.map(s => s.radius).sort((a, b) => a - b);
        const median = radii[Math.floor(radii.length / 2)] || 1;
        const lo = median * ENVY_SCENE.CELL_SPREAD_MIN;
        const hi = median * ENVY_SCENE.CELL_SPREAD_MAX;

        // Слои раздаются вразнобой: облако должно быть кучей наклеек, сквозь
        // которую камера пролетает, как сквозь рой, а не наклонной плоскостью.
        const layers = spots.map((_, i) => i);
        for (let i = layers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [layers[i], layers[j]] = [layers[j], layers[i]];
        }
        const depthOf = layers.map(l => l * ENVY_SCENE.LAYER_STEP);

        // Соседи каждой наклейки — по ним раздаются образы, чтобы одинаковые
        // не оказались рядом.
        const near = spots.map((s, i) => {
            const list = [];
            for (let j = 0; j < spots.length; j++) {
                if (j === i) continue;
                if (Math.hypot(spots[j].x - s.x, spots[j].y - s.y) < L.cell * 1.7) list.push(j);
            }
            return list;
        });
        const tiles = [];
        const meshes = [];
        const pool = this.imagePool;

        // Образы раздаются КОЛОДОЙ, а не жребием на каждую наклейку: пул
        // тасуется и раздаётся по одному, и пока колода не кончится, двух
        // одинаковых образов на полотне не будет. Кончится — тасуется заново,
        // так что при пуле меньше числа наклеек повторы идут ровными кругами,
        // а не сбиваются в кучу, как это выходило при случайном выборе.
        //
        // Когда образов наберётся больше, чем наклеек в облаке (сейчас их 35),
        // повторов не станет вовсе — код для этого уже готов, дело за
        // картинками.
        let deck = [];
        const chosen = [];
        const deal = (index) => {
            for (let attempt = 0; attempt < 3; attempt++) {
                if (!deck.length) {
                    deck = pool.slice();
                    for (let i = deck.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [deck[i], deck[j]] = [deck[j], deck[i]];
                    }
                }
                const image = deck.pop();
                // Один и тот же образ рядом с собой читается ошибкой генерации,
                // поэтому у соседей он уступает место следующему из колоды.
                const clash = near[index].some(j => chosen[j] === image);
                if (!clash || deck.length === 0) { chosen[index] = image; return image; }
                deck.unshift(image);
            }
            const image = deck.pop() || pool[0];
            chosen[index] = image;
            return image;
        };

        spots.forEach((spot, index) => {
            const radius = Math.max(lo, Math.min(hi, spot.radius));
            const image = deal(index);

            // Круг наклейки сажается ровно на ячейку — этим полотно и
            // смыкается. Ячейки Вороного разного размера, поэтому размер
            // считается для каждой наклейки от своей.
            // CELL_FILL — прямой размен «перекрытие против щелей». При 1.0
            // наклейка накрывает свою ячейку целиком и щелей нет по
            // построению, но соседей она заслоняет наполовину. Ниже —
            // просторнее, ценой просветов в самых острых углах ячеек.
            const size = radius * ENVY_SCENE.CELL_FILL / image.core;

            // Тон уже вписан в текстуру: рисунок многоцветный, одним
            // множителем его не покрасить. material.color остаётся белым и
            // работает только на подсветку волной.
            const variant = image.variants[Math.floor(Math.random() * image.variants.length)];
            const material = new THREE.MeshBasicMaterial({
                map: variant,
                color: new THREE.Color(0xffffff),
                transparent: true,
                // Отсекает только сглаженную кромку текстуры: образы больше
                // не растворяются поштучно, их гасит ореол.
                alphaTest: 0.5,
                depthTest: true,
                depthWrite: true
            });

            const mesh = new THREE.Mesh(this.tileGeometry, material);
            // Наклейку слегка кренит, но не крутит: перевёрнутая вверх ногами
            // кошка перестаёт быть кошкой, а образ должен читаться сразу.
            mesh.rotation.z = (Math.random() * 2 - 1) * ENVY_SCENE.TILT;
            group.add(mesh);
            meshes.push(mesh);

            tiles.push({
                mesh,
                mat: material,
                baseColor: new THREE.Color(0xffffff),
                bx: spot.x,
                by: spot.y,
                size,
                mask: image.mask,
                image,
                depth: depthOf[index],
                rot: mesh.rotation.z,
                seed: Math.random() * 10,
                driftPhase: Math.random() * Math.PI * 2,
                kind: 'empty',
                heldMs: 0,
                hinted: false
            });
        });

        this.assignSignificant(tiles, wrongCount);

        // Габарит самой крупной наклейки: по нему меряется ореол, иначе
        // крупные образы в него не влезают.
        const cloud = {
            group, tiles, meshes, lastV: null,
            maxSize: tiles.reduce((m, t) => Math.max(m, t.size), 0)
        };
        this.cloudCompensate(cloud, true);
        return cloud;
    },

    // Значимые образы разносим по полю: если правильный и неправильный лежат
    // в соседних клетках, палец задевает оба разом и подсказка врёт.
    //
    // Отбор идёт по ВИДИМОЙ области, а не по краю сетки: крайние клетки висят
    // за экраном, а верхний правый угол занят крестиком — образ, попавший под
    // него, недоступен пальцем, и раунд становится непроходимым.
    assignSignificant(tiles, wrongCount) {
        const L = this.layout;
        const pool = tiles.slice();   // всё облако внутри поля, отбирать нечего
        const minDist = this.layout.cell * 1.6;
        const chosen = [];
        let need = wrongCount + 1;
        let guard = 0;

        while (chosen.length < need && guard < 600) {
            guard++;
            const candidate = pool[Math.floor(Math.random() * pool.length)];
            if (!candidate || chosen.includes(candidate)) continue;
            const ok = chosen.every(t => Math.hypot(t.bx - candidate.bx, t.by - candidate.by) >= minDist);
            if (ok) chosen.push(candidate);
        }
        // На узком экране разнести всех не вышло — ослабляем требование,
        // но правильный образ обязан быть всегда.
        while (chosen.length < need) {
            const candidate = pool[Math.floor(Math.random() * pool.length)];
            if (candidate && !chosen.includes(candidate)) chosen.push(candidate);
            else break;
        }

        chosen.forEach((tile, i) => { tile.kind = (i === 0) ? 'right' : 'wrong'; });
    },

    disposeCloud(cloud) {
        if (!cloud) return;
        cloud.tiles.forEach(t => t.mat.dispose());
        this.scene.remove(cloud.group);
    },

    // Компенсация перспективы. Образ на глубине d раздувается ровно настолько,
    // насколько его уменьшит перспектива с расстояния V — и облако с этой
    // точки складывается в плоский рисунок.
    //
    // V — реальное расстояние до переднего плана, но не меньше рабочего
    // CAM_DIST. Пока облако далеко (мы к нему летим), оно остаётся плоским и
    // просто растёт; как только камера подходит на рабочую дистанцию и
    // начинает проваливаться внутрь, компенсация замирает — и облако
    // раскрывается в глубину, сквозь которую летит камера.
    cloudCompensate(cloud, force) {
        const V = Math.max(ENVY_SCENE.CAM_DIST, this.camera.position.z - cloud.group.position.z);
        if (!force && cloud.lastV === V && cloud !== this.clouds.cur) return;
        cloud.lastV = V;

        for (const t of cloud.tiles) {
            const f = (V + t.depth) / V;
            const size = t.size * (t.swayScale || 1) * f;
            t.mesh.position.set((t.bx + (t.offX || 0)) * f, (t.by + (t.offY || 0)) * f, -t.depth);
            t.mesh.scale.set(size, size, 1);
            t.mesh.rotation.z = t.rot + (t.swayRot || 0);
        }
    },

    // ================= ВВОД =================
    localPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },

    onPointerDown(e) {
        if (this.state !== 'play') return;
        if (this.confirmOverlay && this.confirmOverlay.classList.contains('show')) return;
        e.preventDefault();
        const p = this.localPos(e);
        this.pointerDown = true;
        this.pointerX = p.x;
        this.pointerY = p.y;
    },

    onPointerMove(e) {
        if (!this.pointerDown || this.state !== 'play') return;
        e.preventDefault();
        const p = this.localPos(e);
        this.pointerX = p.x;
        this.pointerY = p.y;
    },

    onPointerUp() {
        if (!this.pointerDown) return;
        this.pointerDown = false;
        this.clearTouch();
    },

    clearTouch() {
        const cloud = this.clouds.cur;
        if (cloud) {
            cloud.tiles.forEach(t => {
                t.heldMs = 0;
                t.hinted = false;
            });
        }
        this.activeTile = null;
    },

    // Какие образы лежат под пальцем, от ближнего к дальнему.
    //
    // Считается от БАЗОВОЙ позиции образа, а не от его меша. Меш дрожит и
    // качается на волне, и пока попадание проверялось лучом по мешам, сильно
    // раскачанный образ уезжал из-под неподвижного пальца сам — удержание
    // срывалось и начиналось заново. Дрожит только картинка; место, за
    // которое образ держат, стоит неподвижно.
    pickTiles(px, py) {
        const cloud = this.clouds.cur;
        const rect = this.canvas.getBoundingClientRect();
        const V = Math.max(ENVY_SCENE.CAM_DIST, this.camera.position.z - cloud.group.position.z);
        const halfTan = Math.tan((ENVY_SCENE.FOV / 2) * Math.PI / 180);
        const found = [];

        for (const t of cloud.tiles) {
            const dist = V + t.depth;               // расстояние от камеры до слоя
            const halfH = halfTan * dist;
            const halfW = halfH * (rect.width / rect.height);
            const f = dist / V;                     // та же компенсация, что и у меша

            const sx = (t.bx * f / halfW * 0.5 + 0.5) * rect.width;
            const sy = (0.5 - t.by * f / halfH * 0.5) * rect.height;
            const sizePx = (t.size * f) / (2 * halfH) * rect.height;
            if (sizePx < 0.001) continue;

            // В систему координат наклейки: сдвиг, масштаб, обратный поворот.
            const ux = (px - sx) / sizePx;
            const uy = (py - sy) / sizePx;
            const cos = Math.cos(-t.rot), sin = Math.sin(-t.rot);
            // Экранный y растёт вниз, поворот меша — против часовой в мире.
            const lx = ux * cos + uy * sin + 0.5;
            const ly = -ux * sin + uy * cos + 0.5;
            if (lx < 0 || ly < 0 || lx >= 1 || ly >= 1) continue;

            // Силуэт у наклейки произвольный, формулой его не описать —
            // ловим по той же альфа-маске, из которой сделана её текстура.
            const m = t.mask;
            const mx = Math.min(m.size - 1, Math.floor(lx * m.size));
            const my = Math.min(m.size - 1, Math.floor(ly * m.size));
            if (m.bits[my * m.size + mx]) found.push(t);
        }

        found.sort((a, b) => a.depth - b.depth);    // ближний слой первым
        return found;
    },

    // Палец растворяет пустышки под собой и проваливается глубже, пока не
    // упрётся в материальный образ. Именно так значимая фигура и находится:
    // она единственная, сквозь которую не пройти.
    traceTouch() {
        const cloud = this.clouds.cur;
        if (!cloud) return;

        // Пустышки под пальцем больше не растворяются поштучно — их гасит
        // ореол. Значит и «прогрызать» слои незачем: держат тот значимый
        // образ, который лежит под пальцем, кто бы ни лежал поверх него.
        const active = this.pickTiles(this.pointerX, this.pointerY)
            .find(t => t.kind !== 'empty') || null;

        for (const tile of cloud.tiles) {
            if (tile !== active && tile.kind !== 'empty') {
                tile.heldMs = 0;
                tile.hinted = false;
            }
        }
        this.activeTile = active;
    },

    // ================= ХОД ИГРЫ =================
    updatePlay(dt) {
        const cloud = this.clouds.cur;
        if (!cloud) return;

        if (this.pointerDown) this.traceTouch();
        else this.activeTile = null;

        const b = this.balance();
        const active = this.activeTile;
        if (!active) return;

        active.heldMs += dt;

        if (!active.hinted && active.heldMs >= b.hintMs) {
            active.hinted = true;
            this.spawnWave(active, active.kind === 'right' ? ENVY_SCENE.HINT_GREEN : ENVY_SCENE.HINT_RED, 1);
        }

        if (active.heldMs >= b.holdMs) {
            this.resolve(active);
        }
    },

    spawnWave(tile, color, strength) {
        this.waves.push({
            x: tile.bx,
            y: tile.by,
            age: 0,
            color: new THREE.Color(color),
            strength
        });
        if (this.waves.length > 4) this.waves.shift();
    },

    resolve(tile) {
        const b = this.balance();
        const right = tile.kind === 'right';

        // Мини-игра ничего себе не начисляет: она доводит счётчик до конца и
        // сообщает результат, а награду назначает конфиг (инвариант проекта).
        this.fillThirds = right
            ? Math.min(b.rounds, this.fillThirds + 1)
            : Math.max(0, this.fillThirds - 1);
        this.updateGauge();

        this.spawnWave(tile, right ? ENVY_SCENE.HINT_GREEN : ENVY_SCENE.HINT_RED, 2.4);

        this.pointerDown = false;
        this.clearTouch();
        this.state = 'resolving';
        this.resolveMs = 0;
        this.resolveRight = right;
        this.resolveWin = right && this.fillThirds >= b.rounds;
        this.winTile = this.resolveWin ? tile : null;
    },

    updateResolving(dt) {
        this.resolveMs += dt;
        if (this.resolveMs < ENVY_SCENE.RESOLVE_DELAY_MS) return;

        // Шкала заполнена — лететь больше некуда. Последний правильный образ
        // сам разгорается и заливает экран белым: пролёт к облаку, в котором
        // уже нечего искать, был бы обещанием следующего раунда.
        if (this.resolveWin) {
            this.state = 'winning';
            this.winMs = 0;
            this.startWinFlash(this.winTile);
            GameEvents.emit('minigame:result', { sin: 'envy', mode: 'cloud', outcome: 'win' });
        } else {
            this.startFlight(this.resolveRight ? -1 : 1);
        }
    },

    startWinFlash(tile) {
        const rect = this.canvas.getBoundingClientRect();
        this.flashScale = 0;
        this.flashMax = 1;

        if (!this.flashEl) return;
        if (tile) {
            const world = this.scratchVec;
            tile.mesh.getWorldPosition(world);
            world.project(this.camera);
            this.flashEl.style.left = `${(world.x + 1) / 2 * rect.width}px`;
            this.flashEl.style.top = `${(1 - world.y) / 2 * rect.height}px`;
        } else {
            this.flashEl.style.left = '50%';
            this.flashEl.style.top = '50%';
        }
        // Вспышка должна накрыть самый дальний угол от точки образа.
        this.flashMax = (Math.hypot(rect.width, rect.height) * 2) / ENVY_SCENE.FLASH_SIZE;
        this.flashEl.style.transform = 'translate(-50%, -50%) scale(0)';
        this.flashEl.classList.add('show');
    },

    // dir = -1 — вперёд, к следующему облаку; +1 — назад, к предыдущему.
    startFlight(dir) {
        const target = dir < 0 ? this.clouds.next : this.clouds.prev;
        if (!target) return;
        target.group.visible = true;

        this.state = 'flying';
        this.flyDir = dir;
        this.flyMs = 0;
        this.flyFrom = this.camera.position.z;
        this.flyTo = target.group.position.z + ENVY_SCENE.CAM_DIST;
    },

    updateFlying(dt) {
        this.flyMs += dt;
        const p = Math.min(1, this.flyMs / ENVY_SCENE.FLY_MS);
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        this.camera.position.z = this.flyFrom + (this.flyTo - this.flyFrom) * e;
        if (p >= 1) this.arrive();
    },

    // Прилетели: облако, к которому летели, становится рабочим и переезжает в
    // нуль (чтобы координаты не убегали в бесконечность за партию), остальные
    // выгружаются, вместо них строятся два новых — вперёд и назад.
    arrive() {
        const keep = this.flyDir < 0 ? this.clouds.next : this.clouds.prev;
        const drop = this.flyDir < 0 ? this.clouds.prev : this.clouds.next;

        this.disposeCloud(this.clouds.cur);
        this.disposeCloud(drop);

        keep.group.position.z = 0;
        keep.group.visible = true;
        this.camera.position.z = ENVY_SCENE.CAM_DIST;

        const s = this.layout.spacing;
        this.clouds.cur = keep;
        this.clouds.next = this.buildCloud(-s, this.wrongCountFor(this.fillThirds + 1));
        this.clouds.prev = this.buildCloud(s, this.wrongCountFor(this.fillThirds - 1));
        this.hideNeighbours();

        this.waves = [];
        this.activeTile = null;
        this.state = 'play';
    },

    // Победа: камера стоит там, где стояла, а последний правильный образ
    // разрастается белым светом на весь экран.
    updateWinning(dt) {
        this.winMs += dt;
        const p = Math.min(1, this.winMs / ENVY_SCENE.WIN_MS);
        const e = Math.pow(p, 1.8);   // сначала разгорается, потом накрывает разом

        if (this.flashEl) {
            this.flashEl.style.transform = `translate(-50%, -50%) scale(${(this.flashMax * e).toFixed(3)})`;
        }

        if (p >= 1 && !this.hasWon) {
            this.hasWon = true;
            if (this.winOverlay) this.winOverlay.classList.add('show');
        }
    },

    // ================= КАЧАНИЕ ОБРАЗОВ =================
    updateWaves(dt) {
        for (let i = this.waves.length - 1; i >= 0; i--) {
            this.waves[i].age += dt;
            if (this.waves[i].age > ENVY_SCENE.WAVE_LIFE_MS) this.waves.splice(i, 1);
        }
    },

    // Волна от значимого образа расходится кругами и качает соседей, как
    // брошенный камень качает листву на воде: в центре сильно, дальше слабее,
    // и всё быстро успокаивается. Она же и есть цветовая индикация.
    updateDisturbance(nowSec) {
        const cloud = this.clouds.cur;
        if (!cloud) return;
        const cell = this.layout.cell;
        const b = this.balance();

        for (const t of cloud.tiles) {
            // Постоянный еле заметный дрейф — чтобы облако не выглядело печатью.
            let ox = Math.sin(nowSec * 0.6 + t.driftPhase) * cell * 0.012;
            let oy = Math.cos(nowSec * 0.5 + t.driftPhase * 1.3) * cell * 0.012;
            let rot = 0;
            let scale = 1;
            let tint = 0;
            let tintColor = null;

            for (const w of this.waves) {
                const dx = t.bx - w.x;
                const dy = t.by - w.y;
                const dist = Math.hypot(dx, dy);
                const tau = w.age / 1000 - dist / ENVY_SCENE.WAVE_SPEED;
                if (tau <= 0) continue;

                const decay = Math.exp(-tau * 1000 / ENVY_SCENE.WAVE_DECAY_MS);
                if (decay < 0.008) continue;

                const falloff = 1 / (1 + dist * dist * ENVY_SCENE.WAVE_FALLOFF);
                const swing = Math.sin(tau * ENVY_SCENE.WAVE_FREQ);
                const amp = ENVY_SCENE.WAVE_AMP * cell * w.strength * falloff * decay * swing;

                if (dist > 0.001) {
                    ox += (dx / dist) * amp;
                    oy += (dy / dist) * amp;
                }
                rot += (amp / cell) * 0.4;
                scale += (amp / cell) * 0.06;

                // Подсветка живёт огибающей волны, а не только её гребнем: на
                // чистом гребне цвет мигал слишком коротко, чтобы успеть
                // прочитаться как ответ «правильный/неправильный».
                const k = Math.min(1, w.strength * falloff * decay * (0.55 + 0.45 * Math.abs(swing)));
                if (k > tint) { tint = k; tintColor = w.color; }
            }

            // Дрожь удерживаемого образа: чем дольше держишь, тем сильнее.
            if (t === this.activeTile && t.heldMs > 0) {
                const p = Math.min(1, t.heldMs / b.holdMs);
                const a = ENVY_SCENE.TREMBLE * cell * (0.2 + p * p);
                ox += Math.sin(nowSec * 47 + t.seed) * a;
                oy += Math.cos(nowSec * 39 + t.seed * 2) * a;
                rot += Math.sin(nowSec * 53 + t.seed) * 0.05 * (0.2 + p);
                // После подсказки образ ещё и держит свой цвет, чтобы не
                // гадать, что именно ты сейчас додерживаешь.
                if (t.hinted) {
                    tint = Math.max(tint, 0.55);
                    tintColor = t.kind === 'right' ? this.hintColors.right : this.hintColors.wrong;
                }
            }

            t.offX = ox;
            t.offY = oy;
            t.swayRot = rot;
            t.swayScale = scale;

            if (tintColor) t.mat.color.copy(t.baseColor).lerp(tintColor, Math.min(0.85, tint));
            else if (t.tinted) t.mat.color.copy(t.baseColor);
            t.tinted = !!tintColor;
        }
    },

    // ================= ЦИКЛ И ОТРИСОВКА =================
    loop(ts) {
        if (!this.lastTs) this.lastTs = ts;
        // Настоящая длина кадра нужна ОТДЕЛЬНО от игровой: игровая обрезана
        // сверху, чтобы после паузы ничего не прыгнуло, — а подбору качества
        // важно ровно то, насколько всё плохо на самом деле.
        const raw = ts - this.lastTs;
        const dt = Math.min(48, raw);
        this.lastTs = ts;

        if (this.state === 'play') this.updatePlay(dt);
        else if (this.state === 'resolving') this.updateResolving(dt);
        else if (this.state === 'flying') this.updateFlying(dt);
        else if (this.state === 'winning') this.updateWinning(dt);

        this.tuneDpr(raw);
        this.updateHalo(dt);
        this.updateWaves(dt);
        this.updateDisturbance(ts / 1000);

        if (this.clouds.cur) this.cloudCompensate(this.clouds.cur, true);
        if (this.clouds.next) this.cloudCompensate(this.clouds.next, false);
        if (this.clouds.prev && this.clouds.prev.group.visible) this.cloudCompensate(this.clouds.prev, false);

        this.postMaterial.uniforms.uTime.value = ts * 0.001;

        this.render();
        this.rafId = requestAnimationFrame((t) => this.loop(t));
    },

    // Значимые образы рисуются вторым, отдельным кадром, чтобы шейдер мог
    // показать их внутри ореола — там, где всё остальное погашено. Снаружи
    // ореола этот кадр не участвует: значимый образ подчиняется общему порядку
    // глубины и ничем себя не выдаёт.
    render() {
        const r = this.renderer;
        const cloud = this.clouds.cur;

        r.setRenderTarget(this.rtAll);
        r.clear(true, true, false);
        r.render(this.scene, this.camera);

        r.setRenderTarget(this.rtSig);
        r.clear(true, true, false);
        if (cloud && this.postMaterial.uniforms.uHaloI.value > 0.001) {
            const nextVisible = this.clouds.next && this.clouds.next.group.visible;
            const prevVisible = this.clouds.prev && this.clouds.prev.group.visible;
            if (nextVisible) this.clouds.next.group.visible = false;
            if (prevVisible) this.clouds.prev.group.visible = false;

            // Значимых на облако единицы, поэтому проход почти бесплатный.
            // Глубина им тут не нужна: всё, что могло их перекрыть, ореол
            // уже погасил.
            cloud.tiles.forEach(t => {
                t.mesh.visible = (t.kind !== 'empty');
                t.mat.depthTest = false;
            });
            r.render(this.scene, this.camera);
            cloud.tiles.forEach(t => {
                t.mesh.visible = true;
                t.mat.depthTest = true;
            });

            if (nextVisible) this.clouds.next.group.visible = true;
            if (prevVisible) this.clouds.prev.group.visible = true;
        }

        r.setRenderTarget(null);
        r.clear(true, true, false);
        r.render(this.bgScene, this.flatCamera);

        this.postMaterial.uniforms.tScene.value = this.rtAll.texture;
        this.postMaterial.uniforms.tSig.value = this.rtSig.texture;
        r.render(this.postScene, this.flatCamera);
    },
});

// Запуск — здесь, а не в envy.js: этот файл подключается последним,
// и к этому моменту все методы уже на объекте.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => EnvyMinigame.init());
} else {
    EnvyMinigame.init();
}
