import React, { useState } from 'react';
import { UserX, X, AlertTriangle } from 'lucide-react';
import type { AdminUserRecord } from '../../types/admin.js';

interface RevokeModeratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUserRecord | null;
  onConfirm: (reason: string) => Promise<void>;
  loading: boolean;
}

export const RevokeModeratorDialog: React.FC<RevokeModeratorDialogProps> = ({
  isOpen,
  onClose,
  user,
  onConfirm,
  loading,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const trimmedReason = reason.trim();
  const isReasonValid = trimmedReason.length >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isReasonValid) {
      setError('Administrative revocation reason is required (minimum 3 characters).');
      return;
    }

    try {
      await onConfirm(trimmedReason);
      setReason('');
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to revoke moderator account.');
    }
  };

  const handleClose = () => {
    setReason('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#14221b]/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-red-800">
            <div className="p-2 bg-red-50 rounded-xl text-red-700">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0d2c20]">Revoke Moderator Access</h3>
              <span className="text-[11px] text-[#66736c] font-mono">Account: {user.username}</span>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-3.5 text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-red-800">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
            <span>Immediate Session Invalidation</span>
          </div>
          <p>
            Deactivating <strong>{user.username}</strong> immediately revokes all of their active
            sessions and blocks further sign-in attempts. This operation cannot be reversed from the
            web portal.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-3 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-[#0d2c20]">
                Reason for Revocation <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-[#66736c] font-mono">min 3 chars</span>
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
              placeholder="e.g. End of student executive tenure / shift reassignment"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#14221b]/10">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !isReasonValid}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-xl cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>{loading ? 'Revoking Access...' : 'Deactivate & Invalidate Sessions'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
