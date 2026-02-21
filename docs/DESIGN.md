# Typogenetics — Design Doc

## Overview

This project explores Hofstadter's Typogenetics through multiple experimental modes, from a slow animated interactive view to fast headless simulations. Each mode is a page in the app.

## Pages

### 1. Interactive Soup (existing)

The current UI. Pick any enzyme, pick any target strand, watch the operation animate step-by-step. Results go back in the pool. One operation at a time, user-driven.

Purpose: understand individual operations. See what `cop` actually does. Build intuition for how enzymes transform strands.

### 2. Self-Operating Strands

GEB-faithful mode. Each strand's own enzymes operate on itself. No cross-strand interaction.

- Translate strand → enzymes
- Each enzyme binds to the strand it came from
- Collect all outputs → new pool
- Repeat (generational)

This is the mode where self-reproducing strands matter. Note: a strand whose enzymes are all no-ops (fall off the end, binding pref doesn't match, etc.) trivially "survives" — the unmodified strand passes through as output. That's not reproduction, it's inertia. True self-reproduction means the enzyme actively *constructs* a copy via `cop`/`swi`, yielding more copies in the output than went in. Display: pool list with generation counter, distinguishing strands that actively replicate from ones that merely survive.

### 3. Stochastic Soup

The combinatorial model, run fast. No animation.

- Pool of strands
- Each timestep: randomly pick one enzyme-strand pair, run the operation, feed results back into the pool, remove the consumed strand
- Run for N timesteps or until pool stabilizes/dies

Controls: pool size cap (discard randomly when too large?), step rate, pause/resume, seed. Display: pool size over time, strand frequency histogram, strand lineage graph.

This is where emergent dynamics — symbiosis, parasitism, cycles, autocatalytic sets — would show up if they exist.

### 4. Evolutionary Search

Directed search for interesting strands using evolutionary algorithms (following Varetto, Kvasnicka, Gwak & Wee).

- **Fitness function**: how close does a strand come to reproducing itself (or a target)? Levenshtein distance between input strand and output strands. Fitness = 0 means perfect self-replication.
- **Population**: N random strands
- **Selection**: keep the fittest
- **Mutation**: flip random bases
- **Crossover**: splice two strands together
- **Repeat** for M generations

Targets to search for:
- Self-replicators (strand whose enzymes on itself produce itself)
- Hypercycles (pairs/triples that mutually reproduce)
- Interesting dynamics (strands whose output pools have high diversity, long chains, etc.)

Display: fitness over generations, best strand so far, lineage tree.

### 5. Matrix Exploration (speculative)

Can typogenetic operations be expressed as matrix math over a vector representation of strands?

If bases are encoded as one-hot vectors (A=[1,0,0,0], C=[0,1,0,0], G=[0,0,1,0], T=[0,0,0,1]), a strand of length N is a Nx4 matrix. Some operations map naturally:

- **Complement** is a permutation matrix: multiply by [[0,0,0,1],[0,0,1,0],[0,1,0,0],[1,0,0,0]]
- **Deletion at position i** is removing row i
- **Insertion at position i** is inserting a row
- **Movement** is just incrementing an index — not a matrix op per se

The problem: operations are *conditional* and *sequential*. `rpy` says "scan right until you find a pyrimidine" — that's a data-dependent branch, not a linear operation. `cop` mode changes the semantics of subsequent moves. `cut` changes the size of the matrix mid-operation.

Possible approaches:
- **Tensor encoding**: represent the full state (strand + secondary + cursor position + copy mode) as a tensor, express each amino as a sparse transformation matrix. Compose them. This works for fixed-length strands with no branching, but `rpy/rpu/lpy/lpu` and `cut` break it.
- **Probabilistic/soft version**: replace hard conditionals with soft attention. "Search right for pyrimidine" becomes a weighted sum over positions based on pyrimidine-ness and distance. `cut` becomes a soft mask. This gives a differentiable approximation — possibly useful for gradient-based search for self-replicators.
- **Batch evaluation**: even if single operations aren't matrix math, evaluating many strand×enzyme pairs in parallel is embarrassingly parallel. GPU batch processing of the interpreter, not matrix math per se, but fast.

Status: open question. Explore whether the soft/differentiable version produces meaningful results or whether the discrete nature of typogenetics is essential.

## Shared Engine

All modes share the same core model (`src/model/`):

- `types.ts` — base types, duplet→amino mapping
- `ribosome.ts` — strand→enzyme translation
- `operation.ts` — enzyme execution on a strand

The engine is pure functions, no UI dependencies. Modes 3 and 4 run headless against the engine. The interactive modes (1, 2) add animation and UI on top.

## Open Questions

- **Pool management in stochastic mode**: when the pool grows, do we cap it? Random eviction? Evict shortest strands? This is a design choice that affects dynamics.
- **What counts as "the same strand"?** Exact string match? Do we deduplicate the pool or allow multiple copies (so frequency matters)?
- **Strand consumption model**: when a strand is used as a target, is it consumed (replaced by outputs)? The enzyme source strand — does it persist? Current assumption: target is consumed, source persists (since translation is non-destructive).
- **Self-operation in the soup**: in stochastic mode, can an enzyme operate on the strand it came from? Probably yes — it's just another valid enzyme-strand pair in the random draw.

## Further Development

The search page is the tool, not the story. The shareworthy punchline is something like: "I brute-forced all of typogenetics and here's what self-replication actually looks like in this system."

What makes it land:

- **A finding.** "There are exactly N survivors of length 8 or less, and they all share this structural property." Or "pair bonds don't exist below length 12, here's why." Or "the shortest self-replicator is X, and here's how it works." The search finds the needles; the UI explains why they're needles.
- **A visualization of the interesting cases.** Clicking a survivor in the search results and watching it replicate itself, step by step. That's the moment someone goes "oh, cool." (This is now wired up — search results play the step-through animation in a side panel.)
- **A paragraph.** The framing that makes someone care. Hofstadter's original question — can a string encode the machinery to reproduce itself? — and then an empirical answer.

## A few directions worth thinking about:                              
                                                            
  Filter the noise from what we have. Most of the cycles we just found are trivial length-shifts. A simple filter — require that cycle members differ in base     
  composition, not just length (e.g., edit distance > just an insertion/deletion) — would reveal whether any structurally interesting cycles exist underneath.
                                                                                                                                                                  
  Cross-catalysis instead of self-operation. Everything so far is runOnSelf — strand A's enzymes act on A. The conceptually interesting thing is A's enzymes      
  acting on B. You could search for pairs (A, B) where A operating on B produces something that closes a loop. Computationally harder (N² pairs) but you could
  restrict to strands that produce enzymes and sample targets.

  Closed sets from a single strand. Take a strand, run it on itself, collect all products. Then run each product on itself, collect their products. Iterate. Does
  the set stabilize? A strand whose production cloud reaches a fixed point is an autocatalytic set seeded by one strand.

  Neutral networks. For known self-replicators, check all single-base mutations. How many neighbors are also self-replicators? If there are connected clusters of
  self-replicators in sequence space, that's biologically meaningful — it means self-replication is robust to mutation, not a fragile coincidence.

  Enzyme functional fingerprinting. Classify strands not by what they produce but by what their enzymes do — copy mode vs not, number of cuts, insert/delete
  balance. Then look for complementary enzyme pairs: "A encodes a copier, B encodes a cutter, together they do something neither does alone."

  Production graph topology. For all strands of a given length, the runOnSelf results define a directed graph. Look at its structure — strongly connected
  components, hub nodes, degree distribution. Is it random-looking or does it have non-trivial topology?