# Cross-Strand Exhaustive Search — Design

## Motivation

Everything the search infrastructure has found so far is **self-operation**: strand A's enzymes act on A itself. The soup, by contrast, is fundamentally about **cross-operation**: A's enzymes act on B. The stochastic soup explores this randomly, but we have no systematic map of who-produces-whom.

The goal: build the complete **production graph** for short strands. Then mine it for structure — autocatalytic sets, hypercycles, hub producers — and use those findings to explain (or predict) what emerges in the soup.

## What we're computing

A **reaction** is:

    (source, target, enzyme_idx, bind_pos) → [product₁, product₂, ...]

- **source**: the strand whose enzymes we use (the "ribosome input")
- **target**: the strand the enzyme operates on (the "substrate")
- **enzyme_idx**: which enzyme of the source (a strand can translate to multiple)
- **bind_pos**: where on the target the enzyme binds
- **products**: the output strands after execution + collection

The **production graph** collapses this into:

    source × target → {product set}

And for soup dynamics, the key derived structure is the **capability graph**:

    (source, target) → product    means "a pool containing source and target can produce product"

An **autocatalytic set** is a set S of strands where every member of S can be produced by some reaction using only members of S as source and target.

## Scale analysis

| Max length | Total strands | Pairs (N²) | Est. operations | Feasibility |
|------------|--------------|-------------|-----------------|-------------|
| 6          | 5,460        | 30M         | ~100M           | Minutes     |
| 7          | 21,844       | 477M        | ~1.5B           | ~1 hour     |
| 8          | 87,380       | 7.6B        | ~20B            | ~12 hours   |

"Operations" accounts for multiple enzymes per source and multiple bind positions per (enzyme, target) pair. The estimates assume ~25% of strands produce at least one enzyme, and ~3 operations per productive pair on average.

Filtering reduces work significantly:
- **Inert sources**: strands that produce no enzymes are skipped as sources (~40-60% of strands)
- **Binding preference**: each enzyme binds one base; targets missing that base are skipped
- But most targets of length ≥ 4 contain all four bases, so this filter weakens with length

## Architecture

### Phase 1: Enzyme pre-computation

For every strand up to max length, pre-compute and cache:
- Enzymes (amino sequences + binding preferences)
- Which strands are "active" (have at least one enzyme)
- Index of binding positions per base per strand (so we don't re-scan)

Store this as a compact lookup. For length ≤ 8, this fits in memory (~87K entries).

### Phase 2: Cross-execution

For each active source:
  For each of its enzymes:
    For each target strand that has the enzyme's binding preference:
      For each binding position:
        Execute → collect products

This is embarrassingly parallel across sources. Use the same shard-worker pattern as the existing headless search: split sources into chunks, farm out to workers, collect results.

### Phase 3: Graph construction & analysis

Aggregate results into the production graph. Then compute:

1. **Strongly connected components (SCCs)**: groups of strands that can all reach each other through production chains. The interesting ones are small SCCs where every member is actively produced (not just reachable via long chains).

2. **Autocatalytic sets**: subsets S where every strand in S appears as a product of some reaction whose source and target are both in S. This is the closed-form version of what the soup discovers stochastically.

3. **Hub analysis**: strands that appear as products of many different (source, target) pairs — these are "attractors" the soup should converge toward. Conversely, strands that produce many different products are "diversifiers."

4. **Minimal reaction networks**: for a given autocatalytic set, what's the minimal pool that sustains it? This tells us what to seed a soup with to observe the predicted dynamics.

## Output format

### Raw data: `data/cross/reactions-{maxlen}.tsv`

```
source  target  enzyme_idx  bind_pos  products
ACGT    TGCA    0           2         ACG,TCA
```

One row per (source, target, enzyme, bind_pos) that produces at least one non-empty result. This is the complete record; everything else derives from it.

### Derived: `data/cross/production-{maxlen}.tsv`

```
source  target  products
ACGT    TGCA    ACG,TCA,ACGT
```

Collapsed across enzyme_idx and bind_pos: the union of all products that source's enzymes can make from target (across all binding positions and all enzymes).

### Derived: `data/cross/autocatalytic-{maxlen}.tsv`

```
set_size  members                     min_pool_size  reactions
3         ACGT,TGCA,GCTA              2              ACGT+TGCA→GCTA,TGCA+GCTA→ACGT,GCTA+ACGT→TGCA
```

### Checkpointing

Progress file: `data/cross/progress.json`
```json
{ "maxLength": 6, "sourceIndex": 1234, "phase": "execute" }
```

Resume by skipping completed sources. Since each source's cross-executions are independent, partial results are valid.

## Implementation plan

### New files

```
src/cross/
  execute.ts     — core cross-execution loop (given source strand, run its enzymes on all targets)
  analyze.ts     — graph analysis: SCCs, autocatalytic sets, hubs
  headless.ts    — CLI runner with parallelism + checkpointing (mirrors search/headless.ts)
  shard-worker.ts — child process worker for parallel execution
  worker.ts      — browser web worker for the UI page
```

### Execution core (`execute.ts`)

```ts
type Reaction = {
  source: string
  target: string
  enzymeIdx: number
  bindPos: number
  products: string[]
}

/** Run all of source's enzymes on all targets. */
function crossExecute(
  source: string,
  targets: string[],
  targetBindingIndex: Map<Base, number[]>[],
): Reaction[]
```

`targetBindingIndex[i]` maps each base to the list of positions in `targets[i]` where that base appears. Pre-computed once, reused for every source.

### Headless runner (`headless.ts`)

Same pattern as `search/headless.ts`:
- Enumerate sources (active strands only)
- Split into chunks
- Spawn shard workers with `nice -n 10`
- Each worker: receive a range of source indices, cross-execute against ALL targets, emit results to stdout
- Parent: collect, append to TSV, checkpoint

Each worker needs the full target list + binding index in memory. For length ≤ 8 this is ~87K strands × ~8 bytes average = ~700KB. Workers can reconstruct this from `generateStrands` on startup — no IPC needed for the target list.

### Analysis (`analyze.ts`)

Load the production TSV. Build an adjacency list. Run:

1. **Tarjan's SCC** on the capability graph (directed edge from every source to every product it can make, given any available target).

2. **Autocatalytic set detection**: for each SCC, check if it's self-sustaining. An SCC of size k is autocatalytic if for every member strand, there exists a reaction (source, target) → products where source ∈ SCC, target ∈ SCC, and strand ∈ products.

3. **Report** ranked by set size, with the specific reactions that sustain each set.

### Browser UI (later, optional)

A page that loads pre-computed results and lets you explore the production graph interactively. Not part of the initial build — the headless search + analysis scripts come first.

## Relationship to the stochastic soup

The cross-search gives us the **static production graph**: all possible reactions. The soup is a **dynamical system** running on that graph, where population frequencies and random sampling determine which reactions actually fire.

The prediction pipeline:
1. Cross-search finds autocatalytic set {A, B, C}
2. We seed a soup with {A, B, C} (+ maybe some random filler)
3. If {A, B, C} are genuinely autocatalytic, they should persist and dominate
4. If the soup kills them, the static analysis missed something (e.g., a parasitic strand that's also produced and outcompetes)

This closes the loop between exhaustive enumeration and stochastic simulation.

## Open questions

1. **Mixed lengths**: should we enumerate all source×target pairs where source and target can be different lengths? This multiplies the space but is more faithful to the soup (which mixes lengths). Start with same-length pairs; extend to mixed later if the same-length results are interesting.

2. **Product length filtering**: products can be longer or shorter than the inputs. Should we track products of all lengths, or cap at some maximum? Track everything — the analysis phase can filter.

3. **Leveraging existing self-search data**: the self-search through length 15 already has the diagonal (source = target) of the cross matrix. We should load those results rather than re-computing them. But the self-search output format (bucket categories) doesn't store raw products — we'd need to re-run self-operations anyway to get the full product lists. Easier to just re-compute the diagonal as part of the cross-search.

4. **Starting length**: length 6 (5,460 strands, ~30M pairs) is the obvious starting point — fast enough to iterate on the tooling, large enough to potentially contain interesting structure.
