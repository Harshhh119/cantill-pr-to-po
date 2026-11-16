const fs = require('fs');
const path = require('path');
const db = require('../db');

class PolicyManager {
  getAllPolicies() {
    return db.policies;
  }

  getActivePolicy() {
    return db.getActivePolicy();
  }

  getPolicyByVersion(version) {
    return db.policies.find(p => p.version === version);
  }

  parseAmendmentText(text, proposedVersion = null, effectiveDate = null) {
    const activePolicy = db.getActivePolicy();
    const newVersion = proposedVersion || `v5.${db.policies.length}`;
    const newEffectiveDate = effectiveDate || new Date().toISOString().split('T')[0];

    // Deep clone active policy as base
    const amendedPolicy = JSON.parse(JSON.stringify(activePolicy));
    amendedPolicy.version = newVersion;
    amendedPolicy.effective_date = newEffectiveDate;
    amendedPolicy.status = 'draft';
    amendedPolicy.document_id = `CORVO-PROC-AMD-${newVersion.replace('.', '-')}`;
    amendedPolicy.amendment_notes = text;

    const diffs = [];

    // Parse common procurement change patterns:
    // 1. Spot PO threshold change
    // e.g. "spot limit from 200000 to 300000" or "increase spot po to 3,00,000"
    const spotMatch = text.match(/spot(?:_po)?\s*(?:limit|threshold)?\s*(?:from\s*[\d,]+\s*)?(?:to|is|=)?\s*([₹\d,]+)/i);
    if (spotMatch) {
      const newVal = parseInt(spotMatch[1].replace(/[₹,]/g, ''), 10);
      if (!isNaN(newVal)) {
        const spotRule = amendedPolicy.rules.find(r => r.id === '5.4');
        if (spotRule) {
          const oldVal = spotRule.conditions.value_max;
          spotRule.conditions.value_max = newVal;
          diffs.push({
            type: 'LIMIT_CHANGE',
            target: 'Rule 5.4 (Spot Purchase)',
            old_value: `₹${oldVal.toLocaleString('en-IN')}`,
            new_value: `₹${newVal.toLocaleString('en-IN')}`,
            description: `Increased Spot PO ceiling from ₹${oldVal.toLocaleString('en-IN')} to ₹${newVal.toLocaleString('en-IN')}. Requirements under this limit with proven purchase history will go to direct PO without quotes.`
          });
        }
      }
    }

    // 2. Emergency PO threshold change
    const emergMatch = text.match(/emergency(?:_po)?\s*(?:limit|threshold)?\s*(?:from\s*[\d,]+\s*)?(?:to|is|=)?\s*([₹\d,]+)/i);
    if (emergMatch) {
      const newVal = parseInt(emergMatch[1].replace(/[₹,]/g, ''), 10);
      if (!isNaN(newVal)) {
        const emergRule = amendedPolicy.rules.find(r => r.id === '5.3');
        if (emergRule) {
          const oldVal = emergRule.conditions.value_max;
          emergRule.conditions.value_max = newVal;
          diffs.push({
            type: 'LIMIT_CHANGE',
            target: 'Rule 5.3 (Emergency Purchase)',
            old_value: `₹${oldVal.toLocaleString('en-IN')}`,
            new_value: `₹${newVal.toLocaleString('en-IN')}`,
            description: `Adjusted Emergency PO limit from ₹${oldVal.toLocaleString('en-IN')} to ₹${newVal.toLocaleString('en-IN')}.`
          });
        }
      }
    }

    // 3. Plant-specific rule addition/change
    // e.g. "For Chakan plant (CHK1), all fasteners above 50,000 must go to RFQ"
    // or "For plant PUN1, spot PO limit is 1,50,000"
    const plantLimitMatch = text.match(/(?:for\s+plant\s+|plant\s+)(PUN1|CHK1|bhosari|chakan)[^.]*?spot(?:_po)?\s*(?:limit|threshold)?\s*(?:is|to|=)?\s*([₹\d,]+)/i);
    if (plantLimitMatch) {
      const plantCode = plantLimitMatch[1].toUpperCase().includes('CHK') || plantLimitMatch[1].toLowerCase().includes('chakan') ? 'CHK1' : 'PUN1';
      const newVal = parseInt(plantLimitMatch[2].replace(/[₹,]/g, ''), 10);
      if (!isNaN(newVal)) {
        const ruleId = `5.4_${plantCode}`;
        const newRule = {
          id: ruleId,
          name: `Spot Purchase (${plantCode} Specific)`,
          clause: `5.4 (${plantCode})`,
          priority: 3.9,
          conditions: {
            plant: plantCode,
            value_max: newVal,
            bought_active_days: 365
          },
          outcome: {
            decision: 'PO',
            route: 'SPOT_PO',
            supplier_selection: 'PREFERRED_1',
            pricing: 'REFERENCE_PRICE',
            reason_template: `Clause 5.4 (${plantCode}): Plant-specific Spot PO limit of ₹${newVal.toLocaleString('en-IN')} applied.`
          }
        };
        amendedPolicy.rules.unshift(newRule);
        diffs.push({
          type: 'PLANT_RULE_ADDED',
          target: `New Rule ${ruleId}`,
          old_value: 'Standard company-wide limit (₹2,00,000)',
          new_value: `Plant ${plantCode} limit: ₹${newVal.toLocaleString('en-IN')}`,
          description: `Added plant-specific Spot PO rule for ${plantCode} with limit ₹${newVal.toLocaleString('en-IN')}.`
        });
      }
    }

    // 4. Category-specific sourcing rule
    // e.g. "Electrical Spares above 5,00,000 must go to RFP with 5 quotes"
    const catMatch = text.match(/(Steel & Metals|Fasteners|Welding Consumables|Bearings & Transmission|Electrical Spares|Hydraulics & Pneumatics|Packaging|Safety & PPE|Lubricants|Office & IT|Facility Services|Testing & Calibration)[\s\S]*?(?:above|over|>)\s*([₹\d,]+)[\s\S]*?(RFQ|RFP)/i);
    if (catMatch) {
      const category = catMatch[1];
      const minVal = parseInt(catMatch[2].replace(/[₹,]/g, ''), 10);
      const targetRoute = catMatch[3].toUpperCase();
      const count = targetRoute === 'RFP' ? 5 : 3;

      const ruleId = `5.5_${category.replace(/[^a-zA-Z]/g, '')}`;
      const newRule = {
        id: ruleId,
        name: `${category} Special Sourcing`,
        clause: `5.5 (${category})`,
        priority: 4.5,
        conditions: {
          category: category,
          value_min: minVal
        },
        outcome: {
          decision: 'SOURCING_REQUEST',
          route: targetRoute,
          supplier_selection: 'SUGGEST_PREFERRED_THEN_CATEGORY',
          supplier_count: count,
          reason_template: `Clause 5.5 (${category}): Mandatory ${targetRoute} for ${category} with requirement value >= ₹${minVal.toLocaleString('en-IN')}.`
        }
      };
      amendedPolicy.rules.unshift(newRule);
      diffs.push({
        type: 'CATEGORY_RULE_ADDED',
        target: `New Rule ${ruleId}`,
        old_value: 'Standard value threshold (₹10,00,000 for RFP)',
        new_value: `${category} >= ₹${minVal.toLocaleString('en-IN')} -> ${targetRoute}`,
        description: `Mandated that ${category} requirements exceeding ₹${minVal.toLocaleString('en-IN')} must go to ${targetRoute} with ${count} suggested suppliers.`
      });
    }

    if (diffs.length === 0) {
      // General note amendment
      diffs.push({
        type: 'POLICY_NOTE',
        target: 'Procurement Policy Amendment',
        old_value: activePolicy.version,
        new_value: newVersion,
        description: `Policy amended with text: "${text.substring(0, 150)}..."`
      });
    }

    return {
      draftPolicy: amendedPolicy,
      diffs,
      plainLanguageSummary: diffs.map(d => d.description).join(' ')
    };
  }

  saveDraftPolicy(draftPolicy) {
    const existingIdx = db.policies.findIndex(p => p.version === draftPolicy.version);
    if (existingIdx >= 0) {
      db.policies[existingIdx] = draftPolicy;
    } else {
      db.policies.push(draftPolicy);
    }
    return draftPolicy;
  }

  activatePolicy(version) {
    const policy = db.policies.find(p => p.version === version);
    if (!policy) {
      throw new Error(`Policy version ${version} not found`);
    }

    // Set all other active policies to superseded
    db.policies.forEach(p => {
      if (p.version !== version && p.status === 'active') {
        p.status = 'superseded';
      }
    });

    policy.status = 'active';
    db.activePolicyVersion = version;

    db.addAuditLog({
      action: 'POLICY_ACTIVATED',
      entity_type: 'POLICY',
      entity_id: version,
      details: `Policy ${version} activated with effective date ${policy.effective_date}.`
    });

    return policy;
  }
}

const policyManager = new PolicyManager();
module.exports = policyManager;
