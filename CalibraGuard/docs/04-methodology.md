# Methodology

CalibraGuard is an **experimental software-engineering project**: specify a pipeline, implement it, freeze data, compare treatments. This document is the research design. The prototype folder stays empty until the proposal is agreed.

## 1. Unit of analysis

One **snippet**: a short Flask or Django Python file (or file pair) generated from a natural-language prompt, plus metadata `{prompt_id, generator_model, cwe_target, seed}`.

Not in the first experiment: multi-package applications, Docker compose stacks, or GitHub issue threads.

## 2. Pipeline (CalibraGuard condition)

```text
LLM-generated Python web snippet
        │
        ▼
 [Detect]  Bandit + Semgrep (+ optional LLM detector as extra signal)
        │
        ▼
 [Explain] structured record: CWE, location, why, exploit sketch (non-operational),
           fix intent, residual uncertainty
        │
        ▼
 [Confidence] agreement score in [0, 1]
        │
        ├── below threshold τ  →  ABSTAIN (needs human; no auto-repair)
        │
        └── at/above τ         →  [Repair] LLM patch
                                      │
                                      ▼
                               [Verify] syntax + re-scan + snippet tests
                                      │
                                      ├── pass  → ACCEPT repair
                                      └── fail  → REJECT repair (do not pretend success)
```

### Detect

- Run Bandit and Semgrep with a pinned rule bundle mapped to the four CWEs ([05-cwe-scope.md](05-cwe-scope.md)).
- Optional LLM detector may propose a CWE; it must not override a unanimous scanner-clean result without review in the labelling guide.
- Output: a list of findings in a JSON schema (SARIF-inspired, simplified).

### Explain

A machine-readable explanation object, for example:

- `cwe_id`, `file`, `line_span`
- `why` (one paragraph, no exploit kit)
- `fix_intent` (what a correct patch must change)
- `uncertainty_notes` (what the scanners could not see)

This object is the input to both the gate and any later RQ4 rubric.

### Confidence and gating

Start with a **transparent** score, not a black-box neural calibrator:

Let \(s\) be scanner agreement (fraction of detectors that flag the same CWE family at an overlapping location), \(e\) an explanation-completeness checklist (0–1), and \(m\) a small disagreement penalty if Bandit and Semgrep conflict.

\[
\hat{p} = \mathrm{clip}_{[0,1]}(w_s s + w_e e - w_m m)
\]

If \(\hat{p} < \tau\), **abstain**. \(\tau\) is chosen on a development split (not the test split) by a coverage–risk curve ([06-evaluation-plan.md](06-evaluation-plan.md)). Document \(w_s, w_e, w_m, \tau\) in git.

This is deliberately simple so an FYP can *explain* the gate. Temperature scaling [guo2017calibration] can be a later sensitivity test, not the first version.

### Repair

A single LLM call (or a fixed one-retry policy) that receives: original snippet, explanation object, and “do not change behaviour except as required for the CWE.” No unbounded repair loops in the primary experiment (that would confound Fix-once vs CalibraGuard).

### Verify

1. Parse (Python AST).
2. Re-run the same scanners.
3. Run snippet-level tests where they exist (happy-path + the targeted sink, e.g. parameterised query still returns rows).

Accept only if all three pass. Scanner-clean alone is **not** accept.

## 3. Experimental conditions

All three run on the **same frozen snippets**.

| Condition | Detect | Explain | Gate | Repair | Verify |
| --- | --- | --- | --- | --- | --- |
| Detect-only | Yes | No (raw scanner output only) | No | No | No |
| Fix-once | Yes | Minimal prompt (“fix this finding”) | No (always repair) | Yes, one shot | Optional re-scan recorded but **acceptance does not require verify** — this is the overconfident baseline |
| CalibraGuard | Yes | Yes | Yes | Yes if gated | Yes; required for ACCEPT |

Fix-once models current “ask the LLM to fix Bandit” practice. CalibraGuard adds explanation, gate, and hard verify.

## 4. Oracle and labelling

- **Primary oracle:** after any repair, union of pinned Bandit/Semgrep (and CodeQL if used) mapped to the four CWEs, plus a **manual audit sample** (stratified, at least 20% or 20 snippets, whichever is smaller) using the rubric in [06-evaluation-plan.md](06-evaluation-plan.md).
- Label original snippets for detection metrics (vulnerable / clean / out-of-scope).
- Record generator model and prompt so leakage between train-like prompts and test prompts can be discussed.

## 5. Implementation plan (after this docs milestone)

1. Pin tool versions in `prototype/` (later).
2. JSON schemas for finding, explanation, run record.
3. Scripts: `run_detect.py`, `run_fix_once.py`, `run_calibraguard.py`, `score.py`.
4. No UI required for the experiment; a CLI is enough. A small report HTML is optional.

## 6. Validity

Threats and mitigations live in [07-ethics-risks-plan.md](07-ethics-risks-plan.md). The method assumes static analysers are noisy; that is why calibration and abstention exist, and why we do not equate scanner-clean with “secure.”
