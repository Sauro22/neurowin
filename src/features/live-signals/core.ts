export type AnalysisDecision<T extends string> = T | "WAIT";

export interface AnalysisEnvelope<T extends string> {
  decision: AnalysisDecision<T>;
  bestOption: T;
  score: number;
  sampleSize: number;
  reasons: string[];
  caution: string;
  elapsedMs: number;
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function percent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

let localIdCounter = 0;

export function uid(prefix = "round") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  localIdCounter += 1;
  return `${prefix}-${Date.now()}-${localIdCounter}`;
}

export function loadArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function saveArray<T>(key: string, values: T[], max = 5000) {
  localStorage.setItem(key, JSON.stringify(values.slice(-max)));
}

export function clearKey(key: string) {
  localStorage.removeItem(key);
}

export function posterior(
  count: number,
  total: number,
  baseline: number,
  priorStrength: number,
) {
  return (count + baseline * priorStrength) / (total + priorStrength);
}
