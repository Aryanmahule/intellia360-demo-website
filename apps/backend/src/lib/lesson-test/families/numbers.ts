/**
 * Whole numbers: counting, reading and writing, place value, comparing,
 * patterns, ordinals, odd and even, rounding and estimation.
 *
 * Most families take the lesson's number range as params[0] ("Counting up to
 * 200" → 200), so a Grade 1 test counts to 100 and a Grade 5 one reads millions.
 */
import {
  digitCountBelow,
  digitsOf,
  distinctDigitNumber,
  emojiRow,
  fmt,
  numberWords,
  ORDINALS,
  PLACE_NAMES,
  placeCount,
  swapDigits,
  type Draft,
  type Family,
  type Rng,
} from "@/lib/lesson-test/core";

const OBJECTS = [
  { emoji: "🍎", name: "apples" },
  { emoji: "⭐", name: "stars" },
  { emoji: "🐟", name: "fish" },
  { emoji: "🎈", name: "balloons" },
  { emoji: "🌸", name: "flowers" },
  { emoji: "⚽", name: "balls" },
];

const ANIMALS = [
  { emoji: "🐶", name: "dog" },
  { emoji: "🐱", name: "cat" },
  { emoji: "🐰", name: "rabbit" },
  { emoji: "🐸", name: "frog" },
  { emoji: "🐵", name: "monkey" },
  { emoji: "🐼", name: "panda" },
  { emoji: "🦊", name: "fox" },
  { emoji: "🐷", name: "pig" },
  { emoji: "🐮", name: "cow" },
];

/** Count-on steps that suit a range: ones to 100, tens to 1,000, hundreds beyond. */
function countStep(rng: Rng, max: number): number {
  if (max <= 100) return 1;
  if (max <= 1000) return rng.pick([1, 10, 10]);
  if (max <= 10000) return rng.pick([10, 100, 100]);
  return rng.pick([100, 1000, 1000]);
}

const counting: Family = {
  skill: "counting",
  label: "Counting",
  make(rng, [max = 100]) {
    const variant = rng.int(0, max <= 100 ? 4 : 3);

    if (variant === 4) {
      const n = rng.int(6, 18);
      const item = rng.pick(OBJECTS);
      return {
        question: `How many ${item.name} are there? ${emojiRow(item.emoji, n)}`,
        answer: n,
        wrong: [n - 1, n + 1, n + 2, n - 2],
        hint: "Touch each one as you count so you count every one exactly once. Groups of five help!",
        explanation: `Counting them one by one gives ${n}.`,
        difficulty: "easy",
      };
    }

    if (variant === 3) {
      const step = countStep(rng, max);
      const start = step * rng.int(1, Math.max(2, Math.floor(max / step) - 5));
      const seq = [0, 1, 2].map((i) => start + i * step);
      const answer = start + 3 * step;
      return {
        question: `Count on in ${fmt(step)}s: ${seq.map(fmt).join(", ")}, ___. What comes next?`,
        answer,
        wrong: [answer + step, answer - 1, answer + 1, start + 2 * step + 1],
        hint: `Each number is ${fmt(step)} more than the one before it.`,
        explanation: `${fmt(seq[2])} + ${fmt(step)} = ${fmt(answer)}.`,
        difficulty: step === 1 ? "easy" : "medium",
      };
    }

    const n = rng.int(11, max - 2);
    if (variant === 0) {
      return {
        question: `What number comes just after ${fmt(n)}?`,
        answer: n + 1,
        wrong: [n - 1, n + 2, n + 10, n],
        hint: "The number just after is one more.",
        explanation: `One more than ${fmt(n)} is ${fmt(n + 1)}.`,
        difficulty: n % 10 === 9 ? "medium" : "easy",
      };
    }
    if (variant === 1) {
      return {
        question: `What number comes just before ${fmt(n)}?`,
        answer: n - 1,
        wrong: [n + 1, n - 2, n - 10, n],
        hint: "The number just before is one less.",
        explanation: `One less than ${fmt(n)} is ${fmt(n - 1)}.`,
        difficulty: n % 10 === 0 ? "medium" : "easy",
      };
    }
    return {
      question: `What number comes between ${fmt(n - 1)} and ${fmt(n + 1)}?`,
      answer: n,
      wrong: [n + 2, n - 2, n + 10, n - 10],
      hint: `Count on one from ${fmt(n - 1)}.`,
      explanation: `${fmt(n - 1)}, ${fmt(n)}, ${fmt(n + 1)} — ${fmt(n)} is in the middle.`,
      difficulty: "easy",
    };
  },
};

const skipCounting: Family = {
  skill: "counting",
  label: "Skip counting",
  make(rng, params) {
    const steps = params.filter((p) => p >= 2);
    const step = rng.pick(steps.length > 0 ? steps : [2, 5, 10]);
    const start = step * rng.int(1, 8);
    const seq = [0, 1, 2, 3].map((i) => start + i * step);
    const missingAt = rng.int(1, 4);
    const answer = start + missingAt * step;
    const shown = [...seq, start + 4 * step].map((v, i) => (i === missingAt ? "___" : fmt(v)));
    return {
      question: `Skip count by ${step}s: ${shown.join(", ")}. Which number is missing?`,
      answer,
      wrong: [answer + 1, answer - 1, answer + step, answer + 10],
      hint: `Add ${step} each time.`,
      explanation: `Counting in ${step}s: ${[...seq, start + 4 * step].map(fmt).join(", ")}.`,
      difficulty: step <= 5 || step === 10 ? "easy" : "medium",
    };
  },
};

/** A number in range, sometimes with a zero digit inside — those are the tricky ones. */
function rangeNumber(rng: Rng, max: number): number {
  const count = digitCountBelow(max);
  if (count <= 2) return rng.int(11, Math.min(99, max - 1));
  const low = 10 ** (count - 1);
  const high = Math.min(max - 1, 10 ** count - 1);
  let n = rng.int(low, high);
  if (rng.chance(0.4)) {
    const d = digitsOf(n);
    d[rng.int(1, d.length - 1)] = 0;
    n = Number(d.join(""));
  }
  return Math.max(low, Math.min(high, n));
}

const numberNames: Family = {
  skill: "place-value",
  label: "Reading and writing numbers",
  make(rng, [max = 100]) {
    const n = rangeNumber(rng, max);
    const place = 10 ** Math.max(1, digitsOf(n).length - 2);
    const lookalikes = [swapDigits(rng, n), n + place, n - place, n + 1, Number(String(n).replace(/0/, "")) || n + 2];

    if (rng.chance(0.5)) {
      return {
        question: `Which number is “${numberWords(n)}”?`,
        answer: n,
        wrong: lookalikes,
        hint: "Read the words one part at a time and write each part in its place.",
        explanation: `“${numberWords(n)}” is written ${fmt(n)}.`,
        difficulty: n >= 1000 ? "medium" : "easy",
      };
    }
    return {
      question: `How do you write ${fmt(n)} in words?`,
      answer: numberWords(n),
      wrong: lookalikes.map(numberWords),
      hint: "Start with the digit on the left and say which place it is in.",
      explanation: `${fmt(n)} is “${numberWords(n)}”.`,
      difficulty: n >= 1000 ? "medium" : "easy",
    };
  },
};

const placeValue: Family = {
  skill: "place-value",
  label: "Place value",
  make(rng, [max = 100]) {
    const count = Math.min(7, digitCountBelow(max));
    let n = distinctDigitNumber(rng, count);
    if (n >= max) {
      // A range like "up to 200" caps the leading digit; keep the digits distinct.
      const lead = rng.int(1, Math.max(1, Math.floor((max - 1) / 10 ** (count - 1))));
      const rest = rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== lead), count - 1);
      n = Number([lead, ...rest].join(""));
    }
    const d = digitsOf(n);
    const len = d.length;
    // Two-digit numbers get tens-and-ones questions instead of "which digit" (only two to choose from).
    const variant = len === 2 ? rng.pick([0, 2, 3]) : rng.int(0, 2);

    if (variant === 3) {
      // Two-digit numbers: tens and ones.
      const [tens, ones] = d;
      if (rng.chance(0.5)) {
        return {
          question: `How many tens are in ${n}?`,
          answer: tens,
          wrong: [ones, n, tens * 10, tens + 1],
          hint: "The digit on the left tells you how many tens.",
          explanation: `${n} is ${placeCount(tens, "tens")} and ${placeCount(ones, "ones")}.`,
          difficulty: "easy",
        };
      }
      return {
        question: `What number has ${placeCount(tens, "tens")} and ${placeCount(ones, "ones")}?`,
        answer: n,
        wrong: [ones * 10 + tens, tens + ones, tens * 10, n + 10],
        hint: `${tens} tens is ${tens * 10}. Then add the ones.`,
        explanation: `${placeCount(tens, "tens")} = ${tens * 10}, and ${tens * 10} + ${ones} = ${n}.`,
        difficulty: "easy",
      };
    }

    const pos = rng.int(0, len - 1);
    const digit = d[pos] === 0 ? d[0] : d[pos];
    const at = d.indexOf(digit);
    const power = len - 1 - at;
    const placeName = PLACE_NAMES[power];

    if (variant === 0) {
      const value = digit * 10 ** power;
      return {
        question: `What is the value of the digit ${digit} in ${fmt(n)}?`,
        answer: value,
        wrong: [digit, digit * 10 ** (power + 1), digit * 10 ** Math.max(0, power - 1), n],
        hint: `Find which place the ${digit} is in.`,
        explanation: `The ${digit} is in the ${placeName} place, so it is worth ${fmt(value)}.`,
        difficulty: len <= 2 ? "easy" : len <= 4 ? "medium" : "hard",
      };
    }

    if (variant === 1) {
      return {
        question: `Which digit is in the ${placeName} place in ${fmt(n)}?`,
        answer: String(digit),
        wrong: d.filter((x) => x !== digit).map(String),
        hint: "Name the places from the right: ones, tens, hundreds, thousands…",
        explanation: `In ${fmt(n)}, the ${placeName} digit is ${digit}.`,
        difficulty: len <= 3 ? "easy" : "medium",
      };
    }

    const parts = d
      .map((digitValue, i) => ({ digitValue, place: PLACE_NAMES[len - 1 - i] }))
      .filter((p) => p.digitValue > 0);
    const phrase = parts.map((p) => placeCount(p.digitValue, p.place));
    const spoken = phrase.length > 1 ? `${phrase.slice(0, -1).join(", ")} and ${phrase.at(-1)}` : phrase[0];
    return {
      question: `What number is ${spoken}?`,
      answer: n,
      wrong: [Number(parts.map((p) => p.digitValue).join("")), swapDigits(rng, n), n + 10 ** (len - 2), n * 10],
      hint: "Write each digit in its own place. Put a 0 in any place that is empty.",
      explanation: `${spoken} makes ${fmt(n)}.`,
      difficulty: len <= 2 ? "easy" : "medium",
    };
  },
};

function expanded(n: number): string {
  const d = digitsOf(n);
  return d
    .map((digit, i) => digit * 10 ** (d.length - 1 - i))
    .filter((v) => v > 0)
    .map(fmt)
    .join(" + ");
}

const expandedForm: Family = {
  skill: "place-value",
  label: "Expanded form",
  make(rng, [max = 1000]) {
    const n = rangeNumber(rng, Math.max(max, 100));
    const d = digitsOf(n);
    const terms = d.map((digit, i) => digit * 10 ** (d.length - 1 - i)).filter((v) => v > 0);

    // Wrong expansions: one term moved to the wrong place.
    const shifted = (factor: number) =>
      terms
        .map((t, i) => (i === terms.length - 1 && terms.length > 1 ? t * factor : t))
        .map(fmt)
        .join(" + ");
    const digitsOnly = d.filter((x) => x > 0).join(" + ");

    if (rng.chance(0.5)) {
      return {
        question: `Which is the expanded form of ${fmt(n)}?`,
        answer: expanded(n),
        wrong: [shifted(10), digitsOnly, terms.map((t) => fmt(t * 10)).join(" + "), shifted(100)],
        hint: "Split the number into the value of each digit.",
        explanation: `${fmt(n)} = ${expanded(n)}.`,
        difficulty: "medium",
      };
    }
    return {
      question: `What number is ${expanded(n)}?`,
      answer: n,
      wrong: [Number(d.filter((x) => x > 0).join("")), swapDigits(rng, n), n * 10, n + 10 ** (d.length - 1)],
      hint: "Line the values up by place value and add them.",
      explanation: `${expanded(n)} = ${fmt(n)}.`,
      difficulty: terms.length < d.length ? "medium" : "easy",
    };
  },
};

/** Four different numbers of the same size that share leading digits, so comparing needs care. */
function closeNumbers(rng: Rng, max: number, count: number): number[] {
  const out = new Set<number>();
  const base = rangeNumber(rng, max);
  out.add(base);
  out.add(swapDigits(rng, base));
  let guard = 0;
  while (out.size < count && guard++ < 50) {
    const len = digitsOf(base).length;
    const spread = 10 ** Math.max(1, len - 2);
    const v = base + rng.int(-spread, spread);
    if (v >= 10 ** (len - 1) && v < max) out.add(v);
  }
  while (out.size < count) out.add(base + out.size);
  return [...out].slice(0, count);
}

const comparing: Family = {
  skill: "comparison",
  label: "Comparing numbers",
  make(rng, [max = 100]) {
    if (rng.chance(0.4)) {
      const [a, b] = closeNumbers(rng, max, 2);
      const sign = a > b ? ">" : a < b ? "<" : "=";
      return {
        question: `Which sign makes this true? ${fmt(a)} ◯ ${fmt(b)}`,
        answer: sign,
        wrong: [">", "<", "="].filter((s) => s !== sign),
        hint: "Compare the digits from the left. The open side of the sign faces the bigger number.",
        explanation: `${fmt(a)} ${sign} ${fmt(b)}.`,
        difficulty: "easy",
        ordered: true,
      };
    }
    const nums = closeNumbers(rng, max, 4);
    const greatest = rng.chance(0.5);
    const answer = greatest ? Math.max(...nums) : Math.min(...nums);
    return {
      question: `Which number is the ${greatest ? "greatest" : "smallest"}?`,
      answer,
      wrong: nums.filter((n) => n !== answer),
      hint: "Look at the digits in the biggest place first. If they are the same, move one place to the right.",
      explanation: `${fmt(answer)} is the ${greatest ? "greatest" : "smallest"} of ${nums.map(fmt).join(", ")}.`,
      difficulty: digitsOf(answer).length >= 4 ? "medium" : "easy",
    };
  },
};

const ordering: Family = {
  skill: "comparison",
  label: "Ordering numbers",
  make(rng, [max = 100]) {
    const nums = closeNumbers(rng, max, 4);
    const ascending = rng.chance(0.5);
    const sorted = nums.slice().sort((a, b) => (ascending ? a - b : b - a));
    const show = (list: number[]) => list.map(fmt).join(", ");
    const swapped = (i: number) => {
      const copy = sorted.slice();
      [copy[i], copy[i + 1]] = [copy[i + 1], copy[i]];
      return show(copy);
    };
    return {
      question: `Which list puts ${nums.map(fmt).join(", ")} in order from ${ascending ? "smallest to greatest" : "greatest to smallest"}?`,
      answer: show(sorted),
      wrong: [show(sorted.slice().reverse()), swapped(1), swapped(0), swapped(2), show(nums)],
      hint: ascending ? "Find the smallest number first, then the next smallest." : "Find the greatest number first.",
      explanation: `In order: ${show(sorted)}.`,
      difficulty: "medium",
    };
  },
};

function patternStep(rng: Rng, max: number): number {
  if (max <= 100) return rng.pick([2, 3, 4, 5, 10]);
  if (max <= 1000) return rng.pick([5, 10, 20, 25, 50, 100]);
  if (max <= 10000) return rng.pick([50, 100, 200, 250, 500, 1000]);
  return rng.pick([500, 1000, 2000, 5000, 10000]);
}

const numberPatterns: Family = {
  skill: "patterns",
  label: "Number patterns",
  make(rng, [max = 100]) {
    const step = patternStep(rng, max);
    const down = rng.chance(0.35);
    // Small steps start anywhere (3, 8, 13…); big ones start on a multiple.
    const offset = step <= 10 ? rng.int(0, step - 1) : 0;
    const slots = Math.max(1, Math.floor((max - offset) / step) - 4);
    const low = offset + rng.int(0, slots - 1) * step;
    const terms = [0, 1, 2, 3, 4].map((i) => low + i * step);
    if (down) terms.reverse();
    const missingAt = rng.chance(0.5) ? 4 : rng.int(1, 3);
    const answer = terms[missingAt];
    const shown = terms.map((t, i) => (i === missingAt ? "___" : fmt(t)));
    const word = down ? "less" : "more";
    return {
      question: `What number is missing from the pattern? ${shown.join(", ")}`,
      answer,
      wrong: [answer + step, answer - step, answer + 1, answer - 1, answer + 10],
      hint: "Work out how much the pattern changes from one number to the next.",
      explanation: `Each number is ${fmt(step)} ${word} than the one before, so the missing number is ${fmt(answer)}.`,
      difficulty: missingAt === 4 ? "easy" : "medium",
    };
  },
};

const ordinal: Family = {
  skill: "counting",
  label: "Ordinal numbers",
  make(rng) {
    const row = rng.sample(ANIMALS, rng.int(5, 7));
    const line = row.map((a) => a.emoji).join(" ");
    const pos = rng.int(0, row.length - 1);
    const animal = row[pos];

    if (rng.chance(0.5)) {
      return {
        question: `The animals are in a line: ${line}. Counting from the left, in which position is the ${animal.name}?`,
        answer: ORDINALS[pos],
        wrong: [ORDINALS[pos + 1], ORDINALS[pos - 1], ORDINALS[row.length - 1 - pos], ORDINALS[pos + 2]].filter(Boolean),
        hint: "Start at the left and say first, second, third… as you point.",
        explanation: `Counting from the left, the ${animal.name} is ${ORDINALS[pos]}.`,
        difficulty: "easy",
      };
    }
    const neighbours = [row[pos + 1], row[pos - 1], row[row.length - 1 - pos], ...row].filter(
      (a): a is (typeof row)[number] => Boolean(a)
    );
    const label = (a: (typeof row)[number]) => `${a.emoji} ${a.name}`;
    return {
      question: `The animals are in a line: ${line}. Counting from the left, which animal is ${ORDINALS[pos]}?`,
      answer: label(animal),
      wrong: neighbours.map(label),
      hint: "Point to each animal from the left: first, second, third…",
      explanation: `Counting from the left, the ${ORDINALS[pos]} animal is the ${animal.name}.`,
      difficulty: pos >= 3 ? "medium" : "easy",
    };
  },
};

const oddEven: Family = {
  skill: "number-sense",
  label: "Odd and even numbers",
  make(rng, [max = 1000]) {
    const n = rng.int(11, Math.min(max, 9999));
    const variant = rng.int(0, 2);
    if (variant === 0) {
      const even = n % 2 === 0;
      return {
        question: `Is ${fmt(n)} odd or even?`,
        answer: even ? "Even" : "Odd",
        wrong: [even ? "Odd" : "Even"],
        hint: "Only the ones digit matters. Even numbers end in 0, 2, 4, 6 or 8.",
        explanation: `${fmt(n)} ends in ${n % 10}, so it is ${even ? "even" : "odd"}.`,
        difficulty: "easy",
        ordered: true,
      };
    }
    if (variant === 1) {
      const wantEven = rng.chance(0.5);
      const base = n - (n % 2) + (wantEven ? 0 : 1);
      const others = [base + 1, base - 1, base + 3].filter((x) => x > 0);
      return {
        question: `Which number is ${wantEven ? "even" : "odd"}?`,
        answer: base,
        wrong: others,
        hint: "Look at the ones digit of each number.",
        explanation: `${fmt(base)} ends in ${base % 10}, so it is ${wantEven ? "even" : "odd"}.`,
        difficulty: "easy",
      };
    }
    const next = n % 2 === 0 ? n + 2 : n + 1;
    return {
      question: `What is the next even number after ${fmt(n)}?`,
      answer: next,
      wrong: [n + 1 === next ? n + 2 : n + 1, next + 2, n - 1],
      hint: "Even numbers go up in twos: 2, 4, 6, 8, 10…",
      explanation: `The next even number after ${fmt(n)} is ${fmt(next)}.`,
      difficulty: "easy",
    };
  },
};

/** The places it makes sense to round to for numbers in this range. */
function roundingPlaces(max: number): number[] {
  if (max <= 100) return [10];
  if (max <= 1000) return [10, 100];
  if (max <= 10000) return [10, 100, 1000];
  if (max <= 100000) return [100, 1000, 10000];
  return [1000, 10000, 100000];
}

const PLACE_LABEL: Record<number, string> = {
  10: "ten",
  100: "hundred",
  1000: "thousand",
  10000: "ten thousand",
  100000: "hundred thousand",
};

export function roundTo(n: number, place: number): number {
  return Math.floor((n + place / 2) / place) * place;
}

const rounding: Family = {
  skill: "number-sense",
  label: "Rounding",
  make(rng, [max = 1000]) {
    const place = rng.pick(roundingPlaces(max));
    let n = rng.int(place + 1, Math.max(place * 2, Math.min(max, place * 100) - 1));
    if (n % place === 0) n += Math.floor(place / 3);
    const answer = roundTo(n, place);
    const down = Math.floor(n / place) * place;
    const up = down + place;
    return {
      question: `Round ${fmt(n)} to the nearest ${PLACE_LABEL[place]}.`,
      answer,
      wrong: [answer === up ? down : up, roundTo(n, place * 10), roundTo(n, Math.max(1, place / 10)), answer + place].filter((v) => v > 0),
      hint: `Look at the digit just to the right of the ${PLACE_LABEL[place]}s place. 5 or more rounds up.`,
      explanation: `${fmt(n)} is between ${fmt(down)} and ${fmt(up)}, and nearer to ${fmt(answer)}.`,
      difficulty: place >= 1000 ? "medium" : "easy",
    };
  },
};

const estimation: Family = {
  skill: "number-sense",
  label: "Estimation",
  make(rng, [max = 1000, op = 2]) {
    const subtract = op === 1 || (op === 2 && rng.chance(0.5));
    const place = max <= 100 ? 10 : max <= 1000 ? 100 : 1000;
    const top = Math.max(place * 4, Math.min(max, place * 90));
    let a = rng.int(place * 2, top);
    let b = rng.int(place, top);
    if (subtract && b > a) [a, b] = [b, a];
    // Different rounded values, so a subtraction never estimates to 0.
    if (roundTo(a, place) === roundTo(b, place)) a += place * 2;
    const ra = roundTo(a, place);
    const rb = roundTo(b, place);
    const answer = subtract ? ra - rb : ra + rb;
    const exact = subtract ? a - b : a + b;
    const sign = subtract ? "−" : "+";
    return {
      question: `Estimate ${fmt(a)} ${sign} ${fmt(b)} by first rounding each number to the nearest ${PLACE_LABEL[place]}.`,
      answer,
      wrong: [exact, answer + place, answer - place, subtract ? ra + rb : Math.abs(ra - rb)],
      hint: `Round ${fmt(a)} and ${fmt(b)} first, then ${subtract ? "subtract" : "add"} the rounded numbers.`,
      explanation: `${fmt(a)} ≈ ${fmt(ra)} and ${fmt(b)} ≈ ${fmt(rb)}, so ${fmt(ra)} ${sign} ${fmt(rb)} = ${fmt(answer)}.`,
      difficulty: "medium",
    };
  },
};

const PATTERN_SETS = [
  ["🔴", "🔵", "🟡"],
  ["⭐", "🌙", "☀️"],
  ["🍎", "🍌", "🍇"],
  ["🐶", "🐱", "🐭"],
  ["▲", "●", "■"],
];

const repeatingPatterns: Family = {
  skill: "patterns",
  label: "Patterns",
  make(rng) {
    const set = rng.pick(PATTERN_SETS);
    const units = [[0, 1], [0, 1, 2], [0, 0, 1], [0, 1, 1]];
    const unitShape = rng.pick(units);
    const length = rng.int(6, 8);
    const sequence = Array.from({ length: length + 1 }, (_, i) => set[unitShape[i % unitShape.length]]);
    const answer = sequence[length];
    const repeating = unitShape.map((i) => set[i]).join(" ");
    const otherSet = PATTERN_SETS.find((s) => s !== set)!;
    return {
      question: `What comes next? ${sequence.slice(0, length).join(" ")} ___`,
      answer,
      wrong: [...set.filter((s) => s !== answer), otherSet[0]],
      hint: "Find the part that repeats, then say the pattern out loud.",
      explanation: `The part that repeats is ${repeating}, so ${answer} comes next.`,
      difficulty: unitShape.length === 2 ? "easy" : "medium",
    };
  },
};

export const NUMBER_FAMILIES: Record<string, Family> = {
  counting,
  "skip-counting": skipCounting,
  "number-names": numberNames,
  "place-value": placeValue,
  "expanded-form": expandedForm,
  comparing,
  ordering,
  "number-patterns": numberPatterns,
  ordinal,
  "odd-even": oddEven,
  rounding,
  estimation,
  "repeating-patterns": repeatingPatterns,
};

export type { Draft };
