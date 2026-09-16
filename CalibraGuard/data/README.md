# Data

Reserved for the frozen evaluation set (later milestone).

## What will live here

| Path | Purpose |
| --- | --- |
| `seeds/` | Prompt IDs, generator model names, and random seeds committed to git |
| `labels/` | CWE labels and manual-audit sample (CSV/JSON) |
| `raw/` | Downloaded public datasets — **gitignored** |
| `generated/` | LLM-produced Flask/Django snippets — **gitignored** until curated |

Do not commit API keys, full LLM dumps, or exploit PoCs against live systems. See [docs/06-evaluation-plan.md](../docs/06-evaluation-plan.md) and [docs/07-ethics-risks-plan.md](../docs/07-ethics-risks-plan.md).
