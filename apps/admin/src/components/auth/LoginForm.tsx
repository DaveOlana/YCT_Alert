import React, { useState } from 'react';
import { ShieldAlert, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import type { AdminUser } from '../../types/admin.js';
import { adminAuthService } from '../../services/adminAuthService.js';

interface LoginFormProps {
  onSuccess: (user: AdminUser) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('ALERTadmin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { user } = await adminAuthService.login(username.trim(), password);
      onSuccess(user);
    } catch (err: unknown) {
      setError((err as Error).message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-[#14221b]/10 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex bg-[#0d2c20] text-emerald-400 p-3.5 rounded-2xl shadow-sm mb-2">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0d2c20]">Moderation Sign In</h2>
          <p className="text-sm text-[#66736c]">
            Authorized campus safety administrators and moderators only
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 flex items-start gap-3 text-sm animate-fade-in">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Authentication Failed</p>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#0d2c20] mb-1.5">
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#66736c] absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0d2c20] focus:border-transparent transition"
                placeholder="ALERTadmin"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#0d2c20] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#66736c] absolute left-3.5 top-3.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0d2c20] focus:border-transparent transition"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !password || !username}
            className="w-full bg-[#0d2c20] hover:bg-[#143d2c] text-white font-medium py-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-[#0d2c20]/10"
          >
            {loading ? (
              <span className="text-sm">Verifying Credentials...</span>
            ) : (
              <>
                <span className="text-sm font-semibold">Sign In to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="border-t border-[#14221b]/10 pt-4 text-center">
          <p className="text-[11px] text-[#66736c]">
            Authorized campus personnel only. Contact your campus system administrator for access.
          </p>
        </div>
      </div>
    </div>
  );
};
