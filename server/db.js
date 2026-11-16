const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

class Database {
  constructor() {
    this.baseDir = path.resolve(__dirname, '../data');
    this.items = [];
    this.itemMap = {};
    this.suppliers = [];
    this.suppMap = {};
    this.contracts = [];
    this.contractLines = [];
    this.poHistory = [];
    this.plants = [];
    this.policies = [];
    this.activePolicyVersion = 'v5.0';
    this.auditLogs = [];
    this.createdPRs = [];
    this.requirements = [];
    this.batchResults = [];

    this.init();
  }

  init() {
    this.loadMasterData();
    this.loadContracts();
    this.loadPolicies();
  }

  parseCsvFile(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
  }

  loadMasterData() {
    const itemPath = path.join(this.baseDir, 'master_data', 'item_master.csv');
    this.items = this.parseCsvFile(itemPath);
    this.itemMap = {};
    this.items.forEach(it => {
      this.itemMap[it.item_code] = it;
    });

    const suppPath = path.join(this.baseDir, 'master_data', 'supplier_master.csv');
    this.suppliers = this.parseCsvFile(suppPath);
    this.suppMap = {};
    this.suppliers.forEach(s => {
      this.suppMap[s.supplier_id] = s;
    });

    const poPath = path.join(this.baseDir, 'master_data', 'po_history.csv');
    this.poHistory = this.parseCsvFile(poPath);

    const plantPath = path.join(this.baseDir, 'master_data', 'plants.csv');
    this.plants = this.parseCsvFile(plantPath);

    console.log(`[DB] Master Data Loaded: ${this.items.length} items, ${this.suppliers.length} suppliers, ${this.poHistory.length} POs, ${this.plants.length} plants`);
  }

  loadContracts() {
    const regPath = path.join(this.baseDir, 'contracts', 'contract_register.csv');
    this.contracts = this.parseCsvFile(regPath);

    const linePath = path.join(this.baseDir, 'contracts', 'contract_lines.csv');
    this.contractLines = this.parseCsvFile(linePath);

    // Ingest the known PDF contracts signed after 31 Oct 2026:
    // RC-2026-031 (Pneumatic Point / S021, 2026-11-15 to 2027-11-14, cap 20,00,000)
    // RC-2026-033 (Infoline Systems / S035, 2026-11-20 to 2027-11-19, cap 50,00,000)
    this.addOrUpdateContract({
      contract_id: 'RC-2026-031',
      supplier_id: 'S021',
      supplier_name: 'Pneumatic Point',
      start_date: '2026-11-15',
      end_date: '2027-11-14',
      value_cap: '2000000',
      consumed_value: '0',
      source: 'PDF (RC-2026-031.pdf)'
    }, [
      { contract_id: 'RC-2026-031', item_code: 'ITM-1036', description: 'Pneumatic cylinder 50x100', uom: 'NOS', rate: '3537.76' },
      { contract_id: 'RC-2026-031', item_code: 'ITM-1037', description: 'Solenoid valve 5/2 1/4 inch', uom: 'NOS', rate: '2439.01' },
      { contract_id: 'RC-2026-031', item_code: 'ITM-1039', description: 'FRL unit 1/2 inch', uom: 'NOS', rate: '2746.87' }
    ]);

    this.addOrUpdateContract({
      contract_id: 'RC-2026-033',
      supplier_id: 'S035',
      supplier_name: 'Infoline Systems',
      start_date: '2026-11-20',
      end_date: '2027-11-19',
      value_cap: '5000000',
      consumed_value: '0',
      source: 'PDF (RC-2026-033.pdf)'
    }, [
      { contract_id: 'RC-2026-033', item_code: 'ITM-1056', description: 'Laptop i5 16GB 512GB', uom: 'NOS', rate: '64654.36' },
      { contract_id: 'RC-2026-033', item_code: 'ITM-1057', description: '24 inch monitor', uom: 'NOS', rate: '10689.51' }
    ]);

    console.log(`[DB] Contracts Loaded: ${this.contracts.length} contracts, ${this.contractLines.length} lines`);
  }

  addOrUpdateContract(contractMeta, lines = []) {
    const idx = this.contracts.findIndex(c => c.contract_id === contractMeta.contract_id);
    if (idx >= 0) {
      this.contracts[idx] = { ...this.contracts[idx], ...contractMeta };
    } else {
      this.contracts.push(contractMeta);
    }

    if (lines && lines.length > 0) {
      // remove old lines for this contract
      this.contractLines = this.contractLines.filter(l => l.contract_id !== contractMeta.contract_id);
      this.contractLines.push(...lines);
    }
  }

  loadPolicies() {
    const defaultPolPath = path.resolve(__dirname, 'data', 'defaultPolicy.json');
    if (fs.existsSync(defaultPolPath)) {
      const defaultPol = JSON.parse(fs.readFileSync(defaultPolPath, 'utf8'));
      this.policies = [defaultPol];
      this.activePolicyVersion = defaultPol.version;
    }
    console.log(`[DB] Policies Initialized. Active: ${this.activePolicyVersion}`);
  }

  getActivePolicy(dateStr = null) {
    if (!dateStr) {
      return this.policies.find(p => p.version === this.activePolicyVersion) || this.policies[0];
    }
    // Find active policy where effective_date <= dateStr, sorted by effective_date desc
    const applicable = this.policies
      .filter(p => p.status === 'active' && p.effective_date <= dateStr)
      .sort((a, b) => b.effective_date.localeCompare(a.effective_date));

    return applicable.length > 0 ? applicable[0] : (this.policies.find(p => p.version === this.activePolicyVersion) || this.policies[0]);
  }

  addAuditLog(entry) {
    const log = {
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      user: entry.user || 'Buyer (Procurement)',
      action: entry.action,
      entity_type: entry.entity_type || 'REQUIREMENT',
      entity_id: entry.entity_id,
      details: entry.details,
      comment: entry.comment || ''
    };
    this.auditLogs.unshift(log);
    return log;
  }
}

const db = new Database();
module.exports = db;
