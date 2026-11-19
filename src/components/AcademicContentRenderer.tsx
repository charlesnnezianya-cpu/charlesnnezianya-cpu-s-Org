import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface AcademicContentRendererProps {
  content: string;
  className?: string;
}

function renderInlineSegments(text: string, keyPrefix: string): React.ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((token, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (!token) return null;
    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      return (
        <code
          key={key}
          className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      return (
        <strong key={key} className="font-semibold text-slate-950 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length >= 2) {
      return (
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={key}>{token}</React.Fragment>;
  });
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard denial
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-slate-100 dark:border-slate-700">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3.5 py-1.5 select-none">
        <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed select-text">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function AcademicContentRenderer({
  content,
  className = '',
}: AcademicContentRendererProps) {
  if (!content) return null;

  // Split by fenced code blocks first
  const segments = content.split(/(```[\s\S]*?```)/g);

  const renderMarkdownBlock = (blockText: string, segIdx: number) => {
    const lines = blockText.split('\n');
    const elements: React.ReactNode[] = [];
    let listBuffer: { ordered: boolean; items: string[] } | null = null;
    let paragraphLines: string[] = [];

    const flushParagraph = (keySeed: string) => {
      if (paragraphLines.length === 0) return;
      const joined = paragraphLines.join(' ').trim();
      if (joined) {
        elements.push(
          <p
            key={`p-${keySeed}`}
            className="text-sm leading-relaxed text-slate-800 dark:text-slate-200"
          >
            {renderInlineSegments(joined, `p-${keySeed}`)}
          </p>
        );
      }
      paragraphLines = [];
    };

    const flushList = (keySeed: string) => {
      if (!listBuffer) return;
      if (listBuffer.ordered) {
        elements.push(
          <ol
            key={`ol-${keySeed}`}
            className="my-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-800 dark:text-slate-200"
          >
            {listBuffer.items.map((item, idx) => (
              <li key={`oli-${keySeed}-${idx}`}>
                {renderInlineSegments(item, `oli-${keySeed}-${idx}`)}
              </li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul
            key={`ul-${keySeed}`}
            className="my-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-800 dark:text-slate-200"
          >
            {listBuffer.items.map((item, idx) => (
              <li key={`uli-${keySeed}-${idx}`}>
                {renderInlineSegments(item, `uli-${keySeed}-${idx}`)}
              </li>
            ))}
          </ul>
        );
      }
      listBuffer = null;
    };

    lines.forEach((rawLine, lineIdx) => {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      const seed = `${segIdx}-${lineIdx}`;

      if (!trimmed) {
        flushParagraph(seed);
        flushList(seed);
        return;
      }

      if (/^---+$/.test(trimmed)) {
        flushParagraph(seed);
        flushList(seed);
        elements.push(
          <hr
            key={`hr-${seed}`}
            className="my-3 border-slate-200 dark:border-slate-800"
          />
        );
        return;
      }

      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph(seed);
        flushList(seed);
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        const headingClass =
          level === 1
            ? 'mt-3 mb-1.5 font-display text-lg font-bold text-slate-950 dark:text-white'
            : level === 2
              ? 'mt-3 mb-1.5 font-display text-base font-bold text-slate-900 dark:text-white'
              : 'mt-2.5 mb-1 font-display text-sm font-semibold text-slate-900 dark:text-slate-100';
        elements.push(
          <h4 key={`h-${seed}`} className={headingClass}>
            {renderInlineSegments(text, `h-${seed}`)}
          </h4>
        );
        return;
      }

      if (trimmed.startsWith('> ')) {
        flushParagraph(seed);
        flushList(seed);
        elements.push(
          <blockquote
            key={`bq-${seed}`}
            className="my-2 rounded-lg border border-blue-200/80 bg-blue-50/70 px-3.5 py-2 text-sm leading-relaxed text-slate-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-slate-200"
          >
            {renderInlineSegments(trimmed.slice(2), `bq-${seed}`)}
          </blockquote>
        );
        return;
      }

      const unorderedMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      if (unorderedMatch) {
        flushParagraph(seed);
        if (listBuffer && listBuffer.ordered) {
          flushList(seed);
        }
        if (!listBuffer) {
          listBuffer = { ordered: false, items: [] };
        }
        listBuffer.items.push(unorderedMatch[1]);
        return;
      }

      const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (orderedMatch) {
        flushParagraph(seed);
        if (listBuffer && !listBuffer.ordered) {
          flushList(seed);
        }
        if (!listBuffer) {
          listBuffer = { ordered: true, items: [] };
        }
        listBuffer.items.push(orderedMatch[1]);
        return;
      }

      flushList(seed);
      paragraphLines.push(trimmed);
    });

    flushParagraph(`${segIdx}-end`);
    flushList(`${segIdx}-end`);
    return elements;
  };

  return (
    <div className={`space-y-2.5 select-text ${className}`}>
      {segments.map((seg, idx) => {
        if (!seg) return null;
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const inner = seg.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const language =
            firstNewline >= 0 ? inner.slice(0, firstNewline).trim() : '';
          const code =
            firstNewline >= 0 ? inner.slice(firstNewline + 1).trimEnd() : inner.trim();
          return <CodeBlock key={`code-${idx}`} code={code} language={language} />;
        }
        return (
          <React.Fragment key={`md-${idx}`}>
            {renderMarkdownBlock(seg, idx)}
          </React.Fragment>
        );
      })}
    </div>
  );
}
