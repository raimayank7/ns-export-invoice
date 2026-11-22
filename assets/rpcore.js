/* NSBiz receipt printer (thermal, ESC/POS), loaded only when someone prints to it or opens its settings (build.py LAZY).
   Libraries kept inside NSBiz (Niels Leenheer, MIT): ReceiptPrinterEncoder 4.0.1 (bytes), WebUSBReceiptPrinter 2.1.0 and
   WebSerialReceiptPrinter 2.0.0 (the connection), copies in /assets/vendor/.
   - USB works where no Windows driver has taken the printer (Android, Mac, Linux, ChromeOS). A printer with its Windows driver
     installed (and Bluetooth printers) is reached through its COM port: "Serial / COM port".
   - Settings per device (localStorage 'ns-rp'): kind usb|serial, dev (to reconnect), cols 48 (80 mm) | 32 (58 mm), cut, drawer,
     qr native|image|off, direct (the normal Print button of a thermal bill goes to this printer, no print box).
   - Pure part (node tests, scripts/test_rprint.js): plan -> bytes. A plan is a list of steps:
       {t:'text', s, align, bold, big}  {t:'pair', l, r, bold, big}  {t:'cols', c:[..], n:[right-aligned flags], bold}
       {t:'rule'}  {t:'qr', data}  {t:'feed', n}
   - Browser part: fromSheet(el) turns a thermal sheet on screen (.sh.th of docs.js / kit.js) into a plan, so every tool that
     shows a thermal bill (POS, restaurant bill and KOT, pharmacy, fee receipt, hotel, garage, job card…) prints the same lines. */
(function (root) {
  'use strict';
  var RP = {};
  RP.LIB = ['/assets/vendor/receipt-printer-encoder-4.0.1.js', '/assets/vendor/webusb-receipt-printer-2.1.0.js', '/assets/vendor/webserial-receipt-printer-2.0.0.js'];
  var DEF = { kind: '', dev: null, cols: 48, cut: true, drawer: false, qr: 'native', direct: true };
  function T(k, en, v) { var s = root.NS && root.NS.t ? root.NS.t(k, v) : k; return s === k ? en : s; }

  /* ---------- settings (this device, this site) ---------- */
  RP.opts = function () { var o = {}; try { o = JSON.parse(root.localStorage.getItem('ns-rp') || 'null') || {}; } catch (e) {} return Object.assign({}, DEF, o); };
  RP.keep = function (o) { try { root.localStorage.setItem('ns-rp', JSON.stringify(Object.assign(RP.opts(), o))); } catch (e) {} };
  RP.has = function () { return !!RP.opts().dev; };

  /* ---------- plan -> bytes ---------- */
  function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) : s; }
  function ascii(s) {   /* the printer's own font has no Indian scripts: ₹ becomes Rs., other letters it cannot print are dropped */
    return String(s == null ? '' : s).replace(/₹\s?/g, 'Rs.').replace(/[−–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/×/g, 'x').replace(/•/g, '*').replace(/ /g, ' ');
  }
  RP.ascii = ascii;
  /* QR as a picture (for printers whose own QR command is missing or wrong): black squares, white margin, width a multiple of 8 */
  RP.qrImage = function (data, cols, make) {
    var q = make ? make(data) : (function () { var x = root.qrcode(0, 'M'); x.addData(data); x.make(); return x; })();
    var n = q.getModuleCount(), want = cols >= 48 ? 240 : 184, sc = Math.max(2, Math.floor(want / (n + 8))), w = Math.ceil((n + 8) * sc / 8) * 8, off = Math.floor((w - n * sc) / 2);
    var px = new Uint8ClampedArray(w * w * 4).fill(255);
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) {
      for (var y = 0; y < sc; y++) for (var x = 0; x < sc; x++) { var i = ((off + r * sc + y) * w + off + c * sc + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
    }
    return { img: new root.ImageData(px, w, w), w: w };
  };
  RP.qr = function (e, data, o) {
    o = o || RP.opts(); var cols = o.cols || 48;
    if (o.qr === 'off' || !data) return e;
    if (o.qr === 'image') { var im = RP.qrImage(data, cols, o.makeQr); return e.image(im.img, im.w, im.w, 'threshold', 128); }
    return e.qrcode(data, { size: cols >= 48 ? 6 : 4 });
  };
  RP.finish = function (e, o) {   /* paper out past the cutter, cut, then the cash drawer */
    o = o || RP.opts();
    e.newline(4); if (o.cut !== false) e.cut();
    if (o.drawer) e.pulse(0, 100, 500);
    return e;
  };
  RP.render = function (e, plan, o) {
    o = o || RP.opts(); var n = o.cols || 48;
    plan.forEach(function (s) {
      if (s.t === 'rule') { e.rule(); return; }
      if (s.t === 'feed') { e.newline(s.n || 1); return; }
      if (s.t === 'qr') { e.align('center'); RP.qr(e, s.data, o); if (s.label) e.line(clip(ascii(s.label), n)); e.align('left'); return; }
      if (s.big) e.size(1, 2); if (s.bold) e.bold(true);
      if (s.t === 'text') e.align(s.align || 'left').line(ascii(s.s)).align('left');
      else if (s.t === 'pair') {
        var r = clip(ascii(s.r), Math.floor(n / 2)), rw = Math.max(r.length, 1);
        e.table([{ width: n - rw - 1, align: 'left' }, { width: rw + 1, align: 'right' }], [[ascii(s.l), r]]);   /* the encoder puts no space between columns: the right one is a letter wider */
      } else if (s.t === 'cols') {
        var c = s.c.map(ascii), k = c.length;
        if (k === 1) e.line(c[0]);
        else {
          var right = c.slice(1).map(function (x) { return Math.max(x.length, 5) + 1; }), used = right.reduce(function (a, b) { return a + b; }, 0);
          if (n - used < 8) { right = right.map(function () { return Math.floor((n - 8) / (k - 1)); }); used = right.reduce(function (a, b) { return a + b; }, 0); }
          var widths = [n - used].concat(right);
          e.table(widths.map(function (w, i) { return { width: w, align: i && (!s.n || s.n[i] !== false) ? 'right' : 'left' }; }), [c.map(function (x, i) { return clip(x, widths[i]); })]);
        }
      }
      if (s.bold) e.bold(false); if (s.big) e.size(1, 1);
    });
    return e;
  };
  RP.encode = function (plan, o, Enc) {
    o = Object.assign({}, RP.opts(), o || {}); Enc = Enc || root.ReceiptPrinterEncoder;
    var e = new Enc({ language: 'esc-pos', columns: o.cols || 48 }).initialize();
    RP.render(e, plan, o); RP.finish(e, o);
    return e.encode();
  };

  /* ---------- thermal sheet on screen -> plan ---------- */
  function txt(el) { return String((el.innerText != null ? el.innerText : el.textContent) || '').replace(/[ \t ]+/g, ' ').trim(); }
  function shown(el) { if (el.classList && el.classList.contains('ph')) return false; var cs = root.getComputedStyle ? root.getComputedStyle(el) : null; return !cs || (cs.display !== 'none' && cs.visibility !== 'hidden'); }
  function heavy(el) { var w = root.getComputedStyle ? root.getComputedStyle(el).fontWeight : '400'; return +w >= 600 || w === 'bold'; }
  RP.fromSheet = function (sheet) {
    var plan = [];
    function lines(el, align, bold, big) {
      if (el.querySelector('.ph')) { el = el.cloneNode(true); Array.prototype.forEach.call(el.querySelectorAll('.ph'), function (x) { x.remove(); }); }   /* grey prompts are never printed */
      (el.querySelector('br') ? txt(el).split(/\n+/) : [String(el.textContent || '').replace(/\s+/g, ' ')]).forEach(function (l) { l = l.trim(); if (l) plan.push({ t: 'text', s: l, align: align, bold: bold, big: big }); }); }
    function table(tb) {
      Array.prototype.forEach.call(tb.querySelectorAll('tr'), function (tr) {
        if (!shown(tr)) return;
        var cells = Array.prototype.filter.call(tr.children, shown), head = tr.parentNode && tr.parentNode.tagName === 'THEAD';
        var bold = head || tr.classList.contains('grand') || heavy(cells[cells.length - 1] || tr), big = tr.classList.contains('grand');
        if (tr.classList.contains('grand')) plan.push({ t: 'rule' });
        if (cells.length === 2 && !/\btl\b/.test(tb.className)) plan.push({ t: 'pair', l: txt(cells[0]), r: txt(cells[1]), bold: bold, big: big });
        else if (cells.length) plan.push({ t: 'cols', c: cells.map(txt), n: cells.map(function (c, i) { return i > 0; }), bold: bold, big: big });
        if (head) plan.push({ t: 'rule' });
      });
    }
    function walk(el) {
      Array.prototype.forEach.call(el.children, function (c) {
        if (!shown(c)) return;
        var tag = c.tagName, cl = c.classList;
        if (tag === 'IMG' || tag === 'svg' || tag === 'STYLE' || tag === 'SCRIPT' || tag === 'CANVAS') return;
        if (c.hasAttribute('data-qr') || cl.contains('qr')) {
          var q = c.hasAttribute('data-link') ? c : c.querySelector('[data-link]');
          if (q) plan.push({ t: 'qr', data: q.getAttribute('data-link'), label: cl.contains('qr') ? txt(c.querySelector('small') || c) : '' });
          return;
        }
        if (tag === 'HR') { plan.push({ t: 'rule' }); return; }
        if (cl.contains('ns-cl')) { plan.push({ t: 'text', s: 'NSBiz by Nivesh Sahayak', align: 'center' }); return; }   /* the credit line: one printed line */
        if (tag === 'TABLE') { table(c); return; }
        if (tag === 'H1' || tag === 'H2' || tag === 'H3') { lines(c, 'center', true, tag !== 'H3'); return; }
        if (cl.contains('dt')) { plan.push({ t: 'rule' }); lines(c, 'center', true); plan.push({ t: 'rule' }); return; }
        var blocks = Array.prototype.some.call(c.children, function (k) { return /^(DIV|P|TABLE|H[1-6]|UL|OL|SECTION|HR)$/.test(k.tagName); });
        if (blocks) { walk(c); return; }
        if (!txt(c)) return;
        var cs = root.getComputedStyle ? root.getComputedStyle(c) : { textAlign: 'center' };
        lines(c, /right|end/.test(cs.textAlign) ? 'right' : /center/.test(cs.textAlign) ? 'center' : 'left', heavy(c));
      });
    }
    walk(sheet);
    return plan;
  };

  /* ---------- connection ---------- */
  var CON = null;   /* { kind, p, ready } while this page is open */
  function win() { return !!(root.NS && root.NS.helperUp); }   /* the NSBiz Helper program answers (through the add-on): Windows printers */
  RP.ok = function () { return !!(root.navigator && ('usb' in root.navigator || 'serial' in root.navigator)) || win(); };
  function make(kind) {
    var P = kind === 'usb' ? new root.WebUSBReceiptPrinter() : new root.WebSerialReceiptPrinter({ baudRate: +RP.opts().baud || 9600 });
    var c = { kind: kind, p: P, name: '' };
    c.ready = new Promise(function (res) { P.addEventListener('connected', function (dev) { c.name = (dev && (dev.productName || dev.manufacturerName || dev.type)) || ''; RP.keep({ kind: kind, dev: dev, name: c.name }); res(dev); }); });
    P.addEventListener('disconnected', function () { if (CON === c) CON = null; });
    return c;
  }
  function wait(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('none')); }, ms); })]); }
  RP.connect = function (kind) {   /* call inside a click: the browser shows its own list of printers */
    CON = make(kind); CON.p.connect();
    var c = CON; return wait(c.ready, 60000).then(function () { return c; }, function (e) { if (CON === c) CON = null; throw e; });
  };
  function conn() {
    if (CON) return Promise.resolve(CON);
    var o = RP.opts(); if (!o.dev || !RP.ok()) return Promise.reject(new Error('none'));
    if (o.kind === 'win') {   /* the bytes go to the Windows printer by its name (RAW, no print box), through the helper */
      if (!win()) return Promise.reject(new Error('none'));
      return Promise.resolve({ kind: 'win', name: o.name, p: { print: function (b) { return root.NS.helper('printRaw', { printer: o.dev.win, b64: root.NS.u8b64(b), doc: 'NSBiz bill' }); } } });
    }
    var c = CON = make(o.kind); c.p.reconnect(o.dev);
    return wait(c.ready, 2500).then(function () { return c; }, function (e) { if (CON === c) CON = null; throw e; });
  }
  RP.forget = function () { if (CON && CON.p.disconnect) { try { CON.p.disconnect(); } catch (e) {} } CON = null; try { root.localStorage.removeItem('ns-rp'); } catch (e) {} };
  RP.send = function (bytes) { return conn().then(function (c) { return c.p.print(bytes); }); };
  /* build(encoder, opts) adds the lines (docs.js); finish() adds the cut and the drawer */
  RP.printWith = function (build) {
    var o = RP.opts();
    return conn().then(function (c) { var e = new root.ReceiptPrinterEncoder({ language: 'esc-pos', columns: o.cols }).initialize(); build(e, o); RP.finish(e, o); return c.p.print(e.encode()); });
  };
  /* every printed copy (.sh) of a sheet becomes its own plan, so each copy is cut apart */
  RP.fromSheets = function (el) {
    var shs = el.classList && el.classList.contains('sh') ? [el] : Array.prototype.slice.call(el.querySelectorAll('.sh'));
    return (shs.length ? shs : [el]).map(RP.fromSheet).filter(function (p) { return p.length; });
  };
  RP.join = function (parts) {
    var n = parts.reduce(function (a, b) { return a + b.length; }, 0), out = new Uint8Array(n), at = 0;
    parts.forEach(function (b) { out.set(b, at); at += b.length; });
    return out;
  };
  RP.printPlans = function (plans, Enc) { var o = RP.opts(); return RP.send(RP.join(plans.map(function (p) { return RP.encode(p, o, Enc); }))); };
  RP.printSheet = function (sheet) { return RP.printPlans(RP.fromSheets(sheet)); };
  RP.test = function () {
    var o = RP.opts();
    return RP.send(RP.encode([{ t: 'text', s: 'NSBiz', align: 'center', bold: true, big: true }, { t: 'text', s: 'Receipt printer test', align: 'center' }, { t: 'rule' },
      { t: 'pair', l: 'Paper', r: o.cols >= 48 ? '80 mm' : '58 mm' }, { t: 'pair', l: 'Letters a line', r: String(o.cols) }, { t: 'pair', l: 'Item x 2', r: 'Rs.120.00' }, { t: 'rule' },
      { t: 'pair', l: 'TOTAL', r: 'Rs.120.00', bold: true, big: true }, { t: 'qr', data: 'upi://pay?pa=test@upi&pn=NSBiz&am=1.00&cu=INR', label: 'QR test (do not pay)' }, { t: 'text', s: '1234567890'.repeat(5).slice(0, o.cols), align: 'left' }], o));
  };

  /* ---------- settings box: connect, paper, cut, drawer, QR, use for Print ---------- */
  RP.setup = function (opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var NS = root.NS, esc = NS.esc, o = RP.opts(), usb = 'usb' in root.navigator, ser = 'serial' in root.navigator;
      var d = document.createElement('dialog'); d.className = 'b2-dlg rp-dlg'; d.setAttribute('aria-labelledby', 'rp-h');
      function chk(k, label, hint) { return '<p><label class="chk"><input type="checkbox" data-o="' + k + '"' + (o[k] ? ' checked' : '') + '> ' + esc(label) + '</label>' + (hint ? '<br><small class="hint">' + esc(hint) + '</small>' : '') + '</p>'; }
      function radio(name, v, label, on) { return '<label class="chk"><input type="radio" name="' + name + '" value="' + v + '"' + (on ? ' checked' : '') + '> ' + esc(label) + '</label> '; }
      d.innerHTML = '<h3 id="rp-h">' + esc(T('tpr.title', 'Receipt printer')) + '</h3>' +
        (RP.ok() ? '' : '<p class="remind">' + esc(T('tpr.nosupport', 'This browser cannot talk to a receipt printer directly. Use Chrome or Edge on a computer or an Android phone, or the NSBiz Windows program. Bills print through the normal print box meanwhile.')) + '</p>') +
        '<p class="soft" data-st></p>' +
        '<fieldset><legend>' + esc(T('tpr.how', 'How it is connected')) + '</legend>' +
        radio('rpk', 'usb', T('tpr.usb', 'USB'), o.kind !== 'serial' && o.kind !== 'win' && usb) + radio('rpk', 'serial', T('tpr.serial', 'Serial / COM port / Bluetooth'), o.kind === 'serial' || (!usb && o.kind !== 'win')) +
        (win() ? '<br>' + radio('rpk', 'win', T('tpr.win', 'A printer installed in Windows (through the NSBiz Helper program)'), o.kind === 'win') +
          ' <select data-win aria-label="' + esc(T('tpr.winpick', 'Windows printer')) + '"><option value="">' + esc(T('tpr.winpick', 'Windows printer')) + '…</option></select>' : '') +
        '<br><small class="hint">' + esc(T('tpr.howh', 'On Windows, a printer whose own driver is installed is reached through its COM port: choose Serial / COM port.')) + '</small></fieldset>' +
        '<fieldset><legend>' + esc(T('tpr.paper', 'Paper width')) + '</legend>' + radio('rpc', 48, T('tpr.p80', '80 mm (48 letters a line)'), o.cols >= 48) + radio('rpc', 32, T('tpr.p58', '58 mm (32 letters a line)'), o.cols < 48) + '</fieldset>' +
        chk('cut', T('tpr.cut', 'Cut the paper after each bill')) +
        chk('drawer', T('tpr.drawer', 'Open the cash drawer after each bill'), T('tpr.drawerh', 'Only when a cash drawer is plugged into the printer.')) +
        '<p><label for="rp-qr">' + esc(T('tpr.qr', 'UPI QR code on the bill')) + '</label> <select id="rp-qr" data-o="qr">' +
        [['native', T('tpr.qrn', "Printer's own QR")], ['image', T('tpr.qri', 'As a picture (if the QR comes out wrong)')], ['off', T('tpr.qro', 'Do not print')]].map(function (x) { return '<option value="' + x[0] + '"' + (o.qr === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></p>' +
        chk('direct', T('tpr.direct', 'Print button sends thermal bills straight to this printer (no print box)')) +
        '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="btn primary" data-a="connect"' + (usb || ser || win() ? '' : ' disabled') + '>' + esc(T('tpr.connect', 'Connect printer')) + '</button>' +
        '<button type="button" class="btn" data-a="test">' + esc(T('tpr.test', 'Print a test slip')) + '</button>' +
        '<button type="button" class="btn" data-a="forget">' + esc(T('tpr.forget', 'Forget this printer')) + '</button>' +
        '<button type="button" class="btn" data-a="close">' + esc(T('tpr.close', 'Close')) + '</button></div>';
      document.body.appendChild(d); d.showModal ? d.showModal() : d.setAttribute('open', '');
      var st = d.querySelector('[data-st]'), ws = d.querySelector('[data-win]');
      if (ws) root.NS.helper('printers').then(function (r) {   /* the printers installed in Windows, the one in use first */
        (r.printers || []).forEach(function (p) { var op = document.createElement('option'); op.value = p.name; op.textContent = p.name + (p.dflt ? ' ✓' : ''); if (o.kind === 'win' && o.dev && o.dev.win === p.name) op.selected = true; ws.appendChild(op); });
      }, function () {});
      function status() {
        var x = RP.opts(), on = !!x.dev;
        st.textContent = on ? T('tpr.on', 'Connected: {x}', { x: (x.name || (x.kind === 'usb' ? 'USB' : 'COM')) }) : T('tpr.off', 'No receipt printer connected on this device.');
        d.querySelector('[data-a=test]').disabled = !on; d.querySelector('[data-a=forget]').disabled = !on;
      }
      function read() {
        var x = {}; Array.prototype.forEach.call(d.querySelectorAll('[data-o]'), function (i) { x[i.getAttribute('data-o')] = i.type === 'checkbox' ? i.checked : i.value; });
        x.cols = +((d.querySelector('input[name=rpc]:checked') || {}).value || 48); return x;
      }
      status();
      d.addEventListener('change', function () { RP.keep(read()); });
      function done(v) { d.close(); d.remove(); resolve(v); }
      d.addEventListener('cancel', function () { done(RP.has()); });
      d.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-a]'); if (!b) return; var a = b.getAttribute('data-a');
        if (a === 'close') { done(RP.has()); return; }
        if (a === 'forget') { RP.forget(); RP.keep(read()); status(); return; }
        if (a === 'test') { RP.test().then(function () { NS.toast(T('tpr.sent', 'Sent to the receipt printer')); }, function () { NS.toast(T('tpr.noans', 'The receipt printer did not answer. Check that it is on and connected.'), 'bad'); }); return; }
        if (a === 'connect') {
          RP.keep(read());
          var k = (d.querySelector('input[name=rpk]:checked') || {}).value || (usb ? 'usb' : 'serial');
          if (k === 'win') {
            var pn = ws && ws.value; if (!pn) { NS.toast(T('tpr.winpick', 'Windows printer') + '?', 'bad'); return; }
            CON = null; RP.keep({ kind: 'win', dev: { win: pn }, name: pn }); status(); NS.toast(T('tpr.ready', 'Receipt printer connected')); if (opt.thenClose) done(true); return;
          }
          RP.connect(k).then(function () { status(); NS.toast(T('tpr.ready', 'Receipt printer connected')); if (opt.thenClose) done(true); }, function () { status(); });
        }
      });
    });
  };

  root.NSRp = RP;
  if (typeof module !== 'undefined' && module.exports) module.exports = RP;
})(typeof window !== 'undefined' ? window : globalThis);
