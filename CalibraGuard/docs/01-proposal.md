# Project proposal — CalibraGuard

**Working title:** Security-Calibrated Detect–Explain–Repair–Verify for LLM-Generated Python Web Code (CalibraGuard)

| Field | Value |
| --- | --- |
| Student | Ushan Gallage (20220070) |
| Programme | BSc (Hons) Software Engineering, IIT / University of Westminster |
| Module | 6COSC012C Final Year Project (confirm exact title on the handout) |
| Document status | Working draft — headings follow a Westminster-style research-project skeleton until official handouts are attached. See [08-handout-alignment.md](08-handout-alignment.md). |

---

## 1. Abstract

Large language models are now a common way to produce Python web code, but the generated code frequently contains well-known web vulnerabilities. Automated Detect–Repair–Verify loops can reduce static-analysis findings, yet a patch that is scanner-clean can still be insecure, break intended behaviour, or be presented with unjustified confidence. This project proposes **CalibraGuard**, a software-engineering framework that adds structured explanations and **confidence gating** to a Detect–Explain–Repair–Verify pipeline for a closed set of CWEs in LLM-generated Flask/Django snippets. The system may **abstain** rather than force a low-confidence repair. The contribution is evaluated by comparing Detect-only, Fix-once, and Calibrated Fix+Verify on a frozen snippet set, using detection quality, post-repair security and functional tests, calibration error, and abstention–risk curves. The work does not claim to replace industrial SAST; it claims a scoped, measurable improvement in how repair pipelines decide when a fix is trustworthy enough to apply.

## 2. Background and problem statement

LLM coding assistants can emit code that looks plausible while remaining vulnerable to injection and cryptography mistakes [pearce2022asleep, perry2023users]. Benchmarks such as LLMSecEval, SecurityEval, and CyberSecEval make that failure mode measurable [tony2023llmseceval, siddiq2022securityeval, bhatt2023cyberseceval]. Static analysers (Bandit, Semgrep, CodeQL) can detect many of these issues, and recent pipelines feed findings back into an LLM to propose repairs and then re-scan.

The remaining software-engineering problem is **trust in the repair**, not only detection:

- Repairs can be **overconfident**: the pipeline reports success because scanners go quiet, even when the fix is incomplete or cosmetic.
- Repairs can be **functionally broken**: the snippet no longer does what the developer asked.
- Repairs can be **opaque**: the developer is given a diff without a usable explanation of CWE, location, and residual risk.
- Pipelines often **always patch**. There is no first-class **abstain** action when evidence is weak.

CalibraGuard treats those as SE design problems: specify a pipeline, implement it, and measure whether calibration and abstention reduce *insecure-but-accepted* repairs.

## 3. Research gap

Prior work establishes that (a) LLM-generated code is often insecure and (b) repair loops can improve scanner scores. What is still weak, especially for a one-year SE prototype, is the combination of:

1. **Security calibration** — does reported confidence match actual post-verify security?
2. **Explanation usability** — is the output more than a scanner dump?
3. **Selective repair / abstention** — when should the system refuse to auto-fix?

CalibraGuard occupies that gap for a *small* CWE set in Python web snippets, not for all languages or all of OWASP.

## 4. Aim

To design, implement, and evaluate a named Detect–Explain–Repair–Verify framework (**CalibraGuard**) that uses explanation-aware confidence gating to decide whether to repair LLM-generated Python web snippets or abstain, and to compare that framework with Detect-only and Fix-once baselines.

## 5. SMART objectives

1. Freeze scope: four CWEs (89, 79, 117, 327), Flask/Django snippets only, written inclusion rules.
2. Implement the pipeline with explicit outcomes `{detect, explain, repair, verify, abstain}`.
3. Freeze an evaluation set of ≥ 60 labelled snippets with seeds in git.
4. Run the three-condition experiment and report the metrics in [06-evaluation-plan.md](06-evaluation-plan.md).
5. Deliver dissertation + prototype according to the official module calendar (dates TBD from handouts).

Detail: [00-supervisor-email.md](00-supervisor-email.md).

## 6. Research questions and hypotheses

See [02-research-questions.md](02-research-questions.md). Short form:

- **RQ1.** Does calibrated gating + verify reduce insecure-but-accepted repairs versus Fix-once?
- **RQ2.** How well does reported confidence match actual post-verify security (ECE / Brier)?
- **RQ3.** When the system abstains, is residual risk lower than when it is forced to patch?
- **RQ4 (optional / lighter).** Are structured explanations rated more usable than scanner-only output on a small rubric?

## 7. Scope

**In scope**

- LLM-generated Python web snippets (Flask and Django patterns).
- CWE-89, CWE-79, CWE-117, CWE-327.
- Offline evaluation on a frozen corpus; no attacking live third-party systems.
- Static detection (Bandit + Semgrep; CodeQL if the environment allows) plus an optional LLM detector used only as a *signal*, not as the sole oracle.
- Functional checks limited to snippet-level tests (syntax + small unit/property checks), not full application QA.

**Out of scope**

- Training or fine-tuning a new foundation model.
- Full-app pentesting, authentication protocol design, or malware.
- npm/PyPI package hallucination (the rejected Topic 2).
- Claiming superiority to commercial SAST on arbitrary repositories.
- A large-N developer user study (a 5–10 snippet rubric is optional only).

CWE detail: [05-cwe-scope.md](05-cwe-scope.md).

## 8. High-level method

```
snippet → Detect → Explain → Confidence/agreement → gate
                              ├─ below threshold → Abstain (needs human)
                              └─ above threshold → Repair → Verify → Accept or reject
```

Three conditions on the **same** snippets: Detect-only; Fix-once; CalibraGuard.

Full design: [04-methodology.md](04-methodology.md).

## 9. Evaluation

Frozen dataset; scanner consensus plus a manually labelled sample as the security oracle; metrics for detection, repair, calibration, and abstention. No claim beyond this scoped setting.

Full plan: [06-evaluation-plan.md](06-evaluation-plan.md).

## 10. Expected contribution

| Deliverable | What “done” looks like |
| --- | --- |
| Named framework | CalibraGuard pipeline specification + implementation |
| Prototype | Runnable three-condition comparison on the frozen set |
| Evidence | Tables for RQ1–RQ3 (and RQ4 if time) |
| Dissertation | Problem, related work, method, results, threats to validity |

## 11. Ethics, risks, and plan

See [07-ethics-risks-plan.md](07-ethics-risks-plan.md). Only synthetic or public snippets; no live exploitation; API keys never in git; “scanner-clean ≠ secure” treated as a threat to validity.

## 12. References

BibTeX: [references.bib](references.bib). Literature map: [03-literature-matrix.md](03-literature-matrix.md).
