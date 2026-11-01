// node tests/enterprise.test.mjs — lógica real em VM, sem DOM/SDK/conta do jogador.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../www/enterprise.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const E = sandbox.Enterprise, HOUR = 3600000;
const plain = o => JSON.parse(JSON.stringify(o));
const same = (a, b) => assert.deepEqual(plain(a), plain(b));
const rich = {cur: 0, scale: 1, owned: 3, rate: 100, rep: 4, staffCount: 4, specialists: {cozinha: 2, salao: 1, gestao: 1, limpeza: 0}};
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (error) { console.error('✗ ' + name); throw error; }
}
function fixture(money = 100000, now = 0) {
  const S = {money, offLv: 0, sentinel: {keep: ['lojas', 'equipe', 'save']}};
  assert.equal(E.init(S, now).ok, true);
  assert.equal(E.sync(S, rich, now).ok, true);
  return S;
}
const action = (S, kind, id, now = S.enterprise.highwater, ctx = rich) => E.act(S, kind, id, ctx, now);
const tick = (S, now, ctx = rich) => E.sync(S, ctx, now);
const view = (S, ctx = rich, now = S.enterprise.highwater) => E.snapshot(S, ctx, now);
function stock(S, count = 80) { for (const id of Object.keys(E.defs.ingredients)) S.enterprise.inventory[id] = count; }
function research(S, id = 'horta') {
  stock(S); assert.equal(action(S, 'research', id).ok, true);
  tick(S, S.enterprise.research.finish);
  assert.equal(action(S, 'activate', id).ok, true);
}
function delivery(S) {
  stock(S); assert.equal(action(S, 'courier-capacity', 'courier').ok, true);
  const offer = view(S).delivery[0];
  assert.equal(action(S, 'dispatch', offer.id).ok, true);
  return {offer, job: plain(S.enterprise.deliveries[0])};
}
function finiteTree(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value) && value >= 0, 'número finito e não negativo: ' + value);
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteTree);
}

test('UMD roda em Node, window e CommonJS; definições são imutáveis', () => {
  const browser = {window: {}}; vm.runInNewContext(source, browser);
  assert.equal(typeof browser.window.Enterprise.serve, 'function');
  const cjs = {module: {exports: {}}}; vm.runInNewContext(source, cjs);
  assert.equal(cjs.module.exports, cjs.Enterprise);
  assert.equal(Object.isFrozen(E.defs.recipes.horta.ingredients), true);
  same(Object.keys(E).sort(), ['act', 'bonuses', 'defs', 'init', 'prestige', 'serve', 'snapshot', 'sync']);
});

test('init é idempotente, não dá estoque/moeda e preserva os outros campos', () => {
  const S = fixture(400), original = plain(S);
  assert.equal(Object.values(S.enterprise.inventory).reduce((a, n) => a + n), 0);
  E.init(S, 10000); same(S, original);
  assert.equal(S.enterprise.producers.alface.level, 1);
  assert.equal(S.money, 400);
});

test('snapshot/bonuses são cópias sem efeitos, inclusive antes de init', () => {
  const S = {money: 100}, before = plain(S);
  E.snapshot(S, {}, 0); E.bonuses(S, {now: 0}); same(S, before);
  E.init(S, 0); const saved = plain(S), v = view(S);
  v.inventory.alface = 999; v.recipes[0].ingredients.alface = 999;
  E.bonuses(S, {now: 1000}); same(S, saved);
});

test('rejeita moeda, horários, contexto, IDs e quantidades inválidos sem gastar', () => {
  for (const money of [NaN, Infinity, -1, '100', undefined]) {
    const S = {money}; assert.equal(E.init(S, 0).ok, false); assert.equal(S.enterprise, undefined);
    assert.equal(E.act(S, 'plant', 'alface', {}, 0).ok, false);
  }
  const S = fixture(), saved = plain(S);
  for (const now of [NaN, Infinity, -1, '0']) assert.equal(E.sync(S, {}, now).ok, false);
  for (const id of [NaN, -1, null, '', '__proto__', 'constructor', 'toString', 'alface<script>']) assert.equal(action(S, 'plant', id).ok, false);
  for (const ctx of [{scale: 0}, {rate: -1}, {rep: NaN}, {cur: -1}, {owned: 0}, {owned: 1, cur: 1}, {staffCount: .5}, {specialists: {gestao: -1}}]) assert.equal(E.act(S, 'plant', 'alface', ctx, 0).ok, false);
  for (const count of [NaN, Infinity, -1, 0, .5, 101, '1']) {
    const out = E.serve(S, {count}, {}, 0); assert.equal(out.ok, false); assert.equal(out.multiplier, 1);
  }
  assert.equal(action(S, 'desconhecida', 'alface').ok, false);
  same(S, saved);
});

test('pagamento sem precisão numérica não vira construção grátis', () => {
  const S = fixture(1e300), before = plain(S);
  assert.equal(action(S, 'build', 'tomate').ok, false); same(S, before);
});

test('produção manual custa, demora, colhe uma vez e respeita nível máximo', () => {
  const S = fixture(1000);
  assert.equal(action(S, 'plant', 'alface').ok, true); assert.ok(S.money < 1000);
  const money = S.money, job = plain(S.enterprise.producers.alface.job);
  assert.equal(action(S, 'plant', 'alface').code, 'busy');
  assert.equal(action(S, 'harvest', 'alface').code, 'cooldown');
  tick(S, job.finish - 1); assert.equal(S.enterprise.inventory.alface, 0);
  tick(S, job.finish); assert.equal(S.enterprise.inventory.alface, 0, 'colheita é manual');
  assert.equal(action(S, 'harvest', 'alface').ok, true);
  assert.equal(S.enterprise.inventory.alface, job.qty); assert.equal(S.money, money);
  same(view(S).stats, {harvests: 1, produced: job.qty});
  assert.equal(action(S, 'harvest', 'alface').ok, false); assert.equal(S.enterprise.inventory.alface, job.qty);
  assert.equal(action(S, 'upgrade', 'alface').ok, true);
  assert.equal(action(S, 'upgrade', 'alface').ok, true);
  assert.equal(action(S, 'upgrade', 'alface').ok, false);
});

test('fábricas consomem insumos e moeda atomicamente; falta de um recurso não perde outro', () => {
  const S = fixture(); assert.equal(action(S, 'build', 'queijo').ok, true);
  let before = plain(S); assert.equal(action(S, 'plant', 'queijo').ok, false); same(S, before);
  S.enterprise.inventory.leite = 2; S.money = 0; before = plain(S);
  assert.equal(action(S, 'plant', 'queijo').ok, false); same(S, before);
  S.money = 100; assert.equal(action(S, 'plant', 'queijo').ok, true);
  assert.equal(S.enterprise.inventory.leite, 0); assert.ok(S.money < 100);
  tick(S, S.enterprise.producers.queijo.job.finish); action(S, 'harvest', 'queijo');
  assert.equal(S.enterprise.inventory.queijo, E.defs.ingredients.queijo.yield);
});

test('colheita cheia é preservada até liberar capacidade', () => {
  const S = fixture(); action(S, 'plant', 'alface'); const finish = S.enterprise.producers.alface.job.finish;
  S.enterprise.inventory.alface = 80; tick(S, finish);
  const before = plain(S); assert.equal(action(S, 'harvest', 'alface').code, 'capacity'); same(S, before);
  action(S, 'storage', 'inventory'); assert.equal(action(S, 'harvest', 'alface').ok, true);
  assert.equal(S.enterprise.inventory.alface, 86);
});

test('automação tem fila paga finita, capacidade e limite de trabalho offline', () => {
  const S = fixture(); action(S, 'auto-upgrade', 'alface');
  const before = S.money; action(S, 'automate', 'alface');
  assert.ok(S.money < before); assert.equal(S.enterprise.producers.alface.credits, 3);
  const out = tick(S, 200 * HOUR);
  assert.equal(out.appliedMs, 8 * HOUR); assert.equal(out.discardedMs, 192 * HOUR);
  assert.equal(out.cycles, 4); assert.equal(S.enterprise.inventory.alface, 24);
  assert.equal(S.enterprise.producers.alface.credits, 0); assert.equal(S.enterprise.producers.alface.job, null);
  assert.equal(S.enterprise.stats.harvests, 4); assert.equal(S.enterprise.stats.produced, 24);
  const saved = plain(S); tick(S, 200 * HOUR); same(S, saved);
  assert.equal(view(S).highwater, 200 * HOUR); assert.equal(view(S).time, 8 * HOUR);
  assert.equal(tick(S, 200 * HOUR + 10).appliedMs, 10);
});

test('automação para sem estoque/capacidade/saldo e não cobra ciclos sem iniciar', () => {
  const S = fixture(); action(S, 'auto-upgrade', 'alface'); S.enterprise.inventory.alface = 80;
  action(S, 'automate', 'alface'); assert.equal(S.enterprise.producers.alface.credits, 4);
  const money = S.money; tick(S, HOUR); assert.equal(S.money, money);
  assert.equal(S.enterprise.producers.alface.job, null);
  S.enterprise.inventory.alface = 0; S.money = 0; tick(S, 2 * HOUR);
  assert.equal(S.enterprise.producers.alface.credits, 4); assert.equal(S.enterprise.producers.alface.job, null);
});

test('fila não ultrapassa capacidade e refill rejeitado não cobra', () => {
  const S = fixture(); action(S, 'auto-upgrade', 'alface'); S.enterprise.inventory.alface = 80;
  action(S, 'automate', 'alface'); action(S, 'automate', 'alface');
  assert.equal(S.enterprise.producers.alface.credits, 8);
  const before = S.money; assert.equal(action(S, 'automate', 'alface').ok, false); assert.equal(S.money, before);
});

test('offline usa 8h + offLv*2h até 16h, persiste highwater e não perde frames', () => {
  const S = fixture(); S.offLv = 4;
  const out = tick(S, 100 * HOUR); assert.equal(out.appliedMs, 16 * HOUR);
  same(out.offline, {elapsedMs: 100 * HOUR, appliedMs: 16 * HOUR, discardedMs: 84 * HOUR, capMs: 16 * HOUR});
  same(view(S).offline, {pendingMs: 0, capMs: 16 * HOUR});
  const reload = plain(S); E.init(reload, 100 * HOUR); assert.equal(tick(reload, 100 * HOUR).appliedMs, 0);
  const frames = fixture(); for (let i = 1; i <= 100; i++) tick(frames, i / 4);
  assert.equal(frames.enterprise.time, 25); assert.equal(frames.enterprise.lastSync, 25);
  const legacy = fixture(); delete legacy.enterprise.highwater;
  assert.equal(tick(legacy, 1234).appliedMs, 1234, 'lastSync sozinho preserva o tempo pendente');
});

test('ID inválido rejeita antes de liquidar automação ou avançar relógio', () => {
  const S = fixture(); action(S, 'auto-upgrade', 'alface'); action(S, 'automate', 'alface');
  const saved = plain(S);
  assert.equal(action(S, 'plant', '__proto__', HOUR).code, 'id');
  assert.equal(action(S, 'claim', 'd:NaN:0', HOUR).code, 'id');
  same(S, saved);
});

test('custo manual recorrente dos ingredientes cabe no adicional de um burger base de $10', () => {
  const unitCost = {};
  for (const [id, d] of Object.entries(E.defs.ingredients)) unitCost[id] = (d.cost + Object.entries(d.inputs).reduce((n, [k, qty]) => n + qty * unitCost[k], 0)) / d.yield;
  for (const r of Object.values(E.defs.recipes)) {
    const ingredients = Object.entries(r.ingredients).reduce((n, [id, qty]) => n + qty * unitCost[id], 0);
    assert.ok(10 * r.bonus > ingredients, r.name + ': adicional supera custo manual recorrente');
  }
});

test('relógio regressivo não colhe, acelera, reinicia nem recebe prêmio repetido', () => {
  const S = fixture(); action(S, 'plant', 'alface'); tick(S, 100000); action(S, 'harvest', 'alface');
  const saved = plain(S), out = tick(S, 1); assert.equal(out.clockBack, true); same(S, saved);
  assert.equal(action(S, 'plant', 'alface', 1).code, 'clock');
  assert.equal(E.prestige(S, 1).code, 'clock'); assert.equal(E.serve(S, {}, rich, 1).multiplier, 1);
  same(S, saved); assert.equal(tick(S, 100000).appliedMs, 0);
});

test('pesquisa paga ingredientes/moeda, tem cooldown e livro permanente sem double research', () => {
  const S = fixture(); stock(S); const before = plain(S);
  assert.equal(action(S, 'research', 'horta').ok, true);
  assert.equal(S.money, before.money - 80); assert.equal(S.enterprise.inventory.alface, 76); assert.equal(S.enterprise.inventory.trigo, 77);
  assert.equal(action(S, 'activate', 'horta').ok, false);
  assert.equal(action(S, 'research', 'queijudo').code, 'busy');
  const finish = S.enterprise.research.finish; tick(S, finish - 1); assert.equal(S.enterprise.book.horta, undefined);
  assert.ok(tick(S, finish).completed.includes('horta')); assert.equal(S.enterprise.book.horta, true);
  const saved = plain(S); assert.equal(action(S, 'research', 'horta').code, 'claimed'); same(S, saved);
  assert.equal(tick(S, finish).completed.length, 0);
});

test('receita ativa consome por pedido, sem debitar venda; falta estoque usa só bônus permanente', () => {
  const S = fixture(); research(S); S.enterprise.inventory.alface = 2; S.enterprise.inventory.tomate = 2;
  const money = S.money, out = E.serve(S, {count: 2}, rich, S.enterprise.highwater);
  assert.equal(out.consumed, true); assert.equal(out.multiplier, 1.19); assert.equal(out.bonus, out.multiplier);
  assert.ok(Math.abs(out.extra - .19) < 1e-10); assert.equal(S.money, money);
  assert.equal(S.enterprise.inventory.alface, 0); assert.equal(S.enterprise.inventory.tomate, 0);
  const empty = E.serve(S, {}, rich, S.enterprise.highwater); assert.equal(empty.consumed, false); assert.equal(empty.multiplier, 1.01);
  action(S, 'activate', 'none'); assert.equal(E.serve(S, {}, rich, S.enterprise.highwater).multiplier, 1.01);
  assert.equal(E.serve(fixture(), {}, {}, 0).multiplier, 1);
});

test('receita não faz consumo parcial de lote sem estoque suficiente', () => {
  const S = fixture(); research(S); S.enterprise.inventory.alface = 2; S.enterprise.inventory.tomate = 1;
  const inventory = plain(S.enterprise.inventory), out = E.serve(S, {count: 2}, rich, S.enterprise.highwater);
  assert.equal(out.consumed, false); same(S.enterprise.inventory, inventory);
});

test('assinatura do main: items consome lote, mult tem base 1 e permanece abaixo de 2', () => {
  const S = fixture(); research(S); S.enterprise.inventory.alface = 3; S.enterprise.inventory.tomate = 3;
  const money = S.money;
  const out = E.serve(S, {items: 3, fast: true, vip: true, critic: false, products: {burger: 3}}, {...rich, specialists: ['cozinha', 'gestao']}, S.enterprise.highwater);
  assert.equal(out.count, 3); assert.equal(out.mult, out.multiplier); assert.ok(out.mult >= 1 && out.mult <= 2);
  assert.equal(S.enterprise.inventory.alface, 0); assert.equal(S.money, money);
  assert.equal(E.serve(S, {items: NaN}, rich, S.enterprise.highwater).ok, false);
  assert.equal(E.serve(fixture(), {items: 1}, rich, 0).mult, 1);
});

test('layout acelera novos ciclos em até 10% sem alterar o trabalho já iniciado', () => {
  const normal = fixture(), improved = fixture(), capped = fixture();
  const c = {...rich, layout: {spawn: {}, order: [], resources: {profile: 'horta', stockScale: 1.1, productionScale: 1.1}, challenge: null}};
  const normalMs = view(normal).producers[0].duration;
  assert.equal(E.act(improved, 'plant', 'alface', c, 0).ok, true);
  assert.equal(improved.enterprise.producers.alface.job.finish, Math.ceil(normalMs / 1.1));
  assert.equal(E.act(capped, 'plant', 'alface', {...c, layout: {resources: {productionScale: 1e100}}}, 0).ok, true);
  assert.equal(capped.enterprise.producers.alface.job.finish, improved.enterprise.producers.alface.job.finish);
  const finish = improved.enterprise.producers.alface.job.finish; tick(improved, 1);
  assert.equal(improved.enterprise.producers.alface.job.finish, finish);
  for (const productionScale of [NaN, Infinity, -1, 0]) assert.equal(E.act(normal, 'plant', 'alface', {...c, layout: {resources: {productionScale}}}, 0).ok, false);
});

test('especialização, número de lojas e reputação bloqueiam recursos avançados', () => {
  const S = fixture(); stock(S);
  assert.equal(action(S, 'build', 'raro', 0, {}).code, 'requirements');
  assert.equal(action(S, 'research', 'gourmet', 0, {owned: 1, staffCount: 2, specialists: {cozinha: 1}}).code, 'requirements');
  assert.equal(action(S, 'build', 'raro').ok, true);
  assert.equal(action(S, 'research', 'gourmet').ok, true);
  const array = {owned: 2, staffCount: 2, specialists: [{spec: 'cozinha'}, 'salao']};
  assert.equal(view(fixture(), array).commercial[1].missing.length, 0);
});

test('ofertas determinísticas são estáveis no reload, têm custo/prazo/quantidade finitos e renovam', () => {
  const A = fixture(), B = fixture(); same(view(A).delivery, view(B).delivery); same(view(A).commercial, view(B).commercial);
  tick(A, 1); const loaded = plain(A); E.init(loaded, 1); same(view(A).delivery, view(loaded).delivery);
  view(A).delivery.forEach(d => { assert.ok(d.reward > d.fee && d.quantity > 0 && d.deadline > d.dispatchBy); });
  const old = view(A).delivery[0].id; tick(A, E.defs.boardMs); assert.notEqual(view(A).delivery[0].id, old);
  assert.equal(action(A, 'dispatch', old).ok, false);
});

test('despacho consome tudo atomicamente, respeita lotação e só paga após concluir/claim uma vez', () => {
  const S = fixture(); const {offer, job} = delivery(S);
  for (const [k, n] of Object.entries(offer.goods)) assert.equal(S.enterprise.inventory[k], 80 - n);
  assert.equal(action(S, 'dispatch', offer.id).code, 'claimed');
  assert.equal(action(S, 'claim', offer.id).code, 'cooldown');
  const before = S.money; tick(S, job.finish - 1); assert.equal(S.money, before);
  tick(S, job.finish); assert.equal(S.money, before);
  assert.equal(action(S, 'claim', offer.id).ok, true); assert.equal(S.money, before + job.reward);
  const paid = plain(S); assert.equal(action(S, 'claim', offer.id).ok, false); same(S, paid);
  assert.equal(action(S, 'dispatch', offer.id).code, 'claimed');
});

test('delivery sem recursos/capacidade não consome estoque nem frete', () => {
  const S = fixture(); const offer = view(S).delivery[0], saved = plain(S);
  assert.equal(action(S, 'dispatch', offer.id).ok, false); same(S, saved);
  stock(S); S.money = 0; const empty = plain(S);
  assert.equal(action(S, 'dispatch', offer.id).ok, false); same(S, empty);
});

test('melhoria de entregador tem limite e afeta novos trajetos sem reescrever viagem existente', () => {
  const S = fixture(); const {job} = delivery(S);
  const speed = view(S).bonuses.deliverySpeed;
  for (let i = 0; i < 4; i++) assert.equal(action(S, 'courier-speed', 'courier').ok, true);
  assert.ok(view(S).bonuses.deliverySpeed > speed);
  assert.equal(S.enterprise.deliveries[0].finish, job.finish);
  const before = S.money; assert.equal(action(S, 'courier-speed', 'courier').ok, false); assert.equal(S.money, before);
});

test('contrato comercial exige especialista, registra parcial e paga exatamente uma vez', () => {
  const S = fixture(), offer = view(S).commercial[0];
  assert.equal(action(S, 'accept', offer.id, 0, {}).code, 'requirements');
  assert.equal(action(S, 'accept', offer.id).ok, true);
  assert.equal(action(S, 'accept', offer.id).code, 'claimed');
  S.enterprise.inventory.tomate = 5; const balance = S.money;
  assert.equal(action(S, 'fulfill', offer.id).ok, true); assert.equal(S.money, balance);
  assert.equal(S.enterprise.contracts[0].delivered.tomate, 5); assert.equal(S.enterprise.inventory.tomate, 0);
  stock(S); assert.equal(action(S, 'fulfill', offer.id).ok, true); assert.equal(S.money, balance + offer.reward);
  const paid = plain(S); assert.equal(action(S, 'fulfill', offer.id).ok, false); same(S, paid);
});

test('multa proporcional, limitada a 10% do saldo, expira uma única vez', () => {
  const S = fixture(), offer = view(S).commercial[0]; action(S, 'accept', offer.id);
  S.enterprise.inventory.tomate = 5; action(S, 'fulfill', offer.id);
  const contract = plain(S.enterprise.contracts[0]); S.money = 100;
  const total = Object.values(contract.goods).reduce((a, n) => a + n), missing = total - 5;
  const expected = Math.floor(Math.min(10, contract.reward * .2 * missing / total));
  const out = tick(S, contract.deadline); assert.equal(out.penalties, expected); assert.equal(S.money, 100 - expected);
  assert.equal(S.enterprise.contracts.length, 0); const balance = S.money;
  assert.equal(tick(S, contract.deadline + 1).penalties, 0); assert.equal(S.money, balance);
});

test('cancelamento com progresso custa menos que contrato vazio, sem saldo negativo', () => {
  const A = fixture(), B = fixture(), offer = view(A).commercial[0];
  action(A, 'accept', offer.id); action(B, 'accept', offer.id);
  A.enterprise.inventory.tomate = offer.goods.tomate - 1; A.enterprise.inventory.trigo = offer.goods.trigo;
  action(A, 'fulfill', offer.id); const beforeA = A.money, beforeB = B.money;
  action(A, 'cancel', offer.id); action(B, 'cancel', offer.id);
  assert.ok(beforeA - A.money < beforeB - B.money); assert.ok(A.money >= 0 && B.money >= 0);
  assert.equal(action(A, 'cancel', offer.id).ok, false);
});

test('eventos temporários modificam produção/pagamento/demanda e expiram', () => {
  const S = fixture(); const b = E.bonuses(S, {now: 0}); assert.equal(b.production, 1.25);
  assert.equal(view(S).producers[0].duration, Math.ceil(E.defs.ingredients.alface.ms / 1.25));
  tick(S, 9 * 60000); assert.equal(E.bonuses(S).production, 1); assert.equal(view(S).news.active, false);
  tick(S, E.defs.eventMs); assert.equal(E.bonuses(S).deliveryPay, 1.15); assert.equal(E.bonuses(S).deliverySpeed, 1.2);
  tick(S, 2 * E.defs.eventMs); assert.equal(E.bonuses(S).demand, 1.2);
  tick(S, 3 * E.defs.eventMs); assert.equal(E.bonuses(S).productionCost, .8);
});

test('rewarded boost reduz pesquisa/entrega uma vez e mantém flag no save/reload', () => {
  const S = fixture(); stock(S); action(S, 'research', 'horta');
  const finish = S.enterprise.research.finish, balance = S.money;
  const boost = action(S, 'boost-research', 'research'); assert.equal(boost.cutMs, 30000);
  assert.equal(S.enterprise.research.finish, finish - boost.cutMs); assert.equal(S.money, balance);
  E.init(S, 0); assert.equal(action(S, 'boost-research', 'research').code, 'claimed');
  const {job} = delivery(S); const dboost = action(S, 'boost-delivery', job.id);
  assert.equal(dboost.ok, true); assert.ok(dboost.cutMs <= 60000 && dboost.cutMs > 0);
  E.init(S, 0); assert.equal(action(S, 'boost-delivery', job.id).code, 'claimed');
  const shortened = S.enterprise.deliveries[0].finish; tick(S, shortened);
  assert.equal(action(S, 'boost-delivery', job.id).ok, false); assert.equal(action(S, 'claim', job.id).ok, true);
});

test('boost-production corta metade até 60s, uma vez por ciclo, inclusive após reload', () => {
  const S = fixture(); action(S, 'plant', 'alface');
  const original = S.enterprise.producers.alface.job.finish, balance = S.money;
  const out = action(S, 'boost-production', 'alface');
  assert.equal(out.ok, true); assert.equal(out.cutMs, original / 2);
  assert.equal(S.enterprise.producers.alface.job.finish, original / 2); assert.equal(S.money, balance);
  E.init(S, 0); assert.equal(S.enterprise.producers.alface.job.boosted, true);
  assert.equal(action(S, 'boost-production', 'alface').code, 'claimed');
  tick(S, original / 2); assert.equal(action(S, 'boost-production', 'alface').ok, false);
  assert.equal(action(S, 'harvest', 'alface').ok, true);
  action(S, 'plant', 'alface'); assert.equal(S.enterprise.producers.alface.job.boosted, false);
  const factory = fixture(); action(factory, 'build', 'raro');
  factory.enterprise.inventory.alface = 1; factory.enterprise.inventory.trigo = 1; factory.enterprise.inventory.leite = 1;
  assert.equal(action(factory, 'plant', 'raro').ok, true);
  assert.equal(action(factory, 'boost-production', 'raro').cutMs, 60000);
  assert.equal(action(factory, 'boost-production', '__proto__').ok, false);
});

test('prestige reinicia instalações/estoque/prazos, preserva receitas descobertas e não altera moeda/core', () => {
  const S = fixture(); research(S); action(S, 'build', 'tomate'); action(S, 'auto-upgrade', 'alface');
  const {job} = delivery(S); const offer = view(S).commercial[0]; action(S, 'accept', offer.id);
  action(S, 'research', 'queijudo'); const money = S.money, sentinel = plain(S.sentinel), now = S.enterprise.highwater;
  S.enterprise.stats = {harvests: 5, produced: 30};
  const out = E.prestige(S, now); assert.equal(out.ok, true); same(out.preservedRecipes, ['horta']);
  same(S.enterprise.book, {horta: true}); assert.equal(S.enterprise.active, 'horta');
  assert.equal(S.enterprise.research, null); assert.equal(S.enterprise.producers.tomate.level, 0);
  assert.equal(S.enterprise.producers.alface.auto, 0); assert.equal(Object.values(S.enterprise.inventory).reduce((a, n) => a + n), 0);
  assert.equal(S.enterprise.contracts.length, 0); assert.equal(S.enterprise.deliveries.length, 0);
  assert.equal(S.money, money); same(S.sentinel, sentinel);
  same(S.enterprise.stats, {harvests: 5, produced: 30});
  assert.equal(action(S, 'claim', job.id).ok, false); assert.equal(view(S).bonuses.price, .01);
});

test('save inválido é normalizado para recursos finitos, listas limitadas e sem prêmio infinito', () => {
  const S = fixture();
  S.enterprise.inventory.alface = Infinity; S.enterprise.inventory.tomate = -20;
  S.enterprise.producers.alface.credits = Infinity; S.enterprise.producers.alface.auto = 100;
  S.enterprise.producers.alface.job = {start: 0, finish: NaN, qty: 20};
  S.enterprise.deliveries = [{id: 'd:0:0', start: 0, finish: 0, reward: Infinity}];
  tick(S, 1e12); finiteTree(S); assert.equal(S.enterprise.deliveries.length, 0);
  assert.equal(S.enterprise.inventory.alface, 0); assert.equal(S.enterprise.inventory.tomate, 0);
});

test('simulação longa é bounded mesmo com todas as produções/automação; sem produção infinita', () => {
  const S = fixture(1e8); action(S, 'storage', 'inventory'); action(S, 'storage', 'inventory'); stock(S, 60);
  for (const id of Object.keys(E.defs.ingredients)) {
    if (id !== 'alface') assert.equal(action(S, 'build', id).ok, true);
    for (let i = 0; i < 3; i++) action(S, 'auto-upgrade', id);
    for (let i = 0; i < 3; i++) action(S, 'automate', id);
  }
  const balance = S.money, out = tick(S, 1e12);
  assert.ok(out.cycles <= 7 * 25 && out.cycles < E.defs.limits.steps); assert.ok(S.money <= balance);
  Object.values(S.enterprise.inventory).forEach(n => assert.ok(n <= view(S).capacity));
  finiteTree(S);
  const saved = plain(S); tick(S, 1e12); same(S, saved);
  for (let i = 1; i <= 20; i++) tick(S, 1e12 + i * HOUR);
  assert.ok(Object.values(S.enterprise.producers).every(p => p.credits <= 24));
  finiteTree(S); assert.equal(Object.keys(S.enterprise.board.used).length <= 5, true);
});

test('contratação paga, é única por ingrediente, respeita IDs/saldo/construção', () => {
  const S = fixture(1000), before = S.money, preview = view(S).producers[0];
  assert.equal(action(S, 'hire-worker', 'alface').ok, true);
  const p = S.enterprise.producers.alface;
  assert.equal(p.worker.name, E.defs.workers.alface.name); assert.equal(p.worker.specialist, false);
  assert.equal(p.worker.fraction, 0); assert.equal(p.job.automatic, true);
  assert.equal(S.money, before - preview.hireCost - preview.cost - preview.workerWage);
  const saved = plain(S);
  assert.equal(action(S, 'hire-worker', 'alface').code, 'claimed'); same(S, saved);
  for (const id of ['__proto__', NaN, -1, 'errado']) assert.equal(action(S, 'hire-worker', id).ok, false);
  assert.equal(action(S, 'hire-worker', 'queijo').code, 'locked');
  const poor = fixture(0), original = plain(poor);
  assert.equal(action(poor, 'hire-worker', 'alface').code, 'funds'); same(poor, original);
  assert.equal(action(poor, 'specialist', 'alface').code, 'locked');
});

test('operador replanta/colhe sem créditos e debita custo mais operação por ciclo', () => {
  const S = fixture(1000), preview = view(S).producers[0];
  action(S, 'hire-worker', 'alface');
  for (let i = 0; i < 4; i++) tick(S, S.enterprise.producers.alface.job.finish);
  assert.equal(S.enterprise.inventory.alface, 24); assert.equal(S.enterprise.stats.harvests, 4);
  assert.equal(S.money, 1000 - preview.hireCost - 5 * (preview.cost + preview.workerWage), 'quatro colheitas e quinto ciclo financiado');
  assert.equal(S.enterprise.producers.alface.auto, 0); assert.equal(S.enterprise.producers.alface.credits, 0);
  assert.equal(S.enterprise.producers.alface.job.automatic, true);
  const saved = plain(S); tick(S, S.enterprise.highwater); same(S, saved);
});

test('especialista paga uma vez, mantém ciclo em andamento e produz exatamente +25% em quatro ciclos', () => {
  const S = fixture(), preview = view(S).producers[0];
  action(S, 'hire-worker', 'alface'); const job = plain(S.enterprise.producers.alface.job), before = S.money;
  assert.equal(action(S, 'specialist', 'alface').ok, true);
  assert.equal(S.money, before - preview.specialistCost); same(S.enterprise.producers.alface.job, job);
  const saved = plain(S); assert.equal(action(S, 'specialist', 'alface').code, 'claimed'); same(S, saved);
  tick(S, job.finish); assert.equal(S.enterprise.inventory.alface, 6);
  let actual = 0;
  for (let i = 0; i < 4; i++) {
    const old = S.enterprise.inventory.alface;
    tick(S, S.enterprise.producers.alface.job.finish); actual += S.enterprise.inventory.alface - old;
    const restored = plain(S); E.init(restored, restored.enterprise.highwater); same(restored, S);
  }
  assert.equal(actual, 30); assert.equal(actual, 4 * 6 * 1.25);
  assert.equal(view(S).producers[0].specialistAverage, 7.5);
});

test('frações do especialista acumulam em todos os ingredientes e sobrevivem a reload de verdade', () => {
  for (const id of Object.keys(E.defs.ingredients)) {
    let S = fixture();
    if (id !== 'alface') action(S, 'build', id);
    stock(S); action(S, 'hire-worker', id); action(S, 'specialist', id);
    assert.equal(S.enterprise.producers[id].job, null, 'sem iniciar enquanto estoque está cheio');
    S.enterprise.inventory[id] = 0; tick(S, 1);
    const quantities = [];
    for (let i = 0; i < 4; i++) {
      const job = plain(S.enterprise.producers[id].job); quantities.push(job.qty);
      S = plain(S); E.init(S, S.enterprise.highwater);
      tick(S, job.finish);
    }
    const base = E.defs.ingredients[id].yield;
    assert.equal(S.enterprise.inventory[id], base * 4 * 1.25, id + ' entrega todos os quartos acumulados');
    assert.ok(quantities.every(n => n === Math.floor(base * 1.25) || n === Math.ceil(base * 1.25)));
    finiteTree(S);
  }
});

test('trabalhador de fábrica paga insumos/operação atomicamente e retoma após reposição', () => {
  const S = fixture(); action(S, 'build', 'queijo'); action(S, 'hire-worker', 'queijo');
  assert.equal(S.enterprise.producers.queijo.job, null);
  assert.match(view(S).producers.find(p => p.id === 'queijo').workerStatus, /insumos/);
  S.enterprise.inventory.leite = 4; S.money = 3; const before = plain(S.enterprise.inventory);
  tick(S, 1); assert.equal(S.enterprise.producers.queijo.job, null); same(S.enterprise.inventory, before); assert.equal(S.money, 3);
  S.money = 4; tick(S, 2);
  assert.equal(S.money, 0); assert.equal(S.enterprise.inventory.leite, 2);
  tick(S, S.enterprise.producers.queijo.job.finish);
  assert.equal(S.enterprise.inventory.queijo, 3); assert.equal(S.enterprise.producers.queijo.job, null);
  assert.equal(S.enterprise.inventory.leite, 2); assert.equal(S.money, 0);
  S.money = 4; tick(S, S.enterprise.highwater + 1);
  assert.equal(S.enterprise.inventory.leite, 0); assert.equal(S.money, 0);
  finiteTree(S);
});

test('créditos legados sobrevivem a contratar/especializar e evitam operação em dobro', () => {
  const S = fixture(); action(S, 'auto-upgrade', 'alface'); action(S, 'automate', 'alface');
  const credits = S.enterprise.producers.alface.credits, job = plain(S.enterprise.producers.alface.job);
  action(S, 'hire-worker', 'alface'); action(S, 'specialist', 'alface');
  assert.equal(S.enterprise.producers.alface.credits, credits); same(S.enterprise.producers.alface.job, job);
  const cost = view(S).producers[0].cost, wage = view(S).producers[0].workerWage, before = S.money;
  for (let i = 0; i < credits; i++) tick(S, S.enterprise.producers.alface.job.finish);
  assert.equal(S.enterprise.producers.alface.credits, 0); assert.equal(S.money, before - credits * cost);
  const remaining = S.money; tick(S, S.enterprise.producers.alface.job.finish);
  assert.equal(S.money, remaining - cost - wage, 'sem créditos, passa a pagar operação por ciclo');
});

test('trabalhador offline para na capacidade, retoma sem perder fração e não duplica por clock/reload', () => {
  const S = fixture(); action(S, 'hire-worker', 'alface'); action(S, 'specialist', 'alface'); S.offLv = 4;
  const out = tick(S, 100 * HOUR);
  assert.equal(out.appliedMs, 16 * HOUR); assert.equal(out.discardedMs, 84 * HOUR);
  assert.ok(out.cycles < E.defs.limits.steps); assert.ok(S.enterprise.inventory.alface <= 80);
  assert.equal(S.enterprise.producers.alface.job, null); assert.match(view(S).producers[0].workerStatus, /espaço/);
  const saved = plain(S); tick(S, 100 * HOUR); same(S, saved);
  E.init(S, 100 * HOUR); tick(S, 90 * HOUR); same(S, saved);
  const balance = S.money, fraction = S.enterprise.producers.alface.worker.fraction;
  tick(S, 101 * HOUR); assert.equal(S.money, balance); assert.equal(S.enterprise.producers.alface.worker.fraction, fraction);
  S.enterprise.inventory.alface = 0; tick(S, 101 * HOUR + 1);
  assert.ok(S.enterprise.producers.alface.job); assert.ok(S.money < balance); finiteTree(S);
});

test('save velho preserva progresso/créditos; campos inválidos de worker não criam recursos infinitos', () => {
  const S = fixture(); action(S, 'auto-upgrade', 'alface'); S.enterprise.producers.alface.credits = 7;
  delete S.enterprise.producers.alface.worker;
  E.init(S, 0); assert.equal(S.enterprise.producers.alface.worker, null); assert.equal(S.enterprise.producers.alface.credits, 7);
  S.enterprise.producers.alface.worker = {name: '<script>', specialist: true, fraction: Infinity};
  E.init(S, 0); assert.equal(S.enterprise.producers.alface.worker.fraction, 0);
  assert.equal(S.enterprise.producers.alface.worker.name, E.defs.workers.alface.name);
  const before = plain(S.sentinel); tick(S, 100 * HOUR); same(S.sentinel, before); finiteTree(S);
  E.prestige(S, S.enterprise.highwater); assert.equal(S.enterprise.producers.alface.worker, null);
});

test('preview diferencia ciclo manual e crédito automático sem prometer compra sem saldo', () => {
  const S = fixture(); S.enterprise.inventory.alface = 80;
  action(S, 'auto-upgrade', 'alface'); action(S, 'automate', 'alface'); action(S, 'hire-worker', 'alface');
  S.enterprise.inventory.alface = 0; S.money = 3;
  const p = view(S).producers[0];
  assert.equal(p.nextCost, 3); assert.equal(p.manualCost, 4); assert.equal(p.canPlant, false);
  assert.equal(action(S, 'plant', 'alface').ok, false); assert.equal(S.money, 3);
  tick(S, 1); assert.ok(S.enterprise.producers.alface.job); assert.equal(S.money, 0);
});

test('todos os trabalhadores/especialistas mantêm simulação offline finita em sete linhas', () => {
  const S = fixture(1e8); S.offLv = 4;
  for (let i = 0; i < 4; i++) action(S, 'storage', 'inventory');
  stock(S, 120);
  for (const id of Object.keys(E.defs.ingredients)) {
    if (id !== 'alface') action(S, 'build', id);
    action(S, 'hire-worker', id); action(S, 'specialist', id);
  }
  const balance = S.money, out = tick(S, 1000 * HOUR);
  assert.equal(out.appliedMs, 16 * HOUR); assert.ok(out.cycles < E.defs.limits.steps);
  assert.ok(S.money < balance && S.money >= 0); finiteTree(S);
  Object.values(S.enterprise.inventory).forEach(n => assert.ok(n <= view(S).capacity));
  const saved = plain(S); tick(S, 1000 * HOUR); same(S, saved);
});

console.log(`enterprise: ${passed} testes OK`);
