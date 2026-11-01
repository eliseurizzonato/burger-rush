import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const scope = vm.createContext({});
vm.runInContext(readFileSync(new URL('../www/league.js', import.meta.url), 'utf8'), scope);
const {League} = scope;

test('cria a liga do dia com meta mínima e não recria no mesmo dia', () => {
  const S = {};
  assert.equal(League.ensure(S, '2026-11-01', 5), true);
  assert.equal(S.league.target, 100);
  League.add(S, 50);
  assert.equal(League.ensure(S, '2026-11-01', 9999), false);
  assert.equal(S.league.earn, 50);
});

test('rivais são determinísticos pelo dia e crescem ao longo dele', () => {
  const lg = {day: '2026-11-01', earn: 0, target: 10000};
  assert.equal(JSON.stringify(League.rows(lg, .5)), JSON.stringify(League.rows({...lg}, .5)));
  const early = League.rows(lg, .1).filter(r => !r.me).reduce((a, r) => a + r.score, 0);
  const late = League.rows(lg, .9).filter(r => !r.me).reduce((a, r) => a + r.score, 0);
  assert.ok(late > early);
  assert.equal(League.rows(lg, 1).length, 10);
});

test('virada do dia fecha a posição, gera prêmio único e acumula o não resgatado', () => {
  const S = {};
  League.ensure(S, '2026-11-01', 1000); League.add(S, 1e9); // 1º lugar garantido
  League.ensure(S, '2026-11-02', 1000);
  assert.equal(S.league.last.pos, 1);
  assert.equal(S.league.last.prize, 600);
  League.add(S, 1e9);
  League.ensure(S, '2026-11-03', 1000); // não resgatou ontem: soma
  assert.equal(S.league.last.prize, 1200);
  assert.equal(League.claim(S), 1200);
  assert.equal(League.claim(S), 0);
});

test('sem jogar no dia não há prêmio; relógio para trás não fecha liga', () => {
  const S = {};
  League.ensure(S, '2026-11-05', 1000);
  League.ensure(S, '2026-11-06', 1000);
  assert.equal(S.league.last, null);
  League.add(S, 10);
  League.ensure(S, '2026-11-04', 1000); // dia anterior: só reinicia, sem prêmio
  assert.equal(S.league.last, null);
  League.add(S, -5); League.add(S, NaN);
  assert.equal(S.league.earn, 0);
});

test('liga: quem entra tarde enfrenta rivais começando do zero', () => {
  const S = {};
  League.ensure(S, '2026-11-01', 1000, .85);
  assert.equal(S.league.start, .85);
  const late = League.rows(S.league, .86).filter(x => !x.me);
  assert.ok(late.every(x => x.score < 1000 * 1.4 * .02), 'rivais ainda perto de zero');
  const end = League.rows(S.league, 1).filter(x => !x.me);
  assert.ok(end.some(x => x.score > 500), 'à meia-noite chegam à meta cheia');
});
