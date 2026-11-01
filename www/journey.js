/* Burger Rush · Jornada local, sem DOM, rede, anúncios obrigatórios ou ranking.
 * UMD: window.Journey / globalThis.Journey / require(). Todo estado em S.journey;
 * créditos/débitos usam S.money, sem callbacks que possam pagar duas vezes.
 *
 * init(S,now), sync(S,ctx,now), record(S,event,amount,ctx,now),
 * act(S,kind,id,ctx,now), snapshot(S,ctx,now), bonuses(S,ctx).
 * ctx={cur,scale,owned,rate,rep,served,netWorth,franchises,recipes,promotions,now?}.
 * scale é multiplicador positivo; owned/recipes/promotion/franchises aceitam
 * contagem, array, Set ou mapa. sync registra máximos, NUNCA credita eventos.
 * record recebe eventos REAIS e incrementais: serve,item,vip,clean,earn,upgrade,
 * franchise,promotion,recipe,trade; spend é opcional para despesas externas.
 * earn/spend são moedas; os demais são contagens inteiras, não valor da compra.
 * Eventos devem ser emitidos uma vez pelo core (não reenviar totais em record).
 * Retorno de act: {ok,reason?,reward?,snapshot}; IDs válidos vêm do snapshot.
 * kind: start/challenge/chest/spin/rare/season/collection/buy/equip.
 * palette(S,cur) é leitura sem sync/mutação: {floor:[hexstring,hexstring]|null,
 * wall:number|null,counter:number|null,uniform:number|null}; null mantém a cena.
 * snapshot.palette mantém cores numéricas de preview. stats.session existe só
 * na sessão deste runtime; stats.last7 agrega 7 dias UTC, incluindo hoje.
 *
 * prestige: const saved=Journey.preserve(S); [reset do main];
 * Journey.restore(S,saved,now); dinheiro não é preservado. Cosmetics/coleções,
 * claims, temporada, desafios e cooldowns permanecem. Não reinicializar journey.
 *
 * SOMENTE main após AdMob earned validado (fakeads apenas dev) pode chamar
 * extraSpin(S,receipt,ctx,now) ou rewardXP(S,amount,receipt,ctx,now).
 * receipt={id:string única,earned:true,at:timestamp ms}; validade 5min, sem futuro,
 * 1 uso por id, 1 extraSpin e 1 rewardXP (até 80) por dia, saldo máximo 1 giro extra.
 * UI não oferece anúncio. Flag NÃO autentica servidor: confiança no callback
 * do main; editar save/relógio para o futuro não pode ser impedido offline.
 * Relógio regressivo congela o tempo no máximo visto; claims nunca se repetem.
 * As chances são probabilidades locais de Math.random(), sem venda de tentativas.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Journey = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DAY = 86400000, WEEK = DAY * 7, SEASON = DAY * 14, HISTORY_LIMIT = 32;
  const sessions = new WeakMap();
  const MAX = Number.MAX_SAFE_INTEGER;
  const finite = (v, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const positive = v => Math.max(0, finite(v));
  const sum = (a, b) => Math.min(MAX, positive(a) + positive(b));
  const clone = v => JSON.parse(JSON.stringify(v));
  const count = v => typeof v === 'number' ? positive(v) : Array.isArray(v) ? v.filter(x => x !== null && x !== false && x !== undefined).length : v && typeof v.size === 'number' ? v.size : v && typeof v === 'object' ? Object.values(v).filter(Boolean).length : 0;
  const scaleOf = ctx => Math.min(1e6, Math.max(.1, finite(ctx && ctx.scale, 1)));
  const storeOf = ctx => String(Math.max(0, Math.floor(finite(ctx && ctx.cur))));
  const scaled = (n, scale) => Math.max(1, Math.round(n * scale));
  const EVENTS = {serve: 4, item: 1, vip: 12, clean: 3, earn: 0, spend: 0, upgrade: 10, franchise: 40, promotion: 20, recipe: 20, trade: 0, ad: 0, staffGoal: 5, regular: 2, critic: 5, prestige: 0, delivery: 5, harvest: 1};
  const PARTICIPATION = {serve: 1, vip: 3, clean: 1};
  const CHALLENGES = [
    {id: 'serve', name: 'Balcão a todo vapor', event: 'serve', target: 12, duration: 180000, money: 90, xp: 35, icon: '🍔'},
    {id: 'vip', name: 'Um atendimento especial', event: 'vip', target: 1, duration: 300000, money: 120, xp: 40, icon: '👑'},
    {id: 'clean', name: 'Salão brilhando', event: 'clean', target: 6, duration: 180000, money: 70, xp: 30, icon: '🧽'},
  ];
  const LOOT = [
    {id: 'coins', name: 'Moedas', chance: .70, money: 80, xp: 0, rarity: 'comum'},
    {id: 'experience', name: 'Moedas + XP da temporada', chance: .25, money: 40, xp: 25, rarity: 'incomum'},
    {id: 'gold', name: 'Uniforme dourado', chance: .05, item: 'uniform-gold', money: 120, xp: 0, rarity: 'raro'},
  ];
  const COSMETICS = [
    {id: 'floor-cream', slot: 'floor', name: 'Piso de baunilha', color: 0xf1d8b5, price: 0},
    {id: 'wall-cream', slot: 'wall', name: 'Parede creme', color: 0xfff1dc, price: 0},
    {id: 'counter-wood', slot: 'counter', name: 'Balcão de madeira', color: 0x7b5137, price: 0},
    {id: 'uniform-green', slot: 'uniform', name: 'Uniforme verde', color: 0x2fbf4a, price: 0},
    {id: 'floor-mint', slot: 'floor', name: 'Piso menta', color: 0xbbe4cc, price: 180},
    {id: 'wall-peach', slot: 'wall', name: 'Parede pêssego', color: 0xffc7a8, price: 180},
    {id: 'counter-forest', slot: 'counter', name: 'Balcão floresta', color: 0x327b55, price: 240},
    {id: 'uniform-blue', slot: 'uniform', name: 'Uniforme mirtilo', color: 0x4f8ff7, price: 200},
    {id: 'uniform-gold', slot: 'uniform', name: 'Uniforme dourado', color: 0xe0a01a, source: '5% por sorteio ou 120 pontos de participação garantidos'},
    {id: 'floor-terrazzo', slot: 'floor', name: 'Piso confete', color: 0xe9d5ee, source: 'Coleção de receitas'},
    {id: 'wall-sage', slot: 'wall', name: 'Parede sálvia', color: 0x9fbf9b, source: 'Coleção de promoções'},
    {id: 'counter-cherry', slot: 'counter', name: 'Balcão cereja', color: 0xba5b64, source: 'Coleção de franquias'},
    {id: 'uniform-festival', slot: 'uniform', name: 'Uniforme festival', color: 0x8a4fd8, source: 'Coleção de eventos'},
    {id: 'wall-sun', slot: 'wall', name: 'Parede sol', color: 0xffdc8b, source: 'Temporada · 300 XP'},
    {id: 'counter-ocean', slot: 'counter', name: 'Balcão oceano', color: 0x2bb3a3, source: 'Temporada · 1.100 XP'},
    {id: 'facade-original', slot: 'facade', name: 'Fachada da casa', color: 0xd9573b, price: 0},
    {id: 'equipment-original', slot: 'equipment', name: 'Equipamentos clássicos', color: 0x9aa7b4, price: 0},
    {id: 'table-original', slot: 'table', name: 'Mesas de madeira', color: 0xc98a4b, price: 0},
    {id: 'decor-original', slot: 'decor', name: 'Flores da casa', color: 0xfff1a8, price: 0},
    {id: 'facade-ocean', slot: 'facade', name: 'Fachada azul oceano', color: 0x4f8ff7, price: 320},
    {id: 'equipment-blue', slot: 'equipment', name: 'Equipamentos azul aço', color: 0x638cbd, price: 280},
    {id: 'table-mint', slot: 'table', name: 'Mesas de pistache', color: 0x78bfa1, price: 220},
    {id: 'decor-rose', slot: 'decor', name: 'Flores de framboesa', color: 0xff7faf, price: 120},
  ];
  const DEFAULT_EQUIP = {floor: 'floor-cream', wall: 'wall-cream', counter: 'counter-wood', uniform: 'uniform-green', facade: 'facade-original', equipment: 'equipment-original', table: 'table-original', decor: 'decor-original'};
  const TRACK = [
    {id: '1', xp: 100, name: 'Boas-vindas', money: 120},
    {id: '2', xp: 300, name: 'Um raio de sol', item: 'wall-sun'},
    {id: '3', xp: 650, name: 'Caderno de receitas', collectible: 'recipe-season-house'},
    {id: '4', xp: 1100, name: 'Cozinha oceano', item: 'counter-ocean'},
    {id: '5', xp: 1800, name: 'Reserva da casa', money: 400},
    {id: '6', xp: 2800, name: 'Receita da estação', collectible: 'recipe-season-festival'},
  ];
  const COLLECTIONS = [
    {id: 'recipes', name: 'Caderno de receitas', group: 'receitas', metric: 'recipes', target: 5, item: 'floor-terrazzo', money: 120},
    {id: 'promotions', name: 'Equipe que cresce', group: 'promoções', metric: 'promotions', target: 5, item: 'wall-sage', money: 120},
    {id: 'franchises', name: 'Nossa marca no bairro', group: 'franquias', metric: 'franchises', target: 3, item: 'counter-cherry', money: 180},
    {id: 'events', name: 'Dia de festival', group: 'eventos', metric: 'participation', target: 180, item: 'uniform-festival', money: 150},
    {id: 'first-hundred', name: 'Cem sorrisos', group: 'conquistas', metric: 'serve', target: 100, money: 100},
    {id: 'sparkling', name: 'Casa impecável', group: 'conquistas', metric: 'clean', target: 50, money: 100},
    {id: 'vip-host', name: 'Anfitrião VIP', group: 'conquistas', metric: 'vip', target: 10, money: 120},
    {id: 'cash-reserve', name: 'Reserva financeira', group: 'finanças', metric: 'cash', target: 5000, money: 150},
    {id: 'net-worth', name: 'Patrimônio em construção', group: 'finanças', metric: 'netWorth', target: 50000, money: 200},
    {id: 'stores', name: 'De loja em loja', group: 'franquias', metric: 'owned', target: 3, money: 150},
  ];
  const RECIPE_ITEMS = [
    {id: 'recipe-season-house', name: 'Receita da casa', group: 'receitas', integration: 'collection-only'},
    {id: 'recipe-season-festival', name: 'Receita do festival', group: 'receitas', integration: 'collection-only'},
  ];
  function timestamp(ctx, now) { return Math.max(0, finite(now, finite(ctx && ctx.now, Date.now()))); }
  function entry(j, t, kind, id, money = 0) {
    j.stats.history.unshift({t, kind, id, money});
    j.stats.history.length = Math.min(j.stats.history.length, HISTORY_LIMIT);
  }
  function measure(S, j, delta) {
    const day = Math.floor(j.clock / DAY);
    let bucket = j.stats.days.find(x => x.day === day);
    if (!bucket) { bucket = {day, earned: 0, spent: 0, claims: 0, events: 0}; j.stats.days.push(bucket); }
    const session = sessions.get(S);
    for (const key of ['earned', 'spent', 'claims', 'events']) if (delta[key]) {
      j.stats[key] = sum(j.stats[key], delta[key]); bucket[key] = sum(bucket[key], delta[key]); session[key] = sum(session[key], delta[key]);
    }
  }
  function currentSeason(j, t) {
    const index = Math.floor((t - j.anchor) / SEASON);
    return {index, start: j.anchor + index * SEASON, end: j.anchor + (index + 1) * SEASON, xp: 0, scale: j.scale, claimed: {}};
  }
  function init(S, now = Date.now()) {
    const t = timestamp(null, now);
    if (!S || typeof S !== 'object') throw new TypeError('Journey exige o estado S');
    if (!S.journey) {
      const anchor = Math.floor(t / DAY) * DAY;
      S.journey = {v: 1, clock: t, anchor, scale: 1, totals: {}, peaks: {}, participation: 0,
        day: {index: Math.floor(t / DAY), points: 0, chest: false, challenges: {}},
        week: {index: Math.floor(t / WEEK), points: 0, chest: false},
        challenges: {}, pending: {}, items: Object.values(DEFAULT_EQUIP), equipped: {}, collections: {}, collectibles: [],
        rareClaimed: false, spin: {next: 0, extra: 0}, ads: {day: -1, spin: 0, xp: 0, receipts: []},
        stats: {earned: 0, spent: 0, claims: 0, events: 0, days: [], history: []}};
      S.journey.season = currentSeason(S.journey, t);
    }
    const j = S.journey;
    for (const id of Object.values(DEFAULT_EQUIP)) if (!j.items.includes(id)) j.items.push(id);
    j.clock = Math.max(positive(j.clock), t);
    if (!sessions.has(S)) sessions.set(S, {started: j.clock, earned: 0, spent: 0, claims: 0, events: 0});
    j.stats.days = (j.stats.days || []).filter(d => d.day >= Math.floor(j.clock / DAY) - 6);
    const day = Math.floor(j.clock / DAY), week = Math.floor(j.clock / WEEK);
    if (j.day.index !== day) j.day = {index: day, points: 0, chest: false, challenges: {}};
    if (j.week.index !== week) j.week = {index: week, points: 0, chest: false};
    if (j.ads.day !== day) { j.ads.day = day; j.ads.spin = 0; j.ads.xp = 0; }
    j.ads.receipts = j.ads.receipts.filter(r => j.clock - r.at <= 300000);
    if (j.clock >= j.season.end) {
      for (const step of TRACK) if (j.season.xp >= step.xp && !j.season.claimed[step.id]) {
        const id = `${j.season.index}:${step.id}`;
        j.pending[id] = {...clone(step), id, scale: j.season.scale, season: j.season.index};
      }
      j.season = currentSeason(j, j.clock);
      entry(j, j.clock, 'season', String(j.season.index));
    }
    return j;
  }
  function sync(S, ctx = {}, now) {
    const j = init(S, timestamp(ctx, now));
    j.scale = scaleOf(ctx);
    if (!j.season.xp && !Object.keys(j.season.claimed).length) j.season.scale = j.scale;
    const p = j.peaks, totals = j.totals;
    for (const key of ['owned', 'recipes', 'promotions', 'franchises']) p[key] = Math.max(positive(p[key]), count(ctx[key]), positive(totals[{recipes: 'recipe', promotions: 'promotion', franchises: 'franchise'}[key]]));
    p.cash = Math.max(positive(p.cash), positive(S.money));
    p.netWorth = Math.max(positive(p.netWorth), positive(ctx.netWorth));
    p.rep = Math.max(positive(p.rep), positive(ctx.rep));
    p.serve = Math.max(positive(p.serve), positive(ctx.served), positive(totals.serve));
    return j;
  }
  function record(S, event, amount = 1, ctx = {}, now) {
    const j = sync(S, ctx, now);
    if (!Object.hasOwn(EVENTS, event) || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX) return {ok: false, reason: 'invalid-event'};
    const n = event === 'earn' || event === 'spend' ? amount : Math.floor(amount);
    if (!n) return {ok: false, reason: 'invalid-event'};
    j.totals[event] = sum(j.totals[event], n);
    measure(S, j, {events: 1, earned: event === 'earn' ? n : 0, spent: event === 'spend' ? n : 0});
    j.season.xp = sum(j.season.xp, Math.min(100000, n * EVENTS[event]));
    const points = Math.min(MAX, n * (PARTICIPATION[event] || 0));
    j.participation = sum(j.participation, points); j.day.points = sum(j.day.points, points); j.week.points = sum(j.week.points, points);
    for (const def of CHALLENGES) {
      const c = j.challenges[def.id];
      if (c && !c.claimed && c.progress < def.target && c.store === storeOf(ctx) && c.day === j.day.index && j.clock < c.deadline && def.event === event) c.progress = Math.min(def.target, c.progress + n);
    }
    sync(S, ctx, j.clock);
    return {ok: true, xp: Math.min(100000, n * EVENTS[event]), points};
  }
  function credit(S, reward, j, t, kind, id) {
    const money = positive(reward.money);
    S.money = sum(S.money, money);
    measure(S, j, {earned: money, claims: 1});
    j.season.xp = sum(j.season.xp, positive(reward.xp));
    if (reward.item && !j.items.includes(reward.item)) j.items.push(reward.item);
    if (reward.collectible && !j.collectibles.includes(reward.collectible)) j.collectibles.push(reward.collectible);
    entry(j, t, kind, id, money);
    return clone(reward);
  }
  function loot(j, multiplier) {
    const roll = Math.random(); let c = 0;
    const item = LOOT.find(x => (c += x.chance) > roll) || LOOT[LOOT.length - 1];
    // Uniforme raro repetido vira 120 moedas-base. Sempre mostrado nas chances.
    return {prize: item.id, rarity: item.rarity, money: scaled(item.money, j.scale) * multiplier, xp: item.xp * multiplier, item: item.item || null, duplicate: !!item.item && j.items.includes(item.item)};
  }
  const metric = (j, key) => key === 'participation' ? j.participation : Math.max(positive(j.peaks[key]), positive(j.totals[key]));
  function act(S, kind, id, ctx = {}, now) {
    const j = sync(S, ctx, now), t = j.clock;
    let reward = null, reason = 'invalid-action';
    const fail = why => ({ok: false, reason: why, snapshot: snapshot(S, ctx, t)});
    if (kind === 'start') {
      const def = CHALLENGES.find(c => c.id === id), old = j.challenges[id];
      if (!def) return fail('invalid-id');
      if (j.day.challenges[id]) return fail('daily-limit');
      if (old && !old.claimed && old.day === j.day.index && (old.progress >= def.target || t < old.deadline)) return fail('already-started');
      j.challenges[id] = {started: t, deadline: Math.min(t + def.duration, (j.day.index + 1) * DAY), day: j.day.index, store: storeOf(ctx), progress: 0, claimed: false, money: scaled(def.money, j.scale)};
      entry(j, t, 'start', id);
    } else if (kind === 'challenge') {
      const def = CHALLENGES.find(c => c.id === id), c = j.challenges[id];
      if (!def || !c || c.claimed || j.day.challenges[id] || c.day !== j.day.index || c.progress < def.target) return fail('not-ready');
      c.claimed = true; j.day.challenges[id] = true;
      reward = credit(S, {money: c.money, xp: def.xp}, j, t, kind, id);
    } else if (kind === 'chest') {
      if (id !== 'daily' && id !== 'weekly') return fail('invalid-id');
      const p = id === 'daily' ? j.day : j.week, target = id === 'daily' ? 10 : 60;
      if (p.chest || p.points < target) return fail('not-ready');
      p.chest = true;
      reward = credit(S, loot(j, id === 'daily' ? 1 : 3), j, t, kind, id);
    } else if (kind === 'spin') {
      if (id !== 'free') return fail('invalid-id');
      if (t < j.spin.next) {
        if (!j.spin.extra) return fail('cooldown');
        j.spin.extra--;
      } else j.spin.next = t + 6 * 3600000;
      reward = credit(S, loot(j, 1), j, t, kind, 'free');
    } else if (kind === 'rare') {
      if (id !== 'participation') return fail('invalid-id');
      if (j.rareClaimed || j.participation < 120) return fail('not-ready');
      j.rareClaimed = true;
      reward = credit(S, {item: 'uniform-gold', money: 0, xp: 0}, j, t, kind, 'participation');
    } else if (kind === 'season') {
      const step = TRACK.find(x => `${j.season.index}:${x.id}` === id), pending = Object.hasOwn(j.pending, id) ? j.pending[id] : null;
      if (step && j.season.xp >= step.xp && !j.season.claimed[step.id]) {
        j.season.claimed[step.id] = true;
        reward = credit(S, {...step, xp: 0, money: step.money ? scaled(step.money, j.season.scale) : 0}, j, t, kind, id);
      } else if (pending) {
        delete j.pending[id];
        reward = credit(S, {...pending, xp: 0, money: pending.money ? scaled(pending.money, pending.scale) : 0}, j, t, kind, id);
      } else return fail('not-ready');
    } else if (kind === 'collection') {
      const def = COLLECTIONS.find(c => c.id === id);
      if (!def || j.collections[id] || metric(j, def.metric) < def.target) return fail('not-ready');
      j.collections[id] = true;
      reward = credit(S, {money: scaled(def.money, j.scale), item: def.item || null}, j, t, kind, id);
    } else if (kind === 'buy') {
      const item = COSMETICS.find(x => x.id === id);
      if (!item || !item.price || j.items.includes(id)) return fail('not-purchasable');
      const price = scaled(item.price, j.scale);
      if (!Number.isFinite(S.money) || S.money < price) return fail('insufficient-money');
      S.money -= price; measure(S, j, {spent: price}); j.items.push(id);
      entry(j, t, kind, id, -price);
    } else if (kind === 'equip') {
      const item = COSMETICS.find(x => x.id === id);
      if (!item || !j.items.includes(id)) return fail('locked');
      const store = storeOf(ctx), equipped = j.equipped[store] || (j.equipped[store] = {...DEFAULT_EQUIP});
      if (equipped[item.slot] === id) return fail('already-equipped');
      equipped[item.slot] = id; entry(j, t, kind, id);
    } else return fail(reason);
    return {ok: true, reward, snapshot: snapshot(S, ctx, t)};
  }
  function bonuses(S, ctx = {}) {
    const j = sync(S, ctx, ctx.now);
    const n = Object.keys(j.collections).length;
    return {price: Math.min(.02, n * .002), xp: Math.min(.03, n * .003)};
  }
  // API de cena: não gera snapshot nem muda tempo/estado. Default é null para
  // conservar materiais/cargo atuais. Piso usa duas cores CSS para o quadriculado.
  function palette(S, cur = 0) {
    const out = {floor: null, wall: null, counter: null, uniform: null, facade: null, equipment: null, table: null, decor: null};
    const equipped = S.journey && S.journey.equipped[String(cur)];
    if (!equipped) return out;
    for (const slot of Object.keys(out)) {
      if (!equipped[slot] || equipped[slot] === DEFAULT_EQUIP[slot]) continue;
      const item = COSMETICS.find(c => c.id === equipped[slot] && c.slot === slot);
      if (item) out[slot] = slot === 'floor' ? ['#' + item.color.toString(16).padStart(6, '0'), slot === 'floor' && item.id === 'floor-mint' ? '#e2f2df' : '#fff8ec'] : item.color;
    }
    return out;
  }
  function snapshot(S, ctx = {}, now) {
    const j = sync(S, ctx, now), t = j.clock, store = storeOf(ctx);
    const equipped = {...DEFAULT_EQUIP, ...j.equipped[store]}, palette = {};
    for (const slot of Object.keys(DEFAULT_EQUIP)) palette[slot] = COSMETICS.find(x => x.id === equipped[slot]).color;
    const chances = LOOT.map(x => ({...x, money: scaled(x.money, j.scale), duplicateMoney: x.item ? scaled(x.money, j.scale) : 0}));
    return clone({v: j.v, now: t, money: positive(S.money), store, palette, equipped,
      challenges: CHALLENGES.map(def => {
        const c = j.challenges[def.id], active = c && c.day === j.day.index;
        const claimed = !!j.day.challenges[def.id], ready = !!active && !claimed && c.progress >= def.target;
        const expired = !!active && !ready && !claimed && t >= c.deadline;
        return {...def, money: active ? c.money : scaled(def.money, j.scale), progress: active ? c.progress : 0,
          started: active ? c.started : null, deadline: active ? c.deadline : null, store: active ? c.store : store,
          remaining: active ? Math.max(0, c.deadline - t) : def.duration, claimed, ready, expired,
          canStart: !claimed && (!active || expired), status: claimed ? 'claimed' : ready ? 'ready' : expired ? 'expired' : active ? 'active' : 'idle'};
      }),
      chests: [{id: 'daily', name: 'Baú diário', target: 10, progress: j.day.points, claimed: j.day.chest, ready: j.day.points >= 10 && !j.day.chest, reset: (j.day.index + 1) * DAY, multiplier: 1},
        {id: 'weekly', name: 'Baú semanal', target: 60, progress: j.week.points, claimed: j.week.chest, ready: j.week.points >= 60 && !j.week.chest, reset: (j.week.index + 1) * WEEK, multiplier: 3}],
      spin: {id: 'free', ready: t >= j.spin.next || j.spin.extra > 0, next: j.spin.next, remaining: Math.max(0, j.spin.next - t), extra: j.spin.extra, cooldown: 6 * 3600000},
      chances, rare: {target: 120, progress: j.participation, ready: j.participation >= 120 && !j.rareClaimed, claimed: j.rareClaimed, item: 'uniform-gold'},
      season: {...j.season, duration: SEASON, remaining: j.season.end - t, track: TRACK.map(step => ({...step, id: `${j.season.index}:${step.id}`, money: step.money ? scaled(step.money, j.season.scale) : 0, claimed: !!j.season.claimed[step.id], ready: j.season.xp >= step.xp && !j.season.claimed[step.id]})), pending: Object.values(j.pending)},
      collections: COLLECTIONS.map(c => ({...c, money: scaled(c.money, j.scale), progress: Math.min(c.target, metric(j, c.metric)), claimed: !!j.collections[c.id], ready: metric(j, c.metric) >= c.target && !j.collections[c.id]})),
      cosmetics: COSMETICS.map(c => ({...c, price: c.price ? scaled(c.price, j.scale) : 0, owned: j.items.includes(c.id), equipped: equipped[c.slot] === c.id, affordable: positive(S.money) >= scaled(c.price || 0, j.scale)})),
      collectibles: RECIPE_ITEMS.map(x => ({...x, owned: j.collectibles.includes(x.id)})),
      totals: j.totals, stats: {...j.stats, session: sessions.get(S), last7: j.stats.days.reduce((a, d) => {
        for (const key of ['earned', 'spent', 'claims', 'events']) a[key] = sum(a[key], d[key]); return a;
      }, {earned: 0, spent: 0, claims: 0, events: 0})}, bonuses: {price: Math.min(.02, Object.keys(j.collections).length * .002), xp: Math.min(.03, Object.keys(j.collections).length * .003)}});
  }
  function rewarded(S, kind, amount, receipt, ctx, now) {
    const rawNow = timestamp(ctx, now), j = sync(S, ctx, rawNow), t = j.clock, a = j.ads;
    if (!receipt || receipt.earned !== true || typeof receipt.id !== 'string' || !receipt.id || receipt.id.length > 128 ||
        !Number.isFinite(receipt.at) || receipt.at > t || t - receipt.at > 300000 || rawNow < t ||
        a.receipts.some(r => r.id === receipt.id)) return {ok: false, reason: 'invalid-receipt'};
    if (a[kind] >= 1 || (kind === 'spin' && j.spin.extra >= 1)) return {ok: false, reason: 'reward-limit'};
    if (kind === 'xp' && (!Number.isFinite(amount) || amount <= 0 || amount > 80)) return {ok: false, reason: 'invalid-amount'};
    a.receipts.push({id: receipt.id, at: receipt.at}); a[kind]++;
    if (kind === 'spin') j.spin.extra++;
    else j.season.xp = sum(j.season.xp, amount);
    measure(S, j, {claims: 1}); entry(j, t, 'earned-' + kind, receipt.id);
    return {ok: true, snapshot: snapshot(S, ctx, t)};
  }
  const extraSpin = (S, receipt, ctx = {}, now) => rewarded(S, 'spin', 0, receipt, ctx, now);
  const rewardXP = (S, amount, receipt, ctx = {}, now) => rewarded(S, 'xp', amount, receipt, ctx, now);
  const preserve = S => clone(init(S, S.journey ? S.journey.clock : Date.now()));
  function restore(S, saved, now) { S.journey = clone(saved); return init(S, timestamp(null, now)); }
  return {init, sync, record, act, snapshot, bonuses, palette, preserve, restore, extraSpin, rewardXP,
    DAY, WEEK, SEASON, HISTORY_LIMIT, CHALLENGES: clone(CHALLENGES), COSMETICS: clone(COSMETICS), LOOT: clone(LOOT), TRACK: clone(TRACK)};
});
