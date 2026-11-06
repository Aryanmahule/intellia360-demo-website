/**
 * Every lesson test question family, by id.
 *
 * Family ids are part of question ids (see core.ts), so renaming one breaks
 * the questions of sessions still open and the mistakes list's lookups.
 */
import { decodeQuestionId, writeQuestion, type Family, type GeneratedQuestion } from "@/lib/lesson-test/core";
import { DATA_FAMILIES } from "@/lib/lesson-test/families/data";
import { FRACTION_FAMILIES } from "@/lib/lesson-test/families/fractions";
import { GEOMETRY_FAMILIES } from "@/lib/lesson-test/families/geometry";
import { MEASUREMENT_FAMILIES } from "@/lib/lesson-test/families/measurement";
import { NUMBER_FAMILIES } from "@/lib/lesson-test/families/numbers";
import { OPERATION_FAMILIES } from "@/lib/lesson-test/families/operations";

export const FAMILY_GROUPS: Record<string, Record<string, Family>> = {
  numbers: NUMBER_FAMILIES,
  operations: OPERATION_FAMILIES,
  fractions: FRACTION_FAMILIES,
  measurement: MEASUREMENT_FAMILIES,
  geometry: GEOMETRY_FAMILIES,
  data: DATA_FAMILIES,
};

export const FAMILIES: Record<string, Family> = Object.assign({}, ...Object.values(FAMILY_GROUPS));

/** Rebuilds a generated question, answer key included, from its id alone. */
export function generatedQuestion(id: string): GeneratedQuestion | null {
  const decoded = decodeQuestionId(id);
  if (!decoded) return null;
  try {
    return writeQuestion(FAMILIES, decoded.family, decoded.params, decoded.seed);
  } catch (err) {
    console.error("[lesson-test] could not rebuild question", id, err);
    return null;
  }
}
