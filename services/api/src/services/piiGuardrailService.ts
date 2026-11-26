export type PiiViolationType = 'PHONE_NUMBER' | 'EMAIL_ADDRESS' | 'MATRICULATION_NUMBER';

export interface PiiDetectionResult {
  hasPii: boolean;
  violationType?: PiiViolationType;
  message?: string;
}

/**
 * Regular expressions for personal identifier detection in public incident summaries.
 * Designed to capture obvious personal identifiers while avoiding false positives on
 * common campus descriptions (e.g., room numbers, building names, distances, timestamps).
 */

// Nigerian phone numbers:
// 1. Local 11-digit starting with 070, 071, 080, 081, 090, 091 (with optional spaces/dashes)
const NIGERIAN_PHONE_LOCAL_REGEX = /(?:^|[^0-9+])(0[789][01](?:[\s-]?\d){8})(?:[^0-9]|$)/;

// 2. International prefix +234, 00234, or 234 followed by 70, 71, 80, 81, 90, 91 and 8 digits
const NIGERIAN_PHONE_INTL_REGEX =
  /(?:^|[^0-9+])((?:\+?234|00234)[\s-]?[789][01](?:[\s-]?\d){8})(?:[^0-9]|$)/;

const NIGERIAN_PHONE_BARE_234_REGEX =
  /(?:^|[^0-9+])(234[\s-]?[789][01](?:[\s-]?\d){8})(?:[^0-9]|$)/;

// Email addresses
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

// YABATECH student matriculation numbers:
// Standard format: F/ND/21/3210001, P/HD/20/3110042, ND/21/3210001, etc.
const YABATECH_MATRIC_FORMAT_REGEX =
  /\b(?:[FPfp]\s*\/\s*)?(?:ND|HD|HND|OND|BS|PT|FT)\s*\/\s*\d{2,4}\s*\/\s*\d{4,8}\b/i;

// Keyword format: "Matric No: ...", "Matric: ..."
const MATRIC_KEYWORD_REGEX = /\b(?:matric(?:\.|\s+no\.?)?[\s:]+)([A-Za-z0-9/_-]{6,20})\b/i;

/**
 * Detects prohibited personal identifiers in a proposed public-safe summary.
 *
 * CRITICAL SAFEGUARDS:
 * - Rejects summaries containing phone numbers, emails, or student matriculation numbers.
 * - NEVER echoes or returns the detected personal data.
 * - Does NOT log the offending text or matched identifiers.
 */
export function detectPublicSummaryPii(summary: string): PiiDetectionResult {
  if (!summary || typeof summary !== 'string') {
    return { hasPii: false };
  }

  // 1. Phone number check
  if (
    NIGERIAN_PHONE_LOCAL_REGEX.test(summary) ||
    NIGERIAN_PHONE_INTL_REGEX.test(summary) ||
    NIGERIAN_PHONE_BARE_234_REGEX.test(summary)
  ) {
    return {
      hasPii: true,
      violationType: 'PHONE_NUMBER',
      message:
        'Proposed public summary contains personal contact information (phone number detected). Public safety summaries must remain anonymous and safe for public broadcast.',
    };
  }

  // 2. Email address check
  if (EMAIL_REGEX.test(summary)) {
    return {
      hasPii: true,
      violationType: 'EMAIL_ADDRESS',
      message:
        'Proposed public summary contains personal contact information (email address detected). Public safety summaries must remain anonymous and safe for public broadcast.',
    };
  }

  // 3. Student matriculation number check
  if (YABATECH_MATRIC_FORMAT_REGEX.test(summary) || MATRIC_KEYWORD_REGEX.test(summary)) {
    return {
      hasPii: true,
      violationType: 'MATRICULATION_NUMBER',
      message:
        'Proposed public summary contains student identity information (matriculation number detected). Public safety summaries must remain anonymous and safe for public broadcast.',
    };
  }

  return { hasPii: false };
}
