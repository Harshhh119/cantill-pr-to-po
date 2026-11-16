# DECISIONS.md: Procurement Engine Architecture & Policy Interpretation Rationale

**Company**: Corvo Engineering Pvt Ltd  
**Author**: Full-Stack Engineering Candidate  
**Date**: November 2026  
**Document**: Architectural & Business Rationale for Autonomous PR-to-PO Web Application

---

## 1. Executive Summary

The Corvo Engineering Procurement Policy (v5.0) automates the transition of Purchase Requisitions (PRs) into Purchase Orders (POs) or Sourcing Events (RFQs/RFPs). In industrial manufacturing, procurement policy is a living document: threshold adjustments, category mandates, and plant-specific restrictions are regularly amended. 

To ensure long-term maintainability without technical debt, the application was designed with three foundational principles:
1. **Policy as Data, Not Code**: The decision engine interprets dynamic rule trees stored as versioned JSON entities, enabling instant activation of amendments without code deployment.
2. **Determinism and Auditability**: Every decision captures the precise policy clause, contract reference, PO history, and mathematical rationale.
3. **Pragmatic Business Judgment**: Where the policy was silent or ambiguous in real data scenarios, sensible, defensively sound procurement decisions were implemented and documented below.

---

## 2. Preferred Supplier Ranking Methodology (Policy Section 6)

### 2.1 Criteria & Objectives
Policy 6.1 and 6.2 require ranking active suppliers who have either held a rate contract covering the item or received at least one PO in the preceding 548 days. The ranking determines the recipient of direct **Spot POs (Clause 5.4)** and **Emergency POs (Clause 5.3)**, as well as the priority list for **RFQ/RFP sourcing suggestions (Clause 6.4)**.

### 2.2 Mathematical Scoring Formulation
The ranking formula balances historical engagement volume, recent supplier responsiveness, strategic contractual commitments, and operational performance metrics:

$$\text{Score} = (\text{Recency} \times 30) + (\min(\text{PO\_Count}, 10) \times 5) + (\text{Has\_Contract} \times 15) + (\text{On\_Time\_Pct} \times 0.25) + \left(\frac{\text{Quality}}{5.0} \times 20\right)$$

Where:
* **Recency ($\text{Weight} = 30$)**:
  * $1.0$: Most recent PO within 90 days.
  * $0.5$: Most recent PO within 365 days.
  * $0.0$: Most recent PO between 365 and 548 days.
* **PO Volume ($\text{Weight} = 5$ per PO, capped at 10 POs = 50 pts max)**:
  * Reflects proven execution track record with diminishing marginal utility past 10 orders.
* **Contract Holder Bonus ($+15$ pts)**:
  * Recognizes suppliers that Corvo has negotiated formal terms with (active or historical).
* **On-Time Delivery ($\text{Weight} = 0.25$, up to 25 pts)**:
  * Scaled directly from supplier master on-time percentage ($0$ to $100\%$).
* **Quality Rating ($\text{Weight} = 20$ pts)**:
  * Scaled proportionally from supplier quality score ($1.0$ to $5.0$).

### 2.3 Verification Against Worked Examples
This formula produces exact parity with all three ranking tables published in `Worked_Examples.pdf` (Page 5) as of 1 November 2026:
1. **ITM-1048 (Nitrile Coated Gloves)**:
   * **Rank 1**: S029 (SafeGuard Industrial) — Score: $112.65$ pts (7 POs, Recency 1.0, Contract: Yes, On-time: 81%, Quality: 3.1).
   * **Rank 2**: S030 (Karam Safety) — Score: $81.60$ pts (4 POs, Recency 1.0, Contract: No, On-time: 72%, Quality: 3.4).
   * **Excluded**: S031 (Udyogi Safety Dealer) — Status: Inactive (strictly excluded per Clause 5.7).
2. **ITM-1036 (Pneumatic Cylinder 50x100)**:
   * **Rank 1**: S023 (Hydrax Hydraulics) — Score: $74.05$ pts (2 POs, Recency 1.0, On-time: 74%, Quality: 3.9).
   * **Rank 2**: S022 (Fluidline Hydraulics) — Score: $58.25$ pts (2 POs, Recency 0.5, On-time: 77%, Quality: 3.5).
   * **Rank 3**: S024 (Janatics Dealer Chakan) — Score: $43.65$ pts (1 PO, Recency 0.0, On-time: 89%, Quality: 4.1).
3. **ITM-1016 (MIG Wire ER70S-6 1.2mm)**:
   * **Rank 1**: S009 (Weldtech Supplies) — Score: $74.15$ pts (1 PO, Recency 0.5, Contract: Yes, On-time: 83%, Quality: 4.6).
   * **Rank 2**: S010 (Inox Gases Dealer Pune) — Score: $55.60$ pts (1 PO, Recency 0.5, Contract: No, On-time: 80%, Quality: 3.9).

### 2.4 Reference Price Determination
Per Policy 6.3, reference price is extracted as:
1. Unit price on that supplier's most recent PO in 548 days (tied on date broken by highest `po_number`).
2. If the supplier has no POs in 548 days, the rate in its most recent contract covering the item.

---

## 3. Ambiguities Noticed in Data & Business Decisions Made

### 3.1 Tie-Breaking in Historical PO Price Selection
* **What was noticed**: In `po_history.csv`, on `2026-04-10`, there are two separate POs for item `ITM-1034`:
  * PO `7300215`: plant `CHK1`, unit price `40,929.88`.
  * PO `7300220`: plant `PUN1`, unit price `41,415.60`.
  In Worked Example 11 (`PR-26-00100/1` for plant CHK1), the requirement valuation uses `41,415.60` ($50 \times 41,415.60 = 2,070,780$).
* **Decision**: Historical POs are sorted by `po_date` descending, and tied dates are broken by `po_number` descending. The higher PO number represents the later chronological order. Furthermore, valuation is company-wide across plants per Clause 3.1, so PO `7300220` is the definitive benchmark.
* **Rationale**: Sequential document numbering is standard in ERP databases (SAP/Oracle). Sorting by PO number guarantees deterministic valuation across all runs.

### 3.2 Requirement Value vs PO Execution Price in Spot POs
* **What was noticed**: In Worked Example 6a (`PR-26-00106/1`, 7370 NOS of `ITM-1044`), the requirement was valued at $7370 \times 21.19 = 156,170$ (based on the company-wide most recent PO price of 21.19). However, it was awarded to preferred supplier S027 at its reference price of 21.59 (~₹22).
* **Decision**: In the Section 4 output schema:
  * `group_value_inr` is defined as the *value of the whole requirement* evaluated during the policy valuation step (Clause 3.1: 156,170).
  * `unit_price` represents the contractual purchase price placed on the PO with the supplier (Clause 6.3: 21.59).
* **Rationale**: Procurement policy thresholds (e.g. Spot limit of ₹2,00,000) are evaluated against the *requirement valuation* prior to supplier placement. Preserving the requirement valuation in `group_value_inr` maintains strict compliance auditability.

### 3.3 Requirement Clubbing: Anchor-Based Window
* **What was noticed**: Policy 2.2 states: "A line joins an existing requirement when it is for the same item, for the same plant, was created within 14 calendar days of the requirement's first line, and its need-by date is within 7 days (either side) of the first line's need-by date."
* **Decision**: The requirement's **first line acts as the immutable anchor**. A rolling window (where line 2 extends the window for line 3) is explicitly rejected. Lines must be within 14 calendar days of the anchor line, and within $\pm 7$ days of the anchor line's need-by date.
* **Rationale**: Rolling windows can lead to indefinite aggregation (PR clustering spanning months), which undermines factory delivery schedules. Anchor-based clubbing guarantees deterministic, bounded batches.

### 3.4 Contract Ceiling Exhaustion & Partial Allocations
* **What was noticed**: In Worked Example 3, contract `RC-2026-002` had ₹38,000 remaining ceiling, while the clubbed requirement was worth ₹2,20,256.
* **Decision**: Partial contract splits (e.g. buying ₹38,000 on contract and sourcing the rest) are strictly forbidden by Policy 2.1 (Anti-Splitting) and 4.2 (`consumed_value + requirement_value <= value_cap`). If the entire requirement cannot be fulfilled within the remaining ceiling, the contract is bypassed and quotes are solicited via RFQ/RFP.
* **Rationale**: Enterprise ERP rate contracts are single-line commitments. Bypassing exhausted contracts forces commercial renegotiation or competitive quotes.

### 3.5 PDF-Only Contracts Signed After Register Update
* **What was noticed**: Contracts `RC-2026-031` (signed 2026-11-15) and `RC-2026-033` (signed 2026-11-20) were present only as signed PDF documents in `contracts/pdf/`.
* **Decision**: Built-in PDF ingestion extracts supplier terms, ceilings, and Schedule A rate lines. As specified in Policy 4.2 & 4.4, contracts signed after the October 31 update start with a consumed ceiling of ₹0.
* **Rationale**: Ensures that newly executed rate contracts immediately protect capital and prevent redundant sourcing events.

### 3.6 Sourcing Suggestion Top-Up Algorithm
* **What was noticed**: Policy 6.4 states: "If it has fewer suppliers than needed (3 or 5), add other Active suppliers that list the item's category in the supplier master, best delivery and quality record first."
* **Decision**: For category top-up suppliers, composite score is computed as:
  $$\text{Category\_Score} = (\text{On\_Time\_Pct} \times 0.5) + \left(\frac{\text{Quality}}{5.0} \times 50\right)$$
  Candidate suppliers are filtered to Active status and sorted descending by this score.
* **Rationale**: Produces the exact supplier suggestion sequences documented in Worked Examples 3 (`S014;S013;S016`), 9 (`S043;S044;S042`), 10 (`S003;S002;S005`), 11 (`S020;S017;S019;S018`), and 12 (`S045;S047;S020;S048;S046`).

### 3.7 Free-Text Requisition Matching & Anti-Hallucination
* **What was noticed**: Requesters enter colloquial short forms like `"brg 6308 ZZ for maintenance"`, `"hyd hose 1/2 inch"`, `"vci bag 600x900"`.
* **Decision**: Multi-tier matching pipeline:
  1. Exact item code lookup.
  2. Synonym and abbreviation normalizer (`brg` $\to$ `ball bearing`, `hyd hose` $\to$ `hydraulic hose`, `welding rod` $\to$ `welding electrode`).
  3. Noise word stripper (`urgent`, `for maintenance`, `as per sample`).
  4. Token overlap similarity (threshold $\ge 0.4$).
  5. If no match exceeds threshold, the item is tagged `NEW`.
* **Rationale**: The assistant never invents or guesses catalog item codes. Uncatalogued items route strictly to `NEW_ITEM_SOURCING` (Policy 1.2) valued at requester estimate.

---

## 4. PO Consolidation Rules (Policy Section 7)

Requirements ending in a PO are consolidated into a multi-line PO when:
1. Same supplier ID.
2. Same plant (PUN1 or CHK1).
3. Same route (`CONTRACT_PO`, `SPOT_PO`, `EMERGENCY_PO`).
4. Raised within 24 hours of the first requirement assigned to that PO.

Sourcing requests (`RFQ`, `RFP`, `CAPEX_SOURCING`, `NEW_ITEM_SOURCING`) are never consolidated and receive no `po_id`.

---

## 5. Summary Table of Verified Worked Examples

| Example | PR Reference | Item | Route | Supplier | Value (INR) | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Contract PO** | PR-26-00019/1 | ITM-1002 | CONTRACT_PO | S001 | 137,531 | **100% Match** |
| **2. PDF Contract** | PR-26-00045/1 | ITM-1037 | CONTRACT_PO | S021 | 26,829 | **100% Match** |
| **3. Ceiling Exhausted** | PR-26-00004/1 | ITM-1022 | RFQ | S014;S013;S016 | 220,256 | **100% Match** |
| **4. Two Contracts** | PR-26-00034/1 | ITM-1009 | CONTRACT_PO | S007 | 32,547 | **100% Match** |
| **5. Clubbed PRs** | PR-26-00146/1 | ITM-1038 | SPOT_PO | S024 | 126,472 | **100% Match** |
| **6a. Plant Separation** | PR-26-00106/1 | ITM-1044 | SPOT_PO | S027 | 156,170 | **100% Match** |
| **6b. Plant Separation** | PR-26-00103/1 | ITM-1044 | SPOT_PO | S027 | 137,311 | **100% Match** |
| **7. Free Text Item** | PR-26-00088/1 | ITM-1035 | SPOT_PO | S023 | 97,955 | **100% Match** |
| **8. Emergency PO** | PR-26-00059/1 | ITM-1026 | EMERGENCY_PO | S014 | 253,184 | **100% Match** |
| **9. RFQ Over Limit** | PR-26-00089/1 | ITM-1066 | RFQ | S043;S044;S042 | 336,562 | **100% Match** |
| **10. Small Unproven** | PR-26-00050/1 | ITM-1006 | RFQ | S003;S002;S005 | 80,300 | **100% Match** |
| **11. RFP High Value** | PR-26-00100/1 | ITM-1034 | RFP | S020;S017;S019;S018 | 2,070,780 | **100% Match** |
| **12. Capex Item** | PR-26-00047/1 | ITM-1071 | CAPEX_SOURCING | S045;S047;S020;S048;S046 | 6,036,704 | **100% Match** |
| **13. New Item** | PR-26-00170/1 | NEW | NEW_ITEM_SOURCING | None | 141,100 | **100% Match** |
| **14. Consolidation** | PR-26-00034/1 | ITM-1009 | CONTRACT_PO | S007 (PO-0003) | Consolidated | **100% Match** |
