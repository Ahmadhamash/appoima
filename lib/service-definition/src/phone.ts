import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import metadata from 'libphonenumber-js/metadata.max.json';

export type PhoneCountry = CountryCode;
export const PHONE_COUNTRIES = getCountries();
export const DEFAULT_PHONE_COUNTRY: PhoneCountry = 'JO';
export function asciiPhoneDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0)));
}
export function phoneRules(country: PhoneCountry) {
  // libphonenumber's published metadata: [callingCode, idd, pattern, lengths, formats, nationalPrefix].
  const row = (metadata.countries as unknown as Record<string, unknown[]>)[country]!;
  const callingCode = getCountryCallingCode(country);
  const lengths = (row[3] as number[]).filter(length => length <= 15 - callingCode.length);
  return { callingCode, lengths, maxDigits: Math.max(...lengths), nationalPrefix: typeof row[5] === 'string' && /^\d+$/.test(row[5]) ? row[5] : '' };
}
/** Strict input parsing: never extract a number from prose or accept extensions/vanity text. */
export function normalizePhone(value: string, country: PhoneCountry = DEFAULT_PHONE_COUNTRY): string | null {
  const raw = asciiPhoneDigits(value.trim());
  if (!raw || raw.length > 50 || !/^\+?[\d ()-]+$/.test(raw)) return null;
  const input = raw.startsWith('00') ? '+' + raw.slice(2) : raw;
  const phone = parsePhoneNumberFromString(input, { defaultCountry: country, extract: false });
  return phone?.isValid() && !phone.ext ? phone.number : null;
}
export function splitPhone(value: string, fallback: PhoneCountry = DEFAULT_PHONE_COUNTRY) {
  const raw = asciiPhoneDigits(value.trim());
  const international = raw.startsWith('00') ? '+' + raw.slice(2) : raw;
  const phone = /^[+\d ()-]*$/.test(raw) ? parsePhoneNumberFromString(international, { defaultCountry: fallback, extract: false }) : undefined;
  const callingCodes = metadata.country_calling_codes as Record<string, PhoneCountry[]>;
  const code = phone?.countryCallingCode ?? (international.startsWith('+') ? Object.keys(callingCodes).find(code => international.slice(1).startsWith(code)) : undefined);
  const country = phone?.country ?? (code ? phoneRules(fallback).callingCode === code ? fallback : callingCodes[code]?.[0] : undefined) ?? fallback;
  const digits = phone?.nationalNumber ?? (international.startsWith('+' + phoneRules(country).callingCode) ? international.slice(phoneRules(country).callingCode.length + 1) : international).replace(/\D/g, '');
  return { country, digits: String(digits) };
}
export function nationalPhoneDigits(value: string, country: PhoneCountry): string {
  let digits = asciiPhoneDigits(value).replace(/\D/g, '');
  const { nationalPrefix, maxDigits } = phoneRules(country);
  if (nationalPrefix && digits.startsWith(nationalPrefix)) digits = digits.slice(nationalPrefix.length);
  return digits.slice(0, maxDigits);
}
