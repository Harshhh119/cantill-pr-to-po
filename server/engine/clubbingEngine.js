const { matchItem } = require('./itemMatcher');

function clubPrLines(prLines, existingRequirementCounter = 1) {
  // 1. Resolve item code and parse dates
  const parsedLines = prLines.map((l, idx) => {
    const match = matchItem(l.item_code, l.description);
    const createdDate = new Date(l.created_at.replace(' ', 'T') + (l.created_at.includes(':00') ? 'Z' : ':00Z'));
    const needByDate = new Date(l.need_by_date + 'T00:00:00Z');
    const qty = parseFloat(l.quantity) || 0;
    const estPrice = parseFloat(l.estimated_unit_price) || 0;

    return {
      ...l,
      input_index: l.input_index !== undefined ? l.input_index : idx,
      resolved_item_code: match.resolved_item_code,
      item: match.item,
      confidence: match.confidence,
      matched_by: match.matched_by,
      createdDate,
      needByDate,
      qty,
      estPrice
    };
  });

  // Sort PR lines strictly in order of creation time, then pr_no, then pr_line (Policy 2.2)
  parsedLines.sort((a, b) => {
    if (a.createdDate - b.createdDate !== 0) return a.createdDate - b.createdDate;
    if (a.pr_no !== b.pr_no) return a.pr_no.localeCompare(b.pr_no);
    return parseInt(a.pr_line || 1) - parseInt(b.pr_line || 1);
  });

  // 2. Clubbing into requirements
  const requirements = [];
  let reqCounter = existingRequirementCounter;

  for (const line of parsedLines) {
    if (line.resolved_item_code === 'NEW') {
      // Clause 1.2: A line that matches no item master item is a new item.
      // It is never clubbed with other lines.
      const reqId = `REQ-${String(reqCounter++).padStart(4, '0')}`;
      requirements.push({
        group_id: reqId,
        requirement_date: line.created_at.split(' ')[0],
        first_created: line.createdDate,
        first_need_by: line.needByDate,
        resolved_item_code: 'NEW',
        item: null,
        plant: line.plant,
        is_emergency: line.urgency === 'Emergency',
        first_line: line,
        lines: [line]
      });
      continue;
    }

    // Check if can join an existing requirement (Policy 2.2)
    // - Same item
    // - Same plant
    // - Created within 14 calendar days of requirement's first line (<= 14 days)
    // - Need-by date within 7 days (either side) of first line's need-by date (<= 7 days)
    // - Joins the earliest if multiple qualify
    let joined = false;
    for (const req of requirements) {
      if (req.resolved_item_code === line.resolved_item_code && req.plant === line.plant) {
        const createdDiffDays = (line.createdDate - req.first_created) / (1000 * 24 * 3600);
        const needByDiffDays = Math.abs((line.needByDate - req.first_need_by) / (1000 * 24 * 3600));

        if (createdDiffDays >= 0 && createdDiffDays <= 14 && needByDiffDays <= 7) {
          req.lines.push(line);
          if (line.urgency === 'Emergency') {
            req.is_emergency = true;
          }
          joined = true;
          break; // joins earliest qualifying
        }
      }
    }

    if (!joined) {
      const reqId = `REQ-${String(reqCounter++).padStart(4, '0')}`;
      requirements.push({
        group_id: reqId,
        requirement_date: line.created_at.split(' ')[0],
        first_created: line.createdDate,
        first_need_by: line.needByDate,
        resolved_item_code: line.resolved_item_code,
        item: line.item,
        plant: line.plant,
        is_emergency: line.urgency === 'Emergency',
        first_line: line,
        lines: [line]
      });
    }
  }

  // Calculate totals for each requirement
  requirements.forEach(req => {
    req.total_quantity = req.lines.reduce((sum, l) => sum + l.qty, 0);
  });

  return {
    requirements,
    nextCounter: reqCounter
  };
}

module.exports = {
  clubPrLines
};
