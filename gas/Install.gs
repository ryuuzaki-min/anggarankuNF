/** First-run helpers for the spreadsheet owner. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Anggaranku 7.0')
    .addItem('Initialize database sheets', 'installAnggaranku')
    .addItem('Create Drive folders', 'setupDriveFolders')
    .addItem('Set Ayah & Bunda PINs', 'showPinSetupPrompt')
    .addToUi();
}

function installAnggaranku() {
  ensureSchema_();
  seedUsers_();
  seedAssetTypes_();
  seedDefaultSettings_();
  const drive = setupDriveFolders_();
  PropertiesService.getScriptProperties().setProperty('APP_INSTALLED', '1');
  const message = 'Anggaranku 7.0 siap. Sheet database dan folder Drive telah dibuat. Jalankan menu Set Ayah & Bunda PINs untuk menyiapkan login.';
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (error) {
    Logger.log(message);
  }
  return { success: true, drive: drive, message: message };
}

function showPinSetupPrompt() {
  const ui = SpreadsheetApp.getUi();
  const ayah = ui.prompt('PIN Ayah', 'Masukkan PIN untuk user ayah:', ui.ButtonSet.OK_CANCEL);
  if (ayah.getSelectedButton() !== ui.Button.OK) return;
  const bunda = ui.prompt('PIN Bunda', 'Masukkan PIN untuk user bunda:', ui.ButtonSet.OK_CANCEL);
  if (bunda.getSelectedButton() !== ui.Button.OK) return;
  setupUsers(ayah.getResponseText(), bunda.getResponseText());
  try { ui.alert('PIN Ayah dan Bunda berhasil disiapkan.'); } catch (error) { Logger.log('PIN Ayah dan Bunda berhasil disiapkan.'); }
}

function seedAssetTypes_() {
  if (sheetRecords_('AssetTypes').length) return;
  const rows = [
    ['AST-TANAH', 'Tanah', 'TANGIBLE', 'TANAH', 'NONE', 0, '', true, 'Tidak disusutkan.'],
    ['AST-BANGUNAN', 'Bangunan / Rumah Tinggal', 'TANGIBLE', 'RUMAH', 'STRAIGHT_LINE', 0.02, 50, true, ''],
    ['AST-KENDARAAN', 'Kendaraan Keluarga', 'TANGIBLE', 'KENDARAAN', 'STRAIGHT_LINE', 0.20, 5, true, ''],
    ['AST-ELEKTRONIK', 'Elektronik Utama Rumah Tangga', 'TANGIBLE', 'ELEKTRONIK', 'STRAIGHT_LINE', 0.13, 8, true, ''],
    ['AST-GAWAI', 'Gawai & Elektronik Pribadi', 'TANGIBLE', 'GAWAI', 'STRAIGHT_LINE', 0.33, 3, true, ''],
    ['AST-DAPUR', 'Peralatan Dapur', 'TANGIBLE', 'DAPUR', 'STRAIGHT_LINE', 0.20, 5, true, ''],
    ['AST-FURNITUR', 'Furnitur & Perabot Rumah', 'TANGIBLE', 'FURNITUR', 'STRAIGHT_LINE', 0.10, 10, true, ''],
    ['AST-AIR', 'Peralatan Air & Sanitasi', 'TANGIBLE', 'AIR_SANITASI', 'STRAIGHT_LINE', 0.13, 8, true, ''],
    ['AST-ANAK', 'Peralatan Anak', 'TANGIBLE', 'ANAK', 'STRAIGHT_LINE', 0.25, 4, true, ''],
    ['AST-RUMAH', 'Peralatan Penunjang Rumah', 'TANGIBLE', 'PENUNJANG_RUMAH', 'STRAIGHT_LINE', 0.20, 5, true, ''],
    ['AST-MUSIK-INSTRUMEN', 'Peralatan Musik - Instrumen', 'TANGIBLE', 'PENUNJANG_RUMAH', 'STRAIGHT_LINE', 0.10, 10, true, ''],
    ['AST-MUSIK-ELEKTRONIK', 'Peralatan Musik - Elektronik & Audio', 'TANGIBLE', 'PENUNJANG_RUMAH', 'STRAIGHT_LINE', 0.20, 5, true, ''],
    ['AST-MUSIK-AKSESORI', 'Peralatan Musik - Aksesori', 'TANGIBLE', 'PENUNJANG_RUMAH', 'STRAIGHT_LINE', 0.15, 6, true, ''],
    ['AST-AI-MUSIC', 'Aset Tak Berwujud - Lisensi AI Musik', 'INTANGIBLE', 'TAK_BERWUJUD', 'STRAIGHT_LINE', 1, 1, true, ''],
  ];
  rows.forEach((row) => appendRecord_('AssetTypes', { AssetTypeID: row[0], Name: row[1], Class: row[2], ReportingCategory: row[3], DepreciationMethod: row[4], Rate: row[5], UsefulLifeYears: row[6], Active: row[7], Notes: row[8] }));
}

function seedDefaultSettings_() {
  if (sheetRecords_('Settings').length) return;
  const defaults = [
    ['APP_NAME', APP.name, 'Nama aplikasi'],
    ['FAMILY_NAME', APP.familyName, 'Nama keluarga'],
    ['TIME_ZONE', APP.timeZone, 'Zona waktu aplikasi'],
    ['DEFAULT_PERIOD_TYPE', APP.defaultPeriodType, 'Jenis periode default'],
    ['BUDGET_POLICY_FRAMEWORK', 'CONFIGURABLE', 'Persentase budget policy tidak hard-coded'],
    ['AUDIT_DELETE_MODE', 'VOID_ONLY', 'Record tidak dihapus secara fisik'],
  ];
  defaults.forEach((row) => appendRecord_('Settings', { Key: row[0], Value: row[1], Notes: row[2], UpdatedAt: isoNow_() }));
}

/** Import the account list supplied by the family. Safe to run repeatedly: alias or bank-code + number will update, not duplicate. */
function importSuppliedAccounts() {
  ensureSchema_();
  const rows = [
    ['BRI_Ayah', 'BRI', 'Hernawan Rahman Hakim', '002', '744301000773507', 'Income'],
    ['BRI_Bunda', 'BRI', 'Ika Kusumawati', '002', '605701020236535', 'Belanja Pasar'],
    ['BNI_Ayah', 'BNI', 'Hernawan Rahman Hakim', '009', '0358612778', 'Asuransi Pendidikan'],
    ['BTN_Abbas', 'BTN', 'Hernawan Rahman Hakim', '200', '0103901560003651', 'Tabungan Muhammad'],
    ['BTNS_Ayah', 'BTN Syariah', 'Hernawan Rahman Hakim', '200', '7152621191', 'Investasi Fisik'],
    ['Mandiri_Bunda', 'Mandiri', 'Ika Kusumawati', '008', '1320018237702', 'Biaya Utilitas'],
    ['BNI_Raisya', 'BNI', 'Hernawan Rahman Hakim', '009', '1902485052', 'Tabungan Raisya'],
    ['BTN_Ali', 'BTN', 'Husain Ali Nurrahman', '200', '0002601510060350', 'Tabungan Husain'],
    ['BTN_Hasan', 'BTN', 'Idris Hasan Nurrahman', '200', '0002601510060368', 'Tabungan Idris'],
    ['BTN_Rahma', 'BTN', 'Ika Kusumawati', '200', '0010801560005596', 'Tabungan Rahma'],
    ['Permata_RDN', 'Permata', 'Hernawan Rahman Hakim', '013', '09895985128', 'Saham'],
    ['Jago_BibitRDN', 'Stockbit RDN', 'Hernawan Rahman Hakim', '542', '118130178984', 'Reksadana'],
    ['Jago_Ayah', 'Jago', 'Hernawan Rahman Hakim', '542', '108194200584', 'Jajan Ayah'],
    ['Jago_Simpanan', 'Jago', 'Hernawan Rahman Hakim', '542', '101817103533', 'Simpanan Khusus'],
    ['Jago_Otak', 'Jago', 'Hernawan Rahman Hakim', '542', '103185807803', 'Pengembangan Diri'],
    ['Jago_Utama Ayah', 'Jago', 'Hernawan Rahman Hakim', '542', '102266002706', 'Income Bridge 1'],
    ['Jago_Utama Bunda', 'Jago', 'Ika Kusumawati', '542', '502701562394', 'Income Bridge 2'],
    ['Jago_Motor', 'Jago', 'Ika Kusumawati', '542', '506486869113', 'Biaya Kendaraan'],
    ['Jago_Kontrakan', 'Jago', 'Hernawan Rahman Hakim', '542', '109205982911', 'Biaya Kontrakan'],
    ['Jago_Investasi', 'Jago', 'Hernawan Rahman Hakim', '542', '106749927011', 'Investasi Non Fisik'],
    ['Jago_Bunda', 'Jago', 'Ika Kusumawati', '542', '509633142563', 'Jajan Bunda'],
    ['Jago_Iuran', 'Jago', 'Ika Kusumawati', '542', '505520076446', 'Iuran Pool'],
    ['Jago_Jajan', 'Jago', 'Ika Kusumawati', '542', '502919929909', 'Jajan Keluarga'],
    ['Jago_Utilitas', 'Jago', 'Ika Kusumawati', '542', '509018521711', 'Biaya Utilitas'],
    ['Jago_Husain', 'Jago', 'Ika Kusumawati', '542', '506046549476', 'Biaya Husain'],
    ['Jago_Idris', 'Jago', 'Ika Kusumawati', '542', '504430295183', 'Biaya Idris'],
    ['Jago_Abbas', 'Jago', 'Ika Kusumawati', '542', '503629966527', 'Biaya Abbas'],
    ['BNI_Rahma', 'BNI', 'Raisya Rahmawati', '009', '1057928718', ''],
    ['BRI_Mami', 'BRI', 'Endang Riyanti', '002', '605701021905535', ''],
    ['BRI_Ibu', 'BRI', 'Siti Rusmiyati', '002', '671501030621530', ''],
    ['BRI_Dinul', 'BRI', 'Akhmad Nuruddinul Qaiyim', '002', '343401031263536', ''],
    ['BNI_Iuran Kantor', 'BNI', 'Ambar Fitriyani', '009', '0331535305', ''],
    ['Mandiri_Iuran BKS', 'Mandiri', 'Alam Manda Saputra', '008', '1560022154399', ''],
    ['BNI_Iuran BJB', 'BNI', 'Arif Parikesit', '009', '0815759564', ''],
    ['Mandiri_CBE', 'Mandiri', 'Nisa Nomalasari', '008', '1310007808316', ''],
    ['Mandiri_WB', 'Mandiri', 'Nisa Nurarifah', '008', '1320022181557', ''],
    ['BNI_Internet', 'BNI', 'PT. Jaringan Prima Indonesia', '009', '7092020778', ''],
    ['BRI_Iuran pengajian dan PKK', 'BRI', 'Widarto', '002', '018601049468500', ''],
  ];
  const existing = sheetRecords_('Accounts');
  const timestamp = isoNow_();
  let created = 0;
  let updated = 0;
  const imported = [];

  rows.forEach((row) => {
    const input = {
      Name: row[0], Provider: row[1], AccountHolder: row[2], BankCode: row[3], AccountNumber: row[4],
      Purpose: row[5], Type: 'INTERNAL', Status: 'ACTIVE', CreatedBy: 'IMPORT', CreatedAt: timestamp, UpdatedAt: timestamp,
    };
    normalizeAccountPayload_(input);
    const match = existing.find((record) => String(record.Name).trim().toLowerCase() === input.Name.trim().toLowerCase() || (String(record.BankCode) === input.BankCode && String(record.AccountNumber) === input.AccountNumber));
    if (match) {
      const merged = Object.assign({}, match, input, { AccountID: match.AccountID, CreatedAt: match.CreatedAt || timestamp, UpdatedAt: timestamp });
      updateRecord_('Accounts', match.__rowNumber, merged);
      updated += 1;
      imported.push({ alias: input.Name, action: 'UPDATE', accountId: match.AccountID, display: input.AccountDisplay });
    } else {
      input.AccountID = makeId_('ACC');
      appendRecord_('Accounts', input);
      created += 1;
      imported.push({ alias: input.Name, action: 'CREATE', accountId: input.AccountID, display: input.AccountDisplay });
    }
  });

  audit_('Accounts', '', 'IMPORT_SUPPLIED_ACCOUNTS', null, { total: rows.length, created: created, updated: updated }, 'Daftar rekening keluarga diimpor secara idempotent.');
  return { success: true, total: rows.length, created: created, updated: updated, imported: imported };
}

/** Import the confirmed Jan-Aug 2026 income history from the supplied monthly summaries. */
function importIncomeHistoryJanToAug2026() {
  ensureSchema_();
  const accounts = sheetRecords_('Accounts');
  const sourceAccount = accounts.find((account) => String(account.Name || '').trim().toLowerCase() === 'bri_ayah');
  if (!sourceAccount || !sourceAccount.AccountID) throw new Error('Rekening BRI_Ayah belum ditemukan. Jalankan importSuppliedAccounts() terlebih dahulu.');

  const rows = [
    ['2026-01-01', 'Gaji', 3700500], ['2026-01-01', 'Tunjangan Kinerja', 9120000],
    ['2026-02-01', 'Gaji', 3700500], ['2026-02-01', 'Tunjangan Kinerja', 9120000],
    ['2026-03-01', 'Gaji', 3700500], ['2026-03-01', 'Tunjangan Kinerja', 9120000],
    ['2026-04-01', 'Gaji', 3700500], ['2026-04-01', 'Tunjangan Kinerja', 9120000],
    ['2026-05-01', 'Gaji', 3700500], ['2026-05-01', 'Tunjangan Kinerja', 9120000],
    ['2026-06-01', 'Gaji', 3700500], ['2026-06-01', 'Tunjangan Kinerja', 9120000],
    ['2026-07-01', 'Gaji', 3700500], ['2026-07-01', 'Tunjangan Kinerja', 11837600],
    ['2026-08-01', 'Gaji', 3700500], ['2026-08-01', 'Tunjangan Kinerja', 11837600],
  ];
  const existing = sheetRecords_('Income');
  const timestamp = isoNow_();
  let created = 0;
  let updated = 0;
  const imported = [];

  rows.forEach((row) => {
    const input = {
      TransactionDate: row[0], BookDate: row[0], IncomeType: row[1], OperatingIncome: 'YA', Amount: row[2],
      Payer: 'Ayah', AccountID: sourceAccount.AccountID, Description: 'Import historis dari rekap Saldo Penerimaan',
      Status: 'ACTIVE', CreatedBy: 'IMPORT', CreatedAt: timestamp, UpdatedAt: timestamp,
    };
    normalizeIncomePayload_(input);
    const match = existing.find((record) => normalizeDate_(record.TransactionDate) === input.TransactionDate && String(record.IncomeType) === input.IncomeType && String(record.AccountID) === String(input.AccountID));
    if (match) {
      const merged = Object.assign({}, match, input, { IncomeID: match.IncomeID, CreatedAt: match.CreatedAt || timestamp, UpdatedAt: timestamp });
      updateRecord_('Income', match.__rowNumber, merged);
      updated += 1;
      imported.push({ date: input.TransactionDate, type: input.IncomeType, action: 'UPDATE', incomeId: match.IncomeID });
    } else {
      input.IncomeID = makeId_('INC');
      appendRecord_('Income', input);
      created += 1;
      imported.push({ date: input.TransactionDate, type: input.IncomeType, action: 'CREATE', incomeId: input.IncomeID });
    }
  });

  audit_('Income', '', 'IMPORT_INCOME_HISTORY_JAN_AUG_2026', null, { total: rows.length, created: created, updated: updated, sourceAccount: sourceAccount.Name }, 'Riwayat penerimaan Jan-Aug 2026 diimpor secara idempotent.');
  return { success: true, total: rows.length, created: created, updated: updated, sourceAccount: sourceAccount.Name, imported: imported };
}
