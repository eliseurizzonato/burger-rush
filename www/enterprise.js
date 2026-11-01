/* Burger Rush — regras de produção, laboratório e negócios, sem DOM/dependências.
 * UMD: window.Enterprise / globalThis.Enterprise / module.exports.
 * Contrato v1 (tempo em ms; custos e pagamentos em moeda do jogo):
 * init(S, now), sync(S, ctx, now), act(S, kind, id, ctx, now),
 * serve(S, {count: 1}, ctx, now), bonuses(S, ctx), snapshot(S, ctx, now),
 * prestige(S, now): reinicia operação, preserva livro/receita ativa e moeda.
 * stats.harvests/produced são contadores históricos finitos (também preservados
 * no prestige), para o core reconhecer progresso local ao comparar saves.
 * ctx: {cur:0, scale:1, owned:1, rate:0, rep:3, staffCount:0,
 *       specialists:{cozinha:0,salao:0,gestao:0,limpeza:0}, now?}.
 * specialists também aceita array de nomes ou registros {spec}. owned é uma
 * CONTAGEM de restaurantes; scale é o valor multiplicador da loja atual.
 * ctx.layout.resources.productionScale acelera novos ciclos (limitado a 1..1.1).
 * serve aceita info.items como alias de count; sem ambos, consome por 1 pedido.
 * Só S.enterprise e S.money podem mudar. Nunca escreve a receita do pedido em
 * S.money: serve retorna {bonus,multiplier,mult,extra,consumed}; base 1.
 * Rejeições: {ok:false,code,messages:[]}; sucessos também têm messages:[] e
 * moneyDelta. act/serve liquidam sync primeiro; uma rejeição pode incluir essa
 * liquidação, mas a operação em si é atômica (estoque + dinheiro + progresso).
 * Ações (id): build/upgrade/plant/harvest/auto-upgrade/automate (ingrediente),
 * storage ('inventory'), research/activate (receita; activate 'none' desliga),
 * dispatch (oferta), claim (entrega), courier-speed/courier-capacity ('courier'),
 * accept (oferta comercial), fulfill/cancel (contrato aceito).
 * boost-research ('research'), boost-delivery (entrega), boost-production
 * (ingrediente): uma vez por trabalho,
 * corta 50% do tempo restante até 60s. O core verifica o rewarded Ad antes de
 * chamar; o módulo não verifica SDK de anúncios nem exige ads para progredir.
 * fulfill entrega parcialmente; ao completar paga uma vez. cancel/expiração
 * cobram até 20% do prêmio × fração faltante, limitados a 10% do saldo atual.
 * Automação compra créditos finitos, também paga insumos/moeda por ciclo,
 * para sem saldo/insumos/espaço e nunca descarta uma colheita pronta.
 * hire-worker/specialist (ingrediente): contrata operador/promove especialista
 * com moedas do jogo. producers[id].worker = {name,specialist,fraction}.
 * O trabalhador colhe/replanta, usa créditos legados primeiro e depois paga
 * operação por ciclo. Especialista rende +25% em novos ciclos; fraction guarda
 * quartos de unidade entre ciclos/saves. Quantidade em andamento fica fixa.
 * sync usa highwater/lastSync persistidos, mantém time (relógio de simulação),
 * aplica no máximo 8h + min(offLv,4)*2h por ausência e DESCARTA o excedente.
 * lastSync=highwater, inclusive após ausência limitada; sem arredondar frames.
 * snapshot/bonuses são leituras; não avançam relógio nem liquidam dinheiro.
 * O core deve salvar S.enterprise, somar serve().extra ao preço e aplicar os
 * multiplicadores de bonuses(); montar esta UI não instala hooks no core.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof define === 'function' && define.amd) define([], () => api);
  root.Enterprise = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const HOUR = 3600000, BOARD_MS = 12 * 60000, EVENT_MS = 15 * 60000;
  // 16h / menor ciclo (45s / 1.25 / 1.1), em sete linhas, cabe em 16384 passos.
  const MAX_TIME = 4000000000000000, MAX_TX = 1e12, MAX_STEPS = 16384;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const object = o => o && typeof o === 'object' && !Array.isArray(o);
  const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const bounded = (n, fallback, max) => valid(n) ? Math.min(max, n) : fallback;
  const integer = (n, fallback, max) => Math.floor(bounded(n, fallback, max));
  const copy = o => JSON.parse(JSON.stringify(o));
  const freeze = o => { Object.values(o).forEach(v => { if (object(v) || Array.isArray(v)) freeze(v); }); return Object.freeze(o); };
  const INGREDIENTS = {
    alface: {name: 'Alface', icon: '🥬', type: 'cultivo', build: 0, cost: 3, yield: 6, ms: 45000, value: 5, inputs: {}},
    tomate: {name: 'Tomate', icon: '🍅', type: 'cultivo', build: 60, cost: 4, yield: 5, ms: 60000, value: 8, inputs: {}},
    trigo: {name: 'Trigo', icon: '🌾', type: 'cultivo', build: 90, cost: 3, yield: 5, ms: 75000, value: 9, inputs: {}},
    leite: {name: 'Leite', icon: '🥛', type: 'cultivo', build: 140, cost: 3, yield: 4, ms: 90000, value: 12, inputs: {}},
    queijo: {name: 'Queijo', icon: '🧀', type: 'fabrica', build: 220, cost: 3, yield: 3, ms: 120000, value: 22, inputs: {leite: 2}},
    molho: {name: 'Molho', icon: '🥫', type: 'fabrica', build: 200, cost: 2, yield: 3, ms: 90000, value: 18, inputs: {tomate: 2}},
    raro: {name: 'Tempero raro', icon: '✨', type: 'fabrica', build: 700, cost: 2, yield: 2, ms: 180000, value: 90, inputs: {alface: 1, trigo: 1, leite: 1}, req: {owned: 2, specialists: {cozinha: 1}}}
  };
  const KEYS = Object.keys(INGREDIENTS);
  const WORKERS = Object.fromEntries(KEYS.map((id, i) => [id, {
    name: ['Ana', 'Bruno', 'Lia', 'Bia', 'Caio', 'Duda', 'Iara'][i],
    icon: INGREDIENTS[id].type === 'cultivo' ? '🧑‍🌾' : '🧑‍🍳',
    hire: 120 + Math.round(INGREDIENTS[id].build / 2),
    specialist: 240 + INGREDIENTS[id].build, wage: 1,
    description: 'Colhe e inicia novos ciclos automaticamente, pagando insumos e operação com moedas do jogo.'
  }]));
  const RECIPES = {
    horta: {name: 'Burger da Horta', cost: 80, ms: 60000, research: {alface: 4, trigo: 3}, ingredients: {alface: 1, tomate: 1}, bonus: .18, permanent: .01, req: {}},
    queijudo: {name: 'Duplo Queijudo', cost: 200, ms: 120000, research: {leite: 4, trigo: 4}, ingredients: {trigo: 1, queijo: 1}, bonus: .30, permanent: .015, req: {rep: 2}},
    gourmet: {name: 'Burger Gourmet', cost: 600, ms: 240000, research: {molho: 3, queijo: 3, trigo: 5, raro: 1}, ingredients: {trigo: 1, molho: 1, queijo: 1, raro: 1}, bonus: .55, permanent: .025, req: {owned: 2, rep: 3, staffCount: 2, specialists: {cozinha: 1}}},
    chef: {name: 'Assinatura do Chef', cost: 1800, ms: 480000, research: {raro: 3, queijo: 4, molho: 4}, ingredients: {trigo: 1, queijo: 2, molho: 1, raro: 1}, bonus: .80, permanent: .04, req: {owned: 3, rep: 4, staffCount: 4, specialists: {cozinha: 2, gestao: 1}}}
  };
  const EVENTS = [
    {id: 'safra', name: 'Boa safra', news: 'A safra acelerou cultivos em 25%.', production: 1.25},
    {id: 'rotas', name: 'Rotas livres', news: 'Delivery 20% mais rápido e novos despachos pagam +15%.', deliverySpeed: 1.2, deliveryPay: 1.15},
    {id: 'festival', name: 'Festival gastronômico', news: 'Demanda +20% e novos despachos pagam +10%.', demand: 1.2, deliveryPay: 1.1},
    {id: 'insumos', name: 'Feira de insumos', news: 'Novos ciclos de produção custam 20% menos.', productionCost: .8}
  ];
  const LIMITS = {producer: 3, automation: 3, autoCreditsPerLevel: 8, automationCreditCost: 1, storage: 4, inventoryBase: 80, inventoryStep: 40, courierSpeed: 4, courierCapacity: 2, contracts: 2, steps: MAX_STEPS, offlineBaseHours: 8, offlineStepHours: 2, offlineLevel: 4};
  const defs = freeze({ingredients: INGREDIENTS, workers: WORKERS, recipes: RECIPES, events: EVENTS, limits: LIMITS, boardMs: BOARD_MS, eventMs: EVENT_MS});
  const result = (fields = {}) => Object.assign({ok: true, messages: [], moneyDelta: 0}, fields);
  const fail = (code, message) => result({ok: false, code, messages: [message]});
  const timestamp = (ctx, now) => now === undefined ? (ctx && ctx.now !== undefined ? ctx.now : Date.now()) : now;
  const validTime = t => valid(t) && t <= MAX_TIME;
  function validate(S, now, ctx) {
    if (!object(S) || !valid(S.money)) return fail('money', 'Saldo inválido.');
    if (!validTime(now)) return fail('time', 'Horário inválido.');
    if (ctx !== undefined && !object(ctx)) return fail('context', 'Contexto inválido.');
    for (const k of ['cur', 'scale', 'owned', 'rate', 'rep', 'staffCount', 'now']) {
      if (ctx && ctx[k] !== undefined && !valid(ctx[k])) return fail('context', 'Contexto inválido: ' + k + '.');
    }
    for (const k of ['cur', 'owned', 'staffCount']) {
      if (ctx && ctx[k] !== undefined && !Number.isSafeInteger(ctx[k])) return fail('context', 'Contagem inválida: ' + k + '.');
    }
    if (ctx && ((ctx.scale !== undefined && ctx.scale === 0) || (ctx.owned !== undefined && ctx.owned < 1) || (ctx.cur || 0) >= (ctx.owned === undefined ? 1 : ctx.owned))) return fail('context', 'Restaurante inválido.');
    if (ctx && ctx.specialists !== undefined) {
      const s = ctx.specialists;
      if (!object(s) && !Array.isArray(s)) return fail('context', 'Especializações inválidas.');
      if (!Array.isArray(s) && Object.values(s).some(n => !Number.isSafeInteger(n) || n < 0)) return fail('context', 'Especializações inválidas.');
    }
    if (ctx && ctx.layout !== undefined) {
      if (!object(ctx.layout)) return fail('context', 'Layout inválido.');
      const resources = ctx.layout.resources;
      if (resources !== undefined && !object(resources)) return fail('context', 'Recursos do layout inválidos.');
      if (resources && resources.productionScale !== undefined && (!valid(resources.productionScale) || resources.productionScale === 0)) return fail('context', 'Escala de produção inválida.');
    }
    return null;
  }
  function context(ctx = {}) {
    const specialists = {cozinha: 0, salao: 0, gestao: 0, limpeza: 0};
    if (Array.isArray(ctx.specialists)) ctx.specialists.forEach(s => { const k = typeof s === 'string' ? s : s && s.spec; if (own(specialists, k)) specialists[k]++; });
    else if (object(ctx.specialists)) Object.keys(specialists).forEach(k => { specialists[k] = integer(ctx.specialists[k], 0, 10000); });
    const productionScale = Math.max(1, bounded(ctx.layout && ctx.layout.resources ? ctx.layout.resources.productionScale : ctx.productionScale, 1, 1.1));
    return {cur: integer(ctx.cur, 0, 1000000), scale: bounded(ctx.scale, 1, 1e9), owned: integer(ctx.owned, 1, 1000000), rate: bounded(ctx.rate, 0, 1e9), rep: bounded(ctx.rep, 3, 5), staffCount: integer(ctx.staffCount, 0, 10000), specialists, productionScale};
  }
  const amounts = (a, multiplier = 1) => Object.fromEntries(Object.entries(a).map(([k, n]) => [k, n * multiplier]));
  function quantities(q) {
    return object(q) && Object.keys(q).length > 0 && Object.entries(q).every(([k, n]) => own(INGREDIENTS, k) && Number.isSafeInteger(n) && n > 0 && n <= 1000);
  }
  function normalize(raw, now) {
    const e = object(raw) ? raw : {};
    const savedHighwater = validTime(e.highwater) ? e.highwater : validTime(e.lastSync) ? e.lastSync : now;
    const highwater = Math.max(savedHighwater, bounded(e.lastSync, 0, MAX_TIME));
    const s = {version: 1, highwater, lastSync: highwater, time: bounded(e.time, highwater, highwater), storage: integer(e.storage, 0, LIMITS.storage), inventory: {}, producers: {}, book: {}, active: null, research: null, courier: {speed: integer(e.courier && e.courier.speed, 0, LIMITS.courierSpeed), capacity: integer(e.courier && e.courier.capacity, 0, LIMITS.courierCapacity)}, deliveries: [], contracts: [], board: null};
    s.stats = {harvests: integer(e.stats && e.stats.harvests, 0, 1e12), produced: integer(e.stats && e.stats.produced, 0, 1e12)};
    const cap = capacity(s);
    KEYS.forEach(k => {
      s.inventory[k] = integer(e.inventory && e.inventory[k], 0, cap);
      const p = object(e.producers && e.producers[k]) ? e.producers[k] : {};
      const level = integer(p.level, k === 'alface' ? 1 : 0, LIMITS.producer), auto = integer(p.auto, 0, LIMITS.automation);
      const job = p.job;
      s.producers[k] = {level, auto, credits: integer(p.credits, 0, auto * LIMITS.autoCreditsPerLevel), job: job && level && validTime(job.finish) && validTime(job.start) && job.finish >= job.start && Number.isSafeInteger(job.qty) && job.qty > 0 && job.qty <= 100 ? {start: job.start, finish: job.finish, qty: job.qty, ready: !!job.ready, automatic: !!job.automatic, boosted: !!job.boosted} : null};
      s.producers[k].worker = level && object(p.worker) && typeof p.worker.specialist === 'boolean' ? {name: WORKERS[k].name, specialist: p.worker.specialist, fraction: p.worker.specialist ? Math.floor(bounded(p.worker.fraction, 0, .75) * 4) / 4 : 0} : null;
    });
    Object.keys(RECIPES).forEach(k => { if (e.book && e.book[k] === true) s.book[k] = true; });
    if (typeof e.active === 'string' && own(s.book, e.active)) s.active = e.active;
    if (e.research && own(RECIPES, e.research.id) && !s.book[e.research.id] && validTime(e.research.finish) && validTime(e.research.start) && e.research.finish >= e.research.start) s.research = {id: e.research.id, start: e.research.start, finish: e.research.finish, boosted: !!e.research.boosted};
    if (Array.isArray(e.deliveries)) e.deliveries.slice(0, 3).forEach(d => {
      if (d && typeof d.id === 'string' && /^d:\d+:\d$/.test(d.id) && validTime(d.finish) && validTime(d.start) && d.finish >= d.start && valid(d.reward) && d.reward <= MAX_TX && !s.deliveries.some(x => x.id === d.id)) s.deliveries.push({id: d.id, start: d.start, finish: d.finish, reward: d.reward, status: d.status === 'ready' ? 'ready' : 'travelling', boosted: !!d.boosted});
    });
    if (Array.isArray(e.contracts)) e.contracts.slice(0, LIMITS.contracts).forEach(d => {
      if (d && typeof d.id === 'string' && /^c:\d+:\d$/.test(d.id) && quantities(d.goods) && validTime(d.deadline) && valid(d.reward) && d.reward <= MAX_TX && !s.contracts.some(x => x.id === d.id)) {
        const delivered = Object.fromEntries(Object.entries(d.goods).map(([k, n]) => [k, integer(d.delivered && d.delivered[k], 0, n)]));
        s.contracts.push({id: d.id, name: String(d.name || 'Contrato').slice(0, 80), goods: copy(d.goods), delivered, deadline: d.deadline, reward: d.reward});
      }
    });
    if (e.board && Number.isSafeInteger(e.board.slot) && e.board.slot >= 0 && object(e.board.ctx)) {
      const c = context(e.board.ctx);
      s.board = makeBoard(e.board.slot, c);
      s.board.used = Object.fromEntries(Object.keys(object(e.board.used) ? e.board.used : {}).filter(id => s.board.delivery.some(d => d.id === id) || s.board.commercial.some(d => d.id === id)).map(id => [id, true]));
    }
    return s;
  }
  const capacity = e => LIMITS.inventoryBase + LIMITS.inventoryStep * e.storage;
  const price = (n, c) => Math.min(MAX_TX, Math.max(1, Math.round(n * c.scale)));
  function cash(S, delta) {
    const next = S.money + delta;
    if (!valid(S.money) || !Number.isFinite(delta) || !valid(next) || (delta !== 0 && next === S.money)) return false;
    S.money = next; return true;
  }
  const hasStock = (e, goods) => Object.entries(goods).every(([k, n]) => e.inventory[k] >= n);
  const take = (e, goods) => Object.entries(goods).forEach(([k, n]) => { e.inventory[k] -= n; });
  function requirements(req, c) {
    const missing = [];
    if (c.owned < (req.owned || 0)) missing.push(req.owned + ' restaurantes');
    if (c.rep < (req.rep || 0)) missing.push('reputação ' + req.rep);
    if (c.staffCount < (req.staffCount || 0)) missing.push(req.staffCount + ' funcionários');
    Object.entries(req.specialists || {}).forEach(([k, n]) => { if (c.specialists[k] < n) missing.push(n + ' em ' + k); });
    return missing;
  }
  function eventAt(time) {
    const slot = Math.floor(time / EVENT_MS), start = slot * EVENT_MS;
    if (time - start >= 9 * 60000) return {id: 'calma', name: 'Operação normal', news: 'Novas notícias na próxima janela.', start, end: start + EVENT_MS, active: false};
    return Object.assign({start, end: start + 9 * 60000, active: true}, EVENTS[slot % EVENTS.length]);
  }
  function effects(e) {
    const event = eventAt(e.time);
    return {price: Object.keys(e.book).reduce((n, k) => n + RECIPES[k].permanent, 0), demand: event.demand || 1, production: event.production || 1, productionCost: event.productionCost || 1, deliverySpeed: (1 + e.courier.speed * .25) * (event.deliverySpeed || 1), deliveryPay: event.deliveryPay || 1, recipe: e.active, event};
  }
  const hash = str => { let n = 2166136261; for (let i = 0; i < str.length; i++) n = Math.imul(n ^ str.charCodeAt(i), 16777619); return n >>> 0; };
  function makeBoard(slot, c) {
    const start = slot * BOARD_MS;
    const board = {slot, ctx: copy(c), used: {}, delivery: [], commercial: []};
    for (let i = 0; i < 3; i++) {
      const h = hash('delivery:' + slot + ':' + i), k = KEYS[h % (c.owned >= 2 ? 7 : 6)];
      const goods = {[k]: 3 + (h >>> 5) % 9};
      const fee = price(8 + i * 3, c), value = Object.entries(goods).reduce((n, [key, q]) => n + INGREDIENTS[key].value * q, 0);
      board.delivery.push({id: 'd:' + slot + ':' + i, name: ['Almoço do bairro', 'Lanche no escritório', 'Pedido da praça'][i], goods, quantity: Object.values(goods).reduce((a, n) => a + n, 0), fee, reward: price((value + 8) * 1.65 * (1 + c.rep * .04) + Math.min(c.rate, 10000) * .03, c), duration: 90000 + (h >>> 12) % 90000, dispatchBy: start + BOARD_MS, deadline: start + BOARD_MS + 180000});
    }
    for (let i = 0; i < 2; i++) {
      const h = hash('commercial:' + slot + ':' + i), k = i ? 'queijo' : 'tomate';
      const goods = {[k]: 12 + h % 9, trigo: 8 + (h >>> 5) % 7};
      const value = Object.entries(goods).reduce((n, [key, q]) => n + INGREDIENTS[key].value * q, 0);
      board.commercial.push({id: 'c:' + slot + ':' + i, name: i ? 'Buffet da cidade' : 'Cantina parceira', goods, fee: price(12 + 8 * i, c), reward: price(value * 2, c), duration: (6 + 4 * i) * 60000, acceptBy: start + BOARD_MS, req: i ? {owned: 2, rep: 3, staffCount: 2, specialists: {cozinha: 1, salao: 1}} : {staffCount: 1, specialists: {gestao: 1}}});
    }
    return board;
  }
  function ensureBoard(e, c) {
    const slot = Math.floor(e.time / BOARD_MS);
    if (!e.board || e.board.slot !== slot) e.board = makeBoard(slot, c);
  }
  function production(e, k, c) {
    const d = INGREDIENTS[k], p = e.producers[k], b = effects(e);
    const baseQty = d.yield * p.level, extra = p.worker && p.worker.specialist ? baseQty / 4 + p.worker.fraction : 0;
    return {cost: price(d.cost * p.level * b.productionCost, c), baseQty, qty: baseQty + Math.floor(extra), workerFraction: extra % 1, inputs: amounts(d.inputs, p.level), duration: Math.ceil(d.ms / ((d.type === 'cultivo' ? b.production : 1) * c.productionScale))};
  }
  function startProduction(S, e, k, c, automatic) {
    const p = e.producers[k], req = requirements(INGREDIENTS[k].req || {}, c);
    if (!p.level || p.job || req.length || (automatic && !p.worker && (!p.auto || !p.credits))) return false;
    const spec = production(e, k, c), credit = automatic && p.credits > 0;
    const wage = p.worker && !credit ? price(WORKERS[k].wage, c) : 0;
    if (e.inventory[k] + spec.qty > capacity(e) || !hasStock(e, spec.inputs) || !cash(S, -(spec.cost + wage))) return false;
    take(e, spec.inputs);
    if (credit) p.credits--;
    if (p.worker) p.worker.fraction = spec.workerFraction;
    p.job = {start: e.time, finish: e.time + spec.duration, qty: spec.qty, automatic, ready: false, boosted: false};
    return true;
  }
  function collect(e, k) {
    const p = e.producers[k], job = p.job;
    if (!job || !job.ready || e.inventory[k] + job.qty > capacity(e)) return 0;
    e.inventory[k] += job.qty;
    e.stats.harvests = Math.min(1e12, e.stats.harvests + 1); e.stats.produced = Math.min(1e12, e.stats.produced + job.qty);
    p.job = null; return job.qty;
  }
  function pump(S, e, c, out) {
    KEYS.forEach(k => {
      if (e.producers[k].worker) {
        const qty = collect(e, k);
        if (qty && out) out.harvested[k] = (out.harvested[k] || 0) + qty;
      }
      startProduction(S, e, k, c, true);
    });
  }
  function penalty(S, contract) {
    const total = Object.values(contract.goods).reduce((a, n) => a + n, 0);
    const missing = Object.entries(contract.goods).reduce((a, [k, n]) => a + n - contract.delivered[k], 0);
    const amount = Math.floor(Math.min(S.money * .1, contract.reward * .2 * missing / total));
    return cash(S, -amount) ? amount : 0;
  }
  function settle(S, e, c, now) {
    const before = S.money, elapsedMs = Math.max(0, now - e.highwater);
    const capMs = (8 + 2 * integer(S.offLv, 0, 4)) * HOUR;
    const appliedMs = Math.min(elapsedMs, capMs), end = e.time + appliedMs;
    const out = result({elapsedMs, appliedMs, offlineMs: appliedMs, discardedMs: elapsedMs - appliedMs, offline: {elapsedMs, appliedMs, discardedMs: elapsedMs - appliedMs, capMs}, clockBack: now < e.highwater, cycles: 0, harvested: {}, penalties: 0, completed: [], highwater: Math.max(e.highwater, now), lastSync: Math.max(e.highwater, now)});
    if (appliedMs > 0) {
      pump(S, e, c, out);
      for (let step = 0; step < MAX_STEPS; step++) {
        let next = Infinity;
        KEYS.forEach(k => { const j = e.producers[k].job; if (j && !j.ready) next = Math.min(next, Math.max(e.time, j.finish)); });
        if (e.research) next = Math.min(next, Math.max(e.time, e.research.finish));
        e.deliveries.forEach(d => { if (d.status === 'travelling') next = Math.min(next, Math.max(e.time, d.finish)); });
        e.contracts.forEach(d => { next = Math.min(next, Math.max(e.time, d.deadline)); });
        if (next > end) break;
        e.time = next;
        KEYS.forEach(k => {
          const p = e.producers[k], j = p.job;
          if (j && !j.ready && j.finish <= e.time) { j.ready = true; out.cycles++; }
          if (p.job && p.job.ready && (p.job.automatic || p.worker)) { const qty = collect(e, k); if (qty) out.harvested[k] = (out.harvested[k] || 0) + qty; }
        });
        if (e.research && e.research.finish <= e.time) { const id = e.research.id; e.book[id] = true; e.research = null; out.completed.push(id); out.messages.push('Pesquisa concluída: ' + RECIPES[id].name + '.'); }
        e.deliveries.forEach(d => { if (d.status === 'travelling' && d.finish <= e.time) { d.status = 'ready'; out.completed.push(d.id); out.messages.push('Delivery concluído. Resgate o pagamento.'); } });
        e.contracts = e.contracts.filter(d => { if (d.deadline > e.time) return true; const paid = penalty(S, d); out.penalties += paid; out.messages.push(d.name + ' expirou. Multa: ' + paid + '.'); return false; });
        pump(S, e, c, out);
      }
      e.time = end;
    }
    e.highwater = out.highwater; e.lastSync = out.lastSync;
    ensureBoard(e, c);
    out.moneyDelta = S.money - before;
    return out;
  }
  function init(S, now = Date.now()) {
    const error = validate(S, now);
    if (error) return error;
    const initialized = !object(S.enterprise);
    S.enterprise = normalize(S.enterprise, now);
    return result({initialized, highwater: S.enterprise.highwater, lastSync: S.enterprise.lastSync});
  }
  function sync(S, ctx = {}, now) {
    now = timestamp(ctx, now);
    const error = validate(S, now, ctx);
    if (error) return error;
    const draft = {money: S.money, offLv: S.offLv, enterprise: normalize(S.enterprise, now)};
    const out = settle(draft, draft.enterprise, context(ctx), now);
    S.enterprise = draft.enterprise; S.money = draft.money;
    return out;
  }
  const ACTIONS = ['build', 'upgrade', 'plant', 'harvest', 'auto-upgrade', 'automate', 'hire-worker', 'specialist', 'storage', 'research', 'activate', 'dispatch', 'claim', 'courier-speed', 'courier-capacity', 'accept', 'fulfill', 'cancel', 'boost-research', 'boost-delivery', 'boost-production'];
  function operation(S, kind, id, c) {
    const e = S.enterprise, p = e.producers[id], d = INGREDIENTS[id];
    const reject = (code, text) => fail(code, text);
    const pay = amount => cash(S, -amount);
    const done = text => result({messages: [text]});
    if (kind === 'hire-worker' || kind === 'specialist') {
      if (!own(INGREDIENTS, id)) return reject('id', 'Ingrediente inválido.');
      if (!p.level) return reject('locked', 'Construa esta produção antes de contratar.');
      const missing = requirements(d.req || {}, c);
      if (missing.length) return reject('requirements', 'Requer ' + missing.join(', ') + '.');
      if (kind === 'hire-worker') {
        if (p.worker) return reject('claimed', 'Esta produção já tem um trabalhador.');
        if (!pay(price(WORKERS[id].hire, c))) return reject('funds', 'Faltam moedas para contratar.');
        p.worker = {name: WORKERS[id].name, specialist: false, fraction: 0};
        return done(p.worker.name + ' contratado: colhe e replanta automaticamente com moedas do jogo.');
      }
      if (!p.worker) return reject('locked', 'Contrate um operador antes de especializar.');
      if (p.worker.specialist) return reject('claimed', 'Este trabalhador já é especialista.');
      if (!pay(price(WORKERS[id].specialist, c))) return reject('funds', 'Faltam moedas para especializar.');
      p.worker.specialist = true;
      return done(p.worker.name + ' agora é especialista: +25% de rendimento nos novos ciclos, com frações acumuladas.');
    }
    if (['build', 'upgrade', 'plant', 'harvest', 'auto-upgrade', 'automate'].includes(kind)) {
      if (!own(INGREDIENTS, id)) return reject('id', 'Ingrediente inválido.');
      const missing = requirements(d.req || {}, c);
      if (missing.length && kind !== 'harvest') return reject('requirements', 'Requer ' + missing.join(', ') + '.');
      if (kind === 'build' || kind === 'upgrade') {
        if ((kind === 'build' && p.level) || (kind === 'upgrade' && !p.level) || p.level >= LIMITS.producer) return reject('level', 'Construção indisponível neste nível.');
        if (p.job) return reject('busy', 'Colha o ciclo atual antes de melhorar.');
        const cost = price((d.build || 60) * (p.level ? Math.pow(2, p.level) : 1), c);
        if (!pay(cost)) return reject('funds', 'Saldo insuficiente.');
        p.level++; return done(d.name + ': produção nível ' + p.level + '.');
      }
      if (!p.level) return reject('locked', 'Construa esta produção primeiro.');
      if (kind === 'plant') {
        if (p.job) return reject('busy', 'Já existe um ciclo em andamento ou pronto.');
        if (!startProduction(S, e, id, c, false)) return reject('resources', 'Faltam saldo, insumos ou espaço para o ciclo.');
        return done('Produção iniciada: ' + d.name + '.');
      }
      if (kind === 'harvest') {
        if (!p.job || !p.job.ready) return reject('cooldown', 'A produção ainda não está pronta.');
        const qty = collect(e, id);
        return qty ? done('Colhido: ' + qty + ' de ' + d.name + '.') : reject('capacity', 'Estoque cheio. Use os ingredientes antes de colher.');
      }
      if (kind === 'auto-upgrade') {
        if (p.auto >= LIMITS.automation) return reject('level', 'Automação no máximo.');
        if (!pay(price(100 * Math.pow(2, p.auto), c))) return reject('funds', 'Saldo insuficiente.');
        p.auto++; return done('Automação nível ' + p.auto + '. Compre ciclos para operar.');
      }
      if (!p.auto) return reject('locked', 'Instale a automação primeiro.');
      const credits = Math.min(4 * p.auto, LIMITS.autoCreditsPerLevel * p.auto - p.credits);
      if (credits <= 0) return reject('capacity', 'Fila de automação cheia.');
      if (!pay(price(LIMITS.automationCreditCost * credits, c))) return reject('funds', 'Saldo insuficiente.');
      p.credits += credits;
      return done('Automação abastecida com ' + credits + ' ciclos pagos.');
    }
    if (kind === 'storage') {
      if (id !== 'inventory') return reject('id', 'Estoque inválido.');
      if (e.storage >= LIMITS.storage) return reject('level', 'Estoque no máximo.');
      if (!pay(price(200 * Math.pow(2, e.storage), c))) return reject('funds', 'Saldo insuficiente.');
      e.storage++; return done('Capacidade: ' + capacity(e) + ' por ingrediente.');
    }
    if (kind === 'research' || kind === 'activate') {
      if (kind === 'activate' && id === 'none') { e.active = null; return done('Receita especial desativada.'); }
      if (!own(RECIPES, id)) return reject('id', 'Receita inválida.');
      const recipe = RECIPES[id];
      if (kind === 'activate') {
        if (!e.book[id]) return reject('locked', 'Pesquise esta receita primeiro.');
        e.active = id; return done('Receita ativa: ' + recipe.name + '.');
      }
      if (e.book[id]) return reject('claimed', 'Receita já está no livro permanente.');
      if (e.research) return reject('busy', 'Já existe uma pesquisa em andamento.');
      const missing = requirements(recipe.req, c);
      if (missing.length) return reject('requirements', 'Requer ' + missing.join(', ') + '.');
      if (!hasStock(e, recipe.research)) return reject('resources', 'Faltam ingredientes para pesquisar.');
      if (!pay(price(recipe.cost, c))) return reject('funds', 'Saldo insuficiente.');
      take(e, recipe.research); e.research = {id, start: e.time, finish: e.time + recipe.ms, boosted: false};
      return done('Pesquisa iniciada: ' + recipe.name + '.');
    }
    if (kind === 'boost-research' || kind === 'boost-delivery' || kind === 'boost-production') {
      const job = kind === 'boost-production' ? (p && p.job && !p.job.ready ? p.job : null) : kind === 'boost-research' ? (id === 'research' ? e.research : null) : e.deliveries.find(x => x.id === id && x.status === 'travelling');
      if (!job) return reject('id', 'Produção, pesquisa ou entrega em andamento não encontrada.');
      if (job.boosted) return reject('claimed', 'Este trabalho já recebeu aceleração.');
      const cutMs = Math.min(60000, Math.max(0, job.finish - e.time) * .5);
      if (cutMs <= 0) return reject('cooldown', 'Este trabalho já terminou.');
      job.finish -= cutMs; job.boosted = true;
      return Object.assign(done('Tempo reduzido em ' + Math.ceil(cutMs / 1000) + ' segundos.'), {cutMs});
    }
    if (kind === 'courier-speed' || kind === 'courier-capacity') {
      if (id !== 'courier') return reject('id', 'Entregador inválido.');
      const key = kind === 'courier-speed' ? 'speed' : 'capacity', max = key === 'speed' ? LIMITS.courierSpeed : LIMITS.courierCapacity;
      if (e.courier[key] >= max) return reject('level', 'Entregador no nível máximo.');
      if (!pay(price((key === 'speed' ? 180 : 250) * Math.pow(2, e.courier[key]), c))) return reject('funds', 'Saldo insuficiente.');
      e.courier[key]++; return done(key === 'speed' ? 'Velocidade do entregador melhorada para novos despachos.' : 'Capacidade do entregador ampliada.');
    }
    if (kind === 'dispatch') {
      const offer = e.board.delivery.find(x => x.id === id);
      if (!offer) return reject('id', 'Oferta de delivery inválida ou antiga.');
      if (e.board.used[id]) return reject('claimed', 'Este pedido já foi despachado.');
      if (e.time >= offer.dispatchBy) return reject('cooldown', 'Oferta expirada.');
      if (e.deliveries.length >= 1 + e.courier.capacity || offer.quantity > 8 + e.courier.capacity * 8) return reject('capacity', 'Melhore a capacidade ou conclua as entregas atuais.');
      if (!hasStock(e, offer.goods)) return reject('resources', 'Faltam ingredientes para despachar.');
      const b = effects(e), finish = e.time + Math.ceil(offer.duration / b.deliverySpeed);
      if (finish > offer.deadline) return reject('cooldown', 'Não há tempo para chegar ao destino.');
      if (!pay(offer.fee)) return reject('funds', 'Saldo insuficiente para o frete.');
      take(e, offer.goods); e.board.used[id] = true;
      e.deliveries.push({id, start: e.time, finish, reward: Math.min(MAX_TX, Math.round(offer.reward * b.deliveryPay)), status: 'travelling', boosted: false});
      return done('Pedido despachado. O pagamento exige resgate.');
    }
    if (kind === 'claim') {
      const delivery = e.deliveries.find(x => x.id === id);
      if (!delivery) return reject('id', 'Entrega inexistente ou já resgatada.');
      if (delivery.status !== 'ready') return reject('cooldown', 'O entregador ainda está a caminho.');
      if (!cash(S, delivery.reward)) return reject('money', 'Não foi possível creditar o pagamento.');
      e.deliveries = e.deliveries.filter(x => x.id !== id);
      return done('Delivery pago: ' + delivery.reward + '.');
    }
    if (kind === 'accept') {
      const offer = e.board.commercial.find(x => x.id === id);
      if (!offer) return reject('id', 'Oferta comercial inválida ou antiga.');
      if (e.board.used[id]) return reject('claimed', 'Contrato já aceito nesta janela.');
      if (e.time >= offer.acceptBy) return reject('cooldown', 'Oferta expirada.');
      const missing = requirements(offer.req, c);
      if (missing.length) return reject('requirements', 'Requer ' + missing.join(', ') + '.');
      if (e.contracts.length >= LIMITS.contracts) return reject('capacity', 'Conclua um dos contratos ativos.');
      if (!pay(offer.fee)) return reject('funds', 'Saldo insuficiente para a reserva.');
      e.board.used[id] = true;
      e.contracts.push({id, name: offer.name, goods: copy(offer.goods), delivered: Object.fromEntries(Object.keys(offer.goods).map(k => [k, 0])), deadline: e.time + offer.duration, reward: offer.reward});
      return done('Contrato aceito. Entregue antes do prazo para evitar multa.');
    }
    const contract = e.contracts.find(x => x.id === id);
    if (!contract) return reject('id', 'Contrato inexistente ou já concluído.');
    if (kind === 'cancel') {
      const amount = penalty(S, contract); e.contracts = e.contracts.filter(x => x.id !== id);
      return done('Contrato cancelado. Multa: ' + amount + '.');
    }
    let delivered = 0;
    Object.entries(contract.goods).forEach(([k, n]) => { const qty = Math.min(e.inventory[k], n - contract.delivered[k]); e.inventory[k] -= qty; contract.delivered[k] += qty; delivered += qty; });
    if (!delivered) return reject('resources', 'Faltam ingredientes pendentes do contrato.');
    if (Object.entries(contract.goods).every(([k, n]) => contract.delivered[k] === n)) {
      if (!cash(S, contract.reward)) return reject('money', 'Não foi possível creditar o contrato.');
      e.contracts = e.contracts.filter(x => x.id !== id);
      return done('Contrato concluído e pago: ' + contract.reward + '.');
    }
    return done('Entrega parcial registrada: ' + delivered + ' ingredientes.');
  }
  function act(S, kind, id, ctx = {}, now) {
    now = timestamp(ctx, now);
    const error = validate(S, now, ctx);
    if (error) return error;
    if (typeof kind !== 'string' || !ACTIONS.includes(kind) || typeof id !== 'string' || !id.length || id.length > 80) return fail('id', 'Ação ou identificador inválido.');
    const validId = ['build', 'upgrade', 'plant', 'harvest', 'auto-upgrade', 'automate', 'boost-production', 'hire-worker', 'specialist'].includes(kind) ? own(INGREDIENTS, id)
      : ['research', 'activate'].includes(kind) ? own(RECIPES, id) || (kind === 'activate' && id === 'none')
      : kind === 'storage' ? id === 'inventory'
      : kind === 'boost-research' ? id === 'research'
      : kind === 'courier-speed' || kind === 'courier-capacity' ? id === 'courier'
      : ['dispatch', 'claim', 'boost-delivery'].includes(kind) ? /^d:\d+:[0-2]$/.test(id) : /^c:\d+:[0-1]$/.test(id);
    if (!validId) return fail('id', 'Identificador inválido para esta ação.');
    const settled = sync(S, ctx, now);
    if (!settled.ok) return settled;
    if (settled.clockBack) return Object.assign(settled, {ok: false, code: 'clock', messages: ['Relógio anterior ao último horário salvo.']});
    const draft = {money: S.money, enterprise: copy(S.enterprise)}, c = context(ctx), before = S.money;
    const out = operation(draft, kind, id, c);
    if (out.ok) { pump(draft, draft.enterprise, c); S.enterprise = draft.enterprise; S.money = draft.money; }
    out.messages = settled.messages.concat(out.messages);
    out.moneyDelta = settled.moneyDelta + S.money - before;
    out.highwater = S.enterprise.highwater; out.lastSync = S.enterprise.lastSync;
    return out;
  }
  function bonuses(S, ctx = {}) {
    const error = validate(S, timestamp(ctx), ctx);
    if (error) return Object.assign(error, {price: 0, demand: 1, production: 1, productionCost: 1, deliverySpeed: 1, deliveryPay: 1, recipe: null});
    return Object.assign(result(), effects(normalize(S.enterprise, timestamp(ctx))));
  }
  function prestige(S, now = Date.now()) {
    const error = validate(S, now);
    if (error) return error;
    const previous = normalize(S.enterprise, now);
    if (now < previous.highwater) return fail('clock', 'Relógio anterior ao último horário salvo.');
    const next = normalize(null, now);
    next.book = copy(previous.book); next.active = previous.active; next.stats = copy(previous.stats);
    S.enterprise = next;
    return result({messages: ['Operação reiniciada. Livro de receitas preservado.'], highwater: now, lastSync: now, preservedRecipes: Object.keys(next.book)});
  }
  function serve(S, info = {}, ctx = {}, now) {
    const base = {bonus: 1, multiplier: 1, mult: 1, extra: 0, consumed: false, recipe: null, count: 0};
    now = timestamp(ctx, now);
    const error = validate(S, now, ctx);
    if (error) return Object.assign(error, base);
    const count = info && info.count !== undefined ? info.count : info && info.items !== undefined ? info.items : 1;
    if (!object(info) || !Number.isSafeInteger(count) || count < 1 || count > 100) return Object.assign(fail('count', 'Quantidade de pedidos inválida.'), base);
    const settled = sync(S, ctx, now);
    if (settled.clockBack) return Object.assign(settled, base, {ok: false, code: 'clock', messages: ['Relógio anterior ao último horário salvo.']});
    const e = S.enterprise, b = effects(e), recipe = e.active && RECIPES[e.active];
    const goods = recipe && amounts(recipe.ingredients, count);
    const consumed = !!(goods && hasStock(e, goods));
    if (consumed) take(e, goods);
    const bonus = 1 + b.price + (consumed ? recipe.bonus : 0);
    return Object.assign(settled, {bonus, multiplier: bonus, mult: bonus, extra: bonus - 1, consumed, recipe: e.active, count});
  }
  function snapshot(S, ctx = {}, now) {
    now = timestamp(ctx, now);
    const error = validate(S, now, ctx);
    if (error) return error;
    const e = normalize(S.enterprise, now), c = context(ctx);
    ensureBoard(e, c);
    const b = effects(e), cap = capacity(e), money = S.money;
    const producers = KEYS.map(id => {
      const p = e.producers[id], d = INGREDIENTS[id], spec = production(e, id, c), missing = requirements(d.req || {}, c);
      const workerWage = price(WORKERS[id].wage, c), nextCost = spec.cost + (p.worker && !p.credits ? workerWage : 0), manualCost = spec.cost + (p.worker ? workerWage : 0);
      const hireCost = price(WORKERS[id].hire, c), specialistCost = price(WORKERS[id].specialist, c);
      const workerStatus = !p.worker ? 'Sem trabalhador' : p.job ? p.job.ready ? 'Colheita pronta; aguardando espaço' : 'Produzindo e colhendo automaticamente' : missing.length ? 'Aguardando requisitos da produção' : e.inventory[id] + spec.qty > cap ? 'Parado: estoque sem espaço' : !hasStock(e, spec.inputs) ? 'Parado: faltam insumos' : money < nextCost ? 'Parado: faltam moedas' : 'Pronto para o próximo ciclo';
      return Object.assign({id, name: d.name, icon: d.icon, type: d.type, inventory: e.inventory[id], capacity: cap, missing, buildCost: price(d.build || 60, c), upgradeCost: price((d.build || 60) * Math.pow(2, p.level), c), autoCost: price(100 * Math.pow(2, p.auto), c), creditCost: price(LIMITS.automationCreditCost * Math.min(4 * p.auto, p.auto * 8 - p.credits), c), creditPack: Math.min(4 * p.auto, p.auto * 8 - p.credits), creditCapacity: p.auto * 8, workerName: WORKERS[id].name, workerIcon: WORKERS[id].icon, workerDescription: WORKERS[id].description, workerStatus, workerWage, nextCost, manualCost, hireCost, specialistCost, specialistAverage: spec.baseQty * 1.25, canHire: !!p.level && !p.worker && !missing.length && money >= hireCost, canSpecialist: !!p.worker && !p.worker.specialist && !missing.length && money >= specialistCost, canPlant: !!p.level && !p.job && !missing.length && money >= manualCost && hasStock(e, spec.inputs) && e.inventory[id] + spec.qty <= cap}, copy(p), spec, {remainingMs: p.job ? Math.max(0, p.job.finish - e.time) : 0});
    });
    const recipes = Object.entries(RECIPES).map(([id, d]) => Object.assign({id}, copy(d), {cost: price(d.cost, c), unlocked: !!e.book[id], active: e.active === id, missing: requirements(d.req, c), canResearch: !e.book[id] && !e.research && !requirements(d.req, c).length && money >= price(d.cost, c) && hasStock(e, d.research)}));
    const delivery = e.board.delivery.map(d => Object.assign({}, copy(d), {used: !!e.board.used[d.id], reward: Math.min(MAX_TX, Math.round(d.reward * b.deliveryPay)), duration: Math.ceil(d.duration / b.deliverySpeed), canDispatch: !e.board.used[d.id] && e.time < d.dispatchBy && e.time + Math.ceil(d.duration / b.deliverySpeed) <= d.deadline && hasStock(e, d.goods) && money >= d.fee && e.deliveries.length < 1 + e.courier.capacity && d.quantity <= 8 + e.courier.capacity * 8}));
    const commercial = e.board.commercial.map(d => Object.assign({}, copy(d), {used: !!e.board.used[d.id], missing: requirements(d.req, c), canAccept: !e.board.used[d.id] && e.time < d.acceptBy && !requirements(d.req, c).length && e.contracts.length < LIMITS.contracts && money >= d.fee}));
    return result({version: 1, money, time: e.time, highwater: e.highwater, lastSync: e.lastSync, pendingMs: Math.max(0, now - e.highwater), offlineCapMs: (8 + 2 * integer(S.offLv, 0, 4)) * HOUR, offline: {pendingMs: Math.max(0, now - e.highwater), capMs: (8 + 2 * integer(S.offLv, 0, 4)) * HOUR}, inventory: copy(e.inventory), capacity: cap, stats: copy(e.stats), storage: e.storage, storageCost: price(200 * Math.pow(2, e.storage), c), producers, recipes, book: copy(e.book), active: e.active, research: copy(e.research), courier: Object.assign({}, e.courier, {slots: 1 + e.courier.capacity, load: 8 + 8 * e.courier.capacity, speedCost: price(180 * Math.pow(2, e.courier.speed), c), capacityCost: price(250 * Math.pow(2, e.courier.capacity), c)}), delivery, deliveries: copy(e.deliveries), commercial, contracts: copy(e.contracts), bonuses: b, news: b.event, boardExpires: (e.board.slot + 1) * BOARD_MS});
  }
  return Object.freeze({defs, init, sync, act, serve, bonuses, snapshot, prestige});
});
