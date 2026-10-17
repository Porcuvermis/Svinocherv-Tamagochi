// Исходник ECONOMY целиком для калькуляторов: economy.js + куски
// economy-<грех>.js в том же порядке, что в index.html. Калькуляторы
// склеивают его с другими конфигами и eval'ят — раньше они читали один
// economy.js, после разрезки по грехам читают это.
const fs = require('fs');
const dir = __dirname + '/../src/config/';
const PARTS = ['economy', 'economy-wrath', 'economy-pride', 'economy-greed',
               'economy-envy', 'economy-gluttony', 'economy-lust'];
module.exports = PARTS.map(p => fs.readFileSync(dir + p + '.js', 'utf8')).join('\n');
