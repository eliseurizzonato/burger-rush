// Equipe do Burger Rush: níveis, cargos, habilidades, especializações, sinergias e ganhos offline.
// Só regras puras (sem DOM nem Three.js), para rodar igual no jogo e nos testes em Node.
'use strict';
(function (root) {
  const LV_MAX = 30;
  // XP para passar do nível lv para o lv + 1
  const xpNeed = lv => Math.round(40 * Math.pow(lv, 1.6));
  // cargos: cada promoção troca o uniforme e libera responsabilidades novas
  const RANKS = [
    {lv: 1, name: 'Estagiário', shirt: 0x9aa7b4, perk: 'Começando na casa'},
    {lv: 5, name: 'Auxiliar', shirt: 0x4f8ff7, perk: 'Carrega +1 item'},
    {lv: 10, name: 'Cozinheiro', shirt: 0x2bb3a3, perk: 'Habilidade nível 2'},
    {lv: 15, name: 'Chef de linha', shirt: 0x8a4fd8, perk: 'Carrega +1 item e treina novatos'},
    {lv: 20, name: 'Sous-chef', shirt: 0xe04f8a, perk: 'Habilidade nível 3'},
    {lv: 25, name: 'Chef executivo', shirt: 0xe0a01a, perk: 'Habilidade nível 4 e uniforme dourado'},
  ];
  const rankIdx = lv => { let i = 0; while (RANKS[i + 1] && lv >= RANKS[i + 1].lv) i++; return i; };
  const rankOf = e => RANKS[rankIdx(e.lv)];
  const nextRank = e => RANKS[rankIdx(e.lv) + 1] || null;
  // Graduação mantém os mesmos marcos/cores. Profissão vem do role, nunca do
  // nome genérico em RANKS (metadados legados usados pelo main).
  const JOB_TITLES = {
    helper: ['Ajudante iniciante', 'Ajudante', 'Ajudante experiente', 'Supervisor de balcão', 'Líder de atendimento', 'Gerente de salão'],
    cleaner: ['Faxineiro iniciante', 'Faxineiro', 'Faxineiro experiente', 'Especialista em limpeza', 'Líder de limpeza', 'Supervisor de limpeza'],
  };
  const jobTitle = e => e && Object.hasOwn(JOB_TITLES, e.role) ? JOB_TITLES[e.role][rankIdx(e.lv)] : 'Funcionário';
  const skillLv = e => { const r = rankIdx(e.lv); return 1 + (r >= 2) + (r >= 4) + (r >= 5); };
  const carryBonus = e => { const r = rankIdx(e.lv); return (r >= 1) + (r >= 3); };

  // habilidade exclusiva: sorteada na contratação e mantida em todas as promoções (só sobe de nível)
  const SKILLS = {
    maos: {name: 'Mãos Rápidas', icon: '⚡', desc: s => `+${8 * s}% de agilidade deste funcionário`},
    receita: {name: 'Receita Perfeita', icon: '⭐', desc: s => `Lanches da loja valem +${2 * s}%`},
    economia: {name: 'Economia de Ingredientes', icon: '🥬', desc: s => `Melhorias da loja ${3 * s}% mais baratas`},
    noturno: {name: 'Turno Noturno', icon: '🌙', desc: s => `+${10 * s}% nos ganhos offline da loja`},
    inspirador: {name: 'Chef Inspirador', icon: '📣', desc: s => `Equipe da loja ganha +${10 * s}% de XP`},
  };
  // especialização: escolhida pelo jogador, pode ser trocada pagando
  const SPECS = {
    cozinha: {name: 'Cozinha', icon: '🍳', desc: '+10% de agilidade'},
    salao: {name: 'Atendimento', icon: '🤝', desc: 'Clientes esperam +5%'},
    gestao: {name: 'Gestão', icon: '📊', desc: '+5% nos ganhos offline'},
    limpeza: {name: 'Limpeza', icon: '🧽', desc: '+15% de agilidade limpando mesas'},
  };
  const specCost = (e, base) => Math.round(base * Math.pow(2, e.specN || 0));

  // Leituras sem mutação. speed é o multiplicador REAL de deslocamento na
  // função habitual (cleaner limpando); pat/offline são bônus fracionários da
  // equipe da mesma loja. Sem team, calcula apenas este funcionário.
  const applicableSpec = (e, key) => !!e && (e.role === 'helper' || e.role === 'cleaner') &&
    Object.hasOwn(SPECS, key) && !(e.role === 'helper' && key === 'limpeza');
  function specPreview(e, key, team) {
    const neutral = () => ({speed: 1, pat: 0, offline: 0});
    if (!e || !Number.isFinite(e.lv) || e.lv < 1 || e.lv > LV_MAX || (e.role !== 'helper' && e.role !== 'cleaner'))
      return {ok: false, reason: 'invalid-employee', before: neutral(), after: neutral()};
    const supplied = Array.isArray(team) ? team : team && typeof team === 'object' ? Object.values(team) : [];
    const members = supplied.filter(other => other && other.r === e.r);
    const isEmployee = other => other === e || (typeof e.id === 'string' && other.id === e.id);
    if (!members.some(isEmployee)) members.push(e);
    const attributes = candidate => {
      const b = bonus(members.map(other => isEmployee(other) ? candidate : other));
      return {speed: agility(candidate, b, candidate.role === 'cleaner'), pat: b.pat, offline: b.offline};
    };
    const before = attributes(e);
    const failed = reason => ({ok: false, reason, before, after: {...before}});
    if (!Object.hasOwn(SPECS, key)) return failed('invalid-spec');
    if (!applicableSpec(e, key)) return failed('inapplicable');
    if (e.spec === key) return failed('same-spec');
    const after = attributes({...e, spec: key});
    if (![before, after].every(a => Object.values(a).every(Number.isFinite))) return failed('invalid-team');
    if (!Object.keys(before).some(k => Math.abs(after[k] - before[k]) > 1e-12)) return failed('no-effect');
    return {ok: true, before, after};
  }
  const canSpecialize = (e, key) => applicableSpec(e, key) && specPreview(e, key).ok;

  // wallet é SALDO NUMÉRICO. Não altera wallet/S.money: main só atribui
  // result.money em ok:true, sem descontar novamente. Retornos before/after
  // usam o funcionário sozinho; para totais da loja use specPreview(...,team).
  // Falhas não mutam o funcionário e sempre devolvem cost:0 (não houve débito).
  function specialize(e, key, wallet, base, now = Date.now()) {
    const preview = specPreview(e, key), {before, after} = preview;
    const fail = reason => ({ok: false, reason, money: wallet, cost: 0, before, after: {...before}});
    if (!preview.ok) return fail(preview.reason);
    if (!Number.isFinite(wallet) || wallet < 0) return fail('invalid-wallet');
    if (!Number.isFinite(base) || base <= 0) return fail('invalid-base');
    if (!Number.isFinite(now) || now < 0) return fail('invalid-time');
    const swaps = e.specN === undefined ? 0 : e.specN;
    if (!Number.isSafeInteger(swaps) || swaps < 0) return fail('invalid-counter');
    const cost = specCost(e, base);
    if (!Number.isSafeInteger(cost) || cost <= 0) return fail('invalid-cost');
    if (wallet < cost) return fail('insufficient-money');
    const money = wallet - cost;
    if (!Number.isFinite(money) || money >= wallet) return fail('invalid-wallet');
    e.spec = key; e.specN = swaps + 1;
    const last = Array.isArray(e.hist) && e.hist.length ? e.hist[0].t : 0;
    const t = Math.max(now, Number.isFinite(last) ? last : 0, e.progress && Number.isFinite(e.progress.clock) ? e.progress.clock : 0);
    if (!Array.isArray(e.hist)) e.hist = [];
    log(e, t, `Especialização: ${SPECS[key].name}`);
    return {ok: true, money, cost, before, after};
  }

  // Migração explícita e gratuita, chamada pelo initStaff do main por registro.
  // Slots existentes são a fonte do role: h1-h4 helper, c1 cleaner. Não cria
  // slots, não altera identidade/id/r, XP, skills, specN, histórico ou moedas.
  // Especialização incompatível/ausente vira o padrão da profissão. Sem reembolso.
  function repairRole(team, key) {
    const match = typeof key === 'string' && /^(0|[1-9]\d*):(h[1-4]|c1)$/.exec(key);
    if (!match) return {ok: false, reason: 'invalid-slot'};
    const e = team && Object.hasOwn(team, key) && team[key];
    if (!e || typeof e !== 'object') return {ok: false, reason: 'missing-slot'};
    const role = match[2][0] === 'h' ? 'helper' : 'cleaner';
    const spec = applicableSpec({...e, role}, e.spec) ? e.spec : role === 'cleaner' ? 'limpeza' : 'cozinha';
    const changed = e.role !== role || e.spec !== spec;
    e.role = role; e.spec = spec;
    return {ok: true, changed, role, spec};
  }

  // sinergias: combinações de cargos e habilidades na mesma loja (no máximo MAX_SYN ativas)
  const MAX_SYN = 3;
  const has = (t, f, n = 1) => t.filter(f).length >= n;
  const SYNERGIES = [
    {id: 'dupla', name: 'Dupla da Chapa', icon: '🔥', req: '2 ajudantes no nível 5+', txt: '+10% de agilidade da equipe', b: {speed: .1}, ok: t => has(t, e => e.role === 'helper' && e.lv >= 5, 2)},
    {id: 'impecavel', name: 'Cozinha Impecável', icon: '✨', req: '1 ajudante e 1 faxineiro no nível 10+', txt: '+5% no valor dos lanches', b: {price: .05}, ok: t => has(t, e => e.role === 'helper' && e.lv >= 10) && has(t, e => e.role === 'cleaner' && e.lv >= 10)},
    {id: 'mentor', name: 'Mestre e Aprendiz', icon: '🎓', req: '1 funcionário no nível 15+ e 1 abaixo do 5', txt: '+50% de XP para a equipe', b: {xp: .5}, ok: t => has(t, e => e.lv >= 15) && has(t, e => e.lv < 5)},
    {id: 'madrugada', name: 'Turno da Madrugada', icon: '🌙', req: '2 funcionários com Turno Noturno', txt: '+20% nos ganhos offline', b: {offline: .2}, ok: t => has(t, e => e.sk === 'noturno', 2)},
    {id: 'brigada', name: 'Brigada Completa', icon: '🧑‍🍳', req: '3 ajudantes e 1 faxineiro', txt: '+10% offline e +5% de agilidade', b: {offline: .1, speed: .05}, ok: t => has(t, e => e.role === 'helper', 3) && has(t, e => e.role === 'cleaner')},
    {id: 'estrelas', name: 'Inspiração Coletiva', icon: '🌟', req: 'Chef Inspirador e Receita Perfeita juntos', txt: '+5% no valor dos lanches', b: {price: .05}, ok: t => has(t, e => e.sk === 'inspirador') && has(t, e => e.sk === 'receita')},
  ];
  const activeSyn = t => SYNERGIES.filter(s => s.ok(t)).slice(0, MAX_SYN);

  const NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabi', 'Heitor', 'Iara', 'João', 'Kátia', 'Léo', 'Marina', 'Nina', 'Otávio', 'Paula', 'Rafa', 'Sofia', 'Téo', 'Vitória', 'Yuri', 'Zeca', 'Bia', 'Caio', 'Duda', 'Enzo', 'Lara', 'Mateus', 'Pietra', 'Sami'];
  const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

  // cria o registro de um funcionário (id = "loja:área", ex.: "0:h1")
  function hire(team, id, role, now = Date.now(), lv = 1) {
    if (team[id]) return team[id];
    const h = hash(id + ':' + now), used = new Set(Object.values(team).map(e => e.n));
    const free = NAMES.filter(n => !used.has(n)), keys = Object.keys(SKILLS);
    const e = {id, r: +id.split(':')[0], role, n: (free.length ? free : NAMES)[h % (free.length || NAMES.length)], lv: Math.max(1, Math.min(LV_MAX, lv)), xp: 0,
      sk: keys[(h >>> 8) % keys.length], spec: role === 'cleaner' ? 'limpeza' : 'cozinha', specN: 0, av: (h >>> 16) % 4, hair: (h >>> 20) % 5,
      hist: [{t: now, txt: lv > 1 ? `Veterano da casa, começou no nível ${lv}` : 'Contratado'}]};
    profile(e);
    team[id] = e; return e;
  }
  const log = (e, t, txt) => { e.hist.unshift({t, txt}); e.hist.length = Math.min(e.hist.length, 12); };

  // soma XP e devolve os eventos (subidas de nível e promoções) para a interface mostrar
  function gainXP(e, amount, now = Date.now()) {
    const ev = [];
    if (typeof amount !== 'number' || !Number.isFinite(amount) || !(amount > 0)) return ev;
    const p = progress(e, now); p.xp = Math.min(Number.MAX_SAFE_INTEGER, p.xp + amount);
    if (e.lv >= LV_MAX) return ev;
    e.xp += amount;
    while (e.lv < LV_MAX && e.xp >= xpNeed(e.lv)) {
      e.xp -= xpNeed(e.lv); const before = rankIdx(e.lv); e.lv++;
      const promo = rankIdx(e.lv) > before;
      const title = jobTitle(e);
      ev.push({e, lv: e.lv, promo, rank: title});
      if (promo) log(e, now, `Promoção para ${title} (nível ${e.lv})`);
      else if (e.lv % 5 === 0) log(e, now, `Chegou ao nível ${e.lv}`);
    }
    if (e.lv >= LV_MAX) e.xp = 0;
    return ev;
  }

  // Perfil e objetivos são migrados sob demanda nos saves antigos. uid é da pessoa,
  // id/r são do posto de trabalho e mudam na transferência. Nunca recalcular uid.
  const STORIES = ['Aprendeu receitas com a família e sonha em ensinar.', 'Começou atendendo no bairro e adora conhecer clientes.', 'Trocou de carreira para trabalhar com comida.', 'Guarda um caderno de receitas e ideias para a loja.'];
  const TALENTS = ['Organização', 'Criatividade', 'Trabalho em equipe', 'Atenção aos detalhes'];
  const PREFERENCES = ['Cozinha movimentada', 'Balcão organizado', 'Equipe reunida', 'Ambiente tranquilo'];
  const OBJECTIVES = [
    {id: 'primeiro-turno', name: 'Encontrar seu ritmo', metric: 'work', target: 30, uniform: 'staff-mint', bonus: .005},
    {id: 'aprender', name: 'Aprender com a equipe', metric: 'xp', target: 600, uniform: null, bonus: .005},
    {id: 'da-casa', name: 'Virar referência da casa', metric: 'work', target: 200, uniform: 'staff-gold', bonus: .005},
  ];
  const UNIFORMS = {
    'staff-mint': {name: 'Uniforme menta', shirt: 0x2bb3a3},
    'staff-gold': {name: 'Uniforme dourado da equipe', shirt: 0xe0a01a},
  };
  function profile(e) {
    if (!e.uid) e.uid = `${e.id}@${e.hist && e.hist.length ? e.hist[e.hist.length - 1].t : 0}:${e.n}`;
    if (!e.profile) {
      const h = hash(e.uid);
      e.profile = {story: STORIES[h % STORIES.length], talent: TALENTS[(h >>> 5) % TALENTS.length],
        preference: PREFERENCES[(h >>> 10) % PREFERENCES.length], objective: e.role === 'cleaner' ? 'Deixar cada mesa pronta para o próximo cliente' : 'Servir lanches que façam o cliente voltar'};
    }
    return e.profile;
  }
  function progress(e, now = Date.now()) {
    profile(e);
    if (!e.progress) e.progress = {work: 0, xp: 0, claimed: {}, uniforms: [], clock: 0};
    e.progress.clock = Math.max(e.progress.clock || 0, Number.isFinite(now) ? now : 0);
    return e.progress;
  }
  function objectives(e) {
    const p = progress(e, 0);
    return OBJECTIVES.map(o => ({...o, progress: Math.min(o.target, p[o.metric]), claimed: !!p.claimed[o.id], ready: p[o.metric] >= o.target && !p.claimed[o.id]}));
  }
  const goal = e => objectives(e).find(o => !o.claimed) || null;
  // Chamar uma vez por tarefa REAL concluída pelo funcionário; não deriva de frames.
  function recordWork(e, amount = 1, now = Date.now()) {
    const p = progress(e, now);
    if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) p.work = Math.min(Number.MAX_SAFE_INTEGER, p.work + Math.floor(amount));
    return objectives(e);
  }
  function claimObjective(e, id, now = Date.now()) {
    const o = OBJECTIVES.find(o => o.id === id), p = progress(e, now);
    if (!o || p.claimed[id] || p[o.metric] < o.target) return {ok: false, reason: 'not-ready'};
    p.claimed[id] = true;
    if (o.uniform && !p.uniforms.includes(o.uniform)) p.uniforms.push(o.uniform);
    log(e, p.clock, `Objetivo concluído: ${o.name}`);
    return {ok: true, id, uniform: o.uniform, bonus: o.bonus};
  }
  // Pequeno bônus de qualidade por objetivos, limitado a 1,5% por pessoa.
  const objectiveBonus = e => Math.min(.015, OBJECTIVES.reduce((n, o) => n + (e.progress && e.progress.claimed[o.id] ? o.bonus : 0), 0));

  // O main desconta o custo e reconecta crew.emp pela chave após ok:true.
  // Ambos os slots DEVEM existir, pertencer a lojas diferentes e ter o mesmo role.
  // Não altera S.r/bought, moedas, cargo, aparência, XP, skills ou especialização.
  const transferCost = (e, scale = 1) => Math.round((80 + 12 * Math.max(1, Math.min(LV_MAX, e.lv || 1))) * (Number.isFinite(scale) && scale > 0 ? Math.min(scale, 1e6) : 1));
  function transfer(team, fromKey, toKey, now = Date.now()) {
    const slot = /^(0|[1-9]\d*):(h[1-4]|c1)$/;
    const from = Object.hasOwn(team, fromKey) && team[fromKey], to = Object.hasOwn(team, toKey) && team[toKey];
    if (!slot.test(fromKey) || !slot.test(toKey) || !from || !to || from === to) return {ok: false, reason: 'missing-slot'};
    const a = +fromKey.split(':')[0], b = +toKey.split(':')[0];
    if (a === b) return {ok: false, reason: 'same-store'};
    if (from.role !== to.role || (from.role !== 'helper' && from.role !== 'cleaner') ||
        (fromKey.split(':')[1][0] === 'c') !== (from.role === 'cleaner') ||
        (toKey.split(':')[1][0] === 'c') !== (to.role === 'cleaner')) return {ok: false, reason: 'role-mismatch'};
    const t = Math.max(progress(from, now).clock, progress(to, now).clock);
    team[fromKey] = to; team[toKey] = from;
    from.id = toKey; from.r = b; to.id = fromKey; to.r = a;
    log(from, t, `Transferido para a loja ${b + 1}`); log(to, t, `Transferido para a loja ${a + 1}`);
    return {ok: true, fromKey, toKey, moved: from, swapped: to};
  }

  // Opcional: SOMENTE o main, após validar AdMob earned (ou fakeads em dev), chama.
  // receipt={id:string, earned:true, at:timestamp ms}; até 120 XP, 1/dia/pessoa.
  // Validação local é dedupe/limite, não autenticação nem proteção contra save editado.
  function rewardXP(e, amount, receipt, now = Date.now()) {
    const p = progress(e, now), t = p.clock, day = Math.floor(t / 86400000);
    if (!receipt || receipt.earned !== true || typeof receipt.id !== 'string' || !receipt.id || receipt.id.length > 128 ||
        !Number.isFinite(receipt.at) || receipt.at > t || t - receipt.at > 300000 || now < t ||
        !Number.isFinite(amount) || amount <= 0 || amount > 120) return {ok: false, reason: 'invalid-reward'};
    const ads = p.ads || (p.ads = {day: -1, receipt: '', count: 0});
    if (ads.receipt === receipt.id || (ads.day === day && ads.count >= 1)) return {ok: false, reason: 'reward-limit'};
    ads.count = ads.day === day ? ads.count + 1 : 1; ads.day = day; ads.receipt = receipt.id;
    return {ok: true, events: gainXP(e, amount, t), amount};
  }

  // bônus somados de uma loja (lista de funcionários dela)
  function bonus(t) {
    const b = {speed: 0, price: 0, xp: 0, offline: 0, upCost: 0, pat: 0, syn: activeSyn(t)};
    for (const s of b.syn) for (const k in s.b) b[k] += s.b[k];
    for (const e of t) {
      const s = skillLv(e);
      b.price += .0025 * (e.lv - 1); // qualidade cresce com a experiência
      b.price += objectiveBonus(e);
      if (e.sk === 'receita') b.price += .02 * s;
      if (e.sk === 'economia') b.upCost += .03 * s;
      if (e.sk === 'noturno') b.offline += .1 * s;
      if (e.sk === 'inspirador') b.xp += .1 * s;
      if (e.spec === 'salao') b.pat += .05;
      if (e.spec === 'gestao') b.offline += .05;
    }
    b.upCost = Math.min(.25, b.upCost);
    return b;
  }
  // agilidade de um funcionário (multiplica a velocidade de andar)
  const agility = (e, b, cleaning) => 1 + .015 * (e.lv - 1) + (e.sk === 'maos' ? .08 * skillLv(e) : 0) + (e.spec === 'cozinha' ? .1 : 0) + (cleaning && e.role === 'cleaner' && e.spec === 'limpeza' ? .15 : 0) + (b ? b.speed : 0);
  // faturamento por minuto sem o jogador: equipe melhor rende mais
  const rateMult = (t, b = bonus(t)) => 1 + b.price + .5 * b.speed + .2 * t.reduce((a, e) => a + .015 * (e.lv - 1), 0) / Math.max(1, t.length);

  // ---------- ganhos offline ----------
  const OFF_BASE_H = 8, OFF_STEP_H = 2, OFF_LV_MAX = 4, OFF_FULL_MIN = 120, OFF_TAIL = .5;
  const XP_ONLINE_MIN = 50, XP_OFF_K = .25; // ~XP por minuto de quem trabalha (medido no jogo); offline rende 25%
  const offCapH = lv => OFF_BASE_H + OFF_STEP_H * Math.min(OFF_LV_MAX, lv || 0);
  // relógio: guarda o maior horário já visto; voltar o relógio não gera ganhos
  function clockGuard(S, now = Date.now()) {
    const hi = Math.max(S.clk || 0, S.last || 0), back = hi - now > 10 * 60000;
    S.clk = Math.max(hi, now);
    return {back, away: back ? 0 : Math.max(0, now - (S.last || now))};
  }
  // ms ausente -> minutos que contam (2 h cheias, depois metade até o limite)
  function offMinutes(ms, capH) {
    const m = Math.min(Math.max(0, ms) / 60000, capH * 60);
    return {real: m, eff: Math.min(m, OFF_FULL_MIN) + Math.max(0, m - OFF_FULL_MIN) * OFF_TAIL};
  }

  root.Staff = {LV_MAX, xpNeed, RANKS, rankIdx, rankOf, nextRank, skillLv, carryBonus, SKILLS, SPECS, specCost, SYNERGIES, MAX_SYN, activeSyn, NAMES, hire, log, gainXP, bonus, agility, rateMult,
    OFF_BASE_H, OFF_STEP_H, OFF_LV_MAX, XP_ONLINE_MIN, XP_OFF_K, offCapH, clockGuard, offMinutes,
    profile, OBJECTIVES, UNIFORMS, objectives, goal, recordWork, claimObjective, objectiveBonus, transferCost, transfer, rewardXP,
    jobTitle, canSpecialize, specPreview, specialize, repairRole};
})(typeof window !== 'undefined' ? window : globalThis);
