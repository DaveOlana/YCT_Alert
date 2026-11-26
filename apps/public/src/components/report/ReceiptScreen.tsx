import React, { useState, useEffect } from 'react';
import type { CreateReportResponse, ReceiptStatusResponse } from '@yctalert/contracts';
import { Button } from '../common/Button.js';
import { fetchReceiptStatus } from '../../services/reportSubmissionService.js';
import {
  saveReceiptToSession,
  clearReceiptFromSession,
  purgeLegacyLocalStorageTokens,
  getReceiptFromSession,
} from '../../services/receiptSessionStorage.js';
import {
  ShieldAlert,
  CheckCircle,
  Copy,
  Download,
  Eye,
  EyeOff,
  RefreshCw,
  PlusCircle,
  Clock,
  Radio,
  FileCheck2,
} from 'lucide-react';

interface ReceiptScreenProps {
  receipt: CreateReportResponse;
  onReset: () => void;
}

export const ReceiptScreen: React.FC<ReceiptScreenProps> = ({ receipt, onReset }) => {
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusData, setStatusData] = useState<ReceiptStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [savedInSession, setSavedInSession] = useState(true);

  const shortRef =
    receipt.reference_number || `#REF-${receipt.receipt_id.slice(0, 8).toUpperCase()}`;

  useEffect(() => {
    // Purge legacy plaintext localStorage tokens from previous versions
    purgeLegacyLocalStorageTokens();

    // Persist credentials in session-scoped storage (bounded to browser tab lifecycle)
    const stored = saveReceiptToSession({
      receipt_id: receipt.receipt_id,
      receipt_token: receipt.receipt_token,
      short_ref: shortRef,
      received_at: receipt.received_at,
    });
    setSavedInSession(stored);
  }, [receipt.receipt_id, receipt.receipt_token, shortRef, receipt.received_at]);

  const handleClearFromSession = () => {
    clearReceiptFromSession(receipt.receipt_id);
    purgeLegacyLocalStorageTokens();
    setSavedInSession(false);
  };

  const currentStatus = statusData?.delivery_status || receipt.delivery_status;
  const statusMessage =
    statusData?.status_message ||
    receipt.message ||
    'Report received and waiting for safety team review.';
  const advisoryId = statusData?.public_advisory_id || null;

  const handleCopy = async () => {
    const textToCopy = [
      '--- YCT Alert Report Reference ---',
      `Reference: ${shortRef}`,
      `Receipt ID: ${receipt.receipt_id}`,
      `Security Key: ${receipt.receipt_token}`,
      `Submitted: ${new Date(receipt.received_at).toLocaleString()}`,
      'Notice: Reports are monitored by the campus safety review team.',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const handleDownload = () => {
    const content = [
      '====================================================',
      '               YCT ALERT REPORT RECEIPT             ',
      '====================================================',
      '',
      `Reference:     ${shortRef}`,
      `Receipt ID:    ${receipt.receipt_id}`,
      `Security Key:  ${receipt.receipt_token}`,
      `Submitted At:  ${receipt.received_at}`,
      `Status:        ${currentStatus}`,
      '',
      'SECURITY & PRIVACY NOTICE:',
      'Keep this file safe. This security key allows you to check',
      'the status of your report.',
      '====================================================',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yct-alert-receipt-${receipt.receipt_id.slice(0, 8)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCheckStatus = async () => {
    setIsRefreshing(true);
    setStatusError(null);
    try {
      const activeToken =
        receipt.receipt_token || getReceiptFromSession(receipt.receipt_id)?.receipt_token;

      if (!activeToken) {
        setStatusError(
          'Security key is not available in active session. Please refer to your downloaded receipt.',
        );
        setIsRefreshing(false);
        return;
      }

      const updated = await fetchReceiptStatus(receipt.receipt_id, activeToken);
      setStatusData(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message;
      setStatusError(msg || 'Failed to refresh status.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'RECEIVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-900 border border-blue-200">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>RECEIVED</span>
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
            <Radio className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
            <span>UNDER REVIEW</span>
          </span>
        );
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            <span>PUBLISHED (ACTIVE)</span>
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
            <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>RESOLVED</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-800 border border-slate-300">
            <span>CLOSED (NOT PUBLISHED)</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 max-w-2xl mx-auto">
      {/* Campus Safety Notice */}
      <div
        role="alert"
        className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-5 text-amber-950 shadow-xs space-y-2"
      >
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-6 h-6 text-amber-700 shrink-0" aria-hidden="true" />
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-amber-900">
            Campus Safety Notice
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-amber-800 leading-relaxed pl-8">
          Reports submitted here are sent directly to the Campus Safety review team. In an immediate
          life-threatening emergency, call campus security directly.
        </p>
      </div>

      {/* Main Receipt Card */}
      <div className="bg-white border border-[#14221b]/10 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-[#14221b]/10 pb-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-6 h-6 text-emerald-700" aria-hidden="true" />
            <div>
              <h3 className="text-lg font-bold text-[#0d2c20]">Report Submitted</h3>
              <p className="text-xs text-[#52635a]">
                Your report has been received by Campus Safety.
              </p>
            </div>
          </div>
          {renderStatusBadge(currentStatus)}
        </div>

        {/* Prominent Human-Friendly Reference */}
        <div className="bg-[#edf6ef] border border-[#174b32]/20 rounded-2xl p-4 sm:p-5 space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[#174b32]">
            Report Reference Number
          </span>
          <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-[#0d2c20]">
            {shortRef}
          </div>
          <p className="text-xs text-[#52635a] pt-1">
            Quote this reference if you contact campus security about this incident.
          </p>
          <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              onClick={handleCheckStatus}
              disabled={isRefreshing}
              className="w-full sm:w-auto justify-center text-xs py-2 px-4 shadow-2xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{isRefreshing ? 'Checking Status...' : 'Track My Report Status'}</span>
            </Button>
          </div>
        </div>

        {/* Technical Verification Details (Collapsible) */}
        <details className="group border border-[#14221b]/10 rounded-2xl p-4 bg-[#f4f4ec]/60">
          <summary className="cursor-pointer font-semibold text-xs sm:text-sm text-[#0d2c20] flex items-center justify-between select-none">
            <span>Technical Verification Details</span>
            <span className="text-xs text-[#174b32] font-medium group-open:hidden">Show</span>
            <span className="text-xs text-[#174b32] font-medium hidden group-open:inline">
              Hide
            </span>
          </summary>
          <div className="mt-3 space-y-3 pt-3 border-t border-[#14221b]/10 text-xs font-mono">
            <div>
              <span className="text-[#52635a] block uppercase text-[10px] tracking-wider mb-0.5">
                Full Receipt Identifier
              </span>
              <div className="p-2.5 bg-white rounded-xl text-[#0d2c20] break-all border border-[#14221b]/5 select-all">
                {receipt.receipt_id}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[#52635a] uppercase text-[10px] tracking-wider">
                  Security Access Key
                </span>
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="text-[#174b32] hover:text-[#0d2c20] font-sans text-xs flex items-center gap-1 cursor-pointer"
                >
                  {showToken ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Mask</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Reveal</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-2.5 bg-white rounded-xl text-[#0d2c20] break-all border border-[#14221b]/5 select-all">
                {showToken ? receipt.receipt_token : 'tok_••••••••••••••••••••••••••••••••'}
              </div>
            </div>
            <div className="flex items-center justify-between pt-1 text-[11px] text-[#52635a]">
              <span>Timestamp:</span>
              <span className="text-[#0d2c20]">
                {new Date(receipt.received_at).toLocaleString()}
              </span>
            </div>
          </div>
        </details>

        {/* Copy and Save Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={handleCopy}
            className="flex-1 justify-center py-2.5 text-xs sm:text-sm"
          >
            <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
            <span>{copied ? 'Copied Reference!' : 'Copy Reference'}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleDownload}
            className="flex-1 justify-center py-2.5 text-xs sm:text-sm"
          >
            <Download className="w-4 h-4 mr-2" aria-hidden="true" />
            <span>Download Receipt (.txt)</span>
          </Button>
        </div>

        {/* Session Storage Privacy Note */}
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl text-xs text-blue-900 leading-relaxed flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold mb-0.5">Session Security:</p>
            {savedInSession ? (
              <p>
                Credentials are saved only for this browser session so you can track status while this tab is open. Bearer tokens are never stored permanently in localStorage.
              </p>
            ) : (
              <p>Session credentials cleared. This browser tab no longer retains access keys.</p>
            )}
          </div>
          {savedInSession && (
            <button
              type="button"
              onClick={handleClearFromSession}
              className="text-xs text-rose-700 hover:text-rose-900 font-semibold underline shrink-0 cursor-pointer"
            >
              Clear from this session
            </button>
          )}
        </div>
      </div>

      {/* Live Status Tracking Card */}
      <div className="bg-white border border-[#14221b]/10 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-[#0d2c20]">Report Review Status</h4>
            <p className="text-xs text-[#52635a]">{statusMessage}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCheckStatus}
            disabled={isRefreshing}
            className="text-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </Button>
        </div>

        {advisoryId && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
            <span className="font-bold">Public Campus Advisory Reference: </span>
            <span className="font-mono">{advisoryId}</span>
          </div>
        )}

        {statusError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
            {statusError}
          </div>
        )}
      </div>

      {/* Start New Report */}
      <div className="pt-2">
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={onReset}
          className="w-full justify-center py-3.5 text-base shadow-sm"
        >
          <PlusCircle className="w-5 h-5 mr-2" aria-hidden="true" />
          <span>Submit Another Report</span>
        </Button>
      </div>
    </div>
  );
};
