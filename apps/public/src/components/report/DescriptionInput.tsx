import React, { useMemo } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

interface DescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

// Client-side PII detection patterns matching server-side guardrails
const NIGERIAN_PHONE_LOCAL_REGEX = /(?:^|[^0-9+])(0[789][01](?:[\s-]?\d){8})(?:[^0-9]|$)/;
const NIGERIAN_PHONE_INTL_REGEX = /(?:^|[^0-9+])((?:\+?234|00234)[\s-]?[789][01](?:[\s-]?\d){8})(?:[^0-9]|$)/;
const NIGERIAN_PHONE_BARE_234_REGEX = /(?:^|[^0-9+])(234[\s-]?[789][01](?:[\s-]?\d){8})(?:[^0-9]|$)/;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const YABATECH_MATRIC_FORMAT_REGEX = /\b(?:[FPfp]\s*\/\s*)?(?:ND|HD|HND|OND|BS|PT|FT)\s*\/\s*\d{2,4}\s*\/\s*\d{4,8}\b/i;
const MATRIC_KEYWORD_REGEX = /\b(?:matric(?:\.|\s+no\.?)?[\s:]+)([A-Za-z0-9/_-]{6,20})\b/i;

export function checkDescriptionPii(text: string): { hasPii: boolean; message?: string } {
  if (!text) return { hasPii: false };
  if (
    NIGERIAN_PHONE_LOCAL_REGEX.test(text) ||
    NIGERIAN_PHONE_INTL_REGEX.test(text) ||
    NIGERIAN_PHONE_BARE_234_REGEX.test(text)
  ) {
    return {
      hasPii: true,
      message: 'Personal phone number detected. Please remove personal contact numbers before submitting.',
    };
  }
  if (EMAIL_REGEX.test(text)) {
    return {
      hasPii: true,
      message: 'Personal email address detected. Please remove email addresses before submitting.',
    };
  }
  if (YABATECH_MATRIC_FORMAT_REGEX.test(text) || MATRIC_KEYWORD_REGEX.test(text)) {
    return {
      hasPii: true,
      message: 'Student matriculation number detected. Please remove matric numbers before submitting.',
    };
  }
  return { hasPii: false };
}

export const DescriptionInput: React.FC<DescriptionInputProps> = ({ value, onChange, error }) => {
  const charCount = value.length;
  const isTooShort = charCount > 0 && charCount < 5;
  const isNearLimit = charCount > 900;

  const piiResult = useMemo(() => checkDescriptionPii(value), [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor="incident-description" className="text-base font-bold text-[#0d2c20]">
          4. Incident Description <span className="text-rose-600">*</span>
        </label>
        <span
          className={`text-xs font-mono ${
            isNearLimit ? 'text-amber-700 font-semibold' : 'text-[#52635a]'
          }`}
        >
          {charCount}/1000
        </span>
      </div>

      {/* Pre-submission Public Safety Notice */}
      <div className="bg-[#edf6ef] border border-[#174b32]/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-[#174b32]">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong className="font-semibold">Public Notice:</strong> Descriptions are published immediately to campus safety maps. Do not include personal phone numbers, emails, matriculation numbers, or private identities.
        </p>
      </div>

      <div className="bg-white border border-[#14221b]/10 rounded-2xl p-4 sm:p-5 space-y-2 shadow-2xs">
        <textarea
          id="incident-description"
          rows={4}
          maxLength={1000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Describe what you see: active flames, electrical sparks, physical injuries, collapsed building walkway..."
          aria-describedby={error || piiResult.hasPii ? 'description-error' : 'description-hint'}
          aria-invalid={!!error || piiResult.hasPii}
          className={`w-full p-3.5 bg-[#f4f4ec] border ${
            piiResult.hasPii
              ? 'border-amber-500 focus-visible:ring-amber-500'
              : 'border-[#14221b]/15 focus-visible:ring-[#174b32]'
          } rounded-xl text-sm text-[#0d2c20] placeholder:text-[#52635a] focus:bg-white focus-visible:ring-2 focus-visible:outline-hidden transition-all resize-y min-h-[110px]`}
        />

        {/* Real-time Inline PII Warning */}
        {piiResult.hasPii && (
          <div
            role="alert"
            className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 font-medium"
          >
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            <span>{piiResult.message}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-[#52635a]">
          <span id="description-hint">
            Minimum 5 characters. Keep descriptions factual and anonymous.
          </span>
          {isTooShort && (
            <span className="text-amber-700 font-medium">At least 5 characters required</span>
          )}
        </div>

        {error && (
          <p
            id="description-error"
            className="text-xs font-semibold text-rose-600 mt-1"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
};
