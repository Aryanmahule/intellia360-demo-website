/**
 * Persistence for skill mastery.
 *
 * Evidence is recorded by recordEvidenceSafely, right after the submission it
 * belongs to has committed, in a transaction of its own. Only the request that
 * committed the submission (won the session claim, created the daily attempt)
 * gets there, so evidence lands at most once per submission. And because it is
 * separate, nothing that goes wrong in the adaptive tables can fail a quiz
 * submission, its XP or the daily streak — those behave exactly as before.
 *
 * Concurrency: each row carries a `version`. An update only applies when the
 * version is unchanged since it was read; otherwise (or when two requests race
 * to create the same row) a ConcurrentUpdateError aborts the transaction and
 * withTransactionRetry runs it again against fresh data. MongoDB's own
 * write-conflict error (Prisma P2034) is retried the same way.
 */
import type { Prisma } from "@prisma/client";
import { ADAPTIVE_CONFIG, type Difficulty } from "@/lib/adaptive/config";
import {
  computeMastery,
  EMPTY_RECORD,
  mergeEvidence,
  parseEvidence,
  type EvidenceItem,
  type EvidenceSource,
  type MasteryRecord,
} from "@/lib/adaptive/mastery";
import { skillLabel } from "@/lib/adaptive/skill-map";
import type { QuizMasteryChange } from "@intellia360/shared/types/api/adaptive-learning";

export class ConcurrentUpdateError extends Error {
  constructor(message = "Concurrent update — retry") {
    super(message);
    this.name = "ConcurrentUpdateError";
  }
}

export interface SkillMasteryRow {
  id: string;
  skill: string;
  attempts: number;
  correct: number;
  recent: Prisma.JsonValue;
  difficultyLevel: number;
  lastPracticedAt: Date | null;
  version: number;
}

/** The slice of the Prisma client mastery reads and writes need. */
export type MasteryClient = Pick<Prisma.TransactionClient, "skillMastery">;

export function toRecord(row: SkillMasteryRow | null | undefined): MasteryRecord {
  if (!row) return EMPTY_RECORD;
  return {
    attempts: row.attempts,
    correct: row.correct,
    recent: parseEvidence(row.recent),
    lastPracticedAt: row.lastPracticedAt,
    difficultyLevel: row.difficultyLevel,
  };
}

export async function loadSkillRows(
  client: MasteryClient,
  userId: string,
  grade: string
): Promise<SkillMasteryRow[]> {
  return client.skillMastery.findMany({
    where: { userId, grade },
    select: {
      id: true,
      skill: true,
      attempts: true,
      correct: true,
      recent: true,
      difficultyLevel: true,
      lastPracticedAt: true,
      version: true,
    },
  });
}

/**
 * Question id → recency rank across all of a student's skills (0 = answered
 * most recently). Used to avoid serving the same questions again and again.
 */
export function recentlySeenQuestions(rows: SkillMasteryRow[], limit = ADAPTIVE_CONFIG.quiz.recentlySeenWindow) {
  const all: { q: string; at: number; pos: number }[] = [];
  for (const row of rows) {
    parseEvidence(row.recent).forEach((item, pos) => all.push({ q: item.q, at: Date.parse(item.at) || 0, pos }));
  }
  all.sort((a, b) => b.at - a.at || b.pos - a.pos);
  const ranks = new Map<string, number>();
  for (const item of all) {
    if (ranks.size >= limit) break;
    if (!ranks.has(item.q)) ranks.set(item.q, ranks.size);
  }
  return ranks;
}

export interface GradedResponse {
  questionId: string;
  skill: string;
  difficulty: Difficulty | null;
  correct: boolean;
}

export interface EvidenceArgs {
  userId: string;
  grade: string;
  responses: GradedResponse[];
  source: EvidenceSource;
  now: Date;
}

/**
 * Folds graded responses into each skill's row, inside a transaction. Returns
 * the before/after score per skill. Reads every affected row in one query to
 * keep the transaction short.
 */
export async function applyEvidence(tx: MasteryClient, args: EvidenceArgs): Promise<QuizMasteryChange[]> {
  const { userId, grade, responses, source, now } = args;
  const bySkill = new Map<string, GradedResponse[]>();
  for (const r of responses) {
    const list = bySkill.get(r.skill) ?? [];
    list.push(r);
    bySkill.set(r.skill, list);
  }
  if (bySkill.size === 0) return [];

  const existing = await tx.skillMastery.findMany({
    where: { userId, grade, skill: { in: [...bySkill.keys()] } },
  });
  const rows = new Map(existing.map((r) => [r.skill, r]));

  const changes: QuizMasteryChange[] = [];
  for (const [skill, list] of bySkill) {
    const row = rows.get(skill) ?? null;

    const before = toRecord(row);
    const items: EvidenceItem[] = list.map((r) => ({
      q: r.questionId,
      c: r.correct,
      d: r.difficulty,
      at: now.toISOString(),
      s: source,
    }));
    const after = mergeEvidence(before, items, now);
    const beforeMastery = computeMastery(before, now);
    const afterMastery = computeMastery(after, now);

    const data = {
      attempts: after.attempts,
      correct: after.correct,
      recent: after.recent as unknown as Prisma.InputJsonValue,
      difficultyLevel: after.difficultyLevel,
      masteryScore: afterMastery.score,
      lastPracticedAt: now,
    };

    if (row) {
      const { count } = await tx.skillMastery.updateMany({
        where: { id: row.id, version: row.version },
        data: { ...data, version: { increment: 1 } },
      });
      if (count !== 1) throw new ConcurrentUpdateError(`skill_mastery ${row.id} changed underneath us`);
    } else {
      try {
        await tx.skillMastery.create({ data: { userId, grade, skill, ...data } });
      } catch (err) {
        if (prismaCode(err) === "P2002") throw new ConcurrentUpdateError("skill_mastery created concurrently");
        throw err;
      }
    }

    changes.push({
      skill,
      label: skillLabel(skill),
      before: beforeMastery.score,
      after: afterMastery.score,
      band: afterMastery.band,
      bandLabel: afterMastery.bandLabel,
    });
  }
  return changes;
}

function prismaCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Errors that mean "someone else wrote first" — safe to retry from scratch. */
export function isRetryableConflict(err: unknown): boolean {
  return err instanceof ConcurrentUpdateError || prismaCode(err) === "P2034";
}

/** Runs a transaction, retrying on write conflicts with a short backoff. */
export async function withTransactionRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= attempts || !isRetryableConflict(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt + Math.floor(Math.random() * 15)));
    }
  }
}

/** A client that can open a transaction over the mastery table. */
export interface MasteryDb {
  $transaction<T>(fn: (tx: MasteryClient) => Promise<T>): Promise<T>;
}

/**
 * Records evidence after its submission has committed. Never throws: on any
 * failure the evidence is skipped (logged) and the caller carries on — the
 * student's submission, XP and streak are already safely stored.
 */
export async function recordEvidenceSafely(db: MasteryDb, args: EvidenceArgs): Promise<QuizMasteryChange[] | null> {
  try {
    return await withTransactionRetry(() => db.$transaction((tx) => applyEvidence(tx, args)));
  } catch (err) {
    console.error("[adaptive] mastery update skipped:", err);
    return null;
  }
}
