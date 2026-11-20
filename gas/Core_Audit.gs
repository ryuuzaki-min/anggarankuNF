/** Append-only audit trail. */
function audit_(moduleName, entityId, action, beforeValue, afterValue, notes, session) {
  const current = session || null;
  appendRecord_('AuditLog', {
    LogID: makeId_('LOG'),
    Timestamp: isoNow_(),
    UserID: current ? current.userId : 'SYSTEM',
    Module: moduleName,
    EntityID: entityId || '',
    Action: action,
    BeforeJSON: safeJson_(beforeValue),
    AfterJSON: safeJson_(afterValue),
    Notes: notes || '',
  });
}

function auditForSession_(session, moduleName, entityId, action, beforeValue, afterValue, notes) {
  const normalizedAction = String(action || '').toUpperCase();
  if (['VIEW', 'POLICY_CONTEXT', 'CATALOG_LOAD'].includes(normalizedAction)) return;
  audit_(moduleName, entityId, action, beforeValue, afterValue, notes, session);
}
