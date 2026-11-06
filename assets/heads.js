/* NSHeads (Accounts coverage WP-1): the list of income and expense heads every screen, statement and the Tally export share.
   Records keep storing the head as typed (expense cat, voucher line head, journal line name) and the books keep their account
   keys exp:<name> / inc:<name>, so nothing saved changes; this list only decides where a head shows and what the screens advise.
   Each ready head: id, en (English name, also the printed name), t (type), s3 (Schedule III line in plcore.js: pur, emp, fin, dep,
   oth, drw, oinc), gst (input tax credit: 'ok' claimable, 'blocked' CGST Act s.17(5), 'none' usually no GST, 'rcm' often
   reverse charge (GTA freight, advocate), 'inv' an income that needs our own tax invoice), tds (section of the old Act; the
   Income-tax Act, 2025 puts every one in section 393, shown as "393 (old 194C)"), fa (true: a big one may be a fixed asset).
   Types: 'dexp' direct expense (Trading / Manufacturing account; Tally group Direct Expenses), 'iexp' indirect expense
   (Profit and Loss; Indirect Expenses), 'dinc' direct income (Direct Incomes), 'oinc' other income (Indirect Incomes).
   The App's own expense codes (rent, power, salary, transport, phone, repair, office, fuel, bank, prof, ads, misc) are ids here,
   so sample data and older records saved with a code are found too. Own heads: meta 'heads' = { custom: [{ name, t }] },
   handed in with setCustom(). Pure functions (node tests: scripts/test_heads.js); screen names come from NS.t when present. */
(function (G) {
  'use strict';
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  /* [id, English name, type, Schedule III line, GST, TDS (old section), aliases (other names people type), fixed-asset hint] */
  var L = [
    ['wages', 'Wages', 'dexp', 'emp', 'none', '', 'factory wages|labour charges|majdoori|mazdoori|labour'],
    ['freight_in', 'Freight and cartage inward', 'dexp', 'oth', 'rcm', '194C', 'freight inward|carriage inward|cartage|freight in|cartage inward'],
    ['transport', 'Transport and freight', 'dexp', 'oth', 'rcm', '194C', 'freight|transport|transport charges'],
    ['fuel', 'Fuel', 'dexp', 'oth', 'none', '', 'diesel|petrol|fuel'],
    ['power_f', 'Power and fuel (factory)', 'dexp', 'oth', 'ok', '', 'factory power|factory electricity|power and fuel'],
    ['jobwork', 'Job work charges', 'dexp', 'oth', 'ok', '194C', 'job work|job charges|processing charges'],
    ['loading', 'Loading and unloading', 'dexp', 'oth', 'ok', '194C', 'hammali|loading|unloading'],
    ['packing', 'Packing material', 'dexp', 'oth', 'ok', '', 'packing|packaging'],
    ['consum', 'Consumable stores', 'dexp', 'oth', 'ok', '', 'consumables|stores and spares'],
    ['customs', 'Customs duty on imports', 'dexp', 'oth', 'none', '', 'customs|import duty|custom duty|basic customs duty'],
    ['rent', 'Rent', 'iexp', 'oth', 'ok', '194I', 'rent|shop rent|office rent|godown rent'],
    ['power', 'Electricity', 'iexp', 'oth', 'ok', '', 'electricity|electricity bill|light bill|bijli'],
    ['salary', 'Salary and wages', 'iexp', 'emp', 'none', '192', 'salary|salaries|staff salary'],
    ['bonus', 'Bonus', 'iexp', 'emp', 'none', '192', 'bonus|incentive to staff'],
    ['pfesi', 'Employer\'s PF and ESI', 'iexp', 'emp', 'none', '', 'pf|esi|provident fund|employer pf|employer esi|epf'],
    ['welfare', 'Staff welfare', 'iexp', 'emp', 'blocked', '', 'staff welfare|tea|refreshment|staff food'],
    ['phone', 'Phone and internet', 'iexp', 'oth', 'ok', '', 'telephone|mobile|internet|phone'],
    ['repair', 'Repairs and maintenance', 'iexp', 'oth', 'ok', '194C', 'repair|repairs|maintenance', 1],
    ['office', 'Office expenses', 'iexp', 'oth', 'ok', '', 'office|general expenses'],
    ['print', 'Printing and stationery', 'iexp', 'oth', 'ok', '', 'stationery|printing'],
    ['postage', 'Postage and courier', 'iexp', 'oth', 'ok', '', 'courier|postage|post'],
    ['travel', 'Travelling and conveyance', 'iexp', 'oth', 'ok', '', 'travel|travelling|conveyance|local conveyance'],
    ['vehicle', 'Vehicle running and repairs', 'iexp', 'oth', 'blocked', '', 'car expenses|vehicle expenses|vehicle maintenance|car repair'],
    ['bank', 'Bank charges', 'iexp', 'oth', 'ok', '', 'bank charges|bank fees|bank commission'],
    ['interest', 'Interest on loans', 'iexp', 'fin', 'none', '194A', 'interest|interest paid|loan interest|od interest|cc interest'],
    ['int_tax', 'Interest on late payment of tax', 'iexp', 'fin', 'none', '', 'interest on gst|interest on tds|interest on tax'],
    ['penalty', 'Late fee and penalty', 'iexp', 'oth', 'none', '', 'late fee|penalty|gst late fee|tds late fee'],
    ['prof', 'Professional fees', 'iexp', 'oth', 'ok', '194J', 'professional charges|consultancy|ca fees|accountant fees'],
    ['legal', 'Legal fees (advocate)', 'iexp', 'oth', 'rcm', '194J', 'legal fees|advocate fees|lawyer fees'],
    ['audit', 'Audit fees', 'iexp', 'oth', 'ok', '194J', 'audit|audit fees'],
    ['ads', 'Advertising', 'iexp', 'oth', 'ok', '194C', 'advertisement|advertising|marketing|publicity'],
    ['comm', 'Commission and brokerage paid', 'iexp', 'oth', 'ok', '194H', 'commission|brokerage|commission paid'],
    ['disc_all', 'Discount allowed', 'iexp', 'oth', 'none', '', 'discount allowed|cash discount|discount given'],
    ['bad_debt', 'Bad debts', 'iexp', 'oth', 'none', '', 'bad debts|bad debt|bad debts written off'],
    ['pdd_x', 'Provision for doubtful debts', 'iexp', 'oth', 'none', '', 'provision for bad debts|provision for bad and doubtful debts'],
    ['insure', 'Insurance', 'iexp', 'oth', 'ok', '', 'insurance|insurance premium'],
    ['rates', 'Rates, taxes and licence fees', 'iexp', 'oth', 'none', '', 'rates and taxes|licence fees|municipal tax|property tax|trade licence'],
    ['software', 'Software and subscriptions', 'iexp', 'oth', 'ok', '', 'software|subscription|subscriptions'],
    ['gifts', 'Gifts to customers', 'iexp', 'oth', 'blocked', '', 'gifts|diwali gifts|gift'],
    ['donation', 'Donations', 'iexp', 'oth', 'none', '', 'donation|charity'],
    ['dep', 'Depreciation', 'iexp', 'dep', 'none', '', 'depreciation'],
    ['loss_fa', 'Loss on sale of assets', 'iexp', 'oth', 'none', '', 'loss on sale of assets|loss on sale of fixed assets'],
    ['misc', 'Miscellaneous', 'iexp', 'oth', 'ok', '', 'miscellaneous|misc|sundry expenses|other expenses'],
    ['int_recd', 'Interest received', 'oinc', 'oinc', 'none', '194A', 'interest received|interest income|fd interest|bank interest|savings interest'],
    ['rent_recd', 'Rent received', 'oinc', 'oinc', 'inv', '194I', 'rent received|rental income'],
    ['comm_recd', 'Commission received', 'oinc', 'oinc', 'inv', '194H', 'commission received|commission income|brokerage received'],
    ['div', 'Dividend received', 'oinc', 'oinc', 'none', '194', 'dividend|dividend income'],
    ['disc_recd', 'Discount received', 'oinc', 'oinc', 'none', '', 'discount received|cash discount received'],
    ['scrap', 'Sale of scrap', 'oinc', 'oinc', 'inv', '', 'scrap|scrap sale|kabaad'],
    ['claim', 'Insurance claim received', 'oinc', 'oinc', 'none', '', 'insurance claim|claim received'],
    ['bd_recd', 'Bad debts recovered', 'oinc', 'oinc', 'none', '', 'bad debts recovered|bad debt recovered'],
    ['wback', 'Balances written back', 'oinc', 'oinc', 'none', '', 'sundry balances written back|written back'],
    ['grant', 'Subsidy and grants', 'oinc', 'oinc', 'none', '', 'subsidy|grant|government subsidy'],
    ['job_inc', 'Job work income', 'dinc', 'oinc', 'inv', '194C', 'job work income|job work received|processing income'],
    ['profit_fa', 'Profit on sale of assets', 'oinc', 'oinc', 'none', '', 'profit on sale of assets|profit on sale of fixed assets'],
    ['misc_inc', 'Miscellaneous income', 'oinc', 'oinc', 'none', '', 'other income|miscellaneous income|misc income|sundry income']
  ];
  var HEADS = L.map(function (r) { return { id: r[0], en: r[1], t: r[2], s3: r[3], gst: r[4], tds: r[5], alias: r[6] ? r[6].split('|') : [], fa: !!r[7] }; });
  var BYID = {}; HEADS.forEach(function (h) { BYID[h.id] = h; });
  /* the App's own codes print through app.ex_<code>; every other ready head through hd.<id> */
  var APPCODE = { rent: 1, power: 1, salary: 1, transport: 1, phone: 1, repair: 1, office: 1, fuel: 1, bank: 1, prof: 1, ads: 1, misc: 1 };
  var TYPES = ['dexp', 'iexp', 'oinc', 'dinc'];
  var TALLY = { dexp: 'Direct Expenses', iexp: 'Indirect Expenses', dinc: 'Direct Incomes', oinc: 'Indirect Incomes' };
  var CUSTOM = [], INDEX = null;

  function tr(k) { var NS = G.NS; if (!NS || !NS.t) return ''; var v = NS.t(k); return v && v !== k ? v : ''; }
  function label(h) { if (!h) return ''; if (h.custom) return h.name; return (APPCODE[h.id] ? tr('app.ex_' + h.id) : tr('hd.' + h.id)) || h.en; }
  /* every name a head is known by: id, English name, aliases, the screen-language name and the App's own wording in it */
  function build() {
    INDEX = {};
    function put(k, h) { k = key(k); if (k && !INDEX[k]) INDEX[k] = h; }
    CUSTOM.forEach(function (c) { put(c.name, c); });
    HEADS.forEach(function (h) { put(h.en, h); put(h.id, h); });
    HEADS.forEach(function (h) { put(label(h), h); if (APPCODE[h.id]) { put(tr('app.ex_' + h.id), h); } h.alias.forEach(function (a) { put(a, h); }); });
    if (G.NS && G.NS.EN) HEADS.forEach(function (h) { var e = G.NS.EN[(APPCODE[h.id] ? 'app.ex_' : 'hd.') + h.id]; if (e) put(e, h); });
  }
  if (G.document) G.document.addEventListener('ns-lang', function () { INDEX = null; });   /* names in a newly loaded language */
  function setCustom(list) {
    CUSTOM = (list || []).filter(function (c) { return c && String(c.name || '').trim() && TYPES.indexOf(c.t) >= 0; }).map(function (c) {
      var t = c.t; return { custom: true, id: 'c:' + key(c.name), name: String(c.name).trim(), en: String(c.name).trim(), t: t, s3: t === 'oinc' || t === 'dinc' ? 'oinc' : c.s3 || 'oth', gst: c.gst || 'ok', tds: c.tds || '', alias: [] };
    });
    INDEX = null;
  }
  /* the head of a name (expense category, voucher head, journal name or an account key exp:<name> / inc:<name>), or null */
  function find(name) {
    if (!INDEX) build();
    var k = key(name).replace(/^(exp|inc):/, '');
    return k ? INDEX[k] || null : null;
  }
  function list(types) { var all = HEADS.concat(CUSTOM); return types ? all.filter(function (h) { return types.indexOf(h.t) >= 0; }) : all; }
  function isIncome(h) { return !!h && (h.t === 'oinc' || h.t === 'dinc'); }
  function tallyGroup(h) { return h ? TALLY[h.t] : ''; }
  function tdsLabel(sec) { return sec ? '393 (old ' + sec + ')' : ''; }
  var API = { HEADS: HEADS, TYPES: TYPES, TALLY: TALLY, APPCODE: APPCODE, byId: function (id) { return BYID[id] || null; }, key: key, label: label, find: find, list: list,
    setCustom: setCustom, custom: function () { return CUSTOM.slice(); }, isIncome: isIncome, tallyGroup: tallyGroup, tdsLabel: tdsLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  G.NSHeads = API;
  /* own heads from the data home, on every page that has one (the list is shared by every business) */
  if (G.NSStore && G.NSStore.ready) G.NSStore.ready().then(function () { return G.NSStore.meta('heads'); }).then(function (m) { if (m && m.custom) setCustom(m.custom); }).catch(function () {});
})(typeof window !== 'undefined' ? window : globalThis);
