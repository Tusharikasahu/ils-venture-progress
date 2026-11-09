# ILS Venture Progress & Readiness: note
Tusharika Sahu · Tech Associate assignment · Mesa School of Business

## 1. What I built
A browser-based prototype (plain HTML/JS, no install) that runs the five required steps on the three supplied cases: import with unknowns preserved → short update → reviewer approve / request changes (who, when, why) → current level, pending requirements and staff queue → level decisions with history, including direct entry.

## How I approached it
1) Read the rules first and listed every one (e.g. "a claim is not proof", "don't add earnings and payout"), since judgment carries 50%. 2) Found the trap in each case: A tests trusting an unverified number, B tests double-counting money and treating an LOI as revenue, C tests inventing dates and assuming eligible = accepted. 3) Designed the data model before any screen. 4) Built the smallest flow covering the five steps, with no auth, messaging or integrations. 5) Tested each case against the expected answer. 6) Wrote down unclear rules instead of guessing.

## 2. Key assumptions & judgment calls
- **Unknown stays unknown.** Missing fields are stored as `null` and shown as "Unknown". A submitted claim is "Claimed · unreviewed", never "met".
- **Imported decisions are preserved, not recomputed.** "Eligible for MSL" (B, C) is kept with its provenance. The system cannot re-certify it or erase it, and "not fundraising" (C) or "grants only" (B) does not affect it.
- **Separate fields** for development stage, programme level, readiness, advancement decision, fundraising preference, MSL handover and MSL acceptance. Acceptance cannot be recorded before handover.
- **Criteria attach to the business model**, not the "AI/Product" sector label. A and B have unresolved models, so candidate-model criteria are shown, advancement is blocked, and the queue asks an owner to clarify.
- **Case A:** 32 sign-ups ≠ 32 *target-segment* sign-ups (segment not recorded). WAU 12 then 8 = only one week at ≥10, so the bar is not met even if verified. Correct action: request changes.
- **Case B:** invoice ₹1,00,000 + receipt ₹60,000 against it = **₹60,000 collected, ₹40,000 outstanding**, not ₹1.6L. The invoice is marked "unpaid" despite a receipt, which is flagged to reconcile. The LOI is intent only (not revenue, not a pilot). Services and SaaS are tracked as separate lines. The relationship to the imported ₹12 lakh is unknown, so it is not added.
- **Case C:** streaming ₹80,000 earned (Sept) vs ₹70,000 paid out (5 Oct) are **reconciled, not added**. The ₹10,000 gap is flagged, and the October payout is not October revenue. The sponsorship invoice has unknown payment, so it is not counted as collected. Direct entry at Level 2 is recorded with decision date and reviewer "Not supplied".
- **Chosen money metric** for criteria is *collected cash from reviewed records*. Billed and earned amounts are shown alongside but never summed with their payments.
- **No supplied case qualifies for advancement** from its evidence, so the demo shows the guard blocking it (and why). C's direct entry at Level 2 is the recorded transition. Making a case advance would have meant inventing evidence.
- **Advancement is immediate** once all applicable requirements are verified and a reviewer records approval. There is no waiting rule, and earlier levels are not required (direct entry needs a stated prior-work basis).

## 3. Workflow & data model
`Venture` (imported record + separate decision fields) · `Criterion` (config: transition, model, target, needsConfig) · `Update` (lines of criterion + claimed/verified value, period, evidence refs, blocker, next action, status, reviews[]) · `Evidence` (type, business line, amount, period, link to invoice/statement, status, reviews[]) · `Decision` (type, from → to, basis, decided by, decision date, provenance, recorded at/by).
Requirement status is **derived**: Unknown → Claimed → Changes requested / Verified met / Verified not met / Needs config. The staff queue is also derived (reviews → clarifications → reconciliations → follow-ups), so it never goes stale.

## 4. Unresolved rules (flagged for configuration, not invented)
MSL Services ranges (10–20 customers, ₹2 lakh+ over what period, 30–40% retention window, what "organised delivery" means). AI B2B MSL: 1–2 customers, completed vs scoped pilots, proof of willingness to pay. Whether "cumulative revenue" means billed or collected. What a valid "target-segment" tag looks like for sign-ups.

**Discovery questions:** Who confirms a venture's business model? Can a venture hold two models (B)? Should partial evidence approval be per line? Which tracker columns map to which transition?

## 5. Where the rest would fit (not built)
- **Access control:** roles (student / mentor / reviewer / programme owner) gate the existing buttons; students see only their venture. The demo uses a role toggle.
- **Mentor pre/post-work:** a mentor check-in becomes an `Update` with a mentor goal and agreed actions, which feeds the same queue (e.g. C's 12 Oct meeting with no outcome recorded).
- **MSL handover:** already a separate decision type. In production it would generate a handover pack (evidence + decision history) for MSL to accept or decline.

## 6. Persistence vs mocks · costs · dependencies
Persistence is browser localStorage plus JSON export/import. All evidence is mock (IDs only, no files). No integrations (Shopify etc.), no auth, no messaging. **Cost: ₹0**, no dependencies. Production path: the same data model on Airtable/Supabase/Google Sheets with a form for students.

## 7. Paid pilot priorities
1) Map the real tracker into this model with ILS staff and confirm the open rules. 2) Student update form plus reviewer queue, used for 2–3 weeks with live ventures. 3) Evidence file upload and per-line approval. 4) Roles/auth. 5) MSL handover pack.

## 8. Effort & AI use
Actual time: **~5.5 hours** of work, spread over 2–3 sittings.
AI use: I set the direction, the rule interpretations and each case's handling, and checked the outputs. Claude Code wrote the code and helped draft this note.
