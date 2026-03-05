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
    // Only treat * as italic when it directly flanks non-whitespace (CommonMark rule):
    // - opening * must not be preceded by * (to avoid matching inside **bold**)
    // - opening * must not be followed by whitespace
    // - closing * must not be preceded by whitespace
    // - closing * must not be followed by * (to avoid matching inside **bold**)
    .replace(/(?<!\*)\*(?!\s|\*)(.+?)(?<!\s|\*)\*(?!\*)/g, "<em>$1</em>")
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
 *
 * Handles mixed lines where $$ block math appears inline with surrounding text,
 * e.g. "$$\\frac{...}{}$$for $x > 0.$" or "$$\\sum...$$,$$where $F_n$..."
 */
/**
 * Normalize alternate LaTeX delimiters to the canonical $$ / $ form used by our tokeniser.
 *   \[ ... \]  →  $$...$$   (display / block math)
 *   \( ... \)  →  $...$     (inline math)
 * Both may span multiple lines.
 */
// Known block-level LaTeX environments that should be wrapped in $$ ... $$
const BLOCK_ENVS = [
  "align", "align*", "aligned",
  "equation", "equation*",
  "gather", "gather*", "gathered",
  "multline", "multline*",
  "flalign", "flalign*",
  "cases", "split",
  "array", "matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix",
];

function normalizeLatexDelimiters(src: string): string {
  // \[ ... \]  →  $$...$$
  let out = src.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `$$${inner}$$`);
  // \( ... \)  →  $...$
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${inner}$`);
  // Bare \begin{env}...\end{env} (not already inside $$ or $) → $$\begin{env}...\end{env}$$
  for (const env of BLOCK_ENVS) {
    // Match \begin{env}...\end{env} that is NOT already preceded by $
    const pattern = new RegExp(
      `(?<!\\$)\\\\begin\\{${env.replace("*", "\\*")}\\}([\\s\\S]*?)\\\\end\\{${env.replace("*", "\\*")}\\}(?!\\$)`,
      "g"
    );
    out = out.replace(pattern, (_m, inner) => `$$\\begin{${env}}${inner}\\end{${env}}$$`);
  }
  return out;
}

function buildHtml(src: string): string {
  // Normalize \[...\] and \(...\) to $$...$$ and $...$
  src = normalizeLatexDelimiters(src);

  // Pre-process: split any line that has $$...$$ mixed with surrounding text
  // into separate virtual lines so the line-based parser can handle them.
  // Strategy: replace occurrences of (text)($$...$$)(text) on a single line
  // by inserting newlines around the $$ blocks.
  const normalised = src
    .split("\n")
    .flatMap((line) => {
      // If the line starts with $$ AND ends with $$ (pure block math line), leave it alone
      // e.g. "$$\\frac{a}{b}$$" or "$$" (opening delimiter)
      // But "$$\\frac{a}{b}$$for $x>0.$" must be split.
      const isPureBlockLine = /^\s*\$\$/.test(line) && /\$\$\s*$/.test(line);
      const isOpeningOnly = /^\s*\$\$\s*$/.test(line); // just "$$" alone
      if (isPureBlockLine || isOpeningOnly) return [line];
      // If the line contains $$ anywhere, split around it.
      // IMPORTANT: We must skip \$$ (escaped dollar followed by $) to avoid
      // treating the $ in \$ as part of a $$ delimiter.
      // Strategy: find $$ that is NOT preceded by a backslash.
      const findUnescapedDoubleDollar = (str: string, from = 0): number => {
        let pos = from;
        while (pos <= str.length - 2) {
          const idx = str.indexOf("$$", pos);
          if (idx === -1) return -1;
          // Check if the $$ is preceded by a backslash (i.e. \$$)
          if (idx > 0 && str[idx - 1] === "\\") {
            pos = idx + 2; // skip this \$$ and keep searching
            continue;
          }
          return idx;
        }
        return -1;
      };

      if (findUnescapedDoubleDollar(line) !== -1) {
        // Split the line by unescaped $$ pairs, preserving the delimiters
        const parts: string[] = [];
        let rest = line;
        let searchFrom = 0;
        while (true) {
          const open = findUnescapedDoubleDollar(rest, searchFrom);
          if (open === -1) break;
          const close = findUnescapedDoubleDollar(rest, open + 2);
          if (close === -1) break; // unclosed $$, leave as-is
          const before = rest.slice(0, open);
          const math = rest.slice(open, close + 2); // includes $$ delimiters
          rest = rest.slice(close + 2);
          searchFrom = 0; // reset for new rest string
          if (before.trim()) parts.push(before.trimEnd());
          parts.push(math); // pure $$...$$ line
        }
        if (rest.trim()) parts.push(rest.trimStart());
        return parts.length > 0 ? parts : [line];
      }
      return [line];
    })
    .join("\n");

  // Split into lines for block-level processing
  const lines = normalised.split("\n");
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
      // Check if $$ closes on same line: $$...$$
      if (/\$\$\s*$/.test(openLine) && openLine.trim() !== "") {
        mathContent = openLine.replace(/\$\$\s*$/, "").trim();
        segments.push({ kind: "math-block", content: mathContent });
        i++;
        continue;
      }
      // Empty openLine means opening $$ is alone on this line → multi-line block
      mathContent = openLine;
      i++;
      while (i < lines.length) {
        // Only a line that is SOLELY $$ (with optional whitespace) ends the block.
        // A line like "\mathbf{n} = $$" is content, not a closing delimiter.
        if (/^\s*\$\$\s*$/.test(lines[i])) {
          i++;
          break;
        }
        // Strip any stray $$ delimiters that appear mid-line (format noise from LLM output)
        // e.g. "   \mathbf{n} = $$" → "   \mathbf{n} = "
        const cleanedLine = lines[i].replace(/\$\$/g, "");
        mathContent += "\n" + cleanedLine;
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
      out += `<div class="katex-block my-4 overflow-x-auto max-w-full text-center">${renderMath(seg.content, true)}</div>`;
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
      out += `<div class="katex-block my-3 overflow-x-auto max-w-full text-center">${renderMath(tok.value, true)}</div>`;
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
      className={`math-content min-w-0 w-full ${className}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: intentional KaTeX output
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
