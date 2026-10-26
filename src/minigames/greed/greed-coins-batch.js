// ================= АЛЧНОСТЬ: МОНЕТЫ В ПОВОРОТЕ ОДНИМ ПРОХОДОМ =================
// Продолжение GreedCoins (greed-coins-flip.js). Все монеты кадра одним
// вызовом видеокарты (instancing), а не по вызову на монету.
//
// Почему: показ полного экрана под 4× замедлением давал 2 кадра в секунду на
// появлении. Профиль: на каждую монету в движении — два десятка поисков
// uniform по имени и свой вызов отрисовки, а в разгар их сотни. Здесь кадр —
// одна заливка буфера и один вызов; поворот (axisTo · roll) считается в
// вершинном шейдере, не в JS.
//
// Монета — квадрат вокруг себя: box — полуширина в радиусах (1.25 у тихой и
// вставшей —
// 1.25 — под тень; 2.2 у вспыхивающей — под ореол и лучи искры).
Object.assign(GreedCoins, {
    BATCH_VS: [
        'attribute vec2 corner;',
        'attribute vec4 a0,a1,a2,a3;',      // (x,y,rad,ao) (n,roll) (m,flash,reveal,gmul) (star,starP,cellX,box)
        'uniform vec2 res;',
        'varying vec2 q;varying vec3 r0,r1,r2;varying vec4 v2,v3;varying float vao;',
        'void main(){',
        ' float box=a3.w;',
        ' vec2 pos=a0.xy+corner*box*a0.z;',
        ' gl_Position=vec4(pos.x/res.x*2.-1.,1.-pos.y/res.y*2.,0.,1.);',
        ' q=vec2(corner.x,-corner.y)*box;',
        ' vec3 n=normalize(a1.xyz);float c=n.z;vec2 k=vec2(-n.y,n.x);float s=length(k);',
        ' vec3 c0=vec3(1.,0.,0.),c1=vec3(0.,1.,0.),c2=vec3(0.,0.,1.);',
        ' if(s>1e-5){vec2 u=k/s;float t=1.-c;',
        '  c0=vec3(c+t*u.x*u.x,t*u.x*u.y,-s*u.y);c1=vec3(t*u.x*u.y,c+t*u.y*u.y,s*u.x);c2=vec3(s*u.y,-s*u.x,c);}',
        ' float cr=cos(a1.w),sr=sin(a1.w);',
        ' r0=c0*cr+c1*sr;r1=-c0*sr+c1*cr;r2=c2;',
        ' v2=a2;v3=a3;vao=a0.w;',
        '}'
    ].join('\n'),
    BATCH_FS: [
        'precision mediump float;',
        'uniform sampler2D tA,tN,tP,tQ;uniform mat3 T;uniform vec3 L,glint;uniform float COLS,CELL,RADP,AW,AH;',
        'uniform float diff,amb,broad,sharp,shin,glow;const float SH=.6;',
        'varying vec2 q;varying vec3 r0,r1,r2;varying vec4 v2,v3;varying float vao;',
        'void main(){',
        ' mat3 R=mat3(r0,r1,r2);',
        ' float m=v2.x,flash=v2.y,reveal=v2.z,gmul=v2.w,star=v3.x,starP=v3.y,cellX=v3.z;',
        ' vec3 e1=r0,e2=r1;',
        ' float det=e1.x*e2.y-e2.x*e1.y;',
        ' vec4 outc=vec4(0.);',
        ' float h=length(q);',
        ' if(flash>0.)outc.rgb+=glint*flash*glow*exp(-h*h*1.6)*.55;',
        ' if(star>0.){',
        '  float sz=.04+.5*starP;vec2 a=abs(q)/sz;',
        '  float core=exp(-dot(a,a)*6.);',
        '  float rays=exp(-a.y*a.y*60.)*exp(-a.x*.7)+exp(-a.x*a.x*60.)*exp(-a.y*.7);',
        '  outc.rgb+=mix(vec3(1.),glint,.3)*star*(core*1.4+rays*.8);',
        ' }',
        // Вставшая монета — запечённая поза из атласа кучи (cellX < 0: номер
        // клетки −cellX−1): с толщиной ребра и своим объёмом, как старая куча,
        // которая игроку нравилась больше плоской монеты под поворотом.
        ' if(cellX<0.){',
        '  float idx=-cellX-1.,col=mod(idx,COLS),row=floor(idx/COLS);',
        '  vec2 tc=vec2((col*CELL+CELL*.5+q.x*RADP)/AW,(row*CELL+CELL*.5-q.y*RADP)/AH);',
        '  if(abs(q.x)*RADP<CELL*.5&&abs(q.y)*RADP<CELL*.5){',
        '   vec4 A=texture2D(tP,tc);vec3 a=A.rgb;float kk=A.a;',
        '   vec3 hv=normalize(L+vec3(0.,0.,1.));',
        '   vec3 n=normalize(T*(texture2D(tQ,tc).rgb*2.-1.));',
        '   float d=max(dot(n,L),0.),c=max(dot(n,hv),0.);',
        '   vec3 full=a*(amb+diff*d)+(a*1.2+.12)*broad*pow(c,8.)+mix(a,vec3(1.),.55)*sharp*pow(c,shin);',
        '   outc.rgb+=kk*full*vao;outc.a=kk;',
        '  }',
        ' } else if(abs(det)>.002){',
        '  vec2 uv=vec2((q.x*e2.y-q.y*e2.x)/det,(e1.x*q.y-e1.y*q.x)/det);',
        '  if(dot(uv,uv)<1.){',
        '   vec2 tc=vec2(cellX+.5*(.5+uv.x*.453),.5-uv.y*.453);',
        '   vec4 A=texture2D(tA,tc);vec3 a=A.rgb;float kk=A.a;',
        '   vec3 hv=normalize(L+vec3(0.,0.,1.));',
        '   if(m>0.){',
        '    vec3 n=normalize(T*(R*(texture2D(tN,tc).rgb*2.-1.)));',
        '    float d=max(dot(n,L),0.),c=max(dot(n,hv),0.);',
        '    vec3 full=a*(amb+diff*d)+(a*1.2+.12)*broad*pow(c,8.)+mix(a,vec3(1.),.55)*sharp*pow(c,shin);',
        '    outc.rgb+=kk*m*full*vao;',
        '   }',
        '   if(m<1.&&gmul>0.){',
        '    vec3 n0=normalize(T*r2);float c0=max(dot(n0,hv),0.);',
        '    vec3 ghost=glint*(sharp*pow(c0,shin*3.)*1.1+pow(c0,shin)*.35);',
        '    float rv=1.-smoothstep(reveal-.18,reveal,length(uv));',
        '    outc.rgb+=kk*(1.-m)*ghost*rv*gmul;',
        '   }',
        '   outc.rgb+=kk*glint*flash*glow;',
        '   outc.a=max(outc.a,kk*m);',
        '  }',
        ' }',
        // тень под монетой — как у прежней кучи (тень 0.6, сдвиг 3, размытие 6
        // при радиусе 29 → 0.1 и 0.2 радиуса). Без неё монеты в движении
        // светлее и площе вставшей кучи, и на переходе к ней был рывок.
        ' float sd=length(q-vec2(0.,-.1));',
        ' float sa=SH*m*(1.-smoothstep(.85,1.2,sd));',
        ' outc.a=outc.a+sa*(1.-outc.a);',
        ' gl_FragColor=vec4(min(outc.rgb,vec3(1.)),outc.a);',
        '}'
    ].join('\n'),

    // cv — холст; scale — во сколько раз холст меньше 780×1688 (k ≤ 1).
    // alb/nor — плоская монета (поворот), atA/atN — атлас поз кучи (вставшие)
    // res — размер сцены в единицах, если холст — не куча окна (лоток
    // аппарата алчности рисует монеты на своём участке)
    batchRenderer(cv, alb, nor, atA, atN, res) {
        const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
        const ext = gl && gl.getExtension('ANGLE_instanced_arrays');
        if (!gl || !ext) return null;
        const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, this.BATCH_VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, this.BATCH_FS));
        gl.linkProgram(pr); gl.useProgram(pr);
        const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const lc = gl.getAttribLocation(pr, 'corner'); gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0);
        const inst = gl.createBuffer(), STRIDE = 16;
        let data = new Float32Array(STRIDE * 2048);
        gl.bindBuffer(gl.ARRAY_BUFFER, inst);
        gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
        ['a0', 'a1', 'a2', 'a3'].forEach((n, i) => {
            const l = gl.getAttribLocation(pr, n);
            gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
            ext.vertexAttribDivisorANGLE(l, 1);
        });
        [['tA', alb], ['tN', nor], ['tP', atA], ['tQ', atN]].forEach(([name, img], i) => {
            const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.uniform1i(gl.getUniformLocation(pr, name), i);
        });
        // постоянные uniform — один раз
        const U = {}; ['res', 'T', 'L', 'glint', 'diff', 'amb', 'broad', 'sharp', 'shin', 'glow'].forEach(n => { U[n] = gl.getUniformLocation(pr, n); });
        const S = this.LIGHT, l = this.v3.norm(S.L), hex = (h) => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255);
        gl.uniform3f(U.L, l[0], l[1], l[2]);
        const g = hex(PALETTE.greedCoin.gold.glint); gl.uniform3f(U.glint, g[0], g[1], g[2]);
        ['diff', 'amb', 'broad', 'sharp', 'shin'].forEach(k => gl.uniform1f(U[k], S[k]));
        gl.uniform1f(U.glow, this.FLIP.glow);
        ['COLS', 'CELL', 'RADP', 'AW', 'AH'].forEach(k => { U[k] = gl.getUniformLocation(pr, k); });
        gl.uniform1f(U.COLS, this.COLS); gl.uniform1f(U.CELL, this.CELL); gl.uniform1f(U.RADP, this.RAD);
        gl.uniform1f(U.AW, atA.width); gl.uniform1f(U.AH, atA.height);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        // единицы сцены (780×1688) → пиксели холста
        gl.uniform2f(U.res, res ? res[0] : this.W, res ? res[1] : this.H);
        gl.viewport(0, 0, cv.width, cv.height);
        let n = 0;
        return {
            begin(tilt) {
                n = 0;
                gl.uniformMatrix3fv(U.T, false, GreedCoins.tiltMat(tilt));
            },
            // c: { x, y, rad, ao, n:[3], roll, kind, ci — клетка атласа поз }, st — из flipState;
            // st.settled — монета встала: рисуется позой из атласа
            add(c, st, box) {
                if ((n + 1) * STRIDE > data.length) { const d = new Float32Array(data.length * 2); d.set(data); data = d; }
                const o = n * STRIDE, N = st.n;
                data[o] = c.x; data[o + 1] = c.y; data[o + 2] = c.rad; data[o + 3] = c.ao === undefined ? 1 : c.ao;
                data[o + 4] = N[0]; data[o + 5] = N[1]; data[o + 6] = N[2]; data[o + 7] = c.roll || 0;
                data[o + 8] = st.m; data[o + 9] = st.flash || 0; data[o + 10] = st.reveal === undefined ? 9 : st.reveal; data[o + 11] = st.quiet ? 0 : 1;
                data[o + 12] = st.star || 0; data[o + 13] = st.starP || 0; data[o + 14] = (st.settled && c.ci !== undefined) ? -1 - c.ci : (c.kind === 'euro' ? 0.5 : 0);
                data[o + 15] = box || ((st.flash > 0.01 || st.star > 0) ? 2.2 : 1.25);
                n++;
            },
            flush() {
                gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
                if (!n) return;
                gl.bindBuffer(gl.ARRAY_BUFFER, inst);
                if (data.byteLength > gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * STRIDE));
                ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, n);
            },
            count: () => n,
            // сколько пикселей холста закрашивают квадраты кадра (оценка работы видеокарты)
            pixels() { let p = 0; const k = cv.width / GreedCoins.W; for (let i = 0; i < n; i++) { const o = i * STRIDE, d = 2 * data[o + 15] * data[o + 2] * k; p += d * d; } return p; }
        };
    }
});
