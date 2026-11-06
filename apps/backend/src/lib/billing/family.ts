/**
 * Family links: a parent pays for children who have their own accounts.
 *
 * The child (signed in to their own account) generates a short code and gives
 * it to the parent, who enters it. That proves the parent has access to the
 * child's account, so nobody can attach a stranger's account to their family.
 * Codes are stored only as SHA-256 hashes and expire after a day.
 */
import crypto from "crypto";
import { BillingError, isUniqueViolation, type BillingDb } from "./deps";

const CODE_TTL_MS = 24 * 60 * 60 * 1000;
// No 0/O, 1/I/L: codes are read aloud and typed by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(normaliseCode(code)).digest("hex");
}

function newCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Display form: ABCD-EFGH. */
export function formatCode(code: string): string {
  const c = normaliseCode(code);
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

export async function createLinkCode(db: BillingDb, learnerUserId: string, now: Date): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  // Earlier unused codes stop working: only the newest one is live.
  await db.familyLinkCode.updateMany({ where: { learnerUserId, usedAt: null }, data: { usedAt: now } });
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode();
    try {
      await db.familyLinkCode.create({ data: { codeHash: hashCode(code), learnerUserId, expiresAt } });
      return { code: formatCode(code), expiresAt };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error("Could not generate a unique link code");
}

/** Link the child behind `code` to `parentUserId`. Returns the child's user id. */
export async function linkWithCode(db: BillingDb, parentUserId: string, code: string, now: Date): Promise<string> {
  const normalised = normaliseCode(code);
  if (normalised.length !== CODE_LENGTH) throw new BillingError("Enter the 8-character code from your child's account.");

  const row = await db.familyLinkCode.findUnique({ where: { codeHash: hashCode(normalised) } });
  if (!row || row.usedAt || row.expiresAt <= now) {
    throw new BillingError("That code is not valid. Codes expire after 24 hours; ask your child for a new one.");
  }
  if (row.learnerUserId === parentUserId) throw new BillingError("That code is for your own account.");

  const existing = await db.familyLink.findUnique({ where: { learnerUserId: row.learnerUserId } });
  if (existing && existing.parentUserId !== parentUserId) {
    throw new BillingError("That child is already linked to another parent account.", 409);
  }
  if (existing?.parentUserId === parentUserId) {
    await db.familyLinkCode.update({ where: { id: row.id }, data: { usedAt: now } });
    return row.learnerUserId;
  }

  const learner = await db.user.findUnique({ where: { id: row.learnerUserId }, select: { id: true, deletedAt: true } });
  if (!learner || learner.deletedAt) throw new BillingError("That account no longer exists.", 404);

  const parentIsLinked = await db.familyLink.findUnique({ where: { learnerUserId: parentUserId } });
  if (parentIsLinked) throw new BillingError("Your account is itself linked to a parent, so it cannot add children.", 409);

  try {
    await db.familyLink.create({ data: { parentUserId, learnerUserId: row.learnerUserId } });
  } catch (err) {
    if (isUniqueViolation(err)) throw new BillingError("That child is already linked to another parent account.", 409);
    throw err;
  }
  await db.familyLinkCode.update({ where: { id: row.id }, data: { usedAt: now } });
  return row.learnerUserId;
}

export async function unlink(db: BillingDb, parentUserId: string, learnerUserId: string): Promise<void> {
  const result = await db.familyLink.deleteMany({ where: { parentUserId, learnerUserId } });
  if (result.count === 0) throw new BillingError("That child is not linked to your account.", 404);
}

/**
 * The learners a payer may buy for: themselves, then their linked children.
 */
export async function payableLearners(
  db: BillingDb,
  payer: { userId: string; name: string }
): Promise<{ id: string; name: string; self: boolean }[]> {
  const links = await db.familyLink.findMany({ where: { parentUserId: payer.userId } });
  const ids = links.map((l) => l.learnerUserId);
  const users = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, deletedAt: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return [
    { id: payer.userId, name: payer.name, self: true },
    ...ids
      .map((id) => byId.get(id))
      .filter((u): u is NonNullable<typeof u> => !!u && !u.deletedAt)
      .map((u) => ({ id: u.id, name: u.name, self: false })),
  ];
}
