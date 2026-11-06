import { describe, expect, it } from "vitest";
import { ADAPTIVE_CONFIG } from "@/lib/adaptive/config";
import { computeMastery, EMPTY_RECORD, mergeEvidence, type EvidenceItem, type MasteryRecord } from "@/lib/adaptive/mastery";
import {
  buildActivity,
  buildMasteryHistory,
  buildMistakes,
  buildQuizHistory,
  buildSkillProgress,
  dayRange,
  describeQuiz,
  overallMastery,
  previewNextQuiz,
  recordBefore,
  type SkillRecord,
} from "@/lib/adaptive/progress";
import type { SkillState } from "@/lib/adaptive/recommendations";
import { skillLabel } from "@/lib/adaptive/skill-map";

const NOW = new Date("2026-10-20T15:00:00Z");
const day = (key: string, hour = 10) => new Date(`${key}T${String(hour).padStart(2, "0")}:00:00Z`);

/** Folds quizzes into a record exactly as the live write path does. */
function practise(quizzes: { at: Date; outcomes: boolean[]; q?: string[]; s?: EvidenceItem["s"] }[]): MasteryRecord {
  let rec: MasteryRecord = EMPTY_RECORD;
  let n = 0;
  for (const quiz of quizzes) {
    const items: EvidenceItem[] = quiz.outcomes.map((c, i) => ({
      q: quiz.q?.[i] ?? `q${n++}`,
      c,
      d: "medium",
      at: quiz.at.toISOString(),
      s: quiz.s ?? "adaptive",
    }));
    rec = mergeEvidence(rec, items, quiz.at);
  }
  return rec;
}

function state(skill: string, rec: MasteryRecord): SkillState {
  return { skill, label: skillLabel(skill), mastery: computeMastery(rec, NOW), difficultyLevel: rec.difficultyLevel };
}

const right = (k: number) => Array<boolean>(k).fill(true);
const wrong = (k: number) => Array<boolean>(k).fill(false);

describe("days", () => {
  it("covers the range oldest first, today included, in UTC", () => {
    expect(dayRange(NOW, 3)).toEqual(["2026-10-18", "2026-10-19", "2026-10-20"]);
    expect(dayRange(new Date("2026-03-01T23:59:59Z"), 2)).toEqual(["2026-02-28", "2026-03-01"]);
  });
});

describe("rebuilding past mastery", () => {
  it("removes later answers from the window and the lifetime counters", () => {
    const rec = practise([
      { at: day("2026-10-18"), outcomes: [true, false, true] },
      { at: day("2026-10-19"), outcomes: [false, false] },
    ]);
    const before = recordBefore(rec, day("2026-10-19").getTime())!;
    expect(before.attempts).toBe(3);
    expect(before.correct).toBe(2);
    expect(before.recent).toHaveLength(3);
  });

  it("matches the stored record exactly once every answer is included", () => {
    const rec = practise([
      { at: day("2026-10-18"), outcomes: [true, false, true] },
      { at: day("2026-10-19"), outcomes: [false, true] },
    ]);
    const all = recordBefore(rec, NOW.getTime() + 1)!;
    expect(computeMastery(all, NOW).score).toBe(computeMastery(rec, NOW).score);
  });

  it("is empty before the first answer", () => {
    const rec = practise([{ at: day("2026-10-19"), outcomes: right(5) }]);
    expect(recordBefore(rec, day("2026-10-18").getTime())!.attempts).toBe(0);
  });

  it("cannot rebuild a moment whose answers are no longer stored", () => {
    const quizzes = Array.from({ length: 5 }, (_, i) => ({ at: day(`2026-10-1${i}`), outcomes: right(5) }));
    const rec = practise(quizzes); // 25 answers, the window keeps 20
    expect(rec.recent).toHaveLength(ADAPTIVE_CONFIG.mastery.windowSize);
    expect(recordBefore(rec, day("2026-10-10", 23).getTime())).toBeNull();
    expect(recordBefore(rec, day("2026-10-11", 23).getTime())!.attempts).toBe(10);
  });
});

describe("mastery history", () => {
  const days = ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"];

  it("is null before the first answer, then follows each day's evidence", () => {
    const fractions = practise([
      { at: day("2026-10-18"), outcomes: wrong(4) },
      { at: day("2026-10-20"), outcomes: right(5) },
    ]);
    const { points, historyFrom } = buildMasteryHistory([{ skill: "fractions", record: fractions }], days, NOW);
    expect(historyFrom).toBeNull();
    expect(points.map((p) => p.date)).toEqual(days);
    expect(points[0].overall).toBeNull();
    expect(points[1].overall).not.toBeNull();
    // An idle day keeps the previous score: mastery only moves with evidence.
    expect(points[2].overall).toBe(points[1].overall);
    expect(points[3].overall!).toBeGreaterThan(points[2].overall!);
  });

  it("ends on today's overview number", () => {
    const records: SkillRecord[] = [
      { skill: "fractions", record: practise([{ at: day("2026-10-19"), outcomes: [true, false, false, true] }]) },
      { skill: "division", record: practise([{ at: day("2026-10-20"), outcomes: right(6) }]) },
    ];
    const today = overallMastery(records.map((r) => computeMastery(r.record, NOW)));
    const { points } = buildMasteryHistory(records, days, NOW);
    expect(points[points.length - 1].overall).toBe(today);
    expect(points[points.length - 1].assessedSkills).toBe(2);
  });

  it("says where history starts once old answers have been dropped", () => {
    const quizzes = Array.from({ length: 5 }, (_, i) => ({ at: day(`2026-10-1${5 + i}`), outcomes: right(5) }));
    const rec = practise(quizzes); // answers on the 15th..19th; the 15th has been dropped
    const { points, historyFrom } = buildMasteryHistory([{ skill: "fractions", record: rec }], dayRange(NOW, 7), NOW);
    expect(historyFrom).toBe("2026-10-16");
    expect(points.find((p) => p.date === "2026-10-15")!.overall).toBeNull();
    expect(points.find((p) => p.date === "2026-10-16")!.overall).not.toBeNull();
  });

  it("weights topics by their evidence, as the overview does", () => {
    expect(overallMastery([{ score: 80, evidenceCount: 3 }, { score: 40, evidenceCount: 1 }, { score: null, evidenceCount: 2 }])).toBe(70);
    expect(overallMastery([{ score: null, evidenceCount: 2 }])).toBeNull();
  });
});

describe("topic history", () => {
  it("has one point per graded quiz and the latest answers without question content", () => {
    const rec = practise([
      { at: day("2026-10-18"), outcomes: [true, true] },
      { at: day("2026-10-19"), outcomes: [true, false, true] },
      { at: day("2026-10-20"), outcomes: right(3) },
    ]);
    const progress = buildSkillProgress(state("fractions", rec), rec, NOW);
    expect(progress.points).toHaveLength(3);
    expect(progress.points[0].score).toBeNull(); // 2 answers: below minEvidence
    expect(progress.points[2].score).toBe(computeMastery(rec, NOW).score);
    expect(progress.recentAnswers).toHaveLength(8);
    expect(Object.keys(progress.recentAnswers[0]).sort()).toEqual(["at", "correct", "difficulty", "source"]);
  });
});

describe("quiz history and activity", () => {
  const lessonTitle = (id: string) => (id === "meaning-of-fractions" ? "Meaning of fractions" : null);

  it.each([
    ["adaptive", null, "placement", "Placement quiz"],
    ["adaptive", "fractions", "smart", "Smart practice · Fractions"],
    ["adaptive-number-sense", "number-sense", "topic", "Number sense practice"],
    ["practice-meaning-of-fractions", null, "practice", "Meaning of fractions practice"],
    ["practice-1", null, "practice", "Mixed practice"],
    ["practice-unknown", null, "practice", "Lesson practice"],
  ])("names %s (focus %s) as a %s quiz", (quizId, focus, kind, title) => {
    expect(describeQuiz(quizId, focus, lessonTitle)).toEqual({ kind, title });
  });

  it("merges sessions and daily quizzes, newest first, and skips unreadable results", () => {
    const history = buildQuizHistory(
      [
        {
          id: "s1",
          quizId: "adaptive-fractions",
          focusSkill: "fractions",
          submittedAt: day("2026-10-19"),
          createdAt: day("2026-10-19", 9),
          result: {
            scorePercent: 60,
            correctAnswers: 3,
            totalQuestions: 5,
            mastery: [{ skill: "fractions", label: "Fractions", before: 37, after: 49, band: "developing", bandLabel: "Developing understanding" }],
          },
        },
        { id: "s2", quizId: "adaptive", focusSkill: null, submittedAt: day("2026-10-18"), createdAt: day("2026-10-18"), result: null },
      ],
      [{ id: "d1", completedAt: day("2026-10-20"), score: 4, questions: [{}, {}, {}, {}, {}] }],
      lessonTitle
    );
    expect(history.map((h) => h.id)).toEqual(["d1", "s1"]);
    expect(history[0]).toMatchObject({ kind: "daily", correct: 4, total: 5, scorePercent: 80, mastery: [] });
    expect(history[1].mastery[0]).toMatchObject({ skill: "fractions", before: 37, after: 49 });
  });

  it("counts answers per day inside the range only", () => {
    const history = buildQuizHistory(
      [],
      [
        { id: "d1", completedAt: day("2026-10-20"), score: 4, questions: [] },
        { id: "d2", completedAt: day("2026-10-01"), score: 5, questions: [] },
      ],
      lessonTitle
    );
    const activity = buildActivity(history, ["2026-10-19", "2026-10-20"]);
    expect(activity).toEqual([
      { date: "2026-10-19", answered: 0, correct: 0, quizzes: 0 },
      { date: "2026-10-20", answered: 5, correct: 4, quizzes: 1 },
    ]);
  });
});

describe("mistakes to review", () => {
  it("lists misses from adaptive and daily quizzes that are still unresolved", () => {
    const fractions = practise([
      { at: day("2026-10-18"), outcomes: [false, false], q: ["dq_g3_003", "dq_g3_007"], s: "adaptive" },
      { at: day("2026-10-19"), outcomes: [true], q: ["dq_g3_007"], s: "practice" },
    ]);
    const time = practise([{ at: day("2026-10-20"), outcomes: [false], q: ["dq_g3_005"], s: "daily" }]);
    const mistakes = buildMistakes([
      { skill: "fractions", record: fractions },
      { skill: "time", record: time },
    ]);
    // dq_g3_007 was answered correctly afterwards, so only two remain, newest first.
    expect(mistakes.map((m) => m.questionId)).toEqual(["dq_g3_005", "dq_g3_003"]);
    expect(mistakes[0]).toMatchObject({ skill: "time", source: "daily", practiceHref: "/student/quiz/adaptive-time" });
    expect(mistakes[0].correctAnswer).toBeTruthy();
    expect(mistakes[0].question).toBeTruthy();
  });

  it("never reveals answers to questions missed only in practice quizzes", () => {
    const rec = practise([{ at: day("2026-10-20"), outcomes: [false], q: ["dq_g3_003"], s: "practice" }]);
    expect(buildMistakes([{ skill: "fractions", record: rec }])).toEqual([]);
  });

  it("skips questions that have left the bank", () => {
    const rec = practise([{ at: day("2026-10-20"), outcomes: [false], q: ["gone"], s: "adaptive" }]);
    expect(buildMistakes([{ skill: "fractions", record: rec }])).toEqual([]);
  });
});

describe("next quiz preview", () => {
  it("is a placement quiz for a new learner", () => {
    const preview = previewNextQuiz([state("fractions", EMPTY_RECORD), state("time", EMPTY_RECORD)])!;
    expect(preview.kind).toBe("diagnostic");
    expect(preview.href).toBe("/student/quiz/adaptive");
    expect(preview.mix.reduce((sum, m) => sum + m.questions, 0)).toBe(ADAPTIVE_CONFIG.quiz.questionCount);
  });

  it("focuses on the weakest topic, matching what the quiz route will plan", () => {
    const weak = practise([{ at: day("2026-10-19"), outcomes: wrong(5) }]);
    const strong = practise([{ at: day("2026-10-19"), outcomes: right(6) }]);
    const preview = previewNextQuiz([state("time", strong), state("fractions", weak)])!;
    expect(preview.kind).toBe("focused");
    expect(preview.focusSkill).toBe("fractions");
    expect(preview.targetDifficulty).toBe("easy");
    expect(preview.mix[0]).toEqual({ skill: "fractions", label: "Fractions", questions: 3 });
  });

  it("is null when the grade has nothing to assess", () => {
    expect(previewNextQuiz([])).toBeNull();
  });
});
