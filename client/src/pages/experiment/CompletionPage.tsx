import { CheckCircle2, ShieldAlert } from "lucide-react";

interface CompletionPageProps {
  participantId: string;
  terminated?: boolean;
}

export function CompletionPage({ participantId, terminated = false }: CompletionPageProps) {
  if (terminated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full overflow-hidden text-center">
          <div className="bg-red-600 px-8 py-8 text-white">
            <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-90" />
            <h1 className="text-2xl font-bold">实验已终止</h1>
            <p className="text-red-200 text-sm mt-1">Session Terminated</p>
          </div>
          <div className="p-8 space-y-4">
            <p className="text-slate-700 text-sm leading-relaxed">
              系统检测到违规行为（如切换标签页、截图等），您的实验已被自动终止。
            </p>
            <p className="text-slate-500 text-sm leading-relaxed">
              Your session has been automatically terminated due to a detected violation (e.g., tab switching or screenshot attempt).
            </p>
            <div className="mt-4 p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-400">Participant ID: <span className="font-mono">{participantId}</span></p>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              如有疑问，请联系实验负责人。<br />
              If you have questions, please contact the researcher.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full overflow-hidden text-center">
        <div className="bg-emerald-600 px-8 py-8 text-white">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-90" />
          <h1 className="text-2xl font-bold">实验完成！</h1>
          <p className="text-emerald-200 text-sm mt-1">Study Completed</p>
        </div>
        <div className="p-8 space-y-4">
          <p className="text-slate-700 text-sm leading-relaxed">
            感谢您参与本研究！您的作答已成功记录，对我们的研究非常有价值。
          </p>
          <p className="text-slate-500 text-sm leading-relaxed">
            Thank you for participating in this study! Your responses have been successfully recorded and are very valuable to our research.
          </p>
          <div className="mt-4 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-400">
              Participant ID: <span className="font-mono font-medium text-slate-600">{participantId}</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">请将此 ID 告知实验负责人以完成后续流程。</p>
            <p className="text-xs text-slate-400">Please share this ID with the researcher to complete the process.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
