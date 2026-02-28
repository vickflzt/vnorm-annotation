import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ConsentPage } from "./experiment/ConsentPage";
import { ParticipantCodePage } from "./experiment/ParticipantCodePage";
import { InstructionsPage } from "./experiment/InstructionsPage";
import { PracticePage } from "./experiment/PracticePage";
import { PracticeCompletePage } from "./experiment/PracticeCompletePage";
import { QuestionPage } from "./experiment/QuestionPage";
import { CompletionPage } from "./experiment/CompletionPage";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";

type Stage = "landing" | "loading" | "consent" | "participant-code" | "instructions" | "practice" | "practice-complete" | "active" | "completed" | "terminated";

export default function ExperimentPage() {
  const [stage, setStage] = useState<Stage>("landing");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [condition, setCondition] = useState<"AO" | "AJ" | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Extract invite token from URL query string (?token=xxx)
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get("token") ?? undefined;

  // Validate token on mount if present
  const { data: tokenData, error: tokenValidationError } = trpc.experiment.validateToken.useQuery(
    { token: inviteToken! },
    { enabled: !!inviteToken, retry: false }
  );

  useEffect(() => {
    if (tokenValidationError) {
      const msg = tokenValidationError.message;
      setTokenError(
        msg.includes("closed")
          ? "该实验组当前已关闭招募，请联系实验负责人。\nThis experiment group is currently closed."
          : "邀请链接无效或已过期。\nInvalid or expired invite link."
      );
    }
  }, [tokenValidationError]);

  const createSession = trpc.experiment.createSession.useMutation();
  const { data: sessionData } = trpc.experiment.getSession.useQuery(
    { participantId: participantId! },
    {
      enabled: !!participantId && stage !== "landing" && stage !== "loading",
      refetchOnWindowFocus: false,
    }
  );

  const handleStart = async () => {
    setStage("loading");
    try {
      const result = await createSession.mutateAsync({ inviteToken });
      setParticipantId(result.participantId);
      setCondition(result.condition);
      setStage("consent");
    } catch (e: unknown) {
      setStage("landing");
      const msg = e instanceof Error ? e.message : "未知错误";
      setTokenError(`创建会话失败：${msg}`);
    }
  };

  const handleConsented = () => setStage("participant-code");
  const handleStartExperiment = () => setStage("practice");
  const handlePracticeCompleted = () => setStage("practice-complete");
  const handlePracticeConfirmed = () => setStage("active");
  const handleCompleted = () => setStage("completed");
  const handleTerminated = () => setStage("terminated");

  // Token error state
  if (tokenError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 p-8 text-center shadow-sm space-y-4">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">无法访问实验</h2>
          <p className="text-sm text-slate-600 whitespace-pre-line">{tokenError}</p>
        </div>
      </div>
    );
  }

  // Landing page
  if (stage === "landing") {
    // Show loading while validating token
    if (inviteToken && !tokenData && !tokenValidationError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full text-center space-y-8">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-white text-2xl font-bold">V</span>
            </div>
          </div>

          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-3">
              V-Norm Annotation Study
            </h1>
            <p className="text-lg text-slate-600 mb-2">Math Answer Judgment Study</p>
            <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
              This study investigates how humans evaluate AI-generated math answers. The study takes approximately 45–50 minutes.
            </p>
            <p className="text-sm text-slate-400 max-w-lg mx-auto mt-1">
              本研究旨在了解人类如何判断 AI 生成的数学答案是否正确。参与本实验约需 45–50 分钟。
            </p>
          </div>

          {/* Condition badge (if token-assigned) */}
          {tokenData && (
            <div className="inline-flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1 text-xs text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
              {tokenData.condition}
            </div>
          )}

          {/* Info cards */}
          <div className="grid grid-cols-3 gap-4 text-left">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <p className="text-2xl font-bold text-indigo-600 mb-1">16</p>
              <p className="text-xs text-slate-600">Math questions<br />道数学题</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <p className="text-2xl font-bold text-indigo-600 mb-1">3 min</p>
              <p className="text-xs text-slate-600">Per question<br />每题时限</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <p className="text-2xl font-bold text-indigo-600 mb-1">Anon.</p>
              <p className="text-xs text-slate-600">Anonymous<br />匿名保护</p>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleStart}
              disabled={createSession.isPending}
              size="lg"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-12 py-6 text-base rounded-xl shadow-md"
            >
              {createSession.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Preparing...
                </>
              ) : (
                "Click to Participate / 点击开始参与 →"
              )}
            </Button>
            <p className="text-xs text-slate-400">
              Clicking will take you to the consent form · 点击后将进入知情同意页面
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
          <p className="text-slate-600 text-sm">Assigning questions... / 正在分配题目</p>
        </div>
      </div>
    );
  }

  if (stage === "consent" && participantId) {
    return <ConsentPage participantId={participantId} onConsented={handleConsented} />;
  }

  if (stage === "participant-code" && participantId) {
    return (
      <ParticipantCodePage
        participantId={participantId}
        onCodeSubmitted={() => setStage("instructions")}
      />
    );
  }

  if (stage === "instructions" && participantId && condition) {
    return (
      <InstructionsPage
        participantId={participantId}
        condition={condition}
        onStart={handleStartExperiment}
      />
    );
  }

  if (stage === "practice" && condition) {
    return (
      <PracticePage
        condition={condition}
        onCompleted={handlePracticeCompleted}
      />
    );
  }

  if (stage === "practice-complete" && condition) {
    return (
      <PracticeCompletePage
        condition={condition}
        onStart={handlePracticeConfirmed}
      />
    );
  }

  if (stage === "active" && participantId && condition && sessionData) {
    const questions = (sessionData.questions ?? []).filter(Boolean) as NonNullable<
      (typeof sessionData.questions)[0]
    >[];
    return (
      <QuestionPage
        participantId={participantId}
        condition={condition}
        questions={questions}
        initialIndex={sessionData.currentIndex ?? 0}
        onCompleted={handleCompleted}
        onTerminated={handleTerminated}
      />
    );
  }

  if (stage === "completed" && participantId) {
    return <CompletionPage participantId={participantId} />;
  }

  if (stage === "terminated" && participantId) {
    return <CompletionPage participantId={participantId} terminated />;
  }

  // Fallback loading
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );
}
