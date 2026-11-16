const db = require('../db');

function normalizeText(s) {
  return (s || '')
    .toLowerCase()
    .replace(/["'()\-,\/\\_]/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SYNONYMS = [
  { pattern: /\btaper roller brg\b/g, replacement: 'taper roller bearing' },
  { pattern: /\bbrg\b/g, replacement: 'ball bearing' },
  { pattern: /\bhose\b/g, replacement: 'hydraulic hose' },
  { pattern: /\bpneu\b/g, replacement: 'pneumatic' },
  { pattern: /\bwelding rod\b/g, replacement: 'welding electrode' },
  { pattern: /\bmonitor 24\b/g, replacement: '24 inch monitor' },
  { pattern: /\blaptop i5\b/g, replacement: 'laptop i5 16gb 512gb' },
  { pattern: /\bhyd hose\b/g, replacement: 'hydraulic hose' },
  { pattern: /\bfrl\b/g, replacement: 'frl unit' }
];

const NOISE_WORDS = ['urgent', 'as per sample', 'for maintenance', 'required', 'needed', 'please arrange'];

function cleanQuery(text) {
  let cleaned = normalizeText(text);
  for (const noise of NOISE_WORDS) {
    cleaned = cleaned.replace(new RegExp('\\b' + noise + '\\b', 'g'), ' ');
  }
  for (const syn of SYNONYMS) {
    cleaned = cleaned.replace(syn.pattern, syn.replacement);
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

function matchItem(itemCode, description) {
  // 1. Direct code lookup
  if (itemCode && db.itemMap[itemCode]) {
    const item = db.itemMap[itemCode];
    return {
      resolved_item_code: item.item_code,
      item: item,
      confidence: 1.0,
      matched_by: 'CODE_EXACT'
    };
  }

  if (!description || description.trim() === '') {
    return {
      resolved_item_code: 'NEW',
      item: null,
      confidence: 0.0,
      matched_by: 'NONE'
    };
  }

  const normDesc = normalizeText(description);
  const cleanedDesc = cleanQuery(description);

  // 2. Exact match against item master description
  for (const it of db.items) {
    const itNorm = normalizeText(it.description);
    if (itNorm === normDesc || itNorm === cleanedDesc) {
      return {
        resolved_item_code: it.item_code,
        item: it,
        confidence: 0.98,
        matched_by: 'DESCRIPTION_EXACT'
      };
    }
  }

  // 3. Substring inclusion match
  for (const it of db.items) {
    const itNorm = normalizeText(it.description);
    if (cleanedDesc.includes(itNorm) || itNorm.includes(cleanedDesc)) {
      return {
        resolved_item_code: it.item_code,
        item: it,
        confidence: 0.90,
        matched_by: 'DESCRIPTION_SUBSTRING'
      };
    }
  }

  // 4. Token overlap scoring
  const queryTokens = cleanedDesc.split(' ').filter(t => t.length > 1 && !['inch', 'for', 'the', 'and', 'with', 'nos', 'kg', 'ltr'].includes(t));
  let bestItem = null;
  let bestScore = 0;

  for (const it of db.items) {
    const itTokens = normalizeText(it.description).split(' ').filter(t => t.length > 1);
    let matchCount = 0;
    for (const t of queryTokens) {
      if (itTokens.includes(t)) matchCount++;
    }
    const score = matchCount / Math.max(queryTokens.length, itTokens.length);
    if (matchCount >= 2 && score > bestScore) {
      bestScore = score;
      bestItem = it;
    }
  }

  if (bestScore >= 0.4 && bestItem) {
    return {
      resolved_item_code: bestItem.item_code,
      item: bestItem,
      confidence: Math.round(bestScore * 100) / 100,
      matched_by: 'FUZZY_TOKEN'
    };
  }

  // Not matched -> NEW item (never hallucinate / invent items!)
  return {
    resolved_item_code: 'NEW',
    item: null,
    confidence: 0.0,
    matched_by: 'NEW_ITEM'
  };
}

module.exports = {
  matchItem,
  normalizeText,
  cleanQuery
};
