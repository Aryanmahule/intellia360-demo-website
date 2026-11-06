/**
 * Skill mastery — a pure, deterministic estimate built from graded answers.
 *
 * A "skill" is the question bank's `topic` tag ("fractions", "place-value"),
 * scoped to the student's grade. That is the level the evidence actually
 * exists at: every bank question carries one, and nothing finer.
 *
 * Only server-graded, idempotent submissions become evidence (adaptive and
 * practice quiz sessions, the daily quiz). Self-reported scores never do.
 *
 * ── Algorithm ───────────────────────────────────────────────────────────────
 *
 *  1. Recent accuracy R — the last `windowSize` responses, newest weighted most
 *     (weight halves every `recencyHalfLife` responses). Each response is also
 *     weighted by difficulty and outcome: a correct hard answer and a missed
 *     easy one count more than their opposites. A correct answer to a question
 *     already answered correctly inside the window counts at
 *     `repeatCorrectDiscount`, so re-answering a remembered question cannot
 *     inflate the score — the bank is small enough that repeats are common.
 *
 *  2. Historical accuracy H — lifetime correct / attempts, unweighted.
 *
 *  3. base = recentWeight·R + (1 − recentWeight)·H
 *
 *  4. Consistency C — once the window holds two full blocks of
 *     `consistencyBlockSize`, C = 1 − stddev(block accuracies) / 0.5. Erratic
 *     performance removes up to `consistencyPenalty` of the score:
 *        raw = 100 · base · (1 − consistencyPenalty · (1 − C))
 *
 *  5. Shrinkage — the estimate is pulled toward `priorScore` in proportion to
 *     how little evidence there is:
 *        score = (n·raw + k·prior) / (n + k),   n = attempts, k = priorStrength
 *     so one quiz is never definitive. Below `minEvidence` responses no score
 *     is reported ("insufficient-data").
 *
 *  Confidence = n / (n + k): how much the score rests on evidence rather than
 *  the prior.
 */
import {
  ADAPTIVE_CONFIG,
  type AdaptiveConfig,
  type Difficulty,
  type MasteryBand,
} from "@/lib/adaptive/config";

/** Where a piece of evidence came from — informational, never trusted for scoring. */
export type EvidenceSource = "adaptive" | "practice" | "daily" | "test";

/** One graded response. Kept short: up to `windowSize` of these live on each row. */
export interface EvidenceItem {
  /** Question id. */
  q: string;
  /** Answered correctly. */
  c: boolean;
  /** Difficulty from bank metadata; null when the bank did not label it. */
  d: Difficulty | null;
  /** ISO timestamp. */
  at: string;
  s: EvidenceSource;
}

/** The persisted state mastery is computed from. */
export interface MasteryRecord {
  attempts: number;
  correct: number;
  /** Oldest first, newest last. */
  recent: EvidenceItem[];
  lastPracticedAt: Date | null;
  difficultyLevel: number;
}

export type BandOrInsufficient = MasteryBand | "insufficient-data";
export type Trend = "improving" | "declining" | "steady" | "unknown";
export type ConfidenceLabel = "low" | "medium" | "high";

export interface MasteryResult {
  /** 0–100, or null while evidence is below `minEvidence`. */
  score: number | null;
  band: BandOrInsufficient;
  bandLabel: string;
  /** 0–1. */
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  evidenceCount: number;
  correctCount: number;
  /** Responses in the recent window, and how many were correct — the numbers reasons quote. */
  windowCount: number;
  windowCorrect: number;
  /** 0–1 recency/difficulty-weighted accuracy over the window. */
  recentAccuracy: number | null;
  /** 0–1 lifetime accuracy. */
  historicalAccuracy: number | null;
  /** 0–1, null until the window holds two full blocks. */
  consistency: number | null;
  trend: Trend;
  /** Question ids answered wrongly at least `repeatedMistakeThreshold` times in the window. */
  repeatedMistakes: string[];
  /** At least `recentStruggleMisses` of the last five responses were wrong. */
  recentStruggle: boolean;
  daysSincePractice: number | null;
  revisionDue: boolean;
}

export const EMPTY_RECORD: MasteryRecord = {
  attempts: 0,
  correct: 0,
  recent: [],
  lastPracticedAt: null,
  difficultyLevel: ADAPTIVE_CONFIG.difficulty.initial,
};

const DAY_MS = 86_400_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function accuracy(items: EvidenceItem[]): number {
  return items.length === 0 ? 0 : items.filter((i) => i.c).length / items.length;
}

/** The band a score falls in. Bands are sorted ascending by `min`. */
export function bandFor(score: number, config: AdaptiveConfig = ADAPTIVE_CONFIG): MasteryBand {
  const bands = config.mastery.bands;
  let band = bands[0];
  for (const candidate of bands) {
    if (score >= candidate.min) band = candidate;
  }
  return band.id;
}

export function bandLabel(band: BandOrInsufficient, config: AdaptiveConfig = ADAPTIVE_CONFIG): string {
  if (band === "insufficient-data") return "Not enough data yet";
  return config.mastery.bands.find((b) => b.id === band)?.label ?? band;
}

/** Step 1: recency-, difficulty- and repeat-weighted accuracy over the window. */
export function weightedRecentAccuracy(
  recent: EvidenceItem[],
  config: AdaptiveConfig = ADAPTIVE_CONFIG
): number | null {
  if (recent.length === 0) return null;
  const { recencyHalfLife, difficultyWeights, repeatCorrectDiscount } = config.mastery;

  let weighted = 0;
  let total = 0;
  for (let i = 0; i < recent.length; i++) {
    const item = recent[i];
    const age = recent.length - 1 - i; // 0 = newest
    const recency = Math.pow(0.5, age / recencyHalfLife);
    const outcome = item.c ? difficultyWeights.correct : difficultyWeights.incorrect;
    const difficulty = outcome[item.d ?? "medium"];
    // A question this student already got right earlier in the window.
    const repeat =
      item.c && recent.slice(0, i).some((prior) => prior.q === item.q && prior.c)
        ? repeatCorrectDiscount
        : 1;

    const w = recency * difficulty * repeat;
    weighted += w * (item.c ? 1 : 0);
    total += w;
  }
  return total === 0 ? null : weighted / total;
}

/** Step 4: 1 − normalised spread of block accuracies, newest blocks first. */
export function consistencyOf(
  recent: EvidenceItem[],
  config: AdaptiveConfig = ADAPTIVE_CONFIG
): number | null {
  const size = config.mastery.consistencyBlockSize;
  const blockCount = Math.floor(recent.length / size);
  if (blockCount < 2) return null;

  const blocks: number[] = [];
  for (let b = 0; b < blockCount; b++) {
    const end = recent.length - b * size;
    blocks.push(accuracy(recent.slice(end - size, end)));
  }
  const mean = blocks.reduce((a, v) => a + v, 0) / blocks.length;
  const variance = blocks.reduce((a, v) => a + (v - mean) ** 2, 0) / blocks.length;
  // The largest possible standard deviation of values in [0, 1] is 0.5.
  return clamp(1 - Math.sqrt(variance) / 0.5, 0, 1);
}

function trendOf(recent: EvidenceItem[], config: AdaptiveConfig): Trend {
  if (recent.length < 6) return "unknown";
  const half = Math.min(5, Math.floor(recent.length / 2));
  const latest = recent.slice(-half);
  const previous = recent.slice(-2 * half, -half);
  const delta = accuracy(latest) - accuracy(previous);
  if (delta > config.mastery.trendThreshold) return "improving";
  if (delta < -config.mastery.trendThreshold) return "declining";
  return "steady";
}

function repeatedMistakesOf(recent: EvidenceItem[], config: AdaptiveConfig): string[] {
  const misses = new Map<string, number>();
  for (const item of recent) {
    if (!item.c) misses.set(item.q, (misses.get(item.q) ?? 0) + 1);
  }
  return [...misses]
    .filter(([, count]) => count >= config.mastery.repeatedMistakeThreshold)
    .map(([q]) => q);
}

/** Computes the full mastery picture for one skill. Pure: same inputs, same output. */
export function computeMastery(
  record: MasteryRecord,
  now: Date,
  config: AdaptiveConfig = ADAPTIVE_CONFIG
): MasteryResult {
  const m = config.mastery;
  const recent = record.recent.slice(-m.windowSize);
  // Lifetime counters can never be smaller than what the window itself shows.
  const n = Math.max(record.attempts, recent.length);
  const correctCount = Math.max(record.correct, recent.filter((i) => i.c).length);

  const confidence = n / (n + m.priorStrength);
  const confidenceLabel: ConfidenceLabel =
    confidence < m.confidence.lowBelow ? "low" : confidence < m.confidence.highFrom ? "medium" : "high";

  const daysSincePractice = record.lastPracticedAt
    ? Math.max(0, Math.floor((now.getTime() - record.lastPracticedAt.getTime()) / DAY_MS))
    : null;

  const recentAccuracy = weightedRecentAccuracy(recent, config);
  const historicalAccuracy = n > 0 ? correctCount / n : null;
  const consistency = consistencyOf(recent, config);
  const lastFive = recent.slice(-5);
  const recentStruggle = lastFive.filter((i) => !i.c).length >= m.recentStruggleMisses;

  const common = {
    confidence,
    confidenceLabel,
    evidenceCount: n,
    correctCount,
    windowCount: recent.length,
    windowCorrect: recent.filter((i) => i.c).length,
    recentAccuracy,
    historicalAccuracy,
    consistency,
    trend: trendOf(recent, config),
    repeatedMistakes: repeatedMistakesOf(recent, config),
    recentStruggle,
    daysSincePractice,
  };

  if (n < m.minEvidence || recentAccuracy === null || historicalAccuracy === null) {
    return {
      ...common,
      score: null,
      band: "insufficient-data",
      bandLabel: bandLabel("insufficient-data", config),
      revisionDue: false,
    };
  }

  const base = m.recentWeight * recentAccuracy + (1 - m.recentWeight) * historicalAccuracy;
  const raw = 100 * base * (1 - m.consistencyPenalty * (1 - (consistency ?? 1)));
  const score = Math.round(clamp((n * raw + m.priorStrength * m.priorScore) / (n + m.priorStrength), 0, 100));
  const band = bandFor(score, config);

  const interval = config.revision.intervalDays[band];
  const revisionDue = interval !== undefined && daysSincePractice !== null && daysSincePractice >= interval;

  return { ...common, score, band, bandLabel: bandLabel(band, config), revisionDue };
}

/**
 * Appends graded responses to a record. Pure — the caller persists the result.
 * The window is trimmed to `windowSize`; lifetime counters keep everything.
 */
export function mergeEvidence(
  record: MasteryRecord,
  items: EvidenceItem[],
  now: Date,
  config: AdaptiveConfig = ADAPTIVE_CONFIG
): MasteryRecord {
  if (items.length === 0) return record;
  const recent = [...record.recent, ...items].slice(-config.mastery.windowSize);
  const merged: MasteryRecord = {
    attempts: record.attempts + items.length,
    correct: record.correct + items.filter((i) => i.c).length,
    recent,
    lastPracticedAt: now,
    difficultyLevel: record.difficultyLevel,
  };
  merged.difficultyLevel = nextDifficultyLevel(record.difficultyLevel, computeMastery(merged, now, config), config);
  return merged;
}

/**
 * The difficulty staircase for the next quiz on a skill.
 *
 * The level moves toward the band's target, but by at most `maxStepUp` per
 * update — difficulty rises gradually — and by up to `maxStepDown` when the
 * student is struggling, so support arrives quickly. Recent struggle always
 * steps down at least half a level, even when the (smoothed) band is still high.
 */
export function nextDifficultyLevel(
  previous: number | null | undefined,
  mastery: MasteryResult,
  config: AdaptiveConfig = ADAPTIVE_CONFIG
): number {
  const d = config.difficulty;
  const start = clamp(previous ?? d.initial, d.min, d.max);
  if (mastery.band === "insufficient-data") {
    return mastery.recentStruggle ? clamp(start - 0.5, d.min, d.max) : start;
  }

  let target = d.bandTargets[mastery.band];
  if (mastery.recentStruggle) target = Math.min(target, start - 0.5);

  const step = clamp(target - start, -d.maxStepDown, d.maxStepUp);
  // Quarter steps keep the stored value readable.
  return clamp(Math.round((start + step) * 4) / 4, d.min, d.max);
}

/** Validates the JSON stored in a row's `recent` field; drops anything malformed. */
export function parseEvidence(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  const out: EvidenceItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.q !== "string" || typeof item.c !== "boolean" || typeof item.at !== "string") continue;
    const d = item.d === "easy" || item.d === "medium" || item.d === "hard" ? item.d : null;
    const s = item.s === "adaptive" || item.s === "practice" || item.s === "daily" || item.s === "test" ? item.s : "practice";
    out.push({ q: item.q, c: item.c, d, at: item.at, s });
  }
  return out;
}
