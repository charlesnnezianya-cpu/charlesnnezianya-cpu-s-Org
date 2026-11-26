import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Sparkles } from 'lucide-react';
import { stripUnsupportedDisplaySymbols } from '../lib/scientificFormatter';
import type { EducationalDiagramSpec } from '../types/brainstine';
import { EducationalDiagramRenderer } from './EducationalDiagramRenderer';

interface AcademicContentRendererProps {
  content: string;
  className?: string;
  collapsibleSections?: boolean;
}

const SYMBOL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\times/g, '×'],
  [/\\cdot/g, '·'],
  [/\\div/g, '÷'],
  [/\\pm/g, '±'],
  [/\\mp/g, '∓'],
  [/\\leq|\\le\b/g, '≤'],
  [/\\geq|\\ge\b/g, '≥'],
  [/\\neq|\\ne\b/g, '≠'],
  [/\\approx/g, '≈'],
  [/\\equiv/g, '≡'],
  [/\\propto/g, '∝'],
  [/\\infty/g, '∞'],
  [/\\rightarrow|\\to\b/g, '→'],
  [/\\leftarrow/g, '←'],
  [/\\leftrightarrow/g, '↔'],
  [/\\rightleftharpoons|\\leftrightharpoons/g, '⇌'],
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

function sanitizeAcademicDisplayText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  // Preserve newlines while stripping PDF Private Use Area / empty-box tofu / zero-width glyphs
  return raw
    .split('\n')
    .map((line) => stripUnsupportedDisplaySymbols(line))
    .join('\n');
}

function formatMathExpression(raw: string): string {
  let out = raw.trim();
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
  const parts = formatted.split(/(\^\{[^}]+\}|_\{[^}]+\}|\^[0-9a-zA-Z+\-]|_[0-9a-zA-Z+\-])/g);
  return parts.map((part, idx) => {
    const key = `${keyPrefix}-m-${idx}`;
    if (!part) return null;
    if (part.startsWith('^')) {
      const inner = part.startsWith('^{') ? part.slice(2, -1) : part.slice(1);
      return (
        <sup key={key} className="text-[0.75em] leading-none">
          {inner}
        </sup>
      );
    }
    if (part.startsWith('_')) {
      const inner = part.startsWith('_{') ? part.slice(2, -1) : part.slice(1);
      return (
        <sub key={key} className="text-[0.75em] leading-none">
          {inner}
        </sub>
      );
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

const PAGE_CITATION_RE =
  /^\((?:Source:\s*[^()]{2,90},\s*)?Pages?\s+\d+(?:\s*[-–,]\s*\d+)*\)$/i;
const DOC_PAGE_CITATION_RE =
  /^\([^()]{2,90},\s*Pages?\s+\d+(?:\s*[-–,]\s*\d+)*\)$/i;

function renderInlineSegments(text: string, keyPrefix: string): React.ReactNode[] {
  const tokens = text.split(
    /(`[^`]+`|\*\*[^*\n]+?\*\*|\*[^*\s](?:[^*\n]*?[^*\s])?\*|\\\([^\n]+?\\\)|\$(?!\s)[^$\n]*?(?:[a-zA-Z\\_^=+\-*/(){}])[^$\n]*?\$|\((?:Source:\s*[^()]{2,90},\s*|[^()]{2,90},\s*)?Pages?\s+\d+(?:\s*[-–,]\s*\d+)*\))/gi
  );

  return tokens.map((token, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (!token) return null;

    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      return (
        <code
          key={key}
          className="break-words rounded border border-slate-200 bg-slate-100/90 px-1.5 py-0.5 font-mono text-[0.84em] text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-cyan-300"
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
      const inner = token.slice(1, -1).trim();
      // Keep source citations crisp and upright instead of italic walls
      if (PAGE_CITATION_RE.test(inner) || DOC_PAGE_CITATION_RE.test(inner)) {
        return (
          <span
            key={key}
            className="font-mono text-[11px] font-medium text-slate-500 tabular-nums dark:text-slate-400"
          >
            {inner}
          </span>
        );
      }
      return (
        <em key={key} className="italic text-slate-800 dark:text-slate-200">
          {inner}
        </em>
      );
    }

    if (token.startsWith('\\(') && token.endsWith('\\)') && token.length >= 5) {
      return (
        <span
          key={key}
          className="font-medium text-[#0F1E3D] dark:text-sky-300"
        >
          {renderMathText(token.slice(2, -2), key)}
        </span>
      );
    }

    if (token.startsWith('$') && token.endsWith('$') && token.length >= 3) {
      return (
        <span
          key={key}
          className="font-medium text-[#0F1E3D] dark:text-sky-300"
        >
          {renderMathText(token.slice(1, -1), key)}
        </span>
      );
    }

    if (PAGE_CITATION_RE.test(token) || DOC_PAGE_CITATION_RE.test(token)) {
      return (
        <span
          key={key}
          className="font-mono text-[11px] font-medium text-slate-500 tabular-nums dark:text-slate-400"
        >
          {token}
        </span>
      );
    }

    return <React.Fragment key={key}>{token}</React.Fragment>;
  });
}

/**
 * Renders structured term—explanation items cleanly without turning every line into a bordered card.
 */
function renderTermAwareLine(item: string, keyPrefix: string): React.ReactNode {
  const defMatch = item.match(/^\*\*([^*\n]{2,64})\*\*\s*(?:—|–|:|-)\s+(.+)$/);
  if (defMatch) {
    const [, term, body] = defMatch;
    return (
      <>
        <strong className="font-semibold text-slate-950 dark:text-white">{term}</strong>
        <span className="text-slate-400 dark:text-slate-500"> — </span>
        <span>{renderInlineSegments(body, `${keyPrefix}-def`)}</span>
      </>
    );
  }
  return renderInlineSegments(item, keyPrefix);
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

function renderCalloutBlock(quoteLines: string[], seed: string): React.ReactNode {
  const cleanedLines = quoteLines.map((l) =>
    l.replace(/^\[!(KEY|NOTE|TIP|EXAMPLE|CHECK)\]\s*/i, '').trim()
  );
  const combinedText = cleanedLines.join('\n').trim();
  const firstLine = quoteLines[0] || '';

  const isExample =
    /^(?:\*\*|__)?(worked example|example|analogy|application|real-world example)\b/i.test(
      cleanedLines[0] || ''
    ) || /^\[!EXAMPLE\]/i.test(firstLine);
  const isKnowledgeCheck =
    /^(?:\*\*|__)?(knowledge check|check your understanding|practice question|quick check)\b/i.test(
      cleanedLines[0] || ''
    ) || /^\[!CHECK\]/i.test(firstLine);
  const isSourceNote =
    /^(?:\*\*|__)?(source note|document note|general academic knowledge)\b/i.test(
      cleanedLines[0] || ''
    );
  const isKeyTakeaway =
    /key (concept|takeaway|idea|formula)|important|remember/i.test(cleanedLines[0] || '') ||
    /^\[!(KEY|NOTE|TIP)\]/i.test(firstLine);

  const blockStyle = isExample
    ? 'border-emerald-200/90 bg-emerald-50/55 text-slate-900 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-slate-100'
    : isKnowledgeCheck
      ? 'border-amber-200/90 bg-amber-50/65 text-slate-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-slate-100'
      : isSourceNote
        ? 'border-slate-200 bg-slate-100/70 text-slate-700 dark:border-slate-700/80 dark:bg-slate-800/45 dark:text-slate-300'
        : isKeyTakeaway
          ? 'border-sky-200/90 bg-sky-50/65 text-slate-900 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-slate-100'
          : 'border-blue-200/80 bg-blue-50/55 text-slate-800 dark:border-blue-900/60 dark:bg-blue-950/25 dark:text-slate-200';

  const paragraphs = combinedText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div
      key={`bq-${seed}`}
      className={`my-3 max-w-[74ch] space-y-1.5 rounded-xl border px-4 py-3 text-[14.5px] leading-[1.68] ${blockStyle}`}
    >
      {paragraphs.map((p, idx) => (
        <p key={`bqp-${seed}-${idx}`}>{renderTermAwareLine(p, `bq-${seed}-${idx}`)}</p>
      ))}
    </div>
  );
}

function renderSegmentedContent(displayContent: string, pendingDiagram: boolean) {
  const segments = displayContent.split(
    /(```[\s\S]*?```|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\[\[DIAGRAM:[\s\S]*?\]\])/g
  );

  const renderMarkdownBlock = (blockText: string, segIdx: number) => {
    const lines = blockText.split('\n');
    const elements: React.ReactNode[] = [];
    let listBuffer: { ordered: boolean; items: string[] } | null = null;
    let quoteBuffer: string[] | null = null;
    let paragraphLines: string[] = [];

    const flushParagraph = (keySeed: string) => {
      if (paragraphLines.length === 0) return;
      const joined = paragraphLines.join(' ').trim();
      if (joined) {
        elements.push(
          <p
            key={`p-${keySeed}`}
            className="max-w-[74ch] text-[14.5px] leading-[1.7] text-slate-800 sm:text-[15px] dark:text-slate-200"
          >
            {renderTermAwareLine(joined, `p-${keySeed}`)}
          </p>
        );
      }
      paragraphLines = [];
    };

    const flushQuote = (keySeed: string) => {
      if (!quoteBuffer || quoteBuffer.length === 0) return;
      elements.push(renderCalloutBlock(quoteBuffer, keySeed));
      quoteBuffer = null;
    };

    const flushList = (keySeed: string) => {
      if (!listBuffer) return;
      if (listBuffer.ordered) {
        elements.push(
          <ol
            key={`ol-${keySeed}`}
            className="my-2.5 max-w-[74ch] list-decimal space-y-2 pl-5 text-[14.5px] leading-[1.68] text-slate-800 sm:text-[15px] dark:text-slate-200"
          >
            {listBuffer.items.map((item, idx) => (
              <li key={`oli-${keySeed}-${idx}`} className="pl-1">
                {renderTermAwareLine(item, `oli-${keySeed}-${idx}`)}
              </li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul
            key={`ul-${keySeed}`}
            className="my-2.5 max-w-[74ch] list-disc space-y-2 pl-5 text-[14.5px] leading-[1.68] text-slate-800 sm:text-[15px] dark:text-slate-200"
          >
            {listBuffer.items.map((item, idx) => (
              <li key={`uli-${keySeed}-${idx}`} className="pl-1">
                {renderTermAwareLine(item, `uli-${keySeed}-${idx}`)}
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
        flushQuote(seed);
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
        flushQuote(seed);
        const headers = parseTableRow(trimmed);
        lineIdx += 2;
        const rows: string[][] = [];
        while (lineIdx < lines.length && lines[lineIdx].trim().includes('|')) {
          rows.push(parseTableRow(lines[lineIdx]));
          lineIdx++;
        }
        lineIdx--;

        elements.push(
          <div
            key={`tbl-${seed}`}
            className="my-3.5 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700/90 dark:bg-slate-900/50"
          >
            <table className="w-full min-w-[420px] border-collapse text-left text-xs tabular-nums sm:text-sm">
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
                        className="px-3.5 py-2.5 align-top leading-relaxed text-slate-700 dark:text-slate-300"
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
        flushQuote(seed);
        elements.push(
          <hr key={`hr-${seed}`} className="my-4 border-slate-200 dark:border-slate-800" />
        );
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph(seed);
        flushList(seed);
        flushQuote(seed);
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        const headingClass =
          level === 1
            ? 'mt-4 mb-2 font-display text-lg font-bold tracking-tight text-slate-950 dark:text-white'
            : level === 2
              ? 'mt-4 mb-1.5 font-display text-base font-bold tracking-tight text-slate-900 sm:text-[17px] dark:text-white'
              : level === 3
                ? 'mt-3.5 mb-1 font-display text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100'
                : 'mt-3 mb-1 font-display text-sm font-semibold text-slate-800 dark:text-slate-200';
        const Tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4';
        elements.push(
          <Tag key={`h-${seed}`} className={headingClass}>
            {renderInlineSegments(text, `h-${seed}`)}
          </Tag>
        );
        continue;
      }

      if (trimmed.startsWith('> ')) {
        flushParagraph(seed);
        flushList(seed);
        if (!quoteBuffer) quoteBuffer = [];
        quoteBuffer.push(trimmed.slice(2));
        continue;
      }

      flushQuote(seed);

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
    flushQuote(`${segIdx}-end`);
    return elements;
  };

  return (
    <>
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
              className="my-3 max-w-[74ch] overflow-x-auto rounded-xl border border-slate-200/90 bg-slate-50/75 px-4 py-3 text-center font-mono text-sm font-medium text-[#0F1E3D] dark:border-slate-700 dark:bg-slate-900/75 dark:text-sky-300"
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
    </>
  );
}

interface TopSectionChunk {
  heading: string | null;
  body: string;
}

function splitLengthySections(markdown: string): TopSectionChunk[] {
  const lines = markdown.split('\n');
  let insideFence = false;
  const headingIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('```')) {
      insideFence = !insideFence;
      continue;
    }
    if (!insideFence && /^#{2,3}\s+\S/.test(trimmed)) {
      headingIndices.push(i);
    }
  }

  if (headingIndices.length < 3) return [{ heading: null, body: markdown }];

  const chunks: TopSectionChunk[] = [];
  const intro = lines.slice(0, headingIndices[0]).join('\n').trim();
  if (intro) {
    chunks.push({ heading: null, body: intro });
  }

  for (let s = 0; s < headingIndices.length; s++) {
    const start = headingIndices[s];
    const end = s + 1 < headingIndices.length ? headingIndices[s + 1] : lines.length;
    const headingLine = lines[start].trim().replace(/^#{2,3}\s+/, '').trim();
    const body = lines.slice(start + 1, end).join('\n').trim();
    if (headingLine || body) {
      chunks.push({ heading: headingLine, body });
    }
  }

  return chunks;
}

export const AcademicContentRenderer = React.memo(function AcademicContentRenderer({
  content,
  className = '',
  collapsibleSections = false,
}: AcademicContentRendererProps) {
  const [collapsedMap, setCollapsedMap] = useState<Record<number, boolean>>({});

  const { displayContent, pendingDiagram, sectionChunks } = useMemo(() => {
    if (!content) {
      return { displayContent: '', pendingDiagram: false, sectionChunks: null as TopSectionChunk[] | null };
    }

    let cleaned = sanitizeAcademicDisplayText(content);
    const openDiagramIdx = cleaned.indexOf('[[DIAGRAM:');
    let isPending = false;
    if (openDiagramIdx !== -1) {
      const closeIdx = cleaned.indexOf(']]', openDiagramIdx);
      if (closeIdx === -1) {
        isPending = true;
        cleaned = cleaned.slice(0, openDiagramIdx).trimEnd();
      }
    }

    let chunks: TopSectionChunk[] | null = null;
    if (collapsibleSections && !isPending && cleaned.length >= 1200) {
      const candidate = splitLengthySections(cleaned);
      const headedCount = candidate.filter((c) => c.heading !== null).length;
      if (headedCount >= 3) {
        chunks = candidate;
      }
    }

    return { displayContent: cleaned, pendingDiagram: isPending, sectionChunks: chunks };
  }, [content, collapsibleSections]);

  if (!content || !displayContent) return null;

  if (sectionChunks) {
    const headedIndices = sectionChunks
      .map((s, idx) => (s.heading ? idx : -1))
      .filter((idx) => idx !== -1);
    const anyCollapsed = headedIndices.some((idx) => collapsedMap[idx]);

    const toggleAll = () => {
      const nextVal = !anyCollapsed;
      const next: Record<number, boolean> = {};
      for (const idx of headedIndices) {
        next[idx] = nextVal;
      }
      setCollapsedMap(next);
    };

    return (
      <div className={`min-w-0 max-w-full space-y-3 break-words academic-selectable ${className}`}>
        {sectionChunks.map((sec, idx) => {
          if (!sec.heading) {
            return (
              <div key={`intro-${idx}`} className="space-y-2.5">
                {renderSegmentedContent(sec.body, false)}
              </div>
            );
          }

          const isCollapsed = Boolean(collapsedMap[idx]);
          return (
            <div
              key={`sec-${idx}`}
              className="border-t border-slate-200/80 pt-3 first:border-t-0 first:pt-0 dark:border-slate-800/80"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedMap((prev) => ({ ...prev, [idx]: !prev[idx] }))
                  }
                  aria-expanded={!isCollapsed}
                  className="flex min-h-9 flex-1 items-center justify-between gap-2 text-left transition-colors hover:text-blue-700 select-none dark:hover:text-cyan-400"
                >
                  <span className="font-display text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
                    {renderInlineSegments(sec.heading, `sech-${idx}`)}
                  </span>
                  <span className="shrink-0 text-slate-400 dark:text-slate-500">
                    {isCollapsed ? (
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                </button>
                {idx === headedIndices[0] && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 select-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    {anyCollapsed ? 'Expand all' : 'Collapse all'}
                  </button>
                )}
              </div>
              {!isCollapsed && (
                <div className="mt-2 space-y-2.5">
                  {renderSegmentedContent(sec.body, idx === sectionChunks.length - 1 && pendingDiagram)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`min-w-0 max-w-full space-y-2.5 break-words academic-selectable ${className}`}>
      {renderSegmentedContent(displayContent, pendingDiagram)}
    </div>
  );
});
