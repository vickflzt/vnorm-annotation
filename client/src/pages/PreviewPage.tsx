import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { MathRenderer } from "@/components/MathRenderer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Eye, Loader2 } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  TP: "bg-emerald-100 text-emerald-800 border-emerald-200",
  TN: "bg-blue-100 text-blue-800 border-blue-200",
  FP: "bg-orange-100 text-orange-800 border-orange-200",
  FN: "bg-red-100 text-red-800 border-red-200",
  "GSM-CHECK": "bg-purple-100 text-purple-800 border-purple-200",
};

export default function PreviewPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [version, setVersion] = useState("v1");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");

  const { data: allQuestions, isLoading } = trpc.preview.getAllQuestions.useQuery(
    { version },
    { refetchOnWindowFocus: false }
  );

  const questions = useMemo(() => {
    if (!allQuestions) return [];
    if (filterCategory === "ALL") return allQuestions;
    return allQuestions.filter((q) => q.category === filterCategory);
  }, [allQuestions, filterCategory]);

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex];

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleVersionChange = (v: string) => {
    setVersion(v);
    setCurrentIndex(0);
  };

  const handleCategoryChange = (cat: string) => {
    setFilterCategory(cat);
    setCurrentIndex(0);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading questions...</span>
        </div>
      </div>
    );
  }

  if (!allQuestions || allQuestions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center text-slate-500">
          <Eye className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No questions found</p>
          <p className="text-sm mt-1">No questions available for version <strong>{version}</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Left: title + badge */}
          <div className="flex items-center gap-3 min-w-0">
            <Eye className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Render Preview</span>
            <Badge variant="outline" className="text-xs text-slate-500 shrink-0">
              {currentIndex + 1} / {totalQuestions}
            </Badge>
            {currentQuestion && (
              <Badge
                variant="outline"
                className={`text-xs shrink-0 ${CATEGORY_COLORS[currentQuestion.category] ?? ""}`}
              >
                {currentQuestion.category}
              </Badge>
            )}
            {currentQuestion && (
              <span className="text-xs text-slate-400 font-mono truncate">
                {currentQuestion.itemId}
              </span>
            )}
          </div>

          {/* Right: filters + nav */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Version selector */}
            <Select value={version} onValueChange={handleVersionChange}>
              <SelectTrigger className="h-8 text-xs w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["v1", "v2", "v3", "v4"].map((v) => (
                  <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Category filter */}
            <Select value={filterCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger className="h-8 text-xs w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">All</SelectItem>
                {["TP", "TN", "FP", "FN", "GSM-CHECK"].map((cat) => (
                  <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Prev / Next */}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="h-8 px-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={currentIndex >= totalQuestions - 1}
              className="h-8 px-2"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-indigo-400 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
          />
        </div>
      </div>

      {/* Main content */}
      {currentQuestion ? (
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
          {/* Meta info */}
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="bg-slate-100 rounded px-2 py-1">Source: <strong>{currentQuestion.source}</strong></span>
            {currentQuestion.subject && (
              <span className="bg-slate-100 rounded px-2 py-1">Subject: <strong>{currentQuestion.subject}</strong></span>
            )}
            {currentQuestion.difficultyLevel != null && (
              <span className="bg-slate-100 rounded px-2 py-1">Difficulty: <strong>{currentQuestion.difficultyLevel}</strong></span>
            )}
          </div>

          {/* Question card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                QUESTION
              </span>
            </div>
            <div className="px-6 py-5">
              <MathRenderer content={currentQuestion.question} />
            </div>
            {currentQuestion.figureUrl && (
              <div className="px-6 pb-5 flex justify-center">
                <img
                  src={currentQuestion.figureUrl}
                  alt="Geometric diagram"
                  className="max-w-xs w-full h-auto border border-slate-100 rounded-lg"
                />
              </div>
            )}
          </div>

          {/* LLM Response (AJ) */}
          {currentQuestion.response && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-blue-50 border-b border-blue-100 px-6 py-3">
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  LLM RESPONSE / 给出的解答过程（Answer + Justification）
                </span>
              </div>
              <div className="px-6 py-5 overflow-x-hidden min-w-0">
                <MathRenderer content={currentQuestion.response} className="min-w-0" />
              </div>
            </div>
          )}

          {/* Final answer */}
          {currentQuestion.extractedResponseAnswer && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-amber-50 border-b border-amber-100 px-6 py-3">
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  LLM FINAL ANSWER / 给出的最终答案
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

          {/* Bottom navigation */}
          <div className="flex items-center justify-between pt-2 pb-8">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <span className="text-sm text-slate-400">
              {currentIndex + 1} of {totalQuestions}
            </span>
            <Button
              onClick={handleNext}
              disabled={currentIndex >= totalQuestions - 1}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-400">
          <p>No questions match the current filter.</p>
        </div>
      )}
    </div>
  );
}
