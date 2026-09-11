/**
 * Centralized duplicate identity logic.
 *
 * Normalization rules:
 * - Phone: strip non-digits, strip leading country code (91 for India)
 * - Vehicle/License/DL: uppercase, strip whitespace and hyphens
 *
 * The duplicate key for a record is computed deterministically from its
 * fields. Two records with the same key are considered duplicates.
 */

export function normalizePhone(phone: string): string {
  let digits = phone.replace(/[^0-9]/g, "");
  // Strip leading country code 91 if length > 10
  if (digits.length > 10 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  // Strip a single leading 0
  if (digits.length > 10 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits;
}

export function normalizeVehicle(v: string): string {
  return v.toUpperCase().replace(/[\s-]/g, "");
}

export function normalizeLicense(v: string): string {
  return v.toUpperCase().replace(/[\s-]/g, "");
}

export function normalizeText(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Duplicate key for normal product leads/directory entries.
 * Based on normalized phone + product_id.
 */
export function normalDupKey(phone: string, productId: string): string {
  return `${normalizePhone(phone)}::${productId}`;
}

/**
 * Duplicate key for HC leads.
 * Based on normalized phone + product_id (HC product).
 * Vehicle/DL could also be used but phone is the primary identifier.
 */
export function hcDupKey(phone: string, productId: string): string {
  return `${normalizePhone(phone)}::${productId}`;
}

/**
 * Batch duplicate detection within a single uploaded file.
 * Returns a map from row index to boolean isInternalDuplicate.
 */
export function findInternalDuplicates<T extends { phone: string; product_id?: string }>(
  rows: T[],
  productId: string
): Map<number, boolean> {
  const seen = new Set<string>();
  const result = new Map<number, boolean>();
  rows.forEach((row, idx) => {
    const key = normalDupKey(row.phone, productId);
    if (seen.has(key)) {
      result.set(idx, true);
    } else {
      seen.add(key);
      result.set(idx, false);
    }
  });
  return result;
}
