import { IncidentCategory, LocationSource } from '@yctalert/contracts';

export type CoordinatesProvenance = 'DEVICE_GPS' | 'MAP_PLACE' | 'MANUAL_POINT' | null;

export interface ReportFormData {
  category_code: IncidentCategory | null;
  description: string;
  incident_location: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    captured_at: string | null;
    coordinates_provenance: CoordinatesProvenance;
    source: LocationSource;
    yct_map_place_id: string | null;
    place_name_snapshot: string | null;
    landmark_description: string;
  };
  photo: {
    file: File | null;
    previewUrl: string | null;
    sizeBytes: number | null;
    name: string | null;
  } | null;
  website_url?: string; // Honeypot field
}

export interface FormErrors {
  category_code?: string;
  description?: string;
  location?: string;
  photo?: string;
  general?: string;
}
