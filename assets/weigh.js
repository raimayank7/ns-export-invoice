/* NSWeigh: type a weight in the Qty box of a bill line (kirana, fruit and vegetables, sweets, grain, oil).
   India plan A (2026-11-17). Nothing is hardware: the shopkeeper reads the scale and types what it shows.
     In the Qty box type  250g   1.5kg   2kg 500g   1kg+250g+80g (several weighings)   1kg-50g (less the pot)   3q (quintal)   750ml   1.5l
     When the box is left, the text becomes a plain number in the unit of the line (Unit box: Kg, Gm, Ltr, Quintal ...), so the bill,
     the books and the stock see an ordinary quantity; a small note shows what was understood and the amount.
     "Repeat line" copies a line (item, rate, tax) with an empty quantity: weigh the same item again.
   A plain number works exactly as before: a bill that never uses a unit letter is not touched.
   Pure part (node scripts/test_weigh.js):  NSWeigh.parse(text, unit) -> { ok, plain, qty, err }   NSWeigh.family(unit) -> 'mass' | 'vol' | ''
   Screen part: delegated listeners, so it works on every line editor that has data-k="qty" (document makers, POS) or data-lk="qty"
   (App purchase bill, bill by bill lines), with a unit box next to it or, when the line has none, in kg / litres. */
(function (G) {
  'use strict';
  /* factor to the base unit: kilogram for mass, litre for volume */
  var U = {
    mg: ['mass', 0.000001], g: ['mass', 0.001], gm: ['mass', 0.001], gms: ['mass', 0.001], gram: ['mass', 0.001], grams: ['mass', 0.001], gr: ['mass', 0.001],
    kg: ['mass', 1], kgs: ['mass', 1], kilo: ['mass', 1], kilos: ['mass', 1], kilogram: ['mass', 1], kilograms: ['mass', 1],
    q: ['mass', 100], qtl: ['mass', 100], qtls: ['mass', 100], quintal: ['mass', 100], quintals: ['mass', 100],
    ton: ['mass', 1000], tons: ['mass', 1000], tonne: ['mass', 1000], tonnes: ['mass', 1000], mt: ['mass', 1000],
    ml: ['vol', 0.001], l: ['vol', 1], lt: ['vol', 1], ltr: ['vol', 1], ltrs: ['vol', 1], litre: ['vol', 1], litres: ['vol', 1], liter: ['vol', 1], liters: ['vol', 1], kl: ['vol', 1000]
  };
  function norm(u) { return String(u == null ? '' : u).toLowerCase().replace(/[.\s]/g, ''); }
  function find(u) { var k = norm(u); return Object.prototype.hasOwnProperty.call(U, k) ? U[k] : null; }
  function family(u) { var f = find(u); return f ? f[0] : ''; }
  function r4(n) { return Math.round(n * 10000) / 10000; }

  /* text -> quantity in the target unit. A bare number is already in the target unit (or kg / litre when the line has no unit);
     terms are added one after another, a leading + or - on a term adds or takes away. */
  function parse(text, unit) {
    var s = String(text == null ? '' : text).replace(/,/g, '').replace(/[×x]\s*$/i, '').replace(/(\d)\.$/, '$1').trim();
    if (!s) return { ok: true, plain: true, qty: '' };
    if (/^-?\d*\.?\d+$/.test(s)) return { ok: true, plain: true, qty: s };   /* an ordinary number: leave it alone */
    var t = find(unit), re = /([+\-]?)\s*(\d*\.?\d+)\s*([a-zA-Z]*)/g, m, used = 0, sum = 0, fam = t ? t[0] : '', any = false, unitSeen = false;
    while ((m = re.exec(s))) {
      if (s.slice(used, m.index).replace(/\s+/g, '')) return { ok: false, err: 'read' };
      used = re.lastIndex; any = true;
      var v = parseFloat(m[2]), sg = m[1] === '-' ? -1 : 1, f;
      if (m[3]) {
        var u = find(m[3]); if (!u) return { ok: false, err: 'read' };
        unitSeen = true;
        if (!t && norm(unit)) return { ok: false, err: 'unit' };   /* the line's unit is Nos, Box ...: a weight does not fit */
        if (!fam) fam = u[0];   /* a line with no unit: the first unit typed decides mass or volume */
        if (u[0] !== fam) return { ok: false, err: t ? 'unit' : 'mix' };
        f = u[1];
      } else {
        f = t ? t[1] : 1;   /* a bare number is in the unit of the line */
      }
      sum += sg * v * f;
    }
    if (!any || s.slice(used).replace(/\s+/g, '')) return { ok: false, err: 'read' };
    if (!unitSeen && !/[+\-]/.test(s.slice(1))) return { ok: true, plain: true, qty: s };
    var base = t ? t[1] : 1;
    var q = r4(sum / base);
    if (q < 0) return { ok: false, err: 'neg' };
    return { ok: true, plain: false, qty: String(q), base: fam === 'vol' ? 'l' : 'kg' };
  }

  var API = { parse: parse, family: family, find: find };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  G.NSWeigh = API;
  if (typeof document === 'undefined' || !G.NS) return;

  /* ---------- screen part ---------- */
  var NS = G.NS, t = function (k, p) { return NS.t(k, p); };
  var QTY = 'input[data-k="qty"], input[data-lk="qty"]';

  function unitBox(qi) {
    var p = qi.parentElement, n = 0;
    while (p && n < 7) { var u = p.querySelector('input[data-k="unit"], input[data-lk="unit"]'); if (u) return u; if (p.querySelector('input[data-k="desc"], input[data-lk="desc"]') && n > 1) break; p = p.parentElement; n++; }
    return null;
  }
  function rateBox(qi) {
    var p = qi.parentElement, n = 0;
    while (p && n < 7) { var r = p.querySelector('input[data-k="rate"], input[data-lk="rate"], input[data-k="price"]'); if (r) return r; p = p.parentElement; n++; }
    return null;
  }
  function note(qi, text, bad) {
    var holder = qi.closest('.f, .lc') || qi.parentElement, n = holder.querySelector('.wg-note');
    if (!text) { if (n) n.remove(); return; }
    if (!n) { n = document.createElement('small'); n.className = 'wg-note'; n.setAttribute('role', 'status'); holder.appendChild(n); }
    n.textContent = text; n.className = 'wg-note' + (bad ? ' bad' : '');
  }
  function fire(el) { el.dispatchEvent(new Event('input', { bubbles: true })); }

  function settle(qi) {
    var raw = qi.value, ub = unitBox(qi), unit = ub ? ub.value : '', r = parse(raw, unit);
    if (!r.ok) {
      note(qi, r.err === 'unit' ? t('wg.unit', { u: unit || '?' }) : r.err === 'neg' ? t('wg.neg') : r.err === 'mix' ? t('wg.mix') : t('wg.bad', { t: raw }), true);
      return;
    }
    if (r.plain) { note(qi, ''); return; }
    var u = ub && find(unit) ? ub.value.trim() : r.base === 'l' ? 'L' : 'Kg', rb = rateBox(qi), rate = rb ? NS.num(rb.value) : 0;
    qi.value = r.qty; fire(qi);
    /* a bill line with no Unit box (App purchase bill) remembers the unit the weight was turned into, so the saved bill says Kg / L, not Nos */
    if (!ub && qi.hasAttribute('data-li')) {
      var hu = qi.parentElement.querySelector('input[data-lk="unit"]') || qi.closest('.line').querySelector('input[data-lk="unit"]');
      if (!hu) { hu = document.createElement('input'); hu.type = 'hidden'; hu.setAttribute('data-li', qi.getAttribute('data-li')); hu.setAttribute('data-lk', 'unit'); qi.closest('.line').appendChild(hu); }
      hu.value = u; fire(hu);
    }
    note(qi, raw.trim() + ' = ' + NS.qty(+r.qty) + ' ' + u + (rate ? ' → ' + NS.money(+r.qty * rate) : ''), false);
  }
  document.addEventListener('change', function (e) { if (e.target.matches && e.target.matches(QTY)) settle(e.target); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches && e.target.matches(QTY)) settle(e.target); }, true);
  /* a changed unit or rate refreshes the note of that line */
  document.addEventListener('change', function (e) {
    var el = e.target; if (!el.matches || !el.matches('input[data-k="unit"], input[data-lk="unit"], input[data-k="rate"], input[data-lk="rate"]')) return;
    var row = el.closest('.it, .line'), qi = row && row.querySelector(QTY); if (qi && row.querySelector('.wg-note')) { var n = row.querySelector('.wg-note'); n.remove(); }
  }, true);

  /* the quantity box says what it understands (title, read by screen readers too) */
  function decorate() {
    Array.prototype.forEach.call(document.querySelectorAll(QTY), function (qi) {
      if (qi.getAttribute('data-wg')) return;
      qi.setAttribute('data-wg', '1'); qi.setAttribute('title', t('wg.tip')); qi.setAttribute('autocomplete', 'off');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.it-head'), function (h) {
      if (h.querySelector('[data-wg-rep]')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'link'; b.setAttribute('data-wg-rep', '1'); b.textContent = t('wg.rep');
      h.insertBefore(b, h.querySelector('[data-del]') || null);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.line[data-row]'), function (l) {
      if (l.querySelector('[data-wg-rep]')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'icon-btn wg-rep'; b.setAttribute('data-wg-rep', '1'); b.title = t('wg.rep'); b.setAttribute('aria-label', t('wg.rep')); b.textContent = '⧉';
      l.appendChild(b);
    });
  }
  var timer = 0;
  function later() { clearTimeout(timer); timer = setTimeout(decorate, 120); }
  new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('ns-lang', function () { Array.prototype.forEach.call(document.querySelectorAll('[data-wg-rep]'), function (b) { b.remove(); }); Array.prototype.forEach.call(document.querySelectorAll('[data-wg]'), function (q) { q.removeAttribute('data-wg'); }); later(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later); else later();

  /* Repeat line: add a line, copy item / unit / rate / discount / tax, leave the quantity empty and put the cursor there */
  var COPY = ['desc', 'hsn', 'unit', 'rate', 'disc', 'gst', 'price', 'code'];
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-wg-rep]'); if (!b) return;
    e.preventDefault();
    var row = b.closest('.it, .line'), keys = {}; if (!row) return;
    COPY.forEach(function (k) { var i = row.querySelector('input[data-k="' + k + '"], input[data-lk="' + k + '"]'); if (i) keys[k] = i.value; });
    var scope = row.parentElement, rows = scope.querySelectorAll(row.matches('.it') ? '.it' : '.line[data-row]'), count = rows.length;
    var add = document.getElementById('add-item') || document.querySelector('[data-addline]') || document.querySelector('[data-add="items"], [data-add-row]');
    if (!add) return;
    add.click();
    setTimeout(function () {
      var now = (document.getElementById('items') || scope).querySelectorAll(row.matches('.it') ? '.it' : '.line[data-row]');
      if (now.length <= count) return;
      var nr = now[now.length - 1];
      Object.keys(keys).forEach(function (k) {
        var i = nr.querySelector('input[data-k="' + k + '"], input[data-lk="' + k + '"]'); if (!i) return;
        i.value = keys[k]; fire(i);
      });
      var q = nr.querySelector(QTY); if (q) { q.value = ''; fire(q); q.focus(); }
    }, 60);
  }, true);

  /* small style, kept here so every host page gets it */
  var st = document.createElement('style');
  st.textContent = '.wg-note{display:block;margin-top:.2rem;font-size:.82rem;color:var(--ok,#0a7a4b);line-height:1.3}.wg-note.bad{color:var(--bad,#b3261e)}' +
    '.it-head .link[data-wg-rep]{margin-inline-start:auto;margin-inline-end:.8rem}.line .wg-rep{opacity:.75}';
  document.head.appendChild(st);
})(typeof window !== 'undefined' ? window : this);
