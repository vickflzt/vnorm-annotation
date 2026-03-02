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
  /** Per-item condition for MIX sessions; falls back to session condition for AO/AJ sessions */
  itemCondition?: "AO" | "AJ" | null;
}

interface QuestionPageProps {
  participantId: string;
  condition: "AO" | "AJ" | "MIX";
  questions: Question[];
  initialIndex: number;
  onCompleted: () => void;
  onTerminated: () => void;
}

// Phase 1: judgment (3 min soft limit, +1 min extension → 4 min hard limit)
// Phase 2: ratings (1 min soft limit, +30s extension → 90s hard limit)
const PHASE1_SOFT_LIMIT = 180;   // 3 min — show warning dialog
const PHASE1_HARD_LIMIT = 240;   // 4 min — auto-fail, skip to next question
const PHASE2_SOFT_LIMIT = 60;    // 1 min — show warning dialog
const PHASE2_HARD_LIMIT = 90;    // 90s  — auto-fail, auto-submit

const CONFIDENCE_OPTIONS = [
  { value: 1, labelZh: "很不确定", labelEn: "Very uncertain" },
  { value: 2, labelZh: "不太确定", labelEn: "Uncertain" },
  { value: 3, labelZh: "一般确定", labelEn: "Neutral" },
  { value: 4, labelZh: "比较确定", labelEn: "Confident" },
  { value: 5, labelZh: "很确定", labelEn: "Very confident" },
] as const;

const HELPFULNESS_OPTIONS = [
  {
    value: 1,
    label: "Very Unhelpful",
    sublabel: "it confused or misled me",
    sublabelZh: "它使我感到困惑或误导了我",
  },
  {
    value: 2,
    label: "Somewhat Unhelpful",
    sublabel: "it didn't help much",
    sublabelZh: "它没有太大帮助",
  },
  {
    value: 3,
    label: "Neutral",
    sublabel: "it neither helped nor hurt",
    sublabelZh: "它既没有帮助也没有妨碍",
  },
  {
    value: 4,
    label: "Somewhat Helpful",
    sublabel: "it provided useful information",
    sublabelZh: "它提供了有用的信息",
  },
  {
    value: 5,
    label: "Very Helpful",
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
  const [showPhase1SoftDialog, setShowPhase1SoftDialog] = useState(false);
  const phase1SoftFiredRef = useRef(false);
  const phase1HardFiredRef = useRef(false);
  // Captured rt for phase 1 when user clicks Continue
  const phase1RtRef = useRef<number>(0);

  // Phase 2 state
  const [helpfulness, setHelpfulness] = useState<number | null>(null);
  const [confidenceRating, setConfidenceRating] = useState<number | null>(null);
  const [phase2TimerActive, setPhase2TimerActive] = useState(false);
  const [showPhase2SoftDialog, setShowPhase2SoftDialog] = useState(false);
  const phase2SoftFiredRef = useRef(false);
  const phase2HardFiredRef = useRef(false);

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
    setShowPhase1SoftDialog(false);
    setShowPhase2SoftDialog(false);
    phase1SoftFiredRef.current = false;
    phase1HardFiredRef.current = false;
    phase2SoftFiredRef.current = false;
    phase2HardFiredRef.current = false;
    phase1RtRef.current = 0;
  }, [currentIndex]);

  // ── Phase 1 countdown ──────────────────────────────────────────────────────
  // We use PHASE1_HARD_LIMIT as the "duration" so the hook counts all the way
  // to 240s. We manually watch elapsed to fire the soft-limit dialog at 180s.
  const handlePhase1HardExpire = useCallback(() => {
    // This fires at 240s — auto-fail phase 1, skip to next question
    if (phase1HardFiredRef.current || isSubmitting) return;
    phase1HardFiredRef.current = true;
    // Will be handled in the elapsed watcher below
  }, [isSubmitting]);

  const {
    remaining: phase1Remaining,
    elapsedSeconds: phase1Elapsed,
    reset: resetPhase1Timer,
  } = useCountdown({
    durationSeconds: PHASE1_HARD_LIMIT,
    onExpire: handlePhase1HardExpire,
    active: phase1TimerActive && !isSubmitting,
  });

  // Watch phase 1 elapsed to fire soft-limit dialog at 180s and hard-limit auto-fail at 240s
  useEffect(() => {
    if (!phase1TimerActive || phase === "rating" || isSubmitting) return;

    // Soft limit: show dialog once at 180s
    if (phase1Elapsed >= PHASE1_SOFT_LIMIT && !phase1SoftFiredRef.current) {
      phase1SoftFiredRef.current = true;
      setShowPhase1SoftDialog(true);
    }

    // Hard limit: auto-fail at 240s
    if (phase1Elapsed >= PHASE1_HARD_LIMIT && !phase1HardFiredRef.current) {
      phase1HardFiredRef.current = true;
      doAutoFailPhase1();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase1Elapsed, phase1TimerActive, phase, isSubmitting]);

  // ── Phase 2 countdown ──────────────────────────────────────────────────────
  const handlePhase2HardExpire = useCallback(() => {
    // Fires at 90s — handled in elapsed watcher
    if (phase2HardFiredRef.current || isSubmitting) return;
    phase2HardFiredRef.current = true;
  }, [isSubmitting]);

  const {
    remaining: phase2Remaining,
    elapsedSeconds: phase2Elapsed,
    reset: resetPhase2Timer,
  } = useCountdown({
    durationSeconds: PHASE2_HARD_LIMIT,
    onExpire: handlePhase2HardExpire,
    active: phase2TimerActive && !isSubmitting,
  });

  // Watch phase 2 elapsed to fire soft-limit dialog at 60s and hard-limit auto-submit at 90s
  useEffect(() => {
    if (!phase2TimerActive || phase !== "rating" || isSubmitting) return;

    // Soft limit: show dialog once at 60s
    if (phase2Elapsed >= PHASE2_SOFT_LIMIT && !phase2SoftFiredRef.current) {
      phase2SoftFiredRef.current = true;
      setShowPhase2SoftDialog(true);
    }

    // Hard limit: auto-fail at 90s
    if (phase2Elapsed >= PHASE2_HARD_LIMIT && !phase2HardFiredRef.current) {
      phase2HardFiredRef.current = true;
      doAutoFailPhase2();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase2Elapsed, phase2TimerActive, phase, isSubmitting]);

  // Anti-cheat
  useAntiCheat({
    participantId,
    questionIndex: currentIndex,
    itemId: currentQuestion?.itemId ?? "",
    active: true,
    onTerminated,
  });

  // ── Auto-fail helpers ──────────────────────────────────────────────────────

  /**
   * Phase 1 hard timeout: judgment = null, confidence = null, helpfulness = null.
   * Directly submit and skip to next question (no phase 2).
   */
  const doAutoFailPhase1 = useCallback(async () => {
    if (isSubmitting || !currentQuestion) return;
    setIsSubmitting(true);
    setPhase1TimerActive(false);

    try {
      const result = await submitResponse.mutateAsync({
        participantId,
        itemId: currentQuestion.itemId,
        category: currentQuestion.category as "TP" | "TN" | "FP" | "FN" | "GSM-CHECK",
        questionIndex: currentIndex,
        responseCorrect: null,       // fail
        rtSeconds: PHASE1_HARD_LIMIT,
        timedOut: true,
        helpfulness: null,           // fail
        confidenceRating: null,      // fail
        confidenceRtSeconds: null,
        ...(condition === "MIX" ? { itemCondition: currentQuestion.itemCondition ?? "AO" } : {}),
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
      toast.error("自动提交失败，请手动继续 / Auto-submit failed, please continue manually");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubmitting, currentQuestion, currentIndex, participantId]);

  /**
   * Phase 2 hard timeout: confidence = null, helpfulness = null (judgment kept).
   * Auto-submit with whatever judgment was recorded in phase 1.
   */
  const doAutoFailPhase2 = useCallback(async () => {
    if (isSubmitting || !currentQuestion) return;
    setIsSubmitting(true);
    setPhase2TimerActive(false);

    try {
      const result = await submitResponse.mutateAsync({
        participantId,
        itemId: currentQuestion.itemId,
        category: currentQuestion.category as "TP" | "TN" | "FP" | "FN" | "GSM-CHECK",
        questionIndex: currentIndex,
        responseCorrect: judgment === null ? null : judgment === "correct",   // keep whatever was selected (may be null if skipped)
        rtSeconds: phase1RtRef.current,
        timedOut: true,
        helpfulness: null,           // fail
        confidenceRating: null,      // fail
        confidenceRtSeconds: PHASE2_HARD_LIMIT,
        ...(condition === "MIX" ? { itemCondition: currentQuestion.itemCondition ?? "AO" } : {}),
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
      toast.error("自动提交失败，请手动继续 / Auto-submit failed, please continue manually");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubmitting, currentQuestion, currentIndex, participantId, judgment]);

  // ── Timer display ──────────────────────────────────────────────────────────

  // After soft limit, show overtime (elapsed - soft limit) counting up in red
  const isPhase1Overtime = phase === "judgment" && phase1Elapsed > PHASE1_SOFT_LIMIT;
  const isPhase2Overtime = phase === "rating" && phase2Elapsed > PHASE2_SOFT_LIMIT;

  // Display: during overtime show elapsed time (counting up); before that show remaining
  const displayElapsed = phase === "judgment" ? phase1Elapsed : phase2Elapsed;
  const displayRemaining = phase === "judgment" ? phase1Remaining : phase2Remaining;
  const displaySoftLimit = phase === "judgment" ? PHASE1_SOFT_LIMIT : PHASE2_SOFT_LIMIT;
  const displayHardLimit = phase === "judgment" ? PHASE1_HARD_LIMIT : PHASE2_HARD_LIMIT;
  const isOvertime = phase === "judgment" ? isPhase1Overtime : isPhase2Overtime;

  // Timer bar: during normal time fill by elapsed/soft; during overtime fill by (elapsed-soft)/(hard-soft)
  const timerPercent = isOvertime
    ? Math.min(100, ((displayElapsed - displaySoftLimit) / (displayHardLimit - displaySoftLimit)) * 100)
    : Math.min(100, (displayElapsed / displaySoftLimit) * 100);

  const timerColor = isOvertime ? "bg-red-500" : displayElapsed < displaySoftLimit * 0.67
    ? "bg-emerald-500"
    : displayElapsed < displaySoftLimit * 0.83
    ? "bg-amber-500"
    : "bg-red-500";

  const timerTextColor = isOvertime ? "text-red-700"
    : displayElapsed < displaySoftLimit * 0.67 ? "text-emerald-700"
    : displayElapsed < displaySoftLimit * 0.83 ? "text-amber-700"
    : "text-red-700";

  const formatTime = (s: number) => {
    const abs = Math.abs(s);
    const m = Math.floor(abs / 60);
    const sec = Math.floor(abs % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // During overtime, show +elapsed since soft limit
  const overtimeElapsed = displayElapsed - displaySoftLimit;
  const hardLimitRemaining = displayHardLimit - displayElapsed;

  // ── Phase 1 Continue button ────────────────────────────────────────────────
  const handleContinue = () => {
    if (!judgment) {
      toast.error("请先做出正确/错误判断 / Please select Correct or Incorrect first");
      return;
    }
    // Capture phase 1 RT
    phase1RtRef.current = Math.round(phase1Elapsed * 10) / 10;

    setPhase1TimerActive(false);
    setPhase("rating");
    setPhase2TimerActive(true);
    resetPhase2Timer();

    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }, 100);
  };

  // ── Normal phase 2 submit ──────────────────────────────────────────────────
  const doSubmit = async () => {
    if (isSubmitting || !currentQuestion) return;

    if (!judgment) {
      toast.error("请先做出正确/错误判断 / Please select Correct or Incorrect first");
      return;
    }
    const itemCond = condition === "MIX" ? (currentQuestion.itemCondition ?? "AO") : condition;
    if (itemCond === "AJ" && helpfulness === null) {
      toast.error("请评价解释的帮助程度 / Please rate the helpfulness of the justification");
      return;
    }
    if (confidenceRating === null) {
      toast.error("请选择置信度评分 / Please select a confidence rating");
      return;
    }

    setIsSubmitting(true);
    setPhase2TimerActive(false);

    const confRt = Math.round(phase2Elapsed * 10) / 10;

    try {
      const result = await submitResponse.mutateAsync({
        participantId,
        itemId: currentQuestion.itemId,
        category: currentQuestion.category as "TP" | "TN" | "FP" | "FN" | "GSM-CHECK",
        questionIndex: currentIndex,
        responseCorrect: judgment === "correct",
        rtSeconds: phase1RtRef.current,
        timedOut: false,
        helpfulness: (() => { const ic = condition === "MIX" ? (currentQuestion.itemCondition ?? "AO") : condition; return ic === "AJ" ? (helpfulness ?? null) : null; })(),
        confidenceRating: confidenceRating ?? null,
        confidenceRtSeconds: confRt,
        ...(condition === "MIX" ? { itemCondition: currentQuestion.itemCondition ?? "AO" } : {}),
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
  const effectiveItemCondition = condition === "MIX" ? (currentQuestion?.itemCondition ?? "AO") : condition;
  const canSubmitPhase2 =
    !!judgment &&
    (effectiveItemCondition !== "AJ" || helpfulness !== null) &&
    confidenceRating !== null &&
    !isSubmitting;

  return (
    <div
      className="min-h-screen bg-slate-50 select-none"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      {/* Phase 1 soft-limit dialog (180s) */}
      <Dialog open={showPhase1SoftDialog} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-sm"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Clock className="w-5 h-5" />
              Time's Up / 时间已到
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 leading-relaxed">
            The 3-minute limit has passed. You have a <span className="font-semibold text-red-600">60-second</span> extension. The question will be skipped automatically if time runs out.
            <br />
            <span className="text-slate-400 text-xs">
              本题 3 分钟时限已到，您还有 60 秒延长时间继续作答。超时后系统将自动跳过本题。
            </span>
          </p>
          <DialogFooter>
            <Button
              onClick={() => setShowPhase1SoftDialog(false)}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
            >
              Continue / 继续作答
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 2 soft-limit dialog (60s) */}
      <Dialog open={showPhase2SoftDialog} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-sm"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Clock className="w-5 h-5" />
              Time's Up / 时间已到
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 leading-relaxed">
            The rating time limit has passed. You have a <span className="font-semibold text-red-600">30-second</span> extension. Ratings will be submitted automatically if time runs out.
            <br />
            <span className="text-slate-400 text-xs">
              评分时限已到，您还有 30 秒延长时间完成评分。超时后系统将自动提交。
            </span>
          </p>
          <DialogFooter>
            <Button
              onClick={() => setShowPhase2SoftDialog(false)}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
            >
              Continue / 继续评分
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
              {condition === "AO" ? "Answer Only" : condition === "AJ" ? "Answer + Justification" : "Mixed (AO+AJ)"}
            </span>
          </div>

          {/* Timer — shows phase label + elapsed time (positive counter) */}
          <div className={`flex items-center gap-2 ${timerTextColor}`}>
            <Clock className="w-4 h-4" />
            <span className="text-xs text-slate-400 mr-0.5">
              {isPhase2 ? "P2" : "P1"}
            </span>
            <span className={`text-sm font-mono font-bold ${isOvertime ? "text-red-600" : ""}`}>
              {formatTime(displayElapsed)}
            </span>
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

      {/* Overtime warning banner */}
      {isOvertime && !isSubmitting && (
        <div className="bg-red-50 border-b border-red-200">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-700 font-medium">
              {isPhase2
                ? `Rating time exceeded. Auto-submit in ${Math.max(0, Math.ceil(hardLimitRemaining))}s. / 评分时限已超出，系统将在 ${Math.max(0, Math.ceil(hardLimitRemaining))} 秒后自动提交`
                : `Time exceeded. Auto-skip in ${Math.max(0, Math.ceil(hardLimitRemaining))}s. / 作答时限已超出，系统将在 ${Math.max(0, Math.ceil(hardLimitRemaining))} 秒后自动跳过本题`}
            </p>
          </div>
        </div>
      )}

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

        {/* AJ / MIX(AJ): Full response / justification */}
        {((condition === "AJ") || (condition === "MIX" && currentQuestion.itemCondition === "AJ")) && currentQuestion.response && (
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
            Please judge based on the information shown above / 请根据页面所提供的信息做出判断
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
                  Correct / 正确
                </p>
                <p className="text-xs text-slate-500">The proposed answer is correct</p>
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
                  Incorrect / 错误
                </p>
                <p className="text-xs text-slate-500">The proposed answer is incorrect</p>
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
              Continue / 继续 →
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
                Judgment locked. Please complete the ratings below. / 判断已锁定，请完成以下评分后提交
              </p>
            </div>

            {/* AJ only: Helpfulness rating */}
            {effectiveItemCondition === "AJ" && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <p className="text-sm font-semibold text-slate-800 mb-1">
                  How helpful was the justification in making your decision?
                </p>
                <p className="text-xs text-slate-500 mb-5">
                  How helpful was the justification? (必填 / Required)
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
                          className={`text-sm ${
                            helpfulness === opt.value ? "text-indigo-800" : "text-slate-700"
                          }`}
                        >
                          {opt.label}
                        </p>
                        <p className={`text-sm mt-0.5 ${
                          helpfulness === opt.value ? "text-indigo-800" : "text-slate-700"
                        }`}>
                          {opt.sublabelZh}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {opt.sublabel}
                        </p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
                {helpfulness === null && (
                  <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Please select an option to proceed. / 请选择一个选项后才能提交
                  </p>
                )}
              </div>
            )}

            {/* Confidence rating — all conditions */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <p className="text-sm font-semibold text-slate-800 mb-1">
                How confident are you in your previous judgment?
              </p>
              <p className="text-xs text-slate-500 mb-5">
                你对刚才的判断有多确定？（必填 / Required）
              </p>
              <RadioGroup
                value={confidenceRating !== null ? String(confidenceRating) : ""}
                onValueChange={(v) => setConfidenceRating(Number(v))}
                className="flex gap-2 flex-wrap"
              >
                {CONFIDENCE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex-1 min-w-[80px] flex flex-col items-center gap-1 p-3 rounded-xl border-2 cursor-pointer transition-all text-center ${
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
                    <span className={`text-xs leading-tight ${
                      confidenceRating === opt.value ? "text-violet-700" : "text-slate-600"
                    }`}>{opt.labelEn}</span>
                    <span className={`text-xs leading-tight ${
                      confidenceRating === opt.value ? "text-violet-700" : "text-slate-600"
                    }`}>{opt.labelZh}</span>
                  </label>
                ))}
              </RadioGroup>
              {confidenceRating === null && (
                <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Please select an option to proceed. / 请选择一个选项后才能提交
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
                  ? "Submitting... / 提交中..."
                  : isLastQuestion
                  ? "Finish / 完成实验"
                  : "Next / 下一题 →"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
