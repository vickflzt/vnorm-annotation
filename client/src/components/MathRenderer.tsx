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
      // Track brace depth so we can detect \begin{...}...\end{...} inside $...$
      // and allow single newlines (e.g. pmatrix rows separated by \\\n)
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
        // Don't span blank lines (two consecutive newlines = paragraph break)
        if (src[j] === "\n" && src[j + 1] === "\n") break;
        // Allow single newlines (e.g. inside pmatrix: \\\ followed by \n)
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
// NOTE: matrix-like envs (pmatrix, bmatrix, etc.) are intentionally excluded because
// they frequently appear *inside* inline $...$ expressions and should NOT be promoted
// to block-level $$ ... $$. The tokeniser now allows single-line newlines inside $...$
// so pmatrix with \\\n row separators renders correctly as inline math.
const BLOCK_ENVS = [
  "align", "align*", "aligned",
  "equation", "equation*",
  "gather", "gather*", "gathered",
  "multline", "multline*",
  "flalign", "flalign*",
  "cases", "split",
];

function normalizeLatexDelimiters(src: string): string {
  // \[ ... \]  →  $$...$$
  // NOTE: The regex /\\\[(...)\\\]/g in JS source matches literal \[ and \] in the string.
  // A single backslash in the string is \\, so \[ is \\[ in the string.
  // Correct regex to match \[ is /\\\\\[/g (4 backslashes in source = 2 in regex = 1 literal \)
  // The string coming in has LaTeX with single backslashes stored as-is (e.g. \( becomes \\( in JS).
  // /\\\\\[/ in JS regex source = 4 backslashes = regex matches 2 literal backslashes = NO.
  // Actually: LLM output \( is ONE backslash + (, stored in JS string as \\( (2 chars: \ and ().
  // To match ONE backslash + ( in a JS regex literal: use /\\\(/ (3 backslashes + open paren).
  // But /\\\(/ in JS = regex /\\\(/ = matches \ then ( = correct for \( in string.
  // The ORIGINAL regex was correct! The bug was that \\\) also matches \ + ) greedily
  // causing the lazy .*? to stop early at an intermediate \.
  // Fix: use a possessive/atomic approach or exclude \\ from the inner capture.
  // Best fix: match \( then capture everything that is NOT \) (i.e. not backslash+paren)
  // Use: /\\\(((?:[^\\]|\\[^)])*?)\\\)/g
  let out = src.replace(/\\\[((?:[^\\]|\\[^\]])*?)\\\]/g, (_m, inner) => `$$${inner}$$`);
  out = out.replace(/\\\(((?:[^\\]|\\[^)])*?)\\\)/g, (_m, inner) => `$${inner}$`);
  // Bare \begin{env}...\end{env} (not already inside $$ or $) → $$\begin{env}...\end{env}$$
  // IMPORTANT: only capture up to \end{env} — do NOT swallow trailing non-math content
  // (e.g. "#### 2.0" that follows \end{align*} on the same line must be excluded)
  for (const env of BLOCK_ENVS) {
    const escapedEnv = env.replace("*", "\\*");
    // Match \begin{env}..\end{env} not already preceded by $
    // Then check if there's trailing non-whitespace on the same token — if so, split it out
    const pattern = new RegExp(
      `(?<!\\$)\\\\begin\\{${escapedEnv}\\}([\\s\\S]*?)\\\\end\\{${escapedEnv}\\}([^\n]*)`,
      "g"
    );
    out = out.replace(pattern, (_m, inner, trailing) => {
      const mathBlock = `$$\\begin{${env}}${inner}\\end{${env}}$$`;
      // If there's trailing content on the same line (e.g. "#### 2.0"), put it on a new line
      const trailingTrimmed = trailing.trimStart();
      if (trailingTrimmed) {
        return `${mathBlock}\n${trailingTrimmed}`;
      }
      return mathBlock;
    });
  }
  return out;
}

function buildHtml(src: string): string {
  // Normalize \[...\] and \(...\) to $$...$$ and $...$
  src = normalizeLatexDelimiters(src);

  // ─── Step 1: Extract ALL $$ blocks (including multi-line ones) from the full text ───
  // This handles cases like: "text $$\begin{pmatrix}\n1\\2\end{pmatrix}$$ more text"
  // where the $$ block spans multiple lines and can't be found by per-line processing.
  // Strategy: scan the full text for $$ pairs, extract them as placeholders, then
  // re-insert them after line-based splitting.
  const mathBlocks: string[] = [];
  const PLACEHOLDER_PREFIX = "\x00MATHBLOCK";
  const PLACEHOLDER_SUFFIX = "\x00";

  // Find unescaped $$ in the full text
  const findUnescapedDoubleDollar = (str: string, from = 0): number => {
    let pos = from;
    while (pos <= str.length - 2) {
      const idx = str.indexOf("$$", pos);
      if (idx === -1) return -1;
      if (idx > 0 && str[idx - 1] === "\\") { pos = idx + 2; continue; }
      return idx;
    }
    return -1;
  };

  // Replace all $$...$$ blocks (including multi-line) with placeholders
  let processed = "";
  let remaining = src;
  while (true) {
    const open = findUnescapedDoubleDollar(remaining);
    if (open === -1) { processed += remaining; break; }
    const close = findUnescapedDoubleDollar(remaining, open + 2);
    if (close === -1) { processed += remaining; break; } // unclosed, leave as-is
    const before = remaining.slice(0, open);
    const mathContent = remaining.slice(open + 2, close); // content between $$
    remaining = remaining.slice(close + 2);
    const idx = mathBlocks.length;
    mathBlocks.push(mathContent);
    // Put placeholder on its own line so the line-based parser treats it as a block
    const needsNewlineBefore = before.length > 0 && !before.endsWith("\n");
    const needsNewlineAfter = remaining.length > 0 && !remaining.startsWith("\n");
    processed += before;
    if (needsNewlineBefore) processed += "\n";
    processed += `${PLACEHOLDER_PREFIX}${idx}${PLACEHOLDER_SUFFIX}`;
    if (needsNewlineAfter) processed += "\n";
  }

  // ─── Step 2: Line-based splitting for inline $$ mixing with text ───
  // At this point all $$ blocks are placeholders, so no cross-line $$ issues.
  const normalised = processed
    .split("\n")
    .join("\n");

  // Split into lines for block-level processing
  const lines = normalised.split("\n");
  const segments: Array<{ kind: "blockquote" | "math-block" | "text"; content: string }> = [];

  const PLACEHOLDER_RE = new RegExp(`${PLACEHOLDER_PREFIX.replace(/\x00/g, "\\x00")}(\\d+)${PLACEHOLDER_SUFFIX.replace(/\x00/g, "\\x00")}`);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Math block placeholder (from Step 1 extraction)
    const phMatch = line.trim().match(PLACEHOLDER_RE);
    if (phMatch && line.trim() === phMatch[0]) {
      const blockIdx = Number(phMatch[1]);
      segments.push({ kind: "math-block", content: mathBlocks[blockIdx].trim() });
      i++;
      continue;
    }

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
    // This handles any remaining $$ that weren't caught by Step 1 (e.g. single-line $$)
    if (/^\s*\$\$/.test(line)) {
      let mathContent = "";
      const openLine = line.replace(/^\s*\$\$/, "");
      if (/\$\$\s*$/.test(openLine) && openLine.trim() !== "") {
        mathContent = openLine.replace(/\$\$\s*$/, "").trim();
        segments.push({ kind: "math-block", content: mathContent });
        i++;
        continue;
      }
      mathContent = openLine;
      i++;
      while (i < lines.length) {
        if (/^\s*\$\$\s*$/.test(lines[i])) { i++; break; }
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
      !/^\s*\$\$/.test(lines[i]) &&
      !lines[i].trim().match(PLACEHOLDER_RE)
    ) {
      // If a line contains an inline placeholder (text + placeholder), keep it as text
      // and let renderInlineSegment handle the placeholder substitution
      textContent += lines[i] + "\n";
      i++;
    }
    if (textContent.trim()) {
      segments.push({ kind: "text", content: textContent.trimEnd() });
    }
  }

  // Helper: restore math block placeholders in text/inline segments
  const restorePlaceholders = (text: string): string => {
    return text.replace(
      new RegExp(`${PLACEHOLDER_PREFIX.replace(/\x00/g, "\\x00")}(\\d+)${PLACEHOLDER_SUFFIX.replace(/\x00/g, "\\x00")}`, "g"),
      (_m, idx) => `$$${mathBlocks[Number(idx)]}$$`
    );
  };

  // Render segments
  let out = "";
  for (const seg of segments) {
    if (seg.kind === "math-block") {
      out += `<div class="katex-block my-4 overflow-x-auto max-w-full text-center">${renderMath(seg.content, true)}</div>`;
    } else if (seg.kind === "blockquote") {
      const inner = renderInlineSegment(restorePlaceholders(seg.content));
      out += `<blockquote class="border-l-4 border-amber-400 bg-amber-50 pl-4 pr-3 py-2 my-3 rounded-r text-sm text-amber-900 italic">${inner}</blockquote>`;
    } else {
      const paras = restorePlaceholders(seg.content).split(/\n{2,}/);
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
