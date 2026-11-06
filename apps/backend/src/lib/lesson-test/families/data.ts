/**
 * Data handling: pictographs, tables and bar graphs, reading scales, pie
 * charts, line graphs, collecting data, and (Grade 7) averages and probability.
 *
 * The data is written into the question as text ("cats 7, dogs 12…"), so it
 * reads the same in the test, the review and the mistakes list.
 */
import { fraction, gcd, twoNames, unit, type Family, type Rng } from "@/lib/lesson-test/core";

const CATEGORY_SETS = [
  { title: "favourite fruits", items: ["apples", "bananas", "grapes", "mangoes"] },
  { title: "favourite pets", items: ["cats", "dogs", "fish", "rabbits"] },
  { title: "favourite sports", items: ["football", "swimming", "badminton", "basketball"] },
  { title: "favourite colours", items: ["red", "blue", "green", "yellow"] },
];

/** Four categories with different values, so "most" and "least" have one answer. */
function dataset(rng: Rng, low: number, high: number, step = 1) {
  const set = rng.pick(CATEGORY_SETS);
  const values = rng.sample(
    Array.from({ length: Math.floor((high - low) / step) + 1 }, (_, i) => low + i * step),
    4
  );
  return { title: set.title, items: set.items, values };
}

/** Questions every chart shares once its values are known. */
function readValues(
  rng: Rng,
  intro: string,
  items: string[],
  values: number[],
  difficulty: "easy" | "medium" | "hard"
) {
  const variant = rng.int(0, 3);
  const i = rng.int(0, 3);
  let j = rng.int(0, 3);
  if (j === i) j = (i + 1) % 4;

  if (variant === 0) {
    const most = rng.chance(0.5);
    const target = values.indexOf(most ? Math.max(...values) : Math.min(...values));
    return {
      question: `${intro} Which was chosen the ${most ? "most" : "least"}?`,
      answer: items[target],
      wrong: items.filter((_, k) => k !== target),
      hint: `Find the ${most ? "biggest" : "smallest"} number.`,
      explanation: `${items[target]} has the ${most ? "biggest" : "smallest"} value: ${values[target]}.`,
      difficulty,
    };
  }
  if (variant === 1) {
    const [big, small] = values[i] > values[j] ? [i, j] : [j, i];
    const diff = values[big] - values[small];
    return {
      question: `${intro} How many more chose ${items[big]} than ${items[small]}?`,
      answer: diff,
      wrong: [values[big] + values[small], values[big], diff + 1, diff - 1],
      hint: "Find both numbers, then subtract the smaller from the bigger.",
      explanation: `${values[big]} − ${values[small]} = ${diff}.`,
      difficulty,
    };
  }
  if (variant === 2) {
    const total = values.reduce((s, v) => s + v, 0);
    return {
      question: `${intro} How many were asked altogether?`,
      answer: total,
      wrong: [total - values[0], total + values[1], total + 10, total - 10],
      hint: "Add all the numbers together.",
      explanation: `${values.join(" + ")} = ${total}.`,
      difficulty,
    };
  }
  return {
    question: `${intro} How many chose ${items[i]} or ${items[j]}?`,
    answer: values[i] + values[j],
    wrong: [Math.abs(values[i] - values[j]), values[i], values[j], values[i] + values[j] + 1],
    hint: `Add the numbers for ${items[i]} and ${items[j]}.`,
    explanation: `${values[i]} + ${values[j]} = ${values[i] + values[j]}.`,
    difficulty,
  };
}

const data: Family = {
  skill: "data-handling",
  label: "Data handling",
  make(rng, [mode = 0]) {
    const m = mode || rng.pick([2, 3, 6]);

    if (m === 1) {
      const key = rng.pick([1, 2, 5, 10]);
      const { title, items } = dataset(rng, 1, 6);
      const symbols = rng.sample([1, 2, 3, 4, 5, 6], 4);
      const values = symbols.map((s) => s * key);
      const rows = items.map((item, k) => `${item} ${"⭐".repeat(symbols[k])}`).join(", ");
      const intro = `A pictograph shows pupils' ${title}. Each ⭐ stands for ${key} pupil${key > 1 ? "s" : ""}: ${rows}.`;
      if (key > 1 && rng.chance(0.4)) {
        const k = rng.int(0, 3);
        return {
          question: `${intro} How many pupils chose ${items[k]}?`,
          answer: values[k],
          wrong: [symbols[k], values[k] + key, values[k] - key, symbols[k] + key],
          hint: `Count the stars, then multiply by ${key}.`,
          explanation: `${symbols[k]} stars × ${key} = ${values[k]} pupils.`,
          difficulty: "medium",
        };
      }
      return readValues(rng, intro, items, values, key > 1 ? "medium" : "easy");
    }

    if (m === 3) {
      const step = rng.pick([2, 4, 10, 20, 50, 100]);
      const a = step * rng.int(1, 8);
      if (rng.chance(0.5)) {
        return {
          question: `On a bar graph, the scale goes up in ${step}s (0, ${step}, ${2 * step}, …). A bar ends exactly halfway between ${a} and ${a + step}. What value does the bar show?`,
          answer: a + step / 2,
          wrong: [a, a + step, a + 1, a + step / 2 + step],
          hint: `Halfway between two marks is half of ${step} more than the lower mark.`,
          explanation: `Half of ${step} is ${step / 2}, and ${a} + ${step / 2} = ${a + step / 2}.`,
          difficulty: "medium",
        };
      }
      const n = rng.int(3, 9);
      return {
        question: `A scale goes up in ${step}s from 0. A bar stops at the ${n}th mark above 0. What value does it show?`,
        answer: n * step,
        wrong: [n, (n + 1) * step, (n - 1) * step, n + step],
        hint: `Count up the marks in ${step}s.`,
        explanation: `${n} × ${step} = ${n * step}.`,
        difficulty: "easy",
      };
    }

    if (m === 4) {
      const total = rng.pick([20, 40, 60, 80, 100, 120]);
      const split = rng.pick([
        { parts: ["half", "a quarter", "a quarter"], shares: [1 / 2, 1 / 4, 1 / 4] },
        { parts: ["a quarter", "half", "a quarter"], shares: [1 / 4, 1 / 2, 1 / 4] },
        { parts: ["three quarters", "an eighth", "an eighth"], shares: [3 / 4, 1 / 8, 1 / 8] },
      ]);
      const ways = ["walk", "come by bus", "come by car"];
      const sharesOK = split.shares.every((s) => Number.isInteger(s * total));
      const t = sharesOK ? total : 80;
      const intro = `A pie chart shows how ${t} pupils travel to school: ${split.parts[0]} ${ways[0]}, ${split.parts[1]} ${ways[1]} and ${split.parts[2]} ${ways[2]}.`;
      const k = rng.int(0, 2);
      if (rng.chance(0.6)) {
        const answer = split.shares[k] * t;
        return {
          question: `${intro} How many pupils ${ways[k]}?`,
          answer,
          wrong: [t - answer, answer * 2, answer / 2, t / 3],
          hint: `Find ${split.parts[k]} of ${t}.`,
          explanation: `${split.parts[k].replace(/^./, (c) => c.toUpperCase())} of ${t} is ${answer}.`,
          difficulty: "medium",
        };
      }
      const biggest = split.shares.indexOf(Math.max(...split.shares));
      return {
        question: `${intro} Which way of travelling has the biggest slice of the pie chart?`,
        answer: ways[biggest].replace("come ", ""),
        wrong: ways.filter((_, i) => i !== biggest).map((w) => w.replace("come ", "")),
        hint: "The biggest fraction gets the biggest slice.",
        explanation: `${split.parts[biggest].replace(/^./, (c) => c.toUpperCase())} of the pupils ${ways[biggest]}, the biggest share.`,
        difficulty: "easy",
      };
    }

    if (m === 5) {
      const start = rng.int(2, 8);
      const growth = [0, ...rng.sample([2, 3, 4, 5, 6, 7], 4)];
      const heights = growth.reduce<number[]>((acc, g, i) => [...acc, i === 0 ? start : acc[i - 1] + g], []);
      const listed = heights.map((h, i) => `week ${i + 1}: ${h} cm`).join(", ");
      const intro = `A line graph shows a plant's height each week — ${listed}.`;
      if (rng.chance(0.5)) {
        const i = rng.int(0, 2);
        const j = rng.int(i + 1, 4);
        const diff = heights[j] - heights[i];
        return {
          question: `${intro} By how much did the plant grow from week ${i + 1} to week ${j + 1}?`,
          answer: diff,
          wrong: [heights[j], heights[i] + heights[j], diff + 1, diff - 1],
          hint: "Read both heights, then subtract.",
          explanation: `${heights[j]} − ${heights[i]} = ${diff} cm.`,
          difficulty: "medium",
          format: unit(" cm"),
        };
      }
      const steps = heights.slice(1).map((h, i) => h - heights[i]);
      const most = steps.indexOf(Math.max(...steps));
      const between = (i: number) => `between week ${i + 1} and week ${i + 2}`;
      return {
        question: `${intro} When did the plant grow the most?`,
        answer: between(most),
        wrong: steps.map((_, i) => i).filter((i) => i !== most).map(between),
        hint: "Find where the line is steepest — the biggest jump between two weeks.",
        explanation: `It grew ${steps[most]} cm ${between(most)}, the biggest jump.`,
        difficulty: "medium",
      };
    }

    if (m === 6) {
      const set = rng.pick(CATEGORY_SETS);
      const counts = rng.sample([1, 2, 3, 4, 5], 4);
      const list = rng.shuffle(set.items.flatMap((item, k) => Array.from({ length: counts[k] }, () => item)));
      const [p] = twoNames(rng);
      const intro = `${p} asked some friends about their ${set.title} and wrote: ${list.join(", ")}.`;
      const variant = rng.int(0, 2);
      if (variant === 0) {
        const k = rng.int(0, 3);
        return {
          question: `${intro} How many friends chose ${set.items[k]}?`,
          answer: counts[k],
          wrong: [counts[k] + 1, counts[k] - 1, list.length, counts[(k + 1) % 4]],
          hint: `Make a tally: one mark each time you read “${set.items[k]}”.`,
          explanation: `“${set.items[k]}” appears ${counts[k]} times.`,
          difficulty: "easy",
        };
      }
      if (variant === 1) {
        const top = counts.indexOf(Math.max(...counts));
        return {
          question: `${intro} Which was the most popular?`,
          answer: set.items[top],
          wrong: set.items.filter((_, k) => k !== top),
          hint: "Tally each answer, then find the biggest tally.",
          explanation: `“${set.items[top]}” was chosen ${counts[top]} times, the most.`,
          difficulty: "medium",
        };
      }
      return {
        question: `${intro} How many friends did ${p} ask?`,
        answer: list.length,
        wrong: [list.length - 1, list.length + 1, 4, list.length + 2],
        hint: "Every word in the list is one friend's answer.",
        explanation: `There are ${list.length} answers, so ${p} asked ${list.length} friends.`,
        difficulty: "easy",
      };
    }

    // Tables and bar graphs.
    const { title, items, values } = dataset(rng, 3, 25);
    const chart = rng.pick(["A bar graph", "A table"]);
    const intro = `${chart} shows pupils' ${title}: ${items.map((it, k) => `${it} ${values[k]}`).join(", ")}.`;
    return readValues(rng, intro, items, values, "easy");
  },
};

const statistics: Family = {
  skill: "data-handling",
  label: "Averages",
  make(rng) {
    const variant = rng.int(0, 3);
    if (variant === 0) {
      // Each offset set sums to 0, so the mean is a whole number; from 6 keeps every value positive.
      const mean = rng.int(6, 15);
      const offsets = rng.pick([[-3, -1, 0, 1, 3], [-4, -2, 1, 2, 3], [-5, 0, 1, 2, 2], [-2, -2, 0, 1, 3]]);
      const nums = rng.shuffle(offsets.map((o) => mean + o));
      const sorted = nums.slice().sort((a, b) => a - b);
      return {
        question: `Find the mean of ${nums.join(", ")}.`,
        answer: mean,
        wrong: [sorted[2], sorted[4] - sorted[0], nums.reduce((s, v) => s + v, 0), mean + 1],
        hint: "Add all the numbers, then divide by how many there are.",
        explanation: `${nums.join(" + ")} = ${mean * 5}, and ${mean * 5} ÷ 5 = ${mean}.`,
        difficulty: "medium",
      };
    }
    const nums = Array.from({ length: 7 }, () => rng.int(1, 20));
    if (variant === 1) {
      const sorted = nums.slice().sort((a, b) => a - b);
      return {
        question: `Find the median of ${nums.join(", ")}.`,
        answer: sorted[3],
        wrong: [nums[3], Math.round(nums.reduce((s, v) => s + v, 0) / 7), sorted[6] - sorted[0], sorted[2], sorted[4]],
        hint: "Put the numbers in order first, then find the middle one.",
        explanation: `In order: ${sorted.join(", ")}. The middle number is ${sorted[3]}.`,
        difficulty: "medium",
      };
    }
    if (variant === 2) {
      const mode = rng.int(2, 15);
      const others = rng.sample(Array.from({ length: 20 }, (_, i) => i + 1).filter((x) => x !== mode), 4);
      const list = rng.shuffle([mode, mode, mode, ...others]);
      return {
        question: `Find the mode of ${list.join(", ")}.`,
        answer: mode,
        wrong: [...others, Math.max(...list) - Math.min(...list)],
        hint: "The mode is the number that appears most often.",
        explanation: `${mode} appears 3 times, more than any other number.`,
        difficulty: "easy",
      };
    }
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    return {
      question: `Find the range of ${nums.join(", ")}.`,
      answer: max - min,
      wrong: [max, min, max + min, max - min + 1],
      hint: "Range = biggest number − smallest number.",
      explanation: `${max} − ${min} = ${max - min}.`,
      difficulty: "easy",
    };
  },
};

const probability: Family = {
  skill: "probability",
  label: "Probability",
  make(rng) {
    const variant = rng.int(0, 2);
    if (variant === 0) {
      const r = rng.int(1, 8);
      const b = rng.int(1, 8);
      const total = r + b;
      const g = gcd(r, total);
      const answer = fraction(r / g, total / g);
      const wrong = [fraction(r, b), fraction(b, total), fraction(1, r), fraction(r, total + 1)].filter(
        (w) => w !== answer && w !== fraction(r, total)
      );
      return {
        question: `A bag has ${r} red marble${r > 1 ? "s" : ""} and ${b} blue marble${b > 1 ? "s" : ""}. One marble is taken without looking. What is the probability that it is red? (Simplest form.)`,
        answer,
        wrong: r === b ? wrong.filter((w) => w !== fraction(b, total)) : wrong,
        hint: "Probability = number of ways it can happen ÷ total number of outcomes.",
        explanation: `${r} of the ${total} marbles are red: ${fraction(r, total)}${g > 1 ? ` = ${answer}` : ""}.`,
        difficulty: "medium",
      };
    }
    if (variant === 1) {
      const event = rng.pick([
        { text: "an even number", p: "1/2" },
        { text: "a number greater than 4", p: "1/3" },
        { text: "a 6", p: "1/6" },
        { text: "a number less than 3", p: "1/3" },
        { text: "a number from 1 to 6", p: "1" },
      ]);
      return {
        question: `A fair six-sided dice is rolled. What is the probability of rolling ${event.text}?`,
        answer: event.p,
        wrong: ["1/2", "1/3", "1/6", "2/3", "1"].filter((x) => x !== event.p),
        hint: "Count the outcomes that work, out of 6.",
        explanation: `The probability of rolling ${event.text} is ${event.p}.`,
        difficulty: "easy",
      };
    }
    const red = rng.int(3, 9);
    const scene = rng.pick([
      { text: `A bag has ${red} red balls and nothing else. Taking a red ball is…`, answer: "certain" },
      { text: `A bag has ${red} red balls and nothing else. Taking a blue ball is…`, answer: "impossible" },
      { text: `A bag has ${red + 6} red balls and 1 blue ball. Taking a red ball is…`, answer: "likely" },
      { text: `A bag has 1 red ball and ${red + 6} blue balls. Taking a red ball is…`, answer: "unlikely" },
    ]);
    return {
      question: scene.text,
      answer: scene.answer,
      wrong: ["certain", "likely", "unlikely", "impossible"].filter((x) => x !== scene.answer),
      hint: "Ask: could it happen at all? Is it more or less likely than not?",
      explanation: `It is ${scene.answer}.`,
      difficulty: "easy",
    };
  },
};

export const DATA_FAMILIES: Record<string, Family> = {
  data,
  statistics,
  probability,
};
