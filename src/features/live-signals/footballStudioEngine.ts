import {
  clamp,
  percent,
  posterior,
  type AnalysisEnvelope,
} from "./core";

export type FootballOutcome = "HOME" | "AWAY" | "TIE";
export type FootballRank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export interface FootballStudioRound {
  id: string;
  timestamp: number;
  result: FootballOutcome;
  source: "MANUAL" | "CAPTURE";
  homeRank?: FootballRank;
  awayRank?: FootballRank;
}

export interface FootballStudioAnalysis
  extends AnalysisEnvelope<FootballOutcome> {
  probabilities: {
    home: number;
    away: number;
    tie: number;
  };
  expectedValue: {
    home: number;
    away: number;
    tie: number;
  };
  confidence: number;
}

/**
 * Evolution Football Studio (Top Card): 8 decks, 32 cards of each rank.
 * Baseline before observing the shoe:
 *   Draw = 31 / 415
 *   Home = Away = 192 / 415
 */
const BASE = {
  home: 192 / 415,
  away: 192 / 415,
  tie: 31 / 415,
};

type Counts = { home: number; away: number; tie: number; total: number };

function counts(rounds: FootballStudioRound[]): Counts {
  const out = { home: 0, away: 0, tie: 0, total: rounds.length };
  for (const round of rounds) {
    if (round.result === "HOME") out.home += 1;
    if (round.result === "AWAY") out.away += 1;
    if (round.result === "TIE") out.tie += 1;
  }
  return out;
}

function estimateOutcome(
  rounds: FootballStudioRound[],
  key: "home" | "away" | "tie",
  base: number,
) {
  const windows = [
    { size: 8, prior: 18, weight: 0.18 },
    { size: 20, prior: 34, weight: 0.24 },
    { size: 50, prior: 70, weight: 0.24 },
    { size: 120, prior: 140, weight: 0.18 },
  ];

  let value = base;
  let totalWeight = 1;

  for (const window of windows) {
    const sample = rounds.slice(-window.size);
    if (!sample.length) continue;
    const c = counts(sample);
    const hits = c[key];
    const p = posterior(hits, sample.length, base, window.prior);
    const w = Math.min(window.weight, sample.length / (window.size * 2.5));
    value = (value * totalWeight + p * w) / (totalWeight + w);
    totalWeight += w;
  }

  return value;
}

function expectedValues(p: { home: number; away: number; tie: number }) {
  return {
    home: p.home - p.away - 0.5 * p.tie,
    away: p.away - p.home - 0.5 * p.tie,
    tie: 11 * p.tie - (1 - p.tie),
  };
}

function chooseBest(
  expectedValue: FootballStudioAnalysis["expectedValue"],
  rounds: FootballStudioRound[],
): FootballOutcome {
  const rows: Array<[FootballOutcome, number]> = [
    ["HOME", expectedValue.home],
    ["AWAY", expectedValue.away],
    ["TIE", expectedValue.tie],
  ];
  rows.sort((a, b) => b[1] - a[1]);

  if (Math.abs(rows[0][1] - rows[1][1]) < 1e-9) {
    const lastNonTie = [...rounds].reverse().find((round) => round.result !== "TIE");
    if (lastNonTie?.result === "AWAY") return "AWAY";
    if (lastNonTie?.result === "HOME") return "HOME";
  }

  return rows[0][0];
}

function optionProbability(
  p: FootballStudioAnalysis["probabilities"],
  option: FootballOutcome,
) {
  if (option === "HOME") return p.home;
  if (option === "AWAY") return p.away;
  return p.tie;
}

export function rankValue(rank: FootballRank) {
  const order: FootballRank[] = [
    "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
  ];
  return order.indexOf(rank) + 2;
}

export function outcomeFromRanks(home: FootballRank, away: FootballRank): FootballOutcome {
  const h = rankValue(home);
  const a = rankValue(away);
  if (h > a) return "HOME";
  if (a > h) return "AWAY";
  return "TIE";
}

export function analyzeFootballStudio(
  rounds: FootballStudioRound[],
): FootballStudioAnalysis {
  const started = performance.now();

  const raw = {
    home: estimateOutcome(rounds, "home", BASE.home),
    away: estimateOutcome(rounds, "away", BASE.away),
    tie: estimateOutcome(rounds, "tie", BASE.tie),
  };

  const total = raw.home + raw.away + raw.tie;
  const probabilities = {
    home: raw.home / total,
    away: raw.away / total,
    tie: raw.tie / total,
  };

  const expectedValue = expectedValues(probabilities);
  const bestOption = chooseBest(expectedValue, rounds);
  const selectedProbability = optionProbability(probabilities, bestOption);
  const others = (["HOME", "AWAY", "TIE"] as FootballOutcome[])
    .filter((option) => option !== bestOption)
    .map((option) => optionProbability(probabilities, option))
    .sort((a, b) => b - a);

  const separation = Math.max(0, selectedProbability - (others[0] ?? 0));
  const sampleQuality = clamp(rounds.length / 80);
  const separationQuality = clamp(separation / 0.10);
  const confidence = Math.round(
    Math.min(89, 22 + 45 * sampleQuality + 22 * separationQuality),
  );

  const decision = rounds.length >= 8 ? bestOption : "WAIT";
  const recent = counts(rounds.slice(-20));
  const reasons: string[] = [
    `Histórico utilizado: ${rounds.length} rondas.`,
    recent.total
      ? `Últimas ${recent.total}: Casa ${percent(recent.home / recent.total)}, Visitante ${percent(recent.away / recent.total)}, Empate ${percent(recent.tie / recent.total)}.`
      : "Ainda não existem rondas registadas.",
    rounds.length < 8
      ? `Regista pelo menos ${8 - rounds.length} ronda(s) adicional(is) antes da primeira sugestão.`
      : `A opção mais bem classificada neste momento é ${bestOption}.`,
  ];

  return {
    decision,
    bestOption,
    score: confidence,
    confidence,
    sampleSize: rounds.length,
    probabilities,
    expectedValue,
    reasons,
    caution:
      "A confiança é um índice interno baseado no histórico registado; não é garantia nem a probabilidade real de a próxima carta produzir esse resultado.",
    elapsedMs: performance.now() - started,
  };
}
