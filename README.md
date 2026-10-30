# Gridlock

**A city with no traffic laws in its code, where the drivers evolve.**

[Run it in your browser](https://marcozorn.github.io/gridlock/) ·
[the economy with no fitness function](https://marcozorn.github.io/gridlock/eco.html) ·
[on Turin](https://marcozorn.github.io/gridlock/eco.html?map=turin) ·
[Barcelona](https://marcozorn.github.io/gridlock/eco.html?map=barcelona) ·
[Manhattan](https://marcozorn.github.io/gridlock/eco.html?map=manhattan) ·
[the lab notebook](docs/NOTEBOOK.md) ·
[what is being studied now](ROADMAP.md)

![Generation 600: trained drivers spread across a procedural city](docs/city.png)

## The question

Roads, physics, collisions and route finding are written by hand. How to
drive is not: every car is a small neural network that grows its own
structure by neuroevolution (NEAT), and the only thing it learns from is
what happens to it on the road.

So: once everyone shares the streets, do drivers invent queueing, yielding
and a side of the road by themselves? Do they split into species, couriers
and trucks? And when nobody scores them at all, when a car simply has to
earn more than it spends to survive and have children, what kind of city
comes out?

Gridlock runs in the browser on generated cities and on real street maps
from OpenStreetMap (Turin, Barcelona, Manhattan, Venice, or any place you
type), and headless in Node for long experiments.

## Two worlds

**The generation city.** Classic neuroevolution: 120 drivers race fares
through six rotating cities, are scored on trips and damage, and the best
breed. This is where driving itself is learned.

**The economy.** No fitness function. Each car has a wallet: fares and
freight pay in, fuel, wear and crash damage pay out. A car that saves
enough has a child, a mutated copy of its brain and body; a car that goes
broke is gone. Demand follows the hours of a day. Rules can be switched on
like a city council would: tolls, speed cameras, insurance, a basic income,
licences, a second platform. Selection is whatever survives them.

| written by hand | evolved |
|---|---|
| road graph, lanes, junctions, A* routes | speed and steering along the route |
| car physics and collisions | when to brake, what to do when someone is in the way |
| traffic lights and roundabouts, when on | whether to respect them |
| the economy's prices | the body: size, engine, brakes, sensors, cargo room |

A car senses five rays (distance to a wall, to a car, and how fast that car
is closing), its speed, the heading and offset to its route, the next
junction and its light. It never sees the map.

## What it has found

Results with a number below are measured; how, on how many seeds, and the
corrections along the way are in the [notebook](docs/NOTEBOOK.md). Most
were measured on two to four seeds, which is why the programme now
re-tests them (see *How sure*, below).

**Driving**
- **Drivers generalise to cities they never saw**, and do better on real
  streets than on the generated ones they were raised on (1.3 to 2.8
  crashes per 1000 units on Manhattan, Barcelona and Turin against 3.5).
- **They queue but do not yield.** They follow the car ahead and rarely
  overtake. Right of way never evolved, in a whole city or on a single
  crossroads, until a junction crash was priced at thirty times an ordinary
  one; even then it cost them elsewhere.
- **They are reflex machines.** A fifth of a second of reaction delay, a
  quarter of a human's, quadruples crashes. No textbook car-following model
  describes them, but one brain at a time is predictable: what it sees
  explains up to 77% of its acceleration.
- **In fog they speed up**, reading the edge of their shortened sight as
  open road; raised in fog, they learn to slow down.

**What evolves with no fitness function**
- **A side of the road, by chance.** With enough cars, three in four to
  nine in ten keep to one side within four days; which side differs
  between identical runs. The order grows smoothly with traffic, with no
  sharp transition.
- **One family takes the city.** In three of four runs, every car descends
  from a single founder within three to six days. Wealth itself is not
  inherited (parent and child earnings are uncorrelated); numbers are.
- **The cheapest car wins**, small and short-sighted, unless freight pays
  enough to make trucks worth it, and then only for a while.
- **Drivers spread across competing platforms as ecology predicts**, in
  proportion to what each pays out (the ideal free distribution), without
  any driver ever choosing.

**Rules and prices**
- **Every safety rule has the same price: a little safer, a lot poorer.**
  An all-day congestion charge, licences and a rush-hour toll make the city
  safer and faster in every seed tried, and all of them cost fares. For the
  charge this now holds at twenty seeds: 45% fewer cars, crashes per car
  down 24% (95% interval 21-27%), trips 29% faster, fares down 18%
  (15-21%), in every seed. With mutation frozen after day 2 in both
  arms the trade stays: crashes per car -31.4% [-35.0%, -27.7%], fares -15.0%
  [-18.5%, -11.6%] (C11, confirmed), so it is the economy, not evolution. With a
  hand-written driver that cannot evolve at all it holds too: crashes per car
  -40.3% [-48.6%, -33.0%], fares -57.0% [-68.8%, -45.8%] (C12, confirmed). Rules that lower inequality slow the trips or
  shrink the city.
- **Rules about failure matter more than rules about driving.** Letting a
  broke taxi finish its ride and pooling crash costs nearly doubled fares:
  +86.8% [+81.9%, +91.1%] over twenty seeds (C14, confirmed), with crashes per
  car up 91.4% [+87.0%, +95.9%] and the city twice as big. Whether that beats
  any change to the drivers is not re-tested.
- **Credit and insurance buy activity with recklessness.** A 30-unit overdraft
  raises fares by 28% (interval 26-30%) and crashes per car by 25% (22-28%),
  twenty seeds; insured drivers
  crash 87% more per car (interval 82-91%, twenty seeds) and earn a third
  more (+34%), because the reckless stop going broke.

**The street network**
- **Real one-way cities are fragile.** Close 5% of road segments at random
  and half of Turin, Barcelona or Manhattan can no longer reach the rest;
  a grid loses 1%. The busiest roads are not the critical ones.
- **One-way arrows cost fares and buy no safety.** Barcelona with its streets two-way
  instead: fares a day +18.2% [+15.7%, +20.6%] over twenty seeds, trip time -17.5%,
  crashes per car -0.9% [-3.6%, +1.7%] (C10, confirmed). With hand-written drivers that cannot evolve the
  crash half does not hold: crashes per car +276.1% [+85.4%, +498.8%] (C13, killed).
- **No Braess paradox.** Of every road in the three cities that can be
  closed without stranding a trip, none saves more than 0.07% of travel
  time.

**Things that did not happen**
- No phantom jams, no self-organised criticality in jam sizes, no signalling
  language when given an indicator, no kin selection, no open-ended growth
  in diversity (about six species at any time, constantly replaced).

**About the method itself**
- **A flaw in NEAT's species control.** With a step of 0.3 the threshold
  flips between two values every generation; at 0.02 it settles, and
  evolution does better from scratch in three seeds of three.

## How sure

Most of the above was measured on two to four seeds, and several results
flipped when seeds were added. The project is now turning into an
instrument that re-tests itself:

- `tools/trial.mjs` runs a rule against no rule on twenty paired seeds and
  reports each effect with a 95% bootstrap interval.
- `docs/claims.jsonl` holds the claims under test, each with its command
  and a prediction written down before the run.
- The [notebook](docs/NOTEBOOK.md) keeps every result as it was first
  measured, with its corrections.

## Now

**When is a monopoly decided?** One family always ends up owning the city.
Rewind the economy to every third hour of day 0 and replay it thirty-two
times with fresh noise: how often does the same family win again (over
half the cars)? On Turin seed 7, 0 of 32 replays from hour 0, 1 from hour
3, 15 from hour 6, 22 from hour 9, and all 32 from hour 12: decided within
the first morning, while the family holds under two fifths of the cars.
On seed 11 it is not decided on day 0 at all (a flat 3 to 19 of 32). On
seeds 7 and 11, freezing evolution after the rewind made the outcome surer
(seed 11, hours 18-21: 53 of 64 frozen against 31 of 64 evolving), but that
did not hold on six fresh Turin seeds rewound to hour 12 (52 of 96 evolving,
43 of 96 frozen, p = 0.248): no evidence that mutation keeps the contest
open. Barcelona seed 7 is like Turin seed 11: 1
of 32 replays from hour 0, 13 from hour 6, 17 from hour 21, never decided
on day 0. Venice seed 7 is also open at hour 12 (0 of 32 from hour 0, 14
from hour 12) and closes by hour 18 (26 of 32). Early decision is the
exception (one run of four). The leader does not beat its own share of the
cars reliably: on two fresh runs, 5 of 9 snapshots with the winner under half the
cars had its win-rate interval above the share, 0 below (C9, killed). Claims C1, C3, C6, C7, C8, C9, C10, C11, C12, C13 and C14 in [docs/claims.jsonl](docs/claims.jsonl) (`tools/replay.mjs`;
[ROADMAP.md](ROADMAP.md)).

## Running it

No libraries, no build step.

```
python3 -m http.server                     # then http://localhost:8000
node test.mjs                              # headless checks
node headless.mjs --run runs/x --gens 600 --traffic-from 200
node headless.mjs --eco --run runs/e --days 6 --founders docs/trained.json --map turin --econ basic=0.25
SEEDS=20 node tools/trial.mjs turin congestion=0.1    # a rule against none, with intervals
REPS=32 node tools/replay.mjs turin 7                 # rewind and replay an economy
node tools/explain.mjs <run>               # a run's story in plain words
node tools/osm.mjs extract.json maps/name.json "Place"
```

URL options include `?map=turin|barcelona|manhattan|venice`, `?seed=7`,
`?control=lights|roundabouts`, and any economy knob as `?econ=basic=0.25`.
The [notebook](docs/NOTEBOOK.md) has the full list and every tool.

## Files

| | |
|---|---|
| `src/city.js`, `src/driver.js`, `src/body.js` | streets and routes, a car's physics and senses, the body genome |
| `src/cityworld.js`, `src/ecoworld.js` | the generation city and the economy |
| `src/neat.js`, `src/genome.js` | NEAT, from [neat-from-scratch](docs/neat.md) |
| `index.html`, `eco.html`, `notebook.html` | the pages |
| `headless.mjs`, `tools/` | long runs and the experiments |
| `docs/NOTEBOOK.md`, `docs/IDEAS.md` | the full record, and 150 ideas with what was tried |

## Reading

- Stanley and Miikkulainen, [Evolving Neural Networks through Augmenting Topologies](https://nn.cs.utexas.edu/downloads/papers/stanley.ec02.pdf) (2002)
- Blount, Borland and Lenski, [Historical contingency and the evolution of a key innovation](https://www.pnas.org/doi/10.1073/pnas.0803151105) (2008)
- Fretwell and Lucas, on the ideal free distribution (1969)
- Dietrich Braess, [On a paradox of traffic planning](https://doi.org/10.1287/trsc.1050.0127) (1968, English translation 2005)
- Geoff Boeing, [Urban spatial order: street network orientation](https://arxiv.org/abs/1808.00600) (2019)

MIT.
