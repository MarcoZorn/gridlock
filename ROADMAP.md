# Roadmap

A hundred ideas, from next week to never, and the order to try them in.
Hard on purpose: most have not been done, some may not be possible.

## A hundred ideas

### Drivers that talk
1. An indicator output and a sense of other cars' indicators: does a signalling language evolve, and does it solve right of way where nothing else did?
2. A horn: an output others hear within a radius. Warning calls, or noise?
3. Eye contact: a car senses whether the car it sees is "looking" at it.
4. Measure the information carried by evolved signals (mutual information between signal and next action).
5. Dialects: do separate cities evolve different signalling conventions, and can a driver from one survive in the other?
6. Deception: does anyone evolve to signal one thing and do another, and do others learn to ignore them?
7. Turn-taking at a four-way stop with no lights, no rules, only signals.

### Cities that evolve too
8. Co-evolve traffic light timings with the drivers that obey (or don't) them.
9. A city planner genome: road edits proposed and kept when the economy moves more people.
10. Evolve speed limits per road.
11. Evolve where the taxi ranks are.
12. A city that grows where demand is unmet, by itself.
13. Braess hunting: evolution searching for the road whose closure helps most.
14. Evolve one-way assignments for a whole city (Barcelona's arrows, from scratch).
15. Roundabout vs light vs nothing, chosen per junction by evolution.
16. Pedestrian crossings placed by the pedestrians' own deaths.
17. A city of 10,000 cars on all of Manhattan, in a worker pool.

### Economics nobody has run
18. A fare market: drivers bid on fares, passengers choose.
19. Surge pricing, evolved by the platform, against drivers that evolve too.
20. Two platforms competing for drivers.
21. Unions: drivers that refuse fares below a price, and whether that strategy spreads.
22. Insurance companies as agents, pricing premiums by observed driving.
23. Taxes that change with the vote of the drivers.
24. Inheritance: children start with a share of the parent's cash, or not.
25. Retirement, debt, credit.
26. Universal basic income for cars.
27. A minimum wage per fare.
28. Fleet owners vs owner-drivers.
29. Tipping that evolves on the passenger side.
30. Freight auctions and long-haul vs last-mile niches.
31. A stock market of lineages.

### Evolution itself
32. Novelty search for driving: reward new behaviour, not fitness.
33. Open-endedness measure: does the economy keep producing new species forever?
34. Speciation by body niche, not brain distance.
35. Sexual selection: passengers choose drivers.
36. Cultural transmission: young drivers copy the routes of rich ones.
37. Lamarckian learning: a lifetime of weight updates passed on.
38. Plastic brains (Hebbian weights) inside NEAT.
39. Developmental genomes (HyperNEAT) that grow ray-count-independent brains.
40. Brains that evolve their own sensors (which rays, how long).
41. A recurrent NEAT with proper memory, against the feedback hack.
42. Evolving the fitness function (meta-evolution).
43. Red Queen: predators (police) and speeders co-evolving.
44. Evolutionary rescue: how fast a population adapts when a city floods.
45. Measuring evolvability: how many mutations away is a better driver?
46. Phylogenetic trees of real lineages, drawn as a living tree of life.
47. Extinction events and adaptive radiations after them.
48. Kin selection: do relatives yield to each other more?
49. Group selection between whole cities.
50. Horizontal gene transfer between cars that crash into each other.

### Science from the sim
51. Fundamental diagram of traffic from evolved drivers vs real NGSIM data.
52. Phantom jams: stop-and-go waves without any bottleneck.
53. Fit an IDM car-following model to the evolved drivers.
54. Compare evolved route choice with Wardrop equilibrium.
55. Price of anarchy measured on real street networks.
56. Braess's paradox found in a real city map.
57. Traffic as a complex network: which junctions are critical?
58. Percolation: how many closed roads before a city breaks apart?
59. Scaling laws: city size vs trips, like Bettencourt's urban scaling.
60. Zipf's law in species sizes.
61. Self-organised criticality in jam sizes.
62. Spontaneous symmetry breaking (side of the road) as a phase transition.
63. Culture of left- and right-hand driving as an evolutionary game.
64. Measuring how much "intelligence" traffic has collectively.

### Real world
65. Type any city name in the browser and drive it (live Overpass import).
66. Real one-way, lanes, speed limits and signals from OSM tags.
67. Real demand from open taxi trip data (NYC TLC).
68. Real weather: rain days.
69. Calibrate against real travel times.
70. Export evolved drivers to SUMO.
71. Evolved drivers in CARLA.
72. A physical RC car driven by an evolved brain.
73. Phone tilt as steering, race the evolved drivers.
74. Multiplayer: humans drive one car among the evolved ones.
75. VR view from inside an evolved car.
76. Accessibility: a sonified city for blind users.

### Interfaces and tools
77. A time-lapse recorder that makes a GIF of a day.
78. A lineage explorer: click any car, see every ancestor.
79. Replay any crash from both drivers' senses.
80. Brain diff: what changed between parent and child.
81. Live neuron tracing on hover.
82. A notebook page to run any experiment from the browser.
83. Shareable experiment links with all knobs.
84. A leaderboard of seeds.
85. Pause and edit a brain by hand.
86. Teach a car by demonstration, then let it evolve.

### Wild
87. Cars that can build roads.
88. Cars that can reproduce sexually only on crashing (literally).
89. A city on a sphere.
90. A city on Mars, with Mars gravity.
91. Ants vs cars: a stigmergy road network.
92. Flying cars, 3D traffic.
93. Boats on Venice's canals.
94. Evolved pedestrians that become drivers when rich.
95. A city that remembers: roads wear out where traffic is heavy.
96. Seasonal migrations of demand.
97. An evolved economy of emergency vehicles that others must yield to.
98. Language between pedestrians and cars.
99. A city whose drivers vote on the rules.
100. Evolve the simulator's physics until the drivers stop crashing.

## Roadmap

Ordered by what is both new and doable in this code. One at a time, each
measured, written up, and kept or dropped.

1. **Signalling (1, 4, 7).** Add an indicator output and a sense of the
   nearest car's indicator. Raise populations from scratch with and without
   it; measure right of way, conflicts resolved, and mutual information
   between signal and action. The headline question: does talking solve
   what pricing could not?
2. **Phantom jams (52).** A ring road with uniform cars: do stop-and-go waves
   appear from nothing, and how do evolved drivers compare to an IDM model?
3. **Co-evolving lights (8).** Each light's offset and split as a genome, kept
   when the city moves more fares.
4. **Wardrop and price of anarchy (54, 55).** Compare evolved route choice to
   user equilibrium and to the system optimum on the real maps.
5. **Any city in the browser (65).** Type a place, fetch Overpass, convert in
   the page, drive it.
6. **Cultural transmission (36).** Children copy a rich car's route habits.
7. **Novelty search (32).** Behaviour descriptors from route, speed, side.
8. **City planner genome (9, 14).** Evolve one-way assignments for Barcelona.

Each wake-up picks the first unfinished item, moves it forward, tests,
commits and pushes.

## Done

- 5. Any city in the browser: done (eco page "Any city", ?place=)
- 2. Phantom jams: none; stops are stationary (tools/ring.mjs, docs/ring.png)
- 1. Signalling: built (`--signal`); 400 generations, no meaning yet (0.002 bits); 1000-generation run under way
