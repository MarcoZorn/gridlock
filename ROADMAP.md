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

Snapshots now restore exactly (every car's and pedestrian's state, the random
stream and the queues; `test.mjs` checks 3000 steps). Replays run before
2026-10-30 used older snapshots that re-placed every car on restore, so for
them the same-noise control did not follow the original run; their results
stand, as replays of a lightly shaken city.

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

## While runs are going: the backlog

A session waiting on long runs takes the first open item here, does it
properly (with a test where it is code), and ticks it off. No idling.

- [x] gridlock: common random numbers, a random stream per car and purpose
  behind `ECON.keyed`, with a test that a rule touching nothing leaves the
  run identical.
- [x] gridlock: a smoke test for `tools/trial.mjs` and `tools/replay.mjs`
  (two seeds, one city hour) in `test.mjs`.
- [ ] gridlock: profile a one-day economy and make it faster; every saved
  second is more replays a night. Measure before and after.
  (Profiled 2026-10-30, Turin seed 7, 15000 steps, 4.1-4.4 s CPU: the ray
  march in `Driver.sense` plus `City.contains` and the spatial hash is about
  a third, `Genome.activate` about a tenth. Binding `contains` once per
  sense changed nothing measurable. A real gain needs fewer wall probes per
  car per tick, which changes results; not done.)
- [ ] gridlock: the eco page gets a Rewind button (snapshot every city hour,
  restore any of them), now that restores are exact.
- [ ] gridlock: `tools/policies.mjs` reads the twenty-seed trial runs where
  they exist instead of the four-seed ones.
- [x] cars: `bench.py` reports a 95% bootstrap interval for held-out laps
  across seeds, like `tools/trial.mjs`.
- [ ] cars: a test that `track_room` keeps every pinch passable at
  hardness 2 too.
- [x] neat-from-scratch: a hard-tracks toggle on the page, and the leader
  shown is the one picked on many tracks, not the record-holder. (Already
  there: a Hard tracks button, and the page shows this generation's best,
  never the record-holder.)
