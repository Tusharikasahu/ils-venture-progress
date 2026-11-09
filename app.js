/* ILS Venture Progress & Readiness: prototype
 * Plain JS, no build step. State lives in localStorage (browser) and can be exported/imported as JSON.
 * Core principles encoded here:
 *  - null = unknown. A submitted claim is never treated as reviewed proof.
 *  - Imported programme decisions ("Eligible for MSL") are preserved with provenance, never recomputed or erased.
 *  - Money: invoice ≠ payment, earning ≠ payout. Linked records are reconciled, never added together.
 *  - Every review and level decision keeps who, when and why.
 */
const KEY = "ils-venture-progress-v1";
const CFG = window.CONFIG;
let S = load();
let role = "reviewer";

// ---------- persistence ----------
function fresh() { return JSON.parse(JSON.stringify(window.SEED)); }
function load() { try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {} return fresh(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} render(); }
function resetDemo() { if (confirm("Reset to the three supplied cases? Local changes will be lost.")) { S = fresh(); save(); } }
function exportJSON() {
  const blob = new Blob([JSON.stringify({ config: CFG, data: S }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ils-export.json"; a.click();
}
function importFile(input) {
  const f = input.files[0]; if (!f) return;
  f.text().then(t => { const j = JSON.parse(t); S = j.data || j; save(); toast("Imported " + f.name); }).catch(e => alert("Invalid JSON: " + e.message));
}

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const U = v => (v === null || v === undefined || v === "") ? `<span class="unk">Unknown</span>` : esc(v);
const inr = n => n === null || n === undefined ? "Unknown" : "₹" + Number(n).toLocaleString("en-IN");
// One local-time source for every timestamp (reviews, updates, decisions) so history sorts and reads consistently.
const localISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); };
const now = () => localISO().slice(0, 16).replace("T", " ");
const reviewer = () => ($("#reviewerName")?.value || "").trim();
const V = id => S.ventures.find(v => v.id === id);
const crit = id => CFG.criteria.find(c => c.id === id);
const critLabel = id => crit(id)?.label ?? `Unknown criterion "${id}" (not in config)`;
// Parse a metric for a criterion. Returns {ok, v}. Rejects "12 users", "abc" etc. instead of storing NaN.
function parseMetric(c, raw) {
  const s = String(raw ?? "").trim();
  if (c.unit === "yes/no") { if (/^(y|yes|true|1)$/i.test(s)) return { ok: true, v: true }; if (/^(n|no|false|0)$/i.test(s)) return { ok: true, v: false }; return { ok: false }; }
  const n = Number(s.replace(/[₹,\s]/g, ""));
  return s !== "" && Number.isFinite(n) && n >= 0 ? { ok: true, v: n } : { ok: false };
}
const fmtVal = (c, v) => v === null || v === undefined ? "–" : c.unit === "INR" ? inr(v) : c.unit === "yes/no" ? (v ? "Yes" : "No") : v;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2200); }
function nextId(prefix, list) { let n = list.filter(x => x.id.startsWith(prefix)).length + 1; while (list.some(x => x.id === prefix + String(n).padStart(2, "0"))) n++; return prefix + String(n).padStart(2, "0"); }

// ---------- evidence ledger (per business line; reviewed vs all) ----------
function ledger(vid) {
  const ev = S.evidence.filter(e => e.ventureId === vid);
  const lines = {};
  const L = n => lines[n] ??= { billed: [0, 0], collected: [0, 0], earned: [0, 0], received: [0, 0], lois: [0, 0], notes: [] };
  for (const e of ev) {
    const l = L(e.line || "Unassigned"), ok = e.status === "approved";
    const add = (k, x) => { l[k][1] += x; if (ok) l[k][0] += x; };
    if (e.kind === "invoice") add("billed", e.amount);
    if (e.kind === "receipt") add("collected", e.amount);
    if (e.kind === "earning") add("earned", e.amount);
    if (e.kind === "payout") add("received", e.amount);
    if (e.kind === "loi") add("lois", 1);
  }
  // reconciliation notes
  for (const e of ev) {
    const l = L(e.line || "Unassigned");
    if (e.kind === "invoice") {
      const paid = ev.filter(r => r.kind === "receipt" && r.against === e.id).reduce((s, r) => s + r.amount, 0);
      if (paid && /unpaid/i.test(e.detail)) l.notes.push(`${e.id}: invoice is marked unpaid but a linked receipt exists. Reconcile the invoice status (partially paid).`);
      l.notes.push(paid ? `${e.id}: ${inr(paid)} of ${inr(e.amount)} collected via linked receipt. Outstanding ${inr(e.amount - paid)}. Invoice and receipt are one revenue, not two.`
        : `${e.id}: ${inr(e.amount)} billed, payment ${/unpaid/i.test(e.detail) ? "marked unpaid" : "unknown"}. Not counted as collected or as a paying customer.`);
    }
    if (e.kind === "earning") {
      const got = ev.filter(r => r.kind === "payout" && r.against === e.id).reduce((s, r) => s + r.amount, 0);
      l.notes.push(got ? `${e.id}: earned ${inr(e.amount)} (${e.period}); ${inr(got)} paid out later. Gap ${inr(e.amount - got)} to reconcile. Do not add earnings and payout; payout is not new revenue for the payout month.`
        : `${e.id}: earned ${inr(e.amount)}; no payout linked yet.`);
    }
    if (e.kind === "loi") l.notes.push(`${e.id}: documented intent only. Not revenue, payment, or a completed pilot.`);
  }
  return lines;
}

// value derivable from REVIEWED evidence (only where the mapping is unambiguous)
function derived(v, c) {
  const lg = ledger(v.id);
  if (/Signed LOIs/.test(c.label)) { const n = Object.values(lg).reduce((s, l) => s + l.lois[0], 0); return n ? { v: n, src: "reviewed LOIs" } : null; }
  if (c.unit === "INR" && c.model === "Services" && lg.Services) { const n = lg.Services.collected[0]; return n ? { v: n, src: "reviewed collected cash (Services line only; imported totals with unknown period excluded)" } : null; }
  return null;
}

// ---------- requirement status ----------
// returns {s: unknown|claimed|changes|met|notmet|config, text}
function reqStatus(v, c) {
  if (c.needsConfig && (c.target === null)) return { s: "config", text: "Needs configuration: " + c.needsConfig };
  const lines = S.updates.filter(u => u.ventureId === v.id).flatMap(u => u.lines.filter(l => l.criterionId === c.id).map(l => ({ u, l })))
    .sort((a, b) => a.u.submittedAt < b.u.submittedAt ? 1 : -1);
  const d = derived(v, c);
  const latest = lines[0];
  // A verified result stands until a newer update is itself approved. A newer claim (or a changes request on it) is shown alongside, never replaces it.
  const approved = lines.find(x => x.u.status === "approved");
  const newer = latest && latest !== approved ? latest : null;
  const newerTxt = newer ? `. Newer claim ${fmtVal(c, newer.l.claimed)} (${newer.u.id}) ${newer.u.status === "changes" ? "has changes requested" : "awaiting review"}` : "";
  if (approved) {
    const val = approved.l.verified ?? approved.l.claimed;
    const met = c.unit === "yes/no" ? val === true : Number.isFinite(val) && val >= c.target;
    return { s: met ? "met" : "notmet", text: `Verified ${fmtVal(c, val)} / ${fmtVal(c, c.target)} (${approved.u.id})${newerTxt}` };
  }
  if (d) { const met = d.v >= c.target; return { s: met ? "met" : "notmet", text: `${fmtVal(c, d.v)} / ${fmtVal(c, c.target)} from ${d.src}${newerTxt}` }; }
  if (latest && latest.u.status === "changes") return { s: "changes", text: `Changes requested on ${latest.u.id}: claimed ${fmtVal(c, latest.l.claimed)}` };
  if (latest) return { s: "claimed", text: `Claimed ${fmtVal(c, latest.l.claimed)} / ${fmtVal(c, c.target)}: not yet reviewed (${latest.u.id})` };
  return { s: "unknown", text: c.target === true ? "No evidence supplied" : `Target ${fmtVal(c, c.target)}: no evidence supplied` };
}
const LABEL = { unknown: "Unknown", claimed: "Claimed · unreviewed", changes: "Changes requested", met: "Verified met", notmet: "Verified not met", config: "Needs config" };

// which requirement groups apply to a venture
function groups(v) {
  const models = v.model.resolved ? [v.model.value] : v.model.candidates;
  let transitions, why;
  if (v.assignedCriteria.length) {
    transitions = [...new Set(v.assignedCriteria.map(crit).filter(Boolean).map(c => c.transition))]; transitions.unshift("L0→L1 checklist");
    why = v.assignedNote;
  } else if (v.programmeLevel) { transitions = CFG.transitionsFrom[v.programmeLevel]; why = `Current level: ${v.programmeLevel}`; }
  else { transitions = [...new Set(CFG.criteria.map(c => c.transition))]; why = "Programme level not supplied: all transitions shown for reference; none can be assessed as a level."; }
  const out = [];
  for (const t of transitions) for (const m of ["*", ...models]) {
    const items = CFG.criteria.filter(c => c.transition === t && c.model === m);
    if (items.length) out.push({ t, m, items });
  }
  return { out, why, models };
}

// ---------- staff next-action queue (derived, never stored) ----------
function queue() {
  const q = [];
  const P = { review: 1, clarify: 2, reconcile: 3, followup: 4 };
  for (const u of S.updates.filter(u => u.status === "submitted")) q.push({ p: "review", v: u.ventureId, what: `Review update ${u.id}`, detail: u.lines.map(l => `${critLabel(l.criterionId)}: ${l.claimed}`).join(" · "), go: `#v/${u.ventureId}` });
  for (const e of S.evidence.filter(e => e.status === "submitted")) q.push({ p: "review", v: e.ventureId, what: `Review evidence ${e.id}`, detail: `${e.type}: ${e.detail}`, go: `#v/${e.ventureId}` });
  for (const v of S.ventures) {
    if (!v.model.resolved) q.push({ p: "clarify", v: v.id, what: "Owner to clarify business model", detail: v.model.note, go: `#v/${v.id}` });
    if (!v.programmeLevel) q.push({ p: "clarify", v: v.id, what: "Confirm programme level", detail: "Not supplied. Do not infer from development stage or labels.", go: `#v/${v.id}` });
    for (const f of v.importedFinancials.filter(f => f.amount && !f.period)) q.push({ p: "reconcile", v: v.id, what: "Obtain period & records for imported total", detail: `${inr(f.amount)} (${f.line}): ${f.note}`, go: `#v/${v.id}` });
    for (const l of Object.values(ledger(v.id))) for (const n of l.notes.filter(n => /reconcile|unknown|unpaid/.test(n))) q.push({ p: "reconcile", v: v.id, what: "Reconcile money record", detail: n, go: `#v/${v.id}` });
    if (v.mentorStatus) q.push({ p: "followup", v: v.id, what: "Mentor follow-up", detail: v.mentorStatus, go: `#v/${v.id}` });
    if (!v.nextUpdateDate) q.push({ p: "followup", v: v.id, what: "Set next-update date", detail: "Not supplied", go: `#v/${v.id}` });
    if (v.importedStatuses.some(s => /MSL/.test(s.label)) && !v.mslHandover) q.push({ p: "followup", v: v.id, what: "Confirm MSL handover status", detail: "Eligible ≠ handed over ≠ accepted. Handover and acceptance not supplied.", go: `#v/${v.id}` });
  }
  return q.sort((a, b) => P[a.p] - P[b.p]);
}

// ---------- actions ----------
// Reviews happen in an inline form (no browser pop-ups): open it, fill reason (+ verified values), confirm.
let RV = null; // {kind:"evidence"|"update", id, decision}
function openReview(kind, id, decision) { RV = { kind, id, decision }; render(); setTimeout(() => $("#rvReason")?.focus(), 0); }
function cancelReview() { RV = null; render(); }
function reviewForm(kind, id) {
  if (!RV || RV.kind !== kind || RV.id !== id) return "";
  const ok = RV.decision === "approved", e = kind === "evidence" ? S.evidence.find(x => x.id === id) : null, u = kind === "update" ? S.updates.find(x => x.id === id) : null;
  const vals = ok && u ? u.lines.map((l, i) => { const c = crit(l.criterionId); return `<label>Verified value: ${esc(critLabel(l.criterionId))} <span class="muted">(claimed ${esc(l.claimed)}${c && c.unit === "yes/no" ? ", yes/no" : ""})</span><input name="v${i}" value="${esc(l.claimed)}"></label>`; }).join("") : "";
  return `<form class="rv form" onsubmit="event.preventDefault();confirmReview(this)">
    <b>${ok ? "Approve" : "Request changes on"} ${esc(id)}</b> <span class="small muted">as ${esc(reviewer() || "(enter your name, top right)")}</span>
    ${vals}
    <label>${ok ? "What this does and doesn't prove" : "What must the venture fix? (required)"}<textarea id="rvReason" name="reason" rows="2">${ok && e ? esc(defaultApproveNote(e)) : ""}</textarea></label>
    <div class="err small"></div>
    <button>${ok ? "Confirm approval" : "Send back"}</button><button type="button" class="ghost" onclick="cancelReview()">Cancel</button></form>`;
}
function confirmReview(f) {
  const err = m => { f.querySelector(".err").textContent = m; };
  const who = reviewer(); if (!who) return err("Enter your name in the Name box (top right) first. Every review records it.");
  const reason = f.reason.value.trim(), { kind, id, decision } = RV;
  if (!reason) return err("Add a reason. It's saved with your name and the time.");
  if (kind === "evidence") return reviewEvidence(id, decision, reason);
  const u = S.updates.find(x => x.id === id), verified = [];
  if (decision === "approved") for (const [i, l] of u.lines.entries()) {
    const c = crit(l.criterionId); if (!c) return err(`${critLabel(l.criterionId)}. Fix the criteria config before approving.`);
    const p = parseMetric(c, f["v" + i].value); if (!p.ok) return err(`"${c.label}": enter ${c.unit === "yes/no" ? "yes or no" : "a plain number, e.g. 12 or 60000"}.`);
    verified.push(p.v);
  }
  reviewUpdate(id, decision, reason, verified);
}
function reviewEvidence(id, decision, reason) {
  const e = S.evidence.find(x => x.id === id), who = reviewer();
  if (!who || !reason) return;
  e.status = decision; e.reviews.push({ reviewer: who, at: now(), decision, reason });
  RV = null; save(); toast(`${id}: ${decision === "approved" ? "approved" : "changes requested"}`);
}
function defaultApproveNote(e) {
  return { loi: "Verified signed LOI. Intent only: not revenue or a completed pilot.", invoice: "Verified invoice (amount billed). Not proof of payment.",
    receipt: "Verified receipt against linked invoice. Counts as collected cash once, not in addition to the invoice.",
    earning: "Verified earnings statement for the stated period. Reconcile with payout; do not add both.",
    payout: "Verified payout against linked statement. Not new revenue for the payout month.", usage: "Verified analytics excerpt." }[e.kind] || "Verified.";
}
function reviewUpdate(id, decision, reason, verified = []) {
  const u = S.updates.find(x => x.id === id), who = reviewer();
  if (!who || !reason) return;
  u.lines.forEach((l, i) => { if (decision === "approved") l.verified = verified[i]; });
  u.status = decision; u.reviews.push({ reviewer: who, at: now(), decision, reason });
  RV = null; save(); toast(`${id}: ${decision === "approved" ? "approved" : "changes requested"}`);
}
function submitUpdate(vid, f) {
  const c = crit(f.crit.value), raw = f.val.value.trim();
  if (!raw || !f.period.value.trim() || !f.ev.value.trim()) return alert("Metric value, period and evidence reference are required.");
  const m = parseMetric(c, raw);
  if (!m.ok) return alert(c.unit === "yes/no" ? "Metric must be yes or no." : "Metric must be a plain number, e.g. 12 or 60000.");
  const refs = f.ev.value.split(",").map(s => s.trim()).filter(Boolean);
  if (refs.some(r => !/^[A-Za-z0-9_-]+$/.test(r))) return alert("Evidence refs: letters, numbers, - and _ only, comma-separated (e.g. A-E02).");
  for (const r of refs) if (!S.evidence.some(e => e.id === r)) S.evidence.push({ id: r, ventureId: vid, type: "Student-submitted reference (mock)", line: null, detail: "Reference supplied with update; content not yet reviewed.", amount: null, period: f.period.value, status: "submitted", kind: "other", reviews: [] });
  const id = nextId(vid + "-", S.updates.filter(u => u.ventureId === vid));
  S.updates.push({ id, ventureId: vid, submittedBy: role === "student" ? `Venture ${vid} (student)` : "Staff on behalf of venture", submittedAt: localISO(),
    lines: [{ criterionId: c.id, claimed: m.v, note: "" }],
    period: f.period.value.trim(), evidenceRefs: refs, blocker: f.blocker.value.trim() || null, nextAction: f.next.value.trim() || null, status: "submitted", reviews: [] });
  save(); toast(`Update ${id} submitted for review`);
}
function clarifyModel(vid, f) {
  const v = V(vid), who = reviewer();
  if (!who) return alert("Enter reviewer/owner name first.");
  if (!f.reason.value.trim()) return alert("Reason required.");
  const prev = v.model.candidates.join(" / ");
  v.model = { value: f.model.value, candidates: [f.model.value], resolved: true, note: `Clarified by ${who}: ${f.reason.value.trim()}` };
  S.decisions.push({ id: nextId("D-" + vid, S.decisions), ventureId: vid, type: "Model clarified", from: `Unresolved (${prev})`, to: f.model.value, basis: f.reason.value.trim(), decidedBy: who, decisionDate: now(), provenance: "Recorded in app", recordedAt: now(), recordedBy: who });
  save(); toast("Business model recorded");
}
function transitionCheck(v, type, to) {
  if (type === "Direct entry") return { ok: true, msg: "Direct entry: cite the prior-work basis. Earlier levels are not required." };
  if (type === "MSL handover") return v.importedStatuses.some(s => /Eligible for MSL/.test(s.label)) || v.programmeLevel === "Level 2" ? { ok: true, msg: "Handover is recorded separately from eligibility and acceptance." } : { ok: false, msg: "No MSL eligibility on record." };
  if (type === "MSL acceptance") return v.mslHandover ? { ok: true, msg: "Acceptance is MSL's decision; record it only when MSL confirms." } : { ok: false, msg: "Record MSL handover first. Acceptance is never inferred from eligibility." };
  // Advancement
  if (!v.model.resolved) return { ok: false, msg: "Blocked: business model unresolved. Owner must clarify which criteria apply." };
  if (!v.programmeLevel) return { ok: false, msg: "Blocked: current level unknown. Use Direct entry if prior work supports a level." };
  if (to !== undefined && CFG.levels.indexOf(to) <= CFG.levels.indexOf(v.programmeLevel)) return { ok: false, msg: `Blocked: advancement must move above the current level (${v.programmeLevel}).` };
  const ts = CFG.transitionsFrom[v.programmeLevel];
  const pending = CFG.criteria.filter(c => ts.includes(c.transition) && (c.model === "*" || c.model === v.model.value)).filter(c => reqStatus(v, c).s !== "met");
  return pending.length ? { ok: false, msg: `Blocked: ${pending.length} requirement(s) not verified: ${pending.map(c => c.label).slice(0, 4).join("; ")}${pending.length > 4 ? "…" : ""}` }
    : { ok: true, msg: "All applicable requirements verified. Advancement can be recorded immediately." };
}
function recordTransition(vid, f) {
  const v = V(vid), who = reviewer(), type = f.type.value, to = f.to.value;
  if (!who) return alert("Enter reviewer name first.");
  const chk = transitionCheck(v, type, to); if (!chk.ok) return alert(chk.msg);
  if (!f.basis.value.trim()) return alert("Basis / reason is required.");
  const from = type.startsWith("MSL") ? null : v.programmeLevel;
  const target = type === "MSL handover" ? "MSL handover" : type === "MSL acceptance" ? "MSL accepted" : to;
  S.decisions.push({ id: nextId("D-" + vid, S.decisions), ventureId: vid, type, from, to: target, basis: f.basis.value.trim(), decidedBy: who,
    decisionDate: f.date.value || "Not supplied", provenance: "Recorded in app", recordedAt: now(), recordedBy: who });
  if (type === "MSL handover") v.mslHandover = `Recorded ${now()} by ${who}`;
  else if (type === "MSL acceptance") v.mslAcceptance = `Recorded ${now()} by ${who}`;
  else { v.programmeLevel = to; v.levelProvenance = `${type} recorded ${now()} by ${who}`; }
  save(); toast(`${type} recorded`);
}
function importVenture(txt) {
  let j; try { j = JSON.parse(txt); } catch (e) { return alert("Invalid JSON: " + e.message); }
  if (!j.id || V(j.id)) return alert("Needs a unique id.");
  const base = { name: "Venture " + j.id, activity: null, trackerSector: null, devStage: null, programmeLevel: null, levelProvenance: "Imported", model: { value: null, candidates: [], resolved: false, note: "Not supplied" }, importedStatuses: [], recordedUpdate: null, importedFinancials: [], fundraisingPref: null, mslHandover: null, mslAcceptance: null, mentorGoal: null, mentorStatus: null, nextUpdateDate: null, assignedCriteria: [], assignedNote: "" };
  S.ventures.push({ ...base, ...j }); save(); location.hash = "#v/" + j.id; toast("Imported venture " + j.id + " (missing fields kept as Unknown)");
}

// ---------- views ----------
function viewQueue() {
  const q = queue(), tag = { review: "Review", clarify: "Clarify", reconcile: "Reconcile", followup: "Follow up" };
  const counts = Object.keys(tag).map(k => `<div class="stat"><b>${q.filter(x => x.p === k).length}</b><span>${tag[k]}</span></div>`).join("");
  return `<h2>Staff next-action queue</h2><p class="muted">Derived live from records. Reviews first, then clarifications, reconciliations and follow-ups.</p>
  <div class="stats">${counts}</div>
  <table><thead><tr><th>Type</th><th>Venture</th><th>Action</th><th>Detail</th></tr></thead><tbody>
  ${q.map(x => `<tr><td><span class="pill p-${x.p}">${tag[x.p]}</span></td><td><a href="${x.go}">${x.v}</a></td><td>${esc(x.what)}</td><td class="small">${esc(x.detail)}</td></tr>`).join("")}
  </tbody></table>
  <h3>Ventures at a glance</h3><div class="cards">${S.ventures.map(v => {
    const pend = groups(v).out.flatMap(g => g.items).filter(c => reqStatus(v, c).s !== "met").length;
    return `<a class="card" href="#v/${v.id}"><h4>${esc(v.name)}</h4><div class="small">${U(v.activity)}</div>
    <div class="kv"><span>Level</span>${U(v.programmeLevel)}</div><div class="kv"><span>Model</span>${v.model.resolved ? esc(v.model.value) : `<span class="warn">Unresolved</span>`}</div>
    <div class="kv"><span>Imported status</span>${v.importedStatuses.map(s => `<span class="pill p-imp">${esc(s.label)}</span>`).join(" ") || "–"}</div>
    <div class="kv"><span>Requirements not verified</span>${v.programmeLevel || v.assignedCriteria.length ? pend : `<span class="unk">Level unknown</span>`}</div></a>`; }).join("")}</div>`;
}

function viewVenture(id) {
  const v = V(id); if (!v) return "<p>Not found.</p>";
  const g = groups(v), lg = ledger(id), canReview = role === "reviewer";
  const ev = S.evidence.filter(e => e.ventureId === id), ups = S.updates.filter(u => u.ventureId === id), dec = S.decisions.filter(d => d.ventureId === id);
  const pending = g.out.flatMap(x => x.items.map(c => ({ c, st: reqStatus(v, c) }))).filter(x => x.st.s !== "met");
  const applicable = g.out.flatMap(x => x.items).filter(c => c.model !== "*");
  return `
  <div class="vhead"><div><h2>${esc(v.name)}</h2><div class="muted">${U(v.activity)}</div></div>
    <div class="tabs-inline">${S.ventures.map(x => `<a class="${x.id === id ? "on" : ""}" href="#v/${x.id}">${x.id}</a>`).join("")}</div></div>
  ${!v.model.resolved ? `<div class="banner warn-b"><b>Business model unresolved.</b> ${esc(v.model.note)} Criteria attach to the model, so an owner must clarify before advancement can be assessed.</div>` : ""}

  <section class="grid2">
   <div class="box"><h3>Record (as imported)</h3>
    <div class="kv"><span>Development stage</span>${U(v.devStage)}</div>
    <div class="kv"><span>Programme level</span>${U(v.programmeLevel)} <span class="small muted">${esc(v.levelProvenance)}</span></div>
    <div class="kv"><span>Business model</span>${v.model.resolved ? esc(v.model.value) : `<span class="warn">Unresolved</span> (${esc(v.model.candidates.join(" / "))})`}</div>
    <div class="kv"><span>Tracker sector label</span>${U(v.trackerSector)} <span class="small muted">(not used for criteria)</span></div>
    <div class="kv"><span>Latest recorded update</span>${U(v.recordedUpdate)}</div>
    <div class="kv"><span>Fundraising preference</span>${U(v.fundraisingPref)}</div>
    <div class="kv"><span>Mentor</span>${U(v.mentorGoal)} ${v.mentorStatus ? `<span class="warn small">${esc(v.mentorStatus)}</span>` : ""}</div>
    <div class="kv"><span>Next update date</span>${U(v.nextUpdateDate)}</div>
   </div>
   <div class="box"><h3>Decisions & readiness (kept separate)</h3>
    <div class="kv"><span>Readiness</span>${U(v.readiness)} <span class="small muted">reviewer judgement; not derived from level, stage or eligibility</span></div>
    <div class="kv"><span>Advancement approval</span>${(() => { const d = S.decisions.filter(d => d.ventureId === v.id && /Advancement|Direct entry/.test(d.type)).pop(); return d ? `${esc(d.type)} → ${esc(d.to)} <span class="small muted">${esc(d.decidedBy)} · ${esc(d.decisionDate)}</span>` : U(null); })()}</div>
    <div class="kv"><span>Imported status</span>${v.importedStatuses.map(s => `<span class="pill p-imp">${esc(s.label)}</span><div class="small muted">${esc(s.provenance)}. ${s.recomputable ? "" : "Cannot be independently recomputed; preserved, not re-certified."}</div>`).join("") || "–"}</div>
    <div class="kv"><span>MSL handover</span>${U(v.mslHandover)}</div>
    <div class="kv"><span>MSL acceptance</span>${U(v.mslAcceptance)} <span class="small muted">never inferred from eligibility</span></div>
    <div class="kv"><span>Imported financial totals</span>${v.importedFinancials.map(f => `<div>${inr(f.amount)} · ${esc(f.line)} · period ${U(f.period)}<div class="small muted">${esc(f.note)}</div></div>`).join("") || "–"}</div>
   </div>
  </section>

  <section class="box"><h3>Pending requirements <span class="muted small">(${pending.length})</span></h3>
   <p class="small muted">${esc(g.why)}</p>
   ${g.out.map(x => `<details ${v.programmeLevel || v.assignedCriteria.length ? "open" : ""}><summary><b>${esc(x.t)}</b> · ${x.m === "*" ? "all models" : esc(x.m)}${!v.model.resolved && x.m !== "*" ? ` <span class="warn small">(candidate model)</span>` : ""}</summary>
    <table class="req">${x.items.map(c => { const st = reqStatus(v, c); return `<tr><td>${esc(c.label)}</td><td><span class="pill s-${st.s}">${LABEL[st.s]}</span></td><td class="small">${esc(st.text)}</td></tr>`; }).join("")}</table></details>`).join("")}
   <p class="small muted">A completed demand bar is not a completed level. L0 checklist items stay Unknown until evidence is reviewed.</p>
  </section>

  <section class="box"><h3>Money & commitments by business line</h3>
   <p class="small muted">Chosen metric for criteria: <b>collected cash</b> from reviewed records. Billed and earned amounts are shown, never added to their payments.</p>
   <table><thead><tr><th>Line</th><th>Billed</th><th>Collected</th><th>Earned</th><th>Paid out</th><th>LOIs</th></tr></thead><tbody>
   ${Object.entries(lg).map(([n, l]) => `<tr><td>${esc(n)}</td>${["billed", "collected", "earned", "received"].map(k => `<td>${inr(l[k][0])}<div class="small muted">${l[k][1] !== l[k][0] ? inr(l[k][1] - l[k][0]) + " unreviewed" : ""}</div></td>`).join("")}<td>${l.lois[0]}<div class="small muted">${l.lois[1] - l.lois[0] ? (l.lois[1] - l.lois[0]) + " unreviewed" : ""}</div></td></tr>`).join("") || `<tr><td colspan="6" class="muted">No money evidence.</td></tr>`}
   </tbody></table>
   <ul class="small">${Object.values(lg).flatMap(l => l.notes).map(n => `<li>${esc(n)}</li>`).join("")}</ul>
  </section>

  <section class="box"><h3>Evidence</h3><table><thead><tr><th>ID</th><th>Type</th><th>Detail</th><th>Period</th><th>Status</th><th></th></tr></thead><tbody>
   ${ev.map(e => `<tr><td>${e.id}</td><td>${esc(e.type)}<div class="small muted">${U(e.line)}</div></td><td class="small">${esc(e.detail)}</td><td class="small">${esc(e.period)}</td>
    <td><span class="pill s-${e.status === "approved" ? "met" : e.status === "changes" ? "changes" : "claimed"}">${e.status === "approved" ? "Approved" : e.status === "changes" ? "Changes requested" : "Awaiting review"}</span>
    ${e.reviews.map(r => `<div class="small muted">${esc(r.decision)} by ${esc(r.reviewer)}, ${esc(r.at)}: ${esc(r.reason)}</div>`).join("")}</td>
    <td>${canReview && e.status === "submitted" ? `<button onclick="openReview('evidence','${e.id}','approved')">Approve</button><button class="ghost" onclick="openReview('evidence','${e.id}','changes')">Request changes</button>` : ""}</td></tr>${RV && RV.kind === "evidence" && RV.id === e.id ? `<tr><td colspan="6">${reviewForm("evidence", e.id)}</td></tr>` : ""}`).join("") || `<tr><td colspan="6" class="muted">None.</td></tr>`}
  </tbody></table></section>

  <section class="box"><h3>Progress updates</h3>
   ${ups.map(u => `<div class="upd"><div><b>${u.id}</b> · ${esc(u.submittedBy)} · ${esc(u.submittedAt.replace("T", " "))} · period ${esc(u.period)} · evidence ${esc(u.evidenceRefs.join(", "))}
     <span class="pill s-${u.status === "approved" ? "met" : u.status === "changes" ? "changes" : "claimed"}">${u.status === "approved" ? "Approved" : u.status === "changes" ? "Changes requested" : "Awaiting review"}</span></div>
     <ul class="small">${u.lines.map(l => `<li>${esc(critLabel(l.criterionId))}: claimed <b>${esc(l.claimed)}</b>${l.verified !== undefined ? `, verified <b>${esc(l.verified)}</b>` : ""} ${l.note ? `<span class="muted">(${esc(l.note)})</span>` : ""}</li>`).join("")}</ul>
     <div class="small">Blocker: ${U(u.blocker)} · Next action: ${U(u.nextAction)}</div>
     ${u.reviews.map(r => `<div class="small muted">↳ ${esc(r.decision)} by ${esc(r.reviewer)}, ${esc(r.at)}: ${esc(r.reason)}</div>`).join("")}
     ${canReview && u.status === "submitted" ? `<div><button onclick="openReview('update','${u.id}','approved')">Approve</button><button class="ghost" onclick="openReview('update','${u.id}','changes')">Request changes</button></div>` : ""}${reviewForm("update", u.id)}</div>`).join("") || `<p class="muted">No updates yet.</p>`}
   ${role !== "reviewer" ? `<form class="form" onsubmit="event.preventDefault();submitUpdate('${id}',this)"><h4>Submit a short update</h4>
     <label>Criterion<select name="crit">${(applicable.length ? applicable : CFG.criteria.filter(c => c.model !== "*")).map(c => `<option value="${c.id}">${esc(c.transition)} · ${esc(c.model)} · ${esc(c.label)}</option>`).join("")}</select></label>
     <label>Metric value<input name="val" placeholder="e.g. 12"></label><label>Period<input name="period" placeholder="e.g. week ending 18 Oct"></label>
     <label>Evidence ref<input name="ev" placeholder="e.g. A-E02 (mock)"></label><label>Blocker<input name="blocker" placeholder="optional"></label><label>Next action<input name="next" placeholder="optional"></label>
     <button>Submit for review</button></form>` : `<p class="small muted">Switch role to Student to submit an update.</p>`}
  </section>

  ${canReview ? `<section class="grid2">
   ${!v.model.resolved ? `<form class="box form" onsubmit="event.preventDefault();clarifyModel('${id}',this)"><h3>Record model clarification</h3>
     <label>Model<select name="model">${["Consumer", "Services", "AI B2C", "AI B2B"].map(m => `<option>${m}</option>`).join("")}</select></label>
     <label>Reason / source<input name="reason" placeholder="e.g. Owner confirmed agency (B2B) focus on call"></label><button>Record</button></form>` : ""}
   <form class="box form" oninput="this.querySelector('.chk').textContent=transitionCheck(V('${id}'),this.type.value,this.to.value).msg" onsubmit="event.preventDefault();recordTransition('${id}',this)">
     <h3>Record a level / MSL decision</h3>
     <label>Type<select name="type"><option>Advancement</option><option>Direct entry</option><option>MSL handover</option><option>MSL acceptance</option></select></label>
     <label>To level<select name="to">${CFG.levels.slice(0, 3).map(l => `<option>${l}</option>`).join("")}</select></label>
     <label>Basis / reason<input name="basis" placeholder="Evidence or prior work relied on"></label>
     <label>Decision date<input name="date" type="date"></label>
     <div class="chk small">${esc(transitionCheck(v, "Advancement").msg)}</div><button>Record decision</button></form>
  </section>` : ""}

  <section class="box"><h3>Decision history</h3><table><thead><tr><th>ID</th><th>Type</th><th>From → To</th><th>Basis</th><th>Decided by / date</th><th>Provenance</th></tr></thead><tbody>
   ${dec.map(d => `<tr><td>${d.id}</td><td>${esc(d.type)}</td><td>${d.from ? esc(d.from) : d.type === "Direct entry" ? "No prior ILS level" : "–"} → <b>${esc(d.to)}</b></td><td class="small">${esc(d.basis)}</td><td class="small">${esc(d.decidedBy)} · ${esc(d.decisionDate)}</td><td class="small">${esc(d.provenance)} · recorded ${esc(d.recordedAt)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">No decisions recorded.</td></tr>`}
  </tbody></table></section>`;
}

function viewConfig() {
  const ts = [...new Set(CFG.criteria.map(c => c.transition))];
  return `<h2>Criteria configuration</h2><p class="muted">Named by the transition they support and attached to a business model. Edit <code>data/seed.js → CONFIG</code>. Items marked "needs config" are never used to certify anything.</p>
  ${ts.map(t => `<h3>${esc(t)}</h3><table><thead><tr><th>ID</th><th>Model</th><th>Requirement</th><th>Target</th><th>Open question</th></tr></thead><tbody>
  ${CFG.criteria.filter(c => c.transition === t).map(c => `<tr><td>${c.id}</td><td>${c.model === "*" ? "All" : esc(c.model)}</td><td>${esc(c.label)}</td><td>${c.target === null ? `<span class="warn">Undefined</span>` : fmtVal(c, c.target)}</td><td class="small warn">${esc(c.needsConfig || "")}</td></tr>`).join("")}</tbody></table>`).join("")}`;
}
function viewImport() {
  const sample = { id: "D", name: "Venture D", activity: "Example only", programmeLevel: null, model: { value: null, candidates: ["Services"], resolved: false, note: "Not supplied" }, importedStatuses: [{ label: "Eligible for MSL", provenance: "Tracker label", recomputable: false }] };
  return `<h2>Import a venture record</h2><p class="muted">Paste a tracker row as JSON. Missing fields are stored as <b>Unknown</b>; imported labels keep their provenance. The three supplied cases are pre-loaded from <code>data/seed.js</code>.</p>
  <textarea id="imp" rows="12">${esc(JSON.stringify(sample, null, 2))}</textarea><br><button onclick="importVenture($('#imp').value)">Import record</button>
  <h3>Whole dataset</h3><p><button onclick="exportJSON()">Export JSON</button> <label class="btnlike">Import JSON<input type="file" accept=".json" hidden onchange="importFile(this)"></label> <button class="ghost" onclick="resetDemo()">Reset to supplied cases</button></p>`;
}

function render() {
  const h = location.hash || "#queue";
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", h.startsWith(a.getAttribute("href"))));
  $("#main").innerHTML = h.startsWith("#v/") ? viewVenture(h.slice(3)) : h === "#config" ? viewConfig() : h === "#import" ? viewImport() : viewQueue();
}
function setRole(r) { role = r; document.body.dataset.role = r; render(); }
window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
  $("#role").value = role;
  // Reviewer name is required for every review/decision; remembered per browser so it is typed once, never defaulted.
  const n = $("#reviewerName"); try { n.value = localStorage.getItem(KEY + "-reviewer") || ""; } catch (e) {}
  n.addEventListener("input", () => { try { localStorage.setItem(KEY + "-reviewer", n.value.trim()); } catch (e) {} });
  render();
});
