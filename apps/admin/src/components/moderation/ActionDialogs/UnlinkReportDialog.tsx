import React, { useState } from 'react';
import { Scissors, X, AlertTriangle, Layers } from 'lucide-react';
import type { IncidentLinkedReport } from '../../../types/admin.js';

interface UnlinkReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  report: IncidentLinkedReport | null;
  incidentPublicId: string;
  totalReportsOnIncident: number;
  currentVersion: number;
  onConfirm: (payload: { reportId: string; reason: string }) => Promise<void>;
  loading: boolean;
}

export const UnlinkReportDialog: React.FC<UnlinkReportDialogProps> = ({
  isOpen,
  onClose,
  report,
  incidentPublicId,
  totalReportsOnIncident,
  currentVersion,
  onConfirm,
  loading,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !report) return null;

  const trimmedReason = reason.trim();
  const isReasonValid = trimmedReason.length >= 3;
  const isLastReport = totalReportsOnIncident <= 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isReasonValid) {
      setError('Administrative reason is required (minimum 3 characters).');
      return;
    }

    try {
      await onConfirm({
        reportId: report.id,
        reason: trimmedReason,
      });
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to unlink report.';
      if (msg.includes('VERSION_CONFLICT')) {
        setError(
          'Version Conflict: The incident was updated by another administrator. Please close this dialog and inspect the latest details before retrying.',
        );
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#14221b]/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-amber-800">
            <div className="p-2 bg-amber-50 rounded-xl text-amber-700">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0d2c20]">Separate Report from Incident</h3>
              <span className="text-[11px] text-[#66736c] font-mono">
                Source Incident {incidentPublicId} · v{currentVersion}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Report Summary */}
        <div className="bg-[#f4f4ec]/70 border border-[#14221b]/10 rounded-2xl p-3.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-[#66736c]">
            <span className="font-mono font-semibold text-[#0d2c20]">
              Receipt ID: {report.receipt_id.slice(0, 8)}...
            </span>
            <span className="font-mono text-[11px]">
              {new Date(report.submitted_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <p className="text-[#14221b] font-normal italic bg-white p-2.5 rounded-xl border border-[#14221b]/10 line-clamp-2">
            "{report.description}"
          </p>
        </div>

        {/* Informative Warning */}
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3 text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Report Separation Policy</span>
          </div>
          <p>
            Unlinking will detach this report and create a separate <strong>PENDING</strong>{' '}
            incident for it. The original report content and audit history are strictly preserved.
          </p>
          {isLastReport && (
            <p className="text-red-700 font-semibold pt-1 border-t border-amber-200">
              Notice: This is the ONLY report remaining on incident {incidentPublicId}. Unlinking it
              will empty this incident and transition its status to REJECTED.
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-3 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-[#0d2c20]">
                Administrative Reason (Logged to Audit Trail){' '}
                <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-[#66736c] font-mono">min 3 chars</span>
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
              placeholder="e.g. Unrelated incident reported at separate building location"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#14221b]/10">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !isReasonValid}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-xl cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{loading ? 'Detaching Report...' : 'Unlink & Create Incident'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
