# Literature matrix

This table is a **map**, not a completed literature review. Fill a [notes template](../literature/notes/TEMPLATE.md) when you actually read a paper. Add rows; do not delete the seed rows.

Legend for coverage columns: **Y** = central to the paper, **P** = partial / adjacent, **N** = not addressed.

| Key | Year | Venue / artefact | Detect | Repair | Verify | Explain | Calibration | Abstain | Python web | Gap vs CalibraGuard |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pearce2022asleep | 2022 | IEEE S&P | P | N | N | N | N | N | P | Shows Copilot often emits vulnerable code; no repair pipeline or calibration. |
| perry2023users | 2023 | ACM CCS | P | N | N | N | N | N | P | Users + assistants write more insecure code; human study, not a D-E-R-V tool. |
| tony2023llmseceval | 2023 | MSR | Y | N | N | N | N | N | Y | Prompt dataset for NL→secure code; evaluation resource, not a calibrated repair gate. |
| siddiq2022securityeval | 2022 | dataset | Y | N | N | N | N | N | Y | Security-oriented code-gen dataset; no explain/repair/verify loop. |
| bhatt2023cyberseceval | 2023 | CyberSecEval | Y | N | P | N | N | N | P | Broad LLM security eval (incl. completion); not a developer-facing abstention gate. |
| bandit | — | PyCQA tool | Y | N | P | P | N | N | Y | Strong Python SAST signal; confidence is rule severity, not calibrated repair confidence. |
| semgrep | — | tool | Y | N | P | P | N | N | Y | Rule-based detect; no LLM repair calibration. |
| codeql | — | GitHub | Y | N | P | P | N | N | Y | Powerful queries; heavy to run; still not a confidence-gated repair policy. |
| jit-detect-repair-2026 | 2026 | detect–remediate pipeline | Y | Y | Y | P | N | N | Y | Closest pipeline shape (scan → enrich → fix → re-scan). Weak on calibration, abstention, and explanation usability as first-class outcomes. |
| guo2017calibration | 2017 | ICML | N | N | N | N | Y | N | N | Defines ECE-style calibration for neural nets; must be *adapted* to security oracles. |
| geifman2017selective | 2017 | NeurIPS | N | N | N | N | P | Y | N | Selective classification / abstention theory; not applied to LLM code repair. |
| sarif | — | OASIS SARIF | P | N | N | P | N | N | P | Standard finding format; useful interchange, not a research contribution. |

## How to use this in the dissertation

Chapter 2 should not be a paper dump. Group related work under four headings that match the gap:

1. Insecure LLM-generated code and datasets
2. Static analysis and Detect–Repair–Verify loops
3. Explanations for security findings
4. Calibration and abstention (borrowed from ML, applied here to repair trust)

End the chapter with an explicit sentence: *None of the above combine explanation-aware confidence gating and abstention for LLM-generated Python web repairs with a three-way SE evaluation.*

## Reading order (first six)

1. pearce2022asleep  
2. tony2023llmseceval  
3. siddiq2022securityeval  
4. One recent Detect–Repair–Verify / JIT remediation paper (update the `jit-detect-repair-2026` row with the exact citation when you download the PDF)  
5. guo2017calibration (methods only — ECE/Brier)  
6. Bandit + Semgrep rule docs for the four CWEs in [05-cwe-scope.md](05-cwe-scope.md)

BibTeX for seed keys: [references.bib](references.bib).
