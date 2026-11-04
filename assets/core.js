/* NS core: shared helpers for every Nivesh Sahayak document site. */
(function () {
  'use strict';
  var NS = window.NS = window.NS || {};

  /* ---------- small DOM helpers ---------- */
  NS.$ = function (s, r) { return (r || document).querySelector(s); };
  NS.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  NS.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  NS.el = function (tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  };

  /* ---------- India: states with GST codes ---------- */
  NS.STATES = [
    ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'],
    ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'],
    ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'],
    ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'],
    ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'],
    ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'],
    ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'], ['97', 'Other Territory'], ['96', 'Outside India (export)']
  ];
  NS.stateName = function (code) { var s = NS.STATES.filter(function (x) { return x[0] === code; })[0]; return s ? s[1] : ''; };

  /* GSTIN: 15 characters, last one is a check character (mod 36) */
  NS.gstinCheck = function (g) {
    g = String(g || '').toUpperCase().replace(/\s/g, '');
    if (!g) return { ok: true, empty: true };
    if (!/^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$/.test(g) && !/^[0-9]{2}[A-Z0-9]{13}$/.test(g)) return { ok: false, msg: NS.t('gst.len') };
    var C = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', sum = 0;
    for (var i = 0; i < 14; i++) {
      var v = C.indexOf(g[i]) * (i % 2 ? 2 : 1);
      sum += Math.floor(v / 36) + (v % 36);
    }
    var chk = C[(36 - (sum % 36)) % 36];
    if (chk !== g[14]) return { ok: false, msg: NS.t('gst.chk') };
    var st = g.slice(0, 2);
    return { ok: true, state: NS.stateName(st) ? st : '', pan: g.slice(2, 12) };
  };

  /* ---------- numbers and money ---------- */
  NS.num = function (v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  NS.r2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
  NS.money = function (n, sym) { return (sym === false ? '' : '₹') + NS.r2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  NS.qty = function (n) { return NS.r2(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }); };

  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function two(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
  function three(n) { return (n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : ''); }
  function indian(n) {
    if (n === 0) return 'Zero';
    var parts = [], crore = Math.floor(n / 1e7); n %= 1e7;
    if (crore) parts.push((crore > 999 ? indian(crore) : three(crore)) + ' Crore');
    var lakh = Math.floor(n / 1e5); n %= 1e5; if (lakh) parts.push(two(lakh) + ' Lakh');
    var th = Math.floor(n / 1000); n %= 1000; if (th) parts.push(two(th) + ' Thousand');
    if (n) parts.push(three(n));
    return parts.join(' ');
  }
  NS.inWords = function (amount) {
    amount = NS.r2(Math.abs(amount));
    var rs = Math.floor(amount), p = Math.round((amount - rs) * 100);
    return 'Rupees ' + indian(rs) + (p ? ' and ' + two(p) + ' Paise' : '') + ' Only';
  };

  NS.today = function () { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  NS.fmtDate = function (iso) {
    if (!iso) return '';
    var p = iso.split('-'); if (p.length !== 3) return iso;
    return p[2] + '-' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] + '-' + p[0];
  };
  /* Indian financial year of a date, e.g. "2026-27" */
  NS.fy = function (iso) {
    var d = iso ? new Date(iso + 'T00:00:00') : new Date(), y = d.getFullYear();
    var start = d.getMonth() >= 3 ? y : y - 1;
    return start + '-' + String(start + 1).slice(2);
  };

  /* ---------- toast ---------- */
  NS.toast = function (msg, kind) {
    var t = NS.$('#ns-toast');
    if (!t) { t = NS.el('div', { id: 'ns-toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(t._h); t._h = setTimeout(function () { t.className = ''; }, 3200);
  };

  /* ---------- theme: system / light / dark ---------- */
  function applyTheme(v) {
    var root = document.documentElement;
    if (v === 'light' || v === 'dark') root.setAttribute('data-theme', v); else root.removeAttribute('data-theme');
    NS.$$('[data-theme-btn]').forEach(function (b) {
      b.setAttribute('aria-label', NS.t ? NS.t('theme') : 'Colour theme');
      b.title = NS.t ? NS.t('theme') : 'Colour theme';
    });
  }
  NS.initTheme = function () {
    var v; try { v = localStorage.getItem('ns-theme'); } catch (e) {}
    applyTheme(v);
    NS.$$('[data-theme-btn]').forEach(function (b) {
      b.addEventListener('click', function () {
        var cur; try { cur = localStorage.getItem('ns-theme'); } catch (e) {}
        var dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        var next = dark ? 'light' : 'dark';
        try { localStorage.setItem('ns-theme', next); } catch (e) {}
        applyTheme(next);
      });
    });
  };

  /* ---------- suggestions from saved masters (never fills by itself) ---------- */
  var dlSeq = 0;
  NS.suggest = function (input, getList, label, onPick) {
    var dl = NS.el('datalist', { id: 'ns-dl-' + (++dlSeq) });
    input.setAttribute('list', dl.id);
    input.setAttribute('autocomplete', 'off');
    input.parentNode.appendChild(dl);
    var cache = [];
    function refresh() {
      return Promise.resolve(getList()).then(function (list) {
        cache = list || [];
        dl.innerHTML = cache.map(function (x) { return '<option value="' + NS.esc(label(x)) + '"></option>'; }).join('');
      });
    }
    input.addEventListener('focus', refresh);
    input.addEventListener('input', function () {
      var v = input.value.trim().toLowerCase();
      if (!v) return;
      var hit = cache.filter(function (x) { return label(x).toLowerCase() === v; })[0];
      if (hit && input._picked !== hit.id) { input._picked = hit.id; onPick(hit); }
    });
    refresh();
    return { refresh: refresh };
  };

  /* ---------- backup, restore, reminder, auto-save folder ---------- */
  var BACKUP_NAME = 'nivesh-sahayak-backup';
  NS.backupData = function () {
    return NSStore.exportAll().then(function (data) {
      return { app: 'Nivesh Sahayak', kind: 'backup', version: 1, saved: new Date().toISOString(), data: data };
    });
  };
  NS.downloadBackup = function () {
    return NS.backupData().then(function (b) {
      var blob = new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' });
      var a = NS.el('a', { href: URL.createObjectURL(blob), download: BACKUP_NAME + '-' + NS.today() + '.json' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return NSStore.meta('lastBackup', Date.now());
    }).then(function () { NS.toast(NS.t('bk.saved')); hideReminder(); });
  };
  NS.restoreFromFile = function (file) {
    return file.text().then(function (txt) {
      var b = JSON.parse(txt);
      if (!b || b.app !== 'Nivesh Sahayak' || !b.data) throw new Error(NS.t('bk.notours'));
      return NSStore.importAll(b.data, false);
    }).then(function (n) { NS.toast(n ? NS.t('bk.restored', { n: n }) : NS.t('bk.nothing')); return n; },
      function (e) { NS.toast(e instanceof SyntaxError ? NS.t('bk.unread') : (e.message || NS.t('bk.unread')), 'bad'); throw e; });
  };
  function hideReminder() { var r = NS.$('#ns-remind'); if (r) r.hidden = true; }
  NS.checkReminder = function () {
    return Promise.all([NSStore.meta('lastBackup'), NSStore.list('doc'), NSStore.meta('settings')]).then(function (r) {
      var last = r[0] || 0, docs = r[1].length, every = r[2] && r[2].remindDays != null ? +r[2].remindDays : 7;
      if (!docs || !every) return;
      /* no backup yet: wait until there is something worth losing (3 documents, or work older than a day) */
      var oldest = Math.min.apply(null, r[1].map(function (d) { return d.created || Date.now(); }));
      if (!last && docs < 3 && Date.now() - oldest < 864e5) return;
      var days = (Date.now() - last) / 864e5;
      if (days < every) return;
      var bar = NS.$('#ns-remind');
      if (!bar) return;
      NS.$('[data-remind-text]', bar).textContent = last ? NS.t('rm.ago', { n: Math.floor(days) }) : NS.t('rm.none', { n: docs });
      bar.hidden = false;
    }).catch(function () {});
  };

  /* desktop Chrome/Edge: write the backup file into a folder the user picked once */
  var FOLDER_DB = 'ns-folder';
  function folderDb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(FOLDER_DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('h'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function folderGet() {
    return folderDb().then(function (d) { return new Promise(function (res) { var q = d.transaction('h').objectStore('h').get('dir'); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; }); });
  }
  function folderSet(h) {
    return folderDb().then(function (d) { return new Promise(function (res) { var t = d.transaction('h', 'readwrite'); h ? t.objectStore('h').put(h, 'dir') : t.objectStore('h').delete('dir'); t.oncomplete = res; }); });
  }
  NS.folderSupported = function () { return 'showDirectoryPicker' in window; };
  NS.folderPick = function () {
    return window.showDirectoryPicker({ id: 'ns-backup', mode: 'readwrite', startIn: 'documents' }).then(function (h) {
      return folderSet(h).then(function () { return NS.folderWrite(true); }).then(function () { NS.toast(NS.t('af.on', { name: h.name })); return h.name; });
    });
  };
  NS.folderOff = function () { return folderSet(null).then(function () { NS.toast(NS.t('af.off')); }); };
  NS.folderStatus = function () {
    if (!NS.folderSupported()) return Promise.resolve({ supported: false });
    return folderGet().then(function (h) {
      if (!h) return { supported: true, on: false };
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) { return { supported: true, on: true, name: h.name, allowed: p === 'granted' }; });
    });
  };
  /* ask = true only inside a click, because the browser asks for permission again after a restart */
  NS.folderWrite = function (ask) {
    if (!NS.folderSupported()) return Promise.resolve(false);
    return folderGet().then(function (h) {
      if (!h) return false;
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p === 'granted') return true;
        return ask ? h.requestPermission({ mode: 'readwrite' }).then(function (q) { return q === 'granted'; }) : false;
      }).then(function (ok) {
        if (!ok) return false;
        return NS.backupData().then(function (b) {
          return h.getFileHandle(BACKUP_NAME + '.json', { create: true }).then(function (fh) { return fh.createWritable(); })
            .then(function (w) { return w.write(JSON.stringify(b, null, 1)).then(function () { return w.close(); }); })
            .then(function () { return NSStore.meta('lastBackup', Date.now()); }).then(function () { hideReminder(); return true; });
        });
      });
    }).catch(function () { return false; });
  };

  /* ---------- "My data" dialog (same on every site) ---------- */
  NS.openMyData = function () {
    var dlg = NS.$('#ns-mydata');
    if (!dlg) return;
    var body = NS.$('[data-mydata-body]', dlg);
    body.innerHTML = '<p class="soft">' + NS.esc(NS.t('md.loading')) + '</p>';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    Promise.all(['biz', 'party', 'item', 'doc'].map(function (s) { return NSStore.list(s); })).then(function (r) {
      return Promise.all([NS.folderStatus(), NSStore.meta('lastBackup')]).then(function (x) { return [r, x[0], x[1]]; });
    }).then(function (all) {
      var r = all[0], f = all[1], last = all[2];
      var shared = NSStore.mode() === 'vault';
      var T = NS.t, E = NS.esc;
      body.innerHTML =
        '<ul class="counts"><li><b>' + r[0].length + '</b> ' + E(T('md.biz')) + '</li><li><b>' + r[1].length + '</b> ' + E(T('md.party')) + '</li><li><b>' + r[2].length + '</b> ' + E(T('md.item')) + '</li><li><b>' + r[3].length + '</b> ' + E(T('md.doc')) + '</li></ul>' +
        '<p class="note">' + E(T(shared ? 'md.shared' : 'md.local')) + '</p>' +
        '<p class="note">' + E(T('md.last')) + ' <b>' + (last ? new Date(last).toLocaleString('en-IN') : E(T('md.never'))) + '</b></p>' +
        '<div class="btns"><button type="button" class="btn primary" data-act="backup">' + E(T('md.save')) + '</button>' +
        '<label class="btn">' + E(T('md.restore')) + '<input type="file" accept=".json,application/json" data-act="restore" hidden></label></div>' +
        '<p class="note">' + E(T('md.move')) + '</p>' +
        (f.supported ? '<h3>' + E(T('md.autot')) + '</h3><p class="note">' + (f.on
          ? T('md.auton', { file: '<b>' + E(BACKUP_NAME) + '.json</b>', name: '<b>' + E(f.name) + '</b>' }) + (f.allowed ? '' : ' ' + E(T('md.autoask')))
          : E(T('md.autooff'))) + '</p>' +
          '<div class="btns">' + (f.on ? (f.allowed ? '' : '<button type="button" class="btn primary" data-act="folder-allow">' + E(T('md.allow')) + '</button>') + '<button type="button" class="btn" data-act="folder-off">' + E(T('md.turnoff')) + '</button>' : '<button type="button" class="btn" data-act="folder-pick">' + E(T('md.choose')) + '</button>') + '</div>' : '') +
        '<p class="note">' + T('md.seeall', { link: '<a href="https://my.niveshsahayak.in/" target="_blank" rel="noopener">my.niveshsahayak.in</a>' }) + '</p>';
    }).catch(function () { body.innerHTML = '<p class="note bad">' + NS.esc(NS.t('md.err')) + '</p>'; });
  };
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-act]');
    if (!t) return;
    var a = t.getAttribute('data-act');
    if (a === 'backup') NS.downloadBackup().then(NS.openMyData);
    else if (a === 'folder-pick') NS.folderPick().then(NS.openMyData, function () {});
    else if (a === 'folder-allow') NS.folderWrite(true).then(NS.openMyData);
    else if (a === 'folder-off') NS.folderOff().then(NS.openMyData);
    else if (a === 'my-data') NS.openMyData();
    else if (a === 'remind-later') { var r = NS.$('#ns-remind'); if (r) r.hidden = true; NSStore.meta('lastBackup', Date.now() - 4 * 864e5); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-act') === 'restore' && t.files && t.files[0]) {
      NS.restoreFromFile(t.files[0]).then(function () { if (NS.onRestore) NS.onRestore(); NS.openMyData(); }, function () {});
      t.value = '';
    }
  });

  /* ---------- one sponsor card (only where the page has a slot) ---------- */
  var RIVAL = /invoice|billing|bill\s?book|accounting|gst\s?software|vyapar|khatabook|zoho|tally|busy|marg|quickbooks|refrens|swipe/i;
  NS.sponsor = function () {
    var slot = NS.$('[data-sponsor]');
    if (!slot || NS._sp) return;
    NS._sp = true;
    var india = /Calcutta|Kolkata/.test((Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || '');
    fetch('https://share.groupchaton.com/promos.json', { mode: 'cors' }).then(function (r) { return r.json(); }).then(function (j) {
      var list = (j.promos || []).filter(function (p) {
        if (!p || !p.href || p.own || p.family) return false;
        if (p.india && !india) return false;
        return !RIVAL.test([p.title, p.line, p.href].join(' '));
      });
      if (!list.length) return;
      var p = list[Math.floor(Math.random() * list.length)];
      var img = p.imgs && p.imgs.length ? p.imgs[Math.floor(Math.random() * p.imgs.length)] : '';
      slot.innerHTML = '<a class="sponsor" href="' + NS.esc(p.href) + '" target="_blank" rel="sponsored noopener">' +
        (img ? '<img src="' + NS.esc(img) + '" alt="" loading="lazy" width="96" height="96">' : '') +
        '<span><small>' + NS.esc(NS.t('sp.label')) + '</small><b>' + NS.esc(p.title || '') + '</b>' + (p.line ? '<span>' + NS.esc(p.line) + '</span>' : '') +
        (p.cta ? '<em>' + NS.esc(p.cta) + ' →</em>' : '') + '</span></a>';
      slot.hidden = false;
    }).catch(function () {});
  };

  /* ---------- PDF for the share sheet: the printed sheets drawn into a PDF in the browser (html2canvas + jsPDF, loaded only when needed) ---------- */
  var JS = {}, LIBS = [['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H'],
    ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk']];
  NS.loadJs = function (src, sri) {
    return JS[src] || (JS[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; if (sri) { s.integrity = sri; s.crossOrigin = 'anonymous'; } s.referrerPolicy = 'no-referrer';
      s.onload = res; s.onerror = function () { delete JS[src]; rej(new Error('load')); };
      document.head.appendChild(s);
    }));
  };
  var PAGE = { a4: [210, 297], a5: [148, 210], th80: [80, 0], th58: [58, 0] };
  NS.makePdf = function (nodes, paper) {
    return Promise.all(LIBS.map(function (l) { return NS.loadJs(l[0], l[1]); })).then(function () {
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:-12000px;top:0;background:#fff';
      document.body.appendChild(box);
      var pg = PAGE[paper] || PAGE.a4, pdf = null;
      var shots = Array.prototype.map.call(nodes, function (n) { var c = n.cloneNode(true); c.classList.remove('a5'); box.appendChild(c); return c; });
      return shots.reduce(function (p, c) {
        return p.then(function () { return window.html2canvas(c, { scale: 2, backgroundColor: '#ffffff', logging: false }); }).then(function (cv) {
          var w = pg[0], h = Math.max(pg[1], cv.height * w / cv.width), fmt = [w, h];
          if (!pdf) pdf = new window.jspdf.jsPDF({ unit: 'mm', format: fmt, orientation: 'portrait', compress: true });
          else pdf.addPage(fmt, 'portrait');
          pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, cv.height * w / cv.width);
        });
      }, Promise.resolve()).then(function () { box.remove(); return pdf.output('blob'); }, function (e) { box.remove(); throw e; });
    });
  };
  function saveBlob(blob, name) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }
  /* phone: share sheet with the PDF file; computer or old phone: the PDF is downloaded. A slow PDF can outlast the tap, so then one more tap shares it. */
  NS.sharePdf = function (nodes, name, paper, title, text) {
    var fname = String(name).replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90) + '.pdf';
    NS.toast(NS.t('pdf.making'));
    return NS.makePdf(nodes, paper).then(function (blob) {
      var file = new File([blob], fname, { type: 'application/pdf' });
      var can = navigator.canShare && navigator.canShare({ files: [file] });
      if (!can) { saveBlob(blob, fname); NS.toast(NS.t('pdf.saved', { file: fname })); return; }
      var go = function () { return navigator.share({ files: [file], title: title, text: text }); };
      return go().catch(function (e) {
        if (e && e.name === 'AbortError') return;
        var b = NS.el('button', { type: 'button', 'class': 'btn primary pdf-again' }, NS.esc(NS.t('pdf.tap')));
        b.addEventListener('click', function () { b.remove(); go().catch(function () { saveBlob(blob, fname); }); });
        document.body.appendChild(b);
        setTimeout(function () { b.remove(); }, 20000);
      });
    }).catch(function () {
      NS.toast(NS.t('pdf.fail'), 'bad');
      if (navigator.share) navigator.share({ title: title, text: text }).catch(function () {});
      else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
    });
  };

  /* ---------- page start ---------- */
  NS.start = function () {
    if (NS.initLang) NS.initLang();
    NS.initTheme();
    var y = NS.$('[data-year]'); if (y) y.textContent = new Date().getFullYear();
    NS.sponsor();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(function () {});
    document.documentElement.classList.add('ready');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', NS.start); else NS.start();
})();
