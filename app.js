/*
 * app.js — DOM wiring. Fetches rates.json, validates it, renders the
 * summary + breakdown, and recalculates (debounced) as inputs change.
 *
 * If you fork this, update REPO below so the "Suggest a rate change"
 * button points at your repository's GitHub editor.
 */
(function () {
  'use strict';

  var REPO = 'ben-clayton/uk-charity-interest-calculator';
  var EDIT_BRANCH = 'main';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    amount: $('amount'),
    dod: $('dod'),
    endPaid: $('endPaid'),
    errorBanner: $('error-banner'),
    warnBanner: $('warn-banner'),
    summary: $('summary'),
    breakdown: $('breakdown'),
    breakdownBody: $('breakdown-body'),
    sAmount: $('s-amount'),
    sDod: $('s-dod'),
    sAnniv: $('s-anniv'),
    sEnd: $('s-end'),
    sInterest: $('s-interest'),
    sOwed: $('s-owed'),
    badge: $('verified-badge'),
    editLink: $('edit-rates-link'),
    repoLink: $('repo-link'),
    copyBtn: $('copy-btn'),
    linkBtn: $('link-btn'),
    printBtn: $('print-btn'),
    copyConfirm: $('copy-confirm')
  };

  els.editLink.href = 'https://github.com/' + REPO + '/edit/' + EDIT_BRANCH + '/rates.json';
  els.repoLink.href = 'https://github.com/' + REPO + '#readme';

  var ratesData = null;

  // --- formatting helpers ---------------------------------------------------

  var gbp = new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP',
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });

  function fmtMoney(n) { return gbp.format(n); }

  function fmtDateUTC(d) {
    var dd = String(d.getUTCDate()).padStart(2, '0');
    var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getUTCFullYear();
  }

  function fmtISO(s) {
    var p = s.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function fmtRate(r) { return (r * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '%'; }

  function fmtLongDate(iso) {
    var d = Calc.parseISODate(iso);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
    });
  }

  function daysBetween(isoA, isoB) {
    return Math.round((Calc.parseISODate(isoB) - Calc.parseISODate(isoA)) / 86400000);
  }

  // --- banners --------------------------------------------------------------

  function showBanner(el, title, items) {
    if (!items || !items.length) { el.hidden = true; return; }
    var html = '<strong>' + title + '</strong><ul>';
    for (var i = 0; i < items.length; i++) {
      html += '<li>' + escapeHTML(items[i]) + '</li>';
    }
    el.innerHTML = html + '</ul>';
    el.hidden = false;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fatal(message) {
    els.errorBanner.innerHTML = '<strong>' + escapeHTML(message) + '</strong>';
    els.errorBanner.hidden = false;
    els.summary.hidden = true;
    els.breakdown.hidden = true;
  }

  // --- rate-table freshness badge ------------------------------------------

  function renderBadge(lastVerified) {
    if (!lastVerified || /^REPLACE/.test(lastVerified)) {
      els.badge.textContent = 'Rate table verification date not set in rates.json.';
      els.badge.classList.add('stale');
      return;
    }
    var ageDays = daysBetween(lastVerified, todayISO());
    var pretty = fmtLongDate(lastVerified);
    if (ageDays > 60) {
      els.badge.textContent = 'Rate table last verified ' + pretty +
        ' — please check gov.uk for any newer changes.';
      els.badge.classList.add('stale');
    } else {
      els.badge.textContent = 'Rate table current as of ' + pretty + '.';
      els.badge.classList.remove('stale');
    }
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // --- render ---------------------------------------------------------------

  var lastResult = null;

  function recalc() {
    if (!ratesData) return;

    var amount = parseFloat(els.amount.value);
    var dodVal = els.dod.value;
    var endVal = els.endPaid.value;

    if (isNaN(amount) || amount < 0 || !dodVal || !endVal) {
      els.summary.hidden = true;
      els.breakdown.hidden = true;
      return;
    }

    syncURL();

    var dod = Calc.parseISODate(dodVal);
    var endPaid = Calc.parseISODate(endVal);
    var result = Calc.compute(amount, dod, endPaid, ratesData.bands);
    lastResult = { amount: amount, dod: dod, endPaid: endPaid, result: result };

    els.sAmount.textContent = fmtMoney(amount);
    els.sDod.textContent = fmtDateUTC(dod);
    els.sAnniv.textContent = fmtDateUTC(result.anniversary);
    els.sEnd.textContent = fmtDateUTC(endPaid);
    els.sInterest.textContent = fmtMoney(result.totalInterest);
    els.sOwed.textContent = fmtMoney(result.totalOwed);

    var rowsHTML = '';
    for (var i = 0; i < result.rows.length; i++) {
      var r = result.rows[i];
      var rateCell = r.source && !/^TODO/.test(r.source)
        ? '<a href="' + escapeHTML(r.source) + '" target="_blank" rel="noopener">' + fmtRate(r.rate) + '</a>'
        : fmtRate(r.rate);
      rowsHTML +=
        '<tr class="' + (r.days === 0 ? 'zero' : '') + '">' +
        '<td>' + rateCell + '</td>' +
        '<td>' + fmtISO(r.start) + '</td>' +
        '<td>' + fmtISO(r.end) + '</td>' +
        '<td class="num">' + r.days + '</td>' +
        '<td class="num">' + fmtMoney(r.interest) + '</td>' +
        '<td class="num">' + fmtMoney(r.cumulativeOwed) + '</td>' +
        '</tr>';
    }
    els.breakdownBody.innerHTML = rowsHTML;

    els.summary.hidden = false;
    els.breakdown.hidden = false;
  }

  function plainTextSummary() {
    if (!lastResult) return '';
    var L = lastResult, res = L.result;
    var lines = [];
    lines.push('CHARITY LEGACY INTEREST CALCULATION');
    lines.push('');
    lines.push('Initial amount:       ' + fmtMoney(L.amount));
    lines.push('Date of death:        ' + fmtDateUTC(L.dod));
    lines.push('Anniversary of death: ' + fmtDateUTC(res.anniversary));
    lines.push('End date (paid):      ' + fmtDateUTC(L.endPaid));
    lines.push('Total interest:       ' + fmtMoney(res.totalInterest));
    lines.push('Total owed:           ' + fmtMoney(res.totalOwed));
    lines.push('');
    lines.push('Breakdown by rate band (365-day year, simple interest):');
    lines.push('');
    for (var i = 0; i < res.rows.length; i++) {
      var r = res.rows[i];
      if (r.days === 0) continue;
      lines.push(
        fmtRate(r.rate) + '  ' + fmtISO(r.start) + ' – ' + fmtISO(r.end) +
        '  ' + r.days + ' days  ' + fmtMoney(r.interest) +
        (r.source && !/^TODO/.test(r.source) ? '  [' + r.source + ']' : '')
      );
    }
    lines.push('');
    lines.push(els.badge.textContent);
    return lines.join('\n');
  }

  // --- shareable URL --------------------------------------------------------
  // State lives in the query string as ?amount=3000&dod=2022-07-15&end=2025-02-13
  // so a link captures exactly what's on screen. Dates use ISO YYYY-MM-DD
  // (what <input type=date> uses natively) — unambiguous and sortable.

  var ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

  function applyQueryParams() {
    var q = new URLSearchParams(location.search);

    var amount = q.get('amount');
    if (amount !== null && /^\d+(\.\d+)?$/.test(amount) && parseFloat(amount) >= 0) {
      els.amount.value = amount;
    }
    var dod = q.get('dod');
    if (dod !== null && ISO_RE.test(dod) && !isNaN(Calc.parseISODate(dod))) {
      els.dod.value = dod;
    }
    var end = q.get('end');
    if (end !== null && ISO_RE.test(end) && !isNaN(Calc.parseISODate(end))) {
      els.endPaid.value = end;
    }
  }

  // Reflect the current (valid) inputs into the address bar without adding
  // history entries, so the link is always copy-pasteable mid-edit.
  function syncURL() {
    var params = new URLSearchParams();
    params.set('amount', els.amount.value);
    params.set('dod', els.dod.value);
    params.set('end', els.endPaid.value);
    history.replaceState(null, '', location.pathname + '?' + params.toString());
  }

  // --- debounce -------------------------------------------------------------

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
  var debouncedRecalc = debounce(recalc, 150);

  // --- init -----------------------------------------------------------------

  fetch('./rates.json', { cache: 'no-cache' })
    .then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    })
    .then(function (data) {
      ratesData = data;
      var v = Calc.validateRates(data);
      if (v.errors.length) {
        showBanner(els.errorBanner,
          'rates.json failed validation — calculation disabled to avoid wrong numbers:',
          v.errors);
        els.summary.hidden = true;
        els.breakdown.hidden = true;
        return;
      }
      showBanner(els.warnBanner, 'Rate table notes:', v.warnings);
      renderBadge(data.lastVerified);

      applyQueryParams();

      ['input', 'change'].forEach(function (ev) {
        els.amount.addEventListener(ev, debouncedRecalc);
        els.dod.addEventListener(ev, debouncedRecalc);
        els.endPaid.addEventListener(ev, debouncedRecalc);
      });
      recalc();
    })
    .catch(function (err) {
      fatal('Could not load rates.json (' + err.message +
        '). The calculator cannot run without the rate table.');
    });

  function flashConfirm(msg) {
    els.copyConfirm.textContent = msg;
    els.copyConfirm.hidden = false;
    setTimeout(function () { els.copyConfirm.hidden = true; }, 2000);
  }

  els.copyBtn.addEventListener('click', function () {
    var text = plainTextSummary();
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      flashConfirm('Copied.');
    });
  });

  els.linkBtn.addEventListener('click', function () {
    syncURL();
    navigator.clipboard.writeText(location.href).then(function () {
      flashConfirm('Link copied.');
    });
  });

  els.printBtn.addEventListener('click', function () { window.print(); });
})();
