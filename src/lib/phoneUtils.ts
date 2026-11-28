import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';

export interface CountryOption {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  NG: 'Nigeria',
  CA: 'Canada',
  AU: 'Australia',
  IN: 'India',
  DE: 'Germany',
  FR: 'France',
  JP: 'Japan',
  BR: 'Brazil',
  ZA: 'South Africa',
  KE: 'Kenya',
  GH: 'Ghana',
  TZ: 'Tanzania',
  UG: 'Uganda',
  RW: 'Rwanda',
  EG: 'Egypt',
  MA: 'Morocco',
  ES: 'Spain',
  IT: 'Italy',
  MX: 'Mexico',
  AR: 'Argentina',
  CO: 'Colombia',
  CN: 'China',
  KR: 'South Korea',
  SG: 'Singapore',
  MY: 'Malaysia',
  PH: 'Philippines',
  ID: 'Indonesia',
  VN: 'Vietnam',
  TH: 'Thailand',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  IL: 'Israel',
  TR: 'Turkey',
  NL: 'Netherlands',
  SE: 'Sweden',
  CH: 'Switzerland',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  PL: 'Poland',
  IE: 'Ireland',
  NZ: 'New Zealand',
};

function getCountryName(countryCode: string): string {
  if (COUNTRY_NAMES[countryCode]) return COUNTRY_NAMES[countryCode];
  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
    return displayNames.of(countryCode) || countryCode;
  } catch {
    return countryCode;
  }
}

function getEmojiFlag(countryCode: string): string {
  try {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  } catch {
    return '🌍';
  }
}

export function getAllCountries(): CountryOption[] {
  try {
    const codes = getCountries();
    return codes
      .map((code) => {
        let dial = '1';
        try {
          dial = getCountryCallingCode(code as any);
        } catch {
          dial = '1';
        }
        return {
          code,
          name: getCountryName(code),
          dialCode: `+${dial}`,
          flag: getEmojiFlag(code),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [
      { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
      { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
      { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬' },
      { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
      { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
    ];
  }
}

export function validateAndFormatInternationalPhone(
  nationalNumber: string,
  countryCode: string
): { isValid: boolean; e164: string | null; error?: string } {
  const trimmed = nationalNumber.trim();
  if (!trimmed) {
    return { isValid: false, e164: null, error: 'Please enter a phone number.' };
  }
  try {
    const parsed = parsePhoneNumberFromString(trimmed, countryCode as any);
    if (!parsed || !parsed.isValid()) {
      return { isValid: false, e164: null, error: 'Please enter a valid phone number for the selected country.' };
    }
    return { isValid: true, e164: parsed.format('E.164') };
  } catch {
    try {
      const parsedAny = parsePhoneNumberFromString(trimmed);
      if (parsedAny && parsedAny.isValid()) {
        return { isValid: true, e164: parsedAny.format('E.164') };
      }
    } catch {}
    return { isValid: false, e164: null, error: 'Please enter a valid phone number.' };
  }
}
