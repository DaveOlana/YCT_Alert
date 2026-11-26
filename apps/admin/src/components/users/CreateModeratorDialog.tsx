import React, { useState } from 'react';
import { UserPlus, X, AlertTriangle, ShieldCheck } from 'lucide-react';

interface CreateModeratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: { username: string; password: string; reason?: string }) => Promise<void>;
  loading: boolean;
}

export const CreateModeratorDialog: React.FC<CreateModeratorDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

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

    const trimmedUser = username.trim();
    if (trimmedUser.length < 3 || trimmedUser.length > 32) {
      setError('Username must be between 3 and 32 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUser)) {
      setError('Username can only contain alphanumeric characters and underscores.');
      return;
    }

    const pwdError = validatePassword(password);
    if (pwdError) {
      setError(pwdError);
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and confirmation do not match.');
      return;
    }

    try {
      await onConfirm({
        username: trimmedUser,
        password,
        reason: reason.trim() || undefined,
      });
      // Clear password fields immediately
      setPassword('');
      setConfirmPassword('');
      setUsername('');
      setReason('');
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create moderator account.');
    }
  };

  const handleClose = () => {
    setPassword('');
    setConfirmPassword('');
    setUsername('');
    setReason('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#14221b]/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-[#0d2c20]">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0d2c20]">Provision Moderator</h3>
              <span className="text-[11px] text-[#66736c]">Authorized student operations role</span>
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-3 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-[#0d2c20] mb-1">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
              placeholder="e.g. mod_student_lead"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0d2c20] mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
              placeholder="Min 12 chars (upper, lower, digit, symbol)"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0d2c20] mb-1">
              Confirm Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
              placeholder="Re-enter password"
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
              placeholder="e.g. Authorized student affairs shift lead"
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
              disabled={loading || !username.trim() || !password || !confirmPassword}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{loading ? 'Creating Account...' : 'Create Moderator'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
