# Worked examples

Three worked cases, each starting from a shipped template (`templates/`) and running the same loop:
Understand -> Diverge -> Converge -> a decision-ready one-pager. Open the app, press Ctrl/Cmd+K,
choose "Start from a template", and follow the story. The keyless demo (Ctrl/Cmd+K -> "Watch the
3-min demo") plays the first of these end to end with no model connected.

## 1. Purchase-to-Pay: the invoice match (`p2p`)

**The pain.** Invoices sit for days on a manual three-way match; month-end is chaos.

**The story.** The map shows the requisition -> PO -> goods receipt -> match -> chase -> pay flow.
The data tag on the match flags frequent exceptions; friction pins the wait and the email chase. An
idea - auto-match invoices to POs - is scored high-benefit, low-effort and committed. The Challenger
wakes and presses the effort score: your own map says the match reconciles three systems, so is a
"2" honest? The improvement case classifies the freed clerk time as **capacity-release**, not
savings, until a redeployment owner is named.

**What it teaches.** Anti-anchoring (the Challenger only speaks after you commit) and honest benefit
classification.

## 2. Order-to-Cash: the credit hold (`o2c`)

**The pain.** Orders stall on credit hold; days sales outstanding creeps up.

**The story.** Order entry -> credit decision -> fulfilment -> invoice -> collect. The friction sits
on the credit hold (waiting) and the monthly collections chase (motion). Candidate ideas cluster
around the credit decision - the highest-leverage handoff on the map. The estimator counts the
handoffs and names the biggest wait; the to-be composer proposes a Connect transform between sales
and finance and shows the handoff delta as a hypothesis, not a promise.

**What it teaches.** The deterministic estimator and the to-be composer, and reading handoffs as
where work waits.

## 3. Carrier onboarding: the document chase (`carrier`)

**The pain.** New hauliers take weeks to go live; documents arrive piecemeal.

**The story.** Application -> collect documents -> completeness check -> chase -> insurance ->
credit -> TMS setup. The data tag on document collection is unstructured, judgment-heavy and
exception-prone; friction pins the document chase and the eyeball insurance check (expired cover
slips through). Ideas target the completeness gate and the insurance verification.

**What it teaches.** How the data-and-rules profile of a step (structured vs judgment, exception
frequency) is exactly the evidence a later challenge cites.

---

Each template seeds only the Understand side. The ideas, the scores, the commitment and the case are
always yours - that is the point. Fork a template or open a PR to add your own; see
`registry/README.md`.
