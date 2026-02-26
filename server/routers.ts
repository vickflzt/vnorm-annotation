import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createSession,
  getAllResponses,
  getAllSessions,
  getAllViolations,
  getExperimentConfig,
  getExperimentConfigByToken,
  getItemCoverageStats,
  getParticipantCountByCondition,
  getQuestionsByItemIds,
  getResponsesByParticipant,
  getSession,
  getViolationsByParticipant,
  incrementQuestionCount,
  saveItemResponse,
  saveViolation,
  sampleQuestionsForSession,
  updateSessionStatus,
  upsertExperimentConfig,
  resetAllQuota,
  releaseParticipantQuota,
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
   * Used when a participant arrives via a share link.
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
   * Randomly assigns AO or AJ condition, samples 15 MATH500 + 1 GSM-CHECK.
   * If inviteToken is provided, assigns the token's condition.
   */
  createSession: publicProcedure
    .input(z.object({
      preferredCondition: z.enum(["AO", "AJ"]).optional(),
      inviteToken: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      let condition: "AO" | "AJ";
      if (input.inviteToken) {
        const config = await getExperimentConfigByToken(input.inviteToken);
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite token" });
        if (!config.isOpen) throw new TRPCError({ code: "FORBIDDEN", message: "This group is closed" });
        condition = config.condition;
      } else {
        condition = input.preferredCondition ?? (Math.random() < 0.5 ? "AO" : "AJ");
      }

      const mathItems = await sampleQuestionsForSession(condition);
      // Insert GSM-CHECK at position 7 (0-indexed), i.e. 8th question
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
   */
  getSession: publicProcedure
    .input(z.object({ participantId: z.string() }))
    .query(async ({ input }) => {
      const session = await getSession(input.participantId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const assignedItems = JSON.parse(session.assignedItems as string) as string[];
      const questions = await getQuestionsByItemIds(assignedItems);

      // Return questions in assigned order, stripping gold answer for participant view
      const orderedQuestions = assignedItems.map((itemId) => {
        const q = questions.find((x) => x.itemId === itemId);
        if (!q) return null;
        return {
          itemId: q.itemId,
          category: q.category,
          question: q.question,
          response: q.response, // full response (AJ uses this)
          extractedResponseAnswer: q.extractedResponseAnswer,
          difficultyLevel: q.difficultyLevel,
          subject: q.subject,
          figureUrl: q.figureUrl ?? null,
        };
      }).filter(Boolean);

      return {
        participantId: session.participantId,
        condition: session.condition,
        status: session.status,
        currentIndex: session.currentIndex,
        violationCount: session.violationCount,
        consentGiven: session.consentGiven,
        totalItems: assignedItems.length,
        questions: orderedQuestions,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
      };
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
      })
    )
    .mutation(async ({ input }) => {
      const session = await getSession(input.participantId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.status === "terminated") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Session terminated" });
      }

      await saveItemResponse({
        participantId: input.participantId,
        itemId: input.itemId,
        category: input.category,
        condition: session.condition,
        questionIndex: input.questionIndex,
        responseCorrect: input.responseCorrect,
        rtSeconds: input.rtSeconds,
        timedOut: input.timedOut,
        helpfulness: input.helpfulness ?? null,
      });

      // Increment quota counter for non-GSM items
      if (input.category !== "GSM-CHECK") {
        await incrementQuestionCount(input.itemId, session.condition);
      }

      // Advance currentIndex
      const nextIndex = input.questionIndex + 1;
      const assignedItems = JSON.parse(session.assignedItems as string) as string[];
      const isLast = nextIndex >= assignedItems.length;

      // Check attention check (GSM-CHECK answer should be "48", correct = true)
      let passedAttentionCheck = session.passedAttentionCheck;
      if (input.category === "GSM-CHECK") {
        passedAttentionCheck = input.responseCorrect === true;
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

      // Terminate after 3 serious violations (tab switch, visibility hidden, screenshot)
      // First 2 serious violations: warn. 3rd: terminate.
      const seriousViolations = ["tab_switch", "visibility_hidden", "screenshot_attempt"];
      const isSerious = seriousViolations.includes(input.violationType);
      // Count only serious violations
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
        // warningNumber: 1 or 2 means warn, 3 means terminate
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

// ─── Dashboard router (admin only) ───────────────────────────────────────────
const dashboardRouter = router({
  getSessions: adminProcedure.query(async () => {
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
        condition: z.enum(["AO", "AJ"]),
        targetParticipants: z.number().int().min(1).max(500).optional(),
        isOpen: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await upsertExperimentConfig(input.condition, {
        targetParticipants: input.targetParticipants,
        isOpen: input.isOpen,
      });
      return { ok: true };
    }),

  regenerateToken: adminProcedure
    .input(z.object({ condition: z.enum(["AO", "AJ"]) }))
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
      "condition",
      "itemId",
      "category",
      "questionIndex",
      "responseCorrect",
      "rtSeconds",
      "timedOut",
      "helpfulness",
      "submittedAt",
      "sessionStatus",
      "violationCount",
      "passedAttentionCheck",
    ].join(",");

    const rows = responses.map((r) => {
      const s = sessionMap.get(r.participantId);
      return [
        r.participantId,
        r.condition,
        r.itemId,
        r.category,
        r.questionIndex,
        r.responseCorrect === null ? "" : r.responseCorrect ? "1" : "0",
        r.rtSeconds?.toFixed(2) ?? "",
        r.timedOut ? "1" : "0",
        r.helpfulness ?? "",
        r.submittedAt?.toISOString() ?? "",
        s?.status ?? "",
        s?.violationCount ?? "",
        s?.passedAttentionCheck === null ? "" : s?.passedAttentionCheck ? "1" : "0",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });

    return [header, ...rows].join("\n");
  }),

  /** Reset ALL quota: wipe all sessions/responses/violations, reset countAO/countAJ to 0. */
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
});

export type AppRouter = typeof appRouter;
