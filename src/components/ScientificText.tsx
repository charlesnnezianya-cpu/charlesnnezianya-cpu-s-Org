import React from 'react';
import { formatScientificText } from '../lib/scientificFormatter';

interface ScientificTextProps {
  text: string;
  className?: string;
}

/**
 * Renders academic text cleanly inline with scientific/chemical/mathematical notation,
 * subtle inline page citations, and optional bold emphasis — never wrapping formulas in boxed pills.
 */
export function ScientificText({ text, className = '' }: ScientificTextProps) {
  if (!text) return null;

  const formatted = formatScientificText(text);

  // Split by bold markers (**...**) or page references ((Page N))
  const tokens = formatted.split(/(\*\*[^*]+\*\*|\(Pages?\s+\d+(?:\s*[-–]\s*\d+)?\))/g);

  return (
    <span className={className}>
      {tokens.map((tok, idx) => {
        if (!tok) return null;

        if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
          return (
            <strong key={idx} className="font-semibold text-slate-900 dark:text-white">
              {renderMathSubSup(tok.slice(2, -2))}
            </strong>
          );
        }

        if (/^\(Pages?\s+\d+(?:\s*[-–]\s*\d+)?\)$/.test(tok)) {
          return (
            <span
              key={idx}
              className="font-mono text-[11px] font-medium text-slate-500 tabular-nums dark:text-slate-400"
            >
              {tok}
            </span>
          );
        }

        return <React.Fragment key={idx}>{renderMathSubSup(tok)}</React.Fragment>;
      })}
    </span>
  );
}

function renderMathSubSup(segment: string): React.ReactNode {
  // Handle remaining multi-letter variable subscripts/superscripts like E_k, F_net, K_eq, v_{max}, x^{n+1}
  const parts = segment.split(
    /(\b[A-Za-zΔαβγλμθπρσωΩ]+_(?:\{[A-Za-z0-9,+\-]{1,12}\}|[A-Za-z0-9]{1,5})|\b[A-Za-z0-9)]+\^(?:\{[A-Za-z0-9+\-]{1,12}\}|[A-Za-z0-9+\-]{1,4}))/g
  );

  if (parts.length === 1) return segment;

  return parts.map((part, i) => {
    const subMatch = part.match(/^([A-Za-zΔαβγλμθπρσωΩ]+)_(?:\{([^}]+)\}|([A-Za-z0-9]+))$/);
    if (subMatch) {
      const base = subMatch[1];
      const sub = subMatch[2] || subMatch[3];
      return (
        <span key={i}>
          {base}
          <sub className="text-[0.72em] leading-none">{sub}</sub>
        </span>
      );
    }

    const supMatch = part.match(/^([A-Za-z0-9)]+)\^(?:\{([^}]+)\}|([A-Za-z0-9+\-]+))$/);
    if (supMatch) {
      const base = supMatch[1];
      const sup = supMatch[2] || supMatch[3];
      return (
        <span key={i}>
          {base}
          <sup className="text-[0.72em] leading-none">{sup}</sup>
        </span>
      );
    }

    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
