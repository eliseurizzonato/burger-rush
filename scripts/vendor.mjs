// Copia as bibliotecas para www/vendor: o app precisa abrir sem internet
import {copyFileSync, mkdirSync} from 'node:fs';
const out = 'www/vendor';
mkdirSync(out, {recursive: true});
copyFileSync('node_modules/three/build/three.min.js', `${out}/three.min.js`);
copyFileSync('node_modules/@capacitor/core/dist/capacitor.js', `${out}/capacitor.js`);
for (const w of [500, 700]) copyFileSync(`node_modules/@fontsource/fredoka/files/fredoka-latin-${w}-normal.woff2`, `${out}/fredoka-${w}.woff2`);
console.log('vendor ok');
