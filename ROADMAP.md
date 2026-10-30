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
- [x] gridlock: profile a one-day economy and make it faster; every saved
  second is more replays a night. Measure before and after. (The ray wall
  test inlined: 5.3 to 4.7 s of CPU for 20000 ticks of a 114-car Turin,
  identical results.)
- [x] gridlock: the same for the car rays: `SpatialHash.near` with its
  callback is next in the profile (about 16% with the callback body).
  Inline it in `Driver.sense`, keep results bit-identical (compare
  `tmp/prof2.mjs`'s signature), measure CPU time, not wall time.
  (Tried 11:50 with 60 replay workers running: bit-identical, but CPU time
  per 8000 ticks was 5.54 s new vs 5.59 s old over three alternating pairs,
  inside the noise. Reverted.) Re-measured on an idle machine (`tmp/prof2.mjs`,
  CPU time, alternating): 20000 ticks of the 114-car Turin, 4.50 and 4.45 s old
  against 4.49 and 4.45 s inlined, same signature. No gain (V8 already inlines
  the callback), so it stays as it was.
- [x] gridlock: now that snapshots restore exactly, a replay with seed 0
  must reproduce the original run: check it on a fresh snapshot with
  `tools/replay.mjs` and add that check to the smoke test.
- [x] gridlock: a table of contents at the top of `docs/NOTEBOOK.md`,
  generated by a small script from its headings, so 4000 lines can be
  navigated.
- [x] neat-from-scratch: Save run / Load run on the page (the population as
  JSON), with a test that a loaded run evolves exactly as the saved one.
- [x] gridlock: the eco page gets a Rewind button (snapshot every city hour,
  restore any of them), now that restores are exact.
- [x] gridlock: `tools/policies.mjs` reads the twenty-seed trial runs where
  they exist instead of the four-seed ones.
- [x] cars: `bench.py` reports a 95% bootstrap interval for held-out laps
  across seeds, like `tools/trial.mjs`.
- [x] cars: a test that `track_room` keeps every pinch passable at
  hardness 2 too.
- [x] neat-from-scratch: a hard-tracks toggle on the page, and the leader
  shown is the one picked on many tracks, not the record-holder. (Already
  there: a Hard tracks button, and the page shows this generation's best,
  never the record-holder.)
- [x] gridlock: Study 2 needs `tools/trial.mjs` to take `FREEZE=1` (no
  mutation after day 2, in both arms). Add it with a smoke test, then open
  a claim for the congestion charge frozen vs evolving.
- [x] gridlock: `tools/trial.mjs` on a map file (`maps/x.json` or a path),
  so the one-way claim can be re-tested: Barcelona with its arrows against
  the two-way copy in `tmp/barcelona-twoway.json`, twenty seeds.
- [x] gridlock: a findings page (`findings.html`) that reads
  `docs/claims.jsonl` and shows every claim with its status, prediction and
  result, linked from the site's nav. Plain HTML, no build step.
- [x] gridlock: a test for `tools/explain.mjs` on a short run (it prints,
  every number is finite, the sentences are there).
- [x] gridlock: refresh `docs/city.png` from the current build with
  headless Chrome after a few generations, so the README shows today's
  drivers.
- [x] neat-from-scratch: a "Replay from here" button: save the run at a
  generation, keep going, and on demand reload it with a new seed to see
  whether evolution finds the same thing twice (the tape idea, on a track).

- [x] gridlock: open the Study 2 claim (congestion charge, frozen vs evolving, `FREEZE=1`) in `docs/claims.jsonl`, queue the twenty-seed run after C10.
- [x] gridlock: Study 2's third arm, drivers that do not evolve at all: a
  hand-written controller (pure pursuit on the route target, slow for the
  next turn, brake for a car closing ahead) exposed as a brain with
  `activate(inputs, out)`, and `--founders hand` so an economy runs on it;
  children copy it unchanged. Test that it drives (trips, few crashes) on a
  generated city. (Done: `src/hand.js`, `--founders hand` in headless.mjs, which
  also freezes mutation. On Turin seeds 3 and 4, 20000 ticks, frozen, it made 147
  and 154 trips against 135 and 96 for the trained founders, but crashes more per
  km, 311 in 135 km and 309 in 144 km against 185 in 129 and 136 in 103; the test
  only requires trips and fewer than four crashes a km. Gain and speed tweaks did
  not lower it.)
- [x] gridlock: `docs/claims.jsonl` gets structured effects (measure, mean,
  low, high) for the trial claims, and the findings page draws each as an
  interval bar around zero.
- [x] cars: replaying the tape on the racing cars: save the population at
  generation 10, rerun from it with eight new seeds, and see whether the
  same species ends up on top (`bench.py`-style, a test for the save). (Done: `tools/tapecars.mjs`, test
  that a save resumes exactly. Seed 3 from generation 10: the eight replays end
  nearest to five different saved species, the modal one 2 of 8; seed 2 from
  generation 8: four species, the modal one 3 of 8. Notebook has the numbers.)
- [x] gridlock: a smoke test for `tools/trial.mjs` with `ALT=` (two maps)
  and with `FREEZE=1`, one seed, one city day.

### Bigger pieces (hours each; split into commits as they go)

- [x] gridlock: a "Study 1" page (`replay.html`): pick a saved economy and an
  hour, run sixteen replays in Web Workers in the browser, and draw the win
  rate as it comes in. The replay study, runnable by anyone.
- [x] gridlock: a time-lapse recorder on the eco page: capture a frame every
  city hour into a WebM with `MediaRecorder`, download button, so a day can
  be shared as a video.
- [x] gridlock: a lineage explorer on the eco page: click a car, see its
  ancestors back to the founder as a strip of their bodies and earnings, and
  its family's share of the city over time.
- [x] cars: a headless evaluation report (`report.py`) that writes an HTML
  page with every bench log's held-out laps and intervals, newest first.
- [x] neat-from-scratch: a guided tour mode on the page: five short steps
  (genome, mutation, speciation, crossover, the track) that highlight the
  live run and explain it, for people who have never seen NEAT.

### Next batch

- [x] gridlock: Study 3 (the reaper): a `tools/reap.mjs` that reads the
  README's headline bullets that still rest on two to four seeds, lists
  them with the command that would re-test each, and opens the oldest as a
  claim (one at a time, the five-open rule). (Done: of the README's 15 bullets under
  What it has found, only one is testable with `trial.mjs` and has no interval yet:
  "Rules about failure"; the rest need a study of their own.)
- [x] gridlock: the generation page gets the same Lineage card as the eco
  page, for the leader of the current generation (species, parents).
- [x] gridlock: an "About the method" section on the findings page:
  pre-registration, paired seeds, bootstrap and Wilson intervals, what was
  corrected and why; short, for a visitor who is not a statistician.
- [x] cars: `report.py` adds a chart page: held-out laps against settings
  for one swept parameter (rays, sight, delay), with intervals.
- [x] neat-from-scratch: the tour gets a sixth step for "Replay, new seed",
  explaining replaying the tape on this page.
- [x] all three: a short `CONTRIBUTING.md` per repo: how to run the tests,
  where results go, the rules of the lab for gridlock.


### Next batch, from C10 to C14

- [x] gridlock: why do hand-written drivers crash on one-way Barcelona (C13:
  crashes per car +276% in the two-way arm)? Run one hand-driver Barcelona
  economy per map variant, count crashes by kind (wall, car, junction) and by
  road, and say which part of `src/hand.js` fails there. Numbers from the
  telemetry only.
  (Partly: `tools/crashkinds.mjs`. The blow-up was collapsed economies, 7 of 20
  one-way runs against 4 of 20 two-way; which rule of `src/hand.js` fails is open.)
- [x] gridlock: log each crash's road, kind and speed in the telemetry (opt-in,
  `--crash-log`), then say which junctions or roads the hand driver crashes on.
  (Done: `ECON.crashLog`, `tools/crashmap.mjs`. Hand driver, Barcelona seed 102: 98.6%
  of one-way crashes are car-car, and ten roads hold 21.8% of them; two-way, 5.9%.
  Notebook has the numbers and a correction to the earlier "wall crashes" label.)
- [x] gridlock: what are the roads where the hand driver piles up on one-way
  Barcelona (482>483, 474>475, 468>469)? Say from the map what they have in
  common (merge, one-way into a junction, length), and test one guess with a
  change to `src/hand.js` that lowers their crashes without lowering trips.
  (Done in part: `tools/roadinfo.mjs`. Seven roads of one corridor, with a merge at 324,
  hold 13.5% of the crashes. More room to the car ahead (`GRIDLOCK_HAND_FOLLOW`)
  cut crashes per car-day from 133.2 to 60.8 but trips per car-day from 9.7 to 8.2:
  a trade. A give-way rule at merges is untried.)
- [x] gridlock: Study 3: give each README bullet that `tools/reap.mjs` marks
  "needs a study of its own" a one-line plan (which tool, how many seeds, what
  would count as a hit) in `RETEST`, shown in the list; the tool opens claims
  only for the ones that `trial.mjs` can run.
  (Done: `PLANS` in `tools/reap.mjs`, eleven of them, a test that every unplanned
  bullet fails. Two need new tools (fog, NEAT species step); two need `trial.mjs` to
  take BODY constants, which would make more bullets trial-able.)
- [x] gridlock: `trial.mjs` takes BODY constants (`BODY=rayRange=60`) next to the
  economy rule, passed to `headless.mjs --body`, with a smoke test; then fog and
  the reaction delay become claims.
  (Done: `BODY=` in `tools/trial.mjs`, smoke-tested. Fog and the delay are not BODY
  constants after all: evolved bodies have their own sight, and both live in
  `tools/drunk.mjs` (`FOG=`, `DELAY=`), so the reaper plans now say that. Opening them
  as claims needs drunk.mjs to run twenty seeds with an interval.)
- [x] gridlock: `tools/drunk.mjs` loops twenty seeds and prints an interval on crashes per
  1000 units for FOG= and DELAY= against none, so "in fog they speed up" and "a fifth
  of a second quadruples crashes" can be opened as claims.
  (Done: `SEEDS=` mode, smoke-tested, default output unchanged. Opened as C15 and C16.)
- [x] gridlock: Study 2, the dynasty takeover three ways: frozen replays
  already exist (`FREEZE=1 tools/replay.mjs`); the hand-driver arm has no
  family differences to take over, so say that in the notebook with the
  numbers from a one-day hand run (distinct species, distinct bodies).
- [x] gridlock: Study 2, dynasty takeover with hand drivers measured properly: `tools/replay.mjs`'s
  family tracking on twenty hand-driver runs (`--founders hand` through `tools/replay.mjs`, which today
  loads docs/trained.json only), the share of the biggest family at day 6 with a Wilson interval on
  runs above half, next to the same twenty evolved runs. Open the claim with its prediction first.
  (Done as `tools/families.mjs` and claim C17, killed: 12 of 20 hand runs above half
  against 19 of 20 evolved. The README's "three of four runs, every car" is 8 of 20.)

### Next batch, from the reaper's plans (C15 to C17)

Each: a tool that runs twenty seeds and prints an interval (with a smoke test), then the claim with its
prediction written first, then the run, then the README line.

- [x] gridlock: NEAT species step, `tools/stepcmp.mjs`: evolve from scratch with a compatibility
  threshold step of 0.3 and of 0.02, twenty seeds each, mean fitness at generation 60, paired
  bootstrap interval. Cheap (0.08 s a generation).
  (Done: tool, smoke test, claim C18 open, unit c18.)
- [x] gridlock: one-way fragility, `tools/percolation.mjs` with a SEEDS= mode: twenty random closure
  orders per city, the share of junctions still reachable at 5% of roads closed, Wilson or
  bootstrap interval, for Turin, Barcelona, Manhattan and the grid.
  (Done: the tool already averaged twenty orders; it now prints the interval and takes ORDER0= for
  fresh orders. C19 confirmed.)
- [x] gridlock: side of the road, `tools/sidechart.mjs` over twenty fresh seeds: the share keeping to
  one side after four days with an interval, and how many seeds keep right (a coin-flip check).
  (Done as `tools/sides.mjs` on the existing Turin trial runs, claim C20 killed: 7 of 20 reach 75%.)
- [x] gridlock: platforms, `tools/platforms.mjs` over twenty seeds: drivers' share against passengers'
  share per platform, slope with an interval.
  (Done: `SEEDS=` mode; C21 confirmed, -1.3 points. A slope across several price settings is untried.)
- [x] gridlock: why hand-driver economies collapse (C13, C17: 24 cars, 22 families): a collapsed run
  is one that never grew past its floor; count, per hand run, the day the city last had more than
  30 cars and what the telemetry shows then (crashes, cash, immigrants).
  (Done: `tools/collapse.mjs`. They never start: day-1 trips 57.8 against 1212.7 in Turin; every collapsed
  run peaks at its 50 starting cars.)
- [ ] gridlock: what decides the start? Hand-driver Turin seed 104 (collapsed) against seed 101 (thrives): trips,
  deaths and cash by city hour for the first day, and where the first fares are; one change to `src/hand.js` or
  the start that makes seed 104 start without making 101 worse.
- [ ] gridlock: a give-way rule at the merge for the hand driver (the corridor at 324), tested on Barcelona one-way
  seed 102 with `--crash-log`: crashes on the corridor and trips per car-day before and after.
