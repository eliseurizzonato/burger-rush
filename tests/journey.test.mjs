// node --test tests/journey.test.mjs (nenhuma dependência ou serviço externo).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const code = readFileSync(new URL('../www/journey.js', import.meta.url), 'utf8');
const T = Date.UTC(2026, 9, 29, 12);
function setup(random = .1) {
  const box = {Math: Object.create(Math), module: {exports: {}}}; box.Math.random = () => random;
  vm.runInNewContext(code, box);
  const J = box.Journey, S = {money: 1000, untouched: {sentinel: true}};
  const ctx = {cur: 0, scale: 1, owned: 1, rate: 20, rep: 3, served: 0, now: T};
  J.init(S, T);
  return {J, S, ctx, box};
}
const plain = x => JSON.parse(JSON.stringify(x));
const same = (a,b) => assert.deepEqual(plain(a), plain(b));

test('UMD browser, global e CommonJS oferecem o mesmo contrato', () => {
  const {J, box} = setup(); assert.equal(box.module.exports, J);
  const b = {window: {}}; vm.runInNewContext(code, b);
  for (const key of ['init','sync','record','act','snapshot','bonuses','preserve','restore','extraSpin','rewardXP']) assert.equal(typeof b.window.Journey[key], 'function');
});
test('init/sync repetidos não mudam dinheiro, sentinela nem progresso', () => {
  const {J,S,ctx} = setup(), ref = S.journey;
  for (let i=0;i<10;i++) { assert.equal(J.init(S,T),ref); J.sync(S,ctx,T); J.snapshot(S,ctx,T); }
  assert.equal(S.money,1000); assert.equal(S.untouched.sentinel,true);
  assert.equal(S.journey.season.xp,0); assert.equal(S.journey.stats.claims,0);
});
test('eventos válidos geram XP e participação, sync usa máximos sem duplicar', () => {
  const {J,S,ctx} = setup();
  J.record(S,'serve',3,ctx,T); J.record(S,'vip',1,ctx,T); J.record(S,'clean',2,ctx,T);
  assert.equal(S.journey.season.xp,30); assert.equal(S.journey.day.points,8);
  J.sync(S,{...ctx,recipes:['a','b'],promotions:5,franchises:3,netWorth:60000},T);
  for(let i=0;i<5;i++) J.sync(S,ctx,T);
  assert.equal(S.journey.day.points,8); assert.equal(S.journey.peaks.recipes,2);
  assert.equal(S.journey.peaks.promotions,5); assert.equal(S.journey.peaks.netWorth,60000);
  assert.equal(J.snapshot(S,ctx,T).collections.find(c=>c.id==='promotions').ready,true);
});
test('eventos inválidos, strings, frações menores que 1 e Infinity não geram ganhos', () => {
  const {J,S,ctx} = setup();
  for(const v of [0,-1,NaN,Infinity,-Infinity,'12',null,.5]) assert.equal(J.record(S,'serve',v,ctx,T).ok,false);
  for(const event of ['foo','__proto__','constructor']) assert.equal(J.record(S,event,5,ctx,T).ok,false);
  assert.equal(S.journey.season.xp,0); assert.equal(S.money,1000);
});
test('desafio exige start, só conta evento real da loja correta e paga 1/dia', () => {
  const {J,S,ctx} = setup(); J.record(S,'serve',12,ctx,T);
  assert.equal(J.act(S,'challenge','serve',ctx,T).ok,false);
  assert.equal(J.act(S,'start','serve',ctx,T).ok,true);
  assert.equal(J.act(S,'start','serve',ctx,T).reason,'already-started');
  J.record(S,'serve',12,{...ctx,cur:1},T+1000);
  assert.equal(S.journey.challenges.serve.progress,0);
  J.record(S,'serve',12,ctx,T+2000);
  const before = S.money;
  assert.equal(J.act(S,'challenge','serve',ctx,T+3000).ok,true);
  assert.equal(S.money,before+90);
  for(let i=0;i<3;i++) assert.equal(J.act(S,'challenge','serve',ctx,T+3000).ok,false);
  assert.equal(J.act(S,'start','serve',ctx,T+4000).reason,'daily-limit');
  assert.equal(S.money,before+90);
});
test('prazo expira inclusive no limite, reinício não herda progresso', () => {
  const {J,S,ctx} = setup(); J.act(S,'start','clean',ctx,T);
  J.record(S,'clean',5,ctx,T+1000); J.record(S,'clean',1,ctx,T+180000);
  assert.equal(S.journey.challenges.clean.progress,5);
  assert.equal(J.act(S,'challenge','clean',ctx,T+180000).ok,false);
  assert.equal(J.snapshot(S,ctx,T+180000).challenges.find(c=>c.id==='clean').expired,true);
  assert.equal(J.act(S,'start','clean',ctx,T+180001).ok,true);
  assert.equal(S.journey.challenges.clean.progress,0);
});
test('completou no prazo pode resgatar depois do prazo no mesmo dia', () => {
  const {J,S,ctx} = setup(); J.act(S,'start','vip',ctx,T); J.record(S,'vip',1,ctx,T+1000);
  assert.equal(J.act(S,'challenge','vip',ctx,T+400000).ok,true);
});
test('prêmio de desafio congela custo ao iniciar, independentemente da loja/escala', () => {
  const {J,S,ctx} = setup(); J.act(S,'start','clean',{...ctx,scale:2},T); J.record(S,'clean',6,ctx,T+1000);
  const out = J.act(S,'challenge','clean',{...ctx,scale:100},T+2000);
  assert.equal(out.reward.money,140);
});
test('baús diário/semanal exigem participação, só uma vez por período', () => {
  const {J,S,ctx} = setup();
  assert.equal(J.act(S,'chest','daily',ctx,T).ok,false);
  J.record(S,'serve',10,ctx,T); assert.equal(J.act(S,'chest','daily',ctx,T).ok,true);
  assert.equal(J.act(S,'chest','daily',ctx,T).ok,false);
  assert.equal(J.act(S,'chest','weekly',ctx,T).ok,false);
  J.record(S,'clean',50,ctx,T); const before=S.money;
  assert.equal(J.act(S,'chest','weekly',ctx,T).reward.money,240);
  assert.equal(J.act(S,'chest','weekly',ctx,T).ok,false); assert.equal(S.money,before+240);
  const next=Math.floor(T/J.DAY)*J.DAY+J.DAY;
  assert.equal(J.act(S,'chest','daily',ctx,next).ok,false);
  J.record(S,'serve',10,ctx,next); assert.equal(J.act(S,'chest','daily',ctx,next).ok,true);
});
test('chances somam 100%, cada intervalo gera prêmio esperado', () => {
  const variants=[[0,'coins'],[.69999,'coins'],[.70,'experience'],[.94999,'experience'],[.95,'gold'],[.99999,'gold']];
  for(const [roll,id] of variants) {
    const {J,S,ctx}=setup(roll);
    assert.ok(Math.abs(J.LOOT.reduce((n,p)=>n+p.chance,0)-1)<1e-12);
    assert.equal(J.act(S,'spin','free',ctx,T).reward.prize,id);
  }
});
test('roleta grátis respeita cooldown, reload e relógio regressivo', () => {
  const {J,S,ctx}=setup(); J.act(S,'spin','free',ctx,T); const money=S.money;
  const reload=JSON.parse(JSON.stringify(S));
  for(const now of [T,T-1000,T+6*3600000-1]) assert.equal(J.act(reload,'spin','free',ctx,now).ok,false);
  assert.equal(reload.money,money);
  assert.equal(J.act(reload,'spin','free',ctx,T+6*3600000).ok,true);
});
test('raro garantido por jogo independe dos sorteios e é claim único', () => {
  const {J,S,ctx}=setup(0); J.record(S,'serve',119,ctx,T);
  assert.equal(J.act(S,'rare','participation',ctx,T).ok,false);
  J.record(S,'clean',1,ctx,T); assert.equal(J.act(S,'rare','participation',ctx,T).ok,true);
  assert.equal(S.journey.items.filter(id=>id==='uniform-gold').length,1);
  assert.equal(J.act(S,'rare','participation',ctx,T).ok,false);
  assert.equal(S.journey.participation,120);
});
test('raro repetido não duplica item e mantém moedas declaradas', () => {
  const {J,S,ctx}=setup(.99); J.act(S,'spin','free',ctx,T);
  const r=J.act(S,'spin','free',ctx,T+6*3600000).reward;
  assert.equal(r.duplicate,true); assert.equal(r.money,120);
  assert.equal(S.journey.items.filter(x=>x==='uniform-gold').length,1);
});
test('temporada dura 14 dias, XP de jogo e claims idempotentes persistem', () => {
  const {J,S,ctx}=setup(); const season=J.snapshot(S,ctx,T).season;
  assert.equal(season.end-season.start,14*J.DAY);
  assert.equal(J.act(S,'season','0:1',ctx,T).ok,false);
  J.record(S,'serve',25,ctx,T);
  assert.equal(J.act(S,'season','0:1',ctx,T).ok,true);
  const reload=JSON.parse(JSON.stringify(S));
  assert.equal(J.act(reload,'season','0:1',ctx,T).ok,false);
  J.record(reload,'serve',50,ctx,T);
  assert.equal(J.act(reload,'season','0:2',ctx,T).ok,true);
  assert.ok(reload.journey.items.includes('wall-sun'));
});
test('virada arquiva prêmios ganhos não resgatados e impede replay de temporada antiga', () => {
  const {J,S,ctx}=setup(); J.record(S,'serve',180,ctx,T); J.act(S,'season','0:1',ctx,T);
  const end=S.journey.season.end;
  let snap=J.snapshot(S,ctx,end);
  assert.equal(snap.season.index,1); assert.equal(snap.season.xp,0);
  assert.equal(snap.season.pending.length,2);
  assert.equal(J.act(S,'season','0:1',ctx,end).ok,false);
  assert.equal(J.act(S,'season','0:2',ctx,end).ok,true);
  assert.equal(J.act(S,'season','0:2',ctx,end).ok,false);
  assert.equal(J.act(S,'season','0:3',ctx,end).ok,true);
  assert.ok(S.journey.collectibles.includes('recipe-season-house'));
  snap=J.snapshot(S,ctx,T); assert.equal(snap.season.index,1);
  assert.equal(J.act(S,'season','0:3',ctx,T).ok,false);
});
test('pular temporadas vazias não cria prêmio nem perde pendente', () => {
  const {J,S,ctx}=setup(); J.record(S,'serve',25,ctx,T);
  const end=S.journey.season.end;
  J.sync(S,ctx,end+100*J.SEASON);
  assert.equal(S.journey.season.index,101);
  assert.equal(Object.keys(S.journey.pending).length,1);
  assert.equal(J.act(S,'season','0:1',ctx,end+100*J.SEASON).ok,true);
});
test('coleções por receitas/promoções/franquias/eventos e finanças', () => {
  const {J,S,ctx}=setup(); S.money=6000;
  const context={...ctx,recipes:5,promotions:5,franchises:3,owned:3,netWorth:50000};
  J.record(S,'serve',180,context,T); J.record(S,'clean',50,context,T); J.record(S,'vip',10,context,T);
  for(const c of J.snapshot(S,context,T).collections) {
    assert.equal(c.ready,true,c.id); assert.equal(J.act(S,'collection',c.id,context,T).ok,true,c.id);
    assert.equal(J.act(S,'collection',c.id,context,T).ok,false,c.id);
  }
  assert.ok(S.journey.items.includes('floor-terrazzo'));
  const b=J.bonuses(S,context); assert.equal(b.price,.02); assert.equal(b.xp,.03);
});
test('compras usam S.money, não repetem gasto; equip por loja retorna paleta inteira', () => {
  const {J,S,ctx}=setup(); const defaults=J.snapshot(S,ctx,T).palette;
  const bought=J.act(S,'buy','floor-mint',ctx,T); assert.equal(bought.ok,true); assert.equal(S.money,820);
  assert.equal(J.act(S,'buy','floor-mint',ctx,T).ok,false); assert.equal(S.money,820);
  assert.equal(J.act(S,'equip','floor-mint',ctx,T).ok,true);
  const s=J.snapshot(S,ctx,T); assert.notEqual(s.palette.floor,defaults.floor);
  assert.equal(Object.keys(s.palette).length,8);
  same(J.snapshot(S,{...ctx,cur:1},T).palette,defaults);
  assert.equal(J.act(S,'equip','uniform-gold',ctx,T).ok,false);
  assert.equal(J.act(S,'buy','uniform-gold',ctx,T).ok,false);
  assert.equal(J.act(S,'equip','floor-mint',ctx,T).ok,false);
  assert.equal(S.journey.stats.spent,180);
});
test('compra bloqueada sem moedas e snapshot não permite mutar estado/catálogos', () => {
  const {J,S,ctx}=setup(); S.money=0;
  assert.equal(J.act(S,'buy','floor-mint',ctx,T).reason,'insufficient-money');
  const s=J.snapshot(S,ctx,T); s.equipped.floor='bad'; s.cosmetics[0].color=0; s.stats.history.push({});
  J.COSMETICS[0].color=0;
  assert.notEqual(J.snapshot(S,ctx,T).cosmetics[0].color,0);
  assert.equal(S.journey.stats.history.length,0);
});
test('prestige preserve/restore conserva jornada e não restaura saldo', () => {
  const {J,S,ctx}=setup(); J.record(S,'serve',120,ctx,T); J.act(S,'rare','participation',ctx,T); J.act(S,'chest','daily',ctx,T); J.act(S,'spin','free',ctx,T); J.act(S,'buy','floor-mint',ctx,T); J.act(S,'equip','floor-mint',ctx,T);
  const kept=J.preserve(S), copy=plain(kept), next={money:0};
  J.restore(next,kept,T);
  same(next.journey,copy); assert.equal(next.money,0);
  assert.equal(J.act(next,'rare','participation',ctx,T).ok,false);
  assert.equal(J.act(next,'chest','daily',ctx,T).ok,false);
  assert.equal(J.act(next,'spin','free',ctx,T).ok,false);
  kept.items.length=0; assert.ok(next.journey.items.length>0);
});
test('limite histórico e métricas locais conservam totais de ganhos/gastos/claims', () => {
  const {J,S,ctx}=setup();
  J.record(S,'earn',1234,ctx,T); J.record(S,'spend',34,ctx,T);
  for(let i=0;i<80;i++) J.act(S,'equip',i%2 ? 'uniform-green' : 'floor-cream',ctx,T);
  J.act(S,'buy','floor-mint',ctx,T);
  for(let i=0;i<50;i++) J.act(S,'equip',i%2 ? 'floor-mint' : 'floor-cream',ctx,T);
  J.act(S,'spin','free',ctx,T);
  assert.equal(S.journey.stats.history.length,J.HISTORY_LIMIT);
  assert.equal(S.journey.stats.earned,1314); assert.equal(S.journey.stats.spent,214);
  assert.equal(S.journey.stats.claims,1); assert.equal(S.money,900);
});
test('earned externo exige flag/id/validade, dedupe entre XP/giro e limites diários', () => {
  const {J,S,ctx}=setup(); const receipt={id:'native-1',earned:true,at:T};
  for(const bad of [null,{}, {...receipt,earned:false}, {...receipt,id:''}, {...receipt,at:T+1}, {...receipt,at:T-300001}]) assert.equal(J.extraSpin(S,bad,ctx,T).ok,false);
  assert.equal(J.extraSpin(S,receipt,ctx,T).ok,true);
  assert.equal(J.extraSpin(S,receipt,ctx,T).ok,false);
  assert.equal(J.rewardXP(S,80,receipt,ctx,T).ok,false);
  assert.equal(J.rewardXP(S,81,{...receipt,id:'native-2'},ctx,T).ok,false);
  assert.equal(J.rewardXP(S,80,{...receipt,id:'native-2'},ctx,T).ok,true);
  assert.equal(J.rewardXP(S,80,{...receipt,id:'native-3'},ctx,T).ok,false);
  assert.equal(S.journey.season.xp,80);
  assert.equal(J.act(S,'spin','free',ctx,T).ok,true);
  assert.equal(J.act(S,'spin','free',ctx,T).ok,true);
  assert.equal(J.act(S,'spin','free',ctx,T).ok,false);
});
test('recibo não ganha nada com relógio regressivo ou replay após virada de dia', () => {
  const {J,S,ctx}=setup(), end=Math.floor(T/J.DAY)*J.DAY+J.DAY;
  J.sync(S,ctx,T+1000);
  assert.equal(J.rewardXP(S,80,{id:'a',earned:true,at:T},ctx,T).ok,false);
  J.extraSpin(S,{id:'b',earned:true,at:end-1000},ctx,end-1000);
  assert.equal(J.rewardXP(S,80,{id:'b',earned:true,at:end-1000},ctx,end).ok,false);
  assert.equal(J.extraSpin(S,{id:'c',earned:true,at:end},ctx,end).reason,'reward-limit');
});
test('ações inexistentes não alteram economia e ids maliciosos não poluem objetos', () => {
  const {J,S,ctx}=setup();
  for(const kind of ['bad','start','challenge','chest','season','collection','buy','equip']) for(const id of ['__proto__','constructor','missing']) assert.equal(J.act(S,kind,id,ctx,T).ok,false);
  assert.equal(S.money,1000); assert.equal(S.journey.stats.claims,0); assert.equal({}.polluted,undefined);
});

test('resgatar etapa não concede de novo o XP exigido nem libera etapas em cascata', () => {
  const {J,S,ctx}=setup(); J.record(S,'serve',25,ctx,T);
  const xp=S.journey.season.xp;
  assert.equal(J.act(S,'season','0:1',ctx,T).reward.xp,0);
  assert.equal(S.journey.season.xp,xp);
  assert.equal(J.act(S,'season','0:2',ctx,T).ok,false);
  const end=S.journey.season.end;
  J.record(S,'serve',50,ctx,T); J.sync(S,ctx,end);
  assert.equal(J.act(S,'season','0:2',ctx,end).ok,true);
  assert.equal(S.journey.season.xp,0,'pendente não concede XP à temporada seguinte');
});
test('períodos e deadlines não podem ser reabertos voltando relógio', () => {
  const {J,S,ctx}=setup(), midnight=Math.floor(T/J.DAY)*J.DAY+J.DAY;
  J.act(S,'start','clean',ctx,midnight-1000);
  assert.equal(S.journey.challenges.clean.deadline,midnight);
  J.record(S,'clean',6,ctx,midnight+1);
  assert.equal(J.act(S,'challenge','clean',ctx,T).ok,false);
  J.record(S,'serve',10,ctx,midnight+1); J.act(S,'chest','daily',ctx,midnight+1);
  assert.equal(J.act(S,'chest','daily',ctx,T).ok,false);
  assert.equal(S.journey.clock,midnight+1);
});
test('IDs explícitos são exigidos em roleta e garantia', () => {
  const {J,S,ctx}=setup(); J.record(S,'serve',120,ctx,T);
  assert.equal(J.act(S,'spin','bad',ctx,T).ok,false);
  assert.equal(J.act(S,'rare','bad',ctx,T).ok,false);
  assert.equal(S.money,1000);
});

test('palette da cena retorna null para padrão e duas cores CSS para piso equipado', () => {
  const {J,S,ctx}=setup();
  same(J.palette(S,0),{floor:null,wall:null,counter:null,uniform:null,facade:null,equipment:null,table:null,decor:null});
  J.act(S,'buy','floor-mint',ctx,T); J.act(S,'equip','floor-mint',ctx,T);
  J.act(S,'buy','wall-peach',ctx,T); J.act(S,'equip','wall-peach',ctx,T);
  const before=JSON.stringify(S), p=J.palette(S,0);
  assert.equal(p.floor.length,2); assert.ok(p.floor.every(x=>/^#[0-9a-f]{6}$/.test(x)));
  assert.equal(p.wall,0xffc7a8); assert.equal(p.counter,null); assert.equal(p.uniform,null);
  assert.equal(JSON.stringify(S),before,'leitura da paleta não avança tempo nem muta estado');
  same(J.palette(S,1),{floor:null,wall:null,counter:null,uniform:null,facade:null,equipment:null,table:null,decor:null});
  J.act(S,'equip','floor-cream',ctx,T); assert.equal(J.palette(S,0).floor,null);
});
test('decoração de fachada, equipamento, mesas e flores é independente por loja e permanente', () => {
  const {J,S,ctx}=setup(); S.money=5000;
  for (const id of ['facade-ocean','equipment-blue','table-mint','decor-rose']) {
    assert.equal(J.act(S,'buy',id,ctx,T).ok,true);
    assert.equal(J.act(S,'equip',id,ctx,T).ok,true);
  }
  const palette=J.palette(S,0);
  assert.equal(palette.facade,0x4f8ff7); assert.equal(palette.equipment,0x638cbd);
  assert.equal(palette.table,0x78bfa1); assert.equal(palette.decor,0xff7faf);
  assert.equal(J.palette(S,1).table,null);
  const saved=J.preserve(S); S.money=0; J.restore(S,saved,T);
  assert.equal(J.palette(S,0).table,0x78bfa1); assert.equal(S.money,0);
});
test('métricas de sessão/7 dias somam ganhos, gastos e claims sem telemetria', () => {
  const {J,S,ctx}=setup();
  J.record(S,'earn',50,ctx,T); J.act(S,'spin','free',ctx,T); J.act(S,'buy','floor-mint',ctx,T);
  let snap=J.snapshot(S,ctx,T);
  assert.equal(snap.stats.session.earned,130); assert.equal(snap.stats.session.spent,180); assert.equal(snap.stats.session.claims,1);
  same(snap.stats.last7,{earned:130,spent:180,claims:1,events:1});
  const saved=plain(S), fresh=setup().J;
  snap=fresh.snapshot(saved,ctx,T);
  assert.equal(snap.stats.session.earned,0); assert.equal(snap.stats.last7.earned,130);
  J.record(S,'earn',70,ctx,T+6*J.DAY); assert.equal(J.snapshot(S,ctx,T+6*J.DAY).stats.last7.earned,200);
  J.record(S,'earn',30,ctx,T+7*J.DAY); snap=J.snapshot(S,ctx,T+7*J.DAY);
  assert.equal(snap.stats.last7.earned,100); assert.equal(snap.stats.earned,230);
  assert.ok(S.journey.stats.days.length<=7);
});
