import type { StructuredSummary, SummaryLevel } from '../types/brainstine';

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
    if (!current) {
      if (word.length > maxChars) {
        for (let i = 0; i < word.length; i += maxChars) {
          lines.push(word.slice(i, i + maxChars));
        }
      } else {
        current = word;
      }
    } else if (current.length + 1 + word.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
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

export function exportSummaryToPdf(summary: StructuredSummary): void {
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
    `Brainstine Study Summary | Subject: ${summary.subjectArea} | Format: ${LEVEL_LABELS[summary.summaryLevel]}`
  );

  pushHeading('Topic Overview');
  pushBody(summary.topicOverview);

  if (summary.mainConcepts.length > 0) {
    pushHeading('Main Concepts & Points');
    summary.mainConcepts.forEach((c, idx) => {
      pushSubheading(`${idx + 1}. ${c.heading}`);
      for (const pt of c.sourcePoints) {
        pushBody(`* [From Source] ${pt}`, true);
      }
      if (c.aiClarification) {
        pushBody(`* [AI Clarification] ${c.aiClarification}`, true);
      }
    });
  }

  if (summary.importantDefinitions.length > 0) {
    pushHeading('Important Definitions');
    for (const d of summary.importantDefinitions) {
      const origin = d.origin === 'source' ? 'From Source' : 'AI Clarification';
      pushBody(`* ${d.term} (${origin}): ${d.definition}`, true);
    }
  }

  if (summary.keyTerminology.length > 0) {
    pushHeading('Key Terminology');
    pushBody(summary.keyTerminology.join(', '));
  }

  if (summary.difficultConceptExplanations.length > 0) {
    pushHeading('Explanations of Difficult Concepts');
    for (const item of summary.difficultConceptExplanations) {
      pushSubheading(item.concept);
      pushBody(`In source material: ${item.sourceContext}`, true);
      pushBody(`AI plain explanation: ${item.plainExplanation}`, true);
    }
  }

  if (summary.importantFacts.length > 0) {
    pushHeading('Important Facts (From Source)');
    for (const fact of summary.importantFacts) {
      pushBody(`* ${fact}`, true);
    }
  }

  if (summary.relevantExamples.length > 0) {
    pushHeading('Relevant Examples');
    for (const ex of summary.relevantExamples) {
      const tag = ex.origin === 'source' ? 'From Source' : 'AI Elaboration';
      pushBody(`* ${ex.title} (${tag}): ${ex.example}`, true);
    }
  }

  if (summary.formulasOrFrameworks.length > 0) {
    pushHeading('Formulas & Frameworks');
    for (const f of summary.formulasOrFrameworks) {
      pushBody(`* ${f.name}: ${f.expressionOrStructure} - ${f.usage}`, true);
    }
  }

  if (summary.revisionNotes.length > 0) {
    pushHeading('Revision Notes');
    for (const note of summary.revisionNotes) {
      pushBody(`* ${note}`, true);
    }
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
    const pageNum = pagesContent.length + 1;
    currentOps.push(
      `BT /F1 8 Tf 50 32 Td (Brainstine - Your Personal AI-Powered Academic Companion | Page ${pageNum}) Tj ET`
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
  URL.revokeObjectURL(url);
}
