/**
 * The four operations: addition, subtraction, multiplication and division,
 * their strategies (number bonds, mental maths, fact families) and word problems.
 *
 * Wrong options are the mistakes children actually make — a forgotten carry,
 * smaller-from-larger subtraction, the wrong operation — rather than random
 * numbers.
 */
import {
  addWithoutCarry,
  digitsOf,
  emojiRow,
  fmt,
  needsBorrow,
  needsCarry,
  subtractSmallerFromLarger,
  twoNames,
  type Family,
  type Rng,
} from "@/lib/lesson-test/core";
import type { Difficulty } from "@/lib/adaptive/config";

const ITEMS = ["stickers", "marbles", "stamps", "shells", "beads", "cards", "pencils", "buttons"];

/* ── Addition ─────────────────────────────────────────────────────────────── */

/** regroup: 0 either way, 1 never carries, 2 always carries. */
function addends(rng: Rng, max: number, regroup: number, oneDigit: boolean): [number, number] {
  for (let tries = 0; tries < 60; tries++) {
    const a = rng.int(Math.max(2, Math.floor(max / 10)), Math.max(3, max - 2));
    const room = max - a;
    if (room < 2) continue;
    // Never "+ 1": that is counting on, not adding.
    const b = oneDigit ? rng.int(2, Math.min(9, room)) : rng.int(Math.max(2, Math.floor(room / 4)), room);
    const carries = needsCarry(a, b);
    if (regroup === 1 && carries) continue;
    if (regroup === 2 && !carries) continue;
    return [a, b];
  }
  // Fallbacks that always satisfy the constraint (sums stay within 20 for small ranges).
  if (regroup === 2) return max >= 30 ? [18, 7] : [13, 7];
  return max >= 30 ? [21, 4] : [12, 4];
}

function addDifficulty(a: number, b: number): Difficulty {
  const s = a + b;
  if (s <= 20 && !needsCarry(a, b)) return "easy";
  if (s >= 10000) return "hard";
  return needsCarry(a, b) || s >= 1000 ? "medium" : "easy";
}

const addition: Family = {
  skill: "addition",
  label: "Addition",
  make(rng, [max = 100, regroup = 0, oneDigit = 0]) {
    const [a, b] = addends(rng, max, regroup, oneDigit === 1);
    const sum = a + b;
    const place = sum >= 1000 ? 100 : 10;
    const wrong = [addWithoutCarry(a, b), sum + place, sum - place, sum + 1, sum - 1];
    const carries = needsCarry(a, b);
    const hint = carries
      ? "Add the ones first. If they make 10 or more, carry the ten to the next column."
      : "Add the ones, then the tens (and then the hundreds).";

    if (rng.chance(0.25) && sum <= 1000) {
      return {
        question: `What number is missing? ${fmt(a)} + ___ = ${fmt(sum)}`,
        answer: b,
        wrong: [sum + a, b + 1, b - 1, b + 10, sum - a + 10],
        hint: `Think: what do you add to ${fmt(a)} to make ${fmt(sum)}? You can subtract to check.`,
        explanation: `${fmt(sum)} − ${fmt(a)} = ${fmt(b)}, so ${fmt(a)} + ${fmt(b)} = ${fmt(sum)}.`,
        difficulty: "medium",
      };
    }
    return {
      question: rng.chance(0.5) ? `${fmt(a)} + ${fmt(b)} = ?` : `What is the sum of ${fmt(a)} and ${fmt(b)}?`,
      answer: sum,
      wrong,
      hint,
      explanation: `${fmt(a)} + ${fmt(b)} = ${fmt(sum)}.${carries ? " Remember to carry when a column adds up to 10 or more." : ""}`,
      difficulty: addDifficulty(a, b),
    };
  },
};

const addThree: Family = {
  skill: "addition",
  label: "Adding three numbers",
  make(rng, [max = 100]) {
    const cap = Math.max(12, max);
    const a = rng.int(2, Math.floor(cap / 3));
    const b = rng.int(2, Math.floor(cap / 3));
    // Often a pair that makes a ten, so the "make ten first" strategy pays off.
    const c = rng.chance(0.5) && (10 - (a % 10)) % 10 > 0 ? (10 - (a % 10)) % 10 : rng.int(2, Math.floor(cap / 3));
    const sum = a + b + c;
    return {
      question: `${fmt(a)} + ${fmt(b)} + ${fmt(c)} = ?`,
      answer: sum,
      wrong: [a + b, sum + 10, sum - 10, sum + 1, sum - 1],
      hint: "Look for two numbers that make 10 (or a ten) and add those first.",
      explanation: `${fmt(a)} + ${fmt(b)} + ${fmt(c)} = ${fmt(sum)}.`,
      difficulty: sum > 100 ? "medium" : "easy",
    };
  },
};

/* ── Subtraction ──────────────────────────────────────────────────────────── */

/** A minuend with a zero in a middle or ones place (500, 4,003, 302). */
function withZeros(rng: Rng, max: number): number {
  const len = Math.max(3, String(Math.max(100, max - 1)).length);
  const d = [rng.int(1, 9), ...Array.from({ length: len - 1 }, () => 0)];
  if (len > 3 && rng.chance(0.5)) d[len - 1] = rng.int(1, 9);
  const n = Number(d.join(""));
  return n < max ? n : Number(String(n).slice(0, -1)) || 100;
}

/** regroup: 0 either way, 1 never borrows, 2 always borrows, 3 across zeros. */
function subtrahends(rng: Rng, max: number, regroup: number): [number, number] {
  for (let tries = 0; tries < 60; tries++) {
    const a = regroup === 3 ? withZeros(rng, max) : rng.int(Math.max(5, Math.floor(max / 5)), Math.max(6, max));
    const b = rng.int(Math.max(1, Math.floor(a / 6)), a - 1);
    if (b < 1 || b >= a) continue;
    const borrows = needsBorrow(a, b);
    if (regroup === 1 && borrows) continue;
    if ((regroup === 2 || regroup === 3) && !borrows) continue;
    return [a, b];
  }
  if (regroup === 1) return max >= 60 ? [59, 4] : [19, 4];
  return max >= 60 ? [52, 7] : [15, 7];
}

const subtraction: Family = {
  skill: "subtraction",
  label: "Subtraction",
  make(rng, [max = 100, regroup = 0]) {
    const [a, b] = subtrahends(rng, max, regroup);
    const diff = a - b;
    const place = a >= 1000 ? 100 : 10;
    const borrows = needsBorrow(a, b);
    const hint = borrows
      ? "Start with the ones. If the top digit is smaller, regroup: take 1 from the next column."
      : "Subtract the ones, then the tens (and then the hundreds).";

    if (rng.chance(0.25) && a <= 1000) {
      return {
        question: `What number is missing? ${fmt(a)} − ___ = ${fmt(diff)}`,
        answer: b,
        wrong: [a + diff, b + 1, b - 1, b + 10, diff],
        hint: `How much do you take away from ${fmt(a)} to leave ${fmt(diff)}?`,
        explanation: `${fmt(a)} − ${fmt(diff)} = ${fmt(b)}, so ${fmt(a)} − ${fmt(b)} = ${fmt(diff)}.`,
        difficulty: "medium",
      };
    }
    const phrase = rng.pick([
      `${fmt(a)} − ${fmt(b)} = ?`,
      `What is ${fmt(a)} take away ${fmt(b)}?`,
      `Find the difference between ${fmt(a)} and ${fmt(b)}.`,
    ]);
    return {
      question: phrase,
      answer: diff,
      wrong: [subtractSmallerFromLarger(a, b), diff + place, diff - place, diff + 1, a + b],
      hint,
      explanation: `${fmt(a)} − ${fmt(b)} = ${fmt(diff)}. Check: ${fmt(diff)} + ${fmt(b)} = ${fmt(a)}.`,
      difficulty: a >= 1000 || regroup === 3 ? "hard" : borrows ? "medium" : "easy",
    };
  },
};

/* ── Strategies ───────────────────────────────────────────────────────────── */

const numberBonds: Family = {
  skill: "addition",
  label: "Number bonds",
  make(rng, [maxTotal = 20, op = 0]) {
    const total = rng.chance(0.5) ? 10 : rng.int(5, Math.max(5, maxTotal));
    const part = rng.int(1, total - 1);
    const other = total - part;
    if (op === 1) {
      return {
        question: rng.chance(0.5)
          ? `${total} − ___ = ${part}`
          : `A number bond has the whole ${total} and one part ${part}. What is the other part?`,
        answer: other,
        wrong: [total + part, other + 1, other - 1, part],
        hint: `Count on from ${part} up to ${total}.`,
        explanation: `${part} and ${other} make ${total}, so ${total} − ${part} = ${other}.`,
        difficulty: total > 10 ? "medium" : "easy",
      };
    }
    return {
      question: rng.chance(0.5) ? `${part} and ___ make ${total}.` : `${part} + ___ = ${total}`,
      answer: other,
      wrong: [total + part, other + 1, other - 1, total],
      hint: `Start at ${part} and count on until you reach ${total}.`,
      explanation: `${part} + ${other} = ${total}.`,
      difficulty: total > 10 ? "medium" : "easy",
    };
  },
};

const mentalMath: Family = {
  skill: "addition",
  label: "Mental maths",
  make(rng, [max = 100, op = 0]) {
    const subtract = op === 1 || (op === 2 && rng.chance(0.5));
    const big = max >= 1000;

    if (!subtract) {
      const strategy = rng.int(0, max <= 20 ? 1 : 3);
      if (strategy === 0) {
        const a = rng.int(7, 9);
        const b = rng.int(11 - a, 9);
        const give = 10 - a;
        return {
          question: `Make a ten to add: ${a} + ${b} = ?`,
          answer: a + b,
          wrong: [a + b + 1, a + b - 1, a + b + 10, 10 + b],
          hint: `Take ${give} from ${b} to make 10 with ${a}. Then add what is left.`,
          explanation: `${a} + ${give} = 10, and 10 + ${b - give} = ${a + b}.`,
          difficulty: "easy",
        };
      }
      if (strategy === 1) {
        const n = rng.int(3, 9);
        return {
          question: `Use a double to help: ${n} + ${n + 1} = ?`,
          answer: 2 * n + 1,
          wrong: [2 * n, 2 * n + 2, 2 * n + 11],
          hint: `${n} + ${n} = ${2 * n}. ${n + 1} is one more than ${n}.`,
          explanation: `${n} + ${n} = ${2 * n}, plus 1 more is ${2 * n + 1}.`,
          difficulty: "easy",
        };
      }
      if (strategy === 2) {
        const tens = big ? 100 * rng.int(1, 5) : 10 * rng.int(1, 5);
        const a = big ? rng.int(101, 899) : rng.int(11, 59);
        return {
          question: `Add ${big ? "the hundreds" : "the tens"} in your head: ${fmt(a)} + ${fmt(tens)} = ?`,
          answer: a + tens,
          wrong: [a + tens / 10, a + tens + 1, a + tens - (big ? 100 : 10), a + tens + (big ? 100 : 10)],
          hint: `Only the ${big ? "hundreds" : "tens"} digit changes.`,
          explanation: `${fmt(a)} + ${fmt(tens)} = ${fmt(a + tens)}.`,
          difficulty: "easy",
        };
      }
      const near = big ? 99 : 9;
      const a = big ? rng.int(120, 880) : rng.int(21, 80);
      return {
        question: `Add ${near} the quick way: ${fmt(a)} + ${near} = ?`,
        answer: a + near,
        wrong: [a + near + 1, a + near + 2, a + near - (big ? 100 : 10), a + near + (big ? 100 : 10) - 1],
        hint: `Add ${near + 1}, then take away 1.`,
        explanation: `${fmt(a)} + ${near + 1} = ${fmt(a + near + 1)}, and 1 less is ${fmt(a + near)}.`,
        difficulty: "medium",
      };
    }

    const strategy = rng.int(0, max <= 20 ? 0 : 2);
    if (strategy === 0) {
      const a = max <= 20 ? rng.int(11, 19) : rng.int(21, 98);
      const b = max <= 20 ? rng.int(2, a - 10) : rng.int(2, 9);
      return {
        question: `Count back in your head: ${a} − ${b} = ?`,
        answer: a - b,
        wrong: [a - b + 1, a - b - 1, a - b + 10, a + b],
        hint: `Start at ${a} and count back ${b}.`,
        explanation: `Counting back ${b} from ${a} lands on ${a - b}.`,
        difficulty: "easy",
      };
    }
    if (strategy === 1) {
      const near = big ? 99 : 9;
      const a = big ? rng.int(300, 990) : rng.int(30, 99);
      return {
        question: `Subtract ${near} the quick way: ${fmt(a)} − ${near} = ?`,
        answer: a - near,
        wrong: [a - near - 1, a - near - 2, a - near - (big ? 100 : 10), a - near + 2],
        hint: `Take away ${near + 1}, then add 1 back.`,
        explanation: `${fmt(a)} − ${near + 1} = ${fmt(a - near - 1)}, and 1 more is ${fmt(a - near)}.`,
        difficulty: "medium",
      };
    }
    const b = big ? rng.int(180, 480) : rng.int(18, 48);
    const a = b + (big ? rng.int(3, 40) : rng.int(3, 9));
    return {
      question: `Count up to subtract: ${fmt(a)} − ${fmt(b)} = ?`,
      answer: a - b,
      wrong: [a - b + 1, a - b - 1, a - b + 10, subtractSmallerFromLarger(a, b)],
      hint: `Count up from ${fmt(b)} to ${fmt(a)}. How many steps is that?`,
      explanation: `From ${fmt(b)} up to ${fmt(a)} is ${fmt(a - b)}.`,
      difficulty: "medium",
    };
  },
};

const factFamilies: Family = {
  skill: "subtraction",
  label: "Fact families",
  make(rng, [max = 20, kind = 0]) {
    if (kind === 1) {
      const a = rng.int(2, 10);
      const b = rng.int(2, 10);
      const p = a * b;
      if (rng.chance(0.5)) {
        return {
          question: `${a} × ${b} = ${p}. So what is ${p} ÷ ${a}?`,
          answer: b,
          wrong: [p - a, a, b + 1, p],
          hint: "Multiplication and division undo each other.",
          explanation: `${a} × ${b} = ${p}, so ${p} ÷ ${a} = ${b}.`,
          difficulty: "easy",
        };
      }
      return {
        question: `Which number sentence is in the same fact family as ${a} × ${b} = ${p}?`,
        answer: `${p} ÷ ${b} = ${a}`,
        wrong: [`${a} + ${b} = ${a + b}`, `${a} × ${b + 1} = ${a * (b + 1)}`, `${p} − ${a} = ${p - a}`],
        hint: `A fact family uses the same three numbers: ${a}, ${b} and ${p}.`,
        explanation: `${p} ÷ ${b} = ${a} uses ${a}, ${b} and ${p}, so it is in the same family.`,
        difficulty: "medium",
      };
    }
    const top = Math.min(Math.max(10, max), 100);
    const a = rng.int(2, Math.floor(top / 2));
    const b = rng.int(2, Math.floor(top / 2));
    const s = a + b;
    if (rng.chance(0.5)) {
      return {
        question: `${a} + ${b} = ${s}. So what is ${s} − ${b}?`,
        answer: a,
        wrong: [s + b, b, a + 1, s],
        hint: "Addition and subtraction undo each other.",
        explanation: `${a} + ${b} = ${s}, so ${s} − ${b} = ${a}.`,
        difficulty: "easy",
      };
    }
    return {
      question: `Which number sentence is in the same fact family as ${a} + ${b} = ${s}?`,
      answer: `${s} − ${a} = ${b}`,
      wrong: [`${s} + ${b} = ${s + b}`, `${a + 1} + ${b} = ${s + 1}`, `${a} + ${s} = ${a + s}`],
      hint: `A fact family uses the same three numbers: ${a}, ${b} and ${s}.`,
      explanation: `${s} − ${a} = ${b} uses ${a}, ${b} and ${s}, so it is in the same family.`,
      difficulty: "medium",
    };
  },
};

/* ── Word problems ────────────────────────────────────────────────────────── */

const wordAddition: Family = {
  skill: "addition",
  label: "Addition word problems",
  make(rng, [max = 100]) {
    const [a, b] = addends(rng, max, 0, false);
    const [p, q] = twoNames(rng);
    const item = rng.pick(ITEMS);
    const question = rng.chance(0.5)
      ? `${p} has ${fmt(a)} ${item}. ${q} gives ${p} ${fmt(b)} more. How many ${item} does ${p} have now?`
      : `There are ${fmt(a)} ${item} in one box and ${fmt(b)} ${item} in another box. How many ${item} are there altogether?`;
    return {
      question,
      answer: a + b,
      wrong: [Math.abs(a - b), a + b + 10, a + b - 10, addWithoutCarry(a, b), a + b + 1],
      hint: "“More” and “altogether” mean the amounts are put together — add.",
      explanation: `${fmt(a)} + ${fmt(b)} = ${fmt(a + b)}.`,
      difficulty: addDifficulty(a, b),
    };
  },
};

const wordSubtraction: Family = {
  skill: "subtraction",
  label: "Subtraction word problems",
  make(rng, [max = 100]) {
    const [a, b] = subtrahends(rng, max, 0);
    const [p, q] = twoNames(rng);
    const item = rng.pick(ITEMS);
    const question = rng.chance(0.5)
      ? `${p} had ${fmt(a)} ${item} and gave ${fmt(b)} to ${q}. How many ${item} does ${p} have left?`
      : `${p} has ${fmt(a)} ${item}. ${q} has ${fmt(b)} ${item}. How many more ${item} does ${p} have than ${q}?`;
    return {
      question,
      answer: a - b,
      wrong: [a + b, a - b + 10, a - b - 10, subtractSmallerFromLarger(a, b), a - b + 1],
      hint: "“Left” and “how many more” are subtraction questions.",
      explanation: `${fmt(a)} − ${fmt(b)} = ${fmt(a - b)}.`,
      difficulty: needsBorrow(a, b) ? "medium" : "easy",
    };
  },
};

const wordMultiplication: Family = {
  skill: "multiplication",
  label: "Multiplication word problems",
  make(rng, [maxA = 10, maxB = 10]) {
    const groups = rng.int(2, Math.max(2, maxA));
    const each = rng.int(2, Math.max(2, maxB));
    const [p] = twoNames(rng);
    const item = rng.pick(ITEMS);
    const product = groups * each;
    const question = rng.chance(0.5)
      ? `There are ${fmt(groups)} bags with ${fmt(each)} ${item} in each bag. How many ${item} are there in all?`
      : `${p} reads ${fmt(each)} pages every day for ${fmt(groups)} days. How many pages does ${p} read altogether?`;
    return {
      question,
      answer: product,
      wrong: [groups + each, product + each, product - each, product + groups],
      hint: "Equal groups put together — multiply the number of groups by how many are in each.",
      explanation: `${fmt(groups)} × ${fmt(each)} = ${fmt(product)}.`,
      difficulty: product > 100 ? "hard" : "medium",
    };
  },
};

const wordDivision: Family = {
  skill: "division",
  label: "Division word problems",
  make(rng, [maxDivisor = 9, maxQuotient = 12]) {
    const d = rng.int(2, Math.max(2, maxDivisor));
    const q = rng.int(2, Math.max(2, maxQuotient));
    const n = d * q;
    const item = rng.pick(ITEMS);
    const sharing = rng.chance(0.5);
    const question = sharing
      ? `${fmt(n)} ${item} are shared equally among ${d} children. How many ${item} does each child get?`
      : `${fmt(n)} ${item} are packed into bags of ${d}. How many bags are filled?`;
    return {
      question,
      answer: q,
      wrong: [n - d, q + 1, q - 1, n + d, d],
      hint: sharing ? `Share ${fmt(n)} into ${d} equal groups.` : `How many groups of ${d} make ${fmt(n)}?`,
      explanation: `${fmt(n)} ÷ ${d} = ${fmt(q)}.`,
      difficulty: n > 100 ? "hard" : "medium",
    };
  },
};

/* ── Multiplication ───────────────────────────────────────────────────────── */

const repeatedAddition: Family = {
  skill: "multiplication",
  label: "Repeated addition",
  make(rng, [maxFactor = 5, useTimes = 1]) {
    const groups = rng.int(2, Math.max(3, Math.min(6, maxFactor)));
    const size = rng.int(2, Math.max(2, maxFactor));
    const sum = Array.from({ length: groups }, () => size).join(" + ");
    const total = groups * size;
    const variant = rng.int(0, useTimes ? 2 : 1);
    if (variant === 0) {
      return {
        question: `${sum} = ?`,
        answer: total,
        wrong: [groups + size, total + size, total - size, total + 1],
        hint: `Count on in ${size}s, ${groups} times.`,
        explanation: `${groups} lots of ${size} make ${total}.`,
        difficulty: "easy",
      };
    }
    if (variant === 1) {
      return {
        question: `How many groups of ${size} are added here? ${sum}`,
        answer: groups,
        wrong: [size, total, groups + 1, groups - 1],
        hint: `Count how many ${size}s there are.`,
        explanation: `There are ${groups} groups of ${size}.`,
        difficulty: "easy",
      };
    }
    return {
      question: `Which multiplication matches ${sum}?`,
      answer: `${groups} × ${size}`,
      wrong: [`${groups} + ${size}`, `${groups + 1} × ${size}`, `${size} × ${size}`, `${groups} × ${groups}`],
      hint: "Count how many times the same number is added.",
      explanation: `${size} is added ${groups} times, which is ${groups} × ${size} = ${total}.`,
      difficulty: "medium",
    };
  },
};

const GROUP_ITEMS = [
  { emoji: "🍪", name: "cookies", holder: "plates" },
  { emoji: "🍎", name: "apples", holder: "baskets" },
  { emoji: "🐟", name: "fish", holder: "tanks" },
  { emoji: "🌸", name: "flowers", holder: "vases" },
];

const equalGroups: Family = {
  skill: "multiplication",
  label: "Equal groups",
  make(rng, [maxFactor = 5, useTimes = 1]) {
    const groups = rng.int(2, Math.max(2, Math.min(5, maxFactor)));
    const size = rng.int(2, Math.max(2, maxFactor));
    const item = rng.pick(GROUP_ITEMS);
    const total = groups * size;
    const variant = rng.int(0, useTimes ? 2 : 1);
    if (variant === 0 && size <= 6) {
      const picture = Array.from({ length: groups }, () => `[${item.emoji.repeat(size)}]`).join(" ");
      return {
        question: `How many ${item.name} are there in all? ${picture}`,
        answer: total,
        wrong: [groups + size, total + size, total - size, total + 1],
        hint: `There are ${groups} equal groups. Count in ${size}s.`,
        explanation: `${groups} groups of ${size} make ${total}.`,
        difficulty: "easy",
      };
    }
    if (variant === 2) {
      return {
        question: `${groups} groups of ${size} is the same as…`,
        answer: `${groups} × ${size}`,
        wrong: [`${groups} + ${size}`, `${groups} − ${size}`, `${size} + ${size}`, `${groups} × ${groups}`],
        hint: "“Groups of” means multiply.",
        explanation: `${groups} groups of ${size} = ${groups} × ${size} = ${total}.`,
        difficulty: "medium",
      };
    }
    return {
      question: `There are ${groups} ${item.holder} with ${size} ${item.name} on each. How many ${item.name} are there altogether?`,
      answer: total,
      wrong: [groups + size, total + size, total - size, total + 2],
      hint: `Count in ${size}s, once for each of the ${groups} ${item.holder}.`,
      explanation: `${groups} groups of ${size} make ${total}.`,
      difficulty: "easy",
    };
  },
};

const arrays: Family = {
  skill: "multiplication",
  label: "Arrays",
  make(rng, [maxFactor = 10]) {
    const rows = rng.int(2, 5);
    const cols = rng.int(2, Math.max(3, Math.min(8, maxFactor)));
    const total = rows * cols;
    if (rng.chance(0.5)) {
      const picture = Array.from({ length: rows }, () => "⭐".repeat(cols)).join(" / ");
      return {
        question: `How many stars are in this array? ${picture} (${rows} rows)`,
        answer: total,
        wrong: [rows + cols, total + cols, total - cols, total + rows],
        hint: `Count the stars in one row, then count in that number ${rows} times.`,
        explanation: `${rows} rows of ${cols} = ${rows} × ${cols} = ${total}.`,
        difficulty: "easy",
      };
    }
    return {
      question: `An array has ${rows} rows with ${cols} chairs in each row. Which number sentence shows how many chairs there are?`,
      answer: `${rows} × ${cols} = ${total}`,
      wrong: [`${rows} + ${cols} = ${rows + cols}`, `${rows} × ${cols + 1} = ${rows * (cols + 1)}`, `${cols} − ${rows} = ${Math.abs(cols - rows)}`],
      hint: "Rows × how many in each row.",
      explanation: `${rows} rows of ${cols} is ${rows} × ${cols} = ${total}.`,
      difficulty: "medium",
    };
  },
};

const timesTables: Family = {
  skill: "multiplication",
  label: "Times tables",
  make(rng, params) {
    const tables = params.filter((p) => p >= 2 && p <= 12);
    const t = rng.pick(tables.length > 0 ? tables : [2, 3, 4, 5, 10]);
    const k = rng.int(2, 12);
    const p = t * k;
    const difficulty: Difficulty = t >= 6 && k >= 6 ? "hard" : t >= 6 || k >= 6 ? "medium" : "easy";
    if (rng.chance(0.3)) {
      return {
        question: `${t} × ___ = ${p}`,
        answer: k,
        wrong: [k + 1, k - 1, p - t, t],
        hint: `Count in ${t}s until you reach ${p}.`,
        explanation: `${t} × ${k} = ${p}.`,
        difficulty,
      };
    }
    const [x, y] = rng.chance(0.5) ? [t, k] : [k, t];
    return {
      question: `${x} × ${y} = ?`,
      answer: p,
      wrong: [p + t, p - t, t + k, p + k, p + 1],
      hint: `Count in ${t}s ${k} times, or start from a fact you know.`,
      explanation: `${x} × ${y} = ${p}.`,
      difficulty,
    };
  },
};

/** One-digit multiplication that writes each carry down but never adds it: 47 × 3 → 121. */
function multiplyWithoutCarry(a: number, b: number): number {
  const [first, ...rest] = digitsOf(a);
  return Number(String(first * b) + rest.map((d) => (d * b) % 10).join(""));
}

const multiplyMulti: Family = {
  skill: "multiplication",
  label: "Multiplying larger numbers",
  make(rng, [aDigits = 2, bDigits = 1]) {
    const a = rng.int(10 ** (aDigits - 1) + 1, 10 ** aDigits - 1);
    const b = bDigits === 1 ? rng.int(3, 9) : rng.int(11, 10 ** bDigits - 1);
    const p = a * b;
    const wrong =
      bDigits === 1
        ? [multiplyWithoutCarry(a, b), p + a, p - a, p + 10 * b]
        : // Forgetting the place-holder zero: a × tens digit added as if it were ones.
          [a * (Math.floor(b / 10) + (b % 10)), p + a, p - a, p + 100];
    return {
      question: `${fmt(a)} × ${fmt(b)} = ?`,
      answer: p,
      wrong,
      hint:
        bDigits === 1
          ? "Multiply the ones first and carry, then the tens, then the hundreds."
          : `Multiply by the ones digit, then by the tens digit (put a 0 first), then add the two rows.`,
      explanation: `${fmt(a)} × ${fmt(b)} = ${fmt(p)}.`,
      difficulty: aDigits + bDigits >= 5 ? "hard" : "medium",
    };
  },
};

/* ── Division ─────────────────────────────────────────────────────────────── */

const SHARE_ITEMS = [
  { emoji: "🍓", name: "strawberries" },
  { emoji: "🍬", name: "sweets" },
  { emoji: "🖍️", name: "crayons" },
];

const sharing: Family = {
  skill: "division",
  label: "Sharing equally",
  make(rng, [maxEach = 5]) {
    const people = rng.int(2, 5);
    const each = rng.int(2, Math.max(2, maxEach));
    const total = people * each;
    const item = rng.pick(SHARE_ITEMS);
    const picture = total <= 20 ? ` ${emojiRow(item.emoji, total)}` : "";
    return {
      question: `Share ${total} ${item.name} equally among ${people} friends.${picture} How many does each friend get?`,
      answer: each,
      wrong: [total - people, each + 1, each - 1, people, total],
      hint: `Give one to each friend at a time until they are all gone.`,
      explanation: `${total} shared into ${people} equal groups is ${each} each (${total} ÷ ${people} = ${each}).`,
      difficulty: total > 20 ? "medium" : "easy",
    };
  },
};

const grouping: Family = {
  skill: "division",
  label: "Grouping",
  make(rng, [maxGroups = 5]) {
    const size = rng.int(2, 6);
    const groups = rng.int(2, Math.max(2, maxGroups));
    const total = size * groups;
    const [p] = twoNames(rng);
    return {
      question: `${p} has ${total} pencils and puts ${size} pencils in each box. How many boxes does ${p} fill?`,
      answer: groups,
      wrong: [size, total - size, groups + 1, groups - 1, total],
      hint: `Make groups of ${size} and count the groups.`,
      explanation: `${total} ÷ ${size} = ${groups}, so ${groups} boxes are filled.`,
      difficulty: total > 20 ? "medium" : "easy",
    };
  },
};

const divisionFacts: Family = {
  skill: "division",
  label: "Division facts",
  make(rng, params) {
    const tables = params.filter((p) => p >= 2 && p <= 12);
    const d = rng.pick(tables.length > 0 ? tables : [2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const q = rng.int(2, 10);
    const n = d * q;
    if (rng.chance(0.4)) {
      return {
        question: `Which multiplication fact helps you work out ${n} ÷ ${d}?`,
        answer: `${d} × ${q} = ${n}`,
        wrong: [`${d} + ${q} = ${d + q}`, `${d} × ${q + 1} = ${d * (q + 1)}`, `${n} − ${d} = ${n - d}`],
        hint: `Think: ${d} times what number makes ${n}?`,
        explanation: `${d} × ${q} = ${n}, so ${n} ÷ ${d} = ${q}.`,
        difficulty: "medium",
      };
    }
    return {
      question: `${n} ÷ ${d} = ?`,
      answer: q,
      wrong: [q + 1, q - 1, n - d, d, q + 2],
      hint: `Think: ${d} × ? = ${n}.`,
      explanation: `${d} × ${q} = ${n}, so ${n} ÷ ${d} = ${q}.`,
      difficulty: d >= 6 ? "medium" : "easy",
    };
  },
};

const divisionRemainder: Family = {
  skill: "division",
  label: "Division with remainders",
  make(rng, [maxDivisor = 9, maxDividend = 100]) {
    const d = rng.int(3, Math.max(3, maxDivisor));
    const q = rng.int(2, Math.max(3, Math.floor((maxDividend - d) / d)));
    const r = rng.int(1, d - 1);
    const n = d * q + r;
    if (rng.chance(0.4)) {
      return {
        question: `${fmt(n)} children are put into teams of ${d}. How many children are left over?`,
        answer: r,
        wrong: [q, d - r, r + 1, r - 1],
        hint: `Find the biggest multiple of ${d} that is not more than ${fmt(n)}.`,
        explanation: `${d} × ${q} = ${fmt(d * q)}, and ${fmt(n)} − ${fmt(d * q)} = ${r} left over.`,
        difficulty: "medium",
      };
    }
    const show = (qq: number, rr: number) => `${fmt(qq)} R ${rr}`;
    const wrong = [
      show(q, (r + 1) % d || d - 1),
      show(q + 1, r),
      show(q - 1, r + d),
      show(q, d - r),
    ];
    return {
      question: `${fmt(n)} ÷ ${d} = ?`,
      answer: show(q, r),
      wrong,
      hint: "The remainder must always be smaller than the number you divide by.",
      explanation: `${d} × ${q} = ${fmt(d * q)}, with ${r} left over: ${fmt(n)} ÷ ${d} = ${show(q, r)}.`,
      difficulty: n > 100 ? "hard" : "medium",
    };
  },
};

const longDivision: Family = {
  skill: "division",
  label: "Dividing larger numbers",
  make(rng, [dividendDigits = 3]) {
    const d = rng.int(2, 9);
    const low = Math.ceil(10 ** (dividendDigits - 1) / d);
    const high = Math.floor((10 ** dividendDigits - 1) / d);
    let q = rng.int(low, high);
    // Sometimes a quotient with a zero inside (824 ÷ 4 = 206) — the classic slip is writing 26.
    if (rng.chance(0.3)) {
      const digits = digitsOf(q);
      if (digits.length >= 3) {
        digits[1] = 0;
        const withZero = Number(digits.join(""));
        if (withZero >= low && withZero <= high) q = withZero;
      }
    }
    const n = d * q;
    const dropZero = Number(String(q).replace(/0/g, "")) || q + 1;
    return {
      question: `${fmt(n)} ÷ ${d} = ?`,
      answer: q,
      wrong: [dropZero, q + 1, q - 1, q + 10, q * 10],
      hint: "Divide one digit at a time from the left. If a digit is too small to divide, write 0 in the answer.",
      explanation: `${d} × ${fmt(q)} = ${fmt(n)}, so ${fmt(n)} ÷ ${d} = ${fmt(q)}.`,
      difficulty: dividendDigits >= 4 ? "hard" : "medium",
    };
  },
};

/** The same family pinned to one variant, so its answers count towards the right skill. */
function variantOf(family: Family, skill: string, label: string, fixed: Record<number, number>): Family {
  return {
    skill,
    label,
    make(rng, params) {
      const p = params.slice();
      for (const [index, value] of Object.entries(fixed)) p[Number(index)] = value;
      return family.make(rng, p);
    },
  };
}

export const OPERATION_FAMILIES: Record<string, Family> = {
  addition,
  "add-three": addThree,
  subtraction,
  "number-bonds": variantOf(numberBonds, "addition", "Number bonds", { 1: 0 }),
  "number-bonds-sub": variantOf(numberBonds, "subtraction", "Number bonds", { 1: 1 }),
  "mental-math": variantOf(mentalMath, "addition", "Mental maths", { 1: 0 }),
  "mental-math-sub": variantOf(mentalMath, "subtraction", "Mental maths", { 1: 1 }),
  "fact-families": variantOf(factFamilies, "subtraction", "Fact families", { 1: 0 }),
  "fact-families-times": variantOf(factFamilies, "division", "Multiplication and division facts", { 1: 1 }),
  "word-addition": wordAddition,
  "word-subtraction": wordSubtraction,
  "word-multiplication": wordMultiplication,
  "word-division": wordDivision,
  "repeated-addition": repeatedAddition,
  "equal-groups": equalGroups,
  arrays,
  "times-tables": timesTables,
  "multiply-multi": multiplyMulti,
  sharing,
  grouping,
  "division-facts": divisionFacts,
  "division-remainder": divisionRemainder,
  "long-division": longDivision,
};
