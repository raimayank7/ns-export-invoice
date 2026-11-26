/* Alt keys everywhere (owner 25 Nov 2026: "Make app and software by Alt Key accessible").
   Two ways, the same letters:
   - tap Alt (press and let go): a small letter badge appears on everything that can be pressed on the screen in front of you
     (buttons, tabs, boxes, menu items). Press the letter (two letters for the few that need two) and it happens. Esc or Alt
     again closes the badges. Holding Alt for a moment shows them too.
   - hold Alt + the letter together: the same thing at once, without looking (the everyday way once a letter is known).
   The letters belong to the screen in front of you (the open box, else the entry screen, else the page). Common jobs keep
   the same letter on every screen (Save S, Print P, Delete D, New N ...), so habits carry over. Alt+G stays Go to, Alt+1-9
   stay the side menu, F is left to the browser. A key the screen does not use falls through to the older App-wide Alt keys
   (desk.js), so nothing that worked stops working unless the screen now uses that letter itself. */
(function () {
  if (window.NSAlt) return;
  var NS = window.NS = window.NS || {};
  var root = document.documentElement;
  /* letters a single badge may use: G = Go to, F = the browser's own menu */
  var FREE = 'SPNDEAXLWVBKCMORTHYIJUQ'.split('');   /* Z = the start of every Shortcuts panel code (below) */
  /* a job -> its letter on every screen. Matched against the English meaning of the label (any language) or the label. */
  var JOBS = [
    [/\bsave\b|^ok$|^done$|^accept|^apply|^update\b|^confirm|^yes\b/, 'S'],
    [/\bprint\b/, 'P'],
    [/\bpreview\b|\bview\b|^open\b|^show\b/, 'V'],
    [/\badd (a )?(line|row)\b/, 'A'],
    [/^\+?\s*new\b|\bcreate\b|^\+?\s*add (a |an )?(new |party|item|ledger|business|customer|supplier|employee|bank|group)/, 'N'],
    [/\bdelete\b|\bremove\b|\bclear\b/, 'D'],
    [/^edit\b|\bmodify\b|^change\b/, 'E'],
    [/^\+?\s*add\b/, 'A'],
    [/\bexcel\b|\bexport\b|\bdownload\b|\bcsv\b|\bpdf\b/, 'X'],
    [/\blist\b|\bregister\b/, 'L'],
    [/whatsapp|\bshare\b|\bsend\b|\bemail\b|\bmail\b/, 'W'],
    [/^back\b|^previous\b|^prev\b/, 'B'],
    [/\bsearch\b|\bfind\b/, 'K'],
    [/^cancel\b|^close\b|^no\b|^not now|^later\b|^skip\b/, 'C'],
    [/\bsettings?\b|\bconfigur|\boptions?\b/, 'O'],
    [/\bhelp\b|\bguide\b/, 'H'],
    [/\bcopy\b|\bduplicate\b|\brepeat\b/, 'Y'],
    [/\bnext\b|\bforward\b/, 'T'],
    [/^first\b/, 'I'],
    [/^last\b/, 'U'],
    [/\breceive|\bmoney in\b|\breceipt\b/, 'R'],
    [/\bmoney (out|paid)\b|\bpay\b|\bpayment\b/, 'Y'],
    [/\bmore\b|\bmenu\b/, 'M'],
    [/\bfilter\b|\bperiod\b|\bdate\b/, 'Q']
  ];
  var SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=menuitem],[role=option],[role=switch],[tabindex]:not([tabindex="-1"])';
  var shown = null, typed = '', armed = false, other = false, holdT = 0, ov = null;

  function vis(el) {
    if (el.disabled || el.closest('[hidden],[inert],[aria-hidden="true"],.ns-alt')) return null;
    for (var dt = el.closest('details'); dt; dt = dt.parentElement && dt.parentElement.closest('details')) if (!dt.open && !(el.closest('summary') && el.closest('summary').parentElement === dt)) return null;   /* inside a closed fold-out (Export ▾) */
    if (el.matches('input[type=radio],input[type=checkbox]') && el.closest('label') && !el.offsetWidth) el = el.closest('label');
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    var cs = getComputedStyle(el); if (cs.visibility === 'hidden') return null;
    for (var pa = el; pa && pa !== document.body; pa = pa.parentElement) if (+getComputedStyle(pa).opacity === 0) return null;   /* inside a see-through pop-up that is closed */
    /* covered by something else (a box in front, a sticky bar): skip it */
    var x = Math.min(Math.max(r.left + Math.min(r.width / 2, 12), 1), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
    var hit = document.elementFromPoint(x, y);
    if (!hit || (hit !== el && !el.contains(hit))) {
      var lb = el.labels && el.labels[0]; if (!(lb && (lb === hit || lb.contains(hit)))) return null;
    }
    return { el: el, r: r };
  }
  /* The Shortcuts panel (Customize changes its order, adds and removes items): every item keeps ONE code of its own, Z + two letters,
     whatever the order, the other items or the rest of the screen. Its own Go to code when it has one, else a fixed code for the entry
     forms and the two quick-add items. Codes never change, so a habit made once stays true after the panel is rearranged. */
  var PANEL_FORM = { sale: 'SA', pbill: 'PB', min: 'MI', mout: 'MO', contra: 'CO', exp: 'EX' };
  var PANEL_NEW = { party: 'NP', item: 'NI' };
  var PANEL_HREF = { '#dues': 'DU', '#stock': 'SK', '#books': 'CB', '#parties': 'PA', '#dlist': 'DR', '#clist': 'CR', '#fin/tb': 'TB', '#fin/bs': 'BS', '#fin/pl': 'PL', '#b2jv': 'JE' };
  function panelKey(el) {
    if (!el.closest('.sc-panel')) return '';
    if (el.hasAttribute('data-sc-cust')) return 'ZCU';
    var c = el.getAttribute('data-sccode') || '';
    if (!c) { var m = /Alt\+G\s+([A-Z]{2})\b/.exec((el.querySelector('kbd') || {}).textContent || ''); c = m ? m[1] : ''; }
    if (!c && el.hasAttribute('data-dform')) c = PANEL_FORM[el.getAttribute('data-dform')] || '';
    if (!c && el.hasAttribute('data-qnew')) c = PANEL_NEW[el.getAttribute('data-qnew')] || '';
    if (!c) c = PANEL_HREF[el.getAttribute('href') || ''] || '';
    return /^[A-Z]{2}$/.test(c) ? 'Z' + c : '';
  }
  function labelOf(el) {
    var t = '';
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      var lb = el.labels && el.labels[0];
      t = el.getAttribute('aria-label') || (lb && lb.innerText) || el.placeholder || el.title || '';
      if (!t && el.type && /^(submit|button)$/.test(el.type)) t = el.value;
      if (!t) { var c = el.closest('label,.fld,.field,.f'); t = c ? c.innerText : ''; }
    } else t = el.getAttribute('aria-label') || el.innerText || el.title || el.value || '';
    return String(t || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }
  function meaning(t) {
    var m = NS.meaning ? NS.meaning(t) : '';
    return ((m ? m.replace(/^\S+\s/, '') + ' | ' : '') + t).toLowerCase();
  }
  /* which part of the screen the letters belong to */
  function scope() {
    var drop = Array.prototype.filter.call(document.querySelectorAll('.mb-drop,[role=menu]'), function (d) {
      if (!d.offsetWidth || d.closest('[hidden]') || getComputedStyle(d).visibility === 'hidden') return false;
      return Array.prototype.some.call(d.querySelectorAll(SEL), function (x) { return !!vis(x); });   /* a menu that is really open, with something to press */
    }).pop();
    if (drop) return drop;   /* an open menu: its items, like the Office ribbon */
    var ds = Array.prototype.filter.call(document.querySelectorAll('dialog[open]'), function (d) { return d.offsetWidth; });
    if (ds.length) {
      var modal = ds.filter(function (d) { return d.matches(':modal'); });
      return modal.length ? modal[modal.length - 1] : ds[ds.length - 1];
    }
    return document.body;
  }
  /* rank: the buttons that do the job first, then tabs, boxes, the title bar, the side menu, then everything else */
  function rank(el) {
    if (el.closest('.vs-foot,.actions,.tool-top,.dlg-foot,menu,.btns,footer.f') || el.type === 'submit') return 0;
    if (el.matches('input,select,textarea,[role=switch]') && !el.closest('table,.bigtable')) return 1;   /* the boxes of a form, before the lesser buttons */
    if (el.matches('[role=tab],.mb-t') || el.closest('[role=tablist],.tabs,.seg')) return 2;   /* .mb-t: the voucher toolbar (Sale, Purchase ...) */
    if (el.matches('.mb-m')) return 3;   /* the menu headings: after the toolbar, before the title bar */
    if (el.matches('button,.btn,[role=button],input,select,textarea') && !el.closest('#ns-side,header,.sbar,nav')) return 3;
    if (el.closest('header,.mb,.menubar,.dk-top')) return 4;
    if (el.closest('#ns-side')) return 6;
    if (el.closest('.sbar,footer,.ft')) return 8;
    return 5;
  }
  function collect() {
    var sc = scope(), seen = new Set(), out = [];
    Array.prototype.forEach.call(sc.querySelectorAll(SEL), function (el) {
      var v = vis(el); if (!v || seen.has(v.el)) return; seen.add(v.el);
      v.label = labelOf(v.el); if (!v.label && !v.el.matches('input,select,textarea')) return;
      v.rank = rank(v.el); v.mean = meaning(v.label); out.push(v);
    });
    out.sort(function (a, b) { return a.rank - b.rank || (a.r.top - b.r.top) || (a.r.left - b.r.left); });
    return { scope: sc, items: out };
  }
  /* give out the letters */
  function assign(items) {
    var used = {}, singles = [], rest = [];
    var cap = items.length > FREE.length ? FREE.length - 3 : FREE.length;   /* keep a few letters free as the start of two-letter codes */
    function take(it, L) { if (!L || used[L] || FREE.indexOf(L) < 0 || singles.length >= cap) return false; used[L] = it; it.key = L; singles.push(it); return true; }
    /* side menu items keep the Alt+1-9 they already have */
    var side = 0;
    items.forEach(function (it) {
      if (it.rank === 6 && it.el.matches('#ns-side a[data-sec]') && side < 9 && !(NS.featHidden && NS.featHidden(it.el))) { side++; it.key = String(side); it.side = 1; }
    });
    var seenP = {};
    /* Shortcuts panel: the first ten, in the order the person arranged them, are Z1 ... Z9 and Z0 (plain 1-9 belong to the side menu);
       the rest keep a fixed code of their own */
    var nth = 0;
    items.filter(function (it) { return !it.key && it.el.closest('.sc-panel') && !it.el.hasAttribute('data-sc-cust'); })
      .sort(function (a, b) { return a.r.top - b.r.top; }).forEach(function (it) { if (nth < 10) { it.key = 'Z' + (nth + 1) % 10; nth++; } });
    items.forEach(function (it) { var k = !it.key && panelKey(it.el); if (k && !seenP[k]) { seenP[k] = 1; it.key = k; } });
    var pend = items.filter(function (it) { return !it.key && it.rank < 6; });
    /* 1: the job letters, best-ranked item first */
    pend.forEach(function (it) { for (var i = 0; i < JOBS.length; i++) if (JOBS[i][0].test(it.mean)) { take(it, JOBS[i][1]); break; } });
    /* 2: first letter of a word of the label, then any letter of it */
    pend.forEach(function (it) {
      if (it.key) return;
      var src = (it.mean.split(' | ')[0] || it.label).toUpperCase(), ws = src.match(/[A-Z]+/g) || [];
      if (ws.some(function (w) { return take(it, w[0]); })) return;
      for (var i = 0; i < src.length; i++) if (take(it, src[i])) return;
    });
    pend.forEach(function (it) { if (!it.key) rest.push(it); });
    items.forEach(function (it) { if (!it.key && it.rank >= 6) rest.push(it); });
    /* 3: what is left gets two letters, starting with a letter no single badge uses */
    var starts = FREE.filter(function (L) { return !used[L]; }), n = 0;
    rest.forEach(function (it) {
      if (singles.length < cap && !starts.length) return;
      if (!starts.length) return;
      var s = starts[Math.floor(n / FREE.length)]; if (!s) return;
      it.key = s + FREE[n % FREE.length]; n++;
    });
    return items.filter(function (it) { return it.key; });
  }

  function overlay(sc) {
    if (ov) ov.remove();
    ov = document.createElement('div'); ov.className = 'ns-alt'; ov.setAttribute('aria-hidden', 'true');
    ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;background:none;border:0;margin:0;padding:0;width:auto;height:auto;overflow:visible;max-width:none;max-height:none';
    document.body.appendChild(ov);
    if (sc !== document.body && ov.showPopover) { try { ov.setAttribute('popover', 'manual'); ov.showPopover(); } catch (e) {} }
    return ov;
  }
  /* underline the letter inside the label where it can be found (first letter of a word first) */
  function underline(it) {
    if (it.key.length !== 1 || /^\d$/.test(it.key)) return null;
    var w = document.createTreeWalker(it.el, NodeFilter.SHOW_TEXT), nd, best = null;
    while ((nd = w.nextNode())) {
      if (!nd.parentElement || nd.parentElement.closest('svg')) continue;
      var s = nd.textContent, re = new RegExp('(^|[^A-Za-z])(' + it.key + ')', 'i'), m = re.exec(s);
      if (m) { best = [nd, m.index + m[1].length]; break; }
      if (!best) { var i = s.toUpperCase().indexOf(it.key); if (i >= 0) best = [nd, i]; }
    }
    if (!best) return null;
    var rg = document.createRange(); rg.setStart(best[0], best[1]); rg.setEnd(best[0], best[1] + 1);
    var r = rg.getBoundingClientRect(); if (!r.width) return null;
    return r;
  }
  function show() {
    var c = collect(), list = assign(c.items);
    if (!list.length) return false;
    var o = overlay(c.scope);
    list.forEach(function (it) {
      var b = document.createElement('span'); b.className = 'ns-alt-k' + (it.key.length > 1 ? ' alt-two' : '') + (it.side ? ' alt-side' : '');
      b.textContent = it.key; b.setAttribute('data-k', it.key);
      var top = Math.max(2, it.r.top - 7), left = Math.max(2, it.r.left - 6);
      if (it.side) { top = it.r.top + (it.r.height - 18) / 2; left = Math.max(2, it.r.right - 22); }
      b.style.top = top + 'px'; b.style.left = left + 'px'; o.appendChild(b);
      var u = underline(it); if (u) { var ul = document.createElement('i'); ul.className = 'ns-alt-u'; ul.style.cssText = 'top:' + (u.bottom - 1) + 'px;left:' + u.left + 'px;width:' + u.width + 'px'; o.appendChild(ul); }
    });
    var tip = document.createElement('div'); tip.className = 'ns-alt-tip';
    tip.textContent = NS.t ? NS.t('alt.tip') : 'Press a letter. Esc closes.';
    if (tip.textContent === 'alt.tip') tip.textContent = 'Press a letter. Esc closes.';
    o.appendChild(tip);
    shown = { list: list, scope: c.scope }; typed = ''; root.classList.add('ns-alt-on');
    return true;
  }
  function hide() {
    if (ov) { try { if (ov.matches(':popover-open')) ov.hidePopover(); } catch (e) {} ov.remove(); ov = null; }
    shown = null; typed = ''; root.classList.remove('ns-alt-on');
  }
  function press(it) {
    var el = it.el;
    hide();
    if (it.side) { el.click(); el.focus && el.focus(); return; }
    if (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea')) { el.focus(); try { if (el.select && !/^(date|month|time|number)$/.test(el.type)) el.select(); } catch (e) {} return; }
    if (el.tagName === 'SELECT') { el.focus(); try { if (el.showPicker) el.showPicker(); } catch (e) {} return; }
    if (el.matches('input[type=checkbox],input[type=radio],[role=switch]')) { el.click(); el.focus(); return; }
    if (el.tagName === 'LABEL') { el.click(); var ip = el.querySelector('input'); if (ip) ip.focus(); return; }
    el.focus({ preventScroll: true }); el.click();
    /* a menu that opens: its items get letters at once (Alt, M, then the item's letter) */
    if (el.matches('[aria-haspopup],.mb-m,summary')) setTimeout(function () { if (!shown) show(); }, 120);
  }
  function narrow() {
    if (!shown || !ov) return;
    Array.prototype.forEach.call(ov.querySelectorAll('.ns-alt-k'), function (b) { var k = b.getAttribute('data-k'); b.classList.toggle('alt-dim', k.indexOf(typed) !== 0); });
  }
  function letterOf(e) {
    var c = e.code || '';
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit[0-9]$/.test(c)) return c.slice(5);
    if (/^Numpad[0-9]$/.test(c)) return c.slice(6);
    var k = (e.key || '').toUpperCase(); return /^[A-Z0-9]$/.test(k) ? k : '';
  }

  /* hold Alt + letter: the screen's own letter, at once */
  function direct(L) {
    var c = collect(), list = assign(c.items), hit = list.filter(function (it) { return it.key === L && !it.side; })[0];
    if (hit) { press(hit); return true; }
    return false;
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Alt' || e.key === 'AltGraph') {
      if (e.ctrlKey || e.metaKey || e.key === 'AltGraph') return;
      if (shown) { e.preventDefault(); return; }
      if (!e.repeat) { armed = true; other = false; clearTimeout(holdT); holdT = setTimeout(function () { if (armed && !other && !shown) show(); }, 450); }
      e.preventDefault();
      return;
    }
    if (armed) other = true;
    /* badges on the screen: letters pick, Esc closes, Backspace takes back a letter */
    if (shown) {
      if (e.ctrlKey || e.metaKey) { hide(); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hide(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); typed = typed.slice(0, -1); narrow(); return; }
      var L = letterOf(e);
      if (!L) { if (!/^(Shift|Control|Meta|CapsLock)$/.test(e.key)) hide(); return; }
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.altKey && /^\d$/.test(L)) { hide(); return; }   /* Alt+digit while the badges show: the side menu (desk.js) */
      typed += L;
      var exact = shown.list.filter(function (it) { return it.key === typed; })[0];
      if (exact) { press(exact); return; }
      if (!shown.list.some(function (it) { return it.key.indexOf(typed) === 0; })) { typed = ''; }
      narrow();
      return;
    }
    /* Alt + a letter held together */
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !(e.getModifierState && e.getModifierState('AltGraph'))) {
      var l = letterOf(e);
      if (!l || /^\d$/.test(l) || l === 'G' || l === 'F') return;   /* digits = side menu, G = Go to (desk.js); F = browser */
      if (e.repeat) { e.preventDefault(); return; }
      if (direct(l)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }
  }, true);
  window.addEventListener('keyup', function (e) {
    if (e.key !== 'Alt') return;
    clearTimeout(holdT);
    var tap = armed && !other; armed = false;
    if (!tap) { if (shown && other) hide(); return; }
    e.preventDefault();   /* keeps the browser's own menu from taking the key */
    if (shown) { if (!ov || !ov._fromHold) hide(); else ov._fromHold = false; return; }
    show();
  }, true);
  /* badges shown by holding Alt stay after Alt is let go (same as a tap) */
  var showHold = show;
  show = function () { var ok = showHold(); if (ok && armed && ov) ov._fromHold = true; return ok; };
  ['mousedown', 'wheel', 'resize', 'blur'].forEach(function (ev) { window.addEventListener(ev, function () { armed = false; if (shown) hide(); }, true); });
  window.addEventListener('scroll', function () { if (shown) hide(); }, true);

  window.NSAlt = { show: function () { return show(); }, hide: hide, keys: function () { var c = collect(); return assign(c.items).map(function (it) { return [it.key, it.label]; }); }, press: function (k) { var c = collect(), it = assign(c.items).filter(function (x) { return x.key === k; })[0]; if (it) press(it); return !!it; } };
})();
