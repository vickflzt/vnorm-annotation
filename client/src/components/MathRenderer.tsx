import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface MathRendererProps {
  content: string;
  className?: string;
  inline?: boolean;
}

/**
 * Renders markdown content with LaTeX math formulas via KaTeX.
 * Handles both $...$ inline and $$...$$ block math.
 */
export function MathRenderer({ content, className = "", inline = false }: MathRendererProps) {
  if (!content) return null;

  if (inline) {
    return (
      <span className={className}>
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }) => <span>{children}</span>,
          }}
        >
          {content}
        </ReactMarkdown>
      </span>
    );
  }

  return (
    <div className={`math-content prose prose-slate max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Style code blocks nicely
          code: ({ children, className: codeClass }) => {
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
          // Step headers (## Step N)
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-slate-700 mt-4 mb-1">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-slate-600 mt-3 mb-1">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-slate-800 leading-relaxed mb-2">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 text-slate-800 mb-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 text-slate-800 mb-2">{children}</ol>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-900">{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
