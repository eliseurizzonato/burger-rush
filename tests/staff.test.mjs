// Regras da equipe (www/staff.js): rode com `node tests/staff.test.mjs`
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('../www/staff.js', import.meta.url), 'utf8'), ctx);
const St = ctx.Staff;
let n = 0;
const test = (name, fn) => { fn(); n++; };
// objetos vêm de outro contexto do vm: compara pelo conteúdo
const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);

test('contratação é idempotente e dá habilidade fixa', () => {
  const team = {};
  const a = St.hire(team, '0:h1', 'helper', 1000);
  const b = St.hire(team, '0:h1', 'helper', 2000);
  assert.equal(a, b);
  assert.ok(St.SKILLS[a.sk]);
  assert.equal(a.spec, 'cozinha');
  assert.equal(St.hire(team, '0:c1', 'cleaner', 1000).spec, 'limpeza');
  assert.notEqual(team['0:h1'].n, team['0:c1'].n, 'nomes não se repetem');
});

test('XP sobe de nível, promove e preserva a habilidade', () => {
  const e = St.hire({}, '0:h1', 'helper', 0), sk = e.sk;
  let need = 0; for (let l = 1; l < 5; l++) need += St.xpNeed(l);
  const ev = St.gainXP(e, need, 5);
  assert.equal(e.lv, 5);
  assert.equal(ev.length, 4);
  assert.ok(ev.at(-1).promo && ev.at(-1).rank === 'Auxiliar');
  assert.equal(e.sk, sk, 'habilidade preservada');
  assert.equal(St.carryBonus(e), 1);
  assert.match(e.hist[0].txt, /Promoção para Auxiliar/);
});

test('nível máximo trava XP e não estoura', () => {
  const e = St.hire({}, '0:h2', 'helper', 0);
  St.gainXP(e, 1e9);
  assert.equal(e.lv, St.LV_MAX);
  assert.equal(e.xp, 0);
  assert.equal(St.gainXP(e, 1000).length, 0);
  assert.equal(St.skillLv(e), 4);
  assert.ok(e.hist.length <= 12);
});

test('XP inválido é ignorado', () => {
  const e = St.hire({}, '0:h3', 'helper', 0);
  for (const v of [NaN, -5, 0, undefined]) assert.equal(St.gainXP(e, v).length, 0);
  assert.equal(e.xp, 0);
});

test('sinergias respeitam requisitos e limite de 3', () => {
  const mk = (id, role, lv, sk) => ({id, role, lv, sk, spec: 'cozinha', r: 0});
  assert.equal(St.activeSyn([mk('a', 'helper', 1, 'maos')]).length, 0);
  const t = [mk('a', 'helper', 16, 'noturno'), mk('b', 'helper', 12, 'noturno'), mk('c', 'helper', 2, 'inspirador'), mk('d', 'cleaner', 10, 'receita')];
  const all = St.SYNERGIES.filter(s => s.ok(t)).map(s => s.id);
  assert.ok(all.length > 3, 'cenário com mais de 3 combos possíveis: ' + all);
  assert.equal(St.activeSyn(t).length, St.MAX_SYN);
  const b = St.bonus(t);
  assert.ok(b.speed >= .1 && b.price > 0 && b.offline > 0);
  assert.ok(b.upCost <= .25);
});

test('offline: 8 h de base, ampliável até 16 h, metade depois de 2 h', () => {
  assert.equal(St.offCapH(0), 8);
  assert.equal(St.offCapH(99), 16);
  const h = 3600000;
  same(St.offMinutes(1 * h, 8), {real: 60, eff: 60});
  same(St.offMinutes(4 * h, 8), {real: 240, eff: 180});
  same(St.offMinutes(48 * h, 8), {real: 480, eff: 300});
  same(St.offMinutes(-h, 8), {real: 0, eff: 0});
});

test('relógio voltando não gera ganho; avançando conta só uma vez', () => {
  const S = {last: 10 * 3600000, clk: 10 * 3600000};
  same(St.clockGuard(S, 9 * 3600000), {back: true, away: 0});
  assert.equal(S.clk, 10 * 3600000, 'guarda o maior horário visto');
  const g = St.clockGuard(S, 12 * 3600000);
  assert.equal(g.back, false); assert.equal(g.away, 2 * 3600000);
  S.last = 12 * 3600000; // persist() grava o horário ao guardar o prêmio
  assert.equal(St.clockGuard(S, 12 * 3600000).away, 0, 'recarregar não duplica');
});

test('offline dá XP reduzido (25% do ritmo jogando)', () => {
  const offXP = 480 * St.XP_ONLINE_MIN * St.XP_OFF_K;
  assert.ok(offXP < 480 * St.XP_ONLINE_MIN && offXP > 0);
});

test('custo de trocar especialização dobra a cada troca', () => {
  assert.equal(St.specCost({specN: 0}, 2000), 2000);
  assert.equal(St.specCost({specN: 2}, 2000), 8000);
});

console.log(`staff: ${n} testes OK`);
