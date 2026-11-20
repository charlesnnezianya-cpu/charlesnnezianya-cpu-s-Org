export type EducationalVisualKey =
  | 'hero'
  | 'summarizer'
  | 'tutor'
  | 'chatbot'
  | 'quiz'
  | 'biology'
  | 'chemistry'
  | 'physics_math'
  | 'medicine_anatomy'
  | 'humanities_geo';

export interface EducationalVisualAsset {
  key: EducationalVisualKey;
  src: string;
  alt: string;
  subjectLabel: string;
  caption: string;
  fallbackGradient: string;
}

export const EDUCATIONAL_VISUALS: Record<EducationalVisualKey, EducationalVisualAsset> = {
  hero: {
    key: 'hero',
    src: '/src/assets/images/hero_academic_study_1795007734160.jpg',
    alt: 'Sunlit university desk with open notebook and tablet displaying structured study notes',
    subjectLabel: 'Academic Companion',
    caption: 'Structured digital learning across uploaded notes, books, and recordings',
    fallbackGradient: 'from-[#0F1E3D] via-[#1E3A8A] to-[#0284C7]',
  },
  summarizer: {
    key: 'summarizer',
    src: '/src/assets/images/academic_material_synthesis_1795007733268.jpg',
    alt: 'Organized study sheets, textbooks, and structured academic summary cards on a clean desk',
    subjectLabel: 'Material Synthesis',
    caption: 'Structured textbook distillation with definitions, tables, and visual schematics',
    fallbackGradient: 'from-[#0F1E3D] via-[#1D4ED8] to-[#0369A1]',
  },
  tutor: {
    key: 'tutor',
    src: '/src/assets/images/tutor_mentor_studio_1795175718194.jpg',
    alt: 'Personal tutoring study desk featuring orbital diagrams on a tablet, glass prism, and open notebook',
    subjectLabel: 'Personal AI Tutor',
    caption: 'Guided step-by-step mastery adapted to Beginner, Standard, and Advanced depth',
    fallbackGradient: 'from-[#0B162E] via-[#0F766E] to-[#0284C7]',
  },
  chatbot: {
    key: 'chatbot',
    src: '/src/assets/images/chatbot_academic_inquiry_1795175722755.jpg',
    alt: 'Academic research desk with translucent molecular model, open reference atlas, and warm lamp',
    subjectLabel: 'Academic Inquiry',
    caption: 'Context-grounded Q&A with equations, visual diagrams, and photo interpretation',
    fallbackGradient: 'from-[#0F1E3D] via-[#3730A3] to-[#1D4ED8]',
  },
  quiz: {
    key: 'quiz',
    src: '/src/assets/images/quiz_assessment_desk_1795175721825.jpg',
    alt: 'Clean assessment preparation desk with examination folio, drafting compass, and hourglass',
    subjectLabel: 'Assessment Studio',
    caption: 'Practice and timed examination engine with full question-by-question feedback',
    fallbackGradient: 'from-[#0F1E3D] via-[#1E40AF] to-[#0F766E]',
  },
  biology: {
    key: 'biology',
    src: '/src/assets/images/edu_subject_biology_1795175722606.jpg',
    alt: '3D scientific illustration of a eukaryotic cell cross-section showing mitochondria, nucleus, and ATP pathways',
    subjectLabel: 'Biological & Life Sciences',
    caption: 'Cellular organelles, bioenergetics, and metabolic pathways',
    fallbackGradient: 'from-[#0C4A6E] via-[#0F766E] to-[#0284C7]',
  },
  chemistry: {
    key: 'chemistry',
    src: '/src/assets/images/edu_subject_chemistry_1795175721700.jpg',
    alt: '3D scientific studio rendering of crystalline molecular lattices and volumetric laboratory glassware',
    subjectLabel: 'Chemistry & Molecular Science',
    caption: 'Molecular bonding, crystalline structures, and quantitative stoichiometry',
    fallbackGradient: 'from-[#0F1E3D] via-[#1D4ED8] to-[#0891B2]',
  },
  physics_math: {
    key: 'physics_math',
    src: '/src/assets/images/edu_subject_physics_math_1795175722093.jpg',
    alt: 'Scientific visualization of optical glass prism dispersion, brass gyroscope rings, and wave geometry',
    subjectLabel: 'Physics, Mathematics & Engineering',
    caption: 'Optics, mechanics, harmonic equations, and formal derivations',
    fallbackGradient: 'from-[#0B162E] via-[#1E293B] to-[#1D4ED8]',
  },
  medicine_anatomy: {
    key: 'medicine_anatomy',
    src: '/src/assets/images/edu_subject_medicine_anatomy_1795175720511.jpg',
    alt: 'Medical anatomical illustration of human cardiopulmonary vessels, bronchial airways, and ribcage structure',
    subjectLabel: 'Medicine & Human Anatomy',
    caption: 'Cardiopulmonary circulation, physiological systems, and clinical structure',
    fallbackGradient: 'from-[#1E293B] via-[#9F1239] to-[#1D4ED8]',
  },
  humanities_geo: {
    key: 'humanities_geo',
    src: '/src/assets/images/edu_subject_humanities_geo_1795175722201.jpg',
    alt: 'Terrestrial globe beside a topographic relief map, brass calipers, and archival history books',
    subjectLabel: 'Geography, History & Social Sciences',
    caption: 'Spatial geography, historical synthesis, macroeconomics, and global frameworks',
    fallbackGradient: 'from-[#1E293B] via-[#78350F] to-[#0F1E3D]',
  },
};

export function resolveSubjectVisualKey(
  subjectOrTopic?: string | null,
  fallback: EducationalVisualKey = 'summarizer'
): EducationalVisualKey {
  const q = (subjectOrTopic || '').toLowerCase();
  if (!q.trim()) return fallback;

  if (
    /\b(anatomy|cardio|heart|lung|pulmonary|physiology|medicine|medical|clinical|dentistry|neural|nervous|renal|kidney|blood|muscle|skeleton|pathology|pharmacology|organ|vascular|respiratory)\b/.test(
      q
    )
  ) {
    return 'medicine_anatomy';
  }

  if (
    /\b(biology|bio|cell|cellular|mitochondria|dna|rna|genetics|photosynthesis|respiration|enzyme|organism|botany|zoology|microbiology|ecology|evolution|protein|xylem|phloem|mitosis|meiosis)\b/.test(
      q
    )
  ) {
    return 'biology';
  }

  if (
    /\b(chemistry|chem|organic|inorganic|molecule|molecular|atom|atomic|stoichiometry|acid|base|ph|titration|enthalpy|entropy|orbital|covalent|ionic|periodic|polymer|reaction|catalyst)\b/.test(
      q
    )
  ) {
    return 'chemistry';
  }

  if (
    /\b(physics|math|mathematics|calculus|algebra|geometry|trigonometry|mechanics|thermodynamics|optics|quantum|relativity|electromagnetism|circuit|wave|kinematics|statistics|probability|engineering|computer|algorithm|matrix|vector)\b/.test(
      q
    )
  ) {
    return 'physics_math';
  }

  if (
    /\b(geography|history|economics|macroeconomics|microeconomics|politics|government|sociology|philosophy|literature|law|ethics|geology|climate|earth|map|cartography|civilization|keynesian)\b/.test(
      q
    )
  ) {
    return 'humanities_geo';
  }

  return fallback;
}

export function resolveSubjectVisual(
  subjectOrTopic?: string | null,
  fallback: EducationalVisualKey = 'summarizer'
): EducationalVisualAsset {
  const key = resolveSubjectVisualKey(subjectOrTopic, fallback);
  return EDUCATIONAL_VISUALS[key];
}

export function hasSubjectVisualMatch(subjectOrTopic?: string | null): boolean {
  const resolved = resolveSubjectVisualKey(subjectOrTopic, 'hero');
  return resolved !== 'hero';
}
