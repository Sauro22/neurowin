import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeLightningRoulette,
  type RouletteAnalysis,
  type RouletteDecision,
  type RouletteSpin,
} from "./rouletteEngine";
import AutoRouletteCapture from "./AutoRouletteCapture";
import { loadArray, saveArray } from "./core";
import { HistoryChips } from "./Shared";

const STORAGE_KEY = "neurowin-live-lightning-roulette-auto-v1";
const PERFORMANCE_KEY = "neurowin-live-roulette-auto-performance-v1";

type Performance = {
  hits: number;
  misses: number;
  lastVerdict: "HIT" | "MISS" | null;
  lastExpected: RouletteDecision | null;
  lastActual: number | null;
};

const EMPTY: Performance = {
  hits: 0,
  misses: 0,
  lastVerdict: null,
  lastExpected: null,
  lastActual: null,
};

const REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function rouletteClass(number: number) {
  if (number === 0) return "chip-zero";
  return REDS.has(number) ? "chip-red" : "chip-black";
}

function hitDecision(decision: RouletteDecision, number: number) {
  if (number === 0) return false;
  if (decision === "1ª DÚZIA") return number >= 1 && number <= 12;
  if (decision === "2ª DÚZIA") return number >= 13 && number <= 24;
  if (decision === "3ª DÚZIA") return number >= 25 && number <= 36;
  if (decision === "1ª COLUNA") return (number - 1) % 3 === 0;
  if (decision === "2ª COLUNA") return (number - 2) % 3 === 0;
  return (number - 3) % 3 === 0;
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

export default function LightningRouletteModule({ onBack }: { onBack: () => void }) {
  const initial = loadArray<RouletteSpin>(STORAGE_KEY);
  const [spins, setSpins] = useState<RouletteSpin[]>(initial);
  const [analysis, setAnalysis] = useState<RouletteAnalysis | null>(
    initial.length ? analyzeLightningRoulette(initial) : null,
  );
  const [performance, setPerformance] = useState<Performance>(() => loadPerformance());

  const spinsRef = useRef(spins);
  const analysisRef = useRef(analysis);
  useEffect(() => { spinsRef.current = spins; }, [spins]);
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

  function onSpin(spin: RouletteSpin) {
    const previous = analysisRef.current;
    if (previous && previous.decision !== "WAIT") {
      const hit = hitDecision(previous.bestOption, spin.number);
      const current = loadPerformance();
      persistPerformance({
        hits: current.hits + (hit ? 1 : 0),
        misses: current.misses + (hit ? 0 : 1),
        lastVerdict: hit ? "HIT" : "MISS",
        lastExpected: previous.bestOption,
        lastActual: spin.number,
      });
    }

    const next = [...spinsRef.current, spin].slice(-5000);
    saveArray(STORAGE_KEY, next);
    setSpins(next);
    spinsRef.current = next;
    const nextAnalysis = analyzeLightningRoulette(next);
    setAnalysis(nextAnalysis);
    analysisRef.current = nextAnalysis;
  }

  function analyzeNow() {
    const next = analyzeLightningRoulette(spinsRef.current);
    setAnalysis(next);
    analysisRef.current = next;
  }

  function clearSession() {
    if (!window.confirm("Apagar o histórico automático e o desempenho da Lightning Roulette?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PERFORMANCE_KEY);
    setSpins([]);
    spinsRef.current = [];
    setAnalysis(null);
    analysisRef.current = null;
    setPerformance(EMPTY);
  }

  const waiting = !analysis || analysis.decision === "WAIT";

  return (
    <main className="page live-signals-page auto-game-page">
      <button type="button" className="live-back" onClick={onBack}>← Voltar aos sinais</button>

      <section className="auto-game-hero premium-card led-border">
        <div>
          <span className="eyebrow">XXXtreme LIGHTNING ROULETTE • ANÁLISE AUTOMÁTICA</span>
          <h1>Lightning Roulette</h1>
          <p>A NeuroWin acompanha automaticamente o resultado vencedor e atualiza dúzias/colunas após cada spin.</p>
        </div>
        <div className="auto-game-kpis">
          <div><span>Spins</span><strong>{spins.length}</strong></div>
          <div><span>Último</span><strong>{spins.length ? spins[spins.length - 1].number : "—"}</strong></div>
          <div><span>Janela</span><strong>19 s</strong></div>
        </div>
      </section>

      <AutoRouletteCapture onSpin={onSpin} />

      <section className={`auto-signal-card premium-card ${waiting ? "is-waiting" : "signal-player"}`}>
        <div className="auto-signal-copy">
          <span className="eyebrow">PRÓXIMA APOSTA SUGERIDA</span>
          <strong>{waiting ? "AGUARDAR" : analysis.bestOption}</strong>
          <p>{spins.length < 12 ? `A recolher resultados automáticos (${spins.length}/12).` : waiting ? "Sem sinal suficientemente forte." : `Análise atualizada em ${analysis.elapsedMs.toFixed(1)} ms.`}</p>
        </div>
        <div className="auto-confidence-box">
          <span>CONFIANÇA DO MODELO</span>
          <strong>{displayedConfidence}%</strong>
          <div className="bacbo-confidence-track" aria-hidden="true"><i style={{ width: `${displayedConfidence}%` }} /></div>
          <small>Índice estatístico interno. Lightning/multiplicadores não são tratados como conhecidos antes do fecho das apostas.</small>
          <button type="button" className="auto-analyze-button" onClick={analyzeNow}>ANALISAR AGORA</button>
        </div>
      </section>

      <section className="auto-performance-row">
        <article className="premium-card"><span>ACERTOS AUTOMÁTICOS</span><strong>{performance.hits}</strong></article>
        <article className="premium-card"><span>ERROS AUTOMÁTICOS</span><strong>{performance.misses}</strong></article>
        <article className="premium-card"><span>ASSERTIVIDADE OBSERVADA</span><strong>{observedAccuracy === null ? "—" : `${Math.round(observedAccuracy * 100)}%`}</strong></article>
        <article className="premium-card"><span>ÚLTIMA PREVISÃO</span><strong className={performance.lastVerdict === "HIT" ? "auto-hit" : performance.lastVerdict === "MISS" ? "auto-miss" : ""}>{performance.lastVerdict === "HIT" ? "✓ ACERTO" : performance.lastVerdict === "MISS" ? "✕ ERRADO" : "—"}</strong>{performance.lastExpected !== null && performance.lastActual !== null && <small>{performance.lastExpected} → {performance.lastActual}</small>}</article>
      </section>

      <section className="bacbo-simple-history premium-card">
        <div className="bacbo-simple-history-head">
          <div><span className="eyebrow">HISTÓRICO SINCRONIZADO</span><h2>Números reconhecidos</h2></div>
          <button type="button" className="live-ghost-button" onClick={clearSession}>Limpar sessão</button>
        </div>
        <HistoryChips values={spins.slice(-120).reverse().map((spin) => ({ id: spin.id, label: String(spin.number), className: rouletteClass(spin.number), title: `Número ${spin.number}` }))} />
      </section>
    </main>
  );
}
