# Evaluation plan

Goal: answer [02-research-questions.md](02-research-questions.md) with numbers an examiner can reproduce from git, not with screenshots of a chatbot.

## 1. Dataset

**Target size:** at least **60** snippets after filtering, aiming for a balanced-ish mix:

| Slice | Approx. share | Source |
| --- | --- | --- |
| Public benchmark prompts | ~50% | LLMSecEval / SecurityEval-style items that map to the four CWEs and can be instantiated as Flask/Django |
| Self-generated | ~50% | Same prompts (or close paraphrases) run through **two or more** code models |

**Freeze protocol**

1. Write `data/seeds/index.csv` with `prompt_id,cwe,source,generator_model,temperature,seed`.
2. Generate once. Do not silently regenerate after seeing results.
3. Hold out a **development** subset (~20%) for choosing threshold \(\tau\) only.
4. All headline tables use the remaining **test** subset.

If a public dataset licence forbids redistribution, commit hashes and IDs only; keep raw files gitignored.

## 2. Security oracle

A snippet (original or repaired) is **vulnerable** for a CWE if:

1. A pinned scanner rule in that CWE family fires, **or**
2. The manual rubric says the sink is reachable with attacker-controlled data (for the audit sample).

**Manual audit sample:** stratified by CWE and condition, at least 20 snippets or 20% of the test set, whichever is smaller. Rubric (pass/fail):

- Is there a source (request data, URL, header, file upload)?
- Is there a dangerous sink (SQL, HTML, log, crypto primitive)?
- Is sanitisation / parameterisation / a strong primitive actually present?

Disagreements: record them; do not silently “fix” labels after seeing CalibraGuard scores.

## 3. Metrics

### Detection (Detect-only, also the first stage of the other conditions)

For each CWE and micro-averaged:

- Precision, recall, F1 against the original-snippet labels.

### Repair quality (Fix-once vs CalibraGuard)

On snippets the condition *attempts* to repair:

- **Security-clean rate:** oracle says not vulnerable after the emitted patch.
- **Functional pass rate:** AST parse + snippet tests pass.
- **Insecure-but-accepted rate (RQ1):** among patches the condition treats as success, fraction that are still vulnerable.  
  - Fix-once “success” = it emitted a patch (and optionally scanner-quiet).  
  - CalibraGuard “success” = Verify ACCEPT only.

### Calibration (RQ2)

For CalibraGuard, treat \(\hat{p}\) as predicted probability that a gated repair will be oracle-secure after Verify.

- **Brier score:** mean \((\hat{p} - y)^2\)
- **ECE:** reliability diagram with a documented number of bins (start with 10, show counts per bin)

Also report the degenerate baseline: Fix-once as \(\hat{p}=1\) for every attempted repair.

### Abstention (RQ3)

- **Coverage:** fraction of snippets not abstained.
- **Residual vuln rate on abstain set:** if those snippets are force-patched with Fix-once, how often do they stay vulnerable?
- Plot coverage vs residual risk while sweeping \(\tau\) on the **dev** split; freeze \(\tau\) before test.

### Explanations (RQ4, optional)

Five-item rubric, 1–5 Likert, on 5–10 snippets: CWE identity, location, why, fix intent, residual uncertainty. Compare scanner-only vs CalibraGuard explanation objects. Report medians only; no p-hacking.

## 4. Analysis

- Per-CWE and overall tables.
- Do not claim statistical significance unless sample size and a pre-registered test (e.g. McNemar on paired insecure-but-accepted flags) are both present. For 60 snippets, **descriptive tables + confidence intervals** are enough for an FYP.
- Record model names, dates, and tool versions in every run JSON.

## 5. What would count as success for the FYP (not for a conference)

The project succeeds if:

1. The three conditions run on the frozen set with committed scripts.
2. RQ1–RQ3 have complete tables, including negative or mixed results.
3. Threats to validity are honest about scanner-clean ≠ secure.

It does **not** fail if CalibraGuard only helps on two of four CWEs — that is a result.

## 6. Reproducibility checklist

- [ ] Tool versions pinned
- [ ] Seeds committed
- [ ] Threshold \(\tau\) chosen on dev only
- [ ] Raw runs under `results/runs/` (gitignored) plus a curated `results/tables/` summary
- [ ] No API keys in git
