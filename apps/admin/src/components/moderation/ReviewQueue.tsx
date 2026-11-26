import React, { useState, useEffect } from 'react';
import { RefreshCw, Filter, Inbox } from 'lucide-react';
import type {
  IncidentSummary,
  IncidentStatusFilter,
  IncidentQueueResponse,
} from '../../types/admin.js';
import { adminIncidentService } from '../../services/adminIncidentService.js';
import { IncidentCard } from './IncidentCard.js';

interface ReviewQueueProps {
  onInspect: (incidentId: string) => void;
  refreshTrigger: number;
}

export const ReviewQueue: React.FC<ReviewQueueProps> = ({ onInspect, refreshTrigger }) => {
  const [statusFilter, setStatusFilter] = useState<IncidentStatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IncidentQueueResponse>({
    items: [],
    total: 0,
    page: 1,
    limit: 25,
    counts: { all: 0, pending: 0, under_review: 0, active: 0, resolved: 0, rejected: 0 },
  });

  const loadQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminIncidentService.getQueue({
        status: statusFilter,
        category: categoryFilter || undefined,
      });
      setData(res);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load moderation queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, [statusFilter, categoryFilter, refreshTrigger]);

  const tabs: { key: IncidentStatusFilter; label: string; count: number }[] = [
    { key: 'ALL', label: 'All Incidents', count: data.counts.all },
    { key: 'PENDING', label: 'Pending Review', count: data.counts.pending },
    { key: 'UNDER_REVIEW', label: 'Under Review', count: data.counts.under_review },
    { key: 'ACTIVE', label: 'Active Public Notices', count: data.counts.active },
    { key: 'RESOLVED', label: 'Resolved', count: data.counts.resolved },
    { key: 'REJECTED', label: 'Rejected', count: data.counts.rejected },
  ];

  return (
    <div className="space-y-6">
      {/* Filters and Tabs */}
      <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-[#14221b]/10 p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#14221b]/10 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {tabs.map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    active
                      ? 'bg-[#0d2c20] text-white shadow-sm'
                      : 'text-[#66736c] hover:bg-[#f4f4ec] hover:text-[#0d2c20]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      active ? 'bg-white/20 text-white' : 'bg-[#f4f4ec] text-[#0d2c20]'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={loadQueue}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-[#0d2c20] hover:text-black bg-[#f4f4ec] hover:bg-[#eaeae2] px-3 py-1.5 rounded-xl font-medium transition cursor-pointer disabled:opacity-50"
            title="Refresh queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-[#66736c]">
            <Filter className="w-3.5 h-3.5" />
            <span className="font-semibold uppercase tracking-wider text-[11px] text-[#0d2c20]">
              Category:
            </span>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#f4f4ec]/80 border border-[#14221b]/15 rounded-xl px-3 py-1.5 text-xs text-[#0d2c20] font-medium focus:outline-none focus:ring-2 focus:ring-[#0d2c20] cursor-pointer"
          >
            <option value="">All Categories</option>
            <option value="FIRE_OR_SMOKE">Fire or Smoke</option>
            <option value="MEDICAL_EMERGENCY">Medical Emergency</option>
            <option value="PHYSICAL_HAZARD">Physical Hazard</option>
            <option value="SECURITY_INCIDENT">Security Incident</option>
            <option value="OTHER_URGENT">Other Urgent</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 text-xs font-semibold">
          Error: {error}
        </div>
      )}

      {/* Loading state */}
      {loading && data.items.length === 0 && (
        <div className="text-center py-16 text-sm text-[#66736c] space-y-2">
          <RefreshCw className="w-6 h-6 mx-auto animate-spin text-[#0d2c20]" />
          <p>Loading incident queue...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && data.items.length === 0 && (
        <div className="bg-white/80 rounded-3xl border border-[#14221b]/10 p-12 text-center space-y-3">
          <div className="p-3 bg-[#f4f4ec] text-[#66736c] rounded-2xl inline-block">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-[#0d2c20]">No Incidents Found</h3>
          <p className="text-xs text-[#66736c] max-w-sm mx-auto leading-relaxed">
            There are currently no incidents matching the selected filter criteria. When new public
            reports arrive, they will appear here for triage.
          </p>
        </div>
      )}

      {/* Incident Cards List */}
      <div className="space-y-4">
        {data.items.map((incident: IncidentSummary) => (
          <IncidentCard key={incident.id} incident={incident} onInspect={onInspect} />
        ))}
      </div>
    </div>
  );
};
