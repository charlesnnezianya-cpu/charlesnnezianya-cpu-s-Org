import type {
  EducationalDiagramSpec,
  StructuredSummary,
  SummaryVisualAid,
  SummaryVisualTargetSection,
  SummaryVisualType,
  SummaryVisualVerifiedLabel,
} from '../types/brainstine';
import { stripSummarySourceAndPageRefs } from './summarySanitizer';

export interface CuratedEducationalVisual {
  id: string;
  matchPatterns: RegExp[];
  allowedSubjects: string[];
  requiredAnchorPattern: RegExp;
  disqualifyingSubjects?: string[];
  discipline: string;
  conceptTitle: string;
  visualType: SummaryVisualType;
  modality: 'photography' | 'diagram';
  resolution: '4K' | '2K' | '1K';
  exactResolution: string;
  license: string;
  attribution: string;
  imageUrl: string;
  caption: string;
  targetSection: SummaryVisualTargetSection;
  aspectRatio: '16:9' | '4:3';
  verifiedLabels: SummaryVisualVerifiedLabel[];
  diagramSpec?: EducationalDiagramSpec;
}

/**
 * Curated repository of high-resolution, locally served educational illustrations
 * and photography plates across natural sciences, medicine, astronomy, earth
 * sciences, physics, chemistry, history, and classical architecture.
 * Served statically from /public/edu-visuals so every plate loads reliably offline
 * or online without external CDN rate-limits or Node ESM bundler conflicts.
 */
export const CURATED_EDUCATIONAL_VISUALS: CuratedEducationalVisual[] = [
  // -------------------------------------------------------------
  // CELLULAR & MOLECULAR BIOLOGY
  // -------------------------------------------------------------
  {
    id: 'bio-eukaryotic-cell-ultrastructure',
    matchPatterns: [
      /\b(eukaryot\w*|cell structure|organelle|cytoplasm|cell nucleus|endoplasmic reticulum|golgi|lysosome|animal cell)\b/i,
    ],
    allowedSubjects: ['Biology', 'Medicine & Anatomy', 'General Studies'],
    requiredAnchorPattern: /\b(eukaryot\w*|organelle|cytoplasm|endoplasmic reticulum|golgi apparatus|lysosome|cell membrane)\b/i,
    discipline: 'Cellular Biology',
    conceptTitle: 'Eukaryotic Cell Ultrastructure & Compartmentalization',
    visualType: 'illustration',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Educational Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/bio-eukaryotic-cell.jpg',
    caption:
      'Cross-sectional view of the eukaryotic cell illustrating membrane-bound organelles that partition genetic control, protein synthesis, sorting, and energy conversion.',
    targetSection: 'concepts',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Nucleus & Nucleolus', detail: 'Houses genomic chromatin and coordinates ribosomal RNA assembly' },
      { label: 'Mitochondria', detail: 'Double-membrane organelles generating adenosine triphosphate (ATP)' },
      { label: 'Rough Endoplasmic Reticulum', detail: 'Ribosome-studded cisternae synthesizing secretory and membrane proteins' },
      { label: 'Golgi Apparatus', detail: 'Stacked cisternae modifying, sorting, and packaging macromolecules' },
      { label: 'Plasma Membrane', detail: 'Phospholipid bilayer governing selective transmembrane transport' },
    ],
  },
  {
    id: 'bio-mitochondria-cristae',
    matchPatterns: [
      /\b(mitochondri\w*|cellular respiration|atp synthase|chemiosmosis|electron transport chain|oxidative phosphorylation|proton gradient|cristae|krebs cycle|citric acid cycle)\b/i,
    ],
    allowedSubjects: ['Biology', 'Chemistry', 'Medicine & Anatomy', 'General Studies'],
    requiredAnchorPattern: /\b(mitochondri\w*|atp synthase|oxidative phosphorylation|cristae|krebs cycle)\b/i,
    discipline: 'Cellular Biology & Bioenergetics',
    conceptTitle: 'Mitochondrial Cristae & ATP Synthesis Architecture',
    visualType: 'diagram',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Educational Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/bio-mitochondria.jpg',
    caption:
      'The inner mitochondrial membrane folds extensively into cristae to maximize surface area for oxidative phosphorylation complexes and ATP synthase rotors.',
    targetSection: 'processes',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Outer Membrane', detail: 'Contains porin channels permeable to ions and small metabolites' },
      { label: 'Intermembrane Space', detail: 'Compartment where protons (H⁺) accumulate during electron transport' },
      { label: 'Inner Membrane & Cristae', detail: 'Location of electron transport complexes I–IV and F₀F₁ ATP synthase' },
      { label: 'Mitochondrial Matrix', detail: 'Interior compartment housing Krebs cycle enzymes and circular mtDNA' },
    ],
  },
  {
    id: 'bio-chloroplast-photosynthesis',
    matchPatterns: [
      /\b(chloroplast|photosynthe\w*|thylakoid|chlorophyll|calvin cycle|stroma|light-dependent|grana|rubisco|photolysis)\b/i,
    ],
    allowedSubjects: ['Biology', 'Chemistry', 'General Studies'],
    requiredAnchorPattern: /\b(chloroplast|photosynthe\w*|thylakoid|chlorophyll|calvin cycle|rubisco)\b/i,
    discipline: 'Plant Biology & Biochemistry',
    conceptTitle: 'Chloroplast Microarchitecture & Photosynthetic Membranes',
    visualType: 'diagram',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Educational Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/bio-chloroplast.jpg',
    caption:
      'Chloroplast cutaway revealing stacked thylakoid grana where chlorophyll captures light energy, surrounded by the stroma where the Calvin cycle fixes carbon.',
    targetSection: 'concepts',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Double Envelope Membrane', detail: 'Selectively permeable outer and inner membranes regulating transport' },
      { label: 'Thylakoid Grana', detail: 'Stacked disc membranes housing Photosystems I & II and ATP synthase' },
      { label: 'Stroma', detail: 'Alkaline fluid matrix containing RuBisCO and Calvin cycle enzymes' },
      { label: 'Stromal Lamellae', detail: 'Membrane bridges interconnecting grana stacks across the organelle' },
    ],
  },
  {
    id: 'bio-dna-double-helix',
    matchPatterns: [
      /\b(dna\b|deoxyribonucleic|double helix|nucleotide|base pair|adenine|thymine|guanine|cytosine|phosphodiester)\b/i,
    ],
    allowedSubjects: ['Biology', 'Chemistry', 'Medicine & Anatomy', 'General Studies'],
    requiredAnchorPattern: /\b(dna|deoxyribonucleic|double helix|nucleotide|base pair)\b/i,
    discipline: 'Molecular Genetics',
    conceptTitle: 'DNA Double Helix & Complementary Base-Pairing',
    visualType: 'illustration',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Educational Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/bio-dna-helix.jpg',
    caption:
      'Antiparallel 5′-to-3′ sugar-phosphate backbones stabilized by complementary Watson-Crick hydrogen bonds (Adenine–Thymine and Guanine–Cytosine).',
    targetSection: 'concepts',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Sugar-Phosphate Backbone', detail: 'Alternating deoxyribose sugars and phosphate groups linked by phosphodiester bonds' },
      { label: 'Major & Minor Grooves', detail: 'Asymmetric helical grooves recognized by regulatory DNA-binding proteins' },
      { label: 'A=T Base Pair', detail: 'Purine-pyrimidine pair joined by 2 hydrogen bonds' },
      { label: 'G≡C Base Pair', detail: 'Purine-pyrimidine pair joined by 3 hydrogen bonds conferring higher stability' },
    ],
  },

  // -------------------------------------------------------------
  // HUMAN ANATOMY & PHYSIOLOGY
  // -------------------------------------------------------------
  {
    id: 'med-heart-circulation',
    matchPatterns: [
      /\b(cardiac|cardiovascular|pulmonary circulation|systemic circulation|atrium|ventricle|aorta|heart chamber|systol\w*|diastol\w*|myocard\w*|tricuspid|mitral)\b/i,
    ],
    allowedSubjects: ['Medicine & Anatomy', 'Biology'],
    requiredAnchorPattern: /\b(cardiac|cardiovascular|atrium|ventricle|aorta|myocard\w*|pulmonary artery|vena cava)\b/i,
    discipline: 'Cardiovascular Physiology',
    conceptTitle: 'Four-Chambered Heart & Systemic/Pulmonary Circulation',
    visualType: 'illustration',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Anatomical Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/med-cardiac-heart.jpg',
    caption:
      'Cross-sectional anatomy of the four cardiac chambers demonstrating deoxygenated venous flow through the right heart to the lungs and oxygenated arterial outflow via the aorta.',
    targetSection: 'overview',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Superior & Inferior Vena Cava', detail: 'Major veins returning deoxygenated systemic blood to the right atrium' },
      { label: 'Right Atrium & Ventricle', detail: 'Pump venous blood through the pulmonary trunk toward alveolar capillaries' },
      { label: 'Left Ventricle', detail: 'Thick muscular chamber generating systemic systolic ejection pressure' },
      { label: 'Ascending Aorta', detail: 'Primary elastic artery distributing oxygenated blood throughout the body' },
    ],
  },
  {
    id: 'med-brain-lobes-neuroscience',
    matchPatterns: [
      /\b(cerebral cortex|frontal lobe|parietal lobe|occipital lobe|temporal lobe|nervous system|cerebellum|hippocampus|synapse|neuron)\b/i,
    ],
    allowedSubjects: ['Medicine & Anatomy', 'Biology', 'Psychology'],
    requiredAnchorPattern: /\b(cerebr\w*|frontal lobe|parietal lobe|occipital lobe|temporal lobe|cerebellum|hippocampus|neuron)\b/i,
    discipline: 'Neuroscience & Neuroanatomy',
    conceptTitle: 'Human Cerebral Cortex Functional Lobe Specialization',
    visualType: 'illustration',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Anatomical Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/med-cerebral-lobes.jpg',
    caption:
      'Lateral cerebral hemisphere highlighting regional cortical specialization for executive planning, somatosensory integration, auditory memory, visual decoding, and motor coordination.',
    targetSection: 'concepts',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Frontal Lobe', detail: 'Governs executive function, working memory, speech production, and voluntary motor control' },
      { label: 'Parietal Lobe', detail: 'Integrates somatosensory touch, spatial awareness, and proprioception' },
      { label: 'Occipital Lobe', detail: 'Processes retinotopic visual signals in the primary visual cortex' },
      { label: 'Temporal Lobe', detail: 'Coordinates auditory perception, language comprehension, and episodic memory' },
      { label: 'Cerebellum & Brainstem', detail: 'Regulates posture, fine motor coordination, and vital autonomic reflexes' },
    ],
  },
  {
    id: 'med-nephron-kidney-filtration',
    matchPatterns: [
      /\b(nephron|glomerul\w*|kidney|renal|bowman|henle|urine|ultrafiltration|reabsorption|collecting duct)\b/i,
    ],
    allowedSubjects: ['Medicine & Anatomy', 'Biology'],
    requiredAnchorPattern: /\b(nephron|glomerul\w*|kidney|renal|bowman|henle)\b/i,
    discipline: 'Renal Physiology',
    conceptTitle: 'The Nephron: Glomerular Filtration & Tubule Reabsorption',
    visualType: 'diagram',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Anatomical Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/med-renal-nephron.jpg',
    caption:
      'Functional filtration unit of the kidney illustrating capillary plasma ultrafiltration in Bowman’s capsule and countercurrent solute concentration along the Loop of Henle.',
    targetSection: 'processes',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Glomerulus & Bowman’s Capsule', detail: 'High-pressure capillary bed generating protein-free plasma filtrate' },
      { label: 'Proximal Convoluted Tubule', detail: 'Reabsorbs glucose, amino acids, bicarbonate, and ~65% of filtered water' },
      { label: 'Loop of Henle', detail: 'Creates the medullary osmotic gradient through countercurrent multiplication' },
      { label: 'Distal Tubule & Collecting Duct', detail: 'Fine-tunes pH, electrolyte balance, and water reabsorption under hormonal control' },
    ],
  },

  // -------------------------------------------------------------
  // CHEMISTRY & PHYSICS
  // -------------------------------------------------------------
  {
    id: 'chem-molecular-orbitals',
    matchPatterns: [
      /\b(molecular orbital|covalent bond|hybridization|sp3|valence electron|electron cloud|tetrahedral|chemical bond|lewis structure|stoichiometr\w*|enthalpy|arrhenius acid)\b/i,
    ],
    allowedSubjects: ['Chemistry', 'Physics'],
    requiredAnchorPattern: /\b(orbital|covalent|hybridization|sp3|stoichiometr\w*|enthalpy|chemical bond|molecule)\b/i,
    discipline: 'Chemistry & Molecular Structure',
    conceptTitle: 'Molecular Orbitals & Covalent Electron Density Geometry',
    visualType: 'illustration',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Scientific Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/chem-molecular-orbitals.jpg',
    caption:
      'Three-dimensional orbital probability clouds around a tetrahedral molecular geometry showing directional sigma bonding overlap and electron density contours.',
    targetSection: 'concepts',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Central Hybridized Atom', detail: 'Tetrahedral 109.5° bond angles formed by hybridized atomic orbitals' },
      { label: 'Sigma (σ) Bond Density', detail: 'Symmetric head-on orbital overlap concentrated along the internuclear axis' },
      { label: 'Outer Electron Density Contour', detail: 'Boundary surface enclosing regions of high electron probability' },
      { label: 'Peripheral Substituent Ligands', detail: 'Terminal atoms stabilized through shared valence electron pairs' },
    ],
  },
  {
    id: 'phys-optics-waves',
    matchPatterns: [
      /\b(optics|prism|refraction|dispersion|electromagnetic spectrum|wavelength|diffraction|snell|photon|laser)\b/i,
    ],
    allowedSubjects: ['Physics', 'Chemistry'],
    requiredAnchorPattern: /\b(optics|prism|refraction|wavelength|diffraction|snell|electromagnetic)\b/i,
    discipline: 'Physics: Optics & Wave Mechanics',
    conceptTitle: 'Optical Prism Dispersion & Electromagnetic Wave Spectrum',
    visualType: 'spatial_scene',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Scientific Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/phys-optics-waves.jpg',
    caption:
      'Collimated white light refracting through an equilateral glass prism, separating wavelengths by refractive index into a continuous optical spectrum.',
    targetSection: 'concepts',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Incident White Beam', detail: 'Polychromatic wave train containing all visible optical frequencies' },
      { label: 'Equilateral Dispersive Prism', detail: 'Refracts shorter wavelengths (violet) more strongly than longer wavelengths (red)' },
      { label: 'Continuous Visible Spectrum', detail: 'Angular separation ordered monotonically by wavelength (λ)' },
      { label: 'Calibrated Wave Intensity Profile', detail: 'Visualizes oscillatory frequency variation across spectral bands' },
    ],
  },

  // -------------------------------------------------------------
  // ASTRONOMY & ASTROPHYSICS
  // -------------------------------------------------------------
  {
    id: 'astro-carina-nebula-jwst',
    matchPatterns: [
      /\b(nebula|star formation|protostar|jwst|james webb|astronomy|galaxy|supernova|interstellar)\b/i,
    ],
    allowedSubjects: ['Physics', 'General Studies'],
    requiredAnchorPattern: /\b(nebula|protostar|jwst|astronomy|galaxy|supernova|interstellar)\b/i,
    discipline: 'Astrophysics & Observational Astronomy',
    conceptTitle: 'Star-Forming Molecular Pillars & Ionized Nebula Cliffs',
    visualType: 'spatial_scene',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Observatory Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/astro-carina-nebula.jpg',
    caption:
      'Infrared astronomical view of dense molecular dust cliffs being sculpted by ultraviolet radiation and stellar winds from newborn massive stars.',
    targetSection: 'overview',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Ionized Gas Ridge', detail: 'Boundary layer where energetic ultraviolet photons erode dense dust clouds' },
      { label: 'Embedded Protostars', detail: 'Collapsing stellar cores visible in infrared wavelengths inside dust pillars' },
      { label: 'Molecular Dust Filaments', detail: 'Cold hydrogen and silicate reservoirs supplying raw material for new stars' },
      { label: 'Background Star Field', detail: 'Distant stars and galaxies revealed through optically thin infrared windows' },
    ],
  },
  {
    id: 'astro-saturn-rings-cassini',
    matchPatterns: [
      /\b(saturn|planetary rings|cassini division|solar system|kepler\w* law|orbital resonance)\b/i,
    ],
    allowedSubjects: ['Physics', 'General Studies'],
    requiredAnchorPattern: /\b(saturn|planetary rings|cassini|solar system|kepler)\b/i,
    discipline: 'Planetary Science',
    conceptTitle: 'Saturnian Ring Architecture & Gravitational Resonances',
    visualType: 'spatial_scene',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Observatory Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/astro-saturn-rings.jpg',
    caption:
      'Planetary view showing razor-thin water-ice ring bands separated by gravitational resonance gaps and illuminated across the planet’s seasonal equinox shadow.',
    targetSection: 'concepts',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Cassini Division', detail: '4,800 km orbital gap cleared by 2:1 gravitational resonance with the moon Mimas' },
      { label: 'A & B Ring Bands', detail: 'Dense water-ice particle rings confined by shepherd moons' },
      { label: 'Atmospheric Zonal Bands', detail: 'Ammonia-ice jet streams shaped by rapid planetary rotation' },
      { label: 'Planetary Umbra Shadow', detail: 'Shadow cone cast cleanly across the ring plane' },
    ],
  },

  // -------------------------------------------------------------
  // EARTH SCIENCES & GEOLOGY
  // -------------------------------------------------------------
  {
    id: 'geo-plate-tectonics-subduction',
    matchPatterns: [
      /\b(plate tectonics|subduction|lithosphere|asthenosphere|tectonic plate|continental drift|deep ocean trench|volcanic arc|magma)\b/i,
    ],
    allowedSubjects: ['Geology & Earth Science', 'Physics', 'General Studies'],
    requiredAnchorPattern: /\b(plate tectonics|subduction|lithosphere|asthenosphere|continental drift|volcanic arc)\b/i,
    discipline: 'Geology & Geophysics',
    conceptTitle: 'Tectonic Subduction Zone & Magma Generation Dynamics',
    visualType: 'diagram',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Geological Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/geo-subduction-zone.jpg',
    caption:
      'Dense oceanic lithosphere plunging beneath buoyant continental crust at a convergent boundary, releasing volatiles that trigger mantle flux melting and arc volcanism.',
    targetSection: 'processes',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Deep Ocean Trench', detail: 'Bathymetric trough formed where the oceanic plate flexes downward' },
      { label: 'Subducting Oceanic Slab', detail: 'Dense basaltic lithosphere carrying hydrated sediments into the mantle' },
      { label: 'Flux Melting Zone', detail: 'Dehydration volatiles lower asthenospheric peridotite melting temperature' },
      { label: 'Continental Volcanic Arc', detail: 'Composite volcanoes aligned parallel to the convergent plate boundary' },
    ],
  },
  {
    id: 'geo-rock-strata-grand-canyon',
    matchPatterns: [
      /\b(strata|stratigraph\w*|sedimentary|rock layer|fossil|geologic time|unconformity|grand canyon|superposition|limestone)\b/i,
    ],
    allowedSubjects: ['Geology & Earth Science', 'History & Governance', 'General Studies'],
    requiredAnchorPattern: /\b(stratigraph\w*|sedimentary|rock layer|geologic time|grand canyon|unconformity)\b/i,
    discipline: 'Historical Geology & Stratigraphy',
    conceptTitle: 'Sedimentary Stratigraphic Succession & Canyon Incision',
    visualType: 'spatial_scene',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Field Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/geo-canyon-strata.jpg',
    caption:
      'Panoramic exposure of horizontally layered sedimentary rock strata carved by river incision, demonstrating Steno’s law of superposition across geologic time.',
    targetSection: 'concepts',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Upper Limestone Caprock', detail: 'Resistant marine carbonate cliffs deposited in shallow continental seas' },
      { label: 'Red Sandstone Slope Beds', detail: 'Iron-oxidized terrestrial and coastal strata forming stepped slopes' },
      { label: 'Horizontal Bedding Planes', detail: 'Distinct depositional surfaces marking shifts in ancient environment' },
      { label: 'Incised River Gorge', detail: 'V-shaped fluvial erosion exposing progressively older rock beds with depth' },
    ],
  },

  // -------------------------------------------------------------
  // HISTORY, ARCHAEOLOGY & ARCHITECTURE
  // -------------------------------------------------------------
  {
    id: 'hist-rosetta-stone-epigraphy',
    matchPatterns: [
      /\b(rosetta stone|hieroglyph|egypt\w*|demotic|epigraphy|archaeology|ptolemaic|champollion|stele)\b/i,
    ],
    allowedSubjects: ['History & Governance', 'Literature & Humanities', 'General Studies'],
    requiredAnchorPattern: /\b(rosetta stone|hieroglyph|demotic|epigraphy|champollion|stele)\b/i,
    discipline: 'Ancient History & Archaeology',
    conceptTitle: 'The Rosetta Stone Trilingual Inscription (196 BCE)',
    visualType: 'spatial_scene',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Archival Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/hist-rosetta-stone.jpg',
    caption:
      'Granodiorite stele inscribed with an identical decree across three scripts—Egyptian hieroglyphic, Demotic, and Ancient Greek—enabling modern decipherment of hieroglyphs.',
    targetSection: 'concepts',
    aspectRatio: '4:3',
    verifiedLabels: [
      { label: 'Top Register: Hieroglyphic Script', detail: 'Formal sacred script used for monumental temple and priestly decrees' },
      { label: 'Middle Register: Demotic Script', detail: 'Cursive Egyptian script used in everyday administrative records' },
      { label: 'Bottom Register: Ancient Greek', detail: 'Official language of the Ptolemaic administration providing the translation key' },
      { label: 'Royal Cartouches', detail: 'Oval enclosures preserving phonetic royal names for cross-script matching' },
    ],
  },
  {
    id: 'hist-parthenon-classical-orders',
    matchPatterns: [
      /\b(parthenon|acropolis|doric|ionic|corinthian|classical architecture|entablature|colonnade|stylobate|pericles)\b/i,
    ],
    allowedSubjects: ['History & Governance', 'Literature & Humanities', 'General Studies'],
    requiredAnchorPattern: /\b(parthenon|acropolis|doric|entablature|stylobate|classical architecture)\b/i,
    discipline: 'Classical Antiquity & Architectural History',
    conceptTitle: 'The Athenian Parthenon: Doric Peripteral Architecture',
    visualType: 'spatial_scene',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Archival Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/hist-parthenon-athens.jpg',
    caption:
      '5th-century BCE Doric marble temple displaying classical optical refinements including column entasis, triglyph-metope frieze geometry, and curved stylobate masonry.',
    targetSection: 'concepts',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Fluted Doric Columns', detail: 'Columns with subtle entasis taper correcting the optical illusion of concavity' },
      { label: 'Triglyphs and Metopes', detail: 'Alternating Doric frieze panels carved above the horizontal architrave' },
      { label: 'Triangular Pediment', detail: 'Sloped gable roof framing monumental sculptural narratives' },
      { label: 'Curved Stylobate Platform', detail: 'Gently arched marble foundation countering visual sagging' },
    ],
  },
  {
    id: 'art-florence-duomo-brunelleschi',
    matchPatterns: [
      /\b(brunelleschi|florence duomo|cathedral dome|herringbone masonry|octagonal dome|renaissance architecture)\b/i,
    ],
    allowedSubjects: ['History & Governance', 'Literature & Humanities', 'Engineering & Applied Systems', 'General Studies'],
    requiredAnchorPattern: /\b(brunelleschi|duomo|herringbone|octagonal dome|cathedral)\b/i,
    discipline: 'Renaissance Art & Architectural Engineering',
    conceptTitle: 'Brunelleschi’s Double-Shell Masonry Dome Engineering',
    visualType: 'illustration',
    modality: 'photography',
    resolution: '4K',
    exactResolution: 'High-Resolution Architectural Plate',
    license: 'Open Academic Curriculum Asset',
    attribution: 'Brainstine Visual Learning Studio',
    imageUrl: '/edu-visuals/art-florence-duomo.jpg',
    caption:
      'Self-supporting octagonal double-shell dome constructed without wooden centering using interlocking herringbone brick courses and circumferential tension chains.',
    targetSection: 'concepts',
    aspectRatio: '16:9',
    verifiedLabels: [
      { label: 'Outer Octagonal Shell', detail: 'Lightweight protective shell shielding the vault from weathering' },
      { label: 'Inner Load-Bearing Vault', detail: 'Thick structural masonry core supporting the primary compressive forces' },
      { label: 'Herringbone Brick Courses', detail: 'Vertical locking bricks preventing inward ring slip during construction' },
      { label: 'Apex Marble Lantern', detail: 'Heavy crowning structure locking the eight structural ribs into equilibrium' },
    ],
  },
];

function cleanDiagramText(value: string, maxLen?: number): string {
  const cleaned = stripSummarySourceAndPageRefs(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!maxLen || cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Programmatically generates structured interactive vector diagram specifications
 * (process flows, concept maps, comparative matrices, variable models, candlestick charts)
 * strictly matching the subject matter of the extracted summary.
 */
export function generateProgrammaticDiagramSpec(
  summary: Partial<StructuredSummary>,
  _conceptHeading?: string
): EducationalDiagramSpec | null {
  const discipline = cleanDiagramText(summary.subjectArea || 'Academic Studies');
  const title = cleanDiagramText(summary.title || 'Study Topic');
  const fullSummaryCorpus = [
    summary.title || '',
    summary.subjectArea || '',
    summary.topicOverview || '',
    ...(summary.mainConcepts || []).map((c) => `${c.heading} ${c.sourcePoints.join(' ')}`),
    ...(summary.importantDefinitions || []).map((d) => `${d.term} ${d.definition}`),
    ...(summary.keyTerminology || []),
  ].join(' ');

  // 0. Domain-specific Financial Markets / Forex Candlestick & Support/Resistance Schematic
  const isForexOrChartDoc =
    /financial markets|forex/i.test(summary.subjectArea || '') ||
    /\b(candlestick|candlesticks|ohlc|doji|engulfing|pin bar|support and resistance|price action|forex|trendline|moving average|breakout|pip)\b/i.test(
      fullSummaryCorpus
    );

  if (
    isForexOrChartDoc &&
    /\b(candlestick|ohlc|doji|engulfing|pin bar|support|resistance|bullish|bearish|trendline|price action|open|high|low|close|wick|shadow)\b/i.test(
      fullSummaryCorpus
    )
  ) {
    const mentionsSupport = /\bsupport\b/i.test(fullSummaryCorpus);
    const mentionsResistance = /\bresistance\b/i.test(fullSummaryCorpus);
    const mentionsDoji = /\bdoji\b/i.test(fullSummaryCorpus);
    const mentionsEngulfing = /\bengulfing\b/i.test(fullSummaryCorpus);

    const nodes = [
      {
        id: 'candle-bull',
        label: 'Bullish Candle',
        sublabel: 'Close > Open',
        detail:
          'Price closed higher than it opened; lower and upper wicks trace the session low and high.',
        tone: 'success' as const,
      },
      {
        id: 'candle-bear',
        label: 'Bearish Candle',
        sublabel: 'Close < Open',
        detail:
          'Selling pressure pushed the closing price below the opening level within the timeframe.',
        tone: 'warning' as const,
      },
      {
        id: mentionsDoji ? 'candle-doji' : 'candle-wicks',
        label: mentionsDoji ? 'Doji Indecision' : 'Wicks / Shadows',
        sublabel: mentionsDoji ? 'Open ≈ Close' : 'High & Low Extremes',
        detail: mentionsDoji
          ? 'Small or flat real body where open and close are nearly equal, signaling market indecision.'
          : 'Thin vertical lines above and below the body showing rejected high and low price extremes.',
        tone: 'accent' as const,
      },
    ];

    if (mentionsSupport || mentionsResistance) {
      nodes.push({
        id: 'sr-zones',
        label: mentionsSupport && mentionsResistance ? 'Support & Resistance' : mentionsSupport ? 'Support Zone' : 'Resistance Zone',
        sublabel: mentionsEngulfing ? 'Reversal & Breakout Levels' : 'Key Price Barriers',
        detail:
          'Horizontal price zones where buying demand (support) or selling supply (resistance) repeatedly halts price movement.',
        tone: 'accent' as const,
      });
    }

    return {
      id: 'diag-forex-candlestick',
      type: 'candlestick_chart',
      title: `Market Structure & Candlestick Schematic: ${cleanDiagramText(title, 42)}`,
      subject: discipline,
      caption:
        'OHLC candlestick anatomy illustrating bullish vs. bearish sessions, upper/lower wicks, and structural price zones referenced in your study material.',
      nodes,
      candlestickSpec: {
        candles: [
          { label: 'C1', open: 1.0815, high: 1.0842, low: 1.0802, close: 1.0836, note: 'Bullish push from demand zone' },
          { label: 'C2', open: 1.0836, high: 1.0868, low: 1.0828, close: 1.0861, note: 'Continuation candle with upper wick test' },
          {
            label: mentionsDoji ? 'Doji' : 'C3',
            open: 1.0861,
            high: 1.0880,
            low: 1.0846,
            close: 1.0862,
            note: mentionsDoji ? 'Doji indecision candle near resistance' : 'Rejection candle near ceiling',
          },
          { label: 'C4', open: 1.0860, high: 1.0866, low: 1.0822, close: 1.0828, note: 'Bearish retracement toward support' },
          { label: 'C5', open: 1.0828, high: 1.0874, low: 1.0820, close: 1.0869, note: 'Bullish engulfing / bounce continuation' },
        ],
        ...(mentionsSupport ? { supportLevel: 1.0815, supportLabel: 'Support' } : {}),
        ...(mentionsResistance ? { resistanceLevel: 1.0876, resistanceLabel: 'Resistance' } : {}),
        timeframeLabel: 'Price (Illustrative OHLC Structure)',
        trendNote: mentionsEngulfing ? 'Includes Bullish Rejection / Engulfing Example' : 'OHLC Body & Wick Anatomy',
      },
    };
  }

  // 1. Process / Sequential Mechanism / Historical Chronology Diagram
  if (summary.processesAndMechanisms && summary.processesAndMechanisms.length > 0) {
    const proc = summary.processesAndMechanisms[0];
    const steps = proc.steps.slice(0, 6);
    if (steps.length >= 2) {
      const hasHistoricalYears = steps.some((s) =>
        /\b(1\d{3}|20\d{2}|bce|ce|century)\b/i.test(s)
      );
      const nodes = steps.map((stepText, idx) => {
        const cleanedStep = cleanDiagramText(stepText);
        const parts = cleanedStep.split(/[:—–-]/);
        const label = cleanDiagramText(parts[0], 36) || `Step ${idx + 1}`;
        const sub = parts.length > 1 ? cleanDiagramText(parts.slice(1).join(' '), 58) : undefined;
        return {
          id: `step-${idx + 1}`,
          label,
          sublabel: sub,
          detail: cleanedStep,
          tone: (idx === 0
            ? 'primary'
            : idx === steps.length - 1
              ? 'success'
              : 'neutral') as 'primary' | 'success' | 'neutral',
        };
      });

      const edges = nodes.slice(0, -1).map((n, i) => ({
        from: n.id,
        to: nodes[i + 1].id,
      }));

      return {
        id: `diag-proc-${nodes.length}`,
        type: 'process_flow',
        title: cleanDiagramText(
          proc.heading ||
            (hasHistoricalYears ? `Chronological Sequence: ${title}` : `Process Flow: ${title}`)
        ),
        subject: discipline,
        caption: hasHistoricalYears
          ? 'Chronological progression derived from the study material. Tap any stage to inspect full context.'
          : 'Step-by-step mechanism derived from the study material. Tap any block to inspect detailed notes.',
        nodes,
        edges,
      };
    }
  }

  // 2. Classifications and Types Concept Map
  if (summary.classificationsAndTypes && summary.classificationsAndTypes.length > 0) {
    const cls = summary.classificationsAndTypes[0];
    const rootLabel = cleanDiagramText(cls.topic, 32);
    const types = cls.types.slice(0, 5);
    if (types.length >= 2) {
      const rootNode = {
        id: 'node-root',
        label: rootLabel,
        sublabel: `${types.length} Key Classifications`,
        detail: cleanDiagramText(cls.overviewStatement),
        tone: 'primary' as const,
      };

      const childNodes = types.map((t, idx) => ({
        id: `type-${idx + 1}`,
        label: cleanDiagramText(t.name, 30),
        sublabel: cleanDiagramText(t.explanation, 54),
        detail: cleanDiagramText(t.explanation),
        tone: 'accent' as const,
      }));

      const nodes = [rootNode, ...childNodes];
      const edges = childNodes.map((c) => ({
        from: rootNode.id,
        to: c.id,
      }));

      return {
        id: `diag-cls-${types.length}`,
        type: 'concept_map',
        title: `Classification Framework: ${cleanDiagramText(cls.topic)}`,
        subject: discipline,
        caption: 'Hierarchical taxonomy comparing the identified categories and subtypes.',
        nodes,
        edges,
      };
    }
  }

  // 3. Important Distinctions Comparative Visual
  if (summary.importantDistinctions && summary.importantDistinctions.length > 0) {
    const dist = summary.importantDistinctions[0];
    const cleanPair = cleanDiagramText(dist.pairTitle);
    const parts = cleanPair.split(/\b(?:vs\.?|versus|and|contrasted with)\b/i);
    const colA = cleanDiagramText(parts[0] || 'Concept A', 32);
    const colB = cleanDiagramText(parts[1] || 'Concept B', 32);
    const cleanComparison = cleanDiagramText(dist.comparison);

    return {
      id: `diag-dist-${colA.length}-${colB.length}`,
      type: 'comparison_matrix',
      title: `Comparative Analysis: ${cleanPair}`,
      subject: discipline,
      caption: 'Direct comparison distilled from core distinctions in the material.',
      columns: ['Dimension', colA, colB],
      rows: [
        {
          label: 'Primary Focus',
          cells: [
            `${colA} mechanism & role`,
            `${colB} contrasting role`,
          ],
        },
        {
          label: 'Key Contrast',
          cells: [
            cleanComparison.slice(0, 140),
            cleanComparison.length > 140
              ? cleanComparison.slice(140, 280)
              : 'Distinct boundary condition',
          ],
        },
      ],
    };
  }

  // 4. Formula / Mathematical Model System Diagram
  if (summary.formulasOrFrameworks && summary.formulasOrFrameworks.length > 0) {
    const f = summary.formulasOrFrameworks[0];
    const variables = f.variables || [];
    if (variables.length >= 2) {
      const formulaNode = {
        id: 'f-core',
        label: cleanDiagramText(f.name, 30),
        sublabel: cleanDiagramText(f.expressionOrStructure, 40),
        detail: cleanDiagramText(f.usage || `Governing equation: ${f.expressionOrStructure}`),
        tone: 'primary' as const,
        x: 50,
        y: 34,
      };

      const slicedVars = variables.slice(0, 4);
      const varNodes = slicedVars.map((v, idx) => {
        const xSpread = slicedVars.length === 1 ? 50 : 18 + (idx / (slicedVars.length - 1)) * 64;
        return {
          id: `var-${idx}`,
          label: cleanDiagramText(v.symbol, 20),
          sublabel: cleanDiagramText(v.meaning, 42),
          detail: `${cleanDiagramText(v.symbol)}: ${cleanDiagramText(v.meaning)}`,
          tone: 'accent' as const,
          x: Math.round(xSpread),
          y: 74,
        };
      });

      const nodes = [formulaNode, ...varNodes];
      const edges = varNodes.map((v) => ({
        from: v.id,
        to: formulaNode.id,
        label: 'governs',
      }));

      return {
        id: `diag-math-${slicedVars.length}`,
        type: 'scientific_system',
        title: `Quantitative Model: ${cleanDiagramText(f.name)}`,
        subject: discipline,
        caption: `Structural relationship among variables in ${cleanDiagramText(f.expressionOrStructure)}.`,
        nodes,
        edges,
      };
    }
  }

  // 5. Default Main Concepts Conceptual Map
  if (summary.mainConcepts && summary.mainConcepts.length >= 2) {
    const concepts = summary.mainConcepts.slice(0, 4);

    const rootNode = {
      id: 'root-concept',
      label: cleanDiagramText(title, 32),
      sublabel: `${discipline} Overview`,
      detail: cleanDiagramText(summary.topicOverview || title, 180),
      tone: 'primary' as const,
    };

    const childNodes = concepts.map((c, idx) => ({
      id: `concept-${idx + 1}`,
      label: cleanDiagramText(c.heading, 30),
      sublabel: cleanDiagramText(c.sourcePoints[0] || 'Key Principle', 50),
      detail: cleanDiagramText(c.sourcePoints.slice(0, 2).join(' ') || c.heading),
      tone: 'neutral' as const,
    }));

    return {
      id: `diag-concept-${concepts.length}`,
      type: 'concept_map',
      title: `Conceptual Architecture: ${title}`,
      subject: discipline,
      caption: 'Core structural concepts synthesized from the study material.',
      nodes: [rootNode, ...childNodes],
      edges: childNodes.map((c) => ({ from: rootNode.id, to: c.id })),
    };
  }

  return null;
}

/**
 * Counts how strongly a curated visual matches a section or overall summary text.
 */
function scoreVisualMatch(text: string, patterns: RegExp[]): number {
  if (!text.trim()) return 0;
  let score = 0;
  for (const pattern of patterns) {
    const globalFlags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const matches = text.match(new RegExp(pattern.source, globalFlags));
    if (matches) {
      score += matches.length;
    }
  }
  return score;
}

/**
 * Extracts all prose corpus from a summary for visual relevance validation.
 */
function buildSummaryVisualCorpus(summary: Partial<StructuredSummary>): {
  titleAndSubject: string;
  bodyText: string;
} {
  const titleAndSubject = `${summary.title || ''} ${summary.subjectArea || ''}`;
  const bodyText = [
    summary.topicOverview || '',
    ...(summary.mainConcepts || []).map((c) => `${c.heading} ${c.sourcePoints.join(' ')}`),
    ...(summary.processesAndMechanisms || []).map((p) => `${p.heading} ${p.steps.join(' ')}`),
    ...(summary.classificationsAndTypes || []).map(
      (cls) => `${cls.topic} ${cls.types.map((t) => `${t.name} ${t.explanation}`).join(' ')}`
    ),
    ...(summary.importantDefinitions || []).map((d) => `${d.term} ${d.definition}`),
    ...(summary.keyTerminology || []),
  ].join(' ');
  return { titleAndSubject, bodyText };
}

function isSubjectCompatibleWithCuratedVisual(
  visual: CuratedEducationalVisual,
  detectedSubjectArea: string,
  fullText: string
): boolean {
  const normalizedSubject = (detectedSubjectArea || '').trim();
  const isGenericSubject =
    !normalizedSubject || normalizedSubject.toLowerCase() === 'general studies';

  // Hard ban: Finance/Trading/Economics/CS/Law/Math docs NEVER display anatomical heart/brain/kidney plates
  const isNonBiologicalFinanceOrTechDoc =
    /\b(forex|financial|trading|economics|accounting|finance|computer science|mathematics|law|legal)\b/i.test(
      normalizedSubject
    ) ||
    /\b(forex|candlestick|ohlc|currency pair|exchange rate|pip|pips|stop loss|take profit|price action|bollinger|macd|rsi)\b/i.test(
      fullText
    );

  if (
    isNonBiologicalFinanceOrTechDoc &&
    !visual.allowedSubjects.some((s) =>
      /\b(finance|forex|economics|computer|math|law|engineering)\b/i.test(s)
    )
  ) {
    return false;
  }

  if (!isGenericSubject) {
    const exactSubjectAllowed = visual.allowedSubjects.some(
      (allowed) => allowed.toLowerCase() === normalizedSubject.toLowerCase()
    );
    if (!exactSubjectAllowed) {
      return false;
    }
  }

  return visual.requiredAnchorPattern.test(fullText);
}

/**
 * Validates whether any curated OR persisted visual aid is genuinely relevant to the
 * given summary. Prevents stale/cross-subject images (e.g., heart anatomy in a Forex PDF)
 * from ever rendering even when loading previously saved summaries.
 */
export function isVisualAidRelevantToSummary(
  visualAid: SummaryVisualAid,
  summary: Partial<StructuredSummary>
): boolean {
  if (!visualAid) return false;
  // Programmatic algorithmic diagrams are derived directly from the document itself,
  // except validate that candlestick diagrams belong to chart/trading content.
  if (visualAid.modality === 'diagram' || visualAid.diagramSpec) {
    if (visualAid.diagramSpec?.type === 'candlestick_chart') {
      const { titleAndSubject, bodyText } = buildSummaryVisualCorpus(summary);
      return /\b(candlestick|ohlc|doji|engulfing|forex|support|resistance|price action|trendline|trading)\b/i.test(
        `${titleAndSubject} ${bodyText}`
      );
    }
    return true;
  }

  const matchedCurated = CURATED_EDUCATIONAL_VISUALS.find(
    (c) =>
      visualAid.id.includes(c.id) ||
      (visualAid.imageDataUrl && c.imageUrl === visualAid.imageDataUrl)
  );
  if (!matchedCurated) {
    return true;
  }

  const { titleAndSubject, bodyText } = buildSummaryVisualCorpus(summary);
  const fullText = `${titleAndSubject} ${bodyText}`;
  if (!isSubjectCompatibleWithCuratedVisual(matchedCurated, summary.subjectArea || '', fullText)) {
    return false;
  }

  const titleScore = scoreVisualMatch(titleAndSubject, matchedCurated.matchPatterns) * 2;
  const bodyScore = scoreVisualMatch(bodyText, matchedCurated.matchPatterns);
  return titleScore + bodyScore >= 2;
}

/**
 * Resolves the best matching section & index inside the summary so every visual aid
 * sits right alongside the exact section that explains it.
 */
function resolveTargetPlacement(
  item: CuratedEducationalVisual,
  summary: Partial<StructuredSummary>
): { targetSection: SummaryVisualTargetSection; targetIndex: number } {
  const concepts = summary.mainConcepts || [];
  const processes = summary.processesAndMechanisms || [];

  if (item.targetSection === 'processes' && processes.length > 0) {
    let bestProcIdx = 0;
    let bestProcScore = 0;
    processes.forEach((proc, idx) => {
      const score = scoreVisualMatch(`${proc.heading} ${proc.steps.join(' ')}`, item.matchPatterns);
      if (score > bestProcScore) {
        bestProcScore = score;
        bestProcIdx = idx;
      }
    });
    return { targetSection: 'processes', targetIndex: bestProcIdx };
  }

  if (concepts.length > 0) {
    let bestConceptIdx = 0;
    let bestConceptScore = 0;
    concepts.forEach((concept, idx) => {
      const score = scoreVisualMatch(
        `${concept.heading} ${concept.sourcePoints.join(' ')}`,
        item.matchPatterns
      );
      if (score > bestConceptScore) {
        bestConceptScore = score;
        bestConceptIdx = idx;
      }
    });
    if (bestConceptScore > 0 || item.targetSection !== 'overview') {
      return { targetSection: 'concepts', targetIndex: bestConceptIdx };
    }
  }

  if (summary.topicOverview) {
    return { targetSection: 'overview', targetIndex: 0 };
  }

  return { targetSection: 'concepts', targetIndex: 0 };
}

/**
 * Intelligent Concept Visual Evaluator
 * Evaluates the entire structured summary across all academic disciplines,
 * strictly validating discipline alignment before attaching any photography plate
 * and generating programmatic vector schematics tailored to the document's content.
 */
export function evaluateVisualLearningNeeds(
  summary: Partial<StructuredSummary>
): {
  visualAids: SummaryVisualAid[];
  visualDiagrams: EducationalDiagramSpec[];
} {
  const visualAids: SummaryVisualAid[] = [];
  const visualDiagrams: EducationalDiagramSpec[] = [];

  const { titleAndSubject, bodyText } = buildSummaryVisualCorpus(summary);
  const fullCorpus = `${titleAndSubject} ${bodyText}`;
  const detectedSubject = summary.subjectArea || '';
  const minThreshold =
    !detectedSubject || detectedSubject.toLowerCase() === 'general studies' ? 3 : 2;

  // 1. Score curated educational visuals strictly within compatible academic disciplines
  const scoredMatches = CURATED_EDUCATIONAL_VISUALS.filter((item) =>
    isSubjectCompatibleWithCuratedVisual(item, detectedSubject, fullCorpus)
  )
    .map((item) => {
      const titleScore = scoreVisualMatch(titleAndSubject, item.matchPatterns) * 2;
      const bodyScore = scoreVisualMatch(bodyText, item.matchPatterns);
      return { item, score: titleScore + bodyScore };
    })
    .filter((entry) => entry.score >= minThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  for (const { item, score } of scoredMatches) {
    const placement = resolveTargetPlacement(item, summary);
    visualAids.push({
      id: `visual-${item.id}-${placement.targetSection}-${placement.targetIndex}`,
      targetSection: placement.targetSection,
      targetIndex: placement.targetIndex,
      conceptTitle: item.conceptTitle,
      subjectDiscipline: item.discipline,
      visualType: item.visualType,
      necessityReason: `Relevant educational visual clarifying ${item.conceptTitle}`,
      visualScore: Math.min(99, 85 + Math.min(14, score * 2)),
      caption: item.caption,
      generationPrompt: item.conceptTitle,
      verifiedLabels: item.verifiedLabels,
      aspectRatio: item.aspectRatio,
      imageDataUrl: item.imageUrl,
      resolution: item.resolution,
      modelUsed: 'Brainstine Verified Educational Media Engine',
      generatedAt: new Date().toISOString(),
      license: item.license,
      attribution: item.attribution,
      exactResolution: item.exactResolution,
      modality: 'photography',
      diagramSpec: item.diagramSpec,
    });
  }

  // 2. Build structural interactive vector diagram strictly grounded in document content
  const primaryDiagram = generateProgrammaticDiagramSpec(summary);
  if (primaryDiagram) {
    visualDiagrams.push(primaryDiagram);

    if (visualAids.length === 0) {
      const fallbackSection: SummaryVisualTargetSection =
        primaryDiagram.type === 'candlestick_chart'
          ? summary.mainConcepts?.length
            ? 'concepts'
            : 'overview'
          : summary.processesAndMechanisms?.length
            ? 'processes'
            : summary.classificationsAndTypes?.length
              ? 'classifications'
              : summary.mainConcepts?.length
                ? 'concepts'
                : 'overview';

      visualAids.push({
        id: `diagram-aid-${primaryDiagram.id}`,
        targetSection: fallbackSection,
        targetIndex: 0,
        conceptTitle: primaryDiagram.title,
        subjectDiscipline: primaryDiagram.subject || summary.subjectArea || 'Academic Studies',
        visualType:
          primaryDiagram.type === 'process_flow'
            ? 'process_sequence'
            : primaryDiagram.type === 'comparison_matrix'
              ? 'comparative_visual'
              : 'diagram',
        necessityReason: 'Structured visual generated directly from your document concepts',
        visualScore: 90,
        caption: primaryDiagram.caption || 'Document concept schematic',
        generationPrompt: primaryDiagram.title,
        verifiedLabels: (primaryDiagram.nodes || []).map((n) => ({
          label: n.label,
          detail: n.detail || n.sublabel,
        })),
        aspectRatio: '16:9',
        imageDataUrl: '',
        resolution: '4K',
        exactResolution: 'Scalable Vector Schematic',
        modelUsed: 'Brainstine Algorithmic Vector Engine',
        generatedAt: new Date().toISOString(),
        license: 'Native Algorithmic Vector Asset',
        attribution: 'Brainstine Visual Learning Engine',
        modality: 'diagram',
        diagramSpec: primaryDiagram,
      });
    }
  }

  return { visualAids, visualDiagrams };
}

