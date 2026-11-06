/**
 * Adaptive learning policy — every tunable number in one place.
 *
 * Nothing here is an educational standard. The mastery bands are the initial
 * policy the product asked for; the weights and window sizes are starting
 * values chosen so that the behaviour is easy to explain to a student ("you got
 * 4 of your last 6 fraction questions right"). Change them here and every
 * score, band, recommendation and quiz plan follows on the next request:
 * mastery is recomputed from stored evidence on every read, so no data
 * migration is needed when the policy changes.
 *
 * The algorithm these feed is documented in ./mastery.ts.
 */

export type MasteryBand = "foundational" | "developing" | "nearly-proficient" | "proficient";

/** Question-bank difficulty labels, plus the numeric scale the selector works on. */
export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTY_VALUE: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

export interface BandDefinition {
  id: MasteryBand;
  /** Inclusive lower bound on the 0–100 mastery score. */
  min: number;
  label: string;
}

export interface AdaptiveConfig {
  mastery: {
    /** Most recent responses kept per skill. Older ones still count through the lifetime totals. */
    windowSize: number;
    /** A response's weight halves every `recencyHalfLife` newer responses. */
    recencyHalfLife: number;
    /** Blend of recency-weighted accuracy against lifetime accuracy (the rest). */
    recentWeight: number;
    /** Score the estimate is shrunk toward while evidence is thin. */
    priorScore: number;
    /** How many "pseudo-responses" the prior is worth. */
    priorStrength: number;
    /** Fewer responses than this and no score is reported at all. */
    minEvidence: number;
    /** Consistency is measured across blocks of this many responses. */
    consistencyBlockSize: number;
    /** Largest share of the score that erratic performance can remove. */
    consistencyPenalty: number;
    /** Weight of a correct answer to a question already answered correctly in the window. */
    repeatCorrectDiscount: number;
    /** Evidence weight by outcome and difficulty. */
    difficultyWeights: {
      correct: Record<Difficulty, number>;
      incorrect: Record<Difficulty, number>;
    };
    /** Accuracy change between the two most recent blocks that counts as a trend. */
    trendThreshold: number;
    /** Same question wrong this many times in the window = a repeated mistake. */
    repeatedMistakeThreshold: number;
    /** This many misses among the last five responses = struggling right now. */
    recentStruggleMisses: number;
    /** Ascending by `min`; the first band must start at 0. */
    bands: BandDefinition[];
    /** Confidence below `lowBelow` is "low", at or above `highFrom` is "high". */
    confidence: { lowBelow: number; highFrom: number };
  };
  revision: {
    /** Days without practice before a well-learned skill is due for review. */
    intervalDays: Partial<Record<MasteryBand, number>>;
  };
  difficulty: {
    min: number;
    max: number;
    /** Starting level for a skill with no history: between easy and medium. */
    initial: number;
    /** Where each band pulls the level toward. */
    bandTargets: Record<MasteryBand, number>;
    /** Difficulty rises gradually and falls faster when a student struggles. */
    maxStepUp: number;
    maxStepDown: number;
  };
  quiz: {
    questionCount: number;
    secondsPerQuestion: number;
    /** An unsubmitted session can no longer be submitted after this long. */
    sessionTtlMinutes: number;
    /** Questions answered in the last N responses are de-prioritised when selecting. */
    recentlySeenWindow: number;
  };
  recommendations: {
    limit: number;
    /** Below this many graded responses in total, the student gets a placement quiz first. */
    minTotalEvidence: number;
  };
}

export const ADAPTIVE_CONFIG: AdaptiveConfig = {
  mastery: {
    windowSize: 20,
    recencyHalfLife: 6,
    recentWeight: 0.7,
    priorScore: 50,
    // Six pseudo-responses: a single perfect 5-question quiz lands at ~73
    // ("nearly proficient"), never "proficient". It takes sustained accuracy
    // across several sessions to cross 85.
    priorStrength: 6,
    minEvidence: 3,
    consistencyBlockSize: 5,
    consistencyPenalty: 0.15,
    repeatCorrectDiscount: 0.5,
    difficultyWeights: {
      // Getting a hard question right is stronger evidence of mastery…
      correct: { easy: 0.8, medium: 1, hard: 1.25 },
      // …and missing an easy one is stronger evidence of a gap.
      incorrect: { easy: 1.25, medium: 1, hard: 0.8 },
    },
    trendThreshold: 0.2,
    repeatedMistakeThreshold: 2,
    recentStruggleMisses: 3,
    bands: [
      { id: "foundational", min: 0, label: "Needs foundational support" },
      { id: "developing", min: 40, label: "Developing understanding" },
      { id: "nearly-proficient", min: 70, label: "Nearly proficient" },
      { id: "proficient", min: 85, label: "Proficient" },
    ],
    confidence: { lowBelow: 0.5, highFrom: 0.75 },
  },
  revision: {
    intervalDays: { "nearly-proficient": 7, proficient: 14 },
  },
  difficulty: {
    min: 1,
    max: 3,
    initial: 1.75,
    bandTargets: {
      foundational: 1,
      developing: 1.5,
      "nearly-proficient": 2.25,
      proficient: 2.75,
    },
    maxStepUp: 0.5,
    maxStepDown: 1,
  },
  quiz: {
    questionCount: 5,
    secondsPerQuestion: 60,
    sessionTtlMinutes: 6 * 60,
    recentlySeenWindow: 10,
  },
  recommendations: {
    limit: 6,
    minTotalEvidence: 5,
  },
};

/** The difficulty label closest to a numeric level. */
export function difficultyForLevel(level: number): Difficulty {
  if (level < 1.5) return "easy";
  if (level < 2.5) return "medium";
  return "hard";
}

/** Normalises bank metadata; anything unrecognised is null rather than guessed. */
export function parseDifficulty(value: unknown): Difficulty | null {
  return value === "easy" || value === "medium" || value === "hard" ? value : null;
}
