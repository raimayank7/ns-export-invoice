/* NSBiz party and item forms (owner 26 Nov 2026: "New Party looks too simple and lacks options the vouchers need; New Item the same;
   organize them like the masters of Tally or Busy"). ONE sectioned form for the three places that make a party or an item:
     NS.quickAdd (core.js)      the small box opened from a voucher box (F2), the Dashboard shortcuts and the add-on inbox
     My data (vault/my.js)      Customers and suppliers / Items and services
     Masters (engine/masters.js) ledger form for a party, Stock item form
   The sections are tabs (Basics, GST and tax, Addresses, Credit and prices, Bank, Opening and more for a party; Basics, Tax, Prices,
   Stock, Manufacturing, Notes for an item, plus Custom fields when the business has some). Only fields are ADDED to the records:
   every field is optional, a saved party or item loads as before, and the keys already in use keep their names.

   NSPM.html(kind, rec, o)         the tabs and panes as HTML (kind 'party' | 'item')
   NSPM.wire(form, kind, rec, o)   tabs, GSTIN / IFSC / PAN checks, GST portal fill, ship-to places, Enter moves to the next box
   NSPM.read(form, kind, rec, o)   copies the boxes into rec; returns '' or { msg, el } when something must be put right
   NSPM.opening(form, kind, rec, o) Promise: the opening balance (party) or opening stock (item) entry, when one was typed
   NSPM.quick(inp, q, side)        the small dialog of NS.quickAdd
   o = { ctx: 'quick' | 'my' | 'masters', skip: ['name', ...], groups: [group rows], groupHtml(kind, value), biz: [businesses],
         godowns: [names], units: [names], ob: existing opening-balance document, seller(): business record or Promise, slots: { tax: html } }
   Where each field is used by the vouchers is written next to it below ("V:"); a field with no "V:" is kept for reference only. */
(function () {
  'use strict';
  if (!window.NS) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num;
  function T(k, v) { return NS.t(k, v); }
  function W(k, v) { return NS.t('pm.' + k, v); }
  var UNITS = ['Nos', 'Pcs', 'Kg', 'Gram', 'Litre', 'Meter', 'Box', 'Pack', 'Set', 'Dozen', 'Bag', 'Ton', 'Sq ft', 'Pair', 'Hours', 'Day', 'Month'];
  var RATES = [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40];
  function key(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function get(o, k) { return k.split('.').reduce(function (a, p) { return a == null ? a : a[p]; }, o); }
  function set(o, k, v) { var p = k.split('.'), l = p.pop(), c = o; p.forEach(function (x) { c = c[x] = c[x] && typeof c[x] === 'object' ? c[x] : {}; }); c[l] = v; }
  function unset(o, k) {
    var p = k.split('.'), l = p.pop(), c = o, trail = [];
    for (var i = 0; i < p.length; i++) { if (!c || typeof c[p[i]] !== 'object') return; trail.push([c, p[i]]); c = c[p[i]]; }
    delete c[l];
    for (var j = trail.length - 1; j >= 0; j--) { var po = trail[j][0][trail[j][1]]; if (po && !Object.keys(po).length) delete trail[j][0][trail[j][1]]; else break; }
  }
  function fid(k) { return 'pm-' + k.replace(/\./g, '-'); }
  function fyStart() { var t = NS.today(), y = +t.slice(0, 4), m = +t.slice(5, 7); return (m < 4 ? y - 1 : y) + '-04-01'; }

  /* ---------- the fields ----------
     [key, label key, type, { wide, hint, ph, max, mode, upper, opts, only, not }]
     types: text ltr num date area sel state gst unit check group usedby img head + the blocks ships ob prices alts bom last open cf */
  var SIDE = [['recv', 'ms.dr'], ['pay', 'ms.cr']];
  var PARTY = [
    { id: 'basic', t: 'pm.s_basic', f: [
      ['name', 'my.f.name', 'text', { wide: 1 }], ['pname', 'pm.pname', 'text', { hint: 'pm.pname_h' }],   /* V: the name printed on the party's bills (docs.js) */
      ['role', 'hub.role', 'sel', { opts: [['customer', 'hub.r.customer'], ['supplier', 'hub.r.supplier'], ['both', 'hub.r.both']] }],
      ['group', 'grp.group', 'group', { hint: 'grp.h_pgroup' }],
      ['phone', 'pm.mobile', 'ltr', { mode: 'tel' }], ['email', 'l.email', 'ltr', { mode: 'email' }],
      ['contact', 'pm.contact', 'text', { hint: 'pm.contact_h' }], ['agent', 'ms.agent', 'text', { hint: 'ms.h_agent' }]] },
    { id: 'gst', t: 'pm.s_gst', f: [
      ['gstin', 'l.cgstin', 'gstin', { wide: 1 }],   /* V: GSTIN, state and type decide CGST+SGST or IGST on every bill */
      ['reg', 'ms.reg', 'sel', { opts: [['', 'ms.reg_auto'], ['regular', 'ms.reg_regular'], ['comp', 'ms.reg_comp'], ['unreg', 'ms.reg_unreg'], ['sez', 'ms.reg_sez'], ['uin', 'ms.reg_uin'], ['overseas', 'ms.reg_overseas'], ['eco', 'ms.reg_eco']] }],
      ['pan', 'ms.pan', 'ltr', { max: 10, upper: 1 }], ['state', 'l.state', 'state'],
      ['_', 'pm.h_tds', 'head'],
      ['deductee', 'ms.ded', 'sel', { opts: [['', 'ms.ded_auto'], ['ind', 'ms.ded_ind'], ['huf', 'ms.ded_huf'], ['co', 'ms.ded_co'], ['firm', 'ms.ded_firm'], ['other', 'ms.ded_other']] }],   /* V: money paid / TDS (tdsbook.js) */
      ['tdsSec', 'ms.tdssec', 'ltr', { hint: 'ms.tdssech' }],
      ['panOp', 'ms.panop', 'sel', { opts: [['', 'ms.panop_ok'], ['inoperative', 'ms.panop_in']], hint: 'ms.panoph' }], ['nr', 'ms.nr', 'sel', { opts: [['', 'ms.nr_no'], ['1', 'ms.nr_yes']] }],
      ['ldc.no', 'ms.ldcno', 'ltr', { hint: 'ms.ldch' }], ['ldc.rate', 'ms.ldcrate', 'num'], ['ldc.limit', 'ms.ldclim', 'num'], ['ldc.from', 'ms.ldcfrom', 'date'], ['ldc.to', 'ms.ldcto', 'date'],
      ['tcsOn', 'pm.tcson', 'check', { hint: 'pm.tcson_h' }], ['tcsRate', 'pm.tcsrate', 'num', { hint: 'pm.tcsrate_h' }],   /* V: sale bills switch TCS on for this party (docs.js) */
      ['_', 'pm.h_msme', 'head'],
      ['msme', 'cp.f_size', 'sel', { opts: [['', 'cp.sz_none'], ['micro', 'cp.sz_micro'], ['small', 'cp.sz_small'], ['medium', 'cp.sz_medium'], ['other', 'cp.sz_other']], hint: 'cp.h_size' }],
      ['udyam', 'cp.f_ud', 'ltr', { max: 22, upper: 1, ph: 'UDYAM-XX-00-0000000' }], ['agdays', 'cp.f_ag', 'num', { hint: 'cp.f_ag_h' }]] },
    { id: 'addr', t: 'pm.s_addr', f: [
      ['_', 'pm.h_bill', 'head'],
      ['addr', 'l.addr', 'area', { wide: 1 }], ['city', 'l.city', 'text'], ['pin', 'l.pin', 'ltr', { mode: 'numeric', max: 6 }],
      ['km', 'ms.km', 'num', { hint: 'ms.h_km' }],   /* V: the e-way bill distance (docs.js) */
      ['route', 'rtb.route', 'text', { hint: 'rtb.h_route' }], ['scheme', 'rtb.scheme', 'text', { hint: 'rtb.h_scheme' }],
      ['_', 'pm.h_ship', 'head'], ['ships', 'pm.ships', 'ships', { wide: 1 }]] },   /* V: the default place fills the bill's ship-to, the others are picked in the bill */
    { id: 'credit', t: 'pm.s_credit', f: [
      ['ptype', 'b1.ptype', 'sel', { opts: [['retail', 'b1.pt_retail'], ['wholesale', 'b1.pt_whole']], hint: 'b1.h_ptype' }],   /* V: item price list used on the party's bills */
      ['disc', 'pm.disc', 'num', { hint: 'pm.disc_h' }],   /* V: discount % on every new line of the party's bills */
      ['climit', 'b1.climit', 'num', { hint: 'b1.h_climit' }], ['cdays', 'b1.cdays', 'num', { hint: 'b1.h_cdays' }],   /* V: due date and credit limit warning */
      ['int.rate', 'pm.intrate', 'num', { hint: 'pm.intrate_h' }], ['int.grace', 'pm.intgrace', 'num'],   /* V: interest on late payment (Dues and the party's ledger) */
      ['prices', 'pm.prices', 'prices', { wide: 1 }]] },   /* V: the party's own item prices */
    { id: 'bank', t: 'pm.s_bank', f: [
      ['bankName', 'l.bank', 'text'], ['bankBranch', 'l.branch', 'text'], ['bankAcc', 'l.acc', 'ltr', { mode: 'numeric' }], ['bankIfsc', 'l.ifsc', 'ltr', { max: 11, upper: 1 }],
      ['upi', 'l.upi', 'ltr', { wide: 1, ph: 'name@bank' }], ['_', 'pm.bank_h', 'note']] },
    { id: 'more', t: 'pm.s_more', f: [
      ['_', 'pm.h_open', 'head'], ['ob', 'pm.ob', 'ob', { wide: 1 }],
      ['_', 'pm.h_trn', 'head'], ['tname', 'pm.tname', 'text', { hint: 'pm.tname_h' }], ['tid', 'pm.tid', 'ltr', { hint: 'pm.tid_h' }],   /* V: the transporter on the bill's dispatch details and e-way bill */
      ['_', 'pm.h_other', 'head'],
      ['notes', 'pm.notes', 'area', { wide: 1 }], ['biz', 'pb.usedby', 'usedby', { hint: 'pb.usedbyh' }], ['inactive', 'pm.inactive', 'check', { hint: 'pm.inactive_h' }]] }
  ];
  var ITEM = [
    { id: 'basic', t: 'pm.s_basic', f: [
      ['desc', 'hub.f.iname', 'text', { wide: 1 }], ['pname', 'pm.ipname', 'text', { hint: 'pm.ipname_h' }],
      ['kind', 'l.type', 'sel', { opts: [['goods', 'hub.k.goods'], ['service', 'hub.k.service']] }], ['group', 'grp.group', 'group', { hint: 'grp.h_igroup' }],
      ['code', 'hub.f.code', 'ltr'], ['barcode', 'pm.barcode', 'ltr', { hint: 'pm.barcode_h' }],   /* V: a scanned barcode finds the item (billing scan button) */
      ['unit', 'l.unit', 'unit'], ['alts', 'ms.alts', 'alts', { wide: 1 }],
      ['descr', 'pm.descr', 'area', { hint: 'pm.descr_h' }]] },   /* V: printed under the item name on bills */
    { id: 'tax', t: 'pm.s_tax', f: [
      ['hsn', 'l.hsn', 'ltr', { mode: 'numeric', max: 8, hint: 'pm.hsn_h' }], ['gst', 'l.gst', 'gst'],
      ['tax.kind', 'ms.tk', 'sel', { opts: [['taxable', 'ms.tk_taxable'], ['nil', 'ms.tk_nil'], ['exempt', 'ms.tk_exempt'], ['nongst', 'ms.tk_nongst']] }],
      ['tax.itc', 'ms.itc', 'sel', { opts: [['ok', 'ms.itc_ok'], ['blocked', 'ms.itc_blocked'], ['ineligible', 'ms.itc_inel']], hint: 'ms.itch' }],
      ['_slot', 'tax', 'slot'],
      ['incl', 'pm.incl', 'check', { hint: 'pm.incl_h' }]] },   /* V: the saved rates include GST: the bill takes the rate before tax */
    { id: 'price', t: 'pm.s_price', f: [
      ['rate', 'b1.retail', 'num', { hint: 'b1.h_retail' }], ['wrate', 'b1.whole', 'num'], ['mrp', 'b1.mrp', 'num'], ['prate', 'b1.prate', 'num'],
      ['disc', 'pm.idisc', 'num', { hint: 'pm.idisc_h' }],   /* V: discount % filled on the bill line */
      ['sl', 'bw.isl', 'text', { hint: 'bw.islh', only: 'multiled' }], ['pl', 'bw.ipl', 'text', { only: 'multiled' }],
      ['last', 'pm.last', 'last', { wide: 1 }]] },
    { id: 'stock', t: 'pm.s_stock', f: [
      ['track', 'ms.track', 'sel', { opts: [['', 'ms.tr_none'], ['batch', 'ms.tr_batch'], ['serial', 'ms.tr_serial'], ['both', 'ms.tr_both']], hint: 'pm.track_h' }],   /* V: batch / expiry / serial boxes on bill lines */
      ['min', 'ms.rlevel', 'num'], ['rq', 'ms.rqty', 'num'], ['max', 'ms.rmax', 'num'], ['lead', 'ms.rlead', 'num'], ['supplier', 'ms.rsup', 'text'],
      ['_', 'pm.h_ostock', 'head'], ['open', 'pm.open', 'open', { wide: 1 }],
      ['_', 'pm.stock_h', 'note']] },
    { id: 'mfg', t: 'pm.s_mfg', f: [['src', 'pm.src', 'sel', { opts: [['', 'pm.src_none'], ['bought', 'pm.src_bought'], ['made', 'pm.src_made'], ['both', 'pm.src_both']] }], ['bom', 'pm.bom', 'bom', { wide: 1 }]] },
    { id: 'more', t: 'pm.s_inote', f: [
      ['img', 'pm.img', 'img', { wide: 1 }], ['notes', 'pm.notes', 'area', { wide: 1 }],
      ['biz', 'pb.usedby', 'usedby', { hint: 'pb.usedbyh' }], ['inactive', 'pm.inactive', 'check', { hint: 'pm.iinactive_h' }]] }
  ];
  function secs(kind) { return kind === 'item' ? ITEM : PARTY; }
  function fobj(a) { return { key: a[0], lbl: a[1], type: a[2], x: a[3] || {} }; }
  function allFields(kind) { var out = []; secs(kind).forEach(function (s) { s.f.forEach(function (a) { if (a[2] !== 'head' && a[2] !== 'note' && a[2] !== 'slot') out.push(fobj(a)); }); }); return out; }

  /* ---------- html ---------- */
  function optHtml(v, label, cur) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function groupOpts(list, kind, cur) {
    list = list || []; var out = kind === 'item' ? optHtml('', T('grp.none'), cur) : '';
    var sub = function (id, lv) { list.filter(function (x) { return x.under === id; }).forEach(function (x) { out += optHtml(x.id, (lv ? ' '.repeat(lv) : '') + x.name, cur); sub(x.id, lv + 1); }); };
    list.filter(function (g) { return !g.under; }).forEach(function (g) { out += optHtml(g.id, g.name, cur); sub(g.id, 1); });
    return out;
  }
  function field(f, rec, o) {
    var k = f.key, x = f.x, v = get(rec, k), id = fid(k), cls = 'pm-f' + (x.wide || f.type === 'area' ? ' wide' : '');
    if (v == null) v = '';
    if (f.type === 'head') return '<h4 class="pm-h">' + esc(T(f.lbl)) + '</h4>';
    if (f.type === 'note') return '<p class="pm-n soft wide">' + esc(T(f.lbl)) + '</p>';
    if (f.type === 'slot') return (o.slots && o.slots[f.lbl]) || '';
    if (x.only === 'multiled' && !o.multiLed) return '';
    var lbl = '<label for="' + id + '">' + esc(T(f.lbl)) + '</label>', hint = x.hint ? '<small class="hint">' + esc(T(x.hint)) + '</small>' : '', h;
    var nm = ' id="' + id + '" name="' + esc(k) + '"';
    switch (f.type) {
      case 'area': h = '<textarea' + nm + ' rows="2" dir="auto">' + esc(v) + '</textarea>'; break;
      case 'sel': h = '<select' + nm + '>' + x.opts.map(function (p) { return optHtml(p[0], T(p[1]), String(v === true ? '1' : v)); }).join('') + '</select>'; break;
      case 'state': h = '<select' + nm + '><option value="">—</option>' + NS.STATES.map(function (s) { return optHtml(s[0], s[0] + ' · ' + (NS.stateLoc ? NS.stateLoc(s[0]) : s[1]), v); }).join('') + '</select>'; break;
      case 'gst': {
        var cur = v === '' ? '' : +v, list = RATES.slice(); if (cur !== '' && list.indexOf(cur) < 0) list.push(cur); list.sort(function (a, b) { return a - b; });
        h = '<select' + nm + '>' + list.map(function (g) { return optHtml(g, g + '%' + (RATES.indexOf(g) < 0 ? ' ⚠' : ''), cur); }).join('') + '</select>'; break; }
      case 'unit': h = '<input' + nm + ' value="' + esc(v) + '" list="pm-units" dir="ltr" autocomplete="off">'; break;
      case 'check': return '<div class="' + cls + '"><label class="chk" for="' + id + '"><input type="checkbox"' + nm + (v ? ' checked' : '') + '> <span>' + esc(T(f.lbl)) + '</span></label>' + hint + '</div>';
      case 'group':
        if (o.groupHtml) h = '<select' + nm + '>' + o.groupHtml(rec, v) + '</select><span class="gnew" data-gnew hidden><label class="sr" for="' + id + '-new">' + esc(T('grp.newname')) + '</label><input id="' + id + '-new" dir="auto" maxlength="60" placeholder="' + esc(T('grp.newname')) + '"><button type="button" class="btn sm" data-gnew-add>' + esc(T('grp.addbtn')) + '</button></span>';
        else { var gc = v; if (o.kind === 'item' && o.meta && NS.itemGroup) { try { gc = NS.itemGroup(rec, o.meta).id || v; } catch (e) {} } h = '<select' + nm + '>' + groupOpts(o.groups, o.kind, gc) + '</select>'; }
        break;
      case 'usedby': {
        var bz = o.biz || []; if (bz.length < 2 && !v) return '';
        h = '<select' + nm + '><option value="">' + esc(T('pb.allbiz')) + '</option>' + bz.map(function (b) { return optHtml(b.id, T('pb.only', { b: b.name }), v); }).join('') + '</select>'; break; }
      case 'img': h = '<div class="pm-img"><img alt="" data-pmimg' + (v ? ' src="' + esc(v) + '"' : ' hidden') + '><input type="file" accept="image/*" data-pmimgin id="' + id + '"><button type="button" class="link" data-pmimgrm' + (v ? '' : ' hidden') + '>' + esc(T('hub.rmimg')) + '</button></div>'; break;
      case 'ships': return '<div class="' + cls + '" data-pmships>' + shipsHtml(rec) + '<button type="button" class="btn sm" data-pmshipadd>+ ' + esc(W('shipadd')) + '</button><small class="hint">' + esc(W('ships_h')) + '</small></div>';
      case 'ob': {
        var ob = o.ob, amt = ob ? num(ob.amount) : '', side = ob ? (ob.side === 'pay' ? 'pay' : 'recv') : (o.side === 'supplier' || (rec.role === 'supplier') ? 'pay' : 'recv');
        if (o.ob === false) return '';
        return '<div class="' + cls + '"><span class="pm-lbl">' + esc(T('ms.obal', { d: NS.fmtDate(fyStart()) })) + '</span><div class="pm-row"><input id="pm-obamt" name="obamt" inputmode="decimal" dir="ltr" value="' + esc(amt) + '" aria-label="' + esc(T('ms.obal', { d: NS.fmtDate(fyStart()) })) + '">' +
          '<select name="obside" aria-label="' + esc(T('ms.drcr')) + '">' + SIDE.map(function (p) { return optHtml(p[0], T(p[1]), side); }).join('') + '</select></div><small class="hint">' + esc(W('ob_h')) + (o.ctx === 'my' ? ' ' + esc(W('ob_link')) : ' <a href="#money" data-pmlink>' + esc(W('ob_link')) + '</a>') + '</small></div>'; }
      case 'prices': if (!window.NSReuse) return '';
        return '<div class="' + cls + '"><label for="' + id + '">' + esc(T(f.lbl)) + '</label><textarea' + nm.replace(' name="prices"', ' name="pricestext"') + ' rows="4" dir="auto" placeholder="' + esc(T('cap.prices_ph')) + '">' + esc(NSReuse.pricesText(rec.prices)) + '</textarea><small class="hint">' + esc(T('cap.prices_h')) + '</small>' +
          '<button type="button" class="btn sm" data-pmfillprices>' + esc(T('cap.prices_fill')) + '</button></div>';
      case 'alts': {
        var altv = window.NSMfg && NSMfg.altsOf ? NSMfg.altsOf(rec) : (rec.alt ? [rec.alt] : []);
        h = '<input' + nm.replace('name="alts"', 'name="altstext"') + ' dir="ltr" autocomplete="off" value="' + esc(altv.map(function (a) { return a.unit + ' = ' + a.per; }).join(', ')) + '" placeholder="Box = 12, Carton = 144">'; hint = '<small class="hint">' + esc(T('ms.altsh')) + '</small>'; break; }
      case 'bom': {
        var lines = rec.bom && (rec.bom.lines || []).length ? rec.bom.lines.map(function (l) { return l.desc + ' ' + l.qty; }).join(', ') : '';
        return '<div class="' + cls + '"><span class="pm-lbl">' + esc(T(f.lbl)) + '</span><p class="soft">' + esc(lines ? T('b2.hasbom', { l: lines }) : W('bom_none')) + '</p><small class="hint">' + esc(W('bom_h')) + (o.ctx === 'my' ? ' ' + esc(W('bom_link')) : ' <a href="#b2make" data-pmlink>' + esc(W('bom_link')) + '</a>') + '</small></div>'; }
      case 'open':
        if (rec.id || o.open === false) return '<div class="' + cls + '"><small class="hint">' + esc(W('open_edit')) + '</small></div>';
        return '<div class="' + cls + '"><span class="pm-lbl">' + esc(T('ms.oqty', { d: NS.fmtDate(fyStart()) })) + '</span><div class="pm-row"><input name="openqty" inputmode="decimal" dir="ltr" aria-label="' + esc(T('ms.oqty', { d: NS.fmtDate(fyStart()) })) + '" placeholder="' + esc(W('open_qty')) + '">' +
          '<input name="openrate" inputmode="decimal" dir="ltr" aria-label="' + esc(T('ms.orate')) + '" placeholder="' + esc(T('ms.orate')) + '">' +
          '<select name="opengd" aria-label="' + esc(W('godown')) + '">' + optHtml('', W('godown_main'), '') + (o.godowns || []).map(function (g) { return optHtml(g, g, ''); }).join('') + '</select></div></div>';
      case 'last': return '<div class="' + cls + '" data-pmlast><span class="pm-lbl">' + esc(T(f.lbl)) + '</span><p class="soft" data-pmlastbody>' + esc(rec.id ? '…' : W('last_new')) + '</p></div>';
      default: {
        var a = nm + ' value="' + esc(v) + '"';
        a += f.type === 'ltr' || f.type === 'gstin' || f.type === 'num' ? ' dir="ltr"' : ' dir="auto"';
        if (f.type === 'date') a += ' type="date"';
        if (x.mode === 'email') a += ' type="email" inputmode="email" autocapitalize="none"'; else if (x.mode) a += ' inputmode="' + x.mode + '"';
        if (f.type === 'num') a += ' inputmode="decimal"';
        if (x.max) a += ' maxlength="' + x.max + '"';
        if (f.type === 'gstin') { a += ' maxlength="15" autocapitalize="characters" spellcheck="false"'; hint = '<small class="hint" data-pmgst aria-live="polite"></small>'; }
        if (x.upper) a += ' autocapitalize="characters" spellcheck="false"';
        if (x.ph) a += ' placeholder="' + esc(x.ph) + '"';
        if (k === 'hsn') a += ' autocomplete="off"';
        h = '<input' + a + '>';
        if (f.type === 'gstin') h += '<span data-pmgstbtn></span>';
      }
    }
    return '<div class="' + cls + '">' + lbl + h + hint + '</div>';
  }
  function shipRow(s, i) {
    s = s || {};
    return '<div class="pm-ship" data-pmship><div class="pm-shh"><b>' + esc(i ? W('ship_n', { n: i + 1 }) : W('ship_def')) + '</b><button type="button" class="link" data-pmshiprm>' + esc(T('it.rm')) + '</button></div><div class="pm-g">' +
      '<div class="pm-f wide"><label>' + esc(T('l.shname')) + '</label><input data-sk="name" dir="auto" value="' + esc(s.name || '') + '"></div>' +
      '<div class="pm-f wide"><label>' + esc(T('l.shaddr')) + '</label><textarea data-sk="addr" rows="2" dir="auto">' + esc(s.addr || '') + '</textarea></div>' +
      '<div class="pm-f"><label>' + esc(T('l.shcity')) + '</label><input data-sk="city" dir="auto" value="' + esc(s.city || '') + '"></div>' +
      '<div class="pm-f"><label>' + esc(T('l.shpin')) + '</label><input data-sk="pin" inputmode="numeric" maxlength="6" dir="ltr" value="' + esc(s.pin || '') + '"></div>' +
      '<div class="pm-f"><label>' + esc(T('l.shstate')) + '</label><select data-sk="state"><option value="">—</option>' + NS.STATES.map(function (z) { return optHtml(z[0], z[0] + ' · ' + (NS.stateLoc ? NS.stateLoc(z[0]) : z[1]), s.state || ''); }).join('') + '</select></div>' +
      '<div class="pm-f"><label>' + esc(W('ship_gstin')) + '</label><input data-sk="gstin" maxlength="15" dir="ltr" autocapitalize="characters" value="' + esc(s.gstin || '') + '"></div></div></div>';
  }
  function shipsHtml(rec) {
    var list = []; if (rec.ship && (rec.ship.addr || rec.ship.name)) list.push(rec.ship); (rec.ships || []).forEach(function (s) { list.push(s); });
    return '<div data-pmshiplist>' + list.map(shipRow).join('') + '</div>';
  }
  var CSSDONE = false;
  function css() {
    if (CSSDONE) return; CSSDONE = true;
    var s = document.createElement('style'); s.id = 'pm-css';
    s.textContent = '.fg>.pm,.pm-g>.pm{grid-column:1/-1}.pm{min-width:0}.pm-tabs{display:flex;gap:2px;overflow-x:auto;scrollbar-width:thin;border-bottom:1px solid var(--line);margin:0 0 12px;-webkit-overflow-scrolling:touch}' +
      '.pm-tabs button{flex:none;background:none;border:0;border-bottom:3px solid transparent;color:var(--soft);font:inherit;font-weight:600;font-size:.92rem;padding:10px 12px;min-height:44px;cursor:pointer;white-space:nowrap}' +
      '.pm-tabs button[aria-selected=true]{color:var(--ink);border-bottom-color:var(--accent)}.pm-tabs button:hover{color:var(--ink)}.pm-tabs button:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}' +
      '.pm-tabs button.pm-bad{color:var(--bad)}.pm-tabs button .pm-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-inline-start:6px;vertical-align:middle}' +
      '.pm-pane[hidden]{display:none}.pm-g{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}' +
      '.pm-f{display:flex;flex-direction:column;gap:4px;min-width:0}.pm-f.wide,.pm-g>.wide,.pm-g>.pm-h,.pm-g>.pm-n{grid-column:1/-1}' +
      '.pm-f label,.pm-lbl{font-size:.86rem;font-weight:600}.pm-f label.chk{display:flex;align-items:center;gap:8px;min-height:44px;font-size:.95rem;font-weight:500}' +
      '.pm-h{margin:10px 0 0;font-size:.95rem;padding-top:10px;border-top:1px solid var(--line)}.pm-g>.pm-h:first-child{border-top:0;padding-top:0;margin-top:0}.pm-n{margin:4px 0}' +
      '.pm-row{display:flex;gap:8px;flex-wrap:wrap}.pm-row>*{flex:1 1 110px;min-width:0}' +
      '.pm-ship{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:0 0 10px}.pm-shh{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}' +
      '.pm-img{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.pm-img img{max-width:120px;max-height:120px;border-radius:8px;border:1px solid var(--line)}' +
      '.pm .hint{color:var(--soft);font-size:.82rem}.pm .hint.good{color:var(--ok)}.pm .hint.bad{color:var(--bad)}.pm-msg{color:var(--bad);margin:8px 0 0;font-weight:600}' +
      '.pm input,.pm select,.pm textarea{width:100%;box-sizing:border-box}.pm input[type=checkbox]{width:20px}.pm input[type=file]{width:auto}' +
      '.pm-last table{border-collapse:collapse;font-size:.85rem}.pm-last td,.pm-last th{padding:3px 10px 3px 0;text-align:left}' +
      '.qa-dlg.pm-dlg .qa-form{max-width:780px}.acx-dlg.pm-wide{max-width:min(860px,96vw)}#hub-form.pm-wide{max-width:min(860px,96vw)}' +
      '@media (max-width:420px){.pm-row{flex-direction:column}.pm-row>*{flex:none}}@media (max-width:560px){.pm-g{grid-template-columns:1fr}.pm-tabs button{padding:10px 10px;font-size:.88rem}}';
    document.head.appendChild(s);
  }
  function html(kind, rec, o) {
    css(); rec = rec || {}; o = o || {}; o.kind = kind;
    var skip = {}; (o.skip || []).forEach(function (k) { skip[k] = 1; });
    var panes = [], tabs = [], first = true;
    var hasCf = window.NSCF && NSCF.formHtml && NSCF.formHtml(kind, rec);
    secs(kind).forEach(function (s) {
      var body = s.f.filter(function (a) { return !skip[a[0]] || a[2] === 'head'; }).map(function (a) { return field(fobj(a), rec, o); }).join('');
      body = body.replace(/(<h4 class="pm-h">[^<]*<\/h4>)(?=(<h4 class="pm-h">|$))/g, '');   /* a heading with nothing under it */
      if (!body.replace(/<h4[^>]*>.*?<\/h4>/g, '').trim()) return;
      tabs.push('<button type="button" role="tab" id="pmt-' + s.id + '" data-pmt="' + s.id + '" aria-controls="pmp-' + s.id + '" aria-selected="' + (first ? 'true' : 'false') + '" tabindex="' + (first ? 0 : -1) + '">' + esc(T(s.t)) + '</button>');
      panes.push('<div class="pm-pane" role="tabpanel" id="pmp-' + s.id + '" data-pmp="' + s.id + '" aria-labelledby="pmt-' + s.id + '"' + (first ? '' : ' hidden') + '><div class="pm-g">' + body + '</div></div>');
      first = false;
    });
    if (hasCf) {
      tabs.push('<button type="button" role="tab" id="pmt-cf" data-pmt="cf" aria-controls="pmp-cf" aria-selected="false" tabindex="-1">' + esc(W('s_cf')) + '</button>');
      panes.push('<div class="pm-pane" role="tabpanel" id="pmp-cf" data-pmp="cf" aria-labelledby="pmt-cf" hidden>' + hasCf + '</div>');
    }
    return '<div class="pm" data-pm="' + kind + '"><div class="pm-tabs" role="tablist" aria-label="' + esc(W(kind === 'item' ? 'tabs_item' : 'tabs_party')) + '">' + tabs.join('') + '</div>' + panes.join('') +
      '<datalist id="pm-units">' + (o.units || UNITS).map(function (u) { return '<option value="' + esc(u) + '">'; }).join('') + '</datalist><p class="pm-msg" role="alert" hidden data-pmmsg></p></div>';
  }

  /* ---------- behaviour ---------- */
  function showTab(root, id, focus) {
    $$('[data-pmt]', root).forEach(function (b) { var on = b.getAttribute('data-pmt') === id; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    $$('[data-pmp]', root).forEach(function (p) { p.hidden = p.getAttribute('data-pmp') !== id; });
  }
  function say(root, msg) { var m = $('[data-pmmsg]', root); if (m) { m.textContent = msg || ''; m.hidden = !msg; } }
  function fail(form, el, msg) {
    var root = $('.pm', form), pane = el && el.closest && el.closest('[data-pmp]');
    if (pane) { showTab(root, pane.getAttribute('data-pmp')); var b = $('[data-pmt="' + pane.getAttribute('data-pmp') + '"]', root); if (b) { b.classList.add('pm-bad'); setTimeout(function () { b.classList.remove('pm-bad'); }, 4000); } }
    say(root, msg); if (el && el.focus) el.focus(); NS.toast(msg, 'bad');
    return { msg: msg, el: el };
  }
  function gstHint(form) {
    var g = form.elements.gstin; if (!g) return;
    g.value = g.value.toUpperCase().replace(/\s/g, '');
    var c = NS.gstinCheck(g.value), h = $('[data-pmgst]', form), st = form.elements.state;
    if (h) {
      if (c.empty) { h.textContent = ''; h.className = 'hint'; }
      else if (g.value.length < 15) { h.textContent = T('hub.gst.typing', { n: 15 - g.value.length }); h.className = 'hint'; }
      else { h.textContent = c.ok ? T('hub.gst.ok', { state: NS.stateLoc(c.state) || '—', pan: c.pan }) : c.msg; h.className = 'hint ' + (c.ok ? 'good' : 'bad'); }
    }
    if (c.ok) {
      if (c.state && st && !st.value) st.value = c.state;
      if (form.elements.pan && !form.elements.pan.value) form.elements.pan.value = g.value.slice(2, 12);
      var rg = form.elements.reg; if (rg && (rg.value === '' || rg.value === 'unreg') && rg.querySelector('option[value=regular]')) rg.value = rg.value === 'unreg' ? 'regular' : rg.value;
    }
  }
  function ifscHint(form) {
    var i = form.elements.bankIfsc; if (!i) return; i.value = i.value.toUpperCase().replace(/\s/g, '');
    var ok = !i.value || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(i.value); i.setCustomValidity(''); i.classList.toggle('pm-badin', !ok);
    i.setAttribute('aria-invalid', ok ? 'false' : 'true');
  }
  function shrink(file, max) {
    return new Promise(function (res) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', .82)); };
      img.onerror = function () { NS.toast(T('img.bad'), 'bad'); res(''); };
      img.src = url;
    });
  }
  function lastRates(form, kind, rec) {
    var box = $('[data-pmlastbody]', form); if (!box || !rec.desc || !window.NSReuse || !NSReuse.rateHistory) return;
    NSStore.list('doc').then(function (docs) {
      var one = function (side) { try { return NSReuse.rateHistory(docs, '', '', rec.desc, side, 3) || []; } catch (e) { return []; } };
      var s = one('sale'), b = one('buy');
      var row = function (lbl, L) { return L.length ? '<tr><th>' + esc(lbl) + '</th><td>' + L.map(function (x) { return esc(NS.money(x.rate)) + (x.date ? ' <small>(' + esc(NS.fmtDate(x.date)) + ')</small>' : ''); }).join(' · ') + '</td></tr>' : ''; };
      var h = row(W('last_sale'), s) + row(W('last_buy'), b);
      box.parentNode.classList.add('pm-last'); box.outerHTML = h ? '<table>' + h + '</table>' : '<p class="soft">' + esc(W('last_none')) + '</p>';
    }, function () {});
  }
  function wire(form, kind, rec, o) {
    css(); rec = rec || {}; o = o || {};
    var root = $('.pm', form); if (!root || root._pmWired) return; root._pmWired = 1;
    form._pmRec = rec; form._pmO = o;
    var tabs = $('.pm-tabs', root);
    tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-pmt]'); if (b) showTab(root, b.getAttribute('data-pmt')); });
    tabs.addEventListener('keydown', function (e) {
      var L = $$('[data-pmt]', tabs), i = L.indexOf(document.activeElement); if (i < 0 || !/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) return;
      e.preventDefault(); var rtl = getComputedStyle(root).direction === 'rtl', n = e.key === 'Home' ? 0 : e.key === 'End' ? L.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1) + L.length) % L.length;
      showTab(root, L[n].getAttribute('data-pmt'), true);
    });
    /* a dot on a tab that holds something typed in it, so a long form shows where the data is */
    function dots() { $$('[data-pmp]', root).forEach(function (p) { var has = [].some.call(p.querySelectorAll('input:not([type=file]):not([type=checkbox]),textarea,select'), function (x) { return x.value && x.defaultValue !== undefined && (x.tagName === 'SELECT' ? x.selectedIndex > 0 && !x.name.match(/^(role|kind|ptype|tax\.kind|tax\.itc|gst|unit|group|obside|reg)$/) : x.value !== ''); }) || [].some.call(p.querySelectorAll('input[type=checkbox]'), function (c) { return c.checked; });
      var b = $('[data-pmt="' + p.getAttribute('data-pmp') + '"]', root), d = $('.pm-dot', b); if (has && !d) b.insertAdjacentHTML('beforeend', '<span class="pm-dot" aria-hidden="true"></span>'); else if (!has && d) d.remove(); }); }
    form.addEventListener('input', dots); form.addEventListener('change', dots); setTimeout(dots, 0);
    if (form.elements.gstin) {
      form.elements.gstin.addEventListener('input', function () { gstHint(form); }); gstHint(form);
      var slot = $('[data-pmgstbtn]', form);
      if (NS.gstFetchButton) NS.gstFetchButton(form.elements.gstin, function (d) {
        ['name', 'addr', 'city', 'pin', 'state'].forEach(function (k) { var el = form.elements[k]; if (el && d[k] && (k !== 'name' || !el.value.trim())) el.value = d[k]; });
        if (d.reg && form.elements.reg) form.elements.reg.value = d.reg;
        form._pmGst = { legal: d.legal || '', trade: d.trade || '', status: d.status || '', type: d.type || '', since: d.since || '', checked: d.checked };
        gstHint(form); dots();
      });
      void slot;
    }
    if (form.elements.bankIfsc) form.elements.bankIfsc.addEventListener('input', function () { ifscHint(form); });
    if (form.elements.pan) form.elements.pan.addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/\s/g, ''); });
    if (form.elements.role) form.elements.role.addEventListener('change', function () {
      if (form.elements.group && !o.groupHtml && /^(debtors|creditors)$/.test(form.elements.group.value)) form.elements.group.value = this.value === 'supplier' ? 'creditors' : 'debtors';
      if (form.elements.obside && !(o.ob && o.ob.id)) form.elements.obside.value = this.value === 'supplier' ? 'pay' : 'recv';
    });
    if (form.elements.hsn) form.elements.hsn.addEventListener('input', function () {
      var v = this.value.replace(/\D/g, ''); if (/^99/.test(v) && form.elements.kind) form.elements.kind.value = 'service';
      if (v.length >= 4 && NS.hsnRate && form.elements.gst && !form.elements.gst._pmTouched) { try { var r = NS.hsnRate(v); if (r && r.one != null && !isNaN(+r.one)) form.elements.gst.value = String(+r.one); } catch (e) {} }
    });
    if (form.elements.gst) form.elements.gst.addEventListener('change', function () { this._pmTouched = true; });
    /* ship-to places */
    var sh = $('[data-pmships]', form);
    if (sh) {
      var redraw = function () { $$('[data-pmship]', sh).forEach(function (r, i) { $('b', r).textContent = i ? W('ship_n', { n: i + 1 }) : W('ship_def'); }); };
      sh.addEventListener('click', function (e) {
        if (e.target.closest('[data-pmshipadd]')) { $('[data-pmshiplist]', sh).insertAdjacentHTML('beforeend', shipRow({}, $$('[data-pmship]', sh).length)); redraw(); var l = $$('[data-pmship]', sh); $('input', l[l.length - 1]).focus(); }
        var rm = e.target.closest('[data-pmshiprm]'); if (rm) { rm.closest('[data-pmship]').remove(); redraw(); }
      });
      if (!$$('[data-pmship]', sh).length) $('[data-pmshiplist]', sh).innerHTML = shipRow({}, 0);
    }
    /* picture */
    var imgin = $('[data-pmimgin]', form);
    if (imgin) {
      var im = $('[data-pmimg]', form), rm = $('[data-pmimgrm]', form); form._pmImg = rec.img || '';
      imgin.addEventListener('change', function () { var f = imgin.files[0]; if (f) shrink(f, 480).then(function (u) { form._pmImg = u; im.src = u; im.hidden = !u; rm.hidden = !u; }); });
      rm.addEventListener('click', function () { form._pmImg = ''; im.hidden = true; rm.hidden = true; imgin.value = ''; });
    }
    /* special prices: fill from the last bills of this party */
    var fp = $('[data-pmfillprices]', form);
    if (fp && window.NSReuse) fp.addEventListener('click', function () {
      var ta = form.elements.pricestext, nm = form.elements.name && form.elements.name.value.trim() || rec.name;
      if (!nm) { NS.toast(T('cap.prices_name'), 'bad'); return; }
      var side = form.elements.role && form.elements.role.value === 'supplier' ? 'buy' : 'sale';
      NSStore.list('doc').then(function (docs) {
        var have = NSReuse.parsePrices(ta.value), seen = {}; have.forEach(function (x) { seen[NSReuse.key(x.item)] = 1; });
        var add = NSReuse.lastRates(docs, '', nm, side).filter(function (x) { return !seen[NSReuse.key(x.item)]; });
        if (!add.length && !have.length) { NS.toast(T('cap.prices_none'), 'bad'); return; }
        ta.value = NSReuse.pricesText(have.concat(add.map(function (x) { return { item: x.item, rate: x.rate }; }))); NS.toast(T('cap.prices_filled', { n: add.length }));
      }).catch(function () { NS.toast(T('cap.prices_none'), 'bad'); });
    });
    if (kind === 'item') lastRates(form, kind, rec);
    /* links to other screens inside the App close the form first */
    root.addEventListener('click', function (e) { var a = e.target.closest('[data-pmlink]'); if (!a) return; var d = form.closest('dialog'); if (d && d.close) d.close(); });
    /* Enter moves to the next box, on every tab; on the last one it saves */
    form.addEventListener('keydown', function (e) {
      var t = e.target; if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || !t || !/^(INPUT|SELECT)$/.test(t.tagName) || /^(checkbox|radio|submit|button|file)$/.test(t.type) || t.closest('.pk-box')) return;
      if (t.hasAttribute('list') && t.getAttribute('aria-expanded') === 'true') return;
      var all = $$('input,select,textarea', form).filter(function (x) { return !x.disabled && x.type !== 'hidden' && x.type !== 'file' && !x.closest('[hidden]') || (x.closest('[data-pmp][hidden]') && !x.closest('[data-gnew]') && !x.disabled && x.type !== 'hidden' && x.type !== 'file'); });
      var i = all.indexOf(t); if (i < 0) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (i < all.length - 1) { var n = all[i + 1], p = n.closest('[data-pmp]'); if (p) showTab(root, p.getAttribute('data-pmp')); n.focus(); if (n.select && /^(text|search|tel|email|number|)$/.test(n.type)) { try { n.select(); } catch (x) {} } }
      else if (form.requestSubmit) form.requestSubmit();
    }, true);
  }

  /* ---------- reading the boxes ---------- */
  function read(form, kind, rec, o) {
    o = o || form._pmO || {}; rec = rec || form._pmRec || {};
    var skip = {}; (o.skip || []).forEach(function (k) { skip[k] = 1; }); var els = form.elements, bad = null;
    var v = function (k) { var e = els[k]; return e ? String(e.value || '').trim() : ''; };
    allFields(kind).forEach(function (f) {
      var k = f.key; if (skip[k] || bad) return;
      var e = els[k]; if (!e && f.type !== 'prices' && f.type !== 'alts') return;
      switch (f.type) {
        case 'ships': case 'ob': case 'bom': case 'last': case 'open': case 'img': case 'prices': case 'alts': return;
        case 'check': if (e.checked) set(rec, k, true); else unset(rec, k); return;
        case 'num': { var s = v(k); if (s === '') unset(rec, k); else set(rec, k, num(s)); return; }
        case 'gst': { var g = v(k); if (g === '') unset(rec, k); else rec.gst = +g; return; }
        case 'group': return;
        case 'unit': { var u = v(k); rec.unit = u || 'Nos'; return; }
        case 'sel': {
          var sv = v(k);
          if (k === 'role' || k === 'kind' || k === 'ptype') { rec[k] = sv || rec[k] || (k === 'role' ? 'customer' : k === 'kind' ? 'goods' : 'retail'); if (k === 'ptype' && rec.ptype === 'retail' && !rec.id) delete rec.ptype; return; }
          if (k === 'nr') { if (sv) rec.nr = true; else delete rec.nr; return; }
          if (k === 'tax.kind') { if (sv && sv !== 'taxable') set(rec, k, sv); else unset(rec, k); return; }
          if (k === 'tax.itc') { if (sv && sv !== 'ok') set(rec, k, sv); else unset(rec, k); return; }
          if (sv) set(rec, k, sv); else unset(rec, k); return; }
        case 'usedby': if (e) { if (e.value) rec.biz = e.value; else delete rec.biz; } return;
        default: {
          var t = v(k); if (f.x.upper || f.type === 'gstin') t = t.toUpperCase().replace(/\s/g, '');
          if (k === 'hsn') t = t.replace(/\D/g, '');
          if (k === 'ldc.no' || k.indexOf('ldc.') === 0) return;   /* the certificate is read as one piece below */
          if (t === '') unset(rec, k); else set(rec, k, t);
        }
      }
    });
    if (bad) return bad;
    var nm = v(kind === 'item' ? 'desc' : 'name').replace(/\s+/g, ' ');
    if (!skip[kind === 'item' ? 'desc' : 'name']) {
      if (!nm) return fail(form, els[kind === 'item' ? 'desc' : 'name'], T('hub.v.name'));
      rec[kind === 'item' ? 'desc' : 'name'] = nm;
    }
    var gs = v('gstin');
    if (kind === 'party') {
      if (gs) { var ck = NS.gstinCheck(gs); if (!ck.ok) return fail(form, els.gstin, ck.msg || T('qa.badgst')); if (!rec.state && ck.state) rec.state = ck.state; }
      var pan = v('pan'); if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) return fail(form, els.pan, T('ms.panbad'));
      if (v('pin') && !/^\d{6}$/.test(v('pin'))) return fail(form, els.pin, W('badpin'));
      if (v('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) return fail(form, els.email, W('bademail'));
      if (v('bankIfsc') && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v('bankIfsc'))) return fail(form, els.bankIfsc, T('hub.v.ifsc'));
      if (v('udyam')) { var ud = /^UDYAM([A-Z]{2})(\d{2})(\d{7})$/.exec(v('udyam').toUpperCase().replace(/[^A-Z0-9]/g, '')); if (!ud) return fail(form, els.udyam, T('cp.udbad')); rec.udyam = 'UDYAM-' + ud[1] + '-' + ud[2] + '-' + ud[3]; }
      if (rec.agdays != null) rec.agdays = Math.max(0, Math.min(45, Math.floor(rec.agdays)));
      if (rec.disc != null && (rec.disc < 0 || rec.disc > 100)) return fail(form, els.disc, W('baddisc'));
      if (!rec.msme) delete rec.msme;
      /* GSTIN look-up result and the PAN-based deductee type */
      if (form._pmGst) rec.gst = Object.assign({}, rec.gst || {}, form._pmGst);
      if (!rec.deductee && rec.pan && window.NSGst && NSGst.deducteeOf) { var dd = NSGst.deducteeOf(rec.pan); if (dd) rec.deductee = dd; }
      var lno = v('ldc.no'); if (els['ldc.no']) { if (lno) rec.ldc = [{ no: lno, rate: num(v('ldc.rate')), limit: num(v('ldc.limit')), from: v('ldc.from'), to: v('ldc.to'), sec: rec.tdsSec || '' }]; else delete rec.ldc; }
      if (rec.int && rec.int.rate == null && rec.int.grace == null) delete rec.int;
      if (rec.int && rec.int.rate != null && rec.int.rate < 0) return fail(form, els['int.rate'], W('badint'));
      /* ship-to places: the first is the default one (rec.ship, as before), the others are rec.ships */
      var rows = $$('[data-pmship]', form).map(function (r) { var s = {}; $$('[data-sk]', r).forEach(function (i) { var x = i.value.trim(); if (x) s[i.getAttribute('data-sk')] = i.getAttribute('data-sk') === 'gstin' ? x.toUpperCase() : x; }); return s; }).filter(function (s) { return s.addr || s.name; });
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].gstin && !NS.gstinCheck(rows[i].gstin).ok) return fail(form, $$('[data-pmship]', form)[i].querySelector('[data-sk=gstin]'), NS.gstinCheck(rows[i].gstin).msg || T('qa.badgst'));
        if (rows[i].pin && !/^\d{6}$/.test(rows[i].pin)) return fail(form, $$('[data-pmship]', form)[i].querySelector('[data-sk=pin]'), W('badpin'));
      }
      if (rows.length) rec.ship = rows[0]; else if ($('[data-pmships]', form)) delete rec.ship;
      if (rows.length > 1) rec.ships = rows.slice(1); else if ($('[data-pmships]', form)) delete rec.ships;
      if (els.pricestext && window.NSReuse) { var pl = NSReuse.parsePrices(els.pricestext.value); if (pl.length) rec.prices = pl; else delete rec.prices; }
      var grp = els.group && !skip.group ? els.group.value : null;
      if (grp != null) { if (grp === '+' || !grp || grp === 'debtors' || grp === 'creditors') delete rec.group; else rec.group = grp; }
      if (rec.role === 'both' && els.role) rec.role = 'both';
    } else {
      var hs = v('hsn'); if (hs && !/^(\d{2}|\d{4}|\d{6}|\d{8})$/.test(hs)) return fail(form, els.hsn, T('ms.hsnbad'));
      if (rec.disc != null && (rec.disc < 0 || rec.disc > 100)) return fail(form, els.disc, W('baddisc'));
      if (els.altstext) {
        var al = parseAlts(els.altstext.value, rec.unit); if (al === null) return fail(form, els.altstext, T('ms.altsbad'));
        if (al.length) { rec.alts = al; rec.alt = al[0]; } else { delete rec.alts; delete rec.alt; }
      }
      ['min', 'rq', 'max', 'lead'].forEach(function (k) { if (rec[k] != null && !(rec[k] > 0)) delete rec[k]; });
      if (!rec.track) delete rec.track;
      if (form._pmImg !== undefined && $('[data-pmimgin]', form)) { if (form._pmImg) rec.img = form._pmImg; else delete rec.img; }
      if (els.group && !skip.group) {
        var gv = els.group.value;
        if (gv && gv !== '+') { rec.group = gv; rec.cat = (els.group.options[els.group.selectedIndex].text || '').replace(/^[\s ]+/, ''); } else if (gv !== '+') { if (rec.group || !rec.cat) rec.cat = ''; delete rec.group; }   /* an old item that only has a category name keeps it */
      }
      if (rec.tax && !Object.keys(rec.tax).length) delete rec.tax;
    }
    /* the opening entry typed on the form, for NSPM.opening */
    form._pmX = { obAmt: els.obamt ? num(els.obamt.value) : null, obSide: els.obside ? els.obside.value : 'recv', hasOb: !!els.obamt,
      openQty: els.openqty ? num(els.openqty.value) : 0, openRate: els.openrate ? num(els.openrate.value) : 0, openGd: els.opengd ? els.opengd.value : '' };
    if (window.NSCF && NSCF.formRead && $('[data-cfbox]', form)) NSCF.formRead(kind, form, rec);
    say($('.pm', form), '');
    return '';
  }
  function parseAlts(txt, base) {
    var out = [], bad = false, uk = function (s) { return String(s || '').trim().toLowerCase(); };
    String(txt || '').split(/[,;]+/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (part) {
      var m = /^(.+?)\s*(?:=|:|\s)\s*([0-9]*\.?[0-9]+)\s*(?:[A-Za-z. ]*)$/.exec(part);
      if (!m || !(parseFloat(m[2]) > 0) || uk(m[1]) === uk(base)) { bad = true; return; }
      out.push({ unit: m[1].trim(), per: parseFloat(m[2]) });
    });
    return bad ? null : out;
  }

  /* ---------- opening balance / opening stock ---------- */
  function findOb(docs, name, bizName) {
    var k = key(name), b = key(bizName); return (docs || []).filter(function (d) { return d.type === 'ob' && !d.bacct && d.side !== 'bank' && key(d.buyer && d.buyer.name) === k && (!b || key(d.seller && d.seller.name) === b); })[0] || null;
  }
  function opening(form, kind, rec, o) {
    o = o || form._pmO || {}; var x = form._pmX || {}, sp = Promise.resolve(typeof o.seller === 'function' ? o.seller() : o.seller);
    if (kind === 'party') {
      if (!x.hasOb) return Promise.resolve();
      var amt = Math.round((x.obAmt || 0) * 100) / 100, old = o.ob || null;
      if (amt > 0) return sp.then(function (b) {
        if (!b && !old) return null;
        var d = Object.assign(old ? JSON.parse(JSON.stringify(old)) : { type: 'ob', app: 1, no: '', date: fyStart(), seller: b }, { buyer: { name: rec.name }, side: x.obSide === 'pay' ? 'pay' : 'recv', amount: amt, total: amt });
        return NSStore.put('doc', d);
      });
      if (old && old.id) return NSStore.del('doc', old.id);
      return Promise.resolve();
    }
    if (x.openQty > 0 && rec.kind !== 'service') return sp.then(function (b) {
      if (!b) return null;
      var d = { type: 'stk', kind: 'open', date: fyStart(), no: '', seller: b, lines: [{ desc: rec.desc, unit: rec.unit, qty: x.openQty, rate: x.openRate || rec.prate || '' }] };
      if (x.openGd) d.gd = x.openGd;
      return NSStore.put('doc', d);
    });
    return Promise.resolve();
  }

  /* ---------- the small box of NS.quickAdd ---------- */
  function load() {
    return Promise.all([NSStore.meta('groups').catch(function () { return {}; }), NSStore.list('biz').catch(function () { return []; }), NSStore.meta('settings').catch(function () { return {}; })]).then(function (r) {
      var S = r[2] || {}, gd = (S.godowns || []).slice(); try { var b = S.byBiz || {}; Object.keys(b).forEach(function (id) { (b[id].godowns || []).forEach(function (g) { if (gd.indexOf(g) < 0) gd.push(g); }); }); } catch (e) {}
      return { meta: r[0] || {}, biz: r[1] || [], godowns: gd, multiLed: !!(S.multiLed) };
    });
  }
  function quick(inp, q, side) {
    var item = q.kind === 'item', name = (inp.value || '').trim(), d = document.getElementById('qa-dlg');
    if (!d) { d = NS.el('dialog', { id: 'qa-dlg', 'class': 'qa-dlg' }); document.body.appendChild(d); }
    d.classList.add('pm-dlg');
    return load().then(function (L) {
      var rec = item ? { kind: 'goods', unit: 'Nos', gst: 18 } : { role: side || 'customer' };
      if (name) rec[item ? 'desc' : 'name'] = name;
      var P = q.pre && !item ? q.pre : null;
      if (P) ['gstin', 'phone', 'addr', 'city', 'state', 'pan', 'pin', 'email', 'km', 'agent'].forEach(function (k) { if (P[k] != null && String(P[k]).trim() !== '') rec[k] = String(P[k]).trim(); });
      if (P && P.role) rec.role = P.role;
      var groups = NS.groupsOf(L.meta, item ? 'item' : 'party');
      var o = { ctx: 'quick', meta: L.meta, groups: groups, biz: L.biz, godowns: L.godowns, multiLed: L.multiLed, side: side,
        seller: function () { return window.NSApp && NSApp.biz && NSApp.biz() ? NSApp.biz() : NS.defaultBiz(); } };
      d.innerHTML = '<div class="dlg-hd"><h2>' + esc(T(item ? 'qa.titem' : 'qa.tparty')) + '</h2></div><form class="qa-form" novalidate>' + html(item ? 'item' : 'party', rec, o) +
        '<div class="qa-acts"><button type="submit" class="btn primary">' + esc(T('qa.save')) + '</button><button type="button" class="btn" data-qa-x>' + esc(T('qa.cancel')) + '</button></div></form>';
      var form = d.querySelector('form');
      if (!item) { var gs = form.elements.group; gs.value = (rec.role === 'supplier') ? 'creditors' : 'debtors'; if (form.elements.obside) form.elements.obside.value = rec.role === 'supplier' ? 'pay' : 'recv'; }
      wire(form, item ? 'item' : 'party', rec, o);
      if (P && P.gstin && form.elements.gstin) gstHint(form);
      d.querySelector('[data-qa-x]').addEventListener('click', function () { d.removeAttribute('data-dirty'); d.close(); inp.focus(); });
      d.addEventListener('close', function () { setTimeout(function () { if (document.contains(inp)) inp.focus(); }, 0); }, { once: true });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var nm = (form.elements[item ? 'desc' : 'name'].value || '').trim().replace(/\s+/g, ' ');
        if (!nm) { fail(form, form.elements[item ? 'desc' : 'name'], T('qa.needname')); return; }
        if (q.known(nm) && nm.toLowerCase() !== name.toLowerCase()) { fail(form, form.elements[item ? 'desc' : 'name'], T('qa.exists')); return; }
        var r = JSON.parse(JSON.stringify(rec)), er = read(form, item ? 'item' : 'party', r, o); if (er) return;
        if (!item && !r.role) r.role = side || 'customer';
        opening(form, item ? 'item' : 'party', r, o).then(function () { return NSStore.put(item ? 'item' : 'party', r); }).then(function (saved) {
          var s2 = saved && saved.id ? saved : r;
          d.removeAttribute('data-dirty'); d.close(); if (inp._qaChip) inp._qaChip.hidden = true;
          NS.toast(T(item ? 'qa.itemok' : 'qa.partyok', { n: nm })); q.done(s2);
        }, function (er2) { say($('.pm', form), (er2 && er2.message) || T('qa.fail')); });
      });
      if (!d._qaKeys) { d._qaKeys = 1; d.addEventListener('keydown', function (e) {
        var k = (e.key || '').toLowerCase(), f = d.querySelector('form'); if (!f) return;
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 's' || k === 'enter')) { e.preventDefault(); e.stopImmediatePropagation(); if (f.requestSubmit) f.requestSubmit(); }
      }); }
      d.showModal();
      setTimeout(function () { var x = form.elements[item ? 'hsn' : 'gstin']; ((name && x) ? x : form.elements[item ? 'desc' : 'name']).focus(); if (name && x) showTab($('.pm', form), item ? 'tax' : 'gst'); }, 30);
    });
  }

  window.NSPM = { html: html, wire: wire, read: read, opening: opening, quick: quick, findOb: findOb, fields: allFields, sections: secs, parseAlts: parseAlts, groupOpts: groupOpts, show: showTab, load: load, fail: fail };
})();
