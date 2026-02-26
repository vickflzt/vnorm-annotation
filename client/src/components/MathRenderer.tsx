/**
 * MathRenderer — renders markdown content with embedded LaTeX math.
 *
 * Strategy: parse the content ourselves, split on $...$ / $$...$$ delimiters,
 * and render each math segment with katex.renderToString() directly.
 * This avoids the remark-math / rehype-katex plugin chain which has ESM
 * compatibility issues in Vite + React 19.
 *
 * Supported formats (after fix_latex_format.py normalisation):
 *   $$...$$   block math
 *   $...$     inline math
 *   bare LaTeX (no delimiters) — wrapped automatically for answer fields
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
 * Split a markdown string into alternating text / math tokens.
 * Handles $$...$$ (block) and $...$ (inline) delimiters.
 */
function tokenise(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let textStart = 0;

  const flush = (end: number) => {
    if (end > textStart) tokens.push({ type: "text", value: src.slice(textStart, end) });
  };

  while (i < src.length) {
    // Block math $$...$$
    if (src[i] === "$" && src[i + 1] === "$") {
      flush(i);
      const close = src.indexOf("$$", i + 2);
      if (close === -1) {
        // No closing delimiter — treat rest as text
        tokens.push({ type: "text", value: src.slice(i) });
        i = src.length;
        textStart = i;
        break;
      }
      tokens.push({ type: "block-math", value: src.slice(i + 2, close) });
      i = close + 2;
      textStart = i;
      continue;
    }

    // Inline math $...$
    if (src[i] === "$") {
      // Make sure it's not a lone $ (currency) — require a closing $ on same "line"
      const close = src.indexOf("$", i + 1);
      if (close !== -1 && !src.slice(i + 1, close).includes("\n\n")) {
        flush(i);
        tokens.push({ type: "inline-math", value: src.slice(i + 1, close) });
        i = close + 1;
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
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
      output: "html",
      trust: false,
    });
  } catch {
    return `<span class="katex-error" style="color:#c0392b">${latex}</span>`;
  }
}

// ─── Simple Markdown → HTML (no external deps) ───────────────────────────────

/**
 * Very lightweight markdown processor for the text segments.
 * Handles: **bold**, *italic*, `code`, line breaks, blank-line paragraphs.
 * Does NOT handle headings / tables (not needed for this dataset).
 */
function markdownTextToHtml(text: string): string {
  return text
    // Escape HTML entities first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Bold **...**
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic *...*
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code `...`
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 rounded px-1 text-sm font-mono">$1</code>')
    // Blank line → paragraph break
    .replace(/\n{2,}/g, "</p><p>")
    // Single newline → <br>
    .replace(/\n/g, "<br>");
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MathRenderer({ content, className = "", isMathOnly = false }: MathRendererProps) {
  const html = useMemo(() => {
    if (!content) return "";

    // isMathOnly: the whole string is a LaTeX expression (answer fields).
    // If it already contains $, render normally; otherwise wrap it.
    if (isMathOnly) {
      const trimmed = content.trim();
      // If it contains $ delimiters, parse normally
      if (trimmed.includes("$")) {
        return buildHtml(trimmed);
      }
      // Otherwise treat as inline math if no newlines, block math if multiline
      const isMultiline = trimmed.includes("\n") || trimmed.length > 60;
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
      // Close current paragraph, render block, open new paragraph
      out += `</p><div class="katex-block my-3 overflow-x-auto">${renderMath(tok.value, true)}</div><p>`;
    } else if (tok.type === "inline-math") {
      out += renderMath(tok.value, false);
    } else {
      // Text: apply lightweight markdown
      out += markdownTextToHtml(tok.value);
    }
  }

  out += "</p>";

  // Clean up empty paragraphs
  out = out.replace(/<p>\s*<\/p>/g, "");
  // Unwrap lone paragraph wrappers around block elements
  out = out.replace(/<p>(<div[^>]*>)/g, "$1").replace(/(<\/div>)<\/p>/g, "$1");

  return out;
}
