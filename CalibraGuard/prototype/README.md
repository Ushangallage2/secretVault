# Prototype

Reserved for the CalibraGuard pipeline stub (later milestone).

Expected later layout (do not implement in this docs-first starter):

```
prototype/
  detect/      # Bandit + Semgrep (+ optional LLM detector)
  explain/     # structured CWE / location / why / fix-intent
  calibrate/   # confidence + agreement → gate or abstain
  repair/      # LLM patch
  verify/      # re-scan, syntax, functional tests
  run.py       # Detect-only | Fix-once | CalibraGuard
```

See [docs/04-methodology.md](../docs/04-methodology.md).
