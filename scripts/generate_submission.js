const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../server/db');
const { clubPrLines } = require('../server/engine/clubbingEngine');
const { runDecisionEngine } = require('../server/engine/decisionEngine');
const policyManager = require('../server/policy/policyManager');
const { exportPreferredSuppliersCsv } = require('../server/engine/supplierRanker');

const rootDir = path.resolve(__dirname, '..');
const submissionDir = path.resolve(rootDir, 'submission');
if (!fs.existsSync(submissionDir)) {
  fs.mkdirSync(submissionDir, { recursive: true });
}

// 1. Read hidden PR batch
const hiddenBatchPath = path.resolve(rootDir, 'data', 'pr_batches', 'hidden_pr_batch.csv');
const rawCsv = fs.readFileSync(hiddenBatchPath, 'utf8');
const prRecords = parse(rawCsv, { columns: true, skip_empty_lines: true, trim: true });
console.log(`[Submission] Loaded ${prRecords.length} PR lines from hidden_pr_batch.csv`);

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

function formatOutputRow(r) {
  return {
    pr_no: r.pr_no,
    pr_line: r.pr_line,
    resolved_item_code: r.resolved_item_code,
    group_id: r.group_id,
    po_id: r.po_id || '',
    decision: r.decision,
    route: r.route,
    supplier_id: r.supplier_id || '',
    unit_price: r.unit_price !== '' && r.unit_price !== null && r.unit_price !== undefined ? Number(r.unit_price).toFixed(2) : '',
    group_value_inr: r.group_value_inr,
    suggested_supplier_ids: r.suggested_supplier_ids || '',
    policy_version: r.policy_version,
    reason: r.reason
  };
}

// -----------------------------------------------------------------------------
// RUN 1: Process under Policy v5.0
// -----------------------------------------------------------------------------
console.log('\n--- EXECUTING RUN 1 (Policy v5.0) ---');
db.loadPolicies();
const v5Policy = policyManager.getPolicyByVersion('v5.0');
const { requirements: reqsRun1 } = clubPrLines(prRecords);
const resRun1 = runDecisionEngine(reqsRun1, v5Policy);
const run1Rows = resRun1.outputRows.map(formatOutputRow);

const run1Csv = stringify(run1Rows, { header: true, columns });
const run1Path = path.resolve(submissionDir, 'harsh_vardhan__run1.csv');
fs.writeFileSync(run1Path, run1Csv, 'utf8');
console.log(`[Submission] Run 1 exported to: ${run1Path} (${run1Rows.length} rows)`);

// -----------------------------------------------------------------------------
// RUN 2: Process under Amendment v5.1
// -----------------------------------------------------------------------------
console.log('\n--- EXECUTING RUN 2 (Policy Amendment v5.1) ---');
const pdf = require('pdf-parse');
const amendmentPdfPath = path.resolve(rootDir, 'data', 'Corvo_Policy_Amendment_1_v5.1.pdf');
const pdfBuffer = fs.readFileSync(amendmentPdfPath);

pdf(pdfBuffer).then(pdfData => {
  const analysis = policyManager.parseAmendmentText(pdfData.text);
  console.log(`Parsed Amendment Version: ${analysis.draftPolicy.version}, Effective: ${analysis.draftPolicy.effective_date}`);
  console.log(`Diffs detected (${analysis.diffs.length}):`);
  analysis.diffs.forEach(d => console.log(`  - [${d.type}] ${d.target}: ${d.description}`));

  // Ingest & Approve amendment in policy store
  policyManager.saveDraftPolicy(analysis.draftPolicy);
  policyManager.activatePolicy(analysis.draftPolicy.version);

  // Reprocess batch
  const { requirements: reqsRun2 } = clubPrLines(prRecords);
  const resRun2 = runDecisionEngine(reqsRun2, null); // evaluates date-based active policy
  const run2Rows = resRun2.outputRows.map(formatOutputRow);

  const run2Csv = stringify(run2Rows, { header: true, columns });
  const run2Path = path.resolve(submissionDir, 'harsh_vardhan__run2.csv');
  fs.writeFileSync(run2Path, run2Csv, 'utf8');
  console.log(`[Submission] Run 2 exported to: ${run2Path} (${run2Rows.length} rows)`);

  // ---------------------------------------------------------------------------
  // PREFERRED SUPPLIERS as of 2026-12-01
  // ---------------------------------------------------------------------------
  console.log('\n--- EXPORTING PREFERRED SUPPLIERS (As of 2026-12-01) ---');
  const prefCsv = exportPreferredSuppliersCsv('2026-12-01');
  const prefPath = path.resolve(submissionDir, 'harsh_vardhan__preferred.csv');
  fs.writeFileSync(prefPath, prefCsv, 'utf8');
  const prefRowsCount = prefCsv.trim().split('\n').length - 1;
  console.log(`[Submission] Preferred suppliers exported to: ${prefPath} (${prefRowsCount} rows)`);

  console.log('\n======================================================');
  console.log('✅ ALL 3 SUBMISSION FILES GENERATED SUCCESSFULLY!');
  console.log('======================================================');
}).catch(err => {
  console.error('Error during generation:', err);
  process.exit(1);
});
