import { clamp, type AnalysisEnvelope } from "./core";

export type BacBoOutcome = "PLAYER" | "BANKER" | "TIE";
export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface BacBoRound {
  id: string;
  timestamp: number;
  result: BacBoOutcome;
  source: "CAPTURE" | "MANUAL";
  playerDice?: [DieValue, DieValue];
  bankerDice?: [DieValue, DieValue];
  playerTotal?: number;
  bankerTotal?: number;
}

export interface BacBoAnalysis extends AnalysisEnvelope<BacBoOutcome> {
  probabilities: {
    player: number;
    banker: number;
    tie: number;
  };
  confidence: number;
  consensus: number;
}

const BASE = {
  player: 575 / 1296,
  banker: 575 / 1296,
  tie: 146 / 1296,
};

type SideVote = {
  label: string;
  score: number;
  weight: number;
};

function sideBias(rounds: BacBoRound[], size: number) {
  const sample = rounds.slice(-size);
  let player = 0;
  let banker = 0;
  for (const round of sample) {
    if (round.result === "PLAYER") player += 1;
    if (round.result === "BANKER") banker += 1;
  }
  const total = player + banker;
  return total ? (player - banker) / total : 0;
}

function tieRate(rounds: BacBoRound[], size: number) {
  const sample = rounds.slice(-size);
  if (!sample.length) return BASE.tie;
  const ties = sample.filter((round) => round.result === "TIE").length;
  // Bayesian shrinkage keeps a small sample from turning one tie into a huge signal.
  const prior = 18;
  return (ties + BASE.tie * prior) / (sample.length + prior);
}

function contextVote(rounds: BacBoRound[], length: 1 | 2 | 3): SideVote | null {
  if (rounds.length <= length + 2) return null;
  const context = rounds.slice(-length).map((round) => round.result).join("|");
  let player = 0;
  let banker = 0;

  for (let index = length; index < rounds.length - 1; index += 1) {
    const previous = rounds.slice(index - length, index).map((round) => round.result).join("|");
    if (previous !== context) continue;
    const next = rounds[index].result;
    if (next === "PLAYER") player += 1;
    if (next === "BANKER") banker += 1;
  }

  const total = player + banker;
  const minimum = length === 1 ? 4 : length === 2 ? 3 : 2;
  if (total < minimum) return null;

  return {
    label: `Contexto ${length}`,
    score: (player - banker) / total,
    weight: length === 1 ? 0.85 : length === 2 ? 1.15 : 1.35,
  };
}

function currentStreak(rounds: BacBoRound[]) {
  const nonTie = rounds.filter((round) => round.result !== "TIE");
  if (!nonTie.length) return { outcome: null as "PLAYER" | "BANKER" | null, length: 0 };
  const outcome = nonTie[nonTie.length - 1].result as "PLAYER" | "BANKER";
  let length = 0;
  for (let index = nonTie.length - 1; index >= 0; index -= 1) {
    if (nonTie[index].result !== outcome) break;
    length += 1;
  }
  return { outcome, length };
}

function streakVote(rounds: BacBoRound[]): SideVote | null {
  const streak = currentStreak(rounds);
  if (!streak.outcome || streak.length < 2) return null;

  const targetLength = Math.min(streak.length, 4);
  let continues = 0;
  let switches = 0;
  const nonTie = rounds.filter((round) => round.result !== "TIE");

  for (let index = targetLength; index < nonTie.length - 1; index += 1) {
    const block = nonTie.slice(index - targetLength, index);
    if (!block.every((round) => round.result === block[0].result)) continue;
    const previousOutcome = block[0].result;
    const next = nonTie[index].result;
    if (next === previousOutcome) continues += 1;
    else switches += 1;
  }

  const total = continues + switches;
  if (total < 4) return null;
  const continuationBias = (continues - switches) / total;
  const direction = streak.outcome === "PLAYER" ? 1 : -1;

  return {
    label: `Sequência ${streak.length}`,
    score: continuationBias * direction,
    weight: 1.05,
  };
}

function alternatingVote(rounds: BacBoRound[]): SideVote | null {
  const nonTie = rounds.filter((round) => round.result !== "TIE");
  if (nonTie.length < 5) return null;
  const last = nonTie.slice(-4).map((round) => round.result);
  const isAlternating = last.every((value, index) => index === 0 || value !== last[index - 1]);
  if (!isAlternating) return null;

  // If P/B/P/B is active, continuation means the opposite of the latest side.
  const latest = nonTie[nonTie.length - 1].result;
  const continuation = latest === "PLAYER" ? "BANKER" : "PLAYER";
  const score = continuation === "PLAYER" ? 0.55 : -0.55;
  return { label: "Alternância", score, weight: 0.75 };
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

export function analyzeBacBo(rounds: BacBoRound[]): BacBoAnalysis {
  const started = performance.now();
  const votes: SideVote[] = [];

  const windows: Array<[number, number]> = [
    [6, 1.65],
    [12, 1.35],
    [24, 1.0],
    [50, 0.65],
    [100, 0.35],
  ];

  for (const [size, weight] of windows) {
    if (!rounds.length) continue;
    votes.push({ label: `Últimas ${Math.min(size, rounds.length)}`, score: sideBias(rounds, size), weight });
  }

  for (const length of [1, 2, 3] as const) {
    const vote = contextVote(rounds, length);
    if (vote) votes.push(vote);
  }

  const streak = streakVote(rounds);
  if (streak) votes.push(streak);
  const alternating = alternatingVote(rounds);
  if (alternating) votes.push(alternating);

  let weighted = 0;
  let weightTotal = 0;
  let playerVotes = 0;
  let bankerVotes = 0;

  for (const vote of votes) {
    weighted += vote.score * vote.weight;
    weightTotal += vote.weight;
    if (vote.score > 0.08) playerVotes += 1;
    if (vote.score < -0.08) bankerVotes += 1;
  }

  const sideSignal = weightTotal ? weighted / weightTotal : 0;
  const recentTie = 0.55 * tieRate(rounds, 20) + 0.45 * tieRate(rounds, 60);
  const tie = clamp(recentTie, 0.055, 0.24);
  const playerShare = sigmoid(sideSignal * 4.4);
  const probabilities = {
    player: (1 - tie) * playerShare,
    banker: (1 - tie) * (1 - playerShare),
    tie,
  };

  const sideBest: BacBoOutcome = probabilities.player >= probabilities.banker ? "PLAYER" : "BANKER";
  const tieEligible = rounds.length >= 35 && probabilities.tie >= Math.max(0.155, BASE.tie + 0.035);
  const bestOption: BacBoOutcome = tieEligible && probabilities.tie > Math.max(probabilities.player, probabilities.banker)
    ? "TIE"
    : sideBest;

  const consensusDenominator = Math.max(1, playerVotes + bankerVotes);
  const consensus = Math.round(
    100 * Math.max(playerVotes, bankerVotes) / consensusDenominator,
  );

  const sampleQuality = clamp(rounds.length / 70);
  const signalQuality = clamp(Math.abs(sideSignal) / 0.42);
  const consensusQuality = clamp((consensus - 50) / 50);
  const confidence = Math.round(
    Math.min(89, 28 + 34 * sampleQuality + 19 * signalQuality + 8 * consensusQuality),
  );

  // With a very weak side signal the engine is allowed to wait instead of
  // pretending a tiny difference is actionable.
  const weakSignal = Math.abs(sideSignal) < 0.045 && !tieEligible;
  const decision = rounds.length < 8 || weakSignal ? "WAIT" : bestOption;

  const recent = rounds.slice(-12);
  const recentPlayer = recent.filter((round) => round.result === "PLAYER").length;
  const recentBanker = recent.filter((round) => round.result === "BANKER").length;
  const recentTies = recent.filter((round) => round.result === "TIE").length;

  const reasons = [
    `Histórico utilizado: ${rounds.length} rondas.`,
    `Últimas ${recent.length}: Jogador ${recentPlayer}, Banca ${recentBanker}, Empate ${recentTies}.`,
    `Modelos com direção útil: Jogador ${playerVotes}, Banca ${bankerVotes}; consenso dominante ${consensus}%.`,
    rounds.length < 8
      ? `São necessárias mais ${8 - rounds.length} ronda(s) para a primeira análise.`
      : weakSignal
        ? "Os modelos estão demasiado equilibrados: AGUARDAR."
        : `Opção mais bem classificada: ${bestOption}.`,
  ];

  return {
    decision,
    bestOption,
    score: confidence,
    confidence,
    consensus,
    sampleSize: rounds.length,
    probabilities,
    reasons,
    caution:
      "A confiança é um índice de concordância/evidência do modelo sobre o histórico observado. Não é garantia nem a probabilidade física real do próximo lançamento.",
    elapsedMs: performance.now() - started,
  };
}
