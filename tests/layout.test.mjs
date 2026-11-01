// Executar: node --test tests/layout.test.mjs (sem DOM, dependências ou rede).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const Layout = require('../www/layout.js');
const source = readFileSync(new URL('../www/layout.js', import.meta.url), 'utf8');
const clone = v => structuredClone(v);
const generate = (seed = 'test-layout', phase = 4, lot = 0, city = 0) => Layout.generate({seed, phase, lot, city});
const codes = layout => Layout.validate(layout).errors.map(e => e.code);
const C = Layout.contract;
const coverage = new Map();
const permutations = Array.from({length: 4}, () => new Set());

test('o contrato espelha somente as âncoras de geometria do restaurante atual', () => {
  const html = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  function arrayAnchor(name) {
    const start = html.indexOf(`const ${name} = [`);
    assert.ok(start >= 0, `âncora ${name} ausente`);
    const end = html.indexOf('\n];', start);
    assert.ok(end > start, `fim de ${name} ausente`);
    return html.slice(start, end).split('\n').filter(line => /\{/.test(line));
  }
  const phases = arrayAnchor('EXP').map(line => ({W: +line.match(/W: ([\d.]+)/)[1], F: +line.match(/F: ([\d.]+)/)[1]}));
  assert.deepEqual(C.phases, phases);
  const zones = arrayAnchor('ZONES').map(line => ({
    id: line.match(/id: '([^']+)'/)[1], kind: line.match(/kind: '([^']+)'/)[1],
    x: +line.match(/\bx: (-?[\d.]+)/)[1], z: +line.match(/\bz: (-?[\d.]+)/)[1],
    phase: +(line.match(/lv: (\d+)/)?.[1] || 0), sideways: /rot: /.test(line)
  }));
  assert.deepEqual(C.tables, zones.filter(z => z.kind === 'table').map(({id, x, z, phase}) => ({id, x, z, phase})));
  assert.deepEqual(C.purchaseZones.map(({id, x, z, phase}) => ({id, x, z, phase})),
    zones.filter(z => z.kind !== 'table').map(({id, x, z, phase}) => ({id, x, z, phase})));
  for (const z of zones.filter(z => /^p\d$/.test(z.kind))) {
    const expected = C.purchaseZones.find(p => p.id === z.id);
    assert.equal(expected.hw, z.sideways ? .6 : .8);
    assert.equal(expected.hd, z.sideways ? .8 : .6);
  }
  const collide = html.match(/function collide\(p\) \{[\s\S]*?\n\}/)?.[0];
  assert.match(collide, /const r = \.35;/);
  assert.match(collide, /Math\.max\(-6\.6, Math\.min\(B\.W - \.4, p\.x\)\)/);
  assert.match(collide, /Math\.max\(-6\.6, Math\.min\(B\.F - \.4, p\.z\)\)/);
  const table = html.match(/function addTable\(x, z\) \{[\s\S]*?\n\}/)?.[0];
  assert.match(table, /addCollider\(x, z, 1\.3, \.55\)/);
  assert.match(table, /x \+ side \* \.98/);
  assert.equal(C.playerRadius, .35);
  assert.equal(C.tableHalfWidth, 1.3);
  assert.equal(C.tableHalfDepth, .55);
});

test('UMD funciona em CommonJS, browser sem DOM e AMD; não usa aleatoriedade global', () => {
  const math = Object.create(Math);
  math.random = () => { throw new Error('Math.random proibido'); };
  const sandbox = {Math: math};
  for (const name of ['document', 'window', 'localStorage', 'THREE', 'Date']) {
    Object.defineProperty(sandbox, name, {get() { throw new Error(`${name} proibido`); }});
  }
  vm.runInNewContext(source, sandbox);
  const actual = sandbox.Layout.generate({seed: 'persistida', phase: 3, lot: 4, city: 12});
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), generate('persistida', 3, 4, 12));
  assert.equal(sandbox.Layout.validate(actual).ok, true);
  let amd;
  const define = (deps, factory) => { assert.equal(deps.length, 0); amd = factory(); };
  define.amd = true;
  vm.runInNewContext(source, {define, Math: math});
  assert.deepEqual(JSON.parse(JSON.stringify(amd.generate({seed: 0}))), Layout.generate({seed: 0}));
  assert.equal(amd.version, Layout.version);
  assert.equal(Object.isFrozen(C), true);
  assert.equal(Object.isFrozen(C.tables[0]), true);
});

test('entrada inválida é rejeitada e defaults mantêm seed explícita', () => {
  for (const options of [undefined, null, [], 3, 'seed', {}, {seed: true}, {seed: 1n}, {seed: Symbol('x')},
    ...[null, NaN, Infinity, -1, .5, 0x100000000, '', '  ', 'a'.repeat(129), {}].map(seed => ({seed}))]) {
    assert.throws(() => Layout.generate(options), TypeError);
  }
  for (const phase of [-1, 5, .5, null, '0', NaN, Infinity]) assert.throws(() => Layout.generate({seed: 0, phase}), RangeError);
  for (const key of ['lot', 'city']) for (const value of [-1, .5, null, '1', false, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => Layout.generate({seed: 0, [key]: value}), RangeError);
  }
  assert.deepEqual(Layout.generate({seed: 0}), generate(0, 0));
  for (const seed of [0, 0xffffffff, '🌱 restaurante', '0']) assert.equal(Layout.validate(generate(seed)).ok, true);
  assert.equal(Layout.validate(generate('x', 3, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).ok, true);
  assert.notDeepEqual(generate(0), generate('0'), 'seed numérica não é confundida com texto');
});

test('geração é pura, independente da ordem de chamadas e estável na ampliação/reload', () => {
  const options = {seed: 'save-id:city:lot', phase: 1, lot: 2, city: 3};
  const saved = clone(options), first = Layout.generate(options);
  first.tables.t1.x = 123; first.decorations.length = 0; first.variants.order.sequence.push(99);
  assert.deepEqual(options, saved);
  assert.deepEqual(Layout.generate(options), Layout.generate(clone(options)));
  const seed = 'save-id:city:lot', full = generate(seed, 4, 2, 3);
  for (const phase of [3, 0, 4, 2, 1, 0, 3]) {
    const current = generate(seed, phase, 2, 3);
    for (const [id, pos] of Object.entries(current.tables)) assert.deepEqual(pos, full.tables[id]);
    for (const d of current.decorations) assert.deepEqual(d, full.decorations.find(x => x.id === d.id));
    assert.equal(Layout.validate(current).ok, true);
  }
  const reloaded = JSON.parse(JSON.stringify(full));
  assert.deepEqual(generate(reloaded.seed, reloaded.phase, reloaded.lot, reloaded.city), reloaded);
  assert.notDeepEqual(full, generate(seed, 3, 1, 3));
  assert.notDeepEqual(full, generate(seed, 3, 2, 4));
});

test('validate rejeita schemas, IDs, sobreposições, compra, bounds e variantes adulterados', () => {
  for (const bad of [null, undefined, [], 1, 'layout', {}, {phase: 100}]) assert.equal(Layout.validate(bad).ok, false);
  const base = generate();
  const mutations = [
    ['SCHEMA', x => { x.version = 2; }], ['SCHEMA', x => { x.seed = ''; }],
    ['SCHEMA', x => { x.phase = 5; }], ['SCHEMA', x => { x.lot = -1; }],
    ['SCHEMA', x => { x.city = .5; }], ['SCHEMA', x => { x.tables = []; }],
    ['SCHEMA', x => { x.decorations = {}; }], ['SCHEMA', x => { x.variants = null; }],
    ['TABLE_SCHEMA', x => { delete x.tables.t1; }],
    ['TABLE_SCHEMA', x => { x.tables.t1.x = NaN; }], ['TABLE_SCHEMA', x => { x.tables.t2.z = Infinity; }],
    ['TABLE_SCHEMA', x => { x.tables.t1 = null; }],
    ['TABLE_ID', x => { x.tables.g2 = {x: 0, z: 4, slot: 'g2'}; }],
    ['TABLE_SLOT', x => { x.tables.t1.slot = 't7'; }],
    ['TABLE_SLOT', x => { x.tables.t1.slot = x.tables.t2.slot; }],
    ['TABLE_BOUNDS', x => { x.tables.t1.x = -7; }], ['TABLE_BOUNDS', x => { x.tables.t1.z = 8; }],
    ['OVERLAP', x => { x.tables.t1.x = x.tables.t2.x; x.tables.t1.z = x.tables.t2.z; }],
    ['CORRIDOR', x => { x.tables.t1.x = 0; }],
    ['PURCHASE_OVERLAP', x => { x.tables.t1.x = -5.4; x.tables.t1.z = 3.1; }],
    ['VARIANTS', x => { x.variants.spawn.intervalScale = 0; }],
    ['VARIANTS', x => { x.variants.order.sequence = [0, 0, 0, 0, 0]; }],
    ['VARIANTS', x => { x.variants.order.sequence = [0, 1, 2, 3, 9]; }],
    ['VARIANTS', x => { x.variants.order.sequence = new Array(5); }],
    ['VARIANTS', x => { x.variants.resources.stockScale = -1; }],
    ['VARIANTS', x => { x.variants.challenge.optional = false; }],
    ['VARIANTS', x => { x.variants.challenge.timeLimit = 60; }],
    ['VARIANTS', x => { x.variants.challenge.target = 0; }]
  ];
  for (const [code, mutate] of mutations) {
    const x = clone(base); mutate(x); assert.ok(codes(x).includes(code), `${code}: ${JSON.stringify(x)}`);
  }
  const decor = {id: 'west-foyer', kind: 'plant', x: -6.15, z: 4.65, hw: .22, hd: .22, solid: true};
  const cases = [
    ['DECOR_SCHEMA', [null]], ['DECOR_SCHEMA', [decor, decor]],
    ['DECOR_SCHEMA', [{...decor, id: 'unknown'}]], ['DECOR_SCHEMA', [{...decor, kind: 'wall'}]],
    ['DECOR_SCHEMA', [{...decor, hw: -1}]], ['DECOR_SCHEMA', [{...decor, hd: 1}]],
    ['DECOR_SCHEMA', [{...decor, x: NaN}]], ['DECOR_SCHEMA', new Array(2)],
    ['DECOR_BOUNDS', [{...decor, x: -6.6}]], ['DECOR_AREA', [{...decor, x: 0}]],
    ['CORRIDOR', [{...decor, x: 0}]],
    ['OVERLAP_FIXED', [{...decor, z: 12.4}]],
    ['PURCHASE_OVERLAP', [{...decor, x: -6.15, z: 2.9}]]
  ];
  for (const [code, decorations] of cases) assert.ok(codes({...base, decorations}).includes(code), code);
  const early = generate(1, 0); early.tables.t9 = {x: 9.3, z: 10.8, slot: 't9'};
  assert.ok(codes(early).includes('TABLE_ID'));
  const future = generate(1, 0); future.decorations = [{...decor, id: 'annex-back'}];
  assert.ok(codes(future).includes('DECOR_SCHEMA'));
});

test('BFS diagnostica ponto bloqueado e mutação nunca reutiliza aprovação do cache', () => {
  const good = generate(41, 0);
  assert.equal(Layout.validate(good).ok, true);
  const bad = clone(good);
  bad.tables.t1.x = -3; bad.tables.t1.z = -3.25;
  const result = Layout.validate(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.code === 'UNREACHABLE' && e.id === 'base-station:front'));
  assert.ok(result.stats.walkableCells > 0, 'diagnóstico veio do BFS');
  result.errors[0].code = 'CORROMPIDO'; result.stats.reachableCells = -999;
  assert.ok(Layout.validate(bad).errors.every(e => e.code !== 'CORROMPIDO'));
  assert.equal(Layout.validate(good).ok, true);
  assert.ok(Layout.validate(good).stats.reachableCells > 0);
});

// Checagens escalares independentes em TODAS as 200.000 amostras.
function checkGeometry(layout) {
  const boxes = [];
  const ids = C.tables.filter(t => t.phase <= layout.phase).map(t => t.id);
  assert.deepEqual(Object.keys(layout.tables), ids);
  for (const id of ids) {
    const p = layout.tables[id], original = C.tables.find(t => t.id === id);
    const slot = C.tables.find(t => t.id === p.slot);
    assert.equal(slot.phase, original.phase);
    assert.equal(p.x, slot.x); assert.equal(p.z, slot.z);
    assert.ok(p.x - 1.3 >= -6.6 && p.x + 1.3 <= C.phases[original.phase].W - .4);
    assert.ok(p.z - .55 >= 2.9 && p.z + .55 <= C.phases[original.phase].F - .4);
    assert.ok(Math.abs(p.x) - 1.3 >= 2, 'fila central livre');
    boxes.push([p.x - 1.3, p.x + 1.3, p.z - .55, p.z + .55]);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(a[1] <= b[0] || a[0] >= b[1] || a[3] <= b[2] || a[2] >= b[3], 'mesas sem sobreposição');
  }
  for (const d of layout.decorations) {
    assert.ok(d.x + d.hw <= -5.85 || (d.x - d.hw >= 5.85 && d.x + d.hw <= 6.6) || (layout.phase >= 3 && d.x - d.hw >= 10.6));
    assert.ok(d.z - d.hd >= 2.9);
  }
}

test('5.000 sementes × 4 fases × 5 lojas × 2 cidades: determinismo, variedade e conclusão', t => {
  let total = 0;
  const variants = Array.from({length: 4}, () => ({spawn: new Set(), order: new Set(), resources: new Set(), challenge: new Set()}));
  for (let seed = 0; seed < 5000; seed++) for (let phase = 0; phase < 4; phase++) for (let lot = 0; lot < 5; lot++) for (let city = 0; city < 2; city++) {
    const layout = generate(seed, phase, lot, city);
    assert.deepEqual(layout, generate(seed, phase, lot, city));
    const result = Layout.validate(layout);
    assert.equal(result.ok, true, JSON.stringify({seed, phase, lot, city, errors: result.errors}));
    assert.ok(result.stats.reachableCells > 0 && result.stats.interactions >= 27);
    checkGeometry(layout);
    permutations[phase].add(Object.values(layout.tables).map(p => p.slot).join(','));
    for (const part of Object.keys(variants[phase])) variants[phase][part].add(JSON.stringify(layout.variants[part]));
    const key = `${phase}:${layout.decorations.map(d => d.id).sort().join(',')}`;
    if (!coverage.has(key)) coverage.set(key, layout);
    total++;
  }
  assert.equal(total, 200000);
  assert.deepEqual(permutations.map(s => s.size), [2, 4, 8, 48]);
  assert.equal(coverage.size, 92, 'todas as combinações de obstáculos por fase');
  for (let phase = 0; phase < variants.length; phase++) for (const [part, set] of Object.entries(variants[phase])) {
    assert.ok(set.size >= (phase === 0 && part === 'order' ? 6 : 12), 'variedade de perfis mensurável');
  }
  t.diagnostic(`${total} layouts válidos; permutações por fase: ${permutations.map(s => s.size)}; ${coverage.size} geometrias distintas.`);
});

// Oráculo independente: outra resolução (.2), flood 4-direções, obstáculos
// expandidos e conexão de segmentos amostrada com margem de .01. Não chama
// validate nem acessa seus caches. Examina cada geometria possível do gerador.
function independentBFS(layout) {
  const phase = layout.phase, {W, F} = C.phases[phase], step = .2, radius = .35;
  const obs = [];
  function add(id, x, z, hw, hd) { obs.push({id, x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd}); }
  add('back-fixture', 6.1, -6.3, .65, .5); add('left-plant', -6.4, -.4, .35, .35);
  add('base-station', -3, -4.5, .8, .6); add('counter', 0, -1, 2.2, .6);
  add('corner-west', -6.4, F - .6, .4, .4); add('corner-east', W - .6, F - .6, .4, .4);
  if (phase === 3) add('annex-counter', 8.9, -1, 1.4, .6);
  const zones = C.purchaseZones.filter(z => z.phase <= phase);
  for (const z of zones) if (z.hw) add(z.id, z.x, z.z, z.hw, z.hd);
  for (const [id, p] of Object.entries(layout.tables)) add(id, p.x, p.z, 1.3, .55);
  for (const d of layout.decorations) if (d.solid) add(d.id, d.x, d.z, d.hw, d.hd);
  function free(x, z, ignore, margin = 0) {
    return x >= -6.6 && x <= W - .4 && z >= -6.6 && z <= F - .4 &&
      obs.every(o => o.id === ignore || x < o.x0 - radius - margin || x > o.x1 + radius + margin || z < o.z0 - radius - margin || z > o.z1 + radius + margin);
  }
  const nx = Math.floor((W + 6.2) / step) + 1, nz = Math.floor((F + 6.2) / step) + 1;
  const cells = new Uint8Array(nx * nz), reached = new Uint8Array(nx * nz), queue = [];
  const position = i => ({x: -6.6 + (i % nx) * step, z: -6.6 + Math.floor(i / nx) * step});
  for (let i = 0; i < cells.length; i++) { const p = position(i); cells[i] = +free(p.x, p.z); }
  const initial = Math.round(4.6 / step) * nx + Math.round(8.6 / step);
  assert.equal(cells[initial], 1); reached[initial] = 1; queue.push(initial);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], col = i % nx, row = Math.floor(i / nx);
    for (const next of [col > 0 ? i - 1 : -1, col + 1 < nx ? i + 1 : -1, row > 0 ? i - nx : -1, row + 1 < nz ? i + nx : -1]) {
      // AABB expandido tem largura/profundidade >= .7 > step; uma aresta
      // horizontal/vertical entre nós livres não pode atravessar seu interior.
      if (next >= 0 && cells[next] && !reached[next]) { reached[next] = 1; queue.push(next); }
    }
  }
  function connection(a, b, ignore) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .01);
    for (let i = 0; i <= steps; i++) {
      const u = steps ? i / steps : 0;
      if (!free(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u, ignore, .01)) return false;
    }
    return true;
  }
  function accessible(x, z, ignore) {
    if (!free(x, z, ignore)) return false;
    const range = ignore ? 2 : .4, col = Math.round((x + 6.6) / step), row = Math.round((z + 6.6) / step);
    for (let dz = -Math.ceil(range / step); dz <= Math.ceil(range / step); dz++) for (let dx = -Math.ceil(range / step); dx <= Math.ceil(range / step); dx++) {
      const cx = col + dx, cz = row + dz, i = cz * nx + cx;
      if (cx >= 0 && cx < nx && cz >= 0 && cz < nz && reached[i] && connection({x, z}, position(i), ignore)) return true;
    }
    return false;
  }
  function interaction(x, z, ignore) {
    if (accessible(x, z, ignore)) return true;
    for (const r of [.4, .8]) for (let a = 0; a < 8; a++) if (accessible(x + r * Math.cos(a * Math.PI / 4), z + r * Math.sin(a * Math.PI / 4), ignore)) return true;
    return false;
  }
  assert.ok(accessible(2, -2)); assert.ok(accessible(-3, -3.25));
  assert.ok(accessible(0, F - .5), 'entrada');
  for (let z = 1.5; z < F - .4; z++) assert.ok(accessible(0, z), 'fila central');
  for (const x of [-1.3, -.15, 1, ...(phase === 3 ? [8.3, 9.5] : [])]) {
    assert.ok(accessible(x, -2.2), 'entrega balcão'); assert.ok(accessible(x, .15), 'serviço balcão');
  }
  for (const [id, p] of Object.entries(layout.tables)) {
    assert.ok(accessible(p.x, p.z + .95), `limpeza ${id}`);
    for (const side of [-1, 1]) assert.ok(accessible(p.x + side * .98, p.z + .95) || accessible(p.x + side * .98, p.z - .95), `cadeira ${id}/${side}`);
    assert.ok(interaction(p.x, p.z, id), `compra ${id}`);
  }
  for (const z of zones) {
    if (z.hw) assert.ok(interaction(z.x + z.dx, z.z + z.dz), `estação ${z.id}`);
    assert.ok(interaction(z.x, z.z, z.id), `compra ${z.id}`);
  }
}

test('BFS independente confirma as 92 geometrias, inclusive compras e anexo', t => {
  assert.equal(coverage.size, 92, 'rodar depois da matriz de sementes');
  for (const [key, layout] of coverage) {
    try { independentBFS(layout); } catch (error) { error.message = `${key}: ${error.message}`; throw error; }
  }
  t.diagnostic('92 geometrias percorridas por BFS independente; raio .35 e resolução .2.');
});
