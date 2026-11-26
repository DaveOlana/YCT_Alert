import React, { useState } from 'react';
import type { ReportFormData } from '../../types/reportForm.js';
import type { SubmissionError } from '../../services/reportSubmissionService.js';
import { CATEGORY_CATALOGUE } from '@yctalert/contracts';
import { Button } from '../common/Button.js';
import { Modal } from '../common/Modal.js';
import {
  AlertTriangle,
  Building2,
  Navigation,
  FileText,
  Image as ImageIcon,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  Send,
  Loader2,
  WifiOff,
} from 'lucide-react';

interface LocalReviewScreenProps {
  formData: ReportFormData;
  onEdit: () => void;
  onReset: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submissionError: SubmissionError | null;
  onRetry: () => void;
}

export const LocalReviewScreen: React.FC<LocalReviewScreenProps> = ({
  formData,
  onEdit,
  onReset,
  onSubmit,
  isSubmitting,
  submissionError,
  onRetry,
}) => {
  const [showPhotoNoticeModal, setShowPhotoNoticeModal] = useState(false);
  const categoryMeta = formData.category_code ? CATEGORY_CATALOGUE[formData.category_code] : null;

  const formattedCapturedTime = formData.incident_location.captured_at
    ? new Date(formData.incident_location.captured_at).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      })
    : null;

  const handleSubmitAttempt = () => {
    if (formData.photo) {
      setShowPhotoNoticeModal(true);
    } else {
      onSubmit();
    }
  };

  const handleConfirmWithoutPhoto = () => {
    setShowPhotoNoticeModal(false);
    onSubmit();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Prominent Local Review Preview Banner */}
      <div
        role="alert"
        className="bg-blue-50 border-2 border-blue-400 rounded-2xl p-5 text-blue-950 shadow-xs space-y-2"
      >
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-6 h-6 text-blue-700 shrink-0" aria-hidden="true" />
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-blue-900">
            Review Your Report Before Submitting
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-blue-800 leading-relaxed pl-8">
          Please check your report details below. When you submit, the Campus Safety team receives
          your report and you will get a reference number to track its review status.
        </p>
      </div>

      {/* Network Uncertain / Error Banner */}
      {submissionError && (
        <div
          role="alert"
          className="bg-amber-50 border-2 border-amber-500 rounded-2xl p-5 text-amber-950 shadow-xs space-y-3"
        >
          <div className="flex items-center gap-2.5">
            {submissionError.isNetworkUncertain ? (
              <WifiOff className="w-6 h-6 text-amber-700 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0" aria-hidden="true" />
            )}
            <h3 className="text-sm sm:text-base font-bold text-amber-900">
              {submissionError.isNetworkUncertain
                ? 'Network Connection Interrupted (Status Uncertain)'
                : 'Submission Could Not Be Completed'}
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">
            {submissionError.message}
          </p>
          {submissionError.isNetworkUncertain && (
            <div className="pt-1">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={onRetry}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                    <span>Retrying with Original Key...</span>
                  </>
                ) : (
                  <span>Retry Submission Safely</span>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Summary Card */}
      <div className="bg-white border border-[#14221b]/10 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-[#14221b]/10 pb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" aria-hidden="true" />
            <h3 className="text-base font-bold text-[#0d2c20]">Report Details</h3>
          </div>
          <span className="text-xs font-mono bg-[#dcecdf] text-[#174b32] px-2.5 py-1 rounded-full font-medium">
            Ready to Submit
          </span>
        </div>

        {/* Category Section */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#52635a]">
            Selected Category
          </p>
          <div className="flex items-center justify-between p-3.5 bg-[#f4f4ec] rounded-2xl">
            <span className="text-sm font-semibold text-[#0d2c20]">
              {categoryMeta?.label ?? 'None'}
            </span>
            {categoryMeta && (
              <span className="text-xs font-semibold uppercase px-2.5 py-0.5 rounded-full bg-white border border-[#14221b]/10 text-[#0d2c20]">
                {categoryMeta.urgencyLevel} Priority
              </span>
            )}
          </div>
        </div>

        {/* Location Section */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[#52635a]">
            Incident Location
          </p>
          <div className="space-y-2 text-xs">
            {formData.incident_location.place_name_snapshot && (
              <div className="flex items-start gap-2.5 p-3 bg-[#f4f4ec] rounded-xl text-[#0d2c20]">
                <Building2 className="w-4 h-4 text-[#174b32] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-semibold block">Campus Building or Area:</span>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span>{formData.incident_location.place_name_snapshot}</span>
                  </div>
                </div>
              </div>
            )}

            {formData.incident_location.latitude && formData.incident_location.longitude && (
              <div className="p-3 bg-[#f4f4ec] rounded-xl text-[#0d2c20] space-y-2">
                <div className="flex items-start gap-2.5">
                  <Navigation
                    className="w-4 h-4 text-[#174b32] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5">
                    <span className="font-semibold block">GPS Coordinates:</span>
                    <span className="text-emerald-800 font-medium">Device location captured</span>
                    <p className="text-[#52635a] text-[11px] leading-relaxed">
                      Estimated accuracy: ±{Math.round(formData.incident_location.accuracy ?? 0)}{' '}
                      metres (approximate area, not guaranteed exact physical position)
                    </p>
                  </div>
                </div>

                <details className="group border-t border-[#14221b]/10 pt-2 text-[11px]">
                  <summary className="cursor-pointer list-none flex items-center justify-between text-[#52635a] hover:text-[#0d2c20] font-medium py-0.5 select-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#174b32] rounded">
                    <span>View technical coordinates & timestamp</span>
                    <ChevronDown
                      className="w-3.5 h-3.5 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="mt-1.5 p-2 bg-white rounded-lg space-y-0.5 font-mono text-[11px] text-[#0d2c20] border border-[#14221b]/10">
                    <div className="flex justify-between">
                      <span className="text-[#52635a]">Latitude:</span>
                      <span>{formData.incident_location.latitude.toFixed(5)}°</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#52635a]">Longitude:</span>
                      <span>{formData.incident_location.longitude.toFixed(5)}°</span>
                    </div>
                    {formattedCapturedTime && (
                      <div className="flex justify-between">
                        <span className="text-[#52635a]">Captured:</span>
                        <span>{formattedCapturedTime}</span>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}

            {formData.incident_location.landmark_description && (
              <div className="flex items-start gap-2.5 p-3 bg-[#f4f4ec] rounded-xl text-[#0d2c20]">
                <FileText className="w-4 h-4 text-[#174b32] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-semibold block">Nearby Landmark:</span>
                  <span>{formData.incident_location.landmark_description}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Description Section */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#52635a]">
            Incident Description
          </p>
          <div className="p-3.5 bg-[#f4f4ec] rounded-2xl text-xs sm:text-sm text-[#0d2c20] leading-relaxed whitespace-pre-wrap">
            {formData.description}
          </div>
        </div>

        {/* Photograph Section */}
        {formData.photo && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#52635a]">
              Selected Photograph
            </p>
            <div className="flex items-center gap-3 p-3 bg-[#f4f4ec] rounded-2xl">
              {formData.photo.previewUrl ? (
                <img
                  src={formData.photo.previewUrl}
                  alt="Incident photograph thumbnail"
                  className="w-14 h-14 object-cover rounded-xl border border-[#14221b]/10"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-[#52635a]" aria-hidden="true" />
              )}
              <div className="text-xs space-y-0.5 overflow-hidden">
                <p className="font-semibold text-[#0d2c20] truncate">{formData.photo.name}</p>
                <p className="text-amber-800 font-medium">
                  Note: Photo binary upload is scheduled for Ticket S3.1
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Primary Action Buttons */}
      <div className="space-y-3">
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={handleSubmitAttempt}
          disabled={isSubmitting}
          className="w-full justify-center py-3.5 text-base shadow-sm"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" aria-hidden="true" />
              <span>Transmitting Report...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5 mr-2" aria-hidden="true" />
              <span>Submit Report Now</span>
            </>
          )}
        </Button>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            disabled={isSubmitting}
            className="flex-1 justify-center"
          >
            <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
            <span>Edit Report</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onReset}
            disabled={isSubmitting}
            className="flex-1 justify-center"
          >
            <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
            <span>Reset & Start New</span>
          </Button>
        </div>
      </div>

      {/* S3 Photo Upload Confirmation Modal */}
      <Modal
        isOpen={showPhotoNoticeModal}
        onClose={() => setShowPhotoNoticeModal(false)}
        title="Photo Attachment Notice (Ticket S3.1)"
      >
        <div className="space-y-4 text-xs sm:text-sm text-[#14221b]">
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 leading-relaxed">
            <p className="font-semibold mb-1">Server Photo Storage Deferred to Ticket S3.1</p>
            <p>
              Binary photo uploads are not enabled in this build. If you submit now, your report
              will be recorded with your category, location details, and narrative, but the photo
              will
              <strong> not</strong> be transmitted or stored on the server.
            </p>
          </div>

          <p className="text-[#52635a]">
            Would you like to submit your report without attaching the photograph, or return to
            edit?
          </p>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPhotoNoticeModal(false)}
              className="flex-1 justify-center"
            >
              Cancel & Keep Photo
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmWithoutPhoto}
              className="flex-1 justify-center"
            >
              Submit Without Photo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
