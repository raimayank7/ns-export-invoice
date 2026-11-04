/* NS export invoice: extra fields for exports and SEZ supplies (docs.js type 'exp'), printed in English on the invoice.
   Rule 46 of the CGST Rules (checked in the consolidated CGST Rules, GST Council): an export or SEZ invoice carries the endorsement below
   and, instead of the usual buyer details, the recipient's name and address, the address of delivery and the country of destination. Amounts stay in rupees (GST is reported in ₹); the value in the
   foreign currency at the exchange rate is printed with them. The e-invoice file takes these as ExpDtls (einv.js). */
(function () {
  'use strict';
  var $ = NS.$, esc = NS.esc, num = NS.num, r2 = NS.r2, t = NS.t;
  var CUR = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', 'SGD', 'MYR', 'THB', 'JPY', 'CNY', 'HKD', 'AUD', 'NZD', 'CAD', 'CHF', 'SEK', 'NOK', 'DKK', 'ZAR', 'RUB', 'BDT', 'NPR', 'LKR', 'INR'];
  var COUNTRY = [['US', 'United States'], ['AE', 'United Arab Emirates'], ['GB', 'United Kingdom'], ['SA', 'Saudi Arabia'], ['QA', 'Qatar'], ['KW', 'Kuwait'], ['OM', 'Oman'], ['BH', 'Bahrain'],
    ['NL', 'Netherlands'], ['DE', 'Germany'], ['FR', 'France'], ['IT', 'Italy'], ['ES', 'Spain'], ['BE', 'Belgium'], ['PL', 'Poland'], ['SE', 'Sweden'], ['CH', 'Switzerland'], ['RU', 'Russia'], ['TR', 'Turkey'],
    ['CN', 'China'], ['HK', 'Hong Kong'], ['JP', 'Japan'], ['KR', 'South Korea'], ['SG', 'Singapore'], ['MY', 'Malaysia'], ['TH', 'Thailand'], ['VN', 'Vietnam'], ['ID', 'Indonesia'], ['PH', 'Philippines'],
    ['BD', 'Bangladesh'], ['NP', 'Nepal'], ['BT', 'Bhutan'], ['LK', 'Sri Lanka'], ['MV', 'Maldives'], ['MM', 'Myanmar'], ['AF', 'Afghanistan'],
    ['AU', 'Australia'], ['NZ', 'New Zealand'], ['CA', 'Canada'], ['MX', 'Mexico'], ['BR', 'Brazil'], ['ZA', 'South Africa'], ['NG', 'Nigeria'], ['KE', 'Kenya'], ['EG', 'Egypt'], ['TZ', 'Tanzania']];
  /* the endorsement exactly as Rule 46 (third proviso, as amended by 17/2017-CT) words it, for exports and SEZ supplies alike */
  var P = { wp: 'SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS ON PAYMENT OF INTEGRATED TAX',
    wop: 'SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX',
    country: 'Country of destination', port: 'Port of loading', sb: 'Shipping bill No. / date', lut: 'LUT / bond ref.', fc: 'Invoice value in', at: 'at', cur: 'Currency' };
  var api, box;
  function cname(c) { var x = COUNTRY.filter(function (k) { return k[0] === c; })[0]; return x ? x[1] : c; }
  function x(d) { return d.exp || (d.exp = { cur: 'USD', fx: '', country: '', port: '', sbNo: '', sbDate: '', lut: '', lutDate: '', refund: 'N' }); }
  function exportKind(d) { return /^exp/.test(d.kind); }
  function fcValue(d, tt) { var e = x(d), r = num(e.fx); return r > 0 && e.cur && e.cur !== 'INR' ? r2(tt.grand / r) : 0; }

  function editor(_, A) {
    api = A;
    if (A.type() !== 'exp') return '';
    var F = A.field;
    return '<fieldset class="card" id="x-box"><legend>' + esc(t('lg.exp')) + '</legend><div class="fg">' +
      '<div class="f"><label for="x-cur">' + esc(t('x.cur')) + '</label><select id="x-cur">' + CUR.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('') + '</select></div>' +
      F('x-fx', t('x.fx'), { mode: 'decimal', ltr: 1, hint: t('x.h.fx') }) +
      '<div class="f wide" id="x-fcv" aria-live="polite"></div>' +
      '<div class="f x-only"><label for="x-country">' + esc(t('x.country')) + '</label><select id="x-country"><option value="">' + esc(t('x.choose')) + '</option>' + COUNTRY.map(function (c) { return '<option value="' + c[0] + '">' + esc(c[1]) + ' (' + c[0] + ')</option>'; }).join('') + '</select></div>' +
      F('x-port', t('x.port'), { max: 6, ltr: 1, ph: 'INNSA1', hint: t('x.h.port') }) +
      F('x-sbno', t('x.sbno'), { max: 20, ltr: 1 }) + F('x-sbdate', t('x.sbdate'), { type: 'date', hint: t('x.h.sb') }) +
      F('x-lut', t('x.lut'), { max: 20, ltr: 1, ph: 'AD030426000123A', hint: t('x.h.lut') }) + F('x-lutdate', t('x.lutdate'), { type: 'date' }) +
      '<div class="f wide"><label class="chk"><input id="x-refund" type="checkbox"> ' + esc(t('x.refund')) + '</label></div>' +
    '</div></fieldset>';
  }
  var MAP = { 'x-cur': 'cur', 'x-fx': 'fx', 'x-country': 'country', 'x-port': 'port', 'x-sbno': 'sbNo', 'x-sbdate': 'sbDate', 'x-lut': 'lut', 'x-lutdate': 'lutDate' };
  function wire(ed) {
    box = $('#x-box', ed);
    if (!box) return;
    function onEdit(e) {
      var el = e.target, d = api.doc(), o = x(d);
      if (MAP[el.id]) { o[MAP[el.id]] = el.id === 'x-port' ? el.value.toUpperCase() : el.value; if (el.id === 'x-port' && e.type === 'change') el.value = o.port; }
      else if (el.id === 'x-refund') o.refund = el.checked ? 'Y' : 'N';
      else return;
      e.stopPropagation(); show(); api.changed();
    }
    box.addEventListener('input', onEdit, true);
    box.addEventListener('change', onEdit, true);
    /* export goes outside India (place of supply 96); an SEZ is in a state of India */
    ed.addEventListener('change', function (e) {
      if (e.target.id !== 'd-kind') return;
      var d = api.doc(), pos = $('#d-pos', ed);
      if (exportKind(d)) { d.pos = '96'; } else if (d.pos === '96') d.pos = '';
      if (pos) pos.value = d.pos;
      if (/wop$/.test(d.kind)) d.items.forEach(function (it) { it.gst = 0; });
      show(); api.changed();
      var g = document.querySelectorAll('#items [data-k="gst"]'); Array.prototype.forEach.call(g, function (i, n) { i.value = d.items[n] ? d.items[n].gst : i.value; });
    });
  }
  function show() {
    if (!box) return;
    var d = api.doc(), o = x(d), v = fcValue(d, api.totals()), lut = /wop$/.test(d.kind);
    Array.prototype.forEach.call(box.querySelectorAll('.x-only'), function (f) { f.hidden = !exportKind(d); });
    ['x-lut', 'x-lutdate'].forEach(function (id) { $('#' + id, box).closest('.f').hidden = !lut; });
    $('#x-fcv', box).textContent = v ? t('x.fcv', { cur: o.cur, v: v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }) : '';
  }
  function fill() {
    if (!box) return;
    var d = api.doc(), o = x(d);
    Object.keys(MAP).forEach(function (id) { $('#' + id, box).value = o[MAP[id]] || ''; });
    $('#x-refund', box).checked = o.refund === 'Y';
    if (!d.pos && exportKind(d)) d.pos = '96';
    show();
  }
  /* on the invoice: the Rule 46 endorsement, export details, value in the foreign currency */
  function sheet(d) {
    if (!api || api.type() !== 'exp') return '';
    var o = x(d), tt = api.totals(), v = fcValue(d, tt), exp = exportKind(d), lut = /wop$/.test(d.kind);
    var line = P[lut ? 'wop' : 'wp'];
    var row = function (k, val) { return val ? '<tr><th>' + k + '</th><td>' + val + '</td></tr>' : ''; };
    return '<div class="xp"><p class="xp-end">' + line + '</p><table>' +
      (exp ? row(P.country, esc(o.country ? cname(o.country) + ' (' + o.country + ')' : '')) : '') +
      row(P.port, o.port ? '<span class="mono">' + esc(o.port) + '</span>' : '') +
      row(P.sb, o.sbNo ? '<span class="mono">' + esc(o.sbNo) + '</span>' + (o.sbDate ? ' / ' + NS.fmtDate(o.sbDate) : '') : '') +
      (lut ? row(P.lut, o.lut ? '<span class="mono">' + esc(o.lut) + '</span>' + (o.lutDate ? ' / ' + NS.fmtDate(o.lutDate) : '') : '') : '') +
      (v ? row(P.fc + ' ' + esc(o.cur), '<b>' + esc(o.cur) + ' ' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</b> (' + P.at + ' 1 ' + esc(o.cur) + ' = ₹' + esc(o.fx) + ')') : '') +
      '</table></div>';
  }
  (NS.docExt = NS.docExt || []).push({ editor: editor, wire: wire, fill: fill, sheet: sheet });
})();
