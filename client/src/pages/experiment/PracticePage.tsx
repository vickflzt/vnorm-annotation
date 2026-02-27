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
import { useCountdown } from "@/hooks/useCountdown";
import { AlertTriangle, BookOpen, CheckCircle2, Clock, Info, Lock, XCircle } from "lucide-react";
import { toast } from "sonner";

interface PracticePageProps {
  condition: "AO" | "AJ";
  onCompleted: () => void;
}

// Same timing as real experiment
const PHASE1_SOFT_LIMIT = 180;  // 3 min — show warning dialog
const PHASE1_HARD_LIMIT = 240;  // 4 min — auto-skip (practice: just advance)
const PHASE2_SOFT_LIMIT = 60;   // 1 min — show warning dialog
const PHASE2_HARD_LIMIT = 90;   // 90s  — auto-advance (practice: just advance)

// Practice question data — intentionally wrong answer (2+3=6) so participants can judge "Incorrect"
const PRACTICE_QUESTION = {
  question: "What is $2 + 3$?",
  response: `We need to find the sum of 2 and 3.\n\nStep 1: Start with the number 2.\n\nStep 2: Count up 3 more numbers: 3, 4, 6.\n\nStep 3: The last number we counted is 6.\n\nTherefore, $2 + 3 = 6$.`,
  extractedResponseAnswer: "$6$",
};

const CONFIDENCE_OPTIONS = [
  { value: 1, labelZh: "很不确定", labelEn: "Very uncertain" },
  { value: 2, labelZh: "不太确定", labelEn: "Uncertain" },
  { value: 3, labelZh: "一般确定", labelEn: "Neutral" },
  { value: 4, labelZh: "比较确定", labelEn: "Confident" },
  { value: 5, labelZh: "很确定", labelEn: "Very confident" },
] as const;

const HELPFULNESS_OPTIONS = [
  { value: 1, label: "Very Unhelpful", sublabel: "it confused or misled me", sublabelZh: "它使我感到困惑或误导了我" },
  { value: 2, label: "Somewhat Unhelpful", sublabel: "it didn't help much", sublabelZh: "它没有太大帮助" },
  { value: 3, label: "Neutral", sublabel: "it neither helped nor hurt", sublabelZh: "它既没有帮助也没有妨碍" },
  { value: 4, label: "Somewhat Helpful", sublabel: "it provided useful information", sublabelZh: "它提供了有用的信息" },
  { value: 5, label: "Very Helpful", sublabel: "it clearly supported my decision", sublabelZh: "它明确支持了我的判断" },
] as const;

export function PracticePage({ condition, onCompleted }: PracticePageProps) {
  const [phase, setPhase] = useState<"judgment" | "rating">("judgment");

  // Phase 1 state
  const [judgment, setJudgment] = useState<"correct" | "incorrect" | null>(null);
  const [phase1TimerActive, setPhase1TimerActive] = useState(true);
  const [showPhase1SoftDialog, setShowPhase1SoftDialog] = useState(false);
  const phase1SoftFiredRef = useRef(false);
  const phase1HardFiredRef = useRef(false);
  const phase1RtRef = useRef<number>(0);

  // Phase 2 state
  const [helpfulness, setHelpfulness] = useState<number | null>(null);
  const [confidenceRating, setConfidenceRating] = useState<number | null>(null);
  const [phase2TimerActive, setPhase2TimerActive] = useState(false);
  const [showPhase2SoftDialog, setShowPhase2SoftDialog] = useState(false);
  const phase2SoftFiredRef = useRef(false);
  const phase2HardFiredRef = useRef(false);

  // ── Phase 1 countdown ──────────────────────────────────────────────────────
  const handlePhase1HardExpire = useCallback(() => {
    // handled in elapsed watcher
  }, []);

  const {
    remaining: phase1Remaining,
    elapsedSeconds: phase1Elapsed,
    reset: resetPhase1Timer,
  } = useCountdown({
    durationSeconds: PHASE1_HARD_LIMIT,
    onExpire: handlePhase1HardExpire,
    active: phase1TimerActive,
  });

  useEffect(() => {
    if (!phase1TimerActive || phase === "rating") return;

    if (phase1Elapsed >= PHASE1_SOFT_LIMIT && !phase1SoftFiredRef.current) {
      phase1SoftFiredRef.current = true;
      setShowPhase1SoftDialog(true);
    }

    if (phase1Elapsed >= PHASE1_HARD_LIMIT && !phase1HardFiredRef.current) {
      phase1HardFiredRef.current = true;
      // Practice: just advance without saving data
      setPhase1TimerActive(false);
      onCompleted();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase1Elapsed, phase1TimerActive, phase]);

  // ── Phase 2 countdown ──────────────────────────────────────────────────────
  const handlePhase2HardExpire = useCallback(() => {
    // handled in elapsed watcher
  }, []);

  const {
    remaining: phase2Remaining,
    elapsedSeconds: phase2Elapsed,
    reset: resetPhase2Timer,
  } = useCountdown({
    durationSeconds: PHASE2_HARD_LIMIT,
    onExpire: handlePhase2HardExpire,
    active: phase2TimerActive,
  });

  useEffect(() => {
    if (!phase2TimerActive || phase !== "rating") return;

    if (phase2Elapsed >= PHASE2_SOFT_LIMIT && !phase2SoftFiredRef.current) {
      phase2SoftFiredRef.current = true;
      setShowPhase2SoftDialog(true);
    }

    if (phase2Elapsed >= PHASE2_HARD_LIMIT && !phase2HardFiredRef.current) {
      phase2HardFiredRef.current = true;
      // Practice: just advance without saving data
      setPhase2TimerActive(false);
      onCompleted();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase2Elapsed, phase2TimerActive, phase]);

  // ── Timer display ──────────────────────────────────────────────────────────
  const isPhase2 = phase === "rating";
  const displayElapsed = isPhase2 ? phase2Elapsed : phase1Elapsed;
  const displayRemaining = isPhase2 ? phase2Remaining : phase1Remaining;
  const displaySoftLimit = isPhase2 ? PHASE2_SOFT_LIMIT : PHASE1_SOFT_LIMIT;
  const displayHardLimit = isPhase2 ? PHASE2_HARD_LIMIT : PHASE1_HARD_LIMIT;
  const isOvertime = displayElapsed > displaySoftLimit;

  const timerPercent = isOvertime
    ? Math.min(100, ((displayElapsed - displaySoftLimit) / (displayHardLimit - displaySoftLimit)) * 100)
    : Math.min(100, (displayElapsed / displaySoftLimit) * 100);

  const timerColor = isOvertime ? "bg-red-500"
    : displayElapsed < displaySoftLimit * 0.67 ? "bg-emerald-500"
    : displayElapsed < displaySoftLimit * 0.83 ? "bg-amber-500"
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

  const overtimeElapsed = displayElapsed - displaySoftLimit;
  const hardLimitRemaining = displayHardLimit - displayElapsed;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleContinue = () => {
    if (!judgment) {
      toast.error("请先做出正确/错误判断 / Please select Correct or Incorrect first");
      return;
    }
    phase1RtRef.current = Math.round(phase1Elapsed * 10) / 10;
    setPhase1TimerActive(false);
    setPhase("rating");
    setPhase2TimerActive(true);
    resetPhase2Timer();
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }, 100);
  };

  const handleFinishPractice = () => {
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
    // No data saved — just proceed
    onCompleted();
  };

  const canSubmitPhase2 =
    !!judgment &&
    (condition !== "AJ" || helpfulness !== null) &&
    confidenceRating !== null;

  // Suppress unused warning — PRACTICE_QUESTION kept for reference
  void PRACTICE_QUESTION;

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
              时间已到 / Time's Up
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 leading-relaxed">
            本题 3 分钟时限已到，您还有 <span className="font-semibold text-red-600">60 秒</span>延长时间继续作答。超时后系统将自动跳过本题。
            <br />
            <span className="text-slate-400 text-xs">
              The 3-minute limit has passed. You have a 60-second extension. The question will be skipped automatically if time runs out.
            </span>
          </p>
          <DialogFooter>
            <Button
              onClick={() => setShowPhase1SoftDialog(false)}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
            >
              继续作答 / Continue
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
              时间已到 / Time's Up
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 leading-relaxed">
            评分时限已到，您还有 <span className="font-semibold text-red-600">30 秒</span>延长时间完成评分。超时后系统将自动提交。
            <br />
            <span className="text-slate-400 text-xs">
              The rating time limit has passed. You have a 30-second extension. Ratings will be submitted automatically if time runs out.
            </span>
          </p>
          <DialogFooter>
            <Button
              onClick={() => setShowPhase2SoftDialog(false)}
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
              <span className="text-sm font-medium text-slate-500">练习题</span>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                PRACTICE / 练习
              </span>
            </div>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {condition === "AO" ? "Answer Only" : "Answer + Justification"}
            </span>
          </div>
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
        <div className="h-1 bg-slate-100">
          <div
            className={`h-full transition-all duration-1000 ${timerColor}`}
            style={{ width: `${timerPercent}%` }}
          />
        </div>
      </div>

      {/* Overtime warning banner */}
      {isOvertime && (
        <div className="bg-red-50 border-b border-red-200">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-700 font-medium">
              {isPhase2
                ? `评分时限已超出，系统将在 ${Math.max(0, Math.ceil(hardLimitRemaining))} 秒后自动提交 / Rating time exceeded. Auto-submit in ${Math.max(0, Math.ceil(hardLimitRemaining))}s.`
                : `作答时限已超出，系统将在 ${Math.max(0, Math.ceil(hardLimitRemaining))} 秒后自动跳过本题 / Time exceeded. Auto-skip in ${Math.max(0, Math.ceil(hardLimitRemaining))}s.`}
            </p>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* ── Practice notice banner ── */}
        <div className="bg-amber-50 border border-amber-300 rounded-2xl px-6 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm font-bold text-amber-800">
              练习题 — 熟悉答题流程 / Practice Trial — Get Familiar with the Task
            </p>
          </div>
          <ul className="space-y-1.5 text-xs text-amber-700 leading-relaxed list-none pl-0">
            <li className="flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
              <span>
                <strong>第一部分（判断）：</strong>完成判断后点击"继续"，答案将立即锁定，无法修改。
                <br />
                <span className="text-amber-600">Part 1 (Judgment): Once you click "Continue", your answer is locked and cannot be changed.</span>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
              <span>
                <strong>计时提醒：</strong>每题第一部分限时 3 分钟，超时后弹出提示并延长 60 秒，再超时将自动跳过本题。第二部分限时 1 分钟，超时后延长 30 秒，再超时将自动提交。
                <br />
                <span className="text-amber-600">Timing: Part 1 has a 3-min limit (+60s extension, then auto-skip). Part 2 has a 1-min limit (+30s extension, then auto-submit).</span>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
              <span>
                <strong>第二部分（评分）：</strong>完成评分后点击"下一题"，将直接翻到下一题，无法回看。
                <br />
                <span className="text-amber-600">Part 2 (Ratings): After submitting, you will move directly to the next question with no option to go back.</span>
              </span>
            </li>
            {condition === "AJ" && (
              <li className="flex items-start gap-2">
                <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
                <span>
                  <strong>AJ 组提醒：</strong>请认真阅读下方模型的解答过程（LLM Response），它是您做出判断的重要依据。
                  <br />
                  <span className="text-amber-600">AJ Group: Please read the LLM Response carefully — it is intended to inform your judgment.</span>
                </span>
              </li>
            )}
          </ul>
        </div>

        {/* Question card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Question
            </span>
            <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">
              练习 / Practice
            </span>
          </div>
          <div className="px-6 py-5">
            <p className="text-base text-slate-800">
              What is $2 + 3$?
            </p>
          </div>
        </div>

        {/* AJ: Full response with reading reminder badge */}
        {condition === "AJ" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-blue-50 border-b border-blue-100 px-6 py-3 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                LLM Response / 给出的解答过程（Answer + Justification）
              </span>
              <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                <BookOpen className="w-3.5 h-3.5" />
                请认真阅读 / Read carefully
              </span>
            </div>
            <div className="px-6 py-5 text-sm text-slate-700 leading-relaxed space-y-2">
              <p>We need to find the sum of 2 and 3.</p>
              <p>Step 1: Start with the number 2.</p>
              <p>Step 2: Count up 3 more numbers: 3, 4, 6.</p>
              <p>Step 3: The last number we counted is 6.</p>
              <p>Therefore, $2 + 3 = 6$.</p>
            </div>
          </div>
        )}

        {/* Final answer box */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-3">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
              LLM Final Answer / 给出的最终答案
            </span>
          </div>
          <div className="px-6 py-4">
            <div className="text-lg font-mono font-bold text-slate-900">
              6
            </div>
          </div>
        </div>

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

        {/* ── PHASE 2: Ratings ── */}
        {isPhase2 && (
          <div className="space-y-5">
            {/* Phase 2 header banner */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-6 py-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-500 shrink-0" />
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
                        <p className={`text-sm ${helpfulness === opt.value ? "text-indigo-800" : "text-slate-700"}`}>
                          {opt.label}
                        </p>
                        <p className={`text-sm mt-0.5 ${helpfulness === opt.value ? "text-indigo-800" : "text-slate-700"}`}>
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
                    请选择一个选项后才能提交 / Please select an option to proceed.
                  </p>
                )}
              </div>
            )}

            {/* Confidence rating */}
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
                    <span className={`text-xs leading-tight ${confidenceRating === opt.value ? "text-violet-700" : "text-slate-600"}`}>
                      {opt.labelEn}
                    </span>
                    <span className={`text-xs leading-tight ${confidenceRating === opt.value ? "text-violet-700" : "text-slate-600"}`}>
                      {opt.labelZh}
                    </span>
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

            {/* Finish practice button */}
            <div className="flex justify-end pb-8">
              <Button
                onClick={handleFinishPractice}
                disabled={!canSubmitPhase2}
                size="lg"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 min-w-40 disabled:opacity-50"
              >
                完成练习 / Finish Practice →
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
