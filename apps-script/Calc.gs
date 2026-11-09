/**
 * Calc.gs — pure scoring logic (no Apps Script services, so it is unit-tested in Node).
 * Mirrors the original Appraisal_form workbook:
 *   quarter total  = SUM of the item scores                  (Excel: =SUM(F2:F20))
 *   annual item    = average of the quarters that were scored (Excel: (Q1+Q2+Q3+Q4)/4)
 *   annual total   = SUM of the annual item scores
 * Difference from Excel (on purpose): an unscored quarter is NOT counted as 0, and an
 * incomplete quarter is flagged instead of silently lowering the total.
 */
const PERIODS = ['Q1', 'Q2', 'Q3', 'Q4'];
const DEFAULT_BANDS = [
  { min: 90, ar: 'ممتاز',        en: 'Outstanding' },
  { min: 80, ar: 'جيد جداً',     en: 'Very good' },
  { min: 70, ar: 'جيد',          en: 'Good' },
  { min: 60, ar: 'مقبول',        en: 'Fair' },
  { min: 0,  ar: 'يحتاج تحسين', en: 'Needs improvement' }
];

function round1_(x) { return Math.round(x * 10) / 10; }
function round2_(x) { return Math.round(x * 100) / 100; }

/** Band index (0 = best) for a percentage; bands sorted by min desc. */
function bandIndex_(pct, bands) {
  bands = (bands && bands.length ? bands : DEFAULT_BANDS).slice().sort(function (a, b) { return b.min - a.min; });
  for (var i = 0; i < bands.length; i++) if (pct >= bands[i].min) return i;
  return bands.length - 1;
}

/**
 * @param criteria  active criteria of the year  [{id, max}]
 * @param empIds    employee ids to compute
 * @param scores    map "Q1|E01|C01" -> number
 * @param bands     rating bands
 * @return {periods:{Q1:{E01:{total,max,n,of,complete,pct,band}}}, annual:{E01:{items:{C01:avg},total,max,n,of,complete,quarters,fullYear,pct,band}}}
 */
function computeYear_(criteria, empIds, scores, bands) {
  var out = { periods: {}, annual: {} };
  var maxAll = criteria.reduce(function (s, c) { return s + Number(c.max); }, 0);
  PERIODS.forEach(function (p) {
    out.periods[p] = {};
    empIds.forEach(function (e) {
      var total = 0, n = 0;
      criteria.forEach(function (c) {
        var v = scores[p + '|' + e + '|' + c.id];
        if (v !== undefined && v !== null && v !== '') { total += Number(v); n++; }
      });
      var complete = n === criteria.length && n > 0;
      var pct = maxAll ? total / maxAll * 100 : 0;
      out.periods[p][e] = { total: round2_(total), max: maxAll, n: n, of: criteria.length, complete: complete,
        pct: round1_(pct), band: complete ? bandIndex_(pct, bands) : -1 };
    });
  });
  empIds.forEach(function (e) {
    var items = {}, total = 0, n = 0, quartersWith = {};
    criteria.forEach(function (c) {
      var sum = 0, k = 0;
      PERIODS.forEach(function (p) {
        var v = scores[p + '|' + e + '|' + c.id];
        if (v !== undefined && v !== null && v !== '') { sum += Number(v); k++; quartersWith[p] = true; }
      });
      if (k) { items[c.id] = round2_(sum / k); total += sum / k; n++; }
    });
    var qs = Object.keys(quartersWith).length;
    var fullYear = PERIODS.every(function (p) { return out.periods[p][e].complete; });
    var complete = n === criteria.length && n > 0;
    var pct = maxAll ? total / maxAll * 100 : 0;
    out.annual[e] = { items: items, total: round2_(total), max: maxAll, n: n, of: criteria.length, complete: complete,
      quarters: qs, fullYear: fullYear, pct: round1_(pct), band: complete ? bandIndex_(pct, bands) : -1 };
  });
  return out;
}

/** Validates one score against a criterion. Returns null when valid, else an error message. */
function validateScore_(value, crit) {
  if (value === null || value === undefined || value === '') return null;
  var v = Number(value);
  if (!isFinite(v)) return 'قيمة غير صالحة';
  if (v < 0 || v > Number(crit.max)) return 'الدرجة يجب أن تكون بين 0 و ' + crit.max;
  if (Math.abs(v * 2 - Math.round(v * 2)) > 1e-9) return 'الدرجة بخطوة 0.5 فقط';
  return null;
}
