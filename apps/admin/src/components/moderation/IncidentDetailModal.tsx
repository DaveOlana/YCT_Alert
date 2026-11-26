import React, { useState } from 'react';
import {
  X,
  MapPin,
  FileText,
  Radio,
  CheckCircle2,
  XCircle,
  UserCheck,
  ShieldCheck,
  Clock,
  Layers,
  Sparkles,
  Compass,
  GitMerge,
  Scissors,
  FileEdit,
} from 'lucide-react';
import type { IncidentDetail, AdminUser, IncidentLinkedReport } from '../../types/admin.js';
import { AuditHistoryView } from './AuditHistoryView.js';
import { ClaimDialog } from './ActionDialogs/ClaimDialog.js';
import { ActivateDialog } from './ActionDialogs/ActivateDialog.js';
import { ResolveDialog } from './ActionDialogs/ResolveDialog.js';
import { RejectDialog } from './ActionDialogs/RejectDialog.js';
import { RetentionHoldDialog } from './ActionDialogs/RetentionHoldDialog.js';
import { ReviseSummaryDialog } from './ActionDialogs/ReviseSummaryDialog.js';
import { UnlinkReportDialog } from './ActionDialogs/UnlinkReportDialog.js';
import { MergeReportDialog } from './ActionDialogs/MergeReportDialog.js';
import { adminIncidentService } from '../../services/adminIncidentService.js';
import { formatCoordinates } from '../../utils/coordinates.js';

interface IncidentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  detail: IncidentDetail | null;
  currentUser: AdminUser;
  onUpdated: (updated: IncidentDetail) => void;
}

export const IncidentDetailModal: React.FC<IncidentDetailModalProps> = ({
  isOpen,
  onClose,
  detail,
  currentUser,
  onUpdated,
}) => {
  const [activeDialog, setActiveDialog] = useState<
    | 'CLAIM'
    | 'ACTIVATE'
    | 'RESOLVE'
    | 'REJECT'
    | 'HOLD'
    | 'REVISE_SUMMARY'
    | 'UNLINK'
    | 'MERGE'
    | null
  >(null);
  const [selectedReportForAction, setSelectedReportForAction] =
    useState<IncidentLinkedReport | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccessNotice, setActionSuccessNotice] = useState<string | null>(null);

  if (!isOpen || !detail) return null;

  const { incident, reports, auditLogs } = detail;

  const handleClaim = async (reason?: string) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccessNotice(null);
    try {
      const updated = await adminIncidentService.claimIncident(incident.id, reason);
      onUpdated(updated);
      setActiveDialog(null);
      setActionSuccessNotice('Incident triage claimed successfully.');
    } catch (err: unknown) {
      setActionError((err as Error).message || 'Failed to claim incident.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = async (payload: { safe_summary: string; reason?: string }) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccessNotice(null);
    try {
      const updated = await adminIncidentService.activateIncident(incident.id, payload);
      onUpdated(updated);
      setActiveDialog(null);
      setActionSuccessNotice('Incident activated and broadcast to public feed.');
    } catch (err: unknown) {
      setActionError((err as Error).message || 'Failed to activate incident.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (resolution_reason: string) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccessNotice(null);
    try {
      const updated = await adminIncidentService.resolveIncident(incident.id, resolution_reason);
      onUpdated(updated);
      setActiveDialog(null);
      setActionSuccessNotice('Incident resolved successfully.');
    } catch (err: unknown) {
      setActionError((err as Error).message || 'Failed to resolve incident.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (rejection_reason: string) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccessNotice(null);
    try {
      const updated = await adminIncidentService.rejectIncident(incident.id, rejection_reason);
      onUpdated(updated);
      setActiveDialog(null);
      setActionSuccessNotice('Incident rejected.');
    } catch (err: unknown) {
      setActionError((err as Error).message || 'Failed to reject incident.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetentionHold = async (hold: boolean, reason: string) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccessNotice(null);
    try {
      const updated = await adminIncidentService.setRetentionHold(incident.id, hold, reason);
      onUpdated(updated);
      setActiveDialog(null);
      setActionSuccessNotice(
        hold ? 'Administrative retention hold applied.' : 'Retention hold lifted.',
      );
    } catch (err: unknown) {
      setActionError((err as Error).message || 'Failed to update retention hold.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviseSummary = async (payload: { safe_summary: string; reason: string }) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccessNotice(null);
    try {
      const res = await adminIncidentService.reviseIncidentSummary(incident.id, {
        safe_summary: payload.safe_summary,
        reason: payload.reason,
        expected_version: incident.row_version,
      });
      const rawRes = res as unknown as Record<string, unknown>;
      const updatedDetail: IncidentDetail =
        'reports' in rawRes || 'linked_reports' in rawRes
          ? (res as unknown as IncidentDetail)
          : res.incident;
      onUpdated(updatedDetail);
      setActiveDialog(null);
      setActionSuccessNotice('Public safety advisory summary revised successfully.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlinkReport = async (payload: { reportId: string; reason: string }) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccessNotice(null);
    try {
      const res = await adminIncidentService.unlinkReport(incident.id, payload.reportId, {
        reason: payload.reason,
        expected_version: incident.row_version,
      });
      onUpdated(res.sourceIncident);
      setActiveDialog(null);
      setSelectedReportForAction(null);
      setActionSuccessNotice(
        `Report detached into new pending incident ${res.newIncident.incident.public_id}.`,
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleMergeReport = async (payload: {
    targetIncidentId: string;
    targetVersion: number;
    reason: string;
  }) => {
    if (!selectedReportForAction) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccessNotice(null);
    try {
      const res = await adminIncidentService.mergeReport(payload.targetIncidentId, {
        report_id: selectedReportForAction.id,
        reason: payload.reason,
        expected_version: payload.targetVersion,
        source_expected_version: incident.row_version,
      });
      onUpdated(res.sourceIncident);
      setActiveDialog(null);
      setSelectedReportForAction(null);
      setActionSuccessNotice(
        `Report merged into destination incident ${res.targetIncident.incident.public_id}.`,
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full my-8 max-h-[90vh] flex flex-col shadow-2xl border border-[#14221b]/15 overflow-hidden">
        {/* Modal Header */}
        <div className="p-6 bg-[#0d2c20] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold font-mono tracking-tight">
                  {incident.public_id}
                </span>
                <span className="text-xs bg-white/20 text-white font-semibold px-2.5 py-0.5 rounded-full border border-white/20">
                  {incident.status}
                </span>
                <span className="text-xs bg-emerald-950/80 text-emerald-300 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-700/50">
                  {incident.category_code.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs text-emerald-200/80 mt-1 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                First reported {new Date(incident.first_reported_at).toLocaleString()} ·{' '}
                {incident.report_count} {incident.report_count === 1 ? 'Report' : 'Reports'} Linked
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-emerald-200 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="bg-red-50 border-b border-red-200 p-3 text-xs text-red-800 font-semibold px-6">
            Error: {actionError}
          </div>
        )}

        {/* Action Success Banner */}
        {actionSuccessNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 p-3 text-xs text-emerald-900 font-semibold px-6 flex items-center justify-between">
            <span>{actionSuccessNotice}</span>
            <button
              onClick={() => setActionSuccessNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-[#14221b]">
          {/* Retention Hold Warning Banner if applied */}
          {incident.retention_hold && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-purple-900">
              <ShieldCheck className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-purple-950">Administrative Retention Hold Active</p>
                <p className="mt-0.5">{incident.retention_hold_reason}</p>
                <p className="text-[10px] text-purple-700 mt-1 font-mono">
                  Applied by {incident.retention_hold_by_username || 'SUPERADMIN'} on{' '}
                  {incident.retention_hold_at
                    ? new Date(incident.retention_hold_at).toLocaleString()
                    : 'Recorded'}
                </p>
              </div>
            </div>
          )}

          {/* Action Toolbar */}
          <div className="bg-[#f4f4ec]/80 border border-[#14221b]/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <span className="font-bold text-[#0d2c20] block">Moderation Workflow Actions</span>
              <span className="text-[#66736c]">
                Assigned Moderator:{' '}
                <strong>{incident.assigned_admin_username || 'None (Unassigned)'}</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {incident.status === 'PENDING' && !incident.assigned_admin_id && (
                <button
                  onClick={() => setActiveDialog('CLAIM')}
                  className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer shadow-sm"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Assign to Me</span>
                </button>
              )}

              {(incident.status === 'PENDING' || incident.status === 'UNDER_REVIEW') && (
                <button
                  onClick={() => setActiveDialog('ACTIVATE')}
                  className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer shadow-sm"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Publish Public Notice</span>
                </button>
              )}

              {incident.status === 'ACTIVE' && (
                <button
                  onClick={() => setActiveDialog('REVISE_SUMMARY')}
                  className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer shadow-sm"
                >
                  <FileEdit className="w-3.5 h-3.5" />
                  <span>Edit Public Summary</span>
                </button>
              )}

              {incident.status === 'ACTIVE' && (
                <button
                  onClick={() => setActiveDialog('RESOLVE')}
                  className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Resolve Incident</span>
                </button>
              )}

              {(incident.status === 'PENDING' || incident.status === 'UNDER_REVIEW') && (
                <button
                  onClick={() => setActiveDialog('REJECT')}
                  className="flex items-center gap-1.5 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer shadow-sm"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject Report</span>
                </button>
              )}

              {currentUser.role === 'SUPERADMIN' && (
                <button
                  onClick={() => setActiveDialog('HOLD')}
                  className="flex items-center gap-1.5 bg-purple-800 hover:bg-purple-900 text-white text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer shadow-sm"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Retention Hold</span>
                </button>
              )}
            </div>
          </div>

          {/* Safe Public Advisory Display */}
          {incident.safe_public_summary && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-1">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                Approved Public Safety Notice (Active)
              </span>
              <p className="text-sm text-emerald-950 font-medium leading-relaxed">
                {incident.safe_public_summary}
              </p>
            </div>
          )}

          {/* Location Details */}
          <div className="bg-white rounded-2xl border border-[#14221b]/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0d2c20]">
              <MapPin className="w-4 h-4 text-emerald-700" />
              <span>Location Summary</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-[#f4f4ec]/60 p-3 rounded-xl border border-[#14221b]/10">
                <span className="text-[10px] uppercase font-bold text-[#66736c] block mb-1">
                  GPS Coordinates
                </span>
                <p className="font-mono font-semibold text-[#0d2c20]">
                  {formatCoordinates(incident.display_lat, incident.display_lon) ?? (
                    <span className="text-[#66736c] font-sans font-normal italic">
                      Location coordinates not available
                    </span>
                  )}
                </p>
              </div>

              <div className="bg-[#f4f4ec]/60 p-3 rounded-xl border border-[#14221b]/10">
                <span className="text-[10px] uppercase font-bold text-[#66736c] block mb-1">
                  Campus Place
                </span>
                <p className="font-medium text-[#0d2c20]">
                  {reports[0]?.place_name_snapshot || 'General Campus'}
                </p>
              </div>

              <div className="bg-[#f4f4ec]/60 p-3 rounded-xl border border-[#14221b]/10">
                <span className="text-[10px] uppercase font-bold text-[#66736c] block mb-1">
                  Nearby Landmark
                </span>
                <p className="font-medium text-[#0d2c20]">
                  {reports[0]?.landmark_description || 'None provided'}
                </p>
              </div>
            </div>
          </div>

          {/* Linked Anonymous Reports */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0d2c20]">
              <FileText className="w-4 h-4 text-emerald-700" />
              <span>Linked Anonymous Reports ({reports.length})</span>
            </div>

            <div className="space-y-2">
              {reports.map((report, idx) => (
                <div
                  key={report.id}
                  className="bg-[#f4f4ec]/50 border border-[#14221b]/10 rounded-2xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs text-[#66736c]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-[#0d2c20]">
                        Report #{idx + 1} · Receipt ID: {report.receipt_id.slice(0, 8)}...
                      </span>
                      {report.match_method === 'CREATION' && (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-300">
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          Initial Report
                        </span>
                      )}
                      {report.match_method === 'SUGGESTED' && (
                        <span
                          title="Nearby report linked by location and category. Not an administrative merger."
                          className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-300"
                        >
                          <Compass className="w-3 h-3 text-amber-600" />
                          Suggested Match (Nearby Report)
                        </span>
                      )}
                      {report.match_method === 'ADMIN' && (
                        <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-blue-300">
                          <GitMerge className="w-3 h-3 text-blue-600" />
                          Manually Merged (Admin Action)
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px]">
                      {new Date(report.submitted_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-[#14221b] leading-relaxed font-normal bg-white p-3 rounded-xl border border-[#14221b]/10">
                    "{report.description}"
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#66736c]">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      Source: {report.location_source}
                    </span>
                    {formatCoordinates(report.incident_lat, report.incident_lon) && (
                      <span className="font-mono">
                        GPS: {formatCoordinates(report.incident_lat, report.incident_lon)}
                      </span>
                    )}
                    {report.place_name_snapshot && (
                      <span className="font-medium text-[#0d2c20]">
                        Place: {report.place_name_snapshot}
                      </span>
                    )}
                    {report.is_test && (
                      <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                        TEST REPORT
                      </span>
                    )}
                  </div>

                  {/* Actions for this specific report */}
                  {incident.status !== 'RESOLVED' && incident.status !== 'REJECTED' && (
                    <div className="flex items-center gap-2 pt-2 border-t border-[#14221b]/10 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReportForAction(report);
                          setActiveDialog('UNLINK');
                        }}
                        className="flex items-center gap-1 text-[11px] font-medium text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 transition cursor-pointer"
                        title="Detach this report into a separate pending incident"
                      >
                        <Scissors className="w-3 h-3" />
                        <span>Unlink Report</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReportForAction(report);
                          setActiveDialog('MERGE');
                        }}
                        className="flex items-center gap-1 text-[11px] font-medium text-blue-800 hover:text-blue-950 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition cursor-pointer"
                        title="Move this report to another existing incident"
                      >
                        <GitMerge className="w-3 h-3" />
                        <span>Move to Incident</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Audit History Timeline */}
          <div className="pt-2 border-t border-[#14221b]/10">
            <AuditHistoryView logs={auditLogs} />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-gray-50 border-t border-[#14221b]/10 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 rounded-xl transition cursor-pointer"
          >
            Close Inspection
          </button>
        </div>
      </div>

      {/* Subdialogs */}
      <ClaimDialog
        isOpen={activeDialog === 'CLAIM'}
        onClose={() => setActiveDialog(null)}
        onConfirm={handleClaim}
        loading={actionLoading}
      />

      <ActivateDialog
        isOpen={activeDialog === 'ACTIVATE'}
        onClose={() => setActiveDialog(null)}
        onConfirm={handleActivate}
        loading={actionLoading}
        defaultSummary={incident.safe_public_summary}
      />

      <ResolveDialog
        isOpen={activeDialog === 'RESOLVE'}
        onClose={() => setActiveDialog(null)}
        onConfirm={handleResolve}
        loading={actionLoading}
      />

      <RejectDialog
        isOpen={activeDialog === 'REJECT'}
        onClose={() => setActiveDialog(null)}
        onConfirm={handleReject}
        loading={actionLoading}
      />

      <RetentionHoldDialog
        isOpen={activeDialog === 'HOLD'}
        onClose={() => setActiveDialog(null)}
        onConfirm={handleRetentionHold}
        loading={actionLoading}
        currentHold={incident.retention_hold}
      />

      <ReviseSummaryDialog
        isOpen={activeDialog === 'REVISE_SUMMARY'}
        onClose={() => setActiveDialog(null)}
        onConfirm={handleReviseSummary}
        loading={actionLoading}
        currentSummary={incident.safe_public_summary}
        currentVersion={incident.row_version}
      />

      <UnlinkReportDialog
        isOpen={activeDialog === 'UNLINK'}
        onClose={() => {
          setActiveDialog(null);
          setSelectedReportForAction(null);
        }}
        report={selectedReportForAction}
        incidentPublicId={incident.public_id}
        totalReportsOnIncident={reports.length}
        currentVersion={incident.row_version}
        onConfirm={handleUnlinkReport}
        loading={actionLoading}
      />

      <MergeReportDialog
        isOpen={activeDialog === 'MERGE'}
        onClose={() => {
          setActiveDialog(null);
          setSelectedReportForAction(null);
        }}
        report={selectedReportForAction}
        currentIncidentId={incident.id}
        currentIncidentPublicId={incident.public_id}
        currentIncidentStatus={incident.status}
        currentIncidentVersion={incident.row_version}
        totalReportsOnIncident={reports.length}
        onConfirm={handleMergeReport}
        loading={actionLoading}
      />
    </div>
  );
};
