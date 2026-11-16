const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const db = require('../server/db');
const { clubPrLines } = require('../server/engine/clubbingEngine');
const { runDecisionEngine } = require('../server/engine/decisionEngine');
const { exportPreferredSuppliersCsv } = require('../server/engine/supplierRanker');

const submissionDir = path.resolve(__dirname, '../submission');
if (!fs.existsSync(submissionDir)) {
  fs.mkdirSync(submissionDir, { recursive: true });
}

// 1. Run 1 Decisions under Policy v5.0
const defaultBatchPath = path.join(db.baseDir, 'pr_batches', 'sample_pr_batch.csv');
const csvContent = fs.readFileSync(defaultBatchPath, 'utf8');
const prRecords = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

const { requirements } = clubPrLines(prRecords);
const { outputRows } = runDecisionEngine(requirements);

const columns = [
  'pr_no',
  'pr_line',
  'resolved_item_code',
  'group_id',
  'po_id',
  'decision',
  'route',
  'supplier_id',
  'unit_price',
  'group_value_inr',
  'suggested_supplier_ids',
  'policy_version',
  'reason'
];

const formattedData = outputRows.map(r => ({
  pr_no: r.pr_no,
  pr_line: r.pr_line,
  resolved_item_code: r.resolved_item_code,
  group_id: r.group_id,
  po_id: r.po_id || '',
  decision: r.decision,
  route: r.route,
  supplier_id: r.supplier_id || '',
  unit_price: r.unit_price,
  group_value_inr: r.group_value_inr,
  suggested_supplier_ids: r.suggested_supplier_ids || '',
  policy_version: r.policy_version,
  reason: r.reason
}));

const run1Csv = stringify(formattedData, { header: true, columns });
fs.writeFileSync(path.join(submissionDir, 'run1_decisions_v5.0.csv'), run1Csv, 'utf8');
console.log('Generated submission/run1_decisions_v5.0.csv (rows:', formattedData.length, ')');

// 2. Preferred Supplier Ranking as of 2026-11-01
const prefCsv = exportPreferredSuppliersCsv('2026-11-01');
fs.writeFileSync(path.join(submissionDir, 'preferred_suppliers_2026-11-01.csv'), prefCsv, 'utf8');
console.log('Generated submission/preferred_suppliers_2026-11-01.csv');

// 3. Placeholder / Template for Run 2 Decisions
fs.writeFileSync(path.join(submissionDir, 'run2_decisions_amended.csv'), run1Csv, 'utf8');
console.log('Initialized submission/run2_decisions_amended.csv');
