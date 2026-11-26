import React, { useState, useEffect } from 'react';
import { GitMerge, X, AlertTriangle, Search, Check } from 'lucide-react';
import type {
  IncidentLinkedReport,
  IncidentSummary,
  IncidentStatus,
} from '../../../types/admin.js';
import { adminIncidentService } from '../../../services/adminIncidentService.js';

interface MergeReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  report: IncidentLinkedReport | null;
  currentIncidentId: string;
  currentIncidentPublicId: string;
  currentIncidentStatus: IncidentStatus;
  currentIncidentVersion: number;
  totalReportsOnIncident: number;
  onConfirm: (payload: {
    targetIncidentId: string;
    targetVersion: number;
    reason: string;
  }) => Promise<void>;
  loading: boolean;
}

export const MergeReportDialog: React.FC<MergeReportDialogProps> = ({
  isOpen,
  onClose,
  report,
  currentIncidentId,
  currentIncidentPublicId,
  currentIncidentStatus,
  currentIncidentVersion,
  totalReportsOnIncident,
  onConfirm,
  loading,
}) => {
  const [candidates, setCandidates] = useState<IncidentSummary[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<IncidentSummary | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch candidate incidents of compatible status
  useEffect(() => {
    if (!isOpen) return;

    const fetchCandidates = async () => {
      setLoadingCandidates(true);
      setError(null);
      try {
        const queueRes = await adminIncidentService.getQueue({
          status: currentIncidentStatus,
          limit: 50,
        });

        // Filter out: current incident itself and terminal statuses
        const eligible = queueRes.items.filter(
          (inc) =>
            inc.id !== currentIncidentId && inc.status !== 'RESOLVED' && inc.status !== 'REJECTED',
        );
        setCandidates(eligible);
      } catch (err: unknown) {
        setError((err as Error).message || 'Failed to load eligible destination incidents.');
      } finally {
        setLoadingCandidates(false);
      }
    };

    fetchCandidates();
  }, [isOpen, currentIncidentId, currentIncidentStatus]);

  if (!isOpen || !report) return null;

  const trimmedReason = reason.trim();
  const isReasonValid = trimmedReason.length >= 3;
  const isLastReport = totalReportsOnIncident <= 1;

  const filteredCandidates = candidates.filter((inc) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      inc.public_id.toLowerCase().includes(q) ||
      inc.category_code.toLowerCase().includes(q) ||
      (inc.safe_public_summary && inc.safe_public_summary.toLowerCase().includes(q))
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedTarget) {
      setError('Please select a destination incident to merge this report into.');
      return;
    }
    if (!isReasonValid) {
      setError('Administrative reason is required (minimum 3 characters).');
      return;
    }

    try {
      // Need destination incident row_version
      const targetDetail = await adminIncidentService.getIncidentDetails(selectedTarget.id);
      await onConfirm({
        targetIncidentId: selectedTarget.id,
        targetVersion: targetDetail.incident.row_version,
        reason: trimmedReason,
      });
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to merge report.';
      if (msg.includes('VERSION_CONFLICT')) {
        setError(
          'Version Conflict: One of the incidents was updated by another administrator. Please refresh and review before retrying.',
        );
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#14221b]/10 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 text-blue-800">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-700">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0d2c20]">Move Report to Incident</h3>
              <span className="text-[11px] text-[#66736c] font-mono">
                Source {currentIncidentPublicId} ({currentIncidentStatus}) · v
                {currentIncidentVersion}
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

        <div className="overflow-y-auto space-y-4 pr-1">
          {/* Selected Report Preview */}
          <div className="bg-[#f4f4ec]/70 border border-[#14221b]/10 rounded-2xl p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-[#66736c]">
              <span className="font-mono font-semibold text-[#0d2c20]">
                Report to Move · Receipt: {report.receipt_id.slice(0, 8)}...
              </span>
              <span className="font-mono text-[11px]">Category: {report.category_code}</span>
            </div>
            <p className="text-[#14221b] font-normal italic bg-white p-2.5 rounded-xl border border-[#14221b]/10 line-clamp-2">
              "{report.description}"
            </p>
          </div>

          {/* Empty Source Notice */}
          {isLastReport && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Source Incident Transition Notice</span>
              </div>
              <p>
                This is the <strong>only report</strong> on source incident{' '}
                {currentIncidentPublicId}. Moving it will empty the incident, causing it to
                automatically transition to <strong>REJECTED</strong>.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-3 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          {/* Destination Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#0d2c20]">
              Select Destination Incident (Status: {currentIncidentStatus}){' '}
              <span className="text-red-500">*</span>
            </label>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter destination incidents by ID or category..."
                className="w-full bg-[#f4f4ec]/60 border border-[#14221b]/15 rounded-xl pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0d2c20]"
              />
            </div>

            <div className="max-h-40 overflow-y-auto border border-[#14221b]/15 rounded-xl divide-y divide-[#14221b]/10 bg-white">
              {loadingCandidates ? (
                <div className="p-4 text-center text-xs text-[#66736c]">
                  Loading eligible incidents...
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#66736c]">
                  No eligible {currentIncidentStatus} incidents found for destination merge.
                </div>
              ) : (
                filteredCandidates.map((cand) => {
                  const isSelected = selectedTarget?.id === cand.id;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => setSelectedTarget(cand)}
                      className={`w-full text-left p-3 flex items-center justify-between text-xs transition cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/80 border-l-4 border-blue-600'
                          : 'hover:bg-[#f4f4ec]/50'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#0d2c20]">
                            {cand.public_id}
                          </span>
                          <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono">
                            {cand.category_code}
                          </span>
                          <span className="text-[10px] text-[#66736c]">
                            {cand.report_count} report(s)
                          </span>
                        </div>
                        {cand.safe_public_summary && (
                          <p className="text-[11px] text-[#66736c] line-clamp-1">
                            {cand.safe_public_summary}
                          </p>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Reason Input */}
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
              placeholder="e.g. Corroborates active fire at Science Complex verified by patrol"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-[#14221b]/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !selectedTarget || !isReasonValid}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>{loading ? 'Merging Report...' : 'Confirm Move & Merge'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
