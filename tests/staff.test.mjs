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
  assert.ok(ev.at(-1).promo && ev.at(-1).rank === 'Ajudante');
  assert.equal(e.sk, sk, 'habilidade preservada');
  assert.equal(St.carryBonus(e), 1);
  assert.match(e.hist[0].txt, /Promoção para Ajudante/);
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

test('perfil determinístico migra funcionário antigo e persiste em JSON', () => {
  const a = St.hire({}, '0:h1', 'helper', 1000);
  const b = St.hire({}, '0:h1', 'helper', 1000);
  same(St.profile(a), JSON.parse(JSON.stringify(St.profile(b))));
  const old = JSON.parse(JSON.stringify(a)); delete old.uid; delete old.profile;
  const result = St.profile(old);
  assert.ok(result.story && result.talent && result.preference && result.objective);
  const saved = JSON.parse(JSON.stringify(old));
  same(St.profile(saved), JSON.parse(JSON.stringify(result)));
});

test('objetivos por trabalho/XP resgatam uma vez e dão bônus pequeno', () => {
  const e = St.hire({}, '0:h1', 'helper', 1000);
  assert.equal(St.claimObjective(e, 'primeiro-turno', 1100).ok, false);
  St.recordWork(e, 30, 1200);
  assert.equal(St.objectives(e)[0].ready, true);
  assert.equal(St.claimObjective(e, 'primeiro-turno', 1200).uniform, 'staff-mint');
  assert.equal(St.claimObjective(e, 'primeiro-turno', 100).ok, false);
  assert.equal(e.progress.uniforms.length, 1);
  St.gainXP(e, 600, 1300);
  assert.equal(St.claimObjective(e, 'aprender', 1400).ok, true);
  St.recordWork(e, 170, 1500);
  assert.equal(St.claimObjective(e, 'da-casa', 1600).ok, true);
  assert.equal(St.objectiveBonus(e), .015);
  assert.equal(St.goal(e), null);
  assert.equal(St.UNIFORMS['staff-mint'].shirt, 0x2bb3a3);
  assert.equal(St.UNIFORMS['staff-gold'].shirt, 0xe0a01a);
  const before = St.bonus([e]).price;
  const other = JSON.parse(JSON.stringify(e)); delete other.progress;
  assert.ok(Math.abs(before - St.bonus([other]).price - .015) < 1e-9);
  assert.equal(St.claimObjective(e, '__proto__').ok, false);
});

test('valores inválidos não contaminam XP/trabalho', () => {
  const e = St.hire({}, '0:h1', 'helper', 1000);
  for (const a of [Infinity, -Infinity, NaN, '50', null, -1, 0]) {
    St.gainXP(e, a, 2000); St.recordWork(e, a, 2000);
  }
  assert.equal(e.xp, 0); assert.equal(e.progress.work, 0);
  assert.equal(St.objectives(e).some(o => o.ready), false);
});

test('swap conserva pessoa/cargo/XP/skill/especialização/perfil e slots comprados', () => {
  const team = {}, a = St.hire(team, '0:h1', 'helper', 1000), b = St.hire(team, '2:h3', 'helper', 1100);
  St.gainXP(a, 5432, 1200); St.gainXP(b, 800, 1200);
  St.recordWork(a, 35, 1300); St.claimObjective(a, 'primeiro-turno', 1300);
  a.spec = 'gestao'; a.specN = 2;
  const person = JSON.parse(JSON.stringify(a)), rank = St.rankOf(a).name;
  const S = {r: [{bought: ['h1']}, null, {bought: ['h3']}]}, bought = JSON.stringify(S.r);
  const result = St.transfer(team, '0:h1', '2:h3', 1400);
  assert.equal(result.ok, true); assert.equal(result.moved, a); assert.equal(result.swapped, b);
  assert.equal(team['2:h3'], a); assert.equal(team['0:h1'], b);
  assert.equal(a.r, 2); assert.equal(a.id, '2:h3'); assert.equal(b.r, 0);
  for (const key of ['uid','n','lv','xp','sk','spec','specN','role','av','hair']) assert.equal(a[key], person[key]);
  same(a.profile, person.profile); same(a.progress.claimed, person.progress.claimed);
  assert.equal(St.rankOf(a).name, rank); assert.equal(JSON.stringify(S.r), bought);
  assert.match(a.hist[0].txt, /Transferido/);
  assert.equal(St.hire(team, '2:h3', 'helper', 9999), a, 'reconectar não recontrata');
  assert.equal(St.hire(team, '0:h1', 'helper', 9999), b);
  assert.equal(Object.keys(team).length, 2);
  St.transfer(team, '2:h3', '0:h1', 100);
  assert.equal(team['0:h1'], a); assert.ok(a.hist[0].t >= 1400);
  assert.equal(St.claimObjective(a, 'primeiro-turno', 2000).ok, false);
});

test('swap inválido não cria posto e não altera equipe', () => {
  const t = {}; St.hire(t, '0:h1', 'helper', 1000); St.hire(t, '1:c1', 'cleaner', 1000); St.hire(t, '0:h2', 'helper', 1000);
  const before = JSON.stringify(t);
  for (const [a,b] of [['0:h1','1:h1'],['0:h1','1:c1'],['0:h1','0:h1'],['0:h1','0:h2'],['__proto__','0:h1']]) assert.equal(St.transfer(t,a,b,2000).ok, false);
  assert.equal(JSON.stringify(t), before);
  assert.equal(St.transferCost(t['0:h1'], 2), St.transferCost(t['0:h1'], 1) * 2);
  assert.ok(Number.isFinite(St.transferCost(t['0:h1'], Infinity)));
});

test('rewardXP exige earned externo, recibo fresco, limite e idempotência', () => {
  const e = St.hire({}, '0:h1', 'helper', 1000), now = 86400000 + 1000000;
  const receipt = {id: 'ad-1', earned: true, at: now};
  assert.equal(St.rewardXP(e, 80, {...receipt, earned: false}, now).ok, false);
  assert.equal(St.rewardXP(e, Infinity, receipt, now).ok, false);
  assert.equal(St.rewardXP(e, 121, receipt, now).ok, false);
  assert.equal(St.rewardXP(e, 80, {...receipt, at: now + 1}, now).ok, false);
  assert.equal(St.rewardXP(e, 80, {...receipt, at: now - 300001}, now).ok, false);
  assert.equal(St.rewardXP(e, 80, receipt, now).ok, true);
  const xp = e.progress.xp;
  assert.equal(St.rewardXP(e, 80, receipt, now).ok, false);
  assert.equal(St.rewardXP(e, 80, {...receipt, id: 'ad-2'}, now).ok, false);
  assert.equal(e.progress.xp, xp);
});

test('slot h4 do anexo transfere preservando progresso e uniforme equipado', () => {
  const team = {}, a = St.hire(team, '0:h4', 'helper', 1000), b = St.hire(team, '1:h1', 'helper', 1100);
  St.gainXP(a, 1234, 1200); St.recordWork(a, 30, 1300); St.claimObjective(a, 'primeiro-turno', 1400);
  a.uniform = 'staff-mint';
  const before = JSON.parse(JSON.stringify(a));
  assert.equal(St.transfer(team, '0:h4', '1:h1', 1500).ok, true);
  assert.equal(team['1:h1'], a); assert.equal(team['0:h4'], b);
  assert.equal(a.uniform, before.uniform); assert.equal(a.xp, before.xp); assert.equal(a.sk, before.sk);
  assert.equal(a.uid, before.uid); same(a.progress.uniforms, before.progress.uniforms); same(a.progress.claimed, before.progress.claimed);
  assert.equal(St.hire(team, '0:h4', 'helper', 9999), b, 'slot do anexo não recontrata');
  assert.equal(St.transfer(team, '1:h1', '0:h4', 1600).ok, true);
  assert.equal(team['0:h4'], a);
});

test('profissões usam títulos distintos e graduação pelos mesmos marcos', () => {
  const helper = St.hire({}, '0:h1', 'helper', 1000), cleaner = St.hire({}, '0:c1', 'cleaner', 1000);
  const helperTitles = new Set(), cleanerTitles = new Set();
  for (const lv of [1, 5, 10, 15, 20, 25]) {
    helper.lv = cleaner.lv = lv;
    const h = St.jobTitle(helper), c = St.jobTitle(cleaner);
    assert.notEqual(h, c); assert.match(c, /Faxineiro|limpeza/);
    assert.doesNotMatch(c, /Cozinheiro|Chef|cozinha/i);
    helperTitles.add(h); cleanerTitles.add(c);
    helper.lv = cleaner.lv = Math.min(lv + 1, 30);
    assert.equal(St.jobTitle(helper), h); assert.equal(St.jobTitle(cleaner), c);
  }
  assert.equal(helperTitles.size, 6); assert.equal(cleanerTitles.size, 6);
  assert.equal(St.jobTitle({role: 'unknown', lv: 10}), 'Funcionário');
});

test('ajudante recebe títulos de atendimento em cada marco e nas promoções', () => {
  const e = St.hire({}, '0:h4', 'helper', 1000);
  const titles = ['Ajudante iniciante', 'Ajudante', 'Ajudante experiente', 'Supervisor de balcão', 'Líder de atendimento', 'Gerente de salão'];
  for (const [i, lv] of [1, 5, 10, 15, 20, 25].entries()) {
    assert.equal(St.jobTitle({...e, lv}), titles[i]);
    assert.equal(St.jobTitle({...e, lv: Math.min(30, lv + 1)}), titles[i]);
  }
  let amount = 0; for (let lv = 1; lv < 25; lv++) amount += St.xpNeed(lv);
  const events = St.gainXP(e, amount, 2000);
  same(events.filter(x => x.promo).map(x => x.rank), titles.slice(1));
  assert.ok(events.every(x => !/Cozinheiro|Chef|cozinha/i.test(x.rank)));
  assert.ok(e.hist.every(h => !/Cozinheiro|Chef|cozinha/i.test(h.txt)));
  assert.equal(e.lv, 25);
});

test('promoções e histórico de faxineiro não o chamam de cozinheiro', () => {
  const cleaner = St.hire({}, '0:c1', 'cleaner', 1000);
  let amount = 0; for (let lv = 1; lv < 10; lv++) amount += St.xpNeed(lv);
  const events = St.gainXP(cleaner, amount, 2000);
  assert.equal(cleaner.lv, 10); assert.equal(events.at(-1).rank, 'Faxineiro experiente');
  assert.ok(cleaner.hist.some(h => /Promoção para Faxineiro experiente/.test(h.txt)));
  assert.ok(cleaner.hist.every(h => !/Cozinheiro|Chef/i.test(h.txt)));
});

test('limpeza não se aplica a ajudante; prévia não muda pessoa nem equipe', () => {
  const helper = St.hire({}, '0:h1', 'helper', 1000); helper.sk = 'economia';
  const before = JSON.stringify(helper);
  assert.equal(St.canSpecialize(helper, 'limpeza'), false);
  const p = St.specPreview(helper, 'limpeza', [helper]);
  assert.equal(p.ok, false); assert.equal(p.reason, 'inapplicable'); same(p.after, JSON.parse(JSON.stringify(p.before)));
  assert.equal(St.specialize(helper, 'limpeza', 1000, 200, 2000).ok, false);
  assert.equal(JSON.stringify(helper), before);
  for (const key of ['__proto__', 'constructor', 'unknown', 'cozinha']) assert.equal(St.canSpecialize(helper, key), false);
  for (const key of ['salao', 'gestao']) assert.equal(St.canSpecialize(helper, key), true);
});

test('prévia expõe velocidade real e troca entre paciência e ganhos offline', () => {
  const helper = St.hire({}, '0:h1', 'helper', 1000); helper.sk = 'economia';
  const p = St.specPreview(helper, 'salao');
  assert.equal(p.ok, true);
  assert.ok(Math.abs(p.before.speed - 1.1) < 1e-12); assert.equal(p.before.pat, 0);
  assert.equal(p.after.speed, 1); assert.equal(p.after.pat, .05); assert.equal(p.after.offline, 0);
  const out = St.specialize(helper, 'salao', 1000, 100, 2000);
  same(out.before, JSON.parse(JSON.stringify(p.before))); same(out.after, JSON.parse(JSON.stringify(p.after)));
  assert.equal(St.bonus([helper]).pat, out.after.pat);
  assert.equal(St.agility(helper, St.bonus([helper]), false), out.after.speed);
  const g = St.specPreview(helper, 'gestao');
  assert.equal(g.before.pat, .05); assert.equal(g.after.pat, 0); assert.equal(g.after.offline, .05);
});

test('limpeza do faxineiro tem +15% efetivo no trabalho real', () => {
  const cleaner = St.hire({}, '0:c1', 'cleaner', 1000); cleaner.sk = 'economia'; cleaner.spec = 'gestao';
  const before = St.agility(cleaner, St.bonus([cleaner]), true);
  assert.equal(St.canSpecialize(cleaner, 'limpeza'), true);
  const p = St.specPreview(cleaner, 'limpeza');
  assert.ok(Math.abs(p.after.speed - p.before.speed - .15) < 1e-12);
  assert.equal(p.before.offline, .05); assert.equal(p.after.offline, 0);
  const result = St.specialize(cleaner, 'limpeza', 1000, 200, 2000);
  assert.equal(result.ok, true); assert.equal(result.money, 800);
  assert.equal(St.agility(cleaner, St.bonus([cleaner]), true), result.after.speed);
  assert.ok(Math.abs(result.after.speed - before - .15) < 1e-12);
  assert.equal(St.agility(cleaner, St.bonus([cleaner]), false), 1, 'efeito exclusivo durante limpeza');
  const helper = {...cleaner, role: 'helper'};
  assert.equal(St.agility(helper, St.bonus([helper]), true), 1, 'role incorreto não recebe efeito de faxineiro');
});

test('prévia com equipe usa sinergias reais, exclui outra loja e aceita mapa', () => {
  const team = {}, e = St.hire(team, '0:c1', 'cleaner', 1000, 10);
  const a = St.hire(team, '0:h1', 'helper', 1100, 5), b = St.hire(team, '0:h2', 'helper', 1200, 5);
  const elsewhere = St.hire(team, '1:h1', 'helper', 1300, 5);
  e.sk = a.sk = b.sk = 'economia'; a.spec = 'salao'; elsewhere.spec = 'gestao';
  const serialized = JSON.stringify(team), p = St.specPreview(e, 'gestao', team);
  assert.equal(p.ok, true); assert.equal(p.before.pat, .05); assert.equal(p.before.offline, 0); assert.equal(p.after.offline, .05);
  const members = [e, a, b], changed = {...e, spec: 'gestao'};
  assert.equal(p.before.speed, St.agility(e, St.bonus(members), true));
  assert.equal(p.after.speed, St.agility(changed, St.bonus([changed, a, b]), true));
  assert.equal(JSON.stringify(team), serialized);
  const list = St.specPreview(e, 'gestao', [a,b]);
  same(list, JSON.parse(JSON.stringify(p)));
});

test('troca válida cobra uma vez e conserva nível, XP, habilidade, uniforme e objetivos', () => {
  const e = St.hire({}, '0:h1', 'helper', 1000);
  St.gainXP(e, 500, 1200); St.recordWork(e, 30, 1300); St.claimObjective(e, 'primeiro-turno', 1400);
  e.uniform = 'staff-mint';
  const original = JSON.parse(JSON.stringify(e));
  const out = St.specialize(e, 'salao', 1000, 200, 1500);
  assert.equal(out.ok, true); assert.equal(out.money, 800); assert.equal(out.cost, 200);
  assert.equal(e.spec, 'salao'); assert.equal(e.specN, 1);
  for (const key of ['uid','id','r','role','lv','xp','sk','uniform','n']) assert.equal(e[key], original[key]);
  same(e.progress, original.progress); same(e.profile, original.profile);
  assert.match(e.hist[0].txt, /Especialização: Atendimento/); same(e.hist.slice(1), original.hist);
  const unchanged = JSON.stringify(e), repeat = St.specialize(e, 'salao', out.money, 200, 1600);
  assert.equal(repeat.ok, false); assert.equal(repeat.reason, 'same-spec'); assert.equal(repeat.money, 800); assert.equal(repeat.cost, 0);
  assert.equal(JSON.stringify(e), unchanged);
  const second = St.specialize(e, 'gestao', out.money, 200, 1700);
  assert.equal(second.ok, true); assert.equal(second.cost, 400); assert.equal(second.money, 400); assert.equal(e.specN, 2);
});

test('NaN, saldo inferior e custos inválidos não cobram nem alteram pessoa', () => {
  const e = St.hire({}, '0:h1', 'helper', 1000), before = JSON.stringify(e);
  const cases = [
    ...[NaN, Infinity, -1, '1000', null, undefined, 99].map(wallet => [wallet, 100, 2000]),
    ...[NaN, Infinity, 0, -1, '100', null, .1, Number.MAX_SAFE_INTEGER * 2].map(base => [1000, base, 2000]),
    ...[NaN, Infinity, -1].map(now => [1000, 100, now]),
  ];
  for (const [wallet,base,now] of cases) {
    const out = St.specialize(e, 'salao', wallet, base, now);
    assert.equal(out.ok, false); assert.ok(Object.is(out.money, wallet)); assert.equal(out.cost, 0);
    same(out.before, JSON.parse(JSON.stringify(out.after))); assert.equal(JSON.stringify(e), before);
  }
  const exact = St.specialize(e, 'salao', 100, 100, 2000);
  assert.equal(exact.ok, true); assert.equal(exact.money, 0);
});

test('contador inválido/overflow impede cobrança; contador legado ausente começa em zero', () => {
  for (const specN of [NaN, Infinity, -1, .5, null, 1024]) {
    const e = St.hire({}, '0:h1', 'helper', 1000); e.specN = specN;
    const out = St.specialize(e, 'salao', 1000, 100, 2000);
    assert.equal(out.ok, false); assert.equal(out.money, 1000); assert.equal(out.cost, 0);
    assert.equal(e.spec, 'cozinha'); assert.ok(Object.is(e.specN, specN));
  }
  const old = St.hire({}, '0:h1', 'helper', 1000); delete old.specN;
  assert.equal(St.specialize(old, 'salao', 1000, 100, 2000).ok, true); assert.equal(old.specN, 1);
});

test('repairRole migra gratuitamente helpers h1-h4 com limpeza inválida sem perda', () => {
  const team = {};
  for (let slot = 1; slot <= 4; slot++) {
    const key = `0:h${slot}`, e = St.hire(team, key, 'cleaner', 1000, 10);
    St.gainXP(e, 30, 1100); e.specN = 3; e.uniform = 'staff-mint';
    const before = JSON.parse(JSON.stringify(e));
    const out = St.repairRole(team, key);
    assert.equal(out.ok, true); assert.equal(out.changed, true); assert.equal(e.role, 'helper'); assert.equal(e.spec, 'cozinha');
    same(e, {...before, role: 'helper', spec: 'cozinha'});
    assert.equal(St.repairRole(team, key).changed, false);
    assert.equal(St.canSpecialize(e, 'limpeza'), false);
    assert.equal(St.canSpecialize(e, 'salao'), true);
    assert.equal(e.specN, 3, 'reparo não simula compra nem reembolso');
  }
});

test('repairRole confirma cleaner c1, mantém especialização válida e não cria slots', () => {
  const team = {}, cleaner = St.hire(team, '2:c1', 'helper', 1000, 10);
  cleaner.spec = 'limpeza'; const before = JSON.parse(JSON.stringify(cleaner));
  assert.equal(St.repairRole(team, '2:c1').role, 'cleaner'); same(cleaner, {...before, role: 'cleaner'});
  assert.match(St.jobTitle(cleaner), /Faxineiro/);
  cleaner.spec = 'salao'; assert.equal(St.repairRole(team, '2:c1').spec, 'salao');
  const serialized = JSON.stringify(team);
  for (const key of ['2:h0','2:h5','2:c2','-1:c1','__proto__','2:h1']) assert.equal(St.repairRole(team,key).ok, false);
  assert.equal(JSON.stringify(team), serialized);
  const inherited = Object.create({'0:h1': cleaner});
  assert.equal(St.repairRole(inherited,'0:h1').ok, false);
});

test('repairRole corrige helper já marcado helper com limpeza e não toca saldo/histórico', () => {
  const S = {money: 456, team: {}}, e = St.hire(S.team, '0:h4', 'helper', 1000, 10);
  e.spec = 'limpeza'; e.specN = 4;
  const saved = JSON.parse(JSON.stringify(e));
  assert.equal(St.repairRole(S.team, '0:h4').changed, true);
  same(e, {...saved, spec: 'cozinha'}); assert.equal(S.money, 456);
  assert.equal(St.repairRole(S.team, '0:h4').changed, false);
});

console.log(`staff: ${n} testes OK`);
