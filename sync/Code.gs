/**
 * Aster sync: a small Google Apps Script web app.
 *
 * What it does
 *   GET  ?action=pull&token=...   reads the Checklist tab of each sheet and returns it as JSON
 *   POST {action:'push', ...}     writes tick boxes (columns B to E) and "My notes" (column M)
 *
 * It only ever touches the four tick boxes and the notes cell of a class row, and only
 * after checking that the row still holds the same topic and class name the app expects.
 * Nothing else in your sheets (formulas, links, dashboards, formatting) is changed.
 */

// 1. Choose a long random phrase. Paste the same phrase into Aster, Settings, Access code.
const TOKEN = 'CHANGE-ME-to-a-long-random-phrase';

// 2. Your four spreadsheets (the long ID between /d/ and /edit in each sheet's link).
//    The order does not matter. Subjects are recognised from the title in cell B2.
const SPREADSHEET_IDS = [
  '1HMQ-CDGlpb5jc_GdIh8PDA_FMlIILbE7MuQD-Y92oEQ',
  '1YenAzNFY0JRFMQZCPRofKDESweIsm81pxusAAujqUmI',
  '1WRcBgL0NCB00EcEW7tqg4_sD4NQkXr1Qx58TgfILKxE',
  '1Y0e_3siLevLmJ1zhCNAA-tXr_A7QYava9r_OLSdxyY8',
];

const TAB = 'Checklist';
const FIRST_ROW = 11;      // the first "Day 1" row
const LAST_COL = 14;       // column N
const TICK_ON = '☑';  // ☑
const TICK_OFF = '☐'; // ☐

// ---------------------------------------------------------------- web app entry points

function doGet(e) {
  return respond_(function () {
    const p = (e && e.parameter) || {};
    if (!p.action) return { ok: true, message: 'Aster sync is running. Add ?action=pull&token=... to read your sheets.' };
    checkToken_(p.token);
    if (p.action === 'pull') return { ok: true, subjects: SPREADSHEET_IDS.map(readBook_) };
    throw new Error('Unknown action');
  });
}

function doPost(e) {
  return respond_(function () {
    const body = JSON.parse(e.postData.contents);
    checkToken_(body.token);
    if (body.action !== 'push' || !Array.isArray(body.changes)) throw new Error('Unknown action');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sheets = {};
      const results = body.changes.slice(0, 200).map(function (c) {
        try { return applyChange_(c, sheets); } catch (err) { return { ok: false, error: String(err.message || err) }; }
      });
      SpreadsheetApp.flush();
      return { ok: true, results: results };
    } finally {
      lock.releaseLock();
    }
  });
}

// ---------------------------------------------------------------- reading

function readBook_(id) {
  const ss = SpreadsheetApp.openById(id);
  const sh = ss.getSheetByName(TAB);
  if (!sh) throw new Error('No "' + TAB + '" tab in spreadsheet ' + id);
  const tz = ss.getSpreadsheetTimeZone();
  const title = String(sh.getRange('B2').getValue());
  const m = title.match(/\((\d{4})\)/);
  if (!m) throw new Error('Cell B2 in "' + ss.getName() + '" must contain the subject code in brackets, like (0580)');
  const teacher = String(sh.getRange('B3').getValue()).split('|')[0].trim();

  const n = sh.getLastRow() - FIRST_ROW + 1;
  const classes = [];
  const extras = [];
  if (n > 0) {
    const vals = sh.getRange(FIRST_ROW, 1, n, LAST_COL).getValues();
    const links = sh.getRange(FIRST_ROW, 6, n, 4).getRichTextValues(); // columns F to I
    let day = null;
    let section = 'plan';
    for (let i = 0; i < n; i++) {
      const v = vals[i];
      const b = v[1];
      if (typeof b === 'string' && /^Day\s+\d+/.test(b)) { day = parseInt(b.replace(/\D+/g, ''), 10); continue; }
      if (typeof b === 'string' && b.trim().toLowerCase() === 'not taught yet') { section = 'later'; day = null; continue; }
      if (b === TICK_ON || b === TICK_OFF) {
        classes.push({
          row: FIRST_ROW + i,
          day: section === 'plan' ? day : null,
          date: section === 'plan' ? dateStr_(v[13], tz) : null,
          section: section,
          topic: text_(v[5], tz),
          part: text_(v[6], tz),
          watch: text_(v[7], tz),
          linkText: text_(v[8], tz),
          link: linkOf_(links[i][3]),
          passcode: text_(v[9], tz),
          taught: text_(v[10], tz),
          notes: text_(v[12], tz),
          steps: [v[1] === TICK_ON, v[2] === TICK_ON, v[3] === TICK_ON, v[4] === TICK_ON],
        });
      } else if (v[5]) {
        const url = linkOf_(links[i][0]);
        if (url) extras.push({ title: text_(v[5], tz), url: url });
      }
    }
  }
  return { code: m[1], title: title.trim(), teacher: teacher, sheetUrl: ss.getUrl(), classes: classes, extras: extras };
}

// ---------------------------------------------------------------- writing

function applyChange_(c, sheets) {
  const sh = sheetFor_(String(c.code), sheets);
  const r = Number(c.row);
  if (!(r >= FIRST_ROW) || r > sh.getLastRow()) return { ok: false, error: 'row-out-of-range' };
  const row = sh.getRange(r, 1, 1, LAST_COL).getValues()[0];
  if (row[1] !== TICK_ON && row[1] !== TICK_OFF) return { ok: false, error: 'not-a-class-row' };
  if (String(row[5]).trim() !== String(c.topic).trim() || String(row[6]).trim() !== String(c.part).trim()) {
    return { ok: false, error: 'row-moved' };
  }
  if (c.field === 'steps') {
    if (!Array.isArray(c.value) || c.value.length !== 4) return { ok: false, error: 'bad-value' };
    sh.getRange(r, 2, 1, 4).setValues([c.value.map(function (x) { return x === true ? TICK_ON : TICK_OFF; })]);
    return { ok: true };
  }
  if (c.field === 'notes') {
    sh.getRange(r, 13).setValue(safeText_(String(c.value).slice(0, 5000)));
    return { ok: true };
  }
  return { ok: false, error: 'bad-field' };
}

function sheetFor_(code, cache) {
  if (cache[code]) return cache[code];
  for (let i = 0; i < SPREADSHEET_IDS.length; i++) {
    const sh = SpreadsheetApp.openById(SPREADSHEET_IDS[i]).getSheetByName(TAB);
    const m = sh && String(sh.getRange('B2').getValue()).match(/\((\d{4})\)/);
    if (m && m[1] === code) { cache[code] = sh; return sh; }
  }
  throw new Error('No sheet for subject code ' + code);
}

// ---------------------------------------------------------------- helpers

function checkToken_(t) {
  if (!TOKEN || TOKEN.indexOf('CHANGE-ME') === 0) throw new Error('Set a TOKEN in the script first');
  if (String(t) !== TOKEN) throw new Error('Wrong access code');
}

function respond_(fn) {
  let out;
  try { out = fn(); } catch (err) { out = { ok: false, error: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function text_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'd MMM');
  return v === null || v === undefined ? '' : String(v).trim();
}

function dateStr_(v, tz) {
  return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : null;
}

function linkOf_(rich) {
  if (!rich) return null;
  const whole = rich.getLinkUrl();
  if (whole) return whole;
  const runs = rich.getRuns();
  for (let i = 0; i < runs.length; i++) { const u = runs[i].getLinkUrl(); if (u) return u; }
  return null;
}

// Stop text that starts with = + - @ from being read as a formula.
function safeText_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
