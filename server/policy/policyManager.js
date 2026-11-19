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
    const cleanText = (text || '').replace(/\r/g, ' ');

    // Extract version if mentioned, e.g. "New version 5.1" or "Amendment No. 1"
    let newVersion = proposedVersion;
    if (!newVersion) {
      const verMatch = cleanText.match(/new\s+version\s*([0-9]+\.[0-9]+)/i) || cleanText.match(/(?:amendment\s+no\.?\s*([0-9]+))/i) || cleanText.match(/version\s*([0-9]+\.[0-9]+)/i);
      newVersion = verMatch ? (verMatch[0].toLowerCase().includes('amendment') ? `v5.${verMatch[1]}` : `v${verMatch[1]}`) : `v5.${db.policies.length}`;
    }

    // Extract effective date if mentioned, e.g. "Effective 1 December 2026"
    let newEffectiveDate = effectiveDate;
    if (!newEffectiveDate) {
      const dateMatch = cleanText.match(/effective\s*([0-9]{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*([0-9]{4})/i);
      if (dateMatch) {
        const months = {
          january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
          july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
        };
        const day = dateMatch[1].padStart(2, '0');
        const month = months[dateMatch[2].toLowerCase()];
        const year = dateMatch[3];
        newEffectiveDate = `${year}-${month}-${day}`;
      } else {
        const isoMatch = cleanText.match(/\b(202\d-[01]\d-[0-3]\d)\b/);
        newEffectiveDate = isoMatch ? isoMatch[1] : new Date().toISOString().split('T')[0];
      }
    }

    // Deep clone active policy as base
    const amendedPolicy = JSON.parse(JSON.stringify(activePolicy));
    amendedPolicy.version = newVersion;
    amendedPolicy.effective_date = newEffectiveDate;
    amendedPolicy.status = 'draft';
    amendedPolicy.document_id = `CORVO-PROC-AMD-${newVersion.replace('.', '-')}`;
    amendedPolicy.amendment_notes = text;

    const diffs = [];

    // ----------------------------------------------------
    // Change A2: RFP threshold reduction (e.g. 10L -> 8L)
    // ----------------------------------------------------
    const rfpMatch = cleanText.match(/rfp\s*threshold[\s\S]*?(?:reduced\s*from\s*(?:INR|Rs\.?|₹|\s|[\d,])+\s*to|to|is|=)\s*(?:INR|Rs\.?|₹|\s)*([0-9,]+)/i);
    let currentRfpThreshold = 800000;
    if (rfpMatch) {
      const newVal = parseInt(rfpMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(newVal)) {
        currentRfpThreshold = newVal;
        const rfqRule = amendedPolicy.rules.find(r => r.id === '5.5');
        const rfpRule = amendedPolicy.rules.find(r => r.id === '5.6');
        const oldVal = rfqRule ? rfqRule.conditions.value_max : 1000000;

        if (rfqRule) {
          rfqRule.conditions.value_max = newVal;
          rfqRule.outcome.reason_template = `Clause 5.5: Value below INR ${newVal.toLocaleString('en-IN')} (or unproven small purchase) requires 3 quotes via RFQ.`;
        }
        if (rfpRule) {
          rfpRule.conditions.value_min = newVal;
          rfpRule.outcome.reason_template = `Clause 5.6: Value INR ${newVal.toLocaleString('en-IN')} or more requires formal RFP with 5 suggested suppliers.`;
        }

        diffs.push({
          type: 'THRESHOLD_CHANGE',
          target: 'Rules 5.5 and 5.6 (RFP Threshold)',
          old_value: `INR ${oldVal.toLocaleString('en-IN')}`,
          new_value: `INR ${newVal.toLocaleString('en-IN')}`,
          description: `Reduced formal RFP threshold from INR ${oldVal.toLocaleString('en-IN')} to INR ${newVal.toLocaleString('en-IN')}. Sourcing requirements below INR ${newVal.toLocaleString('en-IN')} go to RFQ (3 quotes); INR ${newVal.toLocaleString('en-IN')} or more go to RFP (5 quotes).`
        });
      }
    }

    // ----------------------------------------------------
    // Change A1: Packaging spot limit reduction (e.g. 2L -> 1L)
    // ----------------------------------------------------
    const pkgMatch = cleanText.match(/packaging\s*(?:spot\s*limit|category)[\s\S]*?(?:reduced\s*from\s*(?:INR|Rs\.?|₹|\s|[\d,])+\s*to|to|is|=)\s*(?:INR|Rs\.?|₹|\s)*([0-9,]+)/i);
    if (pkgMatch) {
      const pkgLimit = parseInt(pkgMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(pkgLimit)) {
        // Remove any existing packaging custom rules
        amendedPolicy.rules = amendedPolicy.rules.filter(r => !r.id.startsWith('A1_Packaging'));

        // Add rules to intercept packaging >= pkgLimit before Rule 5.4
        // 1. Packaging >= RFP threshold -> RFP
        amendedPolicy.rules.push({
          id: 'A1_Packaging_RFP',
          name: 'Packaging Special Sourcing (RFP)',
          clause: '5.4 (Packaging)',
          priority: 3.6,
          conditions: {
            category: 'Packaging',
            value_min: currentRfpThreshold
          },
          outcome: {
            decision: 'SOURCING_REQUEST',
            route: 'RFP',
            supplier_selection: 'SUGGEST_PREFERRED_THEN_CATEGORY',
            supplier_count: 5,
            reason_template: `Clause 5.4 / 5.6 (Packaging): Packaging requirement >= INR ${currentRfpThreshold.toLocaleString('en-IN')} must be sourced via formal RFP.`
          }
        });

        // 2. Packaging >= pkgLimit and < currentRfpThreshold -> RFQ
        amendedPolicy.rules.push({
          id: 'A1_Packaging_RFQ',
          name: 'Packaging Special Sourcing (RFQ)',
          clause: '5.4 (Packaging)',
          priority: 3.7,
          conditions: {
            category: 'Packaging',
            value_min: pkgLimit,
            value_max: currentRfpThreshold
          },
          outcome: {
            decision: 'SOURCING_REQUEST',
            route: 'RFQ',
            supplier_selection: 'SUGGEST_PREFERRED_THEN_CATEGORY',
            supplier_count: 3,
            reason_template: `Clause 5.4 / 5.5 (Packaging): Packaging spot limit reduced to INR ${pkgLimit.toLocaleString('en-IN')}; requirement >= INR ${pkgLimit.toLocaleString('en-IN')} must be sourced via RFQ.`
          }
        });

        diffs.push({
          type: 'CATEGORY_LIMIT_CHANGE',
          target: 'Rule 5.4 (Packaging Category Spot Limit)',
          old_value: 'INR 2,00,000',
          new_value: `INR ${pkgLimit.toLocaleString('en-IN')}`,
          description: `Reduced Spot PO threshold for Packaging from INR 2,00,000 to INR ${pkgLimit.toLocaleString('en-IN')}. Packaging requirements at or above INR ${pkgLimit.toLocaleString('en-IN')} must be sourced.`
        });
      }
    }

    // ----------------------------------------------------
    // Change A3: New rule 5.2A, Chakan electrical safety
    // ----------------------------------------------------
    const chkElecMatch = cleanText.match(/(?:5\.2A|chakan\s*electrical\s*safety)[\s\S]*?(?:worth|value|>=|>)\s*(?:INR|Rs\.?|₹|\s)*([0-9,]+)/i);
    if (chkElecMatch || (cleanText.includes('5.2A') && cleanText.includes('Electrical Spares'))) {
      const elecThreshold = chkElecMatch ? parseInt(chkElecMatch[1].replace(/,/g, ''), 10) : 50000;
      
      // Remove any existing 5.2A rules
      amendedPolicy.rules = amendedPolicy.rules.filter(r => !r.id.startsWith('5.2A'));

      // Applied immediately after rule 5.2 (priorities 2.4 and 2.5)
      // 1. Chakan Electrical Spares >= RFP Threshold -> RFP (priority 2.4)
      amendedPolicy.rules.push({
        id: '5.2A_RFP',
        name: 'Chakan Electrical Safety (RFP)',
        clause: '5.2A',
        priority: 2.4,
        conditions: {
          plant: 'CHK1',
          category: 'Electrical Spares',
          value_min: currentRfpThreshold
        },
        outcome: {
          decision: 'SOURCING_REQUEST',
          route: 'RFP',
          supplier_selection: 'SUGGEST_PREFERRED_THEN_CATEGORY',
          supplier_count: 5,
          reason_template: `Clause 5.2A: Chakan electrical safety certification requires RFP for Electrical Spares worth >= INR ${currentRfpThreshold.toLocaleString('en-IN')}.`
        }
      });

      // 2. Chakan Electrical Spares >= 50,000 and < RFP Threshold -> RFQ (priority 2.5)
      amendedPolicy.rules.push({
        id: '5.2A_RFQ',
        name: 'Chakan Electrical Safety (RFQ)',
        clause: '5.2A',
        priority: 2.5,
        conditions: {
          plant: 'CHK1',
          category: 'Electrical Spares',
          value_min: elecThreshold,
          value_max: currentRfpThreshold
        },
        outcome: {
          decision: 'SOURCING_REQUEST',
          route: 'RFQ',
          supplier_selection: 'SUGGEST_PREFERRED_THEN_CATEGORY',
          supplier_count: 3,
          reason_template: `Clause 5.2A: Chakan electrical safety certification requires sourcing event (RFQ) for Electrical Spares worth >= INR ${elecThreshold.toLocaleString('en-IN')}.`
        }
      });

      diffs.push({
        type: 'NEW_RULE_ADDED',
        target: 'Rule 5.2A (Chakan Electrical Safety)',
        old_value: 'None (Emergency/Spot PO previously permitted)',
        new_value: `Mandatory Sourcing for CHK1 Electrical Spares >= INR ${elecThreshold.toLocaleString('en-IN')}`,
        description: `Added Rule 5.2A: At Chakan plant (CHK1), all Electrical Spares requirements worth INR ${elecThreshold.toLocaleString('en-IN')} or more must be sourced via RFQ/RFP, even if qualifying for emergency or spot PO. Rate contract POs (Rule 5.2) remain permitted.`
      });
    }

    if (diffs.length === 0) {
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
