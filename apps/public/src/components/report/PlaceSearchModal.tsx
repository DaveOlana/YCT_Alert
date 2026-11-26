import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from '../common/Modal.js';
import type { CampusPlace } from '@yctalert/contracts';
import { fetchCampusPlaces, CampusPlacesServiceError } from '../../services/campusPlacesService.js';
import { Search, MapPin, Check, Loader2, AlertCircle } from 'lucide-react';

interface PlaceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPlaceId: string | null;
  onSelectPlace: (place: CampusPlace) => void;
  onDescribeManually?: () => void;
}

export function getMatchedAlias(place: CampusPlace, query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  // If the official name itself matches the query, do NOT show alias indicator
  if (place.name.toLowerCase().includes(q)) {
    return null;
  }
  if (place.aliases && place.aliases.length > 0) {
    const match = place.aliases.find((a) => a.toLowerCase().includes(q));
    return match || null;
  }
  return null;
}

export const PlaceSearchModal: React.FC<PlaceSearchModalProps> = ({
  isOpen,
  onClose,
  selectedPlaceId,
  onSelectPlace,
  onDescribeManually,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [places, setPlaces] = useState<CampusPlace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const activeControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadPlaces = useCallback(async (query: string) => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setIsUnavailable(false);

    try {
      const response = await fetchCampusPlaces({
        q: query.trim() || undefined,
        limit: 100,
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        setPlaces(response.places);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (err instanceof CampusPlacesServiceError) {
        if (err.isUnavailable) {
          setIsUnavailable(true);
        } else {
          setError(err.message);
        }
      } else {
        setError('Unable to load campus locations. Please try again.');
      }
    } finally {
      if (activeControllerRef.current === controller) {
        setIsLoading(false);
        activeControllerRef.current = null;
      }
    }
  }, []);

  // Fetch places on modal open or when search query changes (debounced 300ms)
  useEffect(() => {
    if (!isOpen) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      loadPlaces(searchQuery);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isOpen, searchQuery, loadPlaces]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Campus Location"
      titleId="place-search-title"
    >
      <div className="space-y-4">
        {/* Offline / Unavailable Fallback Banner */}
        {isUnavailable && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1.5 flex-1">
              <p className="font-semibold text-amber-900">
                Campus places catalogue is temporarily offline or synchronizing.
              </p>
              <p className="text-amber-800">
                Emergency reporting is never blocked. You can describe your location manually below.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDescribeManually?.();
                }}
                className="text-xs font-bold text-[#174b32] underline hover:text-[#0d2c20] cursor-pointer"
              >
                Describe Location Manually &rarr;
              </button>
            </div>
          </div>
        )}

        {/* General Error Banner */}
        {error && !isUnavailable && (
          <div className="bg-rose-50 border border-rose-300 rounded-xl p-3 text-xs text-rose-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="flex-1">{error}</p>
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <label htmlFor="campus-place-search" className="sr-only">
            Search campus buildings or landmarks
          </label>
          <Search
            className="w-4 h-4 text-[#52635a] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="campus-place-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by building name or facility..."
            className="w-full pl-10 pr-10 py-2.5 bg-[#f4f4ec] border border-[#14221b]/15 rounded-xl text-sm text-[#0d2c20] placeholder:text-[#52635a] focus:bg-white focus-visible:ring-2 focus-visible:ring-[#174b32] focus-visible:outline-hidden transition-all"
          />
          {isLoading && (
            <Loader2
              className="w-4 h-4 text-[#174b32] absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin"
              aria-hidden="true"
            />
          )}
        </div>

        {/* Place List */}
        <div
          role="listbox"
          aria-label="Campus Places"
          className="divide-y divide-[#14221b]/10 max-h-64 overflow-y-auto rounded-xl border border-[#14221b]/10"
        >
          {isLoading && places.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#52635a] flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 text-[#174b32] animate-spin" aria-hidden="true" />
              <span>Loading campus locations...</span>
            </div>
          ) : places.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#52635a]">
              No campus locations found matching &ldquo;{searchQuery}&rdquo;.
              <br />
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDescribeManually?.();
                }}
                className="text-[#174b32] font-semibold underline hover:text-[#0d2c20] mt-2 inline-block cursor-pointer"
              >
                Describe location manually instead
              </button>
            </div>
          ) : (
            places.map((place) => {
              const isSelected = selectedPlaceId === place.id;
              const matchedAlias = getMatchedAlias(place, searchQuery);

              return (
                <button
                  key={place.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelectPlace(place);
                    onClose();
                  }}
                  className={`w-full text-left p-3.5 flex items-start justify-between gap-3 transition-colors cursor-pointer focus-visible:bg-[#edf6ef] focus-visible:ring-2 focus-visible:ring-[#174b32] focus-visible:outline-hidden ${
                    isSelected ? 'bg-[#edf6ef]' : 'hover:bg-[#f4f4ec]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-[#174b32] shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#0d2c20] leading-snug">
                        {place.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-block text-[10px] text-[#174b32] font-medium bg-[#dcecdf] px-2 py-0.5 rounded-full">
                          {place.category_name}
                        </span>
                        {place.verification_state !== 'VERIFIED' && (
                          <span className="inline-block text-[10px] text-[#52635a] font-medium bg-[#f4f4ec] border border-[#14221b]/20 px-2 py-0.5 rounded-full">
                            Unverified
                          </span>
                        )}
                        {matchedAlias && (
                          <span className="inline-block text-[10px] text-[#52635a] bg-[#f4f4ec] border border-[#14221b]/15 px-2 py-0.5 rounded">
                            Matched alias: &ldquo;{matchedAlias}&rdquo;
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <Check
                      className="w-4 h-4 text-[#174b32] shrink-0 mt-1 stroke-[2.5]"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
