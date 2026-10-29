import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');

assert.match(html, /canvas\{[^}]*position:fixed[^}]*inset:0[^}]*width:100%[^}]*height:100%/,
  'o canvas precisa ocupar exatamente o viewport');
assert.match(html, /renderer\.setSize\(w, h, true\)/,
  'o resize precisa atualizar o tamanho CSS junto com o buffer WebGL');
assert.doesNotMatch(html, /renderer\.setSize\(w, h, false\)/,
  'não pode deixar o canvas com tamanho visual baseado no buffer de alta densidade');

console.log('camera-regression: OK');
