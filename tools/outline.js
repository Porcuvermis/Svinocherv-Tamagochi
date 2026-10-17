// Карта JS-файла без чтения целиком: верхние объявления и методы объектов-
// модулей (const X = { ... }) — строка, размер, заголовок раздела над ними.
// Нужна, чтобы найти место правки в большом файле за один дешёвый вызов, а не
// грепом наугад, и чтобы решить, как его резать (tools/split-object.js).
//
//   node tools/outline.js <файл.js> [--min 2000]   — показывать куски от 2 КБ
//
// Парсер — typescript (он стоит в окружении глобально); сборки он не
// добавляет: это инструмент, не рантайм.
const fs = require('fs');
const ts = require(require.resolve('typescript', { paths: [process.env.NODE_PATH || '', '/opt/node22/lib/node_modules'] }));

const file = process.argv[2];
if (!file) { console.error('usage: node tools/outline.js <file.js> [--min bytes]'); process.exit(2); }
const minIdx = process.argv.indexOf('--min');
const MIN = minIdx > 0 ? +process.argv[minIdx + 1] : 0;
const text = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const line = pos => sf.getLineAndCharacterOfPosition(pos).line + 1;
const kb = n => (n / 1024).toFixed(1).padStart(5) + 'K';
// Размер — в байтах файла (кириллица — два байта), как его видит лимит чтения.
const bytes = node => Buffer.byteLength(text.slice(node.getFullStart(), node.getEnd()));

// Заголовок раздела — ближайшая строка вида «// ---------- ТЕКСТ ----------»
// в комментариях над узлом.
function header(node) {
    const lead = text.slice(node.getFullStart(), node.getStart());
    const m = lead.match(/\/\/ *[-=]{3,} *(.+?) *[-=]{3,}/g);
    return m ? m[m.length - 1].replace(/\/\/ *[-=]+ *| *[-=]+$/g, '') : '';
}
function propName(p) {
    if (!p.name) return '?';
    return p.name.getText(sf);
}
function dumpObject(obj, indent) {
    for (const p of obj.properties) {
        const size = bytes(p);
        if (size < MIN) continue;
        const kind = ts.isMethodDeclaration(p) ? '()' : ts.isGetAccessor(p) ? 'get' : ts.isSetAccessor(p) ? 'set' : ':';
        const h = header(p);
        console.log(`${indent}${String(line(p.getStart())).padStart(5)} ${kb(size)}  ${propName(p)}${kind === '()' ? '()' : kind === ':' ? '' : ' ' + kind}${h ? '   — ' + h : ''}`);
    }
}
console.log(`${file}: ${text.split('\n').length} строк, ${kb(Buffer.byteLength(text))}`);
for (const st of sf.statements) {
    const size = bytes(st);
    let name = ts.SyntaxKind[st.kind];
    let obj = null;
    if (ts.isFunctionDeclaration(st) && st.name) name = 'function ' + st.name.text;
    else if (ts.isClassDeclaration(st) && st.name) name = 'class ' + st.name.text;
    else if (ts.isVariableStatement(st)) {
        const d = st.declarationList.declarations[0];
        name = (d.name.getText(sf));
        if (d.initializer && ts.isObjectLiteralExpression(d.initializer)) { obj = d.initializer; name += ' = {…}'; }
    } else if (ts.isExpressionStatement(st)) name = st.expression.getText(sf).slice(0, 50).replace(/\s+/g, ' ');
    if (size < MIN && !obj) continue;
    const h = header(st);
    console.log(`${String(line(st.getStart())).padStart(5)} ${kb(size)}  ${name}${h ? '   — ' + h : ''}`);
    if (obj) dumpObject(obj, '   ');
}
