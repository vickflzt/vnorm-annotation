/**
 * MathRenderer — renders markdown content with embedded LaTeX math.
 *
 * Uses KaTeX renderToString directly (avoids remark-math/rehype-katex ESM issues).
 * Custom tokeniser handles:
 *   $$...$$   block math
 *   $...$     inline math  (correctly skips \$ escaped dollar signs)
 *   bare LaTeX (isMathOnly mode) — auto-wrapped
 */

import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

interface MathRendererProps {
  content: string;
  className?: string;
  /** When true, treat the whole string as a single math expression (answer fields). */
  isMathOnly?: boolean;
}

// ─── Tokeniser ────────────────────────────────────────────────────────────────

type Token =
  | { type: "text"; value: string }
  | { type: "block-math"; value: string }
  | { type: "inline-math"; value: string };

/**
 * Find the next unescaped occurrence of `needle` in `src` starting at `from`.
 * A `$` preceded by `\` is considered escaped and skipped.
 */
function findUnescaped(src: string, needle: string, from: number): number {
  let i = from;
  while (i <= src.length - needle.length) {
    if (src.slice(i, i + needle.length) === needle) {
      // Check if preceded by backslash
      if (needle === "$" && i > 0 && src[i - 1] === "\\") {
        i++;
        continue;
      }
      return i;
    }
    i++;
  }
  return -1;
}

/**
 * Split a markdown string into alternating text / math tokens.
 * Correctly handles \$ (escaped dollar sign in text).
 */
function tokenise(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let textStart = 0;

  const flush = (end: number) => {
    if (end > textStart) tokens.push({ type: "text", value: src.slice(textStart, end) });
  };

  while (i < src.length) {
    // Skip escaped dollar signs \$
    if (src[i] === "\\" && src[i + 1] === "$") {
      i += 2;
      continue;
    }

    // Block math $$...$$
    if (src[i] === "$" && src[i + 1] === "$") {
      flush(i);
      const close = findUnescaped(src, "$$", i + 2);
      if (close === -1) {
        // No closing — treat rest as text
        tokens.push({ type: "text", value: src.slice(i) });
        i = src.length;
        textStart = i;
        break;
      }
      const mathContent = src.slice(i + 2, close);
      tokens.push({ type: "block-math", value: mathContent });
      i = close + 2;
      textStart = i;
      continue;
    }

    // Inline math $...$
    if (src[i] === "$") {
      // Find the closing $ (unescaped, not immediately another $)
      let j = i + 1;
      let found = -1;
      while (j < src.length) {
        if (src[j] === "\\" && src[j + 1] === "$") {
          j += 2; // skip escaped $
          continue;
        }
        if (src[j] === "$") {
          // Don't match $$ as closing inline
          if (src[j + 1] === "$") {
            // This is a block start, abort inline search
            break;
          }
          found = j;
          break;
        }
        // Don't span blank lines (paragraph boundary)
        if (src[j] === "\n" && src[j + 1] === "\n") {
          break;
        }
        j++;
      }

      if (found !== -1) {
        flush(i);
        tokens.push({ type: "inline-math", value: src.slice(i + 1, found) });
        i = found + 1;
        textStart = i;
        continue;
      }
    }

    i++;
  }

  flush(src.length);
  return tokens;
}

// ─── KaTeX render helper ──────────────────────────────────────────────────────

function renderMath(latex: string, displayMode: boolean): string {
  try {
    // Replace \$ (escaped dollar in LaTeX) with \text{\$} which KaTeX can render
    const normalized = latex.replace(/\\\$/g, "\\text{\\$}");
    return katex.renderToString(normalized.trim(), {
      displayMode,
      throwOnError: false,
      errorColor: "#c0392b",
      output: "html",
      trust: false,
      // Allow unknown commands to render as text rather than throw
      strict: "ignore",
    });
  } catch {
    // Last-resort fallback: show the raw LaTeX in a styled span
    const escaped = latex.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<span class="katex-fallback font-mono text-sm bg-amber-50 px-1 rounded">${escaped}</span>`;
  }
}

// ─── Simple Markdown → HTML ───────────────────────────────────────────────────

function markdownTextToHtml(text: string): string {
  // Restore escaped dollar signs before HTML escaping
  const restored = text.replace(/\\\$/g, "$");
  return restored
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 rounded px-1 text-sm font-mono">$1</code>')
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MathRenderer({ content, className = "", isMathOnly = false }: MathRendererProps) {
  const html = useMemo(() => {
    if (!content) return "";

    if (isMathOnly) {
      const trimmed = content.trim();
      // If it contains $ delimiters, parse normally
      if (trimmed.includes("$")) {
        return buildHtml(trimmed);
      }
      // Otherwise treat as math expression directly
      const isMultiline = trimmed.includes("\n") || trimmed.length > 80;
      return renderMath(trimmed, isMultiline);
    }

    return buildHtml(content);
  }, [content, isMathOnly]);

  return (
    <div
      className={`math-content ${className}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: intentional KaTeX output
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function buildHtml(src: string): string {
  const tokens = tokenise(src);
  let out = "<p>";

  for (const tok of tokens) {
    if (tok.type === "block-math") {
      out += `</p><div class="katex-block my-3 overflow-x-auto text-center">${renderMath(tok.value, true)}</div><p>`;
    } else if (tok.type === "inline-math") {
      out += renderMath(tok.value, false);
    } else {
      out += markdownTextToHtml(tok.value);
    }
  }

  out += "</p>";
  out = out.replace(/<p>\s*<\/p>/g, "");
  out = out.replace(/<p>(<div[^>]*>)/g, "$1").replace(/(<\/div>)<\/p>/g, "$1");

  return out;
}
