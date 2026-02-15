import { Link } from "react-router-dom";
import braidImg from "../assets/braid-trimmed.png";

const INSTRUCTIONS = [
  {
    pair: "AA",
    abbr: "pun",
    name: "Punctuation",
    turn: "—",
    desc: "Marks the boundary between enzymes during translation.",
  },
  {
    pair: "AC",
    abbr: "cut",
    name: "Cut strand",
    turn: "S",
    desc: "Cuts the strand to the right of the cursor.",
  },
  {
    pair: "AG",
    abbr: "del",
    name: "Delete base",
    turn: "S",
    desc: "Deletes the base at the current cursor position.",
  },
  {
    pair: "AT",
    abbr: "swi",
    name: "Switch strands",
    turn: "R",
    desc: "Switches the cursor to the complementary strand.",
  },
  {
    pair: "CA",
    abbr: "mvr",
    name: "Move right",
    turn: "S",
    desc: "Moves the cursor one position to the right.",
  },
  {
    pair: "CC",
    abbr: "mvl",
    name: "Move left",
    turn: "S",
    desc: "Moves the cursor one position to the left.",
  },
  {
    pair: "CG",
    abbr: "cop",
    name: "Copy mode on",
    turn: "R",
    desc: "Turns on copy mode; moves produce complementary bases on a secondary strand.",
  },
  {
    pair: "CT",
    abbr: "off",
    name: "Copy mode off",
    turn: "L",
    desc: "Turns off copy mode.",
  },
  {
    pair: "GA",
    abbr: "ina",
    name: "Insert A",
    turn: "S",
    desc: "Inserts an A to the right of the cursor.",
  },
  {
    pair: "GC",
    abbr: "inc",
    name: "Insert C",
    turn: "R",
    desc: "Inserts a C to the right of the cursor.",
  },
  {
    pair: "GG",
    abbr: "ing",
    name: "Insert G",
    turn: "R",
    desc: "Inserts a G to the right of the cursor.",
  },
  {
    pair: "GT",
    abbr: "int",
    name: "Insert T",
    turn: "L",
    desc: "Inserts a T to the right of the cursor.",
  },
  {
    pair: "TA",
    abbr: "rpy",
    name: "Search right py",
    turn: "R",
    desc: "Searches right for the next pyrimidine (C or T).",
  },
  {
    pair: "TC",
    abbr: "rpu",
    name: "Search right pu",
    turn: "L",
    desc: "Searches right for the next purine (A or G).",
  },
  {
    pair: "TG",
    abbr: "lpy",
    name: "Search left py",
    turn: "L",
    desc: "Searches left for the next pyrimidine (C or T).",
  },
  {
    pair: "TT",
    abbr: "lpu",
    name: "Search left pu",
    turn: "L",
    desc: "Searches left for the next purine (A or G).",
  },
];

const DIRECTIONS = [
  { direction: "Right", base: "A" },
  { direction: "Down", base: "G" },
  { direction: "Left", base: "T" },
  { direction: "Up", base: "C" },
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <p>
        Typogenetics is a game that Douglas Hofstadter defined in his 1979 book,
        Gödel, Escher, Bach. Is it meant as a simplified model of genetics,
        consisting of &ldquo;strands&rdquo; of genetic bases (letters) that
        encode &ldquo;enzymes&rdquo;, which in turn operate on the strands to
        produce new strands. The goal is to create a well-defined system of
        interacting agents, that demonstrates interesting emergent,
        self-referential, and self-reproducing properties.
      </p>
      <p>
        This website implements Typogenetics as an interactive app, and explores
        a few research directions that ensue.
      </p>

      <h2 className="landing-h2">Rules</h2>

      <p>
        Strands are strings of the characters A T C G, or &ldquo;bases&rdquo;,
        of any combination and length.
      </p>
      <p>
        Strands can be translated into Enzymes. An enzyme is a list of
        instructions, and there are 16 unique instructions, corresponding to the
        16 unique combinations of two bases.
      </p>
      <p>
        The translation table from base pairs to instructions is{" "}
        <span
          className="landing-tooltip"
          title={
            'For Claude: insert translation table. columns: base pair, instruction abbreviation (short, but not necessarily strictly 3 characters), instruction (in 2 or three words), turn* (the tooltip for "turn*" is, "Turn is explained under Tertiary Structure and Binding Preference, below"), description (a sentence). (keep this instruction to Claude as a Tooltip on the "as follows" above, which is formatted to be clearly tooltipped.)'
          }
        >
          as follows
        </span>
        :
      </p>

      <div className="landing-table-wrap">
        <table className="landing-table">
          <thead>
            <tr>
              <th>Base Pair</th>
              <th>Abbrev.</th>
              <th>Instruction</th>
              <th>
                <span
                  className="landing-tooltip"
                  title="Turn is explained under Tertiary Structure and Binding Preference, below."
                >
                  Turn*
                </span>
              </th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {INSTRUCTIONS.map(({ pair, abbr, name, turn, desc }) => (
              <tr key={pair}>
                <td className="landing-mono">{pair}</td>
                <td className="landing-mono">{abbr}</td>
                <td>{name}</td>
                <td>{turn}</td>
                <td>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="landing-h2">
        <span
          className="landing-tooltip"
          title={
            'For Claude: explain tertiary structure and binding preference, briefly and clearly, under the header "Tertiary Structure and Binding Preference". Include the table for the 4 directions. The header has a tooltip containing these instructions to Claude.'
          }
        >
          Tertiary Structure and Binding Preference
        </span>
      </h2>

      <p>
        Each instruction in an enzyme contributes a <em>turn</em> to the
        enzyme&rsquo;s tertiary structure: straight (S), right (R), or left (L).
        Imagine laying the enzyme out on a grid, starting in the
        &ldquo;right&rdquo; direction. Each instruction extends one step in the
        current direction, and its turn then adjusts the heading for the next
        step. After all instructions are placed, the net direction the enzyme is
        facing determines which base it prefers to bind to:
      </p>

      <div className="landing-table-wrap">
        <table className="landing-table landing-table-compact">
          <thead>
            <tr>
              <th>Net Direction</th>
              <th>Binding Preference</th>
            </tr>
          </thead>
          <tbody>
            {DIRECTIONS.map(({ direction, base }) => (
              <tr key={base}>
                <td>{direction}</td>
                <td className="landing-mono">{base}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        An enzyme will only bind to a strand that contains its preferred base.
        It attaches at the first matching base it finds, then executes its
        instructions from that position.
      </p>

      <h2 className="landing-h2">What's next?</h2>
      <ul>
        <li>
          You can see animated examples of the game on the{" "}
          <Link to="/interactive" onClick={() => window.scrollTo(0, 0)}>
            Interactive
          </Link>{" "}
          page.
        </li>
        <li>
          We perform an exhaustive search of strings looking for interesting
          behavior in the{" "}
          <Link to="/search" onClick={() => window.scrollTo(0, 0)}>
            Search
          </Link>{" "}
          page.
        </li>
        <li>
          What happens when strands' enzymes are operating on strands other than
          themselves? What happens if this happens many times, at scale? What's
          hidden in the resulting combinatorial{" "}
          <Link to="/search" onClick={() => window.scrollTo(0, 0)}>
            Soup
          </Link>
          ?
        </li>
      </ul>

      <div className="landing-braid">
        <img src={braidImg} alt="Typogenetics braid" />
      </div>
    </div>
  );
}
