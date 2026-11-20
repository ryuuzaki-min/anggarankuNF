/** Authentication and short-lived session management. */
function hashPin_(pin) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pin || ''), Utilities.Charset.UTF_8);
  return bytes.map((byte) => {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function seedUsers_() {
  const users = sheetRecords_('Users');
  if (users.length) return { created: false, count: users.length };
  const timestamp = isoNow_();
  appendRecord_('Users', {
    UserID: 'USR-AYAH', Username: 'ayah', DisplayName: 'Ayah', Role: 'AYAH', PinHash: '', Active: 'PENDING', CreatedAt: timestamp, UpdatedAt: timestamp,
  });
  appendRecord_('Users', {
    UserID: 'USR-BUNDA', Username: 'bunda', DisplayName: 'Bunda', Role: 'BUNDA', PinHash: '', Active: 'PENDING', CreatedAt: timestamp, UpdatedAt: timestamp,
  });
  return { created: true, count: 2, message: 'Users Ayah dan Bunda dibuat. Isi PIN melalui setupUsers().' };
}

/** Run once after deciding the two PINs. Example: setupUsers('1234', '5678'). */
function setupUsers(ayahPin, bundaPin) {
  beginRequestCache_();
  ensureSchema_();
  const ayah = String(ayahPin || '').trim();
  const bunda = String(bundaPin || '').trim();
  if (!ayah || !bunda) throw new Error('PIN Ayah dan PIN Bunda wajib diisi.');
  const records = sheetRecords_('Users');
  const timestamp = isoNow_();
  const values = [
    { username: 'ayah', pin: ayah, displayName: 'Ayah', role: 'AYAH', id: 'USR-AYAH' },
    { username: 'bunda', pin: bunda, displayName: 'Bunda', role: 'BUNDA', id: 'USR-BUNDA' },
  ];
  values.forEach((item) => {
    const existing = records.find((record) => String(record.Username).toLowerCase() === item.username);
    const next = {
      UserID: item.id, Username: item.username, DisplayName: item.displayName, Role: item.role,
      PinHash: hashPin_(item.pin), Active: true, CreatedAt: existing ? existing.CreatedAt : timestamp, UpdatedAt: timestamp,
    };
    if (existing) updateRecord_('Users', existing.__rowNumber, next); else appendRecord_('Users', next);
  });
  audit_('Auth', 'Users', 'SETUP_PIN', null, { users: ['ayah', 'bunda'] }, 'PIN disimpan sebagai hash SHA-256.');
  return { success: true, message: 'PIN Ayah dan Bunda berhasil disiapkan.' };
}

function verifyLogin(username, pin) {
  beginRequestCache_();
  ensureSchema_();
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const normalizedPin = String(pin || '').trim();
  if (!normalizedUsername || !normalizedPin) return { success: false, message: 'Username dan PIN wajib diisi.' };

  const attemptKey = 'login-fail:' + normalizedUsername;
  const attemptLimit = 5;
  const cooldownSeconds = 300;
  const attempts = Number(CacheService.getScriptCache().get(attemptKey) || 0);
  if (attempts >= attemptLimit) return { success: false, message: 'Terlalu banyak percobaan login. Coba lagi dalam beberapa menit.' };

  const users = activeRecords_('Users', 'Active');
  const user = users.find((record) => String(record.Username || '').toLowerCase() === normalizedUsername);
  if (!user || String(user.Active).toUpperCase() === 'PENDING' || !user.PinHash) {
    CacheService.getScriptCache().put(attemptKey, String(attempts + 1), cooldownSeconds);
    return { success: false, message: 'User belum dikonfigurasi. Jalankan setupUsers() terlebih dahulu.' };
  }
  if (String(user.PinHash) !== hashPin_(normalizedPin)) {
    CacheService.getScriptCache().put(attemptKey, String(attempts + 1), cooldownSeconds);
    audit_('Auth', user.UserID, 'LOGIN_FAILED', null, { username: normalizedUsername }, 'PIN tidak sesuai.');
    return { success: false, message: 'Username atau PIN tidak sesuai.' };
  }

  CacheService.getScriptCache().remove(attemptKey);
  const token = Utilities.getUuid();
  const session = { userId: user.UserID, username: user.Username, displayName: user.DisplayName, role: user.Role, createdAt: isoNow_(), expiresAt: Date.now() + (APP.sessionSeconds * 1000) };
  putSession_(token, session);
  audit_('Auth', user.UserID, 'LOGIN', null, { username: user.Username }, 'Login berhasil.');
  return { success: true, token: token, user: session };
}

function logout(token) {
  beginRequestCache_();
  const session = session_(token);
  if (session) audit_('Auth', session.userId, 'LOGOUT', null, { username: session.username }, 'Logout.');
  if (token) removeSession_(token);
  return { success: true };
}

function putSession_(token, session) {
  const key = 'session:' + token;
  const payload = JSON.stringify(session);
  CacheService.getScriptCache().put(key, payload, APP.sessionSeconds);
  PropertiesService.getScriptProperties().setProperty(key, payload);
}

function removeSession_(token) {
  const key = 'session:' + token;
  CacheService.getScriptCache().remove(key);
  PropertiesService.getScriptProperties().deleteProperty(key);
}

function session_(token) {
  if (!token) return null;
  const key = 'session:' + token;
  const props = PropertiesService.getScriptProperties();
  const raw = CacheService.getScriptCache().get(key) || props.getProperty(key);
  const session = parseJson_(raw, null);
  if (!session) return null;
  if (session.expiresAt && Date.now() > Number(session.expiresAt)) { removeSession_(token); return null; }
  return session;
}

function requireSession_(token) {
  const session = session_(token);
  if (!session) throw new Error('Sesi berakhir. Silakan login kembali.');
  session.expiresAt = Date.now() + (APP.sessionSeconds * 1000);
  putSession_(token, session);
  return session;
}

function refreshSession(token) {
  beginRequestCache_();
  const session = requireSession_(token);
  putSession_(token, session);
  return { success: true, user: session };
}

function getCurrentUser(token) {
  beginRequestCache_();
  return refreshSession(token).user;
}
