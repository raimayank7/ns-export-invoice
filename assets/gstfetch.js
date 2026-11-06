/* Nivesh Sahayak: fill a party's details from its GSTIN.
   No server and no paid API: the GSTIN itself gives state, PAN and type of business at once;
   the rest comes from the official GST portal search (it has a CAPTCHA, so the user opens it),
   the user copies the result page and pastes it here, we read it, show it, and fill only after "Use these details".
   NS.gstFetch(gstin, function (d) {...}) where d = {gstin, name, legal, trade, addr, city, pin, state, status, type, reg, since, constitution} */
(function () {
  'use strict';
  var NS = window.NS = window.NS || {};
  var t = function (k, v) { return NS.t(k, v); }, esc = function (s) { return NS.esc(s); };
  var PORTAL = 'https://services.gst.gov.in/services/searchtp';
  /* 4th character of the PAN = who holds it */
  var HOLDER = { C: 'gf.h.C', P: 'gf.h.P', F: 'gf.h.F', H: 'gf.h.H', A: 'gf.h.A', T: 'gf.h.T', B: 'gf.h.B', L: 'gf.h.L', J: 'gf.h.J', G: 'gf.h.G' };

  NS.gstinFacts = function (g) {
    g = String(g || '').toUpperCase().replace(/\s/g, '');
    var c = NS.gstinCheck(g);
    if (!c.ok || c.empty) return null;
    var h = HOLDER[g[5]];
    return { gstin: g, state: c.state, pan: c.pan, holder: h ? t(h) : '' };
  };

  /* labels on the portal's "Search Taxpayer" result, in the order the portal shows them */
  var LABELS = [
    ['legal', /legal\s*name(\s*of\s*business)?/i], ['trade', /trade\s*name/i], ['since', /effective\s*date\s*of\s*registration|date\s*of\s*registration/i],
    ['constitution', /constitution\s*of\s*business/i], ['status', /gstin\s*\/?\s*uin\s*status|^status/i], ['type', /taxpayer\s*type/i],
    ['addr', /principal\s*place\s*of\s*business(\s*address)?/i]
  ];
  var STOP = /^(administrative\s*office|other\s*office|whether|nature\s*of|jurisdiction|state\s*jurisdiction|centre|center|date\s*of\s*cancellation|field\s*visit|e-?kyc|aadhaar|search\s*result|gstin\s*\/?\s*uin\s*:?$|core\s*business)/i;

  function lines(text) {
    return String(text || '').replace(/\r/g, '').split(/\n|\t{2,}/).map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  }
  /* value of a label: the rest of the same line after ":" or the label, else the next line that isn't a label */
  function valueAfter(L, i, re) {
    var rest = L[i].replace(re, '').replace(/^[\s:\-–]+/, '').trim();
    if (rest) return rest;
    for (var j = i + 1; j < L.length && j < i + 3; j++) {
      if (isLabel(L[j])) return '';
      if (L[j] !== ':' ) return L[j].replace(/^[\s:]+/, '');
    }
    return '';
  }
  function isLabel(s) { return STOP.test(s) || LABELS.some(function (x) { return x[1].test(s) && s.replace(x[1], '').replace(/[\s:]/g, '').length < 2; }); }

  NS.parseGstPortal = function (text) {
    var L = lines(text), d = {};
    LABELS.forEach(function (x) {
      for (var i = 0; i < L.length; i++) {
        if (x[1].test(L[i]) && L[i].search(x[1]) < 3) { var v = valueAfter(L, i, x[1]); if (v) { d[x[0]] = v; break; } }
      }
    });
    var m = String(text || '').toUpperCase().match(/\b[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]\b/);
    if (m) d.gstin = m[0];
    if (d.addr) splitAddr(d);
    if (d.type) d.reg = /compos/i.test(d.type) ? 'comp' : /sez/i.test(d.type) ? 'sez' : /regular|normal/i.test(d.type) ? 'regular' : '';
    /* a proprietor's legal name is the person; shops bill under the trade name */
    d.name = (/propriet/i.test(d.constitution || '') && d.trade ? d.trade : d.legal) || d.trade || '';
    return d;
  };
  /* "Shop 4, Mall Road, Ludhiana, Ludhiana, Punjab, 141001" -> addr, city, state, pin */
  function splitAddr(d) {
    var a = d.addr, pin = a.match(/\b([1-9][0-9]{5})\b(?!.*\b[1-9][0-9]{5}\b)/);
    if (pin) { d.pin = pin[1]; a = a.replace(pin[0], ''); }
    var parts = a.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var low = function (s) { return s.toLowerCase().replace(/[^a-z]/g, ''); };
    for (var k = parts.length - 1; k >= 0 && k >= parts.length - 3; k--) {
      var st = NS.STATES.filter(function (s) { return low(s[1]) === low(parts[k]); })[0];
      if (st) { d.state = st[0]; parts.splice(k, 1); break; }
    }
    if (parts.length > 1) {
      d.city = parts.pop();
      while (parts.length > 1 && low(parts[parts.length - 1]) === low(d.city)) parts.pop();
    }
    d.addr = parts.join(', ');
  }

  var dlg;
  function box() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'gf-dlg';
    dlg.setAttribute('aria-labelledby', 'gf-t');
    document.body.appendChild(dlg);
    return dlg;
  }

  NS.gstFetch = function (gstin, done) {
    var f = NS.gstinFacts(gstin);
    if (!f) { NS.toast(t('gf.first'), 'bad'); return; }
    var D = box(), got = null;
    D.innerHTML = '<div class="gf-hd"><h2 id="gf-t">' + esc(t('gf.title')) + '</h2><button type="button" class="icon-btn" data-gf-x aria-label="' + esc(t('close')) + '">✕</button></div>' +
      '<div class="gf-bd">' +
      '<p class="gf-g mono" dir="ltr">' + esc(f.gstin) + '</p>' +
      '<ul class="gf-facts"><li>' + esc(t('gf.state')) + ': <b>' + esc(f.state + ' · ' + (NS.stateLoc(f.state) || '—')) + '</b></li><li>PAN: <b class="mono">' + esc(f.pan) + '</b></li>' +
      (f.holder ? '<li>' + esc(t('gf.holder')) + ': <b>' + esc(f.holder) + '</b></li>' : '') + '</ul>' +
      '<ol class="gf-steps"><li>' + esc(t('gf.s1')) + '<br><button type="button" class="btn primary" data-gf-open>' + esc(t('gf.open')) + ' ↗</button></li>' +
      '<li>' + esc(t('gf.s2')) + '</li><li>' + esc(t('gf.s3')) + '</li></ol>' +
      '<label class="gf-lbl" for="gf-paste">' + esc(t('gf.paste')) + '</label>' +
      '<textarea id="gf-paste" rows="4" dir="auto" placeholder="' + esc(t('gf.ph')) + '"></textarea>' +
      '<div data-gf-out aria-live="polite"></div></div>' +
      '<div class="gf-ft"><button type="button" class="btn primary" data-gf-ok disabled>' + esc(t('gf.use')) + '</button><button type="button" class="btn" data-gf-x>' + esc(t('my.cancel')) + '</button></div>';
    var ta = D.querySelector('#gf-paste'), out = D.querySelector('[data-gf-out]'), ok = D.querySelector('[data-gf-ok]');
    Array.prototype.forEach.call(D.querySelectorAll('[data-gf-x]'), function (b) { b.onclick = function () { D.close(); }; });
    D.querySelector('[data-gf-open]').onclick = function () {
      var go = function () { window.open(PORTAL, '_blank', 'noopener'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(f.gstin).then(function () { NS.toast(t('gf.copied')); go(); }, go); else go();
    };
    function row(k, lbl, v, ltr) { return '<div class="f"><label for="gf-' + k + '">' + esc(t(lbl)) + '</label><input id="gf-' + k + '" data-k="' + k + '" value="' + esc(v || '') + '"' + (ltr ? ' dir="ltr"' : ' dir="auto"') + '></div>'; }
    function read() {
      var d = NS.parseGstPortal(ta.value);
      got = null; ok.disabled = true;
      if (!ta.value.trim()) { out.innerHTML = ''; return; }
      if (!d.legal && !d.trade) { out.innerHTML = '<p class="note bad">' + esc(t('gf.none')) + '</p>'; return; }
      if (d.gstin && d.gstin !== f.gstin) { out.innerHTML = '<p class="note bad">' + esc(t('gf.other', { g: d.gstin })) + '</p>'; return; }
      d.gstin = f.gstin; d.state = d.state || f.state;
      if (d.state !== f.state) d.state = f.state;
      var warn = d.status && !/^active/i.test(d.status) ? '<p class="note bad">' + esc(t('gf.inactive', { s: d.status })) + '</p>' : '';
      out.innerHTML = warn + '<p class="soft">' + esc(t('gf.check')) + '</p><div class="fg">' +
        row('name', 'gf.name', d.name) +
        (d.trade && d.legal && d.trade !== d.legal ? '<p class="gf-alt wide"><button type="button" class="link" data-gf-alt>' + esc(d.name === d.trade ? t('gf.uselegal', { n: d.legal }) : t('gf.usetrade', { n: d.trade })) + '</button></p>' : '') +
        row('addr', 'l.addr', d.addr) + row('city', 'l.city', d.city) + row('pin', 'l.pin', d.pin, 1) + '</div>' +
        '<ul class="gf-facts">' + [['gf.legal', d.legal], ['gf.trade', d.trade], ['gf.status', d.status], ['gf.type', d.type], ['gf.since', d.since], ['gf.const', d.constitution]]
          .filter(function (x) { return x[1]; }).map(function (x) { return '<li>' + esc(t(x[0])) + ': <b>' + esc(x[1]) + '</b></li>'; }).join('') + '</ul>';
      var tb = out.querySelector('[data-gf-alt]');
      if (tb) tb.onclick = function () {
        var nm = out.querySelector('#gf-name'), toTrade = nm.value !== d.trade;
        nm.value = toTrade ? d.trade : d.legal;
        tb.textContent = toTrade ? t('gf.uselegal', { n: d.legal }) : t('gf.usetrade', { n: d.trade });
      };
      got = d; ok.disabled = false;
    }
    ta.addEventListener('input', read);
    ok.onclick = function () {
      if (!got) return;
      Array.prototype.forEach.call(out.querySelectorAll('input[data-k]'), function (i) { got[i.getAttribute('data-k')] = i.value.trim(); });
      if (!got.name) { NS.toast(t('hub.v.name'), 'bad'); return; }
      got.checked = NS.today();
      D.close();
      done(got);
    };
    if (D.showModal) D.showModal(); else D.setAttribute('open', '');
    D.querySelector('[data-gf-open]').focus();
  };

  /* a "Get details" button under a GSTIN field; fill(d) puts the confirmed details into the form */
  NS.gstFetchButton = function (input, fill) {
    if (!input || input.getAttribute('data-gf')) return;
    input.setAttribute('data-gf', '1');
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'link gf-btn'; b.textContent = t('gf.btn'); b.hidden = true;
    var at = input.parentNode.querySelector('.hint') || input;
    at.parentNode.insertBefore(b, at.nextSibling);
    function sync() { b.hidden = !NS.gstinFacts(input.value); }
    input.addEventListener('input', sync); input.addEventListener('gf-sync', sync); sync();
    b.onclick = function () { NS.gstFetch(input.value, fill); };
    return b;
  };
})();
