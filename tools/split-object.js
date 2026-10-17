// Резак объекта-модуля: переносит свойства `const Obj = { ... }` в отдельный
// файл вида `Object.assign(Obj, { ... })` — текст свойств вместе с
// комментариями над ними, байт в байт. `this` в методах остаётся тем же
// объектом, поэтому поведение не меняется; меняется только то, сколько
// приходится читать, чтобы найти нужное.
//
//   node tools/split-object.js <исходник.js> <Obj> <новый.js> <выбор> [--title "строка"]...
//
// <выбор> — имена через запятую; «a..b» — все свойства подряд от a до b
// включительно. «@РАЗДЕЛ» — весь раздел (заголовок «// ---- РАЗДЕЛ ----» над
// свойством, как их печатает outline.js --sections), «@А..@Б» — разделы от А
// до Б включительно; хватает начала названия. Геттеры и сеттеры не переносятся (Object.assign снял бы с
// них значение) — инструмент откажет.
//
// Новый файл подключается в index.html СРАЗУ после исходника: свойства
// должны оказаться на объекте раньше, чем кто-то его позовёт. Карта файла
// перед разрезом — tools/outline.js.
const fs = require('fs');
const path = require('path');
const ts = require(require.resolve('typescript', { paths: [process.env.NODE_PATH || '', '/opt/node22/lib/node_modules'] }));

const args = process.argv.slice(2);
const titles = [];
// --move-tail: код после объекта (запуск init()) уезжает в конец нового файла.
// Ставить на ПОСЛЕДНЕМ разрезе файла — новый файл подключается последним.
const moveTail = args.includes('--move-tail');
if (moveTail) args.splice(args.indexOf('--move-tail'), 1);
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title') { titles.push(args[i + 1]); args.splice(i, 2); i--; }
}
const [src, objName, out, pick] = args;
if (!pick) { console.error('usage: node tools/split-object.js <src.js> <Obj> <out.js> <a,b,c..d> [--title "..."]'); process.exit(2); }
if (fs.existsSync(out)) { console.error('уже есть: ' + out); process.exit(1); }

const text = fs.readFileSync(src, 'utf8');
const sf = ts.createSourceFile(src, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
// Obj = «-»: режутся ВЕРХНИЕ объявления файла (функции, константы) — для
// файлов-стопок вроде worm-head.js. Новый файл — их текст как есть; он
// подключается после исходника, так что константы исходника ему видны.
const TOP = objName === '-';
const topName = st => ts.isFunctionDeclaration(st) && st.name ? st.name.text
    : ts.isVariableStatement(st) ? st.declarationList.declarations[0].name.getText(sf)
    : ts.isClassDeclaration(st) && st.name ? st.name.text : null;
let obj = TOP ? { properties: sf.statements.filter(st => topName(st)), getEnd: () => text.length } : null;
for (const st of TOP ? [] : sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
        if (d.name.getText(sf) === objName && d.initializer && ts.isObjectLiteralExpression(d.initializer)) obj = d.initializer;
    }
}
if (!obj) { console.error(`нет объекта ${objName} в ${src}`); process.exit(1); }

const props = obj.properties;
const names = props.map(p => (TOP ? topName(p) : p.name ? p.name.getText(sf) : null));
// Раздел свойства: номер последнего заголовка над ним.
const secTitle = [];
const secOf = [];
props.forEach((p, k) => {
    const lead = text.slice(p.getFullStart(), p.getStart());
    const m = lead.match(/\/\/ *[-=]{3,} *(.+?) *[-=]{3,}/g);
    if (m || !k) secTitle.push(m ? m[m.length - 1].replace(/\/\/ *[-=]+ *| *[-=]+$/g, '') : '');
    secOf.push(secTitle.length - 1);
});
const secIdx = (q) => {
    const hits = secTitle.map((t, i) => (t.startsWith(q) ? i : -1)).filter(i => i >= 0);
    if (hits.length !== 1) { console.error(`раздел «${q}»: найдено ${hits.length}`); process.exit(1); }
    return hits[0];
};
const chosen = new Set();
for (const part of pick.split(',').map(s => s.trim()).filter(Boolean)) {
    const [a, b] = part.split('..');
    if (a.startsWith('@')) {
        const s0 = secIdx(a.slice(1)), s1 = b ? secIdx(b.replace(/^@/, '')) : s0;
        props.forEach((p, k) => { if (secOf[k] >= s0 && secOf[k] <= s1) chosen.add(k); });
        continue;
    }
    const i = names.indexOf(a), j = b ? names.indexOf(b) : i;
    if (i < 0 || j < 0) { console.error('нет свойства: ' + part); process.exit(1); }
    for (let k = i; k <= j; k++) chosen.add(k);
}
const chunks = [];
const cut = [];
for (const k of [...chosen].sort((x, y) => x - y)) {
    const p = props[k];
    if (!TOP && (ts.isGetAccessor(p) || ts.isSetAccessor(p))) { console.error('геттер/сеттер не переносится: ' + names[k]); process.exit(1); }
    let start = p.getFullStart();
    let end = p.getEnd();
    // Хвостовая запятая уходит вместе со свойством.
    const after = text.slice(end).match(/^\s*,/);
    if (after) end += after[0].length;
    let body = text.slice(start, p.getEnd());
    // Первое свойство объекта стоит сразу за «{» — отрезаем перевод строки
    // спереди, чтобы не плодить пустые строки.
    chunks.push(body.replace(/^[ \t]*\n/, '') + (TOP ? '' : ','));
    cut.push([start, end]);
}
let rest = text;
for (const [a, b] of cut.slice().reverse()) rest = rest.slice(0, a) + rest.slice(b);

const tailSt = TOP ? [] : sf.statements.filter(st => st.getStart() > obj.getEnd() && !ts.isFunctionDeclaration(st)
    && !ts.isVariableStatement(st));
let tailText = '';
if (moveTail && tailSt.length) {
    const a = tailSt[0].getFullStart(), b = tailSt[tailSt.length - 1].getEnd();
    // Срез идёт по исходному тексту; вырезанные свойства лежат раньше, поэтому
    // сдвиг считается от длины, на которую текст уже укоротился.
    const shift = text.length - rest.length;
    tailText = text.slice(a, b).replace(/^\s*\n/, '');
    rest = rest.slice(0, a - shift).replace(/\s*$/, '\n\n') + '// Запуск — в конце ' + path.basename(out)
        + ': он подключается последним из продолжений,\n// и к этому моменту все методы уже на объекте.\n' + rest.slice(b - shift).replace(/^\s*/, '');
}
const header = titles.length ? titles.map(t => '// ' + t).join('\n') + '\n' : '';
const outText = TOP ? `${header}// Вынесено из ${path.basename(src)}; подключается сразу после него.\n${chunks.join('\n')}\n` : `${header}// Продолжение ${objName} (${path.basename(src)}): свойства добавляются на тот же
// объект, \`this\` в методах — он же. Подключается сразу после ${path.basename(src)}.
Object.assign(${objName}, {
${chunks.join('\n')}
});
` + (tailText ? `\n// Запуск — здесь, а не в ${path.basename(src)}: этот файл подключается последним,\n// и к этому моменту все методы уже на объекте.\n${tailText}\n` : '');
fs.writeFileSync(out, outText);
fs.writeFileSync(src, rest);

// Подключение в index.html — сразу за исходником.
const idx = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(idx, 'utf8');
const rel = p => path.relative(path.join(__dirname, '..'), path.resolve(p)).split(path.sep).join('/');
const re = new RegExp(`(<script src="${rel(src).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?v=__BUILD__"></script>)`);
if (re.test(html)) {
    // Если за исходником уже стоят его продолжения — встаём после последнего.
    const base = rel(src).replace(/\.js$/, '');
    const lines = html.split('\n');
    let at = lines.findIndex(l => re.test(l));
    while (at + 1 < lines.length && lines[at + 1].includes(`src="${base}-`)) at++;
    lines.splice(at + 1, 0, `<script src="${rel(out)}?v=__BUILD__"></script>`);
    fs.writeFileSync(idx, lines.join('\n'));
    console.log('index.html: подключён после ' + rel(src));
} else {
    console.log('ВНИМАНИЕ: ' + rel(src) + ' не найден в index.html — подключить руками');
}
// Код ПОСЛЕ объекта (запуск init(), регистрация) выполняется при загрузке
// исходника — ДО продолжений. Если он зовёт методы, его надо перенести в
// последнее продолжение руками: резак этого не решает за тебя.
const tail = (moveTail || TOP) ? [] : tailSt;
if (tail.length) console.log('ВНИМАНИЕ: после объекта есть код, исполняемый при загрузке (строка '
    + (sf.getLineAndCharacterOfPosition(tail[0].getStart()).line + 1) + ') — не зовёт ли он перенесённые методы?');
const kb = s => (Buffer.byteLength(s) / 1024).toFixed(1) + 'K';
console.log(`${rel(out)}: ${chosen.size} свойств, ${kb(outText)}; ${rel(src)}: ${kb(text)} → ${kb(rest)}`);
