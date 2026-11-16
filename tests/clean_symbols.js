const fs = require('fs');

let pol = fs.readFileSync('server/data/defaultPolicy.json', 'utf8');
pol = pol.replace(/₹/g, 'INR ');
fs.writeFileSync('server/data/defaultPolicy.json', pol, 'utf8');

let de = fs.readFileSync('server/engine/decisionEngine.js', 'utf8');
de = de.replace(/₹/g, 'INR ');
fs.writeFileSync('server/engine/decisionEngine.js', de, 'utf8');

let ve = fs.readFileSync('server/engine/valuationEngine.js', 'utf8');
ve = ve.replace(/₹/g, 'INR ');
fs.writeFileSync('server/engine/valuationEngine.js', ve, 'utf8');

console.log('Cleaned currency symbols in policy and engines');
