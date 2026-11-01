/* Burger Rush: dados de layout; não acessa DOM, Three, câmera, controles ou storage.
 *
 * Integração (âncoras de www/index.html, sem alterar este contrato):
 * 1. Carregar layout.js antes do script principal. No save de CADA loja/cidade,
 *    persistir layoutSeed + layoutVersion=1, uma única vez, via migração do main.
 *    Para saves antigos, derivar a seed de dados persistidos (ex.: "save-id:city:lot").
 *    Nunca gerar seed em reload, resize, ampliação ou com Date.now()/Math.random().
 * 2. Depois de `const ZONES = [...]`, ANTES de `const bought`, `buildZoneUI` e da
 *    reconstituição via `buyZone`, gerar com {seed: R.layoutSeed, phase: R.ex,
 *    lot: S.cur, city: S.city || 0}; conferir Layout.validate(data).ok.
 *    Para cada z.kind === 'table' presente em data.tables, copiar SOMENTE x,z
 *    para z. Isso move juntos compra, addTable, seats[].tb e collider da mesa.
 *    Não deslocar apenas o mesh nem as cadeiras. Não aplicar em loja já montada.
 * 3. Ao ampliar (`R.ex = R.obra.lv; ... buildShell()`), usar a MESMA seed/lot/city:
 *    mesas existentes e decoração de fases anteriores mantêm suas posições.
 *    As UIs das zonas futuras já existem: antes de refreshZones, para cada mesa
 *    liberada ainda não comprada, atualizar z.x/z.z e mover z.g.position.x/z.
 *    Não chamar buildZoneUI de novo (reseta preço/pagamento parcial). Não mover
 *    mesas compradas nem duplicar mesas, seats, decoração ou colliders.
 * 4. decorations são opcionais. Materializar uma vez por id, fora de `shell`
 *    (buildShell o destrói), com addCollider(x,z,hw,hd) quando solid=true.
 *    Não criar nenhuma decoração se validate falhar. Dimensões máximas: 2*hw/hd.
 * 5. variants são sugestões de balanceamento para spawn/order/resources/challenge.
 *    São dados, não alteram a simulação automaticamente; orders usa índices de
 *    produtos da fase e ainda deve ser filtrado por stations/cardápio disponíveis.
 *    Desafios são opcionais, sem prazo nem bloqueio da progressão. Nunca usar uma
 *    variante para trocar player, estações, balcões, chapa, B/EXP ou câmera.
 * 6. validate falhou? Usar coordenadas originais de ZONES e omitir decoração,
 *    registrar errors, conservar a seed salva. Não tentar outra seed em reload.
 *
 * A geometria abaixo espelha apenas EXP, ZONES, addTable/addCollider e collide.
 * O main deve rever este contrato se essas âncoras mudarem. Validação geométrica
 * não comprova integração visual, economia, movimento de NPC ou serviço real.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.Layout = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 1, RADIUS = 0.35, STEP = 0.25, EPS = 1e-8;
  var PHASES = [{W: 7, F: 6.4}, {W: 7, F: 9.7}, {W: 7, F: 13}, {W: 11.5, F: 13}, {W: 16, F: 13}];
  var TABLES = [
    {id: 't1', x: -3.8, z: 4, phase: 0}, {id: 't2', x: 3.8, z: 4, phase: 0},
    {id: 't3', x: -3.8, z: 7.3, phase: 1}, {id: 't4', x: 3.8, z: 7.3, phase: 1},
    {id: 't5', x: -3.8, z: 10.6, phase: 2}, {id: 't6', x: 3.8, z: 10.6, phase: 2},
    {id: 't7', x: 9.3, z: 4, phase: 3}, {id: 't8', x: 9.3, z: 7.4, phase: 3},
    {id: 't9', x: 9.3, z: 10.8, phase: 3},
    {id: 't10', x: 13.8, z: 4, phase: 4}, {id: 't11', x: 13.8, z: 7.4, phase: 4},
    {id: 't12', x: 13.8, z: 10.8, phase: 4}
  ];
  // hw/hd já incorporam a rotação da estação (front preserva o original).
  var ZONES = [
    {id: 'g2', x: -5.6, z: -4.5, phase: 0, hw: .8, hd: .6, dx: 0, dz: 1.25},
    {id: 'f1', x: -5.9, z: -2.3, phase: 0, hw: .6, hd: .8, dx: 1.25, dz: 0},
    {id: 'h1', x: 4.2, z: -4.4, phase: 0},
    {id: 's1', x: 5.9, z: -2.6, phase: 1, hw: .6, hd: .8, dx: -1.25, dz: 0},
    {id: 'g3', x: -.4, z: -4.5, phase: 1, hw: .8, hd: .6, dx: 0, dz: 1.25},
    {id: 'c1', x: -5.6, z: 2.1, phase: 1},
    {id: 'h2', x: 2.2, z: -4.6, phase: 2},
    {id: 'f2', x: -5.9, z: -.1, phase: 2, hw: .6, hd: .8, dx: 1.25, dz: 0},
    {id: 's2', x: 5.9, z: -.4, phase: 2, hw: .6, hd: .8, dx: -1.25, dz: 0},
    {id: 'h3', x: 5.4, z: 2.1, phase: 2},
    {id: 'x1', x: 8.6, z: -4.5, phase: 3, hw: .8, hd: .6, dx: 0, dz: 1.25},
    {id: 'x2', x: 10.6, z: -2.5, phase: 3, hw: .6, hd: .8, dx: -1.25, dz: 0},
    {id: 'h4', x: 8.2, z: 1.4, phase: 3},
    {id: 'c2', x: 13.6, z: 1.4, phase: 4}
  ];
  var PADS = [
    {id: 'west-foyer', x: -6.15, z: 4.65, phase: 0},
    {id: 'east-foyer', x: 6.15, z: 4.65, phase: 0},
    {id: 'west-middle', x: -6.15, z: 7.95, phase: 1},
    {id: 'east-back', x: 6.15, z: 11.25, phase: 2},
    {id: 'annex-middle', x: 10.85, z: 5.9, phase: 3},
    {id: 'annex-back', x: 10.85, z: 9.1, phase: 3},
    {id: 'wing-middle', x: 15.35, z: 5.9, phase: 4}
  ];
  var PATTERNS = ['steady', 'staggered', 'waves'];
  var ORDERS = ['balanced', 'alternating', 'batch'];
  var RESOURCE_PROFILES = ['balanced', 'stock', 'service'];
  var CHALLENGES = ['serve-orders', 'clean-tables', 'keep-queue'];
  var DECOR_KINDS = ['plant', 'lamp', 'bin'];
  var navCache = new Map(); // Somente geometria real, nunca seed/identidade do objeto.
  var routeCache = new Map();

  function record(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]'; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function ordinal(v) { return Number.isSafeInteger(v) && v >= 0; }
  function validSeed(v) { return (typeof v === 'string' && v.trim().length > 0 && v.length <= 128) || (ordinal(v) && v <= 0xffffffff); }
  function validPhase(v) { return Number.isInteger(v) && v >= 0 && v < PHASES.length; }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function rng(key) {
    var state = hash(key);
    return function () {
      state = (state + 0x6d2b79f5) | 0;
      var n = Math.imul(state ^ state >>> 15, state | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(items, random) {
    var out = items.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1)), tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }
  function rect(id, x, z, hw, hd) { return {id: id, x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd}; }
  function overlaps(a, b) { return a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.z0 < b.z1 - EPS && a.z1 > b.z0 + EPS; }
  function inside(p, b) { return p.x0 >= b.x0 - EPS && p.x1 <= b.x1 + EPS && p.z0 >= b.z0 - EPS && p.z1 <= b.z1 + EPS; }
  function bounds(phase) { return {x0: -6.6, x1: PHASES[phase].W - .4, z0: -6.6, z1: PHASES[phase].F - .4}; }
  function pointInside(p, b) { return finite(p.x) && finite(p.z) && p.x >= b.x0 - EPS && p.x <= b.x1 + EPS && p.z >= b.z0 - EPS && p.z <= b.z1 + EPS; }
  function fixedGeometry(phase) {
    var b = PHASES[phase], out = [
      rect('back-fixture', 6.1, -6.3, .65, .5), rect('left-plant', -6.4, -.4, .35, .35),
      rect('base-station', -3, -4.5, .8, .6), rect('counter', 0, -1, 2.2, .6),
      rect('corner-west', -6.4, b.F - .6, .4, .4), rect('corner-east', b.W - .6, b.F - .6, .4, .4)
    ];
    if (phase >= 3) out.push(rect('annex-counter', 8.9, -1, 1.4, .6));
    ZONES.forEach(function (z) { if (z.phase <= phase && z.hw) out.push(rect(z.id, z.x, z.z, z.hw, z.hd)); });
    return out;
  }
  function corridors(phase) {
    var b = bounds(phase);
    return [rect('central-queue', 0, (.3 + b.z1) / 2, 2, (b.z1 - .3) / 2),
      {id: 'cross-aisle', x0: -5, x1: b.x1 - .3, z0: .5, z1: 1}];
  }
  // Segmento contra AABB expandido pelo raio: conservador inclusive nos cantos.
  // Usar só nós livres não bastaria: a aresta também precisa ser livre.
  function segmentClear(a, b, obstacles, ignore) {
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i]; if (o.id === ignore) continue;
      var low = 0, high = 1, dx = b.x - a.x, dz = b.z - a.z;
      var axes = [[a.x, dx, o.x0 - RADIUS, o.x1 + RADIUS], [a.z, dz, o.z0 - RADIUS, o.z1 + RADIUS]];
      for (var k = 0; k < 2; k++) {
        var ax = axes[k];
        if (Math.abs(ax[1]) < EPS) {
          if (ax[0] < ax[2] - EPS || ax[0] > ax[3] + EPS) { low = 2; break; }
        } else {
          var t0 = (ax[2] - ax[0]) / ax[1], t1 = (ax[3] - ax[0]) / ax[1];
          low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1));
          if (low > high + EPS) break;
        }
      }
      if (low <= high + EPS) return false;
    }
    return true;
  }
  function navigation(phase, obstacles) {
    var key = phase + ':' + obstacles.map(function (o) { return [o.x0, o.x1, o.z0, o.z1].join(','); }).sort().join(';');
    if (navCache.has(key)) return navCache.get(key);
    var b = bounds(phase), nx = Math.floor((b.x1 - b.x0) / STEP) + 1, nz = Math.floor((b.z1 - b.z0) / STEP) + 1;
    var free = new Uint8Array(nx * nz), reached = new Uint8Array(nx * nz), queue = new Int32Array(nx * nz);
    var walkable = 0, tail = 0;
    function point(i) { return {x: b.x0 + i % nx * STEP, z: b.z0 + Math.floor(i / nx) * STEP}; }
    for (var i = 0; i < free.length; i++) {
      var p = point(i);
      if (segmentClear(p, p, obstacles)) { free[i] = 1; walkable++; }
    }
    // Ponto de referência da cozinha; não teleporta/altera o personagem.
    var start = {x: 2, z: -2};
    for (var iz = 0; iz < nz; iz++) for (var ix = 0; ix < nx; ix++) {
      var index = iz * nx + ix, q = point(index);
      if (free[index] && Math.abs(q.x - start.x) <= STEP && Math.abs(q.z - start.z) <= STEP && segmentClear(start, q, obstacles)) {
        reached[index] = 1; queue[tail++] = index;
      }
    }
    for (var head = 0; head < tail; head++) {
      var cur = queue[head], x = cur % nx, z = Math.floor(cur / nx), from = point(cur);
      var neighbors = [x > 0 ? cur - 1 : -1, x + 1 < nx ? cur + 1 : -1, z > 0 ? cur - nx : -1, z + 1 < nz ? cur + nx : -1];
      for (var j = 0; j < neighbors.length; j++) {
        var next = neighbors[j];
        if (next >= 0 && free[next] && !reached[next] && segmentClear(from, point(next), obstacles)) {
          reached[next] = 1; queue[tail++] = next;
        }
      }
    }
    var field = {b: b, nx: nx, nz: nz, reached: reached, walkable: walkable, count: tail};
    if (navCache.size >= 128) navCache.delete(navCache.keys().next().value);
    navCache.set(key, field);
    return field;
  }
  function reachable(p, field, obstacles, ignore) {
    if (!pointInside(p, field.b) || !segmentClear(p, p, obstacles, ignore)) return false;
    // Para compras, conectar o centro ao grafo final removendo só seu collider.
    // Assim o caminho continua livre em qualquer subconjunto de compras feitas.
    var reach = ignore ? 2 : STEP * 1.5, b = field.b;
    var x0 = Math.max(0, Math.ceil((p.x - reach - b.x0) / STEP));
    var x1 = Math.min(field.nx - 1, Math.floor((p.x + reach - b.x0) / STEP));
    var z0 = Math.max(0, Math.ceil((p.z - reach - b.z0) / STEP));
    var z1 = Math.min(field.nz - 1, Math.floor((p.z + reach - b.z0) / STEP));
    for (var z = z0; z <= z1; z++) for (var x = x0; x <= x1; x++) {
      if (field.reached[z * field.nx + x] && segmentClear(p, {x: b.x0 + x * STEP, z: b.z0 + z * STEP}, obstacles, ignore)) return true;
    }
    return false;
  }
  function deepFreeze(o) {
    Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); });
    return Object.freeze(o);
  }

  function generate(options) {
    if (!record(options)) throw new TypeError('Layout.generate exige {seed, phase, lot, city}.');
    if (!validSeed(options.seed)) throw new TypeError('seed deve ser uint32 ou string não vazia de até 128 caracteres.');
    var phase = options.phase === undefined ? 0 : options.phase;
    var lot = options.lot === undefined ? 0 : options.lot, city = options.city === undefined ? 0 : options.city;
    if (!validPhase(phase)) throw new RangeError('phase deve ser inteiro de 0 a 4.');
    if (!ordinal(lot) || !ordinal(city)) throw new RangeError('lot e city devem ser inteiros seguros não negativos.');
    // Tipos e delimitadores preservados; phase não participa das streams espaciais.
    var key = JSON.stringify([VERSION, options.seed, lot, city]), tables = {};
    for (var p = 0; p <= phase; p++) {
      var group = TABLES.filter(function (t) { return t.phase === p; });
      var slots = shuffle(group, rng(key + ':tables:' + p));
      group.forEach(function (t, i) { tables[t.id] = {x: slots[i].x, z: slots[i].z, slot: slots[i].id}; });
    }
    var decorations = [];
    PADS.forEach(function (pad) {
      var random = rng(key + ':decor:' + pad.id);
      if (random() < .5 && pad.phase <= phase) decorations.push({id: pad.id, kind: DECOR_KINDS[Math.floor(random() * DECOR_KINDS.length)], x: pad.x, z: pad.z, hw: .22, hd: .22, solid: true});
    });
    var random = rng(key + ':variants:' + phase), pick = function (values) { return values[Math.floor(random() * values.length)]; };
    var productCount = phase === 0 ? 2 : phase < 3 ? 3 : 5;
    var sequence = shuffle(Array.from({length: productCount}, function (_, i) { return i; }), random);
    return {
      version: VERSION, seed: options.seed, phase: phase, lot: lot, city: city, tables: tables, decorations: decorations,
      variants: {
        spawn: {pattern: pick(PATTERNS), intervalScale: pick([.95, 1, 1.05]), maxQueueDelta: pick([0, 1])},
        order: {pattern: pick(ORDERS), sequence: sequence},
        resources: {profile: pick(RESOURCE_PROFILES), stockScale: pick([1, 1.05, 1.1]), productionScale: pick([1, 1.05, 1.1])},
        challenge: {id: pick(CHALLENGES), target: 4 + phase * 2 + Math.floor(random() * 4), optional: true, blocking: false, timeLimit: null}
      }
    };
  }

  function validate(layout) {
    var errors = [], stats = {tables: 0, decorations: 0, walkableCells: 0, reachableCells: 0, interactions: 0};
    function error(code, id, message) { errors.push({code: code, id: id, message: message}); }
    function result() { return {ok: errors.length === 0, errors: errors, stats: stats}; }
    if (!record(layout)) { error('SCHEMA', 'layout', 'Layout deve ser um objeto.'); return result(); }
    if (layout.version !== VERSION || !validSeed(layout.seed) || !validPhase(layout.phase) || !ordinal(layout.lot) || !ordinal(layout.city)) {
      error('SCHEMA', 'layout', 'Metadados inválidos ou versão não suportada.'); return result();
    }
    if (!record(layout.tables) || !Array.isArray(layout.decorations) || layout.decorations.length > PADS.length || !record(layout.variants)) {
      error('SCHEMA', 'layout', 'tables, decorations ou variants inválidos.'); return result();
    }
    var phase = layout.phase, active = TABLES.filter(function (t) { return t.phase <= phase; });
    var zones = ZONES.filter(function (z) { return z.phase <= phase; });
    var shapes = [], purchases = [], usedSlots = new Set(), ids = new Set();
    var fixed = fixedGeometry(phase), aisles = corridors(phase), b = bounds(phase);
    Object.keys(layout.tables).forEach(function (id) {
      if (!active.some(function (t) { return t.id === id; })) error('TABLE_ID', id, 'ID de mesa desconhecido ou bloqueado nesta fase.');
    });
    active.forEach(function (t) {
      var v = own(layout.tables, t.id) && layout.tables[t.id];
      if (!record(v) || !finite(v.x) || !finite(v.z)) { error('TABLE_SCHEMA', t.id, 'Mesa ausente ou coordenadas inválidas.'); return; }
      var slot = TABLES.find(function (s) { return s.id === v.slot && s.phase === t.phase; });
      if (!slot || usedSlots.has(v.slot)) error('TABLE_SLOT', t.id, 'Slot inválido, repetido ou de outra fase.');
      usedSlots.add(v.slot);
      var shape = rect(t.id, v.x, v.z, 1.3, .55);
      shapes.push(shape); purchases.push({id: t.id, x: v.x, z: v.z}); stats.tables++;
      if (!inside(shape, bounds(t.phase))) error('TABLE_BOUNDS', t.id, 'Mesa ou cadeiras ultrapassam os limites da fase de desbloqueio.');
      if (shape.z0 < 2.9) error('TABLE_AREA', t.id, 'Mesa fora do salão; cozinha e circulação devem permanecer livres.');
    });
    zones.forEach(function (z) { purchases.push({id: z.id, x: z.x, z: z.z}); });
    Array.from(layout.decorations).forEach(function (d, i) {
      if (!record(d) || typeof d.id !== 'string' || !PADS.some(function (p) { return p.id === d.id && p.phase <= phase; }) || ids.has(d.id) ||
          DECOR_KINDS.indexOf(d.kind) < 0 || !finite(d.x) || !finite(d.z) || !finite(d.hw) || !finite(d.hd) ||
          d.hw <= 0 || d.hd <= 0 || d.hw > .22 || d.hd > .22 || typeof d.solid !== 'boolean') {
        error('DECOR_SCHEMA', String(i), 'Decoração inválida, repetida ou de fase futura.'); return;
      }
      ids.add(d.id); stats.decorations++;
      var shape = rect('decor:' + d.id, d.x, d.z, d.hw, d.hd); shape.solid = d.solid;
      if (!inside(shape, b)) error('DECOR_BOUNDS', d.id, 'Decoração fora dos limites.');
      if (!(shape.x1 <= -5.85 + EPS || (shape.x0 >= 5.85 - EPS && shape.x1 <= 6.6 + EPS) ||
          (phase >= 3 && shape.x0 >= 10.6 - EPS)) || shape.z0 < 2.9) {
        error('DECOR_AREA', d.id, 'Decoração permitida apenas na periferia do salão.');
      }
      shapes.push(shape);
    });
    // Schema das variantes também é validado para não aceitar perfis impossíveis.
    var v = layout.variants, s = v.spawn, o = v.order, r = v.resources, c = v.challenge;
    var count = phase === 0 ? 2 : phase < 3 ? 3 : 5;
    if (!record(s) || PATTERNS.indexOf(s.pattern) < 0 || [.95, 1, 1.05].indexOf(s.intervalScale) < 0 || [0, 1].indexOf(s.maxQueueDelta) < 0 ||
        !record(o) || ORDERS.indexOf(o.pattern) < 0 || !Array.isArray(o.sequence) || o.sequence.length !== count || new Set(o.sequence).size !== count || !Array.from(o.sequence).every(function (i) { return Number.isInteger(i) && i >= 0 && i < count; }) ||
        !record(r) || RESOURCE_PROFILES.indexOf(r.profile) < 0 || [1, 1.05, 1.1].indexOf(r.stockScale) < 0 || [1, 1.05, 1.1].indexOf(r.productionScale) < 0 ||
        !record(c) || CHALLENGES.indexOf(c.id) < 0 || !Number.isInteger(c.target) || c.target < 4 + phase * 2 || c.target > 7 + phase * 2 || c.optional !== true || c.blocking !== false || c.timeLimit !== null) {
      error('VARIANTS', 'variants', 'Perfis inválidos, produto inexistente ou desafio obrigatório/com prazo.');
    }
    shapes.forEach(function (shape, i) {
      fixed.forEach(function (f) { if (overlaps(shape, f)) error('OVERLAP_FIXED', shape.id, 'Sobreposição com ' + f.id + '.'); });
      shapes.slice(i + 1).forEach(function (other) { if (overlaps(shape, other)) error('OVERLAP', shape.id, 'Sobreposição com ' + other.id + '.'); });
      aisles.forEach(function (a) { if (overlaps(shape, a)) error('CORRIDOR', shape.id, 'Obstrução de ' + a.id + '.'); });
      purchases.forEach(function (p) {
        if (shape.id !== p.id && overlaps(shape, rect(p.id, p.x, p.z, .95, .95))) error('PURCHASE_OVERLAP', shape.id, 'Obstrui zona de compra ' + p.id + '.');
      });
    });
    // Não construir grids com coordenadas não finitas/schema inválido ou fora do
    // espaço limitado. Demais erros geométricos ainda recebem diagnóstico BFS.
    if (errors.some(function (e) { return /SCHEMA|BOUNDS|TABLE_ID|TABLE_SLOT|VARIANTS/.test(e.code); })) return result();
    var obstacles = fixed.concat(shapes.filter(function (shape) { return shape.solid !== false; }));
    // Identidade e coordenadas atuais entram na chave; mutações nunca reutilizam
    // o resultado antigo. Dados retornados não expõem os caches internos.
    var routeKey = phase + ':' + shapes.map(function (shape) {
      return [shape.id, shape.x0, shape.x1, shape.z0, shape.z1, shape.solid !== false].join(',');
    }).sort().join(';');
    var cached = routeCache.get(routeKey);
    if (cached) {
      stats.walkableCells = cached.walkable; stats.reachableCells = cached.reached; stats.interactions = cached.interactions;
      cached.errors.forEach(function (e) { error(e.code, e.id, e.message); });
      return result();
    }
    var field = navigation(phase, obstacles);
    stats.walkableCells = field.walkable; stats.reachableCells = field.count;
    var routeErrors = [];
    function target(id, x, z, ignore) {
      stats.interactions++;
      if (!reachable({x: x, z: z}, field, obstacles, ignore)) routeErrors.push({code: 'UNREACHABLE', id: id, message: 'Sem caminho com raio .35 desde a cozinha.'});
    }
    function interaction(id, x, z, ignore) {
      stats.interactions++;
      if (reachable({x: x, z: z}, field, obstacles, ignore)) return;
      // O ponto nominal pode cair num vizinho já existente (g2/f1 e f2/planta).
      // Testar uma posição no disco de interação, a até .8 do centro/frente.
      // Em compras, esse disco está inteiramente no pad original de 1.9 x 1.9.
      for (var radius = .4; radius <= .8 + EPS; radius += .4) for (var angle = 0; angle < 8; angle++) {
        if (reachable({x: x + Math.cos(angle * Math.PI / 4) * radius, z: z + Math.sin(angle * Math.PI / 4) * radius}, field, obstacles, ignore)) return;
      }
      routeErrors.push({code: 'UNREACHABLE', id: id, message: 'Área de interação sem caminho livre com raio .35.'});
    }
    target('kitchen-start', 2, -2);
    target('base-station:front', -3, -3.25);
    [-1.3, -.15, 1].forEach(function (x, i) { target('counter:drop:' + i, x, -2.2); target('counter:serve:' + i, x, .15); });
    if (phase >= 3) [8.3, 9.5].forEach(function (x, i) { target('annex:drop:' + i, x, -2.2); target('annex:serve:' + i, x, .15); });
    target('entrance', 0, b.z1 - .1);
    for (var z = 1.5; z < b.z1; z += 1) target('queue:' + z, 0, z);
    active.forEach(function (t) {
      var p = layout.tables[t.id];
      target(t.id + ':clean', p.x, p.z + .95);
      [-1, 1].forEach(function (side) {
        stats.interactions++;
        // A planta fixa junto à última mesa do anexo exige acesso pela outra
        // borda. O jogador pode alcançar a mesma cadeira por frente ou por trás.
        if (!reachable({x: p.x + side * .98, z: p.z + .95}, field, obstacles) &&
            !reachable({x: p.x + side * .98, z: p.z - .95}, field, obstacles)) {
          routeErrors.push({code: 'UNREACHABLE', id: t.id + (side < 0 ? ':seat-left' : ':seat-right'), message: 'Cadeira sem aproximação livre nas duas bordas.'});
        }
      });
    });
    zones.forEach(function (z) { if (z.hw) interaction(z.id + ':front', z.x + z.dx, z.z + z.dz); });
    purchases.forEach(function (p) { interaction('purchase:' + p.id, p.x, p.z, p.id); });
    if (routeCache.size >= 4096) routeCache.delete(routeCache.keys().next().value);
    routeCache.set(routeKey, {walkable: field.walkable, reached: field.count, interactions: stats.interactions, errors: routeErrors});
    routeErrors.forEach(function (e) { error(e.code, e.id, e.message); });
    return result();
  }

  return Object.freeze({version: VERSION, generate: generate, validate: validate,
    contract: deepFreeze({playerRadius: RADIUS, navigationStep: STEP, interactionRadius: .8, phases: PHASES, tables: TABLES, purchaseZones: ZONES,
      tableHalfWidth: 1.3, tableHalfDepth: .55, purchaseHalfSize: .95, decorHalfSize: .22})});
}));
