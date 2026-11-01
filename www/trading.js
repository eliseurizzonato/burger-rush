(function (root) {
  'use strict';
  const MAX = Number.MAX_SAFE_INTEGER;
  const validMoney = n => Number.isFinite(n) && n >= 0 && n <= MAX;
  function quote(wallet, company, quantity, sell, fee = .005) {
    if (!company || !Number.isSafeInteger(quantity) || quantity <= 0 || !validMoney(wallet)
      || !validMoney(company.own) || !Number.isSafeInteger(company.own) || !validMoney(company.paid)
      || !validMoney(company.p) || company.p <= 0 || !Number.isFinite(fee) || fee < 0 || fee > .1) return null;
    const n = sell ? Math.min(quantity, company.own) : quantity;
    if (!n) return null;
    const total = n * company.p * (sell ? 1 - fee : 1 + fee);
    if (!validMoney(total) || (!sell && (total > wallet || !Number.isSafeInteger(company.own + n)))) return null;
    const basis = sell ? company.paid * n / company.own : 0;
    const money = sell ? wallet + total : wallet - total;
    const paid = sell ? Math.max(0, company.paid - basis) : company.paid + total;
    if (!validMoney(money) || !validMoney(paid)) return null;
    return {n, total, basis, gain: sell ? total - basis : 0, money, own: sell ? company.own - n : company.own + n, paid};
  }
  function execute(S, index, quantity, sell, fee, now = Date.now()) {
    const c = Number.isSafeInteger(index) && index >= 0 && S.stk && S.stk.c[index];
    const q = quote(S.money, c, quantity, sell, fee);
    if (!q) return null;
    S.money = q.money; c.own = q.own; c.paid = q.own ? q.paid : 0;
    const m = S.market;
    if (m) {
      if (!Array.isArray(m.history)) m.history = [];
      m.history.unshift({at: now, i: index, side: sell ? 'sell' : 'buy', n: q.n, price: c.p, total: q.total, gain: q.gain});
      m.history.length = Math.min(m.history.length, 100);
    }
    return q;
  }
  root.Trading = {quote, execute};
})(typeof window !== 'undefined' ? window : globalThis);
