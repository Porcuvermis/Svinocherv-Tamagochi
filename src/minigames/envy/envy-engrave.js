// ================= ЗАВИСТЬ: НАКЛЕЙКИ — ГРАВИРОВКА ПО ЧЁРНОМУ МЕТАЛЛУ =================
// Замысел игрока: материал наклейки — плоский чёрный, тот же, что чернота
// глаз рамки; рисунок — не заливка, а КОНТУР, выгравированный в материале
// полукруглой ложбинкой. Ложбинка зелёная и металлическая: стенка к свету
// светлее, от света темнее, по дну бежит блик. Свет общий для всего полотна
// и плывёт от наклона телефона (Tilt.turn — тот же датчик, что у эффекта
// глубины), поэтому блик играет и внутри каждой ложбинки, и по полю в целом.
//
// ---------- КАК ДЁШЕВО ----------
// Вся геометрия ложбинки считается ОДИН РАЗ при сборке пула, в текстуру:
//   a — силуэт наклейки (чёрная основа);
//   r — глубина ложбинки 0..1 (полукруглый профиль поперёк линии);
//   g, b — наклон стенки (нормаль x, y), уже посчитанный по профилю.
// Шейдеру остаётся одно чтение текстуры и пара скалярных произведений — ни
// производных, ни соседних выборок (на старых телефонах WebGL1 производных
// без расширения нет).
//
// Линии берутся из тёмного контура, который у рисунков уже есть (ENVY_LINE у
// нарисованных кодом, обводка у векторных): заливки выбрасываются. Плюс
// ободок по краю подложки — выгравированная рамка наклейки.
Object.assign(ENVY_IMAGE_POOL, {
    ENGRAVE: {
        dark: 0.30,      // светлота, темнее которой пиксель рисунка — линия (выше — тёмные заливки ушей и боков тоже шли в линию)
        soft: 0.10,      // мягкость этого порога
        blur: 3,         // радиус сглаживания профиля, px текстуры 256 (2 — по дну шёл пунктир бликов: ступеньки профиля)
        depth: 1.45,     // насколько профиль «насыщается» к середине линии
        slope: 4.5,      // крутизна стенок для нормали: положе — канавка читалась светящейся трубкой
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
        // Профиль: размытая маска (два прохода коробкой) — у середины линии
        // глубже, к краям мельче, то есть полукруг поперёк.
        line = this.boxBlur(this.boxBlur(line, S, E.blur), S, E.blur);
        const h = new Float32Array(S * S);
        for (let i = 0; i < S * S; i++) h[i] = Math.min(1, line[i] * E.depth);

        const out = document.createElement('canvas');
        out.width = out.height = S;
        const oc = out.getContext('2d');
        const img = oc.createImageData(S, S), d = img.data;
        const at = (x, y) => h[Math.max(0, Math.min(S - 1, y)) * S + Math.max(0, Math.min(S - 1, x))];
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const i = y * S + x;
                if (sil[i * 4 + 3] <= 110) continue;         // вне наклейки — прозрачно
                // Ложбинка — впадина: высота = −h. Нормаль впадины смотрит
                // от середины линии к краю: n = (dh/dx, dh/dy) · крутизна.
                const nx = (at(x + 1, y) - at(x - 1, y)) * E.slope;
                const ny = (at(x, y + 1) - at(x, y - 1)) * E.slope;
                d[i * 4] = Math.round(h[i] * 255);
                d[i * 4 + 1] = Math.round(128 + 127 * Math.max(-1, Math.min(1, nx)));
                d[i * 4 + 2] = Math.round(128 + 127 * Math.max(-1, Math.min(1, ny)));
                d[i * 4 + 3] = 255;
            }
        }
        oc.putImageData(img, 0, 0);
        return out;
    },

    // ---------- МАТЕРИАЛ НАКЛЕЙКИ ----------
    // Свет — точка над полотном (мировые единицы сцены), общая на все
    // наклейки: направление к ней своё в каждой точке поля, поэтому блик
    // бежит по полотну, а не стоит в каждой наклейке одинаково. Плывёт от
    // наклона телефона (EnvyMinigame.updateLight).
    light: null,
    LIGHT: { x: -9, y: 11, z: 16, reach: 13 },

    material(THREE, texture) {
        if (!this.light) this.light = new THREE.Vector3(this.LIGHT.x, this.LIGHT.y, this.LIGHT.z);
        const P = (typeof PALETTE !== 'undefined' && PALETTE.envyEyes) ? PALETTE.envyEyes : { iris: '#4cdc3a' };
        const tint = new THREE.Color(0x000000);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                map: { value: texture },
                uTint: { value: tint },
                uLight: { value: this.light },
                uGreen: { value: new THREE.Color(P.iris) }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vWorld;
                varying vec2 vAx;
                void main() {
                    vUv = uv;
                    vec4 w = modelMatrix * vec4(position, 1.0);
                    vWorld = w.xyz;
                    // ось x наклейки в мире: наклейку кренит, и нормали
                    // ложбинки надо повернуть вместе с ней
                    vAx = normalize(modelMatrix[0].xy);
                    gl_Position = projectionMatrix * viewMatrix * w;
                }
            `,
            fragmentShader: `
                uniform sampler2D map;
                uniform vec3 uTint;
                uniform vec3 uLight;
                uniform vec3 uGreen;
                varying vec2 vUv;
                varying vec3 vWorld;
                varying vec2 vAx;
                void main() {
                    vec4 t = texture2D(map, vUv);
                    if (t.a < 0.5) discard;
                    float h = t.r;
                    // нормаль ложбинки: в текстуре y вниз, в мире — вверх
                    vec2 n2 = vec2(t.g * 2.0 - 1.0, -(t.b * 2.0 - 1.0));
                    vec2 nw = vAx * n2.x + vec2(-vAx.y, vAx.x) * n2.y;
                    vec3 N = normalize(vec3(nw, 1.0));
                    vec3 L = normalize(uLight - vWorld);
                    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
                    float diff = max(dot(N, L), 0.0);
                    float spec = pow(max(dot(N, H), 0.0), 48.0);
                    // в ложбинке — зелёный металл: тёмный в тени стенки,
                    // яркий к свету и с бликом; вне её — ровный чёрный
                    float groove = smoothstep(0.06, 0.32, h);
                    // дно глубже стенок — и темнее (свет туда доходит хуже);
                    // без этого канавка светилась вся и читалась неоном
                    float ao = 1.0 - 0.6 * h;
                    vec3 metal = uGreen * (0.03 + 1.25 * diff * diff * diff) * ao
                               + mix(uGreen, vec3(1.0), 0.55) * spec * 1.4;
                    vec3 col = metal * groove;
                    // подсветка волной (правильный / неправильный): тон
                    // ложится на всю наклейку
                    col += uTint * (0.35 + 0.65 * groove);
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
