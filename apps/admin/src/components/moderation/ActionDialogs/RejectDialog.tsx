import React, { useState } from 'react';
import { XCircle, X } from 'lucide-react';

interface RejectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (rejectionReason: string) => Promise<void>;
  loading: boolean;
}

export const RejectDialog: React.FC<RejectDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
}) => {
  const [rejectionReason, setRejectionReason] = useState('');

  if (!isOpen) return null;

  const isValid = rejectionReason.trim().length >= 3;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#14221b]/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-red-800">
            <div className="p-2 bg-red-50 rounded-xl text-red-700">
              <XCircle className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#0d2c20]">Reject Incident Report</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[#66736c] leading-relaxed">
          Rejecting closes this report without publishing it to the public campus safety feed. The
          reason is saved in the internal audit log and is not shown on public receipts.
        </p>

        <div>
          <label className="block text-xs font-semibold text-[#0d2c20] mb-1">
            Rejection Explanation (Mandatory) <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
            placeholder="e.g. False report or controlled maintenance activity with no campus danger."
          />
          <span className="text-[11px] text-[#66736c] font-mono">
            {rejectionReason.trim().length} chars (minimum 3)
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
            onClick={() => onConfirm(rejectionReason.trim())}
            disabled={loading || !isValid}
            className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-xl cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Rejecting...' : 'Reject Incident'}
          </button>
        </div>
      </div>
    </div>
  );
};
