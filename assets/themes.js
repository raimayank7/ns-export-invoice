/* NSBiz look and feel: colour packs, density and text size. On every site (App and the tools) through build.py.
   The choice is three small settings kept like the other screen choices: localStorage ns-pack / ns-dens / ns-tsize, which core.js
   carries into the data home (meta prefs), so it follows the person to their other devices. The head script of every page (build.py)
   sets the same three attributes on <html> before the first paint, so nothing flashes. The colours themselves are in themes.css
   (made by scripts/make_themes.py, contrast checked there). Light / dark stays the person's own choice (the sun button).
   NSTheme.panel(el) draws the picker into any box (My data › Settings, the quick switcher); NSTheme.open() opens the quick switcher.
   English only (App screens). Designed & Developed by: Nivesh Sahayak (https://www.niveshsahayak.in/) */
(function () {
  'use strict';
  var NS = window.NS; if (!NS) return;
  var root = document.documentElement;
  /* swatches: [page, card, text, accent] in light and dark, for the little drawn windows (the real colours are in themes.css) */
  var PACKS = [
    { id: '', name: 'Classic', note: 'Side menu, top menus and a Shortcuts column. The teal and gold look', l: ['#F6F8FB', '#FFFFFF', '#0F1B2A', '#0B3B5B'], d: ['#0B1420', '#111D2B', '#E6EDF5', '#F5A524'] },
    { id: 'blue', name: 'Horizon', note: 'Menus across the top, no side menu, coloured title bar, home as tiles. Calm blue', l: ['#F3F7FD', '#FFFFFF', '#0F1E33', '#1D4ED8'], d: ['#0A1424', '#101D33', '#E8F0FC', '#6EA8FF'] },
    { id: 'earth', name: 'Ledger book', note: 'Serif type, ruled paper lines, an index-style side menu. Warm earth', l: ['#FBF6EE', '#FFFDF9', '#2B2117', '#9A4A1D'], d: ['#1A140E', '#231B13', '#F3E9DA', '#E8A15B'] },
    { id: 'graphite', name: 'Console', note: 'Dense and square, an icon rail instead of the side menu, figures in mono type. Graphite', l: ['#F1F2F4', '#FFFFFF', '#1C1F24', '#2F6F5E'], d: ['#0F1113', '#16191C', '#E4E7EB', '#5DC9A8'] },
    { id: 'contrast', name: 'Clear', note: 'Big text, big buttons and strong lines, one column. High contrast', l: ['#FFFFFF', '#FFFFFF', '#000000', '#000000'], d: ['#000000', '#000000', '#FFFFFF', '#FFE600'] },
    { id: 'rose', name: 'Boutique', note: 'Side menu on the right, soft rounded cards, tile home. Rose', l: ['#FFF5F7', '#FFFFFF', '#3B1020', '#BE185D'], d: ['#1F0A12', '#2A1019', '#FDE8EE', '#F472A6'] },
    { id: 'forest', name: 'Accounts desk', note: 'Boxy grid tables and a green menu bar, like desktop accounting software', l: ['#EEF4EC', '#FFFFFF', '#10241A', '#14532D'], d: ['#0B1A12', '#12251A', '#E6F4EA', '#6EE7A0'] },
    { id: 'ocean', name: 'Studio', note: 'A white sheet on a tinted desk, floating side panel. Ocean teal', l: ['#D9ECF1', '#FFFFFF', '#0B2530', '#0E7490'], d: ['#06171D', '#0D2530', '#E3F4F9', '#5FD0EA'] },
    { id: 'dock', name: 'Launcher', note: 'Big rounded tiles and a dock at the bottom, no side menu. Violet', l: ['#F6F4FF', '#FFFFFF', '#1B1533', '#5B3FD0'], d: ['#120E24', '#1A1533', '#EEEAFC', '#A895FF'] }
  ];
  var DENS = [['', 'Comfortable', 'Roomy rows and buttons'], ['compact', 'Compact', 'More on one screen (computers)']];
  var SIZE = [['', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']];
  var esc = NS.esc || function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
  function known(id) { return PACKS.some(function (p) { return p.id === id; }) ? id : ''; }
  function apply() {
    var p = known(get('ns-pack')), d = get('ns-dens') === 'compact' ? 'compact' : '', s = /^(large|xl)$/.test(get('ns-tsize')) ? get('ns-tsize') : '';
    [['data-pack', p], ['data-dens', d], ['data-tsize', s]].forEach(function (x) { if (x[1]) root.setAttribute(x[0], x[1]); else root.removeAttribute(x[0]); });
  }
  function dark() { var t = root.getAttribute('data-theme'); return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function setTheme(v) {   /* '' = follow the device, light, dark (what the sun button does, kept in the same place) */
    if (v === 'light' || v === 'dark') { root.setAttribute('data-theme', v); put('ns-theme', v); } else { root.removeAttribute('data-theme'); put('ns-theme', ''); }
  }

  /* ---------- the picker ---------- */
  function mini(p) {
    var c = dark() ? p.d : p.l;
    return '<span class="th-mini" aria-hidden="true" style="background:' + c[0] + ';border-color:' + c[2] + '55"><i class="th-bar" style="background:' + c[3] + '"></i><i class="th-card" style="background:' + c[1] + ';border-color:' + c[2] + '33"><b style="background:' + c[2] + '"></b><b style="background:' + c[2] + ';opacity:.45"></b><u style="background:' + c[3] + '"></u></i></span>';
  }
  function radios(name, list, cur, wide) {
    return '<div class="th-row' + (wide ? ' th-wide' : '') + '" role="radiogroup" aria-label="' + esc(name) + '">' + list.map(function (x) {
      var on = x[0] === cur;
      return '<button type="button" role="radio" class="th-opt" aria-checked="' + on + '" data-th-' + name + '="' + esc(x[0]) + '"><span><b>' + esc(x[1]) + '</b>' + (x[2] ? '<small>' + esc(x[2]) + '</small>' : '') + '</span></button>';
    }).join('') + '</div>';
  }
  function html() {
    var cp = known(get('ns-pack')), cd = get('ns-dens') === 'compact' ? 'compact' : '', cs = /^(large|xl)$/.test(get('ns-tsize')) ? get('ns-tsize') : '', ct = root.getAttribute('data-theme') || '';
    return '<div class="th-panel"><h3 class="th-h" id="th-h-pack">Colour pack</h3><div class="th-packs" role="radiogroup" aria-labelledby="th-h-pack">' + PACKS.map(function (p) {
      var on = p.id === cp;
      return '<button type="button" role="radio" class="th-pack" aria-checked="' + on + '" data-th-pack="' + p.id + '">' + mini(p) + '<span><b>' + esc(p.name) + '</b><small>' + esc(p.note) + '</small></span></button>';
    }).join('') + '</div>' +
      '<h3 class="th-h">Light or dark</h3>' + radios('mode', [['', 'Like my device'], ['light', 'Light'], ['dark', 'Dark']], ct) +
      '<h3 class="th-h">Spacing</h3>' + radios('dens', DENS, cd) +
      '<h3 class="th-h">Text size</h3>' + radios('size', SIZE, cs) +
      '<p class="th-note">Every pack has a light and a dark look. Printouts and PDFs always stay paper-like, whatever you choose here. Your choice is kept with your other settings, so it follows you to your other devices.</p></div>';
  }
  function panel(el) {
    if (!el) return;
    el.innerHTML = html();
    if (el._thWired) return; el._thWired = true;
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-th-pack],[data-th-mode],[data-th-dens],[data-th-size]'); if (!b) return;
      if (b.hasAttribute('data-th-pack')) put('ns-pack', b.getAttribute('data-th-pack'));
      else if (b.hasAttribute('data-th-mode')) setTheme(b.getAttribute('data-th-mode'));
      else if (b.hasAttribute('data-th-dens')) put('ns-dens', b.getAttribute('data-th-dens'));
      else put('ns-tsize', b.getAttribute('data-th-size'));
      apply(); redraw(el, b);
    });
  }
  function redraw(el, b) {
    var at = [].slice.call(b.attributes).filter(function (x) { return /^data-th-/.test(x.name); })[0];
    el.innerHTML = html();
    var same = at && el.querySelector('[' + at.name + '="' + at.value + '"]'); if (same) same.focus();
  }
  NS.theme = { panel: panel, apply: apply, packs: PACKS };
  window.NSTheme = { panel: panel, apply: apply, open: open, packs: PACKS };

  /* ---------- the quick switcher (header button, Ctrl K action) ---------- */
  var dlg = null;
  function open() {
    if (!dlg) {
      dlg = NS.el('dialog', { 'class': 'th-dlg', 'aria-labelledby': 'th-dt' });
      dlg.innerHTML = '<div class="dlg-hd"><h2 id="th-dt">Look and feel</h2><button type="button" class="btn sm" data-thx data-noic>Done</button></div><div data-thbox></div>';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-thx]')) dlg.close(); });
    }
    panel(dlg.querySelector('[data-thbox]'));
    if (!dlg.open) dlg.showModal();
  }
  var PAL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.8-.4-1.1-.3-.4-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4c0-4.3-4-8.5-9-8.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>';
  function addBtn() {
    NS.$$('[data-theme-btn]').forEach(function (tb) {
      if (tb.parentNode.querySelector('[data-pack-btn]')) return;
      var b = NS.el('button', { type: 'button', 'class': 'icon-btn', 'data-pack-btn': '', 'aria-label': 'Look and feel: colours, spacing, text size', title: 'Look and feel' });
      b.innerHTML = PAL; b.addEventListener('click', open); tb.insertAdjacentElement('afterend', b);
    });
  }
  /* the data home brought a choice made on another device */
  document.addEventListener('ns-prefs', function () { apply(); if (dlg && dlg.open) panel(dlg.querySelector('[data-thbox]')); });
  window.addEventListener('storage', function (e) { if (/^ns-(pack|dens|tsize|theme)$/.test(e.key || '')) { apply(); } });
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addBtn); else addBtn();
  setTimeout(addBtn, 600);
})();
