import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { Components } from "react-markdown";

interface MathRendererProps {
  content: string;
  className?: string;
  inline?: boolean;
}

const blockComponents: Components = {
  code({ children, className: codeClass }) {
    const isBlock = codeClass?.includes("language-");
    if (isBlock) {
      return (
        <pre className="bg-slate-100 rounded-md p-3 overflow-x-auto text-sm">
          <code>{children}</code>
        </pre>
      );
    }
    return (
      <code className="bg-slate-100 rounded px-1 py-0.5 text-sm font-mono">
        {children}
      </code>
    );
  },
  h2({ children }) {
    return <h2 className="text-base font-semibold text-slate-700 mt-4 mb-1">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-sm font-semibold text-slate-600 mt-3 mb-1">{children}</h3>;
  },
  p({ children }) {
    return <p className="text-slate-800 leading-relaxed mb-2">{children}</p>;
  },
  ul({ children }) {
    return <ul className="list-disc list-inside space-y-1 text-slate-800 mb-2">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal list-inside space-y-1 text-slate-800 mb-2">{children}</ol>;
  },
  strong({ children }) {
    return <strong className="font-semibold text-slate-900">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic text-slate-700">{children}</em>;
  },
};

const inlineComponents: Components = {
  p({ children }) {
    return <span>{children}</span>;
  },
};

/**
 * Renders markdown content with LaTeX math formulas via KaTeX.
 * Handles both $...$ inline and $$...$$ block math.
 * Uses react-markdown v10 named export `Markdown`.
 */
export function MathRenderer({ content, className = "", inline = false }: MathRendererProps) {
  if (!content) return null;

  if (inline) {
    return (
      <span className={`math-inline ${className}`}>
        <Markdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={inlineComponents}
        >
          {content}
        </Markdown>
      </span>
    );
  }

  return (
    <div className={`math-content prose prose-slate max-w-none ${className}`}>
      <Markdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={blockComponents}
      >
        {content}
      </Markdown>
    </div>
  );
}
