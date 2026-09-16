# CalibraGuard

**Security-Calibrated Detect–Explain–Repair–Verify for LLM-Generated Python Web Code**

Final Year Project (FYP) for the BSc (Hons) Software Engineering programme at IIT, University of Westminster.

| Field | Value |
| --- | --- |
| Student | Ushan Gallage |
| Student ID | 20220070 |
| Email | ushan.20220070@iit.ac.lk |
| Module | 6COSC012C Computer Science / Final Year Project |
| Topic | CalibraGuard (Topic 1) |
| Status | Docs-first starter — no prototype yet |

This repository (or folder) is the **durable project home**. Chat history is disposable. Git is the project.

---

## Why this project exists

Developers increasingly use large language models (LLMs) to generate Python web code. That code often contains vulnerabilities such as SQL injection, XSS, log injection, and weak cryptography. Detect–Repair–Verify loops can reduce scanner findings, but a “scanner-clean” patch can still be overconfident, functionally broken, or poorly explained.

**CalibraGuard** is an explanation-aware Detect–Explain–Repair–Verify framework with **confidence gating**. When it is not confident that a repair is actually secure, it **abstains** instead of forcing a risky fix.

The FYP compares three conditions on the same snippets:

1. **Detect-only**
2. **Fix-once** (repair with no gate)
3. **Calibrated Fix+Verify** (CalibraGuard)

---

## Start here (in order)

1. [docs/00-supervisor-email.md](docs/00-supervisor-email.md) — send this (Topic 1 only).
2. [docs/01-proposal.md](docs/01-proposal.md) — paste into the official IIT template after handouts are attached.
3. [docs/02-research-questions.md](docs/02-research-questions.md) — locked RQs for one FYP.
4. [docs/03-literature-matrix.md](docs/03-literature-matrix.md) — reading map so you do not re-learn from scratch.
5. [docs/04-methodology.md](docs/04-methodology.md) — pipeline and experiment design.
6. [docs/05-cwe-scope.md](docs/05-cwe-scope.md) — four CWEs, Flask/Django only.
7. [docs/06-evaluation-plan.md](docs/06-evaluation-plan.md) — metrics, dataset, baselines.
8. [docs/07-ethics-risks-plan.md](docs/07-ethics-risks-plan.md) — ethics, risks, Gantt-style plan.
9. [docs/08-handout-alignment.md](docs/08-handout-alignment.md) — map these files onto the official handout headings.
10. [docs/references.bib](docs/references.bib) — BibTeX starter set.

---

## Access from any PC

Cloud Agent is **not** a cloud copy of your laptop. Durable work lives in Git.

1. Create a dedicated GitHub repo named `CalibraGuard` (this folder is currently hosted on a Secret Vault branch only because this Cloud Agent could not create a new GitHub repo).
2. Copy this `CalibraGuard/` tree into that repo (see [MOVE-TO-OWN-REPO.md](MOVE-TO-OWN-REPO.md)).
3. From any PC: `git clone` that repo, or start a Cloud Agent **on the CalibraGuard repo**.
4. Commit proposal edits, literature notes, and later code. Do not rely on Cursor chat history.

---

## Folder structure

```
CalibraGuard/
  README.md
  MOVE-TO-OWN-REPO.md
  docs/                 # proposal pack (this milestone)
  literature/notes/     # one-page paper notes
  data/                 # datasets later (not this milestone)
  prototype/            # pipeline stub later (not this milestone)
  results/              # tables/figures later
```

---

## What is deliberately not here yet

A runnable Detect–Explain–Repair–Verify prototype. That is the **next** milestone after the proposal is accepted and the evaluation set is frozen.

---

## Licence / academic use

This is an assessed student project. Do not submit generated text as if it were unmarked original writing without following IIT academic integrity rules. Use these files as a working draft, then rewrite in your own academic voice before submission.
