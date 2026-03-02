import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ConsentPageProps {
  participantId: string;
  onConsented: () => void;
}

export function ConsentPage({ participantId, onConsented }: ConsentPageProps) {
  const [agreed, setAgreed] = useState(false);
  const [showError, setShowError] = useState(false);
  const giveConsent = trpc.experiment.giveConsent.useMutation();

  const handleBegin = async () => {
    if (!agreed) {
      setShowError(true);
      toast.error("Please check the agreement box below / 请先勾选下方同意框");
      document.getElementById("agree-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setShowError(false);
    try {
      await giveConsent.mutateAsync({ participantId });
      onConsented();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Failed to record consent: ${msg}. Please refresh and try again. / 记录同意失败：${msg}，请刷新页面重试。`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-3xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-indigo-600 px-8 py-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <span className="text-sm font-bold">V</span>
            </div>
            <span className="text-sm font-medium opacity-80">V-Norm Annotation Study</span>
          </div>
          <h1 className="text-2xl font-bold">Consent Form</h1>
          <p className="text-indigo-200 text-sm mt-1">知情同意书</p>
        </div>

        <div className="p-8">
          <Tabs defaultValue="en">
            <TabsList className="mb-6">
              <TabsTrigger value="en">English</TabsTrigger>
              <TabsTrigger value="zh">中文</TabsTrigger>
            </TabsList>

            {/* ── English tab ── */}
            <TabsContent value="en">
              <ScrollArea className="h-96 rounded-lg border border-slate-200 p-5 bg-slate-50">
                <div className="space-y-5 text-sm text-slate-700 leading-relaxed">
                  <p className="font-semibold text-slate-900">
                    Welcome, and thank you for considering participation in this study.
                  </p>
                  <p>
                    The purpose of this study is to understand how everyday users determine whether a proposed answer to a math problem is correct based on the information provided. The information provided will include either the AI's answer to the math question alone, or the AI's answer together with its explanation. During the study, you will see a series of math questions with proposed answers; in some cases, you will also see a justification.
                  </p>
                  <p>
                    Your task is to decide whether the proposed answer is correct or incorrect using only the information provided in this study.
                  </p>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">What You Will Do</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Read each math question and its justification, if provided.</li>
                      <li>For each question, determine whether the provided answer is correct or incorrect.</li>
                      <li>For some questions, rate how helpful the provided justification was in making your decision.</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">Time Commitment</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>The study is expected to take approximately 45–50 minutes.</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">Risks or Discomforts</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>We do not expect any notable risks.</li>
                      <li>This study involves only problem-solving or reading-based judgment tasks.</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">Voluntary Participation</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Your participation is completely voluntary.</li>
                      <li>You may stop participating at any time without penalty.</li>
                      <li>If you choose to stop, you may simply close the page.</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">Privacy and Data Use</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>We will record your responses and response times.</li>
                      <li>We will not collect any personally identifying information as part of this research.</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">Participant Requirements</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Do not use scratch paper, calculators, search engines, chatbots, or any other external tools. Rely only on the content provided in this study.</li>
                      <li>Complete the task using your own judgment only.</li>
                      <li>Do not switch tabs, take screenshots, or copy content. Any violations will automatically terminate the session.</li>
                    </ul>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* ── Chinese tab ── */}
            <TabsContent value="zh">
              <ScrollArea className="h-96 rounded-lg border border-slate-200 p-5 bg-slate-50">
                <div className="space-y-5 text-sm text-slate-700 leading-relaxed">
                  <p className="font-semibold text-slate-900">欢迎您，并感谢您考虑参加本研究。</p>
                  <p>
                    本研究旨在了解普通用户如何根据所提供的信息判断一道数学题的拟议答案是否正确。所提供的信息将包括：仅有 AI 对数学问题的回答，或 AI 的回答及其解释。在研究过程中，您将看到一系列数学问题及其拟议答案；在某些情况下，您还会看到相应的理由说明。
                  </p>
                  <p>
                    您的任务是仅根据本研究中提供的信息，判断拟议答案是正确还是错误。
                  </p>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">您将需要做什么</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>阅读每道数学题，以及在提供的情况下阅读其理由说明。</li>
                      <li>对每道题判断所给答案是正确还是错误。</li>
                      <li>对于部分题目，评价所提供的理由说明对您做出判断有多大帮助。</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">所需时间</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>本研究预计耗时约 45–50 分钟。</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">风险或不适</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>我们预计本研究不会带来显著风险。</li>
                      <li>本研究仅包含解题或基于阅读的判断任务。</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">自愿参与</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>您的参与完全出于自愿。</li>
                      <li>您可以在任何时候停止参与，且不会受到任何惩罚。</li>
                      <li>如果您选择停止参与，只需关闭页面即可。</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">隐私与数据使用</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>我们将记录您的作答结果以及作答时间。</li>
                      <li>本研究不会收集任何可识别您个人身份的信息。</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">参与者要求</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>请勿使用草稿纸、计算器、搜索引擎、聊天机器人或任何其他外部工具。请仅依赖本研究中提供的内容。</li>
                      <li>请仅依据您自己的判断完成任务。</li>
                      <li>请勿切换标签页、截图或复制内容。任何违规行为都将导致会话自动终止。</li>
                    </ul>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Agreement checkbox */}
          <div
            id="agree-box"
            className={`mt-6 flex items-start gap-3 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer
              ${agreed
                ? "bg-indigo-50 border-indigo-400"
                : showError
                  ? "bg-red-50 border-red-400 shadow-md shadow-red-100 animate-pulse"
                  : "bg-amber-50 border-amber-300 hover:border-amber-400"
              }`}
            onClick={() => {
              setAgreed((v) => !v);
              setShowError(false);
            }}
          >
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(v) => {
                setAgreed(v === true);
                setShowError(false);
              }}
              className={`mt-0.5 h-5 w-5 flex-shrink-0 ${showError && !agreed ? "border-red-500" : ""}`}
              onClick={(e) => e.stopPropagation()}
            />
            <div>
              <label htmlFor="agree" className="text-sm font-medium text-slate-800 cursor-pointer leading-relaxed select-none">
                I am at least 18 years old, have read and understood the information above, and agree to participate voluntarily.
                <br />
                <span className="text-slate-500 font-normal">我已年满 18 周岁，已阅读并理解以上说明，同意自愿参加本研究。</span>
              </label>
              {showError && !agreed && (
                <p className="mt-2 text-sm font-semibold text-red-600 flex items-center gap-1">
                  <span>⚠</span>
                  <span>Please check this box to continue / 请先勾选此处再继续</span>
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleBegin}
              disabled={giveConsent.isPending}
              size="lg"
              className={`px-8 transition-all ${agreed ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-slate-300 text-slate-500 cursor-not-allowed"}`}
            >
              {giveConsent.isPending ? "Processing..." : "I agree and begin / 我同意并开始 →"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
