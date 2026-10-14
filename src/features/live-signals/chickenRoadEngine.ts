import {
  clamp,
  percent,
  type AnalysisEnvelope,
} from "./core";

export type ChickenDifficulty = "EASY" | "MEDIUM" | "HARD" | "HARDCORE";
export type ChickenEndReason = "CRASH" | "CASHOUT";

export interface ChickenRoadRound {
  id: string;
  timestamp: number;
  multiplier: number;
  difficulty?: ChickenDifficulty;
  endReason?: ChickenEndReason;
  source: "MANUAL" | "CAPTURE";
}

export type ChickenDecision = "1.5X" | "2X" | "3X";

export interface ChickenRoadAnalysis
  extends AnalysisEnvelope<ChickenDecision> {
  survival: {
    x15: number;
    x2: number;
    x3: number;
  };
  eligible: {
    x15: number;
    x2: number;
    x3: number;
  };
  expectedValue: {
    x15: number;
    x2: number;
    x3: number;
  };
  lowerExpectedValue: {
    x15: number;
    x2: number;
    x3: number;
  };
  confidence: number;
}

function wilsonLower(hits: number, total: number, z = 1.64) {
  if (!total) return 0;
  const phat = hits / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = phat + z2 / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
  return (centre - margin) / denominator;
}

function estimateTarget(rounds: ChickenRoadRound[], target: number) {
  const eligible = rounds.filter((round) => {
    if (round.multiplier >= target) return true;
    return (round.endReason ?? "CRASH") === "CRASH";
  });

  const hits = eligible.filter((round) => round.multiplier >= target).length;
  const total = eligible.length;
  const probability = total ? (hits + 1) / (total + 2) : 0;
  const lower = wilsonLower(hits, total);
  const expectedValue = probability * target - 1;
  const lowerExpectedValue = lower * target - 1;

  return { probability, lower, hits, total, expectedValue, lowerExpectedValue };
}

export function analyzeChickenRoad(
  allRounds: ChickenRoadRound[],
  difficulty: ChickenDifficulty,
): ChickenRoadAnalysis {
  const started = performance.now();

  const rounds = allRounds.filter(
    (round) => !round.difficulty || round.difficulty === difficulty,
  );

  const x15 = estimateTarget(rounds, 1.5);
  const x2 = estimateTarget(rounds, 2);
  const x3 = estimateTarget(rounds, 3);

  const survival = {
    x15: x15.probability,
    x2: x2.probability,
    x3: x3.probability,
  };
  const eligible = { x15: x15.total, x2: x2.total, x3: x3.total };
  const expectedValue = {
    x15: x15.expectedValue,
    x2: x2.expectedValue,
    x3: x3.expectedValue,
  };
  const lowerExpectedValue = {
    x15: x15.lowerExpectedValue,
    x2: x2.lowerExpectedValue,
    x3: x3.lowerExpectedValue,
  };

  const candidates: Array<[ChickenDecision, number, number]> = [
    ["1.5X", x15.expectedValue, x15.total],
    ["2X", x2.expectedValue, x2.total],
    ["3X", x3.expectedValue, x3.total],
  ];
  candidates.sort((a, b) => b[1] - a[1]);

  const [bestOption, bestEv, bestN] = candidates[0];
  const secondEv = candidates[1]?.[1] ?? bestEv;
  const sampleQuality = clamp(bestN / 80);
  const separationQuality = clamp(Math.max(0, bestEv - secondEv) / 0.15);
  const confidence = Math.round(
    Math.min(89, 22 + 47 * sampleQuality + 20 * separationQuality),
  );

  const decision = rounds.length >= 8 ? bestOption : "WAIT";
  const reasons: string[] = [
    `Dificuldade analisada: ${difficulty}.`,
    `Histórico desta dificuldade: ${rounds.length} runs.`,
    `Sobrevivência observada: ≥1.5x ${percent(survival.x15)}, ≥2x ${percent(survival.x2)}, ≥3x ${percent(survival.x3)}.`,
    rounds.length < 8
      ? `Regista pelo menos ${8 - rounds.length} run(s) adicional(is) nesta dificuldade antes da primeira sugestão.`
      : `O alvo mais bem classificado neste momento é ${bestOption}.`,
  ];

  return {
    decision,
    bestOption,
    score: confidence,
    confidence,
    sampleSize: rounds.length,
    survival,
    eligible,
    expectedValue,
    lowerExpectedValue,
    reasons,
    caution:
      "A confiança é um índice baseado nos runs registados para esta dificuldade. Não revela a posição do próximo obstáculo e não garante o próximo percurso.",
    elapsedMs: performance.now() - started,
  };
}
