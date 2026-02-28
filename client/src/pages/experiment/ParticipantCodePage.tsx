import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Hash } from "lucide-react";

interface ParticipantCodePageProps {
  participantId: string;
  onCodeSubmitted: () => void;
}

export function ParticipantCodePage({ participantId, onCodeSubmitted }: ParticipantCodePageProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitCode = trpc.experiment.submitParticipantCode.useMutation();

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("请输入您的被试编号。\nPlease enter your participant code.");
      return;
    }
    setError(null);
    try {
      await submitCode.mutateAsync({ participantId, participantCode: trimmed });
      onCodeSubmitted();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "未知错误";
      setError(`提交失败：${msg}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Hash className="w-6 h-6 text-indigo-600" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Enter Your Participant Code</h2>
          <p className="text-sm text-slate-500">输入被试编号</p>
        </div>

        {/* Instructions */}
        <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1 leading-relaxed">
          <p>
            Please enter the participant code assigned to you by the experimenter.
          </p>
          <p className="text-slate-400 text-xs">
            请输入实验负责人分配给您的<strong>被试编号</strong>。
          </p>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <Label htmlFor="participant-code" className="text-sm font-medium text-slate-700">
            被试编号 / Participant Code
          </Label>
          <Input
            id="participant-code"
            type="text"
            placeholder="例如：P001 / e.g. P001"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            className="text-center text-lg font-mono tracking-widest"
            autoFocus
            maxLength={64}
          />
          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}
        </div>

        {/* Submit button */}
        <Button
          onClick={handleSubmit}
          disabled={submitCode.isPending || !code.trim()}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 text-base rounded-xl"
        >
          {submitCode.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            "Confirm & Continue / 确认并继续 →"
          )}
        </Button>

        {/* System ID note */}
        <p className="text-xs text-slate-400 text-center leading-relaxed">
          Your anonymous system ID has been auto-assigned. This code links your data to your assigned group.
          <br />
          <span className="text-slate-300">
            系统已自动为您分配匿名 ID，该编号仅用于将您的数据与实验分组关联。
          </span>
        </p>
      </div>
    </div>
  );
}
