import React, { useState } from 'react';
import { UserCheck, X } from 'lucide-react';

interface ClaimDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
  loading: boolean;
}

export const ClaimDialog: React.FC<ClaimDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
}) => {
  const [reason, setReason] = useState('Initiating safety assessment and verification');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#14221b]/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-[#0d2c20]">
            <div className="p-2 bg-amber-50 rounded-xl text-amber-700">
              <UserCheck className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold">Assign Incident to Me</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[#66736c] leading-relaxed">
          Assigning this incident to yourself marks it as{' '}
          <strong className="text-amber-700 font-semibold">Under Review</strong> so other moderators
          know you are handling it.
        </p>

        <div>
          <label className="block text-xs font-semibold text-[#0d2c20] mb-1">
            Reason (Optional)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
            placeholder="e.g. Assessing fire report near Science Complex"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
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
            onClick={() => onConfirm(reason.trim() || undefined)}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0d2c20] hover:bg-[#143d2c] rounded-xl cursor-pointer shadow-sm disabled:opacity-50"
          >
            {loading ? 'Assigning...' : 'Assign to Me'}
          </button>
        </div>
      </div>
    </div>
  );
};
