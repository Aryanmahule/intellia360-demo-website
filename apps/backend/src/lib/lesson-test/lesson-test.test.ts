import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { correctOptionId, getQuestion } from "@/lib/adaptive/question-bank";
import { createRng, decodeQuestionId, encodeQuestionId, numberWords, writeQuestion } from "@/lib/lesson-test/core";
import { FAMILIES, FAMILY_GROUPS, generatedQuestion } from "@/lib/lesson-test/families";
import {
  buildLessonTest,
  LESSON_TEST_SIZE,
  lessonIdFromTestQuizId,
  lessonTestQuizId,
  summarizeLessonTest,
  TEST_SERIES_SIZE,
} from "@/lib/lesson-test/lesson-test";
import { planLessonTest, type LessonTopic, type TopicPick } from "@/lib/lesson-test/topics";

const GRADES_DIR = path.join(process.cwd(), "src", "data", "grades");

/** Every lesson in the shipped curriculum, as the lesson screen would describe it. */
function curriculumLessons(): (LessonTopic & { id: string })[] {
  const out: (LessonTopic & { id: string })[] = [];
  for (const grade of fs.readdirSync(GRADES_DIR)) {
    const file = path.join(GRADES_DIR, grade, "curriculum.json");
    if (!fs.existsSync(file)) continue;
    const curriculum = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const chapter of curriculum.chapters ?? []) {
      const titles: string[] = (chapter.topics ?? []).map((t: { title: string }) => t.title);
      for (const topic of chapter.topics ?? []) {
        out.push({
          id: topic.id,
          grade,
          title: topic.title,
          chapterTitle: chapter.title,
          siblingTitles: titles.filter((t) => t !== topic.title),
        });
      }
    }
  }
  return out;
}

const LESSONS = curriculumLessons();

/** Each family with every params list the curriculum actually uses, plus its defaults. */
function familyParams(): Map<string, number[][]> {
  const byFamily = new Map<string, number[][]>(Object.keys(FAMILIES).map((f) => [f, [[]]]));
  for (const lesson of LESSONS) {
    for (const pick of planLessonTest(lesson).picks) {
      const list = byFamily.get(pick.family)!;
      if (!list.some((p) => p.join("-") === pick.params.join("-"))) list.push(pick.params);
    }
  }
  return byFamily;
}

function seeds(count: number, start = 1): number[] {
  const rng = createRng(start);
  return Array.from({ length: count }, () => rng.int(0, 0xffffffff));
}

describe("question families", () => {
  it("are registered once each", () => {
    const ids = Object.values(FAMILY_GROUPS).flatMap((g) => Object.keys(g));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("always write a well-formed question with exactly one right answer", () => {
    const problems: string[] = [];
    for (const [family, paramsList] of familyParams()) {
      for (const params of paramsList) {
        for (const seed of seeds(250, family.length * 31 + params.length)) {
          const q = writeQuestion(FAMILIES, family, params, seed)!;
          const where = `${family}(${params.join(",")}) seed ${seed}: ${q.questionText}`;
          const texts = q.options.map((o) => o.text);
          const all = [q.questionText, q.hint, q.explanation, ...texts].join(" ");

          if (q.options.length < 2 || q.options.length > 4) problems.push(`${where} — ${q.options.length} options`);
          if (q.options.filter((o) => o.isCorrect).length !== 1) problems.push(`${where} — ${texts.join(" | ")}`);
          if (new Set(texts).size !== texts.length) problems.push(`${where} — duplicate options ${texts.join(" | ")}`);
          if (/undefined|NaN|Infinity|null|\[object/.test(all)) problems.push(`${where} — bad text: ${all}`);
          if (texts.some((t) => /(^|[^\d])-\d/.test(t))) problems.push(`${where} — negative option ${texts.join(" | ")}`);
          if (!q.questionText.trim() || !q.hint.trim() || !q.explanation.trim()) problems.push(`${where} — empty text`);
        }
      }
    }
    expect(problems.slice(0, 20)).toEqual([]);
  });

  it("rebuild the exact same question, answer key included, from its id", () => {
    for (const [family, paramsList] of familyParams()) {
      for (const params of paramsList) {
        for (const seed of seeds(5, params.length + 7)) {
          const q = writeQuestion(FAMILIES, family, params, seed)!;
          expect(decodeQuestionId(q.id)).toEqual({ family, params: params.length > 0 ? params : [0], seed });
          expect(generatedQuestion(q.id)).toEqual(writeQuestion(FAMILIES, family, params.length > 0 ? params : [0], seed));
        }
      }
    }
  });

  it("reject ids that are not theirs", () => {
    expect(decodeQuestionId("dq_g1_001")).toBeNull();
    expect(decodeQuestionId("lt.counting.100.zzzzzzzz")).toBeNull();
    expect(decodeQuestionId("lt.counting.100.1234567")).toBeNull();
    expect(generatedQuestion("lt.not-a-family.100.0000abcd")).toBeNull();
  });
});

/** "Which is 47 + 28?" → checks the marked answer against real arithmetic. */
describe("answer keys", () => {
  const answerOf = (q: NonNullable<ReturnType<typeof writeQuestion>>) =>
    q.options.find((o) => o.isCorrect)!.text.replace(/,/g, "");
  const num = (s: string) => Number(s.replace(/[,°]/g, ""));

  function sample(family: string, params: number[], count = 300) {
    return seeds(count, 99).map((s) => writeQuestion(FAMILIES, family, params, s)!);
  }

  it("addition and subtraction", () => {
    for (const q of sample("addition", [1000, 0])) {
      const m = /^([\d,]+) \+ ([\d,]+) = \?$/.exec(q.questionText);
      if (m) expect(num(answerOf(q))).toBe(num(m[1]) + num(m[2]));
    }
    for (const q of sample("subtraction", [10000, 3])) {
      const m = /^([\d,]+) − ([\d,]+) = \?$/.exec(q.questionText);
      if (m) expect(num(answerOf(q))).toBe(num(m[1]) - num(m[2]));
    }
  });

  it("regrouping lessons always need a carry or a borrow", () => {
    for (const q of sample("addition", [100, 2])) {
      const m = /([\d,]+) \+ (?:___ = )?([\d,]+)/.exec(q.questionText) ?? /sum of ([\d,]+) and ([\d,]+)/.exec(q.questionText);
      if (!m || q.questionText.includes("___")) continue;
      const [a, b] = [num(m[1]), num(m[2])];
      expect((a % 10) + (b % 10) >= 10 || (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) >= 10).toBe(true);
    }
  });

  it("times tables and division", () => {
    for (const q of sample("times-tables", [6, 7, 8, 9])) {
      const m = /^(\d+) × (\d+) = \?$/.exec(q.questionText);
      if (m) {
        expect(num(answerOf(q))).toBe(num(m[1]) * num(m[2]));
        // One of the two factors is the lesson's table.
        expect([6, 7, 8, 9].includes(num(m[1])) || [6, 7, 8, 9].includes(num(m[2]))).toBe(true);
      }
    }
    for (const q of sample("division-remainder", [9, 100])) {
      const m = /^(\d+) ÷ (\d+) = \?$/.exec(q.questionText);
      if (!m) continue;
      const [n, d] = [num(m[1]), num(m[2])];
      expect(answerOf(q)).toBe(`${Math.floor(n / d)} R ${n % d}`);
    }
  });

  it("place value, rounding and number names", () => {
    for (const q of sample("place-value", [10000])) {
      const m = /value of the digit (\d) in ([\d,]+)/.exec(q.questionText);
      if (!m) continue;
      const digits = m[2].replace(/,/g, "");
      const power = digits.length - 1 - digits.indexOf(m[1]);
      expect(num(answerOf(q))).toBe(Number(m[1]) * 10 ** power);
    }
    for (const q of sample("rounding", [10000])) {
      const m = /Round ([\d,]+) to the nearest (\w+)/.exec(q.questionText)!;
      const place = { ten: 10, hundred: 100, thousand: 1000 }[m[2]]!;
      expect(num(answerOf(q))).toBe(Math.round(num(m[1]) / place) * place);
    }
    expect(numberWords(4305)).toBe("four thousand three hundred and five");
    expect(numberWords(4005)).toBe("four thousand and five");
    expect(numberWords(1_230_047)).toBe("one million two hundred and thirty thousand and forty-seven");
  });

  it("fractions are simplified when the question asks", () => {
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    for (const q of sample("simplify-fractions", [])) {
      const [n, d] = answerOf(q).split("/").map(Number);
      const [N, D] = /Write (\d+)\/(\d+)/.exec(q.questionText)!.slice(1).map(Number);
      expect(gcd(n, d)).toBe(1);
      expect(n * D).toBe(N * d);
    }
  });

  it("angles on a line, at a point and in a triangle", () => {
    for (const q of sample("angles-line", [])) {
      const shown = [...q.questionText.matchAll(/(\d+)°/g)].map((m) => Number(m[1]));
      expect(shown.reduce((s, v) => s + v, 0) + num(answerOf(q))).toBe(180);
    }
    for (const q of sample("angles-point", [])) {
      const shown = [...q.questionText.matchAll(/(\d+)°/g)].map((m) => Number(m[1]));
      expect(shown.reduce((s, v) => s + v, 0) + num(answerOf(q))).toBe(360);
    }
  });

  it("money and elapsed time", () => {
    for (const q of sample("money-add-sub", [])) {
      const m = /^\$([\d.]+) ([+−]) \$([\d.]+) = \?$/.exec(q.questionText);
      if (!m) continue;
      const cents = (s: string) => Math.round(Number(s) * 100);
      const expected = m[2] === "+" ? cents(m[1]) + cents(m[3]) : cents(m[1]) - cents(m[3]);
      expect(cents(answerOf(q).replace("$", ""))).toBe(expected);
    }
  });
});

describe("planning a lesson's test", () => {
  const plan = (title: string, chapterTitle: string, grade = "grade1") =>
    planLessonTest({ grade, title, chapterTitle }).picks.map((p: TopicPick) => `${p.family}(${p.params.join(",")})`);

  it("reads the lesson title the way a teacher would", () => {
    expect(plan("Counting numbers up to 100", "Numbers and Counting")).toEqual(["counting(100)"]);
    expect(plan("Ordinal numbers (first, second, third)", "Numbers and Counting")).toEqual(["ordinal()"]);
    expect(plan("Addition with regrouping", "Chapter 2 : Addition within 100", "grade2")).toEqual(["addition(100,2)"]);
    expect(plan("Subtraction without regrouping", "Chapter 3 : Subtraction within 100", "grade2")).toEqual(["subtraction(100,1)"]);
    expect(plan("Multiplication tables: 6, 7, 8, 9", "Chapter 3 : Multiplication", "grade3")).toEqual(["times-tables(6,7,8,9)"]);
    expect(plan("Improper fractions → Mixed numbers", "Chapter 6 : Fractions", "grade4")).toEqual(["mixed-improper(1)"]);
    expect(plan("Place value up to three decimal places", "Chapter 3 : Decimals", "grade5")).toEqual(["decimal-place-value(3)"]);
  });

  it("does not trip over words inside words", () => {
    // "rectangle" contains "angle"; "regrouping" contains "grouping"; "parallelogram" contains "parallel".
    expect(plan("Rectangle", "Geometry (Shapes)")).toEqual(["shapes-2d(0,3)"]);
    expect(plan("Regrouping with hundreds", "Chapter 5 : Addition and Subtraction within 1,000", "grade2")).toEqual([
      "addition(1000,2)",
      "subtraction(1000,2)",
    ]);
    expect(plan("Parallelogram", "Chapter 11 : Geometry", "grade5")).toEqual(["quadrilaterals(1)"]);
    expect(plan("Counting money", "Chapter 10 : Money", "grade2")).toEqual(["money-count(1)"]);
  });

  it("takes the operation and range of a vague title from its chapter", () => {
    expect(plan("Word problems", "Chapter 4 : Division", "grade3")).toEqual(["word-division(9,30)"]);
    expect(plan("Word problems", "Chapter 7 : Volume", "grade5")).toEqual(["volume(4)"]);
    expect(plan("Mental math strategies", "Chapter 2 : Addition and Subtraction", "grade3")).toEqual([
      "mental-math(10000)",
      "mental-math-sub(10000)",
    ]);
    expect(plan("Reading and writing numbers", "Chapter 1 : Numbers to 200", "grade2")).toEqual(["number-names(200)"]);
  });

  it("builds a chapter test from the chapter's other lessons", () => {
    const series = planLessonTest({
      grade: "grade1",
      title: "Measurement Test Series",
      chapterTitle: "Measurement",
      siblingTitles: ["Measuring using non-standard units", "Length (longer/shorter)", "Time (hour and half-hour)"],
    });
    expect(series.testSeries).toBe(true);
    expect(series.picks.map((p) => p.family)).toEqual(["non-standard-units", "compare-length", "clock-hour-half"]);
    expect(series.covers).toEqual(["Measuring using non-standard units", "Length (longer/shorter)", "Time (hour and half-hour)"]);
  });

  it("gives no test rather than an off-topic one", () => {
    expect(planLessonTest({ grade: "grade1", title: "Class photo day", chapterTitle: "" }).picks).toEqual([]);
    expect(summarizeLessonTest("x", { grade: "grade1", title: "Class photo day" })).toBeNull();
  });
});

describe("every lesson in the curriculum", () => {
  it("has a full test of distinct questions on its own topic", () => {
    const short: string[] = [];
    let n = 7;
    for (const lesson of LESSONS) {
      const plan = planLessonTest(lesson);
      const built = buildLessonTest(lesson.id, lesson, () => (n = (Math.imul(n, 1103515245) + 12345) >>> 0));
      const want = plan.testSeries ? TEST_SERIES_SIZE : LESSON_TEST_SIZE;
      if (!built || built.questionIds.length !== want) {
        short.push(`${lesson.grade} ${lesson.title}: ${built?.questionIds.length ?? 0}/${want}`);
        continue;
      }
      // Only families the plan chose.
      const families = new Set(plan.picks.map((p) => p.family));
      for (const id of built.questionIds) expect(families).toContain(decodeQuestionId(id)!.family);
      expect(new Set(built.questionIds).size).toBe(built.questionIds.length);
    }
    expect(short).toEqual([]);
    expect(LESSONS.length).toBeGreaterThan(200);
  });
});

describe("building a test", () => {
  const topic: LessonTopic = { grade: "grade2", title: "Column addition", chapterTitle: "Chapter 5 : Addition and Subtraction within 1,000" };

  it("serves options without the answer key, easiest first", () => {
    const built = buildLessonTest("column-addition", topic)!;
    expect(built.quiz.id).toBe("test-column-addition");
    expect(built.quiz.lessonId).toBe("column-addition");
    expect(built.quiz.questions).toHaveLength(LESSON_TEST_SIZE);
    for (const q of built.quiz.questions) {
      for (const o of q.options) expect(Object.keys(o).sort()).toEqual(["id", "text"]);
    }
    const order = { easy: 0, medium: 1, hard: 2 };
    const ranks = built.quiz.questions.map((q) => order[q.difficulty!]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("writes new questions each time", () => {
    const a = buildLessonTest("column-addition", topic)!.questionIds;
    const b = buildLessonTest("column-addition", topic)!.questionIds;
    expect(a).not.toEqual(b);
  });

  it("is reproducible from its seeds", () => {
    const seq = () => {
      let s = 42;
      return () => (s = (Math.imul(s, 48271) + 1) >>> 0);
    };
    expect(buildLessonTest("column-addition", topic, seq())).toEqual(buildLessonTest("column-addition", topic, seq()));
  });

  it("round-trips its quiz id", () => {
    expect(lessonIdFromTestQuizId(lessonTestQuizId("place-value-tens-and-ones"))).toBe("place-value-tens-and-ones");
    expect(lessonIdFromTestQuizId("practice-1")).toBeNull();
    expect(lessonIdFromTestQuizId("test-")).toBeNull();
  });
});

describe("the question bank lookup", () => {
  it("answers for generated questions as if they were bank questions", () => {
    const id = encodeQuestionId("times-tables", [7], 12345);
    const banked = getQuestion(id)!;
    const written = generatedQuestion(id)!;
    expect(banked.skill).toBe("multiplication");
    expect(banked.questionText).toBe(written.questionText);
    expect(correctOptionId(banked)).toBe(written.options.find((o) => o.isCorrect)!.id);
  });

  it("still returns bank questions and nothing for unknown ids", () => {
    expect(getQuestion("dq_g1_001")?.id).toBe("dq_g1_001");
    expect(getQuestion("lt.nope.1.00000000")).toBeNull();
    expect(getQuestion("nope")).toBeNull();
  });
});
