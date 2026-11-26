import React, { useState } from 'react';
import { KeyRound, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { AdminUserRecord } from '../../types/admin.js';

interface ResetPasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUserRecord | null;
  onConfirm: (payload: { new_password: string; reason?: string }) => Promise<void>;
  loading: boolean;
}

export const ResetPasswordDialog: React.FC<ResetPasswordDialogProps> = ({
  isOpen,
  onClose,
  user,
  onConfirm,
  loading,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 12) return 'Password must be at least 12 characters.';
    if (!/[A-Z]/.test(pwd)) return 'Password must include at least one uppercase letter.';
    if (!/[a-z]/.test(pwd)) return 'Password must include at least one lowercase letter.';
    if (!/[0-9]/.test(pwd)) return 'Password must include at least one number.';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd)) {
      return 'Password must include at least one special character.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pwdError = validatePassword(newPassword);
    if (pwdError) {
      setError(pwdError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    try {
      await onConfirm({
        new_password: newPassword,
        reason: reason.trim() || undefined,
      });
      // Clear password fields immediately
      setNewPassword('');
      setConfirmPassword('');
      setReason('');
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to reset moderator password.');
    }
  };

  const handleClose = () => {
    setNewPassword('');
    setConfirmPassword('');
    setReason('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#14221b]/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-[#0d2c20]">
            <div className="p-2 bg-amber-50 rounded-xl text-amber-700">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0d2c20]">Reset Moderator Credentials</h3>
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

        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            Resetting credentials will immediately revoke all existing sessions for{' '}
            <strong>{user.username}</strong>. The moderator will be required to log in with the new
            password.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-3 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-[#0d2c20] mb-1">
              New Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
              placeholder="Min 12 chars (upper, lower, digit, symbol)"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0d2c20] mb-1">
              Confirm New Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
              placeholder="Re-enter new password"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0d2c20] mb-1">
              Administrative Reason (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
              placeholder="e.g. Scheduled credential rotation / password recovery"
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
              disabled={loading || !newPassword || !confirmPassword}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-xl cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{loading ? 'Updating Credentials...' : 'Reset Password'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
