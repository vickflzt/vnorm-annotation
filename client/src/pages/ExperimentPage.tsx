import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ConsentPage } from "./experiment/ConsentPage";
import { InstructionsPage } from "./experiment/InstructionsPage";
import { QuestionPage } from "./experiment/QuestionPage";
import { CompletionPage } from "./experiment/CompletionPage";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Stage = "landing" | "loading" | "consent" | "instructions" | "active" | "completed" | "terminated";

export default function ExperimentPage() {
  const [stage, setStage] = useState<Stage>("landing");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [condition, setCondition] = useState<"AO" | "AJ" | null>(null);

  const createSession = trpc.experiment.createSession.useMutation();
  const { data: sessionData, refetch: refetchSession } = trpc.experiment.getSession.useQuery(
    { participantId: participantId! },
    {
      enabled: !!participantId && stage !== "landing" && stage !== "loading",
      refetchOnWindowFocus: false,
    }
  );

  const handleStart = async () => {
    setStage("loading");
    try {
      const result = await createSession.mutateAsync({});
      setParticipantId(result.participantId);
      setCondition(result.condition);
      setStage("consent");
    } catch {
      setStage("landing");
    }
  };

  const handleConsented = () => setStage("instructions");
  const handleStartExperiment = () => setStage("active");
  const handleCompleted = () => setStage("completed");
  const handleTerminated = () => setStage("terminated");

  // Landing page
  if (stage === "landing") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full text-center space-y-8">
          {/* Logo / Badge */}
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-white text-2xl font-bold">V</span>
            </div>
          </div>

          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-3">
              V-Norm Annotation Study
            </h1>
            <p className="text-lg text-slate-600 mb-2">
              数学答案判断实验
            </p>
            <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
              本研究旨在了解人类如何判断 AI 生成的数学答案是否正确。参与本实验约需 45–50 分钟。
            </p>
            <p className="text-sm text-slate-400 max-w-lg mx-auto mt-1">
              This study investigates how humans evaluate AI-generated math answers. The study takes approximately 45–50 minutes.
            </p>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-3 gap-4 text-left">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <p className="text-2xl font-bold text-indigo-600 mb-1">16</p>
              <p className="text-xs text-slate-600">道数学题<br/>Math questions</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <p className="text-2xl font-bold text-indigo-600 mb-1">3 min</p>
              <p className="text-xs text-slate-600">每题时限<br/>Per question</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <p className="text-2xl font-bold text-indigo-600 mb-1">匿名</p>
              <p className="text-xs text-slate-600">数据保护<br/>Anonymous</p>
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
                  准备中...
                </>
              ) : (
                "点击开始参与 / Click to Participate →"
              )}
            </Button>
            <p className="text-xs text-slate-400">
              点击后将进入知情同意页面 · Clicking will take you to the consent form
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
          <p className="text-slate-600 text-sm">正在分配题目 / Assigning questions...</p>
        </div>
      </div>
    );
  }

  if (stage === "consent" && participantId) {
    return <ConsentPage participantId={participantId} onConsented={handleConsented} />;
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

  if (stage === "active" && participantId && condition && sessionData) {
    const questions = (sessionData.questions ?? []).filter(Boolean) as NonNullable<typeof sessionData.questions[0]>[];
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
