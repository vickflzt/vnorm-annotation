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
 * New design (v2): 15 sessions × 16 math questions (8 AJ + 8 AO) + 1 GSM-CHECK = 17 total.
 * All sessions start with AJ (strict alternating: AJ,AO,AJ,AO,...,AJ,AO = 8 AJ + 8 AO).
 * GSM-CHECK is inserted at a random AJ position (does not displace math questions).
 * Each math question (40 total) appears exactly 3 times as AJ + 3 times as AO.
 * Per session: 4 categories × (2 AJ + 2 AO) = 8 AJ + 8 AO math questions.
 */
const N_SESSIONS = 15;       // total MIX sessions
const MATH_PER_SESSION = 16; // 8 AJ + 8 AO per session
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
 * Assign 10 questions to 15 sessions such that each session gets exactly 2 questions
 * and each question appears in exactly 3 sessions.
 * Uses shuffle-based approach: repeat each question 3 times, shuffle, split into pairs.
 * Retries up to 200 times to avoid duplicate questions within a session.
 */
function assignCategoryToSessions(
  items: string[], // e.g. 10 items
  nSessions: number, // e.g. 15
  perSession: number, // items per session per category, e.g. 4
  perItem: number // how many times each item appears total, e.g. 6
): string[][] | null {
  const MAX_RETRIES = 500;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const counts: Map<string, number> = new Map(items.map((id) => [id, 0]));
    const sessions: string[][] = [];
    let valid = true;
    for (let si = 0; si < nSessions; si++) {
      // Get items that still have quota remaining
      const available = items.filter((id) => (counts.get(id) ?? 0) < perItem);
      // Shuffle for randomness, then sort by count ascending (least-used first)
      const shuffled = shuffle(available);
      shuffled.sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));
      const chosen = shuffled.slice(0, perSession);
      // Reject if not enough items or duplicates
      if (chosen.length < perSession || new Set(chosen).size < perSession) {
        valid = false;
        break;
      }
      for (const id of chosen) counts.set(id, (counts.get(id) ?? 0) + 1);
      sessions.push(chosen);
    }
    if (valid) return sessions;
  }
  return null;
}

/**
 * Generate 15 MIX sessions (new design):
 *   - Each session: 16 math questions (8 AJ + 8 AO, AJ-first strict alternating) + 1 GSM-CHECK = 17 total
 *   - All sessions start with AJ: AJ,AO,AJ,AO,...,AJ,AO (positions 0,2,4,...,14 = AJ; 1,3,...,15 = AO)
 *   - GSM-CHECK is inserted at a random AJ position (extra item, does not replace math questions)
 *   - Each math question appears exactly 3 times as AJ + 3 times as AO across all 15 sessions
 *   - Per category (10 questions): 2 questions per session, each question in 3 sessions
 *
 * Returns the 15 participantIds created.
 */
export async function generateMixSessions(
  participantIdGenerator: () => string,
  version = "v1"
): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // 1. Fetch all MATH500 items grouped by cell
  const allItems = await db
    .select({ itemId: questionBank.itemId, category: questionBank.category })
    .from(questionBank)
    .where(and(
      sql`${questionBank.category} != 'GSM-CHECK'`,
      eq(questionBank.version, version)
    ));

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

  // 2. For each category, assign 2 items to each of 15 sessions (each item in 3 sessions)
  //    Result: sessionCategoryItems[sessionIdx][cell] = [itemId1, itemId2]
  const sessionCategoryItems: Record<string, string[]>[] = Array.from(
    { length: N_SESSIONS },
    () => ({ TP: [], TN: [], FP: [], FN: [] })
  );

  for (const cell of CELLS) {
    // 4 items per session per category, each item appears 6 times (3 as AJ + 3 as AO)
    // 15 sessions × 4 = 60 = 10 items × 6 appearances ✓
    const assignment = assignCategoryToSessions(cellItems[cell], N_SESSIONS, 4, 6);
    if (!assignment) throw new Error(`Failed to assign ${cell} items to sessions after retries`);
    for (let si = 0; si < N_SESSIONS; si++) {
      sessionCategoryItems[si][cell] = assignment[si];
    }
  }

  // 3. Build each session's 16 math items with AJ-first alternating condition
  //    AJ positions (0-indexed): 0,2,4,6,8,10,12,14 (8 slots)
  //    AO positions: 1,3,5,7,9,11,13,15 (8 slots)
  //    Per session: 4 categories × 2 items = 8 items assigned to AJ, 8 to AO
  //    We shuffle all 16 items and assign AJ to even positions, AO to odd positions
  const GSM_CHECK_ID = "GSM-CHECK";
  const createdParticipantIds: string[] = [];

  for (let si = 0; si < N_SESSIONS; si++) {
    // Collect all 16 math items for this session
    const mathItems: string[] = [];
    for (const cell of CELLS) {
      mathItems.push(...sessionCategoryItems[si][cell]);
    }
    if (mathItems.length !== MATH_PER_SESSION) {
      throw new Error(`Session ${si} has ${mathItems.length} math items, expected ${MATH_PER_SESSION}`);
    }
    const shuffled = shuffle(mathItems);

    // Assign AJ to even positions (0,2,...,14), AO to odd positions (1,3,...,15)
    const mathAssigned: MixAssignedItem[] = shuffled.map((itemId, idx) => ({
      itemId,
      condition: idx % 2 === 0 ? "AJ" : "AO",
    }));

    // Insert GSM-CHECK at a random AJ position (even index 0,2,4,...,14)
    // The GSM item is inserted BEFORE that position, shifting subsequent items right
    const ajPositions = [0, 2, 4, 6, 8, 10, 12, 14];
    const gsmInsertPos = ajPositions[Math.floor(Math.random() * ajPositions.length)];
    const fullItems: MixAssignedItem[] = [
      ...mathAssigned.slice(0, gsmInsertPos),
      { itemId: GSM_CHECK_ID, condition: "AJ" },
      ...mathAssigned.slice(gsmInsertPos),
    ];
    // fullItems has 17 items; the AJ/AO alternation is preserved for math items
    // (GSM takes an AJ slot, math items keep their original conditions)

    // Persist template record (stores math items without GSM for reference)
    await db.insert(mixSessionTemplates).values({
      templateId: si + 1,
      items: JSON.stringify(mathAssigned),
    });

    // Create session
    const participantId = participantIdGenerator();
    await db.insert(participantSessions).values({
      participantId,
      condition: "MIX",
      assignedItems: JSON.stringify(fullItems),
      status: "consent",
      currentIndex: 0,
      violationCount: 0,
      consentGiven: false,
      mixTemplateId: si + 1,
      mixSlot: 0,
    });
    createdParticipantIds.push(participantId);
  }

  return createdParticipantIds;
}

/**
 * Generate additional MIX sessions beyond the initial 15.
 * Uses the same AJ-first alternating design but without strict quota constraints.
 * Each extra session gets 16 math questions (prioritizing least-used items) + 1 GSM-CHECK.
 * Returns the new participantIds created.
 */
export async function generateExtraMixSessions(
  count: number,
  participantIdGenerator: () => string,
  version = "v1"
): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Fetch all MATH500 items with their current counts
  const allItems = await db
    .select({
      itemId: questionBank.itemId,
      category: questionBank.category,
      countAO: questionBank.countAO,
      countAJ: questionBank.countAJ,
    })
    .from(questionBank)
    .where(and(
      sql`${questionBank.category} != 'GSM-CHECK'`,
      eq(questionBank.version, version)
    ));

  const cellItems: Record<string, Array<{ itemId: string; countAO: number; countAJ: number }>> = {
    TP: [], TN: [], FP: [], FN: [],
  };
  for (const item of allItems) {
    if (item.category in cellItems) {
      cellItems[item.category as keyof typeof cellItems].push(item);
    }
  }

  const GSM_CHECK_ID = "GSM-CHECK";
  const createdParticipantIds: string[] = [];

  // Get current max templateId to continue numbering
  const existingCount = await getMixSessionCount();

  for (let extra = 0; extra < count; extra++) {
    // For each category, pick 2 items with lowest total count (AO+AJ), no duplicates within session
    const sessionItems: string[] = [];
    for (const cell of CELLS) {
      const sorted = [...cellItems[cell]].sort(
        (a, b) => (a.countAO + a.countAJ) - (b.countAO + b.countAJ)
      );
      // Pick 2 least-used items not already in this session
      let picked = 0;
      for (const item of sorted) {
        if (!sessionItems.includes(item.itemId)) {
          sessionItems.push(item.itemId);
          picked++;
          if (picked === 2) break;
        }
      }
    }

    if (sessionItems.length !== MATH_PER_SESSION) {
      throw new Error(`Extra session ${extra} has ${sessionItems.length} items, expected ${MATH_PER_SESSION}`);
    }

    const shuffled = shuffle(sessionItems);
    const mathAssigned: MixAssignedItem[] = shuffled.map((itemId, idx) => ({
      itemId,
      condition: idx % 2 === 0 ? "AJ" : "AO",
    }));

    const ajPositions = [0, 2, 4, 6, 8, 10, 12, 14];
    const gsmInsertPos = ajPositions[Math.floor(Math.random() * ajPositions.length)];
    const fullItems: MixAssignedItem[] = [
      ...mathAssigned.slice(0, gsmInsertPos),
      { itemId: GSM_CHECK_ID, condition: "AJ" },
      ...mathAssigned.slice(gsmInsertPos),
    ];

    const templateId = existingCount + extra + 1;
    await db.insert(mixSessionTemplates).values({
      templateId,
      items: JSON.stringify(mathAssigned),
    });

    const participantId = participantIdGenerator();
    await db.insert(participantSessions).values({
      participantId,
      condition: "MIX",
      assignedItems: JSON.stringify(fullItems),
      status: "consent",
      currentIndex: 0,
      violationCount: 0,
      consentGiven: false,
      mixTemplateId: templateId,
      mixSlot: 0,
    });
    createdParticipantIds.push(participantId);
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
