// Путь к Chromium для прогонов. Раньше он был зашит в каждый тест
// (/opt/pw-browsers/chromium-1194/…), и в облаке, где стоит другая версия
// браузера, не запускался ни один прогон. Берём первый существующий:
// постоянная ссылка облака, потом старая версия; нет ни одного —
// undefined, и Playwright ищет свой браузер сам.
const fs = require('fs');
module.exports = ['/opt/pw-browsers/chromium', require('./chrome-path')]
    .find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
