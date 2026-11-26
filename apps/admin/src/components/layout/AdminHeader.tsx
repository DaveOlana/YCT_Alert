import React from 'react';
import { ShieldAlert, LogOut, ShieldCheck, Layers, Users } from 'lucide-react';
import type { AdminUser } from '../../types/admin.js';

interface AdminHeaderProps {
  user: AdminUser;
  onLogout: () => void;
  activeTab: 'INCIDENTS' | 'USERS';
  onTabChange: (tab: 'INCIDENTS' | 'USERS') => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  user,
  onLogout,
  activeTab,
  onTabChange,
}) => {
  return (
    <header className="bg-[#0d2c20] text-white shadow-md border-b border-[#14221b]/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600/30 p-2 rounded-xl text-emerald-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                YCT Alert
                <span className="text-xs bg-emerald-900/60 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-700/50">
                  Moderation
                </span>
              </h1>
              <p className="text-xs text-emerald-300/70 font-sans">Campus Safety Console</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden sm:flex items-center gap-1.5 ml-2">
            <button
              onClick={() => onTabChange('INCIDENTS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'INCIDENTS'
                  ? 'bg-emerald-800/80 text-white border border-emerald-600/50'
                  : 'text-emerald-200/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Incident Queue</span>
            </button>

            {user.role === 'SUPERADMIN' && (
              <button
                onClick={() => onTabChange('USERS')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'USERS'
                    ? 'bg-emerald-800/80 text-white border border-emerald-600/50'
                    : 'text-emerald-200/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>User Governance</span>
              </button>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 bg-emerald-950/60 border border-emerald-800/40 px-3 py-1.5 rounded-xl">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div className="text-left">
              <span className="text-xs font-semibold text-white block leading-tight">
                {user.username}
              </span>
              <span className="text-[10px] text-emerald-400/90 font-mono uppercase tracking-wider block">
                {user.role}
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-xs text-emerald-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl transition font-medium cursor-pointer"
            title="End administrative session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
