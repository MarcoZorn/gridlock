# Working on gridlock

No build step, no dependencies: Node and a browser.

## Tests

```
node test.mjs
```

Prints `ok ...` per check and `all checks passed`; the exit code is the verdict. It takes a few
minutes, and two runs at once can trip over each other's run directories under `runs/`, so wait
for one to finish before starting another. Every new tool or behaviour comes with a check in
`test.mjs`.

## Where results go

- `docs/NOTEBOOK.md`: every result as it happens, corrections included, never rewritten.
- `docs/claims.jsonl`: the claims under test (see the rules below).
- `README.md`: changes only when a claim is confirmed or killed.
- `findings.html` reads `docs/claims.jsonl`; nothing to edit there for a new claim.

## Rules of the lab

The full text is in [ROADMAP.md](ROADMAP.md). In short:

- At most five open claims. A new one starts when an old one is confirmed or killed.
- A claim has a command that reproduces it and a prediction, written and committed before the run.
- Effects come with intervals: `tools/trial.mjs` on twenty paired seeds, Wilson intervals for proportions.
  Two to four seeds is a hint, not a result.
- A claim that dies is written up as plainly as one that lives.
- Replay results come only from the summary `tools/replay.mjs` prints.
- Every number you write is copied from a command's output, not typed from memory.

## Long runs

They outlive a terminal: `systemd-run --user --unit=name script.sh`, logging to `tmp/`, and a line in
`tmp/RUNNING.txt` saying what is running. `tmp/` is not committed.

## Commits

Small, one idea each, terse messages. Check `git status` before committing: other people's
files are not yours to add.
