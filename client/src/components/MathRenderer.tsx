/**
 * MathRenderer — renders markdown content with embedded LaTeX math.
 *
 * Uses KaTeX renderToString directly (avoids remark-math/rehype-katex ESM issues).
 * Custom tokeniser handles:
 *   $$...$$   block math  (may span multiple lines, including \begin{align*}...\end{align*})
 *   $...$     inline math  (correctly skips \$ escaped dollar signs)
 *   > ...     blockquote lines
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
      strict: "ignore",
    });
  } catch {
    const escaped = latex.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<span class="katex-fallback font-mono text-sm bg-amber-50 px-1 rounded">${escaped}</span>`;
  }
}

// ─── Inline text → HTML (no block-level elements) ────────────────────────────

function inlineToHtml(text: string): string {
  // Restore escaped dollar signs
  const restored = text.replace(/\\\$/g, "$");
  return restored
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 rounded px-1 text-sm font-mono">$1</code>');
}

// ─── Tokeniser ────────────────────────────────────────────────────────────────

type Token =
  | { type: "text"; value: string }
  | { type: "block-math"; value: string }
  | { type: "inline-math"; value: string };

function tokeniseInline(src: string): Token[] {
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
      // Find closing $$
      let j = i + 2;
      let close = -1;
      while (j <= src.length - 2) {
        if (src[j] === "$" && src[j + 1] === "$") {
          close = j;
          break;
        }
        j++;
      }
      if (close === -1) {
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
      let j = i + 1;
      let found = -1;
      while (j < src.length) {
        if (src[j] === "\\" && src[j + 1] === "$") {
          j += 2;
          continue;
        }
        if (src[j] === "$") {
          if (src[j + 1] === "$") break; // block start, abort
          found = j;
          break;
        }
        // Don't span blank lines
        if (src[j] === "\n" && src[j + 1] === "\n") break;
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

// ─── Block-level renderer ─────────────────────────────────────────────────────

/**
 * Split content into block-level segments: blockquotes, block-math, and text paragraphs.
 * Then render each segment appropriately.
 */
function buildHtml(src: string): string {
  // Split into lines for block-level processing
  const lines = src.split("\n");
  const segments: Array<{ kind: "blockquote" | "math-block" | "text"; content: string }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Blockquote line: starts with ">"
    if (/^\s*>/.test(line)) {
      let bqContent = "";
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        bqContent += lines[i].replace(/^\s*>\s?/, "") + "\n";
        i++;
      }
      segments.push({ kind: "blockquote", content: bqContent.trim() });
      continue;
    }

    // Block math: line starts with $$ (possibly with leading whitespace)
    if (/^\s*\$\$/.test(line)) {
      // Collect until closing $$
      let mathContent = "";
      const openLine = line.replace(/^\s*\$\$/, "");
      // Check if $$ closes on same line
      if (/\$\$\s*$/.test(openLine) && openLine.trim() !== "") {
        // Single-line block math: $$...$$
        mathContent = openLine.replace(/\$\$\s*$/, "").trim();
        segments.push({ kind: "math-block", content: mathContent });
        i++;
        continue;
      }
      mathContent = openLine;
      i++;
      while (i < lines.length) {
        if (/\$\$\s*$/.test(lines[i])) {
          mathContent += "\n" + lines[i].replace(/\$\$\s*$/, "");
          i++;
          break;
        }
        mathContent += "\n" + lines[i];
        i++;
      }
      segments.push({ kind: "math-block", content: mathContent.trim() });
      continue;
    }

    // Regular text: collect consecutive non-special lines
    let textContent = "";
    while (
      i < lines.length &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*\$\$/.test(lines[i])
    ) {
      textContent += lines[i] + "\n";
      i++;
    }
    if (textContent.trim()) {
      segments.push({ kind: "text", content: textContent.trimEnd() });
    }
  }

  // Render segments
  let out = "";
  for (const seg of segments) {
    if (seg.kind === "math-block") {
      out += `<div class="katex-block my-4 overflow-x-auto text-center">${renderMath(seg.content, true)}</div>`;
    } else if (seg.kind === "blockquote") {
      // Render blockquote content (may contain inline math)
      const inner = renderInlineSegment(seg.content);
      out += `<blockquote class="border-l-4 border-amber-400 bg-amber-50 pl-4 pr-3 py-2 my-3 rounded-r text-sm text-amber-900 italic">${inner}</blockquote>`;
    } else {
      // Text segment: split into paragraphs by blank lines, then render inline math
      const paras = seg.content.split(/\n{2,}/);
      for (const para of paras) {
        if (para.trim()) {
          out += `<p class="mb-2">${renderInlineSegment(para.trim())}</p>`;
        }
      }
    }
  }

  return out;
}

/**
 * Render a text segment that may contain inline $...$ and $$...$$ math.
 */
function renderInlineSegment(src: string): string {
  const tokens = tokeniseInline(src);
  let out = "";
  for (const tok of tokens) {
    if (tok.type === "block-math") {
      out += `<div class="katex-block my-3 overflow-x-auto text-center">${renderMath(tok.value, true)}</div>`;
    } else if (tok.type === "inline-math") {
      out += renderMath(tok.value, false);
    } else {
      // Convert single newlines to <br> within inline text
      const lines = tok.value.split("\n");
      out += lines.map(inlineToHtml).join("<br>");
    }
  }
  return out;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MathRenderer({ content, className = "", isMathOnly = false }: MathRendererProps) {
  const html = useMemo(() => {
    if (!content) return "";

    if (isMathOnly) {
      const trimmed = content.trim();
      if (trimmed.includes("$")) {
        return buildHtml(trimmed);
      }
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
