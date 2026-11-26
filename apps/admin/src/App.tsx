import React, { useState, useEffect } from 'react';
import type { AdminUser, IncidentDetail } from './types/admin.js';
import { adminAuthService } from './services/adminAuthService.js';
import { adminIncidentService } from './services/adminIncidentService.js';
import { AdminHeader } from './components/layout/AdminHeader.js';
import { AdminFooter } from './components/layout/AdminFooter.js';
import { LoginForm } from './components/auth/LoginForm.js';
import { ReviewQueue } from './components/moderation/ReviewQueue.js';
import { IncidentDetailModal } from './components/moderation/IncidentDetailModal.js';
import { UserManagementView } from './components/users/UserManagementView.js';
import { ShieldAlert, Layers, Users } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'INCIDENTS' | 'USERS'>('INCIDENTS');
  const [selectedIncidentDetail, setSelectedIncidentDetail] = useState<IncidentDetail | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Check initial session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const user = await adminAuthService.getProfile();
        setCurrentUser(user);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  const handleInspect = async (incidentId: string) => {
    setModalLoading(true);
    setModalOpen(true);
    try {
      const detail = await adminIncidentService.getIncidentDetails(incidentId);
      setSelectedIncidentDetail(detail);
    } catch (err) {
      console.error('Failed to load incident details', err);
      setModalOpen(false);
    } finally {
      setModalLoading(false);
    }
  };

  const handleLogout = async () => {
    await adminAuthService.logout();
    setCurrentUser(null);
    setSelectedIncidentDetail(null);
    setModalOpen(false);
  };

  const handleIncidentUpdated = (updated: IncidentDetail) => {
    setSelectedIncidentDetail(updated);
    setRefreshTrigger((prev) => prev + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f4ec] flex items-center justify-center text-sm text-[#66736c] gap-2">
        <ShieldAlert className="w-6 h-6 animate-spin text-[#0d2c20]" />
        <span>Verifying security session...</span>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#f4f4ec] flex flex-col justify-between">
        <div className="py-6 px-4">
          <LoginForm onSuccess={(user) => setCurrentUser(user)} />
        </div>
        <AdminFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f4ec] text-[#14221b] flex flex-col justify-between">
      <div>
        <AdminHeader
          user={currentUser}
          onLogout={handleLogout}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Mobile Navigation Bar */}
          {currentUser.role === 'SUPERADMIN' && (
            <div className="sm:hidden flex items-center gap-2 mb-6 bg-white p-2 rounded-2xl border border-[#14221b]/10">
              <button
                onClick={() => setActiveTab('INCIDENTS')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'INCIDENTS'
                    ? 'bg-[#0d2c20] text-white shadow-xs'
                    : 'text-[#66736c] hover:bg-[#f4f4ec]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Incident Queue</span>
              </button>
              <button
                onClick={() => setActiveTab('USERS')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'USERS'
                    ? 'bg-[#0d2c20] text-white shadow-xs'
                    : 'text-[#66736c] hover:bg-[#f4f4ec]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>User Governance</span>
              </button>
            </div>
          )}

          {activeTab === 'USERS' && currentUser.role === 'SUPERADMIN' ? (
            <UserManagementView currentUser={currentUser} />
          ) : (
            <ReviewQueue onInspect={handleInspect} refreshTrigger={refreshTrigger} />
          )}
        </main>
      </div>

      <AdminFooter />

      {/* Incident Inspection Modal */}
      {modalOpen && (
        <IncidentDetailModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedIncidentDetail(null);
          }}
          detail={selectedIncidentDetail}
          currentUser={currentUser}
          onUpdated={handleIncidentUpdated}
        />
      )}

      {modalLoading && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center">
          <div className="bg-white p-4 rounded-2xl shadow-xl flex items-center gap-3 text-xs font-semibold text-[#0d2c20]">
            <ShieldAlert className="w-5 h-5 animate-spin" />
            <span>Loading incident details...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
