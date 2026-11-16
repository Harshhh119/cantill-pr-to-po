function consolidatePOs(decidedRequirements, startCounter = 1) {
  const openPos = [];
  let poCounter = startCounter;

  // Process requirements in order of requirement creation time (first_created)
  for (const dr of decidedRequirements) {
    if (dr.decision !== 'PO') {
      dr.po_id = '';
      continue;
    }

    const reqCreated = dr.req.first_created;
    let qualifyingPo = null;

    for (const po of openPos) {
      if (
        po.supplier_id === dr.supplier_id &&
        po.plant === dr.req.plant &&
        po.route === dr.route
      ) {
        // Raised within 24 hours of the FIRST requirement on that PO (Policy 7.1)
        const diffHours = (reqCreated - po.first_created) / (1000 * 3600);
        if (diffHours >= 0 && diffHours <= 24) {
          qualifyingPo = po;
          break; // joins earliest qualifying open PO (Policy 7.2)
        }
      }
    }

    if (qualifyingPo) {
      dr.po_id = qualifyingPo.po_id;
      qualifyingPo.requirements.push(dr);
    } else {
      const poNum = `PO-${String(poCounter++).padStart(4, '0')}`;
      dr.po_id = poNum;
      openPos.push({
        po_id: poNum,
        supplier_id: dr.supplier_id,
        plant: dr.req.plant,
        route: dr.route,
        first_created: reqCreated,
        requirements: [dr]
      });
    }
  }

  return {
    consolidatedPos: openPos,
    nextCounter: poCounter
  };
}

module.exports = {
  consolidatePOs
};
