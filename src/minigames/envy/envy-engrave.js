// ================= ЗАВИСТЬ: НАКЛЕЙКИ — МЕТАЛЛИЧЕСКАЯ ФОЛЬГА ПО ЧЁРНОМУ =================
// Замысел игрока: материал наклейки — плоский чёрный, тот же, что чернота
// глаз рамки; рисунок — не заливка, а КОНТУР, выполненный плоской
// металлической фольгой. По всему столу наискосок идёт одна сплошная
// проблесковая полоса: где она проходит по линиям фольги, металл вспыхивает,
// остальная фольга приглушена. Полоса плывёт от наклона телефона (Tilt.turn —
// тот же датчик, что у эффекта глубины).
//
// Что не получилось: гравировка — полукруглая ложбинка с тенью одной стенки
// и бликом по другой. На таком мелком рисунке ложбинка читалась мутной
// светящейся трубкой, а не металлом («выглядит всрато» — оценка игрока).
//
// ---------- КАК ДЁШЕВО ----------
// Линии считаются ОДИН РАЗ при сборке пула, в текстуру: a — силуэт наклейки
// (чёрная основа), r — линия фольги 0..1. Полоса — формула от мировой точки
// в шейдере: одно чтение текстуры и экспонента.
//
// Линии берутся из тёмного контура, который у рисунков уже есть (ENVY_LINE у
// нарисованных кодом, обводка у векторных): заливки выбрасываются. Плюс
// ободок по краю подложки.
Object.assign(ENVY_IMAGE_POOL, {
    ENGRAVE: {
        dark: 0.30,      // светлота, темнее которой пиксель рисунка — линия (выше — тёмные заливки ушей и боков тоже шли в линию)
        soft: 0.10,      // мягкость этого порога
        blur: 1,         // лёгкое сглаживание края линии, px текстуры 256
        depth: 1.6,      // насколько линия «насыщается» к середине
        ring: 0.016      // ободок по краю подложки, доля спрайта
    },

    // Текстура гравированной наклейки (см. шапку). Холст, а не массив: так
    // ориентация и заливка в видеокарту — те же, что у прежних CanvasTexture.
    engrave(def, m, tone, hue) {
        const S = 256, E = this.ENGRAVE;
        // Силуэт — тот же, что у прежней наклейки: кант, подложка, рисунок.
        const sil = this.compose(def, m, tone, hue).getContext('2d').getImageData(0, 0, S, S).data;

        // Линии рисунка на своём месте в наклейке.
        const lc = document.createElement('canvas');
        lc.width = lc.height = S;
        const g = lc.getContext('2d');
        const art = this.drawArt(def, tone, hue);
        const k = (ENVY_CORE * (def.bulge || ENVY_BULGE)) / m.outRadius;
        g.save();
        g.translate(S / 2, S / 2);
        g.scale(k, k);
        g.translate(-S / 2 + m.offsetX * S, -S / 2 + m.offsetY * S);
        g.drawImage(art, 0, 0);
        g.restore();
        // ободок по краю подложки — тёмной линией, как остальной контур
        g.strokeStyle = '#000';
        g.lineWidth = E.ring * S;
        g.stroke(envyBlobPath(S, def.phase || 0));
        const px = g.getImageData(0, 0, S, S).data;

        // Маска линии: тёмное и непрозрачное.
        let line = new Float32Array(S * S);
        for (let i = 0; i < S * S; i++) {
            const a = px[i * 4 + 3] / 255;
            const lum = (0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2]) / 255;
            line[i] = a * Math.max(0, Math.min(1, (E.dark - lum) / E.soft + 0.5));
        }
        // Лёгкое сглаживание края — линия фольги ровная, без лесенки.
        line = this.boxBlur(line, S, E.blur);
        const h = new Float32Array(S * S);
        for (let i = 0; i < S * S; i++) h[i] = Math.min(1, line[i] * E.depth);

        const out = document.createElement('canvas');
        out.width = out.height = S;
        const oc = out.getContext('2d');
        const img = oc.createImageData(S, S), d = img.data;
        for (let i = 0; i < S * S; i++) {
            if (sil[i * 4 + 3] <= 110) continue;         // вне наклейки — прозрачно
            d[i * 4] = Math.round(h[i] * 255);
            d[i * 4 + 3] = 255;
        }
        oc.putImageData(img, 0, 0);
        return out;
    },

    // ---------- МАТЕРИАЛ НАКЛЕЙКИ ----------
    // Проблесковая полоса — общая на все наклейки, в мировых единицах сцены:
    // band.x — где она сейчас (вдоль своей оси), band.y — её полуширина.
    // Двигает её EnvyMinigame.updateLight (наклон телефона).
    band: null,
    // Полоса широкая и мягкая (просьба игрока): узкая и яркая — 2,4 ед. и
    // почти белая — читалась вспышкой, а не переливом металла.
    BAND: { width: 6, reach: 16, angle: -0.55, gain: 0.6, white: 0.35 },

    material(THREE, texture) {
        if (!this.band) this.band = new THREE.Vector2(0, this.BAND.width);
        const P = (typeof PALETTE !== 'undefined' && PALETTE.envyEyes) ? PALETTE.envyEyes : { iris: '#4cdc3a' };
        const tint = new THREE.Color(0x000000);
        const a = this.BAND.angle;
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                map: { value: texture },
                uTint: { value: tint },
                uBand: { value: this.band },
                uDir: { value: new THREE.Vector2(Math.cos(a), Math.sin(a)) },
                uGreen: { value: new THREE.Color(P.iris) },
                uGain: { value: this.BAND.gain },
                uWhite: { value: this.BAND.white }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec2 vWorld;
                void main() {
                    vUv = uv;
                    vec4 w = modelMatrix * vec4(position, 1.0);
                    vWorld = w.xy;
                    gl_Position = projectionMatrix * viewMatrix * w;
                }
            `,
            fragmentShader: `
                uniform sampler2D map;
                uniform vec3 uTint;
                uniform vec2 uBand;
                uniform vec2 uDir;
                uniform vec3 uGreen;
                uniform float uGain;
                uniform float uWhite;
                varying vec2 vUv;
                varying vec2 vWorld;
                void main() {
                    vec4 t = texture2D(map, vUv);
                    if (t.a < 0.5) discard;
                    float foil = t.r;
                    // положение точки поперёк полосы
                    float s = dot(vWorld, uDir) - uBand.x;
                    float band = exp(-s * s / (uBand.y * uBand.y));
                    // широкий мягкий перелив — фольга и вне полосы не плоская краска
                    float broad = 0.5 + 0.5 * sin(s * 0.22);
                    vec3 metal = uGreen * (0.30 + 0.22 * broad)
                               + mix(uGreen, vec3(1.0), uWhite) * band * uGain;
                    vec3 col = metal * foil;
                    // подсветка волной (правильный / неправильный)
                    col += uTint * (0.35 + 0.65 * foil);
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
            depthTest: true,
            depthWrite: true
        });
        // Код сцены красит наклейку через material.color (волна-подсказка):
        // это тот же объект, что uTint.
        mat.color = tint;
        return mat;
    },

    boxBlur(src, S, r) {
        const tmp = new Float32Array(S * S), dst = new Float32Array(S * S), n = 2 * r + 1;
        for (let y = 0; y < S; y++) {
            let acc = 0;
            for (let x = -r; x <= r; x++) acc += src[y * S + Math.max(0, Math.min(S - 1, x))];
            for (let x = 0; x < S; x++) {
                tmp[y * S + x] = acc / n;
                acc += src[y * S + Math.min(S - 1, x + r + 1)] - src[y * S + Math.max(0, x - r)];
            }
        }
        for (let x = 0; x < S; x++) {
            let acc = 0;
            for (let y = -r; y <= r; y++) acc += tmp[Math.max(0, Math.min(S - 1, y)) * S + x];
            for (let y = 0; y < S; y++) {
                dst[y * S + x] = acc / n;
                acc += tmp[Math.min(S - 1, y + r + 1) * S + x] - tmp[Math.max(0, y - r) * S + x];
            }
        }
        return dst;
    }
});
