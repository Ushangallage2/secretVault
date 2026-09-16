# Ethics, risks, and project plan

## 1. Ethics

| Topic | Decision |
| --- | --- |
| Human participants | None required for RQ1–RQ3. RQ4 uses the student (and optionally one peer) rating explanations of **synthetic** snippets. If the school requires clearance for even that, drop RQ4. |
| Live systems | Do not scan, exploit, or load-test systems you do not own. |
| Data | Public benchmark prompts and self-generated snippets. No production customer data. |
| Dual use | Explanations may include a *non-operational* “why this is dangerous” sentence. Do not ship exploit kits, payloads against third parties, or instructions to weaponise findings. |
| Secrets | LLM API keys live in environment secrets / `.env` (gitignored). |
| Academic integrity | These markdown files are working notes. Submitted dissertation text must follow IIT/Westminster citation and originality rules. |

## 2. Threats to validity (write these into the dissertation early)

| Threat | Why it matters | Mitigation |
| --- | --- | --- |
| Scanner-clean ≠ secure | Bandit/Semgrep miss issues and false-positive | Manual audit sample; verify ≠ accept on scanners alone; discuss residual risk |
| Dataset bias | Public prompts leak into LLM training data | Mix self-generated prompts; report generator models; do not over-generalise |
| Confounded repair loops | Extra retries make CalibraGuard look better | Primary experiment: one repair attempt; retries only as a labelled sensitivity run |
| Threshold fishing | Choosing \(\tau\) on the test set inflates RQ3 | Dev/test split; freeze \(\tau\) |
| Framework narrowness | Flask/Django snippets ≠ production microservices | Scope claim explicitly in abstract and conclusion |
| Examiner reproducibility | API models drift | Pin dates, model IDs; keep snippets in git when licences allow |

## 3. Risk register (project management)

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Supervisor prefers a different CWE set | M | M | Scope file is one page; easy to swap one CWE |
| LLM API cost / rate limits | M | M | Small frozen set; cache generations; prefer one local model if needed |
| CodeQL too heavy for the Cloud Agent VM | M | L | Bandit+Semgrep are sufficient for the primary oracle |
| Handouts / deadline mismatch | H until PDFs attached | H | [08-handout-alignment.md](08-handout-alignment.md); do not invent submission dates |
| Scope creep into “full SAST product” | H | H | Four CWEs, CLI-first, three conditions only |
| Lost chat history | H (already happened) | H | Git is the project; see root README |

## 4. Work plan (semester-agnostic)

Replace week numbers with official dates after handouts arrive. Assume a single academic year, proposal first, dissertation last.

| Phase | Weeks (indicative) | Output |
| --- | ---: | --- |
| A. Proposal and supervisor agreement | 1–3 | Email sent; this repo; scope frozen |
| B. Literature | 3–7 | Matrix rows filled; notes for the first six papers |
| C. Dataset freeze | 6–10 | `data/seeds/index.csv` + labels + audit rubric test |
| D. Prototype | 8–16 | CLI pipeline, three conditions |
| E. Experiment | 16–20 | Tables for RQ1–RQ3 |
| F. Dissertation write-up | 18–24 | Chapters aligned to the official template |
| G. Buffer / viva prep | last 2–3 | Fixes, demo script |

Dependencies: C before E; D can overlap C but must not change frozen IDs after E starts.

## 5. Resources

- Python 3.11+, Bandit, Semgrep
- Optional: CodeQL, pytest
- LLM API (one hosted model is enough for repair; two generators for the dataset)
- GitHub + Cursor Cloud Agent on the **CalibraGuard** repo once split out of Secret Vault
