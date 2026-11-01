(function (root) {
  'use strict';
  function mount(api) {
    const byId = id => document.getElementById(id), {S} = api;
    const close = document.createElement('button'); close.className = 'feature-close'; close.textContent = '×'; close.type = 'button'; close.setAttribute('aria-label', 'Fechar atividades');
    close.addEventListener('click', () => api.close('activities'));
    byId('activities').querySelector('.card').prepend(close);
    const enterprise = EnterpriseUI.mount(byId('enterpriseRoot'), {S, context: api.context, onChange: result => api.changed({...result, source: 'enterprise'}), notify: api.notify});
    const journey = JourneyUI.mount(byId('journeyRoot'), {S, context: api.context, onChange: api.changed, notify: api.notify});
    const layoutRoot = document.createElement('div'); layoutRoot.id = 'layoutRoot'; layoutRoot.className = 'feature-root'; layoutRoot.hidden = true;
    byId('journeyRoot').after(layoutRoot);
    const layoutButton = document.createElement('button'); layoutButton.dataset.activityTab = 'layout'; layoutButton.setAttribute('role', 'tab'); layoutButton.textContent = '🛋️ Organizar';
    byId('activities').querySelector('[role="tablist"]').append(layoutButton);
    const layout = PlacementUI.mount(layoutRoot, api.placement);
    let tab = 'enterprise';
    function render(next) {
      const card = byId('activities').querySelector('.card'), scroll = next && next !== tab ? 0 : card.scrollTop;
      if (next) tab = next;
      byId('enterpriseRoot').hidden = tab !== 'enterprise'; byId('journeyRoot').hidden = tab !== 'journey';
      layoutRoot.hidden = tab !== 'layout';
      document.querySelectorAll('[data-activity-tab]').forEach(b => {
        b.classList.toggle('on', b.dataset.activityTab === tab); b.setAttribute('aria-selected', String(b.dataset.activityTab === tab));
      });
      const ctx = api.context();
      byId('featureSummary').textContent = `${api.storeName} · ⭐ ${ctx.rep.toFixed(1)} · ${ctx.owned} loja(s) · Caixa $${api.fmt(S.money)}`;
      (tab === 'enterprise' ? enterprise : tab === 'layout' ? layout : journey).render();
      card.scrollTop = scroll;
    }
    function open(next) {
      for (const el of document.querySelectorAll('.modal.open')) if (!['cloudPick', 'ageGate', 'welcome'].includes(el.id)) api.close(el.id);
      render(next || 'enterprise'); api.open('activities'); byId('activities').querySelector('.card').scrollTop = 0;
    }
    document.addEventListener('click', e => {
      const jump = e.target.closest('[data-activities]');
      if (jump) open(jump.dataset.activities);
      const nav = e.target.closest('[data-activity-tab]');
      if (nav) render(nav.dataset.activityTab);
    });
    const historyButton = document.createElement('button'); historyButton.dataset.stab = 'history'; historyButton.textContent = '📒 Histórico';
    byId('stkTabs').append(historyButton);
    const historyPane = document.createElement('section'); historyPane.className = 'stk-pane'; historyPane.id = 'stk-history';
    byId('stocks').querySelector('.card').insertBefore(historyPane, byId('stk-rank').nextSibling);
    function history() {
      const state = api.market(), invested = S.stk.c.reduce((n, c) => n + c.paid, 0);
      const floating = api.stockValue() - invested, realized = state.stats.realized, dividends = state.stats.dividends;
      const cell = (title, value) => `<div><small>${title}</small><b>$${api.fmtP(value)}</b></div>`;
      const rows = (state.history || []).filter(h => Number.isSafeInteger(h.i) && api.stocks[h.i] && Number.isFinite(h.total)).slice(0, 100);
      historyPane.innerHTML = `<div class="feature-stats">${cell('Investido nas posições', invested)}${cell('Valor atual', api.stockValue())}${cell('Resultado em aberto', floating)}${cell('Lucro realizado', realized)}${cell('Dividendos recebidos', dividends)}${cell('Resultado total', floating + realized + dividends)}</div>`
        + '<p>Últimas 100 operações. O preço médio e o lucro realizado incluem corretagem. Rentabilidade passada não garante ganhos.</p>'
        + (rows.length ? rows.map(h => `<div class="up"><div class="ic">${h.side === 'sell' ? '🔴' : '🟢'}</div><div class="tx"><b>${h.side === 'sell' ? 'Venda' : 'Compra'} · ${api.stocks[h.i].s}</b><small>${new Date(h.at).toLocaleString('pt-BR')} · ${api.fmt(h.n)} × $${api.fmtP(h.price)}</small><span>${h.side === 'sell' ? `Resultado: $${api.fmtP(h.gain)}` : 'Adicionado à carteira'}</span></div><b>$${api.fmtP(h.total)}</b></div>`).join('') : '<div class="feature-note">Faça uma compra ou venda para começar seu histórico. As posições antigas foram preservadas.</div>');
    }
    return {open, render, history, enterprise, journey, layout};
  }
  root.FeatureHub = {mount};
})(typeof window !== 'undefined' ? window : globalThis);
