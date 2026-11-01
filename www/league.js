// Liga do dia: rivais simulados (sem servidor) com meta fixada no início do dia.
// Pontos = dinheiro ganho atendendo no dia. À meia-noite a posição vira prêmio para resgatar.
(function (root) {
  'use strict';
  var RIVALS = [
    ['Burguer do Zé', '🍔'], ['Pastel da Lu', '🥟'], ['Tia Cida Lanches', '🥪'], ['Rei do Frango', '🍗'],
    ['Pizza Nona', '🍕'], ['Açaí da Praia', '🍧'], ['Dog do Beto', '🌭'], ['Sushi Kenji', '🍣'], ['Café Aurora', '☕']
  ];
  var PRIZE = [.6, .35, .2, .12, .08]; // fração da meta do dia para 1º a 5º; demais ganham participação
  var PART = .03;
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function rng(key) { var x = hash(key) || 1; return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : d; }
  // curva do dia: rivais lentos no começo, aceleram e terminam em 100% à meia-noite.
  // Conta a partir de quando a liga começou para o jogador, para quem entra à noite ainda ter chance.
  function curve(f, start) { var s = Math.max(0, Math.min(.95, num(start, 0))); f = Math.max(0, Math.min(1, (f - s) / (1 - s))); return f * f * (3 - 2 * f); }
  function rivals(lg) {
    var r = rng('liga:' + lg.day);
    return RIVALS.map(function (x) { return {name: x[0], icon: x[1], k: .12 + r() * 1.25}; });
  }
  function rows(lg, dayFrac) {
    var c = curve(dayFrac, lg.start), list = rivals(lg).map(function (x) { return {name: x.name, icon: x.icon, score: Math.round(lg.target * x.k * c)}; });
    list.push({name: 'Você', icon: '👑', me: true, score: Math.round(num(lg.earn, 0))});
    return list.sort(function (a, b) { return b.score - a.score || (a.me ? -1 : b.me ? 1 : 0); });
  }
  function position(lg, dayFrac) { var l = rows(lg, dayFrac); for (var i = 0; i < l.length; i++) if (l[i].me) return i + 1; return l.length; }
  function prize(lg, pos) { return Math.round(lg.target * (pos <= PRIZE.length ? PRIZE[pos - 1] : num(lg.earn, 0) > 0 ? PART : 0)); }
  // Garante a liga de hoje. Na virada de dia, fecha a anterior com a posição final.
  function ensure(S, day, target, start) {
    var lg = S.league;
    if (lg && lg.day === day) return false;
    if (lg && typeof lg.day === 'string' && lg.day < day && num(lg.earn, 0) > 0) {
      var pos = position(lg, 1);
      S.league = {day: day, earn: 0, start: num(start, 0), target: Math.max(100, num(target, 100)), last: {day: lg.day, pos: pos, prize: prize(lg, pos) + (lg.last && !lg.last.claimed ? num(lg.last.prize, 0) : 0), claimed: false}};
    } else {
      S.league = {day: day, earn: 0, start: num(start, 0), target: Math.max(100, num(target, 100)), last: lg && lg.last && !lg.last.claimed ? lg.last : null};
    }
    return true;
  }
  function add(S, amount) { if (S.league && amount > 0 && isFinite(amount)) S.league.earn = num(S.league.earn, 0) + amount; }
  function claim(S) {
    var l = S.league && S.league.last;
    if (!l || l.claimed || !(l.prize > 0)) return 0;
    l.claimed = true; return l.prize;
  }
  root.League = {RIVALS: RIVALS, PRIZE: PRIZE, curve: curve, rows: rows, position: position, prize: prize, ensure: ensure, add: add, claim: claim};
})(typeof window !== 'undefined' ? window : this);
