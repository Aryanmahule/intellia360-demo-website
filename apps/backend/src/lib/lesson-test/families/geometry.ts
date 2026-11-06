/**
 * Geometry: 2D and 3D shapes, symmetry, lines, angles, triangles,
 * quadrilaterals, and similarity and congruence.
 *
 * A lesson about a single shape ("Circle") still needs eight different
 * questions, so each family mixes fact questions with ones built from numbers
 * or a row of shapes, which never run out.
 */
import { twoNames, unit, type Family, type Rng } from "@/lib/lesson-test/core";

const deg = unit("°");
const article = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/* ── 2D shapes ────────────────────────────────────────────────────────────── */

interface Shape2D {
  name: string;
  sides: number;
  corners: number;
  describe: string;
  objects: string[];
  /** For "how many circles are in this row?" — only shapes with a clear emoji. */
  emoji?: string;
}

/** Index order matters: the topic planner passes these indexes as params. */
export const SHAPES_2D: Shape2D[] = [
  { name: "circle", sides: 0, corners: 0, describe: "is round and has no straight sides and no corners", objects: ["a coin", "a clock face", "a wheel", "a dinner plate"], emoji: "🔵" },
  { name: "triangle", sides: 3, corners: 3, describe: "has 3 straight sides and 3 corners", objects: ["a slice of pizza", "a coat hanger", "a sandwich cut from corner to corner"], emoji: "🔺" },
  { name: "square", sides: 4, corners: 4, describe: "has 4 straight sides that are all the same length", objects: ["a chessboard", "a sticky note", "a floor tile"], emoji: "🟧" },
  { name: "rectangle", sides: 4, corners: 4, describe: "has 4 straight sides: two long sides and two short sides", objects: ["a door", "a book cover", "a whiteboard", "a mobile phone"] },
];

const POLYGONS = [
  { name: "triangle", sides: 3 },
  { name: "quadrilateral", sides: 4 },
  { name: "pentagon", sides: 5 },
  { name: "hexagon", sides: 6 },
  { name: "octagon", sides: 8 },
];

const shapes2d: Family = {
  skill: "shapes",
  label: "2D shapes",
  make(rng, [mode = 0, ...indexes]) {
    const chosen = indexes.map((i) => SHAPES_2D[i]).filter(Boolean);
    const pool = chosen.length > 0 ? chosen : SHAPES_2D;
    const shape = rng.pick(pool);
    const others = SHAPES_2D.filter((s) => s !== shape);

    if (mode === 2) return advancedShape(rng);

    let variant = mode === 1 ? rng.pick([3, 4]) : rng.int(0, 6);
    // Counting needs an emoji for the shape; "altogether" needs corners.
    if (variant === 5 && !shape.emoji) variant = 6;
    if (variant === 6 && shape.corners === 0) variant = 5;

    if (variant === 0) {
      return {
        question: `How many corners does a ${shape.name} have?`,
        answer: shape.corners,
        wrong: [0, 3, 4, 5, 6],
        hint: "A corner is where two straight sides meet.",
        explanation: `A ${shape.name} has ${shape.corners} corners.`,
        difficulty: "easy",
      };
    }
    if (variant === 1) {
      return {
        question: `How many straight sides does a ${shape.name} have?`,
        answer: shape.sides,
        wrong: [0, 3, 4, 5, 6],
        hint: "Trace round the shape with your finger and count the straight sides.",
        explanation: `A ${shape.name} has ${shape.sides} straight sides.`,
        difficulty: "easy",
      };
    }
    if (variant === 2) {
      return {
        question: `Which shape ${shape.describe}?`,
        answer: shape.name,
        wrong: others.map((s) => s.name),
        hint: "Think about the sides and the corners of each shape.",
        explanation: `A ${shape.name} ${shape.describe}.`,
        difficulty: "easy",
      };
    }
    if (variant === 3) {
      const object = rng.pick(shape.objects);
      return {
        question: `What shape is ${object}?`,
        answer: shape.name,
        wrong: others.map((s) => s.name),
        hint: `Picture the outline of ${object}.`,
        explanation: `${object.replace(/^./, (c) => c.toUpperCase())} is shaped like a ${shape.name}.`,
        difficulty: "easy",
      };
    }
    if (variant === 4) {
      return {
        question: `Which of these is shaped like a ${shape.name}?`,
        answer: rng.pick(shape.objects),
        wrong: others.map((s) => rng.pick(s.objects)),
        hint: `A ${shape.name} ${shape.describe}.`,
        explanation: `Of these, only one is shaped like a ${shape.name}.`,
        difficulty: "easy",
      };
    }
    if (variant === 6) {
      const n = rng.int(2, 5);
      return {
        question: `How many corners do ${n} ${shape.name}s have altogether?`,
        answer: n * shape.corners,
        wrong: [n + shape.corners, (n - 1) * shape.corners, (n + 1) * shape.corners, shape.corners],
        hint: `One ${shape.name} has ${shape.corners} corners. Count in ${shape.corners}s.`,
        explanation: `${n} × ${shape.corners} = ${n * shape.corners} corners.`,
        difficulty: "medium",
      };
    }
    // Count the shape in a row of shapes.
    const target = shape;
    const fillers = SHAPES_2D.filter((s) => s.emoji && s !== target).map((s) => s.emoji!);
    const count = rng.int(2, 6);
    const row = rng.shuffle([...Array.from({ length: count }, () => target.emoji!), ...Array.from({ length: rng.int(2, 5) }, () => rng.pick(fillers))]);
    return {
      question: `How many ${target.name}s are in this row? ${row.join(" ")}`,
      answer: count,
      wrong: [count + 1, count - 1, row.length, count + 2],
      hint: `Look only for the ${target.name}s and point to each one as you count.`,
      explanation: `There are ${count} ${target.name}s.`,
      difficulty: "easy",
    };
  },
};

function advancedShape(rng: Rng) {
  const variant = rng.int(0, 3);
  const poly = rng.pick(POLYGONS);
  if (variant === 0) {
    return {
      question: `How many sides does ${article(poly.name)} have?`,
      answer: poly.sides,
      wrong: POLYGONS.map((p) => p.sides),
      hint: "Penta- means 5, hexa- means 6, octa- means 8.",
      explanation: `${capital(article(poly.name))} has ${poly.sides} sides.`,
      difficulty: "easy" as const,
    };
  }
  if (variant === 1) {
    return {
      question: `A flat shape has ${poly.sides} straight sides. What is it called?`,
      answer: poly.name,
      wrong: POLYGONS.filter((p) => p !== poly).map((p) => p.name),
      hint: "Count the sides and match the name: tri- 3, quad- 4, penta- 5, hexa- 6, octa- 8.",
      explanation: `A shape with ${poly.sides} sides is ${article(poly.name)}.`,
      difficulty: "easy" as const,
    };
  }
  if (variant === 2) {
    const quad = rng.pick(["a square", "a rectangle", "a rhombus", "a trapezium", "a parallelogram"]);
    return {
      question: "Which of these shapes is a quadrilateral?",
      answer: quad,
      wrong: ["a triangle", "a pentagon", "a hexagon", "a circle"],
      hint: "A quadrilateral has exactly 4 straight sides.",
      explanation: `${quad.replace(/^./, (c) => c.toUpperCase())} has 4 sides, so it is a quadrilateral.`,
      difficulty: "medium" as const,
    };
  }
  const a = rng.pick(POLYGONS);
  let b = rng.pick(POLYGONS);
  if (b === a) b = POLYGONS[(POLYGONS.indexOf(a) + 1) % POLYGONS.length];
  const [big, small] = a.sides > b.sides ? [a, b] : [b, a];
  return {
    question: `How many more sides does ${article(big.name)} have than ${article(small.name)}?`,
    answer: big.sides - small.sides,
    wrong: [big.sides + small.sides, big.sides, small.sides, big.sides - small.sides + 1],
    hint: `Find the number of sides of each shape, then subtract.`,
    explanation: `${big.sides} − ${small.sides} = ${big.sides - small.sides}.`,
    difficulty: "medium" as const,
  };
}

/* ── 3D shapes ────────────────────────────────────────────────────────────── */

interface Solid {
  name: string;
  flat: number;
  edges: number;
  vertices: number;
  rolls: boolean;
  objects: string[];
  describe: string;
}

export const SOLIDS: Solid[] = [
  { name: "cube", flat: 6, edges: 12, vertices: 8, rolls: false, objects: ["a dice", "an ice cube", "a sugar cube"], describe: "has 6 square faces that are all the same size" },
  { name: "cuboid", flat: 6, edges: 12, vertices: 8, rolls: false, objects: ["a shoebox", "a brick", "a cereal box"], describe: "has 6 flat faces, and some are rectangles" },
  { name: "sphere", flat: 0, edges: 0, vertices: 0, rolls: true, objects: ["a football", "a marble", "a globe"], describe: "is round all over and has no flat faces" },
  { name: "cone", flat: 1, edges: 1, vertices: 1, rolls: true, objects: ["an ice cream cone", "a party hat", "a traffic cone"], describe: "has one flat circle face, a curved surface and a point at the top" },
  { name: "cylinder", flat: 2, edges: 2, vertices: 0, rolls: true, objects: ["a tin can", "a candle", "a glue stick"], describe: "has two flat circle faces and a curved surface" },
];

const shapes3d: Family = {
  skill: "shapes",
  label: "3D shapes",
  make(rng, [mode = 0, ...indexes]) {
    const chosen = indexes.map((i) => SOLIDS[i]).filter(Boolean);
    const pool = chosen.length > 0 ? chosen : SOLIDS;
    const solid = rng.pick(pool);
    const others = pool.length > 1 ? pool.filter((s) => s !== solid) : SOLIDS.filter((s) => s !== solid);
    const variant = mode === 1 ? rng.pick([3, 4]) : rng.int(0, 5);

    if (variant === 0 || variant === 1 || variant === 2) {
      const [what, value] =
        variant === 0 ? ["flat faces", solid.flat] : variant === 1 ? ["edges", solid.edges] : ["vertices (corners)", solid.vertices];
      return {
        question: `How many ${what} does a ${solid.name} have?`,
        answer: value,
        wrong: [0, 1, 2, 4, 6, 8, 12].filter((v) => v !== value).sort((x, y) => Math.abs(x - value) - Math.abs(y - value)),
        hint: "Picture the shape, or hold a real one, and count carefully.",
        explanation: `A ${solid.name} has ${solid.flat} flat faces, ${solid.edges} edges and ${solid.vertices} vertices.`,
        difficulty: variant === 0 ? "easy" : "medium",
      };
    }
    if (variant === 3) {
      const object = rng.pick(solid.objects);
      return {
        question: `What 3D shape is ${object}?`,
        answer: solid.name,
        wrong: SOLIDS.filter((s) => s !== solid && !(s.name === "cuboid" && solid.name === "cube") && !(s.name === "cube" && solid.name === "cuboid")).map((s) => s.name),
        hint: `Think about the faces of ${object}.`,
        explanation: `${object.replace(/^./, (c) => c.toUpperCase())} is shaped like a ${solid.name}.`,
        difficulty: "easy",
      };
    }
    if (variant === 4) {
      return {
        question: `Which 3D shape ${solid.describe}?`,
        answer: solid.name,
        wrong: others.map((s) => s.name),
        hint: "Think about flat faces, curved surfaces and points.",
        explanation: `A ${solid.name} ${solid.describe}.`,
        difficulty: "easy",
      };
    }
    const canRoll = rng.chance(0.5);
    const rollers = SOLIDS.filter((s) => s.rolls).map((s) => s.name);
    const stayers = [...SOLIDS.filter((s) => !s.rolls).map((s) => s.name), "pyramid"];
    return {
      question: `Which of these shapes ${canRoll ? "can roll" : "cannot roll"}?`,
      answer: rng.pick(canRoll ? rollers : stayers),
      wrong: canRoll ? stayers : rollers,
      hint: "A shape with a curved surface can roll.",
      explanation: canRoll ? "Spheres, cones and cylinders have curved surfaces, so they can roll." : "Cubes, cuboids and pyramids have only flat faces, so they cannot roll.",
      difficulty: "easy",
    };
  },
};

/* ── Symmetry and lines ───────────────────────────────────────────────────── */

const SYMMETRIC_LETTERS = ["A", "H", "M", "O", "T", "U", "V", "W", "X", "Y", "B", "C", "D", "E"];
const ASYMMETRIC_LETTERS = ["F", "G", "J", "L", "N", "P", "Q", "R", "S", "Z"];

const LINES_OF_SYMMETRY = [
  { name: "square", lines: 4, basic: true },
  { name: "rectangle (that is not a square)", lines: 2, basic: true },
  { name: "equilateral triangle", lines: 3, basic: false },
  { name: "isosceles triangle", lines: 1, basic: false },
  { name: "regular pentagon", lines: 5, basic: false },
  { name: "regular hexagon", lines: 6, basic: false },
  { name: "regular octagon", lines: 8, basic: false },
  { name: "heart shape", lines: 1, basic: true },
];

const symmetry: Family = {
  skill: "geometry",
  label: "Symmetry",
  make(rng, [level = 2]) {
    const shapes = LINES_OF_SYMMETRY.filter((s) => level >= 2 || s.basic);
    const variant = rng.int(0, 3);
    if (variant === 0) {
      const s = rng.pick(shapes);
      return {
        question: `How many lines of symmetry does ${article(s.name)} have?`,
        answer: s.lines,
        wrong: [s.lines + 1, s.lines - 1, s.lines * 2, 0, 1, 2],
        hint: "A line of symmetry folds the shape into two halves that match exactly.",
        explanation: `${capital(article(s.name))} has ${s.lines} line${s.lines === 1 ? "" : "s"} of symmetry.`,
        difficulty: s.lines > 4 ? "medium" : "easy",
      };
    }
    if (variant === 1) {
      const has = rng.chance(0.5);
      return {
        question: has ? "Which capital letter has a line of symmetry?" : "Which capital letter has NO line of symmetry?",
        answer: rng.pick(has ? SYMMETRIC_LETTERS : ASYMMETRIC_LETTERS),
        wrong: rng.sample(has ? ASYMMETRIC_LETTERS : SYMMETRIC_LETTERS, 3),
        hint: "Imagine folding the letter. Do the two halves match?",
        explanation: "Letters like A, H, M, T and X can be folded into matching halves; F, G, J, L, N, P, R, S and Z cannot.",
        difficulty: "medium",
      };
    }
    if (variant === 2) {
      const s = rng.pick(shapes.filter((x) => x.lines <= 4 && x.lines !== 1));
      return {
        question: `Which shape has exactly ${s.lines} lines of symmetry?`,
        answer: s.name.replace(/ \(.*\)$/, ""),
        wrong: shapes.filter((x) => x.lines !== s.lines).map((x) => x.name.replace(/ \(.*\)$/, "")),
        hint: "Fold each shape in your mind in every way that makes matching halves.",
        explanation: `${capital(article(s.name))} has ${s.lines} lines of symmetry.`,
        difficulty: "medium",
      };
    }
    return {
      question: "A line of symmetry splits a shape into two halves that…",
      answer: "match exactly, like mirror images",
      wrong: ["are different sizes", "are different colours", "are always triangles"],
      hint: "Think of folding a picture so that one half covers the other.",
      explanation: "A line of symmetry splits a shape into two matching halves, like mirror images.",
      difficulty: "easy",
    };
  },
};

const PARALLEL_PAIRS = [
  { name: "rectangle", pairs: 2 },
  { name: "square", pairs: 2 },
  { name: "trapezium", pairs: 1 },
  { name: "triangle", pairs: 0 },
  { name: "parallelogram", pairs: 2 },
  { name: "regular hexagon", pairs: 3 },
];

const lines: Family = {
  skill: "geometry",
  label: "Parallel and perpendicular lines",
  make(rng) {
    const variant = rng.int(0, 5);
    if (variant === 0) {
      const s = rng.pick(PARALLEL_PAIRS);
      return {
        question: `How many pairs of parallel sides does a ${s.name} have?`,
        answer: s.pairs,
        wrong: [0, 1, 2, 3, 4],
        hint: "Parallel sides go in the same direction and never meet.",
        explanation: `A ${s.name} has ${s.pairs} pair${s.pairs === 1 ? "" : "s"} of parallel sides.`,
        difficulty: "medium",
      };
    }
    if (variant === 1) {
      const parallel = rng.chance(0.5);
      return {
        question: parallel
          ? "What do we call two straight lines that never meet, however long they are drawn?"
          : "What do we call two straight lines that meet at a right angle?",
        answer: parallel ? "parallel lines" : "perpendicular lines",
        wrong: [parallel ? "perpendicular lines" : "parallel lines", "curved lines", "zigzag lines"],
        hint: "Railway tracks are parallel; the corner of a page is perpendicular.",
        explanation: parallel ? "Lines that never meet are parallel." : "Lines that meet at a right angle are perpendicular.",
        difficulty: "easy",
      };
    }
    if (variant === 2) {
      const parallel = rng.chance(0.5);
      return {
        question: parallel ? "Which capital letter has a pair of parallel lines?" : "Which capital letter is made of two perpendicular lines?",
        answer: parallel ? rng.pick(["H", "N"]) : rng.pick(["L", "T"]),
        wrong: parallel ? ["V", "L", "T", "X"] : ["V", "O", "C", "S"],
        hint: parallel ? "Look for two lines that run side by side." : "Look for two lines that meet in a square corner.",
        explanation: parallel ? "H and N each have two parallel lines." : "L and T are made of lines that meet at a right angle.",
        difficulty: "medium",
      };
    }
    if (variant === 3) {
      const example = rng.pick([
        { thing: "the two rails of a straight railway track", answer: "parallel" },
        { thing: "the lines on a page of writing paper", answer: "parallel" },
        { thing: "the edges that meet at the corner of a book", answer: "perpendicular" },
        { thing: "a flagpole standing straight up from flat ground", answer: "perpendicular" },
      ]);
      return {
        question: `Are ${example.thing} parallel or perpendicular?`,
        answer: example.answer,
        wrong: [example.answer === "parallel" ? "perpendicular" : "parallel", "neither"],
        hint: "Parallel lines never meet. Perpendicular lines meet at a right angle.",
        explanation: `They are ${example.answer}.`,
        difficulty: "easy",
      };
    }
    if (variant === 4) {
      const vertical = rng.chance(0.5);
      const thing = vertical
        ? rng.pick(["a flagpole", "the side of a door", "a lamp post"])
        : rng.pick(["the horizon at sea", "the top of a table", "a shelf"]);
      return {
        question: `Is ${thing} usually a vertical line or a horizontal line?`,
        answer: vertical ? "vertical" : "horizontal",
        wrong: [vertical ? "horizontal" : "vertical", "curved"],
        hint: "Vertical goes straight up and down; horizontal goes straight across.",
        explanation: `${thing.replace(/^./, (c) => c.toUpperCase())} is ${vertical ? "vertical" : "horizontal"}.`,
        difficulty: "easy",
      };
    }
    const n = rng.int(3, 5);
    return {
      question: `${n} straight lines are drawn across a page, all going in the same direction and never meeting. How many pairs of parallel lines can you find?`,
      answer: (n * (n - 1)) / 2,
      wrong: [n, n - 1, n * 2, (n * (n - 1)) / 2 + 1],
      hint: "Every line is parallel to every other line. Count each pair once.",
      explanation: `With ${n} lines, each pair is parallel: ${(n * (n - 1)) / 2} pairs.`,
      difficulty: "hard",
    };
  },
};

/* ── Angles ───────────────────────────────────────────────────────────────── */

const angleTypes: Family = {
  skill: "geometry",
  label: "Angles",
  make(rng, [level = 2]) {
    if (level <= 1) {
      const variant = rng.int(0, 3);
      const compare = (a: number) => (a < 90 ? "Smaller than a right angle" : a === 90 ? "Equal to a right angle" : "Greater than a right angle");
      const options = ["Smaller than a right angle", "Equal to a right angle", "Greater than a right angle"];
      if (variant === 0) {
        const a = rng.chance(0.2) ? 90 : rng.int(2, 17) * 10;
        return {
          question: `Is an angle of ${a}° smaller than, equal to or greater than a right angle?`,
          answer: compare(a),
          wrong: options.filter((o) => o !== compare(a)),
          hint: "A right angle is 90°, like the corner of a book.",
          explanation: `${a}° is ${compare(a).toLowerCase()} (90°).`,
          difficulty: "easy",
          ordered: true,
        };
      }
      if (variant === 1) {
        const h = rng.int(1, 5);
        const a = h * 30;
        return {
          question: `At ${h} o'clock, is the angle between the hands of a clock smaller than, equal to or greater than a right angle?`,
          answer: compare(a),
          wrong: options.filter((o) => o !== compare(a)),
          hint: "At 3 o'clock the hands make a right angle.",
          explanation: `At ${h} o'clock the hands make ${a}°, which is ${compare(a).toLowerCase()}.`,
          difficulty: "medium",
          ordered: true,
        };
      }
      if (variant === 2) {
        const [what, answer] = rng.pick([
          ["How many right angles make a straight line?", 2],
          ["How many right angles make a full turn?", 4],
          ["How many right angles make a half turn?", 2],
          ["How many right angles are in a quarter turn?", 1],
        ] as const);
        return {
          question: what,
          answer,
          wrong: [1, 2, 3, 4],
          hint: "A quarter turn is one right angle.",
          explanation: `The answer is ${answer} right angle${answer === 1 ? "" : "s"}.`,
          difficulty: "medium",
        };
      }
      return {
        question: "Where can you find a right angle?",
        answer: rng.pick(["the corner of a book", "the corner of a door", "the corner of a window"]),
        wrong: ["the tip of a slice of pizza", "the edge of a coin", "the point of a star"],
        hint: "A right angle is a square corner.",
        explanation: "Books, doors and windows have square corners — right angles.",
        difficulty: "easy",
      };
    }

    const kinds = [
      { name: "acute", sample: () => rng.int(1, 8) * 10 + rng.int(0, 5) },
      { name: "right", sample: () => 90 },
      { name: "obtuse", sample: () => rng.int(10, 17) * 10 - rng.int(0, 5) },
      { name: "straight", sample: () => 180 },
    ];
    const kindOf = (a: number) => (a < 90 ? "acute" : a === 90 ? "right" : a < 180 ? "obtuse" : "straight");
    const MEANING: Record<string, string> = {
      acute: "less than 90°",
      right: "exactly 90°",
      obtuse: "between 90° and 180°",
      straight: "exactly 180°",
    };
    const variant = rng.int(0, 3);
    if (variant === 0) {
      const kind = rng.pick(kinds);
      const a = kind.sample();
      return {
        question: `What type of angle is ${a}°?`,
        answer: `${kind.name} angle`,
        wrong: kinds.filter((k) => k !== kind).map((k) => `${k.name} angle`),
        hint: "Acute is less than 90°, right is 90°, obtuse is between 90° and 180°, straight is 180°.",
        explanation: `${a}° is ${article(kind.name)} angle.`,
        difficulty: "easy",
      };
    }
    if (variant === 1) {
      const target = rng.pick(kinds.filter((k) => k.name === "acute" || k.name === "obtuse"));
      return {
        question: `Which angle is ${target.name}?`,
        answer: target.sample(),
        wrong: kinds.filter((k) => k !== target).map((k) => k.sample()),
        hint: target.name === "acute" ? "Acute angles are less than 90°." : "Obtuse angles are between 90° and 180°.",
        explanation: `${target.name === "acute" ? "Acute angles are less than 90°" : "Obtuse angles are between 90° and 180°"}.`,
        difficulty: "easy",
        format: deg,
      };
    }
    if (variant === 2) {
      const kind = rng.pick(kinds);
      const name = article(kind.name);
      return {
        question: `${name.charAt(0).toUpperCase()}${name.slice(1)} angle is…`,
        answer: MEANING[kind.name],
        wrong: Object.entries(MEANING).filter(([k]) => k !== kind.name).map(([, v]) => v),
        hint: "90° is a right angle and 180° is a straight line.",
        explanation: `${name.charAt(0).toUpperCase()}${name.slice(1)} angle is ${MEANING[kind.name]}.`,
        difficulty: "easy",
      };
    }
    const a = rng.int(2, 8) * 10;
    const grow = rng.int(1, Math.floor((180 - a) / 10)) * 10;
    const now = kindOf(a + grow);
    return {
      question: `An angle of ${a}° is made ${grow}° bigger. What type of angle is it now?`,
      answer: `${now} angle`,
      wrong: kinds.map((k) => k.name).filter((k) => k !== now).map((k) => `${k} angle`),
      hint: "Add the two amounts, then compare the total with 90° and 180°.",
      explanation: `${a}° + ${grow}° = ${a + grow}°, which is ${article(now)} angle.`,
      difficulty: "medium",
    };
  },
};

const anglesOnLine: Family = {
  skill: "geometry",
  label: "Angles on a straight line",
  make(rng) {
    if (rng.chance(0.35)) {
      const a = rng.int(3, 9) * 10;
      const b = rng.int(2, Math.max(2, Math.floor((170 - a) / 10))) * 10;
      const c = 180 - a - b;
      return {
        question: `Three angles sit together on a straight line: ${a}°, ${b}° and ∠x. Find ∠x.`,
        answer: c,
        wrong: [360 - a - b, 90 - a > 0 ? 90 - a : c + 20, a + b, c + 10, c - 10],
        hint: "Angles on a straight line add up to 180°.",
        explanation: `180° − ${a}° − ${b}° = ${c}°.`,
        difficulty: "medium",
        format: deg,
      };
    }
    const a = rng.int(20, 160);
    return {
      question: `Two angles sit side by side on a straight line. One is ${a}°. What is the other angle?`,
      answer: 180 - a,
      wrong: [360 - a, 90 - a, a, 180 - a + 10, 180 - a - 10],
      hint: "Angles on a straight line add up to 180°.",
      explanation: `180° − ${a}° = ${180 - a}°.`,
      difficulty: "easy",
      format: deg,
    };
  },
};

const anglesAtPoint: Family = {
  skill: "geometry",
  label: "Angles around a point",
  make(rng) {
    const a = rng.int(6, 16) * 10;
    const b = rng.int(4, Math.max(4, Math.floor((330 - a) / 10))) * 10;
    const c = 360 - a - b;
    return {
      question: `Three angles meet at a point: ${a}°, ${b}° and ∠y. Find ∠y.`,
      answer: c,
      wrong: [180 - a - b, a + b, c + 10, c - 10, 360 - a],
      hint: "Angles around a point add up to 360°.",
      explanation: `360° − ${a}° − ${b}° = ${c}°.`,
      difficulty: "medium",
      format: deg,
    };
  },
};

const triangleAngles: Family = {
  skill: "geometry",
  label: "Angles in triangles",
  make(rng, [withQuadrilaterals = 0]) {
    const variant = rng.int(0, withQuadrilaterals ? 3 : 2);
    if (variant === 1) {
      const top = rng.int(2, 14) * 10;
      const base = (180 - top) / 2;
      return {
        question: `An isosceles triangle has two equal base angles. The third angle is ${top}°. What is each base angle?`,
        answer: base,
        wrong: [180 - top, top, base + 10, 90 - top / 2 + 10],
        hint: "Take the third angle from 180°, then share what is left between the two equal angles.",
        explanation: `180° − ${top}° = ${180 - top}°, and ${180 - top}° ÷ 2 = ${base}°.`,
        difficulty: "hard",
        format: deg,
      };
    }
    if (variant === 2) {
      const [shape, total] = rng.pick([
        ["triangle", 180],
        ["triangle", 180],
        ["quadrilateral", 360],
      ] as const);
      if (shape === "quadrilateral" && !withQuadrilaterals) {
        return {
          question: "In an equilateral triangle, how big is each angle?",
          answer: 60,
          wrong: [90, 45, 180, 30],
          hint: "All three angles are equal and they add up to 180°.",
          explanation: "180° ÷ 3 = 60°.",
          difficulty: "easy",
          format: deg,
        };
      }
      return {
        question: `The angles inside a ${shape} add up to…`,
        answer: total,
        wrong: [90, 180, 270, 360],
        hint: shape === "triangle" ? "Tear off the three corners of a paper triangle and put them on a line." : "A quadrilateral splits into two triangles.",
        explanation: `The angles of a ${shape} add up to ${total}°.`,
        difficulty: "easy",
        format: deg,
      };
    }
    if (variant === 3) {
      const a = rng.int(6, 12) * 10;
      const b = rng.int(6, 12) * 10;
      const c = rng.int(5, Math.max(5, Math.floor((350 - a - b) / 10))) * 10;
      const d = 360 - a - b - c;
      return {
        question: `Three angles of a quadrilateral are ${a}°, ${b}° and ${c}°. What is the fourth angle?`,
        answer: d,
        wrong: [180 - ((a + b + c) % 180), d + 10, d - 10, a + b + c - 180],
        hint: "The angles of a quadrilateral add up to 360°.",
        explanation: `360° − ${a}° − ${b}° − ${c}° = ${d}°.`,
        difficulty: "medium",
        format: deg,
      };
    }
    const a = rng.int(20, 100);
    const b = rng.int(20, 150 - a);
    const c = 180 - a - b;
    return {
      question: `Two angles of a triangle are ${a}° and ${b}°. What is the third angle?`,
      answer: c,
      wrong: [360 - a - b, a + b, c + 10, c - 10, 90 - (a % 90)],
      hint: "The angles in a triangle add up to 180°.",
      explanation: `180° − ${a}° − ${b}° = ${c}°.`,
      difficulty: "medium",
      format: deg,
    };
  },
};

const triangleTypes: Family = {
  skill: "geometry",
  label: "Types of triangles",
  make(rng) {
    if (rng.chance(0.5)) {
      const kind = rng.pick(["equilateral", "isosceles", "scalene"] as const);
      const a = rng.int(4, 9);
      let sides: number[];
      if (kind === "equilateral") sides = [a, a, a];
      else if (kind === "isosceles") sides = rng.shuffle([a, a, rng.pick([a - 2, a + 1, a + 3].filter((x) => x > 1 && x < 2 * a))]);
      else sides = rng.shuffle([a, a + 1, a + 3]);
      return {
        question: `A triangle has sides of ${sides.join(" cm, ")} cm. What type of triangle is it?`,
        answer: `${kind} triangle`,
        wrong: ["equilateral", "isosceles", "scalene", "right-angled"].filter((k) => k !== kind).map((k) => `${k} triangle`).slice(0, 3),
        hint: "Equilateral: all sides equal. Isosceles: two sides equal. Scalene: no sides equal.",
        explanation: `With sides ${sides.join(", ")}, it is ${article(kind)} triangle.`,
        difficulty: "easy",
      };
    }
    const kind = rng.pick(["right-angled", "obtuse-angled", "acute-angled"] as const);
    let angles: number[];
    if (kind === "right-angled") {
      const x = rng.int(2, 7) * 10 + rng.pick([0, 5]);
      angles = [90, x, 90 - x];
    } else if (kind === "obtuse-angled") {
      const big = rng.int(10, 15) * 10;
      const x = rng.int(1, Math.floor((180 - big) / 10) - 1) * 10;
      angles = [big, x, 180 - big - x];
    } else {
      const a = rng.int(5, 8) * 10;
      const b = rng.int(Math.max(5, 10 - a / 10), 8) * 10;
      angles = [a, b, 180 - a - b];
      if (angles.some((x) => x >= 90) || (a === 60 && b === 60)) angles = [70, 50, 60];
    }
    angles = rng.shuffle(angles);
    return {
      question: `A triangle has angles of ${angles.join("°, ")}°. What type of triangle is it, by its angles?`,
      answer: `${kind} triangle`,
      wrong: ["right-angled", "obtuse-angled", "acute-angled"].filter((k) => k !== kind).map((k) => `${k} triangle`),
      hint: "One right angle: right-angled. One angle over 90°: obtuse-angled. All under 90°: acute-angled.",
      explanation: `With angles ${angles.join("°, ")}°, it is ${article(kind)} triangle.`,
      difficulty: "medium",
    };
  },
};

const QUADS = [
  {
    name: "trapezium",
    truth: "It has exactly one pair of parallel sides",
    lies: ["All four sides must be equal", "It has two pairs of parallel sides", "All its angles are right angles"],
  },
  {
    name: "parallelogram",
    truth: "Its opposite sides are parallel and equal",
    lies: ["It has exactly one pair of parallel sides", "All four angles must be right angles", "It has no equal sides"],
  },
  {
    name: "rhombus",
    truth: "All four of its sides are equal",
    lies: ["All four angles must be right angles", "It has exactly one pair of parallel sides", "It has no parallel sides"],
  },
  {
    name: "square",
    truth: "It has four equal sides and four right angles",
    lies: ["Only two of its sides are equal", "It has exactly one pair of parallel sides", "It has no right angles"],
  },
  {
    name: "rectangle",
    truth: "Its opposite sides are equal and all four angles are right angles",
    lies: ["All four sides must be equal", "It has no parallel sides", "It has exactly one right angle"],
  },
];

const quadrilaterals: Family = {
  skill: "geometry",
  label: "Quadrilaterals",
  make(rng, params) {
    const chosen = params.map((i) => QUADS[i]).filter(Boolean);
    const quad = rng.pick(chosen.length > 0 ? chosen : QUADS);
    const variant = rng.int(0, 2);

    if (variant === 0) {
      return {
        question: `Which statement is true for every ${quad.name}?`,
        answer: quad.truth,
        wrong: quad.lies,
        hint: "Think about its sides, its parallel lines and its angles.",
        explanation: `For every ${quad.name}: ${quad.truth.charAt(0).toLowerCase()}${quad.truth.slice(1)}.`,
        difficulty: "medium",
      };
    }

    const x = rng.int(5, 8) * 10 + rng.pick([0, 5]);
    if (quad.name === "parallelogram" || quad.name === "rhombus") {
      const opposite = variant === 2;
      return {
        question: `In a ${quad.name}, one angle is ${x}°. What is the angle ${opposite ? "opposite" : "next to"} it?`,
        answer: opposite ? x : 180 - x,
        wrong: opposite ? [180 - x, 90, 360 - x, x + 10] : [x, 360 - x, 90, 180 - x + 10],
        hint: opposite ? "Opposite angles of a parallelogram are equal." : "Angles next to each other between parallel sides add up to 180°.",
        explanation: opposite ? `Opposite angles are equal: ${x}°.` : `180° − ${x}° = ${180 - x}°.`,
        difficulty: "medium",
        format: deg,
      };
    }
    if (quad.name === "trapezium") {
      return {
        question: `In trapezium ABCD, AB is parallel to DC. ∠DAB is ${x}°. What is ∠ADC?`,
        answer: 180 - x,
        wrong: [x, 360 - x, 90, 180 - x + 10],
        hint: "The two angles between a pair of parallel sides add up to 180°.",
        explanation: `∠DAB and ∠ADC lie between the parallel sides, so ∠ADC = 180° − ${x}° = ${180 - x}°.`,
        difficulty: "hard",
        format: deg,
      };
    }
    const s = rng.int(3, 15);
    if (quad.name === "square") {
      return variant === 1
        ? {
            question: `A square has a perimeter of ${4 * s} cm. How long is each side?`,
            answer: s,
            wrong: [2 * s, 4 * s, s + 4, s * s],
            hint: "A square has 4 equal sides.",
            explanation: `${4 * s} ÷ 4 = ${s} cm.`,
            difficulty: "easy",
            format: unit(" cm"),
          }
        : {
            question: `A square has sides of ${s} cm. What is the size of each of its angles?`,
            answer: 90,
            wrong: [45, 60, 180, 360],
            hint: "Every corner of a square is a right angle.",
            explanation: "Each angle of a square is a right angle: 90°.",
            difficulty: "easy",
            format: deg,
          };
    }
    const w = rng.int(2, s);
    const l = s + rng.int(1, 6);
    return {
      question: `A rectangle is ${l} cm long and ${w} cm wide. What is its perimeter?`,
      answer: 2 * (l + w),
      wrong: [l * w, l + w, 4 * l, 2 * l + w],
      hint: "Opposite sides of a rectangle are equal. Add all four sides.",
      explanation: `${l} + ${w} + ${l} + ${w} = ${2 * (l + w)} cm.`,
      difficulty: "easy",
      format: unit(" cm"),
    };
  },
};

const anglesInShapes: Family = {
  skill: "geometry",
  label: "Angles in shapes",
  make(rng) {
    const variant = rng.int(0, 3);
    if (variant === 0) {
      const s = rng.pick([
        { name: "rectangle", right: 4 },
        { name: "square", right: 4 },
        { name: "right-angled triangle", right: 1 },
        { name: "equilateral triangle", right: 0 },
      ]);
      return {
        question: `How many right angles does ${article(s.name)} have?`,
        answer: s.right,
        wrong: [0, 1, 2, 3, 4],
        hint: "A right angle is a square corner.",
        explanation: `${capital(article(s.name))} has ${s.right} right angle${s.right === 1 ? "" : "s"}.`,
        difficulty: "easy",
      };
    }
    if (variant === 1) {
      const poly = rng.pick(POLYGONS);
      return {
        question: `How many angles does ${article(poly.name)} have?`,
        answer: poly.sides,
        wrong: POLYGONS.map((p) => p.sides),
        hint: "A flat shape has as many angles as it has sides.",
        explanation: `${capital(article(poly.name))} has ${poly.sides} sides and ${poly.sides} angles.`,
        difficulty: "easy",
      };
    }
    if (variant === 2) {
      return {
        question: "Which shape has no right angles?",
        answer: "an equilateral triangle",
        wrong: ["a square", "a rectangle", "a right-angled triangle"],
        hint: "Look for a shape with no square corners.",
        explanation: "Every angle of an equilateral triangle is 60°, so it has no right angles.",
        difficulty: "medium",
      };
    }
    const [p] = twoNames(rng);
    const sides = rng.int(4, 8);
    return {
      question: `${p} draws a shape with ${sides} straight sides. How many angles does the shape have?`,
      answer: sides,
      wrong: [sides - 1, sides + 1, sides * 2, 4],
      hint: "Each corner of the shape is one angle.",
      explanation: `A shape with ${sides} sides has ${sides} angles.`,
      difficulty: "easy",
    };
  },
};

/* ── Similarity and congruence ────────────────────────────────────────────── */

const similarity: Family = {
  skill: "geometry",
  label: "Similarity and congruence",
  make(rng) {
    const variant = rng.int(0, 3);
    const k = rng.int(2, 4);
    const a = rng.int(3, 9);
    const b = rng.int(3, 9);
    if (variant === 0) {
      return {
        question: `Triangles ABC and PQR are similar, with AB matching PQ and BC matching QR. AB = ${a} cm, PQ = ${a * k} cm and BC = ${b} cm. Find QR.`,
        answer: b * k,
        wrong: [b + (a * k - a), b * k + 1, b, a * k],
        hint: "Similar shapes are enlargements: every side is multiplied by the same scale factor.",
        explanation: `The scale factor is ${a * k} ÷ ${a} = ${k}, so QR = ${b} × ${k} = ${b * k} cm.`,
        difficulty: "medium",
        format: unit(" cm"),
      };
    }
    if (variant === 1) {
      return {
        question: `Two similar triangles have matching sides of ${a} cm and ${a * k} cm. What is the scale factor from the smaller to the larger?`,
        answer: k,
        wrong: [a * k - a, k + 1, a, k * k],
        hint: "Divide a side of the larger triangle by the matching side of the smaller one.",
        explanation: `${a * k} ÷ ${a} = ${k}.`,
        difficulty: "easy",
      };
    }
    if (variant === 2) {
      return {
        question: `Two similar shapes have lengths in the ratio 1 : ${k}. What is the ratio of their areas?`,
        answer: `1 : ${k * k}`,
        wrong: [`1 : ${k}`, `1 : ${k * k * k}`, `1 : ${2 * k}`],
        hint: "Area depends on two lengths multiplied together.",
        explanation: `Areas scale by the square of the length scale factor: 1 : ${k}² = 1 : ${k * k}.`,
        difficulty: "hard",
      };
    }
    return {
      question: "Which of these is NOT enough to prove two triangles are congruent?",
      answer: "AAA (three equal angles)",
      wrong: ["SSS (three equal sides)", "SAS (two sides and the included angle)", "ASA (two angles and the included side)"],
      hint: "Two triangles can have the same angles but be different sizes.",
      explanation: "Equal angles only show the triangles are similar; they could be different sizes.",
      difficulty: "medium",
    };
  },
};

export const GEOMETRY_FAMILIES: Record<string, Family> = {
  "shapes-2d": shapes2d,
  "shapes-3d": shapes3d,
  symmetry,
  lines,
  "angle-types": angleTypes,
  "angles-line": anglesOnLine,
  "angles-point": anglesAtPoint,
  "triangle-angles": triangleAngles,
  "triangle-types": triangleTypes,
  quadrilaterals,
  "angles-in-shapes": anglesInShapes,
  similarity,
};
