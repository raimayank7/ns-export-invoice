/* Every NSBiz site outside the App, on a phone (widths up to 600 px): the long side menu and the title bar's buttons move into one
   bottom sheet (the same sheet as the App's phone layer, engine/phone.js), shown as grouped icon tiles. phonesite.css draws it and
   the compact title bar. Wider screens never see any of it, and nothing is stored. Words: existing keys only (desk.*, mydata, lang ...).
   The App itself (app.niveshsahayak.in, not its door sites) has its own phone layer and is left alone; so are pages inside the App's frame. */
(function () {
  'use strict';
  var de = document.documentElement;
  if (de.classList.contains('embed')) return;
  var mq = window.matchMedia('(max-width:600px)');
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function t(k, d) { try { var v = window.NS && NS.t ? NS.t(k) : ''; return v && v !== k ? v : d; } catch (e) { return d; } }
  /* the App proper draws its own phone screens (phone.js); its door sites (khata, cheque ...) and every other site use this one */
  function appProper() { var A = window.NSApp; return !!(A && A.data && !(A.door && A.door())); }
  function phone() { return mq.matches && !appProper() && !de.hasAttribute('data-en-only'); }
  function txt(n) { return (n && n.textContent || '').replace(/\s+/g, ' ').trim(); }

  var dlg = null, opener = null;
  function shut() { if (dlg) { var d = dlg; dlg = null; try { d.close(); } catch (e) {} d.remove(); } }
  function tile(label, ic, attrs) {
    label = label.replace(/\bNS\s+Biz\b/, 'NSBiz');
    return '<i aria-hidden="true" data-ic="' + esc(ic || 'dot') + '"></i><span>' + esc(label.length > 30 ? label.slice(0, 29) + '…' : label) + '</span>';
  }
  /* the menu: quick actions first (search, help, data, theme, language), then the side menu's groups as tiles */
  function menu() {
    shut();
    var side = $('#ns-side'), quick = [], html = '';
    if ($('[data-desk-cmd]')) quick.push(['find', t('desk.find', 'Search').replace(/[.…]+$/, ''), 'ps-search']);
    if ($('[data-help-open]')) quick.push(['help', t('f.help', 'Help'), 'info']);
    if ($('[data-act="my-data"]')) quick.push(['data', t('mydata', 'My data'), 'data']);
    if ($('[data-theme-btn]')) quick.push(['theme', t('theme', 'Colour theme'), 'ps-theme']);
    var inst = $('[data-desk-install]'); if (inst && !inst.hidden) quick.push(['install', t('desk.install', 'Install app'), 'app']);
    html += '<section class="ph-g ps-quick"><span class="ps-h" role="heading" aria-level="3">' + esc(t('desk.g_act', 'Settings and help')) + '</span><div class="ph-grid">' +
      quick.map(function (q) { return '<button type="button" class="ph-tile" data-psq="' + q[0] + '">' + tile(q[1], q[2]) + '</button>'; }).join('') + '</div>';
    var lp = $('[data-lang-pick]');
    if (lp && lp.options.length > 1 && !de.hasAttribute('data-en-only')) {
      html += '<label class="ps-lang"><span>' + esc(t('lang', 'Language')) + '</span><select data-psl>' +
        $$('option', lp).map(function (o) { return '<option value="' + esc(o.value) + '"' + (o.value === lp.value ? ' selected' : '') + '>' + esc(o.textContent) + '</option>'; }).join('') + '</select></label>';
    }
    html += '</section>';
    function ok(a) { return !a.hidden && !a.closest('[hidden]') && !(window.NS && NS.featHidden && NS.featHidden(a)) && !/^javascript/i.test(a.getAttribute('href')) && txt(a); }
    function block(h, items, fold) {
      var grid = '<div class="ph-grid">' + items.map(function (a) {
        var cur = a.getAttribute('aria-current') === 'page';
        return '<a class="ph-tile' + (cur ? ' ps-cur' : '') + '" href="' + esc(a.href) + '"' + (cur ? ' aria-current="page"' : '') + (a.target ? ' target="' + esc(a.target) + '"' : '') + '>' + tile(txt(a), a.getAttribute('data-ic')) + '</a>';
      }).join('') + '</div>';
      return fold ? '<details class="ph-g ps-fold"><summary><span class="ps-h" role="heading" aria-level="3">' + esc(h) + '</span><span class="ps-n">' + items.length + '</span></summary>' + grid + '</details>'
        : '<section class="ph-g"><span class="ps-h" role="heading" aria-level="3">' + esc(h) + '</span>' + grid + '</section>';
    }
    if (side) $$('.side-g', side).forEach(function (g) {
      var h = txt($('.side-h', g)) || t('desk.allmods', 'All tools'), key = g.getAttribute('data-g') || '';
      var subs = $$('.sg', g);
      if (subs.length) {   /* a door site: the App's screen list, by accounting job (Masters, Transactions ...); only the job holding this page opens */
        var first = $$('a[href]', g).filter(function (a) { return ok(a) && (!a.closest('.sg') || a.closest('.sg-top')); });
        if (first.length) html += block(h, first, false);
        subs.forEach(function (sg) {
          if (sg.classList.contains('sg-top')) return;
          var items = $$('a[href]', sg).filter(ok); if (!items.length) return;
          html += block(txt($('.sg-h', sg)) || h, items, !$('a[aria-current=page]', sg));
        });
        return;
      }
      var items = $$('a[href]', g).filter(ok);
      if (!items.length) return;
      /* this site's own screens and the software are open; the long lists of other tools fold (the group holding this page opens) */
      html += block(h, items, (key === 'docs' || key === 'more' || key === 'about') && !$('a[aria-current=page]', g));
    });
    dlg = document.createElement('dialog'); dlg.className = 'ph-sheet ps-sheet'; dlg.setAttribute('aria-label', t('desk.menu', 'Menu'));
    dlg.innerHTML = '<div class="ph-sh-h"><b>' + esc(t('desk.allmods', 'All tools')) + '</b><button type="button" class="ph-ic ph-cl" aria-label="' + esc(t('close', 'Close')) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="ph-sh-b">' + html + '</div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) { shut(); return; }
      if (e.target.closest('.ph-cl')) { shut(); return; }
      var q = e.target.closest('[data-psq]');
      if (q) {
        var act = q.getAttribute('data-psq'); shut();
        setTimeout(function () {
          var sel = { find: '[data-desk-cmd]', help: '[data-help-open]', data: '[data-act="my-data"]', theme: '[data-theme-btn]', install: '[data-desk-install]' }[act], b = sel && $(sel);
          if (b) b.click();
        }, 0);
        return;
      }
      if (e.target.closest('a[href]')) shut();   /* a link goes where it points */
    });
    dlg.addEventListener('change', function (e) {
      if (!e.target.matches('[data-psl]')) return;
      var lp = $('[data-lang-pick]'); if (!lp) return;
      lp.value = e.target.value; lp.dispatchEvent(new Event('change', { bubbles: true })); shut();
    });
    dlg.addEventListener('close', function () { if (dlg) { dlg.remove(); dlg = null; } if (opener && opener.focus) opener.focus(); });
    dlg.showModal();
  }
  /* the menu button (title bar) and More (door sites' bottom bar) open the sheet instead of the slide-in side menu */
  document.addEventListener('click', function (e) {
    if (!phone()) return;
    var b = e.target.closest('[data-side-btn]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (de.classList.contains('side-open')) { de.classList.remove('side-open'); var sh = $('[data-side-shade]'); if (sh) sh.hidden = true; }
    opener = b; menu();
  }, true);
  /* card lists in the page (guides, help topics, the tools that share the data): an icon in front of each card for the phone rows;
     a list that only opens other tools becomes an icon grid. The icons are hidden on wider screens (phonesite.css). */
  function icFor(a) {
    var side = $('#ns-side'), u; try { u = new URL(a.href, location.href); } catch (e) { return 'guide'; }
    if (u.origin !== location.origin) {
      var hit = side && $$('a[href]', side).filter(function (x) { try { return new URL(x.href).origin === u.origin; } catch (e) { return false; } })[0];
      if (hit && hit.getAttribute('data-ic')) return hit.getAttribute('data-ic');
      var k = u.hostname.split('.')[0];
      if (k === 'app') return 'app'; if (k === 'my') return 'set';
      if (side && $('a[data-ic="d-' + k + '"]', side)) return 'd-' + k;
      if (side && $('a[data-ic="t-' + k + '"]', side)) return 't-' + k;
      return 'tool';
    }
    return /\/help\//.test(u.pathname) ? 'info' : 'guide';
  }
  function cards() {
    if (!phone()) return;
    $$('main .cards').forEach(function (c) {
      var links = $$(':scope>a', c); if (!links.length) return;
      var tools = 0;
      links.forEach(function (a) {
        var i = $(':scope>.ps-ci', a), ic;
        if (!i) { ic = icFor(a); i = document.createElement('i'); i.className = 'ps-ci'; i.setAttribute('aria-hidden', 'true'); i.setAttribute('data-ic', ic); a.insertBefore(i, a.firstChild); }
        ic = i.getAttribute('data-ic'); if (/^(d-|t-|app$|set$|tool$)/.test(ic)) tools++;
      });
      c.classList.toggle('ps-tiles', tools === links.length && links.length > 2);
    });
  }
  var cT = 0;
  function watch() { var m = $('main'); if (!m || !window.MutationObserver) return; new MutationObserver(function () { clearTimeout(cT); cT = setTimeout(cards, 120); }).observe(m, { childList: true, subtree: true }); }
  function mark() { de.classList.toggle('ps-on', phone()); if (!phone()) shut(); else cards(); }
  watch();
  if (mq.addEventListener) mq.addEventListener('change', mark);
  mark();
  /* NSApp arrives after this file on door sites: check again once everything has run */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mark); else setTimeout(mark, 0);
  window.addEventListener('load', mark);
  window.NSPhoneSite = { menu: menu, close: shut };
})();
