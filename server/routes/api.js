const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { PDFParse } = require('pdf-parse');

const db = require('../db');
const { clubPrLines } = require('../engine/clubbingEngine');
const { runDecisionEngine } = require('../engine/decisionEngine');
const { getSupplierRanking, exportPreferredSuppliersCsv } = require('../engine/supplierRanker');
const policyManager = require('../policy/policyManager');
const intakeAssistant = require('../chat/intakeAssistant');

const upload = multer({ storage: multer.memoryStorage() });

// ----------------------------------------------------
// 1. Batch Processing & Exports (Must-Have 4 & 7)
// ----------------------------------------------------
router.post('/process-batch', upload.single('file'), (req, res) => {
  try {
    let csvContent = '';
    if (req.file) {
      csvContent = req.file.buffer.toString('utf8');
    } else if (req.body && req.body.csv) {
      csvContent = req.body.csv;
    } else if (typeof req.body === 'string' && req.body.includes('pr_no')) {
      csvContent = req.body;
    } else {
      // Default to sample PR batch in data if no body provided
      const defaultPath = require('path').join(db.baseDir, 'pr_batches', 'sample_pr_batch.csv');
      if (require('fs').existsSync(defaultPath)) {
        csvContent = require('fs').readFileSync(defaultPath, 'utf8');
      } else {
        return res.status(400).json({ error: 'No CSV file or data provided' });
      }
    }

    const prRecords = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    // Run Clubbing Engine
    const { requirements } = clubPrLines(prRecords);

    // Run Decision Engine against active policy
    const policyVersion = req.query.policy_version || null;
    const policy = policyVersion ? policyManager.getPolicyByVersion(policyVersion) : null;
    const { requirements: decidedReqs, outputRows } = runDecisionEngine(requirements, policy);

    // Save in DB state for workspace and exports
    db.requirements = decidedReqs;
    db.batchResults = outputRows;

    db.addAuditLog({
      action: 'BATCH_PROCESSED',
      entity_type: 'BATCH',
      entity_id: `BATCH-${Date.now()}`,
      details: `Processed batch of ${prRecords.length} PR lines into ${decidedReqs.length} requirements under policy ${policy ? policy.version : db.activePolicyVersion}.`
    });

    const routeCounts = {};
    const decisionCounts = { PO: 0, SOURCING_REQUEST: 0 };
    outputRows.forEach(r => {
      routeCounts[r.route] = (routeCounts[r.route] || 0) + 1;
      decisionCounts[r.decision] = (decisionCounts[r.decision] || 0) + 1;
    });

    return res.json({
      success: true,
      total_lines: outputRows.length,
      total_requirements: decidedReqs.length,
      active_policy_version: policy ? policy.version : db.activePolicyVersion,
      route_breakdown: routeCounts,
      decision_breakdown: decisionCounts,
      outputRows: outputRows.slice(0, 50), // preview
      fullCount: outputRows.length
    });
  } catch (err) {
    console.error('Batch process error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Download decisions CSV matching Section 4 format
router.get('/export-decisions', (req, res) => {
  try {
    const rows = db.batchResults;
    if (!rows || rows.length === 0) {
      // If batch has not been processed yet, run sample batch automatically
      const defaultPath = require('path').join(db.baseDir, 'pr_batches', 'sample_pr_batch.csv');
      const csvContent = require('fs').readFileSync(defaultPath, 'utf8');
      const prRecords = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });
      const { requirements } = clubPrLines(prRecords);
      const { outputRows } = runDecisionEngine(requirements);
      db.batchResults = outputRows;
    }

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

    const formattedData = db.batchResults.map(r => ({
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

    const csvOutput = stringify(formattedData, { header: true, columns });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="decisions_export.csv"');
    return res.send(csvOutput);
  } catch (err) {
    console.error('Export decisions error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 2. Preferred Suppliers (Must-Have 5)
// ----------------------------------------------------
router.get('/preferred-suppliers', (req, res) => {
  try {
    const asOf = req.query.as_of || '2026-11-01';
    const itemCode = req.query.item_code || null;

    if (itemCode) {
      const ranking = getSupplierRanking(itemCode, asOf);
      return res.json(ranking);
    }

    // Return summary for all items
    const allRankings = db.items.map(it => {
      const r = getSupplierRanking(it.item_code, asOf);
      return {
        item_code: it.item_code,
        description: it.description,
        category: it.category,
        item_type: it.item_type,
        top_supplier: r.top_supplier,
        preferred_count: r.preferred_suppliers.length
      };
    });

    return res.json({ as_of: asOf, items: allRankings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/export-preferred-suppliers', (req, res) => {
  try {
    const asOf = req.query.as_of || '2026-11-01';
    const csvContent = exportPreferredSuppliersCsv(asOf);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="preferred_suppliers_${asOf}.csv"`);
    return res.send(csvContent);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 3. Buyer Workspace & Requirements (Must-Have 6)
// ----------------------------------------------------
router.get('/requirements', (req, res) => {
  try {
    if (!db.requirements || db.requirements.length === 0) {
      // Auto run on sample batch
      const defaultPath = require('path').join(db.baseDir, 'pr_batches', 'sample_pr_batch.csv');
      const csvContent = require('fs').readFileSync(defaultPath, 'utf8');
      const prRecords = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });
      const { requirements } = clubPrLines(prRecords);
      const { requirements: decidedReqs, outputRows } = runDecisionEngine(requirements);
      db.requirements = decidedReqs;
      db.batchResults = outputRows;
    }

    const data = db.requirements.map(dr => {
      return {
        group_id: dr.group_id,
        requirement_date: dr.req.requirement_date,
        plant: dr.req.plant,
        resolved_item_code: dr.req.resolved_item_code,
        item_description: dr.req.lines[0]?.description || (dr.req.item?.description) || '',
        total_quantity: dr.req.total_quantity,
        uom: dr.req.lines[0]?.uom || 'NOS',
        is_emergency: dr.req.is_emergency,
        line_count: dr.req.lines.length,
        lines: dr.req.lines.map(l => ({
          pr_no: l.pr_no,
          pr_line: l.pr_line,
          created_at: l.created_at,
          need_by_date: l.need_by_date,
          quantity: l.qty,
          department: l.department,
          requester: l.requester
        })),
        decision: dr.decision,
        route: dr.route,
        po_id: dr.po_id || '',
        supplier_id: dr.supplier_id || '',
        supplier_name: dr.supplier_id ? (db.suppMap[dr.supplier_id]?.name || dr.supplier_id) : '',
        unit_price: dr.unit_price,
        group_value_inr: dr.group_value_inr,
        suggested_supplier_ids: dr.suggested_supplier_ids || '',
        policy_version: dr.policy_version,
        reason: dr.reason,
        status: dr.status || 'PENDING_APPROVAL', // PENDING_APPROVAL, APPROVED, OVERRIDDEN
        override_comment: dr.override_comment || null,
        acted_by: dr.acted_by || null,
        acted_at: dr.acted_at || null
      };
    });

    return res.json({
      total: data.length,
      requirements: data
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Approve requirement
router.post('/requirements/:id/approve', (req, res) => {
  try {
    const { id } = req.params;
    const reqItem = db.requirements.find(r => r.group_id === id);
    if (!reqItem) {
      return res.status(404).json({ error: `Requirement ${id} not found` });
    }

    reqItem.status = 'APPROVED';
    reqItem.acted_by = req.body.user || 'Buyer';
    reqItem.acted_at = new Date().toISOString();

    db.addAuditLog({
      action: 'REQUIREMENT_APPROVED',
      entity_type: 'REQUIREMENT',
      entity_id: id,
      user: reqItem.acted_by,
      details: `Approved requirement ${id} (${reqItem.decision} via ${reqItem.route}). PO/Event ID: ${reqItem.po_id || 'SOURCING'}`
    });

    return res.json({ success: true, requirement: reqItem });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Override requirement
router.post('/requirements/:id/override', (req, res) => {
  try {
    const { id } = req.params;
    const { new_route, new_supplier_id, new_decision, comment, user } = req.body;

    if (!comment || comment.trim() === '') {
      return res.status(400).json({ error: 'A written comment/reason is mandatory for override (Policy 8.1)' });
    }

    const reqItem = db.requirements.find(r => r.group_id === id);
    if (!reqItem) {
      return res.status(404).json({ error: `Requirement ${id} not found` });
    }

    const prevRoute = reqItem.route;
    const prevSupplier = reqItem.supplier_id;

    reqItem.status = 'OVERRIDDEN';
    if (new_route) reqItem.route = new_route;
    if (new_decision) reqItem.decision = new_decision;
    if (new_supplier_id !== undefined) reqItem.supplier_id = new_supplier_id;
    reqItem.override_comment = comment;
    reqItem.acted_by = user || 'Senior Buyer';
    reqItem.acted_at = new Date().toISOString();
    reqItem.reason = `OVERRIDDEN by buyer: ${comment} (Original: ${reqItem.reason})`;

    db.addAuditLog({
      action: 'REQUIREMENT_OVERRIDDEN',
      entity_type: 'REQUIREMENT',
      entity_id: id,
      user: reqItem.acted_by,
      comment,
      details: `Route changed from ${prevRoute} (supp: ${prevSupplier}) to ${reqItem.route} (supp: ${reqItem.supplier_id}).`
    });

    return res.json({ success: true, requirement: reqItem });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 4. Policy as Data (Must-Have 3)
// ----------------------------------------------------
router.get('/policies', (req, res) => {
  return res.json({
    active_version: db.activePolicyVersion,
    policies: policyManager.getAllPolicies()
  });
});

router.post('/policies/propose-amendment', upload.single('file'), async (req, res) => {
  try {
    let amendmentText = '';
    if (req.file) {
      const pdfParser = new PDFParse(new Uint8Array(req.file.buffer));
      await pdfParser.load();
      const textData = await pdfParser.getText();
      amendmentText = textData.pages ? textData.pages.map(p => p.text).join('\n') : JSON.stringify(textData);
      pdfParser.destroy();
    } else if (req.body && req.body.text) {
      amendmentText = req.body.text;
    } else {
      return res.status(400).json({ error: 'No amendment text or document provided' });
    }

    const { version, effective_date } = req.body;
    const analysis = policyManager.parseAmendmentText(amendmentText, version, effective_date);

    // Save as draft
    policyManager.saveDraftPolicy(analysis.draftPolicy);

    return res.json({
      success: true,
      draftPolicy: analysis.draftPolicy,
      diffs: analysis.diffs,
      plainLanguageSummary: analysis.plainLanguageSummary
    });
  } catch (err) {
    console.error('Amendment proposal error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/policies/:version/activate', (req, res) => {
  try {
    const { version } = req.params;
    const activated = policyManager.activatePolicy(version);
    return res.json({ success: true, policy: activated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 5. Contracts Management (Must-Have 8)
// ----------------------------------------------------
router.get('/contracts', (req, res) => {
  const result = db.contracts.map(c => {
    const lines = db.contractLines.filter(cl => cl.contract_id === c.contract_id);
    const cap = parseFloat(c.value_cap) || 0;
    const consumed = parseFloat(c.consumed_value) || 0;
    const remaining = Math.max(0, cap - consumed);
    const utilPct = cap > 0 ? Math.round((consumed / cap) * 100) : 0;

    return {
      ...c,
      lines_count: lines.length,
      lines,
      value_cap_formatted: `₹${cap.toLocaleString('en-IN')}`,
      consumed_formatted: `₹${consumed.toLocaleString('en-IN')}`,
      remaining_formatted: `₹${remaining.toLocaleString('en-IN')}`,
      utilization_pct: utilPct
    };
  });

  return res.json(result);
});

router.post('/contracts/upload-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    const pdfParser = new PDFParse(new Uint8Array(req.file.buffer));
    await pdfParser.load();
    const textData = await pdfParser.getText();
    const fullText = textData.pages ? textData.pages.map(p => p.text).join('\n') : JSON.stringify(textData);
    pdfParser.destroy();

    // Extract contract metadata from PDF text
    const noMatch = fullText.match(/Contract\s+No\.?\s*([A-Z0-9\-]+)/i);
    const contractId = noMatch ? noMatch[1] : `RC-2026-${Date.now().toString().slice(-3)}`;

    const suppMatch = fullText.match(/Supplier\s+ID\s+([A-Z0-9]+)/i);
    const supplierId = suppMatch ? suppMatch[1] : 'S001';

    const suppNameMatch = fullText.match(/and\s+([^,]+),\s*[A-Za-z\s]+\s*\(\"the Supplier\"\)/i) || fullText.match(/For\s+([^\n\r]+)\s+Authorised Signatory/i);
    const supplierName = suppNameMatch ? suppNameMatch[1].trim() : (db.suppMap[supplierId]?.name || 'Supplier');

    const termMatch = fullText.match(/valid from\s*(\d{4}-\d{2}-\d{2})\s*to\s*(\d{4}-\d{2}-\d{2})/i);
    const startDate = termMatch ? termMatch[1] : '2026-11-01';
    const endDate = termMatch ? termMatch[2] : '2027-10-31';

    const capMatch = fullText.match(/not exceed INR\s*([0-9,]+)/i);
    const valueCap = capMatch ? capMatch[1].replace(/,/g, '') : '2000000';

    // Extract lines table
    const lines = [];
    const itemRegex = /(ITM-\d{4})\s+([^\t\n\r]+?)\s+(NOS|KG|MTR|LTR|PAIR|CYL|JOB|SET|ROL|BRL|BKT|REAM|MON|QTR)\s+([0-9,]+\.?[0-9]*)/g;
    let match;
    while ((match = itemRegex.exec(fullText)) !== null) {
      lines.push({
        contract_id: contractId,
        item_code: match[1],
        description: match[2].trim(),
        uom: match[3],
        rate: match[4].replace(/,/g, '')
      });
    }

    db.addOrUpdateContract({
      contract_id: contractId,
      supplier_id: supplierId,
      supplier_name: supplierName,
      start_date: startDate,
      end_date: endDate,
      value_cap: valueCap,
      consumed_value: '0',
      source: `Uploaded PDF (${req.file.originalname})`
    }, lines);

    db.addAuditLog({
      action: 'CONTRACT_UPLOADED',
      entity_type: 'CONTRACT',
      entity_id: contractId,
      details: `Extracted contract ${contractId} with ${supplierName} (${supplierId}), cap ₹${Number(valueCap).toLocaleString('en-IN')}, ${lines.length} lines.`
    });

    return res.json({
      success: true,
      contract_id: contractId,
      supplier_id: supplierId,
      supplier_name: supplierName,
      start_date: startDate,
      end_date: endDate,
      value_cap: valueCap,
      lines_count: lines.length,
      lines
    });
  } catch (err) {
    console.error('Contract upload error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 6. Chat Intake (Must-Have 2)
// ----------------------------------------------------
router.post('/chat/intake', (req, res) => {
  try {
    const { session_id, message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const result = intakeAssistant.processMessage(session_id || 'default', message);
    return res.json(result);
  } catch (err) {
    console.error('Chat intake error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 7. Master Data & Audit Logs
// ----------------------------------------------------
router.get('/master-data', (req, res) => {
  return res.json({
    items_count: db.items.length,
    suppliers_count: db.suppliers.length,
    contracts_count: db.contracts.length,
    po_history_count: db.poHistory.length,
    items: db.items,
    suppliers: db.suppliers,
    plants: db.plants
  });
});

router.get('/audit-logs', (req, res) => {
  return res.json(db.auditLogs);
});

module.exports = router;
