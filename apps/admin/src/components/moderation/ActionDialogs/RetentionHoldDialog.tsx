import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

interface RetentionHoldDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (hold: boolean, reason: string) => Promise<void>;
  loading: boolean;
  currentHold: boolean;
}

export const RetentionHoldDialog: React.FC<RetentionHoldDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
  currentHold,
}) => {
  const [hold, setHold] = useState(!currentHold);
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const isValid = reason.trim().length >= 5;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#14221b]/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-purple-900">
            <div className="p-2 bg-purple-50 rounded-xl text-purple-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#0d2c20]">
              {hold ? 'Apply Retention Hold' : 'Release Retention Hold'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[#66736c] leading-relaxed">
          {hold
            ? 'Applying a retention hold prevents this incident and its records from being automatically deleted after 30 days.'
            : 'Releasing this hold allows the incident to follow normal 30-day archival schedules.'}
        </p>

        <div>
          <label className="block text-xs font-semibold text-[#0d2c20] mb-1">Hold Status</label>
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={hold === true}
                onChange={() => setHold(true)}
                className="text-purple-700 focus:ring-purple-700"
              />
              <span className="font-medium text-[#0d2c20]">
                Active Hold (Preserve Indefinitely)
              </span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={hold === false}
                onChange={() => setHold(false)}
                className="text-purple-700 focus:ring-purple-700"
              />
              <span className="font-medium text-[#0d2c20]">Released (Normal Lifecycle)</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#0d2c20] mb-1">
            Administrative Hold Reason (Mandatory) <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
            placeholder="e.g. Investigation underway with Campus Security Chief; preserving physical evidence."
          />
          <span className="text-[11px] text-[#66736c] font-mono">
            {reason.trim().length} chars (minimum 5)
          </span>
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
            type="button"
            onClick={() => onConfirm(hold, reason.trim())}
            disabled={loading || !isValid}
            className="px-4 py-2 text-xs font-semibold text-white bg-purple-800 hover:bg-purple-900 rounded-xl cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting...' : 'Save Retention Hold'}
          </button>
        </div>
      </div>
    </div>
  );
};
