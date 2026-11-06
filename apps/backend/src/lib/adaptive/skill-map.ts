/**
 * How question-bank skills relate to curriculum lessons.
 *
 * The bank tags questions with a skill ("fractions"); the curriculum lists
 * lessons ("Meaning of fractions"). Nothing in the data links the two, so a
 * recommendation like "review the fractions lesson" needs a bridge:
 *
 *  1. Explicit — a curriculum topic may declare `"skills": ["fractions"]`.
 *     When it does, only that declaration is used for the topic.
 *  2. Derived — otherwise the topic's title and id are matched against the
 *     keywords below. This is a heuristic, reviewable in one place, and every
 *     derived link is reported with `skillSource: "derived"`.
 *
 * Keyword rules: a plain word matches a whole token or its plural ("fraction"
 * matches "fractions"); a trailing `*` matches any token starting with it
 * ("percent*" matches "percentage"); a phrase with spaces must appear as
 * consecutive words. Skills with no keywords ("logic" — mixed word problems)
 * are practised but never linked to a lesson.
 */

export const SKILL_KEYWORDS: Record<string, string[]> = {
  counting: ["counting", "count", "skip counting"],
  "place-value": ["place value", "tens and ones", "hundreds", "expanded form", "expanded and standard"],
  addition: ["addition", "adding", "add"],
  subtraction: ["subtraction", "subtract", "borrowing"],
  shapes: ["shape", "circle", "square", "rectangle", "triangle", "2d", "3d", "cube", "cuboid", "cone", "sphere"],
  comparison: ["comparing", "compare", "ordering", "greater", "less than"],
  patterns: ["pattern", "sequence"],
  multiplication: ["multiplication", "multiply", "multiplying", "times tables", "repeated addition", "equal groups", "array"],
  measurement: ["measurement", "measuring", "length", "mass", "capacity", "litre", "metric", "weight"],
  fractions: ["fraction"],
  division: ["division", "divide", "dividing", "sharing", "remainder"],
  geometry: ["geometry", "angle", "triangle", "symmetry", "parallelogram", "trapezium", "rhombus", "polygon"],
  time: ["time", "clock", "hour", "elapsed", "timetable"],
  area: ["area"],
  decimals: ["decimal"],
  factors: ["factor", "multiples"],
  "area-perimeter": ["perimeter", "area"],
  "percentages": ["percent*"],
  algebra: ["algebra", "equation", "expression", "variable"],
  "prime-numbers": ["prime"],
  volume: ["volume", "cubic", "capacity"],
  ratio: ["ratio", "proportion"],
  "number-sense": ["rounding", "round", "estimation", "estimate"],
  probability: ["probability", "chance", "likely"],
  speed: ["speed", "rate", "distance"],
  logic: [],
};

const LABEL_OVERRIDES: Record<string, string> = {
  "area-perimeter": "Area & perimeter",
  "number-sense": "Number sense",
  "prime-numbers": "Prime numbers",
  "place-value": "Place value",
  logic: "Reasoning & word problems",
};

/** Student-facing name for a skill id. */
export function skillLabel(skill: string): string {
  if (LABEL_OVERRIDES[skill]) return LABEL_OVERRIDES[skill];
  const words = skill.split("-").filter(Boolean).join(" ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : skill;
}

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

function keywordMatches(keyword: string, words: string[]): boolean {
  const kw = keyword.toLowerCase();
  if (kw.includes(" ")) {
    const phrase = tokens(kw);
    for (let i = 0; i + phrase.length <= words.length; i++) {
      if (phrase.every((p, j) => words[i + j] === p || words[i + j] === `${p}s`)) return true;
    }
    return false;
  }
  if (kw.endsWith("*")) {
    const stem = kw.slice(0, -1);
    return words.some((w) => w.startsWith(stem));
  }
  return words.some((w) => w === kw || w === `${kw}s` || w === `${kw}es`);
}

/** Skills whose keywords match a lesson's title or id. Only `candidates` are considered. */
export function deriveSkills(
  text: string,
  candidates: Iterable<string>,
  keywords: Record<string, string[]> = SKILL_KEYWORDS
): string[] {
  const words = tokens(text);
  const out: string[] = [];
  for (const skill of candidates) {
    const list = keywords[skill] ?? [];
    if (list.some((kw) => keywordMatches(kw, words))) out.push(skill);
  }
  return out;
}
