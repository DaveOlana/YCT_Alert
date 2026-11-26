import React from 'react';
import { Flame, Activity, AlertTriangle, ShieldCheck, User, Clock, ArrowRight } from 'lucide-react';
import type { IncidentSummary } from '../../types/admin.js';

interface IncidentCardProps {
  incident: IncidentSummary;
  onInspect: (id: string) => void;
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'ACTIVE':
      return {
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        dot: 'bg-emerald-500 animate-pulse',
      };
    case 'PENDING':
      return {
        badge: 'bg-amber-100 text-amber-800 border-amber-300',
        dot: 'bg-amber-500',
      };
    case 'UNDER_REVIEW':
      return {
        badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        dot: 'bg-indigo-500 animate-pulse',
      };
    case 'RESOLVED':
      return {
        badge: 'bg-blue-100 text-blue-800 border-blue-300',
        dot: 'bg-blue-500',
      };
    case 'REJECTED':
      return {
        badge: 'bg-red-100 text-red-800 border-red-300',
        dot: 'bg-red-500',
      };
    default:
      return {
        badge: 'bg-gray-100 text-gray-800 border-gray-300',
        dot: 'bg-gray-400',
      };
  }
}

function getCategoryIcon(code: string) {
  switch (code) {
    case 'FIRE_OR_SMOKE':
      return <Flame className="w-4 h-4 text-red-600" />;
    case 'MEDICAL_EMERGENCY':
      return <Activity className="w-4 h-4 text-blue-600" />;
    case 'PHYSICAL_HAZARD':
    case 'SECURITY_INCIDENT':
    case 'OTHER_URGENT':
    default:
      return <AlertTriangle className="w-4 h-4 text-amber-600" />;
  }
}

export const IncidentCard: React.FC<IncidentCardProps> = ({ incident, onInspect }) => {
  const statusStyle = getStatusStyle(incident.status);
  const time = new Date(incident.last_reported_at).toLocaleString();

  return (
    <div className="bg-white/95 rounded-2xl border border-[#14221b]/10 p-5 shadow-sm hover:shadow-md transition space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#f4f4ec] rounded-lg">
            {getCategoryIcon(incident.category_code)}
          </div>
          <span className="text-xs font-bold text-[#0d2c20] font-mono tracking-wide">
            {incident.public_id}
          </span>
          <span className="text-xs font-semibold text-[#66736c]">
            {incident.category_code.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {incident.retention_hold && (
            <span className="text-[10px] bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-purple-600" />
              Retention Hold
            </span>
          )}

          {incident.purged_at && (
            <span className="text-[10px] bg-gray-100 text-gray-700 border border-gray-300 px-2 py-0.5 rounded-full font-semibold">
              Archived / Purged
            </span>
          )}

          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${statusStyle.badge}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
            {incident.status}
          </span>
        </div>
      </div>

      {incident.safe_public_summary ? (
        <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl p-3 text-xs text-emerald-950 leading-relaxed font-medium">
          <span className="text-[10px] uppercase font-bold text-emerald-800 block mb-0.5 tracking-wider">
            Public Advisory
          </span>
          {incident.safe_public_summary}
        </div>
      ) : (
        <p className="text-xs text-[#66736c] italic">
          {incident.status === 'PENDING'
            ? 'Waiting for safety team review.'
            : 'No public advisory was broadcast for this incident.'}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#14221b]/10 text-xs text-[#66736c]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-mono">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            {time}
          </span>
          <span>·</span>
          <span className="font-medium text-[#0d2c20]">
            {incident.report_count} {incident.report_count === 1 ? 'Report' : 'Reports'}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-gray-400" />
            {incident.assigned_admin_username ? (
              <span className="font-semibold text-emerald-800">
                {incident.assigned_admin_username}
              </span>
            ) : (
              <span className="text-amber-700 font-medium">Unassigned</span>
            )}
          </span>
        </div>

        <button
          onClick={() => onInspect(incident.id)}
          className="flex items-center gap-1.5 bg-[#0d2c20] hover:bg-[#143d2c] text-white px-3 py-1.5 rounded-xl font-semibold text-xs transition cursor-pointer shadow-sm"
        >
          <span>Inspect & Moderate</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
