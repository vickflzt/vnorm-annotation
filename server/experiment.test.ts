import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@example.com",
      name: "Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const cleared: string[] = [];
    const ctx: TrpcContext = {
      user: {
        id: 1,
        openId: "test",
        email: "t@t.com",
        name: "T",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string) => cleared.push(name),
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(cleared).toHaveLength(1);
  });
});

describe("experiment.createSession", () => {
  it("creates a session and returns participantId and condition", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.experiment.createSession({});
    expect(result.participantId).toBeTruthy();
    expect(["AO", "AJ"]).toContain(result.condition);
    expect(result.totalItems).toBe(16);
  });

  it("respects preferredCondition", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.experiment.createSession({ preferredCondition: "AO" });
    expect(result.condition).toBe("AO");
  });
});

describe("experiment.getSession", () => {
  it("returns session with 16 ordered questions for AO/AJ", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const { participantId } = await caller.experiment.createSession({ preferredCondition: "AJ" });
    const session = await caller.experiment.getSession({ participantId });
    expect(session.questions).toHaveLength(16);
    expect(session.condition).toBe("AJ");
    expect(session.status).toBe("consent");
    // GSM-CHECK should be at index 7 for AO/AJ sessions
    expect(session.questions[7]?.itemId).toBe("GSM-CHECK");
  });
});

describe("experiment.giveConsent + startExperiment", () => {
  it("advances session status correctly", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const { participantId } = await caller.experiment.createSession({});
    await caller.experiment.giveConsent({ participantId });
    const s1 = await caller.experiment.getSession({ participantId });
    expect(s1.status).toBe("instructions");
    expect(s1.consentGiven).toBe(true);

    await caller.experiment.startExperiment({ participantId });
    const s2 = await caller.experiment.getSession({ participantId });
    expect(s2.status).toBe("active");
  });
});

describe("experiment.submitParticipantCode", () => {
  it("saves participant code and returns ok", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const { participantId } = await caller.experiment.createSession({});
    await caller.experiment.giveConsent({ participantId });
    const result = await caller.experiment.submitParticipantCode({
      participantId,
      participantCode: "P042",
    });
    expect(result.ok).toBe(true);
    // Verify code is stored in the session
    const session = await caller.experiment.getSession({ participantId });
    expect(session.participantCode).toBe("P042");
  });

  it("rejects empty participant code", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const { participantId } = await caller.experiment.createSession({});
    await expect(
      caller.experiment.submitParticipantCode({ participantId, participantCode: "" })
    ).rejects.toThrow();
  });
});

describe("experiment.submitResponse", () => {
  it("advances currentIndex after submission", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const { participantId } = await caller.experiment.createSession({ preferredCondition: "AO" });
    await caller.experiment.giveConsent({ participantId });
    await caller.experiment.startExperiment({ participantId });

    const session = await caller.experiment.getSession({ participantId });
    const firstQ = session.questions[0]!;

    const result = await caller.experiment.submitResponse({
      participantId,
      itemId: firstQ.itemId,
      category: firstQ.category as "TP" | "TN" | "FP" | "FN" | "GSM-CHECK",
      questionIndex: 0,
      responseCorrect: true,
      rtSeconds: 45.5,
      timedOut: false,
    });

    expect(result.ok).toBe(true);
    expect(result.nextIndex).toBe(1);
    expect(result.isCompleted).toBe(false);
  });
});

describe("experiment.recordViolation", () => {
  it("terminates session after 3 serious violations", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const { participantId } = await caller.experiment.createSession({});
    await caller.experiment.giveConsent({ participantId });
    await caller.experiment.startExperiment({ participantId });

    // First violation: warning only
    const r1 = await caller.experiment.recordViolation({
      participantId,
      violationType: "tab_switch",
      questionIndex: 0,
    });
    expect(r1.terminated).toBe(false);
    expect(r1.warningNumber).toBe(1);

    // Second violation: warning only
    const r2 = await caller.experiment.recordViolation({
      participantId,
      violationType: "tab_switch",
      questionIndex: 0,
    });
    expect(r2.terminated).toBe(false);
    expect(r2.warningNumber).toBe(2);

    // Third violation: terminate
    const r3 = await caller.experiment.recordViolation({
      participantId,
      violationType: "tab_switch",
      questionIndex: 0,
    });
    expect(r3.terminated).toBe(true);
    const session = await caller.experiment.getSession({ participantId });
    expect(session.status).toBe("terminated");
  });

  it("does not terminate on minor violation (right_click)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const { participantId } = await caller.experiment.createSession({});
    await caller.experiment.giveConsent({ participantId });
    await caller.experiment.startExperiment({ participantId });

    const result = await caller.experiment.recordViolation({
      participantId,
      violationType: "right_click",
      questionIndex: 0,
    });

    expect(result.terminated).toBe(false);
  });
});

describe("dashboard.generateMixSessions", () => {
  it("generates 15 MIX sessions with 17 questions each (16 math + 1 GSM)", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // Reset first to ensure clean state
    await caller.dashboard.resetMixQuota();

    const result = await caller.dashboard.generateMixSessions({ force: false });
    expect(result.success).toBe(true);
    expect(result.count).toBe(15);
    expect(result.participantIds).toHaveLength(15);

    // Verify each session has 17 questions
    const publicCaller = appRouter.createCaller(createPublicContext());
    for (const pid of result.participantIds) {
      const session = await publicCaller.experiment.getSession({ participantId: pid });
      expect(session.questions).toHaveLength(17);
      expect(session.condition).toBe("MIX");

      // Verify exactly 1 GSM-CHECK
      const gsmItems = session.questions.filter((q) => q.itemId === "GSM-CHECK");
      expect(gsmItems).toHaveLength(1);

      // Verify GSM-CHECK is at an AJ position (even index in the original math sequence)
      const gsmIdx = session.questions.findIndex((q) => q.itemId === "GSM-CHECK");
      expect(gsmIdx).toBeGreaterThanOrEqual(0);
      expect(session.questions[gsmIdx]?.itemCondition).toBe("AJ");

      // Verify no duplicate math items
      const mathItems = session.questions
        .filter((q) => q.itemId !== "GSM-CHECK")
        .map((q) => q.itemId);
      expect(new Set(mathItems).size).toBe(16);
    }

    // Verify total is 15
    const mixStatus = await caller.dashboard.getMixStatus();
    expect(mixStatus.total).toBe(15);
    expect(mixStatus.available).toBe(15);

    // Cleanup
    await caller.dashboard.resetMixQuota();
  }, 60_000);

  it("all MIX sessions start with AJ (first math question is AJ)", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await caller.dashboard.resetMixQuota();
    const result = await caller.dashboard.generateMixSessions({ force: false });

    const publicCaller = appRouter.createCaller(createPublicContext());
    for (const pid of result.participantIds) {
      const session = await publicCaller.experiment.getSession({ participantId: pid });
      // First item should be AJ (either GSM-CHECK or a math AJ item)
      expect(session.questions[0]?.itemCondition).toBe("AJ");
    }

    await caller.dashboard.resetMixQuota();
  }, 60_000);
});

describe("dashboard (admin only)", () => {
  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.dashboard.getSessions()).rejects.toThrow();
  });

  it("returns sessions for admin", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const sessions = await caller.dashboard.getSessions();
    expect(Array.isArray(sessions)).toBe(true);
  });

  it("returns item coverage for admin", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const coverage = await caller.dashboard.getItemCoverage();
    expect(Array.isArray(coverage)).toBe(true);
    expect(coverage.length).toBeGreaterThan(0);
  });

  it("exports CSV with header row including participantCode", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const csv = await caller.dashboard.exportCSV();
    expect(csv).toContain("participantId");
    expect(csv).toContain("participantCode");
    expect(csv).toContain("sessionCondition");
    expect(csv).toContain("itemCondition");
    expect(csv).toContain("itemId");
  });
});
