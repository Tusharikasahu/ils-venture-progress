# ILS Venture Progress & Readiness: prototype

A small working flow for the Idea Lab Sprint team: import a venture record, submit an update, review evidence, see pending requirements and the staff queue, and record level decisions with history. It is preloaded with the three supplied cases (A, B, C) and their mock evidence.

**Live demo (no download):** https://tusharikasahu-blip.github.io/ils-venture-progress/

## Run it locally (about 1 minute, nothing to install)

1. Unzip the folder anywhere, e.g. the Desktop.
2. Open the folder and **double-click `index.html`**. It opens in your browser (Chrome, Edge or Firefox).
3. Type your name in the **Name** box (top right). Every review and decision records it.

**Acting as** (top right) switches between *Programme reviewer* and *Student / venture*. It's a demo toggle, not authentication. **Criteria config** lists the rules by transition, with undefined ranges flagged "needs config".

It works fully offline. Changes are saved in this browser only. To start again, go to **Import / export → Reset to supplied cases**.

*Optional: to serve it instead, run `python -m http.server 8765` in this folder and open http://localhost:8765.*

## Files

| File | What it is |
|---|---|
| `index.html` | The page and its styling |
| `app.js` | All workflow logic: requirement status, money reconciliation, staff queue, decisions |
| `data/seed.js` | **Configuration and data**: criteria (by transition and business model) and the three cases with mock evidence. Edit this to change rules. |
| `data/seed.json` | Same data as plain JSON (configuration/source export) |
| `NOTE.md` | Two-page note: assumptions, data model, unresolved rules, pilot priorities, effort and AI use |

A full JSON export of the config and data is available from **Import / export → Export JSON**.

## Demo path (about 5 minutes)

1. **Staff queue:** reviews first, then clarifications, money to reconcile and follow-ups. It is built from the records, never typed in.
2. **Venture A:** the business model is unresolved, so advancement is blocked. Review update A-01 and **Request changes**: the sign-ups are not confirmed as target-segment, and only one week had 10 or more weekly users.
3. **Venture B:** approve B-E01, B-E02 and B-E03. Collected cash is ₹60,000 (₹40,000 outstanding), not ₹1.6 lakh. The LOI counts as intent only. The imported ₹12 lakh is not added.
4. **Student update:** switch **Acting as → Student**, then submit an update on A with a metric, period, evidence ref, blocker and next action. Switch back to reviewer: it is now in the queue.
5. **Venture C:** the decision history shows direct entry at Level 2 with dates "Not supplied". Earnings of ₹80,000 and a payout of ₹70,000 are reconciled, not added. MSL acceptance can't be recorded before handover.

## Limits (by design for this exercise)

Mock evidence only (IDs, no files). No login, no integrations and no messages. A role switch stands in for access control. Data is held in browser storage and can be exported as JSON. Cost: ₹0.
