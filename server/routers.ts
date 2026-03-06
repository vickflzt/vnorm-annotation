import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createSession,
  generateMixSessions,
  generateExtraMixSessions,
  getAllQuestions,
  getAllResponses,
  getAllSessions,
  getAllViolations,
  getExperimentConfig,
  getExperimentConfigByCondition,
  claimMixSession,
  getExperimentConfigByToken,
  getItemCoverageStats,
  getMixSessionCount,
  getMixSessions,
  getParticipantCountByCondition,
  getQuestionsByItemIds,
  getResponsesByParticipant,
  getSession,
  getViolationsByParticipant,
  incrementQuestionCount,
  resetAllQuota,
  resetMixQuota,
  releaseMixSession,
  resetMixSession,
  releaseParticipantQuota,
  saveItemResponse,
  saveParticipantCode,
  saveViolation,
  sampleQuestionsForSession,
  updateSessionStatus,
  upsertExperimentConfig,
} from "./db";
import { ENV } from "./_core/env";

// ─── Admin guard ──────────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
  return next({ ctx });
});

// ─── Experiment router ────────────────────────────────────────────────────────
const experimentRouter = router({
  /**
   * Validate an invite token and return the associated condition.
   */
  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const config = await getExperimentConfigByToken(input.token);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite link" });
      if (!config.isOpen) throw new TRPCError({ code: "FORBIDDEN", message: "This experiment group is currently closed" });
      return { condition: config.condition, isOpen: config.isOpen };
    }),

  /**
   * Create a new anonymous participant session.
   * For AO/AJ: randomly samples 15 MATH500 + 1 GSM-CHECK.
   * For MIX: claims a pre-generated MIX session slot (participantId is already set).
   * If inviteToken is provided, assigns the token's condition.
   */
  createSession: publicProcedure
    .input(z.object({
      preferredCondition: z.enum(["AO", "AJ", "MIX"]).optional(),
      inviteToken: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      let condition: "AO" | "AJ" | "MIX";
      let questionVersion = "v1";
      if (input.inviteToken) {
        const config = await getExperimentConfigByToken(input.inviteToken);
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite token" });
        if (!config.isOpen) throw new TRPCError({ code: "FORBIDDEN", message: "This group is closed" });
        condition = config.condition;
        questionVersion = config.questionVersion ?? "v1";
      } else {
        condition = input.preferredCondition ?? (Math.random() < 0.5 ? "AO" : "AJ");
        const cfg = await getExperimentConfigByCondition(condition);
        questionVersion = cfg?.questionVersion ?? "v1";
      }
      if (condition === "MIX") {
        // Atomically claim a pre-generated MIX session slot
        const claimedId = await claimMixSession();
        if (!claimedId) {
          const count = await getMixSessionCount();
          if (count === 0) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "MIX sessions have not been generated yet. Please ask the administrator to generate MIX sessions from the admin dashboard."
            });
          }
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No available MIX session slots. All slots are currently in use or have been completed."
          });
        }
        return {
          participantId: claimedId,
          condition: "MIX" as const,
          totalItems: 16,
        };
      }

      // AO or AJ
      const mathItems = await sampleQuestionsForSession(condition, questionVersion);
      const gsmCheckId = "GSM-CHECK";
      const before = mathItems.slice(0, 7);
      const after = mathItems.slice(7);
      const assignedItems = [...before, gsmCheckId, ...after];

      const participantId = nanoid(12);
      await createSession(participantId, condition, assignedItems);

      return { participantId, condition, totalItems: assignedItems.length };
    }),

  /**
   * Get session state and assigned questions for a participant.
   * For MIX sessions, each question also carries its item-level condition.
   */
  getSession: publicProcedure
    .input(z.object({ participantId: z.string() }))
    .query(async ({ input }) => {
      const session = await getSession(input.participantId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      type MixItem = { itemId: string; condition: "AO" | "AJ" };
      type AssignedEntry = string | MixItem;

      let rawItems: AssignedEntry[] = [];
      try {
        const raw = session.assignedItems;
        rawItems = Array.isArray(raw) ? (raw as AssignedEntry[]) : JSON.parse(String(raw));
      } catch {
        rawItems = [];
      }

      const itemIds = rawItems.map((x) => (typeof x === "string" ? x : x.itemId));
      // Determine question version from experiment config for this session's condition
      const sessionCfg = await getExperimentConfigByCondition(session.condition as "AO" | "AJ" | "MIX");
      const sessionVersion = sessionCfg?.questionVersion ?? "v1";
      const questions = await getQuestionsByItemIds(itemIds, sessionVersion);

      const orderedQuestions = rawItems.map((entry) => {
        const itemId = typeof entry === "string" ? entry : entry.itemId;
        const itemCondition: "AO" | "AJ" | null =
          session.condition === "MIX"
            ? (typeof entry === "object" ? entry.condition : "AO")
            : null; // null means use session-level condition

        const q = questions.find((x) => x.itemId === itemId);
        if (!q) return null;
        return {
          itemId: q.itemId,
          category: q.category,
          question: q.question,
          response: q.response,
          extractedResponseAnswer: q.extractedResponseAnswer,
          difficultyLevel: q.difficultyLevel,
          subject: q.subject,
          figureUrl: q.figureUrl ?? null,
          itemCondition, // null for AO/AJ sessions (use session.condition), "AO"|"AJ" for MIX
        };
      }).filter(Boolean);

      return {
        participantId: session.participantId,
        condition: session.condition,
        status: session.status,
        currentIndex: session.currentIndex,
        violationCount: session.violationCount,
        consentGiven: session.consentGiven,
        participantCode: session.participantCode ?? null,
        totalItems: itemIds.length,
        questions: orderedQuestions,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
      };
    }),

  /**
   * Save the manually-assigned participant code.
   */
  submitParticipantCode: publicProcedure
    .input(z.object({
      participantId: z.string(),
      participantCode: z.string().min(1).max(64),
    }))
    .mutation(async ({ input }) => {
      const session = await getSession(input.participantId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await saveParticipantCode(input.participantId, input.participantCode.trim());
      return { ok: true };
    }),

  /**
   * Record consent given and advance to instructions.
   */
  giveConsent: publicProcedure
    .input(z.object({ participantId: z.string() }))
    .mutation(async ({ input }) => {
      const session = await getSession(input.participantId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.status !== "consent") return { ok: true };
      await updateSessionStatus(input.participantId, "instructions", {
        consentGiven: true,
      });
      return { ok: true };
    }),

  /**
   * Start the actual experiment (advance from instructions to active).
   */
  startExperiment: publicProcedure
    .input(z.object({ participantId: z.string() }))
    .mutation(async ({ input }) => {
      const session = await getSession(input.participantId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.status === "active") return { ok: true };
      await updateSessionStatus(input.participantId, "active", {
        startedAt: new Date(),
      });
      return { ok: true };
    }),

  /**
   * Submit a single item response.
   * For MIX sessions, the item-level condition is passed from the frontend.
   */
  submitResponse: publicProcedure
    .input(
      z.object({
        participantId: z.string(),
        itemId: z.string(),
        category: z.enum(["TP", "TN", "FP", "FN", "GSM-CHECK"]),
        questionIndex: z.number().int().min(0),
        responseCorrect: z.boolean().nullable(),
        rtSeconds: z.number().min(0),
        timedOut: z.boolean(),
        helpfulness: z.number().int().min(1).max(5).nullable().optional(),
        confidenceRating: z.number().int().min(1).max(5).nullable().optional(),
        confidenceRtSeconds: z.number().min(0).nullable().optional(),
        // For MIX sessions: the item-level condition resolved by the frontend
        itemCondition: z.enum(["AO", "AJ"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const session = await getSession(input.participantId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.status === "terminated") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Session terminated" });
      }

      // Resolve the effective condition for this item
      let effectiveCondition: "AO" | "AJ";
      if (session.condition === "MIX") {
        if (!input.itemCondition) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "itemCondition required for MIX sessions" });
        }
        effectiveCondition = input.itemCondition;
      } else {
        effectiveCondition = session.condition as "AO" | "AJ";
      }

      await saveItemResponse({
        participantId: input.participantId,
        itemId: input.itemId,
        category: input.category,
        condition: effectiveCondition,
        questionIndex: input.questionIndex,
        responseCorrect: input.responseCorrect,
        rtSeconds: input.rtSeconds,
        timedOut: input.timedOut,
        helpfulness: input.helpfulness ?? null,
        confidenceRating: input.confidenceRating ?? null,
        confidenceRtSeconds: input.confidenceRtSeconds ?? null,
      });

      // Increment quota counter for non-GSM items
      if (input.category !== "GSM-CHECK") {
        const submitCfg = await getExperimentConfigByCondition(session.condition as "AO" | "AJ" | "MIX");
        const submitVersion = submitCfg?.questionVersion ?? "v1";
        await incrementQuestionCount(input.itemId, effectiveCondition, submitVersion);
      }

      // Advance currentIndex
      const nextIndex = input.questionIndex + 1;

      type MixItem = { itemId: string; condition: "AO" | "AJ" };
      type AssignedEntry = string | MixItem;
      let assignedItems: AssignedEntry[] = [];
      try {
        const raw = session.assignedItems;
        assignedItems = Array.isArray(raw) ? (raw as AssignedEntry[]) : JSON.parse(String(raw ?? "[]"));
      } catch { assignedItems = []; }

      const isLast = nextIndex >= assignedItems.length;

      // Check attention check
      // GSM-CHECK: the AI response is WRONG, so the correct answer is false ("AI is incorrect").
      // A participant passes the attention check by selecting false (responseCorrect === false).
      let passedAttentionCheck = session.passedAttentionCheck;
      if (input.category === "GSM-CHECK") {
        passedAttentionCheck = input.responseCorrect === false;
      }

      if (isLast) {
        const responses = await getResponsesByParticipant(input.participantId);
        const totalTime = responses.reduce((acc, r) => acc + (r.rtSeconds ?? 0), 0);
        await updateSessionStatus(input.participantId, "completed", {
          currentIndex: nextIndex,
          completedAt: new Date(),
          totalTimeSeconds: totalTime,
          passedAttentionCheck: passedAttentionCheck ?? undefined,
        });
      } else {
        await updateSessionStatus(input.participantId, "active", {
          currentIndex: nextIndex,
          passedAttentionCheck: passedAttentionCheck ?? undefined,
        });
      }

      return { ok: true, nextIndex, isCompleted: isLast };
    }),

  /**
   * Record a violation event. Terminates session if threshold exceeded.
   */
  recordViolation: publicProcedure
    .input(
      z.object({
        participantId: z.string(),
        violationType: z.enum([
          "tab_switch",
          "window_blur",
          "visibility_hidden",
          "screenshot_attempt",
          "copy_attempt",
          "paste_attempt",
          "right_click",
          "devtools_open",
        ]),
        questionIndex: z.number().int().optional(),
        itemId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const session = await getSession(input.participantId);
      if (!session) return { terminated: false };
      if (session.status === "terminated" || session.status === "completed") {
        return { terminated: session.status === "terminated" };
      }

      const seriousViolations = ["tab_switch", "visibility_hidden", "screenshot_attempt"];
      const isSerious = seriousViolations.includes(input.violationType);
      const previousSeriousCount = session.violationCount ?? 0;
      const newSeriousCount = isSerious ? previousSeriousCount + 1 : previousSeriousCount;
      const newCount = (session.violationCount ?? 0) + 1;
      const shouldTerminate = isSerious && newSeriousCount >= 3;

      await saveViolation({
        participantId: input.participantId,
        violationType: input.violationType,
        questionIndex: input.questionIndex,
        itemId: input.itemId,
        sessionTerminated: shouldTerminate,
      });

      if (shouldTerminate) {
        await updateSessionStatus(input.participantId, "terminated", {
          violationCount: newCount,
        });
      } else {
        await updateSessionStatus(input.participantId, session.status as "active", {
          violationCount: newCount,
        });
      }

      return {
        terminated: shouldTerminate,
        violationCount: newCount,
        seriousCount: newSeriousCount,
        isSerious,
        warningNumber: isSerious && !shouldTerminate ? newSeriousCount : null,
      };
    }),

  /**
   * Get responses for a participant (for resume/review).
   */
  getMyResponses: publicProcedure
    .input(z.object({ participantId: z.string() }))
    .query(async ({ input }) => {
      return getResponsesByParticipant(input.participantId);
    }),
});
// ─── Preview router (public, render test only) ───────────────────────────────────
const previewRouter = router({
  /**
   * Return all questions in AJ format for render testing.
   * No authentication required. No data is collected.
   */
  getAllQuestions: publicProcedure
    .input(z.object({ version: z.string().default("v1") }))
    .query(async ({ input }) => {
      const questions = await getAllQuestions();
      return questions
        .filter((q) => q.version === input.version)
        .map((q) => ({
          itemId: q.itemId,
          category: q.category,
          source: q.source,
          question: q.question,
          response: q.response,
          extractedResponseAnswer: q.extractedResponseAnswer,
          figureUrl: q.figureUrl,
          difficultyLevel: q.difficultyLevel,
          subject: q.subject,
          version: q.version,
        }));
    }),
});

// ─── Dashboard router (admin only) ─────────────────────────────────────────────
const dashboardRouter = router({  getSessions: adminProcedure.query(async () => {
    return getAllSessions();
  }),

  getItemCoverage: adminProcedure.query(async () => {
    return getItemCoverageStats();
  }),

  getSessionDetail: adminProcedure
    .input(z.object({ participantId: z.string() }))
    .query(async ({ input }) => {
      const [session, responses, violations] = await Promise.all([
        getSession(input.participantId),
        getResponsesByParticipant(input.participantId),
        getViolationsByParticipant(input.participantId),
      ]);
      return { session, responses, violations };
    }),

  exportJSON: adminProcedure.query(async () => {
    const [sessions, responses, violations] = await Promise.all([
      getAllSessions(),
      getAllResponses(),
      getAllViolations(),
    ]);
    return { sessions, responses, violations, exportedAt: new Date() };
  }),

  // ── Experiment Config Management ──────────────────────────────────────────
  getExperimentConfig: adminProcedure.query(async () => {
    const configs = await getExperimentConfig();
    const counts = await getParticipantCountByCondition();
    return configs.map((c) => ({
      ...c,
      currentParticipants: counts[c.condition] ?? 0,
    }));
  }),

  updateConditionConfig: adminProcedure
    .input(
      z.object({
        condition: z.enum(["AO", "AJ", "MIX"]),
        targetParticipants: z.number().int().min(1).max(500).optional(),
        isOpen: z.boolean().optional(),
        questionVersion: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await upsertExperimentConfig(input.condition, {
        targetParticipants: input.targetParticipants,
        isOpen: input.isOpen,
        questionVersion: input.questionVersion,
      });
      return { ok: true };
    }),

  regenerateToken: adminProcedure
    .input(z.object({ condition: z.enum(["AO", "AJ", "MIX"]) }))
    .mutation(async ({ input }) => {
      const newToken = nanoid(24);
      await upsertExperimentConfig(input.condition, { inviteToken: newToken });
      return { token: newToken };
    }),

  exportCSV: adminProcedure.query(async () => {
    const responses = await getAllResponses();
    const sessions = await getAllSessions();

    const sessionMap = new Map(sessions.map((s) => [s.participantId, s]));

    const header = [
      "participantId",
      "participantCode",
      "sessionCondition",
      "itemCondition",
      "itemId",
      "category",
      "questionIndex",
      "responseCorrect",
      "rtSeconds",
      "timedOut",
      "helpfulness",
      "confidenceRating",
      "confidenceRtSeconds",
      "submittedAt",
      "sessionStatus",
      "violationCount",
      "passedAttentionCheck",
      "mixTemplateId",
      "mixSlot",
    ].join(",");

    const rows = responses.map((r) => {
      const s = sessionMap.get(r.participantId);
      return [
        r.participantId,
        s?.participantCode ?? "",
        s?.condition ?? "",
        r.condition, // item-level condition (AO or AJ)
        r.itemId,
        r.category,
        r.questionIndex,
        r.responseCorrect === null ? "" : r.responseCorrect ? "1" : "0",
        r.rtSeconds?.toFixed(2) ?? "",
        r.timedOut ? "1" : "0",
        r.helpfulness ?? "",
        r.confidenceRating ?? "",
        r.confidenceRtSeconds?.toFixed(2) ?? "",
        r.submittedAt?.toISOString() ?? "",
        s?.status ?? "",
        s?.violationCount ?? "",
        s?.passedAttentionCheck === null ? "" : s?.passedAttentionCheck ? "1" : "0",
        s?.mixTemplateId ?? "",
        s?.mixSlot ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });

    return [header, ...rows].join("\n");
  }),

  /** Reset ALL quota: wipe all sessions/responses/violations/mix templates, reset countAO/countAJ to 0. */
  resetAllQuota: adminProcedure.mutation(async () => {
    await resetAllQuota();
    return { success: true };
  }),

  /** Release quota held by a single participant and delete their records. */
  releaseParticipant: adminProcedure
    .input(z.object({ participantId: z.string() }))
    .mutation(async ({ input }) => {
      await releaseParticipantQuota(input.participantId);
      return { success: true };
    }),

  // ── MIX Session Management ────────────────────────────────────────────────

  /** Get MIX session status: how many generated, how many used */
  getMixStatus: adminProcedure.query(async () => {
    const sessions = await getMixSessions();
    const total = sessions.length;
    const used = sessions.filter((s) => s.status !== "consent" || s.startedAt !== null).length;
    const available = sessions.filter((s) => s.status === "consent" && s.startedAt === null).length;
    const completed = sessions.filter((s) => s.status === "completed").length;
    const active = sessions.filter((s) => s.status === "active").length;
    const terminated = sessions.filter((s) => s.status === "terminated").length;

    return {
      total,
      used,
      available,
      completed,
      active,
      terminated,
      sessions: sessions.map((s) => ({
        participantId: s.participantId,
        mixTemplateId: s.mixTemplateId,
        mixSlot: s.mixSlot,
        status: s.status,
        participantCode: s.participantCode,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      })),
    };
  }),

  /** Generate 15 MIX sessions (AJ-first, 16 math + 1 GSM-CHECK = 17 total). Fails if sessions already exist. */
  generateMixSessions: adminProcedure
    .input(z.object({ force: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const existingCount = await getMixSessionCount();
      if (existingCount > 0 && !input.force) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${existingCount} MIX sessions already exist. Use force=true to regenerate (this will delete existing MIX data).`,
        });
      }
      if (existingCount > 0 && input.force) {
        await resetMixQuota();
      }
      const mixCfg = await getExperimentConfigByCondition("MIX");
      const mixVersion = mixCfg?.questionVersion ?? "v3";
      const ids = await generateMixSessions(() => nanoid(12), mixVersion);
      return { success: true, count: ids.length, participantIds: ids };
    }),

  /** Generate additional MIX sessions beyond the initial 15 (for overflow participants). */
  generateExtraMixSessions: adminProcedure
    .input(z.object({ count: z.number().int().min(1).max(50).default(5) }))
    .mutation(async ({ input }) => {
      const mixCfg = await getExperimentConfigByCondition("MIX");
      const mixVersion = mixCfg?.questionVersion ?? "v3";
      const ids = await generateExtraMixSessions(input.count, () => nanoid(12), mixVersion);
      return { success: true, count: ids.length, participantIds: ids };
    }),

  /** Reset only MIX sessions (delete MIX sessions, responses, templates; decrement counts). */
  resetMixQuota: adminProcedure.mutation(async () => {
    await resetMixQuota();
    return { success: true };
  }),

  /**
   * Release a single MIX session:
   * Clears responses/violations, decrements answered item counts,
   * assigns a new participantId so the slot can be re-claimed by a new participant.
   */
  releaseMixSession: adminProcedure
    .input(z.object({ participantId: z.string() }))
    .mutation(async ({ input }) => {
      const newId = await releaseMixSession(input.participantId);
      return { success: true, newParticipantId: newId };
    }),

  /**
   * Reset a single MIX session in-place:
   * Clears responses/violations, decrements answered item counts,
   * restores session to initial state while keeping the same participantId.
   */
  resetMixSession: adminProcedure
    .input(z.object({ participantId: z.string() }))
    .mutation(async ({ input }) => {
      await resetMixSession(input.participantId);
      return { success: true };
    }),
});

// ─── App router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  experiment: experimentRouter,
  dashboard: dashboardRouter,
  preview: previewRouter,
});

export type AppRouter = typeof appRouter;
