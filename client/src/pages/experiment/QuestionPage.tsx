import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
}

interface QuestionPageProps {
  participantId: string;
  condition: "AO" | "AJ";
  questions: Question[];
  initialIndex: number;
  onCompleted: () => void;
  onTerminated: () => void;
}

const QUESTION_TIME_LIMIT = 180; // 3 minutes

// Helpfulness options per document spec
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
  const [judgment, setJudgment] = useState<"correct" | "incorrect" | null>(null);
  const [helpfulness, setHelpfulness] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timerActive, setTimerActive] = useState(true);
  const startTimeRef = useRef<number>(Date.now());

  const submitResponse = trpc.experiment.submitResponse.useMutation();

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  // Reset state when question changes
  useEffect(() => {
    setJudgment(null);
    setHelpfulness(null);
    setTimerActive(true);
    startTimeRef.current = Date.now();
  }, [currentIndex]);

  const handleTimeout = useCallback(async () => {
    if (isSubmitting) return;
    setTimerActive(false);
    toast.warning("时间到！已自动提交 / Time's up! Auto-submitted", { duration: 2000 });
    await doSubmit(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isSubmitting]);

  const { remaining, elapsedSeconds, reset: resetTimer } = useCountdown({
    durationSeconds: QUESTION_TIME_LIMIT,
    onExpire: handleTimeout,
    active: timerActive && !isSubmitting,
  });

  // Anti-cheat
  useAntiCheat({
    participantId,
    questionIndex: currentIndex,
    itemId: currentQuestion?.itemId ?? "",
    active: true,
    onTerminated,
  });

  const doSubmit = async (responseCorrect: boolean | null, timedOut: boolean) => {
    if (isSubmitting || !currentQuestion) return;
    setIsSubmitting(true);
    setTimerActive(false);

    const rt = timedOut ? QUESTION_TIME_LIMIT : elapsedSeconds;

    try {
      const result = await submitResponse.mutateAsync({
        participantId,
        itemId: currentQuestion.itemId,
        category: currentQuestion.category as "TP" | "TN" | "FP" | "FN" | "GSM-CHECK",
        questionIndex: currentIndex,
        responseCorrect,
        rtSeconds: Math.round(rt * 10) / 10,
        timedOut,
        helpfulness: condition === "AJ" ? (helpfulness ?? null) : null,
      });

      if (result.isCompleted) {
        onCompleted();
      } else {
        setCurrentIndex(result.nextIndex);
        setIsSubmitting(false);
        resetTimer();
      }
    } catch {
      setIsSubmitting(false);
      setTimerActive(true);
      toast.error("提交失败，请重试 / Submission failed, please retry");
    }
  };

  const handleSubmit = () => {
    if (!judgment) {
      toast.error("请先做出正确/错误判断 / Please select Correct or Incorrect first");
      return;
    }
    if (condition === "AJ" && helpfulness === null) {
      toast.error("请评价解释的帮助程度 / Please rate the helpfulness of the justification");
      return;
    }
    doSubmit(judgment === "correct", false);
  };

  if (!currentQuestion) return null;

  const timerPercent = (remaining / QUESTION_TIME_LIMIT) * 100;
  const timerColor =
    remaining > 60 ? "bg-emerald-500" : remaining > 30 ? "bg-amber-500" : "bg-red-500";
  const timerTextColor =
    remaining > 60 ? "text-emerald-700" : remaining > 30 ? "text-amber-700" : "text-red-700";

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Determine if Next button should be enabled
  const canSubmit =
    !!judgment && (condition !== "AJ" || helpfulness !== null) && !isSubmitting;

  return (
    <div
      className="min-h-screen bg-slate-50 select-none"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
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

          {/* Timer */}
          <div className={`flex items-center gap-2 ${timerTextColor}`}>
            <Clock className="w-4 h-4" />
            <span className="text-sm font-mono font-bold">{formatTime(remaining)}</span>
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
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Question
              </span>
              {currentQuestion.subject && (
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  {currentQuestion.subject}
                </span>
              )}
            </div>
            <span className="text-xs text-slate-400">{currentQuestion.itemId}</span>
          </div>
          <div className="px-6 py-5">
            <MathRenderer content={currentQuestion.question} />
          </div>
        </div>

        {/* AJ: Full response / justification */}
        {condition === "AJ" && currentQuestion.response && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-blue-50 border-b border-blue-100 px-6 py-3">
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                LLM Response / 给出的解答过程（Answer + Justification）
              </span>
            </div>
            <div className="px-6 py-5 max-h-[480px] overflow-y-auto">
              <MathRenderer content={currentQuestion.response} />
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

        {/* Judgment: Correct / Incorrect */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <p className="text-sm font-semibold text-slate-800 mb-1">
            Is the proposed answer correct? / 给出的答案是否正确？
          </p>
          <p className="text-xs text-slate-500 mb-4">
            请根据页面所提供的信息做出判断 / Judge based only on the information shown above.
          </p>
          <RadioGroup
            value={judgment ?? ""}
            onValueChange={(v) => setJudgment(v as "correct" | "incorrect")}
            className="flex gap-4"
          >
            <label
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                judgment === "correct"
                  ? "border-emerald-500 bg-emerald-50"
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
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                judgment === "incorrect"
                  ? "border-red-500 bg-red-50"
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

        {/* AJ only: Helpfulness rating (5 radio options per document spec) */}
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
                请选择一个选项后才能进入下一题 / Please select an option to proceed.
              </p>
            )}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end pb-8">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
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
    </div>
  );
}
