/** Anggaranku 7.0 — web app controller and MVP service layer. */

const ENTITY_META = {
  accounts: { sheet: 'Accounts', idField: 'AccountID', prefix: 'ACC' },
  income: { sheet: 'Income', idField: 'IncomeID', prefix: 'INC' },
  expenses: { sheet: 'Expenses', idField: 'ExpenseID', prefix: 'EXP' },
  transfers: { sheet: 'Transfers', idField: 'TransferID', prefix: 'TRF' },
  cash: { sheet: 'CashMovements', idField: 'CashID', prefix: 'CASH' },
  goals: { sheet: 'FinancialGoals', idField: 'GoalID', prefix: 'GOAL' },
  budget: { sheet: 'Budgets', idField: 'BudgetID', prefix: 'BUD' },
  inventory: { sheet: 'InventoryItems', idField: 'ItemID', prefix: 'ITEM' },
  shopping: { sheet: 'ShoppingList', idField: 'ShoppingID', prefix: 'SHOP' },
  assets: { sheet: 'Assets', idField: 'AssetID', prefix: 'AST' },
  debts: { sheet: 'Debts', idField: 'DebtID', prefix: 'DEBT' },
  investments: { sheet: 'Investments', idField: 'InvestmentID', prefix: 'INV' },
  savings: { sheet: 'AccountBalances', idField: 'BalanceID', prefix: 'BAL' },
  policy: { sheet: 'BudgetPolicies', idField: 'PolicyID', prefix: 'POL' },
  budgetRule: { sheet: 'BudgetRules', idField: 'RuleID', prefix: 'RULE' },
  budgetCategory: { sheet: 'BudgetCategories', idField: 'CategoryID', prefix: 'CAT' },
};

function doGet() {
  beginRequestCache_();
  const template = HtmlService.createTemplateFromFile('Index');
  template.logoBase64 = getLogoBase64_();
  template.bankCatalog = BANK_CATALOG;
  template.incomeTypes = INCOME_TYPES;
  template.expenseTypes = EXPENSE_TYPES;
  template.paymentMethods = PAYMENT_METHODS;
  template.investmentInstruments = INVESTMENT_INSTRUMENTS;
  template.assetReportingCategories = ASSET_REPORTING_CATEGORIES;
  template.zakatInfaqProviders = ZAKAT_INFAQ_PROVIDERS;
  // Dynamic catalogs are loaded after the first authenticated screen so doGet can render quickly.
  template.activeAccounts = [];
  template.activeBudgets = [];
  template.activeInventory = [];
  template.activeGoals = [];
  template.activePolicyCategories = [];
  template.assetTypes = [];
  return template
    .evaluate()
    .setTitle(APP.name)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function activePolicyForPeriod_(period) {
  const target = String(period || currentPeriod_()).slice(0, 7);
  const periodStart = target + '-01';
  const parts = target.split('-');
  const periodEnd = Utilities.formatDate(new Date(Number(parts[0]), Number(parts[1]), 0), APP.timeZone, 'yyyy-MM-dd');
  return sheetRecords_('BudgetPolicies').filter((policy) => {
    const status = String(policy.Status || '').toUpperCase();
    const from = normalizeDate_(policy.EffectiveFrom);
    const to = normalizeDate_(policy.EffectiveTo);
    return policy.PolicyID && !['VOID', 'DRAFT', 'WAITING_PARTNER_SCORE', 'REVIEW'].includes(status) && from && from <= periodEnd && (!to || to >= periodStart);
  }).sort((a, b) => normalizeDate_(b.EffectiveFrom).localeCompare(normalizeDate_(a.EffectiveFrom)))[0] || null;
}

function budgetPolicyContext_(period) {
  const requestedPeriod = periodKey_(period);
  const target = /^\d{4}-\d{2}$/.test(requestedPeriod) ? requestedPeriod : currentPeriod_();
  const policy = activePolicyForPeriod_(target);
  if (!policy) return { period: target, ready: false, policy: null, categories: [], message: 'Belum ada Kebijakan Anggaran aktif pada periode ini.' };
  const categories = activeRecords_('BudgetCategories', 'Active').filter((row) => String(row.PolicyID || '') === String(policy.PolicyID));
  const goals = activeRecords_('FinancialGoals', 'Status');
  const goalByCategory = {};
  goals.forEach((goal) => { if (goal.BudgetCategoryID) goalByCategory[String(goal.BudgetCategoryID)] = goal; });
  categories.forEach((category) => { if (goalByCategory[String(category.CategoryID || '')]) category.IsGoalCategory = true; });
  const allocations = activeRecords_('BudgetPolicyAllocations').filter((row) => String(row.Active).toUpperCase() !== 'FALSE' && String(row.PolicyID || '') === String(policy.PolicyID) && Number(row.Level || 0) > 0 && row.Amount !== '' && row.Amount !== null).sort((a, b) => periodKey_(b.Period).localeCompare(periodKey_(a.Period)));
  if (!categories.length || !allocations.length) return { period: target, ready: false, policy: { PolicyID: policy.PolicyID, Name: policy.Name }, categories: [], message: 'Alokasi kategori Kebijakan Anggaran belum tersedia untuk periode ini.' };
  const availablePeriods = Array.from(new Set(allocations.map((row) => periodKey_(row.Period)).filter(Boolean))).sort();
  const sourcePeriod = availablePeriods.filter((value) => value <= target).pop() || availablePeriods[0];
  const sourceRows = allocations.filter((row) => periodKey_(row.Period) === sourcePeriod);
  const sourceByCategory = {};
  sourceRows.forEach((row) => { sourceByCategory[String(row.CategoryID || '')] = row; });
  const sourceBasis = toNumber_(sourceRows[0] && sourceRows[0].BasisIncome);
  const targetIncomeRows = activeRecords_('Income', 'Status').filter((row) => normalizeDate_(row.TransactionDate).slice(0, 7) === target);
  const hasTargetIncomeClassification = targetIncomeRows.some((row) => String(row.OperatingIncome || '').trim() !== '');
  const calculatedTargetBasis = monthlyOperationalIncome_(target);
  const targetBasis = calculatedTargetBasis > 0 || hasTargetIncomeClassification ? calculatedTargetBasis : (sourceBasis > 0 ? sourceBasis : calculatedTargetBasis);
  const targetBasisSource = calculatedTargetBasis > 0 || hasTargetIncomeClassification ? 'OPERATIONAL_INCOME' : (sourceBasis > 0 ? 'SAVED_POLICY_BASELINE' : 'OPERATIONAL_INCOME');
  const budgets = latestBudgetRows_(activeRecords_('Budgets', 'Status').filter((row) => periodKey_(row.Period) === target && String(row.PolicyID || '') === String(policy.PolicyID)));
  const childrenByParent = {};
  categories.forEach((category) => { const parent = String(category.ParentCategoryID || ''); if (!childrenByParent[parent]) childrenByParent[parent] = []; childrenByParent[parent].push(category); });
  Object.keys(childrenByParent).forEach((key) => childrenByParent[key].sort((a, b) => toNumber_(a.SortOrder) - toNumber_(b.SortOrder) || String(a.Name || '').localeCompare(String(b.Name || ''), 'id', { numeric: true })));
  const paidByCategory = {};
  const budgetCategoryById = {};
  budgets.forEach((row) => { if (row.BudgetID && row.CategoryID) budgetCategoryById[String(row.BudgetID)] = String(row.CategoryID); });
  activeRecords_('Expenses', 'Status').filter((expense) => String(expense.ExpenseType || '').toUpperCase() === 'EXPENSE' && normalizeDate_(expense.TransactionDate).slice(0, 7) === target).forEach((expense) => {
    const categoryId = String(expense.BudgetCategoryID || budgetCategoryById[String(expense.BudgetID || '')] || '');
    if (categoryId) paidByCategory[categoryId] = (paidByCategory[categoryId] || 0) + toNumber_(expense.Amount);
  });
  const paidMemo = {};
  const aggregatePaid = (categoryId) => {
    const key = String(categoryId || '');
    if (paidMemo[key] !== undefined) return paidMemo[key];
    const total = (paidByCategory[key] || 0) + (childrenByParent[key] || []).reduce((sum, child) => sum + aggregatePaid(child.CategoryID), 0);
    paidMemo[key] = Math.round(total * 100) / 100;
    return paidMemo[key];
  };
  const categoryById = {}; categories.forEach((category) => { categoryById[String(category.CategoryID)] = category; });
  const codeById = {};
  const walk = (parent, prefix) => (childrenByParent[String(parent || '')] || []).forEach((category, index) => { const code = prefix ? prefix + '.' + (index + 1) : String(index + 1); codeById[String(category.CategoryID)] = code; walk(category.CategoryID, code); });
  walk('', '');
  const budgetRowsByCategory = {};
  budgets.forEach((row) => {
    const key = String(row.CategoryID || '');
    if (!key) return;
    const previous = budgetRowsByCategory[key];
    if (!previous || String(row.UpdatedAt || row.CreatedAt || '') > String(previous.UpdatedAt || previous.CreatedAt || '')) budgetRowsByCategory[key] = row;
  });
  const directAllocatedByCategory = {};
  Object.keys(budgetRowsByCategory).forEach((key) => {
    const row = budgetRowsByCategory[key];
    directAllocatedByCategory[key] = row.AllocatedAmount !== undefined && row.AllocatedAmount !== '' ? toNumber_(row.AllocatedAmount) : toNumber_(row.BudgetAmount || row.Amount);
  });
  const aggregateMemo = {};
  const aggregateAllocated = (categoryId) => {
    const key = String(categoryId || '');
    if (aggregateMemo[key] !== undefined) return aggregateMemo[key];
    const children = childrenByParent[key] || [];
    const childTotal = children.reduce((sum, child) => sum + aggregateAllocated(child.CategoryID), 0);
    const direct = directAllocatedByCategory[key] || 0;
    const total = children.length ? (childTotal > 0.001 ? childTotal : direct) : direct;
    aggregateMemo[key] = Math.round(total * 100) / 100;
    return aggregateMemo[key];
  };
  const parentNames = (category) => {
    const names = [category.Name];
    let parentId = String(category.ParentCategoryID || '');
    while (parentId && categoryById[parentId]) { names.unshift(categoryById[parentId].Name); parentId = String(categoryById[parentId].ParentCategoryID || ''); }
    return names;
  };
  const leafCategories = categories.filter((category) => !(childrenByParent[String(category.CategoryID || '')] || []).length);
  const baseLeafAmount = (category) => {
    const source = sourceByCategory[String(category.CategoryID || '')];
    const rawLimit = source ? toNumber_(source.Amount) : 0;
    return sourceBasis > 0 && targetBasis >= 0 ? rawLimit / sourceBasis * targetBasis : rawLimit;
  };
  const goalLeafTotal = leafCategories.reduce((sum, category) => { const goal = goalByCategory[String(category.CategoryID || '')]; return sum + (goal ? Math.max(0, toNumber_(goal.MonthlyContribution)) : 0); }, 0);
  const nonGoalBaseTotal = leafCategories.reduce((sum, category) => goalByCategory[String(category.CategoryID || '')] ? sum : sum + baseLeafAmount(category), 0);
  const goalScale = goalLeafTotal > targetBasis && goalLeafTotal > 0 ? targetBasis / goalLeafTotal : 1;
  const remainingForNonGoals = Math.max(0, targetBasis - Math.min(targetBasis, goalLeafTotal));
  const plannedOwnByCategory = {};
  leafCategories.forEach((category) => {
    const key = String(category.CategoryID || '');
    const goal = goalByCategory[key];
    if (goal) plannedOwnByCategory[key] = Math.max(0, toNumber_(goal.MonthlyContribution)) * goalScale;
    else plannedOwnByCategory[key] = nonGoalBaseTotal > 0 ? baseLeafAmount(category) / nonGoalBaseTotal * remainingForNonGoals : 0;
  });
  categories.forEach((category) => { const key = String(category.CategoryID || ''); if (plannedOwnByCategory[key] === undefined) plannedOwnByCategory[key] = 0; });
  const plannedMemo = {};
  const plannedForCategory = (categoryId) => {
    const key = String(categoryId || '');
    if (plannedMemo[key] !== undefined) return plannedMemo[key];
    const children = childrenByParent[key] || [];
    const own = children.length ? 0 : toNumber_(plannedOwnByCategory[key]);
    const childrenTotal = children.reduce((sum, child) => sum + plannedForCategory(child.CategoryID), 0);
    plannedMemo[key] = Math.round((children.length ? childrenTotal : own) * 100) / 100;
    return plannedMemo[key];
  };
  const plannedLeafRows = leafCategories.map((category) => ({ category: category, amount: plannedForCategory(category.CategoryID) }));
  const plannedLeafTotal = plannedLeafRows.reduce((sum, item) => sum + item.amount, 0);
  const plannedVariance = Math.round((targetBasis - plannedLeafTotal) * 100) / 100;
  if (Math.abs(plannedVariance) > 0 && plannedLeafRows.length) {
    const correction = plannedLeafRows[plannedLeafRows.length - 1];
    plannedOwnByCategory[String(correction.category.CategoryID || '')] = Math.max(0, plannedOwnByCategory[String(correction.category.CategoryID || '')] + plannedVariance);
    plannedMemo[String(correction.category.CategoryID || '')] = Math.round(plannedOwnByCategory[String(correction.category.CategoryID || '')] * 100) / 100;
  }
  const categoryViews = categories.map((category) => {
    const source = sourceByCategory[String(category.CategoryID || '')];
    const goal = goalByCategory[String(category.CategoryID || '')];
    const planned = plannedForCategory(category.CategoryID);
    const children = childrenByParent[String(category.CategoryID)] || [];
    const allocated = aggregateAllocated(category.CategoryID);
    const budgetRow = budgetRowsByCategory[String(category.CategoryID)] || null;
    const plannedPercentage = targetBasis > 0 ? planned / targetBasis * 100 : 0;
    const allocatedPercentage = planned > 0 ? allocated / planned * 100 : 0;
    return {
      CategoryID: category.CategoryID, ParentCategoryID: category.ParentCategoryID || '', Name: category.Name, Path: parentNames(category).join(' · '), Level: toNumber_(category.Level), BudgetCode: codeById[String(category.CategoryID)] || '', IsGoalCategory: Boolean(goal), GoalID: goal ? goal.GoalID : '',
      PlannedAmount: planned, PlannedPercentage: plannedPercentage, LimitAmount: planned,
      AllocatedAmount: allocated, AllocatedPercentage: allocatedPercentage, AllocationVariance: Math.round((allocated - planned) * 100) / 100, OverAllocationPercentage: planned > 0 ? Math.max(0, (allocated - planned) / planned * 100) : 0, AllocationStatus: allocated > planned + 0.001 ? 'OVER_ALLOCATED' : (allocated < planned - 0.001 ? 'UNDER_ALLOCATED' : 'ALIGNED'), UsedAmount: aggregatePaid(category.CategoryID), PaidAmount: aggregatePaid(category.CategoryID), PaidPercentage: planned > 0 ? aggregatePaid(category.CategoryID) / planned * 100 : 0, RemainingAmount: Math.max(0, planned - allocated),
      HasChildren: Boolean(children.length), IsLeaf: !children.length, AllocationSaved: Boolean(budgetRow), BudgetID: budgetRow ? budgetRow.BudgetID : '', PaymentMethod: budgetRow ? budgetRow.PaymentMethod || '' : '', AllocationMethod: budgetRow ? budgetRow.AllocationMethod || (String(budgetRow.PaymentMethod || '').toUpperCase() === 'CASH' ? 'CASH' : (budgetRow.PaymentMethod ? 'TRANSFER' : '')) : '', SourceAccountID: budgetRow ? budgetRow.SourceAccountID || '' : '', DestinationAccountID: budgetRow ? budgetRow.DestinationAccountID || '' : '', DestinationAccountName: budgetRow ? budgetRow.DestinationAccountName || budgetRow.DestinationAccountID || '' : '', AllocationDate: budgetRow ? budgetRow.AllocationDate || budgetRow.UpdatedAt || '' : '',
    };
  });
  const reconciledPlannedTotal = categoryViews.filter((row) => row.IsLeaf).reduce((sum, row) => sum + toNumber_(row.PlannedAmount), 0);
  return { period: target, ready: true, policy: { PolicyID: policy.PolicyID, Name: policy.Name }, basisIncome: targetBasis, basisIncomeSource: targetBasisSource, sourceAllocationPeriod: sourcePeriod, plannedTotal: Math.round(reconciledPlannedTotal * 100) / 100, plannedVariance: Math.round((targetBasis - reconciledPlannedTotal) * 100) / 100, goalContributionRequested: Math.round(goalLeafTotal * 100) / 100, categories: categoryViews };
}

function getBudgetPolicyContext(token, period) {
  beginRequestCache_();
  const session = requireSession_(token);
  const context = budgetPolicyContext_(period);
  auditForSession_(session, 'budget', String(period || currentPeriod_()).slice(0, 7), 'POLICY_CONTEXT', null, context, 'Budget policy context viewed.');
  return context;
}

function getBudgetModuleData_(session, requestedPeriod) {
  const budgets = activeRecords_('Budgets', 'Status');
  const expenses = activeRecords_('Expenses', 'Status');
  const current = currentPeriod_();
  const requested = periodKey_(requestedPeriod);
  const targetPeriod = /^\d{4}-\d{2}$/.test(requested) ? requested : current;
  const budgetsForPeriod = latestBudgetRows_(budgets.filter((row) => periodKey_(row.Period) === targetPeriod));
  const currentYear = Number(current.slice(0, 4));
  const currentMonth = Number(current.slice(5, 7));
  const visiblePeriods = Array.from({ length: Math.max(1, currentMonth) }, (_, index) => currentYear + '-' + String(index + 1).padStart(2, '0')).concat(budgets.map((row) => periodKey_(row.Period)).filter(Boolean));
  if (allocationWindowOpen_()) visiblePeriods.push(nextPeriod_(current));
  const periods = Array.from(new Set(visiblePeriods)).sort();
  const context = budgetPolicyContext_(targetPeriod);
  const directBudgetByCategory = {};
  budgetsForPeriod.forEach((row) => { const key = String(row.CategoryID || ''); if (!key) return; const previous = directBudgetByCategory[key]; if (!previous || String(row.UpdatedAt || row.CreatedAt || '') > String(previous.UpdatedAt || previous.CreatedAt || '')) directBudgetByCategory[key] = row; });
  const paidByBudgetId = {};
  const budgetCategoryById = {};
  budgetsForPeriod.forEach((row) => { if (row.BudgetID && row.CategoryID) budgetCategoryById[String(row.BudgetID)] = String(row.CategoryID); });
  expenses.filter((expense) => String(expense.ExpenseType || '').toUpperCase() === 'EXPENSE').forEach((expense) => { const key = String(expense.BudgetID || ''); if (key) paidByBudgetId[key] = (paidByBudgetId[key] || 0) + toNumber_(expense.Amount); });
  const paidByCategory = {};
  expenses.filter((expense) => String(expense.ExpenseType || '').toUpperCase() === 'EXPENSE' && normalizeDate_(expense.TransactionDate).slice(0, 7) === targetPeriod).forEach((expense) => { const key = String(expense.BudgetCategoryID || budgetCategoryById[String(expense.BudgetID || '')] || ''); if (key) paidByCategory[key] = (paidByCategory[key] || 0) + toNumber_(expense.Amount); });
  const childrenByParent = {};
  (context.categories || []).forEach((row) => { const parent = String(row.ParentCategoryID || ''); if (!childrenByParent[parent]) childrenByParent[parent] = []; childrenByParent[parent].push(row); });
  const paidMemo = {};
  const aggregatePaid = (categoryId) => {
    const key = String(categoryId || '');
    if (paidMemo[key] !== undefined) return paidMemo[key];
    const total = (paidByCategory[key] || 0) + (childrenByParent[key] || []).reduce((sum, child) => sum + aggregatePaid(child.CategoryID), 0);
    paidMemo[key] = Math.round(total * 100) / 100;
    return paidMemo[key];
  };
  const rows = (context.categories || []).map((category) => {
    const paid = aggregatePaid(category.CategoryID);
    const directBudget = directBudgetByCategory[String(category.CategoryID || '')] || null;
    return Object.assign({}, category, {
      BudgetID: directBudget ? directBudget.BudgetID : '', Period: context.period, PolicyID: context.policy && context.policy.PolicyID || '', Category: category.Path ? category.Path.split(' · ')[0] : category.Name, Item: category.Path ? category.Path.split(' · ').slice(1).join(' · ') : '',
      BudgetAmount: category.PlannedAmount, BudgetPercentage: category.PlannedPercentage, PlannedAmount: category.PlannedAmount, PlannedPercentage: category.PlannedPercentage,
      AllocatedAmount: category.AllocatedAmount, AllocatedPercentage: category.AllocatedPercentage, AllocationDate: category.AllocationDate || '', OverAllocationReason: directBudget ? directBudget.OverAllocationReason || '' : '',
      PaidAmount: paid, PaidPercentage: category.PlannedAmount ? paid / category.PlannedAmount * 100 : 0,
      PaymentMethod: category.PaymentMethod || '', DestinationAccountID: category.DestinationAccountID || '', DestinationAccountName: category.DestinationAccountName || '', Status: 'ACTIVE',
      SourceType: 'POLICY', SourceID: context.policy && context.policy.PolicyID || '', BudgetType: 'FIXED', Constraint: 'MAX', Notes: directBudget ? directBudget.Notes || '' : '',
    });
  });
  const leafRows = rows.filter((row) => row.IsLeaf);
  const totalPlanned = leafRows.reduce((sum, row) => sum + toNumber_(row.PlannedAmount), 0);
  const totalAllocated = rows.filter((row) => Number(row.Level) === 0).reduce((sum, row) => sum + toNumber_(row.AllocatedAmount), 0);
  const totalPaid = rows.filter((row) => Number(row.Level) === 0).reduce((sum, row) => sum + toNumber_(row.PaidAmount), 0);
  rows.push({ BudgetID: '__TOTAL__', Period: context.period, PolicyID: context.policy && context.policy.PolicyID || '', CategoryID: '', Category: 'Total', Item: '', BudgetCode: '', ParentBudgetID: '', Level: 0, IsLeaf: false, HasChildren: false, PlannedAmount: totalPlanned, PlannedPercentage: context.basisIncome ? totalPlanned / context.basisIncome * 100 : 0, BudgetAmount: totalPlanned, BudgetPercentage: context.basisIncome ? totalPlanned / context.basisIncome * 100 : 0, AllocatedAmount: totalAllocated, AllocatedPercentage: totalPlanned ? totalAllocated / totalPlanned * 100 : 0, PaidAmount: totalPaid, PaidPercentage: totalPlanned ? totalPaid / totalPlanned * 100 : 0, DestinationAccountID: '', DestinationAccountName: '', Status: 'TOTAL' });
  auditForSession_(session, 'budget', '', 'VIEW', null, { count: rows.length - 1, periods: periods, policy: context.policy && context.policy.PolicyID || '' }, 'Policy-derived budget hierarchy viewed.');
  return { module: 'budget', label: MODULE_CONFIG.budget.label, columns: ['Period', 'BudgetCode', 'Category', 'Item', 'PlannedPercentage', 'PlannedAmount', 'AllocatedPercentage', 'AllocatedAmount', 'PaidPercentage', 'PaidAmount'], rows: publicRecords_(rows), periods: periods, selectedPeriod: targetPeriod, policyContext: context };
}

function getBudgetPolicyData_(session) {
  const policies = sheetRecords_('BudgetPolicies').filter((row) => row.PolicyID).sort((a, b) => String(b.EffectiveFrom || '').localeCompare(String(a.EffectiveFrom || '')));
  const rules = activeRecords_('BudgetRules', 'Status').sort((a, b) => toNumber_(a.SortOrder) - toNumber_(b.SortOrder));
  const categories = activeRecords_('BudgetCategories', 'Active').sort((a, b) => toNumber_(a.SortOrder) - toNumber_(b.SortOrder));
  const policyMap = {};
  policies.forEach((policy) => { policyMap[policy.PolicyID] = policy; });
  const projected = policies.map((policy) => policyView_(policy, session));
  const categoryViews = categories.map((category) => policyCategoryView_(category, policyMap[category.PolicyID], session));
  auditForSession_(session, 'policy', '', 'VIEW', null, { policies: policies.length, rules: rules.length, categories: categories.length }, 'Kebijakan Anggaran viewed.');
  const allocationSummary = {};
  const activeContext = budgetPolicyContext_(currentPeriod_());
  projected.forEach((policy) => {
    const summary = policy.ScoresComplete ? policyAllocationView_(policy.PolicyID, currentPeriod_()) : { PolicyID: policy.PolicyID, Ready: false, Period: currentPeriod_(), BasisIncome: monthlyOperationalIncome_(currentPeriod_()), Weights: {}, Amounts: {}, TotalWeight: 0 };
    if (activeContext.policy && String(activeContext.policy.PolicyID) === String(policy.PolicyID)) Object.assign(summary, { PlannedTotal: activeContext.plannedTotal || 0, PlannedVariance: activeContext.plannedVariance || 0, GoalContributionRequested: activeContext.goalContributionRequested || 0 });
    allocationSummary[policy.PolicyID] = summary;
  });
  const categoryAllocations = sheetRecords_('BudgetPolicyAllocations').filter((row) => row.PolicyID && String(row.Active).toUpperCase() !== 'FALSE').sort((a, b) => String(a.PolicyID).localeCompare(String(b.PolicyID)) || toNumber_(a.Level) - toNumber_(b.Level));
  return { module: 'policy', label: MODULE_CONFIG.policy.label, policies: projected, rules: publicRecords_(rules), categories: categoryViews, allocations: allocationSummary, categoryAllocations: publicRecords_(categoryAllocations), allocationBasisPeriod: currentPeriod_(), allocationBasisIncome: monthlyOperationalIncome_(currentPeriod_()), columns: SHEET_SCHEMAS.BudgetPolicies, rows: projected };
}

function quadrantKeys_() {
  return ['PENTING_MENDESAK', 'PENTING_TIDAK_MENDESAK', 'TIDAK_PENTING_MENDESAK', 'TIDAK_PENTING_TIDAK_MENDESAK'];
}

function monthlyOperationalIncome_(period) {
  const requestedPeriod = periodKey_(period);
  const target = /^\d{4}-\d{2}$/.test(requestedPeriod) ? requestedPeriod : currentPeriod_();
  if (REQUEST_DERIVED_CACHE_ && REQUEST_DERIVED_CACHE_.operationalIncome && REQUEST_DERIVED_CACHE_.operationalIncome[target] !== undefined) return REQUEST_DERIVED_CACHE_.operationalIncome[target];
  const total = activeRecords_('Income', 'Status').filter((row) => String(row.OperatingIncome || '').toUpperCase() === 'YA' && normalizeDate_(row.TransactionDate).slice(0, 7) === target).reduce((sum, row) => sum + toNumber_(row.Amount), 0);
  if (REQUEST_DERIVED_CACHE_) { if (!REQUEST_DERIVED_CACHE_.operationalIncome) REQUEST_DERIVED_CACHE_.operationalIncome = {}; REQUEST_DERIVED_CACHE_.operationalIncome[target] = total; }
  return total;
}

function policyAllocationView_(policyId, period) {
  const requestedPeriod = periodKey_(period);
  const targetPeriod = /^\d{4}-\d{2}$/.test(requestedPeriod) ? requestedPeriod : currentPeriod_();
  const keys = quadrantKeys_();
  const allRows = sheetRecords_('BudgetPolicyAllocations').filter((row) => String(row.PolicyID || '') === String(policyId) && String(row.Level || 0) === '0' && periodKey_(row.Period));
  const byPeriod = {};
  allRows.forEach((row) => { const sourcePeriod = periodKey_(row.Period); const quadrant = String(row.Quadrant || row.CategoryID || ''); if (!sourcePeriod || !keys.includes(quadrant)) return; if (!byPeriod[sourcePeriod]) byPeriod[sourcePeriod] = {}; byPeriod[sourcePeriod][quadrant] = row; });
  const completePeriods = Object.keys(byPeriod).filter((value) => keys.every((key) => byPeriod[value][key])).sort();
  const savedPeriod = completePeriods.filter((value) => value <= targetPeriod).pop() || completePeriods[completePeriods.length - 1] || '';
  const rows = savedPeriod ? keys.map((key) => byPeriod[savedPeriod][key]) : [];
  const targetIncomeRows = activeRecords_('Income', 'Status').filter((row) => normalizeDate_(row.TransactionDate).slice(0, 7) === targetPeriod);
  const hasTargetIncomeClassification = targetIncomeRows.some((row) => String(row.OperatingIncome || '').trim() !== '');
  const calculatedBasisIncome = monthlyOperationalIncome_(targetPeriod);
  const storedBasisIncome = toNumber_(rows[0] && rows[0].BasisIncome);
  const basisIncome = calculatedBasisIncome > 0 || hasTargetIncomeClassification ? calculatedBasisIncome : (storedBasisIncome > 0 ? storedBasisIncome : calculatedBasisIncome);
  const basisIncomeSource = calculatedBasisIncome > 0 || hasTargetIncomeClassification ? 'OPERATIONAL_INCOME' : (storedBasisIncome > 0 ? 'SAVED_POLICY_BASELINE' : 'OPERATIONAL_INCOME');
  const weights = {};
  keys.forEach((key) => { weights[key] = 0; });
  rows.forEach((row) => { weights[String(row.Quadrant || row.CategoryID)] = toNumber_(row.WeightPct); });
  const total = keys.reduce((sum, key) => sum + weights[key], 0);
  if (rows.length === keys.length && Math.abs(total - 100) > 0.001) keys.forEach((key) => { weights[key] = weights[key] * 100 / (total || 100); });
  const amounts = {};
  keys.forEach((key) => { amounts[key] = Math.round(basisIncome * weights[key] / 100 * 100) / 100; });
  return { PolicyID: policyId, Period: targetPeriod, SavedPeriod: savedPeriod, BasisIncome: basisIncome, BasisIncomeSource: basisIncomeSource, Ready: rows.length === keys.length, Weights: weights, Amounts: amounts, TotalWeight: keys.reduce((sum, key) => sum + weights[key], 0) };
}

function savePolicyAllocations(token, payload) {
  beginRequestCache_();
  const session = requireSession_(token);
  const input = payload || {};
  const policyId = String(input.PolicyID || '').trim();
  const requestedPeriod = periodKey_(input.Period);
  const period = /^\d{4}-\d{2}$/.test(requestedPeriod) ? requestedPeriod : currentPeriod_();
  const policy = findRecord_('BudgetPolicies', 'PolicyID', policyId);
  if (!policy) throw new Error('Kebijakan Anggaran tidak ditemukan.');
  const policyStatus = String(policy.Status || '').toUpperCase();
  const role = String(session.role || '').toUpperCase();
  if (!['DRAFT', 'REVIEW'].includes(policyStatus)) throw new Error('Alokasi hanya dapat diubah pada Draft atau Review Bersama.');
  if (policyStatus === 'REVIEW' && role !== 'AYAH') throw new Error('Setelah Bunda mengajukan penilaian, hanya Ayah yang menetapkan proporsi empat kuadran.');
  if (policyStatus === 'DRAFT' && (String(policy.CreatedBy || '') !== String(session.userId || '') || policy.SubmittedAt)) throw new Error('Hanya pembuat Draft yang belum diajukan dapat mengubah alokasi.');
  const weights = input.Weights || input.weights || {};
  const keys = quadrantKeys_();
  const values = keys.map((key) => toNumber_(weights[key]));
  if (values.some((value) => value < 0 || value > 100)) throw new Error('Setiap proporsi kuadran harus berada di antara 0% dan 100%.');
  const total = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 100) > 0.001) throw new Error('Total proporsi empat kuadran harus tepat 100%.');
  const calculatedBasisIncome = monthlyOperationalIncome_(period);
  const previousAllocation = policyAllocationView_(policyId, period);
  const basisIncome = calculatedBasisIncome > 0 ? calculatedBasisIncome : toNumber_(previousAllocation.BasisIncome);
  const now = isoNow_();
  const existingBefore = sheetRecords_('BudgetPolicyAllocations');
  const allocationByKey = {};
    existingBefore.forEach((row) => { const key = String(row.PolicyID || '') + '|' + String(row.Quadrant || row.CategoryID || '') + '|' + String(row.Level || 0) + '|' + periodKey_(row.Period); allocationByKey[key] = row; });
  const allocationsChanged = keys.some((key, index) => { const found = allocationByKey[policyId + '|' + key + '|0|' + period]; return !found || Math.abs(toNumber_(found.WeightPct) - values[index]) > 0.001; });
  const policyUpdate = Object.assign({}, policy);
  if (policyStatus === 'REVIEW') {
    if (allocationsChanged) { policyUpdate.ConfirmedAyahAt = ''; policyUpdate.ConfirmedBundaAt = ''; policyUpdate.FinalApprovedAt = ''; }
    policyUpdate.Status = 'APPROVED_AND_LOCKED';
    policyUpdate.ApprovedAyahAt = policyUpdate.ApprovedAyahAt || now;
    policyUpdate.FinalApprovedAt = policyUpdate.FinalApprovedAt || now;
    policyUpdate.LockedAt = policyUpdate.LockedAt || now;
    policyUpdate.UpdatedAt = now;
  }
  withLock_(() => {
    const allocationUpdates = [];
    const allocationAppends = [];
    keys.forEach((key, index) => {
      const found = allocationByKey[policyId + '|' + key + '|0|' + period];
      const record = Object.assign({}, found || {}, { AllocationID: found ? found.AllocationID : makeId_('ALLOC'), PolicyID: policyId, CategoryID: key, Quadrant: key, ParentAllocationID: '', Level: 0, WeightPct: values[index], Amount: Math.round(basisIncome * values[index] / 100 * 100) / 100, BasisIncome: basisIncome, Period: period, Active: true, CreatedAt: found ? found.CreatedAt : now, UpdatedAt: now });
      if (found) allocationUpdates.push(record); else allocationAppends.push(record);
    });
    writeRecordsBatch_('BudgetPolicyAllocations', allocationUpdates, allocationAppends);
    rebuildCategoryAllocations_(policyId, period);
    if (policyStatus === 'REVIEW') {
      if (policyUpdate.AmendmentOfPolicyID) {
        const oldPolicy = findRecord_('BudgetPolicies', 'PolicyID', policyUpdate.AmendmentOfPolicyID);
        if (!oldPolicy || !['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED', 'AMENDMENT'].includes(String(oldPolicy.Status || '').toUpperCase())) throw new Error('Kebijakan lama untuk Amendment tidak lagi berstatus aktif.');
        oldPolicy.Status = 'VOID'; oldPolicy.VoidedBy = session.userId; oldPolicy.VoidedAt = now; oldPolicy.ReplacedByPolicyID = policyUpdate.PolicyID; oldPolicy.UpdatedAt = now;
        updateRecord_('BudgetPolicies', oldPolicy.__rowNumber, oldPolicy);
        policyUpdate.ReplacesPolicyID = oldPolicy.PolicyID;
      }
      updateRecord_('BudgetPolicies', policyUpdate.__rowNumber, policyUpdate);
    }
  });
  auditForSession_(session, 'policy', policyId, policyStatus === 'REVIEW' ? 'APPROVED_AND_LOCKED' : 'ALLOCATE', null, policyAllocationView_(policyId, period), policyStatus === 'REVIEW' ? 'Ayah menetapkan proporsi; kebijakan Approved & Locked.' : 'Alokasi kuadran diperbarui.');
  return { success: true, allocation: policyAllocationView_(policyId, period) };
}

function rebuildCategoryAllocations_(policyId, period) {
  const requestedPeriod = periodKey_(period);
  const targetPeriod = /^\d{4}-\d{2}$/.test(requestedPeriod) ? requestedPeriod : currentPeriod_();
  const policyAllocation = policyAllocationView_(policyId, targetPeriod);
  const categories = activeRecords_('BudgetCategories', 'Active').filter((row) => String(row.PolicyID || '') === String(policyId));
  const now = isoNow_();
  const existing = sheetRecords_('BudgetPolicyAllocations');
  const existingByKey = {};
  existing.forEach((row) => { const key = String(row.PolicyID || '') + '|' + String(row.CategoryID || '') + '|' + periodKey_(row.Period) + '|' + String(row.Level || 0); existingByKey[key] = row; });
  const activeCategoryIds = new Set(categories.map((category) => String(category.CategoryID)));
  const updates = [];
  const appends = [];
  existing.filter((row) => String(row.PolicyID || '') === String(policyId) && periodKey_(row.Period) === targetPeriod && Number(row.Level || 0) > 0 && !activeCategoryIds.has(String(row.CategoryID || '')) && String(row.Active).toUpperCase() !== 'FALSE').forEach((row) => { updates.push(Object.assign({}, row, { Active: false, UpdatedAt: now })); });
  const upsert = (category, parentAllocationId, quadrant, siblingCount, parentAmount) => {
    const share = siblingCount ? 100 / siblingCount : 0;
    const amount = parentAmount * share / 100;
    const key = String(policyId) + '|' + String(category.CategoryID || '') + '|' + targetPeriod + '|' + String(category.Level || 0);
    const found = existingByKey[key];
    const record = Object.assign({}, found || {}, { AllocationID: found ? found.AllocationID : makeId_('ALLOC'), PolicyID: policyId, CategoryID: category.CategoryID, Quadrant: quadrant, ParentAllocationID: parentAllocationId, Level: category.Level || 0, WeightPct: share, Amount: Math.round(amount * 100) / 100, BasisIncome: policyAllocation.BasisIncome, Period: targetPeriod, Active: true, CreatedAt: found ? found.CreatedAt : now, UpdatedAt: now });
    if (found) updates.push(record); else appends.push(record);
    const children = categories.filter((row) => String(row.ParentCategoryID || '') === String(category.CategoryID || ''));
    children.forEach((child) => upsert(child, record.AllocationID, quadrant, children.length, amount));
  };
  quadrantKeys_().forEach((quadrant) => {
    const roots = categories.filter((row) => !String(row.ParentCategoryID || '') && String(row.Quadrant || '') === quadrant);
    const quadrantAmount = policyAllocation.Amounts[quadrant] || 0;
    roots.forEach((root) => upsert(root, 'QUAD-' + quadrant, quadrant, roots.length, quadrantAmount));
  });
  writeRecordsBatch_('BudgetPolicyAllocations', updates, appends);
  return policyAllocation;
}

function savePolicyAllocationsForSession_(session, policyId, weights, period) {
  const policy = findRecord_('BudgetPolicies', 'PolicyID', policyId);
  if (!policy) throw new Error('Kebijakan Anggaran tidak ditemukan.');
  const keys = quadrantKeys_();
  const values = keys.map((key) => toNumber_(weights[key]));
  if (values.some((value) => value < 0 || value > 100)) throw new Error('Setiap proporsi kuadran harus berada di antara 0% dan 100%.');
  const total = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 100) > 0.001) throw new Error('Total proporsi empat kuadran harus tepat 100%.');
  const requestedPeriod = periodKey_(period);
  const targetPeriod = /^\d{4}-\d{2}$/.test(requestedPeriod) ? requestedPeriod : currentPeriod_();
  const calculatedBasisIncome = monthlyOperationalIncome_(targetPeriod);
  const previousAllocation = policyAllocationView_(policyId, targetPeriod);
  const basisIncome = calculatedBasisIncome > 0 ? calculatedBasisIncome : toNumber_(previousAllocation.BasisIncome);
  const now = isoNow_();
  withLock_(() => {
    const existing = sheetRecords_('BudgetPolicyAllocations');
    const existingByKey = {};
    existing.forEach((row) => { const key = String(row.PolicyID || '') + '|' + String(row.Quadrant || row.CategoryID || '') + '|' + String(row.Level || 0) + '|' + periodKey_(row.Period); existingByKey[key] = row; });
    const updates = [];
    const appends = [];
    keys.forEach((key, index) => {
      const found = existingByKey[policyId + '|' + key + '|0|' + targetPeriod];
      const record = Object.assign({}, found || {}, { AllocationID: found ? found.AllocationID : makeId_('ALLOC'), PolicyID: policyId, CategoryID: key, Quadrant: key, ParentAllocationID: '', Level: 0, WeightPct: values[index], Amount: Math.round(basisIncome * values[index] / 100 * 100) / 100, BasisIncome: basisIncome, Period: targetPeriod, Active: true, CreatedAt: found ? found.CreatedAt : now, UpdatedAt: now });
      if (found) updates.push(record); else appends.push(record);
    });
    writeRecordsBatch_('BudgetPolicyAllocations', updates, appends);
    rebuildCategoryAllocations_(policyId, targetPeriod);
  });
  auditForSession_(session, 'policy', policyId, 'ALLOCATE', null, policyAllocationView_(policyId, targetPeriod), 'Alokasi kuadran diperbarui.');
  return policyAllocationView_(policyId, targetPeriod);
}

function policyScoresComplete_(policyId) {
  const categories = activeRecords_('BudgetCategories', 'Active').filter((category) => String(category.PolicyID || '') === String(policyId));
  return categories.length > 0 && categories.every((category) => [category.ImportanceAyah, category.ImportanceBunda, category.UrgencyAyah, category.UrgencyBunda].every((value) => toNumber_(value) >= 1 && toNumber_(value) <= 10));
}

function policyCategoryView_(category, policy, session) {
  const view = publicRecord_(category);
  const status = String(policy && policy.Status || '').toUpperCase();
  const isCreator = policy && String(policy.CreatedBy || '') === String(session.userId || '');
  const isReview = ['REVIEW', 'APPROVED', 'APPROVED_AND_LOCKED', 'LOCKED', 'AMENDMENT'].includes(status);
  if (!isReview) {
    if (isCreator && String(session.role || '').toUpperCase() === 'AYAH') { view.ImportanceBunda = ''; view.UrgencyBunda = ''; }
    if (isCreator && String(session.role || '').toUpperCase() === 'BUNDA') { view.ImportanceAyah = ''; view.UrgencyAyah = ''; }
    if (!isCreator) { view.ImportanceAyah = ''; view.ImportanceBunda = ''; view.UrgencyAyah = ''; view.UrgencyBunda = ''; }
    view.ImportanceScore = ''; view.UrgencyScore = ''; view.Quadrant = '';
  }
  const role = String(session.role || '').toUpperCase();
  view.MyImportance = role === 'AYAH' ? view.ImportanceAyah : view.ImportanceBunda;
  view.MyUrgency = role === 'AYAH' ? view.UrgencyAyah : view.UrgencyBunda;
  view.CanEditScore = status === 'WAITING_PARTNER_SCORE' && !isCreator;
  return view;
}

function policyHasPendingAmendment_(policyId) {
  return sheetRecords_('BudgetPolicies').some((row) => String(row.AmendmentOfPolicyID || '') === String(policyId || '') && !['VOID', 'APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED', 'AMENDMENT'].includes(String(row.Status || '').toUpperCase()));
}

function policyView_(policy, session) {
  const status = String(policy.Status || '').toUpperCase();
  const actions = [];
  const isCreator = String(policy.CreatedBy || '') === String(session.userId || '');
  const submitted = Boolean(policy.SubmittedAt);
  const role = String(session.role || '').toUpperCase();
  const scoresComplete = policyScoresComplete_(policy.PolicyID);
  const editRequestPending = Boolean(policy.EditRequestedAt && !policy.EditReviewedAt);
  const amendmentDraftPending = policyHasPendingAmendment_(policy.PolicyID);
  if (status === 'DRAFT' && !submitted && isCreator && role === 'AYAH') actions.push('SUBMIT');
  if (status === 'WAITING_PARTNER_SCORE' && !isCreator && role === 'BUNDA') actions.push('SCORE');
  if (status === 'REVIEW' && role === 'AYAH') actions.push('ALLOCATE');
  if (['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED', 'AMENDMENT'].includes(status) && role === 'BUNDA' && !editRequestPending && !amendmentDraftPending) actions.push('REQUEST_EDIT');
  if (['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED', 'AMENDMENT'].includes(status) && role === 'AYAH' && editRequestPending && !amendmentDraftPending) actions.push('REVIEW_EDIT');
  if (['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED', 'AMENDMENT'].includes(status) && role === 'AYAH' && !editRequestPending && !amendmentDraftPending) actions.push('AMEND');
  if (policy.AmendmentOfPolicyID && ['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED', 'AMENDMENT'].includes(status) && role === 'AYAH') actions.push('VOID');
  if (['DRAFT', 'WAITING_PARTNER_SCORE', 'REVIEW'].includes(status) && ((status === 'DRAFT' && isCreator) || (status === 'WAITING_PARTNER_SCORE' && isCreator) || (status === 'REVIEW' && role === 'AYAH'))) actions.push('VOID');
  return Object.assign({}, publicRecord_(policy), { AllowedActions: actions, IsCreator: isCreator, ScoresComplete: scoresComplete, EditRequestPending: editRequestPending, AmendmentDraftPending: amendmentDraftPending, AwaitingPartnerScore: status === 'WAITING_PARTNER_SCORE', AwaitingFinalConfirmation: false, AwaitingAyahAllocation: status === 'REVIEW' && role === 'AYAH', CurrentUserConfirmed: false });
}

function lockExpiredPolicies_() {
  const policies = sheetRecords_('BudgetPolicies').filter((row) => row.PolicyID);
  const now = isoNow_();
  policies.forEach((policy) => {
    if (String(policy.Status || '').toUpperCase() === 'APPROVED' && policy.EffectiveTo && String(policy.EffectiveTo).slice(0, 10) < todayDate_()) {
      policy.Status = 'LOCKED'; policy.LockedAt = policy.LockedAt || now; policy.UpdatedAt = now;
      updateRecord_('BudgetPolicies', policy.__rowNumber, policy);
    }
  });
}

function latestBudgetRows_(rows) {
  const latest = {};
  (rows || []).forEach((row) => {
    const categoryKey = String(row.CategoryID || '').trim();
    const key = [periodKey_(row.Period), String(row.PolicyID || ''), categoryKey || String(row.BudgetID || '')].join('|');
    if (!key || key === '||') return;
    const previous = latest[key];
    const previousStamp = String(previous && (previous.UpdatedAt || previous.CreatedAt) || '');
    const currentStamp = String(row.UpdatedAt || row.CreatedAt || '');
    if (!previous || currentStamp >= previousStamp) latest[key] = row;
  });
  return Object.keys(latest).map((key) => latest[key]);
}

function budgetOptions_() {
  return latestBudgetRows_(activeRecords_('Budgets', 'Status'))
    .filter((row) => String(row.Item || '').trim() && (toNumber_(row.Amount || row.BudgetAmount) > 0 || toNumber_(row.PaidAmount) > 0))
    .sort((a, b) => periodKey_(a.Period).localeCompare(periodKey_(b.Period)) || toNumber_(a.SortOrder) - toNumber_(b.SortOrder) || String(a.BudgetCode || '').localeCompare(String(b.BudgetCode || ''), 'id', { numeric: true }))
    .map((row) => ({
      BudgetID: row.BudgetID, CategoryID: row.CategoryID || '', Period: periodKey_(row.Period), Category: row.Category, Item: row.Item, BudgetCode: row.BudgetCode || '',
      Level: row.Level || 1, SortOrder: row.SortOrder || '', DestinationAccountID: row.DestinationAccountID || '',
      DestinationAccountName: row.DestinationAccountName || row.DestinationAccountID || '', BudgetAmount: toNumber_(row.BudgetAmount || row.Amount),
      BudgetPercentage: toNumber_(row.BudgetPercentage || row.Percentage), PaidAmount: toNumber_(row.PaidAmount), PaidPercentage: toNumber_(row.PaidPercentage),
    }));
}

function getAppCatalogData(token, requestedPeriod) {
  beginRequestCache_();
  const session = requireSession_(token);
  const catalogPeriodKey = periodKey_(requestedPeriod);
  const catalogPeriod = /^\d{4}-\d{2}$/.test(catalogPeriodKey) ? catalogPeriodKey : currentPeriod_();
  const accounts = activeRecords_('Accounts', 'Status').map((account) => ({ AccountID: account.AccountID, Name: account.Name, Provider: account.Provider, Type: account.Type, AccountDisplay: maskAccountDisplay_(account), Owner: account.Owner, AccountLabel: accountLabel_(account) }));
  const budgets = budgetOptions_();
  const inventory = activeRecords_('InventoryItems', 'Active').map((item) => ({ ItemID: item.ItemID, Name: item.Name, Category: item.Category, Unit: item.Unit }));
  const goals = activeRecords_('FinancialGoals', 'Status').map((goal) => ({ GoalID: goal.GoalID, Name: goal.Name, GoalType: goal.GoalType, TargetAmount: toNumber_(goal.TargetAmount), CurrentValue: toNumber_(goal.CurrentValue), MonthlyContribution: toNumber_(goal.MonthlyContribution), BudgetParentCategoryID: goal.BudgetParentCategoryID || '', BudgetParentCategoryPath: goal.BudgetParentCategoryPath || '', BudgetCategoryID: goal.BudgetCategoryID || '' }));
  const debts = activeRecords_('Debts', 'Status').map((debt) => ({ DebtID: debt.DebtID, Name: debt.Name, Creditor: debt.Creditor || '', RemainingPrincipal: toNumber_(debt.RemainingPrincipal || debt.InitialPrincipal) }));
  const policyContext = budgetPolicyContext_(catalogPeriod);
  const assetTypes = assetTypeRecords_().map((type) => ({ AssetTypeID: type.AssetTypeID, Name: type.Name, Class: type.Class, ReportingCategory: type.ReportingCategory || '', Rate: toNumber_(type.Rate), UsefulLifeYears: type.UsefulLifeYears, DepreciationMethod: type.DepreciationMethod }));
  auditForSession_(session, 'bootstrap', '', 'CATALOG_LOAD', null, { accounts: accounts.length, budgets: budgets.length, inventory: inventory.length, goals: goals.length, assetTypes: assetTypes.length }, 'Dynamic catalogs loaded after first screen.');
  return { accounts: accounts, budgets: budgets, inventory: inventory, goals: goals, debts: debts, assetTypes: assetTypes, policyCategories: policyContext.categories || [], zakatInfaqProviders: ZAKAT_INFAQ_PROVIDERS, policyContext: { period: policyContext.period, ready: policyContext.ready, policy: policyContext.policy } };
}

function initializeApp() {
  beginRequestCache_();
  const installed = PropertiesService.getScriptProperties().getProperty('APP_INSTALLED') === '1';
  if (!installed) {
    ensureSchema_();
    seedUsers_();
  }
  return {
    success: true,
    app: { name: APP.name, familyName: APP.familyName, period: currentPeriod_(), timeZone: APP.timeZone },
    modules: MODULE_CONFIG,
    usersReady: sheetRecords_('Users').filter((user) => user.PinHash && String(user.Active).toUpperCase() !== 'PENDING').length > 0,
    drive: { configured: installed },
  };
}

function getDashboardData(token, period) {
  beginRequestCache_();
  const session = requireSession_(token);
  const requestedPeriod = periodKey_(period);
  const targetPeriod = /^\d{4}-\d{2}$/.test(requestedPeriod) ? requestedPeriod : currentPeriod_();
  const allIncome = activeRecords_('Income', 'Status');
  const allExpenses = activeRecords_('Expenses', 'Status');
  const allTransfers = activeRecords_('Transfers', 'Status');
  const income = allIncome.filter((row) => normalizeDate_(row.TransactionDate).slice(0, 7) === targetPeriod);
  const expenses = allExpenses.filter((row) => normalizeDate_(row.TransactionDate).slice(0, 7) === targetPeriod);
  const transfers = allTransfers.filter((row) => normalizeDate_(row.TransactionDate).slice(0, 7) === targetPeriod);
  const budgets = latestBudgetRows_(activeRecords_('Budgets', 'Status').filter((row) => periodKey_(row.Period) === targetPeriod));
  const budgetContext = budgetPolicyContext_(targetPeriod);
  const goals = activeRecords_('FinancialGoals', 'Status');
  const accounts = activeRecords_('Accounts', 'Status');
  const balances = activeRecords_('AccountBalances', 'Status');
  const inventory = inventorySummary_();
  const valuationDate = todayDate_();
  const assetAdjustments = activeRecords_('AssetAdjustments');
  const assetRows = activeRecords_('Assets', 'Status').map((row) => Object.assign({}, row, assetValuation_(row, valuationDate, assetAdjustments)));
  const snapshots = latestInvestmentSnapshots_();
  const investmentRows = activeRecords_('Investments', 'Status').map((row) => { const snapshot = snapshots[String(row.InvestmentID)]; return Object.assign({}, row, snapshot ? { CurrentValue: toNumber_(snapshot.MarketValue) } : {}); });
  const debtPayments = activeRecords_('DebtPayments');
  const debtSchedules = activeRecords_('DebtSchedule');
  const debtRows = activeRecords_('Debts', 'Status').map((row) => Object.assign({}, row, debtProjection_(row, valuationDate, debtPayments, debtSchedules)));

  const totalIncome = income.reduce((sum, row) => sum + toNumber_(row.Amount), 0);
  const totalExpense = expenses.reduce((sum, row) => sum + toNumber_(row.Amount), 0);
  const rawBudgetTotal = budgets.reduce((sum, row) => sum + toNumber_(row.PlannedAmount !== undefined && row.PlannedAmount !== '' ? row.PlannedAmount : (row.BudgetAmount !== undefined && row.BudgetAmount !== '' ? row.BudgetAmount : row.Amount)), 0);
  const totalBudget = budgetContext.ready ? toNumber_(budgetContext.plannedTotal) : rawBudgetTotal;
  const totalTransfer = transfers.reduce((sum, row) => sum + toNumber_(row.Amount), 0);
  const totalGoalCurrent = goals.reduce((sum, row) => sum + toNumber_(row.CurrentValue), 0);
  const totalGoalTarget = goals.reduce((sum, row) => sum + toNumber_(row.TargetAmount), 0);
  const latestBalances = latestBalances_(balances);
  const accountTypes = accountTypeMap_(accounts);
  const internalBalances = latestBalances.filter((row) => accountTypes[String(row.AccountID)] === 'INTERNAL');
  const totalActualBalance = internalBalances.reduce((sum, row) => sum + toNumber_(row.ActualBalance !== '' && row.ActualBalance !== null && row.ActualBalance !== undefined ? row.ActualBalance : row.SystemBalance), 0);
  const needsReconciliation = internalBalances.filter((row) => Math.abs(toNumber_(row.Difference)) > 0.001).length;
  const lowStock = inventory.filter((item) => item.status === 'REORDER').length;
  const balanceSheet = balanceSheetSummary_(accounts, internalBalances, assetRows, investmentRows, debtRows);
  const cashFlow = cashFlowSummary_(targetPeriod, income, expenses, transfers, debtPayments, accounts);
  const nishab = nishabSummary_(totalActualBalance, investmentRows, valuationDate);
  const trends = dashboardTrends_(targetPeriod, allIncome, allExpenses, allTransfers, accounts, balances, assetRows, assetAdjustments, investmentRows, snapshots, debtRows, debtPayments, debtSchedules);
  const storageHealth = storageHealthForDashboard_();

  auditForSession_(session, 'Dashboard', targetPeriod, 'VIEW', null, { period: targetPeriod, storageStatus: storageHealth.status }, 'Dashboard viewed.');
  return {
    period: targetPeriod,
    metrics: [
      { key: 'totalIncome', label: 'Total Penerimaan', value: totalIncome, tone: 'green' },
      { key: 'totalExpense', label: 'Total Pengeluaran', value: totalExpense, tone: 'red' },
      { key: 'totalAssets', label: 'Total Nilai Aset', value: balanceSheet.totals.fixedAssets, tone: 'blue' },
      { key: 'totalDebts', label: 'Total Nilai Utang', value: balanceSheet.totals.debts, tone: 'yellow' },
      { key: 'totalInvestments', label: 'Total Nilai Investasi', value: balanceSheet.totals.investments, tone: 'purple' },
      { key: 'netWealth', label: 'Total Harta Kekayaan', value: balanceSheet.totals.netAssets, tone: 'lime' },
    ],
    counts: {
      accounts: accounts.length,
      goals: goals.length,
      lowStock: lowStock,
      needsReconciliation: needsReconciliation,
    },
    netWorth: {
      accounts: totalActualBalance,
      goalFundedValue: totalGoalCurrent,
      assets: assetRows.reduce((sum, row) => sum + toNumber_(row.BookValue), 0),
      investments: investmentRows.reduce((sum, row) => sum + toNumber_(row.CurrentValue), 0),
      debts: debtRows.reduce((sum, row) => sum + toNumber_(row.RemainingPrincipalSystem), 0),
      total: totalActualBalance + assetRows.reduce((sum, row) => sum + toNumber_(row.BookValue), 0) + investmentRows.reduce((sum, row) => sum + toNumber_(row.CurrentValue), 0) - debtRows.reduce((sum, row) => sum + toNumber_(row.RemainingPrincipalSystem), 0),
    },
    budgetControl: { budget: totalBudget, actual: totalExpense, variance: totalBudget - totalExpense, utilization: totalBudget ? totalExpense / totalBudget : 0 },
    flow: { income: totalIncome, expense: totalExpense, transfer: totalTransfer },
    goals: publicRecords_(goals).slice(0, 8),
    inventory: inventory.slice(0, 8),
    reconciliation: { totalAccounts: latestBalances.length, differences: needsReconciliation },
    balanceSheet: balanceSheet,
    cashFlow: cashFlow,
    nishab: nishab,
    trends: trends,
    storageHealth: storageHealth,
    budgetBasisSource: budgetContext.basisIncomeSource || 'OPERATIONAL_INCOME',
    warnings: moduleDisplayWarnings_('income', allIncome).concat(budgetContext.ready && budgetContext.basisIncomeSource === 'SAVED_POLICY_BASELINE' ? ['Baseline policy tersimpan sedang digunakan karena Income periode ini belum memiliki klasifikasi Operating Income.'] : []),
  };
}

function monthSequence_(endPeriod, count) {
  const parts = String(endPeriod || currentPeriod_()).slice(0, 7).split('-').map((value) => Number(value));
  const end = new Date(parts[0], Math.max(0, parts[1] - 1), 1);
  const result = [];
  for (let index = count - 1; index >= 0; index -= 1) { const date = new Date(end.getFullYear(), end.getMonth() - index, 1); result.push(date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')); }
  return result;
}

function monthEndDate_(period) {
  const parts = String(period || currentPeriod_()).slice(0, 7).split('-').map((value) => Number(value));
  return new Date(parts[0], Math.max(0, parts[1] || 1), 0).getFullYear() + '-' + String(new Date(parts[0], Math.max(0, parts[1] || 1), 0).getMonth() + 1).padStart(2, '0') + '-' + String(new Date(parts[0], Math.max(0, parts[1] || 1), 0).getDate()).padStart(2, '0');
}

function lastSnapshotAt_(rows, idField, id, dateField, endDate) {
  return (rows || []).filter((row) => String(row[idField] || '') === String(id) && normalizeDate_(row[dateField]) && normalizeDate_(row[dateField]) <= endDate).sort((a, b) => normalizeDate_(b[dateField]).localeCompare(normalizeDate_(a[dateField])) || String(b.CreatedAt || '').localeCompare(String(a.CreatedAt || '')))[0] || null;
}

function internalBalanceAt_(balances, accountTypes, endDate) {
  const candidates = (balances || []).filter((row) => accountTypes[String(row.AccountID)] === 'INTERNAL' && normalizeDate_(row.AsOfDate) && normalizeDate_(row.AsOfDate) <= endDate);
  const latestByAccount = {};
  candidates.forEach((row) => { const id = String(row.AccountID || ''); if (!latestByAccount[id] || normalizeDate_(row.AsOfDate) > normalizeDate_(latestByAccount[id].AsOfDate) || (normalizeDate_(row.AsOfDate) === normalizeDate_(latestByAccount[id].AsOfDate) && String(row.CreatedAt || '') > String(latestByAccount[id].CreatedAt || ''))) latestByAccount[id] = row; });
  const values = Object.keys(latestByAccount).map((id) => latestByAccount[id]);
  if (!values.length) return { available: false, value: null };
  return { available: true, value: values.reduce((sum, row) => sum + toNumber_(row.ActualBalance !== '' && row.ActualBalance !== null && row.ActualBalance !== undefined ? row.ActualBalance : row.SystemBalance), 0) };
}

function investmentValueAt_(investments, snapshots, endDate) {
  let value = 0; let found = false;
  (investments || []).forEach((row) => {
    const created = normalizeDate_(row.CreatedAt || row.AsOfDate);
    if (created && created > endDate) return;
    const snapshot = lastSnapshotAt_(snapshots, 'InvestmentID', row.InvestmentID, 'AsOfDate', endDate);
    value += snapshot ? toNumber_(snapshot.MarketValue) : toNumber_(row.CostBasis || row.CurrentValue);
    found = true;
  });
  return { available: found, value: found ? value : 0 };
}

function debtValueAt_(debts, payments, schedules, endDate) {
  let value = 0; let found = false;
  (debts || []).forEach((debt) => {
    const start = normalizeDate_(debt.StartDate || debt.CreatedAt);
    if (start && start > endDate) return;
    const debtSchedules = (schedules || []).filter((row) => String(row.DebtID) === String(debt.DebtID) && normalizeDate_(row.DueDate) && normalizeDate_(row.DueDate) <= endDate).sort((a, b) => normalizeDate_(a.DueDate).localeCompare(normalizeDate_(b.DueDate)) || Number(a.PeriodNo || 0) - Number(b.PeriodNo || 0));
    const debtPayments = (payments || []).filter((row) => String(row.DebtID) === String(debt.DebtID) && normalizeDate_(row.PaymentDate) && normalizeDate_(row.PaymentDate) <= endDate);
    if (debtSchedules.length) value += Math.max(0, toNumber_(debtSchedules[debtSchedules.length - 1].ClosingPrincipal));
    else if (debtPayments.some((row) => toNumber_(row.PrincipalAmount) > 0)) value += Math.max(0, toNumber_(debt.InitialPrincipal) - debtPayments.reduce((sum, row) => sum + toNumber_(row.PrincipalAmount), 0));
    else {
      const elapsed = dateMonthsBetween_(debt.StartDate || debt.CreatedAt, endDate);
      const tenor = Math.max(0, Math.round(toNumber_(debt.TenorMonths)));
      const remainingPeriods = Math.max(0, tenor - elapsed);
      const monthly = toNumber_(debt.MonthlyPayment);
      value += monthly > 0 && tenor > 0 ? monthly * remainingPeriods : toNumber_(debt.InitialPrincipal || debt.RemainingPrincipal);
    }
    found = true;
  });
  return { available: found, value: found ? value : 0 };
}

function dashboardTrends_(targetPeriod, allIncome, allExpenses, allTransfers, accounts, balances, currentAssetRows, assetAdjustments, currentInvestmentRows, snapshots, currentDebtRows, debtPayments, debtSchedules) {
  const periods = monthSequence_(targetPeriod, 12);
  const accountTypes = accountTypeMap_(accounts);
  const assets = activeRecords_('Assets', 'Status');
  const investments = activeRecords_('Investments', 'Status');
  const debts = activeRecords_('Debts', 'Status');
  const netWorth = periods.map((month) => {
    const endDate = monthEndDate_(month);
    const cash = internalBalanceAt_(balances, accountTypes, endDate);
    const assetValue = assets.filter((row) => !normalizeDate_(row.AcquisitionDate) || normalizeDate_(row.AcquisitionDate) <= endDate).reduce((sum, row) => sum + toNumber_(assetValuation_(row, endDate, assetAdjustments).BookValue), 0);
    const investmentValue = investmentValueAt_(investments, snapshotsList_(snapshots), endDate);
    const debtValue = debtValueAt_(debts, debtPayments, debtSchedules, endDate);
    const complete = cash.available && (investmentValue.available || investments.length === 0) && (debtValue.available || debts.length === 0);
    return { period: month, value: complete ? cash.value + assetValue + investmentValue.value - debtValue.value : null, available: complete };
  });
  const cashFlow = periods.map((month) => {
    const monthIncome = allIncome.filter((row) => normalizeDate_(row.TransactionDate).slice(0, 7) === month);
    const monthExpenses = allExpenses.filter((row) => normalizeDate_(row.TransactionDate).slice(0, 7) === month);
    const monthTransfers = allTransfers.filter((row) => (String(row.Origin || '').toUpperCase() !== 'BUDGET_ALLOCATION' || String(row.ExecutionStatus || '').toUpperCase() === 'SUDAH') && normalizeDate_(row.TransactionDate).slice(0, 7) === month);
    const summary = cashFlowSummary_(month, monthIncome, monthExpenses, monthTransfers, debtPayments.filter((row) => normalizeDate_(row.PaymentDate).slice(0, 7) === month), accounts);
    return { period: month, inflow: summary.totals.operatingInflow + summary.totals.otherInflow + summary.totals.externalInflow, outflow: summary.totals.operatingOutflow + summary.totals.investingOutflow + summary.totals.debtOutflow + summary.totals.externalOutflow, net: summary.totals.netCashFlow };
  });
  return { periods: periods, netWorth: netWorth, cashFlow: cashFlow, note: 'Tren Kekayaan Bersih hanya menampilkan nilai ketika snapshot saldo internal dan komponen relevan tersedia; Arus Kas memakai transaksi aktif per bulan.' };
}

function snapshotsList_(snapshotMap) { return Object.keys(snapshotMap || {}).map((key) => snapshotMap[key]); }

function balanceSheetSummary_(accounts, latestBalances, assetRows, investmentRows, debtRows) {
  const cash = latestBalances.reduce((sum, row) => sum + toNumber_(row.ActualBalance !== '' && row.ActualBalance !== null && row.ActualBalance !== undefined ? row.ActualBalance : row.SystemBalance), 0);
  const investments = investmentRows.reduce((sum, row) => sum + toNumber_(row.CurrentValue || row.CostBasis), 0);
  const fixedAssets = assetRows.reduce((sum, row) => sum + toNumber_(row.BookValue), 0);
  const debts = debtRows.reduce((sum, row) => sum + toNumber_(row.RemainingPrincipalSystem), 0);
  const totalAssets = cash + investments + fixedAssets;
  return { asOfDate: todayDate_(), lines: [{ key: 'cash', label: 'Kas dan saldo rekening', value: cash, source: 'Modul Tabungan / AccountBalances' }, { key: 'investments', label: 'Investasi', value: investments, source: 'Modul Investasi / InvestmentSnapshots' }, { key: 'fixedAssets', label: 'Aset tetap — nilai buku', value: fixedAssets, source: 'Modul Aset / Assets + AssetAdjustments' }, { key: 'totalAssets', label: 'Total Aset', value: totalAssets, source: 'Penjumlahan sumber di atas' }, { key: 'debts', label: 'Utang', value: debts, source: 'Modul Utang / Debts + DebtSchedule' }, { key: 'netAssets', label: 'Kekayaan Bersih', value: totalAssets - debts, source: 'Total Aset dikurangi Utang' }], totals: { cash: cash, investments: investments, fixedAssets: fixedAssets, totalAssets: totalAssets, debts: debts, netAssets: totalAssets - debts } };
}

function accountTypeMap_(accounts) {
  const result = {};
  (accounts || []).forEach((account) => { result[String(account.AccountID)] = String(account.Type || '').toUpperCase(); });
  return result;
}

function cashFlowSummary_(period, income, expenses, transfers, debtPayments, accounts) {
  const target = String(period || currentPeriod_()).slice(0, 7);
  const inPeriod = (rows, dateField) => (rows || []).filter((row) => normalizeDate_(row[dateField] || row.TransactionDate || row.PaymentDate).slice(0, 7) === target);
  const periodIncome = inPeriod(income, 'TransactionDate');
  const periodExpenses = inPeriod(expenses, 'TransactionDate');
  const periodTransfers = inPeriod((transfers || []).filter((row) => String(row.Origin || '').toUpperCase() !== 'BUDGET_ALLOCATION' || String(row.ExecutionStatus || '').toUpperCase() === 'SUDAH'), 'TransactionDate');
  const periodDebtPayments = inPeriod(debtPayments, 'PaymentDate');
  const operatingInflow = periodIncome.filter((row) => String(row.OperatingIncome || '').toUpperCase() === 'YA').reduce((sum, row) => sum + toNumber_(row.Amount), 0);
  const otherInflow = periodIncome.filter((row) => String(row.OperatingIncome || '').toUpperCase() !== 'YA').reduce((sum, row) => sum + toNumber_(row.Amount), 0);
  const operatingOutflow = periodExpenses.filter((row) => String(row.ExpenseType || '').toUpperCase() === 'EXPENSE').reduce((sum, row) => sum + toNumber_(row.Amount), 0);
  const investingOutflow = periodExpenses.filter((row) => ['INVESTMENT', 'ASSET_ACQUISITION'].includes(String(row.ExpenseType || '').toUpperCase())).reduce((sum, row) => sum + toNumber_(row.Amount), 0);
  const debtOutflow = periodDebtPayments.reduce((sum, row) => sum + toNumber_(row.Amount), 0);
  const types = accountTypeMap_(accounts);
  let externalInflow = 0; let externalOutflow = 0; let internalTransfer = 0;
  periodTransfers.forEach((row) => { const sourceType = types[String(row.SourceAccountID)] || ''; const destinationType = types[String(row.DestinationAccountID)] || ''; const amount = toNumber_(row.Amount); if (sourceType === 'EXTERNAL' && destinationType !== 'EXTERNAL') externalInflow += amount; else if (destinationType === 'EXTERNAL' && sourceType !== 'EXTERNAL') externalOutflow += amount; else if (sourceType === 'INTERNAL' && destinationType === 'INTERNAL') internalTransfer += amount; });
  const net = operatingInflow + otherInflow - operatingOutflow - investingOutflow - debtOutflow + externalInflow - externalOutflow;
  return { period: target, lines: [{ key: 'operatingInflow', label: 'Penerimaan Operasional', value: operatingInflow, source: 'Modul Penerimaan' }, { key: 'otherInflow', label: 'Penerimaan Non-Operasional', value: otherInflow, source: 'Modul Penerimaan' }, { key: 'operatingOutflow', label: 'Pengeluaran Operasional', value: operatingOutflow, source: 'Modul Pengeluaran · Expense' }, { key: 'investingOutflow', label: 'Pengeluaran Investasi dan Aset', value: investingOutflow, source: 'Modul Pengeluaran · Investment / Asset Acquisition' }, { key: 'debtOutflow', label: 'Pembayaran Pokok/Margin Utang', value: debtOutflow, source: 'Modul Utang / DebtPayments' }, { key: 'externalInflow', label: 'Transfer Eksternal Masuk', value: externalInflow, source: 'Modul Transfer + Modul Rekening' }, { key: 'externalOutflow', label: 'Transfer Eksternal Keluar', value: externalOutflow, source: 'Modul Transfer + Modul Rekening' }, { key: 'internalTransfer', label: 'Transfer Internal (memo)', value: internalTransfer, source: 'Modul Transfer + Modul Rekening' }, { key: 'netCashFlow', label: 'Arus Kas Bersih', value: net, source: 'Penjumlahan arus kas periode' }], totals: { operatingInflow: operatingInflow, otherInflow: otherInflow, operatingOutflow: operatingOutflow, investingOutflow: investingOutflow, debtOutflow: debtOutflow, externalInflow: externalInflow, externalOutflow: externalOutflow, internalTransfer: internalTransfer, netCashFlow: net } };
}

function latestRecordedGoldPrice_(asOfDate) {
  const target = normalizeDate_(asOfDate) || todayDate_();
  const rows = activeRecords_('GoldPriceHistory', 'Status').filter((row) => normalizeDate_(row.PriceDate) && normalizeDate_(row.PriceDate) <= target && toNumber_(row.PricePerGram) > 0).sort((a, b) => normalizeDate_(b.PriceDate).localeCompare(normalizeDate_(a.PriceDate)) || String(b.CapturedAt || '').localeCompare(String(a.CapturedAt || '')));
  return rows.length ? { pricePerGram: toNumber_(rows[0].PricePerGram), priceDate: normalizeDate_(rows[0].PriceDate), source: rows[0].Source || 'GoldPriceHistory' } : { pricePerGram: 0, priceDate: '', source: 'Belum ada snapshot harga emas' };
}

function nishabSummary_(cashBalance, investmentRows, asOfDate) {
  const gold = latestRecordedGoldPrice_(asOfDate);
  const investmentValue = (investmentRows || []).reduce((sum, row) => sum + toNumber_(row.CurrentValue || row.CostBasis), 0);
  const eligibleWealth = toNumber_(cashBalance) + investmentValue;
  const threshold = gold.pricePerGram * toNumber_(APP.nishabGoldGrams || 85);
  const status = threshold > 0 ? (eligibleWealth >= threshold ? 'MENCAPAI_NISHAB' : 'BELUM_MENCAPAI_NISHAB') : 'HARGA_EMAS_BELUM_TERSEDIA';
  return { standard: '85 gram emas', goldGrams: toNumber_(APP.nishabGoldGrams || 85), goldPricePerGram: gold.pricePerGram, goldPriceDate: gold.priceDate, goldPriceSource: gold.source, thresholdValue: threshold, eligibleWealth: eligibleWealth, status: status, rate: toNumber_(APP.nishabRate || 0.025), haulStatus: 'BELUM_DINILAI', basis: 'Saldo rekening dari Modul Tabungan + nilai terkini/perolehan investasi dari Modul Investasi; aset penggunaan dan rumah tidak dihitung.', note: 'Indikator ambang nominal. Mencapai Nishab belum otomatis menetapkan kewajiban zakat tanpa verifikasi haul dan ketentuan yang berlaku.' };
}

function getTransferModuleData_(session) {
  const transfers = activeRecords_('Transfers', 'Status');
  const accounts = activeRecords_('Accounts', 'Status');
  const types = accountTypeMap_(accounts);
  const rows = transfers.map((row) => { const sourceType = types[String(row.SourceAccountID)] || ''; const destinationType = types[String(row.DestinationAccountID)] || ''; const transferClass = sourceType === 'EXTERNAL' || destinationType === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL'; return Object.assign({}, row, { SourceAccountType: sourceType, DestinationAccountType: destinationType, TransferClass: transferClass }); });
  return { module: 'transfers', label: MODULE_CONFIG.transfers.label, columns: SHEET_SCHEMAS.Transfers.concat(['SourceAccountType', 'DestinationAccountType', 'TransferClass']), rows: publicRecords_(rows) };
}

function assetTypeRecords_() {
  return activeRecords_('AssetTypes', 'Active');
}

function resolveAssetType_(value) {
  const target = String(value || '').trim().toUpperCase();
  return assetTypeRecords_().find((row) => String(row.AssetTypeID || '').toUpperCase() === target || String(row.Name || '').toUpperCase() === target) || null;
}

function normalizeAssetReportingCategory_(value) {
  const key = String(value || '').trim().toUpperCase().replace(/[&/]/g, '_').replace(/[ -]+/g, '_');
  const aliases = { TANAH: 'TANAH', RUMAH: 'RUMAH', BANGUNAN: 'RUMAH', KENDARAAN: 'KENDARAAN', ELEKTRONIK: 'ELEKTRONIK', GAWAI: 'GAWAI', DAPUR: 'DAPUR', FURNITUR: 'FURNITUR', PERABOT: 'FURNITUR', AIR: 'AIR_SANITASI', SANITASI: 'AIR_SANITASI', AIR_SANITASI: 'AIR_SANITASI', ANAK: 'ANAK', MUSIK: 'PENUNJANG_RUMAH', PENUNJANG: 'PENUNJANG_RUMAH', PENUNJANG_RUMAH: 'PENUNJANG_RUMAH', TAK_BERWUJUD: 'TAK_BERWUJUD', INTANGIBLE: 'TAK_BERWUJUD' };
  return aliases[key] || '';
}

function assetReportingCategory_(asset, type) {
  const explicit = normalizeAssetReportingCategory_(asset && asset.ReportingCategory);
  if (explicit) return explicit;
  const fromType = normalizeAssetReportingCategory_(type && type.ReportingCategory);
  if (fromType) return fromType;
  const source = String(asset && (asset.AssetType || asset.Name) || type && type.Name || '').toUpperCase();
  if (source.indexOf('TANAH') >= 0) return 'TANAH';
  if (source.indexOf('BANGUNAN') >= 0 || source.indexOf('RUMAH TINGGAL') >= 0) return 'RUMAH';
  if (source.indexOf('KENDARAAN') >= 0) return 'KENDARAAN';
  if (source.indexOf('GAWAI') >= 0) return 'GAWAI';
  if (source.indexOf('DAPUR') >= 0) return 'DAPUR';
  if (source.indexOf('FURNITUR') >= 0 || source.indexOf('PERABOT') >= 0) return 'FURNITUR';
  if (source.indexOf('SANITASI') >= 0 || source.indexOf(' AIR') >= 0 || source.indexOf('AIR ') >= 0) return 'AIR_SANITASI';
  if (source.indexOf('ANAK') >= 0) return 'ANAK';
  if (source.indexOf('MUSIK') >= 0 || source.indexOf('PENUNJANG') >= 0) return 'PENUNJANG_RUMAH';
  if (String(type && type.Class || '').toUpperCase() === 'INTANGIBLE' || source.indexOf('LISENSI') >= 0) return 'TAK_BERWUJUD';
  if (source.indexOf('ELEKTRONIK') >= 0) return 'ELEKTRONIK';
  return '';
}

function dateMonthsBetween_(fromValue, toValue) {
  const from = new Date(normalizeDate_(fromValue));
  const to = new Date(normalizeDate_(toValue));
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return 0;
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() - (to.getDate() < from.getDate() ? 1 : 0));
}

function assetValuation_(asset, asOfDate, allAdjustments) {
  const type = resolveAssetType_(asset.AssetType) || { Name: asset.AssetType || 'Lainnya', Class: 'TANGIBLE', ReportingCategory: '', DepreciationMethod: 'NONE', Rate: 0, UsefulLifeYears: '' };
  const adjustments = (allAdjustments || activeRecords_('AssetAdjustments')).filter((row) => String(row.AssetID) === String(asset.AssetID));
  const renovation = adjustments.filter((row) => String(row.AdjustmentType || '').toUpperCase() === 'RENOVATION').reduce((sum, row) => sum + toNumber_(row.Amount), 0);
  const acquisitionValue = toNumber_(asset.AcquisitionValue);
  const acquisitionMonths = dateMonthsBetween_(asset.AcquisitionDate, asOfDate || todayDate_());
  const acquisitionDep = type.DepreciationMethod === 'NONE' || !toNumber_(type.Rate) ? 0 : Math.min(acquisitionValue, acquisitionValue * toNumber_(type.Rate) * acquisitionMonths / 12);
  const renovationDep = adjustments.filter((row) => String(row.AdjustmentType || '').toUpperCase() === 'RENOVATION').reduce((sum, row) => {
    const months = dateMonthsBetween_(row.AdjustmentDate, asOfDate || todayDate_());
    const amount = toNumber_(row.Amount);
    return sum + (type.DepreciationMethod === 'NONE' || !toNumber_(type.Rate) ? 0 : Math.min(amount, amount * toNumber_(type.Rate) * months / 12));
  }, 0);
  const depreciation = Math.min(acquisitionValue + renovation, acquisitionDep + renovationDep);
  return { AssetTypeName: type.Name || asset.AssetType || 'Lainnya', AssetClass: type.Class || 'TANGIBLE', ReportingCategory: assetReportingCategory_(asset, type), DepreciationRate: toNumber_(type.Rate), UsefulLifeYears: type.UsefulLifeYears || '', TotalRenovation: renovation, AccumulatedDepreciation: depreciation, BookValue: Math.max(0, acquisitionValue + renovation - depreciation) };
}

function getAssetModuleData_(session) {
  const valuationDate = todayDate_();
  const adjustments = activeRecords_('AssetAdjustments');
  const rows = activeRecords_('Assets', 'Status').map((asset) => Object.assign({}, asset, assetValuation_(asset, valuationDate, adjustments)));
  auditForSession_(session, 'assets', '', 'VIEW', null, { count: rows.length }, 'Asset module viewed.');
  return { module: 'assets', label: MODULE_CONFIG.assets.label, columns: SHEET_SCHEMAS.Assets.concat(['AssetTypeName', 'AssetClass', 'DepreciationRate', 'UsefulLifeYears', 'TotalRenovation', 'AccumulatedDepreciation', 'BookValue']), rows: publicRecords_(rows), assetTypes: publicRecords_(assetTypeRecords_()) };
}

function normalizeInvestmentInstrument_(value) {
  const key = String(value || '').trim().toUpperCase();
  const map = { SAHAM: 'SAHAM', 'REKSADANA PASAR UANG': 'RD_PASAR_UANG', RD_PASAR_UANG: 'RD_PASAR_UANG', 'REKSADANA OBLIGASI': 'RD_OBLIGASI', RD_OBLIGASI: 'RD_OBLIGASI', 'REKSADANA SAHAM': 'RD_DANA_SAHAM', RD_DANA_SAHAM: 'RD_DANA_SAHAM', 'REKSADANA CAMPURAN': 'RD_CAMPURAN', RD_CAMPURAN: 'RD_CAMPURAN', EMAS: 'EMAS', OBLIGASI: 'OBLIGASI', SBN: 'OBLIGASI' };
  return map[key] || key;
}

function latestInvestmentSnapshots_() {
  const snapshots = activeRecords_('InvestmentSnapshots');
  const latest = {};
  snapshots.forEach((row) => {
    const id = String(row.InvestmentID || '');
    if (!id) return;
    if (!latest[id] || normalizeDate_(row.AsOfDate) > normalizeDate_(latest[id].AsOfDate) || (normalizeDate_(row.AsOfDate) === normalizeDate_(latest[id].AsOfDate) && String(row.CreatedAt || '') > String(latest[id].CreatedAt || ''))) latest[id] = row;
  });
  return latest;
}

function getInvestmentModuleData_(session) {
  const snapshots = latestInvestmentSnapshots_();
  const rows = activeRecords_('Investments', 'Status').map((investment) => {
    const snapshot = snapshots[String(investment.InvestmentID)] || null;
    return Object.assign({}, investment, { Instrument: normalizeInvestmentInstrument_(investment.Instrument) }, snapshot ? { CurrentPrice: toNumber_(snapshot.Price), CurrentValue: toNumber_(snapshot.MarketValue), AsOfDate: snapshot.AsOfDate, ValuationSource: snapshot.Notes || 'InvestmentSnapshots' } : { ValuationSource: investment.CurrentValue ? 'Purchase basis' : 'Belum ada snapshot' });
  });
  auditForSession_(session, 'investments', '', 'VIEW', null, { count: rows.length }, 'Investment module viewed.');
  return { module: 'investments', label: MODULE_CONFIG.investments.label, columns: SHEET_SCHEMAS.Investments.concat(['ValuationSource']), rows: publicRecords_(rows), snapshots: publicRecords_(Object.keys(snapshots).map((key) => snapshots[key])) };
}

function debtProjection_(debt, asOfDate, allPayments, allSchedules) {
  const payments = (allPayments || activeRecords_('DebtPayments')).filter((row) => String(row.DebtID) === String(debt.DebtID));
  const schedule = (allSchedules || activeRecords_('DebtSchedule')).filter((row) => String(row.DebtID) === String(debt.DebtID)).sort((a, b) => Number(a.PeriodNo || 0) - Number(b.PeriodNo || 0));
  const valuationDate = normalizeDate_(asOfDate) || todayDate_();
  const initial = toNumber_(debt.InitialPrincipal);
  const paidPrincipal = payments.reduce((sum, row) => sum + toNumber_(row.PrincipalAmount), 0);
  const storedRemaining = toNumber_(debt.RemainingPrincipal);
  const storedSource = String(debt.ScheduleSource || '').toUpperCase();
  const tenor = Math.max(0, Math.round(toNumber_(debt.TenorMonths)));
  const monthlyPayment = toNumber_(debt.MonthlyPayment);
  const elapsedByDate = Math.min(tenor || Infinity, dateMonthsBetween_(debt.StartDate, valuationDate));
  const estimatedRemainingPeriods = Math.max(0, tenor - (Number.isFinite(elapsedByDate) ? elapsedByDate : 0));
  const dueSchedule = schedule.filter((row) => {
    const due = normalizeDate_(row.DueDate || row.PaymentDate);
    return due && due <= valuationDate;
  });
  const currentSchedule = dueSchedule.length ? dueSchedule[dueSchedule.length - 1] : null;
  let remaining = 0;
  let source = storedSource || 'ESTIMATE';
  let lastPeriod = 0;
  if (currentSchedule) {
    // Use the schedule row reached by the valuation date, not the final row
    // of a full future schedule. The final bank row is normally zero.
    remaining = Math.max(0, toNumber_(currentSchedule.ClosingPrincipal));
    lastPeriod = Number(currentSchedule.PeriodNo || 0);
    source = 'BANK_SCHEDULE';
  } else {
    // For a debt without a usable as-of schedule, the family-facing estimate
    // is the remaining installments: monthly payment × remaining months.
    // This avoids showing zero merely because a full schedule ends in the future.
    remaining = monthlyPayment > 0
      ? Math.max(0, monthlyPayment * estimatedRemainingPeriods)
      : (paidPrincipal > 0 ? Math.max(0, initial - paidPrincipal) : Math.max(0, storedRemaining || initial));
    source = monthlyPayment > 0 ? 'ESTIMATE_INSTALLMENT_REMAINING' : (paidPrincipal > 0 ? 'OBSERVED_PAYMENTS' : (storedRemaining > 0 ? 'STORED_BALANCE' : 'ESTIMATE'));
  }
  let remainingPeriods = estimatedRemainingPeriods;
  let periodEstimate = false;
  if (currentSchedule) {
    remainingPeriods = Math.max(0, tenor - lastPeriod);
    periodEstimate = dueSchedule.length < schedule.length || dueSchedule.length < tenor;
  } else if (remaining > 0 && tenor > 0) {
    periodEstimate = true;
  }
  return { RemainingPrincipalSystem: Math.round(remaining * 100) / 100, RemainingPeriods: remainingPeriods, ElapsedPeriods: Number.isFinite(elapsedByDate) ? elapsedByDate : 0, ScheduleSourceSystem: source, PaidPrincipal: paidPrincipal, ScheduleRows: schedule.length, LastSchedulePeriod: lastPeriod, RemainingPeriodsIsEstimate: periodEstimate };
}

function getSavingsModuleData_(session) {
  const accounts = activeRecords_('Accounts', 'Status').filter((account) => String(account.Type || '').toUpperCase() === 'INTERNAL');
  const balances = latestBalances_(activeRecords_('AccountBalances', 'Status'));
  const rows = accounts.map((account) => {
    const balance = balances.find((item) => String(item.AccountID) === String(account.AccountID)) || null;
    const hasActual = balance && balance.ActualBalance !== '' && balance.ActualBalance !== null && balance.ActualBalance !== undefined;
    const current = hasActual ? toNumber_(balance.ActualBalance) : toNumber_(balance && balance.SystemBalance);
    return { BalanceID: balance && balance.BalanceID || '', AccountID: account.AccountID, Name: account.Name, Provider: account.Provider, AccountDisplay: maskAccountDisplay_(account), Owner: account.Owner, AsOfDate: balance && balance.AsOfDate || '', BalanceValue: current, BalanceBasis: hasActual ? 'ActualBalance' : (balance ? 'SystemBalance' : 'Belum diinput'), Difference: balance ? toNumber_(balance.Difference) : 0 };
  });
  auditForSession_(session, 'savings', '', 'VIEW', null, { count: rows.length, internalAccounts: accounts.length }, 'Savings module viewed from all internal accounts.');
  return { module: 'savings', label: MODULE_CONFIG.savings.label, columns: ['Name', 'Provider', 'AccountDisplay', 'Owner', 'AsOfDate', 'BalanceBasis', 'BalanceValue', 'Difference'], rows: publicRecords_(rows) };
}

function getInventoryModuleData_(session) {
  const rows = inventorySummary_();
  auditForSession_(session, 'inventory', '', 'VIEW', null, { count: rows.length }, 'Inventory module viewed with computed stock.');
  return { module: 'inventory', label: MODULE_CONFIG.inventory.label, columns: SHEET_SCHEMAS.InventoryItems.concat(['currentStock', 'status']), rows: rows };
}

function getDebtModuleData_(session) {
  const valuationDate = todayDate_();
  const payments = activeRecords_('DebtPayments');
  const schedules = activeRecords_('DebtSchedule');
  const rows = activeRecords_('Debts', 'Status').map((debt) => Object.assign({}, debt, debtProjection_(debt, valuationDate, payments, schedules)));
  auditForSession_(session, 'debts', '', 'VIEW', null, { count: rows.length }, 'Debt module viewed.');
  return { module: 'debts', label: MODULE_CONFIG.debts.label, columns: SHEET_SCHEMAS.Debts.concat(['RemainingPrincipalSystem', 'ElapsedPeriods', 'RemainingPeriods', 'ScheduleSourceSystem', 'PaidPrincipal', 'ScheduleRows', 'RemainingPeriodsIsEstimate']), rows: publicRecords_(rows) };
}

function normalizeScheduleDate_(value) {
  const text = String(value || '').trim();
  const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slash) return slash[3] + '-' + String(slash[2]).padStart(2, '0') + '-' + String(slash[1]).padStart(2, '0');
  return normalizeDate_(text);
}

function saveDebtScheduleBatch(token, debtId, rows) {
  beginRequestCache_();
  const session = requireSession_(token);
  const debt = findRecord_('Debts', 'DebtID', debtId);
  if (!debt) throw new Error('Utang yang dipilih tidak ditemukan.');
  if (!Array.isArray(rows) || !rows.length) throw new Error('Jadwal KPR tidak berisi baris data.');
  const timestamp = isoNow_();
  const cleanRows = rows.map((row, index) => {
    const due = normalizeScheduleDate_(row.DueDate || row.PaymentDate);
    const opening = toNumber_(row.OpeningPrincipal);
    const principal = toNumber_(row.PrincipalAmount);
    const margin = toNumber_(row.MarginAmount || row.InterestAmount);
    const installment = toNumber_(row.Installment || (principal + margin));
    const closing = row.ClosingPrincipal === undefined || row.ClosingPrincipal === '' ? Math.max(0, opening - principal) : toNumber_(row.ClosingPrincipal);
    if (!due || opening < 0 || principal < 0 || margin < 0 || installment < 0 || closing < 0) throw new Error('Baris jadwal KPR ke-' + (index + 1) + ' tidak valid.');
    return { ScheduleID: makeId_('DSC'), DebtID: debt.DebtID, PeriodNo: Number(row.PeriodNo || index + 1), DueDate: due, OpeningPrincipal: opening, PrincipalAmount: principal, MarginAmount: margin, Installment: installment, ClosingPrincipal: closing, Source: 'BANK_SCHEDULE', CreatedAt: timestamp };
  });
  const existingSchedule = activeRecords_('DebtSchedule').filter((row) => String(row.DebtID) === String(debt.DebtID));
  const existingByPeriod = {};
  existingSchedule.forEach((row) => { existingByPeriod[String(row.PeriodNo)] = row; });
  const rowsToAppend = [];
  cleanRows.forEach((row) => {
    const previous = existingByPeriod[String(row.PeriodNo)];
    if (!previous) { rowsToAppend.push(row); return; }
    const same = Number(previous.ClosingPrincipal) === Number(row.ClosingPrincipal) && Number(previous.PrincipalAmount) === Number(row.PrincipalAmount) && Number(previous.Installment) === Number(row.Installment);
    if (!same) throw new Error('Periode jadwal ke-' + row.PeriodNo + ' sudah ada dengan angka berbeda. Data lama dipertahankan; periksa sumber bank sebelum mengimpor.');
  });
  rowsToAppend.forEach((row) => appendRecord_('DebtSchedule', row));
  const allSchedule = existingSchedule.concat(rowsToAppend).sort((a, b) => Number(a.PeriodNo) - Number(b.PeriodNo));
  const latest = allSchedule[allSchedule.length - 1];
  if (!latest) throw new Error('Jadwal KPR tidak dapat disimpan.');
  debt.RemainingPrincipal = latest.ClosingPrincipal;
  debt.ScheduleSource = 'BANK_SCHEDULE';
  debt.LastSchedulePeriod = latest.PeriodNo;
  debt.UpdatedAt = timestamp;
  updateRecord_('Debts', debt.__rowNumber, debt);
  auditForSession_(session, 'debts', debt.DebtID, 'SCHEDULE_IMPORT', null, { count: rowsToAppend.length, skippedExisting: cleanRows.length - rowsToAppend.length, lastPeriod: latest.PeriodNo }, 'Jadwal KPR syariah diimpor secara idempotent.');
  return { success: true, imported: rowsToAppend.length, skippedExisting: cleanRows.length - rowsToAppend.length, projection: debtProjection_(debt, todayDate_()) };
}

function refreshStockSnapshotsCore_(actor, asOfDate) {
  const date = normalizeDate_(asOfDate || todayDate_());
  if (!date) throw new Error('Tanggal snapshot tidak valid.');
  const investments = activeRecords_('Investments', 'Status').filter((row) => String(row.Instrument || '').toUpperCase() === 'SAHAM' && String(row.TickerSymbol || '').trim());
  if (!investments.length) return { success: true, refreshed: 0, message: 'Belum ada posisi Saham dengan Kode/Ticker.' };
  const spreadsheet = SpreadsheetApp.openById(APP.spreadsheetId);
  const tempName = '__GF_' + new Date().getTime();
  const sheet = spreadsheet.insertSheet(tempName);
  try {
    sheet.getRange(1, 1, investments.length, 2).setValues(investments.map((row) => [String(row.TickerSymbol).trim(), '']));
    sheet.getRange(1, 2, investments.length, 1).setFormulas(investments.map((row, index) => ['=IFERROR(GOOGLEFINANCE(A' + (index + 1) + ',"price"),"")']));
    SpreadsheetApp.flush();
    Utilities.sleep(3000);
    const prices = sheet.getRange(1, 2, investments.length, 1).getValues().map((row) => toNumber_(row[0]));
    const timestamp = isoNow_();
    let refreshed = 0;
    investments.forEach((investment, index) => {
      const price = prices[index];
      if (!price || price < 0) return;
      const units = (toNumber_(investment.LotCount) * 100) || toNumber_(investment.Quantity);
      const marketValue = price * (units || 0);
      const snapshot = { SnapshotID: makeId_('SNAP'), InvestmentID: investment.InvestmentID, AsOfDate: date, Quantity: units, Price: price, MarketValue: marketValue, Notes: 'GOOGLEFINANCE · ' + investment.TickerSymbol, CreatedBy: actor, CreatedAt: timestamp };
      appendRecord_('InvestmentSnapshots', snapshot);
      investment.CurrentPrice = price; investment.CurrentValue = marketValue; investment.AsOfDate = date; investment.MarketSource = 'GOOGLEFINANCE'; investment.UpdatedAt = timestamp; updateRecord_('Investments', investment.__rowNumber, investment);
      refreshed += 1;
    });
    return { success: true, refreshed: refreshed, requested: investments.length, asOfDate: date };
  } finally {
    spreadsheet.deleteSheet(sheet);
  }
}

function refreshStockSnapshotsFromGoogleFinance(token, asOfDate) {
  beginRequestCache_();
  const session = requireSession_(token);
  const result = refreshStockSnapshotsCore_(session.userId, asOfDate);
  auditForSession_(session, 'investments', '', 'GOOGLEFINANCE_REFRESH', null, result, 'Snapshot harga Saham diperbarui melalui GoogleFinance.');
  return result;
}

function refreshStockSnapshotsScheduled_() {
  const result = refreshStockSnapshotsCore_('SYSTEM', todayDate_());
  appendRecord_('AuditLog', { LogID: makeId_('LOG'), Timestamp: isoNow_(), UserID: 'SYSTEM', Module: 'investments', EntityID: '', Action: 'GOOGLEFINANCE_SCHEDULED_REFRESH', BeforeJSON: '', AfterJSON: safeJson_(result), Notes: 'Snapshot Saham diperbarui oleh trigger harian.' });
  return result;
}

function setupDailyStockSnapshotTrigger() {
  const triggers = ScriptApp.getProjectTriggers().filter((trigger) => trigger.getHandlerFunction() === 'refreshStockSnapshotsScheduled_');
  triggers.forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('refreshStockSnapshotsScheduled_').timeBased().everyDays(1).atHour(18).create();
  return { success: true, message: 'Trigger harian dibuat untuk sekitar pukul 18.00 zona waktu spreadsheet.' };
}

function saveInvestmentSnapshot(token, payload) {
  beginRequestCache_();
  const session = requireSession_(token);
  const input = payload || {};
  const investment = findRecord_('Investments', 'InvestmentID', input.InvestmentID);
  if (!investment) throw new Error('Posisi investasi tidak ditemukan.');
  if (!normalizeDate_(input.AsOfDate)) throw new Error('Tanggal nilai wajib diisi.');
  if (toNumber_(input.Price) < 0 || toNumber_(input.MarketValue) < 0) throw new Error('Harga dan nilai pasar tidak boleh negatif.');
  const record = { SnapshotID: makeId_('SNAP'), InvestmentID: investment.InvestmentID, AsOfDate: normalizeDate_(input.AsOfDate), Quantity: input.Quantity === undefined || input.Quantity === '' ? toNumber_(investment.Quantity) : toNumber_(input.Quantity), Price: toNumber_(input.Price), MarketValue: toNumber_(input.MarketValue), Notes: input.Notes || '', CreatedBy: session.userId, CreatedAt: isoNow_() };
  appendRecord_('InvestmentSnapshots', record);
  investment.CurrentPrice = record.Price; investment.CurrentValue = record.MarketValue; investment.AsOfDate = record.AsOfDate; investment.MarketSource = input.MarketSource || investment.MarketSource || 'MANUAL'; investment.UpdatedAt = record.CreatedAt;
  updateRecord_('Investments', investment.__rowNumber, investment);
  auditForSession_(session, 'investments', investment.InvestmentID, 'SNAPSHOT', null, publicRecord_(record), 'Snapshot nilai investasi dicatat.');
  return { success: true, record: publicRecord_(record) };
}

function saveAssetAdjustment(token, payload) {
  beginRequestCache_();
  const session = requireSession_(token);
  const input = payload || {};
  if (!input.AssetID || !findRecord_('Assets', 'AssetID', input.AssetID)) throw new Error('Aset yang dipilih tidak ditemukan.');
  if (!normalizeDate_(input.AdjustmentDate)) throw new Error('Tanggal penyesuaian wajib diisi.');
  if (String(input.AdjustmentType || '').toUpperCase() !== 'RENOVATION') throw new Error('Jenis penyesuaian yang tersedia saat ini adalah Renovasi.');
  if (toNumber_(input.Amount) <= 0) throw new Error('Nilai renovasi harus lebih besar dari nol.');
  const record = { AdjustmentID: makeId_('ADJ'), AssetID: input.AssetID, AdjustmentDate: normalizeDate_(input.AdjustmentDate), AdjustmentType: 'RENOVATION', Amount: toNumber_(input.Amount), Notes: input.Notes || '', CreatedBy: session.userId, CreatedAt: isoNow_() };
  appendRecord_('AssetAdjustments', record);
  auditForSession_(session, 'assets', input.AssetID, 'RENOVATION', null, publicRecord_(record), 'Renovasi aset dicatat.');
  return { success: true, record: publicRecord_(record) };
}

function moduleDisplayWarnings_(moduleKey, rows) {
  const values = rows || [];
  const warnings = [];
  if (moduleKey === 'income') {
    const missingOperating = values.filter((row) => String(row.OperatingIncome || '').trim() === '').length;
    if (missingOperating) warnings.push(missingOperating + ' transaksi Penerimaan belum memiliki klasifikasi Operating Income. Isi Ya/Tidak agar Dashboard, Arus Kas, dan baseline Anggaran dapat menghitungnya.');
  }
  if (moduleKey === 'goals') {
    const missingContribution = values.filter((row) => String(row.Status || '').toUpperCase() === 'ACTIVE' && (row.MonthlyContribution === '' || row.MonthlyContribution === null || row.MonthlyContribution === undefined)).length;
    if (missingContribution) warnings.push(missingContribution + ' Rencana Keuangan aktif belum memiliki Kontribusi Bulanan; kategori otomatis belum memiliki planned share.');
  }
  return warnings;
}

function assetStatusArchiveLabel_(status) { return ({ VOID: 'Void', SOLD: 'Dijual', GIFTED: 'Dihibahkan', DAMAGED: 'Rusak', LOST: 'Hilang' }[String(status || '').toUpperCase()] || 'Arsip'); }
const VOID_ARCHIVE_MODULES = ['income', 'expenses', 'transfers', 'cash', 'inventory', 'assets', 'debts', 'investments', 'accounts', 'goals', 'budget', 'shopping', 'savings', 'policy', 'budgetCategory'];
function getVoidArchiveData(token) {
  beginRequestCache_();
  const session = requireSession_(token);
  const auditRows = sheetRecords_('AuditLog').filter((row) => { const action = String(row.Action || '').toUpperCase(); const module = String(row.Module || '').toLowerCase(); return action === 'VOID' || (module === 'assets' && action === 'STATUS_CHANGE'); });
  const voidTimes = {};
  auditRows.forEach((row) => { const key = String(row.Module || '') + '|' + String(row.EntityID || ''); if (!voidTimes[key] || String(row.Timestamp || '') > String(voidTimes[key])) voidTimes[key] = row.Timestamp || ''; });
  const modules = {};
  VOID_ARCHIVE_MODULES.forEach((moduleKey) => {
    const meta = ENTITY_META[moduleKey]; if (!meta) return;
    const sourceRows = sheetRecords_(meta.sheet);
    const rows = sourceRows.filter((row) => {
      const status = String(row.Status || '').toUpperCase();
      const active = String(row.Active || '').toUpperCase();
      if (moduleKey === 'assets') return ['VOID', 'SOLD', 'GIFTED', 'DAMAGED', 'LOST'].includes(status);
      return status === 'VOID' || ['FALSE', '0', 'INACTIVE'].includes(active);
    }).sort((a, b) => String(voidTimes[moduleKey + '|' + String(b[meta.idField] || '')] || b.UpdatedAt || b.CreatedAt || '').localeCompare(String(voidTimes[moduleKey + '|' + String(a[meta.idField] || '')] || a.UpdatedAt || a.CreatedAt || '')));
    const archiveRows = (rows || []).map((row) => { const copy = publicRecord_(row); copy.ArchiveStatus = moduleKey === 'assets' ? String(row.Status || 'VOID').toUpperCase() : 'VOID'; copy.ArchivedAt = voidTimes[moduleKey + '|' + String(row[meta.idField] || '')] || row.VoidedAt || row.UpdatedAt || ''; return copy; });
    if (moduleKey === 'assets') {
      const assetColumns = (SHEET_SCHEMAS[meta.sheet] || []).concat(['ArchiveStatus', 'ArchivedAt']);
      const subtabs = {};
      ['VOID', 'SOLD', 'GIFTED', 'DAMAGED', 'LOST'].forEach((status) => { subtabs[status] = { module: 'assets', label: assetStatusArchiveLabel_(status), status: status, columns: assetColumns, rows: archiveRows.filter((row) => String(row.ArchiveStatus || '').toUpperCase() === status) }; });
      modules[moduleKey] = { module: moduleKey, label: MODULE_CONFIG[moduleKey].label, columns: assetColumns, rows: archiveRows, subtabs: subtabs };
    } else modules[moduleKey] = { module: moduleKey, label: MODULE_CONFIG[moduleKey].label, columns: (SHEET_SCHEMAS[meta.sheet] || []).concat(['ArchiveStatus', 'ArchivedAt']), rows: archiveRows };
  });
  auditForSession_(session, 'voidArchive', '', 'VIEW', null, { modules: Object.keys(modules), count: Object.keys(modules).reduce((sum, key) => sum + modules[key].rows.length, 0) }, 'Arsip Void viewed.');
  return { module: 'voidArchive', label: MODULE_CONFIG.voidArchive.label, modules: modules };
}
function getModuleData(token, moduleKey, requestedPeriod) {
  beginRequestCache_();
  const session = requireSession_(token);
  if (moduleKey === 'voidArchive') return getVoidArchiveData(token);
  if (moduleKey === 'dashboard') return getDashboardData(token, currentPeriod_());
  if (moduleKey === 'about') return getAboutApplicationData_(session);
  if (moduleKey === 'budget') return getBudgetModuleData_(session, requestedPeriod);
  if (moduleKey === 'policy') return getBudgetPolicyData_(session);
  if (moduleKey === 'transfers') return getTransferModuleData_(session);
  if (moduleKey === 'assets') return getAssetModuleData_(session);
  if (moduleKey === 'investments') return getInvestmentModuleData_(session);
  if (moduleKey === 'debts') return getDebtModuleData_(session);
  if (moduleKey === 'inventory') return getInventoryModuleData_(session);
  if (moduleKey === 'savings') return getSavingsModuleData_(session);
  if (moduleKey === 'audit') {
    const logs = sheetRecords_('AuditLog').sort((a, b) => String(b.Timestamp).localeCompare(String(a.Timestamp))).slice(0, 250);
    return { module: moduleKey, label: MODULE_CONFIG[moduleKey].label, columns: SHEET_SCHEMAS.AuditLog, rows: publicRecords_(logs) };
  }
  const meta = ENTITY_META[moduleKey];
  if (!meta) throw new Error('Modul tidak dikenali: ' + moduleKey);
  const rows = activeRecords_(meta.sheet, 'Status').sort((a, b) => String(b.CreatedAt || '').localeCompare(String(a.CreatedAt || '')));
  const warnings = moduleDisplayWarnings_(moduleKey, rows);
  auditForSession_(session, moduleKey, '', 'VIEW', null, { count: rows.length }, 'Module viewed.');
  return { module: moduleKey, label: MODULE_CONFIG[moduleKey].label, columns: SHEET_SCHEMAS[meta.sheet], rows: publicRecords_(rows), warnings: warnings };
}

function saveShoppingRecord_(session, input) {
  validateModulePayload_('shopping', input);
  return withLock_(() => {
    const timestamp = isoNow_();
    const requestedId = String(input.recordId || input.ShoppingID || '').trim();
    const existing = requestedId ? findRecord_('ShoppingList', 'ShoppingID', requestedId) : null;
    const existingStatus = String(existing && existing.Status || '').toUpperCase();
    const nextStatus = String(input.Status || (existing && existing.Status) || 'WISHLIST').toUpperCase();
    if (existingStatus === 'EXPENSE' && nextStatus !== 'EXPENSE') throw new Error('Item yang sudah menjadi Pengeluaran tidak dapat dikembalikan ke daftar aktif.');
    const linkedBudget = input.BudgetID ? findRecord_('Budgets', 'BudgetID', input.BudgetID) : null;
    const record = Object.assign({}, existing || {}, input, {
      ShoppingID: existing ? existing.ShoppingID : makeId_('SHOP'),
      BudgetCategory: linkedBudget ? linkedBudget.Category : (input.BudgetCategory || (existing && existing.BudgetCategory) || ''),
      EstimatedAmount: toNumber_(input.EstimatedAmount),
      ActualAmount: input.ActualAmount === undefined || input.ActualAmount === '' ? (existing ? toNumber_(existing.ActualAmount) : 0) : toNumber_(input.ActualAmount),
      Quantity: input.Quantity === undefined || input.Quantity === '' ? 1 : toNumber_(input.Quantity),
      Status: nextStatus,
      CreatedBy: existing ? existing.CreatedBy : session.userId,
      CreatedAt: existing ? existing.CreatedAt : timestamp,
      UpdatedAt: timestamp,
    });
    delete record.recordId;
    delete record.__rowNumber;
    if (existing) updateRecord_('ShoppingList', existing.__rowNumber, record); else appendRecord_('ShoppingList', record);
    auditForSession_(session, 'shopping', record.ShoppingID, existing ? 'UPDATE' : 'CREATE', existing ? publicRecord_(existing) : null, publicRecord_(record), 'Daftar Belanja disimpan.');
    return { success: true, action: existing ? 'UPDATE' : 'CREATE', record: publicRecord_(record) };
  });
}

function syncGoalBudgetCategory_(session, goal, existing, timestamp) {
  const activeStatus = String(goal.Status || (existing && existing.Status) || 'ACTIVE').toUpperCase();
  const parentId = String(goal.BudgetParentCategoryID || (existing && existing.BudgetParentCategoryID) || '').trim();
  if (!parentId) throw new Error('Pilih Kategori Induk Anggaran untuk Rencana Keuangan ini.');
  const policy = activePolicyForPeriod_(currentPeriod_());
  if (!policy) throw new Error('Kebijakan Anggaran aktif belum tersedia untuk menempatkan Rencana Keuangan.');
  const categories = activeRecords_('BudgetCategories', 'Active').filter((row) => String(row.PolicyID || '') === String(policy.PolicyID));
  const parent = categories.find((row) => String(row.CategoryID || '') === parentId);
  if (!parent) throw new Error('Kategori Induk Anggaran tidak ditemukan pada Kebijakan Anggaran aktif.');
  const parentLevel = toNumber_(parent.Level);
  if (parentLevel >= 2) throw new Error('Kategori Induk Rencana Keuangan maksimal berada pada level Kategori atau Sub Kategori.');
  const parentPathParts = [parent.Name];
  let ancestorId = String(parent.ParentCategoryID || '');
  while (ancestorId) { const ancestor = categories.find((row) => String(row.CategoryID || '') === ancestorId); if (!ancestor) break; parentPathParts.unshift(ancestor.Name); ancestorId = String(ancestor.ParentCategoryID || ''); }
  const parentPath = parentPathParts.join(' · ');
  const categoryId = String(goal.BudgetCategoryID || (existing && existing.BudgetCategoryID) || '').trim();
  let category = categoryId ? findRecord_('BudgetCategories', 'CategoryID', categoryId) : null;
  const siblings = categories.filter((row) => String(row.ParentCategoryID || '') === String(parent.CategoryID || '') && String(row.CategoryID || '') !== String(categoryId || ''));
  const nextSortOrder = siblings.reduce((max, row) => Math.max(max, toNumber_(row.SortOrder)), 0) + 1;
  if (category && String(category.PolicyID || '') !== String(policy.PolicyID)) category = null;
  const nextCategory = Object.assign({}, category || {}, {
    CategoryID: category ? category.CategoryID : makeId_('CAT'), PolicyID: policy.PolicyID, ParentCategoryID: parent.CategoryID,
    Name: String(goal.Name || '').trim(), Level: parentLevel + 1,
    ImportanceAyah: parent.ImportanceAyah, ImportanceBunda: parent.ImportanceBunda, UrgencyAyah: parent.UrgencyAyah, UrgencyBunda: parent.UrgencyBunda,
    ImportanceScore: parent.ImportanceScore, UrgencyScore: parent.UrgencyScore, Quadrant: parent.Quadrant, SortOrder: category ? category.SortOrder : nextSortOrder,
    Active: activeStatus !== 'COMPLETED_ARCHIVED', CreatedBy: category ? category.CreatedBy : 'SYSTEM_GOAL', CreatedAt: category ? category.CreatedAt : timestamp, UpdatedAt: timestamp,
    ImportanceAyahAt: parent.ImportanceAyahAt, ImportanceBundaAt: parent.ImportanceBundaAt, UrgencyAyahAt: parent.UrgencyAyahAt, UrgencyBundaAt: parent.UrgencyBundaAt,
    Notes: 'Kategori otomatis dari Rencana Keuangan ' + String(goal.GoalID || '') + '. Rule mengikuti Kategori Induk Anggaran.'
  });
  delete nextCategory.__rowNumber;
  if (category) updateRecord_('BudgetCategories', category.__rowNumber, nextCategory); else appendRecord_('BudgetCategories', nextCategory);
  goal.BudgetParentCategoryID = parent.CategoryID;
  goal.BudgetParentCategoryPath = parentPath;
  goal.BudgetCategoryID = nextCategory.CategoryID;
  if (policy && ['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED', 'AMENDMENT'].includes(String(policy.Status || '').toUpperCase())) rebuildCategoryAllocations_(policy.PolicyID, currentPeriod_());
  return nextCategory;
}

function activeBudgetCategoryForExpense_(period, categoryId) {
  const context = budgetPolicyContext_(period);
  if (!context.ready || !context.policy) throw new Error('Kebijakan Anggaran aktif belum tersedia pada periode Pengeluaran ini.');
  const category = (context.categories || []).find((item) => String(item.CategoryID || '') === String(categoryId || ''));
  if (!category || !category.IsLeaf) throw new Error('Pilih Kategori Anggaran terakhir, bukan kategori induk.');
  const byId = {}; (context.categories || []).forEach((item) => { byId[String(item.CategoryID || '')] = item; });
  return category;
}
function activeHouseholdBudgetCategory_(period, categoryId) { return activeBudgetCategoryForExpense_(period, categoryId); }

function budgetIdForCategory_(period, categoryId) {
  return activeRecords_('Budgets', 'Status').filter((row) => periodKey_(row.Period) === periodKey_(period) && String(row.CategoryID || '') === String(categoryId || '')).sort((a, b) => String(b.UpdatedAt || b.CreatedAt || '').localeCompare(String(a.UpdatedAt || a.CreatedAt || '')))[0] || null;
}

function voidPendingBudgetFundingPlans_(session, sheet, idField, budgetId, timestamp) {
  activeRecords_(sheet).filter((row) => String(row.Origin || '').toUpperCase() === 'BUDGET_ALLOCATION' && String(row.BudgetID || '') === String(budgetId || '') && String(row.ExecutionStatus || 'BELUM').toUpperCase() !== 'SUDAH').forEach((row) => {
    const before = publicRecord_(row); row.Status = 'VOID'; row.UpdatedAt = timestamp; updateRecord_(sheet, row.__rowNumber, row); auditForSession_(session, sheet === 'Transfers' ? 'transfers' : 'cash', row[idField], 'BUDGET_FUNDING_REPLACED', before, publicRecord_(row), 'Rencana penyaluran lama dinonaktifkan karena metode Alokasi Anggaran berubah.');
  });
}

function syncBudgetFundingPlan_(session, budget, existingBudget, timestamp) {
  const method = String(budget.AllocationMethod || budget.PaymentMethod || '').toUpperCase();
  const amount = toNumber_(budget.AllocatedAmount);
  const completedPlans = activeRecords_('Transfers').concat(activeRecords_('CashMovements')).filter((row) => String(row.Origin || '').toUpperCase() === 'BUDGET_ALLOCATION' && String(row.BudgetID || '') === String(budget.BudgetID || '') && String(row.ExecutionStatus || '').toUpperCase() === 'SUDAH');
  if (completedPlans.length) {
    const plannedDate = normalizeDate_(budget.AllocationDate || (String(budget.Period || '').slice(0, 7) + '-01')) || todayDate_();
    const matching = completedPlans.find((row) => (method === 'TRANSFER' && row.TransferID) || (method === 'CASH' && row.CashID));
    const same = matching && Math.abs(toNumber_(matching.Amount) - amount) < 0.001 && String(matching.SourceAccountID || '') === String(budget.SourceAccountID || '') && String(matching.DestinationAccountID || '') === String(budget.DestinationAccountID || '') && normalizeDate_(matching.TransactionDate || matching.PlannedDate) === plannedDate;
    if (!same) throw new Error('Rencana penyaluran ini sudah berstatus Sudah. Kembalikan status menjadi Belum sebelum mengubah nominal, metode, rekening, atau tanggal.');
  }
  if (amount <= 0 || !['TRANSFER', 'CASH'].includes(method)) {
    voidPendingBudgetFundingPlans_(session, 'Transfers', 'TransferID', budget.BudgetID, timestamp); voidPendingBudgetFundingPlans_(session, 'CashMovements', 'CashID', budget.BudgetID, timestamp);
    return { method: method, planned: false, clearedPending: true };
  }
  if (method === 'TRANSFER') voidPendingBudgetFundingPlans_(session, 'CashMovements', 'CashID', budget.BudgetID, timestamp);
  if (method === 'CASH') voidPendingBudgetFundingPlans_(session, 'Transfers', 'TransferID', budget.BudgetID, timestamp);
  const plannedDate = normalizeDate_(budget.AllocationDate || (String(budget.Period || '').slice(0, 7) + '-01')) || todayDate_();
  const sourceId = String(budget.SourceAccountID || '').trim();
  const destinationId = String(budget.DestinationAccountID || '').trim();
  if (method === 'TRANSFER') {
    if (!sourceId || !destinationId) throw new Error('Rencana Transfer membutuhkan Rekening Sumber dan Rekening Tujuan.');
    if (sourceId === destinationId) throw new Error('Rekening sumber dan tujuan rencana Transfer harus berbeda.');
    const source = findRecord_('Accounts', 'AccountID', sourceId); const destination = findRecord_('Accounts', 'AccountID', destinationId);
    if (!source || String(source.Status || '').toUpperCase() !== 'ACTIVE' || !destination || String(destination.Status || '').toUpperCase() !== 'ACTIVE') throw new Error('Rekening sumber dan tujuan rencana Transfer harus aktif.');
    const plans = activeRecords_('Transfers').filter((row) => String(row.Origin || '').toUpperCase() === 'BUDGET_ALLOCATION' && String(row.BudgetID || '') === String(budget.BudgetID || ''));
    const plan = plans.sort((a, b) => String(b.UpdatedAt || b.CreatedAt || '').localeCompare(String(a.UpdatedAt || a.CreatedAt || '')))[0] || null;
    if (plan && String(plan.ExecutionStatus || 'BELUM').toUpperCase() === 'SUDAH') return { method: method, planned: true, transferId: plan.TransferID, preservedCompleted: true };
    const record = Object.assign({}, plan || {}, { TransferID: plan ? plan.TransferID : makeId_('TRF'), TransactionDate: plannedDate, BookDate: plannedDate, SourceAccountID: sourceId, DestinationAccountID: destinationId, Amount: amount, Notes: String(budget.Notes || 'Rencana transfer dari Alokasi Anggaran ' + budget.BudgetID), Status: 'ACTIVE', CreatedBy: plan ? plan.CreatedBy : session.userId, CreatedAt: plan ? plan.CreatedAt : timestamp, ExpenseID: '', Origin: 'BUDGET_ALLOCATION', BudgetID: budget.BudgetID, BudgetCategoryID: budget.CategoryID, ExecutionStatus: 'BELUM', PlannedDate: plannedDate, CompletedAt: '', RelatedPlannedTransferID: '' , UpdatedAt: timestamp });
    if (plan) updateRecord_('Transfers', plan.__rowNumber, record); else appendRecord_('Transfers', record);
    return { method: method, planned: true, transferId: record.TransferID, executionStatus: record.ExecutionStatus };
  }
  if (method === 'CASH') {
    if (!sourceId) throw new Error('Rencana Pengambilan Tunai membutuhkan Rekening Sumber.');
    const source = findRecord_('Accounts', 'AccountID', sourceId);
    if (!source || String(source.Status || '').toUpperCase() !== 'ACTIVE') throw new Error('Rekening sumber Pengambilan Tunai harus aktif.');
    const plans = activeRecords_('CashMovements').filter((row) => String(row.Origin || '').toUpperCase() === 'BUDGET_ALLOCATION' && String(row.BudgetID || '') === String(budget.BudgetID || ''));
    const plan = plans.sort((a, b) => String(b.UpdatedAt || b.CreatedAt || '').localeCompare(String(a.UpdatedAt || a.CreatedAt || '')))[0] || null;
    if (plan && String(plan.ExecutionStatus || 'BELUM').toUpperCase() === 'SUDAH') return { method: method, planned: true, cashId: plan.CashID, preservedCompleted: true };
    const record = Object.assign({}, plan || {}, { CashID: plan ? plan.CashID : makeId_('CASH'), TransactionDate: plannedDate, MovementType: 'WITHDRAWAL', Amount: amount, SourceAccountID: sourceId, ExpenseID: '', Notes: String(budget.Notes || 'Rencana pengambilan tunai dari Alokasi Anggaran ' + budget.BudgetID), Status: 'ACTIVE', CreatedBy: plan ? plan.CreatedBy : session.userId, CreatedAt: plan ? plan.CreatedAt : timestamp, Origin: 'BUDGET_ALLOCATION', BudgetID: budget.BudgetID, BudgetCategoryID: budget.CategoryID, ExecutionStatus: 'BELUM', PlannedDate: plannedDate, CompletedAt: '', RelatedPlannedCashID: '', UpdatedAt: timestamp });
    if (plan) updateRecord_('CashMovements', plan.__rowNumber, record); else appendRecord_('CashMovements', record);
    return { method: method, planned: true, cashId: record.CashID, executionStatus: record.ExecutionStatus };
  }
  throw new Error('Cara penyaluran Anggaran harus Pengambilan Tunai atau Transfer.');
}

function setBudgetFundingExecution(token, origin, recordId, completed) {
  beginRequestCache_();
  const session = requireSession_(token);
  const type = String(origin || '').toUpperCase();
  if (!['TRANSFER', 'CASH'].includes(type)) throw new Error('Jenis rencana penyaluran tidak valid.');
  return withLock_(() => {
    const sheet = type === 'TRANSFER' ? 'Transfers' : 'CashMovements';
    const idField = type === 'TRANSFER' ? 'TransferID' : 'CashID';
    const row = findRecord_(sheet, idField, recordId);
    if (!row || String(row.Origin || '').toUpperCase() !== 'BUDGET_ALLOCATION') throw new Error('Rencana penyaluran Anggaran tidak ditemukan.');
    const before = publicRecord_(row); const next = String(completed ? 'SUDAH' : 'BELUM'); row.ExecutionStatus = next; row.CompletedAt = completed ? isoNow_() : ''; row.UpdatedAt = isoNow_();
    updateRecord_(sheet, row.__rowNumber, row);
    auditForSession_(session, type === 'TRANSFER' ? 'transfers' : 'cash', recordId, 'BUDGET_FUNDING_STATUS', before, publicRecord_(row), 'Status rencana penyaluran Anggaran diperbarui.');
    return { success: true, record: publicRecord_(row) };
  });
}

function saveModuleRecord(token, moduleKey, payload) {
  beginRequestCache_();
  const session = requireSession_(token);
  if (moduleKey === 'shopping') return saveShoppingRecord_(session, payload || {});
  if (moduleKey === 'expenses') return saveExpenseWithRouting_(session, payload || {});
  if (moduleKey === 'policy') throw new Error('Gunakan editor Kebijakan Anggaran untuk menyimpan struktur dan penilaian.');
  const meta = ENTITY_META[moduleKey];
  if (!meta) throw new Error('Modul tidak dapat diubah: ' + moduleKey);
  const input = payload || {};
  validateModulePayload_(moduleKey, input);
  if (moduleKey === 'budgetCategory') {
    const policy = findRecord_('BudgetPolicies', 'PolicyID', input.PolicyID);
    if (!policy) throw new Error('Kebijakan Anggaran tidak ditemukan.');
    if (String(policy.Status || '').toUpperCase() !== 'DRAFT' || policy.SubmittedAt) throw new Error('Kategori hanya dapat diubah pada Draft Kebijakan Anggaran yang belum diajukan.');
    if (String(policy.CreatedBy || '') !== String(session.userId || '')) throw new Error('Hanya pembuat Draft yang dapat mengubah kategori anggaran.');
  }
  return withLock_(() => {
    const timestamp = isoNow_();
    const requestedId = String(input.recordId || input[meta.idField] || '').trim();
    let existing = requestedId ? findRecord_(meta.sheet, meta.idField, requestedId) : null;
    if (!existing && moduleKey === 'budget') {
      const targetPeriod = periodKey_(input.Period);
      const targetPolicyId = String(input.PolicyID || '');
      const targetCategoryId = String(input.CategoryID || '');
      existing = activeRecords_('Budgets', 'Status').filter((row) => periodKey_(row.Period) === targetPeriod && String(row.PolicyID || '') === targetPolicyId && String(row.CategoryID || '') === targetCategoryId).sort((a, b) => String(b.UpdatedAt || b.CreatedAt || '').localeCompare(String(a.UpdatedAt || a.CreatedAt || '')))[0] || null;
    }
    const record = Object.assign({}, input);
    if (moduleKey === 'goals') {
      const requestedStatus = String(record.Status || '').toUpperCase();
      if (requestedStatus === 'COMPLETED_ARCHIVED') {
        if (!existing) throw new Error('Rencana baru harus disimpan sebagai rencana aktif terlebih dahulu.');
        record.Status = 'COMPLETED_ARCHIVED';
      } else if (existing && String(existing.Status || '').toUpperCase() === 'COMPLETED_ARCHIVED') {
        throw new Error('Rencana yang sudah selesai dan diarsipkan tidak dapat diedit.');
      } else {
        record.Status = existing ? (existing.Status || 'ACTIVE') : 'ACTIVE';
      }
    }
    delete record.recordId;
    delete record.__rowNumber;
    record[meta.idField] = existing ? existing[meta.idField] : makeId_(meta.prefix);
    if (moduleKey === 'inventory') record.Active = existing ? String(existing.Active).toUpperCase() !== 'FALSE' : true;
    if (!existing) {
      if (record.Status === undefined || record.Status === '') record.Status = 'ACTIVE';
      if (record.CreatedBy === undefined) record.CreatedBy = session.userId;
      if (record.CreatedAt === undefined) record.CreatedAt = timestamp;
      if (moduleKey === 'debts') { record.RemainingPrincipal = toNumber_(record.InitialPrincipal); record.ScheduleSource = 'ESTIMATE'; record.LastSchedulePeriod = 0; }
      if (moduleKey === 'investments' && (record.CurrentValue === undefined || record.CurrentValue === '')) record.CurrentValue = toNumber_(record.CostBasis);
    }
    record.UpdatedAt = timestamp;
    if (moduleKey === 'goals') syncGoalBudgetCategory_(session, record, existing, timestamp);

      if (existing) {
        const merged = Object.assign({}, existing, record);
        updateRecord_(meta.sheet, existing.__rowNumber, merged);
        if (moduleKey === 'budgetCategory') rebuildCategoryAllocations_(record.PolicyID, currentPeriod_());
        const fundingPlan = moduleKey === 'budget' ? syncBudgetFundingPlan_(session, merged, existing, timestamp) : null;
        auditForSession_(session, moduleKey, record[meta.idField], 'UPDATE', publicRecord_(existing), publicRecord_(merged), 'Record updated.');
        return { success: true, action: 'UPDATE', record: publicRecord_(merged), fundingPlan: fundingPlan };
      }

      appendRecord_(meta.sheet, record);
      if (moduleKey === 'budgetCategory') rebuildCategoryAllocations_(record.PolicyID, currentPeriod_());
      const fundingPlan = moduleKey === 'budget' ? syncBudgetFundingPlan_(session, record, null, timestamp) : null;
    auditForSession_(session, moduleKey, record[meta.idField], 'CREATE', null, publicRecord_(record), 'Record created.');
    return { success: true, action: 'CREATE', record: publicRecord_(record), fundingPlan: fundingPlan };
  });
}

function changeAssetStatus(token, assetId, status, note) {
  beginRequestCache_();
  const session = requireSession_(token);
  const allowed = ['ACTIVE', 'SOLD', 'GIFTED', 'DAMAGED', 'LOST'];
  const nextStatus = String(status || '').toUpperCase();
  if (!allowed.includes(nextStatus)) throw new Error('Status aset tidak valid.');
  return withLock_(() => {
    const existing = findRecord_('Assets', 'AssetID', assetId);
    if (!existing) throw new Error('Aset tidak ditemukan.');
    const before = publicRecord_(existing);
    existing.Status = nextStatus;
    if (note !== undefined && note !== null && String(note).trim()) existing.Notes = String(note).trim();
    existing.UpdatedAt = isoNow_();
    updateRecord_('Assets', existing.__rowNumber, existing);
    auditForSession_(session, 'assets', assetId, 'STATUS_CHANGE', before, publicRecord_(existing), 'Status aset diperbarui.');
    return { success: true, record: publicRecord_(existing) };
  });
}

function voidModuleRecord(token, moduleKey, recordId) {
  beginRequestCache_();
  if (moduleKey === 'policy') return policyAction(token, recordId, 'VOID');
  const session = requireSession_(token);
  const meta = ENTITY_META[moduleKey];
  if (!meta) throw new Error('Modul tidak dapat diubah: ' + moduleKey);
  const existing = findRecord_(meta.sheet, meta.idField, recordId);
  if (!existing) throw new Error('Record tidak ditemukan.');
  const before = publicRecord_(existing);
  if (moduleKey === 'shopping' && String(existing.Status || '').toUpperCase() === 'EXPENSE') throw new Error('Item yang sudah menjadi Pengeluaran tidak dapat di-void dari Daftar Belanja.');
  if (moduleKey === 'budgetCategory') {
    const policy = findRecord_('BudgetPolicies', 'PolicyID', existing.PolicyID);
    if (!policy || String(policy.Status || '').toUpperCase() !== 'DRAFT' || policy.SubmittedAt || String(policy.CreatedBy || '') !== String(session.userId || '')) throw new Error('Kategori hanya dapat di-void oleh pembuat Draft yang belum diajukan.');
  }
  if (moduleKey === 'inventory') existing.Active = false;
  else existing.Status = 'VOID';
  if (moduleKey === 'budgetCategory') existing.Active = false;
  existing.UpdatedAt = isoNow_();
  updateRecord_(meta.sheet, existing.__rowNumber, existing);
  if (moduleKey === 'budgetCategory') rebuildCategoryAllocations_(existing.PolicyID, currentPeriod_());
  auditForSession_(session, moduleKey, recordId, 'VOID', before, publicRecord_(existing), 'Record di-void, histori dipertahankan.');
  return { success: true, record: publicRecord_(existing) };
}

function savePolicyEditor(token, payload) {
  beginRequestCache_();
  const session = requireSession_(token);
  const input = payload || {};
  const action = String(input.action || 'SAVE').toUpperCase();
  if (action === 'CONFIRM') return policyActionWithSession_(session, String(input.PolicyID || ''), 'CONFIRM');
  const requestedId = String(input.recordId || input.PolicyID || '').trim();
  const existing = requestedId ? findRecord_('BudgetPolicies', 'PolicyID', requestedId) : null;
  const isNew = !existing;
  const role = String(session.role || '').toUpperCase();
  if (!['AYAH', 'BUNDA'].includes(role)) throw new Error('Role tidak berwenang mengisi penilaian Kebijakan Anggaran.');
  if (action !== 'SCORE') {
    if (role !== 'AYAH') throw new Error('Dalam workflow ini, hanya Ayah yang membuat struktur dan mengajukan Kebijakan Anggaran.');
    if (!input.Name) throw new Error('Nama Kebijakan Anggaran wajib diisi.');
    if (!normalizeDate_(input.EffectiveFrom)) throw new Error('Tanggal mulai kebijakan wajib diisi.');
    if (input.EffectiveTo && !normalizeDate_(input.EffectiveTo)) throw new Error('Tanggal selesai kebijakan tidak valid.');
    if (input.EffectiveTo && normalizeDate_(input.EffectiveTo) < normalizeDate_(input.EffectiveFrom)) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  }
  if (action === 'SCORE') {
    if (role !== 'BUNDA') throw new Error('Hanya Bunda yang mengisi penilaian pasangan pada workflow ini.');
    if (!existing) throw new Error('Kebijakan untuk dinilai tidak ditemukan.');
    if (String(existing.Status || '').toUpperCase() !== 'WAITING_PARTNER_SCORE') throw new Error('Kebijakan belum berada pada tahap penilaian pasangan.');
    if (String(existing.CreatedBy || '') === String(session.userId || '')) throw new Error('Pengaju tidak dapat mengisi penilaian pasangannya sendiri.');
  } else if (!isNew && (String(existing.Status || '').toUpperCase() !== 'DRAFT' || existing.SubmittedAt || String(existing.CreatedBy || '') !== String(session.userId || ''))) {
    throw new Error('Struktur hanya dapat diubah oleh pembuat Draft yang belum diajukan.');
  }
  const incoming = Array.isArray(input.categories) ? input.categories : [];
  if (!incoming.length) throw new Error('Tambahkan sekurang-kurangnya satu kategori anggaran.');
  const oldCategories = existing ? activeRecords_('BudgetCategories', 'Active').filter((row) => String(row.PolicyID || '') === String(existing.PolicyID || '')) : [];
  if (action === 'SCORE' && incoming.length !== oldCategories.length) throw new Error('Struktur kategori tidak boleh berubah saat penilaian pasangan.');
  const policyId = existing ? existing.PolicyID : makeId_('POL');
  const categoryIdMap = {};
  const incomingByRawId = {};
  const oldByCategoryId = {};
  incoming.forEach((category, index) => { incomingByRawId[String(category.CategoryID || 'tmp-' + index)] = category; });
  oldCategories.forEach((row) => { oldByCategoryId[String(row.CategoryID)] = row; });
  incoming.forEach((category, index) => { const rawId = String(category.CategoryID || 'tmp-' + index); const old = oldByCategoryId[rawId]; categoryIdMap[rawId] = old ? old.CategoryID : makeId_('CAT'); });
  const prepared = incoming.map((category, index) => {
    const rawId = String(category.CategoryID || 'tmp-' + index);
    const categoryId = categoryIdMap[rawId];
    const level = category.Level === undefined || category.Level === '' ? 0 : toNumber_(category.Level);
    if (![0, 1, 2].includes(level)) throw new Error('Level kategori harus 0, 1, atau 2.');
    const parentRaw = String(category.ParentCategoryID || '').trim();
    const parentId = parentRaw ? (categoryIdMap[parentRaw] || parentRaw) : '';
    if (parentId === categoryId) throw new Error('Kategori tidak boleh menjadi parent dirinya sendiri.');
    const parent = parentId ? incomingByRawId[parentRaw] || oldByCategoryId[parentId] : null;
    if (parent && level !== toNumber_(parent.Level) + 1) throw new Error('Level subkategori harus satu tingkat di bawah parent-nya.');
    const old = oldByCategoryId[String(categoryId)];
    if (action === 'SCORE' && (!old || String(old.Name || '').trim() !== String(category.Name || '').trim() || String(old.ParentCategoryID || '') !== String(parentId || '') || toNumber_(old.Level) !== level || toNumber_(old.SortOrder) !== toNumber_(category.SortOrder))) throw new Error('Nama, hierarki, dan urutan tidak boleh diubah saat penilaian pasangan.');
    const record = Object.assign({}, old || {}, { CategoryID: categoryId, PolicyID: policyId, ParentCategoryID: parentId, Name: String(category.Name || '').trim(), Level: level, SortOrder: category.SortOrder === undefined || category.SortOrder === '' ? index : toNumber_(category.SortOrder), Active: true, UpdatedAt: isoNow_() });
    if (!record.Name) throw new Error('Nama kategori, subkategori, atau sub-subkategori wajib diisi.');
    const importanceField = role === 'AYAH' ? 'ImportanceAyah' : 'ImportanceBunda';
    const urgencyField = role === 'AYAH' ? 'UrgencyAyah' : 'UrgencyBunda';
    const importance = toNumber_(category[importanceField]);
    const urgency = toNumber_(category[urgencyField]);
    if (importance < 1 || importance > 10 || urgency < 1 || urgency > 10) throw new Error('Setiap kategori harus memiliki skor Penting dan Mendesak 1–10 untuk role yang sedang mengisi.');
    record[importanceField] = importance;
    record[urgencyField] = urgency;
    const scoreTimestamp = isoNow_();
    record[role === 'AYAH' ? 'ImportanceAyahAt' : 'ImportanceBundaAt'] = scoreTimestamp;
    record[role === 'AYAH' ? 'UrgencyAyahAt' : 'UrgencyBundaAt'] = scoreTimestamp;
    normalizeBudgetCategoryPayload_(record);
    return record;
  });
  const preparedIds = new Set(prepared.map((row) => String(row.CategoryID)));
  if (action === 'SCORE' && oldCategories.some((row) => !preparedIds.has(String(row.CategoryID)))) throw new Error('Semua kategori yang dibuat pengaju harus dinilai oleh pasangan.');
  const timestamp = isoNow_();
  const policyRecord = Object.assign({}, existing || {}, { PolicyID: policyId, Name: action === 'SCORE' && existing ? existing.Name : String(input.Name || (existing && existing.Name) || '').trim(), EffectiveFrom: action === 'SCORE' && existing ? existing.EffectiveFrom : normalizeDate_(input.EffectiveFrom || (existing && existing.EffectiveFrom)), EffectiveTo: action === 'SCORE' && existing ? existing.EffectiveTo : normalizeDate_(input.EffectiveTo || (existing && existing.EffectiveTo)), UpdatedAt: timestamp });
  if (isNew) { policyRecord.Status = 'DRAFT'; policyRecord.CreatedBy = session.userId; policyRecord.CreatedAt = timestamp; policyRecord.NeedsPct = 0; policyRecord.WantsPct = 0; policyRecord.SavingsPct = 0; }
  if (action !== 'SCORE' && action === 'SUBMIT') { policyRecord.Status = 'WAITING_PARTNER_SCORE'; policyRecord.SubmittedBy = session.userId; policyRecord.SubmittedAt = timestamp; }
  if (action === 'SCORE') { policyRecord.Status = 'REVIEW'; policyRecord.PartnerScoreSubmittedAt = timestamp; }
  withLock_(() => {
    if (isNew) appendRecord_('BudgetPolicies', policyRecord); else updateRecord_('BudgetPolicies', existing.__rowNumber, policyRecord);
    const existingRows = sheetRecords_('BudgetCategories');
    const existingByCategoryId = {};
    existingRows.forEach((row) => { existingByCategoryId[String(row.CategoryID)] = row; });
    const keepIds = new Set(prepared.map((record) => String(record.CategoryID)));
    const categoryUpdates = [];
    const categoryAppends = [];
    existingRows.filter((row) => String(row.PolicyID || '') === String(policyId) && String(row.Active).toUpperCase() !== 'FALSE' && !keepIds.has(String(row.CategoryID))).forEach((row) => { categoryUpdates.push(Object.assign({}, row, { Active: false, UpdatedAt: timestamp })); });
    prepared.forEach((record) => {
      const found = existingByCategoryId[String(record.CategoryID)];
      if (found) categoryUpdates.push(Object.assign({}, found, record)); else categoryAppends.push(Object.assign({}, record, { CreatedBy: session.userId, CreatedAt: timestamp }));
    });
    writeRecordsBatch_('BudgetCategories', categoryUpdates, categoryAppends);
    if (policyRecord.Status === 'REVIEW') rebuildCategoryAllocations_(policyId, currentPeriod_());
  });
  const saved = findRecord_('BudgetPolicies', 'PolicyID', policyId);
  auditForSession_(session, 'policy', policyId, action === 'SCORE' ? 'PARTNER_SCORE' : (action === 'SUBMIT' ? 'SUBMIT' : 'SAVE_EDITOR'), null, publicRecord_(saved), 'Hierarchical Kebijakan Anggaran diperbarui.');
  return { success: true, action: action, record: policyView_(saved, session), categories: publicRecords_(prepared) };
}

function savePolicyRecord_(session, input) {
  validateModulePayload_('policy', input);
  if (String(session.role || '').toUpperCase() !== 'AYAH') throw new Error('Dalam workflow ini, hanya Ayah yang membuat atau mengubah struktur Kebijakan Anggaran.');
    const timestamp = isoNow_();
    const requestedId = String(input.recordId || input.PolicyID || '').trim();
    const existing = requestedId ? findRecord_('BudgetPolicies', 'PolicyID', requestedId) : null;
    if (existing && !['DRAFT'].includes(String(existing.Status || '').toUpperCase())) throw new Error('Kebijakan yang sudah Approved, Amendment, Locked, atau Void tidak dapat diedit. Gunakan Amendment.');
    if (existing && existing.SubmittedAt) throw new Error('Draft yang sudah diajukan tidak dapat diedit. Tunggu persetujuan pasangan atau buat draft baru.');
    const record = Object.assign({}, input);
    delete record.recordId;
    delete record.policyAction;
    record.PolicyID = existing ? existing.PolicyID : makeId_('POL');
    record.Status = 'DRAFT';
    record.CreatedBy = existing ? existing.CreatedBy : session.userId;
    record.CreatedAt = existing ? existing.CreatedAt : timestamp;
    record.UpdatedAt = timestamp;
    record.SubmittedBy = existing ? (existing.SubmittedBy || '') : '';
    record.SubmittedAt = existing ? (existing.SubmittedAt || '') : '';
    record.AmendmentOfPolicyID = input.AmendmentOfPolicyID || (existing && existing.AmendmentOfPolicyID) || '';
    if (existing) updateRecord_('BudgetPolicies', existing.__rowNumber, Object.assign({}, existing, record)); else appendRecord_('BudgetPolicies', record);
    const saved = findRecord_('BudgetPolicies', 'PolicyID', record.PolicyID);
  auditForSession_(session, 'policy', record.PolicyID, existing ? 'UPDATE_DRAFT' : 'CREATE_DRAFT', existing ? publicRecord_(existing) : null, publicRecord_(saved), 'Draft Kebijakan Anggaran disimpan.');
  if (input.quadrantWeights) savePolicyAllocationsForSession_(session, record.PolicyID, input.quadrantWeights, input.quadrantPeriod || currentPeriod_());
  if (String(input.policyAction || '').toUpperCase() === 'SUBMIT') return policyActionWithSession_(session, record.PolicyID, 'SUBMIT');
  return { success: true, action: existing ? 'UPDATE_DRAFT' : 'CREATE_DRAFT', record: publicRecord_(saved) };
}

function createPolicyAmendmentDraft_(policy, session, now) {
  const copy = Object.assign({}, policy, { PolicyID: makeId_('POL'), Status: 'DRAFT', CreatedBy: session.userId, CreatedAt: now, UpdatedAt: now, SubmittedBy: '', SubmittedAt: '', PartnerScoreSubmittedAt: '', ConfirmedAyahAt: '', ConfirmedBundaAt: '', FinalApprovedAt: '', ApprovedAyahAt: '', ApprovedBundaAt: '', LockedAt: '', AmendmentOfPolicyID: policy.PolicyID, ReplacesPolicyID: '', VoidedBy: '', VoidedAt: '', RestoredPolicyID: '', RestoredAt: '', EditRequestedBy: '', EditRequestedAt: '', EditReviewedBy: '', EditReviewedAt: '', EditRequestNote: '' });
  delete copy.__rowNumber;
  appendRecord_('BudgetPolicies', copy);
  const sourceCategories = activeRecords_('BudgetCategories', 'Active').filter((row) => String(row.PolicyID || '') === String(policy.PolicyID));
  const categoryMap = {};
  sourceCategories.forEach((row) => { categoryMap[row.CategoryID] = makeId_('CAT'); });
  const clonedCategories = sourceCategories.map((row) => {
    const cloned = Object.assign({}, row, { CategoryID: categoryMap[row.CategoryID], PolicyID: copy.PolicyID, ParentCategoryID: row.ParentCategoryID ? categoryMap[row.ParentCategoryID] : '', ImportanceAyah: '', ImportanceBunda: '', UrgencyAyah: '', UrgencyBunda: '', ImportanceScore: '', UrgencyScore: '', Quadrant: '', Active: true, CreatedBy: session.userId, CreatedAt: now, UpdatedAt: now, ImportanceAyahAt: '', ImportanceBundaAt: '', UrgencyAyahAt: '', UrgencyBundaAt: '' });
    delete cloned.__rowNumber;
    return cloned;
  });
  writeRecordsBatch_('BudgetCategories', [], clonedCategories);
  return { record: publicRecord_(copy), categories: publicRecords_(clonedCategories) };
}

function policyAction(token, policyId, action, note) {
  beginRequestCache_();
  const session = requireSession_(token);
  return policyActionWithSession_(session, policyId, action, note);
}

function policyActionWithSession_(session, policyId, action, note) {
  return withLock_(() => {
    const policy = findRecord_('BudgetPolicies', 'PolicyID', policyId);
    if (!policy) throw new Error('Kebijakan Anggaran tidak ditemukan.');
    const now = isoNow_();
    const normalizedAction = String(action || '').toUpperCase();
    const before = publicRecord_(policy);
    if (normalizedAction === 'SUBMIT') {
      if (String(policy.Status).toUpperCase() !== 'DRAFT') throw new Error('Hanya Draft yang dapat diajukan.');
      if (String(policy.CreatedBy) !== String(session.userId)) throw new Error('Hanya pengaju Draft yang dapat mengajukan kebijakan.');
      const role = String(session.role || '').toUpperCase();
      if (role !== 'AYAH') throw new Error('Dalam workflow ini, hanya Ayah yang mengajukan struktur Kebijakan Anggaran kepada Bunda.');
      const scoreFields = ['ImportanceAyah', 'UrgencyAyah'];
      if (!scoreFields.length) throw new Error('Role tidak berwenang mengajukan Kebijakan Anggaran.');
      const categories = activeRecords_('BudgetCategories', 'Active').filter((row) => String(row.PolicyID || '') === String(policy.PolicyID));
      if (!categories.length || categories.some((row) => scoreFields.some((field) => toNumber_(row[field]) < 1 || toNumber_(row[field]) > 10))) throw new Error('Lengkapi skor Kepentingan dan Urgensi milik pengaju sebelum mengajukan kebijakan.');
      policy.Status = 'WAITING_PARTNER_SCORE'; policy.SubmittedBy = session.userId; policy.SubmittedAt = now; policy.UpdatedAt = now;
      updateRecord_('BudgetPolicies', policy.__rowNumber, policy);
      auditForSession_(session, 'policy', policy.PolicyID, 'SUBMIT', before, publicRecord_(policy), 'Draft diajukan untuk penilaian pasangan.');
      return { success: true, action: 'SUBMIT', record: publicRecord_(policy) };
    }
    if (normalizedAction === 'REQUEST_EDIT') {
      if (String(session.role || '').toUpperCase() !== 'BUNDA') throw new Error('Hanya Bunda yang dapat mengajukan permintaan edit struktur.');
      if (!['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED', 'AMENDMENT'].includes(String(policy.Status || '').toUpperCase())) throw new Error('Permintaan edit hanya dapat diajukan pada Kebijakan Anggaran yang aktif.');
      if (policy.EditRequestedAt && !policy.EditReviewedAt) throw new Error('Permintaan edit untuk kebijakan ini masih menunggu review Ayah.');
      const pendingDraft = sheetRecords_('BudgetPolicies').find((row) => String(row.AmendmentOfPolicyID || '') === String(policy.PolicyID) && !['VOID', 'APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED'].includes(String(row.Status || '').toUpperCase()));
      if (pendingDraft) throw new Error('Sudah ada draft Amendment yang sedang diproses untuk kebijakan ini.');
      policy.EditRequestedBy = session.userId; policy.EditRequestedAt = now; policy.EditReviewedBy = ''; policy.EditReviewedAt = ''; policy.EditRequestNote = String(note || '').trim().slice(0, 500); policy.UpdatedAt = now;
      updateRecord_('BudgetPolicies', policy.__rowNumber, policy);
      auditForSession_(session, 'policy', policy.PolicyID, 'REQUEST_EDIT', before, publicRecord_(policy), 'Bunda mengajukan permintaan edit struktur kepada Ayah.');
      return { success: true, action: 'REQUEST_EDIT', record: publicRecord_(policy) };
    }
    if (normalizedAction === 'REVIEW_EDIT') {
      if (String(session.role || '').toUpperCase() !== 'AYAH') throw new Error('Hanya Ayah yang dapat meninjau permintaan edit struktur.');
      if (!['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED', 'AMENDMENT'].includes(String(policy.Status || '').toUpperCase())) throw new Error('Permintaan edit hanya dapat ditinjau pada Kebijakan Anggaran yang aktif.');
      if (!policy.EditRequestedAt || policy.EditReviewedAt) throw new Error('Tidak ada permintaan edit struktur yang menunggu review Ayah.');
      const pendingDraft = sheetRecords_('BudgetPolicies').find((row) => String(row.AmendmentOfPolicyID || '') === String(policy.PolicyID) && !['VOID', 'APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED'].includes(String(row.Status || '').toUpperCase()));
      if (pendingDraft) throw new Error('Draft Amendment untuk permintaan ini sudah tersedia.');
      policy.EditReviewedBy = session.userId; policy.EditReviewedAt = now; policy.UpdatedAt = now;
      updateRecord_('BudgetPolicies', policy.__rowNumber, policy);
      const draft = createPolicyAmendmentDraft_(policy, session, now);
      auditForSession_(session, 'policy', policy.PolicyID, 'REVIEW_EDIT', before, { Policy: publicRecord_(policy), Amendment: draft.record }, 'Ayah menerima permintaan edit dan membuat Draft Amendment.');
      return { success: true, action: 'REVIEW_EDIT', record: publicRecord_(policy), amendment: draft.record };
    }
    if (normalizedAction === 'CONFIRM') {
      throw new Error('Workflow baru tidak menggunakan konfirmasi bolak-balik. Bunda mengajukan penilaian ke Ayah, lalu Ayah menetapkan proporsi empat kuadran.');
      if (String(policy.Status || '').toUpperCase() !== 'REVIEW') throw new Error('Kebijakan harus berada pada tahap Review Bersama.');
      if (!policyScoresComplete_(policy.PolicyID)) throw new Error('Semua kategori harus memiliki skor Ayah dan Bunda sebelum persetujuan akhir.');
      const role = String(session.role || '').toUpperCase();
      const ownField = role === 'AYAH' ? 'ConfirmedAyahAt' : (role === 'BUNDA' ? 'ConfirmedBundaAt' : '');
      const ownApprovedField = role === 'AYAH' ? 'ApprovedAyahAt' : (role === 'BUNDA' ? 'ApprovedBundaAt' : '');
      if (!ownField) throw new Error('Role tidak berwenang melakukan persetujuan akhir.');
      if (policy[ownField]) {
        const bothAlreadyConfirmed = Boolean(policy.ConfirmedAyahAt && policy.ConfirmedBundaAt);
        if (bothAlreadyConfirmed) { policy.Status = 'APPROVED_AND_LOCKED'; policy.FinalApprovedAt = policy.FinalApprovedAt || now; policy.LockedAt = policy.LockedAt || now; policy.UpdatedAt = now; updateRecord_('BudgetPolicies', policy.__rowNumber, policy); return { success: true, action: 'APPROVED_AND_LOCKED', record: publicRecord_(policy) }; }
        return { success: true, action: 'ALREADY_CONFIRMED', record: publicRecord_(policy) };
      }
      policy[ownField] = now; policy[ownApprovedField] = now;
      const bothConfirmed = Boolean(policy.ConfirmedAyahAt && policy.ConfirmedBundaAt);
      if (bothConfirmed) {
        if (policy.AmendmentOfPolicyID) {
          const oldPolicy = findRecord_('BudgetPolicies', 'PolicyID', policy.AmendmentOfPolicyID);
          if (!oldPolicy || !['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED'].includes(String(oldPolicy.Status).toUpperCase())) throw new Error('Kebijakan lama untuk Amendment tidak lagi berstatus Approved & Locked.');
          oldPolicy.Status = 'VOID'; oldPolicy.VoidedBy = session.userId; oldPolicy.VoidedAt = now; oldPolicy.ReplacedByPolicyID = policy.PolicyID; oldPolicy.UpdatedAt = now;
          updateRecord_('BudgetPolicies', oldPolicy.__rowNumber, oldPolicy);
          policy.ReplacesPolicyID = oldPolicy.PolicyID;
        }
        policy.Status = 'APPROVED_AND_LOCKED'; policy.FinalApprovedAt = now; policy.LockedAt = now;
      }
      policy.UpdatedAt = now;
      updateRecord_('BudgetPolicies', policy.__rowNumber, policy);
      auditForSession_(session, 'policy', policy.PolicyID, bothConfirmed ? 'APPROVED_AND_LOCKED' : 'CONFIRM_REVIEW', before, publicRecord_(policy), bothConfirmed ? 'Kedua pihak menyetujui hasil rerata; kebijakan Approved & Locked.' : 'Satu pihak menyetujui hasil Review.');
      return { success: true, action: bothConfirmed ? 'APPROVED_AND_LOCKED' : 'CONFIRM_REVIEW', record: publicRecord_(policy) };
    }
    if (normalizedAction === 'APPROVE') {
      throw new Error('Workflow baru menggunakan SCORE lalu ALLOCATE oleh Ayah; APPROVE satu langkah tidak lagi tersedia.');
      if (String(policy.Status).toUpperCase() !== 'DRAFT' || !policy.SubmittedAt) throw new Error('Kebijakan harus berstatus Draft yang sudah diajukan.');
      if (String(policy.CreatedBy) === String(session.userId)) throw new Error('Pengaju tidak dapat menyetujui kebijakannya sendiri.');
      if (String(session.role).toUpperCase() === 'AYAH') policy.ApprovedAyahAt = now; else if (String(session.role).toUpperCase() === 'BUNDA') policy.ApprovedBundaAt = now; else throw new Error('Role tidak berwenang menyetujui kebijakan.');
      if (policy.AmendmentOfPolicyID) {
        const oldPolicy = findRecord_('BudgetPolicies', 'PolicyID', policy.AmendmentOfPolicyID);
        if (!oldPolicy || !['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED'].includes(String(oldPolicy.Status).toUpperCase())) throw new Error('Kebijakan lama untuk Amendment tidak lagi berstatus Approved & Locked.');
        oldPolicy.Status = 'VOID'; oldPolicy.VoidedBy = session.userId; oldPolicy.VoidedAt = now; oldPolicy.ReplacedByPolicyID = policy.PolicyID; oldPolicy.UpdatedAt = now;
        updateRecord_('BudgetPolicies', oldPolicy.__rowNumber, oldPolicy);
        policy.Status = 'APPROVED_AND_LOCKED'; policy.ReplacesPolicyID = oldPolicy.PolicyID;
      } else {
        policy.Status = 'APPROVED_AND_LOCKED';
      }
      policy.UpdatedAt = now;
      updateRecord_('BudgetPolicies', policy.__rowNumber, policy);
      auditForSession_(session, 'policy', policy.PolicyID, 'APPROVE', before, publicRecord_(policy), policy.AmendmentOfPolicyID ? 'Amendment disetujui & dikunci; kebijakan lama di-void.' : 'Kebijakan disetujui & langsung dikunci oleh pasangan.');
      return { success: true, action: 'APPROVE', record: publicRecord_(policy) };
    }
    if (normalizedAction === 'AMEND') {
      if (String(session.role || '').toUpperCase() !== 'AYAH') throw new Error('Dalam workflow ini, hanya Ayah yang dapat menyiapkan Amendment struktur.');
      if (!['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED', 'AMENDMENT'].includes(String(policy.Status).toUpperCase())) throw new Error('Amendment hanya dapat dibuat dari kebijakan Approved & Locked.');
      if (policyHasPendingAmendment_(policy.PolicyID)) throw new Error('Sudah ada draft Amendment yang sedang diproses untuk kebijakan ini.');
      const draft = createPolicyAmendmentDraft_(policy, session, now);
      auditForSession_(session, 'policy', draft.record.PolicyID, 'CREATE_AMENDMENT_DRAFT', publicRecord_(policy), draft.record, 'Draft Amendment dibuat dari kebijakan aktif beserta struktur hierarkinya.');
      return { success: true, action: 'AMEND', record: draft.record };
    }
    if (normalizedAction === 'VOID') {
      const currentStatus = String(policy.Status || '').toUpperCase();
      if (['DRAFT', 'WAITING_PARTNER_SCORE'].includes(currentStatus) && String(policy.CreatedBy || '') !== String(session.userId || '')) throw new Error('Hanya pembuat Draft yang dapat melakukan Void pada tahap ini.');
      if (policy.AmendmentOfPolicyID && ['APPROVED', 'LOCKED', 'APPROVED_AND_LOCKED', 'AMENDMENT'].includes(currentStatus)) {
        const oldPolicy = findRecord_('BudgetPolicies', 'PolicyID', policy.ReplacesPolicyID);
        if (oldPolicy && String(oldPolicy.Status).toUpperCase() === 'VOID') {
          oldPolicy.Status = 'APPROVED_AND_LOCKED'; oldPolicy.RestoredPolicyID = policy.PolicyID; oldPolicy.RestoredAt = now; oldPolicy.UpdatedAt = now;
          updateRecord_('BudgetPolicies', oldPolicy.__rowNumber, oldPolicy);
        }
      } else if (currentStatus !== 'DRAFT' && currentStatus !== 'WAITING_PARTNER_SCORE' && currentStatus !== 'REVIEW') throw new Error('Kebijakan Approved & Locked hanya dapat di-void jika merupakan Amendment.');
      policy.Status = 'VOID'; policy.VoidedBy = session.userId; policy.VoidedAt = now; policy.UpdatedAt = now;
      updateRecord_('BudgetPolicies', policy.__rowNumber, policy);
      auditForSession_(session, 'policy', policy.PolicyID, 'VOID', before, publicRecord_(policy), 'Kebijakan di-void; jika Amendment, kebijakan lama dipulihkan.');
      return { success: true, action: 'VOID', record: publicRecord_(policy) };
    }
    throw new Error('Aksi kebijakan tidak dikenali.');
  });
}

function todayDate_() { return Utilities.formatDate(new Date(), APP.timeZone, 'yyyy-MM-dd'); }
function formatMoney_(value) { return 'Rp ' + Math.round(toNumber_(value)).toLocaleString('id-ID'); }

function setupDriveFolders() {
  return setupDriveFolders_();
}

function setupDriveFolders_() {
  const root = findOrCreateFolder_(DriveApp.getRootFolder(), APP.rootDriveFolderName);
  const folders = { root: root.getId(), rootUrl: root.getUrl() };
  APP.driveFolders.forEach((name) => {
    const folder = findOrCreateFolder_(root, name);
    folders[name] = { id: folder.getId(), url: folder.getUrl() };
  });
  return folders;
}

function saveAttachment(token, fileData, entityType, entityId) {
  const session = requireSession_(token);
  if (!fileData || !fileData.base64 || !fileData.name) throw new Error('File tidak valid.');
  const root = findOrCreateFolder_(DriveApp.getRootFolder(), APP.rootDriveFolderName);
  const receiptRoot = findOrCreateFolder_(root, 'Bukti Transaksi');
  const date = now_();
  const year = Utilities.formatDate(date, APP.timeZone, 'yyyy');
  const month = Utilities.formatDate(date, APP.timeZone, 'MM');
  const yearFolder = findOrCreateFolder_(receiptRoot, year);
  const monthFolder = findOrCreateFolder_(yearFolder, month);
  const bytes = Utilities.base64Decode(String(fileData.base64).replace(/^data:[^;]+;base64,/, ''));
  const blob = Utilities.newBlob(bytes, fileData.mimeType || 'application/octet-stream', fileData.name);
  const file = monthFolder.createFile(blob);
  const attachment = {
    AttachmentID: makeId_('ATT'), EntityType: entityType || '', EntityID: entityId || '', FileID: file.getId(),
    FileName: file.getName(), MimeType: file.getMimeType(), DriveUrl: file.getUrl(), CreatedBy: session.userId, CreatedAt: isoNow_(),
  };
  appendRecord_('Attachments', attachment);
  auditForSession_(session, entityType || 'Attachment', entityId, 'UPLOAD', null, publicRecord_(attachment), 'File disimpan ke Drive.');
  return { success: true, attachment: publicRecord_(attachment) };
}

function validateModulePayload_(moduleKey, input) {
  if (moduleKey === 'accounts') normalizeAccountPayload_(input);
  if (moduleKey === 'income') normalizeIncomePayload_(input);
  if (moduleKey === 'shopping') normalizeShoppingPayload_(input);
  if (moduleKey === 'expenses') normalizeExpensePayload_(input);
  if (moduleKey === 'budget') normalizeBudgetPayload_(input);
  if (moduleKey === 'budgetCategory') normalizeBudgetCategoryPayload_(input);
  const amountFields = ['Amount', 'AcquisitionValue', 'InitialPrincipal', 'RemainingPrincipal', 'MonthlyPayment', 'TargetAmount', 'CurrentValue', 'MonthlyContribution', 'EstimatedAmount', 'SystemBalance', 'ActualBalance', 'CostBasis', 'CurrentPrice', 'CurrentValue', 'Quantity', 'UnitPrice', 'LineAmount', 'Percentage', 'FixedAmount', 'CashAmount', 'GoldWeightGram', 'GoldPricePerGram', 'BondNominal', 'BondPricePct', 'LotCount'];
  amountFields.forEach((field) => { if (input[field] !== undefined && input[field] !== '') input[field] = toNumber_(input[field]); });
  if (['income', 'expenses', 'transfers', 'cash', 'budget', 'goals', 'assets', 'debts', 'investments', 'savings'].includes(moduleKey)) {
    const dateField = input.TransactionDate !== undefined ? 'TransactionDate' : (input.AcquisitionDate !== undefined ? 'AcquisitionDate' : (input.StartDate !== undefined ? 'StartDate' : (input.AsOfDate !== undefined ? 'AsOfDate' : null)));
    if (dateField && !normalizeDate_(input[dateField])) throw new Error('Tanggal wajib diisi.');
  }
  if (moduleKey === 'income') {
    if (!INCOME_TYPES.includes(String(input.IncomeType || ''))) throw new Error('Jenis Penerimaan tidak valid.');
    if (!['YA', 'TIDAK'].includes(String(input.OperatingIncome || '').toUpperCase())) throw new Error('Pilih Operating Income: Ya atau Tidak.');
    if (!['Ayah', 'Bunda', 'Other'].includes(String(input.Payer || ''))) throw new Error('Sumber/Payer tidak valid.');
    if (!input.AccountID || !activeRecords_('Accounts', 'Status').some((account) => String(account.AccountID) === String(input.AccountID))) throw new Error('Pilih Rekening Sumber yang aktif.');
  }
  if (moduleKey === 'accounts') {
    if (!input.Name) throw new Error('Nama rekening wajib diisi.');
    if (!input.BankCode || !BANK_CATALOG.some((bank) => bank[0] === String(input.BankCode))) throw new Error('Pilih bank dari daftar yang tersedia.');
    if (!input.AccountNumber || !/^\d{4,30}$/.test(String(input.AccountNumber))) throw new Error('Nomor rekening harus berupa angka 4–30 digit.');
  }
  if (moduleKey === 'transfers') {
    if (!input.SourceAccountID || !input.DestinationAccountID) throw new Error('Rekening sumber dan tujuan wajib diisi.');
    if (String(input.SourceAccountID) === String(input.DestinationAccountID)) throw new Error('Rekening sumber dan tujuan harus berbeda.');
    if (toNumber_(input.Amount) <= 0) throw new Error('Nominal transfer harus lebih besar dari nol.');
  }
  if (moduleKey === 'expenses') {
    if (toNumber_(input.Amount) <= 0) throw new Error('Nominal pengeluaran harus lebih besar dari nol.');
    if (!['Ayah', 'Bunda', 'Other'].includes(String(input.Payer || ''))) throw new Error('Payer tidak valid.');
    if (!['CASH', 'NON_CASH'].includes(String(input.PaymentMethod || ''))) throw new Error('Cara pembayaran tidak valid.');
    if (String(input.PaymentMethod || '') === 'NON_CASH' && (!input.AccountID || !activeRecords_('Accounts', 'Status').some((account) => String(account.AccountID) === String(input.AccountID)))) throw new Error('Pilih Rekening Sumber yang aktif untuk pembayaran non-cash / QRIS.');
    if (String(input.PaymentMethod || '') === 'CASH' && toNumber_(input.CashAmount) <= 0) throw new Error('Nominal Cash harus lebih besar dari nol.');
    if (!EXPENSE_TYPES.some((item) => item[0] === String(input.ExpenseType || ''))) throw new Error('Jenis pengeluaran tidak valid.');
    if (String(input.ExpenseType || '') === 'TRANSFER' && String(input.PaymentMethod || '') !== 'NON_CASH') throw new Error('Transfer harus menggunakan pembayaran non-cash.');
    if (String(input.ExpenseType || '') === 'TRANSFER') {
      let categoryPath = String(input.BudgetCategory || '').toUpperCase();
      if (input.BudgetCategoryID) { try { const context = budgetPolicyContext_(String(input.TransactionDate || '').slice(0, 7)); const selected = (context.categories || []).find((item) => String(item.CategoryID) === String(input.BudgetCategoryID)); if (selected) categoryPath = String(selected.Path || selected.Name || '').toUpperCase(); } catch (error) {} }
      const isZakat = /ZAKAT|INFAQ|INFAK|SEDEKAH/.test(categoryPath);
      const externalOnly = /IURAN|SOSIAL/.test(categoryPath);
      if (isZakat) {
        const provider = String(input.ZakatProvider || '').trim();
        if (!provider || !ZAKAT_INFAQ_PROVIDERS.some((item) => String(item[0]) === provider)) throw new Error('Pilih penyedia Zakat/Infaq yang tersedia.');
        input.DestinationAccountID = 'ZAKAT_PROVIDER:' + provider;
        input.DestinationAccountName = (ZAKAT_INFAQ_PROVIDERS.find((item) => String(item[0]) === provider) || ['', provider])[1];
      } else {
        const destination = activeRecords_('Accounts', 'Status').find((account) => String(account.AccountID) === String(input.DestinationAccountID));
        if (!destination) throw new Error('Rekening Tujuan Transfer harus aktif.');
        if (externalOnly && String(destination.Type || '').toUpperCase() !== 'EXTERNAL') throw new Error('Kategori Iuran dan Sosial hanya boleh menggunakan rekening eksternal.');
      }
    }
    if (String(input.ExpenseType || '') === 'EXPENSE') {
      if (!input.BudgetCategoryID) throw new Error('Pilih Kategori Anggaran Rumah Tangga untuk Pengeluaran Operasional.');
      activeBudgetCategoryForExpense_(String(input.TransactionDate || '').slice(0, 7), input.BudgetCategoryID);
    }
    if (input.BudgetID && !activeRecords_('Budgets', 'Status').some((budget) => String(budget.BudgetID) === String(input.BudgetID))) throw new Error('Referensi Anggaran lama tidak ditemukan. Pilih Kategori Anggaran yang tersedia.');
    if (input.ShoppingID) {
      const shopping = findRecord_('ShoppingList', 'ShoppingID', input.ShoppingID);
      if (!shopping) throw new Error('Item Daftar Belanja tidak ditemukan.');
      if (String(shopping.Status || '').toUpperCase() === 'EXPENSE') throw new Error('Item Daftar Belanja sudah menjadi Pengeluaran.');
    }
  }
  if (moduleKey === 'assets') {
    const assetStatuses = ['ACTIVE', 'SOLD', 'GIFTED', 'DAMAGED', 'LOST'];
    input.Status = String(input.Status || 'ACTIVE').toUpperCase();
    if (!assetStatuses.includes(input.Status)) throw new Error('Status aset tidak valid.');
    const assetType = resolveAssetType_(input.AssetType);
    const reportingCategory = normalizeAssetReportingCategory_(input.ReportingCategory) || assetReportingCategory_(input, assetType);
    if (!input.Name || !input.Owner || !assetType) throw new Error('Nama, pemilik, dan Jenis Aset dari daftar tersedia wajib diisi.');
    if (!reportingCategory || !ASSET_REPORTING_CATEGORIES.some((item) => item[0] === reportingCategory)) throw new Error('Kelompok Rekap Aset tidak valid.');
    if (toNumber_(input.AcquisitionValue) <= 0) throw new Error('Nilai perolehan aset harus lebih besar dari nol.');
    input.AssetType = assetType.AssetTypeID;
    input.ReportingCategory = reportingCategory;
    input.AcquisitionDate = normalizeDate_(input.AcquisitionDate);
  }
  if (moduleKey === 'debts') {
    input.DebtType = String(input.DebtType || '').toUpperCase();
    if (!input.Name || !['KPR', 'OTHER'].includes(input.DebtType)) throw new Error('Nama dan Jenis Utang wajib diisi.');
    if (!input.Creditor) input.Creditor = '';
    input.StartDate = normalizeDate_(input.StartDate);
    if (toNumber_(input.InitialPrincipal) <= 0 || toNumber_(input.TenorMonths) <= 0 || toNumber_(input.MonthlyPayment) <= 0) throw new Error('Pokok awal, tenor, dan angsuran bulanan harus lebih besar dari nol.');
    input.TenorMonths = Math.round(toNumber_(input.TenorMonths));
  }
  if (moduleKey === 'investments') {
    const labels = { 'SAHAM': 'SAHAM', 'Saham': 'SAHAM', 'EMAS': 'EMAS', 'Emas': 'EMAS', 'OBLIGASI': 'OBLIGASI', 'Obligasi': 'OBLIGASI', 'SBN': 'OBLIGASI', 'RD_PASAR_UANG': 'RD_PASAR_UANG', 'Reksadana Pasar Uang': 'RD_PASAR_UANG', 'RD_OBLIGASI': 'RD_OBLIGASI', 'Reksadana Obligasi': 'RD_OBLIGASI', 'RD_DANA_SAHAM': 'RD_DANA_SAHAM', 'Reksadana Saham': 'RD_DANA_SAHAM', 'RD_CAMPURAN': 'RD_CAMPURAN', 'Reksadana Campuran': 'RD_CAMPURAN' };
    input.Instrument = normalizeInvestmentInstrument_(labels[String(input.Instrument || '')] || input.Instrument);
    if (!input.Instrument) throw new Error('Instrumen investasi wajib dipilih.');
    if (!input.Provider) throw new Error('Provider / Platform wajib diisi.');
    const instrument = input.Instrument;
    if (instrument === 'SAHAM') {
      if (!input.TickerSymbol) throw new Error('Kode ticker saham wajib diisi.');
      if (toNumber_(input.LotCount) <= 0) throw new Error('Jumlah lot saham harus lebih besar dari nol.');
      if (toNumber_(input.CurrentPrice) <= 0) throw new Error('Harga beli per saham harus lebih besar dari nol.');
      input.Quantity = toNumber_(input.LotCount) * 100;
      input.CostBasis = toNumber_(input.CostBasis) > 0 ? toNumber_(input.CostBasis) : input.Quantity * toNumber_(input.CurrentPrice);
    } else if (instrument === 'EMAS') {
      if (toNumber_(input.GoldWeightGram) <= 0) throw new Error('Berat emas harus lebih besar dari nol.');
      if (toNumber_(input.GoldPricePerGram) <= 0) throw new Error('Harga beli emas per gram wajib diisi.');
      input.Quantity = toNumber_(input.GoldWeightGram);
      input.CostBasis = toNumber_(input.CostBasis) > 0 ? toNumber_(input.CostBasis) : input.Quantity * toNumber_(input.GoldPricePerGram);
    } else if (instrument === 'OBLIGASI') {
      if (toNumber_(input.BondNominal) <= 0) throw new Error('Nilai nominal obligasi harus lebih besar dari nol.');
      if (toNumber_(input.BondPricePct) <= 0) throw new Error('Harga beli obligasi (%) harus lebih besar dari nol.');
      input.Quantity = toNumber_(input.BondNominal);
      input.CostBasis = toNumber_(input.CostBasis) > 0 ? toNumber_(input.CostBasis) : input.Quantity * toNumber_(input.BondPricePct) / 100;
    } else {
      if (toNumber_(input.CostBasis) <= 0) throw new Error('Nilai pembelian Reksa Dana harus lebih besar dari nol.');
      input.Quantity = toNumber_(input.Quantity);
    }
    if (toNumber_(input.CostBasis) <= 0) throw new Error('Nilai perolehan investasi harus lebih besar dari nol.');
    input.AsOfDate = normalizeDate_(input.AsOfDate);
    if (!input.MarketSource) input.MarketSource = instrument === 'EMAS' ? 'ANTAM' : 'MANUAL';
    if (input.CurrentValue === undefined || input.CurrentValue === '') input.CurrentValue = input.CostBasis;
  }
  if (moduleKey === 'savings') {
    const account = input.AccountID ? findRecord_('Accounts', 'AccountID', input.AccountID) : null;
    if (!account || String(account.Type || '').toUpperCase() !== 'INTERNAL' || String(account.Status || '').toUpperCase() !== 'ACTIVE') throw new Error('Tabungan hanya dapat dicatat untuk rekening internal yang aktif.');
    input.AsOfDate = normalizeDate_(input.AsOfDate);
    if (input.SystemBalance !== undefined && input.SystemBalance !== '' && toNumber_(input.SystemBalance) < 0) throw new Error('Saldo sistem tidak boleh negatif.');
    if (input.ActualBalance !== undefined && input.ActualBalance !== '' && toNumber_(input.ActualBalance) < 0) throw new Error('Saldo aktual tidak boleh negatif.');
    if (input.ActualBalance !== undefined && input.ActualBalance !== '' && input.SystemBalance !== undefined && input.SystemBalance !== '') {
      input.Difference = toNumber_(input.ActualBalance) - toNumber_(input.SystemBalance);
      input.Status = Math.abs(input.Difference) < 0.001 ? 'RECONCILED' : 'DIFFERENCE';
    } else input.Status = 'PENDING';
  }
  if (moduleKey === 'policy') {
    if (!input.Name) throw new Error('Nama Kebijakan Anggaran wajib diisi.');
    const from = normalizeDate_(input.EffectiveFrom);
    const to = input.EffectiveTo ? normalizeDate_(input.EffectiveTo) : '';
    if (!from) throw new Error('Tanggal mulai kebijakan wajib diisi.');
    if (input.EffectiveTo && !to) throw new Error('Tanggal berakhir kebijakan tidak valid.');
    if (to && to < from) throw new Error('Tanggal berakhir tidak boleh sebelum tanggal mulai.');
    const legacyFields = ['NeedsPct', 'WantsPct', 'SavingsPct'];
    const hasLegacyAllocation = legacyFields.some((field) => input[field] !== undefined && input[field] !== '');
    if (hasLegacyAllocation) {
      const allocations = legacyFields.map((field) => toNumber_(input[field]));
      if (allocations.some((value) => value < 0 || value > 100)) throw new Error('Alokasi lama harus berada di antara 0% dan 100%.');
      if (Math.abs(allocations.reduce((sum, value) => sum + value, 0) - 100) > 0.001) throw new Error('Total alokasi lama harus tepat 100%.');
    } else {
      input.NeedsPct = 0; input.WantsPct = 0; input.SavingsPct = 0;
    }
  }
  if (moduleKey === 'budgetCategory') {
    if (!input.PolicyID) throw new Error('Policy ID wajib dipilih untuk kategori anggaran.');
    if (!input.Name) throw new Error('Nama kategori anggaran wajib diisi.');
    const scoreRole = String(input.ScoreRole || '').toUpperCase();
    const scoreFields = scoreRole === 'AYAH' ? ['ImportanceAyah', 'UrgencyAyah'] : (scoreRole === 'BUNDA' ? ['ImportanceBunda', 'UrgencyBunda'] : ['ImportanceAyah', 'ImportanceBunda', 'UrgencyAyah', 'UrgencyBunda']);
    scoreFields.forEach((field) => { const value = toNumber_(input[field]); if (value < 1 || value > 10) throw new Error(field + ' harus bernilai 1 sampai 10.'); });
    if (![0, 1, 2].includes(toNumber_(input.Level))) throw new Error('Level kategori harus 0, 1, atau 2.');
  }
  if (moduleKey === 'budgetRule') {
    if (!input.Category) throw new Error('Kategori Budget Policy wajib diisi.');
    if (!input.BudgetCode) throw new Error('Kode Budget Policy wajib diisi.');
    if (input.Level === undefined || input.Level === '') input.Level = input.Item ? 1 : 0;
  }
  if (moduleKey === 'budget') {
    const period = String(input.Period || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Periode anggaran harus berformat YYYY-MM.');
    if (period === nextPeriod_(currentPeriod_()) && !allocationWindowOpen_()) throw new Error('Alokasi bulan berikutnya baru dapat dibuat mulai lima hari terakhir bulan berjalan.');
    const context = budgetPolicyContext_(period);
    if (!context.ready || !context.policy) throw new Error(context.message || 'Kebijakan Anggaran aktif belum tersedia pada periode ini.');
    const category = context.categories.find((item) => String(item.CategoryID) === String(input.CategoryID || ''));
    if (!category) throw new Error('Pilih kategori, subkategori, atau sub-subkategori dari Kebijakan Anggaran aktif.');
    if (category.HasChildren) throw new Error('Kategori ini masih memiliki turunan. Isi Dialokasikan pada subkategori atau sub-subkategori terakhir.');
    const amount = toNumber_(input.AllocatedAmount !== undefined && input.AllocatedAmount !== '' ? input.AllocatedAmount : (input.BudgetAmount !== undefined && input.BudgetAmount !== '' ? input.BudgetAmount : input.Amount));
    if (amount < 0) throw new Error('Nominal Dialokasikan tidak boleh negatif.');
    const plannedLimit = toNumber_(category.LimitAmount);
    const totalAllocatedAfterSave = amount;
    const allocationVariance = Math.round((totalAllocatedAfterSave - plannedLimit) * 100) / 100;
    const overAllocationReason = String(input.OverAllocationReason || '').trim();
    if (allocationVariance > 0.001 && !overAllocationReason) throw new Error('Dialokasikan berada di atas Direncanakan. Isi alasan singkat untuk menyimpan over-allocation.');
    const parentNames = [];
    let current = category;
    while (current) { parentNames.unshift(current.Name); current = context.categories.find((item) => String(item.CategoryID) === String(current.ParentCategoryID || '')); }
    input.PolicyID = context.policy.PolicyID;
    input.CategoryID = category.CategoryID;
    input.Category = parentNames[0] || category.Name;
    input.Item = parentNames.slice(1).join(' · ');
    input.BudgetCode = category.BudgetCode;
    input.ParentBudgetID = category.ParentCategoryID || '';
    input.Level = category.Level;
    input.SourceType = 'POLICY';
    input.SourceID = context.policy.PolicyID;
    input.BudgetType = 'FIXED';
    input.Constraint = 'MAX';
    input.PlannedAmount = toNumber_(category.PlannedAmount || category.LimitAmount);
    input.PlannedPercentage = toNumber_(category.PlannedPercentage || (context.basisIncome ? input.PlannedAmount / context.basisIncome * 100 : 0));
    input.AllocatedAmount = amount;
    input.AllocatedPercentage = input.PlannedAmount ? amount / input.PlannedAmount * 100 : 0;
    input.OverAllocationReason = allocationVariance > 0.001 ? overAllocationReason : '';
    input.AllocationDate = normalizeDate_(input.AllocationDate || todayDate_());
    input.BudgetAmount = input.PlannedAmount;
    input.BudgetPercentage = input.PlannedPercentage;
    input.Amount = input.PlannedAmount;
    input.AllocationMethod = String(input.AllocationMethod || '').toUpperCase();
    input.PaymentMethod = input.AllocationMethod === 'TRANSFER' ? 'NON_CASH' : (input.AllocationMethod === 'CASH' ? 'CASH' : String(input.PaymentMethod || '').toUpperCase());
    if (input.PaymentMethod && !['CASH', 'NON_CASH'].includes(input.PaymentMethod)) throw new Error('Cara penyaluran Anggaran tidak valid.');
    if (!input.AllocationMethod && input.PaymentMethod) input.AllocationMethod = input.PaymentMethod === 'CASH' ? 'CASH' : 'TRANSFER';
    if (input.AllocationMethod === 'CASH') {
      input.DestinationAccountID = '';
      const source = input.SourceAccountID ? findRecord_('Accounts', 'AccountID', input.SourceAccountID) : null;
      if (!source || String(source.Status || '').toUpperCase() !== 'ACTIVE') throw new Error('Pilih rekening sumber aktif untuk Pengambilan Tunai.');
      input.DestinationAccountName = 'Kas';
    } else if (input.AllocationMethod === 'TRANSFER') {
      const source = input.SourceAccountID ? findRecord_('Accounts', 'AccountID', input.SourceAccountID) : null;
      const destination = input.DestinationAccountID ? findRecord_('Accounts', 'AccountID', input.DestinationAccountID) : null;
      if (!source || String(source.Status || '').toUpperCase() !== 'ACTIVE') throw new Error('Pilih rekening sumber aktif untuk Transfer.');
      if (!destination || String(destination.Status || '').toUpperCase() !== 'ACTIVE') throw new Error('Pilih rekening tujuan aktif untuk Transfer.');
      if (String(input.SourceAccountID) === String(input.DestinationAccountID)) throw new Error('Rekening sumber dan tujuan harus berbeda.');
      input.DestinationAccountName = destination.Name || destination.AccountID;
    }
  }
  if (moduleKey === 'shopping') {
    if (!input.ItemName) throw new Error('Nama barang wajib diisi.');
    if (!['CASH', 'NON_CASH'].includes(String(input.PaymentMethod || ''))) throw new Error('Cara pembayaran Daftar Belanja tidak valid.');
    if (String(input.PaymentMethod || '') === 'NON_CASH' && (!input.PaymentAccountID || !activeRecords_('Accounts', 'Status').some((account) => String(account.AccountID) === String(input.PaymentAccountID)))) throw new Error('Pilih Rekening Sumber aktif untuk pembayaran non-cash / QRIS.');
    if (String(input.PaymentMethod || '') === 'CASH' && toNumber_(input.CashAmount) < 0) throw new Error('Nominal Cash Daftar Belanja tidak boleh negatif.');
    if (!['ROUTINE', 'PLANNED', 'MAJOR'].includes(String(input.PurchaseClass || ''))) throw new Error('Kelas pembelian tidak valid.');
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(String(input.Priority || ''))) throw new Error('Prioritas tidak valid.');
    if (!['WISHLIST', 'PLANNED', 'APPROVED', 'SHOPPING', 'PURCHASED', 'EXPENSE', 'VOID'].includes(String(input.Status || ''))) throw new Error('Status Daftar Belanja tidak valid.');
    if (toNumber_(input.Quantity) < 0 || toNumber_(input.EstimatedAmount) < 0 || toNumber_(input.ActualAmount) < 0) throw new Error('Jumlah dan nominal tidak boleh negatif.');
    if (input.InventoryItemID && !activeRecords_('InventoryItems', 'Active').some((row) => String(row.ItemID) === String(input.InventoryItemID))) throw new Error('Barang persediaan tidak ditemukan.');
    if (input.BudgetID && !activeRecords_('Budgets', 'Status').some((row) => String(row.BudgetID) === String(input.BudgetID))) throw new Error('Akun Pokok tidak ditemukan pada Anggaran aktif.');
    if (input.FundingGoalID && !activeRecords_('FinancialGoals', 'Status').some((row) => String(row.GoalID) === String(input.FundingGoalID))) throw new Error('Rencana Keuangan tidak ditemukan.');
  }
  if (moduleKey === 'goals') {
    if (!input.Name || toNumber_(input.TargetAmount) <= 0) throw new Error('Nama dan target Rencana Keuangan wajib diisi.');
    if (!['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM', 'EMERGENCY'].includes(String(input.GoalType || '').toUpperCase())) throw new Error('Jenis Rencana tidak valid.');
    if (String(input.GoalType || '').toUpperCase() === 'EMERGENCY') input.Priority = '';
    else if (input.Priority && !['HIGH', 'MEDIUM', 'LOW'].includes(String(input.Priority || '').toUpperCase())) throw new Error('Prioritas Rencana tidak valid.');
    if (input.Status && !['ACTIVE', 'COMPLETED_ARCHIVED'].includes(String(input.Status || '').toUpperCase())) throw new Error('Status Rencana tidak valid.');
  }
}

function maskAccountDisplay_(account) {
  const number = String(account && account.AccountNumber || '').replace(/\s+/g, '');
  return number ? '****' + number.slice(-4) : '—';
}

function accountLabel_(account) {
  const type = String(account && account.Type || '').toUpperCase() === 'INTERNAL' ? 'internal' : 'eksternal';
  const alias = String(account && account.Name || '').trim() || 'Tanpa Alias';
  const bank = String(account && account.Provider || '').trim() || 'Bank';
  const masked = maskAccountDisplay_(account);
  return alias + ' - ' + bank + ' - ' + masked + ' - ' + type;
}

function normalizeIncomePayload_(input) {
  input.OperatingIncome = String(input.OperatingIncome || '').trim().toUpperCase();
  input.CashFlowClass = input.OperatingIncome === 'YA' ? 'OPERATING_INCOME' : 'NON_OPERATING_INCOME';
}

function normalizeShoppingPayload_(input) {
  input.PurchaseClass = String(input.PurchaseClass || 'PLANNED').toUpperCase();
  input.PaymentMethod = String(input.PaymentMethod || 'NON_CASH').toUpperCase();
  input.CashAmount = input.CashAmount === undefined || input.CashAmount === '' ? 0 : toNumber_(input.CashAmount);
  if (input.PaymentMethod === 'CASH') input.PaymentAccountID = ''; else input.CashAmount = 0;
  input.Priority = String(input.Priority || 'MEDIUM').toUpperCase();
  input.Status = String(input.Status || 'WISHLIST').toUpperCase();
  input.SystemScore = input.SystemScore === undefined || input.SystemScore === '' ? 0 : toNumber_(input.SystemScore);
  input.FamilyPriority = input.FamilyPriority === undefined || input.FamilyPriority === '' ? 0 : toNumber_(input.FamilyPriority);
  input.Quantity = input.Quantity === undefined || input.Quantity === '' ? 1 : toNumber_(input.Quantity);
  input.EstimatedAmount = input.EstimatedAmount === undefined || input.EstimatedAmount === '' ? 0 : toNumber_(input.EstimatedAmount);
  input.ActualAmount = input.ActualAmount === undefined || input.ActualAmount === '' ? 0 : toNumber_(input.ActualAmount);
}

function normalizeBudgetCategoryPayload_(input) {
  const allScoresPresent = ['ImportanceAyah', 'ImportanceBunda', 'UrgencyAyah', 'UrgencyBunda'].every((field) => input[field] !== undefined && input[field] !== '' && toNumber_(input[field]) >= 1 && toNumber_(input[field]) <= 10);
  if (allScoresPresent) {
    const importanceAyah = toNumber_(input.ImportanceAyah);
    const importanceBunda = toNumber_(input.ImportanceBunda);
    const urgencyAyah = toNumber_(input.UrgencyAyah);
    const urgencyBunda = toNumber_(input.UrgencyBunda);
    input.ImportanceScore = Math.round(((importanceAyah + importanceBunda) / 2) * 100) / 100;
    input.UrgencyScore = Math.round(((urgencyAyah + urgencyBunda) / 2) * 100) / 100;
    const important = input.ImportanceScore >= 6;
    const urgent = input.UrgencyScore >= 6;
    input.Quadrant = important && urgent ? 'PENTING_MENDESAK' : important ? 'PENTING_TIDAK_MENDESAK' : urgent ? 'TIDAK_PENTING_MENDESAK' : 'TIDAK_PENTING_TIDAK_MENDESAK';
  } else {
    input.ImportanceScore = '';
    input.UrgencyScore = '';
    input.Quadrant = '';
  }
  input.Level = input.Level === undefined || input.Level === '' ? 0 : toNumber_(input.Level);
  input.SortOrder = input.SortOrder === undefined || input.SortOrder === '' ? 0 : toNumber_(input.SortOrder);
  input.Active = input.Active === undefined || input.Active === '' ? true : input.Active;
}

function normalizeBudgetPayload_(input) {
  input.BudgetAmount = toNumber_(input.BudgetAmount !== undefined && input.BudgetAmount !== '' ? input.BudgetAmount : input.Amount);
  input.Amount = input.BudgetAmount;
  input.BudgetPercentage = toNumber_(input.BudgetPercentage !== undefined && input.BudgetPercentage !== '' ? input.BudgetPercentage : input.Percentage);
  input.Level = input.Level === undefined || input.Level === '' ? (input.Item ? 1 : 0) : toNumber_(input.Level);
  input.SortOrder = input.SortOrder === undefined || input.SortOrder === '' ? 0 : toNumber_(input.SortOrder);
  if (input.DestinationAccountID) {
    const account = findRecord_('Accounts', 'AccountID', input.DestinationAccountID);
    if (account) input.DestinationAccountName = account.Name;
  }
}

function normalizeExpensePayload_(input) {
  input.ExpenseType = String(input.ExpenseType || '').trim().toUpperCase();
  input.PaymentMethod = String(input.PaymentMethod || (input.ExpenseType === 'TRANSFER' ? 'NON_CASH' : 'NON_CASH')).trim().toUpperCase();
  if (input.PaymentMethod === 'CASH') {
    input.CashAmount = input.CashAmount === undefined || input.CashAmount === '' ? input.Amount : input.CashAmount;
    input.Amount = toNumber_(input.CashAmount);
    input.AccountID = '';
  } else {
    input.CashAmount = 0;
  }
  if (input.BudgetID) {
    const budget = findRecord_('Budgets', 'BudgetID', input.BudgetID);
    if (budget) {
      input.BudgetCategoryID = input.BudgetCategoryID || budget.CategoryID || '';
      input.BudgetCategory = budget.Category;
      input.BudgetItem = budget.Item;
      input.BudgetPeriod = budget.Period;
    }
  }
  if (input.BudgetCategoryID) input.BudgetID = '';
}

function normalizeAccountPayload_(input) {
  input.BankCode = String(input.BankCode || '').trim().padStart(3, '0');
  input.AccountNumber = String(input.AccountNumber || '').replace(/\s+/g, '').trim();
  const bank = BANK_CATALOG.find((item) => item[0] === input.BankCode);
  if (bank && !input.Provider) input.Provider = bank[1];
  if (input.BankCode && input.AccountNumber) input.AccountDisplay = input.BankCode + ' - ' + input.AccountNumber;
}

function sumActive_(sheetName, field) {
  return activeRecords_(sheetName, 'Status').reduce((sum, row) => sum + toNumber_(row[field]), 0);
}

function latestBalances_(balances) {
  const grouped = {};
  balances.forEach((row) => {
    const key = String(row.AccountID);
    if (!grouped[key] || normalizeDate_(row.AsOfDate) > normalizeDate_(grouped[key].AsOfDate) || (normalizeDate_(row.AsOfDate) === normalizeDate_(grouped[key].AsOfDate) && String(row.CreatedAt || '') > String(grouped[key].CreatedAt || ''))) grouped[key] = row;
  });
  return Object.keys(grouped).map((key) => grouped[key]);
}

function inventorySummary_() {
  const items = activeRecords_('InventoryItems', 'Active');
  const movements = activeRecords_('InventoryMovements', null);
  return items.map((item) => {
    const movementQuantity = movements.filter((movement) => String(movement.ItemID) === String(item.ItemID)).reduce((sum, movement) => {
      const amount = toNumber_(movement.Quantity);
      return ['OUT', 'USAGE', 'ADJUSTMENT_OUT'].includes(String(movement.MovementType).toUpperCase()) ? sum - amount : sum + amount;
    }, 0);
    const rawAvailableStock = item.AvailableStock !== '' && item.AvailableStock !== null && item.AvailableStock !== undefined ? item.AvailableStock : item.TargetStock;
    const hasAvailableStock = rawAvailableStock !== '' && rawAvailableStock !== null && rawAvailableStock !== undefined && Number.isFinite(Number(rawAvailableStock));
    const availableStock = hasAvailableStock ? toNumber_(rawAvailableStock) : movementQuantity;
    const minimum = toNumber_(item.MinimumStock);
    return Object.assign(publicRecord_(item), { AvailableStock: availableStock, availableStock: availableStock, currentStock: availableStock, status: availableStock < minimum ? 'REORDER' : 'OK' });
  });
}

function findOrCreateFolder_(parent, name) {
  const iterator = parent.getFoldersByName(name);
  return iterator.hasNext() ? iterator.next() : parent.createFolder(name);
}

/** Create an OCR draft from an uploaded SMS screenshot or receipt. Requires the Drive advanced service. */
function createOcrDraft(token, fileData, moduleKey) {
  const session = requireSession_(token);
  if (!['income', 'expenses'].includes(String(moduleKey))) throw new Error('OCR hanya tersedia untuk Penerimaan dan Pengeluaran.');
  if (!fileData || !fileData.base64 || !fileData.name) throw new Error('File OCR tidak valid.');
  const source = saveOcrSourceFile_(fileData, session);
  const ocrText = runDriveOcr_(source.fileId);
  const parsed = parseOcrDraft_(ocrText, moduleKey);
  const timestamp = isoNow_();
  const draft = {
    DraftID: makeId_('OCR'), ModuleKey: moduleKey, SourceFileID: source.fileId, SourceFileName: fileData.name,
    OCRText: ocrText, ParsedJSON: JSON.stringify(parsed), Status: 'DRAFT', CreatedBy: session.userId, CreatedAt: timestamp, UpdatedAt: timestamp,
  };
  appendRecord_('OCRDrafts', draft);
  auditForSession_(session, moduleKey, draft.DraftID, 'OCR_DRAFT', null, { moduleKey: moduleKey, sourceFileName: fileData.name, fields: Object.keys(parsed) }, 'OCR draft dibuat; belum menjadi transaksi.');
  return { success: true, draft: { DraftID: draft.DraftID, ModuleKey: moduleKey, SourceFileName: draft.SourceFileName, Parsed: parsed, OCRText: ocrText } };
}

function saveOcrSourceFile_(fileData, session) {
  const root = findOrCreateFolder_(DriveApp.getRootFolder(), APP.rootDriveFolderName);
  const ocrRoot = findOrCreateFolder_(root, 'Bukti Transaksi');
  const ocrFolder = findOrCreateFolder_(ocrRoot, 'OCR');
  const bytes = Utilities.base64Decode(String(fileData.base64).replace(/^data:[^;]+;base64,/, ''));
  const blob = Utilities.newBlob(bytes, fileData.mimeType || 'application/octet-stream', fileData.name);
  const file = ocrFolder.createFile(blob);
  return { fileId: file.getId(), url: file.getUrl(), createdBy: session.userId };
}

function runDriveOcr_(fileId) {
  if (typeof Drive === 'undefined' || !Drive.Files || !Drive.Files.copy) throw new Error('Google Drive OCR belum aktif. Aktifkan Advanced Drive Service: Drive API v2, lalu Google Drive API pada Google Cloud project.');
  const source = Drive.Files.get(fileId);
  const resource = { title: 'OCR-' + source.title, mimeType: 'application/vnd.google-apps.document' };
  const converted = Drive.Files.copy(resource, fileId, { ocr: true, ocrLanguage: 'id', convert: true });
  const text = DocumentApp.openById(converted.id).getBody().getText();
  try { Drive.Files.remove(converted.id); } catch (error) { /* OCR document cleanup is best effort. */ }
  return text || '';
}

function parseOcrDraft_(text, moduleKey) {
  const raw = String(text || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  const amount = parseOcrAmount_(raw);
  const date = parseOcrDate_(raw);
  if (moduleKey === 'income') {
    return { TransactionDate: date || '', IncomeType: '', OperatingIncome: '', Amount: amount || '', Payer: '', AccountID: '', Description: 'OCR draft — periksa pengirim, tanggal, dan nominal sebelum menyimpan.', OCRText: raw };
  }
  return { TransactionDate: date || '', Payer: '', AccountID: '', ExpenseType: 'EXPENSE', BudgetCategory: '', BudgetItem: '', Amount: amount || '', Merchant: '', Notes: 'OCR draft — periksa merchant, tanggal, dan nominal sebelum menyimpan.', OCRText: raw };
}

function parseOcrAmount_(text) {
  const matches = String(text || '').match(/(?:rp\.?\s*)?(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d{4,})(?!\d)/ig) || [];
  const values = matches.map((value) => toNumber_(String(value).replace(/[^0-9,.-]/g, ''))).filter((value) => value > 0);
  return values.length ? Math.max.apply(null, values) : '';
}

function parseOcrDate_(text) {
  const match = String(text || '').match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (!match) return '';
  const year = match[3].length === 2 ? '20' + match[3] : match[3];
  return year + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[1]).padStart(2, '0');
}

function getAntamGoldPrice(token, priceDate, forceRefresh) {
  const session = requireSession_(token);
  const date = normalizeDate_(priceDate) || Utilities.formatDate(new Date(), APP.timeZone, 'yyyy-MM-dd');
  const existing = activeRecords_('GoldPriceHistory', 'Status').find((row) => String(row.PriceDate || '').slice(0, 10) === date && String(row.Source || '').toUpperCase() === 'ANTAM');
  if (existing && !forceRefresh) return publicRecord_(existing);
  const today = Utilities.formatDate(new Date(), APP.timeZone, 'yyyy-MM-dd');
  if (date !== today) throw new Error('Harga beli Antam untuk ' + date + ' belum tersedia di GoldPriceHistory. Simpan snapshot harga pada tanggal transaksi terlebih dahulu.');
  const response = UrlFetchApp.fetch('https://www.logammulia.com/harga-emas-hari-ini', { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Anggaranku-7.0/1.0' } });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('Harga Antam tidak dapat dibaca dari sumber resmi.');
  const html = response.getContentText();
  const match = html.match(/1\s*gr[\s\S]{0,500}?([0-9]{1,3}(?:[,.][0-9]{3})+)/i);
  const prices = html.match(/1\s*gr[\s\S]{0,900}?([0-9]{1,3}(?:[,.][0-9]{3})+)[\s\S]{0,250}?([0-9]{1,3}(?:[,.][0-9]{3})+)/i);
  if (!match && !prices) throw new Error('Harga emas 1 gram pada halaman Antam tidak berhasil dibaca.');
  const base = toNumber_(prices ? prices[1] : match[1]);
  const tax = toNumber_(prices ? prices[2] : match[1]);
  const timestamp = isoNow_();
  if (existing && forceRefresh) { existing.Status = 'VOID'; existing.Notes = (existing.Notes || '') + ' Digantikan snapshot manual ' + timestamp + '.'; updateRecord_('GoldPriceHistory', existing.__rowNumber, existing); }
  const row = { GoldPriceID: makeId_('GOLD'), PriceDate: date, Source: 'ANTAM', ProductWeightGram: 1, BasePrice: base, TaxPrice: tax, PricePerGram: tax, CapturedAt: timestamp, Status: 'ACTIVE', Notes: 'Harga beli Antam 1 gram dari halaman resmi Logam Mulia.' };
  appendRecord_('GoldPriceHistory', row);
  auditForSession_(session, 'investments', row.GoldPriceID, 'GOLD_PRICE_REFRESH', existing ? publicRecord_(existing) : null, publicRecord_(row), 'Snapshot harga emas Antam diperbarui manual.');
  return publicRecord_(row);
}

function getGoogleFinanceGoldPrice(token, priceDate, forceRefresh) {
  const session = requireSession_(token);
  const date = normalizeDate_(priceDate) || Utilities.formatDate(new Date(), APP.timeZone, 'yyyy-MM-dd');
  const existing = activeRecords_('GoldPriceHistory', 'Status').find((row) => String(row.PriceDate || '').slice(0, 10) === date && String(row.Source || '').toUpperCase().indexOf('GOOGLEFINANCE') === 0);
  if (existing && !forceRefresh) return publicRecord_(existing);
  const today = Utilities.formatDate(new Date(), APP.timeZone, 'yyyy-MM-dd');
  if (date !== today) throw new Error('GoogleFinance hanya menyediakan harga live untuk hari ini. Gunakan input manual untuk tanggal lain.');
  const spreadsheet = SpreadsheetApp.openById(APP.spreadsheetId);
  const tempName = '__AnggarankuGoldFinance_' + new Date().getTime();
  const sheet = spreadsheet.insertSheet(tempName);
  try {
    sheet.getRange('A1:D1').setValues([['CURRENCY:XAUUSD', '', 'CURRENCY:USDIDR', '']]);
    sheet.getRange('B1').setFormula('=IFERROR(GOOGLEFINANCE(A1,"price"),"")');
    sheet.getRange('D1').setFormula('=IFERROR(GOOGLEFINANCE(C1,"price"),"")');
    SpreadsheetApp.flush();
    Utilities.sleep(3000);
    const xauUsd = toNumber_(sheet.getRange('B1').getValue());
    const usdIdr = toNumber_(sheet.getRange('D1').getValue());
    if (!(xauUsd > 0) || !(usdIdr > 0)) throw new Error('GoogleFinance belum mengembalikan harga XAU/USD dan USD/IDR. Gunakan input manual.');
    const pricePerGram = xauUsd * usdIdr / 31.1034768;
    const timestamp = isoNow_();
    if (existing && forceRefresh) { existing.Status = 'VOID'; existing.Notes = (existing.Notes || '') + ' Digantikan snapshot GoogleFinance ' + timestamp + '.'; updateRecord_('GoldPriceHistory', existing.__rowNumber, existing); }
    const row = { GoldPriceID: makeId_('GOLD'), PriceDate: date, Source: 'GOOGLEFINANCE:XAUUSD+USDIDR', ProductWeightGram: 1, BasePrice: pricePerGram, TaxPrice: '', PricePerGram: pricePerGram, CapturedAt: timestamp, Status: 'ACTIVE', Notes: 'Harga spot XAU/USD dikonversi ke Rupiah/gram menggunakan kurs USD/IDR dari GoogleFinance. Bukan harga jual/beli Antam.' };
    appendRecord_('GoldPriceHistory', row);
    auditForSession_(session, 'investments', row.GoldPriceID, 'GOLD_PRICE_GOOGLEFINANCE', existing ? publicRecord_(existing) : null, publicRecord_(row), 'Snapshot harga emas diperbarui melalui GoogleFinance.');
    return publicRecord_(row);
  } finally { spreadsheet.deleteSheet(sheet); }
}

function saveManualGoldPrice(token, priceDate, pricePerGram, notes) {
  const session = requireSession_(token);
  const date = normalizeDate_(priceDate) || Utilities.formatDate(new Date(), APP.timeZone, 'yyyy-MM-dd');
  const price = toNumber_(pricePerGram);
  if (!(price > 0)) throw new Error('Harga emas per gram harus lebih besar dari nol.');
  const existing = activeRecords_('GoldPriceHistory', 'Status').find((row) => String(row.PriceDate || '').slice(0, 10) === date && String(row.Source || '').toUpperCase() === 'MANUAL');
  const timestamp = isoNow_();
  if (existing) { existing.Status = 'VOID'; existing.Notes = (existing.Notes || '') + ' Digantikan input manual ' + timestamp + '.'; updateRecord_('GoldPriceHistory', existing.__rowNumber, existing); }
  const row = { GoldPriceID: makeId_('GOLD'), PriceDate: date, Source: 'MANUAL', ProductWeightGram: 1, BasePrice: price, TaxPrice: '', PricePerGram: price, CapturedAt: timestamp, Status: 'ACTIVE', Notes: String(notes || 'Harga emas diinput manual oleh pengguna.') };
  appendRecord_('GoldPriceHistory', row);
  auditForSession_(session, 'investments', row.GoldPriceID, 'GOLD_PRICE_MANUAL', existing ? publicRecord_(existing) : null, publicRecord_(row), 'Snapshot harga emas diinput manual.');
  return publicRecord_(row);
}

function resolveAntamGoldPrice_(priceDate) {
  const date = normalizeDate_(priceDate) || Utilities.formatDate(new Date(), APP.timeZone, 'yyyy-MM-dd');
  const existing = activeRecords_('GoldPriceHistory', 'Status').find((row) => String(row.PriceDate || '').slice(0, 10) === date && String(row.Source || '').toUpperCase() === 'ANTAM');
  if (existing && toNumber_(existing.PricePerGram) > 0) return toNumber_(existing.PricePerGram);
  const today = Utilities.formatDate(new Date(), APP.timeZone, 'yyyy-MM-dd');
  if (date !== today) throw new Error('Harga beli Antam untuk tanggal ' + date + ' belum tersedia.');
  const response = UrlFetchApp.fetch('https://www.logammulia.com/harga-emas-hari-ini', { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Anggaranku-7.0/1.0' } });
  const html = response.getContentText();
  const prices = html.match(/1\s*gr[\s\S]{0,900}?([0-9]{1,3}(?:[,.][0-9]{3})+)[\s\S]{0,250}?([0-9]{1,3}(?:[,.][0-9]{3})+)/i);
  if (!prices) throw new Error('Harga beli Antam tidak berhasil dibaca.');
  const base = toNumber_(prices[1]);
  const tax = toNumber_(prices[2]);
  appendRecord_('GoldPriceHistory', { GoldPriceID: makeId_('GOLD'), PriceDate: date, Source: 'ANTAM', ProductWeightGram: 1, BasePrice: base, TaxPrice: tax, PricePerGram: tax, CapturedAt: isoNow_(), Status: 'ACTIVE', Notes: 'Harga beli Antam 1 gram dari halaman resmi Logam Mulia.' });
  return tax;
}

function saveExpenseWithRouting_(session, input) {
  validateModulePayload_('expenses', input);
  return withLock_(() => {
    const timestamp = isoNow_();
    const expenseId = String(input.recordId || input.ExpenseID || '').trim() || makeId_('EXP');
    const existing = findRecord_('Expenses', 'ExpenseID', expenseId);
    const details = expenseDetailsFromPayload_(input);
    if (!existing && input.ExpenseType === 'INVESTMENT') calculateInvestmentPurchase_(input.TransactionDate, details);
    const expensePeriod = String(input.TransactionDate || '').slice(0, 7);
    const category = input.ExpenseType === 'EXPENSE' ? activeBudgetCategoryForExpense_(expensePeriod, input.BudgetCategoryID) : null;
    const budget = category ? (budgetIdForCategory_(expensePeriod, category.CategoryID) || (input.BudgetID ? findRecord_('Budgets', 'BudgetID', input.BudgetID) : null)) : (input.BudgetID ? findRecord_('Budgets', 'BudgetID', input.BudgetID) : null);
    const record = {
      ExpenseID: expenseId,
      TransactionDate: input.TransactionDate,
      BookDate: input.BookDate || input.TransactionDate,
      Payer: input.Payer,
      PaymentMethod: input.PaymentMethod,
      AccountID: input.AccountID || '',
      ExpenseType: input.ExpenseType,
      BudgetCategoryID: category ? category.CategoryID : (input.BudgetCategoryID || (budget && budget.CategoryID) || ''),
      BudgetID: budget ? budget.BudgetID : (input.BudgetID || ''),
      BudgetCategory: category ? String(category.Path || category.Name || '').split(' · ')[0] : (budget ? budget.Category : (input.BudgetCategory || '')),
      BudgetItem: category ? String(category.Path || category.Name || '').split(' · ').slice(1).join(' · ') : (budget ? budget.Item : (input.BudgetItem || '')),
      Amount: toNumber_(input.Amount),
      CashAmount: toNumber_(input.CashAmount),
      Merchant: input.Merchant || '',
      Notes: input.Notes || '',
      Status: existing ? existing.Status : 'ACTIVE',
      OCRStatus: input.OCRStatus || '',
      ShoppingID: input.ShoppingID || (existing && existing.ShoppingID) || '',
      CreatedBy: existing ? existing.CreatedBy : session.userId,
      CreatedAt: existing ? existing.CreatedAt : timestamp,
      UpdatedAt: timestamp,
      RelatedModule: existing ? existing.RelatedModule : '',
      RelatedRecordID: existing ? existing.RelatedRecordID : '',
      DetailsJSON: JSON.stringify(details),
    };
    if (existing) updateRecord_('Expenses', existing.__rowNumber, Object.assign({}, existing, record));
    else appendRecord_('Expenses', record);

    let relatedModule = '';
    let relatedRecordId = '';
    if (!existing) {
      const linked = createExpenseLinkedRecord_(session, record, details);
      relatedModule = linked.relatedModule;
      relatedRecordId = linked.relatedRecordId;
      record.RelatedModule = relatedModule;
      record.RelatedRecordID = relatedRecordId;
      updateRecord_('Expenses', findRecord_('Expenses', 'ExpenseID', expenseId).__rowNumber, record);
    }
    const saved = findRecord_('Expenses', 'ExpenseID', expenseId);
    if (!existing && record.ShoppingID) markShoppingAsExpense_(session, record.ShoppingID, expenseId, record.Amount, record.TransactionDate, details);
    auditForSession_(session, 'expenses', expenseId, existing ? 'UPDATE' : 'CREATE', existing ? publicRecord_(existing) : null, publicRecord_(saved), 'Pengeluaran disimpan sebagai parent dan dirutekan ke modul terkait.');
    return { success: true, action: existing ? 'UPDATE' : 'CREATE', record: publicRecord_(saved), relatedModule: relatedModule || saved.RelatedModule || '', relatedRecordID: relatedRecordId || saved.RelatedRecordID || '' };
  });
}

function expenseDetailsFromPayload_(input) {
  const fields = ['DestinationAccountID', 'DestinationAccountName', 'ZakatProvider', 'DebtID', 'PrincipalAmount', 'InterestAmount', 'InvestmentName', 'TickerSymbol', 'MarketSource', 'PurposeGoalID', 'Purpose', 'ChildPurposes', 'Instrument', 'Provider', 'InvestmentAccountID', 'Quantity', 'UnitPrice', 'LotCount', 'GoldWeightGram', 'GoldPricePerGram', 'BondNominal', 'BondPricePct', 'CostBasis', 'CurrentPrice', 'AssetName', 'AssetOwner', 'AssetType', 'ReportingCategory', 'AcquisitionDate', 'AcquisitionValue', 'ShoppingID', 'InventoryItemID', 'PaymentMethod', 'PaymentAccountID', 'CashAmount'];
  const details = {};
  fields.forEach((field) => { if (input[field] !== undefined && input[field] !== '') details[field] = input[field]; });
  return details;
}

function markShoppingAsExpense_(session, shoppingId, expenseId, amount, purchaseDate, details) {
  const shopping = findRecord_('ShoppingList', 'ShoppingID', shoppingId);
  if (!shopping) throw new Error('Item Daftar Belanja tidak ditemukan.');
  if (String(shopping.Status || '').toUpperCase() === 'EXPENSE' && String(shopping.ExpenseID || '') !== String(expenseId)) throw new Error('Item Daftar Belanja sudah terhubung ke Pengeluaran lain.');
  shopping.Status = 'EXPENSE'; shopping.ActualAmount = toNumber_(amount); shopping.PurchasedDate = purchaseDate; shopping.ExpenseID = expenseId; if (details && details.PaymentMethod) { shopping.PaymentMethod = details.PaymentMethod; shopping.PaymentAccountID = details.PaymentMethod === 'NON_CASH' ? (details.PaymentAccountID || '') : ''; shopping.CashAmount = details.PaymentMethod === 'CASH' ? toNumber_(details.CashAmount || amount) : 0; } shopping.UpdatedAt = isoNow_();
  updateRecord_('ShoppingList', shopping.__rowNumber, shopping);
  if (details && details.InventoryItemID && toNumber_(shopping.Quantity) > 0) {
    appendRecord_('InventoryMovements', { MovementID: makeId_('MOVE'), ItemID: details.InventoryItemID, MovementDate: purchaseDate, MovementType: 'IN', Quantity: toNumber_(shopping.Quantity), UnitCost: toNumber_(amount) / Math.max(1, toNumber_(shopping.Quantity)), ExpenseID: expenseId, Notes: 'Pembelian dari Daftar Belanja.', CreatedBy: session.userId, CreatedAt: isoNow_() });
  }
  auditForSession_(session, 'shopping', shoppingId, 'PURCHASE_TO_EXPENSE', null, publicRecord_(shopping), 'Daftar Belanja dikonversi menjadi Pengeluaran.');
}

function calculateInvestmentPurchase_(transactionDate, details) {
  const instrument = String(details.Instrument || '').toUpperCase();
  if (!details.Provider) throw new Error('Provider / Platform wajib diisi untuk Investasi.');
  if (instrument === 'EMAS') {
    const grams = toNumber_(details.GoldWeightGram);
    if (grams <= 0) throw new Error('Jumlah Emas dalam gram harus lebih besar dari nol.');
    const price = resolveAntamGoldPrice_(transactionDate);
    const amount = grams * price;
    return { instrument: instrument, quantity: grams, lotCount: 0, goldWeightGram: grams, goldPricePerGram: price, bondNominal: 0, bondPricePct: 0, costBasis: amount, currentPrice: price, currentValue: amount };
  }
  if (instrument === 'SAHAM') {
    const lots = toNumber_(details.LotCount);
    const price = toNumber_(details.CurrentPrice);
    if (lots <= 0 || price <= 0) throw new Error('Jumlah lot dan harga beli saham wajib lebih besar dari nol.');
    const shares = lots * 100;
    const amount = shares * price;
    return { instrument: instrument, quantity: shares, lotCount: lots, goldWeightGram: 0, goldPricePerGram: 0, bondNominal: 0, bondPricePct: 0, costBasis: amount, currentPrice: price, currentValue: amount };
  }
  if (instrument === 'OBLIGASI') {
    const nominal = toNumber_(details.BondNominal);
    const pricePct = toNumber_(details.BondPricePct);
    if (nominal <= 0 || pricePct <= 0) throw new Error('Nilai nominal dan harga beli obligasi wajib lebih besar dari nol.');
    const amount = nominal * pricePct / 100;
    return { instrument: instrument, quantity: 1, lotCount: 0, goldWeightGram: 0, goldPricePerGram: 0, bondNominal: nominal, bondPricePct: pricePct, costBasis: amount, currentPrice: pricePct, currentValue: amount };
  }
  if (['RD_PASAR_UANG', 'RD_OBLIGASI', 'RD_DANA_SAHAM', 'RD_CAMPURAN'].includes(instrument)) {
    const amount = toNumber_(details.CostBasis);
    if (amount <= 0) throw new Error('Nilai pembelian Reksa Dana wajib lebih besar dari nol.');
    return { instrument: instrument, quantity: 1, lotCount: 0, goldWeightGram: 0, goldPricePerGram: 0, bondNominal: 0, bondPricePct: 0, costBasis: amount, currentPrice: amount, currentValue: amount };
  }
  throw new Error('Jenis Investasi tidak dikenal.');
}

function createExpenseLinkedRecord_(session, expense, details) {
  const timestamp = isoNow_();
  if (expense.PaymentMethod === 'CASH' && expense.ExpenseType !== 'TRANSFER') {
    appendRecord_('CashMovements', { CashID: makeId_('CASH'), TransactionDate: expense.TransactionDate, MovementType: 'USAGE', Amount: expense.Amount, SourceAccountID: '', ExpenseID: expense.ExpenseID, Notes: 'Pembayaran Cash dari Pengeluaran.', Status: 'ACTIVE', CreatedBy: session.userId, CreatedAt: timestamp });
  }
  if (expense.ExpenseType === 'TRANSFER') {
    if (!details.DestinationAccountID) throw new Error('Rekening Tujuan wajib diisi untuk transaksi Transfer.');
    if (String(expense.AccountID) === String(details.DestinationAccountID)) throw new Error('Rekening sumber dan tujuan harus berbeda.');
    const transfer = { TransferID: makeId_('TRF'), TransactionDate: expense.TransactionDate, BookDate: expense.BookDate, SourceAccountID: expense.AccountID, DestinationAccountID: details.DestinationAccountID, Amount: expense.Amount, Notes: expense.Notes, Status: 'ACTIVE', CreatedBy: session.userId, CreatedAt: timestamp, ExpenseID: expense.ExpenseID };
    appendRecord_('Transfers', transfer);
    return { relatedModule: 'transfers', relatedRecordId: transfer.TransferID };
  }
  if (expense.ExpenseType === 'DEBT_PAYMENT') {
    if (!details.DebtID) throw new Error('Utang wajib dipilih untuk Pembayaran Utang.');
    const debt = activeRecords_('Debts', 'Status').find((row) => String(row.DebtID) === String(details.DebtID));
    if (!debt) throw new Error('Utang aktif yang dipilih tidak ditemukan.');
    const principal = Math.max(0, toNumber_(details.PrincipalAmount || expense.Amount));
    const interest = Math.max(0, toNumber_(details.InterestAmount));
    if (principal + interest > expense.Amount + 0.01) throw new Error('Pokok dan margin/bunga tidak boleh melebihi nominal pembayaran.');
    const payment = { DebtPaymentID: makeId_('DPAY'), DebtID: debt.DebtID, PaymentDate: expense.TransactionDate, Amount: expense.Amount, PrincipalAmount: principal, InterestAmount: interest, ExpenseID: expense.ExpenseID, Notes: expense.Notes, CreatedBy: session.userId, CreatedAt: timestamp };
    appendRecord_('DebtPayments', payment);
    return { relatedModule: 'debts', relatedRecordId: payment.DebtPaymentID };
  }
  if (expense.ExpenseType === 'INVESTMENT') {
    const purchase = calculateInvestmentPurchase_(expense.TransactionDate, details);
    const investment = { InvestmentID: makeId_('INV'), InvestmentName: details.InvestmentName || details.TickerSymbol || details.Provider || purchase.instrument, TickerSymbol: details.TickerSymbol || '', MarketSource: details.MarketSource || (purchase.instrument === 'EMAS' ? 'ANTAM' : 'MANUAL'), PurposeGoalID: details.PurposeGoalID || '', Purpose: details.Purpose || '', ChildPurposesJSON: JSON.stringify(Array.isArray(details.ChildPurposes) ? details.ChildPurposes : []), Instrument: purchase.instrument, Provider: details.Provider, AccountID: expense.AccountID || details.InvestmentAccountID || '', Quantity: purchase.quantity, LotCount: purchase.lotCount, GoldWeightGram: purchase.goldWeightGram, GoldPricePerGram: purchase.goldPricePerGram, BondNominal: purchase.bondNominal, BondPricePct: purchase.bondPricePct, CostBasis: purchase.costBasis, CurrentPrice: purchase.currentPrice, CurrentValue: purchase.currentValue, AsOfDate: expense.TransactionDate, Status: 'ACTIVE', Notes: expense.Notes, CreatedBy: session.userId, CreatedAt: timestamp, UpdatedAt: timestamp, ExpenseID: expense.ExpenseID };
    appendRecord_('Investments', investment);
    return { relatedModule: 'investments', relatedRecordId: investment.InvestmentID };
  }
  if (expense.ExpenseType === 'ASSET_ACQUISITION') {
    if (!details.AssetName || !details.AssetOwner || !details.AssetType || !details.AcquisitionDate || toNumber_(details.AcquisitionValue) <= 0) throw new Error('Detail Pengadaan Aset belum lengkap.');
    const assetType = resolveAssetType_(details.AssetType);
    const reportingCategory = normalizeAssetReportingCategory_(details.ReportingCategory) || assetReportingCategory_({ AssetType: details.AssetType }, assetType);
    if (!assetType || !reportingCategory || !ASSET_REPORTING_CATEGORIES.some((item) => item[0] === reportingCategory)) throw new Error('Jenis atau kelompok rekap Pengadaan Aset tidak valid.');
    const asset = { AssetID: makeId_('AST'), Name: details.AssetName, Owner: details.AssetOwner, AssetType: assetType.AssetTypeID, ReportingCategory: reportingCategory, AcquisitionDate: details.AcquisitionDate, AcquisitionValue: toNumber_(details.AcquisitionValue), Status: 'ACTIVE', Notes: expense.Notes, CreatedBy: session.userId, CreatedAt: timestamp, UpdatedAt: timestamp, ExpenseID: expense.ExpenseID };
    appendRecord_('Assets', asset);
    return { relatedModule: 'assets', relatedRecordId: asset.AssetID };
  }
  return { relatedModule: '', relatedRecordId: '' };
}

/** Generate missing monthly Budgets from active BudgetRules. Existing month/code rows are preserved for manual variation. */
function generateBudgetFromPolicy(token, period, policyId) {
  beginRequestCache_();
  const session = requireSession_(token);
  if (String(session.role || '').toUpperCase() !== 'AYAH') throw new Error('Hanya Ayah yang dapat menjalankan sinkronisasi anggaran dari kebijakan.');
  const result = generateBudgetFromPolicy_(period, policyId);
  auditForSession_(session, 'budget', result.period, 'GENERATE_FROM_POLICY', null, result, 'Anggaran bulanan dibuat dari BudgetRules melalui endpoint terautentikasi.');
  return result;
}

function generateBudgetFromPolicy_(period, policyId) {
  const targetPeriod = String(period || currentPeriod_());
  if (!/^\d{4}-\d{2}$/.test(targetPeriod)) throw new Error('Periode harus berformat YYYY-MM.');
  ensureSchema_();
  const rules = activeRecords_('BudgetRules', 'Status').filter((rule) => !policyId || String(rule.PolicyID) === String(policyId)).sort((a, b) => toNumber_(a.SortOrder) - toNumber_(b.SortOrder));
  const existing = activeRecords_('Budgets', 'Status').filter((row) => periodKey_(row.Period) === targetPeriod);
  let created = 0;
  rules.forEach((rule) => {
    if (existing.some((row) => String(row.BudgetCode) === String(rule.BudgetCode))) return;
    appendRecord_('Budgets', {
      BudgetID: makeId_('BUD'), Period: targetPeriod, Category: rule.Category || '', Item: rule.Item || '', SourceType: 'POLICY', SourceID: rule.RuleID,
      BudgetType: rule.BudgetType || 'FLEXIBLE', Constraint: rule.Constraint || 'MAX', Amount: toNumber_(rule.FixedAmount), Percentage: toNumber_(rule.Percentage),
      DestinationAccountID: '', Status: 'ACTIVE', CreatedBy: 'SYSTEM_POLICY', CreatedAt: isoNow_(), UpdatedAt: isoNow_(), BudgetCode: rule.BudgetCode || '', ParentBudgetID: rule.ParentRuleID || '',
      Level: rule.Level || 0, SortOrder: rule.SortOrder || 0, BudgetAmount: toNumber_(rule.FixedAmount), BudgetPercentage: toNumber_(rule.Percentage), PaidAmount: 0, PaidPercentage: 0,
      DestinationAccountName: '', Notes: 'Generated from Budget Policy; monthly adjustments remain editable.'
    });
    created += 1;
  });
  return { success: true, period: targetPeriod, rules: rules.length, created: created, preserved: existing.length };
}

/** Read-only capacity monitor. Does not mutate or delete any data. */
function storageHealthForDashboard_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('anggaranku_storage_health_v1');
  if (cached) { try { return JSON.parse(cached); } catch (error) {} }
  const ss = SpreadsheetApp.openById(APP.spreadsheetId);
  const sheets = ss.getSheets();
  let usedCells = 0;
  let recordCount = 0;
  sheets.forEach((sheet) => { const range = sheet.getDataRange(); usedCells += range.getNumRows() * range.getNumColumns(); recordCount += Math.max(0, range.getNumRows() - 1); });
  const cellLimit = 10000000;
  const cellPercent = usedCells / cellLimit * 100;
  let drivePercent = null;
  try { const used = Number(DriveApp.getStorageUsed()); const limit = Number(DriveApp.getStorageLimit()); if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0) drivePercent = used / limit * 100; } catch (error) {}
  const maxPercent = drivePercent === null ? cellPercent : Math.max(cellPercent, drivePercent);
  const result = { status: maxPercent >= CAPACITY_THRESHOLDS.criticalPercent ? 'CRITICAL' : (maxPercent >= CAPACITY_THRESHOLDS.warningPercent ? 'WARNING' : 'HEALTHY'), percent: maxPercent, spreadsheetPercent: cellPercent, drivePercent: drivePercent, recordCount: recordCount, sheetCount: sheets.length, exportRecommended: maxPercent >= CAPACITY_THRESHOLDS.warningPercent };
  cache.put('anggaranku_storage_health_v1', JSON.stringify(result), 300);
  return result;
}

function getAboutApplicationData_(session) {
  const health = storageHealthForDashboard_();
  const result = { module: 'about', label: MODULE_CONFIG.about.label, app: { name: APP.name, familyName: APP.familyName, timeZone: APP.timeZone, projectDate: '2 September 2026', version: '7.0' }, storageHealth: health, faqs: [
    { question: 'Apa fungsi aplikasi ini?', answer: 'Anggaranku membantu keluarga mencatat penerimaan, pengeluaran, transfer, kas, aset, utang, investasi, dan rencana keuangan secara terstruktur.' },
    { question: 'Apakah data dapat dihapus?', answer: 'Transaksi menggunakan prinsip audit dan lifecycle. Gunakan aksi Void sesuai hak akses; histori tetap tersimpan untuk pemeriksaan.' },
    { question: 'Bagaimana menjaga keamanan data?', answer: 'Batasi akses deployment dan Spreadsheet kepada pengguna keluarga yang berwenang, serta lakukan export snapshot secara berkala.' }
  ] };
  auditForSession_(session, 'System', '', 'ABOUT_VIEW', null, { storageStatus: health.status }, 'Tentang Aplikasi viewed; read-only.');
  return result;
}
function getStorageHealthData(token) {
  beginRequestCache_();
  const session = requireSession_(token);
  const ss = SpreadsheetApp.openById(APP.spreadsheetId);
  const sheets = ss.getSheets();
  let usedCells = 0;
  let recordCount = 0;
  const sheetStats = sheets.map((sheet) => {
    const range = sheet.getDataRange();
    const rows = Math.max(0, range.getNumRows() - 1);
    const cols = range.getNumColumns();
    const cells = range.getNumRows() * cols;
    usedCells += cells;
    recordCount += rows;
    return { name: sheet.getName(), rows: rows, columns: cols, cells: cells };
  }).sort((a, b) => b.cells - a.cells);
  const cellLimit = 10000000;
  let driveUsed = null;
  let driveLimit = null;
  try {
    driveUsed = Number(DriveApp.getStorageUsed());
    driveLimit = Number(DriveApp.getStorageLimit());
    if (!Number.isFinite(driveUsed) || !Number.isFinite(driveLimit) || driveLimit <= 0) { driveUsed = null; driveLimit = null; }
  } catch (error) {
    driveUsed = null;
    driveLimit = null;
  }
  const cellPercent = usedCells / cellLimit * 100;
  const drivePercent = driveUsed !== null && driveLimit ? driveUsed / driveLimit * 100 : null;
  const maxPercent = drivePercent === null ? cellPercent : Math.max(cellPercent, drivePercent);
  const status = maxPercent >= CAPACITY_THRESHOLDS.criticalPercent ? 'CRITICAL' : (maxPercent >= CAPACITY_THRESHOLDS.warningPercent ? 'WARNING' : 'HEALTHY');
  const result = {
    checkedAt: new Date().toISOString(), status: status,
    thresholds: CAPACITY_THRESHOLDS,
    spreadsheet: { usedCells: usedCells, cellLimit: cellLimit, percent: cellPercent, recordCount: recordCount, sheetCount: sheets.length, largestSheets: sheetStats.slice(0, 5) },
    drive: { usedBytes: driveUsed, limitBytes: driveLimit, percent: drivePercent, available: drivePercent !== null },
    exportRecommended: status !== 'HEALTHY' || cellPercent >= CAPACITY_THRESHOLDS.warningPercent || (drivePercent !== null && drivePercent >= CAPACITY_THRESHOLDS.warningPercent),
    note: drivePercent === null ? 'Storage Drive tidak dapat dibaca dari konteks eksekusi ini; pemantauan sel Spreadsheet tetap aktif.' : 'Persentase Drive berlaku untuk storage akun Google pemilik/eksekutor yang terlihat oleh Apps Script.'
  };
  auditForSession_(session, 'System', '', 'STORAGE_HEALTH_VIEW', null, result, 'Storage health viewed; read-only.');
  return result;
}

/** Read-only export snapshot. JSON is intentionally used so every sheet remains reconstructable. */
function exportAppData(token) {
  beginRequestCache_();
  const session = requireSession_(token);
  const ss = SpreadsheetApp.openById(APP.spreadsheetId);
  const sheets = ss.getSheets();
  const payload = { app: APP.name, spreadsheetId: APP.spreadsheetId, exportedAt: new Date().toISOString(), sheets: {} };
  sheets.forEach((sheet) => {
    const values = sheet.getDataRange().getValues();
    if (!values.length) return;
    const headers = values[0].map((value) => String(value || ''));
    payload.sheets[sheet.getName()] = values.slice(1).map((row) => {
      const item = {};
      headers.forEach((header, index) => { if (header) { const value = row[index]; item[header] = value instanceof Date ? value.toISOString() : value; } });
      return item;
    });
  });
  auditForSession_(session, 'System', '', 'DATA_EXPORT', null, { sheetCount: sheets.length }, 'Append-only export snapshot generated.');
  return payload;
}
