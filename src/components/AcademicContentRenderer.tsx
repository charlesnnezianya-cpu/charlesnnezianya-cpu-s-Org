import React, { useState } from 'react';
import { Check, Copy, Sparkles } from 'lucide-react';
import type { EducationalDiagramSpec } from '../types/brainstine';
import { EducationalDiagramRenderer } from './EducationalDiagramRenderer';

interface AcademicContentRendererProps {
  content: string;
  className?: string;
}

const SYMBOL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\times/g, '×'],
  [/\\cdot/g, '·'],
  [/\\div/g, '÷'],
  [/\\pm/g, '±'],
  [/\\mp/g, '∓'],
  [/\\leq/g, '≤'],
  [/\\geq/g, '≥'],
  [/\\neq/g, '≠'],
  [/\\approx/g, '≈'],
  [/\\equiv/g, '≡'],
  [/\\propto/g, '∝'],
  [/\\infty/g, '∞'],
  [/\\rightarrow|\\to/g, '→'],
  [/\\leftarrow/g, '←'],
  [/\\leftrightarrow/g, '↔'],
  [/\\rightleftharpoons/g, '⇌'],
  [/\\Rightarrow/g, '⇒'],
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'],
  [/\\delta/g, 'δ'],
  [/\\Delta/g, 'Δ'],
  [/\\epsilon/g, 'ε'],
  [/\\theta/g, 'θ'],
  [/\\lambda/g, 'λ'],
  [/\\mu/g, 'μ'],
  [/\\pi/g, 'π'],
  [/\\rho/g, 'ρ'],
  [/\\sigma/g, 'σ'],
  [/\\Sigma/g, 'Σ'],
  [/\\tau/g, 'τ'],
  [/\\phi/g, 'φ'],
  [/\\omega/g, 'ω'],
  [/\\Omega/g, 'Ω'],
  [/\\int/g, '∫'],
  [/\\sum/g, '∑'],
  [/\\partial/g, '∂'],
  [/\\nabla/g, '∇'],
  [/\\degree|\^\\circ/g, '°'],
];

function formatMathExpression(raw: string): string {
  let out = raw.trim();
  // Clean \frac{a}{b} -> (a) / (b)
  out = out.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
  out = out.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');
  for (const [pattern, symbol] of SYMBOL_REPLACEMENTS) {
    out = out.replace(pattern, symbol);
  }
  out = out.replace(/\\left|\\right/g, '');
  out = out.replace(/\\text\{([^{}]+)\}/g, '$1');
  return out;
}

function renderMathText(expr: string, keyPrefix: string): React.ReactNode {
  const formatted = formatMathExpression(expr);
  // Render simple superscripts ^{...} / ^x and subscripts _{...} / _x cleanly
  const parts = formatted.split(/(\^\{[^}]+\}|_\{[^}]+\}|\^[0-9a-zA-Z+\-]|_[0-9a-zA-Z+\-])/g);
  return parts.map((part, idx) => {
    const key = `${keyPrefix}-m-${idx}`;
    if (!part) return null;
    if (part.startsWith('^')) {
      const inner = part.startsWith('^{') ? part.slice(2, -1) : part.slice(1);
      return <sup key={key} className="text-[0.75em] leading-none">{inner}</sup>;
    }
    if (part.startsWith('_')) {
      const inner = part.startsWith('_{') ? part.slice(2, -1) : part.slice(1);
      return <sub key={key} className="text-[0.75em] leading-none">{inner}</sub>;
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

function renderInlineSegments(text: string, keyPrefix: string): React.ReactNode[] {
  const tokens = text.split(
    /(`[^`]+`|\*\*[^*\n]+?\*\*|\*[^*\s](?:[^*\n]*?[^*\s])?\*|\\\([^\n]+?\\\)|\$(?!\s)[^$\n]*?(?:[a-zA-Z\\_^=+\-*/(){}])[^$\n]*?\$)/g
  );
  return tokens.map((token, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (!token) return null;
    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      return (
        <code
          key={key}
          className="break-words rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      return (
        <strong key={key} className="font-semibold text-slate-950 dark:text-white">
          {renderInlineSegments(token.slice(2, -2), `${key}-b`)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length >= 3) {
      return (
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    if (token.startsWith('\\(') && token.endsWith('\\)') && token.length >= 5) {
      return (
        <span
          key={key}
          className="mx-0.5 inline-block max-w-full overflow-x-auto align-bottom rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] font-medium text-[#0F1E3D] dark:bg-slate-800/90 dark:text-sky-300"
        >
          {renderMathText(token.slice(2, -2), key)}
        </span>
      );
    }
    if (token.startsWith('$') && token.endsWith('$') && token.length >= 3) {
      return (
        <span
          key={key}
          className="mx-0.5 inline-block max-w-full overflow-x-auto align-bottom rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] font-medium text-[#0F1E3D] dark:bg-slate-800/90 dark:text-sky-300"
        >
          {renderMathText(token.slice(1, -1), key)}
        </span>
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
      <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed academic-selectable">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = parseTableRow(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

export const AcademicContentRenderer = React.memo(function AcademicContentRenderer({
  content,
  className = '',
}: AcademicContentRendererProps) {
  if (!content) return null;

  // Hide any incomplete mid-stream [[DIAGRAM:... marker cleanly while typing
  let displayContent = content;
  const openDiagramIdx = displayContent.indexOf('[[DIAGRAM:');
  let pendingDiagram = false;
  if (openDiagramIdx !== -1) {
    const closeIdx = displayContent.indexOf(']]', openDiagramIdx);
    if (closeIdx === -1) {
      pendingDiagram = true;
      displayContent = displayContent.slice(0, openDiagramIdx).trimEnd();
    }
  }

  // Split by fenced code blocks, display math blocks ($$...$$ or \[...\]), and [[DIAGRAM:{...}]]
  const segments = displayContent.split(
    /(```[\s\S]*?```|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\[\[DIAGRAM:[\s\S]*?\]\])/g
  );

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

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx].trimEnd();
      const trimmed = line.trim();
      const seed = `${segIdx}-${lineIdx}`;

      if (!trimmed) {
        flushParagraph(seed);
        flushList(seed);
        continue;
      }

      // Markdown table detection
      if (
        trimmed.includes('|') &&
        lineIdx + 1 < lines.length &&
        isTableSeparator(lines[lineIdx + 1])
      ) {
        flushParagraph(seed);
        flushList(seed);
        const headers = parseTableRow(trimmed);
        lineIdx += 2; // skip separator
        const rows: string[][] = [];
        while (lineIdx < lines.length && lines[lineIdx].trim().includes('|')) {
          rows.push(parseTableRow(lines[lineIdx]));
          lineIdx++;
        }
        lineIdx--; // adjust for outer loop increment

        elements.push(
          <div
            key={`tbl-${seed}`}
            className="my-3 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/50"
          >
            <table className="w-full min-w-[420px] border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-800/80">
                  {headers.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      className="px-3.5 py-2.5 font-display text-xs font-semibold text-slate-900 dark:text-white"
                    >
                      {renderInlineSegments(h, `th-${seed}-${hIdx}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-transparent dark:even:bg-slate-800/30"
                  >
                    {headers.map((_, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-3.5 py-2.5 text-slate-700 dark:text-slate-300"
                      >
                        {renderInlineSegments(row[cIdx] ?? '', `td-${seed}-${rIdx}-${cIdx}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      if (/^---+$/.test(trimmed)) {
        flushParagraph(seed);
        flushList(seed);
        elements.push(
          <hr key={`hr-${seed}`} className="my-3 border-slate-200 dark:border-slate-800" />
        );
        continue;
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
        continue;
      }

      if (trimmed.startsWith('> ')) {
        flushParagraph(seed);
        flushList(seed);
        const rawQuote = trimmed.slice(2).replace(/^\[!(KEY|NOTE|TIP|EXAMPLE|CHECK)\]\s*/i, '');
        const isExample =
          /^(?:\*\*|__)?(worked example|example|analogy|application|real-world example)\b/i.test(
            rawQuote
          ) || /^\[!EXAMPLE\]/i.test(trimmed.slice(2));
        const isKnowledgeCheck =
          /^(?:\*\*|__)?(knowledge check|check your understanding|practice question|quick check)\b/i.test(
            rawQuote
          ) || /^\[!CHECK\]/i.test(trimmed.slice(2));
        const isSourceNote =
          /^(?:\*\*|__)?source note\b/i.test(rawQuote);
        const isKeyTakeaway =
          /key (concept|takeaway|idea|formula)|important|remember/i.test(rawQuote) ||
          /^\[!(KEY|NOTE|TIP)\]/i.test(trimmed.slice(2));

        const blockStyle = isExample
          ? 'border-emerald-200 bg-emerald-50/65 text-slate-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-slate-100'
          : isKnowledgeCheck
            ? 'border-amber-200 bg-amber-50/75 text-slate-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-slate-100'
            : isSourceNote
              ? 'border-slate-200 bg-slate-100/70 text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300'
              : isKeyTakeaway
                ? 'border-sky-200 bg-sky-50/80 text-slate-900 dark:border-sky-800/70 dark:bg-sky-950/35 dark:text-slate-100'
                : 'border-blue-200/80 bg-blue-50/70 text-slate-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-slate-200';

        elements.push(
          <blockquote
            key={`bq-${seed}`}
            className={`my-2.5 rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed ${blockStyle}`}
          >
            {renderInlineSegments(rawQuote, `bq-${seed}`)}
          </blockquote>
        );
        continue;
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
        continue;
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
        continue;
      }

      flushList(seed);
      paragraphLines.push(trimmed);
    }

    flushParagraph(`${segIdx}-end`);
    flushList(`${segIdx}-end`);
    return elements;
  };

  return (
    <div className={`min-w-0 max-w-full space-y-2.5 break-words academic-selectable ${className}`}>
      {segments.map((seg, idx) => {
        if (!seg) return null;

        if (seg.startsWith('```') && seg.endsWith('```')) {
          const inner = seg.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const language = firstNewline >= 0 ? inner.slice(0, firstNewline).trim() : '';
          const code = firstNewline >= 0 ? inner.slice(firstNewline + 1).trimEnd() : inner.trim();
          return <CodeBlock key={`code-${idx}`} code={code} language={language} />;
        }

        if (
          (seg.startsWith('$$') && seg.endsWith('$$') && seg.length > 4) ||
          (seg.startsWith('\\[') && seg.endsWith('\\]') && seg.length > 4)
        ) {
          const expr = seg.slice(2, -2).trim();
          return (
            <div
              key={`math-${idx}`}
              className="my-2.5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center font-mono text-sm font-medium text-[#0F1E3D] dark:border-slate-700 dark:bg-slate-900/80 dark:text-sky-300"
            >
              {renderMathText(expr, `math-${idx}`)}
            </div>
          );
        }

        if (seg.startsWith('[[DIAGRAM:') && seg.endsWith(']]')) {
          const jsonStr = seg.slice('[[DIAGRAM:'.length, -2).trim();
          try {
            const parsed = JSON.parse(jsonStr) as EducationalDiagramSpec;
            if (parsed && parsed.title && parsed.type) {
              return <EducationalDiagramRenderer key={`diag-${idx}`} spec={parsed} compact />;
            }
          } catch {
            return null;
          }
          return null;
        }

        return (
          <React.Fragment key={`md-${idx}`}>
            {renderMarkdownBlock(seg, idx)}
          </React.Fragment>
        );
      })}

      {pendingDiagram && (
        <div className="my-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 select-none">
          <Sparkles className="h-3.5 w-3.5 text-[#1D4ED8] dark:text-sky-400" aria-hidden="true" />
          <span>Rendering educational diagram…</span>
        </div>
      )}
    </div>
  );
});
