import React, { useState } from 'react';
import { Header } from './components/layout/Header.js';
import { Footer } from './components/layout/Footer.js';
import { CategorySelector } from './components/report/CategorySelector.js';
import { LocationPicker } from './components/report/LocationPicker.js';
import { PhotoUploader } from './components/report/PhotoUploader.js';
import { DescriptionInput, checkDescriptionPii } from './components/report/DescriptionInput.js';
import { HoneypotField } from './components/report/HoneypotField.js';
import { LocalReviewScreen } from './components/report/LocalReviewScreen.js';
import { ReceiptScreen } from './components/report/ReceiptScreen.js';
import { Button } from './components/common/Button.js';
import { ReportFormData, FormErrors } from './types/reportForm.js';
import { CreateReportRequestSchema, type CreateReportResponse } from '@yctalert/contracts';
import {
  submitReport,
  generateIdempotencyKey,
  deriveLocationSource,
  type SubmissionError,
} from './services/reportSubmissionService.js';
import { ArrowRight, ShieldCheck } from 'lucide-react';

const INITIAL_FORM_STATE: ReportFormData = {
  category_code: null,
  description: '',
  incident_location: {
    latitude: null,
    longitude: null,
    accuracy: null,
    captured_at: null,
    coordinates_provenance: null,
    source: 'MANUAL_POINT',
    yct_map_place_id: null,
    place_name_snapshot: null,
    landmark_description: '',
  },
  photo: null,
  website_url: '',
};

type ScreenMode = 'form' | 'review' | 'receipt';

export const App: React.FC = () => {
  const [formData, setFormData] = useState<ReportFormData>(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState<FormErrors>({});
  const [screenMode, setScreenMode] = useState<ScreenMode>('form');
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<SubmissionError | null>(null);
  const [receipt, setReceipt] = useState<CreateReportResponse | null>(null);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // 1. Category validation
    if (!formData.category_code) {
      newErrors.category_code = 'Please select an incident category.';
    }

    // 2. Location validation: must provide at least one valid layer
    const hasPlace = !!formData.incident_location.yct_map_place_id;
    const hasCoords =
      typeof formData.incident_location.latitude === 'number' &&
      typeof formData.incident_location.longitude === 'number';
    const hasText = formData.incident_location.landmark_description.trim().length > 0;

    if (!hasPlace && !hasCoords && !hasText) {
      newErrors.location =
        'You must select a campus place, use your device location, or provide a landmark description.';
    }

    // 3. Description validation
    const trimmedDesc = formData.description.trim();
    if (!trimmedDesc) {
      newErrors.description = 'Please enter an incident description.';
    } else if (trimmedDesc.length < 5) {
      newErrors.description = 'Description must be at least 5 characters long.';
    } else if (trimmedDesc.length > 1000) {
      newErrors.description = 'Description cannot exceed 1000 characters.';
    } else {
      const piiCheck = checkDescriptionPii(trimmedDesc);
      if (piiCheck.hasPii) {
        newErrors.description =
          piiCheck.message ||
          'Please remove personal phone numbers, emails, or student matriculation numbers before submitting.';
      }
    }

    // 4. Honeypot check
    if (formData.website_url && formData.website_url.length > 0) {
      newErrors.general = 'Spam detection triggered. Report cannot be reviewed.';
    }

    // 5. Contract Schema verification check
    if (Object.keys(newErrors).length === 0 && formData.category_code) {
      const contractPayload = {
        category_code: formData.category_code,
        description: trimmedDesc,
        incident_location: {
          latitude: formData.incident_location.latitude,
          longitude: formData.incident_location.longitude,
          source: deriveLocationSource(formData.incident_location),
          yct_map_place_id: formData.incident_location.yct_map_place_id,
          place_name_snapshot: formData.incident_location.place_name_snapshot,
          landmark_description: formData.incident_location.landmark_description.trim() || null,
        },
        website_url: formData.website_url,
      };

      const result = CreateReportRequestSchema.safeParse(contractPayload);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        newErrors.general = firstIssue?.message ?? 'Input validation failed against schema.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleReviewClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      if (!idempotencyKey) {
        setIdempotencyKey(generateIdempotencyKey());
      }
      setScreenMode('review');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePerformSubmission = async (key: string) => {
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const result = await submitReport(formData, key);
      setReceipt(result);
      setScreenMode('receipt');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      console.error('[App] Report submission error:', err);
      const subErr = err as Partial<SubmissionError> | undefined;
      setSubmissionError({
        isNetworkUncertain: subErr?.isNetworkUncertain ?? false,
        code: subErr?.code || 'UNKNOWN_ERROR',
        message: subErr?.message || 'An unexpected error occurred during submission.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    const key = idempotencyKey || generateIdempotencyKey();
    if (!idempotencyKey) {
      setIdempotencyKey(key);
    }
    handlePerformSubmission(key);
  };

  const handleRetry = () => {
    if (idempotencyKey) {
      handlePerformSubmission(idempotencyKey);
    }
  };

  const handleReset = () => {
    if (formData.photo?.previewUrl) {
      URL.revokeObjectURL(formData.photo.previewUrl);
    }
    setFormData(INITIAL_FORM_STATE);
    setErrors({});
    setScreenMode('form');
    setIdempotencyKey(null);
    setSubmissionError(null);
    setReceipt(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#f4f4ec] text-[#14221b] flex flex-col justify-between selection:bg-[#dcecdf] selection:text-[#0d2c20]">
      <div>
        <Header />

        <main className="max-w-2xl mx-auto w-full px-4 sm:px-0 py-4">
          {screenMode === 'receipt' && receipt ? (
            <ReceiptScreen receipt={receipt} onReset={handleReset} />
          ) : screenMode === 'review' ? (
            <LocalReviewScreen
              formData={formData}
              onEdit={() => setScreenMode('form')}
              onReset={handleReset}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submissionError={submissionError}
              onRetry={handleRetry}
            />
          ) : (
            <form onSubmit={handleReviewClick} noValidate className="space-y-6">
              {/* Category Selector Card */}
              <CategorySelector
                value={formData.category_code}
                onChange={(cat) => {
                  setFormData((prev) => ({ ...prev, category_code: cat }));
                  if (errors.category_code) {
                    setErrors((prev) => ({ ...prev, category_code: undefined }));
                  }
                }}
                error={errors.category_code}
              />

              {/* Location Picker Card */}
              <LocationPicker
                location={formData.incident_location}
                onChange={(updated) => {
                  setFormData((prev) => ({
                    ...prev,
                    incident_location: {
                      ...prev.incident_location,
                      ...updated,
                    },
                  }));
                  if (errors.location) {
                    setErrors((prev) => ({ ...prev, location: undefined }));
                  }
                }}
                error={errors.location}
              />

              {/* Photo Uploader Card */}
              <PhotoUploader
                photo={formData.photo}
                onChange={(photo) => {
                  setFormData((prev) => ({ ...prev, photo }));
                  if (errors.photo) {
                    setErrors((prev) => ({ ...prev, photo: undefined }));
                  }
                }}
                error={errors.photo}
              />

              {/* Description Input Card */}
              <DescriptionInput
                value={formData.description}
                onChange={(desc) => {
                  setFormData((prev) => ({ ...prev, description: desc }));
                  if (errors.description) {
                    setErrors((prev) => ({ ...prev, description: undefined }));
                  }
                }}
                error={errors.description}
              />

              {/* Spam Honeypot Field */}
              <HoneypotField
                value={formData.website_url}
                onChange={(val) => setFormData((prev) => ({ ...prev, website_url: val }))}
              />

              {/* General Form Error */}
              {errors.general && (
                <div
                  className="p-4 bg-red-50 border border-red-300 rounded-2xl text-xs sm:text-sm text-red-900"
                  role="alert"
                >
                  {errors.general}
                </div>
              )}

              {/* Review Button */}
              <div className="pt-2">
                <Button type="submit" size="lg" className="w-full text-base py-3.5 shadow-sm">
                  <span>Review Report</span>
                  <ArrowRight className="w-5 h-5 ml-2" aria-hidden="true" />
                </Button>
                <p className="text-[11px] text-center text-[#52635a] mt-2.5 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#174b32]" aria-hidden="true" />
                  <span>
                    Validates against schema locally before submitting with CSPRNG idempotency.
                  </span>
                </p>
              </div>
            </form>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
};

export default App;
