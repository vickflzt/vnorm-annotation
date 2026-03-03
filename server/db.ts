import {
  and, asc, desc, eq, lt, sql
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  experimentConfig,
  itemResponses,
  mixSessionTemplates,
  participantSessions,
  questionBank,
  users,
  violationEvents,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User helpers ─────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Question Bank ────────────────────────────────────────────────────────────
export async function getAllQuestions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(questionBank).orderBy(asc(questionBank.itemId));
}

export async function getQuestionByItemId(itemId: string, version = "v1") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(questionBank).where(
    and(eq(questionBank.itemId, itemId), eq(questionBank.version, version))
  ).limit(1);
  return result[0];
}

export async function getQuestionsByItemIds(itemIds: string[], version = "v1") {
  const db = await getDb();
  if (!db) return [];
  if (itemIds.length === 0) return [];
  const results = await db.select().from(questionBank).where(eq(questionBank.version, version));
  return results.filter((q) => itemIds.includes(q.itemId));
}

/**
 * Sample 15 MATH500 questions for a session using quota-aware priority.
 * Prioritises items with the lowest count for the given condition.
 */
export async function sampleQuestionsForSession(
  condition: "AO" | "AJ",
  version = "v1"
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  // Get all non-GSM questions that still need annotations
  const countCol = condition === "AO" ? questionBank.countAO : questionBank.countAJ;
  const rows = await db
    .select()
    .from(questionBank)
    .where(
      and(
        lt(countCol, questionBank.targetCount),
        sql`${questionBank.category} != 'GSM-CHECK'`,
        eq(questionBank.version, version)
      )
    )
    .orderBy(asc(countCol));
  // Shuffle within same-count groups
  const shuffled = rows.sort((a, b) => {
    const ca = condition === "AO" ? a.countAO : a.countAJ;
    const cb = condition === "AO" ? b.countAO : b.countAJ;
    if (ca !== cb) return ca - cb;
    return Math.random() - 0.5;
  });
  // ── Deduplication: ensure no two items share the same question text ──
  const selected: typeof shuffled = [];
  const seenQuestions = new Set<string>();
  for (const item of shuffled) {
    const qKey = (item.question ?? "").trim().slice(0, 200);
    if (!seenQuestions.has(qKey)) {
      seenQuestions.add(qKey);
      selected.push(item);
    }
    if (selected.length === 15) break;
  }
  const selectedIds = selected.map((q) => q.itemId);
  // If quota is full for all items, fall back to random 15 from all MATH500 (with dedup)
  if (selectedIds.length < 15) {
    const all = await db
      .select({ itemId: questionBank.itemId, question: questionBank.question })
      .from(questionBank)
      .where(and(
        sql`${questionBank.category} != 'GSM-CHECK'`,
        eq(questionBank.version, version)
      ));
    const allShuffled = all.sort(() => Math.random() - 0.5);
    const fallback: string[] = [];
    const fallbackSeen = new Set<string>();
    for (const item of allShuffled) {
      const qKey = (item.question ?? "").trim().slice(0, 200);
      if (!fallbackSeen.has(qKey)) {
        fallbackSeen.add(qKey);
        fallback.push(item.itemId);
      }
      if (fallback.length === 15) break;
    }
    return fallback;
  }
  return selectedIds;
}

export async function incrementQuestionCount(
  itemId: string,
  condition: "AO" | "AJ",
  version = "v1"
) {
  const db = await getDb();
  if (!db) return;
  if (condition === "AO") {
    await db
      .update(questionBank)
      .set({ countAO: sql`${questionBank.countAO} + 1` })
      .where(and(eq(questionBank.itemId, itemId), eq(questionBank.version, version)));
  } else {
    await db
      .update(questionBank)
      .set({ countAJ: sql`${questionBank.countAJ} + 1` })
      .where(and(eq(questionBank.itemId, itemId), eq(questionBank.version, version)));
  }
}

// ─── Participant Sessions ─────────────────────────────────────────────────────
export async function createSession(
  participantId: string,
  condition: "AO" | "AJ",
  assignedItems: string[]
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(participantSessions).values({
    participantId,
    condition,
    assignedItems: JSON.stringify(assignedItems),
    status: "consent",
    currentIndex: 0,
    violationCount: 0,
    consentGiven: false,
  });
}

/** Create a MIX session with per-item conditions */
export async function createMixSession(
  participantId: string,
  assignedItems: Array<{ itemId: string; condition: "AO" | "AJ" }>,
  mixTemplateId: number,
  mixSlot: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(participantSessions).values({
    participantId,
    condition: "MIX",
    assignedItems: JSON.stringify(assignedItems),
    status: "consent",
    currentIndex: 0,
    violationCount: 0,
    consentGiven: false,
    mixTemplateId,
    mixSlot,
  });
}

export async function getSession(participantId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(participantSessions)
    .where(eq(participantSessions.participantId, participantId))
    .limit(1);
  return result[0];
}

export async function saveParticipantCode(
  participantId: string,
  participantCode: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(participantSessions)
    .set({ participantCode })
    .where(eq(participantSessions.participantId, participantId));
}

export async function updateSessionStatus(
  participantId: string,
  status: "consent" | "instructions" | "active" | "completed" | "terminated",
  extra?: {
    currentIndex?: number;
    consentGiven?: boolean;
    startedAt?: Date;
    completedAt?: Date;
    totalTimeSeconds?: number;
    passedAttentionCheck?: boolean;
    violationCount?: number;
  }
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(participantSessions)
    .set({ status, ...extra })
    .where(eq(participantSessions.participantId, participantId));
}

export async function getAllSessions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(participantSessions).orderBy(desc(participantSessions.createdAt));
}

// ─── Item Responses ───────────────────────────────────────────────────────────
export async function saveItemResponse(data: {
  participantId: string;
  itemId: string;
  category: "TP" | "TN" | "FP" | "FN" | "GSM-CHECK";
  condition: "AO" | "AJ";
  questionIndex: number;
  responseCorrect: boolean | null;
  rtSeconds: number;
  timedOut: boolean;
  helpfulness?: number | null;
  confidenceRating?: number | null;
  confidenceRtSeconds?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(itemResponses).values({
    ...data,
    submittedAt: new Date(),
  });
}

export async function getResponsesByParticipant(participantId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(itemResponses)
    .where(eq(itemResponses.participantId, participantId))
    .orderBy(asc(itemResponses.questionIndex));
}

export async function getAllResponses() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(itemResponses).orderBy(asc(itemResponses.participantId), asc(itemResponses.questionIndex));
}

// ─── Violation Events ─────────────────────────────────────────────────────────
export async function saveViolation(data: {
  participantId: string;
  violationType:
    | "tab_switch"
    | "window_blur"
    | "visibility_hidden"
    | "screenshot_attempt"
    | "copy_attempt"
    | "paste_attempt"
    | "right_click"
    | "devtools_open";
  questionIndex?: number;
  itemId?: string;
  sessionTerminated: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(violationEvents).values({
    ...data,
    occurredAt: new Date(),
  });
}

export async function getViolationsByParticipant(participantId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(violationEvents)
    .where(eq(violationEvents.participantId, participantId))
    .orderBy(asc(violationEvents.occurredAt));
}

export async function getAllViolations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(violationEvents).orderBy(desc(violationEvents.occurredAt));
}

// ─── Experiment Config ───────────────────────────────────────────────────────
export async function getExperimentConfig() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(experimentConfig).orderBy(asc(experimentConfig.condition));
}

export async function getExperimentConfigByCondition(condition: "AO" | "AJ" | "MIX") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(experimentConfig)
    .where(eq(experimentConfig.condition, condition))
    .limit(1);
  return result[0];
}
export async function getExperimentConfigByToken(token: string) {
  // Reject empty tokens to prevent matching rows with empty inviteToken
  if (!token || token.trim() === "") return undefined;
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(experimentConfig)
    .where(eq(experimentConfig.inviteToken, token))
    .limit(1);
  return result[0];
}

/**
 * Atomically claim a MIX session slot by setting startedAt.
 * Returns the participantId if successful, null if no slot was available.
 * Uses UPDATE ... WHERE startedAt IS NULL to prevent race conditions.
 */
export async function claimMixSession(): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  // Get all unclaimed MIX sessions (status=consent, startedAt IS NULL)
  const available = await db
    .select({ participantId: participantSessions.participantId })
    .from(participantSessions)
    .where(
      and(
        eq(participantSessions.condition, "MIX"),
        eq(participantSessions.status, "consent"),
        sql`${participantSessions.startedAt} IS NULL`
      )
    )
    .orderBy(asc(participantSessions.mixTemplateId), asc(participantSessions.mixSlot))
    .limit(1);
  if (available.length === 0) return null;
  const candidateId = available[0].participantId;
  // Atomically claim: only update if startedAt is still NULL
  const result = await db
    .update(participantSessions)
    .set({ startedAt: new Date() })
    .where(
      and(
        eq(participantSessions.participantId, candidateId),
        sql`${participantSessions.startedAt} IS NULL`
      )
    );
  // Check if the update actually affected a row
  const affectedRows = (result as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
  if (affectedRows === 0) {
    // Another request claimed this slot first; retry once
    const retry = await db
      .select({ participantId: participantSessions.participantId })
      .from(participantSessions)
      .where(
        and(
          eq(participantSessions.condition, "MIX"),
          eq(participantSessions.status, "consent"),
          sql`${participantSessions.startedAt} IS NULL`
        )
      )
      .orderBy(asc(participantSessions.mixTemplateId), asc(participantSessions.mixSlot))
      .limit(1);
    if (retry.length === 0) return null;
    const retryId = retry[0].participantId;
    const retryResult = await db
      .update(participantSessions)
      .set({ startedAt: new Date() })
      .where(
        and(
          eq(participantSessions.participantId, retryId),
          sql`${participantSessions.startedAt} IS NULL`
        )
      );
    const retryAffected = (retryResult as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
    return retryAffected > 0 ? retryId : null;
  }
  return candidateId;
}

export async function upsertExperimentConfig(
  condition: "AO" | "AJ" | "MIX",
  data: { targetParticipants?: number; inviteToken?: string; isOpen?: boolean; questionVersion?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select()
    .from(experimentConfig)
    .where(eq(experimentConfig.condition, condition))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(experimentConfig).values({
      condition,
      targetParticipants: data.targetParticipants ?? 30,
      inviteToken: data.inviteToken ?? "",
      isOpen: data.isOpen ?? true,
    });
  } else {
    await db
      .update(experimentConfig)
      .set(data)
      .where(eq(experimentConfig.condition, condition));
  }
}

export async function getParticipantCountByCondition() {
  const db = await getDb();
  if (!db) return { AO: 0, AJ: 0, MIX: 0 };
  const rows = await db
    .select({ condition: participantSessions.condition, count: sql<number>`COUNT(*)` })
    .from(participantSessions)
    .groupBy(participantSessions.condition);
  const result: Record<string, number> = { AO: 0, AJ: 0, MIX: 0 };
  for (const row of rows) {
    result[row.condition] = Number(row.count);
  }
  return result;
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────
export async function getItemCoverageStats() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      itemId: questionBank.itemId,
      category: questionBank.category,
      countAO: questionBank.countAO,
      countAJ: questionBank.countAJ,
      targetCount: questionBank.targetCount,
    })
    .from(questionBank)
    .where(sql`${questionBank.category} != 'GSM-CHECK'`)
    .orderBy(asc(questionBank.itemId));
}
export async function getItemCoverageStatsByVersion(version = "v1") {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      itemId: questionBank.itemId,
      category: questionBank.category,
      countAO: questionBank.countAO,
      countAJ: questionBank.countAJ,
      targetCount: questionBank.targetCount,
    })
    .from(questionBank)
    .where(and(
      sql`${questionBank.category} != 'GSM-CHECK'`,
      eq(questionBank.version, version)
    ))
    .orderBy(asc(questionBank.itemId));
}
// ─── Quota Reset ───────────────────────────────────────────────────────────────

/**
 * Reset ALL quota: wipe sessions, responses, violations, mix templates, and reset countAO/countAJ to 0.
 * Keeps the question bank and experiment config intact.
 */
export async function resetAllQuota() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(violationEvents);
  await db.delete(itemResponses);
  await db.delete(participantSessions);
  await db.delete(mixSessionTemplates);
  await db.update(questionBank).set({ countAO: 0, countAJ: 0 });
}

/**
 * Release quota held by a single participant:
 * - Decrement countAO/countAJ for each item they were assigned (using item-level condition for MIX)
 * - Delete their responses, violations, and session record
 */
export async function releaseParticipantQuota(participantId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const sessions = await db
    .select()
    .from(participantSessions)
    .where(eq(participantSessions.participantId, participantId))
    .limit(1);

  if (sessions.length === 0) throw new Error("Session not found");
  const session = sessions[0];
  const sessionCondition = session.condition;

  // Parse assignedItems — may be string[] (AO/AJ) or {itemId,condition}[] (MIX)
  type MixItem = { itemId: string; condition: "AO" | "AJ" };
  let assignedItemIds: Array<string | MixItem> = [];
  try {
    const raw = session.assignedItems;
    assignedItemIds = Array.isArray(raw) ? (raw as Array<string | MixItem>) : JSON.parse(String(raw ?? "[]"));
  } catch {
    assignedItemIds = [];
  }

  for (const item of assignedItemIds) {
    const itemId = typeof item === "string" ? item : item.itemId;
    const itemCondition: "AO" | "AJ" =
      sessionCondition === "MIX"
        ? (typeof item === "object" ? item.condition : "AO")
        : (sessionCondition as "AO" | "AJ");

    if (itemCondition === "AO") {
      await db
        .update(questionBank)
        .set({ countAO: sql`GREATEST(0, ${questionBank.countAO} - 1)` })
        .where(eq(questionBank.itemId, itemId));
    } else {
      await db
        .update(questionBank)
        .set({ countAJ: sql`GREATEST(0, ${questionBank.countAJ} - 1)` })
        .where(eq(questionBank.itemId, itemId));
    }
  }

  await db.delete(violationEvents).where(eq(violationEvents.participantId, participantId));
  await db.delete(itemResponses).where(eq(itemResponses.participantId, participantId));
  await db.delete(participantSessions).where(eq(participantSessions.participantId, participantId));
}

// ─── MIX Session Templates ────────────────────────────────────────────────────

export type MixAssignedItem = { itemId: string; condition: "AO" | "AJ" };

/**
 * The fixed quota matrix for 8 templates × 4 cells (TP/TN/FP/FN).
 * Each row sums to 15; each column sums to 30 (= 10 items × 3 annotations).
 */
const QUOTA_MATRIX: Record<string, number[]> = {
  // templateIndex 0..7 → [TP, TN, FP, FN]
  T1: [3, 4, 4, 4],
  T2: [3, 4, 4, 4],
  T3: [4, 3, 4, 4],
  T4: [4, 3, 4, 4],
  T5: [4, 4, 4, 3],
  T6: [4, 4, 4, 3],
  T7: [4, 4, 3, 4],
  T8: [4, 4, 3, 4],
};
const TEMPLATE_KEYS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"] as const;
const CELLS = ["TP", "TN", "FP", "FN"] as const;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Constrained random assignment for one cell.
 * Assigns `items` (10 items) to 8 templates, each item appearing in exactly 3 templates,
 * respecting per-template quotas.
 * Returns a map: templateKey → itemId[]
 * Retries up to 100 times if a dead-end is reached.
 */
function assignCellToTemplates(
  items: string[],
  quotas: number[] // length 8, one per template
): Map<string, string[]> | null {
  const MAX_RETRIES = 100;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const shuffledItems = shuffle(items);
    const remaining = [...quotas]; // remaining quota per template
    const assignment = new Map<string, string[]>(TEMPLATE_KEYS.map((k) => [k, []]));
    let failed = false;

    for (const itemId of shuffledItems) {
      // Find templates with remaining quota > 0
      const eligible = TEMPLATE_KEYS.filter((_, i) => remaining[i] > 0);
      if (eligible.length < 3) { failed = true; break; }

      // Sort eligible by remaining quota descending (greedy), then shuffle ties
      const sorted = shuffle(eligible).sort((a, b) => {
        const ia = TEMPLATE_KEYS.indexOf(a);
        const ib = TEMPLATE_KEYS.indexOf(b);
        return remaining[ib] - remaining[ia];
      });

      const chosen = sorted.slice(0, 3);
      for (const tk of chosen) {
        assignment.get(tk)!.push(itemId);
        remaining[TEMPLATE_KEYS.indexOf(tk)]--;
      }
    }

    if (!failed) return assignment;
  }
  return null; // should not happen with these small numbers
}

/**
 * Generate 8 MIX templates and 16 sessions, then persist them to the database.
 * Each template has 15 MATH500 items (with per-item AO/AJ condition).
 * GSM-CHECK is inserted at position 7 (0-indexed) as AJ for all sessions.
 *
 * Returns the 16 participantIds created.
 */
export async function generateMixSessions(
  participantIdGenerator: () => string,
  version = "v1"
): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // 1. Fetch all MATH500 items grouped by cell
  const allItems = await db
    .select({ itemId: questionBank.itemId, category: questionBank.category, question: questionBank.question })
    .from(questionBank)
    .where(and(
      sql`${questionBank.category} != 'GSM-CHECK'`,
      eq(questionBank.version, version)
    ));;

  const cellItems: Record<string, string[]> = { TP: [], TN: [], FP: [], FN: [] };
  for (const item of allItems) {
    if (item.category in cellItems) {
      cellItems[item.category].push(item.itemId);
    }
  }

  // Validate we have exactly 10 items per cell
  for (const cell of CELLS) {
    if (cellItems[cell].length !== 10) {
      throw new Error(`Expected 10 ${cell} items, found ${cellItems[cell].length}`);
    }
  }

  // 2. For each cell, assign items to templates using constrained random algorithm
  const templateItems: Map<string, string[]> = new Map(TEMPLATE_KEYS.map((k) => [k, []]));

  for (let ci = 0; ci < CELLS.length; ci++) {
    const cell = CELLS[ci];
    const quotas = TEMPLATE_KEYS.map((tk) => QUOTA_MATRIX[tk][ci]);
    const assignment = assignCellToTemplates(cellItems[cell], quotas);
    if (!assignment) throw new Error(`Failed to assign ${cell} items to templates after retries`);
    for (const [tk, ids] of Array.from(assignment.entries())) {
      templateItems.get(tk)!.push(...ids);
    }
  }

  // 3. For each template, shuffle items and generate AO/AJ mask (8 AO, 7 AJ)
  // Then create 2 sessions: primary (slot 0, uses mask) and mirror (slot 1, inverted mask)
  const GSM_CHECK_ID = "GSM-CHECK";
  const createdParticipantIds: string[] = [];

  for (let ti = 0; ti < TEMPLATE_KEYS.length; ti++) {
    const tk = TEMPLATE_KEYS[ti];
    const templateId = ti + 1; // 1-based

    const shuffledItems = shuffle(templateItems.get(tk)!);
    if (shuffledItems.length !== 15) {
      throw new Error(`Template ${tk} has ${shuffledItems.length} items, expected 15`);
    }

    // Generate strict alternating AO/AJ mask for 15 items:
    //   Primary (slot 0): starts with AO → AO,AJ,AO,AJ,... → 8 AO + 7 AJ
    //   Mirror  (slot 1): inversion of primary → starts with AJ → 8 AJ + 7 AO
    const shuffledMask: Array<"AO" | "AJ"> = Array.from({ length: 15 }, (_, i) =>
      i % 2 === 0 ? "AO" : "AJ"
    );

    // Primary items (slot 0): use mask as-is
    const primaryItems: MixAssignedItem[] = shuffledItems.map((itemId, idx) => ({
      itemId,
      condition: shuffledMask[idx],
    }));

    // Mirror items (slot 1): invert mask
    const mirrorItems: MixAssignedItem[] = shuffledItems.map((itemId, idx) => ({
      itemId,
      condition: shuffledMask[idx] === "AO" ? "AJ" : "AO",
    }));

    // Append GSM-CHECK (AJ) at the end (position 16) for both slots
    // Slot 0: 15 math items (AO,AJ,...,AO) + GSM-CHECK(AJ) = 8 AO + 8 AJ
    // Slot 1: 15 math items (AJ,AO,...,AJ) + GSM-CHECK(AJ) = 7 AO + 9 AJ
    const appendGsm = (items: MixAssignedItem[]): MixAssignedItem[] => [
      ...items,
      { itemId: GSM_CHECK_ID, condition: "AJ" },
    ];

    const primaryFull = appendGsm(primaryItems);
    const mirrorFull = appendGsm(mirrorItems);

    // Persist template record (stores primary items without GSM for reference)
    await db.insert(mixSessionTemplates).values({
      templateId,
      items: JSON.stringify(primaryItems),
    });

    // Create primary session (slot 0)
    const primaryId = participantIdGenerator();
    await db.insert(participantSessions).values({
      participantId: primaryId,
      condition: "MIX",
      assignedItems: JSON.stringify(primaryFull),
      status: "consent",
      currentIndex: 0,
      violationCount: 0,
      consentGiven: false,
      mixTemplateId: templateId,
      mixSlot: 0,
    });
    createdParticipantIds.push(primaryId);

    // Create mirror session (slot 1)
    const mirrorId = participantIdGenerator();
    await db.insert(participantSessions).values({
      participantId: mirrorId,
      condition: "MIX",
      assignedItems: JSON.stringify(mirrorFull),
      status: "consent",
      currentIndex: 0,
      violationCount: 0,
      consentGiven: false,
      mixTemplateId: templateId,
      mixSlot: 1,
    });
    createdParticipantIds.push(mirrorId);
  }

  return createdParticipantIds;
}

/** Check if MIX sessions have already been generated */
export async function getMixSessionCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(participantSessions)
    .where(eq(participantSessions.condition, "MIX"));
  return Number(rows[0]?.count ?? 0);
}

/** Get all MIX sessions with their slot info */
export async function getMixSessions() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(participantSessions)
    .where(eq(participantSessions.condition, "MIX"))
    .orderBy(asc(participantSessions.mixTemplateId), asc(participantSessions.mixSlot));
}

/** Reset only MIX sessions: delete MIX sessions, responses, templates; reset countAO/countAJ for MIX items */
export async function resetMixQuota() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Get all MIX session participant IDs
  const mixSessions = await getMixSessions();
  const mixParticipantIds = mixSessions.map((s) => s.participantId);

  if (mixParticipantIds.length > 0) {
    // For each MIX session, decrement item counts
    for (const session of mixSessions) {
      type MixItem = { itemId: string; condition: "AO" | "AJ" };
      let items: MixItem[] = [];
      try {
        const raw = session.assignedItems;
        items = Array.isArray(raw) ? (raw as MixItem[]) : JSON.parse(String(raw ?? "[]"));
      } catch { items = []; }

      for (const item of items) {
        if (item.itemId === "GSM-CHECK") continue;
        if (item.condition === "AO") {
          await db.update(questionBank)
            .set({ countAO: sql`GREATEST(0, ${questionBank.countAO} - 1)` })
            .where(eq(questionBank.itemId, item.itemId));
        } else {
          await db.update(questionBank)
            .set({ countAJ: sql`GREATEST(0, ${questionBank.countAJ} - 1)` })
            .where(eq(questionBank.itemId, item.itemId));
        }
      }

      // Delete responses and violations for this participant
      await db.delete(itemResponses).where(eq(itemResponses.participantId, session.participantId));
      await db.delete(violationEvents).where(eq(violationEvents.participantId, session.participantId));
    }

    // Delete all MIX sessions
    await db.delete(participantSessions).where(eq(participantSessions.condition, "MIX"));
  }

  // Delete all templates
  await db.delete(mixSessionTemplates);
}
