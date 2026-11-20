/** Anggaranku 7.0 — application configuration. */
const APP = {
  name: 'Anggaranku 7.0',
  familyName: 'Nurrahman Family',
  spreadsheetId: '1DjhZqN718hecqqtle9l1saFddlyN8orXDDUhHatOreM',
  timeZone: 'Asia/Jakarta',
  rootDriveFolderName: 'Anggaranku 7.0',
  driveFolders: ['Data', 'Bukti Transaksi', 'Laporan', 'Export', 'Backup'],
  sessionSeconds: 21600,
  allowDemoLogin: false,
  demoUsername: 'demo',
  demoPin: '0000',
  defaultPeriodType: 'MONTHLY',
  currentUserRoles: ['AYAH', 'BUNDA'],
  nishabGoldGrams: 85,
  nishabRate: 0.025,
};

const INCOME_TYPES = ['Gaji', 'Tunjangan Kinerja', 'Uang Makan', 'Tunjangan Khusus (K3)', 'Dividen dan Kupon', 'Penerimaan Lainnya yang Sah'];
const PAYMENT_METHODS = [['CASH', 'Cash'], ['NON_CASH', 'Non-Cash / QRIS']];
const INVESTMENT_INSTRUMENTS = [['EMAS', 'Emas'], ['SAHAM', 'Saham'], ['OBLIGASI', 'Obligasi'], ['RD_PASAR_UANG', 'RD Pasar Uang'], ['RD_OBLIGASI', 'RD Obligasi'], ['RD_DANA_SAHAM', 'RD Dana Saham'], ['RD_CAMPURAN', 'RD Campuran']];
const ASSET_REPORTING_CATEGORIES = [['TANAH', 'Tanah'], ['RUMAH', 'Rumah'], ['KENDARAAN', 'Kendaraan'], ['ELEKTRONIK', 'Elektronik'], ['GAWAI', 'Gawai'], ['DAPUR', 'Peralatan Dapur'], ['FURNITUR', 'Furnitur dan Perabot Rumah Tangga'], ['AIR_SANITASI', 'Peralatan Air dan Sanitasi'], ['ANAK', 'Keperluan Anak'], ['PENUNJANG_RUMAH', 'Penunjang Rumah Lainnya'], ['TAK_BERWUJUD', 'Aset Tak Berwujud']];
const EXPENSE_TYPES = [
  ['EXPENSE', 'Pengeluaran Operasional'],
  ['TRANSFER', 'Transfer'],
  ['INVESTMENT', 'Investasi'],
  ['ASSET_ACQUISITION', 'Pengadaan Aset'],
  ['DEBT_PAYMENT', 'Pembayaran Utang'],
];

const BANK_CATALOG = [
  ['567', 'Allo Bank'], ['531', 'Amar Bank'], ['542', 'Bank Jago'], ['542', 'Jago'], ['542', 'Stockbit RDN'], ['494', 'Bank Raya'], ['535', 'SeaBank Indonesia'], ['947', 'Bank Aladin Syariah'], ['200', 'BTN Syariah'], ['116', 'Bank Aceh Syariah'], ['037', 'Bank Artha Graha Internasional'], ['137', 'Bank Banten'], ['014', 'Bank BCA'], ['536', 'Bank BCA Syariah'], ['110', 'Bank BJB'], ['425', 'Bank BJB Syariah'], ['009', 'Bank BNI'], ['129', 'Bank BPD Bali'], ['112', 'Bank BPD DIY'], ['002', 'Bank BRI'], ['200', 'Bank BTN'], ['547', 'Bank BTPN Syariah'], ['076', 'Bank Bumi Arta'], ['054', 'Bank Capital Indonesia'], ['036', 'Bank CCB Indonesia'], ['022', 'Bank CIMB Niaga'], ['949', 'Bank CTBC Indonesia'], ['011', 'Bank Danamon'], ['046', 'Bank DBS Indonesia'], ['501', 'Bank Digital BCA'], ['087', 'Bank HSBC Indonesia'], ['513', 'Bank Ina Perdana'], ['555', 'Bank Index Selindo'], ['111', 'Bank Jakarta'], ['113', 'Bank Jateng'], ['114', 'Bank Jatim'], ['095', 'Bank Jtrust Indonesia'], ['123', 'Bank Kalbar'], ['125', 'Bank Kalteng'], ['124', 'Bank Kaltimtara'], ['441', 'Bank KB Bukopin'], ['521', 'Bank KB Syariah Bukopin'], ['484', 'Bank KEB Hana Indonesia'], ['131', 'Bank Maluku Malut'], ['008', 'Bank Mandiri'], ['157', 'Bank Maspion'], ['097', 'Bank Mayapada'], ['016', 'Bank Maybank Indonesia'], ['426', 'Bank Mega'], ['506', 'Bank Mega Syariah'], ['151', 'Bank Mestika'], ['485', 'Bank MNC'], ['147', 'Bank Muamalat'], ['548', 'Bank Multiarta Sentosa'], ['118', 'Bank Nagari'], ['503', 'Bank National Nobu'], ['490', 'Bank Neo Commerce'], ['028', 'Bank OCBC NISP'], ['069', 'Bank of China Jakarta Branch'], ['019', 'Bank Panin'], ['132', 'Bank Papua'], ['013', 'Bank Permata'], ['167', 'Bank QNB Indonesia'], ['119', 'Bank Riau Kepri Syariah'], ['523', 'Bank Sahabat Sampoerna'], ['472', 'Bank Saqu'], ['498', 'Bank SBI Indonesia'], ['152', 'Bank Shinhan'], ['153', 'Bank Sinarmas'], ['622', 'Bank Sleman'], ['213', 'Bank SMBC'], ['126', 'Bank Sulselbar'], ['127', 'Bank Sulutgo'], ['120', 'Bank Sumselbabel'], ['117', 'Bank Sumut'], ['451', 'Bank Syariah Indonesia'], ['023', 'Bank UOB Indonesia'], ['566', 'Bank Victoria'], ['405', 'Bank Victoria Syariah'], ['212', 'Bank Woori Saudara'], ['945', 'IBK Bank Indonesia'], ['459', 'Krom Bank'], ['042', 'MUFG Bank'], ['517', 'Panin Dubai Syariah Bank'], ['520', 'Prima Master Bank'], ['050', 'Standard Chartered Bank'],
];

const SHEET_SCHEMAS = {
  Users: ['UserID', 'Username', 'DisplayName', 'Role', 'PinHash', 'Active', 'CreatedAt', 'UpdatedAt'],
  Accounts: ['AccountID', 'Name', 'Type', 'Provider', 'Owner', 'Purpose', 'Status', 'Notes', 'CreatedAt', 'UpdatedAt', 'BankCode', 'AccountNumber', 'AccountDisplay', 'AccountHolder'],
  Income: ['IncomeID', 'TransactionDate', 'BookDate', 'IncomeType', 'CashFlowClass', 'Amount', 'Payer', 'AccountID', 'Description', 'GoalID', 'Status', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'OperatingIncome'],
  Expenses: ['ExpenseID', 'TransactionDate', 'BookDate', 'Payer', 'PaymentMethod', 'AccountID', 'ExpenseType', 'BudgetCategoryID', 'BudgetCategory', 'BudgetItem', 'Amount', 'CashAmount', 'Merchant', 'Notes', 'Status', 'ReceiptFileID', 'OCRStatus', 'ShoppingID', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'BudgetID', 'RelatedModule', 'RelatedRecordID', 'DetailsJSON'],
  ExpenseItems: ['ExpenseItemID', 'ExpenseID', 'ItemName', 'Quantity', 'Unit', 'UnitPrice', 'LineAmount', 'InventoryItemID', 'AccountingEffect', 'Notes', 'CreatedAt'],
  Transfers: ['TransferID', 'TransactionDate', 'BookDate', 'SourceAccountID', 'DestinationAccountID', 'Amount', 'Notes', 'Status', 'CreatedBy', 'CreatedAt', 'ExpenseID', 'Origin', 'BudgetID', 'BudgetCategoryID', 'ExecutionStatus', 'PlannedDate', 'CompletedAt', 'RelatedPlannedTransferID'],
  CashMovements: ['CashID', 'TransactionDate', 'MovementType', 'Amount', 'SourceAccountID', 'ExpenseID', 'Notes', 'Status', 'CreatedBy', 'CreatedAt', 'Origin', 'BudgetID', 'BudgetCategoryID', 'ExecutionStatus', 'PlannedDate', 'CompletedAt', 'RelatedPlannedCashID'],
  AccountBalances: ['BalanceID', 'AccountID', 'AsOfDate', 'SystemBalance', 'ActualBalance', 'Difference', 'Status', 'Notes', 'CreatedBy', 'CreatedAt'],
  Assets: ['AssetID', 'Name', 'Owner', 'AssetType', 'ReportingCategory', 'AcquisitionDate', 'AcquisitionValue', 'Status', 'Notes', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'ExpenseID'],
  AssetTypes: ['AssetTypeID', 'Name', 'Class', 'ReportingCategory', 'DepreciationMethod', 'Rate', 'UsefulLifeYears', 'Active', 'Notes'],
  AssetAdjustments: ['AdjustmentID', 'AssetID', 'AdjustmentDate', 'AdjustmentType', 'Amount', 'Notes', 'CreatedBy', 'CreatedAt'],
  Debts: ['DebtID', 'Name', 'DebtType', 'Creditor', 'StartDate', 'InitialPrincipal', 'RemainingPrincipal', 'TenorMonths', 'MonthlyPayment', 'Status', 'Notes', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'ScheduleSource', 'LastSchedulePeriod'],
  DebtPayments: ['DebtPaymentID', 'DebtID', 'PaymentDate', 'Amount', 'PrincipalAmount', 'InterestAmount', 'ExpenseID', 'Notes', 'CreatedBy', 'CreatedAt'],
  DebtSchedule: ['ScheduleID', 'DebtID', 'PeriodNo', 'DueDate', 'OpeningPrincipal', 'PrincipalAmount', 'MarginAmount', 'Installment', 'ClosingPrincipal', 'Source', 'CreatedAt'],
  BudgetPolicies: ['PolicyID', 'Name', 'EffectiveFrom', 'EffectiveTo', 'Status', 'NeedsPct', 'WantsPct', 'SavingsPct', 'CreatedBy', 'CreatedAt', 'SubmittedBy', 'SubmittedAt', 'PartnerScoreSubmittedAt', 'ConfirmedAyahAt', 'ConfirmedBundaAt', 'FinalApprovedAt', 'ApprovedAyahAt', 'ApprovedBundaAt', 'LockedAt', 'AmendmentOfPolicyID', 'ReplacesPolicyID', 'PreviousStatus', 'VoidedBy', 'VoidedAt', 'RestoredPolicyID', 'RestoredAt', 'ReplacedByPolicyID', 'EditRequestedBy', 'EditRequestedAt', 'EditReviewedBy', 'EditReviewedAt', 'EditRequestNote', 'Notes'],
  BudgetRules: ['RuleID', 'PolicyID', 'Category', 'BudgetType', 'Constraint', 'Percentage', 'FixedAmount', 'Priority', 'Status', 'Notes', 'BudgetCode', 'ParentRuleID', 'Level', 'SortOrder', 'Active'],
  BudgetCategories: ['CategoryID', 'PolicyID', 'ParentCategoryID', 'Name', 'Level', 'ImportanceAyah', 'ImportanceBunda', 'UrgencyAyah', 'UrgencyBunda', 'ImportanceScore', 'UrgencyScore', 'Quadrant', 'SortOrder', 'Active', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'ImportanceAyahAt', 'ImportanceBundaAt', 'UrgencyAyahAt', 'UrgencyBundaAt', 'Notes'],
  BudgetPolicyAllocations: ['AllocationID', 'PolicyID', 'CategoryID', 'Quadrant', 'ParentAllocationID', 'Level', 'WeightPct', 'Amount', 'BasisIncome', 'Period', 'Active', 'CreatedAt', 'UpdatedAt'],
  Budgets: ['BudgetID', 'Period', 'PolicyID', 'CategoryID', 'Category', 'Item', 'SourceType', 'SourceID', 'BudgetType', 'Constraint', 'Amount', 'Percentage', 'SourceAccountID', 'DestinationAccountID', 'PaymentMethod', 'AllocationMethod', 'Status', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'BudgetCode', 'ParentBudgetID', 'Level', 'SortOrder', 'BudgetAmount', 'BudgetPercentage', 'PlannedAmount', 'PlannedPercentage', 'AllocatedAmount', 'AllocatedPercentage', 'AllocationDate', 'OverAllocationReason', 'PaidAmount', 'PaidPercentage', 'DestinationAccountName', 'Notes'],
  FinancialGoals: ['GoalID', 'Name', 'GoalType', 'TargetAmount', 'CurrentValue', 'Deadline', 'MonthlyContribution', 'Priority', 'Status', 'FundingStrategy', 'BudgetParentCategoryID', 'BudgetParentCategoryPath', 'BudgetCategoryID', 'Notes', 'CreatedBy', 'CreatedAt', 'UpdatedAt'],
  GoalAllocations: ['AllocationID', 'GoalID', 'AllocationPeriod', 'BudgetID', 'Amount', 'SourceType', 'Status', 'CreatedAt'],
  Investments: ['InvestmentID', 'InvestmentName', 'TickerSymbol', 'MarketSource', 'PurposeGoalID', 'Purpose', 'ChildPurposesJSON', 'Instrument', 'Provider', 'AccountID', 'Quantity', 'LotCount', 'GoldWeightGram', 'GoldPricePerGram', 'BondNominal', 'BondPricePct', 'CostBasis', 'CurrentPrice', 'CurrentValue', 'AsOfDate', 'Status', 'Notes', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'ExpenseID'],
  InvestmentTransactions: ['InvestmentTransactionID', 'InvestmentID', 'TransactionDate', 'TransactionType', 'Quantity', 'Price', 'Amount', 'Fee', 'Notes', 'CreatedBy', 'CreatedAt'],
  InvestmentSnapshots: ['SnapshotID', 'InvestmentID', 'AsOfDate', 'Quantity', 'Price', 'MarketValue', 'Notes', 'CreatedBy', 'CreatedAt'],
  InventoryItems: ['ItemID', 'Name', 'Category', 'Unit', 'MinimumStock', 'AvailableStock', 'Active', 'Notes', 'CreatedAt', 'UpdatedAt'],
  InventoryMovements: ['MovementID', 'ItemID', 'MovementDate', 'MovementType', 'Quantity', 'UnitCost', 'ExpenseID', 'Notes', 'CreatedBy', 'CreatedAt'],
  GoldPriceHistory: ['GoldPriceID', 'PriceDate', 'Source', 'ProductWeightGram', 'BasePrice', 'TaxPrice', 'PricePerGram', 'CapturedAt', 'Status', 'Notes'],
  ShoppingList: ['ShoppingID', 'ItemName', 'InventoryItemID', 'PurchaseClass', 'EstimatedAmount', 'ActualAmount', 'Quantity', 'Unit', 'Priority', 'SystemScore', 'FamilyPriority', 'FundingGoalID', 'BudgetID', 'BudgetCategory', 'PaymentMethod', 'PaymentAccountID', 'CashAmount', 'Status', 'PurchasedDate', 'ExpenseID', 'Notes', 'CreatedBy', 'CreatedAt', 'UpdatedAt'],
  Attachments: ['AttachmentID', 'EntityType', 'EntityID', 'FileID', 'FileName', 'MimeType', 'DriveUrl', 'CreatedBy', 'CreatedAt'],
  OCRDrafts: ['DraftID', 'ModuleKey', 'SourceFileID', 'SourceFileName', 'OCRText', 'ParsedJSON', 'Status', 'CreatedBy', 'CreatedAt', 'UpdatedAt'],
  AuditLog: ['LogID', 'Timestamp', 'UserID', 'Module', 'EntityID', 'Action', 'BeforeJSON', 'AfterJSON', 'Notes'],
  Settings: ['Key', 'Value', 'Notes', 'UpdatedAt'],
};

const MODULE_CONFIG = {
  dashboard: { label: 'Dashboard', sheet: null },
  accounts: { label: 'Rekening', sheet: 'Accounts' },
  income: { label: 'Penerimaan', sheet: 'Income' },
  expenses: { label: 'Pengeluaran', sheet: 'Expenses' },
  transfers: { label: 'Transfer', sheet: 'Transfers' },
  cash: { label: 'Kas', sheet: 'CashMovements' },
  goals: { label: 'Rencana Keuangan', sheet: 'FinancialGoals' },
  budget: { label: 'Anggaran', sheet: 'Budgets' },
  inventory: { label: 'Persediaan', sheet: 'InventoryItems' },
  shopping: { label: 'Daftar Belanja', sheet: 'ShoppingList' },
  assets: { label: 'Aset', sheet: 'Assets' },
  debts: { label: 'Utang', sheet: 'Debts' },
  investments: { label: 'Investasi', sheet: 'Investments' },
  savings: { label: 'Tabungan', sheet: 'AccountBalances' },
  policy: { label: 'Kebijakan Anggaran', sheet: 'BudgetPolicies' },
  budgetCategory: { label: 'Kategori Anggaran', sheet: 'BudgetCategories' },
  audit: { label: 'Audit Log', sheet: 'AuditLog' },
  about: { label: 'Tentang Aplikasi', sheet: null },
  voidArchive: { label: 'Arsip Void', sheet: null },
};

// Pilihan default berasal dari daftar LAZ/rekomendasi yang dipublikasikan Kemenag/BAZNAS.
// Daftar ini bersifat katalog UI; verifikasi izin dan rekening tujuan tetap dilakukan sebelum penyaluran.
const ZAKAT_INFAQ_PROVIDERS = [
  ['BAZNAS', 'BAZNAS'],
  ['BAZNAS_PROVINSI', 'BAZNAS Provinsi/Kabupaten/Kota'],
  ['DOMPET_DHUAFA', 'LAZ Dompet Dhuafa Republika'],
  ['RUMAH_ZAKAT', 'LAZ Rumah Zakat Indonesia'],
  ['DT_PEDULI', 'LAZ Daarut Tauhid Peduli'],
  ['BMH', 'LAZ Baitul Maal Hidayatullah'],
  ['IZI', 'LAZ Inisiatif Zakat Indonesia'],
  ['LAZISMU', 'LAZ Muhammadiyah (LAZISMU)'],
  ['LAZISNU', 'LAZIS NU'],
  ['NURUL_HAYAT', 'LAZ Nurul Hayat'],
  ['AL_AZHAR_PEDULI', 'LAZ Pesantren Islam Al-Azhar'],
  ['YATIM_MANDIRI', 'LAZ Yatim Mandiri'],
  ['DANA_SOSIAL_AL_FALAH', 'LAZ Dana Sosial Al Falah'],
  ['AL_IRSYAD', 'LAZ Al Irsyad Al Islamiyyah'],
  ['BAITULMAAL_MUAMALAT', 'LAZ Baitulmaal Muamalat'],
  ['OTHER', 'Other']
];

const CAPACITY_THRESHOLDS = { warningPercent: 50, criticalPercent: 70, hardPercent: 90 };
