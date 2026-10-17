// Исходник разрезанного модуля целиком: файл + его продолжения в порядке
// index.html (backend.js → backend-garden.js → …). Для калькуляторов, которые
// склеивают исходники и eval'ят их без браузера. Продолжения находятся сами:
// это строки <script> сразу за файлом с тем же именем и дефисом.
//   require('./src-parts.js')('src/core/backend.js')
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
module.exports = function srcParts(rel) {
    const base = rel.replace(/\.js$/, '');
    const lines = fs.readFileSync(path.join(root, 'index.html'), 'utf8').split('\n');
    const at = lines.findIndex(l => l.includes(`src="${rel}?`));
    const files = [rel];
    for (let i = at + 1; at >= 0 && i < lines.length; i++) {
        const m = lines[i].match(new RegExp(`src="(${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[^"?]+\\.js)\\?`));
        if (!m) break;
        files.push(m[1]);
    }
    return files.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
};
