import {
  and, asc, desc, eq, lt, sql
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  experimentConfig,
  itemResponses,
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

export async function getQuestionByItemId(itemId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(questionBank).where(eq(questionBank.itemId, itemId)).limit(1);
  return result[0];
}

export async function getQuestionsByItemIds(itemIds: string[]) {
  const db = await getDb();
  if (!db) return [];
  if (itemIds.length === 0) return [];
  const results = await db.select().from(questionBank);
  return results.filter((q) => itemIds.includes(q.itemId));
}

/**
 * Sample 15 MATH500 questions for a session using quota-aware priority.
 * Prioritises items with the lowest count for the given condition.
 */
export async function sampleQuestionsForSession(
  condition: "AO" | "AJ"
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
        sql`${questionBank.category} != 'GSM-CHECK'`
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
  // (Some items in the bank are different V-Norm conditions of the same math
  //  problem, e.g. TP05 and FP02 ask the same question with different answers.)
  const selected: typeof shuffled = [];
  const seenQuestions = new Set<string>();
  for (const item of shuffled) {
    const qKey = (item.question ?? "").trim().slice(0, 200); // use first 200 chars as key
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
      .where(sql`${questionBank.category} != 'GSM-CHECK'`);
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
  condition: "AO" | "AJ"
) {
  const db = await getDb();
  if (!db) return;
  if (condition === "AO") {
    await db
      .update(questionBank)
      .set({ countAO: sql`${questionBank.countAO} + 1` })
      .where(eq(questionBank.itemId, itemId));
  } else {
    await db
      .update(questionBank)
      .set({ countAJ: sql`${questionBank.countAJ} + 1` })
      .where(eq(questionBank.itemId, itemId));
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

export async function getExperimentConfigByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(experimentConfig)
    .where(eq(experimentConfig.inviteToken, token))
    .limit(1);
  return result[0];
}

export async function upsertExperimentConfig(
  condition: "AO" | "AJ",
  data: { targetParticipants?: number; inviteToken?: string; isOpen?: boolean }
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
  if (!db) return { AO: 0, AJ: 0 };
  const rows = await db
    .select({ condition: participantSessions.condition, count: sql<number>`COUNT(*)` })
    .from(participantSessions)
    .groupBy(participantSessions.condition);
  const result = { AO: 0, AJ: 0 };
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

// ─── Quota Reset ──────────────────────────────────────────────────────────────

/**
 * Reset ALL quota: wipe sessions, responses, violations, and reset countAO/countAJ to 0.
 * Keeps the question bank and experiment config intact.
 */
export async function resetAllQuota() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(violationEvents);
  await db.delete(itemResponses);
  await db.delete(participantSessions);
  await db.update(questionBank).set({ countAO: 0, countAJ: 0 });
}

/**
 * Release quota held by a single participant:
 * - Decrement countAO/countAJ for each item they were assigned
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
  const condition = session.condition;

  let assignedItemIds: string[] = [];
  try {
    const raw = session.assignedItems;
    assignedItemIds = Array.isArray(raw) ? (raw as string[]) : JSON.parse(String(raw ?? "[]"));
  } catch {
    assignedItemIds = [];
  }

  for (const itemId of assignedItemIds) {
    if (condition === "AO") {
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
