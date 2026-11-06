/**
 * Lesson test questions — the shared machinery.
 *
 * A lesson test is built from question *families*: small generators that write
 * one multiple-choice question about one idea ("which digit is in the tens
 * place?"), with its answer worked out in code, so every answer key is right by
 * construction.
 *
 * A generated question's id carries everything needed to write it again:
 *
 *     lt.<family>.<params>.<seed>      e.g. lt.place-value.100.9f3a1c2b
 *
 * so grading never stores or trusts question content. The quiz session pins
 * the ids it served; at submit time `generatedQuestion(id)` rebuilds the very
 * same question and its answer key from the id alone. Changing what a family
 * writes therefore changes the questions behind sessions still open at deploy
 * time (they expire within the session TTL) — keep such changes rare.
 *
 * Nothing here does IO.
 */
import type { Difficulty } from "@/lib/adaptive/config";

/* ── Seeded randomness ────────────────────────────────────────────────────── */

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  /** `count` distinct items, in random order. */
  sample<T>(items: readonly T[], count: number): T[];
  chance(probability: number): boolean;
}

/** mulberry32 — tiny, fast and identical on every platform. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return {
    next,
    int,
    pick: (items) => items[int(0, items.length - 1)],
    shuffle,
    sample: (items, count) => shuffle(items).slice(0, count),
    chance: (p) => next() < p,
  };
}

/* ── Question drafts ──────────────────────────────────────────────────────── */

export type Value = string | number;

/** What a family writes. `toQuestion` turns it into a four-option question. */
export interface Draft {
  question: string;
  answer: Value;
  /**
   * Wrong options, most plausible first. Duplicates, the answer itself and
   * negative or fractional numbers are dropped, so a family may list more than
   * three and need not filter them.
   */
  wrong: Value[];
  hint: string;
  explanation: string;
  difficulty: Difficulty;
  /** How numeric options are shown, e.g. `cm` → "12 cm". Numbers only. */
  format?: (n: number) => string;
  /** Keep the options in the order given (answer first) instead of mixing them. */
  ordered?: boolean;
}

export interface Family {
  /** Mastery skill the answers count towards; matches the bank's tags where one fits. */
  skill: string;
  /** What the family tests, as a student reads it ("Place value"). */
  label: string;
  make(rng: Rng, params: number[]): Draft;
}

export interface GeneratedQuestion {
  id: string;
  family: string;
  skill: string;
  difficulty: Difficulty;
  questionText: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  hint: string;
  explanation: string;
}

const OPTION_IDS = ["a", "b", "c", "d"];

function isUsableNumber(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

/** Four options (fewer when a question only has two or three sensible ones). */
export function toOptions(rng: Rng, draft: Draft): GeneratedQuestion["options"] {
  const numeric = typeof draft.answer === "number";
  const show = (v: Value) =>
    typeof v === "number" ? (draft.format ? draft.format(v) : fmt(v)) : v;

  const answerText = show(draft.answer);
  const seen = new Set([answerText]);
  const wrongValues: Value[] = [];

  const offer = (v: Value) => {
    if (wrongValues.length >= 3) return;
    if (typeof v === "number" && !isUsableNumber(v)) return;
    if (typeof v === "string" && !v.trim()) return;
    const text = show(v);
    if (seen.has(text)) return;
    seen.add(text);
    wrongValues.push(v);
  };

  draft.wrong.forEach(offer);

  // A numeric answer always gets three neighbours, even when a family's own
  // distractors collapsed into duplicates.
  if (numeric) {
    const a = draft.answer as number;
    const step = a >= 1000 ? 100 : a >= 100 ? 10 : 1;
    for (const v of [a + step, a - step, a + 2 * step, a - 2 * step, a + 3 * step]) offer(v);
  }

  let values: Value[] = [draft.answer, ...wrongValues];
  if (numeric) {
    // Numbers read best smallest to largest, as on a printed test.
    values = (values as number[]).slice().sort((x, y) => x - y);
  } else if (!draft.ordered) {
    values = rng.shuffle(values);
  }

  return values.map((v, i) => ({
    id: OPTION_IDS[i],
    text: show(v),
    isCorrect: show(v) === answerText,
  }));
}

/* ── Question ids ─────────────────────────────────────────────────────────── */

const ID_PREFIX = "lt";
const ID_RE = /^lt\.([a-z0-9]+(?:-[a-z0-9]+)*)\.(\d{1,9}(?:-\d{1,9}){0,7})\.([0-9a-f]{8})$/;

export function encodeQuestionId(family: string, params: number[], seed: number): string {
  const p = params.length > 0 ? params.join("-") : "0";
  return `${ID_PREFIX}.${family}.${p}.${(seed >>> 0).toString(16).padStart(8, "0")}`;
}

export function decodeQuestionId(id: string): { family: string; params: number[]; seed: number } | null {
  const match = ID_RE.exec(id);
  if (!match) return null;
  return {
    family: match[1],
    params: match[2].split("-").map(Number),
    seed: parseInt(match[3], 16),
  };
}

export function isGeneratedQuestionId(id: string): boolean {
  return id.startsWith(`${ID_PREFIX}.`);
}

/** Writes the question for (family, params, seed). Pure: the same inputs give the same question. */
export function writeQuestion(
  families: Record<string, Family>,
  familyId: string,
  params: number[],
  seed: number
): GeneratedQuestion | null {
  const family = families[familyId];
  if (!family) return null;
  const rng = createRng(seed);
  const draft = family.make(rng, params);
  return {
    id: encodeQuestionId(familyId, params, seed),
    family: familyId,
    skill: family.skill,
    difficulty: draft.difficulty,
    questionText: tidy(draft.question),
    options: toOptions(rng, draft),
    hint: tidy(draft.hint),
    explanation: tidy(draft.explanation),
  };
}

/** "ends at 6:30 p.m.." → "ends at 6:30 p.m." */
function tidy(text: string): string {
  return text.replace(/([ap])\.m\.\./g, "$1.m.");
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

/** 1234 → "1,234". */
export function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export const unit = (suffix: string) => (n: number) => `${fmt(n)}${suffix}`;

/** "1 minute", "5 minutes". */
export const minutes = (n: number) => (n === 1 ? "1 minute" : `${fmt(n)} minutes`);

/** "an 8 cm…", "a 9 cm…": 8, 11, 18, 80–89, 800… are said with a vowel sound. */
export function aOrAn(n: number): "a" | "an" {
  const s = String(n);
  return s.startsWith("8") || s === "11" || s === "18" ? "an" : "a";
}

const SMALL = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** British number names, as Singapore textbooks write them: 4305 → "four thousand three hundred and five". */
export function numberWords(n: number): string {
  if (n < 20) return SMALL[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${SMALL[n % 10]}` : "");
  if (n < 1000) {
    const rest = n % 100;
    return `${SMALL[Math.floor(n / 100)]} hundred` + (rest ? ` and ${numberWords(rest)}` : "");
  }
  for (const [size, name] of [[1_000_000, "million"], [1000, "thousand"]] as const) {
    if (n >= size) {
      const rest = n % size;
      const join = rest > 0 && rest < 100 ? " and " : " ";
      return `${numberWords(Math.floor(n / size))} ${name}` + (rest ? join + numberWords(rest) : "");
    }
  }
  return String(n);
}

export const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** Cents as money: 45 → "45¢", 345 → "$3.45". */
export function money(cents: number): string {
  if (cents < 100) return `${cents}¢`;
  return dollars(cents);
}

/** Always in dollars: 45 → "$0.45". */
export function dollars(cents: number): string {
  return `$${fmt(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, "0")}`;
}

/** Minutes after midnight → "9:05 a.m." */
export function clockTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const h12 = h % 12 || 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
}

/** 95 → "1 h 35 min"; 40 → "40 min". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Fixed-point decimals without float error: (375, 2) → "3.75". */
export function decimal(scaled: number, places: number): string {
  if (places === 0) return fmt(scaled);
  const negative = scaled < 0;
  const abs = Math.abs(scaled);
  const factor = 10 ** places;
  const whole = Math.floor(abs / factor);
  const frac = String(abs % factor).padStart(places, "0");
  return `${negative ? "-" : ""}${fmt(whole)}.${frac}`;
}

/* ── Arithmetic helpers ───────────────────────────────────────────────────── */

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

export function fraction(n: number, d: number): string {
  return `${n}/${d}`;
}

/** n/d in lowest terms, as text ("1" for a whole). */
export function simplest(n: number, d: number): string {
  const g = gcd(n, d);
  return d / g === 1 ? String(n / g) : fraction(n / g, d / g);
}

/** Digits of a whole number, most significant first. */
export function digitsOf(n: number): number[] {
  return String(n).split("").map(Number);
}

export const PLACE_NAMES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"];

/** "1 ten", "4 tens", "1 hundred thousand". */
export function placeCount(count: number, place: string): string {
  return `${count} ${count === 1 ? place.replace(/s$/, "") : place}`;
}

/** A number with exactly `count` digits whose digits are all different (count ≤ 10). */
export function distinctDigitNumber(rng: Rng, count: number): number {
  const digits = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, count);
  if (digits[0] === 0) [digits[0], digits[count - 1]] = [digits[count - 1], digits[0]];
  if (digits[0] === 0) digits[0] = 1;
  return Number(digits.join(""));
}

/** Digit count of the largest number below `max` (100 → 2, 1000 → 3). */
export function digitCountBelow(max: number): number {
  return String(Math.max(10, max - 1)).length;
}

/** The same number with two neighbouring, different digits swapped (47 → 74). */
export function swapDigits(rng: Rng, n: number): number {
  const d = digitsOf(n);
  const spots = d.map((_, i) => i).filter((i) => i + 1 < d.length && d[i] !== d[i + 1] && !(i === 0 && d[1] === 0));
  if (spots.length === 0) return n + 1;
  const i = rng.pick(spots);
  [d[i], d[i + 1]] = [d[i + 1], d[i]];
  return Number(d.join(""));
}

/** Column addition that forgets every carry: 47 + 28 → 65. */
export function addWithoutCarry(a: number, b: number): number {
  let out = 0;
  let place = 1;
  while (a > 0 || b > 0) {
    out += (((a % 10) + (b % 10)) % 10) * place;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
    place *= 10;
  }
  return out;
}

/** Column subtraction that takes the smaller digit from the larger: 52 − 27 → 35. */
export function subtractSmallerFromLarger(a: number, b: number): number {
  let out = 0;
  let place = 1;
  while (a > 0 || b > 0) {
    out += Math.abs((a % 10) - (b % 10)) * place;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
    place *= 10;
  }
  return out;
}

export function needsCarry(a: number, b: number): boolean {
  while (a > 0 || b > 0) {
    if ((a % 10) + (b % 10) >= 10) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

export function needsBorrow(a: number, b: number): boolean {
  while (b > 0) {
    if (a % 10 < b % 10) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

/** Names that read naturally in a Singapore classroom. Questions repeat the name, never a pronoun. */
export const NAMES = ["Aisha", "Ben", "Chen", "Devi", "Farah", "Hui Min", "Ravi", "Sofia", "Tom", "Wei Jie", "Zara", "Omar", "Mei", "Arjun"];

export function twoNames(rng: Rng): [string, string] {
  const [a, b] = rng.sample(NAMES, 2);
  return [a, b];
}

/** Emoji in groups of five, so a child can count them. */
export function emojiRow(emoji: string, count: number): string {
  const groups: string[] = [];
  for (let left = count; left > 0; left -= 5) groups.push(emoji.repeat(Math.min(5, left)));
  return groups.join(" ");
}
