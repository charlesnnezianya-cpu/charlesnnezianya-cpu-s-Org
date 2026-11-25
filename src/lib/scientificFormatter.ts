const SUBSCRIPT_DIGITS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
};

const SUPERSCRIPT_CHARS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  n: 'ⁿ',
  i: 'ⁱ',
};

const CHEMICAL_ELEMENTS = new Set([
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
  'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
  'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn',
  'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
  'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb',
  'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th',
  'Pa', 'U', 'Np', 'Pu', 'D',
]);

const DIATOMIC_ELEMENTS = new Set(['H', 'N', 'O', 'F', 'Cl', 'Br', 'I', 'P', 'S']);

const ACRONYM_EXCLUSIONS = new Set([
  'B2B', 'B2C', 'C2C', 'P2P', 'G20', 'G7', 'G8', 'S3', 'EC2', 'W3C',
  'HTTP2', 'HTTP3', 'IPV4', 'IPV6', 'O2O', 'COVID19', 'SARS2', 'H1N1',
  'K12', 'F1', 'V2', 'V3', 'V4',
]);

const KNOWN_BIO_CHEM_FORMULAS: Record<string, string> = {
  FADH2: 'FADH₂',
  NADH2: 'NADH₂',
  B12: 'B₁₂',
};

export function toSubscript(str: string): string {
  return str
    .split('')
    .map((ch) => SUBSCRIPT_DIGITS[ch] ?? ch)
    .join('');
}

export function toSuperscript(str: string): string {
  return str
    .split('')
    .map((ch) => SUPERSCRIPT_CHARS[ch] ?? ch)
    .join('');
}

function isValidChemicalToken(core: string): boolean {
  if (!core || ACRONYM_EXCLUSIONS.has(core.toUpperCase())) return false;
  if (KNOWN_BIO_CHEM_FORMULAS[core]) return true;

  // Exclude patterns like B2B or P2P
  if (/^([A-Z])\d+\1$/.test(core)) return false;

  // Must have at least one digit >= 2 (avoid matching H1N1, P1, etc.)
  if (!/[2-9]|\d{2,}/.test(core)) return false;

  // Single-element diatomic/polyatomic like O2, N2, H2, Cl2, O3, P4, S8
  const singleMatch = core.match(/^([A-Z][a-z]?)(\d+)$/);
  if (singleMatch) {
    const [, elem, num] = singleMatch;
    return DIATOMIC_ELEMENTS.has(elem) && ['2', '3', '4', '8'].includes(num);
  }

  // Multi-element or parenthesized chemical group validation
  let i = 0;
  let elementCount = 0;
  let hasParenGroup = false;

  while (i < core.length) {
    if (core[i] === '(') {
      const closeIdx = core.indexOf(')', i + 1);
      if (closeIdx === -1) return false;
      const inner = core.slice(i + 1, closeIdx);
      if (!inner || !validateElementSequence(inner)) return false;
      hasParenGroup = true;
      i = closeIdx + 1;
      while (i < core.length && /\d/.test(core[i])) i++;
      continue;
    }

    const rest = core.slice(i);
    const twoChar = rest.slice(0, 2);
    const oneChar = rest.slice(0, 1);

    if (/^[A-Z][a-z]$/.test(twoChar) && CHEMICAL_ELEMENTS.has(twoChar)) {
      elementCount++;
      i += 2;
    } else if (/^[A-Z]$/.test(oneChar) && CHEMICAL_ELEMENTS.has(oneChar)) {
      elementCount++;
      i += 1;
    } else {
      return false;
    }

    while (i < core.length && /\d/.test(core[i])) i++;
  }

  return (elementCount >= 2 || hasParenGroup) && i === core.length;
}

function validateElementSequence(seq: string): boolean {
  let i = 0;
  let count = 0;
  while (i < seq.length) {
    const rest = seq.slice(i);
    const twoChar = rest.slice(0, 2);
    const oneChar = rest.slice(0, 1);
    if (/^[A-Z][a-z]$/.test(twoChar) && CHEMICAL_ELEMENTS.has(twoChar)) {
      count++;
      i += 2;
    } else if (/^[A-Z]$/.test(oneChar) && CHEMICAL_ELEMENTS.has(oneChar)) {
      count++;
      i += 1;
    } else {
      return false;
    }
    while (i < seq.length && /\d/.test(seq[i])) i++;
  }
  return count >= 1;
}

function convertChemicalFormulaDigits(core: string): string {
  if (KNOWN_BIO_CHEM_FORMULAS[core]) return KNOWN_BIO_CHEM_FORMULAS[core];

  let out = '';
  for (let i = 0; i < core.length; i++) {
    const ch = core[i];
    if (/\d/.test(ch)) {
      out += SUBSCRIPT_DIGITS[ch] ?? ch;
    } else {
      out += ch;
    }
  }
  return out;
}

function replaceLatexCommands(text: string): string {
  return text
    .replace(/\\rightleftharpoons\b|\\leftrightharpoons\b/g, '⇌')
    .replace(/\\leftrightarrow\b/g, '↔')
    .replace(/\\rightarrow\b|\\to\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\Rightarrow\b/g, '⇒')
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\div\b/g, '÷')
    .replace(/\\pm\b/g, '±')
    .replace(/\\leq\b|\\le\b/g, '≤')
    .replace(/\\geq\b|\\ge\b/g, '≥')
    .replace(/\\neq\b|\\ne\b/g, '≠')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\propto\b/g, '∝')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\delta\b/g, 'δ')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\epsilon\b/g, 'ε')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\lambda\b/g, 'λ')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\rho\b/g, 'ρ')
    .replace(/\\sigma\b/g, 'σ')
    .replace(/\\Sigma\b/g, 'Σ')
    .replace(/\\tau\b/g, 'τ')
    .replace(/\\phi\b/g, 'φ')
    .replace(/\\omega\b/g, 'ω')
    .replace(/\\Omega\b/g, 'Ω')
    .replace(/\\sqrt\{([^{}]{1,40})\}/g, '√($1)')
    .replace(/\\frac\{([^{}]{1,25})\}\{([^{}]{1,25})\}/g, '($1)/($2)');
}

/**
 * Formats chemical formulas, ionic charges, physical units, exponents, and mathematical operators
 * into crisp Unicode notation without altering prose numbers, page numbers, or scientific meaning.
 */
export function formatScientificText(input: string): string {
  if (!input || typeof input !== 'string') return '';

  let text = input;

  // Unwrap inline LaTeX delimiters $...$ while preserving currency like $50 or $12.50
  text = text.replace(/\$(?!\d[\d,.]*(?:\s|$|[,.;:!?)]))(?!\s)([^$\n]{1,140}?)\$/g, '$1');

  text = replaceLatexCommands(text);

  // Convert reaction arrows and comparison operators when bounded sensibly
  text = text
    .replace(/\s<=>\s/g, ' ⇌ ')
    .replace(/\s<->\s/g, ' ↔ ')
    .replace(/\s-->\s|\s->\s/g, ' → ')
    .replace(/\s=>\s/g, ' ⇒ ')
    .replace(/\s\+\/-\s/g, ' ± ')
    .replace(/(^|\s)<=(\s|$)/g, '$1≤$2')
    .replace(/(^|\s)>=(\s|$)/g, '$1≥$2')
    .replace(/(^|\s)!=(\s|$)/g, '$1≠$2')
    .replace(/(\d+(?:\.\d+)?)\s*[xX*]\s*10\^/g, '$1 × 10^');

  // Convert braced exponents: ^{2}, ^{-3}, ^{2+}, ^{n}
  text = text.replace(/\^\{([0-9+\-ni]+)\}/g, (_, exp: string) => toSuperscript(exp));

  // Convert common braced subscripts: _{2}, _{12}, _{0}
  text = text.replace(/_\{([0-9+\-]+)\}/g, (_, sub: string) => toSubscript(sub));

  // Convert numeric/ionic exponents: ^2, ^3, ^-1, ^-2, ^-3, ^2+, ^2-, ^3+, ^+, ^-, ^n
  text = text.replace(
    /([A-Za-z0-9)\]])\^([+-]?\d+[+-]?|[+-]|n)(?=$|[\s),.;:!?\]+→⇌])/g,
    (_, base: string, exp: string) => `${base}${toSuperscript(exp)}`
  );

  // Convert simple numeric subscripts like H_2O or v_0 -> H₂O, v₀
  text = text.replace(/\b([A-Za-z][A-Za-z0-9]*)_(\d+)\b/g, (_, base: string, digits: string) => {
    return `${base}${toSubscript(digits)}`;
  });

  // Convert chemical formula tokens (with optional leading stoichiometric coefficient e.g. 6CO2, 2H2O)
  text = text.replace(
    /(^|[\s([=+→⇌,])(\d*)([A-Z](?:[A-Za-z0-9()]){1,24})(?=[\s)\],.;:!?+→⇌⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹]|$)/g,
    (full, prefix: string, coeff: string, core: string) => {
      if (isValidChemicalToken(core)) {
        return `${prefix}${coeff}${convertChemicalFormulaDigits(core)}`;
      }
      return full;
    }
  );

  // Convert standard unit powers written without caret if standard metric (e.g. m/s2 -> m/s², cm3 -> cm³? Only safe unit/exponent forms like m/s^2 were already handled; handle m/s2 explicitly)
  text = text.replace(/\b(m\/s|km\/h|cm|mm|km|dm)([23])\b/g, (_, unit: string, exp: string) => {
    return `${unit}${toSuperscript(exp)}`;
  });

  return text;
}
