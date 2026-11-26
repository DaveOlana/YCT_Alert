import React, { useState } from 'react';
import { FileEdit, X, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ReviseSummaryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: { safe_summary: string; reason: string }) => Promise<void>;
  loading: boolean;
  currentSummary: string | null;
  currentVersion: number;
}

export const ReviseSummaryDialog: React.FC<ReviseSummaryDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
  currentSummary,
  currentVersion,
}) => {
  const [safeSummary, setSafeSummary] = useState(currentSummary || '');
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const trimmedSummary = safeSummary.trim();
  const trimmedReason = reason.trim();
  const summaryLength = trimmedSummary.length;
  const isSummaryValid = summaryLength >= 10 && summaryLength <= 500;
  const isReasonValid = trimmedReason.length >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!isSummaryValid) {
      setValidationError('Safe public summary must be between 10 and 500 characters.');
      return;
    }
    if (!isReasonValid) {
      setValidationError('Administrative audit reason is required (minimum 3 characters).');
      return;
    }

    try {
      await onConfirm({
        safe_summary: trimmedSummary,
        reason: trimmedReason,
      });
    } catch (err: unknown) {
      const errObj = err as Error & { code?: string };
      const msg = errObj.message || 'Failed to revise summary.';
      if (
        errObj.code === 'PROHIBITED_PII_DETECTED' ||
        msg.includes('PROHIBITED_PII_DETECTED') ||
        msg.includes('personal contact information') ||
        msg.includes('matriculation number') ||
        msg.includes('phone number detected') ||
        msg.includes('email address detected')
      ) {
        setValidationError(
          'Prohibited personal information detected. The advisory cannot contain phone numbers, emails, or student matriculation numbers.',
        );
      } else if (errObj.code === 'VERSION_CONFLICT' || msg.includes('VERSION_CONFLICT')) {
        setValidationError(
          'Version Conflict: Another administrator has updated this incident. Please close this dialog and inspect the latest details before retrying.',
        );
      } else {
        setValidationError(msg);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#14221b]/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-emerald-800">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700">
              <FileEdit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0d2c20]">Edit Public Safety Notice</h3>
              <span className="text-[11px] text-[#66736c] font-mono">
                Active Incident · Base Version v{currentVersion}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            Revising this summary immediately updates the live <strong>Public Safety Feed</strong>.
            Do not include personal information, phone numbers, email addresses, matriculation
            numbers, or unverified claims.
          </p>
        </div>

        {validationError && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-3 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="font-medium">{validationError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-[#0d2c20]">
                Public Advisory Summary <span className="text-red-500">*</span>
              </label>
              <span
                className={`text-[11px] font-mono ${
                  !isSummaryValid ? 'text-red-600 font-semibold' : 'text-[#66736c]'
                }`}
              >
                {summaryLength}/500 (min 10)
              </span>
            </div>
            <textarea
              rows={3}
              value={safeSummary}
              onChange={(e) => setSafeSummary(e.target.value)}
              disabled={loading}
              className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20] leading-relaxed"
              placeholder="e.g. Electrical maintenance underway at Engineering Block. Fire marshals on scene. Area isolated safely."
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-[#0d2c20]">
                Administrative Reason (Logged to Audit Trail){' '}
                <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-[#66736c] font-mono">min 3 chars</span>
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
              placeholder="e.g. Updated evacuation guidance following security command briefing"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#14221b]/10">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !isSummaryValid || !isReasonValid}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{loading ? 'Publishing Revision...' : 'Publish Revision'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
