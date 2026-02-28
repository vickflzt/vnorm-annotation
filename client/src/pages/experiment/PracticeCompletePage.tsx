import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";

interface PracticeCompletePageProps {
  condition: "AO" | "AJ";
  onStart: () => void;
}

export function PracticeCompletePage({ condition, onStart }: PracticeCompletePageProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
        </div>

        {/* Title */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Practice Complete! / 练习完成！
          </h2>
          <p className="text-sm text-slate-500">
            You have completed the practice trial. The main experiment is about to begin.
            <br />
            您已熟悉答题流程，正式实验即将开始。
          </p>
        </div>

        {/* Reminder summary */}
        <div className="bg-slate-50 rounded-xl p-5 text-left space-y-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-800 text-xs uppercase tracking-wide text-center mb-1">
            Reminders for the Main Experiment / 正式实验提醒
          </p>
          <ul className="space-y-2 text-xs text-slate-600">
            <li>• Each question has two parts: <strong>Judgment (Part 1)</strong> and <strong>Ratings (Part 2)</strong>.</li>
            <li className="text-red-600 font-medium">• After clicking “Continue”, your Part 1 judgment is <strong>locked and cannot be changed</strong>.</li>
            <li className="text-red-600 font-medium">• After submitting Part 2, you move directly to the next question with <strong>no option to go back</strong>.</li>
            <li>• Part 1 has a 3-minute limit; Part 2 has a 1-minute limit. A warning appears when time is up, with a brief extension before auto-submit.</li>
            {condition === "AJ" && (
              <li>• <strong>Please read the LLM Response carefully</strong> — it is intended to inform your judgment.</li>
            )}
          </ul>
          <div className="border-t border-slate-200 pt-3 space-y-1 text-xs text-slate-500">
            <li>• 每题分为两部分：<strong>判断（第一部分）</strong>和<strong>评分（第二部分）</strong>。</li>
            <li className="text-red-600 font-medium">• 点击“继续”后，第一部分的判断将立即锁定，<strong>无法修改</strong>。</li>
            <li className="text-red-600 font-medium">• 完成第二部分评分后，将直接翻到下一题，<strong>无法回看</strong>。</li>
            <li>• 第一部分限时 3 分钟，第二部分限时 1 分钟，超时后弹出提示并有短暂延长期。</li>
            {condition === "AJ" && (
              <li>• <strong>请认真阅读每题的 LLM Response（解答过程）</strong>，这是您做出判断的重要依据。</li>
            )}
          </div>
        </div>

        {/* Start button */}
        <Button
          onClick={onStart}
          size="lg"
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-6 text-base rounded-xl shadow-md"
        >
          <span>Start Main Experiment / 开始正式实验</span>
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
        <p className="text-xs text-slate-400">
          Clicking will start the 16 main questions · 点击后将进入正式题目，共 16 道
        </p>
      </div>
    </div>
  );
}
