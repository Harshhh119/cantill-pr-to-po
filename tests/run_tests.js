const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const db = require('../server/db');
const { matchItem } = require('../server/engine/itemMatcher');
const { getSupplierRanking, getSuggestedSuppliers } = require('../server/engine/supplierRanker');
const { clubPrLines } = require('../server/engine/clubbingEngine');
const { runDecisionEngine } = require('../server/engine/decisionEngine');
const policyManager = require('../server/policy/policyManager');

console.log('====================================================');
console.log('🧪 RUNNING CORVO PR-TO-PO COMPREHENSIVE TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
  }
}

// ----------------------------------------------------
// TEST 1: Item Matching & Free Text Normalization
// ----------------------------------------------------
console.log('--- Test Suite 1: Item Matching ---');

runTest('Exact Code Lookup (ITM-1002)', () => {
  const res = matchItem('ITM-1002', '');
  assert.strictEqual(res.resolved_item_code, 'ITM-1002');
  assert.strictEqual(res.matched_by, 'CODE_EXACT');
});

runTest('Free text with abbreviation "brg 6308 ZZ for maintenance"', () => {
  const res = matchItem('', 'brg 6308 ZZ for maintenance');
  assert.strictEqual(res.resolved_item_code, 'ITM-1022');
});

runTest('Free text "hyd hose 1/2 inch 2 wire"', () => {
  const res = matchItem('', 'hyd hose 1/2 inch 2 wire');
  assert.strictEqual(res.resolved_item_code, 'ITM-1035');
});

runTest('Free text "eot crane 5 ton"', () => {
  const res = matchItem('', 'eot crane 5 ton');
  assert.strictEqual(res.resolved_item_code, 'ITM-1071');
});

runTest('Novel / Unknown item resolved as NEW without hallucinating', () => {
  const res = matchItem('', 'Drinking water purifier 50 LPH');
  assert.strictEqual(res.resolved_item_code, 'NEW');
});

// ----------------------------------------------------
// TEST 2: Preferred Supplier Ranking (Worked Examples p.5)
// ----------------------------------------------------
console.log('\n--- Test Suite 2: Preferred Supplier Ranking ---');

runTest('ITM-1048 Nitrile gloves ranking as of 2026-11-01', () => {
  const ranking = getSupplierRanking('ITM-1048', '2026-11-01');
  const pref = ranking.preferred_suppliers;
  assert.strictEqual(pref[0].supplier_id, 'S029', 'Rank 1 must be S029 (SafeGuard)');
  assert.strictEqual(pref[0].rank, 1);
  assert.strictEqual(pref[1].supplier_id, 'S030', 'Rank 2 must be S030 (Karam)');
  assert.strictEqual(pref[1].rank, 2);
  const excludedIds = ranking.excluded_suppliers.map(s => s.supplier_id);
  assert.ok(excludedIds.includes('S031'), 'S031 (Inactive) must be excluded');
});

runTest('ITM-1036 Pneumatic cylinder ranking as of 2026-11-01', () => {
  const ranking = getSupplierRanking('ITM-1036', '2026-11-01');
  const pref = ranking.preferred_suppliers;
  assert.strictEqual(pref[0].supplier_id, 'S023', 'Rank 1 must be S023 (Hydrax)');
  assert.strictEqual(pref[1].supplier_id, 'S022', 'Rank 2 must be S022 (Fluidline)');
  assert.strictEqual(pref[2].supplier_id, 'S024', 'Rank 3 must be S024 (Janatics)');
});

runTest('ITM-1016 MIG wire ranking as of 2026-11-01', () => {
  const ranking = getSupplierRanking('ITM-1016', '2026-11-01');
  const pref = ranking.preferred_suppliers;
  assert.strictEqual(pref[0].supplier_id, 'S009', 'Rank 1 must be S009 (Weldtech)');
  assert.strictEqual(pref[1].supplier_id, 'S010', 'Rank 2 must be S010 (Inox Gases)');
});

// ----------------------------------------------------
// TEST 3: Sourcing Suggestions (Category Top-up)
// ----------------------------------------------------
console.log('\n--- Test Suite 3: Sourcing Suggestions ---');

runTest('Example 3 (ITM-1022): Top 3 suggested suppliers', () => {
  const suggs = getSuggestedSuppliers('ITM-1022', 3, '2026-11-02');
  assert.deepStrictEqual(suggs, ['S014', 'S013', 'S016']);
});

runTest('Example 9 (ITM-1066): Top 3 suggested suppliers', () => {
  const suggs = getSuggestedSuppliers('ITM-1066', 3, '2026-11-05');
  assert.deepStrictEqual(suggs, ['S043', 'S044', 'S042']);
});

runTest('Example 10 (ITM-1006): Top 3 suggested suppliers', () => {
  const suggs = getSuggestedSuppliers('ITM-1006', 3, '2026-11-02');
  assert.deepStrictEqual(suggs, ['S003', 'S002', 'S005']);
});

runTest('Example 11 (ITM-1034): RFP 5 suggested suppliers (or max active)', () => {
  const suggs = getSuggestedSuppliers('ITM-1034', 5, '2026-11-04');
  assert.deepStrictEqual(suggs, ['S020', 'S017', 'S019', 'S018']);
});

runTest('Example 12 (ITM-1071): Capex 5 suggested suppliers', () => {
  const suggs = getSuggestedSuppliers('ITM-1071', 5, '2026-11-03');
  assert.deepStrictEqual(suggs, ['S045', 'S047', 'S020', 'S048', 'S046']);
});

// ----------------------------------------------------
// TEST 4: Full Decision Engine & 14 Worked Examples
// ----------------------------------------------------
console.log('\n--- Test Suite 4: 14 Worked Examples Verification ---');

const batchPath = path.join(db.baseDir, 'pr_batches', 'sample_pr_batch.csv');
const batchContent = fs.readFileSync(batchPath, 'utf8');
const prRecords = parse(batchContent, { columns: true, skip_empty_lines: true, trim: true });

const { requirements } = clubPrLines(prRecords);
const { decidedRequirements, outputRows } = runDecisionEngine(requirements);

function findRow(prNo, prLine = '1') {
  return outputRows.find(r => r.pr_no === prNo && String(r.pr_line) === String(prLine));
}

runTest('Example 1: Contract PO (PR-26-00019/1)', () => {
  const row = findRow('PR-26-00019');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'CONTRACT_PO');
  assert.strictEqual(row.supplier_id, 'S001');
  assert.strictEqual(row.group_value_inr, 137531);
});

runTest('Example 2: PDF-only contract (PR-26-00045/1)', () => {
  const row = findRow('PR-26-00045');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'CONTRACT_PO');
  assert.strictEqual(row.supplier_id, 'S021');
  assert.strictEqual(row.group_value_inr, 26829);
});

runTest('Example 3: Ceiling nearly used (PR-26-00004/1)', () => {
  const row = findRow('PR-26-00004');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'RFQ');
  assert.strictEqual(row.group_value_inr, 220256);
  assert.strictEqual(row.suggested_supplier_ids, 'S014;S013;S016');
});

runTest('Example 4: Two contracts for same item (PR-26-00034/1)', () => {
  const row = findRow('PR-26-00034');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'CONTRACT_PO');
  assert.strictEqual(row.supplier_id, 'S007');
  assert.strictEqual(row.group_value_inr, 32547);
});

runTest('Example 5: Split PRs clubbed into one (PR-26-00146/1)', () => {
  const row = findRow('PR-26-00146');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'SPOT_PO');
  assert.strictEqual(row.supplier_id, 'S024');
  assert.strictEqual(row.group_value_inr, 126472);
});

runTest('Example 6a: Not clubbed due to different plant PUN1 (PR-26-00106/1)', () => {
  const row = findRow('PR-26-00106');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'SPOT_PO');
  assert.strictEqual(row.supplier_id, 'S027');
  assert.strictEqual(row.group_value_inr, 156170);
});

runTest('Example 6b: Not clubbed due to different plant CHK1 (PR-26-00103/1)', () => {
  const row = findRow('PR-26-00103');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'SPOT_PO');
  assert.strictEqual(row.supplier_id, 'S027');
});

runTest('Example 7: Free-text item matched (PR-26-00088/1)', () => {
  const row = findRow('PR-26-00088');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'SPOT_PO');
  assert.strictEqual(row.supplier_id, 'S023');
  assert.strictEqual(row.group_value_inr, 97955);
});

runTest('Example 8: Emergency PO (PR-26-00059/1)', () => {
  const row = findRow('PR-26-00059');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'EMERGENCY_PO');
  assert.strictEqual(row.supplier_id, 'S014');
  assert.strictEqual(row.group_value_inr, 253184);
});

runTest('Example 9: RFQ above PO limit (PR-26-00089/1)', () => {
  const row = findRow('PR-26-00089');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'RFQ');
  assert.strictEqual(row.suggested_supplier_ids, 'S043;S044;S042');
});

runTest('Example 10: RFQ small but never bought (PR-26-00050/1)', () => {
  const row = findRow('PR-26-00050');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'RFQ');
  assert.strictEqual(row.group_value_inr, 80300);
  assert.strictEqual(row.suggested_supplier_ids, 'S003;S002;S005');
});

runTest('Example 11: RFP (PR-26-00100/1)', () => {
  const row = findRow('PR-26-00100');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'RFP');
  assert.strictEqual(row.group_value_inr, 2070780);
  assert.strictEqual(row.suggested_supplier_ids, 'S020;S017;S019;S018');
});

runTest('Example 12: Capex (PR-26-00047/1)', () => {
  const row = findRow('PR-26-00047');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'CAPEX_SOURCING');
  assert.strictEqual(row.group_value_inr, 6036704);
  assert.strictEqual(row.suggested_supplier_ids, 'S045;S047;S020;S048;S046');
});

runTest('Example 13: New item (PR-26-00170/1)', () => {
  const row = findRow('PR-26-00170');
  assert.ok(row, 'Row exists');
  assert.strictEqual(row.route, 'NEW_ITEM_SOURCING');
  assert.strictEqual(row.group_value_inr, 141100);
  assert.strictEqual(row.suggested_supplier_ids, '');
});

runTest('Example 14: Several requirements consolidated on one PO', () => {
  const r34 = findRow('PR-26-00034');
  const r31 = findRow('PR-26-00031');
  assert.ok(r34 && r31, 'Rows exist');
  assert.ok(r34.po_id && r31.po_id, 'PO IDs assigned');
  assert.strictEqual(r34.po_id, r31.po_id, 'Must share the same consolidated PO ID');
});

// ----------------------------------------------------
// TEST 5: Policy as Data Amendment Test
// ----------------------------------------------------
console.log('\n--- Test Suite 5: Policy as Data Dynamic Amendment ---');

runTest('Policy Amendment: Increase spot limit to 3,00,000 for plant CHK1', () => {
  const amendmentText = 'For plant CHK1, spot limit is 3,00,000 effective 2026-11-20';
  const analysis = policyManager.parseAmendmentText(amendmentText, 'v5.1', '2026-11-20');
  assert.strictEqual(analysis.draftPolicy.version, 'v5.1');
  assert.ok(analysis.diffs.length > 0, 'Must produce diffs');
  assert.ok(analysis.plainLanguageSummary.includes('CHK1'), 'Plain language summary must highlight plant CHK1');
});

console.log('\n====================================================');
console.log(`🏁 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
