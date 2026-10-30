# Research programme

One question at a time, done properly, instead of many done once. The
earlier list of 150 ideas, and which were tried, is in
[docs/IDEAS.md](docs/IDEAS.md).

## Rules of the lab

- At most five open claims in [docs/claims.jsonl](docs/claims.jsonl). A new
  one starts only when an old one is confirmed or killed.
- Every claim has a command that reproduces it, and a prediction written
  before the run.
- Effects are reported with intervals: `tools/trial.mjs` for rules (twenty
  paired seeds), Wilson intervals for proportions. Two to four seeds is a
  hint, not a result.
- A claim that dies is written up as plainly as one that lives.
- Replay results come only from the summary `tools/replay.mjs` prints
  (saved in `tmp/replay-*.log`): a replay is won when the family ends with
  over half the cars. Counting replays where the family merely survives
  gave wrong tables twice.
- Results go into [docs/NOTEBOOK.md](docs/NOTEBOOK.md) as they happen; the
  README only changes when a claim is confirmed or killed.

## Study 1: when is a monopoly decided? (now)

In the economy one founder's family always ends up owning the city. Rewind
to an earlier hour and replay 32 times with fresh noise; plot the share of
replays the same family wins against the day rewound to. Replaying the
tape (Blount, Borland and Lenski 2008), applied to wealth concentration in
an evolving market.

1. The curve on Turin, seed 7: rewound to every third city hour of day 0,
   when the winner goes from one founder among fifty to over half the cars,
   plus the same with mutation frozen after the rewind (`tools/replay.mjs`).
   Rewinding by whole days was too coarse: the winner already holds half
   the city by the end of day 0. If the curve is flat, drop the study and
   move to Study 2.
2. A second seed, to see whether the decision always falls this early.
3. The trivial explanation to beat: "the biggest family stays biggest".
   Compare each day's win rate with the family's share that morning; the
   finding is only interesting if the outcome is decided before the share
   says so.
4. Two more cities and a second founder population before it is called a
   result.

Known limitation: restoring a snapshot re-places every car on a fresh fare,
so even a replay with the original noise does not follow the original run
(the "same-noise control" column). Replays measure what was decided by the
population, not by its exact positions.

## Study 2: economics or evolution? (next)

For each headline economic result, run it three ways: evolving drivers,
evolution frozen (`tools/frozen.mjs`, FREEZE), and fixed hand-written
drivers. A result that survives without evolution is about the economy; one
that needs it is about evolution. Start with the dynasty takeover and the
safety-for-fares trade.

## Study 3: the reaper (always)

Re-test the README's headline claims with `tools/trial.mjs` at twenty
seeds, one at a time, oldest first. Each either gets an interval or is
corrected in the README.

## Later

- The same claim on thirty real cities, regressed on street-network order
  (Boeing's orientation entropy), with the regressors chosen before.
- Common random numbers: a random stream per car and purpose, so a rule
  changes only what it touches. Needed before any chaos measurement.
