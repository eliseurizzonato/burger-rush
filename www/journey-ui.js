/* JourneyUI.mount(root,{S,context,onChange,notify}) -> {render(tab?),act(kind,id),destroy()}.
 * context é objeto ou () => ctx; onChange(result,S) roda após ação ok para salvar,
 * atualizar HUD e aplicar result.snapshot.palette na cena pelo main.
 * render não paga recompensas. O main pode chamá-lo no seu tick quando visível
 * para atualizar contagens e relógio. Sem intervalos, storage, rede ou ads aqui.
 * Abas: challenges/rewards/collection/decoration (aceita rótulos pt-BR também).
 * Aproveita features.css, com fallback isolado para preview/embedding browser.
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.JourneyUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';
  const mounted = new WeakMap(); let serial = 0;
  const TABS = [['challenges', 'DESAFIOS'], ['rewards', 'RECOMPENSAS'], ['collection', 'COLEÇÃO'], ['decoration', 'DECORAÇÃO']];
  const escape = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const num = n => Math.floor(n || 0).toLocaleString('pt-BR');
  const time = ms => { const s = Math.ceil(Math.max(0, ms) / 1000); return s >= 86400 ? `${Math.ceil(s / 86400)} dias` : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const color = n => '#' + n.toString(16).padStart(6, '0');
  const CSS = `
.journey{color:#2b2140;font-family:'Fredoka',system-ui,sans-serif;text-align:left;min-width:0;width:100%;box-sizing:border-box;padding-bottom:calc(8px + env(safe-area-inset-bottom));overflow-wrap:anywhere}
.journey *{box-sizing:border-box}.journey h2{margin:0;font-size:24px}.journey h3{font-size:18px;margin:16px 0 8px}.journey h4{margin:0;font-size:16px}.journey p{margin:5px 0;line-height:1.4}.journey small{font-size:12px;line-height:1.4;color:#6d6280}
.journey .j-head{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}.journey .j-cash{padding:8px 12px;border-radius:20px;background:#fff;font-weight:700;color:#1c8a31}
.journey .feature-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.journey .feature-tabs button{flex:1 1 120px;min-height:44px;min-width:0;border:0;border-radius:12px;background:#eee4f5;color:#2b2140;padding:8px 5px;font:700 11px 'Fredoka',system-ui;cursor:pointer}.journey .feature-tabs [aria-selected=true]{background:#2b2140;color:#fff}
.journey .feature-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.journey .feature-card{min-width:0;background:#fff;border-radius:16px;padding:12px;box-shadow:0 2px 0 #00000014}.journey .feature-note{font-size:13px;color:#6d6280;line-height:1.4}.journey .feature-actions{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-top:10px}.journey .feature-stats{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.journey .feature-stats span{flex:1 1 90px;background:#fff;border-radius:12px;padding:8px;font-size:12px}.journey .feature-stats b{display:block;font-size:17px;color:#1c8a31}
.journey .btn{min-height:44px;min-width:44px;max-width:100%;white-space:normal;font:700 14px 'Fredoka',system-ui;padding:9px 13px;color:#fff;background:#2fbf4a;border:0;border-bottom:4px solid #1c8a31;border-radius:12px;cursor:pointer}.journey .btn:disabled{background:#c9c1d3;color:#453852;border-bottom-color:#a69db2;cursor:default}.journey button:focus-visible{outline:3px solid #2b2140;outline-offset:3px}
.journey .j-progress{height:10px;background:#eee4f5;border-radius:10px;overflow:hidden;margin:8px 0}.journey .j-progress i{display:block;height:100%;background:#2fbf4a;border-radius:10px}.journey .j-reward{font-size:13px;color:#1c8a31}.journey .j-swatches{display:flex;gap:8px;flex-wrap:wrap}.journey .j-swatch{width:44px;height:44px;border-radius:12px;border:2px solid #2b214033;display:inline-block;flex:none}.journey .j-swatch-row{display:flex;align-items:center;gap:8px;margin-bottom:7px}.journey .j-odds{margin:8px 0;padding-left:20px;font-size:13px;line-height:1.5}.journey .j-feedback{font-size:13px;color:#1c8a31;min-height:18px}.journey .j-history{padding-left:20px;font-size:12px;line-height:1.5}.journey .j-tag{font-size:12px;color:#1c8a31;font-weight:700}
@media(min-width:700px){.journey .feature-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.journey .feature-tabs button{flex-basis:100px}}@media(max-width:380px){.journey .feature-card{padding:10px}.journey .feature-tabs button{font-size:10px}}
`;
  function mount(root, options) {
    if (!root || typeof root.addEventListener !== 'function') throw new TypeError('JourneyUI exige um elemento root');
    const J = global.Journey;
    if (!J || !options || !options.S) throw new TypeError('Carregue Journey e informe S antes de montar JourneyUI');
    if (mounted.has(root)) mounted.get(root).destroy();
    const {S, onChange, notify} = options, uid = 'journey-' + (++serial);
    let tab = 'challenges', message = '', dead = false;
    const context = () => (typeof options.context === 'function' ? options.context() : options.context) || {};
    const button = (kind, id, text, enabled = true) => `<button type="button" class="btn" data-j-kind="${escape(kind)}" data-j-id="${escape(id)}"${enabled ? '' : ' disabled'}>${escape(text)}</button>`;
    const bar = (progress, target, label) => `<div class="j-progress" role="progressbar" aria-label="${escape(label)}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.min(target, progress)}"><i style="width:${Math.min(100, 100 * progress / target)}%"></i></div><small>${num(Math.min(progress, target))} / ${num(target)}</small>`;
    const itemName = id => { const c = J.COSMETICS.find(x => x.id === id); return c ? c.name : id === 'recipe-season-house' ? 'Receita da casa (coleção)' : id === 'recipe-season-festival' ? 'Receita do festival (coleção)' : id; };
    const rewardText = r => [r.money ? '$' + num(r.money) : '', r.xp ? num(r.xp) + ' XP de temporada' : '', r.item ? itemName(r.item) : '', r.collectible ? itemName(r.collectible) : ''].filter(Boolean).join(' · ');
    const card = (title, content, icon = '') => `<article class="feature-card"><h4>${icon ? icon + ' ' : ''}${escape(title)}</h4>${content}</article>`;
    function challenges(s) {
      const cards = s.challenges.map(c => {
        const status = c.claimed ? 'Concluído hoje' : c.ready ? 'Prêmio disponível' : c.expired ? 'Prazo encerrado · tente novamente' : c.started !== null ? `${time(c.remaining)} restantes · loja ${Number(c.store) + 1}` : `${time(c.duration)} após iniciar · loja ${Number(c.store) + 1}`;
        return card(c.name, `<p class="feature-note">${escape(status)}</p>${bar(c.progress, c.target, c.name)}<p class="j-reward">${escape(rewardText(c))}</p><div class="feature-actions">${c.canStart ? button('start', c.id, c.expired ? 'Tentar de novo' : 'Iniciar') : button('challenge', c.id, c.claimed ? 'Recebido' : c.ready ? 'Resgatar' : 'Em andamento', c.ready)}</div>`, c.icon);
      }).join('');
      const season = s.season;
      const steps = season.track.map(step => card(step.name, `<p class="feature-note">${num(step.xp)} XP necessários · ${escape(rewardText({...step, xp: 0}))}</p>${bar(season.xp, step.xp, step.name)}<div class="feature-actions">${button('season', step.id, step.claimed ? 'Recebido' : 'Resgatar', step.ready)}</div>`)).join('');
      const pending = season.pending.map(step => card('Prêmio da temporada anterior', `<p class="j-reward">${escape(rewardText({...step, xp: 0, money: step.money ? Math.round(step.money * step.scale) : 0}))}</p><div class="feature-actions">${button('season', step.id, 'Resgatar pendente')}</div>`)).join('');
      return `<p class="feature-note">Ative um desafio e jogue na loja indicada. Cada desafio paga uma vez por dia (UTC). Atendimento e limpeza rendem participação.</p><div class="feature-grid">${cards}</div><h3>🌤️ Temporada ${season.index + 1} · 14 dias</h3><p class="feature-note">${num(season.xp)} XP · termina em ${time(season.remaining)}. XP vem do jogo; resgate cada etapa uma vez. Receitas liberam pratos no laboratório e ficam na coleção.</p><div class="feature-grid">${pending}${steps}</div>`;
    }
    function rewards(s) {
      const chests = s.chests.map(c => card(c.name, `<p class="feature-note">Participação · renova em ${time(c.reset - s.now)} · prêmio ${c.multiplier}×</p>${bar(c.progress, c.target, c.name)}<div class="feature-actions">${button('chest', c.id, c.claimed ? 'Recebido' : 'Abrir baú', c.ready)}</div>`, '🎁')).join('');
      const spin = card('Roleta gratuita', `<p class="feature-note">Uma tentativa a cada 6 horas.${s.spin.extra ? ' Há 1 giro extra disponível.' : ''} ${s.spin.ready ? 'Pronta para girar.' : 'Novo giro em ' + time(s.spin.remaining) + '.'}</p><div class="feature-actions">${button('spin', 'free', 'Girar grátis', s.spin.ready)}</div>`, '🎡');
      const rare = card('Uniforme dourado garantido', `<p class="feature-note">Junte participação jogando. Não depende da sorte; não exige anúncios.</p>${bar(s.rare.progress, s.rare.target, 'Participação para uniforme dourado')}<div class="feature-actions">${button('rare', 'participation', s.rare.claimed ? 'Recebido' : 'Resgatar uniforme', s.rare.ready)}</div>`, '✨');
      const odds = s.chances.map(p => `<li><b>${Math.round(p.chance * 100)}%</b> · ${escape(p.name)} · ${escape(rewardText(p))}${p.item ? ' (se já possui, mantém as moedas)' : ''}</li>`).join('');
      const actionNames = {spin: 'Giro grátis', chest: 'Baú', challenge: 'Desafio resgatado', start: 'Desafio iniciado', season: 'Temporada', collection: 'Coleção', buy: 'Compra', equip: 'Equipado', 'earned-xp': 'XP opcional', 'earned-spin': 'Giro extra opcional'};
      const history = s.stats.history.slice(0, 6).map(h => {
        const challenge = J.CHALLENGES.find(c => c.id === h.id), cosmetic = J.COSMETICS.find(c => c.id === h.id);
        const name = challenge ? challenge.name : cosmetic ? cosmetic.name : h.id === 'daily' ? 'Diário' : h.id === 'weekly' ? 'Semanal' : '';
        return `<li>${escape(actionNames[h.kind] || 'Recompensa')}${name ? ' · ' + escape(name) : ''}${h.money ? ' · ' + (h.money > 0 ? '+' : '−') + '$' + num(Math.abs(h.money)) : ''}</li>`;
      }).join('');
      const summary = stats => `+$${num(stats.earned)} ganhos · −$${num(stats.spent)} gastos · ${num(stats.claims)} resgates`;
      return `<div class="feature-grid">${chests}${spin}${rare}</div><h3>Chances abertas</h3><p class="feature-note">As mesmas chances valem para cada baú e giro. Valores abaixo são de 1×; baú semanal multiplica moedas e XP por 3. Cosmético é único.</p><ul class="j-odds">${odds}</ul><p class="feature-note">Participação: cliente = 1, VIP = 3 extras, limpeza = 1. Os pontos não são gastos nos resgates. Nenhuma tentativa paga.</p><h3>Seu jogo neste aparelho</h3><div class="feature-stats"><span>Moedas recebidas<b>$${num(s.stats.earned)}</b></span><span>Moedas utilizadas<b>$${num(s.stats.spent)}</b></span><span>Resgates<b>${num(s.stats.claims)}</b></span></div><p class="feature-note">Fluxo de moedas do seu save, incluindo empréstimos e operações da bolsa. Ao entrar, ele acompanha o progresso da sua conta; não há envio para um serviço de analytics. Histórico limitado a ${J.HISTORY_LIMIT} ações.</p><p class="feature-note"><b>Nesta sessão:</b> ${summary(s.stats.session)}<br><b>Últimos 7 dias:</b> ${summary(s.stats.last7)}</p>${history ? '<ol class="j-history">' + history + '</ol>' : ''}`;
    }
    function collection(s) {
      const cards = s.collections.map(c => card(c.name, `<p class="feature-note">${escape(c.group)} · ${escape(rewardText(c))}</p>${bar(c.progress, c.target, c.name)}<div class="feature-actions">${button('collection', c.id, c.claimed ? 'Recebido' : 'Resgatar', c.ready)}</div>`, '🏅')).join('');
      const recipes = s.collectibles.map(c => card(c.name, `<p class="feature-note">${c.owned ? 'Na coleção permanente' : 'Disponível na trilha da temporada'}</p><small>Receita permanente no laboratório; também pode ser pesquisada jogando.</small>`, '📖')).join('');
      return `<p class="feature-note">Coleções e conquistas são permanentes. Registros financeiros usam seu maior saldo e patrimônio. Bônus atual: +${Math.round(s.bonuses.price * 1000) / 10}% no valor e +${Math.round(s.bonuses.xp * 1000) / 10}% XP da equipe.</p><div class="feature-grid">${cards}${recipes}</div>`;
    }
    function decoration(s) {
      const labels = {floor: 'Piso', wall: 'Parede', counter: 'Balcão', facade: 'Fachada', equipment: 'Equipamentos', table: 'Mesas', decor: 'Decoração', uniform: 'Uniforme'};
      const preview = Object.keys(labels).map(slot => `<span title="${labels[slot]}" aria-label="${labels[slot]}" class="j-swatch" style="background:${color(s.palette[slot])}"></span>`).join('');
      return `<p class="feature-note">Personalize a loja ${Number(s.store) + 1}. Compra libera para todas as lojas; equipamento é escolhido por loja. Escolha as cores e equipe seus favoritos.</p><div class="j-swatches" aria-label="Paleta equipada">${preview}</div>${Object.keys(labels).map(slot => `<h3>${labels[slot]}</h3><div class="feature-grid">${s.cosmetics.filter(c => c.slot === slot).map(c => card(c.name, `<div class="j-swatch-row"><span aria-hidden="true" class="j-swatch" style="background:${color(c.color)}"></span><small>${c.owned ? 'Na sua coleção' : c.price ? '$' + num(c.price) : escape(c.source)}</small></div><div class="feature-actions">${c.owned ? button('equip', c.id, c.equipped ? 'Equipado' : 'Equipar', !c.equipped) : c.price ? button('buy', c.id, 'Comprar $' + num(c.price), c.affordable) : '<span class="j-tag">Desbloqueie jogando</span>'}</div>`)).join('')}</div>`).join('')}`;
    }
    function render(nextTab) {
      if (dead) return null;
      if (nextTab) {
        const next = TABS.find(([id, label]) => id === nextTab || label === String(nextTab).toUpperCase());
        if (next) tab = next[0];
      }
      const s = J.snapshot(S, context()), doc = root.ownerDocument;
      const active = doc && doc.activeElement && root.contains(doc.activeElement) ? doc.activeElement : null;
      const focus = active && (active.getAttribute('data-j-tab') ? {tab: active.getAttribute('data-j-tab')} : {kind: active.getAttribute('data-j-kind'), id: active.getAttribute('data-j-id')});
      const content = ({challenges, rewards, collection, decoration})[tab](s);
      root.innerHTML = `<section class="journey"><style>${CSS}</style><div class="j-head"><h2>🍀 Sua jornada</h2><span class="j-cash">$${num(s.money)}</span></div><nav class="feature-tabs" role="tablist" aria-label="Jornada">${TABS.map(([id, label]) => `<button type="button" role="tab" id="${uid}-${id}" aria-controls="${uid}-panel" aria-selected="${id === tab}" tabindex="${id === tab ? 0 : -1}" data-j-tab="${id}">${label}</button>`).join('')}</nav><p class="j-feedback" role="status">${escape(message)}</p><div id="${uid}-panel" role="tabpanel" aria-labelledby="${uid}-${tab}">${content}</div></section>`;
      if (focus) {
        const buttons = Array.from(root.querySelectorAll('button'));
        const target = buttons.find(b => focus.tab ? b.getAttribute('data-j-tab') === focus.tab : b.getAttribute('data-j-kind') === focus.kind && b.getAttribute('data-j-id') === focus.id);
        if (target && !target.disabled) target.focus({preventScroll: true});
      }
      if (nextTab) { const panel = root.closest('.card'); if (panel) panel.scrollTop = 0; }
      return s;
    }
    function act(kind, id) {
      if (dead) return {ok: false, reason: 'unmounted'};
      const result = J.act(S, kind, id, context());
      const reasons = {'not-ready': 'Ainda falta progresso para resgatar.', cooldown: 'Aguarde o próximo giro.', 'insufficient-money': 'Moedas insuficientes.', locked: 'Item ainda bloqueado.', 'daily-limit': 'Desafio já concluído hoje.', 'already-started': 'Este desafio já está em andamento.', 'already-equipped': 'Este item já está equipado.', 'not-purchasable': 'Item indisponível para compra.'};
      message = result.ok ? result.reward ? 'Recebido: ' + (rewardText(result.reward) || 'recompensa na coleção') : kind === 'buy' ? 'Compra concluída. Agora você pode equipar.' : kind === 'equip' ? 'Paleta equipada para esta loja.' : 'Desafio iniciado. Bom turno!' : reasons[result.reason] || 'Ação indisponível.';
      render();
      if (result.ok && typeof onChange === 'function') onChange(result, S);
      if (typeof notify === 'function') notify(message, result);
      return result;
    }
    function click(event) {
      const b = event.target && event.target.closest && event.target.closest('button');
      if (!b || !root.contains(b) || b.disabled) return;
      if (b.hasAttribute('data-j-tab')) { event.stopPropagation(); render(b.getAttribute('data-j-tab')); }
      else if (b.hasAttribute('data-j-kind')) { event.stopPropagation(); act(b.getAttribute('data-j-kind'), b.getAttribute('data-j-id')); }
    }
    function keydown(event) {
      const b = event.target;
      if (!b || !b.hasAttribute || !b.hasAttribute('data-j-tab')) return;
      const i = TABS.findIndex(([id]) => id === b.getAttribute('data-j-tab'));
      const next = event.key === 'ArrowRight' ? (i + 1) % 4 : event.key === 'ArrowLeft' ? (i + 3) % 4 : event.key === 'Home' ? 0 : event.key === 'End' ? 3 : -1;
      if (next < 0) return;
      event.preventDefault(); render(TABS[next][0]);
      root.querySelector(`[data-j-tab="${TABS[next][0]}"]`).focus();
    }
    function destroy() { dead = true; root.removeEventListener('click', click); root.removeEventListener('keydown', keydown); if (mounted.get(root) === api) mounted.delete(root); }
    const api = {render, act, destroy};
    root.addEventListener('click', click); root.addEventListener('keydown', keydown);
    mounted.set(root, api); render(); return api;
  }
  return {mount};
});
