const db = require('../db');

function getMostRecentPoIn365d(itemCode, asOfDateStr) {
  const asOf = new Date(`${asOfDateStr}T23:59:59Z`);
  const d365 = new Date(asOf.getTime() - 365 * 24 * 3600 * 1000);

  const matchingPos = db.poHistory.filter(p => {
    if (p.item_code !== itemCode) return false;
    const pDate = new Date(`${p.po_date}T00:00:00Z`);
    return pDate <= asOf && pDate >= d365;
  });

  // Sort by po_date desc, then po_number desc
  matchingPos.sort((a, b) => (new Date(b.po_date) - new Date(a.po_date)) || String(b.po_number).localeCompare(String(a.po_number)));

  return matchingPos.length > 0 ? matchingPos[0] : null;
}

function hasActivePurchaseIn365d(itemCode, asOfDateStr) {
  const asOf = new Date(`${asOfDateStr}T23:59:59Z`);
  const d365 = new Date(asOf.getTime() - 365 * 24 * 3600 * 1000);

  return db.poHistory.some(p => {
    if (p.item_code !== itemCode) return false;
    const supp = db.suppMap[p.supplier_id];
    if (!supp || supp.status !== 'Active') return false;
    const pDate = new Date(`${p.po_date}T00:00:00Z`);
    return pDate <= asOf && pDate >= d365;
  });
}

function valueRequirement(req, applicableContracts, chosenContract) {
  const itemCode = req.resolved_item_code;
  const totalQty = req.total_quantity;

  // Clause 1.2: New item
  if (itemCode === 'NEW') {
    const estPrice = req.first_line.estPrice || 0;
    const reqVal = Math.round(totalQty * estPrice);
    return {
      unit_price: estPrice,
      group_value_inr: reqVal,
      source: 'requester_estimate',
      explanation: `Valued at requester estimated unit price INR ${estPrice}`
    };
  }

  const item = db.itemMap[itemCode];

  // 3.1 (a) Contract rate to be used, or lowest applicable contract rate if out of ceiling
  if (chosenContract) {
    const rate = chosenContract.rate;
    const reqVal = Math.round(totalQty * rate);
    return {
      unit_price: rate,
      group_value_inr: reqVal,
      source: 'contract_rate',
      contract_id: chosenContract.contract.contract_id,
      explanation: `Valued at rate contract ${chosenContract.contract.contract_id} rate of INR ${rate}`
    };
  }

  if (applicableContracts && applicableContracts.length > 0) {
    // lowest applicable contract rate (they are sorted by rate asc)
    const lowestRate = applicableContracts[0].rate;
    const reqVal = Math.round(totalQty * lowestRate);
    return {
      unit_price: lowestRate,
      group_value_inr: reqVal,
      source: 'lowest_applicable_contract_rate',
      contract_id: applicableContracts[0].contract.contract_id,
      explanation: `All applicable contracts out of ceiling. Valued at lowest applicable contract rate INR ${lowestRate} from ${applicableContracts[0].contract.contract_id}`
    };
  }

  // 3.1 (b) Price on most recent PO in 365 days before requirement date
  const recentPo = getMostRecentPoIn365d(itemCode, req.requirement_date);
  if (recentPo) {
    const poPrice = parseFloat(recentPo.unit_price);
    const reqVal = Math.round(totalQty * poPrice);
    return {
      unit_price: poPrice,
      group_value_inr: reqVal,
      source: 'recent_po',
      po_number: recentPo.po_number,
      po_date: recentPo.po_date,
      explanation: `Valued at most recent PO ${recentPo.po_number} (${recentPo.po_date}) price of INR ${poPrice}`
    };
  }

  // 3.1 (c) Item master standard price
  const stdPrice = item ? parseFloat(item.standard_price) : 0;
  const reqVal = Math.round(totalQty * stdPrice);
  return {
    unit_price: stdPrice,
    group_value_inr: reqVal,
    source: 'item_master_standard_price',
    explanation: `Valued at item master standard price of INR ${stdPrice}`
  };
}

module.exports = {
  getMostRecentPoIn365d,
  hasActivePurchaseIn365d,
  valueRequirement
};
