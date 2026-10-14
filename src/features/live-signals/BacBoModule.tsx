import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeBacBo,
  type BacBoAnalysis,
  type BacBoOutcome,
  type BacBoRound,
} from "./bacBoEngine";
import AutoBoardCapture from "./AutoBoardCapture";
import { loadArray, saveArray, uid } from "./core";
import { HistoryChips } from "./Shared";

const STORAGE_KEY = "neurowin-live-bacbo-auto-v1";
const PERFORMANCE_KEY = "neurowin-live-bacbo-auto-performance-v1";
const DEFAULT_URL = "https://www.bettilt746.com/pt/game/bac-bo/real";

type AutoPerformance = {
  hits: number;
  misses: number;
  lastVerdict: "HIT" | "MISS" | null;
  lastExpected: BacBoOutcome | null;
  lastActual: BacBoOutcome | null;
};

type PendingPrediction = {
  option: BacBoOutcome;
  createdAt: number;
};

const EMPTY_PERFORMANCE: AutoPerformance = {
  hits: 0,
  misses: 0,
  lastVerdict: null,
  lastExpected: null,
  lastActual: null,
};

function labelOutcome(outcome: BacBoOutcome) {
  if (outcome === "PLAYER") return "JOGADOR";
  if (outcome === "BANKER") return "BANCA";
  return "EMPATE";
}

function loadPerformance(): AutoPerformance {
  try {
    const raw = localStorage.getItem(PERFORMANCE_KEY);

    if (!raw) {
      return { ...EMPTY_PERFORMANCE };
    }

    return {
      ...EMPTY_PERFORMANCE,
      ...(JSON.parse(raw) as Partial<AutoPerformance>),
    };
  } catch {
    return { ...EMPTY_PERFORMANCE };
  }
}

function makeRound(
  result: BacBoOutcome,
  timestamp = Date.now(),
): BacBoRound {
  return {
    id: uid("bacbo-auto"),
    timestamp,
    result,
    source: "CAPTURE",
  };
}

function appendedValues(
  previous: BacBoOutcome[],
  next: BacBoOutcome[],
) {
  if (!previous.length) {
    return next;
  }

  const maxOverlap = Math.min(
    previous.length,
    next.length,
  );

  // Procura a maior parte comum entre o fim
  // da leitura antiga e o início da leitura nova.
  for (
    let overlap = maxOverlap;
    overlap >= 1;
    overlap -= 1
  ) {
    let matches = true;

    for (
      let index = 0;
      index < overlap;
      index += 1
    ) {
      if (
        previous[
          previous.length -
            overlap +
            index
        ] !== next[index]
      ) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return next.slice(overlap);
    }
  }

  // Se o road se reorganizar,
  // não adicionamos o quadro inteiro novamente.
  return next.length
    ? [next[next.length - 1]]
    : [];
}

export default function BacBoModule({
  onBack,
}: {
  onBack: () => void;
}) {
  const [rounds, setRounds] = useState<
    BacBoRound[]
  >(() => loadArray(STORAGE_KEY));

  // NUNCA analisar automaticamente ao abrir.
  const [analysis, setAnalysis] =
    useState<BacBoAnalysis | null>(null);

  const [performance, setPerformance] =
    useState<AutoPerformance>(() =>
      loadPerformance(),
    );

  const [readingQuality, setReadingQuality] =
    useState(0);

  const roundsRef =
    useRef<BacBoRound[]>(rounds);

  const snapshotRef =
    useRef<BacBoOutcome[]>([]);

  // Só existe depois de carregar em ANALISAR AGORA.
  const pendingPredictionRef =
    useRef<PendingPrediction | null>(null);

  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);

  const totalPredictions =
    performance.hits +
    performance.misses;

  const observedAccuracy =
    totalPredictions > 0
      ? performance.hits /
        totalPredictions
      : null;

  const displayedConfidence =
    useMemo(() => {
      if (!analysis) {
        return 0;
      }

      // Com poucos testes mostramos o score interno.
      if (
        observedAccuracy === null ||
        totalPredictions < 20
      ) {
        return Math.round(
          analysis.confidence,
        );
      }

      // Depois começamos a incluir desempenho real.
      return Math.round(
        Math.min(
          89,
          analysis.confidence * 0.68 +
            observedAccuracy *
              100 *
              0.32,
        ),
      );
    }, [
      analysis,
      observedAccuracy,
      totalPredictions,
    ]);

  function savePerformance(
    next: AutoPerformance,
  ) {
    localStorage.setItem(
      PERFORMANCE_KEY,
      JSON.stringify(next),
    );

    setPerformance(next);
  }

  function processNewRound(
    result: BacBoOutcome,
    currentRounds: BacBoRound[],
  ) {
    const pending =
      pendingPredictionRef.current;

    // Só contamos ACERTO/ERRO se houve
    // uma previsão criada manualmente.
    if (pending) {
      const hit =
        pending.option === result;

      const current =
        loadPerformance();

      savePerformance({
        hits:
          current.hits +
          (hit ? 1 : 0),

        misses:
          current.misses +
          (hit ? 0 : 1),

        lastVerdict: hit
          ? "HIT"
          : "MISS",

        lastExpected:
          pending.option,

        lastActual:
          result,
      });

      // A previsão só pode ser avaliada uma vez.
      pendingPredictionRef.current =
        null;
    }

    const nextRounds = [
      ...currentRounds,
      makeRound(result),
    ].slice(-5000);

    saveArray(
      STORAGE_KEY,
      nextRounds,
    );

    setRounds(nextRounds);

    roundsRef.current =
      nextRounds;

    // Terminou uma ronda.
    // A previsão desaparece.
    // NÃO gerar outra automaticamente.
    setAnalysis(null);

    return nextRounds;
  }

  function onSnapshot(snapshot: {
    values: string[];
    signature: string;
    quality: number;
    markerCount: number;
  }) {
    const values =
      snapshot.values.filter(
        (
          value,
        ): value is BacBoOutcome =>
          value === "PLAYER" ||
          value === "BANKER" ||
          value === "TIE",
      );

    if (!values.length) {
      return;
    }

    setReadingQuality(
      snapshot.quality,
    );

    // PRIMEIRA LEITURA
    if (
      !snapshotRef.current.length
    ) {
      snapshotRef.current =
        values;

      // Importa o histórico visível
      // se ainda não houver histórico local.
      if (
        !roundsRef.current.length
      ) {
        const now = Date.now();

        const seeded =
          values
            .slice(-120)
            .map(
              (
                result,
                index,
              ) =>
                makeRound(
                  result,
                  now -
                    (values.length -
                      index) *
                      1000,
                ),
            );

        saveArray(
          STORAGE_KEY,
          seeded,
        );

        setRounds(seeded);

        roundsRef.current =
          seeded;
      }

      // Nunca analisar automaticamente.
      setAnalysis(null);

      return;
    }

    const additions =
      appendedValues(
        snapshotRef.current,
        values,
      );

    snapshotRef.current =
      values;

    if (!additions.length) {
      return;
    }

    let currentRounds =
      roundsRef.current;

    // Proteção contra o quadro reorganizar-se
    // e criar muitas rondas falsas.
    for (const result of additions.slice(
      -3,
    )) {
      currentRounds =
        processNewRound(
          result,
          currentRounds,
        );
    }
  }

  // ESTE É O ÚNICO LOCAL
  // ONDE SE CRIA UMA PREVISÃO.
  function analyzeNow() {
    const currentRounds =
      roundsRef.current;

    if (
      currentRounds.length < 8
    ) {
      setAnalysis(null);

      pendingPredictionRef.current =
        null;

      window.alert(
        `Ainda só existem ${currentRounds.length} rondas reconhecidas. São necessárias pelo menos 8.`,
      );

      return;
    }

    const next =
      analyzeBacBo(
        currentRounds,
      );

    setAnalysis(next);

    if (
      next.decision === "WAIT"
    ) {
      pendingPredictionRef.current =
        null;

      return;
    }

    pendingPredictionRef.current =
      {
        option:
          next.bestOption,

        createdAt:
          Date.now(),
      };

    // Apagar o veredito anterior do ecrã.
    // Os totais de acertos/erros continuam guardados.
    setPerformance(
      (current) => ({
        ...current,

        lastVerdict:
          null,

        lastExpected:
          next.bestOption,

        lastActual:
          null,
      }),
    );
  }

  function clearSession() {
    const confirmed =
      window.confirm(
        "Apagar o histórico e o desempenho do Bac Bo neste navegador?",
      );

    if (!confirmed) {
      return;
    }

    localStorage.removeItem(
      STORAGE_KEY,
    );

    localStorage.removeItem(
      PERFORMANCE_KEY,
    );

    setRounds([]);

    roundsRef.current = [];

    setAnalysis(null);

    setPerformance({
      ...EMPTY_PERFORMANCE,
    });

    snapshotRef.current = [];

    pendingPredictionRef.current =
      null;

    setReadingQuality(0);
  }

  const waiting =
    !analysis ||
    analysis.decision === "WAIT";

  const awaitingResult =
    !!pendingPredictionRef.current;

  return (
    <main className="page live-signals-page auto-game-page">
      <button
        type="button"
        className="live-back"
        onClick={onBack}
      >
        ← Voltar aos sinais
      </button>

      <section className="auto-game-hero premium-card led-border">
        <div>
          <span className="eyebrow">
            BAC BO • ANÁLISE MANUAL
          </span>

          <h1>Bac Bo</h1>

          <p>
            A App NeuroWin acompanha
            automaticamente o histórico
            da mesa. A previsão só é
            criada quando carregas em
            ANALISAR AGORA.
          </p>
        </div>

        <div className="auto-game-kpis">
          <div>
            <span>Rondas</span>

            <strong>
              {rounds.length}
            </strong>
          </div>

          <div>
            <span>Leitura</span>

            <strong>
              {readingQuality}%
            </strong>
          </div>

          <div>
            <span>Janela</span>

            <strong>
              10 s
            </strong>
          </div>
        </div>
      </section>

      <AutoBoardCapture
        mode="BAC_BO"
        title="Bac Bo"
        defaultUrl={DEFAULT_URL}
        windowSeconds={10}
        onSnapshot={onSnapshot}
        hideGamePreview
      />

      <section
        className={`auto-signal-card premium-card ${
          waiting
            ? "is-waiting"
            : `signal-${analysis.bestOption.toLowerCase()}`
        }`}
      >
        <div className="auto-signal-copy">
          <span className="eyebrow">
            PRÓXIMA APOSTA SUGERIDA
          </span>

          <strong>
            {waiting
              ? "AGUARDAR"
              : labelOutcome(
                  analysis.bestOption,
                )}
          </strong>

          <p>
            {rounds.length < 8
              ? `A recolher histórico (${rounds.length}/8 mínimo).`
              : !analysis
                ? "Carrega em ANALISAR AGORA para calcular uma nova previsão."
                : analysis.decision ===
                    "WAIT"
                  ? "O motor não encontrou evidência suficiente para sugerir uma entrada."
                  : `Análise concluída em ${analysis.elapsedMs.toFixed(1)} ms.`}
          </p>
        </div>

        <div className="auto-confidence-box">
          <span>
            CONFIANÇA DO MODELO
          </span>

          <strong>
            {analysis
              ? `${displayedConfidence}%`
              : "—"}
          </strong>

          <div
            className="bacbo-confidence-track"
            aria-hidden="true"
          >
            <i
              style={{
                width: analysis
                  ? `${displayedConfidence}%`
                  : "0%",
              }}
            />
          </div>

          <small>
            Índice estatístico interno.
            Não é garantia do próximo
            resultado.
          </small>

          <button
            type="button"
            className="auto-analyze-button"
            onClick={analyzeNow}
          >
            ANALISAR AGORA
          </button>
        </div>
      </section>

      <section className="auto-performance-row">
        <article className="premium-card">
          <span>
            ACERTOS
          </span>

          <strong>
            {performance.hits}
          </strong>
        </article>

        <article className="premium-card">
          <span>
            ERROS
          </span>

          <strong>
            {performance.misses}
          </strong>
        </article>

        <article className="premium-card">
          <span>
            ASSERTIVIDADE OBSERVADA
          </span>

          <strong>
            {observedAccuracy === null
              ? "—"
              : `${Math.round(
                  observedAccuracy *
                    100,
                )}%`}
          </strong>
        </article>

        <article className="premium-card">
          <span>
            ÚLTIMA PREVISÃO
          </span>

          <strong
            className={
              performance.lastVerdict ===
              "HIT"
                ? "auto-hit"
                : performance.lastVerdict ===
                    "MISS"
                  ? "auto-miss"
                  : ""
            }
          >
            {performance.lastVerdict ===
            "HIT"
              ? "✓ ACERTO"
              : performance.lastVerdict ===
                  "MISS"
                ? "✕ ERRADO"
                : awaitingResult
                  ? "A AGUARDAR RESULTADO"
                  : "—"}
          </strong>

          {performance.lastExpected &&
            performance.lastActual && (
              <small>
                {labelOutcome(
                  performance.lastExpected,
                )}{" "}
                →{" "}
                {labelOutcome(
                  performance.lastActual,
                )}
              </small>
            )}
        </article>
      </section>

      <section className="bacbo-simple-history premium-card">
        <div className="bacbo-simple-history-head">
          <div>
            <span className="eyebrow">
              HISTÓRICO SINCRONIZADO
            </span>

            <h2>
              Resultados reconhecidos
            </h2>
          </div>

          <button
            type="button"
            className="live-ghost-button"
            onClick={clearSession}
          >
            Limpar sessão
          </button>
        </div>

        <HistoryChips
          values={rounds
            .slice(-120)
            .reverse()
            .map((round) => ({
              id:
                round.id,

              label:
                round.result ===
                "PLAYER"
                  ? "J"
                  : round.result ===
                      "BANKER"
                    ? "B"
                    : "E",

              className:
                `chip-${round.result.toLowerCase()}`,

              title:
                labelOutcome(
                  round.result,
                ),
            }))}
        />
      </section>
    </main>
  );
}