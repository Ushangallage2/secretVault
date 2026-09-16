# Handout alignment

**Status:** Official IIT FYP handouts were **not attached** to the Cloud Agent that created this starter. Until they are, this pack uses a **Westminster-style research-project skeleton** (problem, aim, SMART objectives, method, evaluation, risks, plan). It is **not** a guessed official cover sheet.

When you attach the PDFs/Word files in a later chat (on the dedicated CalibraGuard repo), rewrite this page first, then retitle the other `docs/` files to match the school’s exact section names, word counts, and filenames.

## What we will copy from the handouts (checklist)

- [ ] Official module code and module title (currently listed as 6COSC012C — confirm)
- [ ] Required proposal filename and file type (PDF/DOCX)
- [ ] Word count and ±% tolerance
- [ ] Mandatory headings (do not invent extra top-level chapters if the template forbids them)
- [ ] Deadline for proposal, interim review, dissertation, demo/viva
- [ ] Referencing style (Harvard vs IEEE — IIT computing often uses Harvard or IEEE; **follow the handout**)
- [ ] Ethics form / plagiarism declaration
- [ ] Supervisor allocation process
- [ ] Marking scheme (so the evaluation plan uses the same vocabulary: “prototype”, “testing”, “critical evaluation”)

## Suggested mapping (until the official ToC exists)

| This repo file | Typical IIT / Westminster proposal heading | Notes |
| --- | --- | --- |
| `00-supervisor-email.md` | Supervision request (not always submitted) | Send as email; do not invent a school letterhead |
| `01-proposal.md` §1 Abstract | Abstract / Overview | Trim to the handout’s word limit |
| `01-proposal.md` §2–3 | Background / Problem / Literature preview | Expand from `03-literature-matrix.md` |
| `01-proposal.md` §4–6 | Aim, objectives, research questions | Copy SMART list verbatim if they want numbered objectives |
| `01-proposal.md` §7 | Scope / exclusions / assumptions | Keep the four-CWE limit visible |
| `04-methodology.md` | Methodology / approach | Include the three experimental conditions |
| `05-cwe-scope.md` | Functional scope / requirements | Translate CWEs into “in-scope vulnerability classes” if they dislike CWE IDs in the intro |
| `06-evaluation-plan.md` | Testing / evaluation / success criteria | Examiners look for measurable tests; this is that section |
| `07-ethics-risks-plan.md` | Ethics, risk register, Gantt | Replace indicative weeks with the real calendar |
| `references.bib` | References | Export to Word/PDF in the required style |

## Word-count placeholder (do not treat as official)

Until the handout is attached, keep the **proposal** in the region of **1,500–2,500 words** excluding references (a common UK computing proposal band). If the handout says 2,000 ±10%, cut `01-proposal.md` to that cap and leave method detail in `04`/`06` as appendices only if the template allows appendices.

## File names for submission

Do **not** submit `01-proposal.md` raw unless the school accepts Markdown. Expected conversion:

`20220070_Gallage_FYP_Proposal.pdf` — **confirm** against the handout before using this name.

## After handouts arrive — required edits

1. Fill the checklist above with quotes/page numbers from the PDFs.
2. Rename headings in `01-proposal.md` to the official ToC (do not keep “Westminster-style” labels in the submitted PDF).
3. Put real dates into `07-ethics-risks-plan.md` section 4.
4. Switch `references.bib` export style to whatever the handbook names.
5. Tick this paragraph when done: `_Alignment completed on YYYY-MM-DD against handout version ____._`
