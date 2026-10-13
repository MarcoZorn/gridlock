# Gridlock

A city where traffic evolves. There are no traffic laws anywhere in this code.

![Generation 250: evolved drivers spread across a procedural city](docs/city.png)

Every car is a NEAT brain. The roads, the physics, collisions and route finding
are written by hand; how to drive the route is not. The question this project
is building towards is whether, once everyone shares the streets, drivers invent
yielding, queueing and lane discipline on their own, or split into species like
couriers and trucks, or just gridlock.

It grew out of [neat-from-scratch](docs/neat.md), whose NEAT engine it still
runs on, and borrows its later ideas from
[primordial](https://github.com/MarcoZorn/primordial). No libraries, no build
step: serve the folder and open `index.html`.

```
python3 -m http.server   # then http://localhost:8000
node test.mjs            # headless checks, including "does evolution work"
```

## What is coded and what is evolved

| coded | evolved |
|---|---|
| the road graph, lanes, junctions | speed |
| car physics and collisions | steering along the route |
| A* route from origin to destination | when to brake for a corner |
| the spatial hash for "who is near me" | what to do when someone is in the way *(week 2)* |

A car senses, and nothing more:

- five rays, each reporting distance to a wall, distance to a car, and how fast
  that car is closing
- its own speed
- the heading error to a point 35 units further along its route
- how far it is from the centreline of the road it should be on
- distance to the next junction, and how sharply the route turns there

It never sees its position, the map, or other cars as anything but ray hits.

## Devlog

### Week 1: streets

**The city.** A jittered grid, so no corner is exactly 90 degrees. One or two
rows and columns become arterials with two lanes each way. Then side streets
are knocked out at random, but only if the city stays connected; that is where
dead ends come from, nobody places them. Roads are baked into a grid mask once
(the same trick as the drawn tracks in neat-from-scratch), so "am I on tarmac"
is a single array read and hundreds of rays a frame are cheap.

**Routes.** A* with straight-line distance as the heuristic, which is admissible
on a road map, so the first path found is the shortest. The test checks it
against Bellman-Ford on every seed. It is a linear scan of the open set, not a
heap: at fifty junctions that is faster to read and fast enough to run.

**Fitness.** Distance driven along the route, a bonus per delivered trip, and a
penalty for crash damage. Every car in a generation drives the same chain of
fares, so a better score means better driving, not an easier route. The city
rotates every generation so nobody can memorise one.

**What broke, in order:**

1. *Nothing learned.* A hand-written controller crashed at exactly the same
   tick whatever its settings, which meant a bug, not a hard problem. Arriving
   at a destination at full speed and being handed a new trip that turns
   sharply straight away is unsurvivable. Taxis stop to drop off, so now you
   have to: a fare is delivered only below 40 units/s inside the junction, and
   the final leg reads as the sharpest turn there is.
2. *Next trip starts with a U-turn.* A* happily routed back the way you came.
   Leaving a junction by the road you entered is now banned unless it is the
   only way out.
3. *Corner cutting.* Steering at the next junction means the target flips to
   the one after while you are still on the approach, so the obvious move cuts
   the corner into the kerb. The target is now a point a fixed distance down
   the route (pure pursuit).
4. *The corner cliff.* With crash meaning death, every early brain died at
   the first corner whether it braked or not. The landscape was flat exactly
   where braking had to be discovered. Now a crash tows you back onto the road
   and costs damage instead.
5. *Crashing as a strategy.* A fixed cost per crash had no good setting: high,
   and everyone scored zero; low, and smashing through corners beat braking.
   Damage now scales with impact speed squared, so braking from 110 to 80
   already pays, and full braking is reachable one small step at a time.
6. *Some seeds never started.* Full damage cost from generation zero priced
   every early brain at almost nothing. It is now phased in over the first
   hundred generations.

**Result.** After 300 generations the evolved champion was scored on twelve
cities it had never seen, against my own hand-written controller on the same
fares: 4.4 trips per minute against 4.3. It crashes more than mine and makes up
for it in speed. Four seeds out of four learn.

## Files

| file | what is in it |
|---|---|
| `src/city.js` | road graph generation, the road mask, A* |
| `src/driver.js` | a car in the city: physics, sensors, route following, fitness |
| `src/spatial.js` | uniform-grid spatial hash |
| `src/cityworld.js` | trips, generations, evolution |
| `src/citysim.js` | the browser view: render, pan/zoom, inspect a car |
| `src/genome.js`, `src/neat.js` | NEAT, unchanged from neat-from-scratch |
| `track.html`, `src/track.js`, `src/car.js`, ... | the original single-track demo |

## Reading

- Stanley and Miikkulainen, [Evolving Neural Networks through Augmenting Topologies](https://nn.cs.utexas.edu/downloads/papers/stanley.ec02.pdf) (2002)
- Amit Patel, [Introduction to A*](https://www.redblobgames.com/pathfinding/a-star/introduction.html), Red Blob Games
- Craig Reynolds, [Steering Behaviors For Autonomous Characters](https://www.red3d.com/cwr/steer/) (1999), where pure pursuit comes from in games

MIT.
