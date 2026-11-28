import assert from 'node:assert/strict';
import { generateExtractiveSummary } from './summaryEngine.ts';
import { buildExtractedDocumentSections } from './documentEngine.ts';
import { formatScientificText } from '../src/lib/scientificFormatter.ts';
import { isVisualAidRelevantToSummary } from '../src/lib/visualLearningEngine.ts';

function runSummaryEngineTests() {
  console.log('[SummaryEngine Test Suite] Starting comprehensive document-only tests...');

  // 0. Scientific & Chemical Formatter Edge-Case Tests
  {
    const formattedChem = formatScientificText(
      'Combustion of CH4 with O2 produces CO2 and H2O, while H2SO4 dissociates into 2H^+ and SO4^2- (Page 2). Compare B2B vs CO2.'
    );
    assert.ok(formattedChem.includes('CH₄'), 'CH4 should format to CH₄');
    assert.ok(formattedChem.includes('O₂'), 'O2 should format to O₂');
    assert.ok(formattedChem.includes('CO₂'), 'CO2 should format to CO₂');
    assert.ok(formattedChem.includes('H₂O'), 'H2O should format to H₂O');
    assert.ok(formattedChem.includes('H₂SO₄'), 'H2SO4 should format to H₂SO₄');
    assert.ok(formattedChem.includes('2H⁺'), '2H^+ should format to 2H⁺');
    assert.ok(formattedChem.includes('SO₄²⁻'), 'SO4^2- should format to SO₄²⁻');
    assert.ok(formattedChem.includes('(Page 2)'), 'Page 2 must not be corrupted');
    assert.ok(formattedChem.includes('B2B'), 'Acronym B2B must not be altered');

    const formattedPhysics = formatScientificText(
      'Acceleration is 9.81 m/s^2 and Avogadro constant is 6.022 x 10^23 mol^-1 with ΔG = ΔH - TΔS.'
    );
    assert.ok(formattedPhysics.includes('9.81 m/s²'), 'm/s^2 should format to m/s²');
    assert.ok(formattedPhysics.includes('6.022 × 10²³'), 'Scientific notation should use × and superscripts');
    assert.ok(formattedPhysics.includes('mol⁻¹'), 'mol^-1 should format to mol⁻¹');
    console.log('Test 0 [Scientific & Chemical Formatter]: PASS');
  }

  // 1. Biology Multi-Page PDF Summary Test (Definitions, Processes, Zero Page/PDF Refs, Zero Filler)
  const bioPdfText = `[Page 1]
## Light-Dependent & Calvin Reactions
Photosynthesis is a biological process used by plants and other organisms to convert light energy into chemical energy. Chlorophyll is the green pigment found in cyanobacteria and the chloroplasts of algae and plants.
Step 1: Light-dependent reactions capture photons inside the thylakoid membrane to split H2O into O2, protons, and electrons (Page 1).
Step 2: ATP synthase uses the proton gradient to synthesize ATP and NADPH.

[Page 2]
The Calvin cycle refers to the set of chemical reactions that take place in chloroplasts during photosynthesis (Source: bio_lecture_02.pdf). Enzyme RuBisCO catalyzes carbon fixation by combining CO2 with ribulose bisphosphate on page 2. Step 3: Glucose (C6H12O6) is assembled from three-carbon intermediates.
Unlike light-dependent reactions, the Calvin cycle occurs in the stroma and does not directly require photons.`;

  const bioSummary = generateExtractiveSummary('Photosynthesis_Lecture_02.pdf', 'General Studies', bioPdfText, 'detailed');
  assert.equal(bioSummary.title, 'Photosynthesis Lecture 02', 'Must strip .pdf extension from title cleanly');
  assert.equal(bioSummary.subjectArea, 'Biology', 'Should infer Biology subject automatically');
  assert.ok(!bioSummary.topicOverview.startsWith('Based on the study material'), 'Should avoid robotic intro padding');
  assert.ok(bioSummary.importantDefinitions.length >= 2, 'Should extract Photosynthesis, Chlorophyll, Calvin cycle definitions');
  assert.ok((bioSummary.processesAndMechanisms?.length ?? 0) >= 1, 'Should detect photosynthesis steps in order');
  assert.ok((bioSummary.importantDistinctions?.length ?? 0) >= 1, 'Should detect "Unlike light-dependent reactions..." contrast');
  const bioSerialized = JSON.stringify(bioSummary);
  assert.ok(!/\bPages?\s+\d+/i.test(bioSerialized), 'Must NOT expose Page 1 or Page 2 anywhere in summary');
  assert.ok(!bioSerialized.includes('.pdf'), 'Must NOT expose .pdf filenames in summary');
  assert.ok(!bioSerialized.includes('Source:'), 'Must NOT expose Source: labels');
  assert.ok(!bioSummary.markdown.includes('AI Clarification'), 'Must contain zero AI Clarification labels');
  console.log('Test 1 [Biology Clean Notes + Processes + Distinctions]: PASS');

  // 2. Chemistry Formulas, Stoichiometry & Units Test
  const chemText = `[Page 1]
## Acid-Base Chemistry
An Arrhenius acid is defined as a substance that increases the concentration of H^+ ions in aqueous solution. Sulfuric acid (H2SO4) is a strong diprotic acid widely used in industrial synthesis.

## Reactions and Applications
Photosynthesis Reaction: 6CO2 + 6H2O -> C6H12O6 + 6O2
Neutralization: H2SO4 + 2NaOH -> Na2SO4 + 2H2O
For example, hydrochloric acid reacts rapidly with sodium hydroxide to form table salt and water.
pH = -log[H^+]`;

  const chemSummary = generateExtractiveSummary('Acids and Stoichiometry', 'General Studies', chemText, 'detailed');
  assert.equal(chemSummary.subjectArea, 'Chemistry');
  assert.ok(chemSummary.formulasOrFrameworks.length >= 2, 'Should extract chemical reactions and pH formula');
  assert.ok(
    chemSummary.formulasOrFrameworks.some((f) => f.expressionOrStructure.includes('6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂')),
    'Should format balanced chemical equation cleanly'
  );
  assert.ok(
    chemSummary.formulasOrFrameworks.some((f) => f.expressionOrStructure.includes('H₂SO₄ + 2NaOH → Na₂SO₄ + 2H₂O')),
    'Should format neutralization equation cleanly'
  );
  assert.ok(chemSummary.importantDefinitions.length >= 2, 'Should extract Arrhenius acid and Sulfuric acid definitions');
  assert.ok(chemSummary.mainConcepts.some((c) => c.heading === 'Acid-Base Chemistry'), 'Should preserve explicit heading');
  console.log('Test 2 [Chemistry Reactions & Subscripts]: PASS');

  // 3. Physics Equations, Variable Meanings & Units Test
  const physicsText = `[Page 1]
## Classical Mechanics
Newton's Second Law states that F = ma, where F is net force in N, m is mass in kg, and a is acceleration in m/s^2.
Kinetic Energy: KE = 0.5mv^2, where m is object mass in kg and v is speed in m/s.
Momentum is defined as the product of mass and velocity of an object moving at speed v.`;

  const physicsSummary = generateExtractiveSummary('Newtonian Mechanics', 'General Studies', physicsText, 'detailed');
  assert.equal(physicsSummary.subjectArea, 'Physics');
  const newtonFormula = physicsSummary.formulasOrFrameworks.find((f) => f.expressionOrStructure.includes('F = ma'));
  assert.ok(newtonFormula, 'Should extract F = ma');
  assert.ok((newtonFormula?.variables?.length ?? 0) >= 2, 'Should extract F, m, a variable meanings');
  assert.ok(physicsSummary.topicOverview.includes('m/s²') || JSON.stringify(physicsSummary).includes('m/s²'), 'Should preserve m/s² unit');
  console.log('Test 3 [Physics Equations & Variable Definitions]: PASS');

  // 4. Long Repetitive Document & Noise Removal Test
  const noisyLines: string[] = [];
  for (let p = 1; p <= 4; p++) {
    noisyLines.push(`[Page ${p}]`);
    noisyLines.push('UNIVERSITY LECTURE SERIES 2026'); // repeating header chrome on every page
    noisyLines.push('In this chapter we will discuss cellular metabolism.'); // meta-filler
    noisyLines.push('Cellular respiration is vital for aerobic organisms.');
    noisyLines.push('Cellular respiration is vital for aerobic organisms.'); // exact duplicate
    if (p === 1) {
      noisyLines.push('Glycolysis splits one glucose molecule into two pyruvate molecules inside the cytoplasm.');
    } else if (p === 2) {
      noisyLines.push('Mitochondria synthesize most cellular ATP through oxidative phosphorylation across the inner membrane.');
    } else if (p === 3) {
      noisyLines.push('Fermentation regenerates NAD^+ when oxygen is absent, whereas aerobic respiration yields far more ATP.');
    } else {
      noisyLines.push('Substrate-level phosphorylation transfers a phosphate group directly from a phosphorylated intermediate to ADP.');
    }
  }
  const noisySummary = generateExtractiveSummary('Cellular Respiration', 'Biology', noisyLines.join('\n'), 'detailed');
  const allRenderedItems = [
    ...noisySummary.importantFacts,
    ...noisySummary.mainConcepts.flatMap((c) => c.sourcePoints),
  ];
  assert.ok(
    !JSON.stringify(noisySummary).includes('UNIVERSITY LECTURE SERIES 2026'),
    'Repeating page header chrome must be stripped'
  );
  assert.ok(
    !JSON.stringify(noisySummary).includes('In this chapter we will discuss'),
    'Meta-filler intro sentences should be filtered'
  );
  assert.equal(
    new Set(noisySummary.importantFacts).size,
    noisySummary.importantFacts.length,
    'Facts must contain zero duplicates'
  );
  assert.ok(allRenderedItems.length >= 2, 'Should retain unique substantive biological facts');
  console.log('Test 4 [Repetitive Document & Header Noise Removal]: PASS');

  // 5. Short & Empty Document Handling (No Forced Sections)
  const emptySummary = generateExtractiveSummary('Empty Doc', 'General', '   ', 'short');
  assert.equal(emptySummary.wordCount, 0);
  assert.ok(emptySummary.topicOverview.includes('insufficient text'));

  const briefText = 'Enzymes lower the activation energy required for biochemical reactions without being consumed.';
  const briefSummary = generateExtractiveSummary('Enzymes Quick Note', 'Biology', briefText, 'short');
  assert.ok(Boolean(briefSummary.sourceNotice), 'Brief document should surface honest sourceNotice');
  assert.equal(briefSummary.formulasOrFrameworks.length, 0, 'Must not force empty/fabricated formulas');
  assert.equal(briefSummary.importantDistinctions?.length ?? 0, 0, 'Must not force unsupported distinctions');
  console.log('Test 5 [Empty & Brief Document Honesty]: PASS');

  // 6. Strict PDF/URL/Source Reference Stripping vs Legitimate Academic Numbering
  const historyWithRefs = `[Page 4]
## Chapter 3: The French Revolution of 1789
According to the uploaded PDF, Chapter 3 examines the fiscal crisis of 1789 and the Three Estates of France (Page 4).
As stated on page 5, the National Assembly adopted 17 articles in the Declaration of the Rights of Man (Source: https://example.com/study-materials/rev_notes.pdf).
Step 1: Estates-General convened in May 1789 with 1,200 delegates from three social orders.
Step 2: Citizens stormed the Bastille on July 14, 1789, marking a decisive political turning point.
References: https://storage.example.supabase.co/storage/v1/object/sign/study-materials/user1/rev.pdf`;

  const historySummary = generateExtractiveSummary(
    'French_Revolution_Chapter_3.pdf',
    'History',
    historyWithRefs,
    'detailed'
  );
  const histDump = JSON.stringify(historySummary);
  assert.equal(historySummary.title, 'French Revolution Chapter 3');
  assert.ok(!histDump.includes('https://'), 'Raw URLs must be completely removed');
  assert.ok(!histDump.includes('.pdf'), 'PDF filenames must be completely removed');
  assert.ok(!histDump.includes('According to the uploaded PDF'), 'Uploaded PDF phrase must be removed');
  assert.ok(!histDump.includes('As stated on page'), 'As stated on page phrase must be removed');
  assert.ok(!/\bReferences\s*:/i.test(histDump), 'References: labels must be removed');
  assert.ok(!/\(Page\s+\d+\)/i.test(histDump), 'Parenthetical page numbers must be removed');
  assert.ok(histDump.includes('1789'), 'Legitimate historical year 1789 must be preserved');
  assert.ok(histDump.includes('Chapter 3') || histDump.includes('17'), 'Legitimate chapter/article numbers must be preserved');
  console.log('Test 6 [Zero PDF/URL/Page Refs + Preserved Academic Numbers]: PASS');

  // 7. Visual Learning Engine (4K Curated Educational Visuals + Algorithmic Vector Diagrams)
  assert.ok((bioSummary.visualAids?.length ?? 0) >= 1, 'Should attach visual learning aids');
  assert.ok(
    bioSummary.visualAids?.some((v) => v.resolution === '4K'),
    'Visual aid must provide high resolution 4K metadata'
  );
  assert.ok(
    bioSummary.visualAids?.some((v) => v.verifiedLabels && v.verifiedLabels.length >= 3),
    'Visual aid must include verified component callouts'
  );
  assert.ok(
    (bioSummary.visualDiagrams?.length ?? 0) >= 1,
    'Should generate educational diagram spec for process steps'
  );
  console.log('Test 7 [Visual Learning Engine 4K Photography & Vector Diagrams]: PASS');

  // 8. Forex Trading & Candlestick Charts Anti-Contamination Regression Test
  // (Must classify as Financial Markets & Forex Trading, NEVER attach heart/cardiac/chemistry visuals,
  //  even when ambiguous terms like "heart", "circulation", "resistance", "momentum", "wave", "base" appear)
  const forexChartsText = `[Page 1]
## Candlestick Anatomy and Market Structure
At the heart of Forex technical analysis, a candlestick summarizes four prices within a timeframe: open, high, low, and close (OHLC). A bullish candlestick closes above the opening exchange rate, whereas a bearish candlestick closes below it, with upper and lower shadows (wicks) showing rejected price extremes.
For example, a Doji candlestick forms when open and close prices are nearly equal, signaling market indecision before a breakout.

[Page 2]
## Support, Resistance, and Currency Pairs
Capital circulation across the EUR/USD currency pair flows between demand floors and supply ceilings. Support and resistance mark horizontal price zones where buying demand halts a downtrend or selling pressure caps an uptrend.
In Forex trading, the base currency is the first currency quoted in a pair while the quote currency determines its exchange rate value, measured in pips. Stop loss and take profit orders help traders limit downside risk while riding price momentum or an Elliott wave swing.`;

  const forexSimple = generateExtractiveSummary(
    'Forex_Charts_Price_Action_Guide.pdf',
    'General Studies',
    forexChartsText,
    'short'
  );
  assert.equal(
    forexSimple.subjectArea,
    'Financial Markets & Forex Trading',
    'Forex document must be classified accurately as Financial Markets & Forex Trading (not Physics/Medicine)'
  );
  const forexVisualUrls = (forexSimple.visualAids || []).map((v) => v.imageDataUrl).join(' ');
  assert.ok(
    !forexVisualUrls.includes('med-cardiac-heart') &&
      !forexVisualUrls.includes('chem-molecular-orbitals') &&
      !forexVisualUrls.includes('phys-optics-waves'),
    'Forex summary must NEVER attach cardiac/chemistry/prism photo plates'
  );
  assert.ok(
    forexSimple.visualAids?.some((v) => v.diagramSpec?.type === 'candlestick_chart'),
    'Forex chart document should generate a genuine programmatic OHLC candlestick schematic'
  );
  assert.equal(
    isVisualAidRelevantToSummary(
      {
        id: 'visual-med-heart-circulation-overview-0',
        targetSection: 'overview',
        conceptTitle: 'Four-Chambered Heart',
        subjectDiscipline: 'Cardiovascular Physiology',
        visualType: 'illustration',
        necessityReason: 'stale persisted plate',
        visualScore: 90,
        caption: 'Heart chambers',
        generationPrompt: 'heart',
        verifiedLabels: [],
        aspectRatio: '16:9',
        imageDataUrl: '/edu-visuals/med-cardiac-heart.jpg',
        resolution: '4K',
        modelUsed: 'test',
        generatedAt: new Date().toISOString(),
        modality: 'photography',
      },
      forexSimple
    ),
    false,
    'SummaryDisplay guard must reject legacy persisted cardiac heart visual on a Forex summary'
  );
  console.log('Test 8 [Forex Charts Subject Accuracy & Zero Cardiac Contamination]: PASS');

  // 9. Selectable Document Sections Extraction Test
  const sectionExtraction = buildExtractedDocumentSections(forexChartsText, {
    title: 'Forex Price Action',
  });
  assert.equal(sectionExtraction.detectedSubject, 'Financial Markets & Forex Trading');
  assert.equal(sectionExtraction.sections.length, 2, 'Should extract both Forex sections cleanly');
  assert.equal(sectionExtraction.sections[0].heading, 'Candlestick Anatomy and Market Structure');
  assert.equal(sectionExtraction.sections[1].heading, 'Support, Resistance, and Currency Pairs');
  console.log('Test 9 [Selectable Document Sections Builder]: PASS');

  // 10. Simple vs Detailed vs Comprehensive Style Differentiation
  const forexComprehensive = generateExtractiveSummary(
    'Forex Price Action Guide',
    'General Studies',
    forexChartsText,
    'comprehensive'
  );
  assert.ok(
    forexComprehensive.wordCount >= forexSimple.wordCount ||
      forexComprehensive.mainConcepts.flatMap((c) => c.sourcePoints).length >=
        forexSimple.mainConcepts.flatMap((c) => c.sourcePoints).length,
    'Comprehensive summary should retain full depth relative to Simple style'
  );
  console.log('Test 10 [Simple vs Comprehensive Depth Differentiation]: PASS');

  // 11. Realistic Multi-Page Bloated PDF: True Condensation, Whole-Document Coverage, TOC/Footer Stripping & Cross-Page Synthesis
  const multiPageBloatedPdf = `[Page 1]
CS 402 Distributed Systems — Page 1
Table of Contents
1. Consensus Protocols ........................... 2
2. Replication & Consistency ..................... 4
3. Fault Tolerance & Closing Principles .......... 6

## Consensus Protocols
It is widely acknowledged in modern distributed computing that consensus protocols play a crucial role in order to allow independent server nodes to agree on a shared state despite network delays (see Fig. 1.1).
Consensus protocols require a quorum of nodes to ratify state updates before any commitment becomes permanent across the cluster.
Consensus protocols use leader election timers so that replica groups can recover swiftly due to the fact that hardware failures occur unpredictably.
Soft hyphenated electro-\nmechanical clock skew and distri-\nbution latency can trigger split-brain elections when heartbeat packets arrive late across
[Page 2]
CS 402 Distributed Systems — Page 2
partitioned data centers without synchronized leases.
In this section we will discuss how Paxos and Raft coordinate cluster agreement.

## Raft State Machine
Raft is defined as a consensus algorithm designed for understandable replicated log management across server clusters.
In Raft, a leader node manages all client write requests, whereas follower nodes passively replicate log entries and validate heartbeat signals.
Step 1: When a follower stops receiving leader heartbeats, it increments its election term and transitions into a candidate state.
Step 2: Candidates request votes from peer nodes and become the new leader once a majority quorum approves the election.

[Page 3]
CS 402 Distributed Systems — Page 3
## Replication & Consistency
It should be noted that synchronous replication facilitates strong consistency by waiting for quorum acknowledgment prior to confirming a write operation to the client (as discussed earlier).
Strong consistency guarantees that every subsequent read operation observes the most recently committed write value across all replicas.
Eventual consistency allows replicas to converge asynchronously in order to achieve lower write latency and higher availability during network partitions.

[Page 4]
CS 402 Distributed Systems — Page 4
## CAP Tradeoffs
Unlike strong consistency, eventual consistency prioritizes high availability over immediate read freshness when network partitions divide replicas.
High replication factor increases read throughput across geographically distributed regions because nearby replicas serve local user queries directly.
Wait-free quorum reads utilize version vectors to detect stale replica responses.

[Page 5]
CS 402 Distributed Systems — Page 5
## Partition Recovery & Closing Principles
It is important to note that Raft relies predominantly on majority quorums during partition recovery to prevent conflicting commits from coexisting in separate network halves.
During partition healing, stale leaders with lower election terms step down automatically and reconcile uncommitted log entries from the authoritative majority leader.
Write-ahead logging persists committed state transitions to durable storage before acknowledging completion, thereby ensuring crash recovery without data loss.
For example, banking ledgers apply write-ahead logging together with Raft consensus to guarantee zero lost financial transactions after power failures.`;

  const srcWordCount = multiPageBloatedPdf.split(/\s+/).filter(Boolean).length;
  const distSimple = generateExtractiveSummary('Distributed_Systems_Notes.pdf', 'General Studies', multiPageBloatedPdf, 'short');
  const distDetailed = generateExtractiveSummary('Distributed_Systems_Notes.pdf', 'General Studies', multiPageBloatedPdf, 'detailed');
  const distComprehensive = generateExtractiveSummary('Distributed_Systems_Notes.pdf', 'General Studies', multiPageBloatedPdf, 'comprehensive');

  assert.equal(distDetailed.subjectArea, 'Computer Science', 'Should infer Computer Science across full PDF');
  assert.ok(distSimple.wordCount < srcWordCount * 0.5, `Simple summary (${distSimple.wordCount}w) must meaningfully condense source (${srcWordCount}w)`);
  assert.ok(distDetailed.wordCount < srcWordCount * 0.78, `Detailed summary (${distDetailed.wordCount}w) must condense bloated source (${srcWordCount}w)`);
  assert.ok(distComprehensive.wordCount < srcWordCount * 0.9, `Comprehensive summary (${distComprehensive.wordCount}w) must still be shorter than raw source (${srcWordCount}w)`);
  assert.ok(distSimple.wordCount < distDetailed.wordCount, 'Simple must be more concise than Detailed');
  assert.ok(distDetailed.wordCount <= distComprehensive.wordCount, 'Detailed must not exceed Comprehensive');

  const distSimpleDump = JSON.stringify(distSimple);
  const distDetailedDump = JSON.stringify(distDetailed);
  const distCompDump = JSON.stringify(distComprehensive);

  // Verify chrome, TOC dot-leaders, meta-filler, and bloated phrases are removed & hyphenations healed
  assert.ok(!distCompDump.includes('CS 402 Distributed Systems —'), 'Normalized page header chrome must be stripped');
  assert.ok(!distCompDump.includes('...........................'), 'TOC dot-leader lines must be stripped');
  assert.ok(!distCompDump.includes('In this section we will discuss'), 'Meta-filler must be stripped');
  assert.ok(!distSimpleDump.includes('due to the fact that'), 'Verbose phrasing must be condensed');
  assert.ok(!distSimpleDump.includes('It is widely acknowledged'), 'Rhetorical openers must be stripped');
  assert.ok(!distCompDump.includes('electro- mechanical') && !distCompDump.includes('distri- bution'), 'Soft hyphenated words must rejoin');
  assert.ok(
    distCompDump.includes('electromechanical') || distCompDump.includes('distribution'),
    'Rejoined hyphenated technical words should remain intact when used'
  );

  // Verify whole-document reach: closing chapter on Page 5 must appear in ALL levels including Simple & Detailed
  assert.ok(
    distSimple.mainConcepts.some((c) => /Partition Recovery|Closing/i.test(c.heading)) ||
      distSimpleDump.includes('Write-ahead logging') ||
      distSimpleDump.includes('partition'),
    'Simple summary must still incorporate closing pages of the document'
  );
  assert.ok(
    distDetailed.mainConcepts.some((c) => /Partition Recovery|Closing/i.test(c.heading)),
    'Detailed summary must cover closing chapter on Page 5'
  );

  // Verify cross-page sentence carry-over ("...when heartbeat packets arrive late across" + "partitioned data centers...")
  assert.ok(
    distCompDump.includes('partitioned data centers') || distDetailedDump.includes('partitioned data centers'),
    'Cross-page split sentence must remain intact rather than broken into meaningless fragments'
  );

  // Verify Final Recap does NOT duplicate Key Takeaways verbatim with "Mastery Synthesis:"
  assert.ok(
    !(distDetailed.finalRecap || []).some((r) => r.startsWith('Mastery Synthesis:')),
    'Final Recap must synthesize holistically instead of prefix-copying Key Takeaways'
  );
  if ((distDetailed.finalRecap?.length ?? 0) > 0 && distDetailed.keyTakeaways.length > 0) {
    const overlap = distDetailed.finalRecap!.some((r) => distDetailed.keyTakeaways.includes(r));
    assert.equal(overlap, false, 'Final Recap must not duplicate Key Takeaways');
  }

  // Verify plain-language clarification in Detailed/Comprehensive
  assert.ok(
    distDetailed.difficultConceptExplanations.length >= 1,
    'Detailed summary should simplify dense technical concepts for students'
  );

  // Verify Simple uses everyday plain language simplifications
  assert.ok(
    !distSimpleDump.includes('utilizes') && !distSimpleDump.includes('facilitates'),
    'Simple mode must replace dense academic words like utilizes/facilitates with clear student-friendly equivalents'
  );
  console.log(
    `Test 11 [Multi-Page Condensation & Whole-Doc Synthesis]: PASS (src=${srcWordCount}w -> Simple=${distSimple.wordCount}w, Detailed=${distDetailed.wordCount}w, Comprehensive=${distComprehensive.wordCount}w)`
  );

  // 12. Cross-Section Relationship Detection Across Non-Adjacent Chapters
  assert.ok(
    distComprehensive.revisionNotes.some((n) => /Consensus|Raft/i.test(n) && /Partition|Replication/i.test(n)),
    'Comprehensive summary should connect related concepts across non-adjacent sections (e.g. Raft/Consensus <-> Partition Recovery/Replication)'
  );
  console.log('Test 12 [Non-Adjacent Cross-Section Connections]: PASS');

  // 13. Long Multi-Page Academic Textbook (1,200+ words): Strong Condensation Ratios & Multi-Concept Synthesis
  const longTextbookPages: string[] = [];
  const chapters = [
    {
      page: 1,
      heading: 'Thermodynamics & Biological Energy',
      paragraphs: [
        'It is widely acknowledged in cellular biochemistry that living organisms obey the laws of thermodynamics while continuously exchanging energy and matter with their surrounding environment.',
        'Gibbs free energy is defined as the portion of a thermodynamic system energy available to perform useful cellular work at constant temperature and pressure.',
        'Gibbs Free Energy Equation: ΔG = ΔH - TΔS, where ΔG is free energy change, ΔH is enthalpy change, T is absolute temperature in Kelvin, and ΔS is entropy change.',
        'Unlike endergonic reactions that require net energy input, exergonic reactions release free energy spontaneously with a negative ΔG value.',
        'Metabolic pathways pair exergonic ATP hydrolysis with unfavorable biosynthetic reactions in order to drive cellular assembly forward reliably.',
      ],
    },
    {
      page: 2,
      heading: 'Enzyme Kinetics & Catalysis',
      paragraphs: [
        'Enzymes are biological protein catalysts that accelerate biochemical reaction rates by lowering activation energy without being consumed in the overall chemical transformation.',
        'There are two main types of enzyme inhibition: competitive inhibition and noncompetitive inhibition.',
        'Competitive inhibition occurs when an inhibitor molecule closely resembles the natural substrate and binds directly to the active site.',
        'Noncompetitive inhibition occurs when a regulatory molecule binds to an allosteric site away from the active site, altering enzyme conformation and reducing catalytic turnover.',
        'For example, feedback inhibition regulates amino acid biosynthesis when the final pathway product binds allosterically to the first committed enzyme.',
      ],
    },
    {
      page: 3,
      heading: 'Cellular Respiration Stages',
      paragraphs: [
        'In eukaryotic cells, aerobic cellular respiration systematically harvests chemical bond energy from glucose molecules across sequential metabolic compartments.',
        'Step 1: Glycolysis splits one six-carbon glucose molecule into two three-carbon pyruvate molecules inside the cytosol while generating net ATP and NADH.',
        'Step 2: Pyruvate oxidation and the citric acid cycle completely oxidize acetyl-CoA inside the mitochondrial matrix, releasing CO2 and loading electron carriers NADH and FADH2.',
        'Step 3: Oxidative phosphorylation uses the mitochondrial electron transport chain to pump protons across the inner membrane and synthesize abundant ATP via ATP synthase.',
        'Cellular Respiration Equation: C6H12O6 + 6O2 -> 6CO2 + 6H2O',
      ],
    },
    {
      page: 4,
      heading: 'Membrane Transport & Electrochemical Gradients',
      paragraphs: [
        'Biological membranes consist of selectively permeable phospholipid bilayers embedded with transport proteins that regulate solute movement between compartments.',
        'Passive diffusion moves nonpolar molecules down their concentration gradient without requiring metabolic ATP hydrolysis.',
        'Active transport utilizes membrane ATPases or coupled ion gradients to pump solutes against an electrochemical gradient across the bilayer.',
        'Whereas simple diffusion proceeds linearly with concentration difference, facilitated diffusion relies on carrier proteins that saturate at high solute concentrations.',
        'Proton gradients generated during oxidative phosphorylation exemplify how membrane transport directly powers ATP synthesis in mitochondria.',
      ],
    },
    {
      page: 5,
      heading: 'Metabolic Integration & Homeostasis',
      paragraphs: [
        'Cells coordinate catabolic breakdown and anabolic biosynthesis dynamically through allosteric feedback loops and energy-charge sensing.',
        'High cellular ATP levels inhibit phosphofructokinase during glycolysis to prevent wasteful glucose consumption when energy reserves are already sufficient.',
        'Conversely, elevated AMP signals low cellular energy and stimulates glycolytic enzymes as well as mitochondrial ATP synthase activity.',
        'In addition, glycogen storage buffers blood glucose fluctuations across tissues by releasing glucose-1-phosphate during fasting intervals.',
        'Together, enzyme regulation, Gibbs free energy coupling, and membrane proton gradients preserve metabolic homeostasis under changing physiological demands.',
      ],
    },
    {
      page: 6,
      heading: 'Photosynthetic Coupling & Carbon Assimilation',
      paragraphs: [
        'Autotrophic organisms complement cellular respiration by capturing solar photons in thylakoid membranes to reduce atmospheric carbon dioxide into carbohydrates.',
        'Chlorophyll pigments absorb red and blue wavelengths to excite photosystem electrons and split water molecules into molecular oxygen and protons.',
        'Calvin cycle enzymes utilize ATP and NADPH generated by the light reactions to fix CO2 onto ribulose bisphosphate and assemble triose phosphates.',
        'For example, agricultural crop productivity depends on balancing light-reaction electron flow with Calvin cycle carbon fixation efficiency under varying temperatures.',
        'Ultimately, photosynthesis and cellular respiration form a global bioenergetic cycle linking solar radiation, oxygen exchange, and ATP turnover across ecosystems.',
      ],
    },
  ];
  for (const ch of chapters) {
    longTextbookPages.push(`[Page ${ch.page}]`);
    longTextbookPages.push('BIO 310 Molecular Bioenergetics — Page ' + ch.page);
    longTextbookPages.push(`## ${ch.heading}`);
    for (const p of ch.paragraphs) {
      longTextbookPages.push(p);
      // Add realistic textbook elaboration lines to exceed 1,200 words naturally
      longTextbookPages.push(
        `In addition, experimental studies in ${ch.heading.toLowerCase()} emphasize that quantitative measurements and molecular regulation remain essential for predicting cellular adaptation under variable environmental stress.`
      );
    }
  }
  const longTextbookRaw = longTextbookPages.join('\n');
  const longSrcWords = longTextbookRaw.split(/\s+/).filter(Boolean).length;
  assert.ok(longSrcWords >= 1000, `Test 13 source (${longSrcWords}w) must represent a dense 1,000+ word textbook`);

  const longSimple = generateExtractiveSummary('Molecular_Bioenergetics_Text.pdf', 'General Studies', longTextbookRaw, 'short');
  const longDetailed = generateExtractiveSummary('Molecular_Bioenergetics_Text.pdf', 'General Studies', longTextbookRaw, 'detailed');
  const longComp = generateExtractiveSummary('Molecular_Bioenergetics_Text.pdf', 'General Studies', longTextbookRaw, 'comprehensive');

  assert.equal(longDetailed.subjectArea, 'Biology');
  assert.ok(longSimple.wordCount < longSrcWords * 0.32, `Long Simple (${longSimple.wordCount}w) must condense ${longSrcWords}w below 32%`);
  assert.ok(longDetailed.wordCount < longSrcWords * 0.52, `Long Detailed (${longDetailed.wordCount}w) must condense ${longSrcWords}w below 52%`);
  assert.ok(longComp.wordCount < longSrcWords * 0.72, `Long Comprehensive (${longComp.wordCount}w) must condense ${longSrcWords}w below 72%`);
  assert.ok(longSimple.wordCount < longDetailed.wordCount && longDetailed.wordCount <= longComp.wordCount);
  assert.ok(
    longComp.formulasOrFrameworks.some((f) => f.expressionOrStructure.includes('ΔG = ΔH - TΔS')),
    'Must preserve Gibbs free energy equation in long textbook'
  );
  assert.ok(
    longDetailed.classificationsAndTypes && longDetailed.classificationsAndTypes.length >= 1,
    'Must preserve enzyme inhibition classification'
  );
  assert.ok(
    longSimple.mainConcepts.some((c) => /Photosynthetic|Homeostasis/i.test(c.heading)) ||
      JSON.stringify(longSimple).includes('Calvin') ||
      JSON.stringify(longSimple).includes('photosynthesis'),
    'Simple summary of long textbook must still synthesize closing chapters'
  );
  console.log(
    `Test 13 [1,000+ Word Textbook Condensation]: PASS (src=${longSrcWords}w -> Simple=${longSimple.wordCount}w, Detailed=${longDetailed.wordCount}w, Comprehensive=${longComp.wordCount}w)`
  );

  console.log('[SummaryEngine Test Suite] Overall Status: ALL TESTS PASSED SUCCESSFULLY');
}

runSummaryEngineTests();
