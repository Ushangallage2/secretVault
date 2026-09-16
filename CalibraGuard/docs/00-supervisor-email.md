# Supervisor request — CalibraGuard (Topic 1 only)

Use this as the email body. Replace `[Supervisor Name]` and the greeting if you already know who you are writing to. Attach [01-proposal.md](01-proposal.md) as a PDF if the school asks for a one-pager.

---

**Subject:** FYP supervision request — CalibraGuard (LLM-generated Python web code, 20220070)

Dear [Supervisor Name],

I am Ushan Gallage (Student ID: 20220070), currently preparing my Final Year Project for the BSc (Hons) Software Engineering programme. I am especially interested in cybersecurity, secure SDLC, and AI-related security risks, and I would like to know whether you would be willing to supervise me.

## Proposed topic

**Security-Calibrated Detect–Explain–Repair–Verify for LLM-Generated Python Web Code (CalibraGuard)**

**Problem.** Developers increasingly use LLMs to generate Python web code, which often contains vulnerabilities (for example SQLi, XSS, log injection, and insecure cryptography). Existing Detect–Repair–Verify approaches can improve scanner results, but repairs may still be overconfident, functionally broken, or poorly explained — so “scanner-clean” does not always mean trustworthy.

**Research gap.** Prior work shows that LLMs generate insecure code and that repair loops help. What remains weak is (1) **security calibration** (does the system’s confidence match actual post-repair security?), (2) **explanation quality/usability**, and (3) **when the system should abstain** instead of forcing a risky fix.

**Proposed contribution.** Design, develop, and evaluate **CalibraGuard**, an explanation-aware Detect–Explain–Repair–Verify framework with confidence gating for a small, named set of CWEs in LLM-generated Python web code. The evaluation compares **Detect-only vs Fix-once vs Calibrated Fix+Verify** on the same snippets.

## Why this is a Software Engineering FYP

This is not a survey-only security essay and not a claim to invent a new industry SAST product. It is a **named framework**, a **working prototype**, and a **measurable comparison** with frozen data, explicit baselines, and threats to validity. That matches an SE project: specify, build, evaluate, and report.

## SMART objectives

1. **Scope (Specific, Time-bound).** By the end of the design phase, freeze four CWEs only — CWE-89, CWE-79, CWE-117, CWE-327 — on Flask/Django snippets, with written in-scope / out-of-scope rules.
2. **Artefact (Achievable, Relevant).** Implement CalibraGuard so a snippet can be run through Detect → Explain → confidence gate → Repair → Verify, including an explicit **abstain** outcome when confidence is below a threshold.
3. **Evaluation set (Measurable, Time-bound).** Build a frozen labelled set of at least 60 snippets (public benchmark prompts plus a small self-generated Flask/Django set from two or more LLMs), with a documented labelling rubric and a manually audited sample.
4. **Experiment (Measurable).** Report, for Detect-only, Fix-once, and CalibraGuard: detection P/R/F1; security-clean rate; functional-test pass rate; calibration (ECE and Brier); and abstention coverage versus residual vulnerability rate.
5. **Dissertation (Time-bound).** Submit the prototype, evaluation tables, and dissertation to the official IIT/Westminster FYP deadlines once those dates are confirmed from the module handouts.

I would be grateful for your feedback on whether this topic aligns with your supervision interests, or any refinements you recommend (especially CWE scope, dataset size, or whether a small explanation-usability rubric should stay in scope).

Thank you for your time and consideration.

Kind regards,  
Ushan Gallage  
Student ID: 20220070  
ushan.20220070@iit.ac.lk  
BSc (Hons) Software Engineering, IIT / University of Westminster
