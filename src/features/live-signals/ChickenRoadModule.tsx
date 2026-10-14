import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeChickenRoad,
  type ChickenDecision,
  type ChickenDifficulty,
  type ChickenRoadAnalysis,
  type ChickenRoadRound,
} from "./chickenRoadEngine";
import ChickenRoadCapture from "./ChickenRoadCapture";
import { loadArray, saveArray } from "./core";
import { HistoryChips } from "./Shared";

const STORAGE_KEY = "neurowin-live-chicken-road-auto-v1";
const PERFORMANCE_KEY = "neurowin-live-chicken-road-auto-performance-v1";
const DIFFICULTY_KEY = "neurowin-chicken-difficulty-auto-v1";

const DIFFICULTIES: Array<{ value: ChickenDifficulty; label: string }> = [
  { value: "EASY", label: "FÁCIL" },
  { value: "MEDIUM", label: "MÉDIO" },
  { value: "HARD", label: "DIFÍCIL" },
  { value: "HARDCORE", label: "HARDCORE" },
];

type Performance = {
  hits: number;
  misses: number;
  lastVerdict: "HIT" | "MISS" | null;
  lastExpected: ChickenDecision | null;
  lastActual: number | null;
};

const EMPTY: Performance = {
  hits: 0,
  misses: 0,
  lastVerdict: null,
  lastExpected: null,
  lastActual: null,
};

function targetValue(decision: ChickenDecision) {
  if (decision === "1.5X") return 1.5;
  if (decision === "2X") return 2;
  return 3;
}

function loadPerformance(): Performance {
  try {
    const raw = localStorage.getItem(PERFORMANCE_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Performance>) };
  } catch {
    return EMPTY;
  }
}

export default function ChickenRoadModule({ onBack }: { onBack: () => void }) {
  const initialRounds = loadArray<ChickenRoadRound>(STORAGE_KEY);
  const [rounds, setRounds] = useState<ChickenRoadRound[]>(initialRounds);
  const [difficulty, setDifficulty] = useState<ChickenDifficulty>(() => {
    const stored = localStorage.getItem(DIFFICULTY_KEY) as ChickenDifficulty | null;
    return stored && ["EASY", "MEDIUM", "HARD", "HARDCORE"].includes(stored)
      ? stored
      : "MEDIUM";
  });
  const [analysis, setAnalysis] = useState<ChickenRoadAnalysis | null>(() => {
    return initialRounds.length ? analyzeChickenRoad(initialRounds, "MEDIUM") : null;
  });
  const [performance, setPerformance] = useState<Performance>(() => loadPerformance());

  const roundsRef = useRef(rounds);
  const analysisRef = useRef(analysis);
  const difficultyRef = useRef(difficulty);

  useEffect(() => { roundsRef.current = rounds; }, [rounds]);
  useEffect(() => { analysisRef.current = analysis; }, [analysis]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);

  const filteredRounds = useMemo(
    () => rounds.filter((round) => !round.difficulty || round.difficulty === difficulty),
    [rounds, difficulty],
  );

  const totalPredictions = performance.hits + performance.misses;
  const observedAccuracy = totalPredictions ? performance.hits / totalPredictions : null;

  const displayedConfidence = useMemo(() => {
    if (!analysis) return 0;
    if (observedAccuracy === null || totalPredictions < 20) return analysis.confidence;
    return Math.round(Math.min(89, analysis.confidence * 0.68 + observedAccuracy * 100 * 0.32));
  }, [analysis, observedAccuracy, totalPredictions]);

  function persistPerformance(next: Performance) {
    localStorage.setItem(PERFORMANCE_KEY, JSON.stringify(next));
    setPerformance(next);
  }

  function updateDifficulty(nextDifficulty: ChickenDifficulty) {
    setDifficulty(nextDifficulty);
    difficultyRef.current = nextDifficulty;
    localStorage.setItem(DIFFICULTY_KEY, nextDifficulty);
    const nextAnalysis = analyzeChickenRoad(roundsRef.current, nextDifficulty);
    setAnalysis(nextAnalysis);
    analysisRef.current = nextAnalysis;
  }

  function onRound(round: ChickenRoadRound) {
    const previous = analysisRef.current;
    if (previous && previous.decision !== "WAIT") {
      const target = targetValue(previous.bestOption);
      const hit = round.multiplier >= target;
      const current = loadPerformance();
      persistPerformance({
        hits: current.hits + (hit ? 1 : 0),
        misses: current.misses + (hit ? 0 : 1),
        lastVerdict: hit ? "HIT" : "MISS",
        lastExpected: previous.bestOption,
        lastActual: round.multiplier,
      });
    }

    const nextRounds = [...roundsRef.current, round].slice(-5000);
    saveArray(STORAGE_KEY, nextRounds);
    setRounds(nextRounds);
    roundsRef.current = nextRounds;
    const nextAnalysis = analyzeChickenRoad(nextRounds, difficultyRef.current);
    setAnalysis(nextAnalysis);
    analysisRef.current = nextAnalysis;
  }

  function analyzeNow() {
    const next = analyzeChickenRoad(roundsRef.current, difficultyRef.current);
    setAnalysis(next);
    analysisRef.current = next;
  }

  function clearSession() {
    if (!window.confirm(`Apagar o histórico automático de Chicken Road em ${difficulty}?`)) return;
    const nextRounds = roundsRef.current.filter(
      (round) => round.difficulty && round.difficulty !== difficulty,
    );
    saveArray(STORAGE_KEY, nextRounds);
    setRounds(nextRounds);
    roundsRef.current = nextRounds;
    localStorage.removeItem(PERFORMANCE_KEY);
    setPerformance(EMPTY);
    const nextAnalysis = analyzeChickenRoad(nextRounds, difficulty);
    setAnalysis(nextAnalysis);
    analysisRef.current = nextAnalysis;
  }

  const waiting = !analysis || analysis.decision === "WAIT";
  const difficultyLabel = DIFFICULTIES.find((item) => item.value === difficulty)?.label ?? difficulty;

  return (
    <main className="page live-signals-page auto-game-page">
      <button type="button" className="live-back" onClick={onBack}>← Voltar aos sinais</button>

      <section className="auto-game-hero premium-card led-border">
        <div>
          <span className="eyebrow">CHICKEN ROAD • ANÁLISE AUTOMÁTICA</span>
          <h1>Chicken Road</h1>
          <p>A NeuroWin acompanha o multiplicador final das runs visíveis e atualiza a análise da dificuldade selecionada.</p>
        </div>
        <div className="auto-game-kpis">
          <div><span>Runs</span><strong>{filteredRounds.length}</strong></div>
          <div><span>Modo</span><strong>{difficultyLabel}</strong></div>
          <div><span>Tempo</span><strong>∞</strong></div>
        </div>
      </section>

      <section className="auto-difficulty-card premium-card">
        <span className="eyebrow">DIFICULDADE ATUAL</span>
        <div className="live-difficulty-buttons chicken-simple-difficulty">
          {DIFFICULTIES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={difficulty === item.value ? "active" : ""}
              onClick={() => updateDifficulty(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <ChickenRoadCapture difficulty={difficulty} onRound={onRound} />

      <section className={`auto-signal-card premium-card ${waiting ? "is-waiting" : "signal-player"}`}>
        <div className="auto-signal-copy">
          <span className="eyebrow">ALVO SUGERIDO</span>
          <strong>{waiting ? "AGUARDAR" : analysis.bestOption}</strong>
          <p>
            {filteredRounds.length < 8
              ? `A recolher runs automáticas (${filteredRounds.length}/8).`
              : waiting
                ? "Sem sinal suficientemente forte nesta dificuldade."
                : `Análise atualizada em ${analysis.elapsedMs.toFixed(1)} ms.`}
          </p>
        </div>
        <div className="auto-confidence-box">
          <span>CONFIANÇA DO MODELO</span>
          <strong>{displayedConfidence}%</strong>
          <div className="bacbo-confidence-track" aria-hidden="true"><i style={{ width: `${displayedConfidence}%` }} /></div>
          <small>Índice baseado nas runs sincronizadas desta dificuldade; não garante o próximo percurso.</small>
          <button type="button" className="auto-analyze-button" onClick={analyzeNow}>ANALISAR AGORA</button>
        </div>
      </section>

      <section className="auto-performance-row">
        <article className="premium-card"><span>ACERTOS AUTOMÁTICOS</span><strong>{performance.hits}</strong></article>
        <article className="premium-card"><span>ERROS AUTOMÁTICOS</span><strong>{performance.misses}</strong></article>
        <article className="premium-card"><span>ASSERTIVIDADE OBSERVADA</span><strong>{observedAccuracy === null ? "—" : `${Math.round(observedAccuracy * 100)}%`}</strong></article>
        <article className="premium-card"><span>ÚLTIMA PREVISÃO</span><strong className={performance.lastVerdict === "HIT" ? "auto-hit" : performance.lastVerdict === "MISS" ? "auto-miss" : ""}>{performance.lastVerdict === "HIT" ? "✓ ACERTO" : performance.lastVerdict === "MISS" ? "✕ ERRADO" : "—"}</strong>{performance.lastExpected && performance.lastActual !== null && <small>{performance.lastExpected} → {performance.lastActual.toFixed(2)}x</small>}</article>
      </section>

      <section className="bacbo-simple-history premium-card">
        <div className="bacbo-simple-history-head">
          <div><span className="eyebrow">HISTÓRICO SINCRONIZADO</span><h2>Runs reconhecidas · {difficultyLabel}</h2></div>
          <button type="button" className="live-ghost-button" onClick={clearSession}>Limpar sessão</button>
        </div>
        <HistoryChips values={filteredRounds.slice(-120).reverse().map((round) => ({
          id: round.id,
          label: `${round.multiplier.toFixed(2)}x`,
          className: round.multiplier >= 3 ? "chip-high" : round.multiplier >= 2 ? "chip-medium" : "chip-low",
          title: `${round.multiplier.toFixed(2)}x · ${difficultyLabel}`,
        }))} />
      </section>
    </main>
  );
}
