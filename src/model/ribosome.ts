import { basePairToAmino } from "./types";


export function strandToEnzymes(strand: string): [string[], string][] {
  // first pass: get all [amino, turn] pairs from duplets
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < strand.length; i += 2) {
    const duplet = strand.slice(i, i + 2);
    const [amino, turn] = basePairToAmino[duplet];
    pairs.push([amino, turn]);
  }

  // split on pun, accumulating enzymes with their own folding
  const results: [string[], string][] = [];
  let current: string[] = [];
  let direction = 0;

  for (const [amino, turn] of pairs) {
    if (amino === 'pun') {
      if (current.length > 0) {
        results.push([current, directionToPreference(direction)]);
        current = [];
        direction = 0;
      }
    } else {
      current.push(amino);
      direction += turn === 'r' ? 1 : turn === 'l' ? -1 : 0;
    }
  }
  if (current.length > 0) {
    results.push([current, directionToPreference(direction)]);
  }

  return results;
}

function directionToPreference(direction: number): string {
  const dirMod = ((direction % 4) + 4) % 4;
  return ["A", "G", "T", "C"][dirMod];
}
