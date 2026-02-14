type amino =
  | "pun"
  | "cut"
  | "del"
  | "swi"
  | "mvr"
  | "mvl"
  | "cop"
  | "off"
  | "ina"
  | "inc"
  | "ing"
  | "int"
  | "rpy"
  | "rpu"
  | "lpy"
  | "lpu";

export type enzyme = amino[];

type dir = 's' | 'r' | 'l' | '';

export type ActiveStrand = {
baseString: string[]
secondString: Record<number, string>
attachedEnzyme: string[]
enzymeLocationIndex: number
enzymeOnSecondary: boolean
}

export const basePairToAmino: Record<string, [amino, dir]> = {
  AA: ["pun", ""],
  AC: ["cut", "s"],
  AG: ["del", "s"],
  AT: ["swi", "r"],
  CA: ["mvr", "s"],
  CC: ["mvl", "s"],
  CG: ["cop", "r"],
  CT: ["off", "l"],
  GA: ["ina", "s"],
  GC: ["inc", "r"],
  GG: ["ing", "r"],
  GT: ["int", "l"],
  TA: ["rpy", "r"],
  TC: ["rpu", "l"],
  TG: ["lpy", "l"],
  TT: ["lpu", "l"],
};