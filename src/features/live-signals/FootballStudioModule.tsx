import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeFootballStudio,
  type FootballOutcome,
  type FootballStudioAnalysis,
  type FootballStudioRound,
} from "./footballStudioEngine";
import AutoBoardCapture from "./AutoBoardCapture";
import { loadArray, saveArray, uid } from "./core";
import { HistoryChips } from "./Shared";

const STORAGE_KEY = "neurowin-live-football-auto-v1";
const PERFORMANCE_KEY = "neurowin-live-football-auto-performance-v1";
const DEFAULT_URL = "https://www.bettilt746.com/pt/game/football-studio/real";

type Performance = {
  hits: number;
  misses: number;
  lastVerdict: "HIT" | "MISS" | null;
  lastExpected: FootballOutcome | null;
  lastActual: FootballOutcome | null;
};

const EMPTY: Performance = {
  hits: 0,
  misses: 0,
  lastVerdict: null,
  lastExpected: null,
  lastActual: null,
};

function labelOutcome(outcome: FootballOutcome) {
  if (outcome === "HOME") return "CASA";
  if (outcome === "AWAY") return "VISITANTE";
  return "EMPATE";
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

function makeRound(result: FootballOutcome, timestamp = Date.now()): FootballStudioRound {
  return { id: uid("football-auto"), timestamp, result, source: "CAPTURE" };
}

function appendedValues(previous: FootballOutcome[], next: FootballOutcome[]) {
  if (!previous.length) return next;
  const maxOverlap = Math.min(previous.length, next.length);
  for (let overlap = maxOverlap; overlap >= 1; overlap -= 1) {
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (previous[previous.length - overlap + index] !== next[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return next.slice(overlap);
  }
  return next.length ? [next[next.length - 1]] : [];
}

export default function FootballStudioModule({ onBack }: { onBack: () => void }) {
  const initialRounds = loadArray<FootballStudioRound>(STORAGE_KEY);
  const [rounds, setRounds] = useState<FootballStudioRound[]>(initialRounds);
  const [analysis, setAnalysis] = useState<FootballStudioAnalysis | null>(
    initialRounds.length ? analyzeFootballStudio(initialRounds) : null,
  );
  const [performance, setPerformance] = useState<Performance>(() => loadPerformance());
  const [readingQuality, setReadingQuality] = useState(0);

  const roundsRef = useRef(rounds);
  const analysisRef = useRef(analysis);
  const snapshotRef = useRef<FootballOutcome[]>([]);

  useEffect(() => { roundsRef.current = rounds; }, [rounds]);
  useEffect(() => { analysisRef.current = analysis; }, [analysis]);

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

  function processRound(result: FootballOutcome, currentRounds: FootballStudioRound[]) {
    const previous = analysisRef.current;
    if (previous && previous.decision !== "WAIT") {
      const hit = previous.bestOption === result;
      const current = loadPerformance();
      persistPerformance({
        hits: current.hits + (hit ? 1 : 0),
        misses: current.misses + (hit ? 0 : 1),
        lastVerdict: hit ? "HIT" : "MISS",
        lastExpected: previous.bestOption,
        lastActual: result,
      });
    }

    const nextRounds = [...currentRounds, makeRound(result)].slice(-5000);
    saveArray(STORAGE_KEY, nextRounds);
    setRounds(nextRounds);
    roundsRef.current = nextRounds;
    const nextAnalysis = analyzeFootballStudio(nextRounds);
    setAnalysis(nextAnalysis);
    analysisRef.current = nextAnalysis;
    return nextRounds;
  }

  function onSnapshot(snapshot: { values: string[]; signature: string; quality: number; markerCount: number }) {
    const values = snapshot.values.filter(
      (value): value is FootballOutcome => value === "HOME" || value === "AWAY" || value === "TIE",
    );
    if (!values.length) return;
    setReadingQuality(snapshot.quality);

    if (!snapshotRef.current.length) {
      snapshotRef.current = values;
      if (!roundsRef.current.length) {
        const now = Date.now();
        const seeded = values.slice(-120).map((result, index) =>
          makeRound(result, now - (values.length - index) * 1000),
        );
        saveArray(STORAGE_KEY, seeded);
        setRounds(seeded);
        roundsRef.current = seeded;
        const next = analyzeFootballStudio(seeded);
        setAnalysis(next);
        analysisRef.current = next;
      }
      return;
    }

    const additions = appendedValues(snapshotRef.current, values);
    snapshotRef.current = values;
    let current = roundsRef.current;
    for (const result of additions.slice(-6)) current = processRound(result, current);
  }

  function analyzeNow() {
    const next = analyzeFootballStudio(roundsRef.current);
    setAnalysis(next);
    analysisRef.current = next;
  }

  function clearSession() {
    if (!window.confirm("Apagar o histórico automático e o desempenho do Football Studio?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PERFORMANCE_KEY);
    setRounds([]);
    roundsRef.current = [];
    setAnalysis(null);
    analysisRef.current = null;
    setPerformance(EMPTY);
    snapshotRef.current = [];
  }

  const waiting = !analysis || analysis.decision === "WAIT";

  return (
    <main className="page live-signals-page auto-game-page">
      <button type="button" className="live-back" onClick={onBack}>← Voltar aos sinais</button>

      <section className="auto-game-hero premium-card led-border">
        <div>
          <span className="eyebrow">FOOTBALL STUDIO • ANÁLISE AUTOMÁTICA</span>
          <h1>Football Studio</h1>
          <p>A NeuroWin lê o histórico Casa/Visitante visível na mesa e atualiza o modelo em cada nova ronda.</p>
        </div>
        <div className="auto-game-kpis">
          <div><span>Rondas</span><strong>{rounds.length}</strong></div>
          <div><span>Leitura</span><strong>{readingQuality}%</strong></div>
          <div><span>Janela</span><strong>11 s</strong></div>
        </div>
      </section>

      <AutoBoardCapture
        mode="FOOTBALL_STUDIO"
        title="Football Studio"
        defaultUrl={DEFAULT_URL}
        windowSeconds={11}
        onSnapshot={onSnapshot}
      />

      <section className={`auto-signal-card premium-card ${waiting ? "is-waiting" : analysis.bestOption === "HOME" ? "signal-player" : analysis.bestOption === "AWAY" ? "signal-banker" : "signal-tie"}`}>
        <div className="auto-signal-copy">
          <span className="eyebrow">PRÓXIMA APOSTA SUGERIDA</span>
          <strong>{waiting ? "AGUARDAR" : labelOutcome(analysis.bestOption)}</strong>
          <p>{rounds.length < 8 ? `A recolher histórico automático (${rounds.length}/8).` : waiting ? "Sem sinal suficientemente forte." : `Análise atualizada em ${analysis.elapsedMs.toFixed(1)} ms.`}</p>
        </div>
        <div className="auto-confidence-box">
          <span>CONFIANÇA DO MODELO</span>
          <strong>{displayedConfidence}%</strong>
          <div className="bacbo-confidence-track" aria-hidden="true"><i style={{ width: `${displayedConfidence}%` }} /></div>
          <small>Índice estatístico interno, não garantia da carta seguinte.</small>
          <button type="button" className="auto-analyze-button" onClick={analyzeNow}>ANALISAR AGORA</button>
        </div>
      </section>

      <section className="auto-performance-row">
        <article className="premium-card"><span>ACERTOS AUTOMÁTICOS</span><strong>{performance.hits}</strong></article>
        <article className="premium-card"><span>ERROS AUTOMÁTICOS</span><strong>{performance.misses}</strong></article>
        <article className="premium-card"><span>ASSERTIVIDADE OBSERVADA</span><strong>{observedAccuracy === null ? "—" : `${Math.round(observedAccuracy * 100)}%`}</strong></article>
        <article className="premium-card"><span>ÚLTIMA PREVISÃO</span><strong className={performance.lastVerdict === "HIT" ? "auto-hit" : performance.lastVerdict === "MISS" ? "auto-miss" : ""}>{performance.lastVerdict === "HIT" ? "✓ ACERTO" : performance.lastVerdict === "MISS" ? "✕ ERRADO" : "—"}</strong>{performance.lastExpected && performance.lastActual && <small>{labelOutcome(performance.lastExpected)} → {labelOutcome(performance.lastActual)}</small>}</article>
      </section>

      <section className="bacbo-simple-history premium-card">
        <div className="bacbo-simple-history-head">
          <div><span className="eyebrow">HISTÓRICO SINCRONIZADO</span><h2>Resultados reconhecidos</h2></div>
          <button type="button" className="live-ghost-button" onClick={clearSession}>Limpar sessão</button>
        </div>
        <HistoryChips values={rounds.slice(-120).reverse().map((round) => ({
          id: round.id,
          label: round.result === "HOME" ? "C" : round.result === "AWAY" ? "V" : "E",
          className: round.result === "HOME" ? "chip-banker" : round.result === "AWAY" ? "chip-player" : "chip-tie",
          title: labelOutcome(round.result),
        }))} />
      </section>
    </main>
  );
}
