import React, { useState } from 'react';
import { Radio, X, AlertTriangle } from 'lucide-react';

interface ActivateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: { safe_summary: string; reason?: string }) => Promise<void>;
  loading: boolean;
  defaultSummary?: string | null;
}

export const ActivateDialog: React.FC<ActivateDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
  defaultSummary,
}) => {
  const [safeSummary, setSafeSummary] = useState(defaultSummary || '');
  const [reason, setReason] = useState(
    'Verified incident reports and approved public safety broadcast.',
  );

  if (!isOpen) return null;

  const summaryLength = safeSummary.trim().length;
  const isSummaryValid = summaryLength >= 10 && summaryLength <= 500;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#14221b]/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-emerald-800">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700">
              <Radio className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#0d2c20]">Publish Public Safety Notice</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            This action publishes the incident notice to the{' '}
            <strong>Public Campus Safety Feed</strong>. The summary is publicly visible to all
            campus users. Make sure it contains no unverified or personally identifying details.
          </p>
        </div>

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
            className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20] leading-relaxed"
            placeholder="e.g. Dense smoke reported at Science Complex. Campus safety officers are on scene. Please use alternate routes."
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#0d2c20] mb-1">
            Moderation Reason (Recorded in audit log)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
            placeholder="e.g. Verified with security patrol at Gate 2"
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
            type="button"
            onClick={() =>
              onConfirm({
                safe_summary: safeSummary.trim(),
                reason: reason.trim() || undefined,
              })
            }
            disabled={loading || !isSummaryValid}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Publishing...' : 'Approve & Publish'}
          </button>
        </div>
      </div>
    </div>
  );
};
