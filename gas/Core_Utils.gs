/** Shared spreadsheet, date, ID, and serialization helpers. */
var REQUEST_SHEET_CACHE_ = null;
var REQUEST_DERIVED_CACHE_ = null;

function beginRequestCache_() {
  REQUEST_SHEET_CACHE_ = {};
  REQUEST_DERIVED_CACHE_ = {};
}

function invalidateRequestSheetCache_(sheetName) {
  const key = String(sheetName || '');
  if (REQUEST_SHEET_CACHE_) delete REQUEST_SHEET_CACHE_[key];
  if (REQUEST_DERIVED_CACHE_ && key === 'Income') delete REQUEST_DERIVED_CACHE_.operationalIncome;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(APP.spreadsheetId);
}

function now_() {
  return new Date();
}

function isoNow_() {
  return Utilities.formatDate(now_(), APP.timeZone, "yyyy-MM-dd'T'HH:mm:ss");
}

function todayIso_() {
  return Utilities.formatDate(now_(), APP.timeZone, 'yyyy-MM-dd');
}

function currentPeriod_() {
  return Utilities.formatDate(now_(), APP.timeZone, 'yyyy-MM');
}

function periodKey_(value) {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}(?:-\d{2})?/.test(text)) return text.slice(0, 7);
  return normalizeDate_(value).slice(0, 7);
}

function nextPeriod_(period) {
  const parts = String(period || currentPeriod_()).slice(0, 7).split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]), 1);
  return Utilities.formatDate(date, APP.timeZone, 'yyyy-MM');
}

function allocationWindowOpen_() {
  const current = currentPeriod_();
  const parts = current.split('-');
  const lastDay = new Date(Number(parts[0]), Number(parts[1]), 0);
  const openingDay = new Date(lastDay.getTime() - (4 * 24 * 60 * 60 * 1000));
  const openingDate = Utilities.formatDate(openingDay, APP.timeZone, 'yyyy-MM-dd');
  return todayIso_() >= openingDate;
}

function normalizeDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, APP.timeZone, 'yyyy-MM-dd');
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dmy = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (dmy) return dmy[3] + '-' + String(dmy[2]).padStart(2, '0') + '-' + String(dmy[1]).padStart(2, '0');
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? text : Utilities.formatDate(parsed, APP.timeZone, 'yyyy-MM-dd');
}

function makeId_(prefix) {
  const stamp = Utilities.formatDate(now_(), APP.timeZone, 'yyyyMMddHHmmss');
  const random = Math.floor(Math.random() * 9000 + 1000);
  return prefix + '-' + stamp + '-' + random;
}

function toNumber_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;
  let text = String(value).trim().replace(/Rp/gi, '').replace(/\s/g, '');
  if (text.includes('.') && text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  } else if ((text.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(text)) {
    // Indonesian accounting format: 1.305.000 or 1.305.000,00.
    text = text.replace(/\./g, '');
  }
  const number = Number(text.replace(/[^0-9.-]/g, ''));
  return isFinite(number) ? number : 0;
}

function money_(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(toNumber_(value));
}

function safeJson_(value) {
  try { return JSON.stringify(value == null ? null : value); } catch (error) { return JSON.stringify({ error: String(error) }); }
}

function parseJson_(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function getOrCreateSheet_(sheetName) {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  const headers = SHEET_SCHEMAS[sheetName];
  if (headers && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#d9eaf7');
  } else if (headers && sheet.getLastRow() >= 1) {
    const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getDisplayValues()[0];
    const missingHeaders = headers.filter((header) => !currentHeaders.includes(header));
    if (missingHeaders.length) {
      const startColumn = (sheet.getLastColumn() || 0) + 1;
      sheet.getRange(1, startColumn, 1, missingHeaders.length).setValues([missingHeaders]);
      sheet.getRange(1, startColumn, 1, missingHeaders.length).setFontWeight('bold').setBackground('#d9eaf7');
    }
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureSchema_() {
  Object.keys(SHEET_SCHEMAS).forEach((sheetName) => getOrCreateSheet_(sheetName));
  return { success: true, sheets: Object.keys(SHEET_SCHEMAS) };
}

function sheetRecords_(sheetName) {
  const cacheKey = String(sheetName || '');
  if (REQUEST_SHEET_CACHE_ && Object.prototype.hasOwnProperty.call(REQUEST_SHEET_CACHE_, cacheKey)) {
    return REQUEST_SHEET_CACHE_[cacheKey].map((record) => Object.assign({}, record));
  }
  const sheet = getOrCreateSheet_(sheetName);
  const headers = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map((header) => String(header || '').trim()) : (SHEET_SCHEMAS[sheetName] || []);
  if (sheet.getLastRow() < 2 || !headers.length) { if (REQUEST_SHEET_CACHE_) REQUEST_SHEET_CACHE_[cacheKey] = []; return []; }
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const records = rows.map((row, index) => {
    const record = { __rowNumber: index + 2 };
    headers.forEach((header, columnIndex) => {
      if (!header) return;
      let value = row[columnIndex];
      // Legacy Income sheet may contain one blank header immediately before OperatingIncome.
      // Read the prior cell only when it is an explicit legacy Ya/Tidak value; writes use the real header position.
      if (value === undefined && sheetName === 'Income' && header === 'OperatingIncome' && columnIndex > 0) {
        const legacyValue = row[columnIndex - 1];
        if (['YA', 'TIDAK'].includes(String(legacyValue || '').trim().toUpperCase())) value = legacyValue;
      }
      if (Object.prototype.toString.call(value) === '[object Date]') value = normalizeDate_(value);
      record[header] = value;
    });
    return record;
  }).filter((record) => Object.keys(record).some((key) => key !== '__rowNumber' && record[key] !== '' && record[key] !== null));
  if (REQUEST_SHEET_CACHE_) REQUEST_SHEET_CACHE_[cacheKey] = records;
  return records.map((record) => Object.assign({}, record));
}

function appendRecord_(sheetName, record) {
  invalidateRequestSheetCache_(sheetName);
  const sheet = getOrCreateSheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map((header) => String(header || '').trim());
  const row = headers.map((header) => !header || record[header] === undefined ? '' : record[header]);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  return record;
}

function updateRecord_(sheetName, rowNumber, record) {
  invalidateRequestSheetCache_(sheetName);
  const sheet = getOrCreateSheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map((header) => String(header || '').trim());
  const row = headers.map((header) => !header || record[header] === undefined ? '' : record[header]);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  return record;
}

function writeRecordsBatch_(sheetName, updates, appends) {
  const updateRows = (updates || []).filter((record) => record && Number(record.__rowNumber) > 1).sort((a, b) => Number(a.__rowNumber) - Number(b.__rowNumber));
  const appendRows = appends || [];
  if (!updateRows.length && !appendRows.length) return;
  invalidateRequestSheetCache_(sheetName);
  const sheet = getOrCreateSheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map((header) => String(header || '').trim());
  const valuesFor = (record) => headers.map((header) => !header || record[header] === undefined ? '' : record[header]);
  let start = 0; let group = [];
  const flush = () => { if (group.length) sheet.getRange(start, 1, group.length, headers.length).setValues(group.map(valuesFor)); group = []; };
  updateRows.forEach((record) => { const rowNumber = Number(record.__rowNumber); if (!group.length) start = rowNumber; if (rowNumber !== start + group.length) flush(), start = rowNumber; group.push(record); });
  flush();
  if (appendRows.length) sheet.getRange(sheet.getLastRow() + 1, 1, appendRows.length, headers.length).setValues(appendRows.map(valuesFor));
}

function findRecord_(sheetName, idField, idValue) {
  return sheetRecords_(sheetName).find((record) => String(record[idField]) === String(idValue)) || null;
}

function activeRecords_(sheetName, statusField) {
  return sheetRecords_(sheetName).filter((record) => {
    if (!statusField || record[statusField] === undefined) return true;
    return !['VOID', 'CANCELLED', 'ARCHIVED', 'COMPLETED_ARCHIVED', 'INACTIVE', 'DELETED', 'FALSE', '0'].includes(String(record[statusField]).toUpperCase());
  });
}

function valuesByIds_(sheetName, idField, ids) {
  const wanted = new Set((ids || []).map(String));
  return sheetRecords_(sheetName).filter((record) => wanted.has(String(record[idField])));
}

function publicRecord_(record) {
  const copy = Object.assign({}, record);
  delete copy.__rowNumber;
  delete copy.PinHash;
  return copy;
}

function publicRecords_(records) {
  return (records || []).map(publicRecord_);
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return callback(); } finally { lock.releaseLock(); }
}
