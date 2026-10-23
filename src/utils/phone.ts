/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sanitizes phone input to numbers only.
 */
export function sanitizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Applies standard Brazilian mobile/landline phone mask.
 * 10 digits: (XX) XXXX-XXXX
 * 11 digits: (XX) XXXXX-XXXX
 */
export function formatBrazilianPhone(value: string): string {
  const digits = sanitizePhone(value).slice(0, 11);
  if (!digits) return '';

  if (digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Validates if the phone number has minimum Brazilian length (10 or 11 digits).
 */
export function isValidBrazilianPhone(value: string): boolean {
  const digits = sanitizePhone(value);
  return digits.length === 10 || digits.length === 11;
}
