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
    team[id] = e; return e;
  }
  const log = (e, t, txt) => { e.hist.unshift({t, txt}); e.hist.length = Math.min(e.hist.length, 12); };

  // soma XP e devolve os eventos (subidas de nível e promoções) para a interface mostrar
  function gainXP(e, amount, now = Date.now()) {
    const ev = [];
    if (e.lv >= LV_MAX || !(amount > 0)) return ev;
    e.xp += amount;
    while (e.lv < LV_MAX && e.xp >= xpNeed(e.lv)) {
      e.xp -= xpNeed(e.lv); const before = rankIdx(e.lv); e.lv++;
      const promo = rankIdx(e.lv) > before;
      ev.push({e, lv: e.lv, promo, rank: RANKS[rankIdx(e.lv)].name});
      if (promo) log(e, now, `Promoção para ${RANKS[rankIdx(e.lv)].name} (nível ${e.lv})`);
      else if (e.lv % 5 === 0) log(e, now, `Chegou ao nível ${e.lv}`);
    }
    if (e.lv >= LV_MAX) e.xp = 0;
    return ev;
  }

  // bônus somados de uma loja (lista de funcionários dela)
  function bonus(t) {
    const b = {speed: 0, price: 0, xp: 0, offline: 0, upCost: 0, pat: 0, syn: activeSyn(t)};
    for (const s of b.syn) for (const k in s.b) b[k] += s.b[k];
    for (const e of t) {
      const s = skillLv(e);
      b.price += .0025 * (e.lv - 1); // qualidade cresce com a experiência
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
  const agility = (e, b, cleaning) => 1 + .015 * (e.lv - 1) + (e.sk === 'maos' ? .08 * skillLv(e) : 0) + (e.spec === 'cozinha' ? .1 : 0) + (cleaning && e.spec === 'limpeza' ? .15 : 0) + (b ? b.speed : 0);
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
    OFF_BASE_H, OFF_STEP_H, OFF_LV_MAX, XP_ONLINE_MIN, XP_OFF_K, offCapH, clockGuard, offMinutes};
})(typeof window !== 'undefined' ? window : globalThis);
