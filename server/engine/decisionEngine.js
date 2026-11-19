const db = require('../db');
const { getSupplierRanking, getSuggestedSuppliers } = require('./supplierRanker');
const { valueRequirement, hasActivePurchaseIn365d, getMostRecentPoIn365d } = require('./valuationEngine');
const { consolidatePOs } = require('./consolidationEngine');

function runDecisionEngine(requirements, policyOverride = null) {
  // Sort requirements in order of requirement date (first_created)
  const sortedReqs = [...requirements].sort((a, b) => a.first_created - b.first_created);

  // Initialize fresh contract ceiling state for this run
  const contractState = {};
  db.contracts.forEach(c => {
    contractState[c.contract_id] = {
      ...c,
      valCap: parseFloat(c.value_cap) || 0,
      consumed: parseFloat(c.consumed_value) || 0
    };
  });

  const decidedRequirements = [];

  for (const req of sortedReqs) {
    const policy = policyOverride || db.getActivePolicy(req.requirement_date);
    const itemCode = req.resolved_item_code;
    const reqDateStr = req.requirement_date;
    const reqDate = req.first_created;
    const totalQty = req.total_quantity;

    // 1. Handle NEW items (Clause 1.2)
    if (itemCode === 'NEW') {
      const val = valueRequirement(req, [], null);
      decidedRequirements.push({
        req,
        group_id: req.group_id,
        decision: 'SOURCING_REQUEST',
        route: 'NEW_ITEM_SOURCING',
        supplier_id: '',
        unit_price: val.unit_price,
        group_value_inr: val.group_value_inr,
        suggested_supplier_ids: '',
        policy_version: policy.version,
        reason: 'Clause 1.2: New item not in item master'
      });
      continue;
    }

    const item = db.itemMap[itemCode];
    const itemType = item ? item.item_type : '';
    const itemCategory = item ? item.category : '';

    // 2. Check Rule 5.1: Capex items check FIRST (Policy 5.1)
    if (itemType === 'Capex') {
      const val = valueRequirement(req, [], null);
      const suggestions = getSuggestedSuppliers(itemCode, 5, reqDateStr);
      decidedRequirements.push({
        req,
        group_id: req.group_id,
        decision: 'SOURCING_REQUEST',
        route: 'CAPEX_SOURCING',
        supplier_id: '',
        unit_price: val.unit_price,
        group_value_inr: val.group_value_inr,
        suggested_supplier_ids: suggestions.join(';'),
        policy_version: policy.version,
        reason: `Clause 5.1: Capex item type requires capex approval. Valued at INR ${val.unit_price} via ${val.source}.`
      });
      continue;
    }

    // 3. Find Applicable Rate Contracts (Policy 4.1 to 4.4)
    // - Covers item
    // - Requirement date between start_date and end_date (inclusive)
    // - Contract supplier is Active in supplier master (Policy 4.1 & 5.7)
    const applicableContracts = [];
    const itemLines = db.contractLines.filter(cl => cl.item_code === itemCode);

    itemLines.forEach(cl => {
      const c = contractState[cl.contract_id];
      if (!c) return;
      const supp = db.suppMap[c.supplier_id];
      if (!supp || supp.status !== 'Active') return; // Clause 4.1 & 5.7

      const cStart = new Date(`${c.start_date}T00:00:00Z`);
      const cEnd = new Date(`${c.end_date}T23:59:59Z`);
      if (reqDate >= cStart && reqDate <= cEnd) {
        applicableContracts.push({
          contract: c,
          line: cl,
          rate: parseFloat(cl.rate)
        });
      }
    });

    // Sort applicable contracts by rate ascending (lowest rate first - Policy 4.3)
    applicableContracts.sort((a, b) => a.rate - b.rate);

    // Check ceiling for each applicable contract (Policy 4.2)
    let chosenContract = null;
    for (const ac of applicableContracts) {
      const potentialVal = totalQty * ac.rate;
      if (ac.contract.consumed + potentialVal <= ac.contract.valCap) {
        chosenContract = ac;
        break;
      }
    }

    // 4. Check Rule 5.2: Rate Contract PO (Policy 5.2)
    if (chosenContract) {
      const val = valueRequirement(req, applicableContracts, chosenContract);
      // Consume contract ceiling
      chosenContract.contract.consumed += val.group_value_inr;

      decidedRequirements.push({
        req,
        group_id: req.group_id,
        decision: 'PO',
        route: 'CONTRACT_PO',
        supplier_id: chosenContract.contract.supplier_id,
        unit_price: val.unit_price,
        group_value_inr: val.group_value_inr,
        suggested_supplier_ids: '',
        policy_version: policy.version,
        contract_id: chosenContract.contract.contract_id,
        reason: `Clause 5.2: Rate contract ${chosenContract.contract.contract_id} applied at rate INR ${val.unit_price}`
      });
      continue;
    }

    // 5. No contract used -> calculate requirement value as per Policy 3.1
    const valuation = valueRequirement(req, applicableContracts, null);
    const reqVal = valuation.group_value_inr;
    const boughtActive365 = hasActivePurchaseIn365d(itemCode, reqDateStr);

    // Preferred supplier ranking as of requirement date (Policy 6.1, 6.2, 6.3)
    const ranking = getSupplierRanking(itemCode, reqDateStr);
    const topSupplier = ranking.top_supplier;

    // Evaluate dynamic policy rules (supporting amendment rules, category limits, plant limits)
    let decided = false;

    // Check custom policy rules if defined in the policy object
    if (policy.rules && Array.isArray(policy.rules)) {
      // Find rules beyond 5.1 and 5.2
      const candidateRules = policy.rules
        .filter(r => !['5.1', '5.2'].includes(r.id))
        .sort((a, b) => (a.priority || 99) - (b.priority || 99));

      for (const rule of candidateRules) {
        const cond = rule.conditions || {};

        // Plant condition check
        if (cond.plants && !cond.plants.includes(req.plant)) continue;
        if (cond.plant && cond.plant !== req.plant) continue;

        // Category condition check
        if (cond.categories && !cond.categories.includes(itemCategory)) continue;
        if (cond.category && cond.category !== itemCategory) continue;

        // Emergency condition check
        if (cond.emergency !== undefined && cond.emergency !== req.is_emergency) continue;

        // Value limits check
        if (cond.value_max !== undefined && reqVal > cond.value_max) continue;
        if (cond.value_min !== undefined && reqVal < cond.value_min) continue;

        // Purchase history check
        if (cond.bought_active_days !== undefined && !boughtActive365) continue;

        // Match found! Apply this rule's outcome
        const out = rule.outcome;
        let suppId = '';
        let unitPrice = valuation.unit_price;
        let suggs = '';

        if (out.decision === 'PO') {
          if (!topSupplier) {
            // Cannot place direct PO without proven supplier -> falls through to RFQ/RFP
            continue;
          }
          suppId = topSupplier.supplier_id;
          unitPrice = topSupplier.refPrice || valuation.unit_price;
        } else {
          // Sourcing request
          const count = out.supplier_count || (reqVal >= 1000000 ? 5 : 3);
          suggs = getSuggestedSuppliers(itemCode, count, reqDateStr).join(';');
        }

        let reason = out.reason_template || `Clause ${rule.clause || rule.id}: ${rule.name}`;
        if (suppId) {
          const poRef = topSupplier && topSupplier.mostRecentPo ? `PO ${topSupplier.mostRecentPo.po_number}` : 'history';
          reason = `Clause ${rule.clause || rule.id}: ${rule.name} awarded to 1st preferred supplier ${suppId} based on ${poRef}`;
        }

        decidedRequirements.push({
          req,
          group_id: req.group_id,
          decision: out.decision,
          route: out.route,
          supplier_id: suppId,
          unit_price: unitPrice,
          group_value_inr: reqVal,
          suggested_supplier_ids: suggs,
          policy_version: policy.version,
          reason
        });

        decided = true;
        break;
      }
    }

    if (decided) continue;

    // Fallback standard rules (5.3, 5.4, 5.5, 5.6)
    // 5.3 Emergency <= 5,00,000 & bought in 365d
    if (req.is_emergency && reqVal <= 500000 && boughtActive365 && topSupplier) {
      const poPrice = topSupplier.refPrice || valuation.unit_price;
      const poRef = topSupplier.mostRecentPo ? `PO ${topSupplier.mostRecentPo.po_number}` : 'history';
      decidedRequirements.push({
        req,
        group_id: req.group_id,
        decision: 'PO',
        route: 'EMERGENCY_PO',
        supplier_id: topSupplier.supplier_id,
        unit_price: poPrice,
        group_value_inr: reqVal,
        suggested_supplier_ids: '',
        policy_version: policy.version,
        reason: `Clause 5.3: Emergency PO to 1st preferred supplier ${topSupplier.supplier_id} based on ${poRef}`
      });
      continue;
    }

    // 5.4 Spot PO < 2,00,000 & bought in 365d
    if (reqVal < 200000 && boughtActive365 && topSupplier) {
      const poPrice = topSupplier.refPrice || valuation.unit_price;
      const poRef = topSupplier.mostRecentPo ? `PO ${topSupplier.mostRecentPo.po_number}` : 'history';
      decidedRequirements.push({
        req,
        group_id: req.group_id,
        decision: 'PO',
        route: 'SPOT_PO',
        supplier_id: topSupplier.supplier_id,
        unit_price: poPrice,
        group_value_inr: reqVal,
        suggested_supplier_ids: '',
        policy_version: policy.version,
        reason: `Clause 5.4: Spot PO to 1st preferred supplier ${topSupplier.supplier_id} based on ${poRef}`
      });
      continue;
    }

    // 5.5 Value < 10,00,000 -> RFQ (suggest 3 suppliers)
    if (reqVal < 1000000) {
      const suggs = getSuggestedSuppliers(itemCode, 3, reqDateStr);
      decidedRequirements.push({
        req,
        group_id: req.group_id,
        decision: 'SOURCING_REQUEST',
        route: 'RFQ',
        supplier_id: '',
        unit_price: valuation.unit_price,
        group_value_inr: reqVal,
        suggested_supplier_ids: suggs.join(';'),
        policy_version: policy.version,
        reason: `Clause 5.5: Value below INR 10,00,000 requires RFQ. Valued at INR ${valuation.unit_price} via ${valuation.explanation}.`
      });
      continue;
    }

    // 5.6 Value >= 10,00,000 -> RFP (suggest 5 suppliers)
    const suggs = getSuggestedSuppliers(itemCode, 5, reqDateStr);
    decidedRequirements.push({
      req,
      group_id: req.group_id,
      decision: 'SOURCING_REQUEST',
      route: 'RFP',
      supplier_id: '',
      unit_price: valuation.unit_price,
      group_value_inr: reqVal,
      suggested_supplier_ids: suggs.join(';'),
      policy_version: policy.version,
      reason: `Clause 5.6: Value INR 10,00,000 or more requires RFP. Valued at INR ${valuation.unit_price} via ${valuation.explanation}.`
    });
  }

  // 6. Consolidate POs (Policy Section 7)
  consolidatePOs(decidedRequirements);

  // 7. Flatten to line-level rows matching Section 4 output specification
  const outputRows = [];

  for (const dr of decidedRequirements) {
    for (const line of dr.req.lines) {
      outputRows.push({
        pr_no: line.pr_no,
        pr_line: line.pr_line,
        resolved_item_code: dr.req.resolved_item_code,
        group_id: dr.group_id,
        po_id: dr.po_id || '',
        decision: dr.decision,
        route: dr.route,
        supplier_id: dr.supplier_id || '',
        unit_price: dr.unit_price !== '' && dr.unit_price !== null && dr.unit_price !== undefined ? Number(dr.unit_price).toFixed(2) : '',
        group_value_inr: dr.group_value_inr,
        suggested_supplier_ids: dr.suggested_supplier_ids || '',
        policy_version: dr.policy_version,
        reason: dr.reason,
        // Helper metadata for UI
        plant: dr.req.plant,
        created_at: line.created_at,
        quantity: line.qty,
        uom: line.uom,
        description: line.description,
        is_emergency: dr.req.is_emergency,
        input_index: line.input_index !== undefined ? line.input_index : null
      });
    }
  }

  // Preserve original PR input order for consistent 1-to-1 line export
  outputRows.sort((a, b) => {
    if (a.input_index !== null && b.input_index !== null) {
      return a.input_index - b.input_index;
    }
    return 0;
  });

  return {
    requirements: decidedRequirements,
    outputRows
  };
}

module.exports = {
  runDecisionEngine
};
