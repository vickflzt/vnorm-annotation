import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Clock, Eye, EyeOff, ShieldAlert } from "lucide-react";

interface InstructionsPageProps {
  participantId: string;
  condition: "AO" | "AJ";
  onStart: () => void;
}

export function InstructionsPage({ participantId, condition, onStart }: InstructionsPageProps) {
  const startExperiment = trpc.experiment.startExperiment.useMutation();

  const handleBegin = async () => {
    await startExperiment.mutateAsync({ participantId });
    onStart();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-indigo-600 px-8 py-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
              条件 / Condition: {condition}
            </span>
          </div>
          <h1 className="text-2xl font-bold">Task Instructions</h1>
          <p className="text-indigo-200 text-sm mt-1">实验说明</p>
        </div>

        <div className="p-8 space-y-6">
          {/* English instructions */}
          <div className="space-y-3">
            <h2 className="font-semibold text-slate-900 text-base">Your Task</h2>
            {condition === "AO" ? (
              <p className="text-slate-700 text-sm leading-relaxed">
                You will verify whether proposed answers to math problems are correct. You will review <strong>16 math questions</strong> with 3 minutes per question. Each question has the AI's proposed answer. Your task is to determine whether each proposed answer is <strong>correct or incorrect</strong>.
              </p>
            ) : (
              <p className="text-slate-700 text-sm leading-relaxed">
                You will verify whether proposed answers to math problems are correct. You will review <strong>16 math questions</strong> with 3 minutes per question. Each question has the AI's proposed answer. Your task is to determine whether each proposed answer is correct or incorrect.
              </p>
            )}
          </div>

          {/* Chinese instructions */}
          <div className="space-y-3 border-t border-slate-100 pt-5">
            <h2 className="font-semibold text-slate-900 text-base">您的任务</h2>
            {condition === "AO" ? (
              <p className="text-slate-700 text-sm leading-relaxed">
                您需要核实所给出的数学问题答案是否正确。您将审阅 <strong>16 个数学问题</strong>，每个问题都有一个给出的答案。您的任务是判断每个给出的答案是<strong>正确还是错误</strong>。
              </p>
            ) : (
              <p className="text-slate-700 text-sm leading-relaxed">
                您需要核实所给出的数学问题的答案是否正确。您将审阅 <strong>16 个数学问题</strong>，每个问题都有一个给出的答案和相应的解释说明。您的任务是判断每个给出的答案是否正确或错误。请<strong>根据所提供的解释</strong>来做出您的判断。
              </p>
            )}
          </div>

          {/* Key info cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
              <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Time Limit</p>
                <p className="text-xs text-amber-700 mt-0.5">3 min/question<br/>每题时限 3 分钟</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
              {condition === "AO" ? (
                <Eye className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              ) : (
                <EyeOff className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-xs font-semibold text-blue-800">Content Shown</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  {condition === "AO" ? "Question + Answer" : "Question + Answer + Justification"}
                  <br />
                  {condition === "AO" ? "题目 + 答案" : "题目 + 答案 + 解释"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
              <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-red-800">Prohibited</p>
                <p className="text-xs text-red-700 mt-0.5">No switching / screenshot<br/>切屏 / 截图 / 复制</p>
              </div>
            </div>
          </div>

          {/* Prohibited tools */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-600">
            <p className="font-medium text-slate-800 mb-1">Please do not use / 请勿使用:</p>
            <p>Scratch paper · Calculators · Search engines · Chatbots · Any external tools</p>
            <p className="text-slate-400 text-xs mt-0.5">草稿纸 · 计算器 · 搜索引擎 · 聊天机器人 · 任何外部工具</p>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleBegin}
              disabled={startExperiment.isPending}
              size="lg"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-10"
            >
              {startExperiment.isPending ? "Preparing..." : "Begin / 开始答题 →"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
