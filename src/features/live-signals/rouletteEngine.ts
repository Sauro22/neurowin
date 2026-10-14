import {
  clamp,
  percent,
  posterior,
  type AnalysisEnvelope,
} from "./core";

export interface RouletteSpin {
  id: string;
  timestamp: number;
  number: number;
  source: "MANUAL" | "CAPTURE";
}

export type RouletteDecision =
  | "1ª DÚZIA"
  | "2ª DÚZIA"
  | "3ª DÚZIA"
  | "1ª COLUNA"
  | "2ª COLUNA"
  | "3ª COLUNA";

export interface RouletteAnalysis
  extends AnalysisEnvelope<RouletteDecision> {
  probabilities: Record<RouletteDecision, number>;
  expectedValue: Record<RouletteDecision, number>;
  zeroRate: number;
  lowerBounds: Record<RouletteDecision, number>;
  confidence: number;
}

const BASE = 12 / 37;
const BREAK_EVEN = 1 / 3;

function isDozen(number: number, dozen: 1 | 2 | 3) {
  if (number === 0) return false;
  if (dozen === 1) return number >= 1 && number <= 12;
  if (dozen === 2) return number >= 13 && number <= 24;
  return number >= 25 && number <= 36;
}

function isColumn(number: number, column: 1 | 2 | 3) {
  if (number === 0) return false;
  return ((number - column) % 3 + 3) % 3 === 0;
}

function count(spins: RouletteSpin[], predicate: (number: number) => boolean) {
  let hits = 0;
  for (const spin of spins) if (predicate(spin.number)) hits += 1;
  return hits;
}

function estimate(
  spins: RouletteSpin[],
  predicate: (number: number) => boolean,
) {
  const windows = [
    { size: 12, prior: 24, weight: 0.16 },
    { size: 30, prior: 48, weight: 0.22 },
    { size: 80, prior: 110, weight: 0.24 },
    { size: 200, prior: 260, weight: 0.18 },
  ];

  let value = BASE;
  let used = 1;

  for (const window of windows) {
    const sample = spins.slice(-window.size);
    if (!sample.length) continue;
    const hits = count(sample, predicate);
    const p = posterior(hits, sample.length, BASE, window.prior);
    const w = Math.min(window.weight, sample.length / (window.size * 2.5));
    value = (value * used + p * w) / (used + w);
    used += w;
  }

  return value;
}

function wilsonLower(hits: number, total: number, z = 1.96) {
  if (!total) return 0;
  const phat = hits / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = phat + z2 / (2 * total);
  const margin =
    z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
  return (centre - margin) / denominator;
}

function ev(p: number) {
  return 2 * p - (1 - p);
}

export function analyzeLightningRoulette(
  spins: RouletteSpin[],
): RouletteAnalysis {
  const started = performance.now();

  const predicates: Record<RouletteDecision, (number: number) => boolean> = {
    "1ª DÚZIA": (n) => isDozen(n, 1),
    "2ª DÚZIA": (n) => isDozen(n, 2),
    "3ª DÚZIA": (n) => isDozen(n, 3),
    "1ª COLUNA": (n) => isColumn(n, 1),
    "2ª COLUNA": (n) => isColumn(n, 2),
    "3ª COLUNA": (n) => isColumn(n, 3),
  };

  const probabilities = {} as Record<RouletteDecision, number>;
  const expectedValue = {} as Record<RouletteDecision, number>;
  const lowerBounds = {} as Record<RouletteDecision, number>;

  for (const [key, predicate] of Object.entries(predicates) as Array<
    [RouletteDecision, (number: number) => boolean]
  >) {
    const p = estimate(spins, predicate);
    probabilities[key] = p;
    expectedValue[key] = ev(p);
    lowerBounds[key] = wilsonLower(count(spins, predicate), spins.length);
  }

  const options = (
    Object.entries(probabilities) as Array<[RouletteDecision, number]>
  ).sort((a, b) => b[1] - a[1]);

  const [bestOption, bestProbability] = options[0];
  const secondProbability = options[1]?.[1] ?? BASE;
  const separation = Math.max(0, bestProbability - secondProbability);
  const sampleQuality = clamp(spins.length / 120);
  const separationQuality = clamp(separation / 0.09);
  const deviationQuality = clamp(Math.abs(bestProbability - BASE) / 0.08);

  const confidence = Math.round(
    Math.min(
      89,
      20 + 44 * sampleQuality + 17 * separationQuality + 8 * deviationQuality,
    ),
  );

  const decision = spins.length >= 12 ? bestOption : "WAIT";
  const recent = spins.slice(-20);
  const zeroRate = recent.length
    ? recent.filter((spin) => spin.number === 0).length / recent.length
    : 0;

  const reasons: string[] = [
    `Histórico utilizado: ${spins.length} spins.`,
    `Melhor setor observado: ${bestOption} em ${percent(bestProbability)}; base matemática por dúzia/coluna: ${percent(BASE)}.`,
    spins.length < 12
      ? `Regista pelo menos ${12 - spins.length} spin(s) adicional(is) antes da primeira sugestão.`
      : `A opção mais bem classificada neste momento é ${bestOption}.`,
  ];

  return {
    decision,
    bestOption,
    score: confidence,
    confidence,
    sampleSize: spins.length,
    probabilities,
    expectedValue,
    lowerBounds,
    zeroRate,
    reasons,
    caution:
      "A confiança é um índice do modelo sobre o histórico guardado. Cada spin de uma roleta justa é independente e o índice não garante o próximo resultado.",
    elapsedMs: performance.now() - started,
  };
}
