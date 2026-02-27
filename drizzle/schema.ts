import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Question Bank ───────────────────────────────────────────────────────────
export const questionBank = mysqlTable("question_bank", {
  id: int("id").autoincrement().primaryKey(),
  itemId: varchar("itemId", { length: 32 }).notNull().unique(), // e.g. TP01, FN07, GSM-CHECK
  category: mysqlEnum("category", ["TP", "TN", "FP", "FN", "GSM-CHECK"]).notNull(),
  source: varchar("source", { length: 32 }).notNull(), // MATH500 | GSM8K
  question: text("question").notNull(),
  goldAnswer: text("goldAnswer"),
  extractedGoldAnswer: varchar("extractedGoldAnswer", { length: 256 }),
  response: text("response"), // full LLM response (AJ mode)
  extractedResponseAnswer: varchar("extractedResponseAnswer", { length: 256 }),
  gtIsCorrect: boolean("gtIsCorrect").notNull(),
  inferenceModel: varchar("inferenceModel", { length: 128 }),
  difficultyLevel: int("difficultyLevel"),
  subject: varchar("subject", { length: 128 }),
  uniqueId: varchar("uniqueId", { length: 256 }),
  sourceCondition: varchar("sourceCondition", { length: 32 }),
  figureUrl: text("figureUrl"), // CDN URL for geometric figure image (if any)
  countAO: int("countAO").default(0).notNull(),   // how many AO annotations collected
  countAJ: int("countAJ").default(0).notNull(),   // how many AJ annotations collected
  targetCount: int("targetCount").default(3).notNull(), // target per condition
});

export type QuestionBankItem = typeof questionBank.$inferSelect;

// ─── Participant Sessions ─────────────────────────────────────────────────────
export const participantSessions = mysqlTable("participant_sessions", {
  id: int("id").autoincrement().primaryKey(),
  participantId: varchar("participantId", { length: 64 }).notNull().unique(), // nanoid, anonymous
  condition: mysqlEnum("condition", ["AO", "AJ"]).notNull(),
  assignedItems: json("assignedItems").notNull(), // ordered array of itemIds (16 items)
  currentIndex: int("currentIndex").default(0).notNull(), // which question they're on
  status: mysqlEnum("status", ["consent", "instructions", "active", "completed", "terminated"]).default("consent").notNull(),
  violationCount: int("violationCount").default(0).notNull(),
  consentGiven: boolean("consentGiven").default(false).notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  totalTimeSeconds: float("totalTimeSeconds"),
  passedAttentionCheck: boolean("passedAttentionCheck"),
  participantCode: varchar("participantCode", { length: 64 }), // manually assigned participant code
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ParticipantSession = typeof participantSessions.$inferSelect;

// ─── Item Responses ───────────────────────────────────────────────────────────
export const itemResponses = mysqlTable("item_responses", {
  id: int("id").autoincrement().primaryKey(),
  participantId: varchar("participantId", { length: 64 }).notNull(),
  itemId: varchar("itemId", { length: 32 }).notNull(),
  category: mysqlEnum("category", ["TP", "TN", "FP", "FN", "GSM-CHECK"]).notNull(),
  condition: mysqlEnum("condition", ["AO", "AJ"]).notNull(),
  questionIndex: int("questionIndex").notNull(), // 0-based position in session
  responseCorrect: boolean("responseCorrect"), // true=Correct, false=Incorrect, null=timeout
  rtSeconds: float("rtSeconds"), // reaction time in seconds
  timedOut: boolean("timedOut").default(false).notNull(),
  helpfulness: int("helpfulness"), // AJ only: 1-5
  confidenceRating: int("confidenceRating"), // all conditions: 1-5 confidence in judgment
  confidenceRtSeconds: float("confidenceRtSeconds"), // reaction time for phase 2 (helpfulness+confidence)
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
});

export type ItemResponse = typeof itemResponses.$inferSelect;

// ─── Violation Events ─────────────────────────────────────────────────────────
export const violationEvents = mysqlTable("violation_events", {
  id: int("id").autoincrement().primaryKey(),
  participantId: varchar("participantId", { length: 64 }).notNull(),
  violationType: mysqlEnum("violationType", [
    "tab_switch",
    "window_blur",
    "visibility_hidden",
    "screenshot_attempt",
    "copy_attempt",
    "paste_attempt",
    "right_click",
    "devtools_open",
  ]).notNull(),
  questionIndex: int("questionIndex"), // which question they were on
  itemId: varchar("itemId", { length: 32 }),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  sessionTerminated: boolean("sessionTerminated").default(false).notNull(),
});

export type ViolationEvent = typeof violationEvents.$inferSelect;

// ─── Experiment Config ────────────────────────────────────────────────────────
// Stores per-condition quota and invite tokens
export const experimentConfig = mysqlTable("experiment_config", {
  id: int("id").autoincrement().primaryKey(),
  condition: mysqlEnum("condition", ["AO", "AJ"]).notNull().unique(),
  targetParticipants: int("targetParticipants").default(30).notNull(),
  inviteToken: varchar("inviteToken", { length: 64 }).notNull().unique(), // secret token for share link
  isOpen: boolean("isOpen").default(true).notNull(), // whether this condition is accepting new participants
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExperimentConfig = typeof experimentConfig.$inferSelect;
