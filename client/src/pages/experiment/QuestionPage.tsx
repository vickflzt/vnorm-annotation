import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MathRenderer } from "@/components/MathRenderer";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import { useCountdown } from "@/hooks/useCountdown";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

interface Question {
  itemId: string;
  category: string;
  question: string;
  response: string | null | undefined;
  extractedResponseAnswer: string | null | undefined;
  difficultyLevel: number | null | undefined;
  subject: string | null | undefined;
  figureUrl: string | null | undefined;
}

interface QuestionPageProps {
  participantId: string;
  condition: "AO" | "AJ";
  questions: Question[];
  initialIndex: number;
  onCompleted: () => void;
  onTerminated: () => void;
}

// Phase 1: judgment (3 min), Phase 2: helpfulness + confidence (1 min)
const PHASE1_TIME_LIMIT = 180; // 3 minutes
const PHASE2_TIME_LIMIT = 60;  // 1 minute

const CONFIDENCE_OPTIONS = [
  { value: 1, labelZh: "1 = 很不确定", labelEn: "1 = Very uncertain" },
  { value: 2, labelZh: "2 = 不太确定", labelEn: "2 = Uncertain" },
  { value: 3, labelZh: "3 = 一般确定", labelEn: "3 = Neutral" },
  { value: 4, labelZh: "4 = 比较确定", labelEn: "4 = Confident" },
  { value: 5, labelZh: "5 = 很确定", labelEn: "5 = Very confident" },
] as const;

const HELPFULNESS_OPTIONS = [
  {
    value: 1,
    label: "1 — Very Unhelpful",
    sublabel: "it confused or misled me",
    sublabelZh: "它使我感到困惑或误导了我",
  },
  {
    value: 2,
    label: "2 — Somewhat Unhelpful",
    sublabel: "it didn't help much",
    sublabelZh: "它没有太大帮助",
  },
  {
    value: 3,
    label: "3 — Neutral",
    sublabel: "it neither helped nor hurt",
    sublabelZh: "它既没有帮助也没有妨碍",
  },
  {
    value: 4,
    label: "4 — Somewhat Helpful",
    sublabel: "it provided useful information",
    sublabelZh: "它提供了有用的信息",
  },
  {
    value: 5,
    label: "5 — Very Helpful",
    sublabel: "it clearly supported my decision",
    sublabelZh: "它明确支持了我的判断",
  },
] as const;

export function QuestionPage({
  participantId,
  condition,
  questions,
  initialIndex,
  onCompleted,
  onTerminated,
}: QuestionPageProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Phase: "judgment" = phase 1, "rating" = phase 2
  const [phase, setPhase] = useState<"judgment" | "rating">("judgment");

  // Phase 1 state
  const [judgment, setJudgment] = useState<"correct" | "incorrect" | null>(null);
  const [phase1TimerActive, setPhase1TimerActive] = useState(true);
  const [showPhase1TimeoutDialog, setShowPhase1TimeoutDialog] = useState(false);
  // Captured rt for phase 1 when user clicks Continue
  const phase1RtRef = useRef<number>(0);

  // Phase 2 state
  const [helpfulness, setHelpfulness] = useState<number | null>(null);
  const [confidenceRating, setConfidenceRating] = useState<number | null>(null);
  const [phase2TimerActive, setPhase2TimerActive] = useState(false);
  const [showPhase2TimeoutDialog, setShowPhase2TimeoutDialog] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitResponse = trpc.experiment.submitResponse.useMutation();

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  // Reset all state when question changes
  useEffect(() => {
    setPhase("judgment");
    setJudgment(null);
    setHelpfulness(null);
    setConfidenceRating(null);
    setPhase1TimerActive(true);
    setPhase2TimerActive(false);
    setShowPhase1TimeoutDialog(false);
    setShowPhase2TimeoutDialog(false);
    phase1RtRef.current = 0;
  }, [currentIndex]);

  // Phase 1 timeout handler
  const handlePhase1Timeout = useCallback(() => {
    if (isSubmitting) return;
    setPhase1TimerActive(false);
    setShowPhase1TimeoutDialog(true);
  }, [isSubmitting]);

  // Phase 2 timeout handler
  const handlePhase2Timeout = useCallback(() => {
    if (isSubmitting) return;
    setPhase2TimerActive(false);
    setShowPhase2TimeoutDialog(true);
  }, [isSubmitting]);

  // Phase 1 countdown (3 min)
  const {
    remaining: phase1Remaining,
    elapsedSeconds: phase1Elapsed,
    reset: resetPhase1Timer,
  } = useCountdown({
    durationSeconds: PHASE1_TIME_LIMIT,
    onExpire: handlePhase1Timeout,
    active: phase1TimerActive && !isSubmitting,
  });

  // Phase 2 countdown (1 min)
  const {
    remaining: phase2Remaining,
    elapsedSeconds: phase2Elapsed,
    reset: resetPhase2Timer,
  } = useCountdown({
    durationSeconds: PHASE2_TIME_LIMIT,
    onExpire: handlePhase2Timeout,
    active: phase2TimerActive && !isSubmitting,
  });

  // Anti-cheat
  useAntiCheat({
    participantId,
    questionIndex: currentIndex,
    itemId: currentQuestion?.itemId ?? "",
    active: true,
    onTerminated,
  });

  // Determine which timer to show in top bar
  const activePhase = phase;
  const displayRemaining = activePhase === "judgment" ? phase1Remaining : phase2Remaining;
  const displayLimit = activePhase === "judgment" ? PHASE1_TIME_LIMIT : PHASE2_TIME_LIMIT;
  const timerPercent = (displayRemaining / displayLimit) * 100;
  const timerColor =
    displayRemaining > (displayLimit * 0.33)
      ? "bg-emerald-500"
      : displayRemaining > (displayLimit * 0.17)
      ? "bg-amber-500"
      : "bg-red-500";
  const timerTextColor =
    displayRemaining > (displayLimit * 0.33)
      ? "text-emerald-700"
      : displayRemaining > (displayLimit * 0.17)
      ? "text-amber-700"
      : "text-red-700";

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Handle "Continue" button (end of phase 1)
  const handleContinue = () => {
    if (!judgment) {
      toast.error("请先做出正确/错误判断 / Please select Correct or Incorrect first");
      return;
    }
    // Capture phase 1 RT: if timer still active use elapsed, else cap at limit
    const rt = phase1TimerActive ? phase1Elapsed : PHASE1_TIME_LIMIT;
    phase1RtRef.current = Math.round(rt * 10) / 10;

    // Stop phase 1 timer, start phase 2 timer
    setPhase1TimerActive(false);
    setPhase("rating");
    // Phase 2 timer starts when user sees the rating section
    setPhase2TimerActive(true);
    resetPhase2Timer();

    // Scroll down so the new rating section is visible
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }, 100);
  };

  // Handle final submit (end of phase 2)
  const doSubmit = async () => {
    if (isSubmitting || !currentQuestion) return;

    if (!judgment) {
      toast.error("请先做出正确/错误判断 / Please select Correct or Incorrect first");
      return;
    }
    if (condition === "AJ" && helpfulness === null) {
      toast.error("请评价解释的帮助程度 / Please rate the helpfulness of the justification");
      return;
    }
    if (confidenceRating === null) {
      toast.error("请选择置信度评分 / Please select a confidence rating");
      return;
    }

    setIsSubmitting(true);
    setPhase2TimerActive(false);

    // Phase 2 RT: if timer still active use elapsed, else cap at limit
    const confRt = phase2TimerActive ? phase2Elapsed : PHASE2_TIME_LIMIT;
    const confidenceRtSeconds = Math.round(confRt * 10) / 10;

    try {
      const result = await submitResponse.mutateAsync({
        participantId,
        itemId: currentQuestion.itemId,
        category: currentQuestion.category as "TP" | "TN" | "FP" | "FN" | "GSM-CHECK",
        questionIndex: currentIndex,
        responseCorrect: judgment === "correct",
        rtSeconds: phase1RtRef.current,
        timedOut: !phase1TimerActive && phase1Remaining <= 0,
        helpfulness: condition === "AJ" ? (helpfulness ?? null) : null,
        confidenceRating: confidenceRating ?? null,
        confidenceRtSeconds,
      });

      if (result.isCompleted) {
        onCompleted();
      } else {
        setCurrentIndex(result.nextIndex);
        setIsSubmitting(false);
        resetPhase1Timer();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setIsSubmitting(false);
      setPhase2TimerActive(true);
      toast.error("提交失败，请重试 / Submission failed, please retry");
    }
  };

  if (!currentQuestion) return null;

  const isPhase2 = phase === "rating";
  const canSubmitPhase2 =
    !!judgment &&
    (condition !== "AJ" || helpfulness !== null) &&
    confidenceRating !== null &&
    !isSubmitting;

  return (
    <div
      className="min-h-screen bg-slate-50 select-none"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      {/* Phase 1 timeout dialog */}
      <Dialog open={showPhase1TimeoutDialog} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-sm"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Clock className="w-5 h-5" />
              时间已到 / Time's Up
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 leading-relaxed">
            本题 3 分钟时限已到，但您仍可继续作答并点击继续。
            <br />
            <span className="text-slate-400 text-xs">
              The 3-minute limit has passed. You may still complete and click Continue.
            </span>
          </p>
          <DialogFooter>
            <Button
              onClick={() => setShowPhase1TimeoutDialog(false)}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
            >
              继续作答 / Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 2 timeout dialog */}
      <Dialog open={showPhase2TimeoutDialog} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-sm"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Clock className="w-5 h-5" />
              时间已到 / Time's Up
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 leading-relaxed">
            1 分钟时限已到，但您仍可完成评分并提交。
            <br />
            <span className="text-slate-400 text-xs">
              The 1-minute limit has passed. You may still complete the ratings and submit.
            </span>
          </p>
          <DialogFooter>
            <Button
              onClick={() => setShowPhase2TimeoutDialog(false)}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
            >
              继续评分 / Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-500">题目</span>
              <span className="text-sm font-bold text-slate-900">
                {currentIndex + 1} / {totalQuestions}
              </span>
            </div>
            <div className="w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {condition === "AO" ? "Answer Only" : "Answer + Justification"}
            </span>
          </div>

          {/* Timer — shows phase label + countdown */}
          <div className={`flex items-center gap-2 ${timerTextColor}`}>
            <Clock className="w-4 h-4" />
            <span className="text-xs text-slate-400 mr-0.5">
              {isPhase2 ? "P2" : "P1"}
            </span>
            <span className="text-sm font-mono font-bold">{formatTime(displayRemaining)}</span>
          </div>
        </div>
        {/* Timer bar */}
        <div className="h-1 bg-slate-100">
          <div
            className={`h-full transition-all duration-1000 ${timerColor}`}
            style={{ width: `${timerPercent}%` }}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Question card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Question
            </span>
            <span className="text-xs text-slate-400">{currentQuestion.itemId}</span>
          </div>
          <div className="px-6 py-5">
            <MathRenderer content={currentQuestion.question} />
          </div>
          {currentQuestion.figureUrl && (
            <div className="px-6 pb-5 flex justify-center">
              <img
                src={currentQuestion.figureUrl}
                alt="Geometric diagram for this problem"
                className="max-w-xs w-full h-auto border border-slate-100 rounded-lg"
                draggable={false}
              />
            </div>
          )}
        </div>

        {/* AJ: Full response / justification */}
        {condition === "AJ" && currentQuestion.response && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-blue-50 border-b border-blue-100 px-6 py-3">
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                LLM Response / 给出的解答过程（Answer + Justification）
              </span>
            </div>
            <div className="px-6 py-5 max-h-[480px] overflow-y-auto overflow-x-hidden min-w-0">
              <MathRenderer content={currentQuestion.response} className="min-w-0" />
            </div>
          </div>
        )}

        {/* Final answer box */}
        {currentQuestion.extractedResponseAnswer && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-amber-50 border-b border-amber-100 px-6 py-3">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                LLM Final Answer / 给出的最终答案
              </span>
            </div>
            <div className="px-6 py-4">
              <div className="text-lg font-mono font-bold text-slate-900">
                <MathRenderer
                  content={currentQuestion.extractedResponseAnswer}
                  isMathOnly
                />
              </div>
            </div>
          </div>
        )}

        {/* ── PHASE 1: Judgment ── */}
        <div
          className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-6 transition-opacity ${
            isPhase2 ? "opacity-60 pointer-events-none" : ""
          }`}
        >
          <p className="text-sm font-semibold text-slate-800 mb-1">
            Is the proposed answer correct? / 给出的答案是否正确？
          </p>
          <p className="text-xs text-slate-500 mb-4">
            请根据页面所提供的信息做出判断 / Please judge based on the information shown above
          </p>
          <RadioGroup
            value={judgment ?? ""}
            onValueChange={(v) => {
              if (!isPhase2) setJudgment(v as "correct" | "incorrect");
            }}
            className="flex gap-4"
          >
            <label
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                isPhase2 ? "cursor-default" : "cursor-pointer"
              } ${
                judgment === "correct"
                  ? "border-emerald-500 bg-emerald-50"
                  : isPhase2
                  ? "border-slate-200"
                  : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50"
              }`}
            >
              <RadioGroupItem value="correct" id="correct" className="sr-only" />
              <CheckCircle2
                className={`w-5 h-5 shrink-0 ${judgment === "correct" ? "text-emerald-600" : "text-slate-400"}`}
              />
              <div>
                <p className={`font-semibold text-sm ${judgment === "correct" ? "text-emerald-800" : "text-slate-700"}`}>
                  正确 / Correct
                </p>
                <p className="text-xs text-slate-500">答案是正确的</p>
              </div>
            </label>

            <label
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                isPhase2 ? "cursor-default" : "cursor-pointer"
              } ${
                judgment === "incorrect"
                  ? "border-red-500 bg-red-50"
                  : isPhase2
                  ? "border-slate-200"
                  : "border-slate-200 hover:border-red-300 hover:bg-red-50/50"
              }`}
            >
              <RadioGroupItem value="incorrect" id="incorrect" className="sr-only" />
              <XCircle
                className={`w-5 h-5 shrink-0 ${judgment === "incorrect" ? "text-red-600" : "text-slate-400"}`}
              />
              <div>
                <p className={`font-semibold text-sm ${judgment === "incorrect" ? "text-red-800" : "text-slate-700"}`}>
                  错误 / Incorrect
                </p>
                <p className="text-xs text-slate-500">答案是错误的</p>
              </div>
            </label>
          </RadioGroup>
        </div>

        {/* Phase 1 Continue button */}
        {!isPhase2 && (
          <div className="flex justify-end">
            <Button
              onClick={handleContinue}
              size="lg"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 min-w-40"
            >
              继续 / Continue →
            </Button>
          </div>
        )}

        {/* ── PHASE 2: Ratings (revealed after Continue) ── */}
        {isPhase2 && (
          <div className="space-y-5">
            {/* Phase 2 header banner */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-6 py-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
              <p className="text-xs text-indigo-700 font-medium">
                判断已锁定，请完成以下评分后提交 / Judgment locked. Please complete the ratings below.
              </p>
            </div>

            {/* AJ only: Helpfulness rating */}
            {condition === "AJ" && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <p className="text-sm font-semibold text-slate-800 mb-1">
                  How helpful was the justification in making your decision?
                </p>
                <p className="text-xs text-slate-500 mb-5">
                  解释对您做出判断有多大帮助？（必填 / Required）
                </p>
                <RadioGroup
                  value={helpfulness !== null ? String(helpfulness) : ""}
                  onValueChange={(v) => setHelpfulness(Number(v))}
                  className="space-y-2"
                >
                  {HELPFULNESS_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                        helpfulness === opt.value
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40"
                      }`}
                    >
                      <RadioGroupItem
                        value={String(opt.value)}
                        id={`help-${opt.value}`}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold ${
                            helpfulness === opt.value ? "text-indigo-800" : "text-slate-700"
                          }`}
                        >
                          {opt.label}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {opt.sublabel} · {opt.sublabelZh}
                        </p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
                {helpfulness === null && (
                  <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    请选择一个选项后才能提交 / Please select an option to proceed.
                  </p>
                )}
              </div>
            )}

            {/* Confidence rating — all conditions */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <p className="text-sm font-semibold text-slate-800 mb-1">
                你对刚才判断有多确定？
              </p>
              <p className="text-xs text-slate-500 mb-5">
                How confident are you in your previous judgment?（必填 / Required）
              </p>
              <RadioGroup
                value={confidenceRating !== null ? String(confidenceRating) : ""}
                onValueChange={(v) => setConfidenceRating(Number(v))}
                className="flex gap-2 flex-wrap"
              >
                {CONFIDENCE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex-1 min-w-[80px] flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all text-center ${
                      confidenceRating === opt.value
                        ? "border-violet-500 bg-violet-50"
                        : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/40"
                    }`}
                  >
                    <RadioGroupItem
                      value={String(opt.value)}
                      id={`conf-${opt.value}`}
                      className="sr-only"
                    />
                    <span className={`text-xl font-bold ${
                      confidenceRating === opt.value ? "text-violet-700" : "text-slate-500"
                    }`}>{opt.value}</span>
                    <span className={`text-xs leading-tight ${
                      confidenceRating === opt.value ? "text-violet-700 font-medium" : "text-slate-500"
                    }`}>{opt.labelZh}</span>
                    <span className={`text-xs leading-tight ${
                      confidenceRating === opt.value ? "text-violet-600" : "text-slate-400"
                    }`}>{opt.labelEn}</span>
                  </label>
                ))}
              </RadioGroup>
              {confidenceRating === null && (
                <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  请选择一个选项后才能提交 / Please select an option to proceed.
                </p>
              )}
            </div>

            {/* Submit button */}
            <div className="flex justify-end pb-8">
              <Button
                onClick={doSubmit}
                disabled={!canSubmitPhase2}
                size="lg"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 min-w-40 disabled:opacity-50"
              >
                {isSubmitting
                  ? "提交中... / Submitting..."
                  : isLastQuestion
                  ? "完成实验 / Finish"
                  : "下一题 / Next →"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
