/* EnterpriseUI.mount(root, {S, context:()=>ctx, onChange:(result)=>{}, notify:(text)=>{}})
 * -> {render(tab?), act(kind,id), destroy()}. Abas: FARM/LAB/DELIVERY/CONTRATOS.
 * Carregar enterprise.js antes deste módulo. Usa features.css e componentes do
 * jogo; só desenha dentro de root, sem modal, timer, save, ads ou hooks globais.
 * O chamador executa Enterprise.sync e render() no seu ciclo; render é leitura.
 * onChange recebe resultados (inclusive sync liquidado por ações rejeitadas).
 * context().now permite relógio determinístico; sua ausência usa Date.now().
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof define === 'function' && define.amd) define([], () => api);
  root.EnterpriseUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';
  const mounts = new WeakMap();
  const tabs = {FARM: 'Produção', LAB: 'Laboratório', DELIVERY: 'Delivery', CONTRATOS: 'Contratos'};
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const cash = n => '$ ' + new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 0, notation: n >= 1e6 ? 'compact' : 'standard'}).format(n);
  const pct = n => new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1}).format(n * 100) + '%';
  const duration = n => { const seconds = Math.max(0, Math.ceil(n / 1000)); return seconds < 60 ? seconds + ' s' : seconds < 3600 ? Math.ceil(seconds / 60) + ' min' : new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1}).format(Math.ceil(seconds / 360) / 10) + ' h'; };
  function mount(root, options) {
    if (!root || typeof root.addEventListener !== 'function' || !options || !options.S) throw new TypeError('EnterpriseUI exige um root e S.');
    const api = global.Enterprise;
    if (!api) throw new Error('Carregue enterprise.js antes de enterprise-ui.js.');
    if (mounts.has(root)) mounts.get(root).destroy();
    const S = options.S, getContext = typeof options.context === 'function' ? options.context : () => ({});
    let tab = 'FARM', destroyed = false;
    const ctxNow = () => { const ctx = getContext() || {}; return {ctx, now: ctx.now === undefined ? Date.now() : ctx.now}; };
    const first = ctxNow(), initialized = api.init(S, first.now);
    if (initialized.initialized && typeof options.onChange === 'function') options.onChange(initialized);
    const goods = q => Object.entries(q).map(([id, n]) => esc(n) + ' ' + esc(api.defs.ingredients[id].name)).join(' · ');
    const note = text => '<p class="feature-note">' + esc(text) + '</p>';
    const button = (label, kind, id, enabled = true) => '<button type="button" class="btn" style="min-height:44px" data-enterprise-kind="' + esc(kind) + '" data-enterprise-id="' + esc(id) + '"' + (enabled ? '' : ' disabled') + '>' + esc(label) + '</button>';
    const row = (label, value) => '<div class="row" style="flex-wrap:wrap"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
    const progress = (label, start, end, time) => {
      const value = Math.max(0, Math.min(100, Math.floor(100 * (time - start) / Math.max(1, end - start))));
      return '<div class="xpbar" role="progressbar" aria-label="' + esc(label) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + value + '"><i style="width:' + value + '%"></i></div>';
    };
    const actions = html => '<div class="feature-actions">' + html + '</div>';
    const card = (title, html) => '<article class="feature-card"><h4>' + esc(title) + '</h4>' + html + '</article>';
    function farm(v) {
      const limits = api.defs.limits;
      const inventory = '<div class="feature-stats">' + Object.entries(v.inventory).map(([k, n]) => row(api.defs.ingredients[k].name, n + '/' + v.capacity)).join('') + '</div>';
      return '<h3>Estoque e produção</h3>' + note('Contrate pessoas com moedas do jogo para colher e replantar automaticamente. Especialistas rendem 25% mais. Cada ciclo paga produção e insumos; sem saldo, insumos ou espaço, o trabalho para. Sem compra com dinheiro real.') + inventory +
        actions(button('Estoque ' + v.capacity + ' → ' + (v.capacity + limits.inventoryStep) + ' · ' + cash(v.storageCost), 'storage', 'inventory', v.storage < limits.storage && v.money >= v.storageCost)) +
        note('Capacidade por ingrediente. Ganhos de tempo offline limitados a ' + duration(v.offlineCapMs) + '.') + '<div class="feature-grid">' + v.producers.map(p => {
          const d = api.defs.ingredients[p.id], pstate = !p.level ? 'Ainda não construído' : p.job ? p.job.ready ? 'Pronto para colher' : 'Pronto em ' + duration(p.remainingMs) : 'Disponível';
          let html = '<div class="up" style="flex-wrap:wrap"><div class="ic" aria-hidden="true">' + esc(p.icon) + '</div><div class="tx"><strong>' + esc(p.name) + ' · nível ' + p.level + '/' + limits.producer + '</strong><span>' + esc(pstate) + '</span></div></div>';
          if (p.missing.length) html += note('Requer ' + p.missing.join(', ') + '.');
          if (!p.level) return card(p.type === 'fabrica' ? 'Fábrica' : 'Cultivo', html + actions(button('Construir · ' + cash(p.buildCost), 'build', p.id, !p.missing.length && v.money >= p.buildCost)));
          html += note('Próximo ciclo: +' + p.qty + ' em ' + duration(p.duration) + ' · produção ' + cash(p.cost) + (Object.keys(p.inputs).length ? ' + ' + goods(p.inputs) : '') + '.');
          if (p.job) html += progress('Produção de ' + p.name, p.job.start, p.job.finish, v.time);
          html += actions(button(p.job && p.job.ready ? 'Colher +' + p.job.qty : 'Produzir · ' + cash(p.manualCost), p.job && p.job.ready ? 'harvest' : 'plant', p.id, p.job ? p.job.ready && p.inventory + p.job.qty <= p.capacity : p.canPlant) +
            button('Nível ' + p.level + ' → ' + (p.level + 1) + ' · ' + cash(p.upgradeCost), 'upgrade', p.id, p.level < limits.producer && !p.job && !p.missing.length && v.money >= p.upgradeCost));
          html += '<div class="up" style="flex-wrap:wrap"><div class="ic" aria-hidden="true">' + esc(p.workerIcon) + '</div><div class="tx"><strong>' + esc(p.workerName) + ' · ' + (p.worker ? p.worker.specialist ? 'Especialista +25%' : 'Operador' : 'Disponível para contratar') + '</strong><span>' + esc(p.workerStatus) + '</span></div></div>';
          html += note(p.workerDescription + ' Operação: ' + cash(p.workerWage) + ' por ciclo, além da produção e dos insumos. Créditos comprados são usados primeiro, sem cobrar operação duas vezes.');
          if (!p.worker) html += actions(button('Contratar ' + p.workerName + ' · ' + cash(p.hireCost), 'hire-worker', p.id, p.canHire));
          else if (!p.worker.specialist) html += actions(button('Especializar ' + p.workerName + ' · ' + cash(p.specialistCost), 'specialist', p.id, p.canSpecialist));
          html += note('Especialista: ' + p.baseQty + ' → ' + new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2}).format(p.specialistAverage) + ' por ciclo em média (+25%).' + (p.worker && p.worker.specialist ? ' Próximo ciclo: +' + p.qty + '; fração guardada: ' + new Intl.NumberFormat('pt-BR').format(p.worker.fraction) + '. O ciclo em andamento mantém seu rendimento.' : ' Contrate o operador e depois especialize; os extras fracionados acumulam entre ciclos e saves.'));
          html += note('Automação por créditos ' + p.auto + '/' + limits.automation + ' · ' + p.credits + '/' + p.creditCapacity + ' ciclos na fila.' + (p.worker ? ' Depois da fila, o trabalhador continua com moedas do jogo.' : ' Sem trabalhador, a automação para ao terminar a fila.'));
          html += actions(button(p.auto ? 'Automação ' + p.auto + ' → ' + (p.auto + 1) + ' · ' + cash(p.autoCost) : 'Instalar automação · ' + cash(p.autoCost), 'auto-upgrade', p.id, p.auto < limits.automation && !p.missing.length && v.money >= p.autoCost));
          if (p.auto) html += actions(button('Comprar ' + p.creditPack + ' ciclos · ' + cash(p.creditCost), 'automate', p.id, p.creditPack > 0 && !p.missing.length && v.money >= p.creditCost));
          if (p.auto) html += note('Taxa da fila acima; cada novo ciclo também custa ' + cash(p.cost) + (Object.keys(d.inputs).length ? ' e insumos' : '') + '.');
          return card(p.type === 'fabrica' ? 'Fábrica' : 'Cultivo', html);
        }).join('') + '</div>';
    }
    function lab(v) {
      let html = '<h3>Livro permanente</h3>' + row('Receitas pesquisadas', Object.keys(v.book).length + '/' + v.recipes.length) + row('Bônus permanente nos pedidos', '+' + pct(v.bonuses.price)) + note('A pesquisa consome os ingredientes e a moeda exibidos. Uma receita ativa consome ingredientes por pedido; sem estoque o pedido segue com o bônus permanente do livro.');
      if (v.research) html += card('Pesquisa em andamento', note(api.defs.recipes[v.research.id].name + ' · faltam ' + duration(v.research.finish - v.time)) + progress('Pesquisa', v.research.start, v.research.finish, v.time));
      if (v.active) html += actions(button('Desativar receita especial', 'activate', 'none'));
      return html + '<div class="feature-grid">' + v.recipes.map(r => card(r.name,
        note('Cada pedido: ' + goods(r.ingredients) + '. Valor adicional com estoque: +' + pct(r.bonus) + '. Livro permanente: +' + pct(r.permanent) + '.') +
        (r.missing.length ? note('Requer ' + r.missing.join(', ') + '.') : '') +
        (r.unlocked ? note(r.active ? 'Receita ativa nos pedidos de todas as lojas.' : 'Receita no livro permanente.') + actions(button(r.active ? 'Em uso' : 'Ativar receita', 'activate', r.id, !r.active)) : note('Pesquisa: ' + goods(r.research) + ' + ' + cash(r.cost) + ' · ' + duration(r.ms) + '.') + actions(button(v.research && v.research.id === r.id ? 'Pesquisando…' : 'Pesquisar · ' + cash(r.cost), 'research', r.id, r.canResearch)))
      )).join('') + '</div>';
    }
    function delivery(v) {
      const c = v.courier, limits = api.defs.limits;
      let html = '<h3>Entregador</h3>' + row('Entregas simultâneas', v.deliveries.length + '/' + c.slots) + row('Ingredientes por entrega', c.load) +
        actions(button('Velocidade ' + c.speed + ' → ' + (c.speed + 1) + ' · ' + cash(c.speedCost), 'courier-speed', 'courier', c.speed < limits.courierSpeed && v.money >= c.speedCost) + button('Capacidade ' + c.capacity + ' → ' + (c.capacity + 1) + ' · ' + cash(c.capacityCost), 'courier-capacity', 'courier', c.capacity < limits.courierCapacity && v.money >= c.capacityCost)) +
        note('Cada nível de velocidade acrescenta 25% à velocidade base. Cada nível de capacidade acrescenta 1 entrega simultânea e 8 ingredientes. Melhorias e notícias valem para novos despachos.');
      if (v.deliveries.length) html += '<h3>Em andamento</h3><div class="feature-grid">' + v.deliveries.map(d => card(d.status === 'ready' ? 'Pagamento disponível' : 'Entregador a caminho', row('Pagamento bruto', cash(d.reward)) + note(d.status === 'ready' ? 'Chegou! Resgate uma única vez.' : 'Chega em ' + duration(d.finish - v.time) + '.') + progress('Entrega', d.start, d.finish, v.time) + actions(button('Resgatar · ' + cash(d.reward), 'claim', d.id, d.status === 'ready')))).join('') + '</div>';
      return html + '<h3>Pedidos do bairro</h3>' + note('Ofertas renovam em ' + duration(v.boardExpires - v.time) + '. Despachar consome todo o estoque solicitado e o frete.') + '<div class="feature-grid">' + v.delivery.map(d => card(d.name, note(goods(d.goods)) + row('Frete / pagamento bruto', cash(d.fee) + ' / ' + cash(d.reward)) + note('Viagem de ' + duration(d.duration) + ' · despacho em até ' + duration(d.dispatchBy - v.time) + '.') + (d.quantity > c.load ? note('Exige capacidade para ' + d.quantity + ' ingredientes.') : '') + actions(button(d.used ? 'Já despachado' : 'Despachar', 'dispatch', d.id, d.canDispatch)))).join('') + '</div>';
    }
    function contracts(v) {
      let html = '<h3>Parcerias comerciais</h3>' + note('Entregas parciais são aceitas. Ao completar, o pagamento é automático e único. Cancelamento ou prazo vencido: até 20% do prêmio × fração faltante, limitado a 10% do saldo. A taxa de reserva não é devolvida.');
      if (v.contracts.length) html += '<h3>Contratos ativos</h3><div class="feature-grid">' + v.contracts.map(c => {
        const required = Object.values(c.goods).reduce((n, q) => n + q, 0), delivered = Object.values(c.delivered).reduce((n, q) => n + q, 0);
        const canFulfill = Object.entries(c.goods).some(([id, n]) => v.inventory[id] > 0 && c.delivered[id] < n);
        return card(c.name, note(Object.entries(c.goods).map(([id, n]) => api.defs.ingredients[id].name + ': ' + c.delivered[id] + '/' + n).join(' · ')) + row('Pagamento ao completar', cash(c.reward)) + note('Prazo: ' + duration(c.deadline - v.time) + '.') + progress('Ingredientes entregues', 0, required, delivered) + actions(button('Entregar estoque', 'fulfill', c.id, canFulfill) + button('Cancelar com multa', 'cancel', c.id)));
      }).join('') + '</div>';
      return html + '<h3>Novas ofertas</h3><div class="feature-grid">' + v.commercial.map(c => card(c.name, note(goods(c.goods)) + row('Reserva / pagamento bruto', cash(c.fee) + ' / ' + cash(c.reward)) + note('Prazo após aceitar: ' + duration(c.duration) + '. Oferta renova em ' + duration(c.acceptBy - v.time) + '.') + (c.missing.length ? note('Requer ' + c.missing.join(', ') + '.') : '') + actions(button(c.used ? 'Já aceito' : 'Aceitar contrato', 'accept', c.id, c.canAccept)))).join('') + '</div>';
    }
    function render(nextTab) {
      if (destroyed) return;
      if (typeof nextTab === 'string' && Object.prototype.hasOwnProperty.call(tabs, nextTab.toUpperCase())) tab = nextTab.toUpperCase();
      const previous = root.contains(root.ownerDocument.activeElement) ? root.ownerDocument.activeElement.dataset : null;
      const focus = previous ? {tab: previous.enterpriseTab, kind: previous.enterpriseKind, id: previous.enterpriseId} : null;
      const {ctx, now} = ctxNow(), v = api.snapshot(S, ctx, now);
      if (!v.ok) { root.innerHTML = '<p role="alert" class="feature-note">' + esc(v.messages.join(' ')) + '</p>'; return v; }
      root.innerHTML = '<section aria-label="Produção e negócios"><nav class="feature-tabs" aria-label="Áreas dos negócios">' + Object.entries(tabs).map(([id, label]) => '<button type="button" class="btn' + (tab === id ? ' on' : '') + '" style="min-height:44px" data-enterprise-tab="' + id + '" aria-pressed="' + (tab === id) + '">' + label + '</button>').join('') + '</nav>' +
        '<div class="feature-stats">' + row('Saldo compartilhado', cash(v.money)) + '</div>' +
        '<aside class="feature-note" aria-label="Notícias"><strong>' + esc(v.news.name) + '</strong> · ' + esc(v.news.news) + ' ' + esc(duration(v.news.end - v.time)) + ' restantes.</aside>' +
        ({FARM: farm, LAB: lab, DELIVERY: delivery, CONTRATOS: contracts}[tab])(v) +
        '<p class="feature-note" data-enterprise-status role="status" aria-live="polite"></p></section>';
      if (focus) {
        const target = Array.from(root.querySelectorAll('button')).find(b => focus.tab ? b.dataset.enterpriseTab === focus.tab : b.dataset.enterpriseKind === focus.kind && b.dataset.enterpriseId === focus.id);
        const fallback = root.querySelector('[data-enterprise-tab="' + tab + '"]');
        if (target && !target.disabled) target.focus({preventScroll: true});
        else if (fallback) fallback.focus({preventScroll: true});
      }
      if (nextTab) { const panel = root.closest('.card'); if (panel) panel.scrollTop = 0; }
      return v;
    }
    function act(kind, id) {
      if (destroyed) return {ok: false, code: 'destroyed', messages: ['Painel desmontado.']};
      const {ctx, now} = ctxNow(), out = api.act(S, kind, id, ctx, now);
      if (typeof options.onChange === 'function') options.onChange(out);
      render();
      const message = out.messages.join(' '), status = root.querySelector('[data-enterprise-status]');
      if (status) status.textContent = message;
      if (message && typeof options.notify === 'function') options.notify(message);
      return out;
    }
    function click(event) {
      const el = event.target && typeof event.target.closest === 'function' ? event.target.closest('button') : null;
      if (!el || !root.contains(el) || el.disabled) return;
      if (el.dataset.enterpriseTab) render(el.dataset.enterpriseTab);
      else if (el.dataset.enterpriseKind) act(el.dataset.enterpriseKind, el.dataset.enterpriseId);
    }
    function destroy() { if (destroyed) return; destroyed = true; root.removeEventListener('click', click); if (mounts.get(root) === controller) mounts.delete(root); }
    const controller = {render, act, destroy};
    root.addEventListener('click', click); mounts.set(root, controller); render();
    return controller;
  }
  return Object.freeze({mount});
});
