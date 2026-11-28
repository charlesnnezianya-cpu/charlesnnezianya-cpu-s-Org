import type { StructuredSummary, SummaryLevel } from '../types/brainstine';
import { sanitizeStructuredSummary } from './summarySanitizer.ts';

const LEVEL_LABELS: Record<SummaryLevel, string> = {
  short: 'Simple Summary',
  detailed: 'Detailed Summary',
  comprehensive: 'Comprehensive Summary',
};

function sanitizeAscii(text: string): string {
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u2026/g, '...')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00F7/g, '/')
    .replace(/\u00B1/g, '+/-')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2260/g, '!=')
    .replace(/\u2248/g, '~=')
    .replace(/\u2261/g, '===')
    .replace(/\u221D/g, '~')
    .replace(/\u221E/g, 'infinity')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2194/g, '<->')
    .replace(/\u21CC/g, '<=>')
    .replace(/\u21D2/g, '=>')
    .replace(/\u00B0/g, ' deg')
    .replace(/\u00B2/g, '^2')
    .replace(/\u00B3/g, '^3')
    .replace(/\u221A/g, 'sqrt')
    .replace(/\u222B/g, 'integral ')
    .replace(/\u2211/g, 'sum ')
    .replace(/\u2202/g, 'd')
    .replace(/\u2207/g, 'nabla ')
    .replace(/\u03B1/g, 'alpha')
    .replace(/\u03B2/g, 'beta')
    .replace(/\u03B3/g, 'gamma')
    .replace(/\u03B4/g, 'delta')
    .replace(/\u0394/g, 'Delta')
    .replace(/\u03B5/g, 'epsilon')
    .replace(/\u03B8/g, 'theta')
    .replace(/\u03BB/g, 'lambda')
    .replace(/[\u03BC\u00B5]/g, 'mu')
    .replace(/\u03C0/g, 'pi')
    .replace(/\u03C1/g, 'rho')
    .replace(/\u03C3/g, 'sigma')
    .replace(/\u03A3/g, 'Sigma')
    .replace(/\u03C4/g, 'tau')
    .replace(/\u03C6/g, 'phi')
    .replace(/\u03C9/g, 'omega')
    .replace(/\u03A9/g, 'Omega')
    .replace(/\u2080/g, '0')
    .replace(/\u2081/g, '1')
    .replace(/\u2082/g, '2')
    .replace(/\u2083/g, '3')
    .replace(/\u2084/g, '4')
    .replace(/\u2085/g, '5')
    .replace(/\u2086/g, '6')
    .replace(/\u2087/g, '7')
    .replace(/\u2088/g, '8')
    .replace(/\u2089/g, '9')
    .replace(/\u208A/g, '+')
    .replace(/\u208B/g, '-')
    .replace(/\u2070/g, '^0')
    .replace(/\u00B9/g, '^1')
    .replace(/\u2074/g, '^4')
    .replace(/\u2075/g, '^5')
    .replace(/\u2076/g, '^6')
    .replace(/\u2077/g, '^7')
    .replace(/\u2078/g, '^8')
    .replace(/\u2079/g, '^9')
    .replace(/\u207A/g, '^+')
    .replace(/\u207B/g, '^-')
    .replace(/\u207F/g, '^n')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfText(text: string): string {
  return sanitizeAscii(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const clean = sanitizeAscii(text);
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current && current.length + 1 + word.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      if (current) {
        lines.push(current);
        current = '';
      }
      if (word.length > maxChars) {
        for (let i = 0; i < word.length; i += maxChars) {
          const chunk = word.slice(i, i + maxChars);
          if (i + maxChars < word.length) {
            lines.push(chunk);
          } else {
            current = chunk;
          }
        }
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface PdfLine {
  text: string;
  font: 'F1' | 'F2' | 'F3'; // F1 = Helvetica, F2 = Helvetica-Bold, F3 = Helvetica-Oblique
  size: number;
  spacingAfter: number;
  indentPt?: number;
  ruleAbove?: boolean;
  ruleBelow?: boolean;
  colorRgb?: [number, number, number];
  keepWithNext?: boolean;
}

/**
 * Generates an academic, multi-page PDF byte buffer directly from any StructuredSummary.
 * Zero external paid APIs or network calls required; works offline on desktop and mobile.
 */
export function buildSummaryPdfBytes(rawSummary: StructuredSummary): Uint8Array {
  const summary = sanitizeStructuredSummary(rawSummary);
  const lines: PdfLine[] = [];

  const pushSpacer = (pt = 4) => {
    lines.push({ text: '', font: 'F1', size: pt, spacingAfter: 2 });
  };

  const pushHeading = (text: string, size = 13) => {
    if (lines.length > 0) {
      pushSpacer(6);
    }
    const wrapped = wrapText(text, 72);
    wrapped.forEach((line, idx) => {
      lines.push({
        text: line,
        font: 'F2',
        size,
        spacingAfter: idx === wrapped.length - 1 ? 5 : 3,
        ruleAbove: idx === 0,
        colorRgb: [0.06, 0.12, 0.24],
        keepWithNext: true,
      });
    });
  };

  const pushSubheading = (text: string) => {
    pushSpacer(3);
    const wrapped = wrapText(text, 76);
    wrapped.forEach((line, idx) => {
      lines.push({
        text: line,
        font: 'F2',
        size: 11,
        spacingAfter: idx === wrapped.length - 1 ? 4 : 2,
        colorRgb: [0.11, 0.31, 0.85],
        keepWithNext: true,
      });
    });
  };

  const pushBody = (
    text: string,
    options: { indentPt?: number; font?: 'F1' | 'F2' | 'F3'; size?: number; spacingAfter?: number; colorRgb?: [number, number, number] } = {}
  ) => {
    const indentPt = options.indentPt ?? 0;
    const maxChars = indentPt >= 24 ? 76 : indentPt >= 12 ? 82 : 88;
    const wrapped = wrapText(text, maxChars);
    wrapped.forEach((line, idx) => {
      lines.push({
        text: line,
        font: options.font ?? 'F1',
        size: options.size ?? 10,
        spacingAfter: idx === wrapped.length - 1 ? (options.spacingAfter ?? 4.5) : 3.5,
        indentPt,
        colorRgb: options.colorRgb ?? [0.1, 0.14, 0.2],
      });
    });
  };

  // Document Title & Academic Header
  const titleLines = wrapText(summary.title || 'Study Summary', 50);
  titleLines.forEach((line, idx) => {
    lines.push({
      text: line,
      font: 'F2',
      size: 17,
      spacingAfter: idx === titleLines.length - 1 ? 4 : 3,
      colorRgb: [0.06, 0.12, 0.24],
    });
  });

  lines.push({
    text: sanitizeAscii(
      `Brainstine Study Notes  |  ${summary.subjectArea}  |  ${LEVEL_LABELS[summary.summaryLevel]}  |  ${summary.wordCount.toLocaleString()} words`
    ),
    font: 'F3',
    size: 9.5,
    spacingAfter: 7,
    ruleBelow: true,
    colorRgb: [0.35, 0.42, 0.52],
  });

  if (summary.sourceNotice) {
    pushBody(`Note: ${summary.sourceNotice}`, {
      font: 'F3',
      size: 9.5,
      colorRgb: [0.32, 0.38, 0.46],
    });
  }

  if (summary.topicOverview) {
    pushHeading('Topic Overview');
    pushBody(summary.topicOverview);
  }

  if (summary.mainConcepts.length > 0) {
    pushHeading('Main Concepts');
    summary.mainConcepts.forEach((c, idx) => {
      pushSubheading(`${idx + 1}. ${c.heading}`);
      for (const pt of c.sourcePoints) {
        pushBody(`* ${pt}`, { indentPt: 12 });
      }
      if (c.subsections && c.subsections.length > 0) {
        for (const sub of c.subsections) {
          pushBody(`${sub.heading}:`, { indentPt: 12, font: 'F2', size: 10, spacingAfter: 2 });
          for (const sp of sub.points) {
            pushBody(`- ${sp}`, { indentPt: 24 });
          }
        }
      }
      if (c.examples && c.examples.length > 0) {
        for (const ex of c.examples) {
          pushBody(`Example: ${ex}`, { indentPt: 18, font: 'F3' });
        }
      }
    });
  }

  if (summary.importantDefinitions.length > 0) {
    pushHeading('Definitions');
    for (const d of summary.importantDefinitions) {
      pushBody(`* ${d.term}: ${d.definition}`, { indentPt: 10 });
    }
  }

  if (summary.classificationsAndTypes && summary.classificationsAndTypes.length > 0) {
    pushHeading('Classifications & Types');
    for (const cls of summary.classificationsAndTypes) {
      pushSubheading(cls.topic);
      if (cls.overviewStatement) {
        pushBody(cls.overviewStatement);
      }
      cls.types.forEach((t, idx) => {
        pushBody(`${idx + 1}. ${t.name}: ${t.explanation}`, { indentPt: 12 });
        if (t.characteristics) {
          for (const ch of t.characteristics) {
            pushBody(`- Characteristic: ${ch}`, { indentPt: 24 });
          }
        }
        if (t.examples) {
          for (const ex of t.examples) {
            pushBody(`- Example: ${ex}`, { indentPt: 24, font: 'F3' });
          }
        }
      });
      if (cls.comparisonNote) {
        pushBody(`Comparison Note: ${cls.comparisonNote}`, { indentPt: 12, font: 'F3' });
      }
    }
  }

  if (summary.characteristicsAndExplanations && summary.characteristicsAndExplanations.length > 0) {
    pushHeading('Characteristics & Explanations');
    for (const grp of summary.characteristicsAndExplanations) {
      if (summary.characteristicsAndExplanations.length > 1) {
        pushSubheading(grp.topic);
      }
      for (const pt of grp.points) {
        pushBody(`* ${pt}`, { indentPt: 12 });
      }
    }
  }

  if (summary.processesAndMechanisms && summary.processesAndMechanisms.length > 0) {
    pushHeading('Processes & Mechanisms');
    for (const proc of summary.processesAndMechanisms) {
      if (summary.processesAndMechanisms.length > 1) {
        pushSubheading(proc.heading);
      }
      proc.steps.forEach((step, idx) => {
        pushBody(`${idx + 1}. ${step}`, { indentPt: 12 });
      });
    }
  }

  if (summary.formulasOrFrameworks.length > 0) {
    pushHeading('Formulas & Equations');
    for (const f of summary.formulasOrFrameworks) {
      pushBody(`* ${f.name}: ${f.expressionOrStructure}`, { indentPt: 10, font: 'F2', spacingAfter: 2 });
      if (f.usage) {
        pushBody(`Usage: ${f.usage}`, { indentPt: 22 });
      }
      if (f.variables && f.variables.length > 0) {
        pushBody(
          `Variables: ${f.variables.map((v) => `${v.symbol} = ${v.meaning}`).join('; ')}`,
          { indentPt: 22, font: 'F3' }
        );
      }
    }
  }

  if (summary.importantFacts.length > 0) {
    pushHeading('Additional Key Details');
    for (const fact of summary.importantFacts) {
      pushBody(`* ${fact}`, { indentPt: 10 });
    }
  }

  if (summary.relevantExamples.length > 0) {
    pushHeading('Examples');
    for (const ex of summary.relevantExamples) {
      pushBody(`* ${ex.title}: ${ex.example}`, { indentPt: 10 });
    }
  }

  if (summary.comparisonTables && summary.comparisonTables.length > 0) {
    pushHeading('Comparisons');
    for (const table of summary.comparisonTables) {
      pushSubheading(table.title);
      if (table.headers.length > 0) {
        pushBody(`| ${table.headers.join(' | ')} |`, {
          indentPt: 8,
          font: 'F2',
          size: 9.5,
          spacingAfter: 3,
        });
      }
      for (const row of table.rows) {
        pushBody(`- ${row.criterion}: ${row.values.join(' | ')}`, { indentPt: 14, size: 9.5 });
      }
    }
  }

  if (summary.importantDistinctions && summary.importantDistinctions.length > 0) {
    pushHeading('Key Distinctions');
    for (const d of summary.importantDistinctions) {
      pushBody(`* ${d.pairTitle}: ${d.comparison}`, { indentPt: 10 });
    }
  }

  if (summary.visualDiagrams && summary.visualDiagrams.length > 0) {
    pushHeading('Visual Diagram Summaries');
    for (const diag of summary.visualDiagrams) {
      pushSubheading(diag.title);
      if (diag.caption) {
        pushBody(diag.caption, { indentPt: 10, font: 'F3' });
      }
      if (diag.nodes && diag.nodes.length > 0) {
        pushBody(
          `Components: ${diag.nodes.map((n) => (n.sublabel ? `${n.label} (${n.sublabel})` : n.label)).join(' -> ')}`,
          { indentPt: 12 }
        );
      }
    }
  }

  if (summary.difficultConceptExplanations && summary.difficultConceptExplanations.length > 0) {
    pushHeading('Concept Clarifications');
    for (const dc of summary.difficultConceptExplanations) {
      pushSubheading(dc.concept);
      pushBody(dc.plainExplanation, { indentPt: 10 });
      if (dc.sourceContext) {
        pushBody(`Context: ${dc.sourceContext}`, { indentPt: 12, font: 'F3', size: 9.5 });
      }
    }
  }

  if (summary.keyTerminology.length > 0) {
    pushHeading('Key Terminology');
    pushBody(summary.keyTerminology.join(', '));
  }

  if (summary.revisionNotes.length > 0) {
    pushHeading('Cause & Formula Checks');
    summary.revisionNotes.forEach((note, idx) => {
      pushBody(`${idx + 1}. ${note}`, { indentPt: 10 });
    });
  }

  if (summary.finalRecap && summary.finalRecap.length > 0) {
    pushHeading('Final Recap');
    summary.finalRecap.forEach((r, idx) => {
      pushBody(`${idx + 1}. ${r}`, { indentPt: 10 });
    });
  }

  if (summary.keyTakeaways.length > 0) {
    pushHeading('Key Takeaways');
    summary.keyTakeaways.forEach((t, idx) => {
      pushBody(`${idx + 1}. ${t}`, { indentPt: 10 });
    });
  }

  // Paginate onto US Letter (612 x 792 pt)
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 50;
  const rightEdge = pageWidth - marginX;
  const topY = 742;
  const bottomY = 58;

  const rawPageOps: string[][] = [];
  let currentOps: string[] = [];
  let y = topY;

  const startNewPage = () => {
    rawPageOps.push(currentOps);
    currentOps = [];
    y = topY;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const step = line.size + line.spacingAfter;
    const nextLine = lines[i + 1];
    const requiredHeight =
      line.keepWithNext && nextLine
        ? step + nextLine.size + nextLine.spacingAfter
        : step;

    if (y - requiredHeight < bottomY && currentOps.length > 0) {
      startNewPage();
    }

    if (line.ruleAbove && y < topY - 4) {
      const ruleY = y + line.size + 4;
      currentOps.push(`0.84 0.87 0.92 RG 0.6 w ${marginX} ${ruleY.toFixed(1)} m ${rightEdge} ${ruleY.toFixed(1)} l S`);
    }

    if (line.text) {
      const x = marginX + (line.indentPt ?? 0);
      const rgb = line.colorRgb ?? [0.1, 0.14, 0.2];
      currentOps.push(
        `BT ${rgb[0]} ${rgb[1]} ${rgb[2]} rg /${line.font} ${line.size} Tf ${x} ${y.toFixed(1)} Td (${escapePdfText(line.text)}) Tj ET`
      );
    }

    if (line.ruleBelow) {
      const ruleY = y - 4;
      currentOps.push(`0.06 0.12 0.24 RG 1.0 w ${marginX} ${ruleY.toFixed(1)} m ${rightEdge} ${ruleY.toFixed(1)} l S`);
    }

    y -= step;
  }

  if (currentOps.length > 0 || rawPageOps.length === 0) {
    rawPageOps.push(currentOps);
  }

  const totalPages = rawPageOps.length;
  const pagesContent = rawPageOps.map((ops, pageIdx) => {
    const pageLabel = `Page ${pageIdx + 1} of ${totalPages}`;
    const pageLabelX = Math.max(marginX + 200, rightEdge - pageLabel.length * 4.5);
    const footerOps = [
      `0.84 0.87 0.92 RG 0.5 w ${marginX} 44 m ${rightEdge} 44 l S`,
      `BT 0.42 0.48 0.56 rg /F1 8.5 Tf ${marginX} 30 Td (Brainstine Study Notes) Tj ET`,
      `BT 0.42 0.48 0.56 rg /F1 8.5 Tf ${pageLabelX.toFixed(1)} 30 Td (${escapePdfText(pageLabel)}) Tj ET`,
    ];
    return [...ops, ...footerOps].join('\n');
  });

  // Build valid PDF 1.4 object table using exact UTF-8 byte offsets
  const encoder = new TextEncoder();
  const objects: string[] = [];
  // 1: Catalog, 2: Pages, 3: F1 Helvetica, 4: F2 Helvetica-Bold, 5: F3 Helvetica-Oblique
  const pageObjNums: number[] = [];
  let nextObj = 6;

  for (let i = 0; i < pagesContent.length; i++) {
    const pageObj = nextObj++;
    const contentObj = nextObj++;
    pageObjNums.push(pageObj);

    const stream = pagesContent[i];
    const streamByteLen = encoder.encode(stream).byteLength;
    objects[pageObj] = `${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj`;
    objects[contentObj] = `${contentObj} 0 obj\n<< /Length ${streamByteLen} >>\nstream\n${stream}\nendstream\nendobj`;
  }

  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`;
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>\nendobj`;
  objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`;
  objects[4] = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj`;
  objects[5] = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>\nendobj`;

  const chunks: Uint8Array[] = [];
  let byteCursor = 0;
  const appendPart = (text: string) => {
    const bytes = encoder.encode(text);
    chunks.push(bytes);
    byteCursor += bytes.byteLength;
  };

  appendPart('%PDF-1.4\n');
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = byteCursor;
    appendPart(`${objects[i]}\n`);
  }

  const xrefOffset = byteCursor;
  appendPart(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < objects.length; i++) {
    appendPart(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  appendPart(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const output = new Uint8Array(new ArrayBuffer(byteCursor));
  let writePos = 0;
  for (const chunk of chunks) {
    output.set(chunk, writePos);
    writePos += chunk.byteLength;
  }
  return output;
}

export function exportSummaryToPdf(rawSummary: StructuredSummary): void {
  const summary = sanitizeStructuredSummary(rawSummary);
  const pdfBytes = buildSummaryPdfBytes(summary);
  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = summary.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  anchor.href = url;
  anchor.download = `${safeName || 'brainstine-summary'}.pdf`;
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
  }, 250);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30000);
}
