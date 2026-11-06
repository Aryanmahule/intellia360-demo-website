/**
 * Fractions, decimals, percentages, ratio, factors and multiples.
 *
 * Decimals are worked in whole numbers (thousandths) and formatted at the end,
 * so 0.1 + 0.2 never becomes 0.30000000000000004. A wrong option is never
 * equal in value to the answer: "2/4" is not offered as wrong when the answer
 * is "1/2", unless the question asks for the simplest form.
 */
import {
  decimal,
  fmt,
  fraction,
  gcd,
  lcm,
  ORDINALS,
  placeCount,
  simplest,
  twoNames,
  unit,
  type Family,
  type Rng,
} from "@/lib/lesson-test/core";

type Frac = [number, number];

const same = ([a, b]: Frac, [c, d]: Frac) => a * d === b * c;

/** Fraction texts for the wrong options, minus invalid ones and any equal to the answer. */
function fractionWrongs(answer: Frac, candidates: Frac[]): string[] {
  return candidates
    .filter(([n, d]) => Number.isInteger(n) && Number.isInteger(d) && n > 0 && d > 0 && n !== d && !same([n, d], answer))
    .map(([n, d]) => fraction(n, d));
}

function coprimePair(rng: Rng, maxDen: number): Frac {
  for (;;) {
    const d = rng.int(2, maxDen);
    const n = rng.int(1, d - 1);
    if (gcd(n, d) === 1) return [n, d];
  }
}

/** 4.50 → "4.5", 3.00 → "3". */
function trimmed(scaled: number, places: number): string {
  const text = decimal(scaled, places);
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

/* ── Fractions ────────────────────────────────────────────────────────────── */

const fractionMeaning: Family = {
  skill: "fractions",
  label: "Fractions",
  make(rng) {
    const d = rng.int(3, 10);
    const n = rng.int(1, d - 1);
    const variant = rng.int(0, 3);
    const commonWrong = (ans: Frac) =>
      fractionWrongs(ans, [[d - ans[0], d], [ans[0], d - ans[0]], [d, ans[0]], [ans[0] + 1, d], [ans[0], d + 1]]);

    if (variant === 0) {
      return {
        question: `What fraction of the bar is shaded? ${"🟦".repeat(n)}${"⬜".repeat(d - n)}`,
        answer: fraction(n, d),
        wrong: commonWrong([n, d]),
        hint: "Count all the equal parts for the bottom number, then the shaded parts for the top.",
        explanation: `${n} of the ${d} equal parts are shaded: ${fraction(n, d)}.`,
        difficulty: "easy",
      };
    }
    if (variant === 1 || variant === 2) {
      const [name] = twoNames(rng);
      const left = variant === 2;
      const ans: Frac = left ? [d - n, d] : [n, d];
      return {
        question: `A pizza is cut into ${d} equal slices. ${name} eats ${n} of them. What fraction of the pizza ${left ? "is left" : `does ${name} eat`}?`,
        answer: fraction(...ans),
        wrong: commonWrong(ans),
        hint: left ? `How many of the ${d} slices are not eaten?` : `The whole pizza is ${d} equal slices.`,
        explanation: left
          ? `${d} − ${n} = ${d - n} slices are left, so ${fraction(d - n, d)} of the pizza is left.`
          : `${n} out of ${d} equal slices is ${fraction(n, d)}.`,
        difficulty: left ? "medium" : "easy",
      };
    }
    const top = rng.chance(0.5);
    const meaningOfBottom = "How many equal parts the whole is split into";
    const meaningOfTop = "How many of the equal parts we are counting";
    return {
      question: `In the fraction ${fraction(n, d)}, what does the ${top ? `top number (numerator) ${n}` : `bottom number (denominator) ${d}`} tell you?`,
      answer: top ? meaningOfTop : meaningOfBottom,
      wrong: [top ? meaningOfBottom : meaningOfTop, "How many wholes there are", "How long each part is in centimetres"],
      hint: "The bottom number names the parts; the top number counts them.",
      explanation: `In ${fraction(n, d)}, the whole is split into ${d} equal parts and we are counting ${n} of them.`,
      difficulty: "easy",
    };
  },
};

const equivalentFractions: Family = {
  skill: "fractions",
  label: "Equivalent fractions",
  make(rng) {
    const [n, d] = coprimePair(rng, 6);
    const k = rng.int(2, 5);
    if (rng.chance(0.5)) {
      return {
        question: `Fill in the missing number: ${fraction(n, d)} = ___/${d * k}`,
        answer: n * k,
        wrong: [n + (d * k - d), n * k + 1, n * k - 1, d * k - n, n],
        hint: `What was ${d} multiplied by to get ${d * k}? Do the same to the top.`,
        explanation: `${d} × ${k} = ${d * k}, so ${n} × ${k} = ${n * k}: ${fraction(n, d)} = ${fraction(n * k, d * k)}.`,
        difficulty: "medium",
      };
    }
    return {
      question: `Which fraction is equivalent to ${fraction(n, d)}?`,
      answer: fraction(n * k, d * k),
      wrong: fractionWrongs([n, d], [[n + k, d + k], [n * k, d], [n, d * k], [n * k, d * k + 1], [d, n]]),
      hint: "Multiply the top and the bottom by the same number.",
      explanation: `${fraction(n, d)} = ${fraction(n * k, d * k)} (top and bottom × ${k}).`,
      difficulty: "medium",
    };
  },
};

const simplifyFractions: Family = {
  skill: "fractions",
  label: "Simplifying fractions",
  make(rng) {
    const [n, d] = coprimePair(rng, 9);
    const k = rng.pick([2, 3, 4, 5, 6]);
    const N = n * k;
    const D = d * k;
    // Divided by part of the common factor only — equivalent, but not simplest.
    const part = k === 4 || k === 6 ? 2 : null;
    const wrong = [
      ...(part ? [fraction(N / part, D / part)] : []),
      ...fractionWrongs([n, d], [[n, d + 1], ...(n + 1 < d ? ([[n + 1, d]] as Frac[]) : []), [N, d], [n, D]]),
      ...(n > 1 ? [fraction(d, n)] : []),
    ];
    return {
      question: `Write ${fraction(N, D)} in its simplest form.`,
      answer: fraction(n, d),
      wrong,
      hint: `Find the biggest number that divides both ${N} and ${D}.`,
      explanation: `${N} and ${D} can both be divided by ${k}: ${fraction(N, D)} = ${fraction(n, d)}.`,
      difficulty: part ? "hard" : "medium",
    };
  },
};

function fractionSet(rng: Rng, count: number): { list: Frac[]; how: string } {
  if (rng.chance(0.5)) {
    const d = rng.int(5, 12);
    const tops = rng.sample(Array.from({ length: d - 1 }, (_, i) => i + 1), count);
    return { list: tops.map((t) => [t, d] as Frac), how: "When the bottom numbers are the same, the bigger top number is the bigger fraction." };
  }
  const n = rng.int(1, 3);
  const bottoms = rng.sample([2, 3, 4, 5, 6, 8, 10, 12].filter((b) => b > n), count);
  return { list: bottoms.map((b) => [n, b] as Frac), how: "When the top numbers are the same, the smaller bottom number means bigger parts." };
}

const value = ([n, d]: Frac) => n / d;

const compareFractions: Family = {
  skill: "fractions",
  label: "Comparing fractions",
  make(rng) {
    if (rng.chance(0.35)) {
      // Related denominators, so the two can be equal.
      const [n, d] = coprimePair(rng, 6);
      const k = rng.int(2, 3);
      const other: Frac = [rng.int(1, d * k - 1), d * k];
      const left: Frac = [n, d];
      const sign = value(left) > value(other) ? ">" : value(left) < value(other) ? "<" : "=";
      return {
        question: `Which sign makes this true? ${fraction(...left)} ◯ ${fraction(...other)}`,
        answer: sign,
        wrong: [">", "<", "="].filter((s) => s !== sign),
        hint: `Change ${fraction(...left)} into ${d * k}ths first.`,
        explanation: `${fraction(...left)} = ${fraction(n * k, d * k)}, and ${fraction(n * k, d * k)} ${sign} ${fraction(...other)}.`,
        difficulty: "medium",
        ordered: true,
      };
    }
    const { list, how } = fractionSet(rng, 4);
    const greatest = rng.chance(0.5);
    const sorted = list.slice().sort((a, b) => value(a) - value(b));
    const answer = greatest ? sorted[sorted.length - 1] : sorted[0];
    return {
      question: `Which fraction is the ${greatest ? "greatest" : "smallest"}?`,
      answer: fraction(...answer),
      wrong: list.filter((f) => f !== answer).map((f) => fraction(...f)),
      hint: how,
      explanation: `${fraction(...answer)} is the ${greatest ? "greatest" : "smallest"}. ${how}`,
      difficulty: list[0][1] === list[1][1] ? "easy" : "medium",
    };
  },
};

const orderFractions: Family = {
  skill: "fractions",
  label: "Ordering fractions",
  make(rng) {
    const { list, how } = fractionSet(rng, 3);
    const ascending = rng.chance(0.5);
    const sorted = list.slice().sort((a, b) => (ascending ? value(a) - value(b) : value(b) - value(a)));
    const show = (l: Frac[]) => l.map((f) => fraction(...f)).join(", ");
    return {
      question: `Which list puts ${show(list)} in order from ${ascending ? "smallest to greatest" : "greatest to smallest"}?`,
      answer: show(sorted),
      wrong: [show(sorted.slice().reverse()), show([sorted[1], sorted[0], sorted[2]]), show([sorted[0], sorted[2], sorted[1]])],
      hint: how,
      explanation: `In order: ${show(sorted)}. ${how}`,
      difficulty: "medium",
    };
  },
};

const addSubFractions: Family = {
  skill: "fractions",
  label: "Adding and subtracting fractions",
  make(rng) {
    for (;;) {
      const d1 = rng.pick([2, 3, 4, 5]);
      const k = rng.pick([2, 3]);
      const d2 = d1 * k;
      if (d2 > 12) continue;
      const a = rng.int(1, d1 - 1);
      if (gcd(a, d1) !== 1) continue;
      const subtract = rng.chance(0.5);
      const b = subtract ? rng.int(1, a * k - 1) : rng.int(1, d2 - a * k);
      if (b < 1 || (!subtract && a * k + b > d2) || (subtract && b >= a * k)) continue;

      const top = subtract ? a * k - b : a * k + b;
      const answer: Frac = [top / gcd(top, d2), d2 / gcd(top, d2)];
      const sign = subtract ? "−" : "+";
      const wrong = fractionWrongs(answer, [
        [subtract ? Math.abs(a - b) : a + b, subtract ? d2 - d1 : d1 + d2],
        [subtract ? Math.abs(a - b) : a + b, d2],
        [subtract ? a * k + b : Math.abs(a * k - b), d2],
        [top + 1, d2],
      ]);
      return {
        question: `${fraction(a, d1)} ${sign} ${fraction(b, d2)} = ? Give the answer in its simplest form.`,
        answer: answer[1] === 1 ? String(answer[0]) : fraction(...answer),
        wrong,
        hint: `Change ${fraction(a, d1)} into ${d2}ths first, then ${subtract ? "subtract" : "add"} the top numbers only.`,
        explanation: `${fraction(a, d1)} = ${fraction(a * k, d2)}, and ${fraction(a * k, d2)} ${sign} ${fraction(b, d2)} = ${fraction(top, d2)} = ${simplest(top, d2)}.`,
        difficulty: "hard",
      };
    }
  },
};

const mixed = (w: number, n: number, d: number) => `${w} ${n}/${d}`;

const mixedImproper: Family = {
  skill: "fractions",
  label: "Mixed numbers and improper fractions",
  make(rng, [mode = 0]) {
    const w = rng.int(1, 5);
    const [n, d] = coprimePair(rng, 9);
    const improper = w * d + n;
    const toMixed = mode === 1 || (mode === 0 && rng.chance(0.5));

    if (toMixed) {
      const wrong = [
        mixed(w + 1, n, d),
        ...(d - n !== n ? [mixed(w, d - n, d)] : []),
        ...(w < d && w !== n ? [mixed(n, w, d)] : []),
        ...(w > 1 ? [mixed(w - 1, n, d)] : []),
      ];
      return {
        question: `Write ${fraction(improper, d)} as a mixed number.`,
        answer: mixed(w, n, d),
        wrong,
        hint: `How many whole groups of ${d} are in ${improper}? The left-over is the new top number.`,
        explanation: `${improper} ÷ ${d} = ${w} remainder ${n}, so ${fraction(improper, d)} = ${mixed(w, n, d)}.`,
        difficulty: "medium",
      };
    }
    return {
      question: `Write ${mixed(w, n, d)} as an improper fraction.`,
      answer: fraction(improper, d),
      wrong: fractionWrongs([improper, d], [[w * n + d, d], [w + n, d], [w * d, d], [improper, n], [w * d - n, d]]),
      hint: `Multiply the whole number by ${d}, then add the top number.`,
      explanation: `${w} × ${d} + ${n} = ${improper}, so ${mixed(w, n, d)} = ${fraction(improper, d)}.`,
      difficulty: "medium",
    };
  },
};

const fractionDivision: Family = {
  skill: "fractions",
  label: "Fractions as division",
  make(rng) {
    const variant = rng.int(0, 2);
    if (variant === 2) {
      for (;;) {
        const b = rng.int(2, 6);
        const a = rng.int(b + 1, b * 5);
        if (a % b === 0) continue;
        const q = Math.floor(a / b);
        const r = a % b;
        // In simplest form: 15 ÷ 6 = 2 1/2, not 2 3/6.
        const g = gcd(r, b);
        const [rn, rd] = [r / g, b / g];
        return {
          question: `Write ${a} ÷ ${b} as a mixed number.`,
          answer: mixed(q, rn, rd),
          wrong: [mixed(q + 1, rn, rd), mixed(q, r, a), ...(q < rd && q !== rn ? [mixed(rn, q, rd)] : []), fraction(b, a)],
          hint: `${a} ÷ ${b} is ${q} remainder ${r}. The remainder is shared into ${b} parts.`,
          explanation: `${a} ÷ ${b} = ${q} remainder ${r} = ${mixed(q, r, b)}${g > 1 ? ` = ${mixed(q, rn, rd)}` : ""}.`,
          difficulty: "hard",
        };
      }
    }
    const b = rng.int(3, 9);
    const a = rng.int(1, b - 1);
    const wrong = fractionWrongs([a, b], [[b, a], [1, b], [1, a], [a, a + b]]);
    if (variant === 1) {
      return {
        question: `${a} ${a === 1 ? "pizza is" : "pizzas are"} shared equally among ${b} children. What fraction of a pizza does each child get?`,
        answer: fraction(a, b),
        wrong,
        hint: `Each child gets ${a} ÷ ${b} of a pizza.`,
        explanation: `${a} ÷ ${b} = ${fraction(a, b)}, so each child gets ${fraction(a, b)} of a pizza.`,
        difficulty: "medium",
      };
    }
    return {
      question: `Write ${a} ÷ ${b} as a fraction.`,
      answer: fraction(a, b),
      wrong,
      hint: "The number being divided goes on top; the number you divide by goes underneath.",
      explanation: `${a} ÷ ${b} = ${fraction(a, b)}.`,
      difficulty: "easy",
    };
  },
};

/* ── Decimals ─────────────────────────────────────────────────────────────── */

const DECIMAL_PLACES = ["tenths", "hundredths", "thousandths"];

const decimalPlaceValue: Family = {
  skill: "decimals",
  label: "Decimal place value",
  make(rng, [dp = 2]) {
    const places = Math.min(3, Math.max(1, dp));
    const digits = rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9], places + 1);
    const whole = digits[0];
    const decimals = digits.slice(1);
    const scaled = Number([whole, ...decimals].join(""));
    const text = decimal(scaled, places);
    const variant = rng.int(0, 2);
    const at = rng.int(0, places - 1);

    if (variant === 0) {
      return {
        question: `Which digit is in the ${DECIMAL_PLACES[at]} place in ${text}?`,
        answer: String(decimals[at]),
        wrong: digits.filter((x) => x !== decimals[at]).map(String),
        hint: "After the decimal point the places are tenths, hundredths, then thousandths.",
        explanation: `In ${text}, the ${DECIMAL_PLACES[at]} digit is ${decimals[at]}.`,
        difficulty: "easy",
      };
    }
    if (variant === 1) {
      const digit = decimals[at];
      const power = at + 1;
      return {
        question: `What is the value of the digit ${digit} in ${text}?`,
        answer: decimal(digit, power),
        wrong: [String(digit), decimal(digit, power + 1), power > 1 ? decimal(digit, power - 1) : String(digit * 10), String(digit * 10)],
        hint: `The ${digit} is in the ${DECIMAL_PLACES[at]} place.`,
        explanation: `${digit} ${DECIMAL_PLACES[at]} = ${decimal(digit, power)}.`,
        difficulty: "medium",
      };
    }
    const parts = decimals.map((x, i) => placeCount(x, DECIMAL_PLACES[i]));
    const swapped = [whole, ...decimals.slice().reverse()].join("");
    return {
      question: `Which number has ${placeCount(whole, "ones")}, ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]}?`,
      answer: text,
      wrong: [decimal(Number(swapped), places), decimal(scaled, places + 1), decimal(scaled * 10, places), `${decimals.join("")}.${whole}`],
      hint: "Write the ones, then the decimal point, then each place in order.",
      explanation: `${placeCount(whole, "ones")} and ${parts.join(", ")} make ${text}.`,
      difficulty: "medium",
    };
  },
};

const tenthsHundredths: Family = {
  skill: "decimals",
  label: "Tenths and hundredths",
  make(rng) {
    const variant = rng.int(0, 3);
    if (variant === 0) {
      const n = rng.int(1, 9);
      return {
        question: `Write ${numberWord(n)} tenths as a decimal.`,
        answer: decimal(n, 1),
        wrong: [decimal(n, 2), `${n}.0`, decimal(n, 3), `${n}0`],
        hint: "Tenths are the first place after the decimal point.",
        explanation: `${n} tenths = ${decimal(n, 1)}.`,
        difficulty: "easy",
      };
    }
    let n = rng.int(11, 99);
    if (n % 10 === 0) n += 1;
    if (variant === 1) {
      return {
        question: `Write ${n} hundredths as a decimal.`,
        answer: decimal(n, 2),
        wrong: [decimal(n, 1), decimal(n, 3), String(n), `${n}.0`],
        hint: "Hundredths are the second place after the decimal point.",
        explanation: `${n} hundredths = ${decimal(n, 2)}.`,
        difficulty: "easy",
      };
    }
    if (variant === 2) {
      return {
        question: `How many hundredths are in ${decimal(n, 2)}?`,
        answer: n,
        wrong: [Math.floor(n / 10), n % 10, n * 10, n + 10],
        hint: "Read the digits after the decimal point as a whole number of hundredths.",
        explanation: `${decimal(n, 2)} = ${n} hundredths.`,
        difficulty: "medium",
      };
    }
    const t = rng.int(1, 9);
    return {
      question: `How many tenths are in ${decimal(t, 1)}?`,
      answer: t,
      wrong: [t * 10, t + 1, t - 1, 10 - t],
      hint: "The first digit after the point counts tenths.",
      explanation: `${decimal(t, 1)} = ${t} tenths.`,
      difficulty: "easy",
    };
  },
};

function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n] ?? String(n);
}

const FRIENDLY: { f: Frac; dec: string; wrong: string[] }[] = [
  { f: [1, 2], dec: "0.5", wrong: ["0.2", "0.12", "0.05"] },
  { f: [1, 4], dec: "0.25", wrong: ["0.4", "0.14", "0.75"] },
  { f: [3, 4], dec: "0.75", wrong: ["0.34", "0.43", "0.25"] },
  { f: [1, 5], dec: "0.2", wrong: ["0.5", "0.15", "0.25"] },
  { f: [2, 5], dec: "0.4", wrong: ["0.25", "0.04", "0.45"] },
  { f: [3, 5], dec: "0.6", wrong: ["0.35", "0.53", "0.3"] },
  { f: [4, 5], dec: "0.8", wrong: ["0.45", "0.54", "0.08"] },
];

const fractionDecimal: Family = {
  skill: "decimals",
  label: "Fractions and decimals",
  make(rng) {
    const kind = rng.int(0, 2);
    let f: Frac;
    let dec: string;
    let wrongDec: string[];
    if (kind === 0) {
      const n = rng.int(1, 9);
      f = [n, 10];
      dec = decimal(n, 1);
      wrongDec = [decimal(n, 2), `1.${n}`, decimal(n + 1, 1), `${n}.10`];
    } else if (kind === 1) {
      let n = rng.int(11, 99);
      if (n % 10 === 0) n += 3;
      f = [n, 100];
      dec = decimal(n, 2);
      wrongDec = [decimal(n, 1), decimal(n, 3), `1.${n}`, decimal(n + 1, 2)];
    } else {
      const pick = rng.pick(FRIENDLY);
      f = pick.f;
      dec = pick.dec;
      wrongDec = pick.wrong;
    }

    if (rng.chance(0.5)) {
      return {
        question: `Write ${fraction(...f)} as a decimal.`,
        answer: dec,
        wrong: wrongDec,
        hint: f[1] === 10 || f[1] === 100 ? "Tenths take one decimal place; hundredths take two." : `Make an equivalent fraction out of 10 or 100 first.`,
        explanation: `${fraction(...f)} = ${dec}.`,
        difficulty: kind === 2 ? "medium" : "easy",
      };
    }
    const g = gcd(f[0], f[1]);
    const answer: Frac = [f[0] / g, f[1] / g];
    // The digits after the point, misread: 0.25 → 25/10, 2/5, 1/25.
    const digits = dec.split(".")[1];
    const asWhole = Number(digits);
    return {
      question: `Write ${dec} as a fraction in its simplest form.`,
      answer: fraction(...answer),
      wrong: fractionWrongs(answer, [
        [asWhole, 10],
        [asWhole, 100],
        ...(digits.length === 2 && digits[1] !== "0" ? ([[Number(digits[0]), Number(digits[1])]] as Frac[]) : []),
        [1, asWhole],
        [answer[1], answer[0]],
      ]),
      hint: "Write the digits over 10 or 100, then simplify.",
      explanation: `${dec} = ${fraction(...f)}${g > 1 ? ` = ${fraction(...answer)}` : ""}.`,
      difficulty: "medium",
    };
  },
};

/** Four different decimals with mixed lengths (0.5, 0.45, 0.405…), scaled to thousandths. */
function trickyDecimals(rng: Rng, dp: number, count: number): { scaled: number; text: string }[] {
  const whole = rng.int(0, 9);
  const out = new Map<number, string>();
  let guard = 0;
  while (out.size < count && guard++ < 100) {
    const places = rng.int(1, Math.max(1, dp));
    const frac = rng.int(1, 10 ** places - 1);
    const scaled = whole * 1000 + frac * 10 ** (3 - places);
    if (!out.has(scaled)) out.set(scaled, trimmed(whole * 10 ** places + frac, places));
  }
  return [...out.entries()].map(([scaled, text]) => ({ scaled, text }));
}

const compareDecimals: Family = {
  skill: "decimals",
  label: "Comparing decimals",
  make(rng, [dp = 2]) {
    if (rng.chance(0.5)) {
      const [a, b] = trickyDecimals(rng, dp, 2);
      // Sometimes the same value with a trailing zero: 0.5 = 0.50.
      const right = rng.chance(0.2) ? { scaled: a.scaled, text: a.text.includes(".") ? `${a.text}0` : `${a.text}.0` } : b;
      const sign = a.scaled > right.scaled ? ">" : a.scaled < right.scaled ? "<" : "=";
      return {
        question: `Which sign makes this true? ${a.text} ◯ ${right.text}`,
        answer: sign,
        wrong: [">", "<", "="].filter((s) => s !== sign),
        hint: "Line up the decimal points. Compare tenths, then hundredths. A zero on the end changes nothing.",
        explanation: `${a.text} ${sign} ${right.text}.`,
        difficulty: "medium",
        ordered: true,
      };
    }
    const list = trickyDecimals(rng, dp, 4);
    const greatest = rng.chance(0.5);
    const sorted = list.slice().sort((a, b) => a.scaled - b.scaled);
    const answer = greatest ? sorted[sorted.length - 1] : sorted[0];
    return {
      question: `Which decimal is the ${greatest ? "greatest" : "smallest"}?`,
      answer: answer.text,
      wrong: list.filter((x) => x !== answer).map((x) => x.text),
      hint: "Line up the decimal points and compare the tenths first, then the hundredths. A longer decimal is not always bigger.",
      explanation: `In order: ${sorted.map((x) => x.text).join(", ")}.`,
      difficulty: "medium",
    };
  },
};

const orderDecimals: Family = {
  skill: "decimals",
  label: "Ordering decimals",
  make(rng, [dp = 2]) {
    const list = trickyDecimals(rng, dp, 3);
    const ascending = rng.chance(0.5);
    const sorted = list.slice().sort((a, b) => (ascending ? a.scaled - b.scaled : b.scaled - a.scaled));
    const show = (l: typeof list) => l.map((x) => x.text).join(", ");
    return {
      question: `Which list puts ${show(list)} in order from ${ascending ? "smallest to greatest" : "greatest to smallest"}?`,
      answer: show(sorted),
      wrong: [show(sorted.slice().reverse()), show([sorted[1], sorted[0], sorted[2]]), show([sorted[0], sorted[2], sorted[1]])],
      hint: "Compare the tenths first, then the hundredths, then the thousandths.",
      explanation: `In order: ${show(sorted)}.`,
      difficulty: "medium",
    };
  },
};

const roundDecimals: Family = {
  skill: "decimals",
  label: "Rounding decimals",
  make(rng, [dp = 2]) {
    const target = rng.int(0, Math.max(0, Math.min(2, dp - 1)));
    const places = target + 1 + (dp >= 3 && target < 2 && rng.chance(0.3) ? 1 : 0);
    const scaled = rng.int(10 ** places + 1, 50 * 10 ** places - 1);
    const drop = 10 ** (places - target);
    const rounded = Math.floor((scaled + drop / 2) / drop);
    const truncated = Math.floor(scaled / drop);
    const to = target === 0 ? "the nearest whole number" : `${target} decimal place${target > 1 ? "s" : ""}`;
    const show = (v: number) => decimal(v, target);
    return {
      question: `Round ${decimal(scaled, places)} to ${to}.`,
      answer: show(rounded),
      wrong: [show(rounded === truncated ? truncated + 1 : truncated), show(rounded + 1), show(Math.max(0, rounded - 1)), decimal(scaled, places)],
      hint: "Look at the digit just after the place you are rounding to. 5 or more rounds up.",
      explanation: `${decimal(scaled, places)} rounded to ${to} is ${show(rounded)}.`,
      difficulty: target === 0 ? "easy" : "medium",
    };
  },
};

/* ── Percentages ──────────────────────────────────────────────────────────── */

const percent = unit("%");

const percentMeaning: Family = {
  skill: "percentages",
  label: "Percentages",
  make(rng) {
    const n = rng.int(5, 95);
    const variant = rng.int(0, 3);
    if (variant === 0 || variant === 1) {
      const notShaded = variant === 1;
      const answer = notShaded ? 100 - n : n;
      return {
        question: `${n} out of 100 squares on a grid are shaded. What percentage of the grid is ${notShaded ? "not shaded" : "shaded"}?`,
        answer,
        wrong: [100 - answer, answer + 10, answer - 10, answer * 10],
        hint: "Per cent means “out of 100”.",
        explanation: notShaded
          ? `100 − ${n} = ${100 - n} squares are not shaded, which is ${100 - n}%.`
          : `${n} out of 100 is ${n}%.`,
        difficulty: notShaded ? "medium" : "easy",
        format: percent,
      };
    }
    if (variant === 2) {
      return {
        question: `What does ${n}% mean?`,
        answer: `${n} out of every 100`,
        wrong: [`${n} out of every 10`, `${n} out of every 1,000`, `${100 - n} out of every 100`],
        hint: "“Cent” means a hundred.",
        explanation: `${n}% means ${n} out of every 100.`,
        difficulty: "easy",
      };
    }
    const total = rng.pick([100, 200, 50]);
    const pct = total === 50 ? n - (n % 2) || 10 : n;
    const answer = (pct * total) / 100;
    return {
      question: `${pct}% of the ${total} pupils in a hall wear glasses. How many pupils wear glasses?`,
      answer,
      wrong: [pct, total - answer, answer + 10, answer * 2],
      hint: total === 100 ? "Out of 100, the percentage is the number." : `Find 1% of ${total} first, then multiply by ${pct}.`,
      explanation: `${pct}% of ${total} = ${pct} ÷ 100 × ${total} = ${answer}.`,
      difficulty: total === 100 ? "easy" : "medium",
    };
  },
};

const fractionPercent: Family = {
  skill: "percentages",
  label: "Fractions and percentages",
  make(rng) {
    const d = rng.pick([2, 4, 5, 10, 20, 25, 50]);
    const n = rng.int(1, d - 1);
    const pct = (n * 100) / d;
    if (rng.chance(0.5)) {
      const concat = Number(`${n}${d}`);
      return {
        question: `Write ${fraction(n, d)} as a percentage.`,
        answer: pct,
        wrong: [concat <= 100 ? concat : n * 10, 100 - pct, n, pct + 10],
        hint: `Make an equivalent fraction out of 100: ${d} × ${100 / d} = 100.`,
        explanation: `${fraction(n, d)} = ${fraction(n * (100 / d), 100)} = ${pct}%.`,
        difficulty: "medium",
        format: percent,
      };
    }
    const g = gcd(pct, 100);
    const answer: Frac = [pct / g, 100 / g];
    return {
      question: `Write ${pct}% as a fraction in its simplest form.`,
      answer: fraction(...answer),
      wrong: fractionWrongs(answer, [[pct, 10], [1, pct], [100 - pct, 100], [answer[1], answer[0]], [answer[0], answer[1] + 1]]),
      hint: `${pct}% means ${pct} out of 100. Write that as a fraction, then simplify.`,
      explanation: `${pct}% = ${fraction(pct, 100)} = ${fraction(...answer)}.`,
      difficulty: "medium",
    };
  },
};

const decimalPercent: Family = {
  skill: "percentages",
  label: "Decimals and percentages",
  make(rng) {
    let n = rng.int(1, 99);
    if (n % 10 === 0) n += 5;
    if (rng.chance(0.5)) {
      return {
        question: `Write ${decimal(n, 2)} as a percentage.`,
        answer: `${n}%`,
        wrong: [`${decimal(n, 1)}%`, `${n * 10}%`, `${decimal(n, 2)}%`],
        hint: "Multiply by 100: move the digits two places to the left of the point.",
        explanation: `${decimal(n, 2)} × 100 = ${n}, so ${decimal(n, 2)} = ${n}%.`,
        difficulty: "easy",
      };
    }
    return {
      question: `Write ${n}% as a decimal.`,
      answer: trimmed(n, 2),
      wrong: [trimmed(n, 1), trimmed(n, 3), String(n), `${n}.0`],
      hint: "Divide by 100: move the digits two places to the right of the point.",
      explanation: `${n}% = ${n} ÷ 100 = ${trimmed(n, 2)}.`,
      difficulty: n < 10 ? "medium" : "easy",
    };
  },
};

/* ── Ratio ────────────────────────────────────────────────────────────────── */

const ratio = (a: number, b: number) => `${a} : ${b}`;

const RATIO_THINGS = [
  ["red pens", "blue pens"],
  ["boys", "girls"],
  ["cats", "dogs"],
  ["apples", "oranges"],
];

const ratioBasics: Family = {
  skill: "ratio",
  label: "Ratio",
  make(rng) {
    const a = rng.int(2, 9);
    let b = rng.int(2, 9);
    if (a === b) b = a + 1;
    const [x, y] = rng.pick(RATIO_THINGS);
    const variant = rng.int(0, 2);
    // Never offer an equivalent ratio as a wrong answer.
    const notEquivalent = (ans: Frac) => (c: Frac) => !same(c, ans);

    if (variant === 2) {
      return {
        question: `Write “${a} to ${b}” as a ratio.`,
        answer: ratio(a, b),
        wrong: ([[b, a], [a, a + b]] as Frac[]).filter(notEquivalent([a, b])).map((r) => ratio(...r)).concat(`${a}${b}`),
        hint: "A ratio is written with a colon between the two amounts, in the order they are named.",
        explanation: `“${a} to ${b}” is written ${ratio(a, b)}.`,
        difficulty: "easy",
      };
    }
    const toTotal = variant === 1;
    const ans: Frac = toTotal ? [b, a + b] : [a, b];
    const candidates: Frac[] = [[b, a], [a, a + b], [a + b, b]];
    return {
      question: toTotal
        ? `A group has ${a} ${x} and ${b} ${y}. What is the ratio of ${y} to the whole group?`
        : `A group has ${a} ${x} and ${b} ${y}. What is the ratio of ${x} to ${y}?`,
      answer: ratio(...ans),
      wrong: candidates.filter(notEquivalent(ans)).map((r) => ratio(...r)),
      hint: toTotal ? `First find the total: ${a} + ${b}.` : "Write the amounts in the same order as the question names them.",
      explanation: toTotal
        ? `There are ${a} + ${b} = ${a + b} altogether, so the ratio is ${ratio(b, a + b)}.`
        : `${a} ${x} to ${b} ${y} is ${ratio(a, b)}.`,
      difficulty: toTotal ? "medium" : "easy",
    };
  },
};

const simplifyRatio: Family = {
  skill: "ratio",
  label: "Simplifying ratios",
  make(rng) {
    let p: number;
    let q: number;
    do {
      p = rng.int(1, 9);
      q = rng.int(1, 9);
    } while (p === q || gcd(p, q) !== 1);
    const k = rng.pick([2, 3, 4, 5, 6]);
    const part = k === 4 || k === 6 ? 2 : null;
    return {
      question: `Write ${ratio(p * k, q * k)} in its simplest form.`,
      answer: ratio(p, q),
      wrong: [...(part ? [ratio((p * k) / part, (q * k) / part)] : []), ratio(q, p), ratio(p + 1, q), ratio(p, q + 1)],
      hint: `Divide both numbers by the biggest number that goes into both.`,
      explanation: `${p * k} and ${q * k} can both be divided by ${k}: ${ratio(p * k, q * k)} = ${ratio(p, q)}.`,
      difficulty: part ? "hard" : "medium",
    };
  },
};

const equivalentRatio: Family = {
  skill: "ratio",
  label: "Equivalent ratios",
  make(rng) {
    let p: number;
    let q: number;
    do {
      p = rng.int(1, 8);
      q = rng.int(2, 9);
    } while (p === q || gcd(p, q) !== 1);
    const k = rng.int(2, 6);
    if (rng.chance(0.5)) {
      return {
        question: `Fill in the missing number: ${ratio(p, q)} = ${p * k} : ___`,
        answer: q * k,
        wrong: [q + (p * k - p), q * k + 1, q * k - 1, p * k],
        hint: `${p} was multiplied by ${k}. Do the same to ${q}.`,
        explanation: `${p} × ${k} = ${p * k} and ${q} × ${k} = ${q * k}.`,
        difficulty: "medium",
      };
    }
    const candidates: Frac[] = [[q * k, p * k], [p + k, q + k], [p * k, q], [p * k, q * k + 1]];
    return {
      question: `Which ratio is equivalent to ${ratio(p, q)}?`,
      answer: ratio(p * k, q * k),
      wrong: candidates.filter((c) => !same(c, [p, q])).map((c) => ratio(...c)),
      hint: "Multiply both parts of the ratio by the same number.",
      explanation: `${ratio(p, q)} = ${ratio(p * k, q * k)} (both × ${k}).`,
      difficulty: "medium",
    };
  },
};

/* ── Factors and multiples ────────────────────────────────────────────────── */

export function factorsOf(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) out.push(i);
  return out;
}

const FACTOR_NUMBERS = [12, 16, 18, 20, 24, 28, 30, 32, 36, 40, 42, 45, 48, 50, 54, 56, 60, 64, 72];

const factors: Family = {
  skill: "factors",
  label: "Factors",
  make(rng) {
    const n = rng.pick(FACTOR_NUMBERS);
    const list = factorsOf(n);
    const proper = list.filter((f) => f > 1 && f < n);
    const non = Array.from({ length: n - 2 }, (_, i) => i + 2).filter((x) => n % x !== 0);
    const variant = rng.int(0, n <= 24 ? 3 : 2);

    if (variant === 0) {
      return {
        question: `Which number is a factor of ${n}?`,
        answer: rng.pick(proper),
        wrong: rng.sample(non, 3),
        hint: `A factor divides ${n} exactly, with nothing left over.`,
        explanation: `The factors of ${n} are ${list.join(", ")}.`,
        difficulty: "easy",
      };
    }
    if (variant === 1) {
      return {
        question: `Which number is NOT a factor of ${n}?`,
        answer: rng.pick(non),
        wrong: rng.sample(proper, 3),
        hint: `Try dividing ${n} by each number. Which one leaves a remainder?`,
        explanation: `The factors of ${n} are ${list.join(", ")}.`,
        difficulty: "medium",
      };
    }
    if (variant === 2) {
      return {
        question: `How many factors does ${n} have?`,
        answer: list.length,
        wrong: [list.length - 1, list.length + 1, list.length - 2, list.length + 2],
        hint: "List them in pairs that multiply to make the number: 1 × …, 2 × …",
        explanation: `The factors of ${n} are ${list.join(", ")} — that is ${list.length} factors.`,
        difficulty: "medium",
      };
    }
    const left = rng.pick(proper);
    const missing = list.filter((f) => f !== left);
    const extra = [...list, rng.pick(non)].sort((a, b) => a - b);
    return {
      question: `Which list shows all the factors of ${n}?`,
      answer: list.join(", "),
      wrong: [missing.join(", "), extra.join(", "), [n, 2 * n, 3 * n].join(", ")],
      hint: `Find factor pairs: 1 × ${n}, 2 × …, and so on.`,
      explanation: `The factors of ${n} are ${list.join(", ")}.`,
      difficulty: "medium",
    };
  },
};

const multiples: Family = {
  skill: "factors",
  label: "Multiples",
  make(rng) {
    const m = rng.int(3, 12);
    const k = rng.int(3, 10);
    const variant = rng.int(0, 3);
    const notMultiple = (x: number) => x % m !== 0;

    if (variant === 0) {
      const answer = m * k;
      return {
        question: `Which number is a multiple of ${m}?`,
        answer,
        wrong: [answer + 1, answer - 1, answer + 2, answer - 2, m + k].filter(notMultiple),
        hint: `Multiples of ${m} are in the ${m} times table.`,
        explanation: `${m} × ${k} = ${answer}, so ${answer} is a multiple of ${m}.`,
        difficulty: "easy",
      };
    }
    if (variant === 1) {
      const answer = rng.pick([m * k + 1, m * k + 2, m * k - 1].filter(notMultiple));
      return {
        question: `Which number is NOT a multiple of ${m}?`,
        answer,
        wrong: [m * (k - 1), m * (k + 1), m * (k + 2), m * 2],
        hint: `Check which number is not in the ${m} times table.`,
        explanation: `${answer} ÷ ${m} leaves a remainder, so it is not a multiple of ${m}.`,
        difficulty: "medium",
      };
    }
    if (variant === 2) {
      const nth = rng.int(2, 10);
      return {
        question: `What is the ${ORDINALS[nth - 1]} multiple of ${m}?`,
        answer: m * nth,
        wrong: [m * (nth + 1), m * (nth - 1), m + nth, m * nth + 1],
        hint: `The first multiple of ${m} is ${m}; the second is ${m * 2}…`,
        explanation: `The ${ORDINALS[nth - 1]} multiple of ${m} is ${m} × ${nth} = ${m * nth}.`,
        difficulty: "easy",
      };
    }
    return {
      question: `Which list shows the first four multiples of ${m}?`,
      answer: [m, 2 * m, 3 * m, 4 * m].join(", "),
      wrong: [[1, m, 2 * m, 3 * m].join(", "), [m, m + 1, m + 2, m + 3].join(", "), [2 * m, 3 * m, 4 * m, 5 * m].join(", ")],
      hint: `Count in ${m}s, starting at ${m}.`,
      explanation: `${m} × 1, × 2, × 3, × 4 = ${[m, 2 * m, 3 * m, 4 * m].join(", ")}.`,
      difficulty: "easy",
    };
  },
};

const commonFactorMultiple: Family = {
  skill: "factors",
  label: "Common factors and multiples",
  make(rng) {
    const variant = rng.int(0, 3);
    if (variant === 0 || variant === 1) {
      const g = rng.int(2, 9);
      let x: number;
      let y: number;
      do {
        x = rng.int(2, 6);
        y = rng.int(2, 6);
      } while (x === y || gcd(x, y) !== 1 || g * x > 100 || g * y > 100);
      const a = g * x;
      const b = g * y;
      if (variant === 0) {
        const smaller = factorsOf(g).filter((f) => f > 1 && f < g);
        return {
          question: `What is the highest common factor of ${a} and ${b}?`,
          answer: g,
          wrong: [...smaller, lcm(a, b), g * 2, Math.min(a, b)].filter((v) => v !== g),
          hint: `List the factors of ${a} and of ${b}. Which is the biggest number in both lists?`,
          explanation: `${a} = ${g} × ${x} and ${b} = ${g} × ${y}, so the highest common factor is ${g}.`,
          difficulty: "medium",
        };
      }
      const common = factorsOf(g).filter((f) => f > 1);
      const onlyOne = [...factorsOf(a), ...factorsOf(b)].filter((f) => f > 1 && !(a % f === 0 && b % f === 0));
      return {
        question: `Which number is a common factor of ${a} and ${b}?`,
        answer: rng.pick(common),
        wrong: rng.sample([...new Set(onlyOne)], 3),
        hint: "A common factor divides both numbers exactly.",
        explanation: `The common factors of ${a} and ${b} (other than 1) are ${common.join(", ")}.`,
        difficulty: "medium",
      };
    }
    let a: number;
    let b: number;
    do {
      a = rng.int(2, 12);
      b = rng.int(2, 12);
    } while (a === b || lcm(a, b) > 120 || a % b === 0 || b % a === 0);
    const L = lcm(a, b);
    if (variant === 2) {
      return {
        question: `What is the lowest common multiple of ${a} and ${b}?`,
        answer: L,
        wrong: [a * b, L * 2, Math.max(a, b), a + b, gcd(a, b)].filter((v) => v !== L),
        hint: `Count in ${Math.max(a, b)}s until you reach a number that is also in the ${Math.min(a, b)} times table.`,
        explanation: `${L} is the first number in both the ${a} and the ${b} times tables.`,
        difficulty: "medium",
      };
    }
    const k = rng.int(1, 3);
    const onlyA = a * (b + 1);
    const onlyB = b * (a + 1);
    return {
      question: `Which number is a common multiple of ${a} and ${b}?`,
      answer: L * k,
      wrong: [onlyA, onlyB, a + b, L + a].filter((v) => !(v % a === 0 && v % b === 0)),
      hint: `It must be in both the ${a} and the ${b} times tables.`,
      explanation: `${fmt(L * k)} ÷ ${a} and ${fmt(L * k)} ÷ ${b} both have no remainder.`,
      difficulty: "medium",
    };
  },
};

export const FRACTION_FAMILIES: Record<string, Family> = {
  "fraction-meaning": fractionMeaning,
  "equivalent-fractions": equivalentFractions,
  "simplify-fractions": simplifyFractions,
  "compare-fractions": compareFractions,
  "order-fractions": orderFractions,
  "add-sub-fractions": addSubFractions,
  "mixed-improper": mixedImproper,
  "fraction-division": fractionDivision,
  "decimal-place-value": decimalPlaceValue,
  "tenths-hundredths": tenthsHundredths,
  "fraction-decimal": fractionDecimal,
  "compare-decimals": compareDecimals,
  "order-decimals": orderDecimals,
  "round-decimals": roundDecimals,
  "percent-meaning": percentMeaning,
  "fraction-percent": fractionPercent,
  "decimal-percent": decimalPercent,
  "ratio-basics": ratioBasics,
  "simplify-ratio": simplifyRatio,
  "equivalent-ratio": equivalentRatio,
  factors,
  multiples,
  "common-factor-multiple": commonFactorMultiple,
};
