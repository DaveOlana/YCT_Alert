import React, { useState, useRef, useEffect } from 'react';
import { PlaceSearchModal } from './PlaceSearchModal.js';
import { AlertBanner } from '../common/AlertBanner.js';
import { Button } from '../common/Button.js';
import type { CampusPlace } from '@yctalert/contracts';
import type { CoordinatesProvenance } from '../../types/reportForm.js';
import {
  acquireDeviceLocation,
  cancelDeviceLocationAcquisition,
  LocationServiceError,
} from '../../services/locationService.js';
import { Building2, Navigation, X, Check, RefreshCw, ChevronDown, AlertCircle } from 'lucide-react';

interface LocationPickerProps {
  location: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    captured_at: string | null;
    coordinates_provenance: CoordinatesProvenance;
    yct_map_place_id: string | null;
    place_name_snapshot: string | null;
    landmark_description: string;
  };
  onChange: (updated: Partial<LocationPickerProps['location']>) => void;
  error?: string;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({ location, onChange, error }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAcquiringGps, setIsAcquiringGps] = useState(false);
  const [locationNotice, setLocationNotice] = useState<{
    variant: 'warning' | 'error' | 'info';
    message: string;
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      cancelDeviceLocationAcquisition();
    };
  }, []);

  const hasPlace = !!location.yct_map_place_id;
  const hasCoords = typeof location.latitude === 'number' && typeof location.longitude === 'number';
  const isBroadAccuracy =
    hasCoords && typeof location.accuracy === 'number' && location.accuracy > 100;

  // Handle Device Location Acquisition
  const handleAcquireLocation = async () => {
    setIsAcquiringGps(true);
    setLocationNotice(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await acquireDeviceLocation({ signal: controller.signal });
      onChange({
        latitude: res.latitude,
        longitude: res.longitude,
        accuracy: res.accuracy,
        captured_at: res.capturedAt,
        coordinates_provenance: 'DEVICE_GPS',
      });

      if (res.accuracy > 100) {
        setLocationNotice({
          variant: 'warning',
          message: `Location accuracy is broad (±${Math.round(res.accuracy)} metres). Adding a nearby building, floor, room number or landmark below is recommended to assist responders.`,
        });
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      if (err instanceof LocationServiceError) {
        if (err.code !== 'ACQUISITION_CANCELLED') {
          setLocationNotice({
            variant: 'warning',
            message: err.message,
          });
        }
      } else {
        setLocationNotice({
          variant: 'warning',
          message: 'Unable to acquire device location. Please provide a landmark description.',
        });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsAcquiringGps(false);
    }
  };

  const handleClearCoords = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    cancelDeviceLocationAcquisition();
    onChange({
      latitude: null,
      longitude: null,
      accuracy: null,
      captured_at: null,
      coordinates_provenance: null,
    });
    setLocationNotice(null);
  };

  const handleSelectPlace = (place: CampusPlace) => {
    const updates: Partial<LocationPickerProps['location']> = {
      yct_map_place_id: place.id,
      place_name_snapshot: place.name,
    };

    // Transition Rule 1 & 4:
    // If no coordinates exist, or if current coordinates were inherited from MAP_PLACE,
    // update coordinates to the newly selected place centroid with MAP_PLACE provenance.
    if (
      location.coordinates_provenance === null ||
      location.coordinates_provenance === 'MAP_PLACE'
    ) {
      updates.latitude = place.coordinates.latitude;
      updates.longitude = place.coordinates.longitude;
      updates.accuracy = null;
      updates.captured_at = null;
      updates.coordinates_provenance = 'MAP_PLACE';
    }
    // Transition Rule 2 & 3:
    // If coordinates_provenance is DEVICE_GPS or MANUAL_POINT,
    // preserve existing device/manual coordinates intact!

    onChange(updates);
  };

  const handleClearPlace = () => {
    const updates: Partial<LocationPickerProps['location']> = {
      yct_map_place_id: null,
      place_name_snapshot: null,
    };

    // Transition Rule 5:
    // If current coordinates were inherited from MAP_PLACE, clear them too.
    if (location.coordinates_provenance === 'MAP_PLACE') {
      updates.latitude = null;
      updates.longitude = null;
      updates.accuracy = null;
      updates.captured_at = null;
      updates.coordinates_provenance = null;
    }
    // Transition Rule 6:
    // If coordinates_provenance is DEVICE_GPS or MANUAL_POINT,
    // preserve device/manual coordinates intact!

    onChange(updates);
  };

  // Format captured timestamp for human readability
  const formattedTime = location.captured_at
    ? new Date(location.captured_at).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold text-[#0d2c20]">
          2. Incident Location <span className="text-rose-600">*</span>
        </h2>
        <span className="text-xs text-[#52635a]">
          {hasPlace || hasCoords ? 'Location provided' : 'At least one required'}
        </span>
      </div>

      <div className="bg-white border border-[#14221b]/10 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
        {/* Option 1: Campus Place Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[#0d2c20] uppercase tracking-wider block">
            Campus Building or Area
          </label>
          {location.place_name_snapshot ? (
            <div className="flex items-center justify-between p-3 bg-[#edf6ef] border border-[#174b32]/30 rounded-xl text-sm">
              <div className="flex flex-wrap items-center gap-2 text-[#0d2c20] font-medium">
                <Building2 className="w-4 h-4 text-[#174b32] shrink-0" aria-hidden="true" />
                <span>{location.place_name_snapshot}</span>
              </div>
              <button
                type="button"
                onClick={handleClearPlace}
                className="p-1 rounded-lg text-[#52635a] hover:text-rose-700 hover:bg-white focus-visible:ring-2 focus-visible:ring-[#174b32] focus-visible:outline-hidden transition-colors"
                aria-label="Remove selected campus place"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="w-full justify-start text-[#0d2c20] font-normal"
            >
              <Building2 className="w-4 h-4 text-[#174b32] mr-2 shrink-0" aria-hidden="true" />
              <span>Select campus building or facility...</span>
            </Button>
          )}
        </div>

        {/* Option 2: Device Coordinates */}
        <div className="space-y-2 pt-2 border-t border-[#14221b]/10">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#0d2c20] uppercase tracking-wider block">
              GPS Location (Optional)
            </label>
            {hasCoords && (
              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3" aria-hidden="true" /> Acquired
              </span>
            )}
          </div>

          {hasCoords ? (
            <div className="p-3.5 bg-[#f4f4ec] border border-[#14221b]/15 rounded-xl text-xs space-y-3">
              {/* Human-friendly location presentation header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800 shrink-0 mt-0.5">
                    <Navigation className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-sm text-[#0d2c20]">Device location captured</p>
                    <p className="text-[#52635a] text-xs">
                      Estimated accuracy:{' '}
                      <span className="font-medium text-[#0d2c20]">
                        ±{Math.round(location.accuracy ?? 0)} metres
                      </span>
                    </p>
                    <p className="text-[11px] text-[#52635a] leading-tight">
                      Approximate area reading from device sensors. Does not guarantee exact
                      physical positioning.
                    </p>
                  </div>
                </div>

                {/* Location Action Controls: Refresh & Remove */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleAcquireLocation}
                    disabled={isAcquiringGps}
                    className="p-1.5 rounded-lg text-[#52635a] hover:text-[#0d2c20] hover:bg-white border border-transparent hover:border-[#14221b]/10 focus-visible:ring-2 focus-visible:ring-[#174b32] focus-visible:outline-hidden transition-all disabled:opacity-50"
                    aria-label="Refresh location"
                    title="Refresh location reading"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isAcquiringGps ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCoords}
                    className="p-1.5 rounded-lg text-[#52635a] hover:text-rose-700 hover:bg-white border border-transparent hover:border-rose-200 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:outline-hidden transition-all"
                    aria-label="Remove captured coordinates"
                    title="Remove captured coordinates"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Contextual guidance if accuracy > 100m */}
              {isBroadAccuracy && (
                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-[11px] flex items-start gap-2">
                  <AlertCircle
                    className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <p className="leading-relaxed">
                    Location accuracy is broad (±{Math.round(location.accuracy ?? 0)} metres). We
                    recommend adding a nearby building, floor, room number or landmark below to help
                    responders pinpoint the location.
                  </p>
                </div>
              )}

              {/* Accessible Collapsed-by-Default Technical Disclosure */}
              <details className="group border-t border-[#14221b]/10 pt-2 text-[11px]">
                <summary className="cursor-pointer list-none flex items-center justify-between text-[#52635a] hover:text-[#0d2c20] font-medium py-1 select-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#174b32] rounded">
                  <span>View technical coordinates & timestamp</span>
                  <ChevronDown
                    className="w-3.5 h-3.5 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="mt-2 p-2.5 bg-white rounded-lg space-y-1 font-mono text-[11px] text-[#0d2c20] border border-[#14221b]/10">
                  <div className="flex justify-between">
                    <span className="text-[#52635a]">Latitude:</span>
                    <span>{location.latitude?.toFixed(5)}°</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#52635a]">Longitude:</span>
                    <span>{location.longitude?.toFixed(5)}°</span>
                  </div>
                  {formattedTime && (
                    <div className="flex justify-between">
                      <span className="text-[#52635a]">Captured:</span>
                      <span>{formattedTime}</span>
                    </div>
                  )}
                </div>
              </details>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              isLoading={isAcquiringGps}
              onClick={handleAcquireLocation}
              className="w-full text-xs"
            >
              <Navigation className="w-4 h-4 text-[#174b32] mr-2 shrink-0" aria-hidden="true" />
              <span>Use current device location</span>
            </Button>
          )}

          {locationNotice && (
            <AlertBanner variant={locationNotice.variant}>{locationNotice.message}</AlertBanner>
          )}
        </div>

        {/* Option 3: Landmark / Room Context */}
        <div className="space-y-1.5 pt-2 border-t border-[#14221b]/10">
          <label
            htmlFor="landmark_description"
            className="text-xs font-bold text-[#0d2c20] uppercase tracking-wider block"
          >
            Nearby Landmark or Room Description{' '}
            {!hasPlace && !hasCoords ? (
              <span className="text-rose-600 font-normal lowercase">
                (required without Place or GPS)
              </span>
            ) : isBroadAccuracy ? (
              <span className="text-amber-800 font-normal lowercase">
                (recommended with broad GPS)
              </span>
            ) : null}
          </label>
          <input
            id="landmark_description"
            type="text"
            maxLength={300}
            value={location.landmark_description}
            onChange={(e) => onChange({ landmark_description: e.target.value })}
            placeholder="e.g. Room 204, 2nd Floor, near North Stairwell"
            className="w-full px-3.5 py-2.5 bg-[#f4f4ec] border border-[#14221b]/15 rounded-xl text-sm text-[#0d2c20] placeholder:text-[#52635a] focus:bg-white focus-visible:ring-2 focus-visible:ring-[#174b32] focus-visible:outline-hidden transition-all"
          />
          <p className="text-[11px] text-[#52635a]">
            Provide specific landmarks, floor levels, or nearby gates to assist emergency
            assessment.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs font-semibold text-rose-600 mt-1" role="alert">
          {error}
        </p>
      )}

      {/* Place Search Modal */}
      <PlaceSearchModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedPlaceId={location.yct_map_place_id}
        onSelectPlace={handleSelectPlace}
        onDescribeManually={() => {
          document.getElementById('landmark_description')?.focus();
        }}
      />
    </div>
  );
};
