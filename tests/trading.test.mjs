import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const scope = vm.createContext({});
vm.runInContext(readFileSync(new URL('../www/trading.js', import.meta.url), 'utf8'), scope);
const {Trading} = scope;
const wallet = () => ({money: 200000, stk: {c: [{p: 20, own: 0, paid: 0}]}, market: {history: []}});
test('compra e venda de 5k preservam custo médio e descontam corretagem', () => {
  const S = wallet();
  assert.equal(Trading.execute(S, 0, 5000, false, .005).n, 5000);
  assert.equal(S.stk.c[0].own, 5000);
  assert.ok(Math.abs(S.stk.c[0].paid - 100500) < .001);
  S.stk.c[0].p = 25;
  const sold = Trading.execute(S, 0, 1000, true, .005);
  assert.ok(Math.abs(sold.gain - 4775) < .001);
  assert.ok(Math.abs(S.stk.c[0].paid - 80400) < .001);
  assert.equal(S.stk.c[0].own, 4000);
  assert.equal(S.market.history.length, 2);
});
test('operações inválidas nunca alteram caixa, posição ou histórico', () => {
  for (const qty of [NaN, Infinity, -1, 0, .5, Number.MAX_SAFE_INTEGER]) {
    const S = wallet(), before = JSON.stringify(S);
    assert.equal(Trading.execute(S, 0, qty, false, .005), null);
    assert.equal(JSON.stringify(S), before);
  }
  for (const index of [-1, 99, NaN, .1]) assert.equal(Trading.execute(wallet(), index, 1, false, .005), null);
});
test('venda máxima zera posição e custo; sem ações não gera moedas', () => {
  const S = wallet();
  Trading.execute(S, 0, 10, false, .005);
  Trading.execute(S, 0, 5000, true, .005);
  assert.equal(S.stk.c[0].own, 0); assert.equal(S.stk.c[0].paid, 0);
  const money = S.money;
  assert.equal(Trading.execute(S, 0, 1, true, .005), null); assert.equal(S.money, money);
});
test('histórico é limitado e saldo insuficiente não deixa compra parcial', () => {
  const S = wallet();
  for (let i = 0; i < 110; i++) Trading.execute(S, 0, 1, false, .005, i);
  assert.equal(S.market.history.length, 100);
  const before = JSON.stringify(S);
  assert.equal(Trading.execute(S, 0, 100000, false, .005), null);
  assert.equal(JSON.stringify(S), before);
});
