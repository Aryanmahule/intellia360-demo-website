/**
 * Which question families test which lesson.
 *
 * A lesson is matched on its title, read the way a teacher would: "Addition
 * with regrouping" → addition questions that need a carry; "Counting up to
 * 10,000" → counting with numbers to 10,000. Titles that say little on their
 * own ("Word problems", "Mental math strategies") take their operation and
 * number range from the chapter title. A "… Test Series" lesson is the chapter
 * test: it draws on every other lesson in its chapter.
 *
 * Rules are tried top to bottom and the first match wins, so specific rules
 * come before general ones ("Counting money" is money, not counting). A lesson
 * nothing matches gets no test rather than questions about something else.
 *
 * The number ranges are the curriculum's own: Grade 1 counts to 100, Grade 2
 * to 1,000 and so on, unless the lesson or chapter title names a range.
 */
import { FAMILIES } from "@/lib/lesson-test/families";
import { SHAPES_2D, SOLIDS } from "@/lib/lesson-test/families/geometry";

export interface TopicPick {
  family: string;
  params: number[];
}

export interface LessonTopic {
  /** "grade3" */
  grade: string;
  title: string;
  chapterTitle?: string | null;
  /** Other lesson titles in the same chapter — a chapter test series draws on them. */
  siblingTitles?: string[];
}

export interface LessonPlan {
  picks: TopicPick[];
  /** A chapter test: more questions, drawn from the chapter's lessons. */
  testSeries: boolean;
  /** What the test covers, as the student reads it. */
  covers: string[];
}

const DEFAULT_RANGE: Record<number, number> = { 1: 100, 2: 1000, 3: 10000, 4: 100000 };

type Op = "add" | "sub" | "mul" | "div";

interface Context {
  grade: number;
  max: number;
  ranges: number[];
  chapter: string;
}

const P = (family: string, ...params: number[]): TopicPick => ({ family, params });

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/chapter\s*\d+\s*:?/g, " ")
    .replace(/(\d),(?=\d{3})/g, "$1")
    .replace(/↔|<->|→|->/g, " to ")
    .replace(/×/g, " x ")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

/** Number ranges a title names: "up to 1,000" → 1000, "4-digit" → 10000. */
function rangesIn(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/(\d+)\s*-?\s*digits?/g)) out.add(10 ** Number(m[1]));
  for (const m of text.matchAll(/(\d+)(?!\s*-?\s*digit)/g)) {
    const n = Number(m[1]);
    if (n >= 10) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

function opsIn(text: string): Op[] {
  const ops: Op[] = [];
  if (/\b(addition|adding|add)\b/.test(text)) ops.push("add");
  if (/\b(subtraction|subtract|subtracting)\b/.test(text)) ops.push("sub");
  if (/multipl/.test(text)) ops.push("mul");
  if (/\b(division|divide|dividing)\b/.test(text)) ops.push("div");
  return ops;
}

function gradeNumber(grade: string): number {
  const n = Number(/\d+/.exec(grade)?.[0]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function addSubPicks(ops: Op[], maxes: number[], regroup: number): TopicPick[] {
  const which = ops.filter((o) => o === "add" || o === "sub");
  const list = which.length > 0 ? which : (["add", "sub"] as Op[]);
  return list.flatMap((op) => maxes.map((m) => P(op === "add" ? "addition" : "subtraction", m, regroup)));
}

function wordProblemPicks(ops: Op[], ctx: Context): TopicPick[] {
  if (/volume/.test(ctx.chapter)) return [P("volume", 4)];
  const g = ctx.grade;
  const list = ops.length > 0 ? ops : (["add", "sub"] as Op[]);
  return list.map((op) => {
    if (op === "add") return P("word-addition", ctx.max);
    if (op === "sub") return P("word-subtraction", ctx.max);
    if (op === "mul") return P("word-multiplication", g <= 2 ? 5 : 9, g <= 2 ? 10 : g === 3 ? 50 : 500);
    return P("word-division", 9, g <= 2 ? 10 : g === 3 ? 30 : 200);
  });
}

function indexesNamed(text: string, names: string[]): number[] {
  return names.map((n, i) => (new RegExp(`\\b${n}s?\\b`).test(text) ? i : -1)).filter((i) => i >= 0);
}

const DP_WORDS: Record<string, number> = { one: 1, two: 2, three: 3 };

/** The families for one lesson title. `t` is normalised; empty when nothing matches. */
function picksFor(t: string, ctx: Context): TopicPick[] {
  const has = (re: RegExp) => re.test(t);
  const { grade: g, max, ranges, chapter } = ctx;
  const titleOps = opsIn(t);
  const ops = titleOps.length > 0 ? titleOps : opsIn(chapter);
  const level = g <= 2 ? 1 : g <= 4 ? 2 : 3;

  /* Money and time first: their titles also say "counting", "addition"… */
  if (has(/money|\bcoins?\b|\bnotes\b|purchases|dollars|\bcents\b/)) {
    if (has(/coins and notes|recogni[sz]ing coins|counting money/)) return [P("money-count", 1)];
    if (has(/purchases/)) return [P("money-change", 1), P("money-count", 1)];
    if (has(/decimal notation/)) return [P("money-notation")];
    if (has(/dollars and cents/)) return [P("money-notation"), P("money-count", 2)];
    if (has(/\b(addition|subtraction|add|subtract)\b/)) return [P("money-add-sub")];
    return g <= 2
      ? [P("money-count", 1), P("money-change", 1)]
      : [P("money-add-sub"), P("money-change", 2), P("money-notation")];
  }
  if (has(/hour and half.hour/)) return [P("clock-hour-half")];
  if (has(/elapsed|time intervals?/)) return [P("elapsed-time")];
  if (has(/timetable/)) return [P("timetable"), P("elapsed-time")];
  if (has(/hours and minutes/)) return [P("clock-minutes")];
  if (has(/\btime\b/)) return g <= 2 ? [P("clock-minutes")] : [P("clock-minutes"), P("elapsed-time")];
  if (has(/\bspeed\b|\brate\b/)) return [P("speed")];

  /* Number facts with a name of their own. */
  if (has(/ordinal/)) return [P("ordinal")];
  if (has(/odd and even/)) return [P("odd-even", max)];
  if (has(/skip count/)) {
    const steps = numbersIn(t).filter((n) => n >= 2 && n <= 100);
    return [P("skip-counting", ...(steps.length > 0 ? steps : [2, 5, 10]))];
  }
  if (has(/number bonds?/)) return [P(ops.includes("sub") ? "number-bonds-sub" : "number-bonds", 20)];
  if (has(/fact famil|relationship between addition and subtraction/)) return [P("fact-families", g <= 1 ? 20 : Math.min(max, 100))];

  /* Multiplication and division. */
  if (has(/relationship with multiplication|division using multiplication/)) return [P("division-facts"), P("fact-families-times")];
  if (has(/repeated addition/)) return [P("repeated-addition", g <= 1 ? 5 : 10, g <= 1 ? 0 : 1)];
  if (has(/equal groups/)) return [P("equal-groups", g <= 1 ? 5 : 10, g <= 1 ? 0 : 1)];
  // Whole words only: "regrouping" is an addition idea, not grouping.
  if (has(/\barrays?\b/)) return has(/\bgrouping\b/) ? [P("arrays", 10), P("grouping", 8)] : [P("arrays", 10)];
  if (has(/\bsharing\b|\bgrouping\b/)) {
    const size = g <= 1 ? 5 : 10;
    return [...(has(/\bsharing\b/) ? [P("sharing", size)] : []), ...(has(/\bgrouping\b/) ? [P("grouping", size)] : [])];
  }
  if (has(/remainder/)) return [P("division-remainder", 9, g <= 3 ? 100 : 1000)];
  if (has(/multiplication (tables|facts)|times tables/)) {
    const listed = numbersIn(t).filter((n) => n >= 2 && n <= 12);
    const tables = has(/up to/)
      ? Array.from({ length: Math.max(9, ...listed) - 1 }, (_, i) => i + 2)
      : listed;
    return [P("times-tables", ...(tables.length > 0 ? tables : [2, 3, 4, 5, 10]))];
  }
  const digitPairs = [...t.matchAll(/(\d)-digit(?: numbers?)?\s*(?:by|x)\s*(\d)-digit/g)];
  if (has(/multiply/) && digitPairs.length > 0) return digitPairs.map((m) => P("multiply-multi", Number(m[1]), Number(m[2])));
  if (has(/divide|dividing/)) {
    const m = /(\d)-digit/.exec(t);
    if (m) return [P("long-division", Number(m[1]))];
  }

  /* Fractions, decimals and percentages. Conversions first: they name two topics. */
  if (has(/fraction.* to percent|percent\w* to fraction/)) return [P("fraction-percent")];
  if (has(/decimal.* to percent|percent\w* to decimal/)) return [P("decimal-percent")];
  if (has(/fraction.* to decimal|decimal.* to fraction/)) return [P("fraction-decimal")];
  if (has(/improper.* to mixed/)) return [P("mixed-improper", 1)];
  if (has(/mixed.* to improper/)) return [P("mixed-improper", 2)];
  if (has(/mixed|improper/)) return [P("mixed-improper", 0)];
  if (has(/fraction as division/)) return [P("fraction-division")];
  if (has(/equivalent fraction/)) return [P("equivalent-fractions")];
  if (has(/simplif\w* fraction/)) return [P("simplify-fractions")];
  if (has(/compar\w* fraction/)) return [P("compare-fractions")];
  if (has(/order\w* fraction/)) return [P("order-fractions"), P("compare-fractions")];
  if (has(/(addition|subtraction).* fraction/)) return [P("add-sub-fractions")];
  if (has(/fraction/)) return [P("fraction-meaning")];
  if (has(/tenths and hundredths/)) return [P("tenths-hundredths")];
  if (has(/compar\w* decimal/)) return [P("compare-decimals", g >= 5 ? 3 : 2)];
  if (has(/order\w* decimal/)) return [P("order-decimals", g >= 5 ? 3 : 2)];
  if (has(/round\w* decimal/)) return [P("round-decimals", g >= 5 ? 3 : 2)];
  const places = /\b(one|two|three|\d) decimal places?/.exec(t);
  if (places) return [P("decimal-place-value", DP_WORDS[places[1]] ?? Number(places[1]))];
  if (has(/decimal/)) return [P("decimal-place-value", 2)];
  if (has(/percent/)) return [P("percent-meaning")];

  /* Ratio, factors and multiples. */
  if (has(/simplif\w* ratio/)) return [P("simplify-ratio")];
  if (has(/equivalent ratio/)) return [P("equivalent-ratio")];
  if (has(/\bratios?\b/)) return [P("ratio-basics")];
  if (has(/common factors? and common multiples?/)) return [P("common-factor-multiple")];
  if (has(/factor/)) return [P("factors")];
  if (has(/multiples/)) return [P("multiples")];

  /* Measurement. */
  if (has(/non.standard/)) return [P("non-standard-units")];
  if (has(/longer|shorter/)) return [P("compare-length")];
  if (has(/length,? mass/)) return [P("length-units", level), P("mass-units", level), P("capacity-units", level)];
  if (has(/metric conversion/)) return [P(has(/mass/) ? "mass-units" : "length-units", 3)];
  if (has(/cubic units/)) return [P("volume", 1)];
  if (has(/^cubes?$/)) return [P("volume", 2), P("shapes-3d", 0, 0)];
  if (has(/^cuboids?$|volume formula/)) return [P("volume", 3), P("volume", 2)];
  if (has(/capacity|litre/)) return [P("capacity-units", level)];
  if (has(/\blength\b|cm and m\b/)) return [P("length-units", level)];
  if (has(/\bmass\b|g and kg/)) return [P("mass-units", level)];
  if (has(/\bvolume\b/)) return [P("volume", 0)];
  if (has(/area and perimeter|perimeter and area/)) return [P("area-rect", 0), P("perimeter", 15)];
  if (has(/perimeter/)) return [P("perimeter", g <= 3 ? 12 : 20)];
  if (has(/square units/)) return [P("area-units")];
  if (has(/area of triangles?/)) return [P("area-triangle")];
  if (has(/area of squares?/)) return [P("area-rect", 2)];
  if (has(/area of rectangles?/)) return [P("area-rect", 1)];
  if (has(/composite/)) return [P("composite-area")];
  if (has(/\barea\b/)) return [P("area-rect", 0)];

  /* Geometry. */
  if (has(/similar|congruen/)) return [P("similarity")];
  if (has(/\bparallel\b|perpendicular|^lines$/)) return [P("lines")];
  if (has(/straight line/)) return [P("angles-line")];
  if (has(/around a point/)) return [P("angles-point")];
  if (has(/interior angles/)) return [P("triangle-angles", 1)];
  if (has(/triangle properties/)) return [P("triangle-angles", 0), P("triangle-types")];
  if (has(/types of triangles/)) return [P("triangle-types")];
  if (has(/angles in shapes/)) return [P("angles-in-shapes")];
  // Whole word: "rectangle" and "triangle" contain "angle".
  if (has(/\bangles?\b/)) return [P("angle-types", g <= 3 ? 1 : 2)];
  if (has(/symmetry/)) return [P("symmetry", g <= 2 ? 1 : 2)];
  if (has(/trapezium/)) return [P("quadrilaterals", 0)];
  if (has(/parallelogram/)) return [P("quadrilaterals", 1)];
  if (has(/rhombus/)) return [P("quadrilaterals", 2)];
  if (has(/^squares?$/)) return g >= 3 ? [P("quadrilaterals", 3)] : [P("shapes-2d", 0, 2)];
  if (has(/^rectangles?$/)) return g >= 3 ? [P("quadrilaterals", 4)] : [P("shapes-2d", 0, 3)];
  if (has(/^circles?$/)) return [P("shapes-2d", 0, 0)];
  if (has(/daily life/)) return [P("shapes-2d", 1), P("shapes-3d", 1)];
  if (has(/\b3d\b/)) return [P("shapes-3d", 0, ...indexesNamed(t, SOLIDS.map((s) => s.name)))];
  if (has(/\b2d\b/)) return [P("shapes-2d", 0, ...indexesNamed(t, SHAPES_2D.map((s) => s.name)))];
  if (has(/shape/)) return g >= 3 ? [P("shapes-2d", 2), P("quadrilaterals")] : [P("shapes-2d", 0)];
  if (has(/geometry/)) return g >= 6 ? [P("angles-line"), P("angles-point"), P("triangle-angles", 1)] : [P("shapes-2d", 0)];

  /* Data handling. */
  if (has(/probabilit/)) return [P("probability"), P("statistics")];
  if (has(/pictograph/)) return [P("data", 1)];
  if (has(/pie chart/)) return [P("data", 4)];
  if (has(/line graph/)) return [P("data", 5)];
  if (has(/\bscales?\b/)) return [P("data", 3)];
  if (has(/bar (graph|chart)/)) return [P("data", 2), P("data", 3)];
  if (has(/collect|organi[sz]/)) return [P("data", 6)];
  if (has(/statistic|average|\bmean\b|median/)) return [P("statistics")];
  if (has(/table|chart|interpret|\bdata\b/)) return [P("data", 2)];

  /* Addition and subtraction strategies — before place value, which "hundreds" also names. */
  if (has(/word problems?/)) return wordProblemPicks(ops, ctx);
  if (has(/mental math/)) {
    const which = ops.filter((o) => o === "add" || o === "sub");
    const list = which.length > 0 ? which : (["add", "sub"] as Op[]);
    return list.map((op) => P(op === "add" ? "mental-math" : "mental-math-sub", max));
  }
  if (has(/without regroup/)) return addSubPicks(ops, [max], 1);
  if (has(/across zeros/)) return [P("subtraction", max, 3), P("addition", max, 0)];
  if (has(/regroup|borrow|carry/)) return addSubPicks(ops, [max], 2);
  if (has(/three numbers/)) return [P("add-three", max)];
  if (has(/1-digit and 2-digit/)) return [P("addition", 100, 0, 1)];

  /* Whole numbers. */
  if (has(/expanded/)) return [P("expanded-form", max)];
  if (has(/place value|hundreds|tens and ones/)) return [P("place-value", max)];
  if (has(/read\w* and writ|writing numbers|numerals and words/)) return [P("number-names", max)];
  if (has(/compar/) && has(/\border/)) return [P("comparing", max), P("ordering", max)];
  if (has(/compar/)) return [P("comparing", max)];
  if (has(/\border/)) return [P("ordering", max)];
  if (has(/\bround/)) return [P("rounding", max)];
  if (has(/estimat/)) {
    const which = ops.filter((o) => o === "add" || o === "sub");
    return [P("estimation", max, which.length === 1 ? (which[0] === "add" ? 0 : 1) : 2)];
  }
  if (has(/^patterns?$/)) return [P("repeating-patterns"), P("number-patterns", max)];
  if (has(/pattern|sequence/)) return [P("number-patterns", max)];
  if (has(/count/)) return [P("counting", max)];
  if (titleOps.length === 0 && has(/numbers up to|large numbers|whole numbers/)) {
    return [P("place-value", max), P("number-names", max), P("comparing", max)];
  }

  /* Plain operations last. */
  if (titleOps.includes("add") || titleOps.includes("sub")) {
    return addSubPicks(titleOps, ranges.length > 0 ? ranges.slice(-2) : [max], 0);
  }
  if (titleOps.includes("mul")) return [P("times-tables", 2, 3, 4, 5, 10)];
  if (titleOps.includes("div")) return [P("division-facts")];
  return [];
}

function dedupe(picks: TopicPick[]): TopicPick[] {
  const seen = new Set<string>();
  return picks.filter((p) => {
    const key = `${p.family}:${p.params.join("-")}`;
    if (seen.has(key) || !FAMILIES[p.family]) return false;
    seen.add(key);
    return true;
  });
}

function planTitle(title: string, chapterTitle: string, grade: number): TopicPick[] {
  const t = normalize(title);
  const chapter = normalize(chapterTitle);
  const titleRanges = rangesIn(t);
  const chapterRanges = rangesIn(chapter);
  const ctx: Context = {
    grade,
    max: titleRanges.at(-1) ?? chapterRanges.at(-1) ?? DEFAULT_RANGE[grade] ?? 10_000_000,
    ranges: titleRanges,
    chapter,
  };
  const own = picksFor(t, ctx);
  // A title that names nothing testable ("Geometry") falls back to its chapter's topic.
  return own.length > 0 || !chapter ? own : picksFor(chapter, { ...ctx, ranges: chapterRanges });
}

function labelsOf(picks: TopicPick[]): string[] {
  return [...new Set(picks.map((p) => FAMILIES[p.family]?.label).filter((l): l is string => Boolean(l)))];
}

/** Picks the question families for a lesson. An empty `picks` means no test fits this lesson. */
export function planLessonTest(topic: LessonTopic): LessonPlan {
  const grade = gradeNumber(topic.grade);
  const chapterTitle = topic.chapterTitle ?? "";

  if (/test series/i.test(topic.title)) {
    const lessons = (topic.siblingTitles ?? []).filter((s) => s.trim() && !/test series/i.test(s));
    let picks = dedupe(lessons.flatMap((s) => planTitle(s, chapterTitle, grade)));
    if (picks.length === 0) picks = dedupe(planTitle(chapterTitle, "", grade));
    return {
      picks,
      testSeries: true,
      covers: lessons.length > 0 ? lessons.slice(0, 8) : labelsOf(picks),
    };
  }

  const picks = dedupe(planTitle(topic.title, chapterTitle, grade));
  return { picks, testSeries: false, covers: labelsOf(picks) };
}
