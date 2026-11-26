import React from 'react';
import { CATEGORY_CATALOGUE, IncidentCategory } from '@yctalert/contracts';
import { Flame, HeartPulse, TriangleAlert, ShieldAlert, AlertCircle, Check } from 'lucide-react';

interface CategorySelectorProps {
  value: IncidentCategory | null;
  onChange: (category: IncidentCategory) => void;
  error?: string;
}

const CATEGORY_ICONS: Record<IncidentCategory, React.ReactElement> = {
  FIRE_OR_SMOKE: <Flame className="w-5 h-5" aria-hidden="true" />,
  MEDICAL_EMERGENCY: <HeartPulse className="w-5 h-5" aria-hidden="true" />,
  PHYSICAL_HAZARD: <TriangleAlert className="w-5 h-5" aria-hidden="true" />,
  SECURITY_INCIDENT: <ShieldAlert className="w-5 h-5" aria-hidden="true" />,
  OTHER_URGENT: <AlertCircle className="w-5 h-5" aria-hidden="true" />,
};

const URGENCY_STYLES: Record<string, { badge: string; border: string }> = {
  CRITICAL: {
    badge: 'bg-rose-100 text-rose-800 border-rose-200',
    border: 'hover:border-rose-300',
  },
  HIGH: {
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    border: 'hover:border-amber-300',
  },
  MEDIUM: {
    badge: 'bg-slate-100 text-slate-800 border-slate-200',
    border: 'hover:border-slate-300',
  },
};

export const CategorySelector: React.FC<CategorySelectorProps> = ({ value, onChange, error }) => {
  const categories = Object.values(CATEGORY_CATALOGUE);

  return (
    <fieldset className="space-y-3" aria-describedby={error ? 'category-error' : undefined}>
      <div className="flex items-baseline justify-between">
        <legend className="text-base font-bold text-[#0d2c20]">
          1. Incident Category <span className="text-rose-600">*</span>
        </legend>
        <span className="text-xs text-[#52635a]">Choose one</span>
      </div>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        role="radiogroup"
        aria-label="Incident Categories"
      >
        {categories.map((cat) => {
          const isSelected = value === cat.code;
          const urgency = URGENCY_STYLES[cat.urgencyLevel] || URGENCY_STYLES.MEDIUM;

          return (
            <label
              key={cat.code}
              className={`relative flex flex-col justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all min-h-[96px]
                has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#174b32] has-[:focus-visible]:outline-hidden
                ${
                  isSelected
                    ? 'border-[#174b32] bg-[#edf6ef] shadow-xs'
                    : `border-[#14221b]/10 bg-white hover:bg-[#fafaf7] ${urgency.border}`
                }`}
            >
              {/* Accessible Native Radio Input */}
              <input
                type="radio"
                name="incident_category"
                value={cat.code}
                checked={isSelected}
                onChange={() => onChange(cat.code)}
                className="sr-only"
                aria-describedby={`desc-${cat.code}`}
              />

              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`p-2 rounded-xl transition-colors ${
                      isSelected ? 'bg-[#174b32] text-white' : 'bg-[#f4f4ec] text-[#174b32]'
                    }`}
                  >
                    {CATEGORY_ICONS[cat.code]}
                  </div>
                  <span className="text-sm font-bold text-[#0d2c20] leading-tight">
                    {cat.label}
                  </span>
                </div>

                {isSelected ? (
                  <div
                    className="w-5 h-5 rounded-full bg-[#174b32] text-white flex items-center justify-center shrink-0 mt-0.5"
                    aria-hidden="true"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                ) : (
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${urgency.badge}`}
                  >
                    {cat.urgencyLevel}
                  </span>
                )}
              </div>

              <p id={`desc-${cat.code}`} className="text-xs text-[#52635a] mt-2 leading-relaxed">
                {cat.description}
              </p>
            </label>
          );
        })}
      </div>

      {error && (
        <p id="category-error" className="text-xs font-semibold text-rose-600 mt-1.5" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
};
