import { useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import braidImg from "../assets/braid-trimmed.png";
import { translate } from "../model/ribosome";
import EnzymeDisplay from "../EnzymeDisplay";
import ProcessingWindow, { type ProcessingData } from "../ProcessingWindow";

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
    desc: "Turns on copy mode; when in copy model, moves along the strand produce complementary bases on a secondary strand. A and T are complementary, and C and G are complementary.",
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

const EXAMPLE_1_ENZYME = translate("GACAAG")[0];
const EXAMPLE_2_ENZYME = translate("CGCACA")[0];

function LandingDemo({ strand }: { strand: string }) {
  const [paused, setPaused] = useState(true);
  const [done, setDone] = useState(false);
  const [key, setKey] = useState(0);

  const data = useMemo<ProcessingData>(() => {
    const enzyme = translate(strand)[0];
    const bindIndex = strand.indexOf(enzyme.bindingPref);
    return { enzyme, strand, boundBase: bindIndex };
  }, [strand]);

  const handleComplete = useCallback(() => setDone(true), []);

  function handleReset() {
    setKey((k) => k + 1);
    setDone(false);
    setPaused(true);
  }

  return (
    <div className="landing-demo">
      <ProcessingWindow
        key={key}
        data={data}
        speed={1}
        paused={paused}
        onComplete={handleComplete}
        className="landing-demo-panel"
        emptyMessage=""
      />
      <div className="landing-demo-controls">
        <button
          className="landing-demo-btn"
          onClick={() => {
            if (done) {
              handleReset();
              setPaused(false);
            } else {
              setPaused((p) => !p);
            }
          }}
        >
          {done ? "\u21BB Replay" : paused ? "\u25B6 Play" : "\u23F8 Pause"}
        </button>
        <button
          className="landing-demo-btn"
          disabled={key === 0 && paused && !done}
          onClick={handleReset}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="landing-page">
      <p>
        Typogenetics is a game that Douglas Hofstadter defined in his 1979 book,
        Gödel, Escher, Bach. It is meant as a simplified model of genetics. It
        consists of a well-defined set of simple mechanics, interacting together
        to produce interesting, complex behavior.
      </p>
      <p>
        In this project, I implement the rules of Typogenetics and build
        experiments to attempt to yield that complex behavior. Hofstadter's
        motivation for the game was to build intution for the real workings of
        genetics, and to gesture at the sorts of recursive, self-reproducing,
        and emergent patterns that may make the basis of cognitive systems. If
        we can discover interesting patterns that emerge from the complex
        interplay of these mechanistic rules, then (in my opinion) we have won
        the game.
      </p>
      <p>
        Once we get through some explanation of the rules, there is an
        interactive page where you can see more complex examples, and other
        research pages that show some cool findings.
      </p>
      <h2 className="landing-h2">Rules</h2>
      <p>
        The basic unit in the game is a "strand" of genetic bases, which are the
        letters A T C and G (corresponding to the base pairs of DNA in
        biological genetics). Each strand can be converted into an enzyme, which
        defines an ordered set of operations, which we call aminos, and those
        operations in turn can be executed on a strand to create other strands.
        Unique base pairs, such as AA, AT, TA, or CG each encode a unique amino,
        and the complete list of base pairs, converted to aminos, makes up the
        enzyme.
      </p>
      <p>
        For example, the base pair CA encodes the instruction{" "}
        <strong>Move right</strong>, and the base pair GA encodes{" "}
        <strong>Insert A</strong>. Consider the strand{" "}
        <span className="landing-mono">GACAAG</span>, which contains
        three base pairs &mdash; GA, CA, and AG &mdash; encoding this enzyme:
      </p>
      <div className="landing-enzyme-preview">
        <EnzymeDisplay enzyme={EXAMPLE_1_ENZYME} />
      </div>
      <p>
        When an enzyme operates on a strand, it initially binds to a
        particular base. The base it binds to is determined by the
        enzyme&rsquo;s &ldquo;tertiary structure&rdquo;, explained further
        along. This enzyme binds{" "}
        <span className="landing-mono">A</span>. When it operates on the
        strand that encoded it, it binds to the first A and executes each
        instruction in order:
      </p>
      <LandingDemo strand="GACAAG" />
      <p>
        In a second example, consider the <strong>Copy</strong> instruction.
        When an enzyme activates copy mode, each subsequent move along the
        strand produces a complementary base on an adjacent secondary strand.
        A and T are complements, and C and G are complements. Consider the
        strand <span className="landing-mono">CGCACA</span>:
      </p>
      <div className="landing-enzyme-preview">
        <EnzymeDisplay enzyme={EXAMPLE_2_ENZYME} />
      </div>
      <p>
        This enzyme binds <span className="landing-mono">G</span>,
        activates copy mode, and moves right twice. As it moves,
        complementary bases appear on the secondary strand:
      </p>
      <LandingDemo strand="CGCACA" />
      <p>
        Other instructions include <strong>Cut</strong> (splits the strand),{" "}
        <strong>Switch</strong> (jumps to the secondary strand), and various
        search operations. The complete set of 16 base pairs and their
        instructions:
      </p>

      <h2 className="landing-h2">Base Pairs and Instructions</h2>

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
      <h2 className="landing-h2">Binding Preference and Tertiary Structure</h2>
      <p>
        In order for an enzyme to operate on a strand, it first attaches to a
        particular base. The allowed base is one of A T C or G. An enzyme will
        only bind to a strand that contains its preferred base. The preferred
        base is determined by the enzyme's tertiary structure, as follows:
      </p>
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

      <h2 className="landing-h2">What's next?</h2>
      <ul>
        <li>
          You can try more animated examples of the game on the{" "}
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
          themselves? What happens if this happens many times, at scale? What
          complex patterns emerge in the resulting combinatorial{" "}
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
