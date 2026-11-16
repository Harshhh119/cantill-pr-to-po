const db = require('../db');
const { matchItem, normalizeText } = require('../engine/itemMatcher');
const { clubPrLines } = require('../engine/clubbingEngine');
const { runDecisionEngine } = require('../engine/decisionEngine');

class IntakeAssistant {
  constructor() {
    this.sessions = {};
  }

  getSession(sessionId) {
    if (!this.sessions[sessionId]) {
      this.sessions[sessionId] = {
        sessionId,
        messages: [
          {
            role: 'assistant',
            content: "Hello! I'm your Corvo Requisition Assistant. Tell me what you need, for example: *\"Need 200 nitrile gloves for Chakan by next Friday\"*.",
            timestamp: new Date().toISOString()
          }
        ],
        draftPR: {
          item_code: null,
          item_description: null,
          resolved_item: null,
          quantity: null,
          uom: null,
          plant: null,
          need_by_date: null,
          urgency: 'Normal',
          estimated_unit_price: null,
          department: 'Operations',
          requester: 'Factory Requester',
          status: 'COLLECTING' // COLLECTING -> CONFIRMING -> CREATED
        }
      };
    }
    return this.sessions[sessionId];
  }

  parseRelativeDate(text) {
    const today = new Date(); // In production/simulation, relative to current time
    const lower = text.toLowerCase();

    // Check for explicit YYYY-MM-DD
    const isoMatch = text.match(/\b(202\d-[01]\d-[0-3]\d)\b/);
    if (isoMatch) return isoMatch[1];

    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = text.match(/\b([0-3]?\d)[\/\-]([01]?\d)[\/\-](202\d)\b/);
    if (dmyMatch) {
      const d = dmyMatch[1].padStart(2, '0');
      const m = dmyMatch[2].padStart(2, '0');
      return `${dmyMatch[3]}-${m}-${d}`;
    }

    // Relative dates
    if (lower.includes('tomorrow')) {
      const t = new Date(today);
      t.setDate(t.getDate() + 1);
      return t.toISOString().split('T')[0];
    }

    if (lower.includes('next friday')) {
      const t = new Date(today);
      const day = t.getDay();
      const daysUntilFriday = (5 - day + 7) % 7 || 7;
      t.setDate(t.getDate() + daysUntilFriday);
      return t.toISOString().split('T')[0];
    }

    if (lower.includes('next monday')) {
      const t = new Date(today);
      const day = t.getDay();
      const daysUntilMonday = (1 - day + 7) % 7 || 7;
      t.setDate(t.getDate() + daysUntilMonday);
      return t.toISOString().split('T')[0];
    }

    const inDaysMatch = lower.match(/in\s+(\d+)\s+days?/);
    if (inDaysMatch) {
      const days = parseInt(inDaysMatch[1], 10);
      const t = new Date(today);
      t.setDate(t.getDate() + days);
      return t.toISOString().split('T')[0];
    }

    const inWeeksMatch = lower.match(/in\s+(\d+)\s+weeks?/);
    if (inWeeksMatch) {
      const weeks = parseInt(inWeeksMatch[1], 10);
      const t = new Date(today);
      t.setDate(t.getDate() + weeks * 7);
      return t.toISOString().split('T')[0];
    }

    return null;
  }

  extractSlots(userMessage, draft) {
    const lower = userMessage.toLowerCase();

    // 1. Urgency detection
    if (lower.includes('urgent') || lower.includes('emergency') || lower.includes('breakdown') || lower.includes('asap')) {
      draft.urgency = 'Emergency';
    }

    // 2. Plant detection
    if (lower.includes('chakan') || lower.includes('chk1')) {
      draft.plant = 'CHK1';
    } else if (lower.includes('bhosari') || lower.includes('pune') || lower.includes('pun1')) {
      draft.plant = 'PUN1';
    }

    // 3. Quantity & UOM detection
    // e.g. "200 nitrile gloves", "50 nos", "10 kg", "20 pairs", "5 cylinders"
    const qtyMatch = userMessage.match(/\b(\d+(?:\.\d+)?)\s*(nos|kg|mtr|ltr|pair|pairs|cyl|cylinders|box|boxes|ream|job|sets?|rolls?)?\b/i);
    if (qtyMatch && !draft.quantity) {
      // make sure it's not part of an item dimension like "1250x2500" or "6205"
      const val = parseFloat(qtyMatch[1]);
      if (val < 1000000) {
        draft.quantity = val;
        if (qtyMatch[2]) {
          const uomRaw = qtyMatch[2].toUpperCase();
          if (uomRaw.startsWith('PAIR')) draft.uom = 'PAIR';
          else if (uomRaw.startsWith('CYL')) draft.uom = 'CYL';
          else if (uomRaw.startsWith('SET')) draft.uom = 'SET';
          else if (uomRaw.startsWith('ROL')) draft.uom = 'ROL';
          else draft.uom = uomRaw;
        }
      }
    }

    // 4. Need by date detection
    const dateParsed = this.parseRelativeDate(userMessage);
    if (dateParsed) {
      draft.need_by_date = dateParsed;
    }

    // 5. Item matching
    // Extract candidate item string by removing recognized plant, quantity, date tokens
    let itemQuery = userMessage
      .replace(/\b(need|please|arrange|buy|order|purchase|for|by|next|friday|monday|tomorrow|chk1|pun1|chakan|bhosari|pune|urgent|emergency)\b/gi, ' ')
      .replace(/\b\d+(\.\d+)?\s*(nos|kg|mtr|ltr|pair|pairs|cyl|cylinders)?\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (itemQuery.length > 2 && !draft.item_code) {
      const match = matchItem(null, itemQuery);
      if (match && match.resolved_item_code !== 'NEW') {
        draft.item_code = match.resolved_item_code;
        draft.item_description = match.item.description;
        draft.resolved_item = match.item;
        if (!draft.uom) draft.uom = match.item.uom;
      } else if (match && match.resolved_item_code === 'NEW') {
        // Potential new item
        draft.item_code = 'NEW';
        draft.item_description = itemQuery;
      }
    }
  }

  processMessage(sessionId, userMessage) {
    const session = this.getSession(sessionId);
    const draft = session.draftPR;

    // Add user message to history
    session.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    });

    const lower = userMessage.toLowerCase().trim();

    // Check if user is confirming
    if (draft.status === 'CONFIRMING') {
      if (['yes', 'confirm', 'proceed', 'create', 'ok', 'sure', 'yes please', 'create pr'].includes(lower)) {
        return this.createPRFromDraft(session);
      } else if (['no', 'cancel', 'reset', 'change'].includes(lower)) {
        draft.status = 'COLLECTING';
        const reply = "Understood. What would you like to update? (e.g. change quantity, plant, need-by date, or item)";
        session.messages.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
        return { response: reply, draftPR: draft, session };
      }
    }

    // Extract slots from message
    this.extractSlots(userMessage, draft);

    // Check for missing slots
    const missing = [];
    if (!draft.item_description && !draft.item_code) missing.push('item');
    if (!draft.quantity) missing.push('quantity');
    if (!draft.plant) missing.push('plant');
    if (!draft.need_by_date) missing.push('need_by_date');

    if (missing.length > 0) {
      let followUp = '';
      if (missing.includes('item')) {
        followUp = "Could you specify which item or material you need?";
      } else if (missing.includes('quantity')) {
        followUp = `Got it for ${draft.item_description || 'the item'}. What quantity do you require?`;
      } else if (missing.includes('plant')) {
        followUp = `Understood: ${draft.quantity} ${draft.uom || 'units'} of ${draft.item_description}. Which plant is this for? (PUN1 Bhosari or CHK1 Chakan)`;
      } else if (missing.includes('need_by_date')) {
        followUp = `By when do you need this delivered at ${draft.plant}? (e.g. "by next Friday" or YYYY-MM-DD)`;
      }

      session.messages.push({
        role: 'assistant',
        content: followUp,
        timestamp: new Date().toISOString()
      });

      return {
        response: followUp,
        missingSlots: missing,
        draftPR: draft,
        session
      };
    }

    // All slots filled -> Move to CONFIRMING state
    draft.status = 'CONFIRMING';
    const isNew = draft.item_code === 'NEW';
    const itemLabel = isNew
      ? `⚠️ New Item: "${draft.item_description}" (Not in item master - will route to Sourcing)`
      : `✅ Matched: **${draft.item_code}** - ${draft.item_description}`;

    const confirmationText = `I have captured your purchase requisition:\n\n` +
      `- **Item**: ${itemLabel}\n` +
      `- **Quantity**: ${draft.quantity} ${draft.uom || 'NOS'}\n` +
      `- **Plant**: ${draft.plant} (${draft.plant === 'CHK1' ? 'Chakan' : 'Pune Bhosari'})\n` +
      `- **Need-By Date**: ${draft.need_by_date}\n` +
      `- **Urgency**: ${draft.urgency}\n\n` +
      `Shall I confirm and create this PR? (Type **yes** to confirm or let me know what to change)`;

    session.messages.push({
      role: 'assistant',
      content: confirmationText,
      timestamp: new Date().toISOString(),
      actionRequired: 'CONFIRM_PR'
    });

    return {
      response: confirmationText,
      readyToConfirm: true,
      draftPR: draft,
      session
    };
  }

  createPRFromDraft(session) {
    const draft = session.draftPR;
    const prNumber = `PR-26-${String(db.createdPRs.length + 500).padStart(5, '0')}`;
    const prLine = 1;
    const createdAt = new Date().toISOString().replace('T', ' ').substring(0, 16);

    const prRecord = {
      pr_no: prNumber,
      pr_line: prLine,
      created_at: createdAt,
      requester: draft.requester || 'Requester via Chat',
      department: draft.department || 'Operations',
      plant: draft.plant,
      item_code: draft.item_code === 'NEW' ? '' : draft.item_code,
      description: draft.item_description,
      quantity: String(draft.quantity),
      uom: draft.uom || 'NOS',
      estimated_unit_price: draft.estimated_unit_price ? String(draft.estimated_unit_price) : '',
      need_by_date: draft.need_by_date,
      urgency: draft.urgency
    };

    db.createdPRs.push(prRecord);

    // Evaluate with decision engine immediately for instant feedback
    const { requirements } = clubPrLines([prRecord]);
    const { decidedRequirements, outputRows } = runDecisionEngine(requirements);
    const resultRow = outputRows[0] || {};

    draft.status = 'CREATED';
    draft.pr_no = prNumber;
    draft.decisionResult = resultRow;

    const completionMsg = `🎉 **Requisition Created Successfully!**\n\n` +
      `- **PR Number**: \`${prNumber}\` (Line 1)\n` +
      `- **Requirement ID**: \`${resultRow.group_id}\`\n` +
      `- **Policy Decision**: **${resultRow.decision}** (Route: \`${resultRow.route}\`)\n` +
      (resultRow.decision === 'PO' ? `- **Assigned Supplier**: \`${resultRow.supplier_id}\` at ₹${resultRow.unit_price}\n- **Consolidated PO**: \`${resultRow.po_id}\`\n` : '') +
      (resultRow.suggested_supplier_ids ? `- **Suggested Suppliers**: \`${resultRow.suggested_supplier_ids}\`\n` : '') +
      `- **Requirement Value**: ₹${resultRow.group_value_inr.toLocaleString('en-IN')}\n` +
      `- **Clause**: ${resultRow.reason}\n\n` +
      `This requisition is now visible in the **Buyer Workspace** for approval.`;

    session.messages.push({
      role: 'assistant',
      content: completionMsg,
      timestamp: new Date().toISOString()
    });

    db.addAuditLog({
      action: 'PR_CREATED_VIA_CHAT',
      entity_type: 'PR',
      entity_id: prNumber,
      details: `Created ${prNumber} for ${draft.quantity} ${draft.uom} of ${draft.item_description}. Route: ${resultRow.route}`
    });

    // Reset draft for next request
    session.draftPR = {
      item_code: null,
      item_description: null,
      resolved_item: null,
      quantity: null,
      uom: null,
      plant: null,
      need_by_date: null,
      urgency: 'Normal',
      estimated_unit_price: null,
      department: 'Operations',
      requester: 'Factory Requester',
      status: 'COLLECTING'
    };

    return {
      response: completionMsg,
      createdPR: prRecord,
      decision: resultRow,
      session
    };
  }
}

const intakeAssistant = new IntakeAssistant();
module.exports = intakeAssistant;
