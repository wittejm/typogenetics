import { useState, useCallback, useRef, useEffect } from "react";
import { translate } from "../model/ribosome";
import type { Enzyme } from "../model/types";
import { aminoLabel } from "../labels";
import {
  allocate,
  initElement,
  stepBatch,
  collectElement,
  type BatchState,
} from "../rnn_deterministic/execute";
import {
  AMINO_ENCODE,
  AMINO_NOP,
  BASE_DECODE,
  BASE_NULL,
} from "../rnn_deterministic/constants";

const B = 16; // 4×4 grid

type CellInfo = {
  enzyme: Enzyme;
  source: string;
  target: string;
  bindPos: number;
  encodedAminos: Int8Array;
};

function randomStrand(minLen: number, maxLen: number): string {
  const bases = "ACGT";
  const len = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));
  let s = "";
  for (let i = 0; i < len; i++) s += bases[Math.floor(Math.random() * 4)];
  return s;
}

function generateCells(): CellInfo[] {
  const cells: CellInfo[] = [];
  while (cells.length < B) {
    const source = randomStrand(4, 16);
    const enzymes = translate(source);
    if (enzymes.length === 0) continue;
    const enzyme = enzymes[Math.floor(Math.random() * enzymes.length)];
    const target = randomStrand(4, 16);
    const positions: number[] = [];
    for (let i = 0; i < target.length; i++) {
      if (target[i] === enzyme.bindingPref) positions.push(i);
    }
    if (positions.length === 0) continue;
    const bindPos = positions[Math.floor(Math.random() * positions.length)];

    const encoded = new Int8Array(enzyme.aminos.length);
    for (let i = 0; i < enzyme.aminos.length; i++) {
      encoded[i] = AMINO_ENCODE[enzyme.aminos[i]];
    }

    cells.push({ enzyme, source, target, bindPos, encodedAminos: encoded });
  }
  return cells;
}

function initBatchState(cells: CellInfo[]): BatchState {
  const maxAminos = Math.max(...cells.map((c) => c.enzyme.aminos.length));
  const maxLen = Math.max(...cells.map((c) => c.target.length)) + maxAminos;
  const L = Math.min(Math.max(maxLen, 16), 64);
  const state = allocate(B, L);
  for (let b = 0; b < B; b++) {
    initElement(state, b, cells[b].target, cells[b].bindPos);
  }
  return state;
}

function readStrandDisplay(
  state: BatchState,
  b: number,
): { primary: number[]; secondary: number[] } {
  const { L } = state;
  const offset = b * L;
  const len = state.strandLen[b];
  const primary: number[] = [];
  const secondary: number[] = [];
  for (let i = 0; i < len; i++) {
    primary.push(state.primary[offset + i]);
    secondary.push(state.secondary[offset + i]);
  }
  return { primary, secondary };
}

export default function BatchDemoPage() {
  const [cells, setCells] = useState<CellInfo[]>(() => generateCells());
  const [state, setState] = useState<BatchState>(() => initBatchState(cells));
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const maxAminos = Math.max(...cells.map((c) => c.enzyme.aminos.length));
  const allDone =
    step >= maxAminos || cells.every((_, b) => state.terminated[b]);

  const doStep = useCallback(() => {
    if (allDone) return;
    const aminoBuf = new Int8Array(B);
    for (let b = 0; b < B; b++) {
      aminoBuf[b] =
        step < cells[b].encodedAminos.length
          ? cells[b].encodedAminos[step]
          : AMINO_NOP;
    }
    stepBatch(state, aminoBuf);
    setState({ ...state }); // trigger re-render (state is mutated in place)
    setStep((s) => s + 1);
  }, [state, step, cells, allDone]);

  const handleRandomize = useCallback(() => {
    setPlaying(false);
    const newCells = generateCells();
    setCells(newCells);
    setState(initBatchState(newCells));
    setStep(0);
  }, []);

  // Auto-play
  useEffect(() => {
    if (playing && !allDone) {
      timerRef.current = setInterval(() => {
        doStep();
      }, 400);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [playing, allDone, doStep]);

  // Stop playing when all done
  useEffect(() => {
    if (allDone) setPlaying(false);
  }, [allDone]);

  return (
    <div className="batch-demo-page">
      <h2>Batch Execution</h2>
      <p className="batch-demo-subtitle">
        {B} enzyme operations stepping in lockstep — one recurrent step per tick
      </p>
      <h2>Instructions I gave to Claude: </h2>
      <p>
        ideate a Recurrent Neural Net approach to computing strands. recurrent
        because that lets it accept variable-length strands. If we build this,
        can it allow us to significantly parallelize the combinatorial soup
        (read the project to see the context of the combinatorial soup. Write
        your findings in RNN_IDEA.txt
      </p>
      <p>
        what about not appoximation via nn's/gradients but exactly closed-form
        matrix computation, recurrent-style for seq2seq?
      </p>
      <p>
        wanna implement the whole thing as a new standalone new feature? we call
        it rnn_deterministic_headless. can you correctly implement the whole
        thing yourself? how big is the deterministic matrix (batch =1), how to
        expand the batch size? what design decisions still need to be made that
        I can help wit? also ideate a demo version in the frontend
      </p>

      <div className="batch-demo-controls">
        <button className="batch-demo-btn" onClick={handleRandomize}>
          Randomize
        </button>
        <button className="batch-demo-btn" onClick={doStep} disabled={allDone}>
          Step
        </button>
        <button
          className="batch-demo-btn"
          onClick={() => setPlaying((p) => !p)}
          disabled={allDone}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="batch-demo-step">
          t = {step}
          {allDone ? " (done)" : ` / ${maxAminos}`}
        </span>
      </div>

      <div className="batch-grid">
        {cells.map((cell, b) => {
          const { primary, secondary } = readStrandDisplay(state, b);
          const cursor = state.cursor[b];
          const terminated = state.terminated[b];
          const copyMode = state.copyMode[b];
          const currentAmino = step < cell.enzyme.aminos.length ? step : null;
          const results =
            terminated || allDone ? collectElement(state, b) : null;

          return (
            <div
              key={b}
              className={`batch-cell ${terminated ? "batch-cell-done" : ""}`}
            >
              <div className="batch-cell-enzyme">
                {cell.enzyme.aminos.map((amino, ai) => (
                  <span
                    key={ai}
                    className={
                      `amino-badge` +
                      (currentAmino !== null && ai === currentAmino
                        ? " amino-stepping"
                        : "") +
                      (ai < step ? " amino-past" : "") +
                      (ai > step ? " amino-future" : "")
                    }
                  >
                    {aminoLabel[amino]}
                  </span>
                ))}
                <span className="bind-pref">
                  binds {cell.enzyme.bindingPref}
                </span>
              </div>

              <div className="batch-cell-strand">
                {primary.map((base, i) => (
                  <span
                    key={i}
                    className={
                      `batch-base` +
                      (i === cursor && !terminated ? " batch-base-cursor" : "")
                    }
                  >
                    {base !== BASE_NULL ? BASE_DECODE[base] : "\u00B7"}
                  </span>
                ))}
                {copyMode ? (
                  <span className="batch-copy-badge">COPY</span>
                ) : null}
              </div>

              {secondary.some((b) => b !== BASE_NULL) && (
                <div className="batch-cell-secondary">
                  {secondary.map((base, i) => (
                    <span key={i} className="batch-base batch-base-secondary">
                      {base !== BASE_NULL ? BASE_DECODE[base] : "\u00B7"}
                    </span>
                  ))}
                </div>
              )}

              {results && (
                <div className="batch-cell-results">
                  {results.map((strand, ri) => (
                    <span key={ri} className="batch-result-strand">
                      {strand}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
