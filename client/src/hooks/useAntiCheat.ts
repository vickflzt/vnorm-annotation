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
  active: boolean; // only enforce when experiment is active
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

  const handleViolation = useCallback(
    async (type: ViolationType) => {
      if (!active || terminatedRef.current) return;

      const result = await recordViolation.mutateAsync({
        participantId,
        violationType: type,
        questionIndex,
        itemId,
      });

      if (result.terminated && !terminatedRef.current) {
        terminatedRef.current = true;
        onTerminated();
      } else if (!result.terminated) {
        // Warn for minor violations
        toast.warning(`违规行为已记录 (${translateViolation(type)})`, {
          description: "请勿进行此类操作，否则实验将被终止。",
          duration: 3000,
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
      // Disable common dev shortcuts
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
