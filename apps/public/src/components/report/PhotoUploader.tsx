import React, { useRef, useEffect } from 'react';
import { Camera, X, Image as ImageIcon, AlertCircle } from 'lucide-react';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // Exactly 5 MiB (5,242,880 bytes) per D-14
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PhotoUploaderProps {
  photo: {
    file: File | null;
    previewUrl: string | null;
    sizeBytes: number | null;
    name: string | null;
  } | null;
  onChange: (
    photo: {
      file: File | null;
      previewUrl: string | null;
      sizeBytes: number | null;
      name: string | null;
    } | null,
  ) => void;
  error?: string;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  photo,
  onChange,
  error: parentError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);

  // Clean up object URL on component unmount
  useEffect(() => {
    return () => {
      if (photo?.previewUrl) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    };
  }, [photo?.previewUrl]);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Format check
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setLocalError('Supported image formats: JPEG, PNG, or WebP.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 2. 5 MB size check
    if (file.size > MAX_PHOTO_BYTES) {
      setLocalError('Photo is too large. Maximum size is 5 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 3. Revoke existing preview URL before generating new one
    if (photo?.previewUrl) {
      URL.revokeObjectURL(photo.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    onChange({
      file,
      previewUrl,
      sizeBytes: file.size,
      name: file.name,
    });
  };

  const handleRemovePhoto = () => {
    if (photo?.previewUrl) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    onChange(null);
    setLocalError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const activeError = localError || parentError;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label
          htmlFor="incident-photo-input"
          className="text-base font-bold text-[#0d2c20] cursor-pointer"
        >
          3. Incident Photograph{' '}
          <span className="text-xs font-normal text-[#52635a]">(Optional)</span>
        </label>
        <span className="text-xs text-[#52635a]">Max 5 MiB</span>
      </div>

      <div className="bg-white border border-[#14221b]/10 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs">
        {photo?.previewUrl ? (
          <div className="relative rounded-xl overflow-hidden border border-[#14221b]/15 bg-[#f4f4ec] flex items-center justify-between p-3">
            <div className="flex items-center gap-3 overflow-hidden">
              <img
                src={photo.previewUrl}
                alt="Selected incident photograph preview"
                className="w-16 h-16 object-cover rounded-lg shrink-0 border border-[#14221b]/10"
              />
              <div className="overflow-hidden text-xs space-y-0.5">
                <p className="font-semibold text-[#0d2c20] truncate">{photo.name}</p>
                <p className="text-[#52635a]">
                  {photo.sizeBytes ? (photo.sizeBytes / (1024 * 1024)).toFixed(2) : '0'} MiB
                </p>
                <span className="inline-block text-[10px] text-emerald-800 font-medium bg-emerald-100 px-2 py-0.5 rounded-full">
                  Validated &le; 5 MiB
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRemovePhoto}
              className="p-2 rounded-xl text-rose-700 hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-[#174b32] focus-visible:outline-hidden transition-colors"
              aria-label="Remove photo"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div>
            <input
              ref={fileInputRef}
              id="incident-photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelected}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#14221b]/20 rounded-xl hover:bg-[#fafaf7] hover:border-[#174b32]/50 focus-visible:ring-2 focus-visible:ring-[#174b32] focus-visible:outline-hidden transition-all cursor-pointer min-h-[96px]"
            >
              <div className="p-2.5 bg-[#f4f4ec] text-[#174b32] rounded-full mb-2">
                <Camera className="w-5 h-5" aria-hidden="true" />
              </div>
              <span className="text-sm font-semibold text-[#0d2c20]">
                Take photo or choose from device
              </span>
              <span className="text-xs text-[#52635a] mt-0.5">JPEG, PNG, or WebP up to 5 MiB</span>
            </button>
          </div>
        )}

        <p className="text-[11px] text-[#52635a] flex items-center gap-1.5 leading-relaxed">
          <ImageIcon className="w-3.5 h-3.5 text-[#174b32] shrink-0" aria-hidden="true" />
          <span>
            Photographs remain private and undergo administrator review before any public
            publication.
          </span>
        </p>

        {activeError && (
          <p
            className="text-xs font-semibold text-rose-600 flex items-center gap-1 mt-1"
            role="alert"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{activeError}</span>
          </p>
        )}
      </div>
    </div>
  );
};
