import type { StructuredSummary } from '../types/brainstine';

const SOURCE_FILE_EXTENSIONS_RE =
  /\.(?:pdf|docx?|txt|md|markdown|png|jpe?g|webp|gif|heic|heif|mp3|wav|m4a|webm|ogg|aac|flac)\b/gi;

/**
 * Turns raw filenames, storage paths, or URLs into clean academic titles
 * while keeping legitimate lecture/chapter numbers intact.
 */
export function stripSourceFilenameFromTitle(rawTitle: string): string {
  const input = (rawTitle || '').trim();
  if (!input) return 'Document Summary';

  let clean = input
    // Strip URLs or embedded storage paths
    .replace(/https?:\/\/[^\s)>\]]+/gi, ' ')
    .replace(/(?:study-materials|storage\/v1\/object)\/[^\s)>\]]+/gi, ' ')
    // Strip Windows / Unix directory prefixes if a file path was passed
    .replace(/(?:[A-Za-z]:\\|\/(?:tmp|var|home|Users|uploads)\/)[^\s]*[\\/]/g, '')
    // Strip leading metadata labels
    .replace(/^(?:source(?:\s+document)?|document(?:\s+source)?|uploaded\s+file|file)\s*:\s*/i, '')
    // Strip trailing or inline file extensions (.pdf, .docx, etc.)
    .replace(SOURCE_FILE_EXTENSIONS_RE, '')
    // Strip trailing page tags in titles
    .replace(/\s*[\[(]Pages?\s+\d+(?:\s*[-–,]\s*\d+)*[\])]/gi, '')
    .trim();

  // Convert filename-style underscores to spaces when not a code symbol
  if (clean.includes('_') && !/[{}()=]/.test(clean)) {
    clean = clean.replace(/_+/g, ' ');
  }

  // Convert pure kebab-case slug titles (e.g. cellular-respiration-notes)
  if (!clean.includes(' ') && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/.test(clean)) {
    clean = clean.replace(/-/g, ' ');
  }

  clean = clean
    .replace(/^[\s\-–—:|/]+|[\s\-–—:|/]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return clean || 'Document Summary';
}

function cleanSingleLineSourceAndPageRefs(line: string): string {
  if (!line) return '';

  // Remove whole metadata lines such as "Source: lecture.pdf" or "References: Page 1-4"
  if (
    /^\s*(?:>{0,2}\s*)?(?:\*\*)?(?:sources?|references?|document\s+source|source\s+document|uploaded\s+file|file\s+location|storage\s+path|pdf\s+source)(?:\*\*)?\s*:/i.test(
      line
    )
  ) {
    return '';
  }

  // Remove standalone PDF page boundary markers like "[Page 2]" or "--- Page 3 ---"
  if (/^\s*(?:[-=]{2,}\s*)?[\[(]?\s*pages?\s+\d+\s*[\])]?(?:\s*[-=]{2,})?\s*$/i.test(line)) {
    return '';
  }

  let out = line
    // Remove raw URLs and Supabase/storage object paths
    .replace(/https?:\/\/[^\s)>\]]+/gi, '')
    .replace(/(?:study-materials|storage\/v1\/object)\/[^\s)>\]]+/gi, '')
    // Remove parenthetical or bracketed page citations: (Page 1), (Pages 1-3), (p. 4), (pp. 4-7), [Page 2]
    .replace(
      /\s*[\[(]\s*(?:pages?|pp?\.?)\s*\d+(?:\s*(?:[-–,]|\band\b)\s*\d+)*\s*[\])]/gi,
      ''
    )
    // Remove parenthetical or bracketed source citations: (Source: ...), [Document: ...], (File: ...)
    .replace(
      /\s*[\[(]\s*(?:source|document(?:\s+source)?|file|ref(?:erence)?|pdf)\s*:\s*[^\]\)]+[\])]/gi,
      ''
    )
    // Remove parenthetical filenames like (biology_notes.pdf)
    .replace(
      /\s*[\[(]\s*[^\]\)]*\.(?:pdf|docx?|txt|md|png|jpe?g|webp|mp3|wav|m4a)\s*[\])]/gi,
      ''
    )
    // Remove clause-leading PDF/source/page lead-ins
    .replace(
      /\bAccording to (?:the )?(?:uploaded |provided |attached |given |source )?(?:PDF|document|file|material|text),?\s*/gi,
      ''
    )
    .replace(
      /\bAs (?:stated|noted|shown|explained|mentioned|described|outlined|indicated) (?:on|in) (?:the )?(?:uploaded |provided |attached |source )?(?:PDF|document|file|pages?\s+\d+(?:\s*[-–,to]+\s*\d+)?),?\s*/gi,
      ''
    )
    .replace(
      /\b(?:See|Refer to|Check)\s+(?:page|pages|p\.|pp\.)\s+\d+(?:\s*[-–]\s*\d+)?(?:\s+for\s+(?:more\s+)?details?)?\.?/gi,
      ''
    )
    // Remove inline page position references like "on page 5" / "from pages 2-4"
    .replace(
      /(?:,\s*)?\b(?:on|from|in|at)\s+(?:page|pages)\s+\d+(?:\s*(?:[-–,]|and)\s*\d+)*(?=\s*(?:[,.;:!?\)]|$))/gi,
      ''
    )
    // Remove leading "Page 5:" or "Pages 2–4:"
    .replace(/\bPages?\s+\d+(?:\s*[-–]\s*\d+)?\s*:\s*/gi, '')
    // Remove explicit "in/from the uploaded PDF/document" phrases
    .replace(
      /(?:,\s*)?\b(?:in|from)\s+the\s+uploaded\s+(?:PDF|document|file|text|material)\b/gi,
      ''
    )
    // Remove remaining inline filenames with extensions (e.g. chapter_02.pdf)
    .replace(
      /\b[A-Za-z0-9._-]+\.(?:pdf|docx?|txt|md|png|jpe?g|webp|heic|mp3|wav|m4a)\b/gi,
      ''
    )
    // Replace remaining phrasing mentioning "the source document" naturally
    .replace(/\bthe source document\b/gi, 'the material')
    .replace(/\buploaded document\b/gi, 'material')
    .replace(/\buploaded text\b/gi, 'material')
    // Clean orphaned punctuation / spacing left after removal
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])\s*([,.;:!?])/g, '$2')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Strip stray leading punctuation if a leading phrase like "According to the uploaded PDF, " was removed
  out = out.replace(/^[,;:]+\s*/, '');

  // Capitalize first alphabetic character of a plain prose line when stripped lead-in left lowercase
  if (/^[a-z]/.test(out) && !/^[a-z]\)/.test(out)) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }

  return out;
}

/**
 * Strips PDF filenames, source labels, raw PDF/storage URLs, and PDF page citations
 * while preserving markdown formatting and all legitimate academic numbering.
 */
export function stripSummarySourceAndPageRefs(text: string): string {
  if (!text) return '';

  const normalizedLines = text.replace(/\r\n/g, '\n').split('\n');
  const cleanedLines: string[] = [];

  for (const rawLine of normalizedLines) {
    if (!rawLine.trim()) {
      // Preserve single blank lines between markdown blocks
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }

    // Preserve markdown list / heading / blockquote indentation prefixes cleanly
    const prefixMatch = rawLine.match(/^(\s*(?:[-*+]|\d+\.|#{1,6}|>)\s+)(.*)$/);
    if (prefixMatch) {
      const cleanedBody = cleanSingleLineSourceAndPageRefs(prefixMatch[2]);
      if (cleanedBody) {
        cleanedLines.push(`${prefixMatch[1]}${cleanedBody}`);
      }
      continue;
    }

    const cleanedLine = cleanSingleLineSourceAndPageRefs(rawLine);
    if (cleanedLine) {
      cleanedLines.push(cleanedLine);
    }
  }

  while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] === '') {
    cleanedLines.pop();
  }

  return cleanedLines.join('\n').trim();
}

/**
 * Defensively scrubs all text fields in a StructuredSummary so neither new nor
 * previously saved summaries can display PDF filenames, URLs, source labels, or page numbers.
 */
export function sanitizeStructuredSummary(summary: StructuredSummary): StructuredSummary {
  const cleanStr = (s?: string) => (s ? stripSummarySourceAndPageRefs(s) : '');

  const sanitizedMainConcepts = (summary.mainConcepts || [])
    .map((c) => ({
      ...c,
      heading: cleanStr(c.heading),
      sourcePoints: (c.sourcePoints || []).map(cleanStr).filter(Boolean),
      aiClarification: cleanStr(c.aiClarification),
      ...(c.subsections
        ? {
            subsections: c.subsections
              .map((sub) => ({
                heading: cleanStr(sub.heading),
                points: (sub.points || []).map(cleanStr).filter(Boolean),
              }))
              .filter((sub) => sub.heading && sub.points.length > 0),
          }
        : {}),
      ...(c.examples
        ? {
            examples: c.examples.map(cleanStr).filter(Boolean),
          }
        : {}),
    }))
    .filter((c) => c.heading);

  const sanitizedClassifications = summary.classificationsAndTypes?.map((cls) => ({
    topic: cleanStr(cls.topic),
    overviewStatement: cleanStr(cls.overviewStatement),
    types: (cls.types || []).map((t) => ({
      name: cleanStr(t.name),
      explanation: cleanStr(t.explanation),
      ...(t.characteristics
        ? { characteristics: t.characteristics.map(cleanStr).filter(Boolean) }
        : {}),
      ...(t.examples ? { examples: t.examples.map(cleanStr).filter(Boolean) } : {}),
    })),
    ...(cls.comparisonNote ? { comparisonNote: cleanStr(cls.comparisonNote) } : {}),
  }));

  return {
    ...summary,
    title: stripSourceFilenameFromTitle(summary.title),
    subjectArea: cleanStr(summary.subjectArea) || 'General Studies',
    topicOverview: cleanStr(summary.topicOverview),
    ...(summary.sourceNotice ? { sourceNotice: cleanStr(summary.sourceNotice) } : {}),
    mainConcepts: sanitizedMainConcepts,
    importantDefinitions: (summary.importantDefinitions || [])
      .map((d) => ({
        ...d,
        term: cleanStr(d.term),
        definition: cleanStr(d.definition),
      }))
      .filter((d) => d.term && d.definition),
    ...(sanitizedClassifications ? { classificationsAndTypes: sanitizedClassifications } : {}),
    ...(summary.characteristicsAndExplanations
      ? {
          characteristicsAndExplanations: summary.characteristicsAndExplanations.map((grp) => ({
            topic: cleanStr(grp.topic),
            points: (grp.points || []).map(cleanStr).filter(Boolean),
          })),
        }
      : {}),
    keyTerminology: (summary.keyTerminology || []).map(cleanStr).filter(Boolean),
    difficultConceptExplanations: (summary.difficultConceptExplanations || []).map((item) => ({
      ...item,
      concept: cleanStr(item.concept),
      sourceContext: cleanStr(item.sourceContext),
      plainExplanation: cleanStr(item.plainExplanation),
    })),
    importantFacts: (summary.importantFacts || []).map(cleanStr).filter(Boolean),
    relevantExamples: (summary.relevantExamples || []).map((ex) => ({
      ...ex,
      title: cleanStr(ex.title),
      example: cleanStr(ex.example),
    })),
    formulasOrFrameworks: (summary.formulasOrFrameworks || []).map((f) => ({
      ...f,
      name: cleanStr(f.name),
      expressionOrStructure: cleanStr(f.expressionOrStructure),
      usage: cleanStr(f.usage),
      ...(f.variables
        ? {
            variables: f.variables.map((v) => ({
              symbol: cleanStr(v.symbol),
              meaning: cleanStr(v.meaning),
            })),
          }
        : {}),
    })),
    ...(summary.processesAndMechanisms
      ? {
          processesAndMechanisms: summary.processesAndMechanisms.map((p) => ({
            heading: cleanStr(p.heading),
            steps: (p.steps || []).map(cleanStr).filter(Boolean),
          })),
        }
      : {}),
    ...(summary.importantDistinctions
      ? {
          importantDistinctions: summary.importantDistinctions.map((d) => ({
            pairTitle: cleanStr(d.pairTitle),
            comparison: cleanStr(d.comparison),
          })),
        }
      : {}),
    ...(summary.comparisonTables
      ? {
          comparisonTables: summary.comparisonTables.map((t) => ({
            title: cleanStr(t.title),
            headers: (t.headers || []).map(cleanStr),
            rows: (t.rows || []).map((r) => ({
              criterion: cleanStr(r.criterion),
              values: (r.values || []).map(cleanStr),
            })),
          })),
        }
      : {}),
    revisionNotes: (summary.revisionNotes || []).map(cleanStr).filter(Boolean),
    ...(summary.finalRecap
      ? { finalRecap: summary.finalRecap.map(cleanStr).filter(Boolean) }
      : {}),
    keyTakeaways: (summary.keyTakeaways || []).map(cleanStr).filter(Boolean),
    markdown: stripSummarySourceAndPageRefs(summary.markdown || '').replace(
      /\*\*Source Length:\*\*/g,
      '**Length:**'
    ),
  };
}
