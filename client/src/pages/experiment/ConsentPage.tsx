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
      toast.error("请先勾选下方同意框 / Please check the agreement box below");
      // Scroll to checkbox area
      document.getElementById("agree-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setShowError(false);
    await giveConsent.mutateAsync({ participantId });
    onConsented();
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
          <h1 className="text-2xl font-bold">知情同意书</h1>
          <p className="text-indigo-200 text-sm mt-1">Informed Consent Form</p>
        </div>

        <div className="p-8">
          <Tabs defaultValue="zh">
            <TabsList className="mb-6">
              <TabsTrigger value="zh">中文</TabsTrigger>
              <TabsTrigger value="en">English</TabsTrigger>
            </TabsList>

            <TabsContent value="zh">
              <ScrollArea className="h-80 rounded-lg border border-slate-200 p-5 bg-slate-50">
                <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
                  <p className="font-semibold text-slate-900">欢迎参加本研究。</p>
                  <p>
                    本研究旨在了解人在判断数学题答案是否正确时，如何使用所提供的信息（例如答案本身，或答案及其解释）。在实验中，您将看到若干数学题及对应的候选答案；在部分情况下，您还会看到一段解释。您的任务是根据页面提供的信息，判断该答案是否正确。
                  </p>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">您将需要做什么：</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>阅读题目及给定内容；</li>
                      <li>对每道题做出"正确 / 错误"的判断；</li>
                      <li>在部分题目中，评价所提供解释对您判断是否有帮助；</li>
                      <li>整个实验预计耗时约 45–50 分钟。</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">可能风险与不适：</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>本研究风险较低，接近日常做题或阅读判断任务；</li>
                      <li>您可能会感到轻微疲劳、注意力消耗，或因时间限制产生少量压力。</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">参与方式：</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>您的参与是完全自愿的；</li>
                      <li>您可以在任何时候退出实验，而不会受到处罚或产生任何不利后果；</li>
                      <li>如果您选择退出，您可以直接关闭页面。</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">隐私与数据使用：</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>本研究将记录您的作答结果和作答时间；</li>
                      <li>我们不会在研究报告中使用能够直接识别您身份的信息；</li>
                      <li>您的数据将仅用于学术研究与分析。</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">参与要求：</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>请勿使用草稿纸、计算器、搜索引擎、聊天机器人或任何其他外部工具；</li>
                      <li>请根据您自己的判断完成任务；</li>
                      <li>请勿切换标签页、截图或复制题目内容，否则实验将被自动终止。</li>
                    </ul>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="en">
              <ScrollArea className="h-80 rounded-lg border border-slate-200 p-5 bg-slate-50">
                <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
                  <p className="font-semibold text-slate-900">Welcome, and thank you for considering participation in this study.</p>
                  <p>
                    The purpose of this study is to understand how people judge whether a proposed answer to a math problem is correct based on the information provided (for example, the answer alone, or the answer together with an explanation). During the study, you will see a series of math questions with proposed answers; in some cases, you will also see a justification. Your task is to decide whether the proposed answer is correct based only on the information shown on the screen.
                  </p>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">What you will do:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Read each math question and the provided content;</li>
                      <li>Make a Correct / Incorrect judgment for each item;</li>
                      <li>For some items, rate how helpful the provided justification was for your decision;</li>
                      <li>The study is expected to take approximately 45–50 minutes.</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">Risks or discomforts:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>This study involves minimal risk, similar to ordinary problem-solving or reading-based judgment tasks;</li>
                      <li>You may experience mild fatigue, mental effort, or slight time pressure.</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">Voluntary participation:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Your participation is completely voluntary;</li>
                      <li>You may stop participating at any time without penalty or negative consequences;</li>
                      <li>If you choose to stop, you may simply close the page.</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">Privacy and data use:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>We will record your responses and response times;</li>
                      <li>We will not use directly identifying personal information in any report or publication;</li>
                      <li>Your data will be used only for research and analysis purposes.</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 mb-2">Participant requirements:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Please do not use scratch paper, calculators, search engines, chatbots, or any other external tools;</li>
                      <li>Please complete the task using your own judgment only;</li>
                      <li>Do not switch tabs, take screenshots, or copy content — violations will automatically terminate the session.</li>
                    </ul>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Agreement checkbox — visually prominent */}
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
                我已年满 18 周岁，已阅读并理解以上说明，同意自愿参加本研究。
                <br />
                <span className="text-slate-500 font-normal">I am at least 18 years old, have read and understood the information above, and agree to participate voluntarily.</span>
              </label>
              {showError && !agreed && (
                <p className="mt-2 text-sm font-semibold text-red-600 flex items-center gap-1">
                  <span>⚠</span>
                  <span>请先勾选此处再继续 / Please check this box to continue</span>
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
              {giveConsent.isPending ? "处理中..." : "我同意并开始 / I agree and begin →"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
