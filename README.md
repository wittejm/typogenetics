# Typogenetics

An interactive simulator for the typogenetics system from Douglas Hofstadter's *Godel, Escher, Bach*.

## Rules

A **strand** is a string of bases: A, C, G, T. Each consecutive pair of bases (duplet) encodes an **amino acid**. Amino acids are assembled into **enzymes**, split at `pun` boundaries. Each enzyme folds into a shape that determines its **binding preference** (A, C, G, or T).

An enzyme binds to a matching base on a target strand, then executes its amino acid sequence left to right. The 15 operations:

- **mvr/mvl** — move cursor right/left
- **rpy/rpu/lpy/lpu** — search right/left for next pyrimidine (C/T) or purine (A/G)
- **cut** — cut strand to the right of cursor
- **del** — delete base at cursor
- **swi** — switch to complementary strand
- **cop/off** — toggle copy mode (moves produce complement on secondary strand)
- **ina/inc/ing/int** — insert base to the right of cursor

If the cursor moves off either end, the enzyme detaches. After processing, the primary strand, any copied secondary strand segments (read antiparallel), and any cut fragments all become new strands in the pool.

## UI

Two-panel layout. Left: strand pool with expandable enzyme badges. Right: animated processing window.

1. Click an enzyme to select it
2. Valid target strands highlight; others dim
3. Click a matching base on a target strand to bind
4. Both items animate out of the pool
5. Processing window steps through each amino with a gradual glow, showing cursor movement, secondary strand growth, cuts, and insertions in real time
6. Final result strands shown on completion

## Combinatorial Soup

In GEB, Hofstadter's prize target is the self-reproducing strand — a strand whose enzymes, operating on itself, produce a copy of itself. This is the Typogenetics analogue of Gödel's self-referential sentence.

This simulator takes a different approach: any enzyme can operate on any strand, not just its source. With N strands producing M total enzymes, each generation applies every enzyme to every strand, producing up to N×M output strands (more when cuts split strands, fewer when enzymes fall off). This all-pairs model opens up relational dynamics that the self-referential model can't express:

- **Mutual reproduction** — strand A's enzymes on B produce A, and vice versa. A symbiotic pair.
- **Parasitism** — A's enzymes on B produce copies of A. A thrives at B's expense.
- **Cycles** — A → B → C → A across generations.
- **Autocatalytic sets** — a group of strands that collectively sustain each other, none self-reproducing alone but self-sustaining as a set (a real origin-of-life concept from Stuart Kauffman's work).
- **Extinction and dominance** — some strands take over the pool, others die out. Population dynamics emerge from pure string rewriting.

This also departs from GEB's execution model. In the book, generations are synchronous: all enzymes operate on the current pool simultaneously, and the collected outputs replace the pool as the next generation. The current UI runs one enzyme-on-strand operation at a time, feeding results back into the pool incrementally. This means order matters — early results change the pool that later operations see — making it a fundamentally different dynamical system.

The interesting questions become ecological: does the pool reach a fixed point? Do certain strands act as keystone species? What starting pools produce the richest dynamics?

## Dev

```
npm install
npm run dev
```
