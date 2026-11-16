const db = require('../db');

function getSupplierRanking(itemCode, asOfDateStr) {
  const asOf = new Date(asOfDateStr ? `${asOfDateStr}T23:59:59Z` : new Date().toISOString());
  const d548 = new Date(asOf.getTime() - 548 * 24 * 3600 * 1000);
  const d365 = new Date(asOf.getTime() - 365 * 24 * 3600 * 1000);
  const d90 = new Date(asOf.getTime() - 90 * 24 * 3600 * 1000);

  // 1. Identify contracts covering item that started on or before asOf date
  const itemContractLines = db.contractLines.filter(cl => cl.item_code === itemCode);
  const contractSuppliers = new Set();
  const contractMap = {};

  itemContractLines.forEach(cl => {
    const c = db.contracts.find(ac => ac.contract_id === cl.contract_id);
    if (c) {
      const cStart = new Date(c.start_date + 'T00:00:00Z');
      if (cStart <= asOf) {
        contractSuppliers.add(c.supplier_id);
        if (!contractMap[c.supplier_id] || new Date(c.start_date) > new Date(contractMap[c.supplier_id].start_date)) {
          contractMap[c.supplier_id] = { contract: c, line: cl };
        }
      }
    }
  });

  // 2. Identify POs for the item in 548 days before asOf
  const itemPos = db.poHistory.filter(p => {
    if (p.item_code !== itemCode) return false;
    const pDate = new Date(p.po_date + 'T00:00:00Z');
    return pDate <= asOf && pDate >= d548;
  });

  // Group POs by supplier
  const poBySupp = {};
  itemPos.forEach(p => {
    if (!poBySupp[p.supplier_id]) poBySupp[p.supplier_id] = [];
    poBySupp[p.supplier_id].push(p);
  });

  // 3. Find candidate suppliers: Active suppliers with >= 1 PO in 548d OR contract started <= asOf
  const candidateIds = new Set([...Object.keys(poBySupp), ...contractSuppliers]);
  const ranked = [];
  const excluded = [];

  candidateIds.forEach(sId => {
    const s = db.suppMap[sId];
    if (!s) return;
    const isActive = s.status === 'Active';
    const sPos = poBySupp[sId] || [];
    // Sort POs by date desc, then po_number desc
    sPos.sort((a, b) => (new Date(b.po_date) - new Date(a.po_date)) || String(b.po_number).localeCompare(String(a.po_number)));
    const poCount = sPos.length;

    let recency = 0;
    let recencyTier = 'Older than 1 yr';
    let mostRecentPo = sPos[0] || null;
    if (mostRecentPo) {
      const mDate = new Date(mostRecentPo.po_date + 'T00:00:00Z');
      if (mDate >= d90) {
        recency = 1.0;
        recencyTier = '< 90 days';
      } else if (mDate >= d365) {
        recency = 0.5;
        recencyTier = '< 1 year';
      }
    }

    const hasContract = contractSuppliers.has(sId);
    const onTime = parseFloat(s.on_time_pct) || 0;
    const quality = parseFloat(s.quality_rating) || 0;

    // Reference price: price on supplier's most recent PO in 548 days; if none, rate in most recent contract
    let refPrice = null;
    let priceSource = '';
    if (mostRecentPo) {
      refPrice = parseFloat(mostRecentPo.unit_price);
      priceSource = `PO ${mostRecentPo.po_number} (${mostRecentPo.po_date})`;
    } else if (contractMap[sId]) {
      refPrice = parseFloat(contractMap[sId].line.rate);
      priceSource = `Contract ${contractMap[sId].contract.contract_id}`;
    }

    // Scoring formula:
    // (recency * 30) + (Math.min(poCount, 10) * 5) + (hasContract ? 15 : 0) + (onTime * 0.25) + ((quality / 5) * 20)
    const recencyScore = recency * 30;
    const poScore = Math.min(poCount, 10) * 5;
    const contractScore = hasContract ? 15 : 0;
    const deliveryScore = onTime * 0.25;
    const qualityScore = (quality / 5) * 20;
    const totalScore = Math.round((recencyScore + poScore + contractScore + deliveryScore + qualityScore) * 100) / 100;

    const supplierData = {
      supplier_id: sId,
      name: s.name,
      status: s.status,
      city: s.city,
      isActive,
      poCount,
      recency,
      recencyTier,
      hasContract,
      contractId: contractMap[sId] ? contractMap[sId].contract.contract_id : null,
      onTime,
      quality,
      refPrice: refPrice !== null ? Math.round(refPrice * 100) / 100 : null,
      priceSource,
      score: totalScore,
      scoreBreakdown: {
        recencyScore,
        poScore,
        contractScore,
        deliveryScore,
        qualityScore
      },
      mostRecentPo
    };

    if (!isActive) {
      supplierData.exclusionReason = `Status is ${s.status} (Clause 5.7 / 6.1)`;
      excluded.push(supplierData);
    } else {
      ranked.push(supplierData);
    }
  });

  // Sort active suppliers by score descending
  ranked.sort((a, b) => b.score - a.score);

  // Assign ranks
  ranked.forEach((s, idx) => {
    s.rank = idx + 1;
    s.explanation = `Rank ${s.rank}: ${s.poCount} POs in 548d (recency: ${s.recencyTier}), contract: ${s.hasContract ? 'yes' : 'no'}, on-time: ${s.onTime}%, quality: ${s.quality}/5.0. Score: ${s.score}`;
  });

  return {
    item_code: itemCode,
    as_of_date: asOfDateStr,
    preferred_suppliers: ranked,
    excluded_suppliers: excluded,
    top_supplier: ranked.length > 0 ? ranked[0] : null
  };
}

function getCategorySuppliers(category, excludeIds = new Set()) {
  return db.suppliers
    .filter(s => {
      if (s.status !== 'Active') return false;
      if (excludeIds.has(s.supplier_id)) return false;
      const cats = s.categories.split(';').map(c => c.trim());
      return cats.includes(category);
    })
    .map(s => {
      const onTime = parseFloat(s.on_time_pct) || 0;
      const quality = parseFloat(s.quality_rating) || 0;
      const catScore = onTime * 0.5 + (quality / 5) * 50;
      return {
        supplier_id: s.supplier_id,
        name: s.name,
        city: s.city,
        onTime,
        quality,
        catScore: Math.round(catScore * 100) / 100
      };
    })
    .sort((a, b) => b.catScore - a.catScore);
}

function getSuggestedSuppliers(itemCode, targetCount = 3, asOfDateStr) {
  const item = db.itemMap[itemCode];
  if (!item) return [];

  const ranking = getSupplierRanking(itemCode, asOfDateStr);
  const preferred = ranking.preferred_suppliers;

  const chosenIds = [];
  const chosenSet = new Set();

  for (const s of preferred) {
    if (chosenIds.length >= targetCount) break;
    chosenIds.push(s.supplier_id);
    chosenSet.add(s.supplier_id);
  }

  // If fewer than needed, top up from Active suppliers in the item's category
  if (chosenIds.length < targetCount && item.category) {
    const categorySuppliers = getCategorySuppliers(item.category, chosenSet);
    for (const cs of categorySuppliers) {
      if (chosenIds.length >= targetCount) break;
      chosenIds.push(cs.supplier_id);
      chosenSet.add(cs.supplier_id);
    }
  }

  return chosenIds;
}

function exportPreferredSuppliersCsv(asOfDateStr = '2026-11-01') {
  const rows = [];
  rows.push(['item_code', 'rank', 'supplier_id', 'reference_price']);

  for (const item of db.items) {
    const ranking = getSupplierRanking(item.item_code, asOfDateStr);
    const top3 = ranking.preferred_suppliers.slice(0, 3);
    for (const s of top3) {
      rows.push([
        item.item_code,
        s.rank,
        s.supplier_id,
        s.refPrice !== null ? s.refPrice.toFixed(2) : ''
      ]);
    }
  }

  return rows.map(r => r.join(',')).join('\n');
}

module.exports = {
  getSupplierRanking,
  getCategorySuppliers,
  getSuggestedSuppliers,
  exportPreferredSuppliersCsv
};
