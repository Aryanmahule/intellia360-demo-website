/**
 * In-memory stand-in for the slice of Prisma the adaptive code uses.
 *
 * Any table name works (`db.skillMastery`, `db.completedLesson`, …). Supported:
 * create, findFirst, findUnique, findMany, updateMany, update, with equality,
 * `{ in: [...] }` and `{ gte, lt }` filters, compound unique keys,
 * `{ increment }` updates, `select` on top-level fields and, on findMany, a
 * single-field `orderBy` and `take`.
 *
 * Transactions run one at a time against a copy of the data and commit only on
 * success — the isolation a MongoDB replica-set transaction gives the real
 * code — so idempotency and concurrency paths can be tested without a database.
 * Test-only; never imported by application code.
 */
import { randomUUID } from "crypto";

export type Row = Record<string, unknown> & { id: string };
export type Tables = Record<string, Row[]>;

/** Compound unique keys, as Prisma names them, mapped to their fields. */
const COMPOUND_KEYS: Record<string, string[]> = {
  userId_grade_skill: ["userId", "grade", "skill"],
  userId_lessonId: ["userId", "lessonId"],
  userId_dateKey: ["userId", "dateKey"],
  userId_feature_periodKey: ["userId", "feature", "periodKey"],
};

/** Unique constraints the fake enforces on create. */
const UNIQUE: Record<string, string[][]> = {
  skillMastery: [["userId", "grade", "skill"]],
  dailyQuizAttempt: [["userId", "dateKey"]],
  // Billing (src/lib/billing)
  usageCounter: [["userId", "feature", "periodKey"]],
  webhookEvent: [["eventId"]],
  payment: [["transactionId"]],
  membershipSubscription: [["gatewayId"]],
  familyLink: [["learnerUserId"]],
  familyLinkCode: [["codeHash"]],
  billingSettings: [["id"]],
  billingProfile: [["userId"]],
};

/** Schema defaults, evaluated per create like Prisma's `@default(now())`. */
const DEFAULTS: Record<string, () => Record<string, unknown>> = {
  quizSession: () => ({ status: "OPEN" }),
  skillMastery: () => ({ version: 0 }),
  dailyQuizAttempt: () => ({ completedAt: new Date() }),
  membershipSubscription: () => ({
    status: "CREATED",
    cancelAtPeriodEnd: false,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    graceUntil: null,
    trialEndsAt: null,
    startedAt: null,
    country: null,
    pendingChange: null,
    lastSyncedAt: null,
    razorpayPlanId: null,
  }),
  membershipGrant: () => ({ revokedAt: null, reason: null }),
  webhookEvent: () => ({ status: "RECEIVED", error: null, processedAt: null }),
  familyLinkCode: () => ({ usedAt: null }),
  usageCounter: () => ({ count: 0 }),
  planPrice: () => ({ active: true, version: 1, razorpayPlans: null, retiredAt: null }),
  billingSettings: () => ({ familyDiscountPercent: 25 }),
};

type Comparable = number | string | Date;

function compare(a: Comparable, b: Comparable): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  return x < y ? -1 : x > y ? 1 : 0;
}

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (COMPOUND_KEYS[key]) {
      const k = value as Record<string, unknown>;
      return COMPOUND_KEYS[key].every((field) => row[field] === k[field]);
    }
    // Prisma writes null for an optional field left out of a create.
    if (value === null) return row[key] === null || row[key] === undefined;
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const op = value as Record<string, unknown>;
      if ("in" in op) return (op.in as unknown[]).includes(row[key]);
      if ("not" in op) return row[key] !== op.not;
      if ("hasSome" in op) {
        const list = row[key];
        return Array.isArray(list) && (op.hasSome as unknown[]).some((v) => list.includes(v));
      }
      if ("has" in op) return Array.isArray(row[key]) && (row[key] as unknown[]).includes(op.has);
      if ("gte" in op || "lt" in op || "gt" in op || "lte" in op) {
        const range = op as { gte?: Comparable; lt?: Comparable; gt?: Comparable; lte?: Comparable };
        const field = row[key] as Comparable | null | undefined;
        if (field === null || field === undefined) return false;
        return (
          (range.gte === undefined || compare(field, range.gte) >= 0) &&
          (range.gt === undefined || compare(field, range.gt) > 0) &&
          (range.lt === undefined || compare(field, range.lt) < 0) &&
          (range.lte === undefined || compare(field, range.lte) <= 0)
        );
      }
    }
    return row[key] === value;
  });
}

/** `orderBy: { field: "asc" | "desc" }` and `take`, as findMany applies them. */
function orderAndTake(list: Row[], orderBy?: Record<string, "asc" | "desc">, take?: number): Row[] {
  let out = list;
  const [field, direction] = Object.entries(orderBy ?? {})[0] ?? [];
  if (field) {
    out = [...out].sort((a, b) => compare(a[field] as Comparable, b[field] as Comparable) * (direction === "desc" ? -1 : 1));
  }
  return take === undefined ? out : out.slice(0, take);
}

function applyData(row: Row, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in (value as object)) {
      row[key] = ((row[key] as number) ?? 0) + (value as { increment: number }).increment;
    } else {
      row[key] = value;
    }
  }
}

function project(row: Row, select?: Record<string, unknown>): Row {
  if (!select) return { ...row };
  const out: Row = { id: row.id };
  for (const key of Object.keys(select)) out[key] = row[key];
  return out;
}

export interface FakeHooks {
  beforeUpdateMany?: (table: string, draft: Tables) => void | Promise<void>;
  /** Runs before every operation; throw from it to simulate a failing table. */
  beforeOperation?: (table: string, op: string) => void;
}

type Args = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
  select?: Record<string, unknown>;
  orderBy?: Record<string, "asc" | "desc">;
  take?: number;
};

function delegate(t: Tables, name: string, hooks: FakeHooks) {
  // Reads never create a table, so a read-only request leaves the data identical.
  const rows = () => t[name] ?? [];
  const ops = {
    async create({ data = {}, select }: Args) {
      for (const fields of UNIQUE[name] ?? []) {
        if (rows().some((r) => fields.every((f) => r[f] === data[f]))) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
      }
      const row: Row = { id: randomUUID(), createdAt: new Date(), ...DEFAULTS[name]?.(), ...data } as Row;
      (t[name] ??= []).push(row);
      return project(row, select);
    },
    async findFirst({ where, select }: Args = {}) {
      const row = rows().find((r) => matches(r, where));
      return row ? project(row, select) : null;
    },
    async findUnique({ where, select }: Args = {}) {
      const row = rows().find((r) => matches(r, where));
      return row ? project(row, select) : null;
    },
    async findMany({ where, select, orderBy, take }: Args = {}) {
      return orderAndTake(rows().filter((r) => matches(r, where)), orderBy, take).map((r) => project(r, select));
    },
    async updateMany({ where, data = {} }: Args) {
      await hooks.beforeUpdateMany?.(name, t);
      const hit = rows().filter((r) => matches(r, where));
      hit.forEach((r) => applyData(r, data));
      return { count: hit.length };
    },
    async update({ where, data = {} }: Args) {
      const row = rows().find((r) => matches(r, where));
      if (!row) throw Object.assign(new Error("Record not found"), { code: "P2025" });
      applyData(row, data);
      return { ...row };
    },
    async upsert({ where, create = {}, update = {} }: Args) {
      const row = rows().find((r) => matches(r, where));
      if (row) {
        applyData(row, update);
        return { ...row };
      }
      return ops.create({ data: create });
    },
    async createMany(args: Args = {}) {
      // createMany takes a list of rows where every other operation takes one.
      const data = (args.data ?? []) as unknown as Record<string, unknown>[];
      for (const row of data) await ops.create({ data: row });
      return { count: data.length };
    },
    async count({ where }: Args = {}) {
      return rows().filter((r) => matches(r, where)).length;
    },
    async deleteMany({ where }: Args = {}) {
      const keep = rows().filter((r) => !matches(r, where));
      const removed = rows().length - keep.length;
      if (t[name]) t[name] = keep;
      return { count: removed };
    },
  };
  type Op = keyof typeof ops;
  return Object.fromEntries(
    (Object.keys(ops) as Op[]).map((op) => [
      op,
      async (args: Args) => {
        hooks.beforeOperation?.(name, op);
        return ops[op](args);
      },
    ])
  ) as typeof ops;
}

function client(t: Tables, hooks: FakeHooks) {
  return new Proxy({} as Record<string, ReturnType<typeof delegate>>, {
    get: (_target, prop) => (typeof prop === "string" ? delegate(t, prop, hooks) : undefined),
  });
}

export function createFakeDb(hooks: FakeHooks = {}) {
  let committed: Tables = {};
  let queue: Promise<unknown> = Promise.resolve();
  let transactions = 0;

  async function $transaction<T>(fn: (tx: ReturnType<typeof client>) => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      transactions++;
      const draft = structuredClone(committed);
      const result = await fn(client(draft, hooks));
      committed = draft; // commit only when the callback succeeded
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  const db = new Proxy({} as Record<string, unknown>, {
    get: (_target, prop) => {
      if (prop === "$transaction") return $transaction;
      return typeof prop === "string" ? delegate(committed, prop, hooks) : undefined;
    },
  });

  return {
    db,
    /** Live committed rows for a table (mutating them seeds data). */
    table: (name: string): Row[] => (committed[name] ??= []),
    tables: () => committed,
    transactionCount: () => transactions,
  };
}
