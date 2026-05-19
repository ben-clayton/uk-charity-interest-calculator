/*
 * calculator.js — pure calculation functions. No DOM, no fetch.
 *
 * Loadable in the browser (attaches to window.Calc) and in Node
 * (module.exports) so the same code runs in test.html and any future
 * unit tests.
 *
 * Conventions (see spec §5):
 *   - All dates are handled as midnight UTC to avoid DST drift.
 *   - Simple interest on the ORIGINAL principal for every band.
 *   - 365-day year, always (not 365.25, not actual/actual). This matches
 *     the original sheet; do not "fix" it — it would diverge from every
 *     historical calculation the charity has already sent out.
 */
(function (root) {
  'use strict';

  var MS_PER_DAY = 86400000;

  /** Parse an ISO "YYYY-MM-DD" string to a midnight-UTC Date. */
  function parseISODate(s) {
    return new Date(s + 'T00:00:00Z');
  }

  /**
   * Anniversary of death = date of death + 1 calendar year.
   * Built in UTC. JS rolls 29 Feb forward to 1 Mar naturally.
   */
  function anniversaryOf(dod) {
    return new Date(Date.UTC(
      dod.getUTCFullYear() + 1,
      dod.getUTCMonth(),
      dod.getUTCDate()
    ));
  }

  /**
   * Number of days in the intersection of band [start,end] (inclusive)
   * with the accrual window [anniversary, endPaid] (inclusive).
   */
  function daysInBand(band, anniversary, endPaid) {
    var bandStart = parseISODate(band.start);
    var bandEnd = parseISODate(band.end);

    var from = bandStart > anniversary ? bandStart : anniversary;
    var to = bandEnd < endPaid ? bandEnd : endPaid;

    if (to < from) return 0;
    // +1 because both ends are inclusive.
    return Math.round((to - from) / MS_PER_DAY) + 1;
  }

  /** Simple interest contributed by one band. */
  function bandInterest(principal, rate, days) {
    return principal * rate * (days / 365);
  }

  /**
   * Compute the full breakdown.
   *
   * @param {number} principal       initial legacy amount in £
   * @param {Date}   dod             date of death (midnight UTC)
   * @param {Date}   endPaid         date paid (midnight UTC)
   * @param {Array}  bands           rate bands from rates.json
   * @returns {{anniversary:Date, rows:Array, totalInterest:number, totalOwed:number}}
   */
  function compute(principal, dod, endPaid, bands) {
    var anniversary = anniversaryOf(dod);
    var rows = [];
    var totalInterest = 0;

    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var days = daysInBand(b, anniversary, endPaid);
      var interest = bandInterest(principal, b.rate, days);
      totalInterest += interest;
      rows.push({
        rate: b.rate,
        start: b.start,
        end: b.end,
        source: b.source,
        days: days,
        interest: interest,
        cumulativeOwed: principal + totalInterest
      });
    }

    return {
      anniversary: anniversary,
      rows: rows,
      totalInterest: totalInterest,
      // Derived directly — never read off the last table row (spec §8).
      totalOwed: principal + totalInterest
    };
  }

  /**
   * Validate a rates payload. Returns { errors:[], warnings:[] }.
   * Errors are fatal (spec §9); warnings are non-fatal (e.g. placeholder
   * sources on the pre-2022 bands).
   */
  function validateRates(data) {
    var errors = [];
    var warnings = [];

    if (!data || typeof data !== 'object') {
      errors.push('rates.json did not parse to an object.');
      return { errors: errors, warnings: warnings };
    }
    var bands = data.bands;
    if (!Array.isArray(bands) || bands.length === 0) {
      errors.push('rates.json has no "bands" array (or it is empty).');
      return { errors: errors, warnings: warnings };
    }

    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var label = 'band ' + (i + 1) + ' (' + b.start + ' → ' + b.end + ')';

      if (typeof b.rate !== 'number' || b.rate < 0) {
        errors.push(label + ': rate is missing or negative.');
      } else if (b.rate > 0.25) {
        errors.push(label + ': rate ' + (b.rate * 100).toFixed(3) +
          '% exceeds the 25% sanity cap — likely a typo.');
      }

      var s = parseISODate(b.start);
      var e = parseISODate(b.end);
      if (isNaN(s) || isNaN(e)) {
        errors.push(label + ': start or end is not a valid YYYY-MM-DD date.');
        continue;
      }
      if (s > e) {
        errors.push(label + ': start date is after end date.');
      }

      if (!b.source) {
        warnings.push(label + ': no source recorded.');
      } else if (/^TODO/.test(b.source)) {
        warnings.push(label + ': unverified placeholder source "' + b.source + '".');
      } else if (/^PRE_GOVUK/.test(b.source)) {
        warnings.push(label + ': pre-GOV.UK era — rate is from the original ' +
          'spreadsheet, no citable online source (see README).');
      }

      if (i > 0) {
        var prevEnd = parseISODate(bands[i - 1].end);
        var expected = new Date(prevEnd.getTime() + MS_PER_DAY);
        if (s.getTime() !== expected.getTime()) {
          errors.push('Bands ' + i + ' and ' + (i + 1) +
            ' are not contiguous: band ' + i + ' ends ' + bands[i - 1].end +
            ' but band ' + (i + 1) + ' starts ' + b.start +
            ' (expected ' + expected.toISOString().slice(0, 10) + ').');
        }
      }
    }

    return { errors: errors, warnings: warnings };
  }

  var api = {
    parseISODate: parseISODate,
    anniversaryOf: anniversaryOf,
    daysInBand: daysInBand,
    bandInterest: bandInterest,
    compute: compute,
    validateRates: validateRates
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Calc = api;
  }
})(typeof window !== 'undefined' ? window : this);
