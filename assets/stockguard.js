/* NSBiz ERP round 1 (inventory): stock checks while a goods document is saved, and the pick lists on its lines.
   Loaded after stockcore.js wherever goods documents are made (the document makers, the shop kits, the App).
     NS.stockGuard(doc, id)  Promise, called by docs.js / kit.js / the App sale form just before saving; rejects with
                             Error('cancel') when the save must stop. Checks, in this order:
       units      a goods item on a line in a unit that is not one of its units (I-3): refused
       serials    a serial / IMEI typed twice in the document or already sold (I-10): refused; never received: asked
       expiry     a batch past its expiry on an outgoing line (I-10): Settings › Stock "expired batches" warn (asked) or block
                  (refused); the pharmacy refuses unless the business set warn
       negative   a line needing more than is in hand on the document's date in its godown (and batch) (I-8): Settings › Stock
                  "negative stock" allow (nothing), warn (asked), block (refused)
     NS.stockCfg(seller)     this business's stock settings { neg: 'allow'|'warn'|'block', expired: 'warn'|'block' } (meta settings.stock,
                             per business through NS.cfgFor)
     NS.batchPick(desc, doc) batches in hand of an item on the document's date and godown, earliest expiry first (NSStock.batchPick)
     NS.serialsIn(desc, doc) serial numbers of an item in hand
   Unit boxes: when a line's unit box gets the focus it lists only that item's units (base, other units, units the unit
   master converts). The data home is read once and again on 'ns-data' and focus; nothing here ever saves.
   Screen words: NS.t('sg.*'). */
(function () {
  'use strict';
  if (!window.NS || !window.NSStore || !window.NSStock) return;
  var K = NSStock, key = K.key, num = K.num;
  var DOCS = [], ITEMS = [], SET = {}, BIZ = [], loaded = null, at = 0;
  function X() { return window.NSMfg || null; }
  function load(force) {
    if (loaded && !force && Date.now() - at < 4000) return loaded;
    at = Date.now();
    loaded = (NSStore.ready ? NSStore.ready() : Promise.resolve()).then(function () {
      return Promise.all([NSStore.list('doc'), NSStore.list('item'), NSStore.meta('settings').catch(function () {}), NSStore.meta('units').catch(function () {}), NSStore.list('biz').catch(function () { return []; })]);
    }).then(function (r) {
      DOCS = r[0] || []; ITEMS = r[1] || []; SET = r[2] || {}; BIZ = r[4] || [];
      if (X() && X().setUnits) X().setUnits(r[3] || []);
    }).catch(function () {});
    return loaded;
  }
  function t(k, v) { return NS.t('sg.' + k, v); }
  function qtyS(n) { return NS.qty ? NS.qty(n) : String(n); }
  function host() { var c = window.NS_CFG || {}; return String(c.inApp || c.host || location.hostname || ''); }
  NS.stockCfg = function (seller) {
    var c = NS.cfgFor ? NS.cfgFor(SET, seller || {}, BIZ) : SET;
    var s = Object.assign({}, c && c.stock || {});
    if (!s.neg) s.neg = 'warn';
    if (!s.expired) s.expired = /pharmacy/.test(host()) ? 'block' : 'warn';
    return s;
  };
  function bizName(doc) { return String(doc && doc.seller && doc.seller.name || '').trim(); }
  function rest(doc, id) { return DOCS.filter(function (d) { return !(id && d.id === id) && d !== doc; }); }
  NS.batchPick = function (desc, doc, id) {
    if (!desc || !doc) return [];
    try { return K.batchPick(rest(doc, id), ITEMS, bizName(doc), key(desc), doc.date || (NS.today && NS.today()) || '', doc.gd || ''); } catch (e) { return []; }
  };
  NS.serialsIn = function (desc, doc, id) {
    if (!desc || !doc) return [];
    try { return K.serials(rest(doc, id), ITEMS, bizName(doc), key(desc)).inHand.map(function (x) { return x.sn; }); } catch (e) { return []; }
  };
  NS.unitsOf = function (desc) { var m = ITEMS.filter(function (x) { return key(x.desc) === key(desc); })[0]; return m && X() && X().unitsOf ? X().unitsOf(m) : []; };
  /* lines of the document that send goods out (its own moves, units already in base units) */
  function outLines(doc) { try { return K.moves([Object.assign({}, doc, { id: '_g' })], ITEMS, bizName(doc)).filter(function (x) { return x.qty < 0; }); } catch (e) { return []; } }
  function ask(m) { return NS.ask ? NS.ask(m) : Promise.resolve(window.confirm(m)); }

  NS.stockGuard = function (doc, id) {
    if (!doc || !bizName(doc)) return Promise.resolve();
    return load(true).then(function () {
      var stop = [], q = [], c = NS.stockCfg(doc.seller), biz = bizName(doc), outs;
      try {
        K.badUnits(doc, ITEMS).forEach(function (b) { stop.push(t('unit', { n: b.name, u: b.unit, b: b.base })); });
        outs = outLines(doc);
        if (outs.length) {
          var sc = K.serialCheck(DOCS, ITEMS, biz, doc, id);
          if (sc.dup.length) stop.push(t('sndup', { s: sc.dup.map(function (x) { return x.sn; }).join(', ') }));
          if (sc.gone.length) stop.push(t('sngone', { s: sc.gone.map(function (x) { return x.sn; }).join(', ') }));
          if (sc.unknown.length) q.push(t('snnew', { s: sc.unknown.map(function (x) { return x.sn; }).join(', ') }));
          var day = doc.date || '', exp = outs.filter(function (x) { var e = K.expEnd(x.exp); return x.batch && e && day && e < day; });
          if (exp.length) { var m = t('expired', { s: exp.map(function (x) { return x.name + ' (' + x.batch + ')'; }).join(', ') }); if (c.expired === 'block') stop.push(m + ' ' + t('expblock')); else q.push(m); }
          if (c.neg === 'warn' || c.neg === 'block') {
            var sf = K.shortfall(DOCS, ITEMS, biz, doc, id);
            if (sf.length) {
              var txt = sf.map(function (s) { return t('shortl', { n: s.name + (s.batch ? ' (' + s.batch + ')' : ''), w: qtyS(s.want), h: qtyS(s.have), u: s.unit || '' }).replace(/\s{2,}/g, ' '); }).join('; ');
              if (c.neg === 'block') stop.push(t('negblock', { s: txt })); else q.push(t('negwarn', { s: txt }));
            }
          }
        }
      } catch (e) { console.error(e); return; }   /* a check that cannot run never stops a save */
      if (stop.length) { NS.toast(stop.join(' '), 'bad'); throw new Error('cancel'); }
      return q.reduce(function (p, m) { return p.then(function () { return ask(m).then(function (ok) { if (!ok) throw new Error('cancel'); }); }); }, Promise.resolve());
    });
  };

  /* the unit box of a line lists that item's own units when it gets the focus (docs.js .it rows, App and kit rows with data-k) */
  document.addEventListener('focusin', function (e) {
    var u = e.target; if (!u || !u.matches || !u.matches('input[data-k="unit"], input[data-lk="unit"]')) return;
    var li = u.getAttribute('data-li'), form = u.form || document;
    var row = u.closest('.it, [data-line], tr, .row, .ln'), d = li != null ? form.querySelector('[data-li="' + li + '"][data-lk="desc"]') : row && row.querySelector('[data-k="desc"]'); if (!d) return;   /* App lines: data-li / data-lk */
    var list = NS.unitsOf(d.value); if (list.length < 2) return;
    var id = 'sg-u-' + (u.id || Math.random().toString(36).slice(2)), dl = document.getElementById(id);
    if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
    dl.innerHTML = list.map(function (x) { return '<option value="' + NS.esc(x) + '">'; }).join('');
    if (!u.getAttribute('data-sg-list')) u.setAttribute('data-sg-list', u.getAttribute('list') || '');
    u.setAttribute('list', id);
  }, true);

  load();
  document.addEventListener('ns-data', function () { load(true); });
  window.addEventListener('focus', function () { load(); });
})();
