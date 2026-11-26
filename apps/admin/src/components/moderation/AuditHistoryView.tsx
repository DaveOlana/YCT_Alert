import React from 'react';
import { History, ShieldAlert } from 'lucide-react';
import type { IncidentAuditLog } from '../../types/admin.js';

interface AuditHistoryViewProps {
  logs: IncidentAuditLog[];
}

function getActionBadge(action: string) {
  switch (action) {
    case 'CLAIM':
      return { label: 'Claimed Triage', bg: 'bg-amber-100 text-amber-800 border-amber-300' };
    case 'ACTIVATE':
      return {
        label: 'Activated & Broadcast',
        bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      };
    case 'RESOLVE':
      return { label: 'Resolved', bg: 'bg-blue-100 text-blue-800 border-blue-300' };
    case 'REJECT':
      return { label: 'Rejected', bg: 'bg-red-100 text-red-800 border-red-300' };
    case 'RETENTION_HOLD_APPLIED':
      return {
        label: 'Retention Hold Applied',
        bg: 'bg-purple-100 text-purple-800 border-purple-300',
      };
    case 'RETENTION_HOLD_RELEASED':
      return {
        label: 'Retention Hold Released',
        bg: 'bg-purple-50 text-purple-700 border-purple-200',
      };
    default:
      return { label: action, bg: 'bg-gray-100 text-gray-800 border-gray-300' };
  }
}

export const AuditHistoryView: React.FC<AuditHistoryViewProps> = ({ logs }) => {
  if (logs.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-[#66736c] bg-[#f4f4ec]/50 rounded-2xl border border-dashed border-[#14221b]/15">
        <History className="w-5 h-5 mx-auto mb-1 text-gray-400" />
        No moderation actions have been recorded yet for this incident.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0d2c20]">
        <ShieldAlert className="w-4 h-4 text-emerald-700" />
        <span>Immutable Administrative Audit Trail ({logs.length})</span>
      </div>

      <div className="relative pl-4 border-l-2 border-[#14221b]/15 space-y-4">
        {logs.map((log) => {
          const badge = getActionBadge(log.action);
          const time = new Date(log.created_at).toLocaleString();

          return (
            <div key={log.id} className="relative space-y-1">
              <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#0d2c20] border-2 border-white ring-1 ring-[#14221b]/20" />

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${badge.bg}`}
                >
                  {badge.label}
                </span>
                <span className="text-xs font-semibold text-[#0d2c20]">{log.admin_username}</span>
                <span className="text-[11px] text-[#66736c]">
                  ({log.previous_status} → {log.new_status})
                </span>
                <span className="text-[10px] text-[#66736c] ml-auto font-mono">{time}</span>
              </div>

              <div className="bg-white/80 border border-[#14221b]/10 rounded-xl p-2.5 text-xs text-[#14221b] leading-relaxed">
                <span className="font-semibold text-[#0d2c20]">Reason: </span>
                {log.reason}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
