/**
 * Measurement: money, time, length, mass, capacity, perimeter, area, volume
 * and rate.
 *
 * Money uses Singapore coins and notes (5¢ to $1 coins, $2 to $50 notes);
 * spelling and units follow the curriculum's British style ("litres",
 * "metres"). Amounts are whole cents and minutes, so nothing is rounded.
 */
import {
  clockTime,
  decimal,
  dollars,
  duration,
  fmt,
  minutes,
  aOrAn,
  money,
  twoNames,
  unit,
  type Family,
  type Rng,
} from "@/lib/lesson-test/core";

/* ── Money ────────────────────────────────────────────────────────────────── */

const COINS = [5, 10, 20, 50, 100];
const NOTES = [200, 500, 1000];

function coinName(cents: number): string {
  return cents >= 200 ? `${money(cents).replace(".00", "")} note` : cents === 100 ? "$1 coin" : `${cents}¢ coin`;
}

const COUNT_WORDS = ["", "one", "two", "three", "four", "five"];

/** "a 50¢ coin, two 10¢ coins and a $2 note" */
function describeMoney(pieces: number[]): string {
  const counts = new Map<number, number>();
  for (const p of pieces) counts.set(p, (counts.get(p) ?? 0) + 1);
  const parts = [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([value, count]) => (count === 1 ? `a ${coinName(value)}` : `${COUNT_WORDS[count]} ${coinName(value)}s`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
}

const moneyCount: Family = {
  skill: "money",
  label: "Counting money",
  make(rng, [level = 1]) {
    const variant = rng.int(0, 2);
    if (variant === 1) {
      const [coin, whole] = rng.pick([
        [10, 100],
        [20, 100],
        [50, 100],
        [5, 50],
        [200, 1000],
        [500, 1000],
      ] as const);
      const count = whole / coin;
      return {
        question: `How many ${coinName(coin)}s make ${money(whole)}?`,
        answer: count,
        wrong: [count * 2, count + 1, count - 1, Math.round(count / 2), coin],
        hint: `Count on in ${money(coin)} steps until you reach ${money(whole)}.`,
        explanation: `${count} × ${money(coin)} = ${money(whole)}.`,
        difficulty: "easy",
      };
    }
    const pool = level >= 2 ? [...COINS, ...NOTES] : variant === 2 ? NOTES : COINS;
    const pieces = Array.from({ length: rng.int(3, 4) }, () => rng.pick(pool));
    const total = pieces.reduce((s, p) => s + p, 0);
    const step = total >= 500 ? 100 : 10;
    return {
      question: `How much money is ${describeMoney(pieces)}?`,
      answer: total,
      wrong: [total + step, total - step, total + 5, total - pieces[0], total + pieces.at(-1)!],
      hint: "Start with the biggest coin or note, then count on.",
      explanation: `${pieces.map(money).join(" + ")} = ${money(total)}.`,
      difficulty: level >= 2 ? "medium" : "easy",
      format: money,
    };
  },
};

const moneyChange: Family = {
  skill: "money",
  label: "Giving change",
  make(rng, [level = 1]) {
    const [buyer] = twoNames(rng);
    const item = rng.pick(["a pencil", "an eraser", "a ruler", "a notebook", "a drink", "a storybook"]);
    const paid = level >= 2 ? rng.pick([500, 1000]) : rng.pick([100, 200]);
    const price = rng.int(level >= 2 ? 21 : 3, Math.floor(paid / 5) - 1) * 5;
    const change = paid - price;
    // Taking the cents away without exchanging a dollar: $10 − $3.65 → $7.35.
    const noExchange = (Math.floor(paid / 100) - Math.floor(price / 100)) * 100 + ((100 - (price % 100)) % 100);
    return {
      question: `${buyer} buys ${item} for ${money(price)} and pays with a ${coinName(paid)}. How much change does ${buyer} get?`,
      answer: change,
      wrong: [noExchange, change + 10, change - 10, change + 100, price],
      hint: `Count up from ${money(price)} to ${money(paid)}.`,
      explanation: `${money(paid)} − ${money(price)} = ${money(change)}.`,
      difficulty: level >= 2 ? "medium" : "easy",
      format: money,
    };
  },
};

const moneyNotation: Family = {
  skill: "money",
  label: "Dollars and cents",
  make(rng) {
    const d = rng.int(1, 19);
    const c = rng.chance(0.3) ? rng.int(1, 9) : rng.int(11, 99);
    const cc = String(c).padStart(2, "0");
    const variant = rng.int(0, 2);
    if (variant === 0) {
      return {
        question: `Write ${d} dollar${d > 1 ? "s" : ""} and ${c} cent${c > 1 ? "s" : ""} using a dollar sign.`,
        answer: `$${d}.${cc}`,
        wrong: [`$${d}${cc}`, `$${d}.${c}0`, `$0.${d}${cc}`, `$${c}.${String(d).padStart(2, "0")}`],
        hint: "Dollars go before the decimal point; cents always take two places after it.",
        explanation: `${d} dollars and ${c} cents is $${d}.${cc}.`,
        difficulty: c < 10 ? "medium" : "easy",
      };
    }
    const cents = d * 100 + c;
    if (variant === 1) {
      return {
        question: `How many cents are there in $${d}.${cc}?`,
        answer: cents,
        wrong: [Number(`${d}${c}`), d * 100 + c * 10, d + c, cents * 10],
        hint: "Each dollar is 100 cents.",
        explanation: `$${d} = ${d * 100}¢, and ${d * 100}¢ + ${c}¢ = ${fmt(cents)}¢.`,
        difficulty: "medium",
        format: unit("¢"),
      };
    }
    return {
      question: `Write ${fmt(cents)}¢ in dollars.`,
      answer: dollars(cents),
      wrong: [dollars(cents * 10), dollars(Math.floor(cents / 10)), `$${fmt(cents)}.00`, dollars(d * 100 + Math.floor(c / 10))],
      hint: "100 cents make $1. Put the decimal point two places from the right.",
      explanation: `${fmt(cents)}¢ = ${dollars(cents)}.`,
      difficulty: "medium",
    };
  },
};

const moneyAddSub: Family = {
  skill: "money",
  label: "Adding and subtracting money",
  make(rng) {
    const subtract = rng.chance(0.5);
    const [p] = twoNames(rng);
    if (subtract) {
      const a = rng.pick([1000, 2000, rng.int(30, 199) * 5]);
      const b = rng.int(21, Math.floor(a / 5) - 4) * 5;
      const diff = a - b;
      // Taking the smaller number of cents from the larger instead of exchanging a dollar.
      const naive = (Math.floor(a / 100) - Math.floor(b / 100)) * 100 + Math.abs((a % 100) - (b % 100));
      return {
        question: rng.chance(0.5)
          ? `${dollars(a)} − ${dollars(b)} = ?`
          : `${p} has ${dollars(a)} and spends ${dollars(b)} on a book. How much money does ${p} have left?`,
        answer: diff,
        wrong: [naive, diff + 10, diff - 10, diff + 100, diff - 100],
        hint: "Line up the decimal points. Exchange $1 for 100¢ when there are not enough cents.",
        explanation: `${dollars(a)} − ${dollars(b)} = ${dollars(diff)}.`,
        difficulty: "medium",
        format: dollars,
      };
    }
    const a = rng.int(21, 199) * 5;
    const b = rng.int(21, 199) * 5;
    const sum = a + b;
    // Adding the cents without carrying the extra dollar.
    const noCarry = (Math.floor(a / 100) + Math.floor(b / 100)) * 100 + (((a % 100) + (b % 100)) % 100);
    return {
      question: rng.chance(0.5)
        ? `${dollars(a)} + ${dollars(b)} = ?`
        : `A book costs ${dollars(a)} and a pen costs ${dollars(b)}. How much do they cost altogether?`,
      answer: sum,
      wrong: [noCarry, sum + 10, sum - 10, sum + 100, sum - 100],
      hint: "Line up the decimal points and add the cents first. 100¢ makes $1.",
      explanation: `${dollars(a)} + ${dollars(b)} = ${dollars(sum)}.`,
      difficulty: "medium",
      format: dollars,
    };
  },
};

/* ── Time ─────────────────────────────────────────────────────────────────── */

const oClockEmoji = (h: number) => String.fromCodePoint(0x1f550 + h - 1);
const halfPastEmoji = (h: number) => String.fromCodePoint(0x1f55c + h - 1);

const clockHourHalf: Family = {
  skill: "time",
  label: "Telling the time",
  make(rng) {
    const h = rng.int(1, 12);
    const next = (h % 12) + 1;
    const prev = ((h + 10) % 12) + 1;
    const oClock = (x: number) => `${x} o'clock`;
    const halfPast = (x: number) => `half past ${x}`;
    const variant = rng.int(0, 4);
    const half = rng.chance(0.5);
    const answer = half ? halfPast(h) : oClock(h);
    const wrong = half
      ? [halfPast(next), oClock(h), oClock(next), halfPast(prev), "6 o'clock"]
      : [halfPast(h), oClock(next), oClock(prev), "12 o'clock"];

    if (variant === 0) {
      return {
        question: half
          ? `The minute hand points to 6 and the hour hand is halfway between ${h} and ${next}. What time is it?`
          : `The minute hand points to 12 and the hour hand points to ${h}. What time is it?`,
        answer,
        wrong,
        hint: "The minute hand at 12 means o'clock. At 6 it means half past.",
        explanation: `It is ${answer}.`,
        difficulty: half ? "medium" : "easy",
      };
    }
    if (variant === 1) {
      return {
        question: `What time does this clock show? ${half ? halfPastEmoji(h) : oClockEmoji(h)}`,
        answer,
        wrong,
        hint: "Look at the long minute hand first, then the short hour hand.",
        explanation: `The clock shows ${answer}.`,
        difficulty: half ? "medium" : "easy",
      };
    }
    if (variant === 2) {
      const halfHour = rng.chance(0.5);
      return {
        question: `What time is it ${halfHour ? "half an hour" : "one hour"} after ${oClock(h)}?`,
        answer: halfHour ? halfPast(h) : oClock(next),
        wrong: halfHour ? [halfPast(next), oClock(next), halfPast(prev)] : [oClock(prev), halfPast(h), oClock(next % 12 + 1)],
        hint: halfHour ? "Half an hour moves the minute hand from 12 to 6." : "One hour moves the hour hand on by one number.",
        explanation: halfHour ? `Half an hour after ${oClock(h)} is ${halfPast(h)}.` : `One hour after ${oClock(h)} is ${oClock(next)}.`,
        difficulty: "medium",
      };
    }
    if (variant === 3) {
      return {
        question: `At ${half ? halfPast(h) : oClock(h)}, which number does the minute hand point to?`,
        answer: half ? "6" : "12",
        wrong: [half ? "12" : "6", "3", String(h === 3 || h === 6 || h === 12 ? 9 : h)],
        hint: "The minute hand is the long hand.",
        explanation: `At ${half ? "half past" : "o'clock"}, the minute hand points to ${half ? 6 : 12}.`,
        difficulty: "easy",
      };
    }
    const event = rng.pick(["School starts", "Lunch is", "The bus comes", "The library opens"]);
    return {
      question: `${event} at ${answer}. Which clock shows that time?`,
      answer: half ? halfPastEmoji(h) : oClockEmoji(h),
      wrong: half
        ? [oClockEmoji(h), halfPastEmoji(next), oClockEmoji(next)]
        : [halfPastEmoji(h), oClockEmoji(next), oClockEmoji(prev)],
      hint: half ? "At half past, the hour hand is between two numbers." : "At o'clock, the minute hand points straight up.",
      explanation: `${answer} is shown by ${half ? halfPastEmoji(h) : oClockEmoji(h)}.`,
      difficulty: "medium",
    };
  },
};

const clockMinutes: Family = {
  skill: "time",
  label: "Hours and minutes",
  make(rng) {
    const variant = rng.int(0, 4);
    if (variant === 0) {
      const h = rng.int(2, 5);
      return {
        question: `How many minutes are there in ${h} hours?`,
        answer: 60 * h,
        wrong: [100 * h, 60 + h, 60 * h + 60, 30 * h],
        hint: "1 hour = 60 minutes.",
        explanation: `${h} × 60 = ${60 * h} minutes.`,
        difficulty: "easy",
        format: minutes,
      };
    }
    if (variant === 1) {
      const k = rng.int(1, 11);
      return {
        question: `The minute hand points to ${k}. How many minutes past the hour is it?`,
        answer: 5 * k,
        wrong: [k, 5 * k + 5, 5 * k - 5, 60 - 5 * k],
        hint: "Each number on the clock is 5 more minutes. Count in fives from 12.",
        explanation: `${k} × 5 = ${5 * k} minutes past.`,
        difficulty: "easy",
        format: minutes,
      };
    }
    if (variant === 2) {
      const h = rng.int(1, 4);
      const m = rng.int(5, 55);
      return {
        question: `${h} h ${m} min = ___ minutes`,
        answer: 60 * h + m,
        wrong: [100 * h + m, 10 * h + m, 60 * h + m + 60, 60 * h - m],
        hint: "Change the hours to minutes first, then add the extra minutes.",
        explanation: `${h} × 60 = ${60 * h}, and ${60 * h} + ${m} = ${60 * h + m} minutes.`,
        difficulty: "medium",
      };
    }
    if (variant === 3) {
      const start = rng.int(8 * 12, 17 * 12) * 5;
      const add = rng.int(2, 11) * 5;
      const end = start + add;
      return {
        question: `What time is it ${add} minutes after ${clockTime(start)}?`,
        answer: clockTime(end),
        wrong: [clockTime(end + 10), clockTime(end - 10), clockTime(end - 60), clockTime(end + 60)],
        hint: "Count on in fives. Remember 60 minutes makes a new hour.",
        explanation: `${clockTime(start)} + ${add} minutes = ${clockTime(end)}.`,
        difficulty: Math.floor(start / 60) !== Math.floor(end / 60) ? "medium" : "easy",
      };
    }
    // From 100 minutes, so reading the digits as "1 h 25 min" is a real slip.
    const n = rng.int(20, 38) * 5;
    const decimalSlip = `${Math.floor(n / 100)} h ${n % 100} min`;
    return {
      question: `Write ${n} minutes in hours and minutes.`,
      answer: duration(n),
      wrong: [decimalSlip, duration(n + 10), duration(n - 10), duration(n + 60)],
      hint: "Take away 60 minutes for each hour.",
      explanation: `${n} minutes = ${duration(n)}.`,
      difficulty: "medium",
    };
  },
};

/** hh:mm read as a plain number — the slip behind "4:20 − 2:45 = 1:75". */
function asDigits(minutes: number): number {
  return Math.floor(minutes / 60) * 100 + (minutes % 60);
}

const elapsedTime: Family = {
  skill: "time",
  label: "Elapsed time",
  make(rng) {
    const start = rng.int(8 * 12, 17 * 12) * 5;
    const variant = rng.int(0, 2);
    if (variant === 1) {
      const dur = rng.int(5, 30) * 5;
      const end = start + dur;
      const event = rng.pick(["A lesson", "A swimming class", "A concert", "A football match"]);
      return {
        question: `${event} starts at ${clockTime(start)} and lasts ${duration(dur)}. What time does it end?`,
        answer: clockTime(end),
        wrong: [clockTime(end + 10), clockTime(end - 10), clockTime(end - 60), clockTime(end + 60)],
        hint: "Add the hours first, then the minutes. 60 minutes make 1 hour.",
        explanation: `${clockTime(start)} + ${duration(dur)} = ${clockTime(end)}.`,
        difficulty: "medium",
      };
    }
    const dur = variant === 2 ? rng.int(5, 23) * 5 : rng.int(7, 36) * 5;
    const end = start + dur;
    const slip = asDigits(end) - asDigits(start);
    if (variant === 2) {
      return {
        question: `How many minutes is it from ${clockTime(start)} to ${clockTime(end)}?`,
        answer: dur,
        wrong: [slip, dur + 10, dur - 10, dur + 60],
        hint: `Count on to the next o'clock first, then to ${clockTime(end)}.`,
        explanation: `From ${clockTime(start)} to ${clockTime(end)} is ${dur} minutes.`,
        difficulty: "medium",
        format: minutes,
      };
    }
    return {
      question: `A film starts at ${clockTime(start)} and ends at ${clockTime(end)}. How long is the film?`,
      answer: duration(dur),
      // The digit slip is only wrong when the times cross an hour.
      wrong: [
        ...(slip !== asDigits(dur) ? [`${Math.floor(slip / 100)} h ${slip % 100} min`] : []),
        duration(dur + 10),
        duration(Math.max(5, dur - 10)),
        duration(dur + 60),
      ],
      hint: "Count on in hours first, then count the minutes that are left.",
      explanation: `From ${clockTime(start)} to ${clockTime(end)} is ${duration(dur)}.`,
      difficulty: dur > 60 ? "hard" : "medium",
    };
  },
};

const PLACES = ["Library", "Park", "School", "Market", "Museum", "Stadium"];

const timetable: Family = {
  skill: "time",
  label: "Timetables",
  make(rng) {
    const stops = rng.sample(PLACES, 4);
    const times: number[] = [rng.int(7 * 12, 9 * 12) * 5];
    for (let i = 1; i < 4; i++) times.push(times[i - 1] + rng.int(2, 6) * 5);
    const table = stops.map((s, i) => `${s} ${clockTime(times[i])}`).join(", ");
    const variant = rng.int(0, 3);

    if (variant === 0) {
      const [i, j] = rng.pick([[0, 2], [1, 3], [0, 3], [1, 2]]);
      const diff = times[j] - times[i];
      return {
        question: `A bus timetable reads: ${table}. How long does the bus take from ${stops[i]} to ${stops[j]}?`,
        answer: diff,
        wrong: [diff + 5, diff - 5, diff + 10, times[j] - times[0] === diff ? times[3] - times[0] : times[j] - times[0]],
        hint: `Find the time at ${stops[i]} and at ${stops[j]}, then count on.`,
        explanation: `${clockTime(times[i])} to ${clockTime(times[j])} is ${diff} minutes.`,
        difficulty: "medium",
        format: minutes,
      };
    }
    if (variant === 1) {
      const i = rng.int(0, 3);
      return {
        question: `A bus timetable reads: ${table}. Where is the bus at ${clockTime(times[i])}?`,
        answer: stops[i],
        wrong: stops.filter((_, k) => k !== i),
        hint: "Find the time in the timetable and read the stop next to it.",
        explanation: `At ${clockTime(times[i])} the bus is at ${stops[i]}.`,
        difficulty: "easy",
      };
    }
    if (variant === 2) {
      const i = rng.int(1, 3);
      const wait = rng.int(2, 15);
      const [p] = twoNames(rng);
      return {
        question: `A bus timetable reads: ${table}. ${p} arrives at the ${stops[i]} stop at ${clockTime(times[i] - wait)}. How long does ${p} wait for the bus?`,
        answer: wait,
        wrong: [wait + 10, wait + 5, Math.max(1, wait - 1), 60 - wait],
        hint: `Count on from ${clockTime(times[i] - wait)} to ${clockTime(times[i])}.`,
        explanation: `From ${clockTime(times[i] - wait)} to ${clockTime(times[i])} is ${wait} minutes.`,
        difficulty: "easy",
        format: minutes,
      };
    }
    const late = rng.pick([10, 15, 20, 25]);
    const i = rng.int(1, 3);
    return {
      question: `A bus timetable reads: ${table}. Today the bus is ${late} minutes late at every stop. When does it reach ${stops[i]}?`,
      answer: clockTime(times[i] + late),
      wrong: [clockTime(times[i]), clockTime(times[i] - late), clockTime(times[i] + late + 10), clockTime(times[i - 1] + late)],
      hint: `Add ${late} minutes to the time in the timetable.`,
      explanation: `${clockTime(times[i])} + ${late} minutes = ${clockTime(times[i] + late)}.`,
      difficulty: "medium",
    };
  },
};

/* ── Length, mass and capacity ────────────────────────────────────────────── */

const OBJECTS = ["pencil", "crayon", "book", "spoon", "ribbon", "straw", "shoe", "paintbrush"];

const nonStandardUnits: Family = {
  skill: "measurement",
  label: "Measuring with units",
  make(rng) {
    const measure = rng.pick(["paper clips", "cubes", "matchsticks"]);
    const variant = rng.int(0, 2);
    if (variant === 0) {
      const [o1, o2] = rng.sample(OBJECTS, 2);
      const a = rng.int(5, 12);
      const b = rng.int(2, a - 1);
      return {
        question: `A ${o1} is ${a} ${measure} long. A ${o2} is ${b} ${measure} long. How much longer is the ${o1}?`,
        answer: a - b,
        wrong: [a + b, a, b, a - b + 1],
        hint: "Take the shorter length away from the longer length.",
        explanation: `${a} − ${b} = ${a - b} ${measure}.`,
        difficulty: "easy",
        format: unit(` ${measure}`),
      };
    }
    if (variant === 1) {
      const items = rng.sample(OBJECTS, 3);
      const lengths = rng.sample([3, 4, 5, 6, 7, 8, 9, 10, 11], 3);
      const longest = rng.chance(0.5);
      const target = longest ? lengths.indexOf(Math.max(...lengths)) : lengths.indexOf(Math.min(...lengths));
      return {
        question: `The ${items[0]} is ${lengths[0]} ${measure} long, the ${items[1]} is ${lengths[1]} ${measure} long and the ${items[2]} is ${lengths[2]} ${measure} long. Which is the ${longest ? "longest" : "shortest"}?`,
        answer: `the ${items[target]}`,
        wrong: items.filter((_, i) => i !== target).map((x) => `the ${x}`),
        hint: `Compare the numbers: ${longest ? "more" : "fewer"} ${measure} means ${longest ? "longer" : "shorter"}.`,
        explanation: `The ${items[target]} is ${lengths[target]} ${measure}, the ${longest ? "most" : "fewest"} of the three.`,
        difficulty: "easy",
      };
    }
    const [p, q] = twoNames(rng);
    const a = rng.int(6, 9);
    return {
      question: `${p} measures a table and gets ${a} hand spans. ${q} measures the same table and gets ${a + 2} hand spans. Why are the answers different?`,
      answer: `${p}'s and ${q}'s hand spans are not the same size`,
      wrong: ["The table changed size", "They measured different tables", "Hand spans always give the same answer"],
      hint: "Think about the unit each person used.",
      explanation: "Hand spans are different sizes for different people, which is why we also use rulers.",
      difficulty: "medium",
    };
  },
};

const LONGER_PAIRS: [string, string][] = [
  ["a bus", "a bicycle"],
  ["a ruler", "a paper clip"],
  ["a train", "a car"],
  ["a skipping rope", "a shoelace"],
  ["a door", "a book"],
];

const compareLength: Family = {
  skill: "measurement",
  label: "Longer and shorter",
  make(rng) {
    const variant = rng.int(0, 3);
    if (variant === 0) {
      const [long, short] = rng.pick(LONGER_PAIRS);
      const askLonger = rng.chance(0.5);
      return {
        question: `Which is usually ${askLonger ? "longer" : "shorter"}: ${long} or ${short}?`,
        answer: askLonger ? long : short,
        wrong: [askLonger ? short : long, "They are the same length"],
        hint: "Picture the two things side by side.",
        explanation: `${askLonger ? long : short} is ${askLonger ? "longer" : "shorter"} than ${askLonger ? short : long}.`.replace(/^./, (c) => c.toUpperCase()),
        difficulty: "easy",
      };
    }
    if (variant === 1) {
      const a = rng.int(5, 30);
      let b = rng.int(5, 30);
      if (b === a) b = a + 3;
      return {
        question: `Which is longer: a ribbon ${a} cm long or a ribbon ${b} cm long?`,
        answer: `The ${Math.max(a, b)} cm ribbon`,
        wrong: [`The ${Math.min(a, b)} cm ribbon`, "They are the same length"],
        hint: "The bigger number of centimetres is the longer ribbon.",
        explanation: `${Math.max(a, b)} cm is longer than ${Math.min(a, b)} cm.`,
        difficulty: "easy",
      };
    }
    if (variant === 2) {
      const items = rng.sample(OBJECTS, 4);
      const lengths = rng.sample([6, 8, 9, 11, 12, 14, 15, 17, 18, 20], 4);
      const shortest = rng.chance(0.5);
      const target = shortest ? lengths.indexOf(Math.min(...lengths)) : lengths.indexOf(Math.max(...lengths));
      const listed = items.map((x, i) => `${x} ${lengths[i]} cm`).join(", ");
      return {
        question: `These things were measured: ${listed}. Which is the ${shortest ? "shortest" : "longest"}?`,
        answer: `the ${items[target]}`,
        wrong: items.filter((_, i) => i !== target).map((x) => `the ${x}`),
        hint: `Find the ${shortest ? "smallest" : "biggest"} number of centimetres.`,
        explanation: `The ${items[target]} (${lengths[target]} cm) is the ${shortest ? "shortest" : "longest"}.`,
        difficulty: "easy",
      };
    }
    const a = rng.int(12, 40);
    const b = rng.int(4, a - 2);
    return {
      question: `A red rope is ${a} cm long. A blue rope is ${b} cm long. How much shorter is the blue rope?`,
      answer: a - b,
      wrong: [a + b, a, b, a - b + 10],
      hint: "Find the difference: subtract the shorter length from the longer one.",
      explanation: `${a} − ${b} = ${a - b} cm.`,
      difficulty: "medium",
      format: unit(" cm"),
    };
  },
};

interface UnitSystem {
  small: string;
  big: string;
  smallName: string;
  bigName: string;
  /** small units in one big unit */
  ratio: number;
  /** Shown in brackets after the unit name; defaults to `big`. */
  bigSymbol?: string;
  /** "the length of", "the mass of"… */
  quantity: string;
  smallThings: string[];
  bigThings: string[];
  otherUnits: string[];
}

const LENGTH: UnitSystem = {
  small: "cm",
  big: "m",
  smallName: "centimetres",
  bigName: "metres",
  ratio: 100,
  quantity: "the length of",
  smallThings: ["a pencil", "an eraser", "a leaf", "a toothbrush"],
  bigThings: ["a classroom", "a swimming pool", "a football field", "a school corridor"],
  otherUnits: ["kilograms (kg)", "litres (ℓ)"],
};

const MASS: UnitSystem = {
  small: "g",
  big: "kg",
  smallName: "grams",
  bigName: "kilograms",
  ratio: 1000,
  quantity: "the mass of",
  smallThings: ["an apple", "a paper clip", "a pencil", "an egg"],
  bigThings: ["a bag of rice", "a watermelon", "a school bag full of books", "a dog"],
  otherUnits: ["metres (m)", "litres (ℓ)"],
};

const CAPACITY: UnitSystem = {
  small: "ml",
  big: "litres",
  bigSymbol: "ℓ",
  smallName: "millilitres",
  bigName: "litres",
  ratio: 1000,
  quantity: "the amount of water in",
  smallThings: ["a teaspoon", "a cup", "a small bottle of medicine", "a glass"],
  bigThings: ["a bathtub", "a bucket", "a fish tank", "a swimming pool"],
  otherUnits: ["kilograms (kg)", "metres (m)"],
};

const unitLabel = (s: UnitSystem, big: boolean) =>
  big ? `${s.bigName} (${s.bigSymbol ?? s.big})` : `${s.smallName} (${s.small})`;

/** level 1: unit facts and choosing units; 2: mixed units; 3: decimal conversions. */
function unitsFamily(system: UnitSystem, label: string): Family {
  return {
    skill: "measurement",
    label,
    make(rng: Rng, [level = 1]) {
      const { small, big, ratio } = system;
      const bigUnit = big === "litres" ? " litres" : ` ${big}`;
      const bigOf = (n: number) => (n === 1 && big === "litres" ? " litre" : bigUnit);
      const variant = rng.int(0, 2);

      if (level <= 1) {
        if (variant === 0) {
          const pickBig = rng.chance(0.5);
          const thing = rng.pick(pickBig ? system.bigThings : system.smallThings);
          return {
            question: `Which unit would you use to measure ${system.quantity} ${thing}?`,
            answer: unitLabel(system, pickBig),
            wrong: [unitLabel(system, !pickBig), ...system.otherUnits],
            hint: `${system.bigName} are for big amounts; ${system.smallName} are for small ones.`,
            explanation: `${system.quantity.replace(/^./, (c) => c.toUpperCase())} ${thing} is measured in ${pickBig ? system.bigName : system.smallName}.`,
            difficulty: "easy",
          };
        }
        const n = variant === 1 ? 1 : rng.int(2, 9);
        return {
          question: `${n}${bigOf(n)} = ___ ${small}`,
          answer: n * ratio,
          wrong: [n * ratio * 10, n * (ratio / 10), n + ratio, n * 60],
          hint: `1${bigOf(1)} = ${fmt(ratio)} ${small}.`,
          explanation: `${n} × ${fmt(ratio)} = ${fmt(n * ratio)} ${small}.`,
          difficulty: "easy",
        };
      }

      if (level === 2) {
        const whole = rng.int(1, 9);
        const part = rng.chance(0.4) ? rng.int(1, 9) * (ratio === 100 ? 1 : 10) : rng.int(11, ratio - 1);
        const total = whole * ratio + part;
        if (variant === 0 || variant === 2) {
          return {
            question: `${whole}${bigOf(whole)} ${part} ${small} = ___ ${small}`,
            answer: total,
            wrong: [Number(`${whole}${part}`), whole * ratio * 10 + part, whole + part, whole * (ratio / 10) + part],
            hint: `Change ${whole}${bigOf(whole)} into ${small} first: 1${bigOf(1)} = ${fmt(ratio)} ${small}.`,
            explanation: `${whole} × ${fmt(ratio)} + ${part} = ${fmt(total)} ${small}.`,
            difficulty: "medium",
          };
        }
        const show = (w: number, p: number) => `${w}${bigOf(w)} ${p} ${small}`;
        return {
          question: `Write ${fmt(total)} ${small} in ${system.bigName} and ${system.smallName}.`,
          answer: show(whole, part),
          wrong: [
            show(Math.floor(total / (ratio / 10)), total % (ratio / 10)),
            show(whole + 1, part),
            show(whole, (part + ratio / 10) % ratio),
          ],
          hint: `Each ${fmt(ratio)} ${small} make 1${bigOf(1)}.`,
          explanation: `${fmt(total)} ${small} = ${show(whole, part)}.`,
          difficulty: "medium",
        };
      }

      // Decimal conversions, e.g. 2.5 kg = 2,500 g; 450 cm = 4.5 m.
      const places = ratio === 100 ? 2 : 3;
      const scaled = rng.int(1, 9) * 10 ** places + rng.pick([5, 25, 50, 75]) * 10 ** (places - 2);
      const asBig = decimal(scaled, places).replace(/0+$/, "").replace(/\.$/, "");
      if (rng.chance(0.5)) {
        return {
          question: `${asBig}${bigUnit} = ___ ${small}`,
          answer: scaled,
          wrong: [scaled / 10, scaled * 10, Number(asBig.replace(".", "")), Math.floor(scaled / ratio) * ratio],
          hint: `Multiply by ${fmt(ratio)}: 1${bigOf(1)} = ${fmt(ratio)} ${small}.`,
          explanation: `${asBig} × ${fmt(ratio)} = ${fmt(scaled)} ${small}.`,
          difficulty: "medium",
        };
      }
      const tenTimes = decimal(scaled, places - 1).replace(/0+$/, "").replace(/\.$/, "");
      const tenth = decimal(scaled, places + 1).replace(/0+$/, "").replace(/\.$/, "");
      return {
        question: `${fmt(scaled)} ${small} = ___${bigUnit}`,
        answer: `${asBig}${bigUnit}`,
        wrong: [`${tenTimes}${bigUnit}`, `${tenth}${bigUnit}`, `${fmt(scaled)}${bigUnit}`],
        hint: `Divide by ${fmt(ratio)}: move the digits ${places} places.`,
        explanation: `${fmt(scaled)} ÷ ${fmt(ratio)} = ${asBig}, so ${fmt(scaled)} ${small} = ${asBig}${bigUnit}.`,
        difficulty: "hard",
      };
    },
  };
}

const lengthUnits = unitsFamily(LENGTH, "Length");
const massUnits = unitsFamily(MASS, "Mass");
const capacityUnits = unitsFamily(CAPACITY, "Capacity");

/* ── Perimeter, area and volume ───────────────────────────────────────────── */

const cm = unit(" cm");
const cm2 = unit(" cm²");
const cm3 = unit(" cm³");

const perimeter: Family = {
  skill: "area-perimeter",
  label: "Perimeter",
  make(rng, [maxSide = 15]) {
    const variant = rng.int(0, 3);
    if (variant === 0) {
      const l = rng.int(4, maxSide);
      const w = rng.int(2, l - 1);
      return {
        question: `A rectangle is ${l} cm long and ${w} cm wide. What is its perimeter?`,
        answer: 2 * (l + w),
        wrong: [l * w, l + w, 2 * l + w, l + 2 * w],
        hint: "Perimeter is the distance all the way round: add all four sides.",
        explanation: `${l} + ${w} + ${l} + ${w} = ${2 * (l + w)} cm.`,
        difficulty: "easy",
        format: cm,
      };
    }
    if (variant === 1) {
      const s = rng.int(3, maxSide);
      return {
        question: `A square has sides of ${s} cm. What is its perimeter?`,
        answer: 4 * s,
        wrong: [s * s, 2 * s, s + 4, 3 * s],
        hint: "A square has 4 equal sides.",
        explanation: `4 × ${s} = ${4 * s} cm.`,
        difficulty: "easy",
        format: cm,
      };
    }
    if (variant === 2) {
      const a = rng.int(4, maxSide);
      const b = rng.int(4, maxSide);
      const c = rng.int(Math.abs(a - b) + 1, a + b - 1);
      return {
        question: `A triangle has sides of ${a} cm, ${b} cm and ${c} cm. What is its perimeter?`,
        answer: a + b + c,
        wrong: [a + b, a + b + c + 10, a * b, 2 * (a + b)],
        hint: "Add the lengths of all three sides.",
        explanation: `${a} + ${b} + ${c} = ${a + b + c} cm.`,
        difficulty: "easy",
        format: cm,
      };
    }
    const l = rng.int(5, maxSide);
    const w = rng.int(2, l - 1);
    const p = 2 * (l + w);
    return {
      question: `A rectangle has a perimeter of ${p} cm. Its length is ${l} cm. What is its width?`,
      answer: w,
      wrong: [p - l, p / 2, p - 2 * l, l],
      hint: `Half the perimeter is one length plus one width: ${p} ÷ 2 = ${p / 2}.`,
      explanation: `${p} ÷ 2 = ${p / 2}, and ${p / 2} − ${l} = ${w} cm.`,
      difficulty: "hard",
      format: cm,
    };
  },
};

const areaUnits: Family = {
  skill: "area",
  label: "Area in square units",
  make(rng) {
    const rows = rng.int(2, 4);
    const cols = rng.int(2, 6);
    const variant = rng.int(0, 2);
    if (variant === 0) {
      const picture = Array.from({ length: rows }, () => "🟩".repeat(cols)).join(" / ");
      return {
        question: `A shape is made of unit squares: ${picture} (${rows} rows). What is its area?`,
        answer: rows * cols,
        wrong: [rows + cols, 2 * (rows + cols), rows * cols - cols, rows * cols + rows],
        hint: "Count the squares — or multiply the rows by the squares in each row.",
        explanation: `${rows} rows of ${cols} squares = ${rows * cols} square units.`,
        difficulty: "easy",
        format: unit(" square units"),
      };
    }
    if (variant === 1) {
      const bCols = Math.max(2, cols - 1);
      const a = rows * cols;
      const b = (rows + 1) * bCols;
      const bigger = a === b ? "They have the same area" : a > b ? "Shape A" : "Shape B";
      return {
        question: `Shape A is ${rows} rows of ${cols} unit squares. Shape B is ${rows + 1} rows of ${bCols} unit squares. Which shape has the bigger area?`,
        answer: bigger,
        wrong: ["Shape A", "Shape B", "They have the same area"].filter((x) => x !== bigger),
        hint: "Work out how many unit squares each shape covers.",
        explanation: `Shape A covers ${a} squares and Shape B covers ${b} squares.`,
        difficulty: "medium",
      };
    }
    const a = rng.int(8, 20);
    const b = rng.int(3, a - 2);
    return {
      question: `Shape A covers ${a} unit squares. Shape B covers ${b} unit squares. How many more square units does Shape A cover?`,
      answer: a - b,
      wrong: [a + b, a, b, a - b + 1],
      hint: "Find the difference between the two areas.",
      explanation: `${a} − ${b} = ${a - b} square units.`,
      difficulty: "easy",
      format: unit(" square units"),
    };
  },
};

const areaRect: Family = {
  skill: "area",
  label: "Area of rectangles and squares",
  make(rng, [shape = 0]) {
    const square = shape === 2 || (shape === 0 && rng.chance(0.4));
    if (square) {
      const s = rng.int(2, 12);
      return {
        question: `A square has sides of ${s} cm. What is its area?`,
        answer: s * s,
        wrong: [4 * s, 2 * s, s * s + s, s + s * 2],
        hint: "Area of a square = side × side.",
        explanation: `${s} × ${s} = ${s * s} cm².`,
        difficulty: "easy",
        format: cm2,
      };
    }
    const l = rng.int(4, 15);
    const w = rng.int(2, l - 1);
    if (rng.chance(0.3)) {
      return {
        question: `A rectangle has an area of ${l * w} cm². Its length is ${l} cm. What is its width?`,
        answer: w,
        wrong: [l * w - l, l, (l * w) / 2, w + 1],
        hint: "Length × width = area, so width = area ÷ length.",
        explanation: `${l * w} ÷ ${l} = ${w} cm.`,
        difficulty: "hard",
        format: cm,
      };
    }
    return {
      question: `A rectangle is ${l} cm long and ${w} cm wide. What is its area?`,
      answer: l * w,
      wrong: [2 * (l + w), l + w, l * w + l, l * w - w],
      hint: "Area of a rectangle = length × width.",
      explanation: `${l} × ${w} = ${l * w} cm².`,
      difficulty: "easy",
      format: cm2,
    };
  },
};

const areaTriangle: Family = {
  skill: "area",
  label: "Area of triangles",
  make(rng) {
    const b = rng.int(2, 10) * 2;
    const h = rng.int(3, 12);
    const area = (b * h) / 2;
    const cut = rng.chance(0.4);
    return {
      question: cut
        ? `A rectangle ${b} cm by ${h} cm is cut along a diagonal into two equal triangles. What is the area of one triangle?`
        : `A triangle has a base of ${b} cm and a height of ${h} cm. What is its area?`,
      answer: area,
      wrong: [b * h, b + h, area + b, 2 * (b + h)],
      hint: "Area of a triangle = ½ × base × height.",
      explanation: `½ × ${b} × ${h} = ${area} cm².`,
      difficulty: "medium",
      format: cm2,
    };
  },
};

const compositeArea: Family = {
  skill: "area",
  label: "Area of composite figures",
  make(rng) {
    if (rng.chance(0.5)) {
      const W = rng.int(7, 14);
      const H = rng.int(6, 12);
      const w = rng.int(2, W - 3);
      const h = rng.int(2, H - 3);
      const area = W * H - w * h;
      return {
        question: `${aOrAn(w) === "an" ? "An" : "A"} ${w} cm by ${h} cm rectangle is cut out of one corner of ${aOrAn(W)} ${W} cm by ${H} cm rectangle. What is the area of the shape that is left?`,
        answer: area,
        wrong: [W * H, W * H + w * h, W * H - (w + h), 2 * (W + H)],
        hint: "Find the area of the big rectangle, then take away the area of the piece cut out.",
        explanation: `${W} × ${H} − ${w} × ${h} = ${W * H} − ${w * h} = ${area} cm².`,
        difficulty: "hard",
        format: cm2,
      };
    }
    const a = rng.int(3, 9);
    const b = rng.int(2, 8);
    const c = rng.int(3, 9);
    const d = rng.int(2, 8);
    const area = a * b + c * d;
    return {
      question: `A shape is made by joining ${aOrAn(a)} ${a} cm by ${b} cm rectangle and ${aOrAn(c)} ${c} cm by ${d} cm rectangle, with no overlap. What is its total area?`,
      answer: area,
      wrong: [(a + c) * (b + d), a * b, a + b + c + d, a * b * c * d > 999 ? area + 10 : a * b * c * d],
      hint: "Find the area of each rectangle, then add them.",
      explanation: `${a} × ${b} + ${c} × ${d} = ${a * b} + ${c * d} = ${area} cm².`,
      difficulty: "medium",
      format: cm2,
    };
  },
};

const volume: Family = {
  skill: "volume",
  label: "Volume",
  make(rng, [mode = 0]) {
    const m = mode || rng.int(1, 4);
    if (m === 1) {
      const [l, w, h] = [rng.int(2, 5), rng.int(2, 4), rng.int(2, 4)];
      return {
        question: `A cuboid is built from 1 cm cubes. It is ${l} cubes long, ${w} cubes wide and ${h} cubes high. How many cubes are used?`,
        answer: l * w * h,
        wrong: [l + w + h, l * w, l * w * h + l * w, l * w * h - h],
        hint: "Count the cubes in one layer, then multiply by the number of layers.",
        explanation: `${l} × ${w} = ${l * w} cubes in a layer, × ${h} layers = ${l * w * h} cubes.`,
        difficulty: "easy",
        format: unit(" cubes"),
      };
    }
    if (m === 2) {
      const s = rng.int(2, 10);
      return {
        question: `A cube has edges of ${s} cm. What is its volume?`,
        answer: s ** 3,
        wrong: [s * s, 3 * s, 6 * s * s, s ** 3 + s],
        hint: "Volume of a cube = edge × edge × edge.",
        explanation: `${s} × ${s} × ${s} = ${s ** 3} cm³.`,
        difficulty: "medium",
        format: cm3,
      };
    }
    if (m === 3) {
      const [l, w, h] = [rng.int(3, 12), rng.int(2, 8), rng.int(2, 10)];
      const v = l * w * h;
      if (rng.chance(0.35)) {
        return {
          question: `A cuboid has a volume of ${fmt(v)} cm³. It is ${l} cm long and ${w} cm wide. How high is it?`,
          answer: h,
          wrong: [v - l * w, l * w, h + 1, v / l],
          hint: `Volume = length × width × height. Divide the volume by ${l} × ${w}.`,
          explanation: `${l} × ${w} = ${l * w}, and ${fmt(v)} ÷ ${l * w} = ${h} cm.`,
          difficulty: "hard",
          format: cm,
        };
      }
      return {
        question: `A cuboid is ${l} cm long, ${w} cm wide and ${h} cm high. What is its volume?`,
        answer: v,
        wrong: [l + w + h, l * w, 2 * (l * w + w * h + l * h), v + l * w],
        hint: "Volume of a cuboid = length × width × height.",
        explanation: `${l} × ${w} × ${h} = ${fmt(v)} cm³.`,
        difficulty: "medium",
        format: cm3,
      };
    }
    const [l, w, h] = [rng.pick([10, 20, 25, 40, 50]), rng.pick([10, 20, 40]), rng.pick([10, 15, 20, 30])];
    const v = l * w * h;
    if (v % 1000 === 0 && rng.chance(0.5)) {
      return {
        question: `A fish tank is ${l} cm long, ${w} cm wide and ${h} cm high. How many litres of water does it hold when full? (1 litre = 1,000 cm³)`,
        answer: v / 1000,
        wrong: [v / 100, v / 10000 || v / 100 + 1, l + w + h, v / 1000 + 10],
        hint: "Find the volume in cm³, then divide by 1,000.",
        explanation: `${l} × ${w} × ${h} = ${fmt(v)} cm³ = ${fmt(v / 1000)} litres.`,
        difficulty: "hard",
        format: unit(" litres"),
      };
    }
    return {
      question: `A tank is ${l} cm long, ${w} cm wide and ${h} cm high. How many millilitres of water does it hold when full? (1 cm³ = 1 ml)`,
      answer: v,
      wrong: [l * w, v / 10, v * 10, l + w + h],
      hint: "The tank holds as many ml as its volume in cm³.",
      explanation: `${l} × ${w} × ${h} = ${fmt(v)} cm³, so it holds ${fmt(v)} ml.`,
      difficulty: "hard",
      format: unit(" ml"),
    };
  },
};

/* ── Rate ─────────────────────────────────────────────────────────────────── */

const speed: Family = {
  skill: "speed",
  label: "Rate",
  make(rng) {
    const variant = rng.int(0, 3);
    if (variant === 0) {
      const s = rng.int(6, 18) * 5;
      const t = rng.int(2, 5);
      return {
        question: `A car travels ${s * t} km in ${t} hours at a steady speed. What is its speed?`,
        answer: s,
        wrong: [s * t * t, s * t - t, s + 10, s - 10],
        hint: "Speed = distance ÷ time.",
        explanation: `${s * t} ÷ ${t} = ${s} km/h.`,
        difficulty: "medium",
        format: unit(" km/h"),
      };
    }
    if (variant === 1) {
      const r = rng.int(3, 12);
      const t = rng.int(3, 10);
      return {
        question: `A printer prints ${r} pages every minute. How many pages does it print in ${t} minutes?`,
        answer: r * t,
        wrong: [r + t, r * t + r, r * t - r, r * (t + 1) + 1],
        hint: "Pages per minute × number of minutes.",
        explanation: `${r} × ${t} = ${r * t} pages.`,
        difficulty: "easy",
        format: unit(" pages"),
      };
    }
    if (variant === 2) {
      const each = rng.int(1, 6) * 50;
      const n = rng.int(2, 5);
      let k = rng.int(2, 8);
      if (k === n) k += 1;
      return {
        question: `${n} pens cost ${money(each * n)}. How much do ${k} pens cost?`,
        answer: each * k,
        wrong: [each * n * k, each * (k + 1), each * (k - 1), each * k + 50],
        hint: `Find the cost of 1 pen first: ${money(each * n)} ÷ ${n}.`,
        explanation: `1 pen costs ${money(each)}, so ${k} pens cost ${money(each * k)}.`,
        difficulty: "medium",
        format: money,
      };
    }
    const r = rng.int(2, 9);
    const t = rng.int(3, 12);
    return {
      question: `A tap fills ${r} litres of water every minute. How long does it take to fill ${r * t} litres?`,
      answer: t,
      wrong: [r * t - r, t + 1, r, r * t],
      hint: "Divide the total by the amount each minute.",
      explanation: `${r * t} ÷ ${r} = ${t} minutes.`,
      difficulty: "medium",
      format: minutes,
    };
  },
};

export const MEASUREMENT_FAMILIES: Record<string, Family> = {
  "money-count": moneyCount,
  "money-change": moneyChange,
  "money-notation": moneyNotation,
  "money-add-sub": moneyAddSub,
  "clock-hour-half": clockHourHalf,
  "clock-minutes": clockMinutes,
  "elapsed-time": elapsedTime,
  timetable,
  "non-standard-units": nonStandardUnits,
  "compare-length": compareLength,
  "length-units": lengthUnits,
  "mass-units": massUnits,
  "capacity-units": capacityUnits,
  perimeter,
  "area-units": areaUnits,
  "area-rect": areaRect,
  "area-triangle": areaTriangle,
  "composite-area": compositeArea,
  volume,
  speed,
};
