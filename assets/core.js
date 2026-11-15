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
  /* the state's name in the screen language (pickers and messages); printed documents keep NS.stateName, in English (round C) */
  NS.stateLoc = function (code) { var k = 'st.' + code, v = NS.t ? NS.t(k) : k; return v && v !== k ? v : NS.stateName(code); };

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
  NS.money = function (n, sym) { var v = NS.r2(n); return (v < 0 ? '-' : '') + (sym === false ? '' : '₹') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };   /* -₹1,500.00, never ₹-1,500.00 (round C) */
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
    /* over an open form (a modal dialog sits in the top layer) the message must show above it, not hide behind it (round C:
       "Save did nothing"): it goes to the top layer too, as a popover */
    var top = !!document.querySelector('dialog[open]') && !!t.showPopover;
    try { if (top) { t.setAttribute('popover', 'manual'); if (!t.matches(':popover-open')) t.showPopover(); } else if (t.hasAttribute('popover')) t.removeAttribute('popover'); } catch (e) {}
    t.textContent = msg; t.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(t._h); t._h = setTimeout(function () { t.className = ''; setTimeout(function () { try { if (!t.className && t.matches(':popover-open')) t.hidePopover(); } catch (e) {} }, 300); }, 3200);
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
    /* the button's name follows the language, which arrives after the first paint (round C: "Colour theme" in English) */
    document.addEventListener('ns-lang', function () { var w; try { w = localStorage.getItem('ns-theme'); } catch (e) {} applyTheme(w); });
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

  /* ---------- one auto save for all tools (desktop Chrome/Edge) ----------
     Rewritten 15 Nov 2026 (owner: "it doesn't work in the App and keeps asking again"). Chrome lets a page choose a folder, and give
     its OK again after a restart, only in a top-level page of the site that keeps the folder. So the folder is chosen and the full
     backup file is written by a top-level page: the App (app.niveshsahayak.in; also its /do/ makers, same page) or My data
     (my.niveshsahayak.in, for whoever chose there before). Saves made on any other site or tab reach the open App through the data
     home ('chg', vault.js), and the App writes the file. Other sites show where it is on and open the App to turn it on.
     The data home keeps a note {name, last, host} (meta 'autosave') so every site can say "on in the App, last saved ...". */
  var FOLDER_DB = 'ns-folder';
  function folderDb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(FOLDER_DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('h'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function fdbGet(k) {
    return folderDb().then(function (d) { return new Promise(function (res) { var q = d.transaction('h').objectStore('h').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; }); });
  }
  function fdbSet(k, v) {
    return folderDb().then(function (d) { return new Promise(function (res) { var t = d.transaction('h', 'readwrite'); v == null ? t.objectStore('h').delete(k) : t.objectStore('h').put(v, k); t.oncomplete = res; t.onerror = res; }); });
  }
  function folderGet() { return fdbGet('dir'); }
  function folderSet(h) { return fdbSet('dir', h); }
  var HOME = new URL('/', (window.NS_CFG || {}).vault || 'https://my.niveshsahayak.in/vault.html', location.href);
  var APPURL = (function () { var t = ((window.NS_CFG || {}).tools || []); return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? null : 'https://app.niveshsahayak.in/'; })();
  /* the App page itself (NS_CFG.inapp is given only to the App's own page) or a maker opened inside it (/do/, same origin) */
  function appTop() { try { return window.top.NS_CFG && !!window.top.NS_CFG.inapp && window.top.location.origin === location.origin; } catch (e) { return false; } }
  /* this page may choose the folder and write the file: the App, or the My data site, as a page of its own (not in someone's frame) */
  NS.folderHere = function () { return appTop() || (location.origin === HOME.origin && window.top === window); };
  /* computers only (owner): phones and tablets keep "Save a backup file" (Android Chrome has the folder picker too, so look at the device) */
  NS.folderSupported = function () {
    return 'showDirectoryPicker' in window && !/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) &&
      !(window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
  };
  var AF_OPEN = /[?&]autosave=1/.test(location.search);   /* read now: the page may tidy its address later */
  /* elsewhere: open the App (on this computer's test copy, the App's local address) on its auto save part */
  NS.folderHome = function () {
    var u = APPURL; if (!u) { var a = document.querySelector('#ns-side a[data-ic=app]'); u = a ? a.href : 'https://app.niveshsahayak.in/'; }
    window.open(u + (u.indexOf('?') < 0 ? '?' : '&') + 'autosave=1', '_blank', 'noopener');
  };
  /* the writer: the full backup file, the same as "Back up everything" */
  var AF = { t: 0, st: '', note: null };
  function afNote(v) { return window.NSStore ? NSStore.meta('autosave', v).catch(function () {}) : Promise.resolve(); }
  function afWrite() {
    var go = function () {
      return folderGet().then(function (h) {
        if (!h) return 'off';
        return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
          if (p !== 'granted') return 'ask';
          return NSStore.exportAll().then(function (data) {
            var b = { app: 'Nivesh Sahayak', kind: 'backup', version: 1, saved: new Date().toISOString(), data: data };
            return h.getFileHandle(BACKUP_NAME + '.json', { create: true }).then(function (fh) { return fh.createWritable(); })
              .then(function (w) { return w.write(JSON.stringify(b, null, 1)).then(function () { return w.close(); }); });
          }).then(function () {
            var now = Date.now();
            return fdbSet('last', now).then(function () { return NSStore.meta('lastBackup', now); })
              .then(function () { return afNote({ name: h.name, last: now, host: location.hostname }); }).then(function () { return 'ok'; });
          });
        });
      }).catch(function () { return 'fail'; });
    };
    return (navigator.locks && navigator.locks.request ? navigator.locks.request('ns-af-top', go) : go()).then(function (st) {
      AF.st = st; afBar(st === 'ask' ? 'oa.paused' : null); if (st === 'ok') hideReminder();
      if (st === 'ask') armAsk();
      if (st === 'ask' && window.NSStore) NSStore.meta('autosave').then(function (n) { if (n && n.name && !n.paused) afNote(Object.assign({}, n, { paused: true })); }).catch(function () {});
      return st;
    });
  }
  /* after a browser restart the OK is gone: the browser may ask only after a click or key, so the first one in the page asks
     (not a click on Later or on the auto save buttons themselves, which ask on their own) */
  var asked = false;
  function armAsk() {
    if (asked || !NS.folderHere()) return; asked = true;
    var h = function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-act^="folder"],[data-act="af-later"]')) return;
      document.removeEventListener('pointerdown', h, true); document.removeEventListener('keydown', h, true);
      if (!afBar.later) NS.folderAllow();
    };
    document.addEventListener('pointerdown', h, true); document.addEventListener('keydown', h, true);
  }
  NS.isInstalled = function () { return !!(window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay)').matches) || navigator.standalone === true; };
  function afSoon(ms) {
    if (!NS.folderHere() || !NS.folderSupported()) return;
    clearTimeout(AF.t); AF.t = setTimeout(afWrite, ms == null ? 1500 : ms);
  }
  function folderOn(name) {
    NS.toast(NS.t('oa.done', { name: name })); hideReminder(); afBar(null);
  }
  NS.folderPick = function () {
    if (!NS.folderHere()) { NS.folderHome(); return Promise.reject(new Error('elsewhere')); }
    return window.showDirectoryPicker({ id: 'ns-backup', mode: 'readwrite', startIn: 'documents' }).then(function (h) {
      /* the picker gave read and write: the file is written at once, so the person sees it is working */
      return folderSet(h).then(afWrite).then(function (st) {
        if (st === 'ok') { folderOn(h.name); return h.name; }
        NS.toast(NS.t('oa.fail'), 'bad'); throw new Error(st);
      });
    });
  };
  NS.folderAllow = function () {
    if (!NS.folderHere()) { NS.folderHome(); return Promise.resolve(false); }
    return folderGet().then(function (h) {
      if (!h) return false;
      return h.requestPermission({ mode: 'readwrite' }).then(function (q) {
        if (q !== 'granted') return false;
        return afWrite().then(function (st) { if (st === 'ok') folderOn(h.name); return st === 'ok'; });
      });
    }).catch(function () { return false; });
  };
  NS.folderOff = function () {
    return folderSet(null).then(function () { return fdbSet('last', null); }).then(function () { return afNote(null); })
      .then(function () { return window.NSStore ? NSStore.autosave('afOff').catch(function () {}) : null; })
      .then(function () { NS.toast(NS.t('oa.offt')); afBar(null); });
  };
  /* {supported, on, name, file, allowed, last, here}; on other sites: {on, name, last, host, elsewhere} from the data home's note */
  NS.folderStatus = function () {
    if (!NS.folderSupported()) return window.NSStore ? NSStore.meta('autodl').then(function (v) { return { supported: false, autodl: !!v }; }, function () { return { supported: false }; }) : Promise.resolve({ supported: false });
    if (!window.NSStore) return Promise.resolve({ supported: true, on: false, home: false });   /* pages with no saved data (view.) */
    if (NS.folderHere()) {
      return Promise.all([folderGet(), fdbGet('last')]).then(function (r) {
        var h = r[0];
        if (!h) return NSStore.meta('autosave').then(function (n) { return { supported: true, on: false, here: true, other: n && n.host !== location.hostname ? n : null }; });
        return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
          return { supported: true, on: true, here: true, name: h.name, file: BACKUP_NAME + '.json', allowed: p === 'granted', last: r[1] || 0 };
        });
      }).catch(function () { return { supported: true, on: false, here: true }; });
    }
    return NSStore.meta('autosave').then(function (n) {
      return n && n.name ? { supported: true, on: true, elsewhere: true, allowed: !n.paused, name: n.name, file: BACKUP_NAME + '.json', last: n.last || 0, host: n.host || '' } : { supported: true, on: false };
    }, function () { return { supported: true, on: false, home: false }; });
  };
  /* after a save: the App or My data writes the file a moment later */
  NS.folderWrite = function () { afSoon(); return Promise.resolve(true); };

  /* "Auto save paused" (the browser wants its OK again, e.g. after a restart): one slim bar, only on the page that can give it */
  function afBar(key) {
    var bar = NS.$('#ns-afbar');
    if (!key) { if (bar) bar.remove(); return; }
    if (bar || !document.body || afBar.later || window.top !== window) return;
    bar = NS.el('div', { id: 'ns-afbar', class: 'remind', role: 'status' });
    bar.innerHTML = '<div class="wrap"><span></span><button type="button" class="btn" data-act="folder-allow"></button><button type="button" class="btn" data-act="af-later"></button></div>';
    NS.$('span', bar).textContent = NS.t(key);
    NS.$('[data-act="folder-allow"]', bar).textContent = NS.t('oa.resume');
    NS.$('[data-act="af-later"]', bar).textContent = NS.t('later');
    var at = NS.$('#main') || document.body;
    at.insertBefore(bar, at.firstChild);
  }
  /* a change in this tab (store.js 'ns-saved') or anywhere else (the data home's 'chg'): write the file a moment later */
  document.addEventListener('ns-saved', function () { afSoon(); });
  document.addEventListener('ns-autosave', function (e) { if (e.detail === 'chg') afSoon(); });
  /* start: the App and My data write once (changes made while they were closed), and open the auto save part when asked to */
  function folderStart() {
    if (window.top !== window || !window.NSStore) return;
    if (!NS.folderSupported()) { if (AF_OPEN && NS.folderHere() && NS.openMyData) { NS._mdTab = 'af'; NS.openMyData(); } return; }
    if (!NS.folderHere()) {
      /* an older version kept a folder on each site: those can't be used any more, forget them quietly */
      if (location.origin !== HOME.origin) folderGet().then(function (h) { if (h) folderSet(null); }).catch(function () {});
      return;
    }
    NSStore.ready().then(function () {
      return folderGet().then(function (h) { if (h) afSoon(200); });
    }).then(function () {
      if (AF_OPEN && NS.openMyData) { NS._mdTab = 'af'; NS.openMyData(); }
    }).catch(function () {});
  }
  if (document.readyState === 'complete') setTimeout(folderStart, 1500); else window.addEventListener('load', function () { setTimeout(folderStart, 1500); });
  /* browsers that cannot keep a folder: if the person switched it on, a backup file goes to Downloads once a day (App or My data open) */
  function autoDl(now) {
    if (NS.folderSupported() || !NS.folderHere() || !window.NSStore) return;
    Promise.all([NSStore.meta('autodl'), NSStore.meta('lastBackup'), NSStore.list('doc'), NSStore.list('party')]).then(function (r) {
      if (!r[0] || (!r[2].length && !r[3].length)) return;
      if (!now && Date.now() - (r[1] || 0) < 20 * 36e5) return;
      return NS.downloadBackup();
    }).catch(function () {});
  }
  if (window.top === window) { setTimeout(function () { autoDl(); }, 6000); setInterval(function () { autoDl(); }, 36e5); }
  /* Safari and every browser on an iPhone or iPad (all use Safari's engine) keep a separate store of data for each website address,
     so billing., quotation. and my. do not see each other's records there. Inside the App all tools share one store: say so, once. */
  NS.splitStore = function () { var ua = navigator.userAgent; return /AppleWebKit/.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua); };
  function splitNote() {
    if (!NS.splitStore() || window.top !== window || appTop() || !window.NSStore || NS.$('#ns-wknote')) return;
    try { if (localStorage.getItem('ns-wk-note')) return; } catch (e) { return; }
    var a = NS.$('#ns-side a[data-ic=app]'), base = a ? a.href : 'https://app.niveshsahayak.in/', site = location.hostname.split('.')[0];
    var go = location.origin === HOME.origin || !/niveshsahayak\.in$/.test(location.hostname) ? base : base.replace(/\/?$/, '/') + '#do/' + site + '/';
    var bar = NS.el('div', { id: 'ns-wknote', class: 'remind', role: 'note' });
    bar.innerHTML = '<div class="wrap"><span></span><a class="btn primary" data-ic="app"></a><button type="button" class="btn" data-wk-ok></button></div>';
    NS.$('span', bar).textContent = NS.t('wk.note'); var l = NS.$('a', bar); l.href = go; l.textContent = NS.t('wk.open');
    NS.$('[data-wk-ok]', bar).textContent = NS.t('wk.ok');
    NS.$('[data-wk-ok]', bar).onclick = function () { try { localStorage.setItem('ns-wk-note', '1'); } catch (e) {} bar.remove(); };
    var at = NS.$('#main') || document.body; at.insertBefore(bar, at.firstChild);
  }
  if (document.readyState === 'complete') setTimeout(splitNote, 1200); else window.addEventListener('load', function () { setTimeout(splitNote, 1200); });

  /* ---------- tool settings live in the data home too ----------
     Tools keep a few settings in this site's localStorage (turnover band, Tally ledger names, price list and barcode label layouts,
     GST calendar, profit and loss drafts, HSN band, stock report choices, recent GSTIN look-ups, last return period picked).
     Each change is also copied into the data home (meta 'prefs' = {key: {v, t}}), so it is in "Back up everything", the one auto save
     and on every site and device the backup is restored to. On load the newer side wins; values only on this site are carried in.
     Not copied: look and place (theme, language, side menu, chosen business, last screen) and unsaved drafts of a document. */
  var PREF = /^ns-(aato|tally-led|prl|bc-set|gstcal|gstcal-told|gstcal-note|pl-draft-.+|hsn-band|stock-(sv|lv|mv)|gstin-recent|c8|g1|g3|td)$/;
  var lsSet = Storage.prototype.setItem, lsDel = Storage.prototype.removeItem, prefDue = {}, prefT = 0;
  function prefStamps(v) {
    if (v) { try { lsSet.call(localStorage, 'ns-prefs-t', JSON.stringify(v)); } catch (e) {} return v; }
    try { return JSON.parse(localStorage.getItem('ns-prefs-t') || '{}') || {}; } catch (e) { return {}; }
  }
  function prefPush() {
    var due = prefDue; prefDue = {};
    if (!Object.keys(due).length || !window.NSStore) return;
    NSStore.ready().then(function (m) {
      if (m !== 'vault') { Object.assign(prefDue, due); return; }   /* the data home is not reachable: next time */
      return NSStore.meta('prefs').then(function (all) {
        all = all || {};
        Object.keys(due).forEach(function (k) { if (!all[k] || (all[k].t || 0) <= due[k].t) all[k] = due[k]; });
        return NSStore.meta('prefs', all);
      });
    }).catch(function () {});
  }
  function prefMark(k, v) {
    var t = Date.now(), st = prefStamps(); st[k] = t; prefStamps(st);
    prefDue[k] = { v: v, t: t };
    clearTimeout(prefT); prefT = setTimeout(prefPush, 800);
  }
  try {
    Storage.prototype.setItem = function (k, v) { lsSet.call(this, k, v); if (this === window.localStorage && PREF.test(k)) prefMark(k, String(v)); };
    Storage.prototype.removeItem = function (k) { lsDel.call(this, k); if (this === window.localStorage && PREF.test(k)) prefMark(k, null); };
  } catch (e) {}
  function prefPull() {
    if (!window.NSStore) return;
    NSStore.ready().then(function (m) {
      if (m !== 'vault') return;
      return NSStore.meta('prefs').then(function (all) {
        all = all || {};
        var st = prefStamps(), mine = {}, got = 0;
        for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (PREF.test(k)) mine[k] = 1; }
        Object.keys(all).forEach(function (k) {
          var r = all[k];
          if (!PREF.test(k) || !r || (st[k] || 0) >= (r.t || 0)) return;
          try { if (r.v == null) lsDel.call(localStorage, k); else lsSet.call(localStorage, k, r.v); } catch (e) { return; }
          st[k] = r.t; got++;
        });
        /* settings made here before (or while the data home was away) that it doesn't have yet: carry them in */
        Object.keys(mine).forEach(function (k) {
          if (all[k] && (all[k].t || 0) >= (st[k] || 0)) return;
          prefDue[k] = { v: localStorage.getItem(k), t: st[k] || Date.now() };
        });
        prefStamps(st);
        if (Object.keys(prefDue).length) prefPush();
        if (got) document.dispatchEvent(new CustomEvent('ns-prefs', { detail: got }));
      });
    }).catch(function () {});
  }
  NS.prefPull = prefPull;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prefPull); else setTimeout(prefPull, 0);


  /* ---------- "My data" dialog (same on every site): a settings window with a side list of parts, each part = rows
     (name + one status line + "?" for the long help + small buttons on the right). Other files add rows/parts through NS.mdExt
     (safe.js: password backup, send to accountant, Drive sync), using NS.mdRow and the panes [data-md-pane=ov|bk|af|ac]. ---------- */
  var mdTip = 0;
  NS.mdRow = function (label, status, tip, btns) {
    var E = NS.esc, id = tip ? 'md-tip-' + (++mdTip) : '';
    return '<div class="md-row"><div class="md-rl"><b>' + E(label) + '</b>' +
      (tip ? '<button type="button" class="hp-q" data-md-tip aria-expanded="false" aria-controls="' + id + '" aria-label="' + E(NS.t('hp.btn', { what: label })) + '" title="' + E(NS.t('hp.btn', { what: label })) + '">?</button>' : '') +
      (status ? '<span class="md-st">' + status + '</span>' : '') +
      (tip ? '<p class="hp-tip" id="' + id + '" hidden>' + E(tip) + '</p>' : '') + '</div>' +
      (btns ? '<div class="md-rb">' + btns + '</div>' : '') + '</div>';
  };
  NS.openMyData = function () {
    var dlg = NS.$('#ns-mydata');
    if (!dlg) return;
    var body = NS.$('[data-mydata-body]', dlg);
    dlg.classList.add('md-dlg');
    if (!dlg.open) {
      body.innerHTML = '<p class="soft">' + NS.esc(NS.t('md.loading')) + '</p>';
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    }
    Promise.all(['biz', 'party', 'item', 'doc'].map(function (s) { return NSStore.list(s); })).then(function (r) {
      return Promise.all([NS.folderStatus(), NSStore.meta('lastBackup')]).then(function (x) { return [r, x[0], x[1]]; });
    }).then(function (all) {
      var r = all[0], f = all[1], last = all[2];
      var shared = NSStore.mode() === 'vault';
      var T = NS.t, E = NS.esc, B = function (act, key, pri) { return '<button type="button" class="btn sm' + (pri ? ' primary' : '') + '" data-act="' + act + '">' + E(T(key)) + '</button>'; };
      var lastTxt = last ? new Date(last).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : T('md.never');
      var on = '<i class="md-dot on"></i>', off = '<i class="md-dot"></i>', warn = '<i class="md-dot warn"></i>';
      var fTxt = !f.supported ? '' : f.home === false ? warn + E(T('oa.nohome')) : f.on ? (f.allowed ? on + E(T('md2.on')) : warn + E(T('md2.ask'))) + ' · <bdi class="mono">' + E(f.name) + '</bdi>' +
        (f.elsewhere && f.host ? ' · ' + E(T('oa.by', { host: f.host })) : '') : off + E(T('md2.off'));
      /* the one auto save: chosen and written by the App (or My data); elsewhere the buttons open the App in a new tab (↗) */
      var here = NS.folderHere(), away = here ? '' : ' ↗';
      var FB = function (act, key, pri) { return '<button type="button" class="btn sm' + (pri ? ' primary' : '') + '" data-act="' + act + '">' + E(T(key)) + away + '</button>'; };
      /* phones and tablets: the part is still there, saying auto save is for computers (the button "Auto-save and storage" opens it) */
      var dlRow = '<label class="md-chk"><input type="checkbox" data-autodl' + (f.autodl ? ' checked' : '') + '> <b>' + E(T('oa.dl')) + '</b></label><p class="soft">' + E(T('oa.dlp')) + '</p>';
      var instTip = f.supported && f.on && here && !NS.isInstalled() ? '<p class="note">' + E(T('oa.inst')) + ' <button type="button" class="btn sm" data-desk-install>' + E(T('desk.install')) + '</button></p>' : '';
      var afPane = !f.supported ? '<p>' + off + E(T('ux.af.pc')) + '</p><div class="md-bar">' + B('backup', 'md.save', 1) + '</div>' + dlRow : instTip + NS.mdRow(T('oa.t'), fTxt + (f.on && f.last ? '<br>' + E(T('md.last')) + ' ' + E(new Date(f.last).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })) : ''),
          (f.on ? T('oa.on', { file: f.file || BACKUP_NAME + '.json', name: f.name }) + (f.allowed ? '' : ' ' + T('oa.ask')) : T('oa.off')),
          f.home === false ? '' : f.elsewhere ? FB('folder-pick', 'oa.open', 1) : f.on ? (f.allowed ? '' : FB('folder-allow', 'md.allow', 1)) + B('folder-off', 'md.turnoff') : FB('folder-pick', 'md.choose', 1)) +
        (f.other ? '<p class="note">' + E(T('oa.other', { host: f.other.host || '' })) + '</p>' : '') +
        '<p class="soft">' + E(T('oa.all')) + ' ' + E(T(here ? 'oa.here' : 'oa.away2')) + '</p>';
      var restore = '<label class="btn sm">' + E(T('md.restore')) + '<input type="file" accept=".json,application/json" data-act="restore" hidden></label>';
      var hub = location.origin === HOME.origin ? '' : '<a class="btn sm" href="https://my.niveshsahayak.in/" target="_blank" rel="noopener">' + E(T('md2.open')) + ' ↗</a>';   /* not on the full data page itself */
      var tabs = [['ov', 'md2.ov'], ['bk', 'md2.bk'], ['af', 'md2.folder'], ['ac', 'b3.ac.t']];
      var cur = NS._mdTab && tabs.some(function (t) { return t[0] === NS._mdTab; }) ? NS._mdTab : 'ov';
      var pane = function (k, html) { return '<section class="md-pane" role="tabpanel" id="md-p-' + k + '" aria-labelledby="md-t-' + k + '" data-md-pane="' + k + '"' + (k === cur ? '' : ' hidden') + '>' + html + '</section>'; };
      body.innerHTML =
        '<div class="md-wrap"><div class="md-nav" role="tablist" aria-orientation="vertical">' + tabs.map(function (t) {
          return '<button type="button" role="tab" id="md-t-' + t[0] + '" aria-controls="md-p-' + t[0] + '" aria-selected="' + (t[0] === cur) + '" tabindex="' + (t[0] === cur ? 0 : -1) + '" data-md-tab="' + t[0] + '" data-ic="' + { ov: 'home', bk: 'data', af: 'save', ac: 'send' }[t[0]] + '">' + E(T(t[1])) + '</button>';
        }).join('') + '</div><div class="md-panes">' +
        pane('ov',
          '<table class="md-counts"><tr>' + [[r[0], 'md.biz'], [r[1], 'md.party'], [r[2], 'md.item'], [r[3], 'md.doc']].map(function (c) {
            return '<td><b>' + c[0].length + '</b><span>' + E(T(c[1])) + '</span></td>';
          }).join('') + '</tr></table>' +
          '<dl class="md-stat"><div><dt>' + E(T('md2.where')) + '</dt><dd>' + (shared ? on : warn) + E(T(shared ? 'desk.shared' : 'desk.local')) +
            '<button type="button" class="hp-q" data-md-tip aria-expanded="false" aria-controls="md-tip-w" aria-label="' + E(T('hp.btn', { what: T('md2.where') })) + '">?</button></dd></div>' +
          '<div><dt>' + E(T('md.last').replace(/[:：]\s*$/, '')) + '</dt><dd>' + (last ? on : warn) + E(lastTxt) + '</dd></div>' +
          (f.supported ? '<div><dt>' + E(T('md2.folder')) + '</dt><dd>' + fTxt + '</dd></div>' : '') + '</dl>' +
          '<p class="hp-tip" id="md-tip-w" hidden>' + E(T(shared ? 'md.shared' : 'md.local')) + '</p>' +
          '<div class="md-bar">' + B('backup', 'md.save', 1) + restore + hub + '</div>') +
        pane('bk', NS.mdRow(T('md2.file'), (last ? on : warn) + E(T('md.last')) + ' ' + E(lastTxt), T('md.move'), B('backup', 'md.save', 1) + restore)) +
        pane('af', afPane) +
        pane('ac', '') +
        '</div></div>';
      (NS.mdExt || []).forEach(function (f) { try { f(body); } catch (e) {} });   /* extra parts from other files (safe.js) */
    }).catch(function () { body.innerHTML = '<p class="note bad">' + NS.esc(NS.t('md.err')) + '</p>'; });
  };
  function mdTab(b, focus) {
    var box = b.closest('.md-wrap'), k = b.getAttribute('data-md-tab');
    NS._mdTab = k;
    NS.$$('[data-md-tab]', box).forEach(function (x) { var s = x === b; x.setAttribute('aria-selected', s); x.tabIndex = s ? 0 : -1; });
    NS.$$('.md-pane', box).forEach(function (p) { p.hidden = p.getAttribute('data-md-pane') !== k; });
    if (focus) b.focus();
  }
  document.addEventListener('keydown', function (e) {
    var b = e.target.closest && e.target.closest('[data-md-tab]');
    if (!b || !/^(Arrow(Up|Down|Left|Right)|Home|End)$/.test(e.key)) return;
    var all = NS.$$('[data-md-tab]', b.parentNode), i = all.indexOf(b), n = all.length;
    var back = e.key === 'ArrowUp' || e.key === (document.documentElement.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft');
    i = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : back ? (i - 1 + n) % n : (i + 1) % n;
    e.preventDefault(); mdTab(all[i], true);
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-act]');
    var tb = e.target.closest && e.target.closest('[data-md-tab],[data-md-tip]');
    if (tb && tb.hasAttribute('data-md-tab')) mdTab(tb);
    else if (tb) { var tp = document.getElementById(tb.getAttribute('aria-controls')), sh = tp.hidden; tp.hidden = !sh; tb.setAttribute('aria-expanded', sh); }
    if (!t) return;
    var a = t.getAttribute('data-act');
    /* on the My data page itself, redraw it ("Last backup" changes); elsewhere open the My data box */
    if (a === 'backup') NS.downloadBackup().then(function () { if (document.getElementById('my-app')) document.dispatchEvent(new CustomEvent('ns-data')); else NS.openMyData(); });
    else if (a === 'folder-pick') NS.folderPick().then(mdAgain, function () {});
    else if (a === 'folder-allow') NS.folderAllow().then(mdAgain);
    else if (a === 'folder-off') NS.folderOff().then(mdAgain);
    else if (a === 'af-later') { afBar.later = true; afBar(null); }
    else if (a === 'my-data') { NS._mdTab = t.getAttribute('data-tab') || 'ov'; NS.openMyData(); }
    else if (a === 'remind-later') { var r = NS.$('#ns-remind'); if (r) r.hidden = true; NSStore.meta('lastBackup', Date.now() - 4 * 864e5); }
  });
  function mdAgain() { if (NS.$('#ns-mydata[open]')) NS.openMyData(); }
  document.addEventListener('change', function (e) {
    if (!e.target.matches || !e.target.matches('[data-autodl]')) return;
    var on = e.target.checked;
    NSStore.meta('autodl', on ? true : null).then(function () { NS.toast(NS.t(on ? 'oa.dlon' : 'oa.dloff')); if (on) autoDl(true); });
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-act') === 'restore' && t.files && t.files[0]) {
      /* on the My data page itself the page shows the result; the My data box opens only on other pages (round C) */
      NS.restoreFromFile(t.files[0]).then(function () { if (NS.onRestore) NS.onRestore(); if (!document.getElementById('my-app')) NS.openMyData(); }, function () {});
      t.value = '';
    }
  });

  /* the maker's button bar stays under the header on computers (doc.css): keep --hd-h = the header's height, and mark the
     bar .stuck once it has reached the top so it gets a line under it */
  (function () {
    function hdH() {
      var hd = document.querySelector('header.hd'), h = hd && hd.getClientRects().length && /sticky|fixed/.test(getComputedStyle(hd).position) ? hd.offsetHeight : 0;
      document.documentElement.style.setProperty('--hd-h', h + 'px');
    }
    function stuck() {
      var bar = document.querySelector('.tool-top');
      if (!bar) return;
      var top = parseFloat(getComputedStyle(bar).top) || 0, on = getComputedStyle(bar).position === 'sticky';
      if (on) document.documentElement.style.setProperty('--bar-h', bar.offsetHeight + 'px');
      bar.classList.toggle('stuck', on && window.scrollY > 0 && bar.getBoundingClientRect().top <= top + 16);
    }
    /* phones: the bottom bar (.actions) also gets New and Saved; a copy (.act-x) that presses the real button and follows its words */
    function bottomBar() {
      var acts = document.querySelector('#tool .actions'), top = document.querySelector('#tool .tool-top');
      if (!acts || !top || acts.querySelector('.act-x')) return;
      ['history', 'new'].forEach(function (k) {
        var orig = top.querySelector('[data-do="' + k + '"]');
        if (!orig) return;
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn act-x'; b.setAttribute('data-noic', '');
        var copy = function () { b.innerHTML = orig.innerHTML; };
        copy(); new MutationObserver(copy).observe(orig, { childList: true, subtree: true, characterData: true });
        b.addEventListener('click', function () { orig.click(); });
        acts.insertBefore(b, acts.firstChild);
      });
    }
    function go() { hdH(); stuck(); bottomBar(); }
    window.addEventListener('scroll', stuck, { passive: true });
    window.addEventListener('resize', go);
    if (window.ResizeObserver) document.addEventListener('DOMContentLoaded', function () { var hd = document.querySelector('header.hd'); if (hd) new ResizeObserver(go).observe(hd); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  })();

  /* the business a new document starts with: the default chosen in Settings, or the only one saved (a first visitor who
     added one business should not have to pick it) */
  NS.defaultBiz = function (cfg) {
    /* the App's copy of a maker (or a link with ?biz=<id>) starts with the business chosen in the App, not the default */
    var want = new URLSearchParams(location.search).get('biz') || ((window.NS_CFG || {}).inApp ? NS.curBiz() : '');
    var pick = want ? NSStore.get('biz', want).catch(function () {}) : Promise.resolve();
    return pick.then(function (b) {
      if (b) return b;
      if (cfg && cfg.defBiz) return NSStore.get('biz', cfg.defBiz).catch(function () {});
      return NSStore.list('biz').then(function (l) { return l && l.length === 1 ? l[0] : undefined; }, function () {});
    });
  };
  /* the business the App works in, kept PER TAB (sessionStorage; frames of the App share it): switching business in one tab
     must never move another tab's entries to that business. localStorage only gives a new tab its starting choice. */
  NS.curBiz = function () {
    var v = '';
    try { v = sessionStorage.getItem('ns-app-biz') || ''; } catch (e) {}
    if (!v) try { v = localStorage.getItem('ns-app-biz') || ''; if (v) sessionStorage.setItem('ns-app-biz', v); } catch (e) {}
    return v;
  };
  NS.setCurBiz = function (id) {
    try { if (id) { sessionStorage.setItem('ns-app-biz', id); localStorage.setItem('ns-app-biz', id); } else { sessionStorage.removeItem('ns-app-biz'); localStorage.removeItem('ns-app-biz'); } } catch (e) {}
  };
  /* a kept draft that points at a saved record which is gone (deleted, or removed with the sample data): null = start fresh */
  NS.liveDraft = function (dr) {
    if (!dr || !dr.id) return Promise.resolve(dr);
    return NSStore.get('doc', dr.id).then(function (r) { return r ? dr : null; }, function () { return dr; });
  };
  /* a new document's business must be a saved one: a seller no longer saved (deleted) gives way to the default.
     Resolves to the business to use instead, or null to keep the seller (nothing saved yet, or the seller is saved). */
  /* isNew: a new document, which starts with the App's business (inside the App) or ?biz=<id> when there is one */
  /* ---------- settings per business (owner, 2026-11-06): meta 'settings' keeps the shared values (the fallback, and what a new
     business starts with) plus byBiz { <business id>: { invoice, <document type>, tf, stockValue, godowns, salesmen, lockBefore, ... } }.
     Global keys stay shared: the default business, backup reminder, PIN, closed years (kept by business name), feature switches
     (kept by business id). The first time settings are read with businesses saved, each business gets a copy of the shared values
     (bizSplit), so nobody loses a number series. Read: NS.cfgFor(S, business id | seller | business) = one merged copy.
     Write: NS.cfgSave(S, business id, view) puts a view's business keys back under byBiz; NS.cfgEdit(id, fn) reads, edits, saves. ---------- */
  var CFG_GLOBAL = { defBiz: 1, remindDays: 1, features: 1, byBiz: 1, bizSplit: 1, pin: 1, closed: 1, prefs: 1 };
  NS.CFG_GLOBAL = CFG_GLOBAL;
  NS.bizCache = [];
  function cfgCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  /* the business id of an id, a business record or a document's seller copy (by id when it is still saved, else by name) */
  NS.bizIdOf = function (who, list) {
    if (!who) return '';
    list = list || NS.bizCache || [];
    if (typeof who === 'string') return who;
    if (who.id && list.some(function (b) { return b.id === who.id; })) return who.id;
    var nm = String(who.name || '').trim().toLowerCase();
    var b = nm && list.filter(function (x) { return String(x.name || '').trim().toLowerCase() === nm; })[0];
    return b ? b.id : '';
  };
  NS.cfgFor = function (S, who, list) {
    S = S || {};
    var id = NS.bizIdOf(who, list), own = id && S.byBiz && S.byBiz[id] || {}, o = cfgCopy(S) || {};
    Object.keys(own).forEach(function (k) { if (!CFG_GLOBAL[k]) o[k] = cfgCopy(own[k]); });
    delete o.byBiz; delete o.bizSplit;
    Object.defineProperty(o, '_biz', { value: id, enumerable: false });
    return o;
  };
  NS.cfgSave = function (S, id, view) {
    Object.keys(view || {}).forEach(function (k) {
      if (k === 'byBiz' || k === 'bizSplit' || k.charAt(0) === '_') return;
      if (CFG_GLOBAL[k] || !id) S[k] = cfgCopy(view[k]);
      else { S.byBiz = S.byBiz || {}; (S.byBiz[id] = S.byBiz[id] || {})[k] = cfgCopy(view[k]); }
    });
    return S;
  };
  /* one-time copy of the shared values into every saved business (true when something changed) */
  NS.cfgSplit = function (S, list) {
    if (!S || S.bizSplit || !list || !list.length) return false;
    S.byBiz = S.byBiz || {};
    list.forEach(function (b) {
      if (!b || !b.id) return;
      var own = S.byBiz[b.id] = S.byBiz[b.id] || {};
      Object.keys(S).forEach(function (k) { if (!CFG_GLOBAL[k] && k.charAt(0) !== '_' && !(k in own)) own[k] = cfgCopy(S[k]); });
    });
    S.bizSplit = 1;
    return true;
  };
  /* settings for the pages: reads them with the saved businesses (kept in NS.bizCache), splits once, gives the stored record */
  NS.loadCfg = function () {
    return Promise.all([NSStore.meta('settings'), NSStore.list('biz')]).then(function (r) {
      var S = r[0] || {}; NS.bizCache = r[1] || [];
      if (NS.cfgSplit(S, NS.bizCache)) return NSStore.meta('settings', S).then(function () { return S; }, function () { return S; });
      return S;
    });
  };
  NS.cfgEdit = function (who, fn) {
    return NS.loadCfg().then(function (S) {
      var id = NS.bizIdOf(who), v = NS.cfgFor(S, id);
      fn(v);
      NS.cfgSave(S, id, v);
      return NSStore.meta('settings', S).then(function () { return S; });
    });
  };
  /* customers, suppliers and items are shared by every business unless My data marks one "only for" a business (record.biz = id) */
  NS.forBiz = function (list, who) {
    var id = NS.bizIdOf(who);
    return (list || []).filter(function (x) { return !x || !x.biz || !id || x.biz === id; });
  };
  NS.liveSeller = function (seller, cfg, isNew) {
    var nm = String(seller && seller.name || '').trim().toLowerCase();
    function same(b) { return String(b.name || '').trim().toLowerCase() === nm; }
    return NSStore.list('biz').then(function (l) {
      if (!l || !l.length) return null;
      var want = isNew && (new URLSearchParams(location.search).get('biz') || ((window.NS_CFG || {}).inApp ? NS.curBiz() : ''));
      var w = want && l.filter(function (b) { return b.id === want; })[0];
      if (w) return same(w) ? null : w;
      if (nm && l.some(same)) return null;
      return NS.defaultBiz(cfg).then(function (b) { return b || null; });
    }, function () { return null; });
  };

  /* ---------- party and stock groups (data home meta 'groups' = { party: [{id, name, under}], item: [{id, name, under}] }) ----------
     Party groups sit under the two built-ins 'debtors' (Customers) and 'creditors' (Suppliers), which are never stored; a stored
     group's under is a built-in (top group) or a top group's id (sub-group, one level). Item groups: under '' (top) or a top group's id.
     A party with no (or an unknown) group is in the built-in for its role; an item with no group is found by its cat text.
     partyGroup / itemGroup return { id, name, top, under }: top = the built-in for a party ('debtors' | 'creditors'), the top item
     group for an item ('' when the item has no group). */
  var GB = { debtors: ['grp.debtors', 'Customers'], creditors: ['grp.creditors', 'Suppliers'] };
  function gName(id) { var v = NS.t ? NS.t(GB[id][0]) : ''; return v && v !== GB[id][0] ? v : GB[id][1]; }
  NS.groupsOf = function (meta, kind) {
    var own = ((meta && meta[kind]) || []).filter(function (g) { return g && g.id && String(g.name || '').trim(); });
    if (kind !== 'party') return own.slice();
    return [{ id: 'debtors', name: gName('debtors'), under: '', builtin: true }, { id: 'creditors', name: gName('creditors'), under: '', builtin: true }].concat(own);
  };
  function gFind(list, id) { return list.filter(function (g) { return g.id === id; })[0]; }
  function gOut(list, g, party) {
    var up = g.under ? gFind(list, g.under) : null, top = party ? (g.builtin ? g.id : up && up.builtin ? up.id : up && up.under || 'debtors') : (up ? up.id : g.id);
    return { id: g.id, name: g.name, top: top, under: g.under || '' };
  }
  NS.partyGroup = function (p, meta) {
    var list = NS.groupsOf(meta, 'party'), g = p && p.group && gFind(list, p.group);
    if (!g) g = gFind(list, p && p.role === 'supplier' ? 'creditors' : 'debtors');
    return gOut(list, g, true);
  };
  NS.itemGroup = function (it, meta) {
    var list = NS.groupsOf(meta, 'item'), g = it && it.group && gFind(list, it.group), c = String(it && it.cat || '').trim().toLowerCase();
    if (!g && c) g = list.filter(function (x) { return String(x.name).trim().toLowerCase() === c; })[0];
    return g ? gOut(list, g, false) : { id: '', name: '', top: '', under: '' };
  };

  /* ---------- one sponsor card (only where the page has a slot) ---------- */
  var RIVAL = /invoice|billing|bill\s?book|accounting|gst\s?software|vyapar|khatabook|zoho|tally|busy|marg|quickbooks|refrens|swipe/i;
  /* own (Ko-fi) and family (GroupChatOn sites) cards are never shown here, except Nivesh Sahayak's own website-design card
     (family 'designs', labelled with its tag, not marked sponsored); under the card a short line invites businesses to
     promote themselves (promo.niveshsahayak.in). data-sponsor="rotate" (bottom of the App) moves to the next card every 30 s */
  NS.sponsor = function () {
    var slot = NS.$('[data-sponsor]');
    if (!slot || NS._sp) return;
    NS._sp = true;
    var india = /Calcutta|Kolkata/.test((Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || '');
    var promo = function () { return '<p class="sp-promo"><a href="https://promo.niveshsahayak.in/" target="_blank" rel="noopener">' + NS.esc(NS.t('sp.promo')) + ' →</a></p>'; };
    var card = function (p) {
      var img = p.imgs && p.imgs.length ? p.imgs[Math.floor(Math.random() * p.imgs.length)] : (p.img_icon || '');
      return '<a class="sponsor" href="' + NS.esc(p.href) + '" target="_blank" rel="' + (p.own ? 'noopener' : 'sponsored noopener') + '">' +
        (img ? '<img src="' + NS.esc(img) + '" alt="" loading="lazy" width="96" height="96">' : '') +
        '<span><small>' + NS.esc(p.tag || NS.t('sp.label')) + '</small><b>' + NS.esc(p.title || '') + '</b>' + (p.line ? '<span>' + NS.esc(p.line) + '</span>' : '') +
        (p.cta ? '<em>' + NS.esc(p.cta) + ' →</em>' : '') + '</span></a>';
    };
    var show = function (list) {
      var i = 0, draw = function () { slot.innerHTML = (list.length ? card(list[i % list.length]) : '') + promo(); };
      draw(); slot.hidden = false;
      document.addEventListener('ns-lang', draw);
      if (slot.getAttribute('data-sponsor') !== 'rotate' || list.length < 2) return;
      setInterval(function () {
        if (document.hidden || slot.matches(':hover,:focus-within')) return;
        slot.classList.add('sp-out');
        setTimeout(function () { i++; draw(); slot.classList.remove('sp-out'); }, 250);
      }, 30000);
    };
    fetch('https://share.groupchaton.com/promos.json', { mode: 'cors' }).then(function (r) { return r.json(); }).then(function (j) {
      var list = (j.promos || []).filter(function (p) {
        if (!p || !p.href || ((p.own || p.family) && p.family !== 'designs')) return false;
        if (p.india && !india) return false;
        return !RIVAL.test([p.title, p.line, p.href].join(' '));
      });
      for (var k = list.length - 1; k > 0; k--) { var r = Math.floor(Math.random() * (k + 1)), x = list[k]; list[k] = list[r]; list[r] = x; }
      show(list);
    }).catch(function () { show([]); });
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
  /* grey on-screen prompts (class ph: "Address", "Customer name and address"…) never go into a PDF */
  NS.dropHints = function (root) {
    Array.prototype.forEach.call(root.querySelectorAll('.ph'), function (e) { if (e.tagName === 'P') e.remove(); else e.style.visibility = 'hidden'; });
  };
  var PAGE = { a4: [210, 297], a5: [148, 210], th80: [80, 0], th58: [58, 0] };
  NS.makePdf = function (nodes, paper) {
    return Promise.all(LIBS.map(function (l) { return NS.loadJs(l[0], l[1]); })).then(function () {
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:-12000px;top:0;background:#fff';
      document.body.appendChild(box);
      var pg = PAGE[paper] || PAGE.a4, pdf = null;
      var shots = Array.prototype.map.call(nodes, function (n) { var c = n.cloneNode(true); c.classList.remove('a5'); NS.dropHints(c); box.appendChild(c); return c; });
      return shots.reduce(function (p, c) {
        return p.then(function () { return window.html2canvas(c, { scale: 2, backgroundColor: '#ffffff', logging: false }); }).then(function (cv) {
          var w = pg[0];
          /* A4 / A5: a long sheet is cut into real pages of that size (round C: one tall page that printed shrunk or cut);
             a thermal roll stays one long strip */
          var pieces = [cv];
          if (pg[1]) {
            var ph = Math.floor(cv.width * pg[1] / pg[0]);
            if (cv.height > ph + 4) {
              pieces = [];
              for (var y = 0; y < cv.height; y += ph) {
                var pc = document.createElement('canvas'); pc.width = cv.width; pc.height = Math.min(ph, cv.height - y);
                var cx = pc.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, pc.width, pc.height); cx.drawImage(cv, 0, y, cv.width, pc.height, 0, 0, cv.width, pc.height);
                pieces.push(pc);
              }
            }
          }
          pieces.forEach(function (pcv, i) {
            var fmt = [w, pg[1] || pcv.height * w / pcv.width];
            if (!pdf) pdf = new window.jspdf.jsPDF({ unit: 'mm', format: fmt, orientation: 'portrait', compress: true });
            else pdf.addPage(fmt, 'portrait');
            pdf.addImage(pcv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, pcv.height * w / pcv.width);
            /* the sheet's plain (English) words as an invisible layer on its first page: the PDF can be searched and the bill
               number copied */
            if (!i) try { var tx = String(c.innerText || '').replace(/[^\x20-\x7E\n₹]/g, ' ').replace(/₹/g, 'Rs ').replace(/[ \t]+/g, ' ').trim(); pdf.setFontSize(6); pdf.text(pdf.splitTextToSize(tx, w - 10).slice(0, 400), 5, 5, { renderingMode: 'invisible' }); } catch (e) {}
          });
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

  /* ---------- motion: a panel, tab or list that the user brings up fades in. Works for every tool without changing it:
     an element losing `hidden`, or a container whose content is replaced right after a tap (never while typing, so the
     live preview stays still). Add data-still to any box that must never move. Off with "reduce motion". */
  NS.motion = function () {
    if (!window.MutationObserver || !Element.prototype.animate || !document.body) return;
    var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
    var tap = 0, key = 0, todo = [], queued = false;
    var mark = function (e) { if (!e || e.isTrusted !== false) tap = Date.now(); };   /* real taps only, not clicks a tool makes itself */
    document.addEventListener('pointerdown', mark, true);
    document.addEventListener('click', mark, true);
    window.addEventListener('hashchange', mark);
    document.addEventListener('input', function () { key = Date.now(); }, true);
    document.addEventListener('keydown', function (e) { if (e.key !== 'Enter' && e.key !== ' ') key = Date.now(); }, true);
    var SKIP = 'option,datalist,script,style,svg,canvas,img,#ns-toast,.boot,dialog';
    function fit(el) {
      if (!el || el.nodeType !== 1 || el.matches(SKIP) || el.closest('[data-still],.boot')) return false;
      var h = el.offsetHeight;
      return h > 24;
    }
    function run() {
      queued = false;
      var list = todo; todo = [];
      list.forEach(function (el) {
        if (list.some(function (o) { return o !== el && o.contains(el); })) return;   /* the outer box already moves */
        if (el._nsMoved && Date.now() - el._nsMoved < 400) return;   /* one tap, one fade */
        el._nsMoved = Date.now();
        el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.7,.3,1)' });
      });
    }
    function add(el) {
      if (todo.indexOf(el) < 0) todo.push(el);
      if (!queued) { queued = true; requestAnimationFrame(run); }
    }
    new MutationObserver(function (ms) {
      if (calm && calm.matches) return;
      var now = Date.now(), user = now - tap < 1500 && now - key > 700;
      ms.forEach(function (m) {
        if (m.type === 'attributes') { if (user && m.oldValue !== null && !m.target.hidden && fit(m.target)) add(m.target); return; }
        if (!user || !m.addedNodes.length) return;
        var el = m.target;
        if (el === document.body || el.id === 'main') { Array.prototype.forEach.call(m.addedNodes, function (n) { if (fit(n)) add(n); }); return; }
        if (fit(el)) add(el);
      });
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
  };

  /* ---------- line icons on text buttons: every .btn with words gets a small drawn (SVG) icon in front, on every tool, with no change
     to the tools. The meaning comes from data-ic, the button's data-* names (data-do="save", data-act="backup", data-close…), its
     data-i18n key, or the key whose text it shows in the current language (NS.meaning). A button whose words start with a sign
     (+, ✓, ×…) or that already has a picture is left as it is. ---------- */
  var IC = {
    save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6', print: 'M7 9V4h10v5M7 17H5v-7h14v7h-2M7 14h10v6H7z', share: 'M12 15V3M8 7l4-4 4 4M5 12v8h14v-8',
    down: 'M12 4v11M7 10l5 5 5-5M5 20h14', up: 'M12 16V5M7 10l5-5 5 5M5 20h14', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    plus: 'M12 5v14M5 12h14', edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4', copy: 'M9 9h11v11H9zM5 15H4V4h11v1', x: 'M6 6l12 12M18 6L6 18',
    back: 'M19 12H5M11 6l-6 6 6 6', go: 'M5 12h14M13 6l6 6-6 6', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4',
    list: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1', gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', send: 'M4 12l16-8-6 16-3-7z', flag: 'M5 21V4M5 4h11l-2 4 2 4H5', reset: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5',
    check: 'M5 12l5 5 9-10', data: 'M5 6c0-1.7 3-3 7-3s7 1.3 7 3-3 3-7 3-7-1.3-7-3M5 6v12c0 1.7 3 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3 3 7 3s7-1.3 7-3',
    ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6', wa: 'M4 20l1.3-4A8 8 0 1 1 8 18.7zM9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z',
    money: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M6 10v4M18 10v4', clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16M12 8v4l3 2',
    home: 'M3 11l9-7 9 7v9h-6v-6H9v6H3z', people: 'M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M18 14a6 6 0 0 1 4 7', box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10', shop: 'M4 10v10h16V10M3 10l2-6h14l2 6zM9 20v-6h6v6', book: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z', bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18', filter: 'M3 5h18l-7 8v6l-4 2v-8z', chart: 'M4 4v16h16M8 16v-5M12 16V8M16 16v-3', keyboard: 'M3 6h18v12H3zM7 10h1M11 10h1M15 10h1M7 14h10', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6', camera: 'M4 7h4l2-3h4l2 3h4v13H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7', calc: 'M6 3h12v18H6zM9 7h6M9 11h1M12 11h1M15 11h1M9 15h1M12 15h1M15 15h1', calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4', cart: 'M4 5h2l2 10h10l2-7H7M9 19h.01M17 19h.01',
    folder: 'M3 6h6l2 2h10v11H3z',
    repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3', layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
    coins: 'M12 4c4 0 7 1.1 7 2.5S16 9 12 9 5 7.9 5 6.5 8 4 12 4zM5 6.5v5C5 12.9 8 14 12 14s7-1.1 7-2.5v-5M5 11.5v5C5 17.9 8 19 12 19s7-1.1 7-2.5v-5',
    scale: 'M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
    writeoff: 'M6 3h9l4 4v14H6zM14 3v5h5M8 16l8-6', cap: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z', bed: 'M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3M7 10.5a1.5 1.5 0 1 0 0 .01',
    wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
    pulse: 'M3 12h4l3-7 4 14 3-7h4', bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
    file: 'M6 3h9l4 4v14H6zM14 3v5h5', link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1'
  };
  /* first match wins: [regular expression over "data names + key + English words", icon] */
  var ICRULES = [[/whats\s?app|\bwa\b/, 'wa'], [/print/, 'print'], [/stop repeat/, 'x'], [/see and make|repeating|renewals?\b/, 'repeat'], [/write.?off/, 'writeoff'], [/comments file|choose the file/, 'up'], [/make the link/, 'link'],
    [/s-backup/, 'data'], [/desk\.keys|keyboard|shortcut/, 'keyboard'],
    [/preview/, 'eye'], [/scan|camera/, 'camera'], [/\bpf\b|work out|calculat/, 'calc'], [/filt|\bcf\b|post-dated|bounce|below zero/, 'filter'],
    [/get name|gst portal/, 'search'], [/restore|import|upload/, 'up'], [/backup|download|export|excel|csv|install/, 'down'],   /* "Restore from backup" is an upload (round C) */
    [/\bpdf\b|share/, 'share'], [/delete|remove|\brm\b|bin|trash|clear|-off\b/, 'trash'], [/report|tell|mistake/, 'flag'], [/later/, 'clock'],
    [/\bsend\b|reminder|remind/, 'send'], [/lock|\bpin\b/, 'lock'], [/reset|again|undo|refresh|reload/, 'reset'],
    [/\bnext\b|continue/, 'go'], [/setting|configur/, 'gear'], [/\bsave\b|submit|\bok\b|use these|apply|done/, 'save'],   /* "Next" and "Settings and saved data" are not a floppy disk (round C) */ [/\bnew\b|\badd\b|create/, 'plus'], [/edit|change|rename|series/, 'edit'], [/copy|duplicate/, 'copy'],
    [/close|cancel|dismiss/, 'x'], [/\bback\b|fback/, 'back'], [/search|find|lookup|fetch|check gstin/, 'search'], [/history|saved|list|register/, 'list'],
    [/setting|configur/, 'gear'], [/my.?data|vault/, 'data'], [/new tab|external|portal/, 'ext'],
    [/all tools by job|group summary|rent board/, 'layers'], [/feedback|loyalty/, 'star'], [/staff view/, 'people'], [/room diary/, 'calendar'], [/\brooms?\b/, 'bed'],
    [/\bunits\b/, 'home'], [/products and variants/, 'box'], [/service visits?/, 'wrench'], [/all contracts|\bcontracts?\b/, 'file'], [/attendance/, 'calendar'], [/\besi\b/, 'shield'], [/staff advance|\bsalary\b/, 'money'], [/\bloans?\b|\bemi\b/, 'coins'],
    [/trial balance|balance sheet/, 'scale'], [/profit and loss/, 'chart'], [/students?\b/, 'cap'], [/fee set.?up/, 'gear'],
    [/month end/, 'calendar'], [/business health|health \d/, 'pulse'], [/\breminders\b/, 'bell'],
    [/paid|payment|money|receiv|cash|\bpay\b/, 'money'], [/later|ageing|due/, 'clock'], [/open|convert|toinv|make invoice|next|go\b/, 'go'], [/doc|bill|invoice|statement|receipt|stmt/, 'file'],
    [/\bbk\b|book/, 'book'], [/b2pv|by item|by party|month|\bday\b|today|sale/, 'chart'], [/financial year|\bfy\b|year/, 'calendar'],
    [/salesm|customer|supplier|part(y|ies)|tenant|employee/, 'people'], [/count|stock|godown|item/, 'box'], [/bank/, 'bank'],
    [/\bdef\b|default/, 'check'], [/purchase|order/, 'cart'], [/folder/, 'folder']];
  function icFor(b) {
    if (b.getAttribute('data-ic')) return b.getAttribute('data-ic');
    var said = (b.textContent || '').trim();
    if (!said || !/^[\p{L}\p{N}]/u.test(said)) return '';
    var words = [].map.call(b.attributes, function (a) { return /^data-/.test(a.name) ? a.name.slice(5) + ' ' + a.value : a.name === 'type' && a.value === 'submit' ? 'submit' : ''; }).join(' ');
    words += ' ' + (b.getAttribute('data-i18n') || '') + ' ' + (NS.meaning ? NS.meaning(said) : '') + ' ' + said;
    words = words.toLowerCase();
    for (var i = 0; i < ICRULES.length; i++) if (ICRULES[i][0].test(words)) return ICRULES[i][1];
    return '';
  }
  /* besides .btn: text-link buttons, the status bar's buttons, Edit/Preview tabs and the My data window's part list */
  var ICSEL = '.btn,button.link,.sbar .linkish,[data-tab-btn]';
  function iconize(b) {
    if (!b.matches || !b.matches(ICSEL) || b.classList.contains('icon-btn') || b.classList.contains('hp-q') || b.querySelector('svg,img') || b.closest('[data-noic]')) return;
    /* "+ Add salesman": the typed plus becomes the drawn one */
    var tn = b.firstChild && b.firstChild.nodeType === 3 ? b.firstChild : null;
    if (tn && /^\s*\+\s*(?=[\p{L}\p{N}])/u.test(tn.nodeValue)) { tn.nodeValue = tn.nodeValue.replace(/^\s*\+\s*/, ''); b.setAttribute('data-ic', 'plus'); }
    var k = icFor(b); if (!k || !IC[k]) return;
    b.insertAdjacentHTML('afterbegin', '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + IC[k] + '"/></svg>');
  }
  NS.btnIcons = function () {
    if (!document.body) return;
    var todo = new Set(), queued = false;
    function run() { queued = false; todo.forEach(function (n) { if (n.isConnected) { iconize(n); if (n.querySelectorAll) [].forEach.call(n.querySelectorAll(ICSEL), iconize); } }); todo.clear(); }
    function add(n) { if (n.nodeType !== 1) return; todo.add(n); if (!queued) { queued = true; setTimeout(run, 16); } }   /* a timer, not a frame: background tabs draw no frames */
    add(document.body);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.target.nodeType === 1 && m.target.matches(ICSEL)) add(m.target);   /* its words were replaced (language change) */
        [].forEach.call(m.addedNodes, add);
      });
    }).observe(document.body, { subtree: true, childList: true });
  };

  /* ---------- number series of one document, changed inside its maker: NS.seriesLink(numberInput, {type, kind(), def(), name(), digits, fy, apply(settings)})
     adds "Change number series" under the number box; the window saves the prefix in My data › Settings (meta 'settings'), the same place
     the hub's document cards use, so every tool and the App read it. ---------- */
  var serDlg;
  function val(v) { return typeof v === 'function' ? v() : v; }
  NS.seriesLink = function (inp, o) {
    if (!inp || !window.NSStore) return;
    var f = inp.closest('.f') || inp.parentNode;
    if (!f || f.querySelector('[data-series]')) return;
    var b = NS.el('button', { type: 'button', 'class': 'link series-link', 'data-series': '' }, NS.esc(NS.t('sr.btn')));
    f.appendChild(b);
    b.addEventListener('click', function () {
      NS.loadCfg().then(function (S0) {
        var who = val(o.biz), S = NS.cfgFor(S0, who);   /* the series of this document's business */
        var type = val(o.type), kind = val(o.kind) || '', c = S[type] || {}, inv = S.invoice || {};
        var cur = kind ? (c.prefixes || {})[kind] : c.prefix;
        if (type === 'invoice' && cur == null) cur = inv.prefix;
        if (cur == null) cur = val(o.def) || '';
        var digits = o.digits || +inv.digits || 3, fy = o.fy != null ? o.fy : inv.fy !== false;
        var fyS = NS.fy(NS.today()), short = fyS.slice(2, 4) + '-' + fyS.slice(5);
        if (!serDlg) { serDlg = NS.el('dialog', { id: 'ns-series', 'aria-labelledby': 'ns-series-h' }); document.body.appendChild(serDlg); }
        serDlg.innerHTML = '<div class="dlg-h"><h2 id="ns-series-h">' + NS.esc(NS.t('sr.title', { doc: val(o.name) })) + '</h2><form method="dialog"><button class="btn sm">' + NS.esc(NS.t('close')) + '</button></form></div>' +
          '<form class="dlg-b" data-ser novalidate><p class="soft">' + NS.esc(NS.t('sr.p')) + '</p><div class="f"><label for="ser-pre">' + NS.esc(NS.t('hub.pfx')) + '</label>' +
          '<input id="ser-pre" dir="ltr" maxlength="8" autocapitalize="characters" value="' + NS.esc(cur) + '"></div>' +
          '<p>' + NS.esc(NS.t('hub.nextno')) + ' <b class="mono" data-ser-pv></b></p><p class="soft">' + NS.esc(NS.t('sr.more')) + ' <a href="' + (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8862/' : 'https://my.niveshsahayak.in/') + '#settings" target="_blank" rel="noopener">' + NS.esc(NS.t('mydata')) + ' ›</a></p>' +
          '<div class="btns"><button type="submit" class="btn primary">' + NS.esc(NS.t('sr.save')) + '</button></div></form>';
        var form = NS.$('[data-ser]', serDlg), p = NS.$('#ser-pre', serDlg);
        function clean() { return p.value.trim().toUpperCase().replace(/[^A-Z0-9\/\-]/g, ''); }
        function pv() { var x = clean(); NS.$('[data-ser-pv]', serDlg).textContent = (x ? x + '/' : '') + (fy ? short + '/' : '') + String(1).padStart(digits, '0'); }
        p.addEventListener('input', pv); pv();
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          NS.cfgEdit(who, function (V) {
            var x = clean(), c2 = V[type] = V[type] || {};
            if (kind) { c2.prefixes = c2.prefixes || {}; c2.prefixes[kind] = x; } else c2.prefix = x;
          }).then(function (F) {
            serDlg.close(); NS.toast(NS.t('sr.saved'));
            if (o.apply) o.apply(F);
          }).catch(function () { NS.toast(NS.t('sr.fail'), 'bad'); });
        });
        if (serDlg.showModal) serDlg.showModal(); else serDlg.setAttribute('open', '');
        p.focus(); p.select();
      });
    });
  };

  /* ---------- printed designs: one list for docs.js, slip.js and kit.js (thermal rolls keep their own look). The record field is a
     hidden <select> (so fill, save and drafts work as before); the reader taps small drawn pages. Every design is free. ---------- */
  NS.DESIGNS = ['classic', 'modern', 'compact', 'band', 'elegant', 'grid', 'minimal'];
  NS.designField = function (id, attrs) {
    return '<div class="f wide dpick-f"><span class="lbl" id="' + id + '-lbl">' + NS.esc(NS.t('l.design')) + '</span>' +
      '<select id="' + id + '"' + (attrs || '') + ' hidden tabindex="-1" aria-hidden="true">' + NS.DESIGNS.map(function (k) { return '<option value="' + k + '">' + NS.esc(NS.t('ds.' + k)) + '</option>'; }).join('') + '</select>' +
      '<div class="dpick" role="radiogroup" aria-labelledby="' + id + '-lbl" data-for="' + id + '">' + NS.DESIGNS.map(function (k) {
        return '<button type="button" role="radio" class="dp" data-dp="' + k + '" aria-checked="false" tabindex="-1"><i class="dp-mini dp-' + k + '" aria-hidden="true"></i><span>' + NS.esc(NS.t('ds.' + k)) + '</span></button>';
      }).join('') + '</div><small class="hint">' + NS.esc(NS.t('h.design3')) + '</small></div>';
  };
  /* tick the chosen design and paint the little pages in the document's colour */
  NS.designSync = function (scope, design, accent) {
    NS.$$('.dpick', scope).forEach(function (g) {
      var k = NS.DESIGNS.indexOf(design) < 0 ? 'classic' : design;
      if (accent) g.style.setProperty('--c', accent);
      NS.$$('.dp', g).forEach(function (b) { var on = b.getAttribute('data-dp') === k; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    });
  };
  (function () {
    function pick(b) {
      var g = b.closest('.dpick'), sel = g && document.getElementById(g.getAttribute('data-for'));
      if (!sel) return;
      NS.designSync(g.parentNode, b.getAttribute('data-dp'));
      if (sel.value === b.getAttribute('data-dp')) return;
      sel.value = b.getAttribute('data-dp');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.dpick .dp'); if (b) pick(b); });
    /* arrow keys move along the row, like any group of radio buttons */
    document.addEventListener('keydown', function (e) {
      var b = e.target.closest && e.target.closest('.dpick .dp'), step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!b || !step) return;
      var all = NS.$$('.dp', b.parentNode), rtl = getComputedStyle(b).direction === 'rtl' && /Left|Right/.test(e.key);
      var n = all[(all.indexOf(b) + (rtl ? -step : step) + all.length) % all.length];
      e.preventDefault(); n.focus(); pick(n);
    });
  })();

  /* ---------- page start ---------- */
  NS.start = function () {
    var lang = NS.initLang ? NS.initLang() : null;
    NS.initTheme();
    NS.motion();
    NS.btnIcons();
    var y = NS.$('[data-year]'); if (y) y.textContent = new Date().getFullYear();
    NS.sponsor();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(function () {});
    /* the loading screen stays until the screen text is in the reader's language (at most 1.2 s), so English never flashes first */
    /* on the first page of a visit it also waits until the logo has drawn itself (NS_BOOT_T, set in the page head; at most 3 s more) */
    var show = function () {
      var add = function () { if (!NS.leaving) document.documentElement.classList.add('ready'); };
      var boot = NS.$('.boot');
      if (!window.NS_BOOT_T || !boot) return add();
      if (!boot.getAnimations) return setTimeout(add, Math.max(0, NS_BOOT_T - performance.now()));
      var done = boot.getAnimations({ subtree: true }).filter(function (a) { return a.effect && a.effect.getComputedTiming().iterations !== Infinity; })
        .map(function (a) { return a.finished; });
      Promise.race([Promise.all(done), new Promise(function (r) { setTimeout(r, 3000); })]).then(add, add);
    };
    if (lang && lang.then) Promise.race([lang, new Promise(function (r) { setTimeout(r, 1200); })]).then(show, show);
    else show();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', NS.start); else NS.start();
})();
