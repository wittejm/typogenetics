import type { ActiveStrand } from "./types";

export function bindTo(
  strand: ActiveStrand,
  enzyme: string[],
  bindingIndex: number,
) {
  strand.attachedEnzyme = enzyme;
  strand.enzymeLocationIndex = bindingIndex;
}

const complement: Record<string, string> = {
  A: 'T', T: 'A', C: 'G', G: 'C',
}

function isPurine(base: string): boolean {
  return base === 'A' || base === 'G';
}

function isPyrimidine(base: string): boolean {
  return base === 'C' || base === 'T';
}

// When a strand has an enzyme attached, it processes until it's done, according to the rules of the 16 pairs and aminos.
export function process(s: ActiveStrand): string[] {
  let copyMode = false;
  const fragments: ActiveStrand[] = [];

  for (const amino of s.attachedEnzyme) {
    const i = s.enzymeLocationIndex;

    switch (amino) {
      case 'pun':
        // no-op, marks enzyme boundaries
        break;

      case 'cut': {
        // eagerly split: everything to the right of i becomes a fragment
        const rightBase = s.baseString.splice(i + 1);
        const rightSecond: Record<number, string> = {};
        const leftSecond: Record<number, string> = {};
        for (const [k, v] of Object.entries(s.secondString)) {
          const ki = Number(k);
          if (ki > i) rightSecond[ki - (i + 1)] = v;
          else leftSecond[ki] = v;
        }
        s.secondString = leftSecond;
        if (rightBase.length > 0) {
          fragments.push({
            baseString: rightBase,
            secondString: rightSecond,
            attachedEnzyme: [],
            enzymeLocationIndex: 0,
            enzymeOnSecondary: false,
          });
        }
        break;
      }

      case 'del': {
        // delete the base at current position
        const onSecondary = s.enzymeOnSecondary;
        if (onSecondary) {
          delete s.secondString[i];
        } else {
          s.baseString.splice(i, 1);
          // reindex secondString: shift keys above i down by 1
          const newSecond: Record<number, string> = {};
          for (const [k, v] of Object.entries(s.secondString)) {
            const ki = Number(k);
            if (ki < i) newSecond[ki] = v;
            else if (ki > i) newSecond[ki - 1] = v;
            // ki === i: deleted along with primary
          }
          s.secondString = newSecond;
        }
        break;
      }

      case 'swi': {
        // switch to the other strand at the complementary position
        s.enzymeOnSecondary = !s.enzymeOnSecondary;
        break;
      }

      case 'mvr': {
        s.enzymeLocationIndex++;
        if (copyMode && !s.enzymeOnSecondary && s.baseString[s.enzymeLocationIndex]) {
          s.secondString[s.enzymeLocationIndex] = complement[s.baseString[s.enzymeLocationIndex]];
        }
        break;
      }

      case 'mvl': {
        s.enzymeLocationIndex--;
        if (copyMode && !s.enzymeOnSecondary && s.baseString[s.enzymeLocationIndex]) {
          s.secondString[s.enzymeLocationIndex] = complement[s.baseString[s.enzymeLocationIndex]];
        }
        break;
      }

      case 'cop': {
        // turn on copy mode — subsequent moves copy complement to secondary strand
        copyMode = true;
        if (!s.enzymeOnSecondary && s.baseString[i]) {
          s.secondString[i] = complement[s.baseString[i]];
        }
        break;
      }

      case 'off': {
        // turn off copy mode
        copyMode = false;
        break;
      }

      case 'ina': {
        insertBase(s, 'A');
        break;
      }
      case 'inc': {
        insertBase(s, 'C');
        break;
      }
      case 'ing': {
        insertBase(s, 'G');
        break;
      }
      case 'int': {
        insertBase(s, 'T');
        break;
      }

      case 'rpy': {
        // move right searching for next pyrimidine
        const dir = s.enzymeOnSecondary ? -1 : 1;
        searchFor(s, dir, isPyrimidine, copyMode);
        break;
      }

      case 'rpu': {
        // move right searching for next purine
        const dir = s.enzymeOnSecondary ? -1 : 1;
        searchFor(s, dir, isPurine, copyMode);
        break;
      }

      case 'lpy': {
        // move left searching for next pyrimidine
        const dir = s.enzymeOnSecondary ? 1 : -1;
        searchFor(s, dir, isPyrimidine, copyMode);
        break;
      }

      case 'lpu': {
        // move left searching for next purine
        const dir = s.enzymeOnSecondary ? 1 : -1;
        searchFor(s, dir, isPurine, copyMode);
        break;
      }
    }

    // if enzyme has fallen off the strand, stop
    if (s.enzymeLocationIndex < 0 || s.enzymeLocationIndex >= s.baseString.length) {
      break;
    }
  }

  const results = collectStrands(s);
  for (const frag of fragments) {
    results.push(...collectStrands(frag));
  }
  return results;
}

function insertBase(s: ActiveStrand, base: string) {
  const i = s.enzymeLocationIndex;
  if (s.enzymeOnSecondary) {
    // insert into secondary strand — shift keys at and above i+1 up
    const newSecond: Record<number, string> = {};
    for (const [k, v] of Object.entries(s.secondString)) {
      const ki = Number(k);
      if (ki <= i) newSecond[ki] = v;
      else newSecond[ki + 1] = v;
    }
    newSecond[i + 1] = base;
    s.secondString = newSecond;
    // also insert a gap in the primary strand to keep alignment
    s.baseString.splice(i + 1, 0, '');
  } else {
    // insert to the right of current position on primary
    s.baseString.splice(i + 1, 0, base);
    // shift secondString keys above i up by 1
    const newSecond: Record<number, string> = {};
    for (const [k, v] of Object.entries(s.secondString)) {
      const ki = Number(k);
      if (ki <= i) newSecond[ki] = v;
      else newSecond[ki + 1] = v;
    }
    s.secondString = newSecond;
  }
  s.enzymeLocationIndex++;
}

function searchFor(
  s: ActiveStrand,
  dir: number,
  test: (base: string) => boolean,
  copyMode: boolean,
) {
  let pos = s.enzymeLocationIndex + dir;
  while (pos >= 0 && pos < s.baseString.length) {
    if (copyMode && !s.enzymeOnSecondary && s.baseString[pos]) {
      s.secondString[pos] = complement[s.baseString[pos]];
    }
    const base = s.enzymeOnSecondary
      ? s.secondString[pos]
      : s.baseString[pos];
    if (base && test(base)) {
      s.enzymeLocationIndex = pos;
      return;
    }
    pos += dir;
  }
  // fell off the end
  s.enzymeLocationIndex = pos;
}

function collectStrands(s: ActiveStrand): string[] {
  const results: string[] = [];

  // primary strand (filter out empty gaps from insertions on secondary)
  const primary = s.baseString.filter(b => b !== '').join('');
  if (primary.length > 0) {
    results.push(primary);
  }

  // secondary strand — collect contiguous runs, reverse them (antiparallel)
  const secondaryIndices = Object.keys(s.secondString)
    .map(Number)
    .sort((a, b) => a - b);

  if (secondaryIndices.length > 0) {
    let run: string[] = [];
    let prev = -2;
    for (const idx of secondaryIndices) {
      if (idx !== prev + 1 && run.length > 0) {
        results.push(run.reverse().join(''));
        run = [];
      }
      run.push(s.secondString[idx]);
      prev = idx;
    }
    if (run.length > 0) {
      results.push(run.reverse().join(''));
    }
  }

  return results;
}