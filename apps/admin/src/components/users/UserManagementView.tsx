import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  UserX,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import type { AdminUser, AdminUserRecord } from '../../types/admin.js';
import { adminUserService } from '../../services/adminUserService.js';
import { CreateModeratorDialog } from './CreateModeratorDialog.js';
import { RevokeModeratorDialog } from './RevokeModeratorDialog.js';
import { ResetPasswordDialog } from './ResetPasswordDialog.js';

interface UserManagementViewProps {
  currentUser: AdminUser;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Subdialog states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedUserForAction, setSelectedUserForAction] = useState<AdminUserRecord | null>(null);
  const [actionType, setActionType] = useState<'REVOKE' | 'RESET' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminUserService.listUsers();
      setUsers(res.users);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load administrator accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser.role === 'SUPERADMIN') {
      fetchUsers();
    }
  }, [currentUser]);

  // Strict role gate in UI
  if (currentUser.role !== 'SUPERADMIN') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center max-w-lg mx-auto my-12 space-y-3">
        <ShieldAlert className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-base font-bold text-red-900">Access Denied</h3>
        <p className="text-xs text-red-700 leading-relaxed">
          Administrator management and governance controls are restricted to SUPERADMIN accounts
          only.
        </p>
      </div>
    );
  }

  const handleCreateModerator = async (payload: {
    username: string;
    password: string;
    reason?: string;
  }) => {
    setSubmitting(true);
    try {
      const res = await adminUserService.createModerator(payload);
      setSuccessNotice(`Moderator account "${res.user.username}" created successfully.`);
      setCreateModalOpen(false);
      await fetchUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeModerator = async (reason: string) => {
    if (!selectedUserForAction) return;
    setSubmitting(true);
    try {
      await adminUserService.revokeModerator(selectedUserForAction.id, reason);
      setSuccessNotice(
        `Moderator "${selectedUserForAction.username}" deactivated and active sessions revoked.`,
      );
      setActionType(null);
      setSelectedUserForAction(null);
      await fetchUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (payload: { new_password: string; reason?: string }) => {
    if (!selectedUserForAction) return;
    setSubmitting(true);
    try {
      await adminUserService.resetModeratorPassword(selectedUserForAction.id, payload);
      setSuccessNotice(
        `Password reset for "${selectedUserForAction.username}". Existing sessions have been invalidated.`,
      );
      setActionType(null);
      setSelectedUserForAction(null);
      await fetchUsers();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-[#14221b]/10 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-800">
              <Users className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-[#0d2c20]">Administrator Governance</h2>
          </div>
          <p className="text-xs text-[#66736c] mt-1">
            Superadmin directory. Provision moderators, rotate credentials, and manage session
            lifecycles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2.5 text-xs text-[#0d2c20] bg-[#f4f4ec] hover:bg-[#e8e8df] rounded-xl transition cursor-pointer border border-[#14221b]/10"
            title="Refresh user list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition cursor-pointer shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Provision Moderator</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 text-xs font-medium flex items-center justify-between shadow-xs">
          <span>{successNotice}</span>
          <button
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-4 text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Directory Table */}
      <div className="bg-white rounded-3xl border border-[#14221b]/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#14221b]">
            <thead className="bg-[#f4f4ec]/80 border-b border-[#14221b]/10 text-[11px] font-bold uppercase tracking-wider text-[#66736c]">
              <tr>
                <th className="py-3.5 px-5">Account / Username</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Created Date</th>
                <th className="py-3.5 px-4">Last Activity</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#14221b]/10">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#66736c]">
                    Loading administrator directory...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#66736c]">
                    No administrator accounts found.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isBootstrapSuperadmin = user.username === 'ALERTadmin';
                  const isCurrentLoggedUser = user.id === currentUser.id;

                  return (
                    <tr key={user.id} className="hover:bg-[#f4f4ec]/30 transition">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-[#f4f4ec] text-[#0d2c20]">
                            {user.role === 'SUPERADMIN' ? (
                              <ShieldCheck className="w-4 h-4 text-emerald-700" />
                            ) : (
                              <Users className="w-4 h-4 text-blue-700" />
                            )}
                          </div>
                          <div>
                            <span className="font-mono font-bold text-sm text-[#0d2c20] block">
                              {user.username}
                            </span>
                            <span className="font-mono text-[10px] text-[#66736c]">
                              ID: {user.id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                            user.role === 'SUPERADMIN'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-blue-50 text-blue-800 border-blue-300'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            user.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-gray-100 text-gray-600 border-gray-300'
                          }`}
                        >
                          {user.is_active ? 'Active' : 'Revoked'}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-[#66736c] font-mono text-[11px]">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>

                      <td className="py-4 px-4 text-[#66736c] font-mono text-[11px]">
                        {user.last_login_at
                          ? new Date(user.last_login_at).toLocaleString()
                          : 'Never logged in'}
                      </td>

                      <td className="py-4 px-5 text-right">
                        {isBootstrapSuperadmin ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200"
                            title="Protected bootstrap administrator identity. Managed via CLI only."
                          >
                            <Lock className="w-3 h-3 text-emerald-700" />
                            <span>Protected System Identity</span>
                          </span>
                        ) : isCurrentLoggedUser ? (
                          <span className="text-[11px] font-medium text-[#66736c] italic">
                            Current Session
                          </span>
                        ) : user.is_active ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedUserForAction(user);
                                setActionType('RESET');
                              }}
                              className="flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 transition cursor-pointer"
                              title="Reset password and invalidate active sessions"
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>Reset Password</span>
                            </button>
                            <button
                              onClick={() => {
                                setSelectedUserForAction(user);
                                setActionType('REVOKE');
                              }}
                              className="flex items-center gap-1 text-[11px] font-semibold text-red-800 hover:text-red-950 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg border border-red-200 transition cursor-pointer"
                              title="Deactivate account and revoke active sessions"
                            >
                              <UserX className="w-3 h-3" />
                              <span>Revoke</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium text-gray-500 italic">
                            Access Deactivated
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subdialogs */}
      <CreateModeratorDialog
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onConfirm={handleCreateModerator}
        loading={submitting}
      />

      <RevokeModeratorDialog
        isOpen={actionType === 'REVOKE'}
        onClose={() => {
          setActionType(null);
          setSelectedUserForAction(null);
        }}
        user={selectedUserForAction}
        onConfirm={handleRevokeModerator}
        loading={submitting}
      />

      <ResetPasswordDialog
        isOpen={actionType === 'RESET'}
        onClose={() => {
          setActionType(null);
          setSelectedUserForAction(null);
        }}
        user={selectedUserForAction}
        onConfirm={handleResetPassword}
        loading={submitting}
      />
    </div>
  );
};
