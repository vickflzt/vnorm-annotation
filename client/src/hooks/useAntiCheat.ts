import { useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type ViolationType =
  | "tab_switch"
  | "window_blur"
  | "visibility_hidden"
  | "screenshot_attempt"
  | "copy_attempt"
  | "paste_attempt"
  | "right_click"
  | "devtools_open";

interface UseAntiCheatOptions {
  participantId: string;
  questionIndex: number;
  itemId: string;
  active: boolean;
  onTerminated: () => void;
}

export function useAntiCheat({
  participantId,
  questionIndex,
  itemId,
  active,
  onTerminated,
}: UseAntiCheatOptions) {
  const recordViolation = trpc.experiment.recordViolation.useMutation();
  const terminatedRef = useRef(false);
  // Debounce: prevent rapid-fire duplicate events (e.g. blur + visibilitychange)
  const lastViolationRef = useRef<{ type: string; ts: number }>({ type: "", ts: 0 });

  const handleViolation = useCallback(
    async (type: ViolationType) => {
      if (!active || terminatedRef.current) return;

      // Debounce: ignore same violation within 1 second
      const now = Date.now();
      if (type === lastViolationRef.current.type && now - lastViolationRef.current.ts < 1000) {
        return;
      }
      lastViolationRef.current = { type, ts: now };

      const result = await recordViolation.mutateAsync({
        participantId,
        violationType: type,
        questionIndex,
        itemId,
      });

      if (result.terminated && !terminatedRef.current) {
        terminatedRef.current = true;
        // Show termination message briefly before calling onTerminated
        toast.error("实验已终止 / Experiment Terminated", {
          description: "检测到多次违规行为，实验已被强制终止。/ Multiple violations detected.",
          duration: 2000,
        });
        setTimeout(() => onTerminated(), 1500);
      } else if (result.isSerious && result.warningNumber) {
        // Serious violation but not yet terminated: show numbered warning
        const remaining = 3 - result.warningNumber;
        toast.warning(
          `⚠️ 严重警告 ${result.warningNumber}/2 / Warning ${result.warningNumber}/2`,
          {
            description:
              remaining > 0
                ? `检测到切屏/截图行为。再违规 ${remaining} 次将终止实验。\nTab switch / screenshot detected. ${remaining} more will terminate.`
                : `最后警告！下次违规将立即终止实验。\nFinal warning! Next violation will terminate.`,
            duration: 5000,
          }
        );
      } else if (!result.isSerious) {
        // Minor violation: brief toast
        toast.warning(`违规提示 / Notice: ${translateViolation(type)}`, {
          description: "请勿进行此类操作。/ Please avoid this action.",
          duration: 2500,
        });
      }
    },
    [active, participantId, questionIndex, itemId, recordViolation, onTerminated]
  );

  useEffect(() => {
    if (!active) return;

    // ── Visibility change (tab switch / minimize) ──────────────────────────
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleViolation("visibility_hidden");
      }
    };

    // ── Window blur ────────────────────────────────────────────────────────
    const handleWindowBlur = () => {
      handleViolation("tab_switch");
    };

    // ── Copy / Paste ───────────────────────────────────────────────────────
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      handleViolation("copy_attempt");
    };
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      handleViolation("paste_attempt");
    };

    // ── Right click ────────────────────────────────────────────────────────
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      handleViolation("right_click");
    };

    // ── Screenshot key (PrintScreen) ───────────────────────────────────────
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.code === "PrintScreen") {
        e.preventDefault();
        handleViolation("screenshot_attempt");
      }
      // Disable common shortcuts
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "u" || e.key === "s" || e.key === "a" || e.key === "c" || e.key === "v")
      ) {
        e.preventDefault();
        if (e.key === "c") handleViolation("copy_attempt");
        if (e.key === "v") handleViolation("paste_attempt");
      }
      // F12 / DevTools
      if (e.key === "F12") {
        e.preventDefault();
        handleViolation("devtools_open");
      }
    };

    // ── Text selection disable ─────────────────────────────────────────────
    const handleSelectStart = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("selectstart", handleSelectStart);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("selectstart", handleSelectStart);
    };
  }, [active, handleViolation]);

  return { handleViolation };
}

function translateViolation(type: ViolationType): string {
  const map: Record<ViolationType, string> = {
    tab_switch: "切换标签页",
    window_blur: "窗口失焦",
    visibility_hidden: "页面隐藏",
    screenshot_attempt: "截屏尝试",
    copy_attempt: "复制操作",
    paste_attempt: "粘贴操作",
    right_click: "右键菜单",
    devtools_open: "开发者工具",
  };
  return map[type] ?? type;
}
