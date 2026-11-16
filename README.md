# Corvo ProcureAI: Policy-Driven PR-to-PO Web Application

[![Tests Status](https://img.shields.io/badge/Tests-29%2F29%20Passing-emerald)](tests/run_tests.js)
[![Policy Version](https://img.shields.io/badge/Policy-v5.0%20Active-blue)](server/data/defaultPolicy.json)
[![Docker Support](https://img.shields.io/badge/Docker-Ready-cyan)](docker-compose.yml)

An autonomous, full-stack procurement decision engine and interactive web application built for **Corvo Engineering Pvt Ltd**. Automates the transition of factory Purchase Requisitions (PRs) into Purchase Orders (POs) or Sourcing Events (RFQs/RFPs) by evaluating versioned enterprise procurement policies without code changes.

Built for the **Cantill.ai Full-Stack Intern Task**.

---

## 🚀 Quick Start (Local Run)

You can run the application locally using either **Docker Compose** or standard **Node.js**.

### Option A: One-Command Docker Run (Recommended)
```bash
# Clone the repository
git clone <your-repo-link>
cd cantill-pr-to-po

# Start containerized application
docker compose up --build
```
Open **[http://localhost:5000](http://localhost:5000)** in your browser.

---

### Option B: Local Node.js Execution
Requires **Node.js 20+** and **npm**.

```bash
# 1. Install root & server dependencies
npm install

# 2. Install client dependencies & build static UI
cd client && npm install && npm run build && cd ..

# 3. Start the unified production server
npm start
```
Open **[http://localhost:5000](http://localhost:5000)** in your browser.

---

## 🧪 Run Automated Verification Tests
Run the deterministic assertion test suite verifying item matching, preferred supplier math, all 14 worked examples, and policy amendments:

```bash
npm test
```

Sample output:
```text
====================================================
🧪 RUNNING CORVO PR-TO-PO COMPREHENSIVE TEST SUITE
====================================================
--- Test Suite 1: Item Matching ---
✅ PASS: Exact Code Lookup (ITM-1002)
✅ PASS: Free text with abbreviation "brg 6308 ZZ for maintenance"
✅ PASS: Free text "hyd hose 1/2 inch 2 wire"
✅ PASS: Free text "eot crane 5 ton"
✅ PASS: Novel / Unknown item resolved as NEW without hallucinating

--- Test Suite 2: Preferred Supplier Ranking ---
✅ PASS: ITM-1048 Nitrile gloves ranking as of 2026-11-01
✅ PASS: ITM-1036 Pneumatic cylinder ranking as of 2026-11-01
✅ PASS: ITM-1016 MIG wire ranking as of 2026-11-01

--- Test Suite 3: Sourcing Suggestions ---
✅ PASS: Example 3 (ITM-1022): Top 3 suggested suppliers (S014, S013, S016)
✅ PASS: Example 9 (ITM-1066): Top 3 suggested suppliers (S043, S044, S042)
✅ PASS: Example 10 (ITM-1006): Top 3 suggested suppliers (S003, S002, S005)
✅ PASS: Example 11 (ITM-1034): RFP 5 suggested suppliers (S020, S017, S019, S018)
✅ PASS: Example 12 (ITM-1071): Capex 5 suggested suppliers (S045, S047, S020, S048, S046)

--- Test Suite 4: 14 Worked Examples Verification ---
✅ PASS: Example 1: Contract PO (PR-26-00019/1) -> CONTRACT_PO to S001 (INR 1,37,531)
✅ PASS: Example 2: PDF-only contract (PR-26-00045/1) -> CONTRACT_PO to S021 (INR 26,829)
✅ PASS: Example 3: Ceiling nearly used (PR-26-00004/1) -> RFQ (INR 2,20,256)
✅ PASS: Example 4: Two contracts for same item (PR-26-00034/1) -> CONTRACT_PO to S007
✅ PASS: Example 5: Split PRs clubbed into one (PR-26-00146/1) -> SPOT_PO to S024 (INR 1,26,472)
✅ PASS: Example 6a: Not clubbed due to plant PUN1 (PR-26-00106/1) -> SPOT_PO to S027 (INR 1,56,170)
✅ PASS: Example 6b: Not clubbed due to plant CHK1 (PR-26-00103/1) -> SPOT_PO to S027
✅ PASS: Example 7: Free-text item matched (PR-26-00088/1) -> SPOT_PO to S023 (INR 97,955)
✅ PASS: Example 8: Emergency PO (PR-26-00059/1) -> EMERGENCY_PO to S014 (INR 2,53,184)
✅ PASS: Example 9: RFQ above PO limit (PR-26-00089/1) -> RFQ (INR 3,36,562)
✅ PASS: Example 10: RFQ small but never bought (PR-26-00050/1) -> RFQ (INR 80,300)
✅ PASS: Example 11: RFP (PR-26-00100/1) -> RFP (INR 20,70,780)
✅ PASS: Example 12: Capex (PR-26-00047/1) -> CAPEX_SOURCING (INR 60,36,704)
✅ PASS: Example 13: New item (PR-26-00170/1) -> NEW_ITEM_SOURCING (INR 1,41,100)
✅ PASS: Example 14: Several requirements consolidated on one PO -> PO-0003

--- Test Suite 5: Policy as Data Dynamic Amendment ---
✅ PASS: Policy Amendment: Increase spot limit to 3,00,000 for plant CHK1

====================================================
🏁 TEST RESULTS: 29 / 29 TESTS PASSED
====================================================
```

---

## 🌟 Core Features & Compliance Highlights

### 1. Conversational Chat Intake (Not Forms)
* Requesters type requests such as: *"Need 200 nitrile gloves for Chakan by next Friday"*.
* Slot-filling assistant extracts Item, Quantity, Plant (PUN1/CHK1), Need-by Date, and Urgency.
* Asks clear follow-ups for missing slots and shows an interactive confirmation card before PR creation.
* Robust matching handles colloquial factory phrasing (`brg`, `hyd hose`, `welding rod`) without inventing catalog items (unknown items tag as `NEW`).

### 2. Policy as Data (Zero Code Change Policy Amendments)
* Rules, limits, precedence order, and conditions are stored as versioned JSON entities (`v5.0` active initially).
* Procurement managers can upload an amendment document (PDF/text) or describe changes in chat (e.g., *"For plant CHK1, spot limit is 3,00,000 effective 2026-11-20"*).
* System automatically extracts parameters, renders a side-by-side structured rule diff with plain-language summary, and activates the version upon approval.

### 3. Transparent Preferred Supplier Ranking (Policy Section 6)
* Evaluates active suppliers over a 548-day window using the formula:
  $$\text{Score} = (\text{Recency} \times 30) + (\min(\text{PO\_Count}, 10) \times 5) + (\text{Has\_Contract} \times 15) + (\text{On\_Time\_Pct} \times 0.25) + \left(\frac{\text{Quality}}{5.0} \times 20\right)$$
* Generates Top 3 CSV export as of any chosen date: `item_code,rank,supplier_id,reference_price`.

### 4. Buyer Workspace & Compliance Audit Trail
* Requirements dashboard displaying clubbed PR lines, automated decision, requirement value, and exact policy reasoning clause.
* **Single Obvious Next Action**: One-click **Approve** (issues PO/RFQ) or **Override** (requires mandatory written justification, logged in immutable audit trail per Policy 8.1).

### 5. PDF Rate Contract Ingestion
* Ingests signed contract PDFs (such as `RC-2026-031` and `RC-2026-033`), automatically extracting suppliers, validity dates, ceilings, and Schedule A rate lines.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/process-batch` | Processes PR batch CSV (file upload or raw CSV) into clubbed requirements & decisions |
| `GET` | `/api/export-decisions` | Downloads Section 4 decisions CSV (`pr_no,pr_line,resolved_item_code,group_id,po_id,decision,route,supplier_id,unit_price,group_value_inr,suggested_supplier_ids,policy_version,reason`) |
| `GET` | `/api/preferred-suppliers` | Returns ranked suppliers with score breakdown for a given item and as-of date |
| `GET` | `/api/export-preferred-suppliers` | Downloads Top 3 preferred suppliers CSV as of chosen date |
| `GET` | `/api/requirements` | Lists requirements for Buyer Workspace |
| `POST` | `/api/requirements/:id/approve` | One-click buyer approval |
| `POST` | `/api/requirements/:id/override` | Buyer override with mandatory comment |
| `GET` | `/api/policies` | Lists all policy versions |
| `POST` | `/api/policies/propose-amendment`| Ingests amendment text or PDF, produces diff |
| `POST` | `/api/policies/:version/activate`| Activates proposed policy version |
| `POST` | `/api/contracts/upload-pdf` | Ingests signed contract PDF |
| `POST` | `/api/chat/intake` | Conversational slot-filling PR intake endpoint |

---

## 📁 Repository Directory Structure

```text
cantill-pr-to-po/
├── client/                     # Vite + React 19 Frontend
│   ├── src/
│   │   ├── components/         # ChatIntake, BuyerWorkspace, PolicyStudio, PreferredSuppliers, etc.
│   │   ├── App.jsx             # Main Navigation & State Shell
│   │   └── index.css           # Tailwind CSS v4 Styles
│   └── package.json
├── data/                       # Kit Raw Data
│   ├── master_data/            # item_master, supplier_master, po_history, plants
│   ├── contracts/              # contract_register.csv, contract_lines.csv, pdf/
│   └── pr_batches/             # sample_pr_batch.csv (186 lines)
├── server/                     # Backend API & Engine
│   ├── engine/                 # itemMatcher, clubbingEngine, valuationEngine, decisionEngine, etc.
│   ├── policy/                 # policyManager & defaultPolicy.json (v5.0)
│   ├── chat/                   # intakeAssistant (Conversational slot-filler)
│   ├── routes/                 # Express REST Endpoints
│   ├── db.js                   # In-memory synchronized data store
│   └── index.js                # Server entry point
├── submission/                 # Submission CSV Outputs for Blind Test
│   ├── run1_decisions_v5.0.csv
│   ├── preferred_suppliers_2026-11-01.csv
│   └── run2_decisions_amended.csv
├── tests/                      # Deterministic Automated Test Suite
│   └── run_tests.js            # 29 verification tests
├── DECISIONS.md                # In-depth Rationale for Data Ambiguities & Mathematical Formulas
├── APPROACH.md                 # System Architecture & AI Tooling Disclosure
├── Dockerfile                  # Multi-stage production container build
├── docker-compose.yml          # One-command compose configuration
└── README.md
```

---

## 🌐 Hosted Deployment Instructions

The application is fully containerized and runs on any cloud host (Render, Railway, Fly.io, Vercel, or AWS ECS):

### Deploy to Render
1. Push this repository to GitHub as a public repository.
2. In Render Dashboard, click **New +** $\to$ **Web Service**.
3. Select the repository.
4. Set Environment to **Docker** (it will auto-detect `Dockerfile`).
5. Click **Create Web Service**. Render will build and host it at a public `https://<app-name>.onrender.com` link.

---

## 📝 Blind Test Execution Plan

1. **Run 1 (Thu 19 Nov, 10:00 AM IST)**:
   * Upload the new PR batch CSV via `POST /api/process-batch` under Policy `v5.0`.
   * Export decisions CSV to `submission/run1_decisions_v5.0.csv`.
2. **Run 2 (Thu 19 Nov, 10:00 AM IST)**:
   * Upload the policy amendment document via the **Policy Studio** tab.
   * Review the plain-language diff and click **Approve & Activate**.
   * Reprocess the batch and export decisions CSV to `submission/run2_decisions_amended.csv`.
   * Export preferred suppliers CSV as of the provided date to `submission/preferred_suppliers_<date>.csv`.
3. **Submission**:
   * Commit and push the 3 CSV files into the `submission/` folder before 12:00 noon IST.
