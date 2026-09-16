# Research questions

These four questions are locked small enough for one undergraduate FYP. Do not add more RQs unless a supervisor asks. Every later experiment table should map to at least one RQ.

## Primary questions

### RQ1 — Trustworthy repair (effectiveness)

**Does CalibraGuard (calibrated gating + verify) reduce the rate of *insecure-but-accepted* repairs compared with Fix-once, on the same LLM-generated Flask/Django snippets?**

- *Insecure-but-accepted:* the pipeline emits a repair that it treats as success, but the security oracle still finds the target CWE (or an introduced sibling CWE in scope).
- **Hypothesis H1.** CalibraGuard’s insecure-but-accepted rate is lower than Fix-once, at the cost of some abstentions and possibly fewer attempted repairs.

### RQ2 — Calibration

**How well does CalibraGuard’s reported confidence match actual post-verify security?**

- Confidence is a score in `[0, 1]` produced before the repair is accepted (see [04-methodology.md](04-methodology.md)).
- Actual security is the binary oracle after Verify (secure / not secure).
- **Metrics:** Expected Calibration Error (ECE) and Brier score [guo2017calibration].
- **Hypothesis H2.** Agreement-based confidence is better calibrated (lower ECE/Brier) than a constant “always 1.0” Fix-once policy.

### RQ3 — Abstention

**When CalibraGuard abstains, is residual risk lower than when the same snippets are force-patched (Fix-once)?**

- This is selective prediction / abstention [geifman2017selective]: coverage vs risk.
- **Hypothesis H3.** On the abstain subset, Fix-once still has a high residual vulnerability rate; abstention therefore avoids applying the riskiest repairs.

## Secondary question (can be dropped without sinking the FYP)

### RQ4 — Explanation usability

**Are CalibraGuard explanations rated more usable than scanner-only output on a small rubric (CWE identity, location, why it is risky, fix intent, residual uncertainty)?**

- 5–10 snippets, the student plus at most one peer if ethics approval allows.
- Not a statistically powered HCI study. If time or ethics blocks it, report RQ1–RQ3 only and list RQ4 as future work.

## What will not become extra RQs

- “Does CalibraGuard beat CodeQL on GitHub at large?”
- “Which commercial LLM is the most secure coder?”
- “Can we train a 7B repair model from scratch?”

Those are either out of scope or would explode the evaluation.
