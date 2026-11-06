import { describe, expect, it } from "vitest";
import { ADAPTIVE_CONFIG, type AdaptiveConfig, type Difficulty } from "@/lib/adaptive/config";
import {
  bandFor,
  computeMastery,
  consistencyOf,
  EMPTY_RECORD,
  mergeEvidence,
  nextDifficultyLevel,
  parseEvidence,
  type EvidenceItem,
  type MasteryRecord,
} from "@/lib/adaptive/mastery";

const NOW = new Date("2026-10-18T12:00:00Z");
let counter = 0;

/** One response; each gets a distinct question id unless one is given. */
function ev(c: boolean, d: Difficulty | null = "medium", q?: string): EvidenceItem {
  return { q: q ?? `q${counter++}`, c, d, at: NOW.toISOString(), s: "adaptive" };
}

function record(items: EvidenceItem[], extra: Partial<MasteryRecord> = {}): MasteryRecord {
  return {
    attempts: items.length,
    correct: items.filter((i) => i.c).length,
    recent: items.slice(-ADAPTIVE_CONFIG.mastery.windowSize),
    lastPracticedAt: NOW,
    difficultyLevel: ADAPTIVE_CONFIG.difficulty.initial,
    ...extra,
  };
}

const times = (n: number, f: () => EvidenceItem) => Array.from({ length: n }, f);

describe("bands", () => {
  it.each([
    [0, "foundational"],
    [39, "foundational"],
    [40, "developing"],
    [69, "developing"],
    [70, "nearly-proficient"],
    [84, "nearly-proficient"],
    [85, "proficient"],
    [100, "proficient"],
  ])("score %i is %s", (score, band) => {
    expect(bandFor(score)).toBe(band);
  });

  it("follows configured thresholds", () => {
    const config: AdaptiveConfig = {
      ...ADAPTIVE_CONFIG,
      mastery: {
        ...ADAPTIVE_CONFIG.mastery,
        bands: [
          { id: "foundational", min: 0, label: "a" },
          { id: "developing", min: 50, label: "b" },
          { id: "nearly-proficient", min: 75, label: "c" },
          { id: "proficient", min: 90, label: "d" },
        ],
      },
    };
    expect(bandFor(49, config)).toBe("foundational");
    expect(bandFor(85, config)).toBe("nearly-proficient");
    expect(bandFor(90, config)).toBe("proficient");
  });
});

describe("insufficient learning history", () => {
  it("reports no score for a skill never practised", () => {
    const m = computeMastery(EMPTY_RECORD, NOW);
    expect(m.score).toBeNull();
    expect(m.band).toBe("insufficient-data");
    expect(m.evidenceCount).toBe(0);
    expect(m.revisionDue).toBe(false);
    expect(m.trend).toBe("unknown");
  });

  it("reports no score below the minimum evidence, even when every answer was right", () => {
    const m = computeMastery(record([ev(true), ev(true)]), NOW);
    expect(m.score).toBeNull();
    expect(m.band).toBe("insufficient-data");
  });

  it("starts scoring at the minimum evidence", () => {
    const m = computeMastery(record(times(3, () => ev(true))), NOW);
    expect(m.score).not.toBeNull();
  });
});

describe("mastery score", () => {
  it("never treats one perfect quiz as proficiency", () => {
    const m = computeMastery(record(times(5, () => ev(true))), NOW);
    expect(m.score).toBe(73);
    expect(m.band).toBe("nearly-proficient");
    expect(m.confidenceLabel).toBe("low");
  });

  it("places one failed quiz in foundational support", () => {
    const m = computeMastery(record(times(5, () => ev(false))), NOW);
    expect(m.score).toBe(27);
    expect(m.band).toBe("foundational");
  });

  it("reaches proficient with sustained accuracy", () => {
    const m = computeMastery(record(times(20, () => ev(true))), NOW);
    expect(m.score).toBeGreaterThanOrEqual(85);
    expect(m.band).toBe("proficient");
    expect(m.confidenceLabel).toBe("high");
  });

  it("weights recent answers more than older ones", () => {
    const early = [...times(5, () => ev(false)), ...times(5, () => ev(true))];
    const late = [...times(5, () => ev(true)), ...times(5, () => ev(false))];
    const recovering = computeMastery(record(early), NOW).score!;
    const slipping = computeMastery(record(late), NOW).score!;
    expect(recovering).toBeGreaterThan(slipping);
  });

  it("counts a correct hard answer as stronger evidence than a correct easy one", () => {
    const base = times(4, () => ev(false, "medium"));
    const hard = computeMastery(record([...base, ...times(4, () => ev(true, "hard"))]), NOW).score!;
    const easy = computeMastery(record([...base, ...times(4, () => ev(true, "easy"))]), NOW).score!;
    expect(hard).toBeGreaterThan(easy);
  });

  it("counts a missed easy answer as a bigger gap than a missed hard one", () => {
    const base = times(4, () => ev(true, "medium"));
    const missedEasy = computeMastery(record([...base, ...times(3, () => ev(false, "easy"))]), NOW).score!;
    const missedHard = computeMastery(record([...base, ...times(3, () => ev(false, "hard"))]), NOW).score!;
    expect(missedEasy).toBeLessThan(missedHard);
  });

  it("discounts re-answering the same question correctly", () => {
    const misses = times(3, () => ev(false));
    const repeated = computeMastery(record([...misses, ...times(6, () => ev(true, "medium", "same"))]), NOW).score!;
    const distinct = computeMastery(record([...misses, ...times(6, () => ev(true))]), NOW).score!;
    expect(repeated).toBeLessThan(distinct);
  });

  it("treats unlabelled difficulty as medium", () => {
    const labelled = computeMastery(record(times(6, () => ev(true, "medium"))), NOW).score;
    const unlabelled = computeMastery(record(times(6, () => ev(true, null))), NOW).score;
    expect(unlabelled).toBe(labelled);
  });

  it("stays within 0–100 for any sequence", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const levels: Difficulty[] = ["easy", "medium", "hard"];
    for (let run = 0; run < 200; run++) {
      const n = 3 + Math.floor(rand() * 40);
      const items = times(n, () => ev(rand() > 0.5, levels[Math.floor(rand() * 3)], `q${Math.floor(rand() * 6)}`));
      const m = computeMastery(record(items), NOW);
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
      expect(m.confidence).toBeGreaterThan(0);
      expect(m.confidence).toBeLessThan(1);
    }
  });

  it("uses lifetime history beyond the window", () => {
    const window = times(20, () => ev(true));
    const strongHistory = computeMastery(record(window, { attempts: 100, correct: 100 }), NOW).score!;
    const weakHistory = computeMastery(record(window, { attempts: 100, correct: 30 }), NOW).score!;
    expect(strongHistory).toBeGreaterThan(weakHistory);
  });
});

describe("consistency", () => {
  it("is unknown until the window has two full blocks", () => {
    expect(consistencyOf(times(9, () => ev(true)))).toBeNull();
  });

  it("is 1 for steady performance and lower for erratic performance", () => {
    const block = (k: number) => [...times(k, () => ev(true)), ...times(5 - k, () => ev(false))];
    const steady = [...block(3), ...block(3), ...block(3), ...block(3)];
    const erratic = [...block(5), ...block(1), ...block(5), ...block(1)];
    expect(consistencyOf(steady)).toBe(1);
    expect(consistencyOf(erratic)!).toBeLessThan(0.5);
  });

  it("lowers the score of erratic performance", () => {
    const block = (k: number) => [...times(k, () => ev(true)), ...times(5 - k, () => ev(false))];
    const erratic = record([...block(5), ...block(0), ...block(5), ...block(0)]);
    const noPenalty: AdaptiveConfig = {
      ...ADAPTIVE_CONFIG,
      mastery: { ...ADAPTIVE_CONFIG.mastery, consistencyPenalty: 0 },
    };
    expect(computeMastery(erratic, NOW).score!).toBeLessThan(computeMastery(erratic, NOW, noPenalty).score!);
  });
});

describe("trend, mistakes and revision", () => {
  it("detects an improving and a declining trend", () => {
    const improving = [...times(5, () => ev(false)), ...times(5, () => ev(true))];
    const declining = [...times(5, () => ev(true)), ...times(5, () => ev(false))];
    expect(computeMastery(record(improving), NOW).trend).toBe("improving");
    expect(computeMastery(record(declining), NOW).trend).toBe("declining");
    expect(computeMastery(record(times(5, () => ev(true))), NOW).trend).toBe("unknown");
  });

  it("flags a question missed repeatedly", () => {
    const items = [ev(false, "easy", "dq_1"), ev(true), ev(true), ev(false, "easy", "dq_1"), ev(true)];
    const m = computeMastery(record(items), NOW);
    expect(m.repeatedMistakes).toEqual(["dq_1"]);
  });

  it("flags recent struggle when most of the last five answers were wrong", () => {
    const items = [...times(10, () => ev(true)), ev(false), ev(true), ev(false), ev(true), ev(false)];
    expect(computeMastery(record(items), NOW).recentStruggle).toBe(true);
    expect(computeMastery(record(times(10, () => ev(true))), NOW).recentStruggle).toBe(false);
  });

  it("schedules revision for a proficient skill after the interval", () => {
    const items = times(20, () => ev(true));
    const stale = record(items, { lastPracticedAt: new Date(NOW.getTime() - 15 * 86_400_000) });
    const fresh = record(items, { lastPracticedAt: new Date(NOW.getTime() - 3 * 86_400_000) });
    expect(computeMastery(stale, NOW).revisionDue).toBe(true);
    expect(computeMastery(stale, NOW).daysSincePractice).toBe(15);
    expect(computeMastery(fresh, NOW).revisionDue).toBe(false);
  });

  it("never schedules revision for a skill still below nearly proficient", () => {
    const weak = record(times(10, () => ev(false)), { lastPracticedAt: new Date(NOW.getTime() - 90 * 86_400_000) });
    expect(computeMastery(weak, NOW).revisionDue).toBe(false);
  });
});

describe("mergeEvidence", () => {
  it("keeps lifetime totals, trims the window and stamps practice time", () => {
    let r: MasteryRecord = EMPTY_RECORD;
    for (let i = 0; i < 6; i++) r = mergeEvidence(r, times(5, () => ev(i % 2 === 0)), NOW);
    expect(r.attempts).toBe(30);
    expect(r.correct).toBe(15);
    expect(r.recent).toHaveLength(ADAPTIVE_CONFIG.mastery.windowSize);
    expect(r.lastPracticedAt).toEqual(NOW);
  });

  it("returns the same record when there is nothing to add", () => {
    expect(mergeEvidence(EMPTY_RECORD, [], NOW)).toBe(EMPTY_RECORD);
  });

  it("raises difficulty gradually across consistently good quizzes", () => {
    let r: MasteryRecord = EMPTY_RECORD;
    const levels: number[] = [];
    for (let i = 0; i < 6; i++) {
      r = mergeEvidence(r, times(5, () => ev(true)), NOW);
      levels.push(r.difficultyLevel);
    }
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(ADAPTIVE_CONFIG.difficulty.maxStepUp);
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
    expect(levels.at(-1)).toBeGreaterThan(ADAPTIVE_CONFIG.difficulty.initial);
  });

  it("lowers difficulty when the student struggles", () => {
    const start: MasteryRecord = { ...EMPTY_RECORD, difficultyLevel: 2.5 };
    const r = mergeEvidence(start, times(5, () => ev(false)), NOW);
    expect(r.difficultyLevel).toBeLessThan(2.5);
  });
});

describe("nextDifficultyLevel", () => {
  const mastery = (records: EvidenceItem[]) => computeMastery(record(records), NOW);

  it("keeps the level while evidence is insufficient", () => {
    expect(nextDifficultyLevel(2, computeMastery(EMPTY_RECORD, NOW))).toBe(2);
    expect(nextDifficultyLevel(null, computeMastery(EMPTY_RECORD, NOW))).toBe(ADAPTIVE_CONFIG.difficulty.initial);
  });

  it("steps up by at most maxStepUp", () => {
    const proficient = mastery(times(20, () => ev(true)));
    expect(nextDifficultyLevel(1, proficient)).toBe(1 + ADAPTIVE_CONFIG.difficulty.maxStepUp);
  });

  it("steps down further than it steps up", () => {
    const failing = mastery(times(20, () => ev(false)));
    expect(nextDifficultyLevel(3, failing)).toBe(3 - ADAPTIVE_CONFIG.difficulty.maxStepDown);
  });

  it("stays within the configured range", () => {
    expect(nextDifficultyLevel(3, mastery(times(20, () => ev(true))))).toBeLessThanOrEqual(3);
    expect(nextDifficultyLevel(1, mastery(times(20, () => ev(false))))).toBeGreaterThanOrEqual(1);
  });
});

describe("parseEvidence", () => {
  it("drops malformed entries and normalises unknown fields", () => {
    const parsed = parseEvidence([
      { q: "a", c: true, d: "hard", at: "2026-01-01", s: "daily" },
      { q: "b", c: "yes", at: "2026-01-01" },
      null,
      { q: "c", c: false, d: "impossible", at: "2026-01-01", s: "hacker" },
    ]);
    expect(parsed).toEqual([
      { q: "a", c: true, d: "hard", at: "2026-01-01", s: "daily" },
      { q: "c", c: false, d: null, at: "2026-01-01", s: "practice" },
    ]);
    expect(parseEvidence("not an array")).toEqual([]);
  });
});
