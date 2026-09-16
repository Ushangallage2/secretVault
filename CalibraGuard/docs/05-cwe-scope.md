# CWE scope

Four CWEs only. If a supervisor asks to cut further, drop CWE-117 first (log injection is important but easier to argue as “optional”). Do not add CWEs without shrinking the dataset or time plan.

## Included

| CWE | Name | Typical LLM-generated mistake in Flask/Django | Detector hooks (indicative) |
| --- | --- | --- | --- |
| **CWE-89** | SQL injection | String-formatted SQL, f-strings into `execute`, raw `extra()` | Bandit SQL rules; Semgrep Flask/Django SQL patterns |
| **CWE-79** | Cross-site scripting | `|safe`, `Markup()`, `html.unescape` into templates, disabled autoescape | Semgrep template/escaping rules; HTML sink patterns |
| **CWE-117** | Improper output neutralization for logs | User input concatenated into logs (CRLF / log forging) | Semgrep logging sinks; custom pattern for `logger.*` + request data |
| **CWE-327** | Use of a broken or risky cryptographic algorithm | `md5`/`sha1` for passwords, `random` for tokens, hardcoded `DES`/`ECB` | Bandit crypto blacklist; Semgrep hashlib/jwt anti-patterns |

Snippets must be **Python web**: Flask routes or Django views/ORM. A bare `hashlib.md5` script with no web context is out of scope unless it is clearly a view helper used by a route in the same snippet.

## Explicitly excluded (examples)

- CWE-78 OS command injection (unless it appears as collateral; do not *sample* for it)
- CWE-502 deserialization
- CWE-798 hardcoded credentials (tempting, but a different labelling story)
- XSS in JavaScript-only front ends
- GraphQL, FastAPI, Tornado (would explode framework-specific rules)
- Full authentication/session attacks, SSRF, IDOR as primary targets

## Snippet rules

1. One primary CWE target per prompt (a snippet may still contain extra findings; record them).
2. Length: enough to be a real view (roughly 20–120 lines), not a one-liner and not a whole app.
3. No live secrets. Use fake hosts and fake credentials clearly labelled `EXAMPLE`.
4. No exploit payloads against systems you do not own. Tests may use benign inputs such as `1 OR 1=1` **only** against a local throwaway SQLite file created by the test harness.

## Mapping to research questions

RQ1–RQ3 are reported **overall and per CWE**. If a CWE has fewer than ~10 labelled vulnerable snippets, report it as exploratory rather than as a headline claim.
