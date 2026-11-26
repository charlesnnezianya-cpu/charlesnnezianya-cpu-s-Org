import type { StructuredSummary, SummaryLevel } from '../types/brainstine';
import { sanitizeStructuredSummary } from './summarySanitizer';

const LEVEL_LABELS: Record<SummaryLevel, string> = {
  short: 'Short Summary',
  detailed: 'Detailed Summary',
  comprehensive: 'Comprehensive Study Notes',
};

function sanitizeAscii(text: string): string {
  return text
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
  font: 'F1' | 'F2'; // F1 = Helvetica, F2 = Helvetica-Bold
  size: number;
  spacingAfter: number;
}

export function exportSummaryToPdf(rawSummary: StructuredSummary): void {
  const summary = sanitizeStructuredSummary(rawSummary);
  const lines: PdfLine[] = [];

  const pushHeading = (text: string, size = 13) => {
    lines.push({ text: '', font: 'F2', size: 8, spacingAfter: 6 });
    for (const wrapped of wrapText(text, 72)) {
      lines.push({ text: wrapped, font: 'F2', size, spacingAfter: 4 });
    }
  };

  const pushSubheading = (text: string) => {
    lines.push({ text: '', font: 'F2', size: 6, spacingAfter: 3 });
    for (const wrapped of wrapText(text, 78)) {
      lines.push({ text: wrapped, font: 'F2', size: 11, spacingAfter: 3 });
    }
  };

  const pushBody = (text: string, indent = false) => {
    const maxChars = indent ? 82 : 88;
    const prefix = indent ? '  ' : '';
    for (const wrapped of wrapText(text, maxChars)) {
      lines.push({ text: `${prefix}${wrapped}`, font: 'F1', size: 10, spacingAfter: 4 });
    }
  };

  // Document Header
  for (const wrapped of wrapText(summary.title, 54)) {
    lines.push({ text: wrapped, font: 'F2', size: 17, spacingAfter: 5 });
  }
  pushBody(
    `Brainstine Study Notes | Subject: ${summary.subjectArea} | Format: ${LEVEL_LABELS[summary.summaryLevel]}`
  );

  pushHeading('Topic Overview');
  pushBody(summary.topicOverview);

  if (summary.mainConcepts.length > 0) {
    pushHeading('Main Concepts');
    summary.mainConcepts.forEach((c, idx) => {
      pushSubheading(`${idx + 1}. ${c.heading}`);
      for (const pt of c.sourcePoints) {
        pushBody(`* ${pt}`, true);
      }
      if (c.subsections && c.subsections.length > 0) {
        for (const sub of c.subsections) {
          pushBody(`${sub.heading}:`, true);
          for (const sp of sub.points) {
            pushBody(`  * ${sp}`, true);
          }
        }
      }
      if (c.examples && c.examples.length > 0) {
        for (const ex of c.examples) {
          pushBody(`  Example: ${ex}`, true);
        }
      }
    });
  }

  if (summary.importantDefinitions.length > 0) {
    pushHeading('Definitions');
    for (const d of summary.importantDefinitions) {
      pushBody(`* ${d.term} - ${d.definition}`, true);
    }
  }

  if (summary.classificationsAndTypes && summary.classificationsAndTypes.length > 0) {
    pushHeading('Classifications and Types');
    for (const cls of summary.classificationsAndTypes) {
      pushSubheading(cls.topic);
      pushBody(cls.overviewStatement);
      cls.types.forEach((t, idx) => {
        pushBody(`${idx + 1}. ${t.name}: ${t.explanation}`, true);
        if (t.characteristics) {
          for (const ch of t.characteristics) {
            pushBody(`  * Characteristic: ${ch}`, true);
          }
        }
        if (t.examples) {
          for (const ex of t.examples) {
            pushBody(`  * Example: ${ex}`, true);
          }
        }
      });
      if (cls.comparisonNote) {
        pushBody(`Comparison: ${cls.comparisonNote}`, true);
      }
    }
  }

  if (summary.characteristicsAndExplanations && summary.characteristicsAndExplanations.length > 0) {
    pushHeading('Characteristics and Explanations');
    for (const grp of summary.characteristicsAndExplanations) {
      if (summary.characteristicsAndExplanations.length > 1) {
        pushSubheading(grp.topic);
      }
      for (const pt of grp.points) {
        pushBody(`* ${pt}`, true);
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
        pushBody(`${idx + 1}. ${step}`, true);
      });
    }
  }

  if (summary.formulasOrFrameworks.length > 0) {
    pushHeading('Formulas & Equations');
    for (const f of summary.formulasOrFrameworks) {
      pushBody(`* ${f.name}: ${f.expressionOrStructure} - ${f.usage}`, true);
      if (f.variables && f.variables.length > 0) {
        pushBody(`  Variables: ${f.variables.map((v) => `${v.symbol} = ${v.meaning}`).join('; ')}`, true);
      }
    }
  }

  if (summary.importantFacts.length > 0) {
    pushHeading('Additional Key Details');
    for (const fact of summary.importantFacts) {
      pushBody(`* ${fact}`, true);
    }
  }

  if (summary.relevantExamples.length > 0) {
    pushHeading('Examples');
    for (const ex of summary.relevantExamples) {
      pushBody(`* ${ex.title}: ${ex.example}`, true);
    }
  }

  if (summary.comparisonTables && summary.comparisonTables.length > 0) {
    pushHeading('Comparisons');
    for (const table of summary.comparisonTables) {
      pushSubheading(table.title);
      pushBody(`Columns: ${table.headers.join(' | ')}`, true);
      for (const row of table.rows) {
        pushBody(`* ${row.criterion}: ${row.values.join(' | ')}`, true);
      }
    }
  }

  if (summary.importantDistinctions && summary.importantDistinctions.length > 0) {
    pushHeading('Key Distinctions');
    for (const d of summary.importantDistinctions) {
      pushBody(`* ${d.pairTitle}: ${d.comparison}`, true);
    }
  }

  if (summary.keyTerminology.length > 0) {
    pushHeading('Key Terminology');
    pushBody(summary.keyTerminology.join(', '));
  }

  if (summary.visualDiagrams && summary.visualDiagrams.length > 0) {
    pushHeading('Visual Diagram Summaries');
    for (const diag of summary.visualDiagrams) {
      pushSubheading(diag.title);
      if (diag.caption) {
        pushBody(diag.caption, true);
      }
      if (diag.nodes && diag.nodes.length > 0) {
        pushBody(
          `Components: ${diag.nodes.map((n) => (n.sublabel ? `${n.label} (${n.sublabel})` : n.label)).join(' -> ')}`,
          true
        );
      }
    }
  }

  if (summary.revisionNotes.length > 0) {
    pushHeading('Cause & Formula Checks');
    for (const note of summary.revisionNotes) {
      pushBody(`* ${note}`, true);
    }
  }

  if (summary.finalRecap && summary.finalRecap.length > 0) {
    pushHeading('Final Recap');
    summary.finalRecap.forEach((r, idx) => {
      pushBody(`${idx + 1}. ${r}`, true);
    });
  }

  if (summary.keyTakeaways.length > 0) {
    pushHeading('Key Takeaways');
    for (const t of summary.keyTakeaways) {
      pushBody(`* ${t}`, true);
    }
  }

  // Paginate onto US Letter (612 x 792 pt)
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 50;
  const topY = 740;
  const bottomY = 55;

  const pagesContent: string[] = [];
  let currentOps: string[] = [];
  let y = topY;

  const flushPage = () => {
    currentOps.push(
      `BT /F1 8 Tf 50 32 Td (Brainstine Study Notes) Tj ET`
    );
    pagesContent.push(currentOps.join('\n'));
    currentOps = [];
    y = topY;
  };

  for (const line of lines) {
    const step = line.size + line.spacingAfter;
    if (y - step < bottomY) {
      flushPage();
    }
    if (line.text) {
      currentOps.push(
        `BT /${line.font} ${line.size} Tf ${marginX} ${y} Td (${escapePdfText(line.text)}) Tj ET`
      );
    }
    y -= step;
  }

  if (currentOps.length > 0 || pagesContent.length === 0) {
    flushPage();
  }

  // Build valid PDF 1.4 object table
  const objects: string[] = [];
  // 1: Catalog, 2: Pages, 3: F1 Helvetica, 4: F2 Helvetica-Bold
  const pageObjNums: number[] = [];
  let nextObj = 5;

  for (let i = 0; i < pagesContent.length; i++) {
    const pageObj = nextObj++;
    const contentObj = nextObj++;
    pageObjNums.push(pageObj);

    const stream = pagesContent[i];
    objects[pageObj] = `${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj`;
    objects[contentObj] = `${contentObj} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`;
  }

  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`;
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>\nendobj`;
  objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`;
  objects[4] = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${objects[i]}\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = summary.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  anchor.href = url;
  anchor.download = `${safeName || 'brainstine-summary'}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
